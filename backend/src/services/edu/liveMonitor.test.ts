import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveSnapshot, type LiveStudent, type LiveAttempt } from "./liveMonitor";

const students: LiveStudent[] = [
  { studentId: 1, name: "Anna" },
  { studentId: 2, name: "Borys" },
  { studentId: 3, name: "Vira" },
  { studentId: 4, name: "Hlib" },
];

test("classifies not_started / passed / in_progress / stuck", () => {
  const now = 10 * 60_000;
  const attempts: LiveAttempt[] = [
    { studentId: 1, verdict: "AC", testsPassed: 10, testsTotal: 10, updatedAtMs: now - 60_000 },
    { studentId: 2, verdict: "WA", testsPassed: 3, testsTotal: 10, updatedAtMs: now - 30_000 }, // recent → in_progress
    { studentId: 3, verdict: "WA", testsPassed: 1, testsTotal: 10, updatedAtMs: now - 8 * 60_000 }, // stale → stuck
    // student 4 has no attempt → not_started
  ];
  const snap = buildLiveSnapshot(students, attempts, now);

  assert.deepEqual(snap.totals, { not_started: 1, in_progress: 1, stuck: 1, passed: 1 });
  const byId = new Map(snap.students.map((s) => [s.studentId, s]));
  assert.equal(byId.get(1)!.status, "passed");
  assert.equal(byId.get(2)!.status, "in_progress");
  assert.equal(byId.get(3)!.status, "stuck");
  assert.equal(byId.get(4)!.status, "not_started");
});

test("uses the latest attempt per student", () => {
  const now = 100_000;
  const attempts: LiveAttempt[] = [
    { studentId: 1, verdict: "WA", updatedAtMs: now - 50_000 },
    { studentId: 1, verdict: "AC", updatedAtMs: now - 10_000 }, // newer wins
  ];
  const snap = buildLiveSnapshot([students[0]], attempts, now);
  assert.equal(snap.students[0].status, "passed");
  assert.equal(snap.students[0].lastVerdict, "AC");
});

test("sorts attention-needed first (stuck, then in_progress, then not_started, then passed)", () => {
  const now = 10 * 60_000;
  const attempts: LiveAttempt[] = [
    { studentId: 1, verdict: "AC", updatedAtMs: now - 1000 },
    { studentId: 2, verdict: "WA", updatedAtMs: now - 1000 },
    { studentId: 3, verdict: "WA", updatedAtMs: now - 9 * 60_000 },
  ];
  const snap = buildLiveSnapshot(students, attempts, now);
  assert.deepEqual(
    snap.students.map((s) => s.status),
    ["stuck", "in_progress", "not_started", "passed"]
  );
});
