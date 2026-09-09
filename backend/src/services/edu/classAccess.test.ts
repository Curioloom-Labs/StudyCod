import test from "node:test";
import assert from "node:assert/strict";
import { effectiveClassRole, decideClassAccess, type ClassAccessFacts } from "./classAccess";
import { CAPABILITIES, roleCan } from "./rbac";

const facts = (isOwner: boolean, orgRole: ClassAccessFacts["orgRole"]): ClassAccessFacts => ({
  isOwner,
  orgRole
});

test("owner is grandfathered to TEACHER even with no org membership", () => {
  // Covers org_id = null classes and not-yet-backfilled memberships: enabling
  // enforcement must never lock the owning teacher out of their own class.
  const f = facts(true, null);
  assert.equal(effectiveClassRole(f), "TEACHER");
  assert.equal(decideClassAccess(f, "CONTENT_AUTHOR"), true);
  assert.equal(decideClassAccess(f, "GRADE_EDIT"), true);
  assert.equal(decideClassAccess(f, "CLASS_DELETE"), true);
  // TEACHER cannot manage org members even as owner.
  assert.equal(decideClassAccess(f, "MEMBER_MANAGE"), false);
});

test("ORG_ADMIN reaches a class they do not own", () => {
  const f = facts(false, "ORG_ADMIN");
  assert.equal(effectiveClassRole(f), "ORG_ADMIN");
  assert.equal(decideClassAccess(f, "CLASS_DELETE"), true);
  assert.equal(decideClassAccess(f, "STUDENT_MANAGE"), true);
});

test("teaching staff do not reach a non-owned class", () => {
  for (const role of ["ASSISTANT", "TEACHER"] as const) {
    const f = facts(false, role);
    assert.equal(effectiveClassRole(f), role);
    assert.equal(decideClassAccess(f, "CLASS_VIEW"), false);
  }
});

test("non-owner with no org role has no access (cross-org isolation)", () => {
  const f = facts(false, null);
  assert.equal(effectiveClassRole(f), null);
  for (const cap of ["CLASS_EDIT", "CONTENT_AUTHOR", "GRADE_EDIT", "STUDENT_DATA_VIEW"] as const) {
    assert.equal(decideClassAccess(f, cap), false, cap);
  }
});

test("owner downgraded to ASSISTANT in org still keeps TEACHER powers in own class", () => {
  // higherRole(TEACHER, ASSISTANT) === TEACHER — ownership is never weakened by
  // a lower org membership role.
  const f = facts(true, "ASSISTANT");
  assert.equal(effectiveClassRole(f), "TEACHER");
  assert.equal(decideClassAccess(f, "CLASS_DELETE"), true);
});

test("owner who is also ORG_ADMIN gets the higher (admin) role", () => {
  const f = facts(true, "ORG_ADMIN");
  assert.equal(effectiveClassRole(f), "ORG_ADMIN");
  assert.equal(decideClassAccess(f, "MEMBER_MANAGE"), true);
});

test("a STUDENT org role grants no management capability on the class", () => {
  const f = facts(false, "STUDENT");
  assert.equal(effectiveClassRole(f), "STUDENT");
  assert.equal(decideClassAccess(f, "CONTENT_AUTHOR"), false);
  assert.equal(decideClassAccess(f, "GRADE_EDIT"), false);
});

test("authorization matrix denies every cross-class staff action and preserves role boundaries", () => {
  for (const capability of CAPABILITIES) {
    assert.equal(decideClassAccess(facts(false, "TEACHER"), capability), false, `non-owner teacher: ${capability}`);
    assert.equal(decideClassAccess(facts(false, "ASSISTANT"), capability), false, `non-owner assistant: ${capability}`);
  }

  for (const capability of CAPABILITIES) {
    assert.equal(roleCan("ORG_ADMIN", capability), true, `org admin: ${capability}`);
  }
  for (const capability of ["MEMBER_MANAGE", "ORG_SETTINGS"] as const) {
    assert.equal(roleCan("TEACHER", capability), false, `teacher boundary: ${capability}`);
    assert.equal(roleCan("ASSISTANT", capability), false, `assistant boundary: ${capability}`);
  }
});
