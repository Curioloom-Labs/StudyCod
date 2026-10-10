import test from "node:test";
import assert from "node:assert/strict";
import { cachedStandings, invalidateStandings } from "./standingsCache";

test("standings coalesces concurrent computations and separates viewer modes", async () => {
  invalidateStandings(901);
  let calls = 0;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const compute = async () => { calls++; await wait; return { score: 7 }; };
  const requests = Array.from({ length: 100 }, () => cachedStandings(901, "public", compute));
  release();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.ok(results.every(row => row.score === 7));
  const organizer = await cachedStandings(901, "organizer", async () => ({ score: 11 }));
  assert.equal(organizer.score, 11);
});
test("invalidating an in-flight computation prevents its stale value from being cached", async () => {
  invalidateStandings(902);
  let release!: () => void;
  const old = cachedStandings(902, "frozen", async () => {
    await new Promise<void>(resolve => { release = resolve; }); return "old";
  });
  invalidateStandings(902);
  const current = await cachedStandings(902, "frozen", async () => "new");
  release(); await old;
  assert.equal(current, "new");
  assert.equal(await cachedStandings(902, "frozen", async () => "unexpected"), "new");
});
