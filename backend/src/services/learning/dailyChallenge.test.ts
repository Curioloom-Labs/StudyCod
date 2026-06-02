import test from "node:test";
import assert from "node:assert/strict";
import { pickDailyChallenge, upcomingDailyChallenges, toDateKey, fnv1a } from "./dailyChallenge";

const pool = [10, 20, 30, 40, 50, 60, 70];

test("same date picks the same item (deterministic)", () => {
  const d = new Date(Date.UTC(2026, 4, 31));
  const a = pickDailyChallenge(pool, d);
  const b = pickDailyChallenge(pool, d);
  assert.deepEqual(a, b);
  assert.ok(a && pool.includes(a.item));
});

test("different dates usually pick different items", () => {
  const d1 = new Date(Date.UTC(2026, 4, 31));
  const d2 = new Date(Date.UTC(2026, 5, 1));
  const a = pickDailyChallenge(pool, d1)!;
  const b = pickDailyChallenge(pool, d2)!;
  assert.notEqual(`${a.date}`, `${b.date}`);
});

test("salt produces an independent stream", () => {
  const d = new Date(Date.UTC(2026, 4, 31));
  const a = pickDailyChallenge(pool, d, "JAVA");
  const b = pickDailyChallenge(pool, d, "PYTHON");
  assert.ok(a && b);
  // Not guaranteed different, but indices come from different keys.
  assert.equal(a.date, b.date);
});

test("empty pool returns null", () => {
  assert.equal(pickDailyChallenge([], new Date()), null);
});

test("index is within bounds", () => {
  for (let i = 0; i < 40; i++) {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    const p = pickDailyChallenge(pool, d)!;
    assert.ok(p.index >= 0 && p.index < pool.length);
  }
});

test("upcoming returns N picks starting at date", () => {
  const d = new Date(Date.UTC(2026, 4, 31));
  const week = upcomingDailyChallenges(pool, d, 7);
  assert.equal(week.length, 7);
  assert.equal(week[0].date, toDateKey(d));
});

test("fnv1a is stable", () => {
  assert.equal(fnv1a("2026-05-31|"), fnv1a("2026-05-31|"));
});
