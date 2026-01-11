import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFormula, validateFormula } from "./safeFormulaEvaluator";
const vars = {
  test: 0,
  avgPractice: 0
};
test("safeFormulaEvaluator: basic arithmetic", () => {
  assert.equal(evaluateFormula("1+2*3", vars), 7);
  assert.equal(evaluateFormula("(1+2)*3", vars), 9);
});
test("safeFormulaEvaluator: rejects non-math tokens", () => {
  assert.equal(validateFormula("constructor"), false);
  assert.equal(validateFormula("process.env"), false);
});