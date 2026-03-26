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
test("safeFormulaEvaluator: default grade uses available parts", () => {
  assert.equal(evaluateFormula(null, {
    test: null,
    avgPractice: 0
  }), 0);
  assert.equal(evaluateFormula("", {
    test: null,
    avgPractice: 0
  }), 0);
  assert.equal(evaluateFormula(null, {
    test: 10,
    avgPractice: 0
  }), 10);
  assert.equal(evaluateFormula(null, {
    test: null,
    avgPractice: 8
  }), 8);
  assert.equal(evaluateFormula(null, {
    test: 10,
    avgPractice: 8
  }), 9);
});
test("safeFormulaEvaluator: supports avg(practice) and test variables", () => {
  assert.equal(evaluateFormula("avg(practice)", {
    test: null,
    avgPractice: 9.2
  }), 9);
  assert.equal(evaluateFormula("(test + 1.3 * avg(practice)) / 2", {
    test: 12,
    avgPractice: 6
  }), 10);
});
test("safeFormulaEvaluator: rejects non-math tokens", () => {
  assert.equal(validateFormula("constructor"), false);
  assert.equal(validateFormula("process.env"), false);
});