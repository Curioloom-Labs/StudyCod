import test from "node:test";
import assert from "node:assert/strict";
import { BoundedCache } from "./boundedCache";

test("BoundedCache: set/get round-trip", () => {
  const cache = new BoundedCache<string, number>({ maxEntries: 3, ttlMs: 60_000 });
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("b"), 2);
  assert.equal(cache.get("missing"), undefined);
});

test("BoundedCache: evicts least-recently-used when full", () => {
  const cache = new BoundedCache<string, number>({ maxEntries: 2, ttlMs: 60_000 });
  cache.set("a", 1);
  cache.set("b", 2);
  // Touch "a" so it becomes most-recent.
  cache.get("a");
  cache.set("c", 3);
  // "b" was LRU and must be evicted.
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("a"), 1);
  assert.equal(cache.get("c"), 3);
  assert.equal(cache.size, 2);
});

test("BoundedCache: expires entries past TTL", () => {
  const cache = new BoundedCache<string, number>({ maxEntries: 10, ttlMs: 1 });
  cache.set("a", 1);
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 1000;
    assert.equal(cache.get("a"), undefined);
    assert.equal(cache.size, 0);
  } finally {
    Date.now = originalNow;
  }
});

test("BoundedCache: re-set updates value without growing", () => {
  const cache = new BoundedCache<string, number>({ maxEntries: 2, ttlMs: 60_000 });
  cache.set("a", 1);
  cache.set("a", 2);
  cache.set("a", 3);
  assert.equal(cache.get("a"), 3);
  assert.equal(cache.size, 1);
});

test("BoundedCache: delete removes entry", () => {
  const cache = new BoundedCache<string, number>({ maxEntries: 2, ttlMs: 60_000 });
  cache.set("a", 1);
  cache.delete("a");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("BoundedCache: rejects non-positive options", () => {
  assert.throws(() => new BoundedCache({ maxEntries: 0, ttlMs: 1 }));
  assert.throws(() => new BoundedCache({ maxEntries: 1, ttlMs: 0 }));
  assert.throws(() => new BoundedCache({ maxEntries: NaN, ttlMs: 1 }));
});

test("BoundedCache: size cap holds under churn", () => {
  const cache = new BoundedCache<number, number>({ maxEntries: 5, ttlMs: 60_000 });
  for (let i = 0; i < 1000; i++) cache.set(i, i);
  assert.equal(cache.size, 5);
  // The five most-recently-set keys must still be present.
  for (let i = 995; i < 1000; i++) {
    assert.equal(cache.get(i), i);
  }
});
