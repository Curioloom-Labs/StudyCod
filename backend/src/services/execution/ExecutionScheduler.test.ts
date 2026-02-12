import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionScheduler } from "./ExecutionScheduler";
import { HttpError } from "../../utils/httpError";

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test("ExecutionScheduler: caps active executions and applies FIFO queue with bounded size", async () => {
  const maxConcurrent = 8;
  const maxQueueSize = 50;
  const scheduler = new ExecutionScheduler({
    maxConcurrent,
    maxQueueSize,
    logIntervalMs: 0,
  });

  const N = 100;
  const taskMs = 150; // long enough so enqueue loop finishes before tasks complete

  let peakObserved = 0;

  const tasks = Array.from({ length: N }, (_, i) =>
    scheduler
      .schedule(async () => {
        const s0 = scheduler.snapshot();
        peakObserved = Math.max(peakObserved, s0.active);
        await sleep(taskMs);
        const s1 = scheduler.snapshot();
        peakObserved = Math.max(peakObserved, s1.active);
        return i;
      }, { label: `t${i}` })
  );

  const startedAt = Date.now();
  const settled = await Promise.allSettled(tasks);
  const elapsed = Date.now() - startedAt;

  // No hang.
  assert.ok(elapsed < 30_000, `expected to finish quickly, elapsed=${elapsed}ms`);

  // Concurrency never exceeds maxConcurrent.
  assert.ok(peakObserved <= maxConcurrent, `peak active=${peakObserved} must be <= ${maxConcurrent}`);

  // Deterministic overload: at most maxConcurrent + maxQueueSize tasks can be accepted.
  const accepted = Math.min(N, maxConcurrent + maxQueueSize);
  const expectedRejected = N - accepted;

  let ok = 0;
  let rejectedBusy = 0;
  for (const s of settled) {
    if (s.status === "fulfilled") {
      ok++;
      continue;
    }
    const e = s.reason;
    if (e instanceof HttpError) {
      assert.equal(e.statusCode, 503);
      assert.equal(e.message, "System busy");
      rejectedBusy++;
    } else {
      assert.fail(`unexpected rejection: ${String((e as any)?.message || e)}`);
    }
  }

  assert.equal(ok, accepted);
  assert.equal(rejectedBusy, expectedRejected);

  const snap = scheduler.snapshot();
  assert.equal(snap.active, 0);
  assert.equal(snap.queued, 0);
  assert.equal(snap.totalRejectedQueueFull, expectedRejected);
  assert.equal(snap.peakQueueLength, maxQueueSize);
});
