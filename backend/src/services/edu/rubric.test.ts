import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRubric, computeRubricTotal, validateRubricDefinition, validateRubricScores } from "./rubric";

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

test("rubric write rejects malformed, duplicate, excessive and reserved criteria without dropping them", () => {
  const valid = { id: "a", label: "A", maxPoints: 10 };
  for (const raw of [null, {}, [valid, { ...valid }], [valid, { id: "b", label: "", maxPoints: 10 }], [{ ...valid, maxPoints: 1.5 }], [{ ...valid, maxPoints: "10" }], [{ ...valid, id: "__proto__" }], Array.from({ length: 31 }, (_, i) => ({ ...valid, id: String(i) }))]) assert.equal(validateRubricDefinition(raw), null);
  assert.deepEqual(validateRubricDefinition([{ ...valid, label: " A " }]), [valid]);
  assert.deepEqual(validateRubricDefinition([]), []);
});

test("rubric write requires exactly every criterion and finite scores within its individual limit", () => {
  const rubric = [{ id: "a", label: "A", maxPoints: 10 }, { id: "b", label: "B", maxPoints: 20 }];
  for (const scores of [{}, { a: 5 }, { a: 5, b: 10, other: 1 }, { a: 11, b: 10 }, { a: -1, b: 10 }, { a: NaN, b: 10 }, { a: Infinity, b: 10 }, { a: "5", b: 10 }]) assert.equal(validateRubricScores(rubric, scores), false);
  assert.equal(validateRubricScores(rubric, { a: 0, b: 0 }), true);
  assert.equal(validateRubricScores(rubric, { a: 0.5, b: 20 }), true);
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
