import test from "node:test";
import assert from "node:assert/strict";
import { roleCan, CAPABILITIES } from "./rbac";

test("ORG_ADMIN can do everything", () => {
  for (const cap of CAPABILITIES) {
    assert.equal(roleCan("ORG_ADMIN", cap), true, cap);
  }
});

test("TEACHER can author/grade/manage students but not org members", () => {
  assert.equal(roleCan("TEACHER", "CLASS_CREATE"), true);
  assert.equal(roleCan("TEACHER", "CLASS_DELETE"), true);
  assert.equal(roleCan("TEACHER", "GRADE_EDIT"), true);
  assert.equal(roleCan("TEACHER", "STUDENT_MANAGE"), true);
  assert.equal(roleCan("TEACHER", "MEMBER_MANAGE"), false);
  assert.equal(roleCan("TEACHER", "ORG_SETTINGS"), false);
});

test("ASSISTANT edits/grades but cannot delete classes or manage students", () => {
  assert.equal(roleCan("ASSISTANT", "CLASS_EDIT"), true);
  assert.equal(roleCan("ASSISTANT", "CONTENT_AUTHOR"), true);
  assert.equal(roleCan("ASSISTANT", "GRADE_EDIT"), true);
  assert.equal(roleCan("ASSISTANT", "CLASS_DELETE"), false);
  assert.equal(roleCan("ASSISTANT", "CLASS_CREATE"), false);
  assert.equal(roleCan("ASSISTANT", "STUDENT_MANAGE"), false);
});

test("STUDENT and PARENT have no management capabilities", () => {
  for (const cap of CAPABILITIES) {
    assert.equal(roleCan("STUDENT", cap), false, `STUDENT ${cap}`);
    assert.equal(roleCan("PARENT", cap), false, `PARENT ${cap}`);
  }
});
