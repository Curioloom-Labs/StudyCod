import test from "node:test";
import assert from "node:assert/strict";
import { canClassManageUserPassword, isClassIssuedAccountUser } from "./classIssuedAccountPolicy";

test("a personal link stays personal even for a regular unverified student account", () => {
  for (const role of [null, "USER"] as const) {
    assert.equal(canClassManageUserPassword({ userAccountManaged: false }, { role, userMode: "PERSONAL" }), false);
  }
});

test("explicitly issued learner accounts can synchronize normal and class passwords", () => {
  for (const userMode of ["PERSONAL", "EDUCATIONAL"] as const) for (const role of [null, "USER"] as const) {
    assert.equal(canClassManageUserPassword({ userAccountManaged: true }, { role, userMode }), true);
  }
});

test("promotion removes class staff authority over the account password", () => {
  for (const role of ["TEACHER", "SUPPORT", "SYSTEM_ADMIN"] as const) {
    assert.equal(canClassManageUserPassword({ userAccountManaged: true }, { role, userMode: "EDUCATIONAL" }), false);
    assert.equal(isClassIssuedAccountUser({ role, userMode: "EDUCATIONAL" }), false);
  }
});

test("a CONTEST identity cannot inherit educational account password authority", () => {
  for (const role of [null, "USER"] as const) {
    assert.equal(canClassManageUserPassword({ userAccountManaged: true }, { role, userMode: "CONTEST" }), false);
    assert.equal(isClassIssuedAccountUser({ role, userMode: "CONTEST" }), false);
  }
});
