import { env } from "../env";

function runtimeValue(name: string): unknown {
  return (env as unknown as Record<string, unknown>)[name];
}

export function readTaskGenerationBoolean(name: string, fallback = false): boolean {
  const raw = String(runtimeValue(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function readTaskGenerationInteger(name: string, fallback: number): number {
  const raw = Number(runtimeValue(name));
  return Number.isFinite(raw) ? Math.floor(raw) : fallback;
}

export const GENERATE_COOLDOWN_MIN_MS = Math.max(
  1_000,
  Math.min(60_000, readTaskGenerationInteger("TASKS_GENERATE_COOLDOWN_MIN_MS", 5_000)),
);

export const GENERATE_COOLDOWN_MAX_MS = Math.max(
  GENERATE_COOLDOWN_MIN_MS,
  Math.max(1_000, Math.min(60_000, readTaskGenerationInteger("TASKS_GENERATE_COOLDOWN_MAX_MS", 10_000))),
);

export function isTaskGenerationDeadlineDisabled(): boolean {
  return readTaskGenerationBoolean("TASKS_GENERATE_DISABLE_DEADLINE");
}

export function resolveRequestBudgetMs(): number {
  if (isTaskGenerationDeadlineDisabled()) return Number.MAX_SAFE_INTEGER;
  const value = readTaskGenerationInteger("TASKS_GENERATE_BUDGET_MS", 45_000);
  return Math.max(15_000, Math.min(120_000, value));
}

export function resolveTaskBudgetCapMs(requestBudgetMs: number): number {
  const fallback = Math.floor(requestBudgetMs * 0.75);
  const value = readTaskGenerationInteger("TASKS_GENERATE_TASK_BUDGET_MS", fallback);
  return Math.max(25_000, Math.min(90_000, value));
}

export function resolveQuizBudgetCapMs(): number {
  const value = readTaskGenerationInteger("TASKS_GENERATE_QUIZ_BUDGET_MS", 20_000);
  return Math.max(10_000, Math.min(35_000, value));
}
