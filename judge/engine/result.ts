import type { LanguageId } from "../languages/types";
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
export interface CheckerSpecNonEmpty {
  type: "nonempty";
}
export interface CheckerSpecFloat {
  type: "float";
  epsilon: number;
}
export type CheckerSpec = CheckerSpecExact | CheckerSpecWhitespace | CheckerSpecNonEmpty | CheckerSpecFloat;
export interface TestCase {
  id: number | string;
  input?: string;
  output?: string;
  hidden?: boolean;
  group?: string;
  weight?: number;
  /**
   * Optional host file references. When present the worker streams the test input from
   * `input_path` (constant memory) and reads expected output from `output_path`, instead
   * of using the inline `input`/`output`. Used for large stored-test suites.
   */
  input_path?: string;
  output_path?: string;
}

export interface JudgeFile {
  // Relative path inside the submission workdir (e.g. "Main.java", "src/Foo.java").
  // Must not be absolute and must not contain ".." segments.
  path: string;
  content: string;
}
export interface JudgeRequest {
  submission_id: string;
  language: LanguageId;
  /**
   * Optional compiler/version selector (e.g. "pypy3", "java21", "cpp20").
   * Must belong to `language`'s family. When omitted, the family default is used.
   */
  compiler?: string;
  // Backwards-compatible single-file source.
  // When `files` is provided, `source` may be omitted.
  source?: string;
  // Optional multi-file submission.
  // When present, the judge will write these files into the sandbox workdir.
  files?: JudgeFile[];
  // Optional hint about the entry file (e.g. "Main.java", "main.py").
  // If omitted, defaults are inferred by language.
  entry?: string;
  tests: TestCase[];
  limits: JudgeLimits;
  checker?: CheckerSpec;
  debug?: boolean;
  run_all?: boolean;
  rerun_failed_once?: boolean;
  /**
   * Execution-visualizer trace mode. When set, compiled (native) languages are compiled with
   * debug info and run under gdb instead of normally; the unified trace JSON is emitted to the
   * test's stdout (between sentinels) for the backend to parse. Single-test requests only.
   */
  trace?: { mode: "step"; maxSteps?: number };
  /**
   * How to convert per-group test results into group score (and overall `score`).
   * - SUM (default): score is sum of weights for tests with `verdict=AC` inside the group.
   * - BINARY_ALL_OR_NOT: group gets full max_score only if *all* tests in the group are AC,
   *   otherwise group score is 0.
   */
  group_scoring_mode?: "SUM" | "BINARY_ALL_OR_NOT";
}
export interface CompileResult {
  ok: boolean;
  verdict: Verdict;
  message: string;
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
  verdict: Verdict;
  time_ms: number;
  memory_kb: number | null;
  score?: number;
  max_score?: number;
  group_scores?: GroupScore[];
  compile?: CompileResult;
  tests: TestRunResult[];
}