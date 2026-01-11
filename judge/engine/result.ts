export type Verdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
export interface JudgeLimits {
  time_limit_ms: number;
  memory_limit_mb: number;
  output_limit_kb: number;
}
export interface CheckerSpecExact {
  type: "exact";
}
export interface CheckerSpecWhitespace {
  type: "whitespace";
}
export interface CheckerSpecFloat {
  type: "float";
  epsilon: number;
}
export type CheckerSpec = CheckerSpecExact | CheckerSpecWhitespace | CheckerSpecFloat;
export interface TestCase {
  id: number | string;
  input?: string;
  output: string;
  hidden?: boolean;
}
export interface JudgeRequest {
  submission_id: string;
  language: "java" | "python" | "cpp";
  source: string;
  tests: TestCase[];
  limits: JudgeLimits;
  checker?: CheckerSpec;
  debug?: boolean;
  run_all?: boolean;
}
export interface CompileResult {
  ok: boolean;
  verdict: Verdict;
  message: string;
  /** Optional normalized error classification for UI (backward compatible). */
  error_kind?: string;
  stdout?: string;
  stderr?: string;
  time_ms: number;
  memory_kb: number | null;
}
export interface TestRunResult {
  test_id: number | string;
  verdict: Verdict;
  time_ms: number;
  memory_kb: number | null;
  message?: string;
  /** Optional normalized error classification for UI (backward compatible). */
  error_kind?: string;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}
export interface JudgeResponse {
  submission_id: string;
  verdict: Verdict;
  time_ms: number;
  memory_kb: number | null;
  compile?: CompileResult;
  tests: TestRunResult[];
}