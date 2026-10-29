import test from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { generateReferenceTestData } from './ReferenceTestData';
import { AIValidationError, makeAIValidationError } from './AIResponseValidator';
import { buildTaskValidationFeedback } from './TaskContractReview';

test('EDU reference generation keeps empty boundary outputs through schema validation and review', async () => {
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, instructions?: string): Promise<T> {
      if (++calls === 1) {
        assert.match(instructions ?? '', /Empty stdout or a blank output line is valid/);
        assert.equal(JSON.parse(prompt).authoritativeExamples, true);
        return { referenceSolution: 'print()', inputs: ['0\n', '1\n5\n', '2\n1 2\n', '3\n1 2 3\n'] } as T;
      }
      const payload = JSON.parse(prompt);
      assert.equal(payload.allowEmptyOutput, true);
      assert.deepEqual(payload.candidateTests.map((test: { output: string }) => test.output), ['\n', '']);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const result = await generateReferenceTestData(provider, {
    taskDescription: 'Read N and N integers. For N < 3 print an empty line; otherwise print the window sums.',
    lang: 'PYTHON', count: 2, allowEmptyOutput: true, referenceExamplesAreAuthoritative: true,
    executeReference: async () => ['\n', ''],
  });
  assert.deepEqual(result.map(test => test.output), ['\n', '']);
  assert.equal(calls, 2);
});

test('expected outputs come from execution and the reviewer receives the executed source', async () => {
  const source = 'a,b=map(int,input().split()); print(a+b)';
  const inputs = ['2 3', '-7 4'];
  const candidates = [...inputs, '10 1', '0 0'];
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, schema: object): Promise<T> {
      if (++calls === 1) {
        assert.equal((schema as { properties: object }).properties.hasOwnProperty('tests'), false);
        assert.equal((schema as { properties: { inputs: { minItems: number; maxItems: number } } }).properties.inputs.minItems, 4);
        return { referenceSolution: source, inputs: candidates } as T;
      }
      const payload = JSON.parse(prompt);
      assert.equal(payload.executedReference.source, source);
      assert.deepEqual(payload.candidateTests, [{ input: '2 3', output: '5' }, { input: '-7 4', output: '-3' }]);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read integers a and b in [-100,100]. Print a+b as one integer.', lang: 'PYTHON', count: 2,
    executeReference: async (program, stdin) => {
      assert.equal(program, source);
      assert.deepEqual(stdin, inputs);
      return stdin.map(input => String(input.split(' ').map(Number).reduce((a, b) => a + b)));
    },
  });
  assert.deepEqual(tests.map(test => test.output), ['5', '-3']);
  assert.equal(calls, 2);
});

test('public example and repeated candidate inputs are discarded before execution', async () => {
  let calls = 0;
  const source = 'a,b=map(int,input().split()); print(a+b)';
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string): Promise<T> {
      if (++calls === 1) return { referenceSolution: source, inputs: ['2 3', '4 5', '4 5', '6 7'] } as T;
      const payload = JSON.parse(prompt);
      assert.deepEqual(payload.candidateTests.map((test: { input: string }) => test.input), ['4 5', '6 7']);
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const tests = await generateReferenceTestData(provider, {
    taskDescription: 'Read two integers a and b in [-100,100]. Print a+b as one integer.', lang: 'PYTHON', count: 2,
    publicExamples: [{ input: '2 3', output: '5' }],
    executeReference: async (program, stdin) => {
      assert.equal(program, source);
      assert.deepEqual(stdin, ['4 5', '6 7']);
      return ['9', '13'];
    },
  });
  assert.deepEqual(tests.map(test => test.output), ['9', '13']);
});

test('insufficient distinct non-public reference inputs cannot reach code execution', async () => {
  for (const inputs of [['2 3', '2 3', '2 3', '2 3'], ['2 3'], ['2 3', ' ', '2 3', '2 3']]) {
    let executions = 0;
    const provider: LLMProvider = {
      async generateJSON<T>() { return { referenceSolution: 'print(5)', inputs } as T; },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    await assert.rejects(generateReferenceTestData(provider, {
      taskDescription: 'Read two integers and print their sum.', lang: 'PYTHON', count: 2,
      publicExamples: [{ input: '2 3', output: '5' }],
      executeReference: async () => { executions++; return ['5', '5']; },
    }), /Reference test generation validation failed/);
    assert.equal(executions, 0);
  }
});

test('a Java or C++ reference is rejected before the Python executor runs', async () => {
  for (const referenceSolution of [
    'public class Main { public static void main(String[] args) { System.out.println(5); } }',
    '#include <iostream>\nint main() { std::cout << 5; }',
  ]) {
    let executions = 0;
    const provider: LLMProvider = {
      async generateJSON<T>() { return { referenceSolution, inputs: ['1', '2', '3'] } as T; },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    await assert.rejects(generateReferenceTestData(provider, {
      taskDescription: 'Read an integer and print its double.', lang: 'JAVA', count: 1,
      executeReference: async () => { executions++; return ['2']; },
    }), /referenceSolution is (JAVA|CPP) code; return a complete Python 3 oracle/);
    assert.equal(executions, 0);
  }
});

test('reference generation exposes validation feedback and clearly requires a Python oracle', async () => {
  const seen: Array<{ payload: Record<string, unknown>; instructions: string }> = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, systemPrompt: string): Promise<T> {
      seen.push({ payload: JSON.parse(prompt), instructions: systemPrompt });
      if (seen.length === 1) return { referenceSolution: 'print(5)', inputs: ['1', '2', '3'] } as T;
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  await generateReferenceTestData(provider, {
    taskDescription: 'Read an integer and print 5.', lang: 'JAVA', count: 1,
    validationFeedback: 'Previous oracle was Java; return Python.',
    executeReference: async () => ['5'],
  });
  assert.equal(seen[0].payload.validationFeedback, 'Previous oracle was Java; return Python.');
  assert.match(seen[0].instructions, /referenceSolution MUST be Python 3 source code/i);
  assert.match(seen[0].instructions, /do not return Java or C\+\+/i);
});

test('compiler failures preserve the rejected Python source for a bounded repair and fresh review', async () => {
  const broken = 'if __name__ == "__main__\':\n    print(int(input()) + 1)';
  const fixed = 'print(int(input()) + 1)';
  const payloads: Array<Record<string, unknown>> = [];
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, _schema: object, _system?: string, options?: LLMGenerateOptions): Promise<T> {
      payloads.push(JSON.parse(prompt));
      if (payloads.length === 1) return { referenceSolution: broken, inputs: ['2', '3', '4'] } as T;
      if (payloads.length === 2) {
        assert.equal(options?.validationRetry, true);
        return { referenceSolution: fixed, inputs: ['2', '3', '4'] } as T;
      }
      assert.equal(payloads.length, 3, 'repair must still undergo independent test review');
      return { valid: true, invalidSource: 'none', issues: [] } as T;
    },
    async generateText() { throw new Error('Unexpected text call'); },
  };
  const params = {
    taskDescription: 'Read one integer n in [1,10]. Print n+1.', lang: 'JAVA' as const, count: 1,
    publicExamples: [{ input: '1', output: '2' }],
    executeReference: async (source: string, inputs: string[]) => {
      if (source === broken) throw makeAIValidationError('generateTestData', 'Reference program compilation failed: SyntaxError: unterminated string literal');
      assert.equal(source, fixed);
      return inputs.map(input => String(Number(input) + 1));
    },
  };
  let feedback = '';
  await assert.rejects(generateReferenceTestData(provider, params), error => {
    assert.ok(error instanceof AIValidationError);
    feedback = buildTaskValidationFeedback(error.message, error.rawResponse);
    return true;
  });
  const result = await generateReferenceTestData(provider, { ...params, validationFeedback: feedback });
  assert.deepEqual(result.map(test => test.output), ['3']);
  assert.match(feedback, /REPAIR THE REJECTED REFERENCE PROGRAM/);
  assert.ok(feedback.includes(JSON.stringify(broken)), 'quotes in the rejected source must survive feedback serialization');
  assert.equal(payloads[1].statement, params.taskDescription);
  assert.equal(payloads[1].validationFeedback, feedback);
});
