import assert from "node:assert/strict";
import test from "node:test";
import type { JudgeResponse, JudgeTestCase } from "./judgeWorker/types";
import { summarizeGrowthProjectCheck } from "./growthProjectCheckSummary";

const tests: JudgeTestCase[] = [
  { id: "public-1", input: "a", output: "A", hidden: false },
  { id: "hidden-1", input: "b", output: "B", hidden: true },
  { id: "own-1", input: "c", output: "C", hidden: false },
];
function response(verdicts: Array<"AC" | "WA">, actuals: string[]): JudgeResponse {
  return {
    submission_id: "unit",
    verdict: verdicts.every(verdict => verdict === "AC") ? "AC" : "WA",
    time_ms: 1,
    memory_kb: 1,
    compile: { ok: true, verdict: "AC", message: "", time_ms: 0, memory_kb: 1 },
    tests: verdicts.map((verdict, index) => ({ test_id: tests[index].id, verdict, time_ms: 1, memory_kb: 1, actual: actuals[index] })),
  };
}

test("a failed author example prevents a project check from passing", () => {
  const summary = summarizeGrowthProjectCheck(response(["AC", "AC", "WA"], ["A", "B", "wrong"]), tests);
  assert.equal(summary.testsPassed, 2);
  assert.equal(summary.testsTotal, 2);
  assert.equal(summary.ownExampleOutputs[0].passed, false);
  assert.equal(summary.passed, false);
});

test("hidden tests stay out of the public result projection", () => {
  const summary = summarizeGrowthProjectCheck(response(["AC", "AC", "AC"], ["A", "B", "C"]), tests);
  assert.equal(summary.passed, true);
  assert.equal(summary.publicTests.length, 1);
  assert.equal(summary.publicTests[0].id, "public-1");
  assert.equal(summary.publicTests.some(item => item.id === "hidden-1"), false);
});
