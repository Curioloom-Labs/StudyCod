/**
 * Fixed per-organization role taxonomy for the SaaS EDU subsystem. A user's
 * powers come from their {@link Membership} role within a given organization —
 * NOT from the global `User.role` (which stays untouched for Personal/Contest).
 *
 * Roles (most → least privileged):
 *  - ORG_ADMIN  — manages the org: members, classes, settings, billing.
 *  - TEACHER    — owns classes, authors content, grades.
 *  - ASSISTANT  — co-teaches: edits/grades within assigned classes, cannot delete.
 *  - STUDENT    — enrolled learner.
 *  - PARENT     — read-only observer of their linked child's progress.
 */
export const ORG_ROLES = ["ORG_ADMIN", "TEACHER", "ASSISTANT", "STUDENT", "PARENT"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

export function normalizeOrgRole(value: unknown): OrgRole | null {
  return isOrgRole(value) ? value : null;
}

/** Privilege rank — higher wins when a user somehow holds multiple roles in one org. */
const ROLE_RANK: Record<OrgRole, number> = {
  ORG_ADMIN: 5,
  TEACHER: 4,
  ASSISTANT: 3,
  STUDENT: 2,
  PARENT: 1
};

export function higherRole(a: OrgRole, b: OrgRole): OrgRole {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}
