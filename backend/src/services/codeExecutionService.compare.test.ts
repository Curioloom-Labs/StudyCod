import test from "node:test";
import assert from "node:assert/strict";
import { compareOutput, compareOutputWithChecker, compareModeFromChecker } from "./codeExecutionService";

test("default (lenient) is unchanged: collapses spaces and comma spacing", () => {
  assert.equal(compareOutput("1 2 3", "123"), true);
  assert.equal(compareOutput("a, b", "a,b"), true);
  assert.equal(compareOutput("5\n", "5"), true);
});

test("exact mode rejects whitespace/comma fuzzing", () => {
  assert.equal(compareOutput("1 2 3", "123", { mode: "exact" }), false);
  assert.equal(compareOutput("a, b", "a,b", { mode: "exact" }), false);
  // post-normalization line-trim equality still passes.
  assert.equal(compareOutput("5\n", "5", { mode: "exact" }), true);
  assert.equal(compareOutput("hello world", "hello world", { mode: "exact" }), true);
});

test("whitespace mode ignores spaces but not comma insertion", () => {
  assert.equal(compareOutput("5  6", "5 6", { mode: "whitespace" }), true);
  // comma-spacing leniency is lenient-only; whitespace removal still makes these equal.
  assert.equal(compareOutput("1, 2", "1,2", { mode: "whitespace" }), true);
  // a genuinely different token must fail.
  assert.equal(compareOutput("1 2 4", "1 2 3", { mode: "whitespace" }), false);
  assert.equal(compareOutputWithChecker("5.0", "5", { type: "whitespace" }), false);
});

test("nonempty mode only checks that output exists", () => {
  assert.equal(compareOutput("anything", "EXPECTED", { mode: "nonempty" }), true);
  assert.equal(compareOutput("", "EXPECTED", { mode: "nonempty" }), false);
  assert.equal(compareOutput("   \n  ", "EXPECTED", { mode: "nonempty" }), false);
});

test("float mode compares within epsilon, token-wise", () => {
  assert.equal(compareOutput("3.141592", "3.14159", { mode: "float", epsilon: 1e-3 }), true);
  assert.equal(compareOutput("3.2", "3.14159", { mode: "float", epsilon: 1e-3 }), false);
  assert.equal(compareOutput("1.0 2.0", "1 2", { mode: "float" }), true);
  assert.equal(compareOutput("abc 1.000", "abc 1.0001", { mode: "float", epsilon: 1e-2 }), true);
  // token count mismatch fails.
  assert.equal(compareOutput("1 2", "1 2 3", { mode: "float" }), false);
  // non-numeric token mismatch fails.
  assert.equal(compareOutput("yes 1.0", "no 1.0", { mode: "float" }), false);
});

test("compareModeFromChecker maps judge checker specs", () => {
  assert.deepEqual(compareModeFromChecker({ type: "exact" }), { mode: "exact" });
  assert.deepEqual(compareModeFromChecker({ type: "whitespace" }), { mode: "whitespace" });
  assert.deepEqual(compareModeFromChecker({ type: "nonempty" }), { mode: "nonempty" });
  assert.deepEqual(compareModeFromChecker({ type: "float", epsilon: 1e-4 }), { mode: "float", epsilon: 1e-4 });
  assert.deepEqual(compareModeFromChecker(null), { mode: "lenient" });
  assert.deepEqual(compareModeFromChecker(undefined), { mode: "lenient" });
});

test("compareOutputWithChecker honors the spec; undefined => lenient", () => {
  assert.equal(compareOutputWithChecker("1 2 3", "123"), true); // lenient
  assert.equal(compareOutputWithChecker("1 2 3", "123", { type: "exact" }), false);
  assert.equal(compareOutputWithChecker("3.14159", "3.141590001", { type: "float", epsilon: 1e-3 }), true);
});
