import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JudgeClient } from "./JudgeClient";
import type { JudgeRequest, JudgeResponse } from "./types";
import { resolveJudgeWorkerEntry } from "./workerPaths";

function hasExecutable(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

test(
  "judge worker contract: scoring fields present and consistent",
  {
    skip: process.env.RUN_JUDGE_CONTRACT_TEST !== "1"
  },
  async () => {
    const workerEntry = await resolveJudgeWorkerEntry();
    assert.ok(workerEntry && typeof workerEntry === "string", "worker entry must resolve");
    assert.ok(fs.existsSync(workerEntry), `worker entry must exist: ${workerEntry}`);

    if (process.env.NSJAIL_PATH) {
      assert.ok(hasExecutable(process.env.NSJAIL_PATH), `NSJAIL_PATH does not exist: ${process.env.NSJAIL_PATH}`);
    }

    process.env.NSJAIL_USE_CONFIG = process.env.NSJAIL_USE_CONFIG ?? "1";

    const client = new JudgeClient({
      overallTimeoutMs: 20_000,
      maxStdoutBytes: 1024 * 1024,
      maxStderrBytes: 256 * 1024
    });

    const req: JudgeRequest = {
      submission_id: `contract_${Date.now()}`,
      language: "python",
      source: [
        "s = input()",
        "print(s.strip())"
      ].join("\n"),
      tests: [
        {
          id: 1,
          input: "hello\n",
          output: "hello\n",
          hidden: false,
          group: "public",
          weight: 2
        },
        {
          id: 2,
          input: "world\n",
          output: "world\n",
          hidden: true,
          group: "hidden",
          weight: 3
        }
      ],
      limits: {
        time_limit_ms: 800,
        memory_limit_mb: 128,
        output_limit_kb: 64
      },
      checker: {
        type: "whitespace" as const
      },
      debug: false,
      run_all: true,
      rerun_failed_once: true
    };

    const res = (await client.judge(req)) as JudgeResponse;

    assert.ok(res && typeof res === "object", "response must be an object");
    assert.equal(res.submission_id, req.submission_id);

    assert.equal(typeof res.score, "number", "score must be present");
    assert.equal(typeof res.max_score, "number", "max_score must be present");
    assert.ok((res.score as number) >= 0);
    assert.ok((res.max_score as number) > 0);
    assert.ok((res.score as number) <= (res.max_score as number));

    assert.ok(Array.isArray(res.group_scores), "group_scores must be an array");
    assert.ok(res.group_scores!.length >= 1, "group_scores must not be empty");

    const byGroup = new Map(res.group_scores!.map(gs => [gs.group, gs] as const));
    assert.ok(byGroup.has("public"), "public group must exist");
    assert.ok(byGroup.has("hidden"), "hidden group must exist");

    for (const gs of res.group_scores!) {
      assert.equal(typeof gs.group, "string");
      assert.equal(typeof gs.score, "number");
      assert.equal(typeof gs.max_score, "number");
      assert.ok(gs.max_score >= 0);
      assert.ok(gs.score >= 0);
      assert.ok(gs.score <= gs.max_score);
    }

    assert.ok(Array.isArray(res.tests), "tests must be an array");
    assert.ok(res.tests.length >= 1, "tests must not be empty");

    for (const tr of res.tests) {
      assert.ok(tr.test_id !== undefined);
      assert.equal(typeof tr.verdict, "string");
      assert.ok(tr.group === undefined || typeof tr.group === "string", "test.group must be string when present");
      assert.ok(tr.weight === undefined || typeof tr.weight === "number", "test.weight must be number when present");
    }
  }
);
