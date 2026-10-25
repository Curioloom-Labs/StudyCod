import { describe, expect, it } from "vitest";
import { contestFirstFailureToPublicTestResults } from "./contestFeedback";

describe("contest assistant feedback privacy", () => {
  it("omits a hidden first failure and its test index entirely", () => {
    expect(contestFirstFailureToPublicTestResults({
      index: 7,
      verdict: "WA",
      hidden: true,
      group: "private",
      input: "secret input",
      expected: "secret expected",
      actual: "secret actual",
      stderr: "secret stderr",
    })).toEqual([]);
  });

  it("maps a public failure into bounded learner-visible Judge context", () => {
    expect(contestFirstFailureToPublicTestResults({
      index: 2,
      verdict: "WA",
      hidden: false,
      group: "samples",
      input: "3 1 3",
      expected: "7",
      actual: "6",
      stderr: "",
    })).toEqual([{
      testId: 2,
      input: "3 1 3",
      expectedOutput: "7",
      actualOutput: "6",
      passed: false,
      verdict: "WA",
      stderr: "",
    }]);
  });
});
