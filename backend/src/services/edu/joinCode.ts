import { randomInt, randomBytes } from "crypto";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { ensureMembership } from "./membership";
import type { EntityManager } from "typeorm";
import { HttpError } from "../../utils/httpError";
import { lockEduOrganization, lockEduUsers, requireFreshEduActor, type EduLifecycleActor } from "./lifecycleAccess";
import { updateClassConfiguration } from "./classStaff";

/**
 * Class self-enrolment via join code (Student↔User unification, dual-mode). A
 * User enters a class's code and gets a roster Student profile linked to their
 * account plus a STUDENT membership in the class's organization. Legacy
 * generated-credential students are untouched.
 */

// Unambiguous alphabet: no 0/O/1/I/L to avoid transcription errors.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Pure: generate a random N-char join code from the unambiguous alphabet. */
export function generateJoinCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export function normalizeJoinCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase();
}

const classRepo = () => AppDataSource.getRepository(Class);

/** Set (rotate) or clear a class's join code. Retries on the unlikely collision. */
export async function setJoinCode(classId: number, enabled: boolean, actor: EduLifecycleActor): Promise<string | null> {
  const cls = await classRepo().findOne({ where: { id: classId } });
  if (!cls) throw new Error("CLASS_NOT_FOUND");
  if (!enabled) {
    await updateClassConfiguration(classId, actor, "STUDENT_MANAGE", { joinCode: null });
    return null;
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateJoinCode();
    const clash = await classRepo().findOne({ where: { joinCode: code } });
    if (!clash) {
      try { await updateClassConfiguration(classId, actor, "STUDENT_MANAGE", { joinCode: code }); return code; }
      catch (error) { if ((error as { driverError?: { code?: string } }).driverError?.code !== "ER_DUP_ENTRY") throw error; }
    }
  }
  throw new Error("JOIN_CODE_GENERATION_FAILED");
}

export interface EnrollResult {
  classId: number;
  studentId: number;
  alreadyEnrolled: boolean;
}

/**
 * Enroll an authenticated User into a class via its join code. Idempotent: a User
 * already enrolled in that class returns their existing roster profile. Creates a
 * STUDENT membership in the class's org.
 */
export async function enrollViaJoinCode(userId: number, rawCode: string, sessionVersion?: number): Promise<EnrollResult> {
  const code = normalizeJoinCode(rawCode);
  if (!code) throw new Error("INVALID_CODE");

  const snapshot = await AppDataSource.getRepository(Class).findOne({ where: { joinCode: code } });
  if (!snapshot) throw new Error("INVALID_CODE");
  return await AppDataSource.transaction("READ COMMITTED", async (manager) => {
    await lockEduOrganization(manager, snapshot.organizationId);
    const cls = await manager.getRepository(Class).findOne({ where: { id: snapshot.id, joinCode: code, organization: { id: snapshot.organizationId } }, lock: { mode: "pessimistic_write" } });
    if (!cls) throw new Error("INVALID_CODE");
    const orgId = cls.organizationId ?? null;

    // Already enrolled? (a roster Student for this user in this class)
    const existing = await manager.getRepository(Student).findOne({
      where: { class: { id: cls.id }, user: { id: userId } }, withDeleted: true, lock: { mode: "pessimistic_write" }
    });
    const lockedUser = await requireFreshEduActor(manager, { userId, sessionVersion }, await lockEduUsers(manager, [userId]));
    const user = await manager.getRepository(User).findOneByOrFail({ id: lockedUser.id });
    if (existing?.deletedAt) throw new HttpError(409, "STUDENT_ARCHIVED_CONTACT_TEACHER");
    const member = await manager.getRepository(Membership).findOne({ where: { user: { id: userId }, organization: { id: orgId! } } });
    if (!member && await manager.getRepository(Student).createQueryBuilder("s").withDeleted().innerJoin("s.class", "c")
      .where("s.user_id = :userId AND c.org_id = :orgId AND s.deleted_at IS NOT NULL", { userId, orgId }).getExists()) throw new HttpError(409, "STUDENT_ARCHIVED_CONTACT_TEACHER");
    if (existing) {
      if (orgId != null) await ensureMembershipInTx(manager, userId, orgId);
      return { classId: cls.id, studentId: existing.id, alreadyEnrolled: true };
    }

    // Roster profile linked to the User. generated* columns are required but
    // unused for User-backed auth, so fill them deterministically/uniquely.
    const student = manager.getRepository(Student).create({
      class: cls,
      user,
      firstName: user.firstName ?? user.username ?? "Student",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      generatedUsername: `u${userId}-c${cls.id}`,
      generatedPassword: randomBytes(24).toString("hex"),
      uiLanguage: "en"
    });
    await manager.getRepository(Student).save(student);

    if (orgId != null) await ensureMembershipInTx(manager, userId, orgId);

    return { classId: cls.id, studentId: student.id, alreadyEnrolled: false };
  });
}

// ensureMembership uses the global repo; inside a tx we replicate its upsert via
// the transaction manager to keep the enrolment atomic.
async function ensureMembershipInTx(manager: EntityManager, userId: number, orgId: number): Promise<void> {
  const repo = manager.getRepository(Membership);
  const existing = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
  if (existing) return; // never downgrade an existing higher role
  const created = repo.create({ user: { id: userId }, organization: { id: orgId }, role: "STUDENT" });
  await repo.save(created);
}

// Re-export for callers that enroll outside a tx (kept for symmetry).
export { ensureMembership };
