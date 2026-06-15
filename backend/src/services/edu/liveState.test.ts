import test from "node:test";
import assert from "node:assert/strict";
import { setLiveState, getLiveState, deleteLiveState, __resetLiveStateForTests } from "./liveStateStore";
import { setLiveCode, getLiveCode } from "./liveCode";
import { startChallenge, getChallenge, endChallenge } from "./liveChallenge";
import { openBreakouts, getBreakouts, findStudentGroup, getGroup, closeBreakouts } from "./liveBreakout";

// In NODE_ENV=test Redis is disabled, so these exercise the in-memory fallback,
// which is the path that runs locally and on a single-node deploy.

test("store: set/get/delete round-trip and key isolation", async () => {
  __resetLiveStateForTests("t");
  await setLiveState("t", 1, { a: 1 }, null);
  await setLiveState("t", 2, { a: 2 }, null);
  assert.deepEqual(await getLiveState("t", 1), { a: 1 });
  assert.deepEqual(await getLiveState("t", 2), { a: 2 });
  assert.equal(await getLiveState("t", 999), null);

  await deleteLiveState("t", 1);
  assert.equal(await getLiveState("t", 1), null);
  assert.deepEqual(await getLiveState("t", 2), { a: 2 });
});

test("store: TTL expiry drops entries", async (t) => {
  __resetLiveStateForTests("ttl");
  t.mock.timers.enable({ apis: ["Date"], now: 0 });
  await setLiveState("ttl", "k", { v: 1 }, 120);
  assert.deepEqual(await getLiveState("ttl", "k"), { v: 1 });

  t.mock.timers.tick(119_000);
  assert.deepEqual(await getLiveState("ttl", "k"), { v: 1 }, "still fresh before TTL");

  t.mock.timers.tick(2_000); // now 121s > 120s TTL
  assert.equal(await getLiveState("ttl", "k"), null, "expired after TTL");
});

test("liveCode: round-trip and oversized code truncation", async () => {
  __resetLiveStateForTests("code");
  await setLiveCode(7, { classId: 3, taskId: 9, taskTitle: "T", code: "hello" });
  const snap = await getLiveCode(7);
  assert.equal(snap?.classId, 3);
  assert.equal(snap?.taskId, 9);
  assert.equal(snap?.code, "hello");

  const huge = "x".repeat(200_000);
  await setLiveCode(7, { classId: 3, taskId: 9, taskTitle: "T", code: huge });
  const snap2 = await getLiveCode(7);
  assert.equal(snap2?.code.length, 100_000, "code is capped at MAX_CODE_CHARS");
});

test("liveChallenge: start/get/end lifecycle", async () => {
  __resetLiveStateForTests("challenge");
  const ch = await startChallenge({ classId: 5, taskId: 11, taskTitle: "Q", durationSec: 90 });
  assert.equal(ch.classId, 5);
  assert.ok(ch.id.length > 0);

  const got = await getChallenge(5);
  assert.equal(got?.id, ch.id);
  assert.equal(got?.taskId, 11);

  await endChallenge(5);
  assert.equal(await getChallenge(5), null);
});

test("liveBreakout: round-robin assignment, lookups, and close", async () => {
  __resetLiveStateForTests("breakout");
  const state = await openBreakouts(4, 2, [10, 11, 12, 13, 14]);
  assert.equal(state.groups.length, 2);
  // Round-robin: group 0 gets 10,12,14; group 1 gets 11,13.
  assert.deepEqual(state.groups[0].studentIds, [10, 12, 14]);
  assert.deepEqual(state.groups[1].studentIds, [11, 13]);

  assert.equal((await getBreakouts(4))?.groups.length, 2);
  assert.equal((await findStudentGroup(4, 13))?.index, 1);
  assert.equal(await findStudentGroup(4, 999), null);
  assert.equal((await getGroup(4, 0))?.studentIds.includes(10), true);

  await closeBreakouts(4);
  assert.equal(await getBreakouts(4), null);
});
