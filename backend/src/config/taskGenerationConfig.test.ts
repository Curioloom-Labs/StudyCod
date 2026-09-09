import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveQuizBudgetCapMs,
  resolveRequestBudgetMs,
  resolveTaskBudgetCapMs,
} from "./taskGenerationConfig";

test("task generation budget helpers keep safe bounds", () => {
  assert.equal(resolveRequestBudgetMs() >= 15_000, true);
  assert.equal(resolveTaskBudgetCapMs(45_000) >= 25_000, true);
  assert.equal(resolveQuizBudgetCapMs() >= 10_000, true);
});
