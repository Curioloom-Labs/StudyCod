import bcrypt from "bcryptjs";
import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { lockEduOrganization, lockEduUsers, requireFreshEduActor } from "./lifecycleAccess";
import { Class } from "../../entities/Class";

/**
 * Student↔User unification (Track B, incremental). Two ends of the same model:
 *  - join code (services/edu/joinCode.ts) creates a fresh User-backed roster
 *    profile,
 *  - **claim** (here) lets an existing User adopt a LEGACY generated-credential
 *    Student profile, after which they are a normal User-backed student.
 *
 * Plus the read-side resolution used by `/profile/me`: a User that owns a roster
 * Student profile is surfaced as an EDU student so the frontend shows the
 * student experience. No schema change — `Student.user` already exists.
 */

const studentRepo = () => AppDataSource.getRepository(Student);

/** Minimal class shape needed to project a roster profile into a user DTO. */
interface ClassLike {
  id: number;
  name: string;
}
interface StudentLike {
  id: number;
  class: ClassLike;
}

/**
 * Pure: overlay the student-in-class view onto a base user DTO so a User-backed
 * student boots into the EDU student experience (`userMode` + `studentId` are
 * what the frontend gates on). Base fields (id/username/email/avatar…) are kept.
 */
export function applyStudentViewToUserDto<T extends object>(dto: T, student: StudentLike) {
  return {
    ...dto,
    userMode: "EDUCATIONAL" as const,
    studentId: student.id,
    classId: student.class.id,
    className: student.class.name
  };
}

/** Pure: validate/normalize claim credentials. Throws "INVALID_INPUT" if empty. */
export function validateClaimInput(rawUsername: unknown, rawPassword: unknown): { username: string; password: string } {
  const username = String(rawUsername ?? "").trim();
  const password = String(rawPassword ?? "");
  if (!username || !password) throw new Error("INVALID_INPUT");
  return { username, password };
}

/**
 * The "active" roster profile for a User (most recent enrolment), or null. Used
 * by `/profile/me` to decide whether to render the student experience. Multi-
 * class students resolve to their latest class for now.
 */
export async function findActiveStudentForUser(userId: number): Promise<Student | null> {
  return await studentRepo().findOne({
    where: { user: { id: userId } },
    relations: ["class"],
    order: { createdAt: "DESC" }
  });
}

/** All roster profiles linked to a User, ordered newest first for context pickers. */
export async function listStudentsForUser(userId: number): Promise<Student[]> {
  return await studentRepo().find({
    where: { user: { id: userId } },
    relations: ["class"],
    order: { createdAt: "DESC" }
  });
}

export interface ClaimResult {
  studentId: number;
  classId: number;
  alreadyClaimed: boolean;
}

/**
 * Link a legacy generated-credential Student profile to an existing User, after
 * verifying its generated credentials. Idempotent for the same user; refuses a
 * profile already owned by someone else. Adds a STUDENT membership in the
 * profile's org, atomically.
 */
export async function claimStudentProfile(userId: number, rawUsername: string, rawPassword: string, sessionVersion?: number): Promise<ClaimResult> {
  const { username, password } = validateClaimInput(rawUsername, rawPassword);

  // Read the owner committed by a competing claim after acquiring the locks.
  // MySQL's default repeatable-read snapshot can otherwise retain no owner.
  return await AppDataSource.transaction("READ COMMITTED", async (manager) => {
    const candidate = await manager.getRepository(Student).findOne({
      where: { generatedUsername: username },
      relations: ["class"]
    });
    if (!candidate) throw new Error("INVALID_CREDENTIALS");
    await lockEduOrganization(manager, candidate.class.organizationId);
    await manager.getRepository(Class).findOne({ where: { id: candidate.class.id }, lock: { mode: "pessimistic_write" } });
    const student = await manager.getRepository(Student).findOne({ where: { id: candidate.id }, lock: { mode: "pessimistic_write" } });
    // Same opaque error for "no such profile" and "wrong password" — never reveal
    // which generated usernames exist.
    if (!student || student.generatedUsername !== username) throw new Error("INVALID_CREDENTIALS");
    const linked = await manager.getRepository(Student).findOne({ where: { id: student.id }, relations: ["class", "user"] });
    if (!linked?.class) throw new Error("INVALID_CREDENTIALS");
    student.class = linked.class; student.user = linked.user;
    const ok = await bcrypt.compare(password, student.generatedPassword);
    if (!ok) throw new Error("INVALID_CREDENTIALS");
    const user = await requireFreshEduActor(manager, { userId, sessionVersion }, await lockEduUsers(manager, [userId]));

    if (student.user) {
      if (student.user.id === userId) {
        return { studentId: student.id, classId: student.class.id, alreadyClaimed: true };
      }
      throw new Error("ALREADY_CLAIMED");
    }

    student.user = user;
    await manager.getRepository(Student).update(student.id, { user: { id: user.id }, userAccountManaged: false });

    const orgId = student.class.organizationId ?? null;
    if (orgId != null) {
      const repo = manager.getRepository(Membership);
      const existing = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
      if (!existing) {
        await repo.save(repo.create({ user: { id: userId }, organization: { id: orgId }, role: "STUDENT" }));
      }
    }

    return { studentId: student.id, classId: student.class.id, alreadyClaimed: false };
  });
}
