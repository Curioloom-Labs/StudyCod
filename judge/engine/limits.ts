import { JudgeLimits } from "./result";
import type { LanguageId } from "../languages/types";
import { LANGUAGES } from "../languages/registry";
export interface ResolvedLimits {
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
}

// Per-language defaults, derived from the language registry (single source of truth).
export const DEFAULT_LIMITS: Record<LanguageId, JudgeLimits> = Object.fromEntries(
  (Object.keys(LANGUAGES) as LanguageId[]).map(id => [id, { ...LANGUAGES[id].defaultLimits }])
) as Record<LanguageId, JudgeLimits>;

export function validateAndResolveLimits(language: LanguageId, limits: JudgeLimits): ResolvedLimits {
  const def = DEFAULT_LIMITS[language];
  const time = Number(limits?.time_limit_ms ?? def.time_limit_ms);
  const memMb = Number(limits?.memory_limit_mb ?? def.memory_limit_mb);
  const outKb = Number(limits?.output_limit_kb ?? def.output_limit_kb);
  if (!Number.isFinite(time) || time <= 0 || time > 30_000) {
    throw new Error("INVALID_LIMITS: time_limit_ms must be 1..30000");
  }
  const maxMemMb = language === "csharp" ? 1024 : 512;
  if (!Number.isFinite(memMb) || memMb < 32 || memMb > maxMemMb) {
    throw new Error(`INVALID_LIMITS: memory_limit_mb must be 32..${maxMemMb}`);
  }
  // Output cap is configurable: tasks with large expected output need a higher ceiling.
  // Actual stdout is buffered in memory up to this bound, so keep a sane absolute max.
  const maxOutKbRaw = parseInt(String(process.env.JUDGE_MAX_OUTPUT_LIMIT_KB ?? ""), 10);
  const maxOutKb = Number.isFinite(maxOutKbRaw) && maxOutKbRaw > 0 ? Math.min(maxOutKbRaw, 256 * 1024) : 64 * 1024;
  if (!Number.isFinite(outKb) || outKb < 1 || outKb > maxOutKb) {
    throw new Error(`INVALID_LIMITS: output_limit_kb must be 1..${maxOutKb}`);
  }
  return {
    timeLimitMs: Math.floor(time),
    memoryLimitBytes: Math.floor(memMb * 1024 * 1024),
    outputLimitBytes: Math.floor(outKb * 1024)
  };
}
