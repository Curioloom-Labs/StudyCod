import assert from "node:assert/strict";
import test from "node:test";
import { buildLearningFirstFailure } from "./firstFailure";

test("hidden failures are skipped when selecting the first public learning diagnostic", () => {
  const failure = buildLearningFirstFailure({
    verdict: "WA",
    tests: [
      { testId: 90, passed: false, isPublic: false, input: "private input", expected: "private expected", actual: "private actual" },
      { testId: 91, passed: true, isPublic: true },
      { testId: 92, passed: false, isPublic: true, input: "visible input", expected: "visible expected", actual: "visible actual" },
    ],
  });

  assert.deepEqual(failure, {
    testPublicIndex: 2,
    testId: 92,
    inputPreview: "visible input",
    expectedPreview: "visible expected",
    actualPreview: "visible actual",
    errorKind: "unknown",
  });
  assert.doesNotMatch(JSON.stringify(failure), /private/);
});

test("a hidden-only failure produces no student-visible first-failure diagnostic", () => {
  assert.equal(buildLearningFirstFailure({
    verdict: "WA",
    tests: [{ testId: 90, passed: false, isPublic: false, input: "private input", expected: "private expected", actual: "private actual" }],
  }), null);
});
