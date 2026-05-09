import type { LearningFirstFailure } from "./firstFailure";

export type LearningFailureAnalysisConfidence = "low" | "medium" | "high";

export type LearningFailureAnalysis = {
  summary: string;
  likelyRootCause: string;
  nextSteps: string[];
  confidence: LearningFailureAnalysisConfidence;
};

const MAX_NEXT_STEPS = 3;
const FAILURE_VERDICTS = new Set(["WA", "PRESENTATION_ERROR", "PARTIAL", "RE", "TLE", "MLE", "CE"]);

function normalizeErrorKind(raw: unknown): string {
  const v = String(raw ?? "").trim().toLowerCase();
  if (!v) return "unknown";
  return v;
}

function sanitizeHint(raw: unknown): string {
  const cleaned = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length > 220 ? `${cleaned.slice(0, 220)}…` : cleaned;
}

function uniqueTrimmed(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function rootCauseFromErrorKind(errorKind: string, verdict: string): string {
  switch (errorKind) {
    case "off_by_one":
      return "Boundary condition mismatch (off-by-one) on edge inputs.";
    case "format":
    case "presentation_error":
      return "Output format differs from the expected contract (spaces/newlines/order).";
    case "logic":
      return "Core decision logic fails for at least one branch of inputs.";
    case "runtime":
      return "Runtime failure on one of the tests (exception or unsafe operation).";
    case "timeout":
    case "tle":
      return "Algorithmic complexity is likely too high for judge constraints.";
    case "oom":
    case "memory":
      return "Memory usage likely exceeds limits for some test cases.";
    case "compile":
    case "ce":
      return "Compilation failed due to syntax/type/signature issues.";
    default:
      if (verdict === "TLE") return "Execution exceeded time limits on at least one test.";
      if (verdict === "MLE") return "Execution exceeded memory limits on at least one test.";
      if (verdict === "CE") return "Compilation failed before running tests.";
      if (verdict === "RE") return "Runtime error occurred before producing valid output.";
      if (verdict === "WA" || verdict === "PARTIAL" || verdict === "PRESENTATION_ERROR") {
        return "Computed output does not fully match expected results.";
      }
      return "Submission failed on tests due to a correctness or constraints mismatch.";
  }
}

function fallbackNextSteps(errorKind: string, verdict: string): string[] {
  if (errorKind === "format" || verdict === "PRESENTATION_ERROR") {
    return [
      "Compare output line-by-line with expected output for the first failing public test.",
      "Remove extra spaces/newlines and print only required values.",
      "Re-check exact output order required by the statement."
    ];
  }

  if (errorKind === "off_by_one" || errorKind === "logic" || verdict === "WA" || verdict === "PARTIAL") {
    return [
      "Re-run the first failing public test and trace intermediate values step-by-step.",
      "Check edge cases: empty input, minimal/maximal values, and boundary indexes.",
      "Validate branch conditions where expected and actual outputs diverge."
    ];
  }

  if (errorKind === "timeout" || verdict === "TLE") {
    return [
      "Estimate current time complexity and identify nested repeated work.",
      "Replace repeated scans with precomputed aggregates/maps where possible.",
      "Test performance on large synthetic inputs close to constraints."
    ];
  }

  if (errorKind === "compile" || verdict === "CE") {
    return [
      "Fix compilation diagnostics first (syntax/types/signatures/imports).",
      "Rebuild with the exact entry point required by the judge.",
      "After successful compile, re-check failing tests for logic issues."
    ];
  }

  return [
    "Inspect the first failing test and compare expected vs actual output.",
    "Trace critical branches with small deterministic inputs.",
    "Re-run after each small fix to isolate the real root cause."
  ];
}

export function buildLearningFailureAnalysis(input: {
  verdict?: string | null;
  firstFailure?: LearningFirstFailure | null;
  hints?: string[] | null;
}): LearningFailureAnalysis | null {
  const verdict = String(input.verdict ?? "").toUpperCase();
  const firstFailure = input.firstFailure ?? null;
  const errorKind = normalizeErrorKind(firstFailure?.errorKind ?? null);
  const normalizedHints = uniqueTrimmed(
    (Array.isArray(input.hints) ? input.hints : [])
      .map(sanitizeHint)
      .filter(Boolean)
  );

  const hasFailureSignal = FAILURE_VERDICTS.has(verdict) || normalizedHints.length > 0 || Boolean(firstFailure);
  if (!hasFailureSignal) return null;

  const summary = firstFailure
    ? `First visible mismatch appears on public test #${firstFailure.testPublicIndex}.`
    : verdict
      ? `Submission verdict is ${verdict}.`
      : "Submission failed on tests.";

  const likelyRootCause = rootCauseFromErrorKind(errorKind, verdict);
  const steps = uniqueTrimmed([
    ...normalizedHints,
    ...fallbackNextSteps(errorKind, verdict)
  ]).slice(0, MAX_NEXT_STEPS);

  const confidence: LearningFailureAnalysisConfidence = firstFailure && errorKind !== "unknown"
    ? "high"
    : firstFailure || normalizedHints.length > 0
      ? "medium"
      : "low";

  return {
    summary,
    likelyRootCause,
    nextSteps: steps,
    confidence
  };
}
