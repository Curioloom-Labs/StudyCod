import type { GradingSystem } from "../types/GradingSystem";

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

export function formatGradeForSystem(rawScore: number | null | undefined, system: GradingSystem): string {
  if (rawScore === null || rawScore === undefined || !Number.isFinite(Number(rawScore))) {
    return "-";
  }

  const score = clampToRaw100(Number(rawScore));

  switch (system) {
    case "PERCENT_100":
      return `${score}/100`;
    case "POINTS_12":
      return `${Math.round(score / 100 * 12)}/12`;
    case "POINTS_10":
      return `${Math.round(score / 100 * 10)}/10`;
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

export function convertGradeToRaw100(value: number, fromSystem: GradingSystem): number {
  if (!Number.isFinite(value)) return 0;

  switch (fromSystem) {
    case "PERCENT_100":
      return clampToRaw100(value);
    case "POINTS_12":
      return clampToRaw100(value / 12 * 100);
    case "POINTS_10":
      return clampToRaw100(value / 10 * 100);
    case "GPA_4":
      return clampToRaw100(value / 4 * 100);
    case "LETTER_AF":
    case "ECTS_AF":
    default:
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
