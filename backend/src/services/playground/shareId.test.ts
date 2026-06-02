import test from "node:test";
import assert from "node:assert/strict";
import { generateShareId, isValidShareId } from "./shareId";

test("generates valid, URL-safe ids of requested length", () => {
  const id = generateShareId();
  assert.ok(isValidShareId(id));
  assert.equal(id.length, 12);
  assert.match(id, /^[A-Za-z0-9]+$/);
});

test("respects clamped length bounds", () => {
  assert.equal(generateShareId(2).length, 6); // clamped up
  assert.equal(generateShareId(100).length, 32); // clamped down
});

test("ids are practically unique across many draws", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateShareId());
  assert.equal(seen.size, 1000);
});

test("isValidShareId rejects bad input", () => {
  assert.equal(isValidShareId(""), false);
  assert.equal(isValidShareId("short"), false); // < 6
  assert.equal(isValidShareId("has space"), false);
  assert.equal(isValidShareId("a".repeat(33)), false); // > 32
  assert.equal(isValidShareId(123 as any), false);
  assert.equal(isValidShareId("ok_id-123"), true);
});
