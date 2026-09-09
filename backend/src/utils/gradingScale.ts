import type { GradingSystem } from "../types/GradingSystem";
import {
  DEFAULT_GRADE_SCALE_MODE,
  GRADE_SCALE_MODES,
  clampRaw100,
  formatGpa,
  normalizeScaleMode,
  percentToEcts,
  percentToLetterAF,
  percentToPoints12Mon,
  percentToPointsLinear,
  points12ToPercentMon,
} from "../../../shared/utils/gradingScaleContract";
import type { GradeScaleMode } from "../../../shared/utils/gradingScaleContract";

export { DEFAULT_GRADE_SCALE_MODE, GRADE_SCALE_MODES, normalizeScaleMode };
export type { GradeScaleMode };

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

export function formatGradeForSystem(
  rawScore: number | null | undefined,
  system: GradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): string {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "-";
  }

  const score = clampRaw100(Number(rawScore));

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
      return clampRaw100(value);
    case "POINTS_12":
      return scaleMode === "MON" ? points12ToPercentMon(value) : clampRaw100((value / 12) * 100);
    case "POINTS_10":
      return clampRaw100((value / 10) * 100);
    case "GPA_4":
      return clampRaw100((value / 4) * 100);
    case "LETTER_AF":
    case "ECTS_AF":
    default:
      // Letter systems are stored as raw-100 (parse-on-input already converted
      // the letter to a percent), so legacy bulk conversion is an identity.
      return clampRaw100(value);
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
