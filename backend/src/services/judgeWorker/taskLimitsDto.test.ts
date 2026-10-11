import test from "node:test";
import assert from "node:assert/strict";
import { taskLimitsByLanguage } from "./taskLimitsDto";
import type { JudgeLanguage } from "./types";

const defaults = {
  java: { time_limit_ms: 1200, memory_limit_mb: 256 },
  python: { time_limit_ms: 900, memory_limit_mb: 128 },
  cpp: { time_limit_ms: 800, memory_limit_mb: 256 },
  csharp: { time_limit_ms: 1200, memory_limit_mb: 1024 },
} as Record<JudgeLanguage, { time_limit_ms: number; memory_limit_mb: number }>;

test("statement limits use the judge defaults for each allowed language", () => {
  assert.deepEqual(
    taskLimitsByLanguage({}, defaults, ["java", "python", "cpp"]),
    {
      java: { timeLimitMs: 1200, memoryLimitMb: 256 },
      python: { timeLimitMs: 900, memoryLimitMb: 128 },
      cpp: { timeLimitMs: 800, memoryLimitMb: 256 },
    },
  );
});

test("statement limits apply author overrides and the same memory caps as the judge", () => {
  assert.deepEqual(
    taskLimitsByLanguage({ timeLimitMs: 2500, memoryLimitMb: 900 }, defaults, [
      "cpp",
      "csharp",
    ]),
    {
      cpp: { timeLimitMs: 2500, memoryLimitMb: 512 },
      csharp: { timeLimitMs: 2500, memoryLimitMb: 900 },
    },
  );
  assert.deepEqual(
    taskLimitsByLanguage({ timeLimitMs: -1, memoryLimitMb: NaN }, defaults, [
      "python",
    ]),
    {
      python: { timeLimitMs: 900, memoryLimitMb: 128 },
    },
  );
  assert.equal(
    taskLimitsByLanguage({ memoryLimitMb: 1 }, defaults, ["java"]).java
      .memoryLimitMb,
    32,
  );
});
