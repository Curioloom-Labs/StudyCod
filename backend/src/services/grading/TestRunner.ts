import { CodeSubmission, TestRunnerResult } from './interfaces';
import { executeCodeWithInput } from '../codeExecutionService';
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
    for (let i = 0; i < testData.length; i++) {
      const test = testData[i];
      try {
        const exec = await executeCodeWithInput(code, language, test.input, 10000);
        const actualOutput = exec.stdout ?? "";
        const normalizedExpected = this.normalizeOutput(test.output);
        const normalizedActual = this.normalizeOutput(actualOutput);
        const passed = normalizedExpected === normalizedActual;
        if (passed) passedCount++;
        testResults.push({
          testIndex: i + 1,
          input: test.input,
          expectedOutput: test.output,
          actualOutput,
          passed
        });
      } catch (error: any) {
        testResults.push({
          testIndex: i + 1,
          input: test.input,
          expectedOutput: test.output,
          actualOutput: '',
          passed: false,
          error: error.message || 'Execution error'
        });
      }
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
  private normalizeOutput(output: string): string {
    return output.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').toLowerCase();
  }
}