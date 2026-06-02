import test from "node:test";
import assert from "node:assert/strict";
import { boundSnapshots, type ReplaySnapshot } from "./replaySession";

test("drops consecutive identical snapshots", () => {
  const raw: ReplaySnapshot[] = [
    { tMs: 0, code: "a" },
    { tMs: 1, code: "a" },
    { tMs: 2, code: "ab" },
    { tMs: 3, code: "ab" },
    { tMs: 4, code: "abc" },
  ];
  const out = boundSnapshots(raw);
  assert.deepEqual(out.map((s) => s.code), ["a", "ab", "abc"]);
});

test("downsamples to maxSnapshots keeping first and last", () => {
  const raw: ReplaySnapshot[] = Array.from({ length: 1000 }, (_, i) => ({ tMs: i, code: `v${i}` }));
  const out = boundSnapshots(raw, { maxSnapshots: 50 });
  assert.ok(out.length <= 50);
  assert.equal(out[0].code, "v0");
  assert.equal(out[out.length - 1].code, "v999");
});

test("caps total bytes by dropping oldest, keeping recent", () => {
  const big = "x".repeat(1000);
  const raw: ReplaySnapshot[] = Array.from({ length: 10 }, (_, i) => ({ tMs: i, code: big + i }));
  const out = boundSnapshots(raw, { maxTotalBytes: 3500, maxSnapshots: 1000 });
  // ~1000 bytes each → at most ~3 fit; the LAST one must be retained.
  assert.ok(out.length <= 4);
  assert.equal(out[out.length - 1].code, big + 9);
});

test("sorts by time and normalizes", () => {
  const out = boundSnapshots([
    { tMs: 5, code: "b" },
    { tMs: 1, code: "a" },
  ]);
  assert.deepEqual(out.map((s) => s.code), ["a", "b"]);
});

test("ignores malformed entries", () => {
  const out = boundSnapshots([
    { tMs: 0, code: "a" },
    { tMs: NaN, code: "x" } as any,
    { tMs: 1, code: 123 as any },
    { tMs: 2, code: "b" },
  ]);
  assert.deepEqual(out.map((s) => s.code), ["a", "b"]);
});

test("empty input yields empty output", () => {
  assert.deepEqual(boundSnapshots([]), []);
});
