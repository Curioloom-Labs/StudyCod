import { JudgeLimits } from "./result";
export interface ResolvedLimits {
  timeLimitMs: number;
  memoryLimitBytes: number;
  outputLimitBytes: number;
}
export const DEFAULT_LIMITS: Record<"java" | "python" | "cpp" | "c" | "csharp" | "kotlin", JudgeLimits> = {
  java: {
    time_limit_ms: 1200,
    memory_limit_mb: 256,
    output_limit_kb: 64
  },
  cpp: {
    time_limit_ms: 800,
    memory_limit_mb: 256,
    output_limit_kb: 64
  },
  c: {
    time_limit_ms: 800,
    memory_limit_mb: 256,
    output_limit_kb: 64
  },
  python: {
    time_limit_ms: 900,
    memory_limit_mb: 128,
    output_limit_kb: 64
  },
  kotlin: {
    time_limit_ms: 1400,
    memory_limit_mb: 256,
    output_limit_kb: 64
  },
  csharp: {
    time_limit_ms: 1400,
    memory_limit_mb: 1024,
    output_limit_kb: 64
  }
};
export function validateAndResolveLimits(language: "java" | "python" | "cpp" | "c" | "csharp" | "kotlin", limits: JudgeLimits): ResolvedLimits {
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
  if (!Number.isFinite(outKb) || outKb < 1 || outKb > 1024) {
    throw new Error("INVALID_LIMITS: output_limit_kb must be 1..1024");
  }
  return {
    timeLimitMs: Math.floor(time),
    memoryLimitBytes: Math.floor(memMb * 1024 * 1024),
    outputLimitBytes: Math.floor(outKb * 1024)
  };
}