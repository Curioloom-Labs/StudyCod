import test from "node:test";
import assert from "node:assert/strict";

import { __authGoogleExchangeTestOnly } from "./auth";

test("google exchange code is one-time: first consume succeeds, second returns null", () => {
  __authGoogleExchangeTestOnly._clearPendingCodes();

  const code = __authGoogleExchangeTestOnly.issueGoogleExchangeCode("success", "jwt-token");
  const first = __authGoogleExchangeTestOnly.consumeGoogleExchangeCode(code);
  const second = __authGoogleExchangeTestOnly.consumeGoogleExchangeCode(code);

  assert.ok(first);
  assert.equal(first?.flow, "success");
  assert.equal(first?.token, "jwt-token");
  assert.equal(second, null);
  assert.equal(__authGoogleExchangeTestOnly._pendingCodeCount(), 0);
});

test("google exchange cleanup removes expired pending codes", () => {
  __authGoogleExchangeTestOnly._clearPendingCodes();

  __authGoogleExchangeTestOnly._setPendingCode("expired-code", {
    flow: "complete",
    token: "temp-token",
    expiresAtMs: Date.now() - 1_000,
  });
  __authGoogleExchangeTestOnly._setPendingCode("fresh-code", {
    flow: "success",
    token: "live-token",
    expiresAtMs: Date.now() + 60_000,
  });

  __authGoogleExchangeTestOnly.cleanupExpiredGoogleExchangeCodes();

  assert.equal(__authGoogleExchangeTestOnly.consumeGoogleExchangeCode("expired-code"), null);
  const fresh = __authGoogleExchangeTestOnly.consumeGoogleExchangeCode("fresh-code");
  assert.ok(fresh);
  assert.equal(fresh?.flow, "success");
});

test("flow mismatch guard works for expected vs actual flow", () => {
  assert.equal(__authGoogleExchangeTestOnly.isGoogleExchangeFlowAllowed(null, "success"), true);
  assert.equal(__authGoogleExchangeTestOnly.isGoogleExchangeFlowAllowed("success", "success"), true);
  assert.equal(__authGoogleExchangeTestOnly.isGoogleExchangeFlowAllowed("complete", "complete"), true);
  assert.equal(__authGoogleExchangeTestOnly.isGoogleExchangeFlowAllowed("success", "complete"), false);
  assert.equal(__authGoogleExchangeTestOnly.isGoogleExchangeFlowAllowed("complete", "success"), false);
});

test("cookie parser reads and decodes cookie values", () => {
  const header = "x=1; __sc_google_exchange=abc%2B123%3D%3D; y=2";
  const parsed = __authGoogleExchangeTestOnly.getCookieValue(header, "__sc_google_exchange");
  assert.equal(parsed, "abc+123==");

  const miss = __authGoogleExchangeTestOnly.getCookieValue(header, "missing_cookie");
  assert.equal(miss, null);
});
