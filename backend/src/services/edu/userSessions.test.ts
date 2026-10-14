import test from "node:test";
import assert from "node:assert/strict";
import { matchesEduSessionVersion } from "./userSessions";

test("legacy EDU User sessions expire after the first durable revocation", () => {
  assert.equal(matchesEduSessionVersion(undefined, 0), true);
  assert.equal(matchesEduSessionVersion(undefined, 1), false);
  assert.equal(matchesEduSessionVersion(0, 1), false);
  assert.equal(matchesEduSessionVersion(1, 1), true);
  assert.equal(matchesEduSessionVersion(1, 2), false);
});
test("EDU session claims never coerce malformed values", () => {
  for (const claim of [null, "0", -1, 0.5, NaN, Infinity, {}, [], 0x100000000]) {
    assert.equal(matchesEduSessionVersion(claim, 0), false);
  }
  for (const version of [-1, NaN, Infinity, 0.5, 0x100000000]) {
    assert.equal(matchesEduSessionVersion(undefined, version), false);
  }
});
