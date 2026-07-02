export type JudgeLanguage =
  | "java" | "python" | "cpp" | "c" | "csharp" | "kotlin"
  | "js" | "go" | "rust" | "pascal"
  | "d" | "dart" | "haskell" | "lisp" | "lua" | "perl" | "php" | "ruby" | "swift";
export type JudgeVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
export type CheckerSpec = {
  type: "exact";
} | {
  type: "nonempty";
} | {
  type: "whitespace";
} | {
  type: "float";
  epsilon: number;
};
export interface JudgeLimits {
  time_limit_ms: number;
  memory_limit_mb: number;
  output_limit_kb: number;
}
export interface JudgeTestCase {
  id: number | string;
  input?: string;
  output?: string;
  hidden?: boolean;
  group?: string;
  weight?: number;
  /**
   * Optional host file references for large stored-test suites. When present the worker
   * streams the input from `input_path` and reads expected output from `output_path`
   * instead of the inline `input`/`output`.
   */
  input_path?: string;
  output_path?: string;
}

export interface JudgeFile {
  // Relative path inside submission workdir (e.g. "Main.java").
  path: string;
  content: string;
}
export interface JudgeRequest {
  submission_id: string;
  language: JudgeLanguage;
  /**
   * Optional compiler/version selector (e.g. "pypy3", "java21", "cpp20").
   * Must belong to `language`'s family. When omitted, the family default is used.
   */
  compiler?: string;
  // Backwards-compatible single-file source.
  source?: string;
  // Optional multi-file submission.
  files?: JudgeFile[];
  // Optional entry file hint.
  entry?: string;
  tests: JudgeTestCase[];
  limits: JudgeLimits;
  checker?: CheckerSpec;
  debug?: boolean;
  run_all?: boolean;
  rerun_failed_once?: boolean;
  /** Execution-visualizer trace mode for compiled languages (gdb-driven; trace JSON in stdout). */
  trace?: { mode: "step"; maxSteps?: number };
  /**
   * How to convert per-group test results into group score (and overall `score`).
   * - SUM (default): score is sum of weights for tests with `verdict=AC` inside the group.
   * - BINARY_ALL_OR_NOT: group gets full max_score only if *all* tests in the group are AC,
   *   otherwise group score is 0.
   */
  group_scoring_mode?: "SUM" | "BINARY_ALL_OR_NOT";
}
export interface JudgeCompileResult {
  ok: boolean;
  verdict: JudgeVerdict;
  message: string;
  error_kind?: string;
  stdout?: string;
  stderr?: string;
  time_ms: number;
  memory_kb: number | null;
}
export interface JudgeTestResult {
  test_id: number | string;
  verdict: JudgeVerdict;
  time_ms: number;
  memory_kb: number | null;
  message?: string;
  error_kind?: string;
  group?: string;
  weight?: number;
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

export interface GroupScore {
  group: string;
  score: number;
  max_score: number;
}

export interface JudgeResponse {
  submission_id: string;
  verdict: JudgeVerdict;
  time_ms: number;
  memory_kb: number | null;
  score?: number;
  max_score?: number;
  group_scores?: GroupScore[];
  compile?: JudgeCompileResult;
  tests: JudgeTestResult[];
}