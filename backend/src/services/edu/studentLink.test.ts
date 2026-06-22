import test from "node:test";
import assert from "node:assert/strict";
import { applyStudentViewToUserDto, validateClaimInput } from "./studentLink";

const student = { id: 42, class: { id: 7, name: "10-A", language: "JAVA" } };

test("applyStudentViewToUserDto overlays the student-in-class view", () => {
  const dto = applyStudentViewToUserDto({ id: 1, username: "ann", email: "a@e.com", userMode: "PERSONAL", role: null }, student);
  assert.equal(dto.userMode, "EDUCATIONAL", "a User-backed student boots into EDU");
  assert.equal(dto.studentId, 42);
  assert.equal(dto.classId, 7);
  assert.equal(dto.className, "10-A");
  assert.equal(dto.course, "JAVA");
  assert.equal(dto.lang, "JAVA");
});

test("applyStudentViewToUserDto keeps base identity fields", () => {
  const dto = applyStudentViewToUserDto({ id: 1, username: "ann", email: "a@e.com" }, student);
  assert.equal(dto.id, 1, "stays the User id (stable principal), not the student id");
  assert.equal(dto.username, "ann");
  assert.equal(dto.email, "a@e.com");
});

test("validateClaimInput trims the username, preserves the password", () => {
  const r = validateClaimInput("  ann_petrenko_ab12  ", "  p@ss  ");
  assert.equal(r.username, "ann_petrenko_ab12");
  assert.equal(r.password, "  p@ss  ", "passwords are not trimmed");
});

test("validateClaimInput rejects empty username or password", () => {
  assert.throws(() => validateClaimInput("", "p"), /INVALID_INPUT/);
  assert.throws(() => validateClaimInput("   ", "p"), /INVALID_INPUT/);
  assert.throws(() => validateClaimInput("ann", ""), /INVALID_INPUT/);
  assert.throws(() => validateClaimInput(undefined, undefined), /INVALID_INPUT/);
});
