export type JudgeLanguage = "java" | "python" | "cpp";
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
}
export interface JudgeRequest {
  submission_id: string;
  language: JudgeLanguage;
  source: string;
  tests: JudgeTestCase[];
  limits: JudgeLimits;
  checker?: CheckerSpec;
  debug?: boolean;
  run_all?: boolean;
}
export interface JudgeCompileResult {
  ok: boolean;
  verdict: JudgeVerdict;
  message: string;
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
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}
export interface JudgeResponse {
  submission_id: string;
  verdict: JudgeVerdict;
  time_ms: number;
  memory_kb: number | null;
  compile?: JudgeCompileResult;
  tests: JudgeTestResult[];
}