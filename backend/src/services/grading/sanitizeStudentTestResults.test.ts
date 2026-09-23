import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeTestResultsForStudent } from "./sanitizeStudentTestResults";

test("includes diagnostic data for public personal-task tests", () => {
  assert.deepEqual(sanitizeTestResultsForStudent([{
    testId: 12,
    passed: false,
    verdict: "WA",
    isPublic: true,
    input: "Alex\n15",
    expectedOutput: "Player Alex registered at level 15.",
    actualOutput: "",
  }]), [{
    testId: 12,
    passed: false,
    verdict: "WA",
    errorKind: null,
    error: null,
    input: "Alex\n15",
    expectedOutput: "Player Alex registered at level 15.",
    actualOutput: "",
  }]);
});

test("does not expose diagnostic data for hidden personal-task tests", () => {
  assert.deepEqual(sanitizeTestResultsForStudent([{
    testId: 13,
    passed: false,
    verdict: "WA",
    isPublic: false,
    input: "secret input",
    expectedOutput: "secret output",
    actualOutput: "secret actual",
  }]), [{
    testId: 13,
    passed: false,
    verdict: "WA",
    errorKind: null,
    error: null,
  }]);
});
