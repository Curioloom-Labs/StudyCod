import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOrgRole, isOrgRole, higherRole } from "../../types/OrgRole";
import { slugifyBase } from "./membership";

test("normalizeOrgRole accepts exact roles, rejects everything else", () => {
  assert.equal(normalizeOrgRole("ORG_ADMIN"), "ORG_ADMIN");
  assert.equal(normalizeOrgRole("STUDENT"), "STUDENT");
  assert.equal(normalizeOrgRole("teacher"), null, "case-sensitive");
  assert.equal(normalizeOrgRole("OWNER"), null);
  assert.equal(normalizeOrgRole(undefined), null);
  assert.equal(normalizeOrgRole(123), null);
});

test("isOrgRole is a correct type guard", () => {
  assert.equal(isOrgRole("PARENT"), true);
  assert.equal(isOrgRole("nope"), false);
});

test("higherRole returns the more privileged role", () => {
  assert.equal(higherRole("STUDENT", "TEACHER"), "TEACHER");
  assert.equal(higherRole("TEACHER", "STUDENT"), "TEACHER");
  assert.equal(higherRole("ORG_ADMIN", "PARENT"), "ORG_ADMIN");
  assert.equal(higherRole("ASSISTANT", "ASSISTANT"), "ASSISTANT");
  assert.equal(higherRole("PARENT", "STUDENT"), "STUDENT");
});

test("slugifyBase produces url-safe slugs and a fallback", () => {
  assert.equal(slugifyBase("My School"), "my-school");
  assert.equal(slugifyBase("Acme   Corp"), "acme-corp");
  assert.equal(slugifyBase("Café del Mar"), "cafe-del-mar");
  assert.equal(slugifyBase("--Trim--Me--"), "trim-me");
  assert.equal(slugifyBase(""), "org");
  assert.equal(slugifyBase("   ***   "), "org");
});

test("slugifyBase caps length at 60 chars", () => {
  const long = "a".repeat(120);
  assert.equal(slugifyBase(long).length, 60);
});
