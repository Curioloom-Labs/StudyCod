import type { JudgeRequest } from "./types";

// Cover each installed compiler's entire configured budget and every requested test.
// This is an infrastructure watchdog, not an HTTP wait or a contestant time limit.
const COMPILE_MAX_MS: Partial<Record<JudgeRequest["language"], number>> = {
  python: 8000, js: 8000, lisp: 8000, lua: 8000, perl: 8000, php: 8000, ruby: 8000,
  c: 12000, cpp: 15000, pascal: 12000, d: 12000, java: 20000,
  go: 45000, dart: 45000, rust: 45000, swift: 45000, haskell: 45000,
  kotlin: 60000, csharp: 60000,
};
export function estimateJudgeExecutionTimeoutMs(req: JudgeRequest, configuredCap?: string): number {
  const perTest = Math.max(1, req.limits?.time_limit_ms ?? 1000);
  const tests = Math.max(1, req.tests?.length ?? 0);
  const attempts = req.rerun_failed_once ? 2 : 1;
  const estimated = tests * (perTest + 250) * attempts + (COMPILE_MAX_MS[req.language] ?? 60000) + 10000;
  const cap = Number.parseInt(String(configuredCap ?? ""), 10);
  return Math.min(Number.isFinite(cap) && cap > 0 ? cap : 600000, Math.max(15000, estimated));
}
