import { randomBytes } from "crypto";
import { In, IsNull, type EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Organization, type EducationalInstitutionType } from "../../entities/Organization";
import { Membership } from "../../entities/Membership";
import { User } from "../../entities/User";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { ParentLink } from "../../entities/ParentLink";
import { OrgInvitation } from "../../entities/OrgInvitation";
import { higherRole, type OrgRole } from "../../types/OrgRole";
import { HttpError } from "../../utils/httpError";
import { hasSchoolIssuedOwnership } from "./accountOwnership";
import { matchesEduSessionVersion } from "./userSessions";

/**
 * Organization/membership operations for the SaaS EDU subsystem. EDU
 * authorization derives from these memberships (NOT from `User.role`).
 */

/** Deterministic base slug from a name. Uniqueness is handled separately. */
export function slugifyBase(name: string): string {
  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "org";
}

const orgRepo = () => AppDataSource.getRepository(Organization);
const membershipRepo = () => AppDataSource.getRepository(Membership);

async function uniqueSlug(name: string): Promise<string> {
  const base = slugifyBase(name);
  // Try the bare slug first, then append short random suffixes on collision.
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const existing = await orgRepo().findOne({ where: { slug: candidate } });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback.
  return `${base}-${randomBytes(6).toString("hex")}`;
}

/**
 * Create an organization and make the given user its ORG_ADMIN, atomically.
 * This is the self-signup path (whoever creates the org owns it).
 */
export async function createOrganization(
  name: string,
  ownerUserId: number,
  institutionType: EducationalInstitutionType = "OTHER"
): Promise<Organization> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("ORG_NAME_REQUIRED");
  const slug = await uniqueSlug(trimmed);

  return await AppDataSource.transaction(async (manager) => {
    const owner = await manager.getRepository(User).findOne({ where: { id: ownerUserId }, lock: { mode: "pessimistic_write" } });
    if (!owner) throw new Error("OWNER_NOT_FOUND");
    if (await hasSchoolIssuedOwnership(ownerUserId, manager)) throw new HttpError(409, "EDU_ACCOUNT_SETUP_REQUIRED");

    const org = manager.getRepository(Organization).create({ name: trimmed, slug, institutionType });
    await manager.getRepository(Organization).save(org);

    const membership = manager.getRepository(Membership).create({
      user: owner,
      organization: org,
      role: "ORG_ADMIN"
    });
    await manager.getRepository(Membership).save(membership);

    return org;
  });
}

/**
 * Ensure a user has at least the given role in an org. Creates the membership if
 * absent; if present, only ever upgrades to the higher-privileged role (never
 * silently demotes via an enrolment flow).
 */
export async function ensureMembership(userId: number, orgId: number, role: OrgRole): Promise<Membership> {
  const existing = await membershipRepo().findOne({
    where: { user: { id: userId }, organization: { id: orgId } }
  });
  if (existing) {
    const merged = higherRole(existing.role, role);
    if (merged !== existing.role) {
      existing.role = merged;
      await membershipRepo().save(existing);
    }
    return existing;
  }
  const created = membershipRepo().create({
    user: { id: userId } as User,
    organization: { id: orgId } as Organization,
    role
  });
  return await membershipRepo().save(created);
}

/** The user's role in an org, or null if they are not a member. */
export async function getUserOrgRole(userId: number, orgId: number): Promise<OrgRole | null> {
  const membership = await membershipRepo().findOne({
    where: { user: { id: userId }, organization: { id: orgId } }
  });
  return membership ? membership.role : null;
}

/** All orgs a user belongs to, with their role. */
export async function listUserMemberships(userId: number): Promise<Membership[]> {
  return await membershipRepo().find({
    where: { user: { id: userId } },
    relations: ["organization"]
  });
}

/** All members of an org, with their user, for the members UI. */
export async function listOrgMembers(orgId: number): Promise<Membership[]> {
  return await membershipRepo().find({
    where: { organization: { id: orgId } },
    relations: ["user"],
    order: { createdAt: "ASC" }
  });
}

export type MembershipMutationResult = { ok: true; sessionVersion?: number } | { ok: false; reason: "NOT_A_MEMBER" | "LAST_ORG_ADMIN" | "CONTEST_ACCOUNT_NOT_SUPPORTED" | "CLASS_TRANSFER_REQUIRED"; classes?: Array<{ id: number; name: string }> };
export type MembershipActor = { userId: number; sessionVersion?: number };

/** Organization → affected Classes → linked Students → sorted Users. */
export async function lockMembershipUsers(manager: EntityManager, orgId: number, targetUserId: number, actor?: MembershipActor, change?: "role" | "remove"): Promise<User | null> {
  const org = await manager.getRepository(Organization).findOne({ where: { id: orgId }, lock: { mode: "pessimistic_write" } });
  if (!org) return null;
  if (change) {
    const related = await manager.getRepository(Class).createQueryBuilder("cls").select(["cls.id"])
      .where("cls.org_id = :orgId", { orgId })
      .andWhere(`(cls.teacher_id = :userId
        OR EXISTS (SELECT 1 FROM class_teachers ct WHERE ct.class_id = cls.id AND ct.teacher_id = :userId)
        OR EXISTS (SELECT 1 FROM students s WHERE s.class_id = cls.id AND s.user_id = :userId)
        OR EXISTS (SELECT 1 FROM parent_links p JOIN students s ON s.id = p.student_id WHERE s.class_id = cls.id AND p.parent_user_id = :userId))`, { userId: targetUserId })
      .orderBy("cls.id", "ASC").getMany();
    for (const cls of related) await manager.getRepository(Class).findOne({ where: { id: cls.id }, lock: { mode: "pessimistic_write" } });
    if (change === "remove") {
      const linked = await manager.getRepository(Student).createQueryBuilder("s").withDeleted().select(["s.id"])
        .innerJoin("s.class", "cls").where("cls.org_id = :orgId AND s.user_id = :userId", { orgId, userId: targetUserId }).orderBy("s.id", "ASC").getMany();
      for (const student of linked) await manager.getRepository(Student).findOne({ where: { id: student.id }, withDeleted: true, lock: { mode: "pessimistic_write" } });
    }
  }
  const users = new Map<number, User>();
  for (const id of [...new Set([targetUserId, ...(actor ? [actor.userId] : [])])].sort((a, b) => a - b)) {
    const user = await manager.getRepository(User).findOne({ where: { id }, lock: { mode: "pessimistic_write" },
      select: ["id", "role", "userMode", "email", "emailVerified", "eduSessionVersion", "eduAccountSetupRequired", "eduIssuerOrgId"] });
    if (user) users.set(id, user);
  }
  if (actor) {
    const current = users.get(actor.userId);
    if (!current || !matchesEduSessionVersion(actor.sessionVersion, current.eduSessionVersion)) throw new HttpError(401, "SESSION_CHANGED");
    if (current.role !== "SYSTEM_ADMIN") {
      const membership = await manager.getRepository(Membership).findOne({ where: { user: { id: actor.userId }, organization: { id: orgId } } });
      if (membership?.role !== "ORG_ADMIN") throw new HttpError(403, "FORBIDDEN");
    }
  }
  return users.get(targetUserId) ?? null;
}

async function ownedClassBlocker(manager: EntityManager, orgId: number, userId: number): Promise<MembershipMutationResult | null> {
  const classes = await manager.getRepository(Class).find({ where: { organization: { id: orgId }, teacher: { id: userId } }, select: ["id", "name"], order: { id: "ASC" } });
  return classes.length ? { ok: false, reason: "CLASS_TRANSFER_REQUIRED", classes: classes.map(cls => ({ id: cls.id, name: cls.name })) } : null;
}

async function revokeAssignments(manager: EntityManager, orgId: number, userId: number): Promise<void> {
  const assigned = await manager.getRepository(Class).createQueryBuilder("cls").select(["cls.id"])
    .innerJoin("cls.teachers", "teacher").where("cls.org_id = :orgId AND teacher.id = :userId", { orgId, userId }).getMany();
  for (const cls of assigned) await manager.createQueryBuilder().relation(Class, "teachers").of(cls.id).remove(userId);
}

async function revokePendingInvites(manager: EntityManager, orgId: number, email: string | null | undefined, remainingRole?: OrgRole): Promise<void> {
  if (!email) return;
  const repo = manager.getRepository(OrgInvitation);
  const pending = await repo.find({ where: { organization: { id: orgId }, email: email.trim().toLowerCase(), status: "PENDING" } });
  const ids = pending.filter(invite => remainingRole == null || invite.role !== remainingRole && higherRole(invite.role, remainingRole) === invite.role).map(invite => invite.id);
  if (ids.length) await repo.update({ id: In(ids), status: "PENDING" }, { status: "REVOKED" });
}

/**
 * Count an org's ORG_ADMIN memberships with a row lock, so two concurrent
 * demote/remove calls can't both observe "2 admins, safe to proceed" and both
 * succeed, leaving the org with zero admins. Must run inside the same
 * transaction/manager as the subsequent write.
 */
async function countOrgAdminsForUpdate(manager: EntityManager, orgId: number): Promise<number> {
  return await manager
    .createQueryBuilder(Membership, "m")
    .setLock("pessimistic_write")
    .where("m.org_id = :orgId AND m.role = :role", { orgId, role: "ORG_ADMIN" })
    .andWhere(`EXISTS (SELECT 1 FROM users active_admin WHERE active_admin.id = m.user_id
      AND active_admin.user_mode <> 'CONTEST' AND active_admin.edu_account_setup_required = 0
      AND NOT EXISTS (SELECT 1 FROM students school_student WHERE school_student.user_id = active_admin.id AND school_student.user_account_managed = 1))`)
    .getCount();
}

/**
 * Change a member's role within an org. Refuses to demote the org's last
 * ORG_ADMIN (which would leave the tenant unmanageable). Locks the org's admin
 * rows so the count-then-write can't race against a concurrent demote/remove.
 */
export async function setMembershipRole(orgId: number, userId: number, role: OrgRole, actor?: MembershipActor): Promise<MembershipMutationResult> {
  return await AppDataSource.transaction(async (manager) => {
    const target = await lockMembershipUsers(manager, orgId, userId, actor, "role");
    if (!target) return { ok: false, reason: "NOT_A_MEMBER" };
    if (target.userMode === "CONTEST") return { ok: false, reason: "CONTEST_ACCOUNT_NOT_SUPPORTED" };
    const repo = manager.getRepository(Membership);
    const membership = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
    if (!membership) return { ok: false, reason: "NOT_A_MEMBER" };
    if (membership.role === role) return { ok: true, ...(actor?.userId === userId ? { sessionVersion: target.eduSessionVersion } : {}) };
    if (membership.role === "ORG_ADMIN" && role !== "ORG_ADMIN" && !(await hasSchoolIssuedOwnership(userId, manager))) {
      const admins = await countOrgAdminsForUpdate(manager, orgId);
      if (admins <= 1) return { ok: false, reason: "LAST_ORG_ADMIN" };
    }
    if (!["ORG_ADMIN", "TEACHER"].includes(role)) {
      const blocker = await ownedClassBlocker(manager, orgId, userId);
      if (blocker) return blocker;
    }
    if (!["ORG_ADMIN", "TEACHER", "ASSISTANT"].includes(role)) await revokeAssignments(manager, orgId, userId);
    await revokePendingInvites(manager, orgId, target.email, role);
    membership.role = role;
    await repo.save(membership);
    await manager.getRepository(User).update(userId, { eduSessionVersion: () => "edu_session_version + 1",
      ...(role !== "STUDENT" && target.userMode === "PERSONAL" ? { userMode: "EDUCATIONAL" as const } : {}) });
    return { ok: true, ...(actor?.userId === userId ? { sessionVersion: target.eduSessionVersion + 1 } : {}) };
  });
}

/**
 * Remove a user's membership from an org. Refuses to remove the last ORG_ADMIN
 * (same orphaning guard, same row-lock race protection, as {@link setMembershipRole}).
 */
export async function removeMembership(orgId: number, userId: number, actor?: MembershipActor): Promise<MembershipMutationResult> {
  return await AppDataSource.transaction(async (manager) => {
    const target = await lockMembershipUsers(manager, orgId, userId, actor, "remove");
    if (!target) return { ok: false, reason: "NOT_A_MEMBER" };
    const repo = manager.getRepository(Membership);
    const membership = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
    if (!membership) return { ok: false, reason: "NOT_A_MEMBER" };
    if (membership.role === "ORG_ADMIN" && target.userMode !== "CONTEST" && !(await hasSchoolIssuedOwnership(userId, manager))) {
      const admins = await countOrgAdminsForUpdate(manager, orgId);
      if (admins <= 1) return { ok: false, reason: "LAST_ORG_ADMIN" };
    }
    const blocker = await ownedClassBlocker(manager, orgId, userId);
    if (blocker) return blocker;
    await revokeAssignments(manager, orgId, userId);
    await manager.getRepository(ParentLink).createQueryBuilder().delete()
      .where("parent_user_id = :userId AND student_id IN (SELECT s.id FROM students s JOIN classes c ON c.id = s.class_id WHERE c.org_id = :orgId)", { userId, orgId }).execute();
    const linked = await manager.getRepository(Student).createQueryBuilder("s").select(["s.id"])
      .innerJoin("s.class", "cls").where("cls.org_id = :orgId AND s.user_id = :userId", { orgId, userId }).getMany();
    if (linked.length) await manager.getRepository(Student).update({ id: In(linked.map(student => student.id)), deletedAt: IsNull() }, { deletedAt: new Date(), credentialVersion: () => "credential_version + 1" });
    await revokePendingInvites(manager, orgId, target.email);
    await repo.remove(membership);
    await manager.getRepository(User).update(userId, { eduSessionVersion: () => "edu_session_version + 1" });
    return { ok: true, ...(actor?.userId === userId ? { sessionVersion: target.eduSessionVersion + 1 } : {}) };
  });
}
