import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider } from './LLMProvider';
import { LLMOrchestrator, getLLMOrchestrator, type AiTaskGenerationResult } from './LLMOrchestrator';
import { safeAICall } from '../ai/safeAICall';
import { makeAIValidationError } from './AIResponseValidator';
import { MAX_TASK_DESCRIPTION_CHARS, TaskContractReviewError, requireCompleteTaskDescription, resolveTestDataIoType, reviewGeneratedTask, reviewGeneratedTests } from './TaskContractReview';
import { buildOlympiadPracticeContract } from '../learning/learningContract';

const task: AiTaskGenerationResult = {
  title: 'Sum', topic: 'Arithmetic', difficulty: 1, theoryMarkdown: 'Addition combines values.',
  practicalTask: 'Read two integers a and b from standard input and calculate their sum. Print exactly one integer containing a + b, with no labels, extra values, or explanations. The input contains the two integers on one line separated by a space.',
  ioType: 'STDIN_STDOUT', inputFormat: 'Two space-separated integers a and b on one line.',
  outputFormat: 'Print one integer: the sum of a and b.', constraints: '-100 <= a, b <= 100.',
  examples: [{ input: '2 3', output: '5', explanation: '2 + 3 = 5.' }], codeTemplate: '# TODO',
};

function fakeProvider(responses: unknown[], calls: string[] = [], systemPrompts?: string[], schemas?: unknown[]): LLMProvider {
  return {
    async generateJSON<T>(prompt: string, schema?: unknown, systemPrompt?: string): Promise<T> {
      calls.push(prompt);
      if (systemPrompts) systemPrompts.push(String(systemPrompt ?? ""));
      if (schemas) schemas.push(schema);
      if (!responses.length) throw new Error('Unexpected provider call');
      return responses.shift() as T;
    },
    async generateText(): Promise<string> { throw new Error('Unexpected text request'); },
  };
}

test('task review rejects missing rounding rules instead of completing them', async () => {
  const provider = fakeProvider([{ valid: false, invalidSource: 'statement', issues: ['Specify rounding and decimal precision.'] }]);
  await assert.rejects(reviewGeneratedTask(provider, task), /TASK_CONTRACT_REVIEW_FAILED.*rounding/);
});

test('task review receives every public example and only the visible contract', async () => {
  const calls: string[] = [];
  const examples = [...task.examples, { input: '0 0', output: '0', explanation: 'Zero.' }];
  await reviewGeneratedTask(fakeProvider([{ valid: true, invalidSource: 'none', issues: [] }], calls), { ...task, examples });
  const payload = JSON.parse(calls[0]);
  assert.equal(payload.publicExamples.length, 2);
  assert.equal(payload.practicalTask, task.practicalTask);
  assert.equal(payload.constraints, task.constraints);
  assert.equal(payload.theoryMarkdown, undefined);
  assert.equal(payload.title, undefined);
  assert.equal(payload.codeTemplate, undefined);
});

test('Olympiad task review receives the hidden algorithmic contract', async () => {
  const calls: string[] = [];
  const learningContract = JSON.stringify({
    kind: 'OLYMPIAD_ALGORITHMIC_PRACTICE',
    coreOperation: 'Read an array and range queries; print each range sum.',
    requiredInput: 'n, q, array values, then q inclusive ranges.',
    requiredOutput: 'One range sum on each line.',
    constraints: 'n and q up to 200000.',
    algorithm: 'prefix-sum array for range queries',
  });
  await reviewGeneratedTask(
    fakeProvider([{ valid: true, invalidSource: 'none', issues: [] }], calls),
    task,
    { learningContract },
  );
  assert.equal(JSON.parse(calls[0]).learningContract, learningContract);
});

test('Olympiad task review checks the generated practice form for each learning stage', async () => {
  const calls: string[] = [];
  const systemPrompts: string[] = [];
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python',
    topicKey: 'prefix-sums',
    topicTitle: 'Prefix sums in Python',
    runtime: 'PYTHON',
    objective: 'Answer range-sum queries.',
    sequence: 2,
    total: 3,
  });

  await reviewGeneratedTask(
    fakeProvider([{ valid: true, invalidSource: 'none', issues: [] }], calls, systemPrompts),
    task,
    { learningContract: JSON.stringify(contract) },
  );

  assert.equal(JSON.parse(calls[0]).learningContract, JSON.stringify(contract));
  assert.match(systemPrompts[0], /hidden stage and variation are authoring criteria/);
  assert.match(systemPrompts[0], /EDGE_CASES must include a valid required boundary case/);
  assert.match(systemPrompts[0], /short, deliberately faulty code sample in the contract runtime/);
  assert.match(systemPrompts[0], /plausible runnable program with exactly one lesson-relevant logical error/);
  assert.match(systemPrompts[0], /For task generation, at least one public example must expose the supplied bug/);
  assert.match(systemPrompts[0], /For generated-test review, trace the draft against the required debugging case/);
  assert.match(systemPrompts[0], /TRANSFER must use a genuinely new context/);
  assert.match(systemPrompts[0], /without exposing their labels/);
});

test('task review rejects a narrative that contradicts a signed input domain', async () => {
  const calls: string[] = [];
  const systemPrompts: string[] = [];
  const inconsistentTask = {
    ...task,
    practicalTask: 'A shop records daily sales as integers. Values may be negative, but the statement does not explain refunds or corrections.',
    constraints: '-100 <= a[i] <= 100.',
  };

  await assert.rejects(
    reviewGeneratedTask(
      fakeProvider([{
        valid: false,
        invalidSource: 'statement',
        issues: ['Negative sales are not explained; use signed changes or define refunds.'],
      }], calls, systemPrompts),
      inconsistentTask,
    ),
    /Negative sales are not explained/,
  );

  assert.match(systemPrompts[0], /Check narrative consistency against the complete valid domain/);
  assert.match(systemPrompts[0], /If a signed field allows negative values/);
  assert.match(calls[0], /Values may be negative/);
});

test('localized Olympiad statements use semantic contract review instead of English word matching', async () => {
  const topicTitle = 'Практика 3/3: Префіксні суми Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Відповідати на запити про суми включних відрізків.', sequence: 3, total: 3,
  });
  const theoryContext = `Теорія українською. ${'Префіксний масив дає змогу швидко відповідати на запити. '.repeat(300)}THEORY_CONTEXT_TAIL_SENTINEL`;
  const theory = `${theoryContext}\n<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  const localizedTask: AiTaskGenerationResult = {
    ...task,
    title: 'Звіти про зміни висоти',
    topic: topicTitle,
    practicalTask: 'Диспетчер отримує журнал цілих змін висоти та відповідає на запити про окремі неперервні відрізки. Для кожного запиту задано ліву й праву межі включно, а від’ємні зміни та повторні межі є допустимими. Виведіть суму змін для кожного відрізка у тому самому порядку, в якому подано запити.',
    ioType: 'STDIN_STDOUT',
    inputFormat: 'Перший рядок містить n і q. Другий рядок містить n цілих змін. Наступні q рядків містять включні межі l і r.',
    outputFormat: 'Виведіть q рядків із сумою на кожному відповідному відрізку.',
    constraints: '1 ≤ n, q ≤ 200000; |a[i]| ≤ 10^9; 1 ≤ l ≤ r ≤ n.',
    examples: [{ input: '3 2\n1 2 3\n1 3\n2 2\n', output: '6\n2', explanation: 'Суми дорівнюють 6 і 2.' }],
  };
  const calls: string[] = [];
  const systemPrompts: string[] = [];
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({
    topicTitle,
    theory,
    lang: 'PYTHON',
    topicIndex: 2,
    numInTopic: 3,
    isFirstTask: false,
    anchor: {
      topic: topicTitle,
      coreOperation: contract.coreOperation,
      allowedScope: contract.allowedScope,
      forbiddenScope: contract.forbiddenScope,
    },
    allowedIoTypes: ['STDIN_STDOUT'],
    language: 'uk',
    semanticRetries: 0,
  }, fakeProvider([localizedTask, { valid: true, invalidSource: 'none', issues: [] }], calls, systemPrompts));

  assert.match(result.title, /Звіти про зміни висоти$/);
  assert.match(result.practicalTask, /Виведіть суму змін/);
  assert.match(calls[0], /Узгодь сюжет з усім допустимим доменом вводу/);
  assert.match(calls[0], /Повтори кожну числову нижню й верхню межу без звуження/);
  assert.match(calls[0], /Кожен приклад має точно відповідати граматиці вводу/);
  assert.doesNotMatch(calls[0], /STUDYCOD_LEARNING_META_START|CONCRETE EXAMPLES/);
  assert.doesNotMatch(calls[0], /THEORY_CONTEXT_TAIL_SENTINEL/);
  assert.doesNotMatch(calls[0], /BEGINNER/);
  assert.match(calls[0], /складність 0–5 відповідно до етапу контракту й цільового алгоритму/);
  assert.ok(calls[0].length < 8_000, `Olympiad task prompt should stay compact; got ${calls[0].length} characters`);
  assert.match(systemPrompts[1], /if the contract says n ≥ 1, n=0 is invalid/);
  assert.match(systemPrompts[1], /any narrower or wider bound is a conflict/);
  assert.match(systemPrompts[1], /declared counts .*match the exact supplied values and rows/);
  assert.match(calls[0], /Етап TRANSFER/);
  assert.match(calls[0], /Independent transfer/);
  assert.match(calls[0], /without naming it in the statement/);
});

test('EDGE_CASES task generation gives the reviewer a public example that exposes the supplied bug', async () => {
  const topicTitle = 'Практика 2/3: Префіксні суми Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Відповідати на запити про суми включних відрізків.', sequence: 2, total: 3,
  });
  const theory = `Теорія префіксних сум.\n<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  const buggyDraft = [
    'def range_sum(values, left, right):',
    '    return sum(values[left - 1:right - 1])',
    'n, q = map(int, input().split())',
    'values = list(map(int, input().split()))',
    'for _ in range(q):',
    '    left, right = map(int, input().split())',
    '    print(range_sum(values, left, right))',
  ].join('\n');
  const generated: AiTaskGenerationResult = {
    ...task,
    title: 'Звіти про знакові зміни висоти',
    topic: topicTitle,
    difficulty: 3,
    theoryMarkdown: 'Префіксні суми дозволяють відповідати на запити про відрізки.',
    practicalTask: [
      'Станція спостережень записує знакову зміну висоти снігового покриву за кожну добу: від’ємні значення означають зниження, додатні — підвищення.',
      'Після журналу задано запити з включними номерами першої й останньої доби.',
      'Для кожного запиту виведіть сумарну зміну висоти.',
      'Наведена програма містить одну логічну помилку: знайдіть її та виправте її.',
      `\`\`\`python\n${buggyDraft}\n\`\`\``,
    ].join('\n\n'),
    inputFormat: 'Перший рядок містить n і q. Другий рядок містить n цілих змін висоти. Наступні q рядків містять включні межі l і r.',
    outputFormat: 'Виведіть q рядків: суму змін для кожного запиту у заданому порядку.',
    constraints: '1 ≤ n, q ≤ 200000; |a[i]| ≤ 10^9; 1 ≤ l ≤ r ≤ n.',
    examples: [{ input: '3 1\n5 2 9\n1 3', output: '16', explanation: 'Увесь відрізок містить 5 + 2 + 9 = 16.' }],
    codeTemplate: '# TODO: implement the complete program',
  };
  const calls: string[] = [];
  const systemPrompts: string[] = [];
  const schemas: unknown[] = [];
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };

  const result = await orchestrator.generateTaskFromAnchor({
    topicTitle, theory, lang: 'PYTHON', topicIndex: 2, numInTopic: 2, isFirstTask: false,
    anchor: { topic: topicTitle, coreOperation: contract.coreOperation, allowedScope: contract.allowedScope, forbiddenScope: contract.forbiddenScope },
    allowedIoTypes: ['STDIN_STDOUT'], language: 'uk', semanticRetries: 0,
  }, fakeProvider([generated, { valid: true, invalidSource: 'none', issues: [] }], calls, systemPrompts, schemas));

  assert.equal(result.examples[0].output, '16');
  assert.match(result.practicalTask, /Подайте повну виправлену програму/);
  assert.match(calls[0], /Для EDGE_CASES принаймні один публічний приклад має бути валідним входом/);
  assert.match(calls[0], /outputFormat не може містити/);
  assert.match(systemPrompts[1], /For task generation, at least one public example must expose the supplied bug/);
  assert.match(systemPrompts[1], /do not require every public example to expose it/);
  assert.match(systemPrompts[1], /an all-zero array has a valid answer of zero/);
  assert.match(systemPrompts[1], /an all-negative array such as \[-1,-2,-3\] has answer -1/);
  assert.match(systemPrompts[1], /supplied draft may intentionally return 0 on all-negative input/);
  assert.match(systemPrompts[1], /each individual example need not cover every value class/);
  const taskSchema = schemas[0] as { properties: { examples: { minItems: number; items: { properties: { output: { minLength: number }; explanation: { minLength: number } } } } } };
  assert.equal(taskSchema.properties.examples.minItems, 1);
  assert.equal(taskSchema.properties.examples.items.properties.output.minLength, 1);
  assert.equal(taskSchema.properties.examples.items.properties.explanation.minLength, 1);
});

test('Olympiad prefix-sum task generation retries when an example omits a query answer', async () => {
  const topicTitle = 'Практика 3/3: Префіксні суми Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 3, total: 3,
  });
  const theory = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  const candidate: AiTaskGenerationResult = {
    ...task,
    title: 'Звіти про зміну висоти',
    topic: topicTitle,
    practicalTask: 'Метеостанція зберігає зміни висоти снігового покриву протягом кількох днів. Для кожного запиту задано початковий і кінцевий день включно; зміни можуть бути від’ємними, а запити можуть повторюватися. Виведіть суму змін для кожного відрізка окремо, зберігаючи порядок запитів.',
    inputFormat: 'Перший рядок містить n і q. Другий рядок містить n цілих значень. Наступні q рядків містять межі l і r.',
    outputFormat: 'Виведіть q рядків із сумою для відповідного відрізка.',
    constraints: '1 ≤ n, q ≤ 200000; |a[i]| ≤ 10^9; 1 ≤ l ≤ r ≤ n.',
    examples: [{
      input: '4 2\n-1 5 -2 8\n2 3\n1 4',
      output: '1',
      explanation: 'Сума першого відрізка дорівнює 3, а другого — 10.',
    }],
  };
  const corrected = { ...candidate, examples: [{ ...candidate.examples[0], output: '3\n10' }] };
  const calls: string[] = [];
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({
    topicTitle, theory, lang: 'PYTHON', topicIndex: 2, numInTopic: 3, isFirstTask: false,
    anchor: {
      topic: topicTitle,
      coreOperation: contract.coreOperation,
      allowedScope: contract.allowedScope,
      forbiddenScope: contract.forbiddenScope,
    },
    allowedIoTypes: ['STDIN_STDOUT'], language: 'uk', semanticRetries: 1,
  }, fakeProvider([
    candidate, corrected, { valid: true, invalidSource: 'none', issues: [] },
  ], calls));

  assert.equal(result.examples[0].output, '3\n10');
  assert.match(calls[1], /OLYMPIAD_EXAMPLE_CONTRACT_FAILED/);
  assert.match(calls[1], /exactly 2 output lines/);
});

test('Olympiad task generation retries when a non-negative story conflicts with signed contract values', async () => {
  const topicTitle = 'Practice 3/3: Prefix sums for Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 3, total: 3,
  });
  const theory = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  const example = { input: '3 2\n2 -5 4\n1 3\n2 2', output: '1\n-5', explanation: 'Add the values in each requested range.' };
  const inconsistent: AiTaskGenerationResult = {
    ...task,
    title: 'Daily ice cream sales',
    topic: topicTitle,
    practicalTask: 'A local ice cream shop records the number of portions sold each day. Given the sales values and several inclusive day ranges, print the total portions sold in each range. The input lists every daily value before the queries, and each query names both endpoints of one range.',
    inputFormat: 'Read n and q, then n daily values, followed by q inclusive pairs l r.',
    outputFormat: 'Print q lines, each containing the total portions sold during that range.',
    constraints: '1 ≤ n, q ≤ 200000; |a[i]| ≤ 10^9; 1 ≤ l ≤ r ≤ n.',
    examples: [example],
  };
  const corrected: AiTaskGenerationResult = {
    ...inconsistent,
    title: 'Daily net change in portions sold',
    practicalTask: 'A shop tracks the net change in portions sold each day. Negative values represent refunds or returned portions, while positive values represent sales. Given all daily values and inclusive day-range queries, print the net total for each range in input order.',
    outputFormat: 'Print q lines, each containing the signed net change over the corresponding range.',
  };
  const calls: string[] = [];
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({
    topicTitle, theory, lang: 'PYTHON', topicIndex: 2, numInTopic: 3, isFirstTask: false,
    anchor: {
      topic: topicTitle,
      coreOperation: contract.coreOperation,
      allowedScope: contract.allowedScope,
      forbiddenScope: contract.forbiddenScope,
    },
    allowedIoTypes: ['STDIN_STDOUT'], language: 'en', semanticRetries: 1,
  }, fakeProvider([
    inconsistent, corrected, { valid: true, invalidSource: 'none', issues: [] },
  ], calls));

  assert.match(result.title, /Daily net change in portions sold$/);
  assert.match(calls[1], /OLYMPIAD_NARRATIVE_DOMAIN_MISMATCH/);
  assert.match(calls[1], /Explain what negative values mean/);
});

test('Olympiad practice uses its deterministic algorithm anchor instead of a generic title anchor', async (t) => {
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle: 'Prefix sums in Python',
    runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 1, total: 3,
  });
  const theory = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  let anchor: Record<string, unknown> | undefined;
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskWithAI_OpenRouter(params: object, provider?: LLMProvider): Promise<AiTaskGenerationResult>;
    generateTaskFromAnchor(params: { anchor: Record<string, unknown> }): Promise<AiTaskGenerationResult>;
  };
  t.mock.method(orchestrator, 'generateTaskFromAnchor', async (params: { anchor: Record<string, unknown> }) => {
    anchor = params.anchor;
    return task;
  });
  await orchestrator.generateTaskWithAI_OpenRouter({
    topicTitle: 'Practice 1/3: Prefix sums in Python', theory, lang: 'PYTHON', topicIndex: 0,
    numInTopic: 1, isFirstTask: true,
  });
  assert.equal(anchor?.coreOperation, contract.coreOperation);
  assert.deepEqual(anchor?.allowedScope, contract.allowedScope);
  assert.deepEqual(anchor?.forbiddenScope, contract.forbiddenScope);
});

test('Olympiad task generation bypasses the legacy first-topic policy gate', async (t) => {
  const topicTitle = 'Practice 1/3: Prefix sums in Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 1, total: 3,
  });
  const theory = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  t.mock.method(getLLMOrchestrator(), 'generateTaskWithAI', async () => ({ ...task, topic: topicTitle }));
  const result = await safeAICall('generateTask', {
    topicTitle, theory, lang: 'PYTHON', topicIndex: 0, numInTopic: 1, isFirstTask: true,
    allowedIoTypes: ['STDIN_STDOUT'],
  }, { maxAttempts: 1 });
  assert.equal(result.success, true);
});

test('Olympiad task generation rejects no-input responses despite the legacy soft IO preference', async (t) => {
  const topicTitle = 'Practice 1/3: Prefix sums in Python';
  const contract = buildOlympiadPracticeContract({
    courseKey: 'olympiad-python', topicKey: 'prefix-sums', topicTitle,
    runtime: 'PYTHON', objective: 'Answer inclusive range-sum queries.', sequence: 1, total: 3,
  });
  const theory = `<!-- STUDYCOD_LEARNING_META_START\n${JSON.stringify(contract)}\nSTUDYCOD_LEARNING_META_END -->`;
  t.mock.method(getLLMOrchestrator(), 'generateTaskWithAI', async () => ({
    ...task,
    topic: topicTitle,
    ioType: 'NO_INPUT_FIXED_OUTPUT',
    inputFormat: 'No input data.',
    practicalTask: 'Print the number 5.',
    outputFormat: '5',
    examples: [{ input: '', output: '5', explanation: 'Fixed output.' }],
  }));
  const result = await safeAICall('generateTask', {
    topicTitle, theory, lang: 'PYTHON', topicIndex: 0, numInTopic: 1, isFirstTask: true,
    allowedIoTypes: ['STDIN_STDOUT'],
  }, { maxAttempts: 1 });
  assert.equal(result.success, false);
  if (!result.success) assert.match(String(result.error.details?.validationError), /requires a stdin\/stdout Judge problem/);
});

test('test review rejects a mathematically wrong expected answer', async () => {
  await assert.rejects(reviewGeneratedTests(fakeProvider([{ valid: false, invalidSource: 'candidateTests', issues: ['Test 1: 2 + 3 is 5, not 6.'] }]), 'Read two integers and print their sum.', 'STDIN_STDOUT', [{ input: '2 3', output: '6' }]), /Test 1/);
});

test('generated-test review receives required coverage and public examples', async () => {
  const calls: string[] = [];
  await reviewGeneratedTests(
    fakeProvider([{ valid: true, invalidSource: 'none', issues: [] }], calls),
    'Read one integer n where 1 <= n <= 10 and print its double.',
    'STDIN_STDOUT',
    [{ input: '2', output: '4' }],
    {
      requiredCases: ['n equals one', 'maximum n'],
      publicExamples: [{ input: '3', output: '6' }],
    },
  );
  const review = JSON.parse(calls[0]);
  assert.deepEqual(review.requiredCases, ['n equals one', 'maximum n']);
  assert.deepEqual(review.publicExamples, [{ input: '3', output: '6' }]);
});

test('review fails closed for missing, malformed, or inconsistent verdicts', async () => {
  for (const verdict of [{}, { valid: 'true', invalidSource: 'none', issues: [] }, { valid: true, invalidSource: 'statement', issues: ['Wrong answer.'] }, { valid: false, invalidSource: 'statement', issues: [] }, { valid: false, invalidSource: 'none', issues: ['Wrong answer.'] }]) {
    await assert.rejects(reviewGeneratedTask(fakeProvider([verdict, verdict]), task), /TASK_CONTRACT_REVIEW_FAILED/);
  }
});

test('review retries one malformed verdict for the same task before failing closed', async () => {
  const calls: string[] = [];
  await reviewGeneratedTask(
    fakeProvider([
      { valid: 'true', invalidSource: 'none', issues: [] },
      { valid: true, invalidSource: 'none', issues: [] },
    ], calls),
    task,
  );

  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0]).practicalTask, task.practicalTask);
  assert.match(calls[1], /RESPONSE FORMAT REPAIR/);
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
test('test generation retries once through safeAICall with reviewer feedback and the full statement', async (t) => {
  const calls: string[] = [];
  const statement = 'Read two integers in [-100, 100] and print their sum.\n' + 'Context. '.repeat(700) + '\nFINAL RULE: Print exactly one integer.';
  const provider = fakeProvider([
    { tests: [{ input: '2 3', output: '6' }] },
    { valid: false, invalidSource: 'candidateTests', issues: ['Test 1: expected sum is 5.'] },
    { tests: [{ input: '2 3', output: '5' }] },
    { valid: true, invalidSource: 'none', issues: [] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTestDataWithAI_OpenRouter(params: object, provider: LLMProvider): Promise<unknown>;
  };
  t.mock.method(getLLMOrchestrator(), 'generateTestDataWithAI', async (params: { executeReference?: unknown }) => orchestrator.generateTestDataWithAI_OpenRouter({ ...params, executeReference: undefined }, provider));
  const result = await safeAICall('generateTestData', { taskDescription: statement, taskTitle: 'Sum', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT' }, { maxAttempts: 2 });
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data, [{ input: '2 3', output: '5', explanation: undefined }]);
  assert.equal(calls.length, 4);
  assert.ok(calls[0].includes('FINAL RULE:'));
  assert.equal(JSON.parse(calls[1]).statement, statement);
  assert.ok(calls[2].includes('Test 1: expected sum is 5.'));
});

test('generated-test model prompt and reviewer both receive lesson coverage requirements', async (t) => {
  const calls: string[] = [];
  const provider = fakeProvider([
    { tests: [{ input: '1', output: '2' }] },
    { valid: true, invalidSource: 'none', issues: [] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTestDataWithAI_OpenRouter(params: object, provider: LLMProvider): Promise<unknown>;
  };
  const result = await orchestrator.generateTestDataWithAI_OpenRouter({
    taskDescription: 'Read an integer n where 1 <= n <= 10 and print 2*n.',
    taskTitle: 'Double a number', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT',
    requiredCases: ['minimum n', 'maximum n'],
    publicExamples: [{ input: '3', output: '6' }],
  }, provider);
  assert.ok(Array.isArray(result));
  assert.match(calls[0], /minimum n/);
  assert.match(calls[0], /maximum n/);
  assert.deepEqual(JSON.parse(calls[1]).requiredCases, ['minimum n', 'maximum n']);
  assert.deepEqual(JSON.parse(calls[1]).publicExamples, [{ input: '3', output: '6' }]);
});

test('task generation reviews public examples before returning and retries an ambiguous task', async () => {
  const calls: string[] = [];
  const provider = fakeProvider([
    task,
    { valid: false, invalidSource: 'statement', issues: ['Missing bounds for input a.'] },
    task,
    { valid: true, invalidSource: 'none', issues: [] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTaskFromAnchor(params: object, provider: LLMProvider): Promise<AiTaskGenerationResult>;
  };
  const result = await orchestrator.generateTaskFromAnchor({ topicTitle: 'Arithmetic', theory: 'Addition.', lang: 'PYTHON', topicIndex: 1, anchor: { topic: 'Arithmetic', coreOperation: 'sum', allowedScope: ['addition'], forbiddenScope: [] }, allowedIoTypes: ['STDIN_STDOUT'], semanticRetries: 1 }, provider);
  assert.equal(result.examples[0].output, '5');
  assert.equal(calls.length, 4);
  assert.ok(calls[2].includes('Missing bounds for input a.'));
});

test('a broken statement or public example stops test retries immediately', async (t) => {
  for (const invalidSource of ['statement', 'publicExamples'] as const) {
    let attempts = 0;
    t.mock.method(getLLMOrchestrator(), 'generateTestDataWithAI', async () => {
      attempts++;
      throw new TaskContractReviewError('generateTestData', invalidSource, ['Triangle example: expected 10.0, got 12.0.']);
    });
    const result = await safeAICall('generateTestData', { taskDescription: 'Read radius width height. Print their areas.', taskTitle: 'Areas', lang: 'JAVA', count: 10, ioType: 'STDIN_STDOUT' }, { maxAttempts: 3 });
    assert.equal(result.success, false);
    assert.equal(attempts, 1);
    if (!result.success) assert.match(String(result.error.details?.validationError), /expected 10.0/);
    t.mock.restoreAll();
  }
});

test('rejected candidates cannot trigger a second hidden semantic retry loop', async () => {
  const calls: string[] = [];
  const provider = fakeProvider([
    { tests: [{ input: '2 3', output: '6' }] },
    { valid: false, invalidSource: 'candidateTests', issues: ['Test 1: expected 5, got 6.'] },
  ], calls);
  const orchestrator = new LLMOrchestrator() as unknown as {
    generateTestDataWithAI_OpenRouter(params: object, provider: LLMProvider): Promise<unknown>;
  };
  await assert.rejects(orchestrator.generateTestDataWithAI_OpenRouter({ taskDescription: 'Read a and b in [-100,100]; print a+b.', taskTitle: 'Sum', lang: 'PYTHON', count: 1, ioType: 'STDIN_STDOUT' }, provider), /expected 5/);
  assert.equal(calls.length, 2);
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
