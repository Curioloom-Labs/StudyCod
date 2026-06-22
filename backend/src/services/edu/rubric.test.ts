import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRubric, computeRubricTotal } from "./rubric";

test("normalizeRubric keeps valid criteria, drops junk and dupes", () => {
  const r = normalizeRubric([
    { id: "a", label: "Correctness", maxPoints: 50 },
    { id: "a", label: "dupe id", maxPoints: 10 },     // dropped (dup id)
    { id: "b", label: "  Style  ", maxPoints: 30 },   // trimmed
    { id: "c", label: "bad", maxPoints: 0 },          // dropped (<=0)
    { id: "", label: "no id", maxPoints: 10 },        // dropped
    { id: "d", label: "", maxPoints: 10 }             // dropped (no label)
  ]);
  assert.deepEqual(r, [
    { id: "a", label: "Correctness", maxPoints: 50 },
    { id: "b", label: "Style", maxPoints: 30 }
  ]);
});

test("normalizeRubric on non-array → []", () => {
  assert.deepEqual(normalizeRubric(null), []);
  assert.deepEqual(normalizeRubric("x"), []);
});

test("computeRubricTotal clamps per criterion and returns percent of max", () => {
  const rubric = [
    { id: "a", label: "A", maxPoints: 60 },
    { id: "b", label: "B", maxPoints: 40 }
  ];
  // 45/60 + 40/40 (clamped from 99) = 85/100 -> 85%
  const r = computeRubricTotal(rubric, { a: 45, b: 99 });
  assert.deepEqual(r, { raw: 85, max: 100, percent: 85 });
});

test("computeRubricTotal: missing/negative scores count as 0; empty rubric → 0%", () => {
  const rubric = [{ id: "a", label: "A", maxPoints: 50 }, { id: "b", label: "B", maxPoints: 50 }];
  assert.equal(computeRubricTotal(rubric, { a: -5 }).percent, 0);
  assert.equal(computeRubricTotal([], {}).percent, 0);
  assert.equal(computeRubricTotal(rubric, { a: 25, b: 25 }).percent, 50);
});
