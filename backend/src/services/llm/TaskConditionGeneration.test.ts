import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIResponseValidator } from './AIResponseValidator';
import { LLMOrchestrator } from './LLMOrchestrator';
import type { LLMGenerateOptions, LLMProvider } from './LLMProvider';
import { PROMPT_CATALOG } from '../../../../shared/ai/prompts';
import { formatTaskConditionDraft, type TaskConditionDraft } from './taskConditionDraft';

const draft: TaskConditionDraft = {
  statement: 'Read two integers and print their sum.',
  inputFormat: 'One line contains two integers a and b.',
  outputFormat: 'Print a + b.',
  constraints: '-100 <= a, b <= 100.',
  examples: [
    { input: '2 3', output: '5' },
    { input: '0 0', output: '0' },
    { input: '-4 7', output: '3' },
  ],
};

test('task condition draft renders exactly three complete examples accepted by the existing contract', () => {
  for (const locale of ['uk', 'en'] as const) {
    const result = AIResponseValidator.validateGenerateTaskCondition({
      description: formatTaskConditionDraft(draft, locale),
    });
    const headings = result.description.match(/^\s*#{1,4}\s*(?:приклад|example)(?=\s|$)/gim) ?? [];
    const fences = result.description.match(/^\s*```/gm) ?? [];
    assert.equal(headings.length, 3, `${locale}: example heading count`);
    assert.equal(fences.length, 12, `${locale}: complete input/output code blocks`);
  }
});

test('task condition draft has a registered JSON contract matching its three-example renderer', () => {
  const prompt = PROMPT_CATALOG['task.condition-draft'];
  assert.equal(prompt.output, 'json');
  assert.match(prompt.format, /exactly three/);
  assert.match(prompt.validation, /canonical Markdown formatting/);
});

test('EDU task condition uses structured JSON generation and forwards repair feedback', async () => {
  let call: { prompt: string; schema: object; systemPrompt?: string; options?: LLMGenerateOptions } | undefined;
  const provider: LLMProvider = {
    generateText: async () => {
      throw new Error('EDU task condition must use structured JSON output');
    },
    generateJSON: async <T>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> => {
      call = { prompt, schema, systemPrompt, options };
      return draft as T;
    },
  };
  const orchestrator = new LLMOrchestrator();
  const generate = (orchestrator as unknown as {
    generateTaskCondition_OpenRouter: (params: {
      topicTitle: string;
      taskTitle: string;
      taskType: 'PRACTICE' | 'CONTROL';
      language: 'PYTHON';
      userLanguage: 'uk';
      validationFeedback?: string;
    }, provider: LLMProvider) => Promise<{ description: string }>;
  }).generateTaskCondition_OpenRouter;

  const result = await generate.call(orchestrator, {
    topicTitle: 'Арифметика',
    taskTitle: 'Сума чисел',
    taskType: 'PRACTICE',
    language: 'PYTHON',
    userLanguage: 'uk',
    validationFeedback: 'Use three distinct examples.',
  }, provider);

  assert.ok(call);
  assert.equal(call.options?.promptId, 'task.condition-draft');
  assert.match(call.prompt, /Use three distinct examples\./);
  assert.match(call.systemPrompt ?? '', /JSON-об’єкт/);
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.minItems, 3);
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.maxItems, 3);
  assert.match(result.description, /### Приклад 1/);
  assert.match(result.description, /### Приклад 3/);
});

test('task condition draft rejects missing examples and empty expected output', () => {
  assert.throws(() => AIResponseValidator.validateGenerateTaskConditionDraft({ ...draft, examples: draft.examples.slice(0, 2) }));
  assert.throws(() => AIResponseValidator.validateGenerateTaskConditionDraft({
    ...draft,
    examples: [{ ...draft.examples[0], output: '  ' }, draft.examples[1], draft.examples[2]],
  }));
});
