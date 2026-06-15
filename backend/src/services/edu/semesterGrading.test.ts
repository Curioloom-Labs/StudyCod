import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSemester, DEFAULT_SEMESTER } from "./semesterGrading";

// normalizeSemester encodes a correctness-critical rule: topics without an
// explicit (or with an invalid) semester must aggregate into semester 1, so an
// existing class still gets a single sensible semester aggregate. A regression
// here would silently scatter or drop grades across phantom semesters.

test("DEFAULT_SEMESTER is 1", () => {
  assert.equal(DEFAULT_SEMESTER, 1);
});

test("normalizeSemester floors valid positive values", () => {
  assert.equal(normalizeSemester(1), 1);
  assert.equal(normalizeSemester(2), 2);
  assert.equal(normalizeSemester(2.9), 2);
  assert.equal(normalizeSemester("3"), 3);
});

test("normalizeSemester coerces null/invalid/<1 to the default semester", () => {
  assert.equal(normalizeSemester(null), DEFAULT_SEMESTER);
  assert.equal(normalizeSemester(undefined), DEFAULT_SEMESTER);
  assert.equal(normalizeSemester(0), DEFAULT_SEMESTER);
  assert.equal(normalizeSemester(-5), DEFAULT_SEMESTER);
  assert.equal(normalizeSemester("nonsense"), DEFAULT_SEMESTER);
  assert.equal(normalizeSemester(Number.NaN), DEFAULT_SEMESTER);
});
