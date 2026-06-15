import test from "node:test";
import assert from "node:assert/strict";
import {
  formatGradeForSystem,
  convertGradeToRaw100,
  shouldConvertLegacyGrades,
  normalizeScaleMode
} from "./gradingScale";

test("PERCENT_100 formats as score/100", () => {
  assert.equal(formatGradeForSystem(83, "PERCENT_100"), "83/100");
  assert.equal(formatGradeForSystem(null, "PERCENT_100"), "-");
});

test("LINEAR 12-point never shows 0 for a positive score", () => {
  // 3% would round to 0 under naive round(pct/100*12); must floor to 1.
  assert.equal(formatGradeForSystem(3, "POINTS_12", "LINEAR"), "1/12");
  assert.equal(formatGradeForSystem(0, "POINTS_12", "LINEAR"), "0/12");
  assert.equal(formatGradeForSystem(100, "POINTS_12", "LINEAR"), "12/12");
});

test("LINEAR 10-point never shows 0 for a positive score", () => {
  assert.equal(formatGradeForSystem(4, "POINTS_10", "LINEAR"), "1/10");
  assert.equal(formatGradeForSystem(0, "POINTS_10", "LINEAR"), "0/10");
});

test("MON 12-point uses official bands", () => {
  assert.equal(formatGradeForSystem(100, "POINTS_12", "MON"), "12/12");
  assert.equal(formatGradeForSystem(98, "POINTS_12", "MON"), "12/12");
  assert.equal(formatGradeForSystem(97, "POINTS_12", "MON"), "11/12");
  assert.equal(formatGradeForSystem(90, "POINTS_12", "MON"), "10/12");
  assert.equal(formatGradeForSystem(74, "POINTS_12", "MON"), "8/12");
  assert.equal(formatGradeForSystem(55, "POINTS_12", "MON"), "6/12");
  assert.equal(formatGradeForSystem(9, "POINTS_12", "MON"), "1/12");
  assert.equal(formatGradeForSystem(1, "POINTS_12", "MON"), "1/12");
  assert.equal(formatGradeForSystem(0, "POINTS_12", "MON"), "0/12");
});

test("MON 12-point round-trips points -> percent -> points", () => {
  for (let point = 0; point <= 12; point++) {
    const raw = convertGradeToRaw100(point, "POINTS_12", "MON");
    const back = formatGradeForSystem(raw, "POINTS_12", "MON");
    assert.equal(back, `${point}/12`, `point ${point} round-trip via raw ${raw}`);
  }
});

test("convertGradeToRaw100 maps legacy point values up to percent", () => {
  assert.equal(convertGradeToRaw100(6, "POINTS_12", "LINEAR"), 50);
  assert.equal(convertGradeToRaw100(12, "POINTS_12", "LINEAR"), 100);
  assert.equal(convertGradeToRaw100(5, "POINTS_10", "LINEAR"), 50);
  // Letter systems already stored as raw-100 → identity.
  assert.equal(convertGradeToRaw100(95, "LETTER_AF"), 95);
});

test("letter / ECTS systems at their band boundaries", () => {
  assert.equal(formatGradeForSystem(90, "LETTER_AF"), "A");
  assert.equal(formatGradeForSystem(89, "LETTER_AF"), "B");
  assert.equal(formatGradeForSystem(60, "LETTER_AF"), "D");
  assert.equal(formatGradeForSystem(59, "LETTER_AF"), "F");

  assert.equal(formatGradeForSystem(90, "ECTS_AF"), "A");
  assert.equal(formatGradeForSystem(64, "ECTS_AF"), "D");
  assert.equal(formatGradeForSystem(63, "ECTS_AF"), "E");
  assert.equal(formatGradeForSystem(60, "ECTS_AF"), "E");
  assert.equal(formatGradeForSystem(59, "ECTS_AF"), "F");
});

test("GPA_4 formatting trims trailing zeros", () => {
  assert.equal(formatGradeForSystem(100, "GPA_4"), "4/4.0");
  assert.equal(formatGradeForSystem(90, "GPA_4"), "3.6/4.0");
  assert.equal(formatGradeForSystem(88, "GPA_4"), "3.52/4.0");
});

test("formatGradeForSystem rejects junk and clamps out-of-range", () => {
  assert.equal(formatGradeForSystem(undefined, "PERCENT_100"), "-");
  assert.equal(formatGradeForSystem(Number.NaN, "PERCENT_100"), "-");
  assert.equal(formatGradeForSystem(150, "PERCENT_100"), "100/100");
  assert.equal(formatGradeForSystem(-20, "PERCENT_100"), "0/100");
});

test("convertGradeToRaw100: GPA, percent clamp and NaN", () => {
  assert.equal(convertGradeToRaw100(2, "GPA_4"), 50);
  assert.equal(convertGradeToRaw100(4, "GPA_4"), 100);
  assert.equal(convertGradeToRaw100(105, "PERCENT_100"), 100);
  assert.equal(convertGradeToRaw100(Number.NaN, "PERCENT_100"), 0);
});

test("normalizeScaleMode defaults to LINEAR for anything but MON", () => {
  assert.equal(normalizeScaleMode("MON"), "MON");
  assert.equal(normalizeScaleMode("LINEAR"), "LINEAR");
  assert.equal(normalizeScaleMode("nonsense"), "LINEAR");
  assert.equal(normalizeScaleMode(undefined), "LINEAR");
});

test("shouldConvertLegacyGrades detects old-scale storage", () => {
  // Non-numeric systems are never bulk-converted.
  assert.equal(shouldConvertLegacyGrades([1, 2, 3], "PERCENT_100"), false);
  assert.equal(shouldConvertLegacyGrades([1, 2, 3], "LETTER_AF"), false);

  assert.equal(shouldConvertLegacyGrades([10, 11, 12], "POINTS_12"), true); // all within scale
  assert.equal(shouldConvertLegacyGrades([85, 90, 12], "POINTS_12"), false); // mostly raw-100
  assert.equal(shouldConvertLegacyGrades([], "POINTS_12"), false); // no data
  assert.equal(shouldConvertLegacyGrades([10, 11, 12, 11, 90, 11, 11], "POINTS_12"), true); // >=85% within scale
});
