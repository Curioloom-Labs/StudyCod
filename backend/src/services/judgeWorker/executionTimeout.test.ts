import test from "node:test";
import assert from "node:assert/strict";
import { estimateJudgeExecutionTimeoutMs } from "./executionTimeout";
import type { JudgeRequest } from "./types";
const request = (language: JudgeRequest["language"], count: number, rerun = false): JudgeRequest => ({
  submission_id: "timeout-test", language, source: "test", tests: Array.from({ length: count }, (_, id) => ({ id, input: "", output: "" })),
  limits: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 }, rerun_failed_once: rerun,
});
test("watchdog covers 70 tests and the complete Kotlin compiler budget", () => {
  assert.ok(estimateJudgeExecutionTimeoutMs(request("kotlin", 70)) > 70 * 2000 + 60000);
  assert.ok(estimateJudgeExecutionTimeoutMs(request("kotlin", 70, true)) > 70 * 2000 * 2 + 60000);
});
test("Dart kernel compilation is included even for a single test", () => {
  assert.ok(estimateJudgeExecutionTimeoutMs(request("dart", 1)) > 45000);
  assert.equal(estimateJudgeExecutionTimeoutMs(request("dart", 70), "12345"), 12345);
});
