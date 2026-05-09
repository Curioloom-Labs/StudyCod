import { createHash } from "crypto";

export type HintStrategyVariant = "A" | "B";

type HintStrategyInput = {
  studentId: number;
  taskId: number;
  codeHash: string;
};

function parseBoolean(raw: unknown): boolean {
  const value = String(raw ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function parseRolloutPercent(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

function hashToBucket(seed: string): number {
  const digest = createHash("sha256").update(seed).digest();
  const value = ((digest[0] << 8) | digest[1]) >>> 0;
  return value % 100;
}

export function getHintStrategyConfig(): {
  enabled: boolean;
  rolloutPercent: number;
} {
  return {
    enabled: parseBoolean(process.env.EDU_HINTS_AB_ENABLED),
    rolloutPercent: parseRolloutPercent(process.env.EDU_HINTS_AB_ROLLOUT_PERCENT),
  };
}

export function resolveHintStrategyVariant(input: HintStrategyInput): HintStrategyVariant {
  const config = getHintStrategyConfig();
  if (!config.enabled || config.rolloutPercent <= 0) return "A";
  if (config.rolloutPercent >= 100) return "B";

  const seed = `${input.studentId}:${input.taskId}:${String(input.codeHash || "")}`;
  const bucket = hashToBucket(seed);
  return bucket < config.rolloutPercent ? "B" : "A";
}

export function applyHintStrategyVariant(hints: string[], variant: HintStrategyVariant): string[] {
  if (variant !== "B") return hints;
  if (!Array.isArray(hints) || hints.length === 0) return [];

  return hints.map((hint, index) => `${index + 1}) ${hint}`);
}
