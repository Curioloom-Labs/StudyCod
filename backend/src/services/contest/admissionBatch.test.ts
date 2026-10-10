import test from "node:test";
import assert from "node:assert/strict";
import type { EntityManager } from "typeorm";
import { createAdmissionBatch } from "./admissionBatch";

test("burst admission shares a commit and never releases receipts before durability", async () => {
  let commits = 0;
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const manager = { query: async () => [] } as unknown as EntityManager;
  const admit = createAdmissionBatch(async work => { commits++; await work(manager); entered(); await gate; });
  let delivered = 0;
  const receipts = Array.from({ length: 20 }, (_, i) => admit(async () => i).then(value => { delivered++; return value; }));
  await started;
  assert.equal(delivered, 0);
  release();
  assert.deepEqual(await Promise.all(receipts), Array.from({ length: 20 }, (_, i) => i));
  assert.equal(commits, 1);
});

test("one rejected admission rolls back its savepoint without losing accepted neighbours", async () => {
  const queries: string[] = [];
  const manager = { query: async (sql: string) => { queries.push(sql); return []; } } as unknown as EntityManager;
  const admit = createAdmissionBatch(async work => { await work(manager); });
  const receipts = [admit(async () => "first"), admit(async () => { throw new Error("IDEMPOTENCY_CONFLICT"); }), admit(async () => "last")];
  const results = await Promise.allSettled(receipts);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
  assert.ok(queries.includes("ROLLBACK TO SAVEPOINT contest_admission_1"));
});

test("commit failure rejects every uncommitted receipt and a later batch can proceed", async () => {
  let fail = true;
  const manager = { query: async () => [] } as unknown as EntityManager;
  const admit = createAdmissionBatch(async work => { await work(manager); if (fail) throw new Error("COMMIT_FAILED"); });
  const results = await Promise.allSettled([admit(async () => 1), admit(async () => 2)]);
  assert.ok(results.every(result => result.status === "rejected"));
  fail = false;
  assert.equal(await admit(async () => 3), 3);
});

test("large admission bursts are bounded to 32 requests per transaction", async () => {
  const counts: number[] = [];
  const manager = { query: async () => [] } as unknown as EntityManager;
  let current = 0;
  const admit = createAdmissionBatch(async work => { current = 0; await work(manager); counts.push(current); });
  await Promise.all(Array.from({ length: 100 }, () => admit(async () => ++current)));
  assert.deepEqual(counts, [32, 32, 32, 4]);
});
