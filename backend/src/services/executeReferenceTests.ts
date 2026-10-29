import { randomUUID } from 'crypto';
import { judgeWithSemaphore } from './judgeWorker';
import type { LLMTaskLanguage, TestDataExample } from './llm/LLMOrchestrator';
import type { JudgeLanguage } from './judgeWorker/types';
import { makeAIValidationError } from './llm/AIResponseValidator';
import { TaskContractReviewError } from './llm/TaskContractReview';
import { compareOutputWithChecker } from './codeExecutionService';
import { chooseDefaultCheckerFromExpectedOutputs } from '../utils/checkerSpec';

/** Generated reference code only runs inside the same sandbox as student code. */
export async function executeReferenceTests(
  source: string,
  language: LLMTaskLanguage,
  inputs: string[],
  publicExamples: TestDataExample[],
  signal?: AbortSignal,
  options: { allowEmptyOutput?: boolean; referenceExamplesAreAuthoritative?: boolean } = {},
): Promise<string[]> {
  const allInputs = [...publicExamples.map(example => example.input), ...inputs];
  const response = await judgeWithSemaphore({
    submission_id: `task_reference_${randomUUID()}`,
    language: language.toLowerCase() as JudgeLanguage,
    source,
    tests: allInputs.map((input, index) => ({ id: index, input, output: '', hidden: false })),
    limits: { time_limit_ms: 5000, memory_limit_mb: language === 'PYTHON' ? 256 : 384, output_limit_kb: 64 },
    checker: { type: 'nonempty' },
    debug: true, run_all: true, rerun_failed_once: false,
  }, { signal });
  if (response.compile?.ok === false || response.verdict === 'CE') {
    throw makeAIValidationError('generateTestData', `Reference program compilation failed: ${response.compile?.message ?? 'CE'}; ${(response.compile?.stderr || '').slice(0, 1500)}`);
  }
  const byId = new Map(response.tests.map(test => [String(test.test_id), test]));
  const outputs = allInputs.map((_, index) => {
    const test = byId.get(String(index));
    // The nonempty execution checker reports WA for a successful program whose
    // stdout is empty. Authored EDU tasks may explicitly require that result.
    const allowedEmpty = options.allowEmptyOutput && test?.verdict === 'WA'
      && typeof test.actual === 'string' && !test.actual.trim()
      && (test.exit_code === undefined || test.exit_code === 0);
    if (!test || (test.verdict !== 'AC' && !allowedEmpty) || typeof test.actual !== 'string'
      || (!options.allowEmptyOutput && !test.actual.trim())) {
      throw makeAIValidationError('generateTestData', `Reference program failed on input ${index + 1}: ${test?.verdict ?? 'missing result'}; ${(test?.stderr || test?.message || '').slice(0, 800)}`);
    }
    const output = test.actual.replace(/\r\n/g, '\n');
    return options.allowEmptyOutput ? output : output.trim();
  });
  for (let index = 0; index < publicExamples.length; index++) {
    const expected = publicExamples[index].output;
    if (!compareOutputWithChecker(outputs[index], expected, chooseDefaultCheckerFromExpectedOutputs([expected]))) {
      if (options.referenceExamplesAreAuthoritative) {
        throw makeAIValidationError('generateTestData',
          `Reference program disagrees with authored test ${index + 1}: expected ${JSON.stringify(expected).slice(0, 300)}, computed ${JSON.stringify(outputs[index]).slice(0, 300)}. Repair the reference program; do not change the authored expected answer.`);
      }
      throw new TaskContractReviewError('generateTestData', 'publicExamples', [
        `Example ${index + 1} contradicts reference execution: expected ${JSON.stringify(expected).slice(0, 300)}, computed ${JSON.stringify(outputs[index]).slice(0, 300)}. Regenerate and verify the complete task.`,
      ]);
    }
  }
  return outputs.slice(publicExamples.length);
}
