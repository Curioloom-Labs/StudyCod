import { evaluateArithmeticExpression } from "./safeFormulaEvaluator";
import { logger } from "./logger";

// Thematic grade = aggregation of a topic's practice work and control work.
// All values are on the internal raw-100 scale (0..100).
//
// Available formula variables (case-insensitive):
//   practice        – average of best practice scores in the topic (0 if none)
//   control         – average of control-work scores in the topic (0 if none)
//   avg(practice)   – alias for `practice`
//
// When no custom formula is set we use a "smart default" that degrades
// gracefully depending on which components actually exist for the student, so
// a topic with only practice (or only control) still produces a real grade
// instead of being dragged toward zero.

export const DEFAULT_THEMATIC_FORMULA_WEIGHTS = { control: 0.7, practice: 0.3 } as const;

export interface ThematicInputs {
  /** Average of best practice scores (raw-100). Meaningful only when hasPractice. */
  practice: number;
  /** Average of control-work scores (raw-100). Meaningful only when hasControl. */
  control: number;
  hasPractice: boolean;
  hasControl: boolean;
}

function clampRaw100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function defaultThematicGrade(inputs: ThematicInputs): number {
  const { practice, control, hasPractice, hasControl } = inputs;
  if (hasControl && hasPractice) {
    return clampRaw100(
      DEFAULT_THEMATIC_FORMULA_WEIGHTS.control * control +
      DEFAULT_THEMATIC_FORMULA_WEIGHTS.practice * practice
    );
  }
  if (hasControl) return clampRaw100(control);
  if (hasPractice) return clampRaw100(practice);
  return 0;
}

function substituteVariables(formula: string, inputs: ThematicInputs): string {
  let expr = formula.trim();
  // avg(practice) -> practice (alias) before the bare-variable pass
  expr = expr.replace(/avg\s*\(\s*practice\s*\)/gi, String(inputs.practice));
  expr = expr.replace(/\bcontrol\b/gi, String(inputs.control));
  expr = expr.replace(/\bpractice\b/gi, String(inputs.practice));
  return expr;
}

/**
 * Compute a thematic grade (raw-100 int). When `formula` is empty/null the
 * smart default is used. A malformed formula falls back to the default rather
 * than throwing, so a bad teacher-entered string never breaks recalculation.
 */
export function computeThematicGrade(inputs: ThematicInputs, formula?: string | null): number {
  if (!formula || formula.trim() === "") {
    return defaultThematicGrade(inputs);
  }
  try {
    const expr = substituteVariables(formula, inputs);
    const result = evaluateArithmeticExpression(expr);
    if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) {
      throw new Error(`Invalid thematic result: ${result}`);
    }
    return clampRaw100(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn("Thematic formula evaluation failed; using default", {
      hasFormula: true,
      error: message
    });
    return defaultThematicGrade(inputs);
  }
}

/** Validate a teacher-entered thematic formula. Empty string is valid (= default). */
export function validateThematicFormula(formula: string | null | undefined): boolean {
  if (!formula || formula.trim() === "") return true;
  try {
    const expr = substituteVariables(formula, {
      practice: 7.5,
      control: 8,
      hasPractice: true,
      hasControl: true
    });
    const result = evaluateArithmeticExpression(expr);
    return typeof result === "number" && Number.isFinite(result) && !Number.isNaN(result);
  } catch {
    return false;
  }
}

/** Resolve the effective formula: topic override > class default > built-in default (null). */
export function resolveThematicFormula(
  topicFormula?: string | null,
  classFormula?: string | null
): string | null {
  const topic = (topicFormula ?? "").trim();
  if (topic) return topic;
  const cls = (classFormula ?? "").trim();
  if (cls) return cls;
  return null;
}
