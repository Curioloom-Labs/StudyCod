import { CodeSubmission, TestRunnerResult } from './interfaces';
import { compareOutputWithChecker, filterStderrWithLang } from '../codeExecutionService';
import { judgeWithSemaphore } from '../judgeWorker';
import type { JudgeLanguage, JudgeRequest, JudgeResponse } from '../judgeWorker/types';

function mapToJudgeLanguage(language: CodeSubmission["language"]): JudgeLanguage {
  return language === "JAVA" ? "java" : "python";
}

const SENTINEL_EXPECTED = "__STUDYCOD_SENTINEL_EXPECTED__";
export interface ITestRunner {
  runTests(submission: CodeSubmission): Promise<TestRunnerResult>;
}
export class TestRunner implements ITestRunner {
  async runTests(submission: CodeSubmission): Promise<TestRunnerResult> {
    const {
      code,
      language,
      testData
    } = submission;
    const testResults: TestRunnerResult['testResults'] = [];
    let passedCount = 0;

    if (!testData || testData.length === 0) {
      return {
        passed: true,
        passedCount: 0,
        totalCount: 0,
        testResults: [],
        correctnessScore: 0
      };
    }

    const judgeLang = mapToJudgeLanguage(language);
    const req: JudgeRequest = {
      submission_id: `grading_${submission.userId}_${submission.taskId}_${Date.now()}`,
      language: judgeLang,
      source: code,
      tests: testData.map((t, i) => ({
        id: i + 1,
        input: t.input ?? "",
        // Use sentinel output to force WA for successful runs, so we always get `actual`.
        output: SENTINEL_EXPECTED,
        hidden: false,
        group: "grading",
        weight: 1
      })),
      limits: {
        time_limit_ms: 10_000,
        memory_limit_mb: judgeLang === "python" ? 256 : 384,
        output_limit_kb: 256
      },
      checker: { type: "exact" },
      debug: true,
      run_all: true,
      rerun_failed_once: false
    };

    let res: JudgeResponse;
    try {
      res = await judgeWithSemaphore(req);
    } catch (e: any) {
      const errMsg = e instanceof Error ? e.message : String(e);
      for (let i = 0; i < testData.length; i++) {
        testResults.push({
          testIndex: i + 1,
          input: testData[i]?.input ?? "",
          expectedOutput: testData[i]?.output ?? "",
          actualOutput: "",
          passed: false,
          error: `JUDGE_UNAVAILABLE: ${errMsg}`
        });
      }
      return {
        passed: false,
        passedCount: 0,
        totalCount: testData.length,
        testResults,
        correctnessScore: 0
      };
    }

    if (res.verdict === "CE" && res.compile) {
      const compileErr = [res.compile.stderr, res.compile.stdout].filter(Boolean).join("\n").trim() || "Compilation error";
      for (let i = 0; i < testData.length; i++) {
        testResults.push({
          testIndex: i + 1,
          input: testData[i]?.input ?? "",
          expectedOutput: testData[i]?.output ?? "",
          actualOutput: "",
          passed: false,
          error: compileErr
        });
      }
      return {
        passed: false,
        passedCount: 0,
        totalCount: testData.length,
        testResults,
        correctnessScore: 0
      };
    }

    const byId = new Map<number, (JudgeResponse["tests"][number] & any)>();
    for (const t of res.tests || []) {
      const n = Number((t as any).test_id);
      if (Number.isFinite(n)) byId.set(n, t as any);
    }

    for (let i = 0; i < testData.length; i++) {
      const expected = testData[i]?.output ?? "";
      const input = testData[i]?.input ?? "";
      const r: any = byId.get(i + 1);
      // The judge may return fewer results than tests (crash/timeout after test N).
      // A missing result is a system error, not a wrong answer — don't let it be
      // silently reported as a failed test.
      const missingResult = r === undefined;
      const verdict = String(r?.verdict ?? "");
      const actualOutput = String(r?.actual ?? "");
      const ranOk = verdict === "WA" || verdict === "AC";
      // Uses the task's checker policy when provided; otherwise lenient (legacy).
      const passed = ranOk && compareOutputWithChecker(actualOutput ?? "", expected, submission.checker);
      if (passed) passedCount++;
      const stderr = String(r?.stderr ?? "");
      const error = passed
        ? undefined
        : (missingResult
            ? "No result from judge"
            : (stderr ? filterStderrWithLang(stderr, language) : (ranOk ? "Wrong answer" : verdict || "Execution failed")));
      testResults.push({
        testIndex: i + 1,
        input,
        expectedOutput: expected,
        actualOutput: actualOutput ?? "",
        passed,
        ...(error ? { error } : {})
      });
    }

    const correctnessScore = testData.length > 0 ? passedCount / testData.length : 0;
    return {
      passed: passedCount === testData.length,
      passedCount,
      totalCount: testData.length,
      testResults,
      correctnessScore
    };
  }
}