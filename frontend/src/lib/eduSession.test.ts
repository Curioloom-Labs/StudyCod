import { describe, expect, it } from "vitest";
import { chooseEducationalContext } from "./eduSession";
import type { User } from "../types";
const base: User = { id: 4, username: "student", difus: 0, avatarUrl: null, userMode: "PERSONAL" };
const contexts = { students: [{ studentId: 7, classId: 3, className: "Class", firstName: "A", lastName: "B" }], organizations: [] };
describe("EDU session selection", () => {
  it("keeps a linked parent in account context even when they also have a student profile", () => expect(chooseEducationalContext({ ...base, eduContexts: { ...contexts, hasParentAccess: true } })).toEqual({ allowed: true }));
  it("keeps parent organization membership in account context", () => expect(chooseEducationalContext({ ...base, eduContexts: { ...contexts, organizations: [{ orgId: 1, role: "PARENT", name: "School", slug: "school" }] } })).toEqual({ allowed: true }));
  it("selects a linked student before a personal mode gate", () => expect(chooseEducationalContext({ ...base, eduContexts: contexts })).toEqual({ allowed: true, studentId: 7 }));
  it("keeps an explicitly selected student context", () => expect(chooseEducationalContext({ ...base, studentId: 7, role: "TEACHER", eduContexts: { ...contexts, organizations: [{ orgId: 1, role: "TEACHER", name: "School", slug: "school" }] } })).toEqual({ allowed: true }));
  it("does not automatically move staff into their student profile", () => expect(chooseEducationalContext({ ...base, eduContexts: { ...contexts, organizations: [{ orgId: 1, role: "ORG_ADMIN", name: "School", slug: "school" }] } })).toEqual({ allowed: true }));
  it("keeps system administrators in the admin context", () => expect(chooseEducationalContext({ ...base, role: "SYSTEM_ADMIN", eduContexts: contexts })).toEqual({ allowed: true }));
  it("refuses a personal account without EDU membership", () => expect(chooseEducationalContext(base)).toEqual({ allowed: false }));
  it("allows an educational account without a class yet", () => expect(chooseEducationalContext({ ...base, userMode: "EDUCATIONAL" })).toEqual({ allowed: true }));
});
