import { randomBytes } from "crypto";
import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Organization } from "../../entities/Organization";
import { Membership } from "../../entities/Membership";
import { User } from "../../entities/User";
import { higherRole, type OrgRole } from "../../types/OrgRole";

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
export async function createOrganization(name: string, ownerUserId: number): Promise<Organization> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new Error("ORG_NAME_REQUIRED");
  const slug = await uniqueSlug(trimmed);

  return await AppDataSource.transaction(async (manager) => {
    const owner = await manager.getRepository(User).findOne({ where: { id: ownerUserId } });
    if (!owner) throw new Error("OWNER_NOT_FOUND");

    const org = manager.getRepository(Organization).create({ name: trimmed, slug });
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

export type MembershipMutationResult = { ok: true } | { ok: false; reason: "NOT_A_MEMBER" | "LAST_ORG_ADMIN" };

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
    .getCount();
}

/**
 * Change a member's role within an org. Refuses to demote the org's last
 * ORG_ADMIN (which would leave the tenant unmanageable). Locks the org's admin
 * rows so the count-then-write can't race against a concurrent demote/remove.
 */
export async function setMembershipRole(orgId: number, userId: number, role: OrgRole): Promise<MembershipMutationResult> {
  return await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Membership);
    const membership = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
    if (!membership) return { ok: false, reason: "NOT_A_MEMBER" };
    if (membership.role === role) return { ok: true };
    if (membership.role === "ORG_ADMIN" && role !== "ORG_ADMIN") {
      const admins = await countOrgAdminsForUpdate(manager, orgId);
      if (admins <= 1) return { ok: false, reason: "LAST_ORG_ADMIN" };
    }
    membership.role = role;
    await repo.save(membership);
    return { ok: true };
  });
}

/**
 * Remove a user's membership from an org. Refuses to remove the last ORG_ADMIN
 * (same orphaning guard, same row-lock race protection, as {@link setMembershipRole}).
 */
export async function removeMembership(orgId: number, userId: number): Promise<MembershipMutationResult> {
  return await AppDataSource.transaction(async (manager) => {
    const repo = manager.getRepository(Membership);
    const membership = await repo.findOne({ where: { user: { id: userId }, organization: { id: orgId } } });
    if (!membership) return { ok: false, reason: "NOT_A_MEMBER" };
    if (membership.role === "ORG_ADMIN") {
      const admins = await countOrgAdminsForUpdate(manager, orgId);
      if (admins <= 1) return { ok: false, reason: "LAST_ORG_ADMIN" };
    }
    await repo.remove(membership);
    return { ok: true };
  });
}
