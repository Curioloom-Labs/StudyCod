import type { ContestFirstFailure } from "./api/contests";

export type PublicContestTestResult = {
  testId: number;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  passed: false;
  verdict?: string | null;
  stderr?: string;
};

/** Hidden contest failures may expose the verdict only, never test details to an assistant. */
export function contestFirstFailureToPublicTestResults(
  failure: ContestFirstFailure | null | undefined,
): PublicContestTestResult[] {
  if (!failure || failure.hidden) return [];
  return [{
    testId: failure.index,
    input: failure.input,
    expectedOutput: failure.expected,
    actualOutput: failure.actual,
    passed: false,
    verdict: failure.verdict,
    stderr: failure.stderr,
  }];
}
