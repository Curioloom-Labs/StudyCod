import test from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider } from './LLMProvider';
import { generateReferenceTestData } from './ReferenceTestData';

test('expected outputs come from execution and the reviewer receives the executed source', async () => {
  const source = 'a,b=map(int,input().split()); print(a+b)';
  const inputs = ['2 3', '-7 4'];
  let calls = 0;
  const provider: LLMProvider = {
    async generateJSON<T>(prompt: string, schema: object): Promise<T> {
      if (++calls === 1) {
        assert.equal((schema as { properties: object }).properties.hasOwnProperty('tests'), false);
        return { referenceSolution: source, inputs } as T;
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

test('invalid or repeated reference inputs cannot reach code execution', async () => {
  for (const inputs of [['2 3', '2 3'], ['2 3'], ['2 3', ' ']]) {
    let executions = 0;
    const provider: LLMProvider = {
      async generateJSON<T>() { return { referenceSolution: 'print(5)', inputs } as T; },
      async generateText() { throw new Error('Unexpected text call'); },
    };
    await assert.rejects(generateReferenceTestData(provider, {
      taskDescription: 'Read two integers and print their sum.', lang: 'PYTHON', count: 2,
      executeReference: async () => { executions++; return ['5', '5']; },
    }), /distinct non-empty inputs/);
    assert.equal(executions, 0);
  }
});
