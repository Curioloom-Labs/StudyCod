import test from "node:test";
import assert from "node:assert/strict";
import { renderPrometheusMetrics } from "./health";

test("renderPrometheusMetrics emits valid Prometheus exposition format", () => {
  const out = renderPrometheusMetrics();
  assert.ok(typeof out === "string" && out.length > 0);
  assert.ok(out.endsWith("\n"), "must end with a newline");

  // Core series are present with HELP/TYPE headers.
  for (const name of [
    "studycod_process_uptime_seconds",
    "studycod_judge_active",
    "studycod_judge_queued",
    "studycod_judge_completed_total",
  ]) {
    assert.match(out, new RegExp(`# HELP ${name} `), `missing HELP for ${name}`);
    assert.match(out, new RegExp(`# TYPE ${name} (gauge|counter)`), `missing TYPE for ${name}`);
    assert.match(out, new RegExp(`(^|\\n)${name} \\d`), `missing sample for ${name}`);
  }

  // Counter typing is correct for a *_total series.
  assert.match(out, /# TYPE studycod_judge_completed_total counter/);

  // Labelled mode gauge is well-formed.
  assert.match(out, /studycod_execution_queue_mode\{mode="(distributed|local)"\} 1/);

  // No NaN/undefined leaked into the output.
  assert.ok(!/\bNaN\b/.test(out), "no NaN values");
  assert.ok(!/undefined/.test(out), "no undefined values");
});
