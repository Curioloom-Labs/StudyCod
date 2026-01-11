import { evaluateFormula as safeEvaluateFormula, validateFormula as safeValidateFormula } from "./safeFormulaEvaluator";
export interface FormulaVariables {
  test: number | null;
  avgPractice: number;
}
export function evaluateFormula(formula: string | null | undefined, variables: FormulaVariables): number {
  return safeEvaluateFormula(formula, variables);
}
export function validateFormula(formula: string): boolean {
  return safeValidateFormula(formula);
}