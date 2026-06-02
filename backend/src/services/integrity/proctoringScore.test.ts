import test from "node:test";
import assert from "node:assert/strict";
import { computeIntegrityScore } from "./proctoringScore";

test("clean session scores high with no flags", () => {
  const r = computeIntegrityScore({
    finalCodeLength: 600,
    typedChars: 580,
    totalPastedChars: 0,
    largestPasteChars: 0,
    pasteCount: 0,
    blurCount: 1,
    solveDurationMs: 8 * 60_000,
  });
  assert.equal(r.level, "clean");
  assert.ok(r.score >= 90);
  assert.equal(r.flags.length, 0);
});

test("single large paste of the whole solution is flagged suspicious", () => {
  const r = computeIntegrityScore({
    finalCodeLength: 800,
    typedChars: 20,
    totalPastedChars: 780,
    largestPasteChars: 780,
    pasteCount: 1,
    blurCount: 3,
    solveDurationMs: 30_000,
  });
  assert.ok(r.flags.some((f) => f.startsWith("single_large_paste")));
  assert.equal(r.level, "suspicious");
  assert.ok(r.score < 45);
});

test("frequent focus loss reduces score", () => {
  const base = computeIntegrityScore({ finalCodeLength: 400, typedChars: 390, blurCount: 0, solveDurationMs: 300000 });
  const switched = computeIntegrityScore({ finalCodeLength: 400, typedChars: 390, blurCount: 10, solveDurationMs: 300000 });
  assert.ok(switched.score < base.score);
  assert.ok(switched.flags.some((f) => f.startsWith("frequent_focus_loss")));
});

test("implausibly fast large solve is flagged", () => {
  const r = computeIntegrityScore({
    finalCodeLength: 1000,
    typedChars: 1000,
    solveDurationMs: 2000, // 1000 chars in 2s
    blurCount: 0,
  });
  assert.ok(r.flags.some((f) => f.startsWith("implausibly_fast")));
});

test("score is clamped to 0..100", () => {
  const worst = computeIntegrityScore({
    finalCodeLength: 1000,
    typedChars: 0,
    totalPastedChars: 1000,
    largestPasteChars: 1000,
    pasteCount: 9,
    blurCount: 20,
    solveDurationMs: 500,
  });
  assert.ok(worst.score >= 0 && worst.score <= 100);
  assert.equal(worst.level, "suspicious");
});

test("short snippets are not penalized for fast/paste heuristics", () => {
  const r = computeIntegrityScore({
    finalCodeLength: 60,
    typedChars: 10,
    largestPasteChars: 50,
    solveDurationMs: 300,
    blurCount: 0,
  });
  // finalLen < 200 guards keep the strong deductions from firing.
  assert.ok(r.score >= 75);
});
