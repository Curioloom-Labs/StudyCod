import test from "node:test";
import assert from "node:assert/strict";
import { computeThematicGrade, validateThematicFormula, resolveThematicFormula } from "./thematicFormula";

test("default thematic: both present uses 0.7*control + 0.3*practice", () => {
  // 0.7*80 + 0.3*60 = 56 + 18 = 74
  const grade = computeThematicGrade({ practice: 60, control: 80, hasPractice: true, hasControl: true });
  assert.equal(grade, 74);
});

test("default thematic: only control returns control", () => {
  const grade = computeThematicGrade({ practice: 0, control: 88, hasPractice: false, hasControl: true });
  assert.equal(grade, 88);
});

test("default thematic: only practice returns practice", () => {
  const grade = computeThematicGrade({ practice: 73, control: 0, hasPractice: true, hasControl: false });
  assert.equal(grade, 73);
});

test("default thematic: neither returns 0", () => {
  const grade = computeThematicGrade({ practice: 0, control: 0, hasPractice: false, hasControl: false });
  assert.equal(grade, 0);
});

test("custom formula: equal weights", () => {
  // 0.5*90 + 0.5*70 = 80
  const grade = computeThematicGrade(
    { practice: 70, control: 90, hasPractice: true, hasControl: true },
    "0.5*control + 0.5*practice"
  );
  assert.equal(grade, 80);
});

test("custom formula: avg(practice) alias", () => {
  const grade = computeThematicGrade(
    { practice: 64, control: 0, hasPractice: true, hasControl: false },
    "avg(practice)"
  );
  assert.equal(grade, 64);
});

test("custom formula: result clamped to 0..100", () => {
  const grade = computeThematicGrade(
    { practice: 90, control: 90, hasPractice: true, hasControl: true },
    "control + practice"
  );
  assert.equal(grade, 100);
});

test("malformed formula falls back to default", () => {
  const grade = computeThematicGrade(
    { practice: 60, control: 80, hasPractice: true, hasControl: true },
    "control + + practice )"
  );
  assert.equal(grade, 74);
});

test("validateThematicFormula accepts empty and valid, rejects garbage", () => {
  assert.equal(validateThematicFormula(""), true);
  assert.equal(validateThematicFormula(null), true);
  assert.equal(validateThematicFormula("0.7*control + 0.3*practice"), true);
  assert.equal(validateThematicFormula("avg(practice)"), true);
  assert.equal(validateThematicFormula("control + "), false);
  assert.equal(validateThematicFormula("control $ practice"), false);
});

test("resolveThematicFormula precedence: topic > class > null", () => {
  assert.equal(resolveThematicFormula("topicF", "classF"), "topicF");
  assert.equal(resolveThematicFormula(null, "classF"), "classF");
  assert.equal(resolveThematicFormula("  ", "classF"), "classF");
  assert.equal(resolveThematicFormula(null, null), null);
  assert.equal(resolveThematicFormula("", ""), null);
});
