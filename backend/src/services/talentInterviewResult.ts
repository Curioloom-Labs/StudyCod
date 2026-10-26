import type { JudgeResponse, JudgeTestCase } from "./judgeWorker/types";
import { summarizeGrowthProjectCheck } from "./growthProjectCheckSummary";

/** Hidden-test diagnostics never belong in the participant-facing result. */
export function summarizeTalentInterviewExecution(result: JudgeResponse, tests: JudgeTestCase[], kind: string | null | undefined) {
  return {
    ...summarizeGrowthProjectCheck(result, tests), kind,
    compileDiagnostics: String(result.compile?.stderr ?? result.compile?.stdout ?? "").slice(0, 4096),
    ...(kind === "RUN" ? {
      stdout: String(result.tests[0]?.actual ?? "").slice(0, 65536),
      stderr: String(result.tests[0]?.stderr ?? "").slice(0, 4096),
      runOk: result.compile?.ok !== false && ["AC", "WA"].includes(result.tests[0]?.verdict ?? ""),
    } : {}),
  };
}
