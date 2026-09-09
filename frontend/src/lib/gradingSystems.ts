import {
  DEFAULT_GRADE_SCALE_MODE,
  DEFAULT_GRADING_SYSTEM,
  ECTS_TO_PERCENT,
  GRADE_SCALE_MODES,
  GRADING_SYSTEMS,
  LETTER_AF_TO_PERCENT,
  clampRaw100,
  formatGpa,
  normalizeGradingSystem as normalizeSharedGradingSystem,
  normalizeScaleMode,
  percentToEcts,
  percentToLetterAF,
  percentToPoints12Mon,
  percentToPointsLinear,
  points12ToPercentMon,
} from "../../../shared/utils/gradingScaleContract";
import type {
  GradeScaleMode,
  GradingSystem,
} from "../../../shared/utils/gradingScaleContract";

export { DEFAULT_GRADE_SCALE_MODE, DEFAULT_GRADING_SYSTEM, GRADE_SCALE_MODES, GRADING_SYSTEMS, normalizeScaleMode };
export type ClassGradingSystem = GradingSystem;
export type { GradeScaleMode };
export type GradeTone = "muted" | "error" | "warning" | "warn" | "success";

export function normalizeGradingSystem(value: unknown): ClassGradingSystem {
  return normalizeSharedGradingSystem(value);
}

export function gradingSystemLabel(system: ClassGradingSystem, isEn: boolean): string {
  switch (system) {
    case "PERCENT_100":
      return isEn ? "100-point (0–100)" : "100-бальна (0–100)";
    case "POINTS_12":
      return isEn ? "12-point (0–12)" : "12-бальна (0–12)";
    case "POINTS_10":
      return isEn ? "10-point (0–10)" : "10-бальна (0–10)";
    case "LETTER_AF":
      return isEn ? "Letter A–F" : "Літерна A–F";
    case "ECTS_AF":
      return isEn ? "ECTS A–F" : "ECTS A–F";
    case "GPA_4":
      return isEn ? "GPA 4.0" : "GPA 4.0";
    default:
      return isEn ? "100-point (0–100)" : "100-бальна (0–100)";
  }
}

export function gradingSystemInputHint(system: ClassGradingSystem, isEn: boolean): string {
  switch (system) {
    case "PERCENT_100":
      return isEn ? "Enter from 0 to 100" : "Введіть від 0 до 100";
    case "POINTS_12":
      return isEn ? "Enter from 0 to 12" : "Введіть від 0 до 12";
    case "POINTS_10":
      return isEn ? "Enter from 0 to 10" : "Введіть від 0 до 10";
    case "LETTER_AF":
      return isEn ? "Enter one of: A, B, C, D, F" : "Введіть одне з: A, B, C, D, F";
    case "ECTS_AF":
      return isEn ? "Enter one of: A, B, C, D, E, F" : "Введіть одне з: A, B, C, D, E, F";
    case "GPA_4":
      return isEn ? "Enter from 0.00 to 4.00" : "Введіть від 0.00 до 4.00";
    default:
      return isEn ? "Enter from 0 to 100" : "Введіть від 0 до 100";
  }
}

function toNumber(raw: string): number {
  return Number(raw.replace(",", ".").trim());
}

function numericToneFromBands(value: number, bands: {
  success: number;
  warn: number;
  warning: number;
}): GradeTone {
  if (!Number.isFinite(value)) return "muted";
  if (value >= bands.success) return "success";
  if (value >= bands.warn) return "warn";
  if (value >= bands.warning) return "warning";
  return "error";
}

export function formatGradeForSystem(
  rawScore: number | null | undefined,
  system: ClassGradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): string {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "-";
  }

  const score = clampRaw100(Number(rawScore));
  switch (system) {
    case "PERCENT_100":
      return String(score);
    case "POINTS_12":
      return String(scaleMode === "MON" ? percentToPoints12Mon(score) : percentToPointsLinear(score, 12));
    case "POINTS_10":
      return String(percentToPointsLinear(score, 10));
    case "LETTER_AF":
      return percentToLetterAF(score);
    case "ECTS_AF":
      return percentToEcts(score);
    case "GPA_4": {
      return formatGpa(score);
    }
    default:
      return String(score);
  }
}

export function getGradeToneForSystem(
  rawScore: number | null | undefined,
  system: ClassGradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): GradeTone {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "muted";
  }

  const score = clampRaw100(Number(rawScore));

  switch (system) {
    case "PERCENT_100":
      return numericToneFromBands(score, {
        success: 85,
        warn: 65,
        warning: 40
      });
    case "POINTS_12": {
      const points = scaleMode === "MON" ? percentToPoints12Mon(score) : percentToPointsLinear(score, 12);
      return numericToneFromBands(points, {
        success: 10,
        warn: 7,
        warning: 4
      });
    }
    case "POINTS_10": {
      const points = percentToPointsLinear(score, 10);
      return numericToneFromBands(points, {
        success: 8,
        warn: 6,
        warning: 4
      });
    }
    case "GPA_4": {
      const gpa = score / 25;
      return numericToneFromBands(gpa, {
        success: 3.2,
        warn: 2.4,
        warning: 1.6
      });
    }
    case "LETTER_AF": {
      const letter = percentToLetterAF(score);
      if (letter === "A" || letter === "B") return "success";
      if (letter === "C") return "warn";
      if (letter === "D") return "warning";
      return "error";
    }
    case "ECTS_AF": {
      const letter = percentToEcts(score);
      if (letter === "A" || letter === "B") return "success";
      if (letter === "C") return "warn";
      if (letter === "D" || letter === "E") return "warning";
      return "error";
    }
    default:
      return numericToneFromBands(score, {
        success: 85,
        warn: 65,
        warning: 40
      });
  }
}

export function parseGradeInputToRaw100(
  input: string,
  system: ClassGradingSystem,
  scaleMode: GradeScaleMode = DEFAULT_GRADE_SCALE_MODE
): number | null {
  const value = input.trim();
  if (!value) return null;

  switch (system) {
    case "PERCENT_100": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return null;
      return clampRaw100(n);
    }
    case "POINTS_12": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 12) return null;
      if (scaleMode === "MON") return clampRaw100(points12ToPercentMon(n));
      return clampRaw100(n / 12 * 100);
    }
    case "POINTS_10": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 10) return null;
      return clampRaw100(n / 10 * 100);
    }
    case "GPA_4": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 4) return null;
      return clampRaw100(n / 4 * 100);
    }
    case "LETTER_AF": {
      const key = value.toUpperCase();
      return key in LETTER_AF_TO_PERCENT ? LETTER_AF_TO_PERCENT[key] : null;
    }
    case "ECTS_AF": {
      const key = value.toUpperCase();
      return key in ECTS_TO_PERCENT ? ECTS_TO_PERCENT[key] : null;
    }
    default:
      return null;
  }
}
