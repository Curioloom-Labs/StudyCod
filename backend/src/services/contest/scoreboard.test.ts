import test from "node:test";
import assert from "node:assert/strict";
import { computeScoreboard, type ScoreboardSubmission } from "./scoreboard";

const start = 1_000_000_000_000;
const min = (m: number) => start + m * 60_000;

test("ranks by solved desc then penalty asc", () => {
  const subs: ScoreboardSubmission[] = [
    { participantId: 1, problemId: 1, verdict: "AC", createdAtMs: min(10) },
    { participantId: 1, problemId: 2, verdict: "AC", createdAtMs: min(20) },
    { participantId: 2, problemId: 1, verdict: "AC", createdAtMs: min(5) },
  ];
  const { rows } = computeScoreboard(subs, { startMs: start, penaltyPerWrong: 20 });
  assert.equal(rows[0].participantId, 1); // 2 solved
  assert.equal(rows[0].solved, 2);
  assert.equal(rows[1].participantId, 2); // 1 solved
});

test("penalty = time + wrong tries * penaltyPerWrong", () => {
  const subs: ScoreboardSubmission[] = [
    { participantId: 1, problemId: 1, verdict: "WA", createdAtMs: min(3) },
    { participantId: 1, problemId: 1, verdict: "WA", createdAtMs: min(7) },
    { participantId: 1, problemId: 1, verdict: "AC", createdAtMs: min(12) },
  ];
  const { rows } = computeScoreboard(subs, { startMs: start, penaltyPerWrong: 20 });
  // 12 minutes + 2 wrong * 20 = 52
  assert.equal(rows[0].penalty, 52);
  assert.equal(rows[0].problems[1].tries, 3);
  assert.equal(rows[0].problems[1].solved, true);
});

test("wrong tries after AC do not count", () => {
  const subs: ScoreboardSubmission[] = [
    { participantId: 1, problemId: 1, verdict: "AC", createdAtMs: min(5) },
    { participantId: 1, problemId: 1, verdict: "WA", createdAtMs: min(9) },
  ];
  const { rows } = computeScoreboard(subs, { startMs: start, penaltyPerWrong: 20 });
  assert.equal(rows[0].penalty, 5); // only the AC time
  assert.equal(rows[0].problems[1].tries, 1);
});

test("unsolved problem adds no penalty but counts tries", () => {
  const subs: ScoreboardSubmission[] = [
    { participantId: 1, problemId: 1, verdict: "WA", createdAtMs: min(3) },
    { participantId: 1, problemId: 1, verdict: "TLE", createdAtMs: min(8) },
  ];
  const { rows } = computeScoreboard(subs, { startMs: start });
  assert.equal(rows[0].solved, 0);
  assert.equal(rows[0].penalty, 0);
  assert.equal(rows[0].problems[1].solved, false);
  assert.equal(rows[0].problems[1].tries, 2);
});

test("tie on solved+penalty broken by earliest last AC", () => {
  const subs: ScoreboardSubmission[] = [
    { participantId: 1, problemId: 1, verdict: "AC", createdAtMs: min(10) },
    { participantId: 2, problemId: 1, verdict: "AC", createdAtMs: min(8) },
  ];
  const { rows } = computeScoreboard(subs, { startMs: start });
  // same solved(1); penalties 10 vs 8 → participant 2 first
  assert.equal(rows[0].participantId, 2);
});
