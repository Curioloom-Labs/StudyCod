import test from "node:test";
import assert from "node:assert/strict";
import { formatGradeForSystem, convertGradeToRaw100 } from "./gradingScale";

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
