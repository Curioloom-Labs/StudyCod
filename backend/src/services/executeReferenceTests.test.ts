import test from 'node:test';
import assert from 'node:assert/strict';
import * as sandbox from './judgeWorker';
import { executeReferenceTests } from './executeReferenceTests';
import type { JudgeRequest, JudgeResponse } from './judgeWorker/types';
import { TaskContractReviewError } from './llm/TaskContractReview';

function results(request: JudgeRequest, outputs: string[]): JudgeResponse {
  return {
    submission_id: request.submission_id, verdict: 'AC', time_ms: 1, memory_kb: 1,
    tests: outputs.map((actual, index) => ({ test_id: index, actual, verdict: 'AC', time_ms: 1, memory_kb: 1 })),
  };
}

test('reference code is compiled once in the judge and public examples run alongside hidden inputs', async (t) => {
  let calls = 0;
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
    calls++;
    assert.equal(request.source, 'print(input())');
    assert.equal(request.language, 'python');
    assert.equal(request.run_all, true);
    assert.deepEqual(request.tests.map(test => test.input), ['public', '  hidden  ']);
    return results(request, ['public\n', '  hidden  \n']);
  });
  assert.deepEqual(await executeReferenceTests('print(input())', 'PYTHON', ['  hidden  '], [{ input: 'public', output: 'public' }]), ['hidden']);
  assert.equal(calls, 1);
});

test('an executed public-example mismatch never becomes a fallback test', async (t) => {
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => results(request, ['10.0', '12.5']));
  await assert.rejects(executeReferenceTests('reference', 'JAVA', ['2.5 5.0 5.0'], [{ input: '1.0 10.5 2.5', output: '12.0' }]),
    error => error instanceof TaskContractReviewError && error.invalidSource === 'publicExamples');
});

test('failed, empty, missing, or truncated execution results cannot produce expected answers', async (t) => {
  for (const failure of ['RE', 'empty', 'missing', 'CE']) {
    t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
      const response = results(request, ['5']);
      if (failure === 'RE') response.tests[0].verdict = 'RE';
      if (failure === 'empty') response.tests[0].actual = '';
      if (failure === 'missing') response.tests = [];
      if (failure === 'CE') response.verdict = 'CE';
      return response;
    });
    await assert.rejects(executeReferenceTests('reference', 'PYTHON', ['2 3'], []), /Reference program/);
    t.mock.restoreAll();
  }
});
