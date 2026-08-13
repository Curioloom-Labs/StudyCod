import type { JudgeLanguage } from "./types";

export const MIN_JUDGE_MEMORY_MB = 32;
export const MAX_JUDGE_MEMORY_MB = 512;
export const MAX_JUDGE_CSHARP_MEMORY_MB = 1024;

export function maxJudgeMemoryMb(language: JudgeLanguage): number {
  return language === "csharp" ? MAX_JUDGE_CSHARP_MEMORY_MB : MAX_JUDGE_MEMORY_MB;
}

/** Keep requests compatible with the standalone judge, including legacy tasks. */
export function normalizeJudgeMemoryMb(language: JudgeLanguage, value: unknown, fallback: number): number {
  const requested = Number(value);
  const defaultValue = Number(fallback);
  const resolved = Number.isFinite(requested) && requested > 0 ? requested : defaultValue;
  const safeValue = Number.isFinite(resolved) && resolved > 0 ? resolved : MIN_JUDGE_MEMORY_MB;
  return Math.floor(Math.min(maxJudgeMemoryMb(language), Math.max(MIN_JUDGE_MEMORY_MB, safeValue)));
}
