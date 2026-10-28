/** Resolve the verdict that matches the Personal submit route's per-test acceptance rules. */
export function resolvePersonalJudgeVerdict(
  runnerVerdict: string | null | undefined,
  testsPassed: number,
  testsTotal: number,
): string | null {
  if (
    !Number.isInteger(testsTotal) ||
    testsTotal <= 0 ||
    !Number.isInteger(testsPassed) ||
    testsPassed < 0 ||
    testsPassed > testsTotal
  ) {
    return null;
  }

  if (testsPassed === testsTotal) return "AC";
  if (!runnerVerdict || runnerVerdict === "AC") return "WA";
  return runnerVerdict;
}
