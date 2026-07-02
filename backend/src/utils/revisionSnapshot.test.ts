import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSnapshot, parseSnapshot, isCompressedSnapshot } from "./revisionSnapshot";

test("round-trips a large snapshot and actually compresses it", () => {
  const big = {
    task: { id: 249, title: "T" },
    theory: "x".repeat(2000),
    tests: Array.from({ length: 500 }, (_, i) => ({ input: `${i}\n`.repeat(50), expected_output: `${i}\n`.repeat(50) })),
  };
  const encoded = encodeSnapshot(big);
  assert.equal(isCompressedSnapshot(encoded), true, "large payload should be compressed");
  assert.ok(encoded.length < JSON.stringify(big).length, "compressed form must be smaller");
  assert.deepEqual(parseSnapshot(encoded), big, "round-trip must be lossless");
});

test("small snapshots stay plain JSON (no base64 overhead)", () => {
  const small = { task: { id: 1 }, tests: [], theory: "" };
  const encoded = encodeSnapshot(small);
  assert.equal(isCompressedSnapshot(encoded), false);
  assert.deepEqual(parseSnapshot(encoded), small);
});

test("parseSnapshot reads legacy plain-JSON rows unchanged", () => {
  const legacy = JSON.stringify({ task: { id: 7 }, tests: [{ input: "1", expected_output: "2" }], theory: "t" });
  assert.equal(isCompressedSnapshot(legacy), false);
  assert.deepEqual(parseSnapshot(legacy), JSON.parse(legacy));
});

test("parseSnapshot tolerates null/undefined", () => {
  assert.equal(parseSnapshot(null), null);
  assert.equal(parseSnapshot(undefined), null);
});
