export const GRADING_SYSTEMS = ["PERCENT_100", "POINTS_12", "POINTS_10", "LETTER_AF", "ECTS_AF", "GPA_4"] as const;

export type ClassGradingSystem = (typeof GRADING_SYSTEMS)[number];
export type GradeTone = "muted" | "error" | "warning" | "warn" | "success";

export const DEFAULT_GRADING_SYSTEM: ClassGradingSystem = "PERCENT_100";

export function normalizeGradingSystem(value: unknown): ClassGradingSystem {
  if (typeof value !== "string") return DEFAULT_GRADING_SYSTEM;
  if ((GRADING_SYSTEMS as readonly string[]).includes(value)) {
    return value as ClassGradingSystem;
  }
  return DEFAULT_GRADING_SYSTEM;
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

function clamp100(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
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

const letterAfToPercent: Record<string, number> = {
  A: 95,
  B: 85,
  C: 75,
  D: 65,
  F: 50
};

const ectsToPercent: Record<string, number> = {
  A: 95,
  B: 86,
  C: 78,
  D: 69,
  E: 62,
  F: 50
};

export function formatGradeForSystem(rawScore: number | null | undefined, system: ClassGradingSystem): string {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "-";
  }

  const score = clamp100(Number(rawScore));
  switch (system) {
    case "PERCENT_100":
      return String(score);
    case "POINTS_12":
      return String(Math.round(score / 100 * 12));
    case "POINTS_10":
      return String(Math.round(score / 100 * 10));
    case "LETTER_AF":
      return percentToLetterAF(score);
    case "ECTS_AF":
      return percentToEcts(score);
    case "GPA_4": {
      const gpa = score / 25;
      const fixed = gpa.toFixed(2);
      return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
    }
    default:
      return String(score);
  }
}

export function getGradeToneForSystem(rawScore: number | null | undefined, system: ClassGradingSystem): GradeTone {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "muted";
  }

  const score = clamp100(Number(rawScore));

  switch (system) {
    case "PERCENT_100":
      return numericToneFromBands(score, {
        success: 85,
        warn: 65,
        warning: 40
      });
    case "POINTS_12": {
      const points = Math.round(score / 100 * 12);
      return numericToneFromBands(points, {
        success: 10,
        warn: 7,
        warning: 4
      });
    }
    case "POINTS_10": {
      const points = Math.round(score / 100 * 10);
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

export function parseGradeInputToRaw100(input: string, system: ClassGradingSystem): number | null {
  const value = input.trim();
  if (!value) return null;

  switch (system) {
    case "PERCENT_100": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 100) return null;
      return clamp100(n);
    }
    case "POINTS_12": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 12) return null;
      return clamp100(n / 12 * 100);
    }
    case "POINTS_10": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 10) return null;
      return clamp100(n / 10 * 100);
    }
    case "GPA_4": {
      const n = toNumber(value);
      if (!Number.isFinite(n) || n < 0 || n > 4) return null;
      return clamp100(n / 4 * 100);
    }
    case "LETTER_AF": {
      const key = value.toUpperCase();
      return key in letterAfToPercent ? letterAfToPercent[key] : null;
    }
    case "ECTS_AF": {
      const key = value.toUpperCase();
      return key in ectsToPercent ? ectsToPercent[key] : null;
    }
    default:
      return null;
  }
}
