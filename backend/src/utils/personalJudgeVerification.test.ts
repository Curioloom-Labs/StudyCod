import test from "node:test";
import assert from "node:assert/strict";
import { resolvePersonalJudgeVerdict } from "./personalJudgeVerification";

test("Personal Judge verdict reflects all per-test passes accepted by the route", () => {
  assert.equal(resolvePersonalJudgeVerdict("WA", 4, 4), "AC");
  assert.equal(resolvePersonalJudgeVerdict("AC", 4, 4), "AC");
});

test("Personal Judge verdict does not claim acceptance when any test failed", () => {
  assert.equal(resolvePersonalJudgeVerdict("AC", 3, 4), "WA");
  assert.equal(resolvePersonalJudgeVerdict(undefined, 3, 4), "WA");
  assert.equal(resolvePersonalJudgeVerdict("CE", 0, 4), "CE");
});

test("Personal Judge verdict is absent when the persisted test count is invalid", () => {
  assert.equal(resolvePersonalJudgeVerdict("AC", 0, 0), null);
  assert.equal(resolvePersonalJudgeVerdict("WA", 2, 1), null);
  assert.equal(resolvePersonalJudgeVerdict("WA", -1, 1), null);
});
