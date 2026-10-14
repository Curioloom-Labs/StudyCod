import test from "node:test";
import assert from "node:assert/strict";
import { eduUserPasswordVersion, matchesStudentCredentialVersion, matchesEduUserPasswordVersion } from "./studentCredentialVersion";

test("legacy student cookies stop working after a password change", () => {
  assert.equal(matchesStudentCredentialVersion(undefined, 0), true);
  assert.equal(matchesStudentCredentialVersion(undefined, 1), false);
  assert.equal(matchesStudentCredentialVersion(2, 2), true);
  assert.equal(matchesStudentCredentialVersion(1, 2), false);
});
test("student credential claims cannot coerce strings or malformed numbers", () => {
  for (const claim of [null, "0", -1, 0.5, NaN, Infinity, {}, Number.MAX_SAFE_INTEGER + 1]) assert.equal(matchesStudentCredentialVersion(claim, 0), false);
});
test("managed User cookies bind to the current password hash", () => {
  const state = { passwordVersion: eduUserPasswordVersion("hash-a"), credentialVersion: 1 };
  assert.equal(matchesEduUserPasswordVersion(state.passwordVersion, state), true);
  assert.equal(matchesEduUserPasswordVersion(eduUserPasswordVersion("hash-b"), state), false);
  assert.equal(matchesEduUserPasswordVersion(undefined, state), false);
  assert.equal(matchesEduUserPasswordVersion(null, state), false);
  assert.equal(state.passwordVersion.includes("hash-a"), false);
});
test("unchanged managed accounts retain compatibility with pre-migration User cookies", () => {
  assert.equal(matchesEduUserPasswordVersion(undefined, { passwordVersion: "version", credentialVersion: 0 }), true);
});
