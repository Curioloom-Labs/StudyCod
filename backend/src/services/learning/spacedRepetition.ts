/**
 * Spaced-repetition scheduling for concept mastery (SM-2 variant).
 *
 * Each concept a learner practises carries a small review state. After every
 * practice we feed an outcome-derived grade (0..5) into the SM-2 update, which
 * stretches the interval when recall is strong and resets it when it is weak.
 * A concept is "mastered" once it has survived several spaced reviews.
 *
 * Pure + deterministic (time is passed in) — fully unit-testable. Persistence
 * of `ConceptReviewState` per (user, concept) is the wiring step.
 */
export interface ConceptReviewState {
  repetitions: number;   // consecutive successful reviews
  easeFactor: number;    // SM-2 ease factor (>= 1.3)
  intervalDays: number;  // current interval in days
  dueAtMs: number;       // when the concept is next due
  mastered: boolean;
}

export const MIN_EASE_FACTOR = 1.3;
export const DEFAULT_EASE_FACTOR = 2.5;
const MASTERY_REPETITIONS = 4;
const MASTERY_MIN_INTERVAL_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

export function initialConceptState(nowMs: number): ConceptReviewState {
  return {
    repetitions: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
    intervalDays: 0,
    dueAtMs: nowMs, // due immediately until first review
    mastered: false,
  };
}

/**
 * Map a practice outcome to an SM-2 grade in 0..5.
 *  - solved on first try, no hints      -> 5
 *  - solved with a couple of attempts    -> 4
 *  - solved but struggled / used hints   -> 3
 *  - not solved                          -> 0..2 by progress
 */
export function gradeFromOutcome(o: { solved: boolean; attempts: number; hintsUsed?: number; testsPassedRatio?: number }): number {
  const attempts = Math.max(1, Math.floor(o.attempts || 1));
  const hints = Math.max(0, Math.floor(o.hintsUsed || 0));
  if (o.solved) {
    if (attempts <= 1 && hints === 0) return 5;
    if (attempts <= 3 && hints <= 1) return 4;
    return 3;
  }
  const ratio = typeof o.testsPassedRatio === "number" ? Math.max(0, Math.min(1, o.testsPassedRatio)) : 0;
  if (ratio >= 0.5) return 2;
  if (ratio > 0) return 1;
  return 0;
}

/** Apply one SM-2 review with `grade` (0..5) at `nowMs`, returning the next state. */
export function reviewConcept(state: ConceptReviewState, grade: number, nowMs: number): ConceptReviewState {
  const q = Math.max(0, Math.min(5, Math.round(grade)));

  let { repetitions, easeFactor } = state;
  let intervalDays: number;

  if (q < 3) {
    // Failed recall — reset the repetition streak, see it again tomorrow.
    repetitions = 0;
    intervalDays = 1;
  } else {
    if (repetitions === 0) intervalDays = 1;
    else if (repetitions === 1) intervalDays = 6;
    else intervalDays = Math.round(state.intervalDays * easeFactor);
    repetitions += 1;
  }

  // SM-2 ease-factor update, floored at 1.3.
  easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (easeFactor < MIN_EASE_FACTOR) easeFactor = MIN_EASE_FACTOR;

  const mastered = repetitions >= MASTERY_REPETITIONS && intervalDays >= MASTERY_MIN_INTERVAL_DAYS;

  return {
    repetitions,
    easeFactor: Math.round(easeFactor * 1000) / 1000,
    intervalDays,
    dueAtMs: nowMs + intervalDays * DAY_MS,
    mastered,
  };
}

/** Concepts whose review is due at `nowMs`, soonest-overdue first. */
export function dueConcepts<T extends { state: ConceptReviewState }>(items: T[], nowMs: number): T[] {
  return items
    .filter((it) => !it.state.mastered && it.state.dueAtMs <= nowMs)
    .sort((a, b) => a.state.dueAtMs - b.state.dueAtMs);
}
