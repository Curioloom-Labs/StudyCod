import type { GradingSystem } from "../types/GradingSystem";

/**
 * Per-class conversion model for the numeric point systems (POINTS_12).
 *
 * - LINEAR: simple proportional mapping (round(pct/100 * max)). Historical
 *   behaviour. Cheap, but does not match the official Ukrainian scale and the
 *   bands are evenly spaced.
 * - MON: the official Ukrainian Ministry of Education (МОН) 12-point band
 *   table. Non-linear, and the minimum non-zero grade is 1 (a passing/attempted
 *   work never displays as 0).
 *
 * The mode only affects POINTS_12 today; the other systems behave identically
 * in both modes. It is threaded explicitly so callers that do not know the
 * class setting keep the safe LINEAR default.
 */
export type GradeScaleMode = "LINEAR" | "MON";

export const GRADE_SCALE_MODES = ["LINEAR", "MON"] as const;
export const DEFAULT_GRADE_SCALE_MODE: GradeScaleMode = "LINEAR";

export function normalizeScaleMode(value: unknown): GradeScaleMode {
  return value === "MON" ? "MON" : "LINEAR";
}

function clampToRaw100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getNumericScaleMax(system: GradingSystem): number | null {
  switch (system) {
    case "POINTS_12":
      return 12;
    case "POINTS_10":
      return 10;
    case "GPA_4":
      return 4;
    default:
      return null;
  }
}

// Official МОН 12-point table. Each band is [minPercent, maxPercent] inclusive.
// `anchor` is the representative percent stored when a teacher enters that
// point value — chosen as the band's upper bound so that
// points -> percent -> points is a stable round-trip.
const MON_12_BANDS: Array<{ point: number; min: number; max: number; anchor: number }> = [
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
  { point: 1, min: 1, max: 9, anchor: 9 }
];

function percentToPoints12Mon(score: number): number {
  if (score <= 0) return 0;
  for (const band of MON_12_BANDS) {
    if (score >= band.min) return band.point;
  }
  return 1;
}

function points12ToPercentMon(point: number): number {
  const p = Math.max(0, Math.min(12, Math.round(point)));
  if (p <= 0) return 0;
  const band = MON_12_BANDS.find(b => b.point === p);
  return band ? band.anchor : 0;
}

// LINEAR point conversion that never collapses a positive score to 0 (no school
// grade below 1 exists for attempted work).
function percentToPointsLinear(score: number, max: number): number {
  if (score <= 0) return 0;
  const points = Math.round((score / 100) * max);
  return points <= 0 ? 1 : points;
}

function percentToLetterAF(percent: number): "A" | "B" | "C" | "D" | "F" {
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
}

function percentToEcts(percent: number): "A" | "B" | "C" | "D" | "E" | "F" {
  if (percent >= 90) return "A";
  if (percent >= 82) return "B";
  if (percent >= 74) return "C";
  if (percent >= 64) return "D";
  if (percent >= 60) return "E";
  return "F";
}

function formatGpa(score: number): string {
  const gpa = score / 25;
  const fixed = gpa.toFixed(2);
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}

export function formatGradeForSystem(
  rawScore: number | null | undefined,
  system: GradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): string {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "-";
  }

  const score = clampToRaw100(Number(rawScore));

  switch (system) {
    case "PERCENT_100":
      return `${score}/100`;
    case "POINTS_12": {
      const points = scaleMode === "MON" ? percentToPoints12Mon(score) : percentToPointsLinear(score, 12);
      return `${points}/12`;
    }
    case "POINTS_10":
      return `${percentToPointsLinear(score, 10)}/10`;
    case "LETTER_AF":
      return percentToLetterAF(score);
    case "ECTS_AF":
      return percentToEcts(score);
    case "GPA_4":
      return `${formatGpa(score)}/4.0`;
    default:
      return `${score}/100`;
  }
}

export function gradingSystemDisplayLabel(system: GradingSystem, locale: "uk" | "en"): string {
  switch (system) {
    case "PERCENT_100":
      return locale === "en" ? "100-point (0–100)" : "100-бальна (0–100)";
    case "POINTS_12":
      return locale === "en" ? "12-point (0–12)" : "12-бальна (0–12)";
    case "POINTS_10":
      return locale === "en" ? "10-point (0–10)" : "10-бальна (0–10)";
    case "LETTER_AF":
      return locale === "en" ? "Letter A–F" : "Літерна A–F";
    case "ECTS_AF":
      return locale === "en" ? "ECTS A–F" : "ECTS A–F";
    case "GPA_4":
      return locale === "en" ? "GPA 4.0" : "GPA 4.0";
    default:
      return locale === "en" ? "100-point (0–100)" : "100-бальна (0–100)";
  }
}

export function convertGradeToRaw100(
  value: number,
  fromSystem: GradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): number {
  if (!Number.isFinite(value)) return 0;

  switch (fromSystem) {
    case "PERCENT_100":
      return clampToRaw100(value);
    case "POINTS_12":
      return scaleMode === "MON" ? points12ToPercentMon(value) : clampToRaw100((value / 12) * 100);
    case "POINTS_10":
      return clampToRaw100((value / 10) * 100);
    case "GPA_4":
      return clampToRaw100((value / 4) * 100);
    case "LETTER_AF":
    case "ECTS_AF":
    default:
      // Letter systems are stored as raw-100 (parse-on-input already converted
      // the letter to a percent), so legacy bulk conversion is an identity.
      return clampToRaw100(value);
  }
}

export function shouldConvertLegacyGrades(values: number[], fromSystem: GradingSystem): boolean {
  const max = getNumericScaleMax(fromSystem);
  if (!max) return false;

  const finiteValues = values.filter(v => Number.isFinite(v));
  if (finiteValues.length === 0) return false;

  const withinScaleCount = finiteValues.filter(v => v <= max + 0.0001).length;
  const withinScaleRatio = withinScaleCount / finiteValues.length;
  const absoluteMax = Math.max(...finiteValues);

  // Convert when data clearly looks like old-scale storage (legacy classes).
  return absoluteMax <= max + 0.0001 || withinScaleRatio >= 0.85;
}
