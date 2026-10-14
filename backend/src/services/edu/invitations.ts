import { randomBytes } from "crypto";
import { IsNull, type EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { OrgInvitation } from "../../entities/OrgInvitation";
import { User } from "../../entities/User";
import { Membership } from "../../entities/Membership";
import { ParentLink } from "../../entities/ParentLink";
import { Student } from "../../entities/Student";
import { Class } from "../../entities/Class";
import { Organization } from "../../entities/Organization";
import { higherRole, type OrgRole } from "../../types/OrgRole";
import { HttpError } from "../../utils/httpError";
import { matchesEduSessionVersion } from "./userSessions";
import { hasSchoolIssuedOwnership } from "./accountOwnership";
import { authorizeStudentAction } from "./classAccess";
import { roleCan } from "./rbac";

/**
 * Organization invitation lifecycle. An ORG_ADMIN issues an invite (email +
 * role); an authenticated user accepts it via the token, which materializes
 * their {@link Membership}.
 */
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const inviteRepo = () => AppDataSource.getRepository(OrgInvitation);

/** Pure: an invite is usable iff still pending and not past its expiry. */
export function isInvitationUsable(
  invitation: Pick<OrgInvitation, "status" | "expiresAt">,
  now: Date = new Date()
): boolean {
  if (invitation.status !== "PENDING") return false;
  return new Date(invitation.expiresAt).getTime() > now.getTime();
}

export function normalizeEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

export interface CreateInvitationInput {
  orgId: number;
  email: string;
  role: OrgRole;
  invitedByUserId: number;
  /** For PARENT invites: the child this parent will be linked to on accept. */
  studentId?: number | null;
  sessionVersion?: number;
}

async function lockOrg(manager: EntityManager, orgId: number): Promise<void> {
  if (!(await manager.getRepository(Organization).findOne({ where: { id: orgId }, lock: { mode: "pessimistic_write" } }))) throw new HttpError(404, "ORGANIZATION_NOT_FOUND");
}

async function lockUser(manager: EntityManager, userId: number, sessionVersion: unknown): Promise<User> {
  const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" },
    select: ["id", "role", "userMode", "email", "emailVerified", "eduSessionVersion"] });
  if (!user || !matchesEduSessionVersion(sessionVersion, user.eduSessionVersion)) throw new HttpError(401, "SESSION_CHANGED");
  if (user.userMode === "CONTEST") throw new HttpError(409, "CONTEST_ACCOUNT_NOT_SUPPORTED");
  return user;
}

/** Organization → Class → Student → User → Invitation. */
async function lockChild(manager: EntityManager, studentId: number, orgId: number): Promise<Student> {
  const repo = manager.getRepository(Student), snapshot = await repo.findOne({ where: { id: studentId }, relations: ["class"] });
  if (!snapshot?.class) throw new HttpError(400, "INVITE_STUDENT_NOT_AVAILABLE");
  const cls = await manager.getRepository(Class).findOne({ where: { id: snapshot.class.id, organization: { id: orgId } }, lock: { mode: "pessimistic_write" } });
  if (!cls) throw new HttpError(400, "INVITE_STUDENT_NOT_AVAILABLE");
  const child = await repo.findOne({ where: { id: studentId, class: { id: cls.id } }, lock: { mode: "pessimistic_write" } });
  if (!child) throw new HttpError(400, "INVITE_STUDENT_NOT_AVAILABLE");
  return child;
}

async function assertIssuer(manager: EntityManager, orgId: number, actor: User, studentId?: number | null): Promise<void> {
  if (actor.role === "SYSTEM_ADMIN") return;
  if (studentId) {
    const access = await authorizeStudentAction(actor.id, studentId, "STUDENT_MANAGE", { manager });
    if (access?.access.allowed && access.student.class.organizationId === orgId) return;
  } else {
    const membership = await manager.getRepository(Membership).findOneBy({ user: { id: actor.id }, organization: { id: orgId } });
    if (membership && roleCan(membership.role, "MEMBER_MANAGE")) return;
  }
  throw new HttpError(403, "FORBIDDEN");
}

/**
 * Issue an invite, or reuse the existing PENDING one for the same
 * (org, email, role, student) so re-inviting doesn't pile up duplicate rows
 * with separate tokens (and separate emails) for the same target. The reused
 * invite's expiry is refreshed.
 */
export async function createInvitation(input: CreateInvitationInput): Promise<OrgInvitation> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error("EMAIL_REQUIRED");
  const studentId = input.studentId ?? null;
  if (studentId && input.role !== "PARENT") throw new HttpError(400, "INVALID_INPUT");

  return AppDataSource.transaction("READ COMMITTED", async manager => {
  await lockOrg(manager, input.orgId);
  if (input.role === "PARENT") {
    if (!studentId) throw new HttpError(400, "INVITE_STUDENT_NOT_AVAILABLE");
    await lockChild(manager, studentId, input.orgId);
  }
  const actor = await lockUser(manager, input.invitedByUserId, input.sessionVersion);
  await assertIssuer(manager, input.orgId, actor, studentId);
  const repo = manager.getRepository(OrgInvitation);
  const existing = await repo.findOne({
    where: {
      organization: { id: input.orgId },
      email,
      role: input.role,
      studentId: studentId === null ? IsNull() : studentId,
      status: "PENDING"
    }
  });
  if (existing) {
    existing.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    return await repo.save(existing);
  }

  const invite = repo.create({
    organization: { id: input.orgId },
    email,
    role: input.role,
    studentId,
    token: randomBytes(24).toString("base64url"),
    status: "PENDING",
    invitedByUserId: input.invitedByUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS)
  });
  return await repo.save(invite);
  });
}

export interface AcceptInvitationResult {
  orgId: number;
  role: OrgRole;
  studentId?: number | null;
  sessionVersion: number;
}

/** Read-only confirmation; a forwarded token never reveals the full recipient. */
export async function previewInvitation(token: string, userId: number) {
  const invite = await inviteRepo().findOne({ where: { token }, relations: ["organization"] });
  if (!invite || (!isInvitationUsable(invite) && !(invite.status === "ACCEPTED" && invite.acceptedByUserId === userId))) throw new HttpError(400, "INVALID_INVITE");
  const user = await AppDataSource.getRepository(User).findOneBy({ id: userId });
  if (!user) throw new HttpError(401, "SESSION_CHANGED");
  if (user.userMode === "CONTEST") throw new HttpError(409, "CONTEST_ACCOUNT_NOT_SUPPORTED");
  const [local, domain] = normalizeEmail(invite.email).split("@");
  return { organizationName: invite.organization?.name ?? "", role: invite.role,
    currentEmail: user.email, recipientHint: `${local.slice(0, 2)}…@${domain}`,
    emailMatches: !!user.email && normalizeEmail(user.email) === normalizeEmail(invite.email), emailVerified: user.emailVerified,
    accountSetupRequired: invite.role !== "STUDENT" && await hasSchoolIssuedOwnership(userId, AppDataSource.manager) };
}

/**
 * Accept a pending invite as `userId`: creates/upgrades the membership and marks
 * the invite accepted. For a PARENT invite that targets a student, also creates
 * the parent↔student link. Throws INVALID_INVITE for unknown/used/expired tokens.
 */
export async function acceptInvitation(token: string, userId: number, sessionVersion?: number): Promise<AcceptInvitationResult> {
  const snapshot = await inviteRepo().findOne({
    where: { token: String(token ?? "").trim() },
    relations: ["organization"]
  });
  if (!snapshot || (!isInvitationUsable(snapshot) && snapshot.status !== "ACCEPTED")) throw new HttpError(400, "INVALID_INVITE");
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const orgId = snapshot.organizationId; await lockOrg(manager, orgId);
    if (snapshot.role === "PARENT") {
      if (!snapshot.studentId) throw new HttpError(400, "INVITE_STUDENT_NOT_AVAILABLE");
      await lockChild(manager, snapshot.studentId, orgId);
    }
    const user = await lockUser(manager, userId, sessionVersion);
    const repo = manager.getRepository(OrgInvitation), invite = await repo.findOne({ where: { id: snapshot.id }, lock: { mode: "pessimistic_write" } });
    if (!invite || invite.organizationId !== orgId) throw new HttpError(400, "INVALID_INVITE");
    if (!user.email || normalizeEmail(user.email) !== normalizeEmail(invite.email)) throw new HttpError(403, "INVITE_EMAIL_MISMATCH");
    if (!user.emailVerified) throw new HttpError(403, "INVITE_EMAIL_NOT_VERIFIED");
    if (invite.role !== "STUDENT" && await hasSchoolIssuedOwnership(userId, manager)) throw new HttpError(409, "EDU_ACCOUNT_SETUP_REQUIRED");
    const members = manager.getRepository(Membership), existing = await members.findOneBy({ user: { id: userId }, organization: { id: orgId } });
    if (invite.status === "ACCEPTED" && invite.acceptedByUserId === userId && existing && higherRole(existing.role, invite.role) === existing.role) {
      if (invite.role === "PARENT" && invite.studentId && !(await manager.getRepository(ParentLink).existsBy({ parent: { id: userId }, student: { id: invite.studentId } }))) throw new HttpError(400, "INVALID_INVITE");
      return { orgId, role: existing.role, studentId: invite.studentId ?? null, sessionVersion: user.eduSessionVersion };
    }
    if (!isInvitationUsable(invite)) throw new HttpError(400, "INVALID_INVITE");
    const role = existing ? higherRole(existing.role, invite.role) : invite.role;
    if (existing) { existing.role = role; await members.save(existing); }
    else await members.save(members.create({ user: { id: userId }, organization: { id: orgId }, role }));
    if (invite.role === "PARENT" && invite.studentId) {
      const links = manager.getRepository(ParentLink);
      if (!(await links.existsBy({ parent: { id: userId }, student: { id: invite.studentId } }))) await links.save(links.create({ parent: { id: userId }, student: { id: invite.studentId } }));
    }
    invite.status = "ACCEPTED"; invite.acceptedByUserId = userId; await repo.save(invite);
    await manager.getRepository(User).update(userId, { userMode: "EDUCATIONAL", eduSessionVersion: () => "edu_session_version + 1" });
    return { orgId, role, studentId: invite.studentId ?? null, sessionVersion: user.eduSessionVersion + 1 };
  });
}

export async function revokeInvitation(invitationId: number, orgId: number, actor: { userId: number; sessionVersion?: number }): Promise<boolean> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
  await lockOrg(manager, orgId);
  const user = await lockUser(manager, actor.userId, actor.sessionVersion); await assertIssuer(manager, orgId, user);
  const repo = manager.getRepository(OrgInvitation);
  const invite = await repo.findOne({ where: { id: invitationId }, lock: { mode: "pessimistic_write" } });
  if (!invite || invite.organizationId !== orgId || invite.status !== "PENDING") return false;
  invite.status = "REVOKED";
  await repo.save(invite);
  return true;
  });
}

export async function listPendingInvitations(orgId: number): Promise<OrgInvitation[]> {
  return await inviteRepo().find({
    where: { organization: { id: orgId }, status: "PENDING" },
    order: { createdAt: "DESC" }
  });
}
