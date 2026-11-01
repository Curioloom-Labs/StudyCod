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

test('scientific reference execution uses the Python libraries runtime and its task bootstrap', async (t) => {
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
    assert.equal(request.compiler, 'python-libs');
    assert.deepEqual(request.files?.map(file => file.path), ['main.py', 'student/main.py']);
    assert.match(request.files?.[0].content ?? '', /import cv2/);
    assert.equal(request.tests[0].input, JSON.stringify({ stdin: '3\n', assets: [], events: [], mode: 'check' }));
    return results(request, ['3\n']);
  });
  assert.deepEqual(await executeReferenceTests('import cv2\nprint(3)', 'PYTHON', ['3\n'], [], undefined, {
    pythonRuntimeProfile: 'SCIENTIFIC',
  }), ['3']);
});

test('Tkinter reference execution replays UI events and returns the exact compact widget snapshot', async (t) => {
  const snapshot = { title: 'Counter', geometry: '320x120', widgets: [{ type: 'Button', text: 'Add', children: [] }] };
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
    assert.equal(request.compiler, 'python-gui');
    assert.deepEqual(request.files?.map(file => file.path), ['main.py', 'student/main.py']);
    assert.match(request.files?.[0].content ?? '', /import tkinter as tk/);
    assert.equal(request.tests[0].input, JSON.stringify({ stdin: '', assets: [], events: [{ type: 'click', x: 20, y: 30 }], mode: 'check' }));
    return results(request, [JSON.stringify(snapshot) + '\n']);
  });
  assert.deepEqual(await executeReferenceTests('import tkinter as tk', 'PYTHON', ['{"events":[{"type":"click","x":20,"y":30}]}'], [], undefined, {
    pythonRuntimeProfile: 'TKINTER',
  }), [JSON.stringify(snapshot)]);
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

test('EDU accepts successful empty-output boundary cases and preserves literal whitespace', async (t) => {
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
    const response = results(request, ['\n', '', '  3.00  \n']);
    response.tests[0].verdict = 'WA';
    response.tests[0].exit_code = 0;
    response.tests[1].verdict = 'WA';
    response.tests[1].exit_code = 0;
    return response;
  });
  assert.deepEqual(await executeReferenceTests('reference', 'PYTHON', ['1\n5', '3\n3 3 3'], [{ input: '0\n', output: '\n' }], undefined,
    { allowEmptyOutput: true, referenceExamplesAreAuthoritative: true }), ['', '  3.00  \n']);
});

test('EDU empty-output support cannot accept runtime failures or nonzero exits', async (t) => {
  for (const verdict of ['RE', 'TLE', 'WA'] as const) {
    t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => {
      const response = results(request, ['']);
      response.tests[0].verdict = verdict;
      response.tests[0].exit_code = 1;
      return response;
    });
    await assert.rejects(executeReferenceTests('reference', 'PYTHON', ['0'], [], undefined, { allowEmptyOutput: true }), /Reference program failed/);
    t.mock.restoreAll();
  }
});

test('an authored test mismatch asks to repair the oracle without classifying teacher answers as generated examples', async (t) => {
  t.mock.method(sandbox, 'judgeWithSemaphore', async (request: JudgeRequest) => results(request, ['9', '8']));
  await assert.rejects(executeReferenceTests('reference', 'PYTHON', ['3'], [{ input: '2', output: '4' }], undefined,
    { referenceExamplesAreAuthoritative: true }), error => {
      assert.ok(error instanceof Error);
      assert.equal(error instanceof TaskContractReviewError, false);
      assert.match(error.message, /disagrees with authored test/);
      return true;
    });
});
