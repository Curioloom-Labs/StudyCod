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
  constraints: ['$-100 \\le a,b \\le 100$.', 'The input contains exactly two integers.'],
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
    assert.match(result.description, /- \$-100 \\le a,b \\le 100\$\./);
  }
});

test('task condition draft has a registered JSON contract matching its three-example renderer', () => {
  const prompt = PROMPT_CATALOG['task.condition-draft'];
  assert.equal(prompt.output, 'json');
  assert.match(prompt.format, /exactly three/);
  assert.match(prompt.validation, /canonical Markdown formatting/);
  assert.match(prompt.format, /inline Markdown and LaTeX/);
});

test('EDU task condition uses structured JSON generation and forwards repair feedback', async () => {
  const calls: Array<{ prompt: string; schema: object; systemPrompt?: string; options?: LLMGenerateOptions }> = [];
  const responses: unknown[] = [draft, { valid: true, invalidSource: 'none', issues: [] }];
  const provider: LLMProvider = {
    generateText: async () => {
      throw new Error('EDU task condition must use structured JSON output');
    },
    generateJSON: async <T>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> => {
      calls.push({ prompt, schema, systemPrompt, options });
      return responses.shift() as T;
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

  assert.equal(calls.length, 2, 'structured draft is independently reviewed');
  const call = calls[0];
  assert.equal(call.options?.promptId, 'task.condition-draft');
  assert.match(call.prompt, /Use three distinct examples\./);
  assert.match(call.systemPrompt ?? '', /JSON-об’єкт/);
  assert.match(call.systemPrompt ?? '', /вбудований Markdown/);
  assert.ok((call.systemPrompt ?? '').includes("JSON пиши `" + String.fromCharCode(92).repeat(2) + "`, щоб"));
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.minItems, 3);
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.maxItems, 3);
  assert.match(result.description, /### Приклад 1/);
  assert.match(result.description, /### Приклад 3/);
});

test('task condition draft rejects missing examples and preserves explicitly empty stdout', () => {
  assert.throws(() => AIResponseValidator.validateGenerateTaskConditionDraft({ ...draft, examples: draft.examples.slice(0, 2) }));
  const emptyOutputDraft = AIResponseValidator.validateGenerateTaskConditionDraft({
    ...draft,
    statement: 'Print all input integers greater than 5 in their original order; print an empty line if none qualify.',
    inputFormat: 'One line contains three space-separated integers.',
    outputFormat: 'Print selected integers separated by single spaces, or print an empty line if none qualify.',
    constraints: ['There are exactly three integers.', 'Each integer is between -10 and 10.'],
    examples: [
      { input: '1 2 5', output: '' },
      { input: '6 4 9', output: '6 9' },
      { input: '-3 7 5', output: '7' },
    ],
  });
  assert.equal(emptyOutputDraft.examples[0].output, '');
  const formatted = formatTaskConditionDraft(emptyOutputDraft, 'en');
  assert.match(formatted, /Output:\n```\n\n```/);
});
