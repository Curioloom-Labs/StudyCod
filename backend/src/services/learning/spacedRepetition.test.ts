import test from "node:test";
import assert from "node:assert/strict";
import {
  initialConceptState,
  gradeFromOutcome,
  reviewConcept,
  dueConcepts,
  MIN_EASE_FACTOR,
} from "./spacedRepetition";

const DAY = 24 * 60 * 60 * 1000;

test("gradeFromOutcome maps outcomes to 0..5", () => {
  assert.equal(gradeFromOutcome({ solved: true, attempts: 1 }), 5);
  assert.equal(gradeFromOutcome({ solved: true, attempts: 2, hintsUsed: 1 }), 4);
  assert.equal(gradeFromOutcome({ solved: true, attempts: 7, hintsUsed: 3 }), 3);
  assert.equal(gradeFromOutcome({ solved: false, attempts: 3, testsPassedRatio: 0.6 }), 2);
  assert.equal(gradeFromOutcome({ solved: false, attempts: 1, testsPassedRatio: 0.1 }), 1);
  assert.equal(gradeFromOutcome({ solved: false, attempts: 1, testsPassedRatio: 0 }), 0);
});

test("successful reviews stretch the interval; first two are 1 and 6 days", () => {
  const now = 1_000_000;
  let s = initialConceptState(now);
  s = reviewConcept(s, 5, now);
  assert.equal(s.intervalDays, 1);
  assert.equal(s.repetitions, 1);

  s = reviewConcept(s, 5, now);
  assert.equal(s.intervalDays, 6);
  assert.equal(s.repetitions, 2);

  s = reviewConcept(s, 5, now);
  assert.ok(s.intervalDays > 6); // interval * easeFactor
  assert.equal(s.dueAtMs, now + s.intervalDays * DAY);
});

test("a failed recall resets the streak and schedules tomorrow", () => {
  const now = 5_000_000;
  let s = initialConceptState(now);
  s = reviewConcept(s, 5, now);
  s = reviewConcept(s, 5, now);
  s = reviewConcept(s, 2, now); // fail
  assert.equal(s.repetitions, 0);
  assert.equal(s.intervalDays, 1);
});

test("ease factor never drops below the floor", () => {
  const now = 0;
  let s = initialConceptState(now);
  for (let i = 0; i < 10; i++) s = reviewConcept(s, 0, now);
  assert.ok(s.easeFactor >= MIN_EASE_FACTOR);
});

test("concept becomes mastered after several strong spaced reviews", () => {
  let now = 0;
  let s = initialConceptState(now);
  for (let i = 0; i < 6; i++) {
    s = reviewConcept(s, 5, now);
    now = s.dueAtMs; // simulate reviewing exactly when due
  }
  assert.equal(s.mastered, true);
});

test("dueConcepts returns only non-mastered due items, soonest first", () => {
  const now = 10 * DAY;
  const items = [
    { id: "a", state: { ...initialConceptState(now - 3 * DAY) } },
    { id: "b", state: { ...initialConceptState(now - 1 * DAY) } },
    { id: "c", state: { repetitions: 5, easeFactor: 2.5, intervalDays: 30, dueAtMs: now - DAY, mastered: true } },
    { id: "d", state: { repetitions: 1, easeFactor: 2.5, intervalDays: 6, dueAtMs: now + 5 * DAY, mastered: false } },
  ];
  const due = dueConcepts(items, now);
  assert.deepEqual(due.map((x) => x.id), ["a", "b"]); // c mastered, d not yet due
});
