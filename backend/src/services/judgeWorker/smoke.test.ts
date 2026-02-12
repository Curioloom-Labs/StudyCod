import test from "node:test";
import assert from "node:assert/strict";
import { JudgeClient } from "./JudgeClient";
import { judgeWithSemaphore } from "./index";
import type { JudgeRequest } from "./types";
import { HttpError } from "../../utils/httpError";

const SHOULD_RUN = process.env.RUN_JUDGE_SMOKE_TESTS === "1" && process.platform === "linux";

function buildReq(overrides: Partial<JudgeRequest>): JudgeRequest {
  return {
    submission_id: `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    language: "python",
    source: "print('ok')",
    tests: [
      {
        id: 1,
        input: "",
        output: "",
        hidden: false,
        group: "smoke",
        weight: 1
      }
    ],
    limits: {
      time_limit_ms: 250,
      memory_limit_mb: 128,
      output_limit_kb: 64
    },
    checker: { type: "exact" },
    debug: true,
    run_all: true,
    rerun_failed_once: false,
    ...overrides
  };
}

( SHOULD_RUN ? test : test.skip )("judge: infinite loop is time-limited", async () => {
  const client = new JudgeClient({ overallTimeoutMs: 20_000 });
  const req = buildReq({
    source: "while True:\n  pass\n",
    limits: { time_limit_ms: 200, memory_limit_mb: 128, output_limit_kb: 64 }
  });
  const res = await client.judge(req);
  assert.equal(res.tests.length, 1);
  assert.equal(res.tests[0].verdict, "TLE");
});

( SHOULD_RUN ? test : test.skip )("judge: stdout spam is capped", async () => {
  const client = new JudgeClient({ overallTimeoutMs: 20_000 });
  const req = buildReq({
    // Print ~1MB to exceed small output limit quickly.
    source: "print('A' * 1000000)\n",
    limits: { time_limit_ms: 800, memory_limit_mb: 128, output_limit_kb: 32 }
  });
  const res = await client.judge(req);
  const t0 = res.tests[0];
  // In this judge implementation, output-limit is surfaced as RE + message.
  assert.equal(t0.verdict, "RE");
  assert.match(String(t0.message || ""), /output limit exceeded/i);
});

( SHOULD_RUN ? test : test.skip )("judge: memory abuse is contained", async () => {
  const client = new JudgeClient({ overallTimeoutMs: 20_000 });
  const req = buildReq({
    // Try allocating a lot of memory. Depending on runtime behavior, this may be
    // a clean MemoryError (RE) or an OOM-kill (MLE).
    source: "a = bytearray(1024 * 1024 * 512)\nprint(len(a))\n",
    limits: { time_limit_ms: 800, memory_limit_mb: 64, output_limit_kb: 64 }
  });
  const res = await client.judge(req);
  const t0 = res.tests[0];
  assert.notEqual(t0.verdict, "AC");
  const combined = `${t0.message || ""}\n${t0.stderr || ""}`.toLowerCase();
  assert.ok(combined.includes("memory"));
});

( SHOULD_RUN ? test : test.skip )("backend: hard timeout cancels judge request", async () => {
  const startedAt = Date.now();
  const req = buildReq({
    source: "import time\nprint('start')\ntime.sleep(5)\nprint('end')\n",
    limits: { time_limit_ms: 10_000, memory_limit_mb: 128, output_limit_kb: 64 }
  });
  let err: any = null;
  try {
    await judgeWithSemaphore(req, { timeoutMs: 200 });
  } catch (e: any) {
    err = e;
  }
  assert.ok(err, "expected timeout error");
  assert.ok(err instanceof HttpError);
  assert.equal(err.statusCode, 503);
  assert.equal(err.message, "Judge unavailable");
  assert.ok(Date.now() - startedAt < 5_000);
});

( SHOULD_RUN ? test : test.skip )("backend: 30 parallel submissions settle (no hang)", async () => {
  const N = 30;
  const reqs: JudgeRequest[] = Array.from({ length: N }, () => buildReq({
    submission_id: `smoke_parallel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    source: "print('ok')\n",
    limits: { time_limit_ms: 150, memory_limit_mb: 128, output_limit_kb: 64 }
  }));
  const startedAt = Date.now();
  const settled = await Promise.allSettled(reqs.map(r => judgeWithSemaphore(r, { timeoutMs: 5_000 })));
  const elapsed = Date.now() - startedAt;
  assert.equal(settled.length, N);
  assert.ok(elapsed < 15_000);

  let ok = 0;
  let busy = 0;
  let unavailable = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      ok++;
      continue;
    }
    const e = s.reason;
    if (e instanceof HttpError) {
      if (e.statusCode === 429) busy++;
      else if (e.statusCode === 503) unavailable++;
    }
  }
  assert.ok(ok >= 1, `expected at least one success, got ok=${ok} busy=${busy} unavailable=${unavailable}`);
  assert.ok(ok + busy + unavailable === N);
});
