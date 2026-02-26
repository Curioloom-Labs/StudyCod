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
  output: string;
  hidden?: boolean;
  group?: string;
  weight?: number;
}

export interface JudgeFile {
  // Relative path inside the submission workdir (e.g. "Main.java", "src/Foo.java").
  // Must not be absolute and must not contain ".." segments.
  path: string;
  content: string;
}
export interface JudgeRequest {
  submission_id: string;
  language: "java" | "python" | "cpp" | "c" | "csharp" | "kotlin";
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