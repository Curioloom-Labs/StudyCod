import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider } from './LLMProvider';
import { AIResponseValidator } from './AIResponseValidator';
import { LLMOrchestrator, type AiTaskGenerationResult } from './LLMOrchestrator';
import { validateAndReviewGeneratedTask } from './GeneratedTaskContract';
import { buildOlympiadPracticeContract } from '../learning/learningContract';

// Regression: the production model returned a correct answer with a prose
// outputFormat. Literal comparison rejected the task before semantic review.
const cafeTask: AiTaskGenerationResult = {
  title: 'Обчислення вартості замовлення', topic: 'Типи даних і змінні', difficulty: 1,
  theoryMarkdown: 'Змінні зберігають значення різних типів.',
  practicalTask: 'У кафе замовлено 5 порцій по 12.5 за порцію. Використайте ці значення, обчисліть добуток і виведіть лише загальну вартість одним числом в одному рядку без міток або пояснень. Усі значення задано в умові, вхідних даних немає.',
  ioType: 'NO_INPUT_FIXED_OUTPUT', inputFormat: 'Вхідних даних немає.',
  outputFormat: 'Один рядок, що містить результат обчислення.',
  constraints: 'Кількість порцій — 5, ціна — 12.5. Вхідних даних немає.',
  examples: [{ input: '', output: '62.5', explanation: '5 помножити на 12.5 дорівнює 62.5.' }],
  codeTemplate: '# TODO',
};

function providerWith(responses: unknown[], calls: string[] = []): LLMProvider {
  return {
    async generateJSON<T>(prompt: string): Promise<T> {
      calls.push(prompt);
      if (!responses.length) throw new Error('Reviewer unavailable');
      return responses.shift() as T;
    },
    async generateText(): Promise<never> { throw new Error('Unexpected text request'); },
  };
}

const approved = { valid: true, invalidSource: 'none', issues: [] };

test('a correct descriptive fixed-output contract is reviewed before canonicalization', async () => {
  const calls: string[] = [];
  const result = await validateAndReviewGeneratedTask(providerWith([approved], calls), cafeTask, {});
  assert.equal(result.outputFormat, '62.5');
  assert.equal(result.practicalTask, cafeTask.practicalTask);
  assert.deepEqual(result.examples, cafeTask.examples);
  assert.equal(JSON.parse(calls[0]).outputFormat, cafeTask.outputFormat);
  assert.equal(JSON.parse(calls[0]).publicExamples[0].output, '62.5');
  assert.equal(calls.length, 1);
  assert.doesNotThrow(() => AIResponseValidator.validateGenerateTask(result));
  assert.equal(cafeTask.outputFormat, 'Один рядок, що містить результат обчислення.');
});

test('incorrect arithmetic and conflicting literal stdout remain rejected', async () => {
  for (const candidate of [
    { ...cafeTask, examples: [{ input: '', output: '60', explanation: 'Wrong product.' }] },
    { ...cafeTask, outputFormat: '60' },
  ]) {
    await assert.rejects(validateAndReviewGeneratedTask(providerWith([
      { valid: false, invalidSource: 'publicExamples', issues: ['5 * 12.5 is 62.5; the contract contains 60.'] },
    ]), candidate, {}), /TASK_CONTRACT_REVIEW_FAILED/);
  }
});

test('an unavailable or malformed reviewer cannot authorize canonicalization', async () => {
  await assert.rejects(validateAndReviewGeneratedTask(providerWith([]), cafeTask, {}), /Reviewer unavailable/);
  await assert.rejects(validateAndReviewGeneratedTask(providerWith([{}, {}]), cafeTask, {}), /invalid verdict/);
});

test('conflicting public outputs and nonempty stdin are never reconciled', async () => {
  for (const candidate of [
    { ...cafeTask, examples: [...cafeTask.examples, { input: '', output: '60', explanation: 'Conflict.' }] },
    { ...cafeTask, examples: [...cafeTask.examples, { input: '5', output: '62.5', explanation: 'Unexpected input.' }] },
  ]) {
    const calls: string[] = [];
    await assert.rejects(validateAndReviewGeneratedTask(providerWith([approved], calls), candidate, {}));
    assert.equal(calls.length, 0);
  }
});

test('already canonical fixed output still receives independent semantic review', async () => {
  const calls: string[] = [];
  const result = await validateAndReviewGeneratedTask(providerWith([approved], calls), { ...cafeTask, outputFormat: '62.5' }, {});
  assert.equal(result.outputFormat, '62.5');
  assert.equal(calls.length, 1);
});

test('Olympiad tasks drop a vague output catch-all only after deterministic validation and review', async () => {
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'maximum-subarray', topicTitle: 'Maximum subarray',
    runtime: 'PYTHON', objective: 'Find the maximum non-empty contiguous subarray sum.', sequence: 2, total: 3,
  });
  const task: AiTaskGenerationResult = {
    ...cafeTask,
    title: 'Максимальний підмасив: сума відрізка',
    topic: 'Максимальний підмасив',
    difficulty: 3,
    practicalTask: 'Для масиву цілих чисел знайдіть найбільшу суму непорожнього суцільного відрізка та виведіть її одним цілим числом.',
    ioType: 'STDIN_STDOUT',
    inputFormat: 'Перший рядок містить n, другий — n цілих чисел.',
    outputFormat: 'Виведіть найбільшу суму непорожнього відрізка тощо.',
    constraints: '1 ≤ n ≤ 200000; |a[i]| ≤ 10^9.',
    examples: [{ input: '5\n-2 3 -1 4 -5', output: '6', explanation: 'Сума 3 + -1 + 4 дорівнює 6.' }],
  };
  const reviewedPrompts: string[] = [];
  let beforeReviewOutput: string | undefined;
  const result = await validateAndReviewGeneratedTask(providerWith([approved], reviewedPrompts), task, {}, {
    learningContract: JSON.stringify(contract),
    beforeReview: (candidate) => { beforeReviewOutput = candidate.outputFormat; },
  });

  assert.equal(result.outputFormat, 'Виведіть найбільшу суму непорожнього відрізка.');
  assert.equal(beforeReviewOutput, result.outputFormat);
  assert.equal(JSON.parse(reviewedPrompts[0]).outputFormat, result.outputFormat);
  assert.equal(reviewedPrompts.length, 1);
  await assert.rejects(validateAndReviewGeneratedTask(providerWith([approved]), task, {}), /outputFormat is vague/);
});

test('the task generation pipeline accepts reviewed prose output without a fallback or regeneration', async () => {
  const calls: string[] = [];
  const provider = providerWith([cafeTask, approved], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({
    topicTitle: cafeTask.topic, theory: cafeTask.theoryMarkdown, lang: 'PYTHON', topicIndex: 1,
    anchor: { topic: cafeTask.topic, coreOperation: 'вартість', allowedScope: [], forbiddenScope: [] },
    allowedIoTypes: ['NO_INPUT_FIXED_OUTPUT'], semanticRetries: 0,
  }, provider);
  assert.ok(result.title.endsWith(cafeTask.title));
  assert.equal(result.outputFormat, '62.5');
  assert.equal(calls.length, 2);
});
