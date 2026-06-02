import test from "node:test";
import assert from "node:assert/strict";
import { classifyErrorKind, deterministicExplanation } from "./failureHints";

test("classifyErrorKind detects compile errors by verdict and stderr", () => {
  assert.equal(classifyErrorKind("CE", ""), "compile");
  assert.equal(classifyErrorKind("", "error: expected ';' before '}'"), "compile");
  assert.equal(classifyErrorKind("", "javac: cannot find symbol"), "compile");
});

test("classifyErrorKind detects timeout", () => {
  assert.equal(classifyErrorKind("TLE", ""), "timeout");
  assert.equal(classifyErrorKind("", "Process killed: time limit exceeded"), "timeout");
});

test("classifyErrorKind detects runtime errors", () => {
  assert.equal(classifyErrorKind("RE", ""), "runtime");
  assert.equal(classifyErrorKind("", "Traceback (most recent call last): IndexError"), "runtime");
});

test("classifyErrorKind defaults to wrong_answer", () => {
  assert.equal(classifyErrorKind("WA", ""), "wrong_answer");
  assert.equal(classifyErrorKind("", ""), "wrong_answer");
});

test("deterministicExplanation returns a non-empty, language-aware string", () => {
  const py = deterministicExplanation("compile", "PYTHON");
  const cpp = deterministicExplanation("compile", "CPP");
  assert.ok(py.length > 0 && cpp.length > 0);
  assert.notEqual(py, cpp); // python vs compiled languages differ
  assert.match(deterministicExplanation("timeout", "JAVA"), /ліміт часу/i);
  assert.match(deterministicExplanation("wrong_answer", "JAVA"), /очікуван/i);
  // Never leaks a ready solution.
  for (const kind of ["compile", "timeout", "runtime", "wrong_answer"] as const) {
    const s = deterministicExplanation(kind, "PYTHON");
    assert.ok(!/```/.test(s), "must not contain code fences");
  }
});
