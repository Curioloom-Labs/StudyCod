/**
 * Integrity scoring from lightweight client-side proctoring signals.
 *
 * The editor reports privacy-respecting behavioural signals (NOT keystrokes or
 * screen capture): how much was pasted, the largest single paste, how often
 * focus left the tab, and timing. This module turns those into a 0..100
 * integrity score (100 = clean) plus human-readable flags for a teacher to
 * review. It deliberately never makes an accusation — it surfaces evidence.
 *
 * Pure + deterministic — fully unit-testable.
 */
export interface ProctoringSignals {
  /** Total characters pasted into the editor across the session. */
  totalPastedChars?: number;
  /** Largest single paste in characters. */
  largestPasteChars?: number;
  /** Number of paste events. */
  pasteCount?: number;
  /** Times the editor/tab lost focus (possible context switch / lookup). */
  blurCount?: number;
  /** Wall-clock duration of the solve in ms. */
  solveDurationMs?: number;
  /** Characters the learner actually typed (optional, improves accuracy). */
  typedChars?: number;
  /** Final submitted code length in characters. */
  finalCodeLength: number;
}

export type IntegrityLevel = "clean" | "review" | "suspicious";

export interface IntegrityResult {
  score: number; // 0..100, higher = cleaner
  level: IntegrityLevel;
  flags: string[];
}

function clampInt(v: unknown, fallback = 0): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function computeIntegrityScore(signals: ProctoringSignals): IntegrityResult {
  const finalLen = Math.max(1, clampInt(signals.finalCodeLength, 1));
  const totalPasted = clampInt(signals.totalPastedChars);
  const largestPaste = clampInt(signals.largestPasteChars);
  const pasteCount = clampInt(signals.pasteCount);
  const blurCount = clampInt(signals.blurCount);
  const solveMs = clampInt(signals.solveDurationMs);
  const typedChars = signals.typedChars == null ? null : clampInt(signals.typedChars);

  let score = 100;
  const flags: string[] = [];

  // 1) A single large paste that accounts for most of the final code is the
  //    strongest signal of a pasted-in solution.
  const largestPasteRatio = largestPaste / finalLen;
  if (largestPasteRatio >= 0.6 && largestPaste >= 200) {
    score -= 45;
    flags.push(`single_large_paste:${Math.round(largestPasteRatio * 100)}%`);
  } else if (largestPasteRatio >= 0.35 && largestPaste >= 120) {
    score -= 20;
    flags.push(`large_paste:${Math.round(largestPasteRatio * 100)}%`);
  }

  // 2) Most of the final code never typed (typed-to-final ratio low).
  if (typedChars !== null) {
    const typedRatio = typedChars / finalLen;
    if (typedRatio < 0.25 && finalLen >= 200) {
      score -= 30;
      flags.push(`low_typed_ratio:${Math.round(typedRatio * 100)}%`);
    } else if (typedRatio < 0.5 && finalLen >= 200) {
      score -= 12;
      flags.push(`moderate_typed_ratio:${Math.round(typedRatio * 100)}%`);
    }
  }

  // 3) Frequent focus loss (tab switching / lookups).
  if (blurCount >= 8) {
    score -= 18;
    flags.push(`frequent_focus_loss:${blurCount}`);
  } else if (blurCount >= 4) {
    score -= 8;
    flags.push(`focus_loss:${blurCount}`);
  }

  // 4) Implausibly fast for the amount of code (e.g. < 1.5s per 100 chars).
  if (solveMs > 0 && finalLen >= 200) {
    const msPer100 = (solveMs / finalLen) * 100;
    if (msPer100 < 1500) {
      score -= 25;
      flags.push(`implausibly_fast:${Math.round(msPer100)}ms/100ch`);
    }
  }

  // 5) Many paste events overall.
  if (pasteCount >= 6 && totalPasted >= finalLen * 0.7) {
    score -= 10;
    flags.push(`many_pastes:${pasteCount}`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: IntegrityLevel = score >= 75 ? "clean" : score >= 45 ? "review" : "suspicious";
  return { score, level, flags };
}
