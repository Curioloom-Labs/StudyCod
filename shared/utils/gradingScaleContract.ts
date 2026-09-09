/**
 * Shared grading contract used by the backend and frontend.
 *
 * Display formatting is intentionally left to each application layer, but
 * the scale identifiers, boundaries, and numeric conversions live here so
 * they cannot silently drift apart.
 */
export const GRADING_SYSTEMS = ["PERCENT_100", "POINTS_12", "POINTS_10", "LETTER_AF", "ECTS_AF", "GPA_4"] as const;
export type GradingSystem = (typeof GRADING_SYSTEMS)[number];
export const DEFAULT_GRADING_SYSTEM: GradingSystem = "PERCENT_100";

export const GRADE_SCALE_MODES = ["LINEAR", "MON"] as const;
export type GradeScaleMode = (typeof GRADE_SCALE_MODES)[number];
export const DEFAULT_GRADE_SCALE_MODE: GradeScaleMode = "LINEAR";

export const MON_12_BANDS: ReadonlyArray<{ point: number; min: number; max: number; anchor: number }> = [
  { point: 12, min: 98, max: 100, anchor: 100 },
  { point: 11, min: 95, max: 97, anchor: 97 },
  { point: 10, min: 90, max: 94, anchor: 94 },
  { point: 9, min: 82, max: 89, anchor: 89 },
  { point: 8, min: 74, max: 81, anchor: 81 },
  { point: 7, min: 64, max: 73, anchor: 73 },
  { point: 6, min: 55, max: 63, anchor: 63 },
  { point: 5, min: 45, max: 54, anchor: 54 },
  { point: 4, min: 35, max: 44, anchor: 44 },
  { point: 3, min: 25, max: 34, anchor: 34 },
  { point: 2, min: 10, max: 24, anchor: 24 },
  { point: 1, min: 1, max: 9, anchor: 9 },
];

export const LETTER_AF_TO_PERCENT: Readonly<Record<string, number>> = {
  A: 95,
  B: 85,
  C: 75,
  D: 65,
  F: 50,
};

export const ECTS_TO_PERCENT: Readonly<Record<string, number>> = {
  A: 95,
  B: 86,
  C: 78,
  D: 69,
  E: 62,
  F: 50,
};

export function normalizeScaleMode(value: unknown): GradeScaleMode {
  return value === "MON" ? "MON" : "LINEAR";
}

export function normalizeGradingSystem(value: unknown): GradingSystem {
  return typeof value === "string" && (GRADING_SYSTEMS as readonly string[]).includes(value)
    ? value as GradingSystem
    : DEFAULT_GRADING_SYSTEM;
}

export function clampRaw100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function percentToPoints12Mon(score: number): number {
  if (score <= 0) return 0;
  for (const band of MON_12_BANDS) {
    if (score >= band.min) return band.point;
  }
  return 1;
}

export function points12ToPercentMon(point: number): number {
  const normalized = Math.max(0, Math.min(12, Math.round(point)));
  if (normalized <= 0) return 0;
  return MON_12_BANDS.find(band => band.point === normalized)?.anchor ?? 0;
}

export function percentToPointsLinear(score: number, max: number): number {
  if (score <= 0) return 0;
  const points = Math.round((score / 100) * max);
  return points <= 0 ? 1 : points;
}

export function percentToLetterAF(percent: number): "A" | "B" | "C" | "D" | "F" {
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
}

export function percentToEcts(percent: number): "A" | "B" | "C" | "D" | "E" | "F" {
  if (percent >= 90) return "A";
  if (percent >= 82) return "B";
  if (percent >= 74) return "C";
  if (percent >= 64) return "D";
  if (percent >= 60) return "E";
  return "F";
}

export function formatGpa(score: number): string {
  const fixed = (score / 25).toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
