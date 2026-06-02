import test from "node:test";
import assert from "node:assert/strict";
import { recommendDifficulty, shouldRecalibrate } from "./difficultyCalibration";

test("high solve rate with low effort => EASY", () => {
  const r = recommendDifficulty({ distinctUsers: 40, solvedUsers: 36, avgAttemptsToSolve: 1.4 });
  assert.equal(r.recommended, "EASY");
  assert.equal(r.recommendedScore, 2);
  assert.ok(r.confidence >= 0.9);
});

test("low solve rate => HARD", () => {
  const r = recommendDifficulty({ distinctUsers: 50, solvedUsers: 12, avgAttemptsToSolve: 6 });
  assert.equal(r.recommended, "HARD");
  assert.equal(r.recommendedScore, 4);
});

test("heavy effort despite medium pass rate => HARD", () => {
  const r = recommendDifficulty({ distinctUsers: 30, solvedUsers: 16, avgAttemptsToSolve: 4.5 });
  assert.equal(r.recommended, "HARD");
});

test("moderate stats => MEDIUM", () => {
  const r = recommendDifficulty({ distinctUsers: 30, solvedUsers: 18, avgAttemptsToSolve: 2.5 });
  assert.equal(r.recommended, "MEDIUM");
  assert.equal(r.recommendedScore, 3);
});

test("no data => MEDIUM with zero confidence", () => {
  const r = recommendDifficulty({ distinctUsers: 0, solvedUsers: 0 });
  assert.equal(r.recommended, "MEDIUM");
  assert.equal(r.confidence, 0);
  assert.equal(r.solveRate, 0);
});

test("confidence scales with sample size", () => {
  const small = recommendDifficulty({ distinctUsers: 3, solvedUsers: 3, avgAttemptsToSolve: 1 });
  const big = recommendDifficulty({ distinctUsers: 60, solvedUsers: 58, avgAttemptsToSolve: 1 });
  assert.ok(small.confidence < big.confidence);
  assert.ok(big.confidence <= 1);
});

test("solvedUsers is clamped to distinctUsers", () => {
  const r = recommendDifficulty({ distinctUsers: 10, solvedUsers: 999 });
  assert.ok(r.solveRate <= 1);
});

test("shouldRecalibrate respects confidence and difference", () => {
  const rec = recommendDifficulty({ distinctUsers: 40, solvedUsers: 10, avgAttemptsToSolve: 6 }); // HARD, conf high
  assert.equal(shouldRecalibrate("EASY", rec), true);
  assert.equal(shouldRecalibrate("HARD", rec), false); // same band
  const weak = recommendDifficulty({ distinctUsers: 2, solvedUsers: 0 }); // low confidence
  assert.equal(shouldRecalibrate("EASY", weak), false);
});
