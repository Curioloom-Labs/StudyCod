import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider } from './LLMProvider';
import { LLMOrchestrator, getLLMOrchestrator, type AiTaskGenerationResult } from './LLMOrchestrator';
import { safeAICall } from '../ai/safeAICall';
import { makeAIValidationError } from './AIResponseValidator';
import { MAX_TASK_DESCRIPTION_CHARS, requireCompleteTaskDescription, resolveTestDataIoType, reviewGeneratedTask, reviewGeneratedTests } from './TaskContractReview';

const task: AiTaskGenerationResult = {
  title: 'Sum', topic: 'Arithmetic', difficulty: 1, theoryMarkdown: 'Addition combines values.',
  practicalTask: 'Read two integers a and b from standard input and calculate their sum. Print exactly one integer containing a + b, with no labels, extra values, or explanations. The input contains the two integers on one line separated by a space.',
  ioType: 'STDIN_STDOUT', inputFormat: 'Two space-separated integers a and b on one line.',
  outputFormat: 'Print one integer: the sum of a and b.', constraints: '-100 <= a, b <= 100.',
  examples: [{ input: '2 3', output: '5', explanation: '2 + 3 = 5.' }], codeTemplate: '# TODO',
};

function fakeProvider(responses: unknown[], calls: string[] = []): LLMProvider {
  return {
    async generateJSON<T>(prompt: string): Promise<T> {
      calls.push(prompt);
      if (!responses.length) throw new Error('Unexpected provider call');
      return responses.shift() as T;
    },
    async generateText(): Promise<string> { throw new Error('Unexpected text request'); },
  };
}

test('task review rejects missing rounding rules instead of completing them', async () => {
  const provider = fakeProvider([{ valid: false, issues: ['Specify rounding and decimal precision.'] }]);
  await assert.rejects(reviewGeneratedTask(provider, task), /TASK_CONTRACT_REVIEW_FAILED.*rounding/);
});

test('task review receives every public example and only the visible contract', async () => {
  const calls: string[] = [];
  const examples = [...task.examples, { input: '0 0', output: '0', explanation: 'Zero.' }];
  await reviewGeneratedTask(fakeProvider([{ valid: true, issues: [] }], calls), { ...task, examples });
  const payload = JSON.parse(calls[0]);
  assert.equal(payload.publicExamples.length, 2);
  assert.equal(payload.practicalTask, task.practicalTask);
  assert.equal(payload.constraints, task.constraints);
  assert.equal(payload.theoryMarkdown, undefined);
  assert.equal(payload.title, undefined);
  assert.equal(payload.codeTemplate, undefined);
});

test('test review rejects a mathematically wrong expected answer', async () => {
  await assert.rejects(reviewGeneratedTests(fakeProvider([{ valid: false, issues: ['Test 1: 2 + 3 is 5, not 6.'] }]), 'Read two integers and print their sum.', 'STDIN_STDOUT', [{ input: '2 3', output: '6' }]), /Test 1/);
});

test('review fails closed for missing, malformed, or inconsistent verdicts', async () => {
  for (const verdict of [{}, { valid: 'true', issues: [] }, { valid: true, issues: ['Wrong answer.'] }, { valid: false, issues: [] }]) {
    await assert.rejects(reviewGeneratedTask(fakeProvider([verdict]), task), /TASK_CONTRACT_REVIEW_FAILED/);
  }
});

test('review propagates provider errors rather than accepting unreviewed examples', async () => {
  const provider: LLMProvider = {
    async generateJSON(): Promise<never> { throw new Error('Review unavailable'); },
    async generateText(): Promise<never> { throw new Error('Unexpected call'); },
  };
  await assert.rejects(reviewGeneratedTask(provider, task), /Review unavailable/);
});

test('statement length limits reject oversized contracts without truncating their rules', () => {
  const description = 'Read input. ' + 'x'.repeat(9000) + '\nOutput exactly two lines, including zero.';
  assert.equal(requireCompleteTaskDescription(description), description);
  assert.throws(() => requireCompleteTaskDescription('x'.repeat(MAX_TASK_DESCRIPTION_CHARS + 1)), /refusing to truncate/);
});

test('IO inference uses the statement and rejects unspecified input modes', () => {
  assert.equal(resolveTestDataIoType('Read N and print N.'), 'STDIN_STDOUT');
  assert.equal(resolveTestDataIoType('Вхідних даних немає. Виведіть READY.'), 'NO_INPUT_FIXED_OUTPUT');
  assert.equal(resolveTestDataIoType('There is no input. Print any non-empty line.'), 'NO_INPUT_FREE_OUTPUT');
  assert.throws(() => resolveTestDataIoType('Calculate something useful.'), /Cannot determine/);
});

// Exercise the generation/review/retry sequence with a provider double, without
// external AI calls or environment-dependent provider routing.
test('test generation rejects bad answers and retries with reviewer feedback and the full statement', async () => {
  const calls: string[] = [];
  const statement = 'Read two integers in [-100, 100] and print their sum.\n' + 'Context. '.repeat(700) + '\nFINAL RULE: Print exactly one integer.';
  const provider = fakeProvider([
    { tests: [{ input: '2 3', output: '6' }] },
    { valid: false, issues: ['Test 1: expected sum is 5.'] },
    { tests: [{ input: '2 3', output: '5' }] },
    { valid: true, issues: [] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTestDataWithAI_OpenRouter(params: object, provider: LLMProvider): Promise<unknown>;
  };
  const result = await orchestrator.generateTestDataWithAI_OpenRouter({ taskDescription: statement, taskTitle: 'Sum', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT' }, provider);
  assert.deepEqual(result, [{ input: '2 3', output: '5', explanation: undefined }]);
  assert.equal(calls.length, 4);
  assert.ok(calls[0].includes('FINAL RULE:'));
  assert.equal(JSON.parse(calls[1]).statement, statement);
  assert.ok(calls[2].includes('Test 1: expected sum is 5.'));
});

test('task generation reviews public examples before returning and retries an ambiguous task', async () => {
  const calls: string[] = [];
  const provider = fakeProvider([
    task,
    { valid: false, issues: ['Missing bounds for input a.'] },
    task,
    { valid: true, issues: [] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({ topicTitle: 'Arithmetic', theory: 'Addition.', lang: 'PYTHON', topicIndex: 1, anchor: { topic: 'Arithmetic', coreOperation: 'sum', allowedScope: ['addition'], forbiddenScope: [] }, allowedIoTypes: ['STDIN_STDOUT'], semanticRetries: 1 }, provider);
  assert.equal(result.examples[0].output, '5');
  assert.equal(calls.length, 4);
  assert.ok(calls[2].includes('Missing bounds for input a.'));
});

test('safe test generation preserves the statement including literals and Markdown fences', async (t) => {
  const description = 'Read one line containing ``` and print it unchanged.\n' + 'Context. '.repeat(1000) + '\nThe literal token is &lt;tag&gt;.';
  let received = '';
  t.mock.method(getLLMOrchestrator(), 'generateTestDataWithAI', async (params: { taskDescription: string }) => {
    received = params.taskDescription;
    return [{ input: '```', output: '```' }];
  });
  const result = await safeAICall('generateTestData', { taskDescription: description, taskTitle: 'Echo', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT' }, { maxAttempts: 1 });
  assert.equal(result.success, true);
  assert.equal(received, description);
});

test('outer task retries pass the actual review failure back to generation', async (t) => {
  let attempts = 0;
  let feedback = '';
  t.mock.method(getLLMOrchestrator(), 'generateTaskWithAI', async (params: { validationFeedback?: string }) => {
    if (++attempts === 1) throw makeAIValidationError('generateTask', 'Missing input bounds.');
    feedback = params.validationFeedback ?? '';
    return task;
  });
  const result = await safeAICall('generateTask', { topicTitle: 'Arithmetic', theory: 'Addition.', lang: 'JAVA', numInTopic: 1, isFirstTask: false, allowedIoTypes: ['STDIN_STDOUT'] }, { maxAttempts: 2 });
  assert.equal(result.success, true);
  assert.equal(feedback, 'Missing input bounds.');
});
