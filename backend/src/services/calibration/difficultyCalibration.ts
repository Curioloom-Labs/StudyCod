/**
 * Empirical difficulty calibration.
 *
 * Authors guess a task's difficulty up front; real submission data is the
 * ground truth. This module turns aggregate stats (how many distinct learners
 * tried it, how many solved it, how many attempts it took) into a recommended
 * difficulty, plus a confidence that scales with sample size so we never
 * re-label a task off two data points.
 *
 * Pure + deterministic — no DB, no AI — so it is fully unit-testable. A thin
 * service aggregates the stats and a route surfaces the suggestion.
 */
export type DifficultyBand = "EASY" | "MEDIUM" | "HARD";

export interface TaskAttemptStats {
  /** Distinct learners who made at least one submission. */
  distinctUsers: number;
  /** Distinct learners who reached an accepted (AC) submission. */
  solvedUsers: number;
  /** Mean submissions-to-first-AC among solvers (>= 1). Optional. */
  avgAttemptsToSolve?: number;
}

export interface DifficultyRecommendation {
  recommended: DifficultyBand;
  /** 1..5 scale mirror for personal-task difficulty. */
  recommendedScore: number;
  /** Solve rate in [0,1]. */
  solveRate: number;
  /** 0..1 — how much to trust this, scaled by sample size. */
  confidence: number;
  rationale: string;
}

const MIN_SAMPLE_FOR_FULL_CONFIDENCE = 30;

function bandToScore(band: DifficultyBand): number {
  return band === "EASY" ? 2 : band === "MEDIUM" ? 3 : 4;
}

/**
 * Compute a difficulty recommendation from attempt stats.
 *
 * Heuristic (validated by the tests):
 *  - solveRate >= 0.80 and easy effort  -> EASY
 *  - solveRate <= 0.35 or heavy effort  -> HARD
 *  - otherwise                          -> MEDIUM
 * "Effort" nudges the band using avgAttemptsToSolve when available.
 */
export function recommendDifficulty(stats: TaskAttemptStats): DifficultyRecommendation {
  const distinctUsers = Math.max(0, Math.floor(stats.distinctUsers));
  const solvedUsers = Math.max(0, Math.min(distinctUsers, Math.floor(stats.solvedUsers)));
  const solveRate = distinctUsers > 0 ? solvedUsers / distinctUsers : 0;
  const avgAttempts = typeof stats.avgAttemptsToSolve === "number" && Number.isFinite(stats.avgAttemptsToSolve)
    ? Math.max(1, stats.avgAttemptsToSolve)
    : null;

  // Confidence grows with sample size, capped at 1. Below ~5 users it is weak.
  const confidence = distinctUsers <= 0
    ? 0
    : Math.max(0, Math.min(1, distinctUsers / MIN_SAMPLE_FOR_FULL_CONFIDENCE));

  let band: DifficultyBand;
  if (distinctUsers === 0) {
    band = "MEDIUM";
  } else if (solveRate >= 0.8 && (avgAttempts === null || avgAttempts <= 2)) {
    band = "EASY";
  } else if (solveRate <= 0.35 || (avgAttempts !== null && avgAttempts >= 5)) {
    band = "HARD";
  } else {
    band = "MEDIUM";
  }

  // A very high attempt count among an otherwise-medium pass rate bumps up.
  if (band === "MEDIUM" && avgAttempts !== null && avgAttempts >= 4 && solveRate < 0.6) {
    band = "HARD";
  }
  // A trivial solve with almost no failures bumps down even at medium rate.
  if (band === "MEDIUM" && solveRate >= 0.9 && avgAttempts !== null && avgAttempts <= 1.5) {
    band = "EASY";
  }

  const rationale = distinctUsers === 0
    ? "Недостатньо даних — залишено MEDIUM за замовчуванням."
    : `solveRate=${(solveRate * 100).toFixed(0)}% серед ${distinctUsers} учнів` +
      (avgAttempts !== null ? `, середньо ${avgAttempts.toFixed(1)} спроб до AC` : "") +
      `; рекомендовано ${band}.`;

  return {
    recommended: band,
    recommendedScore: bandToScore(band),
    solveRate,
    confidence,
    rationale,
  };
}

/**
 * Should we actually act on the suggestion? Only when it is confident enough
 * AND meaningfully different from the current label.
 */
export function shouldRecalibrate(
  current: DifficultyBand | null | undefined,
  rec: DifficultyRecommendation,
  minConfidence = 0.5
): boolean {
  if (rec.confidence < minConfidence) return false;
  if (!current) return true;
  return current !== rec.recommended;
}
