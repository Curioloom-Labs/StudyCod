export type JudgeLanguage = "java" | "python" | "cpp" | "c" | "csharp" | "kotlin";
export type JudgeVerdict = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE";
export type CheckerSpec = {
  type: "exact";
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
  output: string;
  hidden?: boolean;
  group?: string;
  weight?: number;
}

export interface JudgeFile {
  // Relative path inside submission workdir (e.g. "Main.java").
  path: string;
  content: string;
}
export interface JudgeRequest {
  submission_id: string;
  language: JudgeLanguage;
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