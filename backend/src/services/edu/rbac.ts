import type { OrgRole } from "../../types/OrgRole";

/**
 * Capability matrix for the fixed org-role taxonomy. EDU authorization asks
 * "can this role do X in this org" — never inspects `User.role`. Pure and
 * data-free so it is trivially testable and the same on every replica.
 */
export const CAPABILITIES = [
  "CLASS_CREATE",
  "CLASS_VIEW", // read a class and its content/roster (teaching staff)
  "CLASS_EDIT",
  "CLASS_DELETE",
  "CONTENT_AUTHOR", // create/edit lessons, tasks, topics
  "GRADE_EDIT",
  "STUDENT_MANAGE", // create students, regenerate credentials
  "STUDENT_DATA_VIEW", // view a student's grades/code/profile
  "MEMBER_MANAGE", // invite/assign org members & roles
  "ORG_SETTINGS"
] as const;

export type Capability = (typeof CAPABILITIES)[number];

const MATRIX: Record<OrgRole, ReadonlySet<Capability>> = {
  ORG_ADMIN: new Set(CAPABILITIES), // everything
  TEACHER: new Set<Capability>([
    "CLASS_CREATE",
    "CLASS_VIEW",
    "CLASS_EDIT",
    "CLASS_DELETE",
    "CONTENT_AUTHOR",
    "GRADE_EDIT",
    "STUDENT_MANAGE",
    "STUDENT_DATA_VIEW"
  ]),
  ASSISTANT: new Set<Capability>([
    "CLASS_VIEW",
    "CLASS_EDIT",
    "CONTENT_AUTHOR",
    "GRADE_EDIT",
    "STUDENT_DATA_VIEW"
  ]),
  STUDENT: new Set<Capability>(),
  PARENT: new Set<Capability>()
};

export function roleCan(role: OrgRole, capability: Capability): boolean {
  return MATRIX[role]?.has(capability) ?? false;
}
