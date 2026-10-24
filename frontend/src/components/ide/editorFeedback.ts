export type MobilePane = "condition" | "code" | "result";
export type IdeSaveStatus = "saved" | "dirty" | "saving" | "error";

export type IdePublicTestResult = {
  testId: number;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  passed: boolean;
  skipped?: boolean;
  verdict?: string | null;
  error?: string | null;
  stderr?: string | null;
};

export type IdeAssistantFailure = {
  testId: number;
  input: string;
  expected: string;
  actual: string;
  verdict?: string | null;
  stderr?: string | null;
};

export function getAssistantFailures(
  results: readonly IdePublicTestResult[] | undefined,
): IdeAssistantFailure[] {
  return (results ?? [])
    .filter((result) => !result.passed && !result.skipped)
    .slice(0, 3)
    .map((result) => ({
      testId: result.testId,
      input: result.input ?? "",
      expected: result.expectedOutput ?? "",
      actual: result.actualOutput ?? "",
      verdict: result.verdict,
      stderr: result.stderr ?? result.error ?? null,
    }));
}

export function reconcileMobilePaneAfterResult(currentPane: MobilePane): {
  pane: MobilePane;
  unread: boolean;
} {
  if (currentPane === "code") return { pane: "result", unread: false };
  return { pane: currentPane, unread: currentPane !== "result" };
}

export function getIdeSaveStatusLabel(
  status: IdeSaveStatus | undefined,
  lastSavedAt: string | null | undefined,
  labels: Record<IdeSaveStatus, string>,
  formatTimestamp: (timestamp: string) => string,
): string | null {
  if (!status) return null;
  if (status !== "saved" || !lastSavedAt) return labels[status];
  return `${labels.saved} ${formatTimestamp(lastSavedAt)}`;
}
