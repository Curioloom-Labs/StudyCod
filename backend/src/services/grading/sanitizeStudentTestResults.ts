export type StudentTestResultInput = {
  testId: number;
  passed: boolean;
  verdict?: string | null;
  errorKind?: string | null;
  error?: string | null;
  isPublic: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
};

export type StudentTestResult = {
  testId: number;
  passed: boolean;
  verdict?: string | null;
  errorKind?: string | null;
  error?: string | null;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
};

export function sanitizeTestResultsForStudent(results: readonly StudentTestResultInput[]): StudentTestResult[] {
  return results
    .filter(result => Number.isFinite(result.testId) && result.testId > 0)
    .map(result => ({
      testId: result.testId,
      passed: result.passed,
      verdict: result.verdict ?? null,
      errorKind: result.errorKind ?? null,
      error: result.error ?? null,
      ...(result.isPublic ? {
        input: result.input ?? "",
        expectedOutput: result.expectedOutput ?? "",
        actualOutput: result.actualOutput ?? "",
      } : {}),
    }));
}
