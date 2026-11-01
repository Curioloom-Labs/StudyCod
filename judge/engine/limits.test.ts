import assert from "node:assert/strict";
import test from "node:test";
import { applyProfileRuntimeLimits, PYTHON_GUI_MIN_TIME_LIMIT_MS, type ResolvedLimits } from "./limits";

const limits: ResolvedLimits = {
  timeLimitMs: 900,
  memoryLimitBytes: 128 * 1024 * 1024,
  outputLimitBytes: 64 * 1024,
};

test("Python GUI runtime reserves time for the isolated display startup", () => {
  assert.equal(applyProfileRuntimeLimits("python-gui", limits).timeLimitMs, PYTHON_GUI_MIN_TIME_LIMIT_MS);
  assert.equal(applyProfileRuntimeLimits("python-gui", { ...limits, timeLimitMs: 8_000 }).timeLimitMs, 8_000);
  assert.equal(applyProfileRuntimeLimits("python", limits).timeLimitMs, 900);
});
