import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIResponseValidator } from './AIResponseValidator';
import { LLMOrchestrator } from './LLMOrchestrator';
import type { LLMGenerateOptions, LLMProvider } from './LLMProvider';
import { PROMPT_CATALOG } from '../../../../shared/ai/prompts';
import { formatTaskConditionDraft, normalizeTaskExampleOutput, type TaskConditionDraft } from './taskConditionDraft';
import { reviewGeneratedTaskCondition } from './TaskContractReview';
import { runWithPromptExecutionContext } from './promptExecution';
import * as referenceExecution from '../executeReferenceTests';

const draft: TaskConditionDraft = {
  statement: 'Read two integers and print their sum.',
  inputFormat: 'One line contains two integers a and b.',
  outputFormat: 'Print a + b.',
  constraints: ['$-100 \\le a,b \\le 100$.', 'The input contains exactly two integers.'],
  subtasks: [],
  referenceSolution: 'a, b = map(int, input().split())\nprint(a + b)',
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
  assert.match(prompt.validation, /second-provider task-contract review/);
  assert.match(prompt.format, /inline Markdown and LaTeX/);
  assert.match(prompt.format, /percentage/);
});

test('condition renderer includes learner-facing subtasks with weights when requested', () => {
  const result = formatTaskConditionDraft({
    ...draft,
    subtasks: [
      { name: 'Positive values', description: 'Handle positive inputs.', weightPercent: 40 },
      { name: 'All integers', description: 'Handle zero and negative inputs.', weightPercent: 60 },
    ],
  }, 'en');
  assert.match(result, /## Subtasks/);
  assert.match(result, /### 1\. Positive values — 40%/);
  assert.match(result, /### 2\. All integers — 60%/);
  assert.deepEqual(AIResponseValidator.validateGenerateTaskConditionDraft({
    ...draft,
    subtasks: [
      { name: 'Positive values', description: 'Handle positive inputs.', weightPercent: 40 },
      { name: 'All integers', description: 'Handle zero and negative inputs.', weightPercent: 60 },
    ],
  }).subtasks.map(item => item.weightPercent), [40, 60]);
  assert.throws(() => AIResponseValidator.validateGenerateTaskConditionDraft({
    ...draft,
    subtasks: [
      { name: 'Positive values', description: 'Handle positive inputs.', weightPercent: 40 },
      { name: 'All integers', description: 'Handle zero and negative inputs.', weightPercent: 50 },
    ],
  }));
});

test('EDU task condition uses structured JSON generation and forwards repair feedback', async t => {
  t.mock.method(referenceExecution, 'executeReferenceTests', async (source: string, language: string, inputs: string[], examples: Array<{ input: string; output: string }>) => {
    assert.equal(language, 'PYTHON');
    assert.equal(inputs.length, 3);
    assert.equal(examples.length, 0);
    assert.match(source, /print\(a \+ b\)/);
    return ['5', '0', '3'];
  });
  const calls: Array<{ prompt: string; schema: object; systemPrompt?: string; options?: LLMGenerateOptions }> = [];
  const draftWithMistypedExample: TaskConditionDraft = {
    ...draft,
    examples: [{ ...draft.examples[0], output: '55' }, ...draft.examples.slice(1)] as TaskConditionDraft['examples'],
  };
  const responses: unknown[] = [draftWithMistypedExample, { valid: true, invalidSource: 'none', issues: [] }];
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
      language: 'JAVA';
      userLanguage: 'uk';
      validationFeedback?: string;
    }, provider: LLMProvider) => Promise<{ description: string }>;
  }).generateTaskCondition_OpenRouter;

  const result = await generate.call(orchestrator, {
    topicTitle: 'Арифметика',
    taskTitle: 'Сума чисел',
    taskType: 'PRACTICE',
    language: 'JAVA',
    userLanguage: 'uk',
    validationFeedback: 'Use three distinct examples.',
  }, provider);

  assert.equal(calls.length, 2, 'structured draft is independently reviewed');
  const call = calls[0];
  assert.equal(call.options?.promptId, 'task.condition-draft');
  assert.match(call.prompt, /Use three distinct examples\./);
  assert.match(call.systemPrompt ?? '', /JSON-об’єкт/);
  assert.match(call.systemPrompt ?? '', /рівно ту кількість різних коректних прикладів вводу\/виводу, яку вимагають інструкції до задачі/);
  assert.match(call.systemPrompt ?? '', /вбудований Markdown/);
  assert.match(call.systemPrompt ?? '', /n\+1 токенів/);
  assert.match(call.systemPrompt ?? '', /лише прихований Python 3 оракул/);
  assert.match(call.systemPrompt ?? '', /не пов’язаний з мовою програмування учня/);
  assert.ok((call.systemPrompt ?? '').includes("JSON пиши `" + String.fromCharCode(92).repeat(2) + "`, щоб"));
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.minItems, 3);
  assert.equal((call.schema as { properties?: { examples?: { minItems?: number; maxItems?: number } } }).properties?.examples?.maxItems, 3);
  assert.match(result.description, /### Приклад 1/);
  assert.match(result.description, /### Приклад 3/);
  assert.match(result.description, /Вихідні дані:\n```\n5\n```/);
  assert.doesNotMatch(result.description, /\n```\n55\n```/);
  const reviewPayload = JSON.parse(calls[1].prompt) as {
    publicExamples: Array<{ input: string; output: string }>;
    executedReference?: { language: string; source: string };
    exampleOutputMismatches?: unknown;
  };
  assert.equal(reviewPayload.publicExamples[0].output, '5', 'review sees the value that will be shown after judge correction');
  assert.equal(reviewPayload.executedReference?.language, 'python');
  assert.equal('exampleOutputMismatches' in reviewPayload, false, 'discarded model outputs do not create contradictory review context');
  assert.doesNotMatch(result.description, /referenceSolution/);
  assert.match(call.systemPrompt ?? '', /прихований Python 3 оракул/);
  assert.equal((call.schema as { required?: string[] }).required?.includes('referenceSolution'), true);
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

test('reference stdout normalization removes only one conventional trailing newline', () => {
  assert.equal(normalizeTaskExampleOutput('5\r\n'), '5');
  assert.equal(normalizeTaskExampleOutput('a\n\n'), 'a\n');
  assert.equal(normalizeTaskExampleOutput(''), '');
});

test('condition generation preserves the selected scientific and Tkinter runtime in validation', async t => {
  const calls: Array<{ prompt: string; systemPrompt?: string }> = [];
  const responses: unknown[] = [
    { ...draft, referenceSolution: 'import cv2\nprint(5)' },
    { valid: true, invalidSource: 'none', issues: [], clarificationQuestion: null },
  ];
  t.mock.method(referenceExecution, 'executeReferenceTests', async (_source: string, _language: string, inputs: string[], _examples: Array<{ input: string; output: string }>, _signal: AbortSignal, options?: { pythonRuntimeProfile?: string }) => {
    assert.equal(options?.pythonRuntimeProfile, 'SCIENTIFIC');
    assert.equal(inputs.length, 3);
    return ['5', '0', '3'];
  });
  const provider: LLMProvider = {
    generateText: async () => { throw new Error('Expected structured JSON'); },
    generateJSON: async <T>(prompt: string, _schema: object, systemPrompt?: string): Promise<T> => {
      calls.push({ prompt, systemPrompt });
      return responses.shift() as T;
    },
  };
  const orchestrator = new LLMOrchestrator();
  const generate = (orchestrator as unknown as {
    generateTaskCondition_OpenRouter: (params: {
      topicTitle: string; taskType: 'PRACTICE'; language: 'PYTHON'; userLanguage: 'en';
      pythonRuntimeProfile: 'SCIENTIFIC';
    }, provider: LLMProvider) => Promise<{ description: string }>;
  }).generateTaskCondition_OpenRouter;
  await generate.call(orchestrator, {
    topicTitle: 'Scientific Python', taskType: 'PRACTICE', language: 'PYTHON', userLanguage: 'en', pythonRuntimeProfile: 'SCIENTIFIC',
  }, provider);
  assert.equal(calls.length, 2);
  assert.match(calls[0].systemPrompt ?? '', /OpenCV \(cv2\)/);
  assert.match(calls[1].prompt, /publicExamples/);

  const reviewResponses = [{
    valid: false,
    invalidSource: 'publicExamples',
    issues: [
      "Example 1: input '4 1 2 3 4' has 5 tokens, but N=4 implies 4 elements. Expected 4 elements after N.",
      "Example 2: input '8 5 5 5 5 5 5 5 5' has 9 tokens, but N=8 implies 8 elements. Expected 8 elements after N.",
      "Example 3: input '5 1 2 3 4 5' has 6 tokens, but N=5 implies 5 elements. Expected 5 elements after N.",
    ],
    clarificationQuestion: null,
  }];
  const falsePositiveReviewer: LLMProvider = {
    generateText: async () => { throw new Error('Expected JSON'); },
    generateJSON: async <T>(): Promise<T> => reviewResponses.shift() as T,
  };
  await assert.doesNotReject(reviewGeneratedTaskCondition(falsePositiveReviewer, {
    statement: 'Read n and exactly n integers.',
    inputFormat: 'One line contains n followed by n integers.',
    outputFormat: 'Print the sum.',
    constraints: ['1 ≤ n ≤ 10'],
    examples: [
      { input: '4 1 2 3 4', output: '10' },
      { input: '8 5 5 5 5 5 5 5 5', output: '40' },
      { input: '5 1 2 3 4 5', output: '15' },
    ] as TaskConditionDraft['examples'],
  }));
});

test('Tkinter condition repairs a non-GUI reference once and injects valid event inputs through the harness', async t => {
  const tkDraft: TaskConditionDraft = {
    statement: 'Create a counter window with an Add button. Each click increments the displayed count.',
    inputFormat: 'A JSON object with an events array. Each event is a supported UI event.',
    outputFormat: 'The exact JSON snapshot of the window widgets after all events.',
    constraints: ['The initial count is 0.', 'Only supported click events are used.'],
    subtasks: [],
    referenceSolution: 'import tkinter as tk\nroot = tk.Tk()\nroot.mainloop()',
    examples: [
      { input: '{"events":[]}', output: '{}' },
      { input: '{"events":[{"type":"click","x":10,"y":10}]}', output: '{}' },
      { input: '{"events":[{"type":"click","x":10,"y":10},{"type":"click","x":10,"y":10}]}', output: '{}' },
    ],
  };
  const calls: Array<{ prompt: string; systemPrompt?: string; options?: LLMGenerateOptions }> = [];
  const responses: unknown[] = [
    { ...tkDraft, referenceSolution: 'import json, sys\nprint(json.dumps({"widgets": []}))' },
    tkDraft,
    { valid: true, invalidSource: 'none', issues: [], clarificationQuestion: null },
  ];
  let referenceAttempts = 0;
  t.mock.method(referenceExecution, 'executeReferenceTests', async (_source: string, language: string, inputs: string[], _examples: Array<{ input: string; output: string }>, _signal: AbortSignal, options?: { pythonRuntimeProfile?: string }) => {
    referenceAttempts++;
    assert.equal(language, 'PYTHON');
    assert.equal(options?.pythonRuntimeProfile, 'TKINTER');
    assert.equal(inputs.length, 3);
    if (referenceAttempts === 1) throw new Error('Reference program failed on input 1: RE; Tkinter program did not create a Tk window');
    return [
      '{"title":"Counter","geometry":"58x52","widgets":[]}',
      '{"title":"Counter","geometry":"58x52","widgets":[]}',
      '{"title":"Counter","geometry":"58x52","widgets":[]}',
    ];
  });
  const provider: LLMProvider = {
    generateText: async () => { throw new Error('Expected structured JSON'); },
    generateJSON: async <T>(prompt: string, _schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T> => {
      calls.push({ prompt, systemPrompt, options });
      return responses.shift() as T;
    },
  };
  const orchestrator = new LLMOrchestrator();
  const generate = (orchestrator as unknown as {
    generateTaskCondition_OpenRouter: (params: {
      topicTitle: string; taskTitle: string; taskType: 'PRACTICE'; language: 'PYTHON'; userLanguage: 'uk' | 'en'; difficulty?: number;
      generationGuidance?: string;
      pythonRuntimeProfile: 'TKINTER';
    }, provider: LLMProvider) => Promise<{ description: string }>;
  }).generateTaskCondition_OpenRouter;

  const result = await runWithPromptExecutionContext('task.condition-draft', {}, () => generate.call(orchestrator, {
    topicTitle: 'Tkinter',
    taskTitle: 'Вступ до Tkinter',
    taskType: 'PRACTICE',
    difficulty: 1,
    language: 'PYTHON',
    userLanguage: 'uk',
    generationGuidance: 'Перший код після прослуховування вступної теорії',
    pythonRuntimeProfile: 'TKINTER',
  }, provider));

  assert.equal(referenceAttempts, 2);
  assert.equal(calls.length, 3, 'one draft repair plus one required contract review');
  assert.equal(calls[1].options?.temperature, 0.15);
  assert.match(calls[0].systemPrompt ?? '', /root\.mainloop\(\)/);
  assert.match(calls[0].systemPrompt ?? '', /Не читай stdin, не розбирай JSON/);
  assert.match(calls[0].systemPrompt ?? '', /об’єкт знімка harness формату/);
  assert.match(calls[0].systemPrompt ?? '', /фіксоване розташування через place\(x, y, width, height\)/);
  assert.match(calls[0].systemPrompt ?? '', /порядком створення Tk winfo_children\(\)/);
  assert.match(calls[0].systemPrompt ?? '', /кожен знімок можна було однозначно вивести з умови/);
  assert.match(calls[0].systemPrompt ?? '', /координата кожного кліку в прикладі має бути чітко всередині центру/);
  assert.match(calls[0].systemPrompt ?? '', /Це вступна задача з Tkinter:.*не додавай Entry\/Text та поведінку з фокусом\/введенням/s);
  assert.doesNotMatch(calls[0].systemPrompt ?? '', /Each output must be exact stdout/);
  assert.match(calls[1].prompt, /Tkinter program did not create a Tk window/);
  assert.match(calls[2].prompt, /executedReference/);
  assert.match(result.description, /\{"title":"Counter","geometry":"58x52","widgets":\[\]\}/);

  responses.push(tkDraft, { valid: true, invalidSource: 'none', issues: [], clarificationQuestion: null });
  const englishResult = await runWithPromptExecutionContext('task.condition-draft', {}, () => generate.call(orchestrator, {
    topicTitle: 'Tkinter',
    taskTitle: 'Counter window',
    taskType: 'PRACTICE',
    difficulty: 3,
    language: 'PYTHON',
    userLanguage: 'en',
    pythonRuntimeProfile: 'TKINTER',
  }, provider));
  assert.match(calls[3].systemPrompt ?? '', /winfo_children\(\) creation order/);
  assert.match(calls[3].systemPrompt ?? '', /Specify the root title, geometry, widget classes/);
  assert.match(englishResult.description, /Counter/);
});

test('Ukrainian beginner Tkinter rejects text-entry controls and type events before Judge execution', async t => {
  const invalidIntroDraft: TaskConditionDraft = {
    statement: 'Create a Tkinter window with a text field. Type a greeting and display it.',
    inputFormat: 'A JSON object with an events array.',
    outputFormat: 'The exact JSON widget snapshot.',
    constraints: ['Use one Tkinter window.'],
    subtasks: [],
    referenceSolution: 'import tkinter as tk\nroot = tk.Tk()\nentry = tk.Entry(root)\nentry.place(x=10, y=10, width=100, height=24)\nroot.mainloop()',
    examples: [
      { input: '{"events":[{"type":"type","text":"Привіт"}]}', output: '{}' },
      { input: '{"events":[{"type":"click","x":50,"y":50}]}', output: '{}' },
      { input: '{"events":[{"type":"type","text":"Test"}]}', output: '{}' },
    ],
  };
  let generatedPrompt = '';
  const provider: LLMProvider = {
    generateText: async () => { throw new Error('Expected structured JSON'); },
    generateJSON: async <T>(_prompt: string, _schema: object, systemPrompt?: string): Promise<T> => {
      generatedPrompt = String(systemPrompt ?? '');
      return invalidIntroDraft as T;
    },
  };
  t.mock.method(referenceExecution, 'executeReferenceTests', async () => {
    throw new Error('Judge must not run for an invalid introductory Tkinter draft');
  });
  const orchestrator = new LLMOrchestrator();
  const generate = (orchestrator as unknown as {
    generateTaskCondition_OpenRouter: (params: {
      topicTitle: string; taskTitle: string; generationGuidance: string; taskType: 'PRACTICE'; language: 'PYTHON'; userLanguage: 'uk';
      difficulty: number; pythonRuntimeProfile: 'TKINTER';
    }, provider: LLMProvider) => Promise<{ description: string }>;
  }).generateTaskCondition_OpenRouter;

  await assert.rejects(runWithPromptExecutionContext('task.condition-draft', {}, () => generate.call(orchestrator, {
    topicTitle: 'Tkinter',
    taskTitle: 'Вступ до Tkinter',
    generationGuidance: 'Перший код після прослуховування вступної теорії',
    taskType: 'PRACTICE',
    language: 'PYTHON',
    userLanguage: 'uk',
    difficulty: 1,
    pythonRuntimeProfile: 'TKINTER',
  }, provider)), /Introductory Tkinter tasks must not create Entry\/Text widgets or use type\/key events/);
  assert.match(generatedPrompt, /Це вступна задача з Tkinter:.*не додавай Entry\/Text/s);
});
