import test from "node:test";
import assert from "node:assert/strict";
import { isPersonalAccountPrincipal, requirePersonalAccountPrincipal } from "./personalAccountAccess";

test("only a positive authenticated Personal user is a Personal account principal", () => {
  assert.equal(isPersonalAccountPrincipal({ userId: 4, userType: "USER", userMode: "PERSONAL" }), true);
  assert.equal(isPersonalAccountPrincipal({ userId: 4, userType: "USER", userMode: "EDUCATIONAL" }), false);
  assert.equal(isPersonalAccountPrincipal({ userId: 4, userType: "STUDENT", userMode: "PERSONAL" }), false);
  assert.equal(isPersonalAccountPrincipal({ userId: 0, userType: "USER", userMode: "PERSONAL" }), false);
  assert.equal(isPersonalAccountPrincipal({ userId: Number.NaN, userType: "USER", userMode: "PERSONAL" }), false);
  assert.equal(isPersonalAccountPrincipal({ userId: undefined, userType: "USER", userMode: "PERSONAL" }), false);
});

test("Personal account guard responds consistently and does not continue on denial", () => {
  let status = 0;
  let body: unknown;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { body = value; return response; } };
  assert.equal(requirePersonalAccountPrincipal({ userId: 7, userType: "USER", userMode: "PERSONAL" } as any, response as any), 7);
  assert.equal(requirePersonalAccountPrincipal({ userId: 7, userType: "USER", userMode: "EDUCATIONAL" } as any, response as any), null);
  assert.equal(status, 403);
  assert.deepEqual(body, { code: "PERSONAL_USER_REQUIRED", message: "PERSONAL_USER_REQUIRED" });
});
