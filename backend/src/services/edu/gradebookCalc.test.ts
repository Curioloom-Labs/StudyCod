import test from "node:test";
import assert from "node:assert/strict";
import { computeWeightedGrade, mapGradesToCategoryGrades, normalizeGradebookConfig, computeClassWeightedFinals } from "./gradebookCalc";

const config = {
  categories: [
    { id: "hw", weight: 20 },
    { id: "exam", weight: 50 },
    { id: "proj", weight: 30 }
  ]
};

test("weighted mean across categories", () => {
  // hw avg 80, exam avg 90, proj avg 70 → 0.2*80 + 0.5*90 + 0.3*70 = 16+45+21 = 82
  const r = computeWeightedGrade(config, [
    { categoryId: "hw", percent: 70 },
    { categoryId: "hw", percent: 90 },
    { categoryId: "exam", percent: 90 },
    { categoryId: "proj", percent: 70 }
  ]);
  assert.equal(r.final, 82);
});

test("drop-lowest removes the worst scores in a category", () => {
  const cfg = { categories: [{ id: "hw", weight: 100, dropLowest: 1 }] };
  // scores 50, 80, 90 → drop 50 → avg(80,90)=85
  const r = computeWeightedGrade(cfg, [
    { categoryId: "hw", percent: 50 },
    { categoryId: "hw", percent: 80 },
    { categoryId: "hw", percent: 90 }
  ]);
  assert.equal(r.final, 85);
});

test("empty categories are excluded and remaining weights renormalized", () => {
  // No exam/proj grades → only hw counts → final = hw average.
  const r = computeWeightedGrade(config, [
    { categoryId: "hw", percent: 60 },
    { categoryId: "hw", percent: 80 }
  ]);
  assert.equal(r.final, 70);
  const hw = r.categories.find((c) => c.categoryId === "hw")!;
  assert.equal(hw.normalizedWeight, 1, "single active category gets full weight");
});

test("partial categories renormalize between the active ones", () => {
  // Only hw(20) and exam(50) have grades → weights renormalize to 20/70 and 50/70.
  // hw=100, exam=30 → (20/70)*100 + (50/70)*30 = 28.57 + 21.43 = 50
  const r = computeWeightedGrade(config, [
    { categoryId: "hw", percent: 100 },
    { categoryId: "exam", percent: 30 }
  ]);
  assert.equal(r.final, 50);
});

test("no grades at all → final is null", () => {
  const r = computeWeightedGrade(config, []);
  assert.equal(r.final, null);
});

test("unknown category ids are ignored", () => {
  const r = computeWeightedGrade(config, [
    { categoryId: "hw", percent: 80 },
    { categoryId: "ghost", percent: 0 }
  ]);
  assert.equal(r.final, 80);
});

test("percents are clamped to 0..100", () => {
  const cfg = { categories: [{ id: "x", weight: 1 }] };
  assert.equal(computeWeightedGrade(cfg, [{ categoryId: "x", percent: 150 }]).final, 100);
  assert.equal(computeWeightedGrade(cfg, [{ categoryId: "x", percent: -20 }]).final, 0);
});

test("dropLowest >= count empties the category", () => {
  const cfg = { categories: [{ id: "a", weight: 50, dropLowest: 5 }, { id: "b", weight: 50 }] };
  const r = computeWeightedGrade(cfg, [
    { categoryId: "a", percent: 90 },
    { categoryId: "b", percent: 60 }
  ]);
  // a fully dropped → only b counts → 60
  assert.equal(r.final, 60);
});

test("mapGradesToCategoryGrades drops rows without a category or score, then feeds the calculator", () => {
  const mapped = mapGradesToCategoryGrades([
    { categoryId: "hw", total: 80 },
    { categoryId: "hw", total: 100 },
    { categoryId: null, total: 50 }, // no category → dropped
    { categoryId: "exam", total: null }, // no score → dropped
    { categoryId: "exam", total: 90 }
  ]);
  assert.equal(mapped.length, 3);
  // hw avg 90 (weight 20), exam avg 90 (weight 50), proj empty → renormalize hw+exam
  // (20/70)*90 + (50/70)*90 = 90
  const r = computeWeightedGrade(config, mapped);
  assert.equal(r.final, 90);
});

test("computeClassWeightedFinals groups rows per student and includes ungraded students", () => {
  const finals = computeClassWeightedFinals(
    config,
    [
      // student 1: hw avg 90, exam 90, proj empty → renormalize → 90
      { studentId: 1, categoryId: "hw", total: 80 },
      { studentId: 1, categoryId: "hw", total: 100 },
      { studentId: 1, categoryId: "exam", total: 90 },
      // student 2: only an exam → final is that exam (single active category)
      { studentId: 2, categoryId: "exam", total: 70 },
      // stray row for a student not on the roster → ignored by studentIds projection
      { studentId: 99, categoryId: "exam", total: 10 }
    ],
    [1, 2, 3] // student 3 has no grades
  );
  assert.equal(finals.length, 3, "one entry per requested student");
  assert.equal(finals.find(f => f.studentId === 1)!.final, 90);
  assert.equal(finals.find(f => f.studentId === 2)!.final, 70);
  assert.equal(finals.find(f => f.studentId === 3)!.final, null, "ungraded student → null, still listed");
});

test("normalizeGradebookConfig validates ids and weights", () => {
  assert.ok(normalizeGradebookConfig({ categories: [{ id: "a", weight: 50 }, { id: "b", weight: 50, dropLowest: 2 }] }));
  assert.equal(normalizeGradebookConfig({ categories: [{ id: "a", weight: 50 }, { id: "a", weight: 50 }] }), null, "duplicate id");
  assert.equal(normalizeGradebookConfig({ categories: [{ id: "", weight: 1 }] }), null, "empty id");
  assert.equal(normalizeGradebookConfig({ categories: [{ id: "a", weight: 0 }] }), null, "non-positive weight");
  assert.equal(normalizeGradebookConfig({ categories: [] }), null, "no categories");
  assert.equal(normalizeGradebookConfig(null), null);
});
