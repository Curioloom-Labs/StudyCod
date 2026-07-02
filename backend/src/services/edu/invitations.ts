import { randomBytes } from "crypto";
import { AppDataSource } from "../../data-source";
import { OrgInvitation } from "../../entities/OrgInvitation";
import { User } from "../../entities/User";
import { ensureMembership } from "./membership";
import { createParentLink } from "./parentLinks";
import type { OrgRole } from "../../types/OrgRole";

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

  const existing = await inviteRepo().findOne({
    where: {
      organization: { id: input.orgId } as any,
      email,
      role: input.role,
      studentId: studentId as any,
      status: "PENDING"
    }
  });
  if (existing) {
    existing.expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    return await inviteRepo().save(existing);
  }

  const invite = inviteRepo().create({
    organization: { id: input.orgId } as any,
    email,
    role: input.role,
    studentId,
    token: randomBytes(24).toString("base64url"),
    status: "PENDING",
    invitedByUserId: input.invitedByUserId,
    expiresAt: new Date(Date.now() + INVITE_TTL_MS)
  });
  return await inviteRepo().save(invite);
}

export interface AcceptInvitationResult {
  orgId: number;
  role: OrgRole;
  studentId?: number | null;
}

/**
 * Accept a pending invite as `userId`: creates/upgrades the membership and marks
 * the invite accepted. For a PARENT invite that targets a student, also creates
 * the parent↔student link. Throws INVALID_INVITE for unknown/used/expired tokens.
 */
export async function acceptInvitation(token: string, userId: number): Promise<AcceptInvitationResult> {
  const invite = await inviteRepo().findOne({
    where: { token: String(token ?? "").trim() },
    relations: ["organization"]
  });
  if (!invite || !isInvitationUsable(invite)) {
    throw new Error("INVALID_INVITE");
  }

  const orgId = invite.organizationId;
  await ensureMembership(userId, orgId, invite.role);

  if (invite.role === "PARENT" && invite.studentId) {
    await createParentLink(userId, invite.studentId);
    // Route a pure-personal parent into the EDU shell so they can reach the
    // children view. The conditional WHERE never touches teacher/contest modes.
    await AppDataSource.getRepository(User).update({ id: userId, userMode: "PERSONAL" }, { userMode: "EDUCATIONAL" });
  }

  invite.status = "ACCEPTED";
  invite.acceptedByUserId = userId;
  await inviteRepo().save(invite);

  return { orgId, role: invite.role, studentId: invite.studentId ?? null };
}

export async function revokeInvitation(invitationId: number, orgId: number): Promise<boolean> {
  const invite = await inviteRepo().findOne({ where: { id: invitationId } });
  if (!invite || invite.organizationId !== orgId || invite.status !== "PENDING") return false;
  invite.status = "REVOKED";
  await inviteRepo().save(invite);
  return true;
}

export async function listPendingInvitations(orgId: number): Promise<OrgInvitation[]> {
  return await inviteRepo().find({
    where: { organization: { id: orgId }, status: "PENDING" },
    order: { createdAt: "DESC" }
  });
}
