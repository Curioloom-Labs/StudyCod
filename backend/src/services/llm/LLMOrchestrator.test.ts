import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMOrchestrator, type AiQuizResult } from './LLMOrchestrator';
import { runWithPromptExecutionContext } from './promptExecution';

type QuizBatch = {
  lang: 'PYTHON';
  prevTopics: string;
  count: number;
  optionCount?: 4 | 5;
  questionStyle?: 'CONCEPTS' | 'CODE_READING' | 'DEBUGGING';
  language?: 'en' | 'uk';
  generationGuidance?: string;
  avoidQuestionStems?: string[];
};

type QuizBatchAccess = {
  generateQuizInBatches(
    params: QuizBatch,
    generateBatch: (batch: QuizBatch) => Promise<AiQuizResult>,
  ): Promise<AiQuizResult>;
  generateQuizWithAI_OpenRouter(params: QuizBatch, providerOverride?: unknown): Promise<AiQuizResult>;
};

test('large quizzes are generated in bounded batches and preserve the requested total', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const requestedCounts: number[] = [];
  const result = await orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'arrays', count: 45, questionStyle: 'CONCEPTS',
  }, async batch => {
    requestedCounts.push(batch.count);
    const start = (batch.avoidQuestionStems?.length ?? 0) + 1;
    return {
      quizJson: JSON.stringify(Array.from({ length: batch.count }, (_, index) => ({
        q: `Question concept ${start + index}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct: 0,
      }))),
    };
  });

  assert.deepEqual(requestedCounts, [15, 15, 15]);
  assert.equal(JSON.parse(result.quizJson).length, 45);
});

test('large quizzes make up to two targeted duplicate repairs and keep the complete count', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const requestedCounts: number[] = [];
  const result = await runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'arrays', count: 16, questionStyle: 'CONCEPTS',
  }, async batch => {
    requestedCounts.push(batch.count);
    const isRepair = batch.generationGuidance?.includes('ВИПРАВЛЕННЯ ДУБЛІКАТІВ') ?? false;
    const isSecondRepair = batch.generationGuidance?.includes('ДРУГА СПРОБА ВИПРАВЛЕННЯ ДУБЛІКАТУ') ?? false;
    if (isRepair || isSecondRepair) assert.equal(batch.avoidQuestionStems?.length, 15);
    const start = isSecondRepair ? 16 : 1;
    return {
      quizJson: JSON.stringify(Array.from({ length: batch.count }, (_, index) => ({
        q: `Question concept ${start + index}`,
        options: ['A', 'B', 'C', 'D', 'E'],
        correct: 0,
      }))),
    };
  }));

  assert.deepEqual(requestedCounts, [15, 1, 1, 1]);
  assert.equal(JSON.parse(result.quizJson).length, 16);
});

test('diagnostic quizzes regenerate code-referencing questions as same-topic conceptual questions', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const requestedCounts: number[] = [];
  const result = await runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON',
    prevTopics: [
      'Course: Java.',
      'QUESTION COVERAGE PLAN. Generate exactly one question for each listed assignment, in order. Prefix q with [topic:ID].',
      'Question 1: [topic:10] arrays. Test this topic only. Arrays store ordered values.',
      'Question 2: [topic:11] indexing. Test this topic only. The first index is zero.',
      'When the same topic appears twice, assess two different skills.',
    ].join('\n'),
    count: 2,
    questionStyle: 'CONCEPTS',
    language: 'en',
    generationGuidance: 'Course diagnostic questions must be conceptual.',
  }, async batch => {
    requestedCounts.push(batch.count);
    if (batch.generationGuidance?.includes('CODE COMPLETENESS REPAIR')) {
      assert.equal(batch.count, 1);
      assert(batch.prevTopics.includes('Replacement 1 replaces original question 2'));
      assert.match(batch.prevTopics, /begin q with \[topic:11\]/i);
      assert(batch.generationGuidance.includes('Do not ask for the output or behavior'));
      assert.match(batch.prevTopics, /QUESTION REPAIR PLAN\. Generate exactly 1 replacement question/);
      assert.match(batch.prevTopics, /Assigned topic: \[topic:11\] indexing/);
      assert.match(batch.prevTopics, /Rejected question stem: "What output is produced by the following code\?"/);
      assert.doesNotMatch(batch.prevTopics, /\[topic:10\] arrays/);
      assert.doesNotMatch(batch.prevTopics, /QUESTION COVERAGE PLAN/);
      assert(batch.avoidQuestionStems?.some(stem => stem.includes('[topic:10]')));
      return {
        quizJson: JSON.stringify([{
          q: '[topic:11] What does zero-based indexing mean?',
          options: ['The first position is 0', 'The first position is 1', 'Indexes are random', 'Arrays have no positions', 'Only strings use indexes'],
          correct: 0,
        }]),
      };
    }
    return {
      quizJson: JSON.stringify([
        { q: '[topic:10] What is an array?', options: ['A sequence of values', 'A loop', 'A condition', 'A function call', 'A comment'], correct: 0 },
        { q: '[topic:11] What output is produced by the following code?', options: ['0', '1', '2', '3', '4'], correct: 0 },
      ]),
    };
  }));

  assert.deepEqual(requestedCounts, [2, 1]);
  const questions = JSON.parse(result.quizJson);
  assert.equal(questions.length, 2);
  assert.equal(questions[1].q, '[topic:11] What does zero-based indexing mean?');
});

test('conceptual quizzes accept generic code concepts without requiring a snippet', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  let calls = 0;
  const result = await runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON',
    prevTopics: '[topic:12] functions and return values',
    count: 1,
    questionStyle: 'CONCEPTS',
    language: 'en',
  }, async () => {
    calls += 1;
    return {
      quizJson: JSON.stringify([{
        q: '[topic:12] What does a return statement do in the program?',
        options: ['It sends a value back to the caller', 'It starts a loop', 'It declares a variable', 'It imports a module', 'It repeats the function definition'],
        correct: 0,
      }]),
    };
  }));

  assert.equal(calls, 1);
  assert.match(JSON.parse(result.quizJson)[0].q, /return statement/);
});

test('OpenRouter code-incomplete answers reach the shared topic-preserving repair instead of exhausting provider retries', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  let providerCalls = 0;
  const provider = {
    generateText: async (prompt: string) => {
      providerCalls++;
      if (prompt.includes('CODE COMPLETENESS REPAIR')) {
        assert.match(prompt, /begin q with \[topic:11\]/i);
        return JSON.stringify([{
          q: '[topic:11] What does zero-based indexing mean?',
          options: ['The first position is 0', 'The first position is 1', 'Indexes are random', 'Arrays have no positions', 'Only strings use indexes'],
          correct: 0,
        }]);
      }
      return JSON.stringify([{
        q: '[topic:11] What output is produced by the following code?',
        options: ['0', '1', '2', '3', '4'],
        correct: 0,
      }]);
    },
  };
  const result = await runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: '[topic:11] indexing', count: 1, questionStyle: 'CONCEPTS', language: 'en',
  }, batch => orchestrator.generateQuizWithAI_OpenRouter(batch, provider)));

  assert.equal(providerCalls, 2);
  assert.equal(JSON.parse(result.quizJson)[0].q, '[topic:11] What does zero-based indexing mean?');
});

test('strict code-reading quizzes still repair missing snippets with complete code', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const result = await runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'variables', count: 1, questionStyle: 'CODE_READING', language: 'en',
  }, async batch => {
    if (batch.generationGuidance?.includes('CODE COMPLETENESS REPAIR')) {
      assert(batch.generationGuidance.includes('Every replacement must include code'));
      return {
        quizJson: JSON.stringify([{
          q: 'What value does this code print?',
          code: 'value = 2\nprint(value)',
          codeLanguage: 'PYTHON',
          options: ['2', '0', '1', '3', '4'],
          correct: 0,
        }]),
      };
    }
    return { quizJson: JSON.stringify([{ q: 'What value does this code print?', options: ['2', '0', '1', '3', '4'], correct: 0 }]) };
  }));

  assert.equal(JSON.parse(result.quizJson)[0].code, 'value = 2\nprint(value)');
});

test('quiz code-completeness repair is bounded and fails closed after two invalid replacements', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const requestedCounts: number[] = [];
  const generation = runWithPromptExecutionContext('task.quiz', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'loops', count: 1, questionStyle: 'CONCEPTS', language: 'en',
  }, async batch => {
    requestedCounts.push(batch.count);
    return {
      quizJson: JSON.stringify([{ q: 'What output is produced by the following code?', options: ['0', '1', '2', '3', '4'], correct: 0 }]),
    };
  }));

  await assert.rejects(generation, /QUIZ_CODE_MISSING/);
  assert.deepEqual(requestedCounts, [1, 1, 1]);
});

test('diagnostic quiz code-completeness repair preserves four-option questions', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const result = await runWithPromptExecutionContext('assessment.diagnostic-questions', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: '[topic:11] indexing', count: 1, optionCount: 4, questionStyle: 'CONCEPTS', language: 'en',
  }, async batch => ({
    quizJson: JSON.stringify([batch.generationGuidance?.includes('CODE COMPLETENESS REPAIR')
      ? { q: '[topic:11] What does zero-based indexing mean?', options: ['The first position is 0', 'The first position is 1', 'Indexes are random', 'Arrays have no positions'], correct: 0 }
      : { q: '[topic:11] What output is produced by the following code?', options: ['0', '1', '2', '3'], correct: 0 }]),
  })));

  const [question] = JSON.parse(result.quizJson);
  assert.equal(question.options.length, 4);
  assert.equal(question.correct, 0);
});

test('diagnostic quiz duplicate repair preserves four-option questions', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  const result = await runWithPromptExecutionContext('assessment.diagnostic-questions', { timeoutMs: 10_000 }, () => orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'arrays and loops', count: 2, optionCount: 4, questionStyle: 'CONCEPTS', language: 'en',
  }, async batch => {
    if (batch.generationGuidance?.includes('DUPLICATE REPAIR')) {
      assert.equal(batch.count, 1);
      return {
        quizJson: JSON.stringify([{ q: 'What does a loop repeat?', options: ['A block of instructions', 'A variable declaration', 'A comment', 'A file name'], correct: 0 }]),
      };
    }
    return {
      quizJson: JSON.stringify([
        { q: 'What does an array store?', options: ['An ordered collection of values', 'A condition', 'A comment', 'A file name'], correct: 0 },
        { q: 'What does an array store?', options: ['An ordered collection of values', 'A condition', 'A comment', 'A file name'], correct: 0 },
      ]),
    };
  }));

  const questions = JSON.parse(result.quizJson);
  assert.equal(questions.length, 2);
  assert(questions.every((question: { options: string[] }) => question.options.length === 4));
});
