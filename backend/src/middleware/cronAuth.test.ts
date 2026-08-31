import test from "node:test";
import assert from "node:assert/strict";
import { isCronAuthorized, secretsMatch } from "./cronAuth";

test("cron secret comparison fails closed when configuration or header is missing", () => {
  assert.equal(secretsMatch(undefined, "configured-secret"), false);
  assert.equal(secretsMatch("configured-secret", ""), false);
  assert.equal(secretsMatch("configured-secret", "different-secret"), false);
});

test("cron secret comparison accepts an exact secret", () => {
  assert.equal(secretsMatch("configured-secret", "configured-secret"), true);
  assert.equal(secretsMatch(["configured-secret"], "configured-secret"), false);
});

test("cron authorization rejects repeated headers and accepts one exact header", () => {
  assert.equal(isCronAuthorized({ headers: {} } as any), false);
  assert.equal(isCronAuthorized({ headers: { "x-cron-secret": ["configured-secret", "other"] } } as any), false);
});
