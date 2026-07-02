import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { Membership } from "../../entities/Membership";
import { higherRole, type OrgRole } from "../../types/OrgRole";
import { roleCan, type Capability } from "./rbac";

/**
 * Centralized, load-bearing authorization for actions on a single Class.
 *
 * EDU has two historical access models that this unifies:
 *  1. Legacy ownership — `class.teacher_id === user.id` (the only real gate in
 *     most routes today).
 *  2. Org RBAC — the caller's {@link OrgRole} in the class's organization.
 *
 * The combination is deliberate and backward-compatible:
 *  - The owning teacher is **grandfathered** to TEACHER in their own class, so
 *    enabling enforcement can never lock out a teacher who created a class —
 *    even one with `org_id = null` (pre-backfill) or no membership row.
 *  - A non-owner with an org role (ORG_ADMIN / ASSISTANT / TEACHER) gets the
 *    powers of that role on classes in their org — the whole point of the SaaS
 *    model, which the legacy `teacher_id` filter silently denied.
 *  - Everyone else (no ownership, no org role) is denied.
 *
 * The decision is split into a pure core ({@link effectiveClassRole} /
 * {@link decideClassAccess}) so it is trivially unit-testable without a DB, and
 * a thin async resolver ({@link authorizeClassAction}) that fetches the facts.
 */

export interface ClassAccessFacts {
  /** Caller owns the class (legacy `class.teacher_id`). */
  isOwner: boolean;
  /** Caller's role in the class's organization, or null (not a member / no org). */
  orgRole: OrgRole | null;
}

/**
 * The role the caller effectively holds for this class: the higher of their
 * org membership role and the owner grandfather (TEACHER for the owner).
 * `null` means the caller has no relationship to the class.
 */
export function effectiveClassRole(facts: ClassAccessFacts): OrgRole | null {
  const ownerRole: OrgRole | null = facts.isOwner ? "TEACHER" : null;
  if (ownerRole && facts.orgRole) return higherRole(ownerRole, facts.orgRole);
  return ownerRole ?? facts.orgRole;
}

/** Pure access decision: can this caller perform `capability` on the class? */
export function decideClassAccess(facts: ClassAccessFacts, capability: Capability): boolean {
  const role = effectiveClassRole(facts);
  return role != null && roleCan(role, capability);
}

export interface ClassAccessResult {
  /** The class, with `teacher` loaded. */
  cls: Class;
  facts: ClassAccessFacts;
  effectiveRole: OrgRole | null;
  /** True if the caller may perform the requested capability. */
  allowed: boolean;
}

function classRepo(manager?: EntityManager) {
  return manager ? manager.getRepository(Class) : AppDataSource.getRepository(Class);
}

function membershipRepo(manager?: EntityManager) {
  return manager ? manager.getRepository(Membership) : AppDataSource.getRepository(Membership);
}

/** The caller's role in a specific org, or null if not a member. */
async function orgRoleFor(userId: number, orgId: number, manager?: EntityManager): Promise<OrgRole | null> {
  const membership = await membershipRepo(manager).findOne({
    where: { user: { id: userId }, organization: { id: orgId } }
  });
  return membership ? membership.role : null;
}

export interface AuthorizeClassOptions {
  /** Read consistently inside an open transaction. */
  manager?: EntityManager;
  /** Global platform super-admin (`User.role === "SYSTEM_ADMIN"`) — bypasses org/owner checks. */
  isSystemAdmin?: boolean;
}

/**
 * Resolve and authorize a USER principal's action on a class.
 *
 * Returns `null` when the class does not exist (callers should 404). Otherwise
 * returns the class plus the access decision; callers 403 on `!allowed`.
 */
export async function authorizeClassAction(
  userId: number,
  classId: number,
  capability: Capability,
  opts: AuthorizeClassOptions = {}
): Promise<ClassAccessResult | null> {
  const { manager, isSystemAdmin = false } = opts;
  const cls = await classRepo(manager).findOne({
    where: { id: classId },
    relations: ["teacher"]
  });
  if (!cls) return null;

  const isOwner = cls.teacher?.id === userId;
  const orgId = cls.organizationId ?? null;
  const orgRole = orgId != null ? await orgRoleFor(userId, orgId, manager) : null;

  const facts: ClassAccessFacts = { isOwner, orgRole };
  // SYSTEM_ADMIN is a platform-wide super-admin (User.role), orthogonal to the
  // org model; it is the one place global role legitimately overrides org RBAC.
  const allowed = isSystemAdmin || decideClassAccess(facts, capability);
  return {
    cls,
    facts,
    effectiveRole: isSystemAdmin ? "ORG_ADMIN" : effectiveClassRole(facts),
    allowed
  };
}

export interface StudentAccessResult {
  student: Student;
  access: ClassAccessResult;
}

/**
 * Authorize a USER principal's action on a single student, by deferring to the
 * authorization of the student's class. Returns `null` when the student (or its
 * class) does not exist; otherwise `access.allowed` carries the decision.
 *
 * The returned student has `class` (with `teacher`) loaded.
 */
export async function authorizeStudentAction(
  userId: number,
  studentId: number,
  capability: Capability,
  opts: AuthorizeClassOptions = {}
): Promise<StudentAccessResult | null> {
  const { manager } = opts;
  const studentRepo = manager ? manager.getRepository(Student) : AppDataSource.getRepository(Student);
  const student = await studentRepo.findOne({
    where: { id: studentId },
    relations: ["class", "class.teacher"]
  });
  if (!student || !student.class) return null;

  const access = await authorizeClassAction(userId, student.class.id, capability, opts);
  if (!access) return null;
  return { student, access };
}
