import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMOrchestrator, type AiQuizResult } from './LLMOrchestrator';
import { runWithPromptExecutionContext } from './promptExecution';

type QuizBatch = {
  lang: 'PYTHON';
  prevTopics: string;
  count: number;
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
    prevTopics: '[topic:10] arrays\n[topic:11] indexing',
    count: 2,
    questionStyle: 'CONCEPTS',
    language: 'en',
    generationGuidance: 'Course diagnostic questions must be conceptual.',
  }, async batch => {
    requestedCounts.push(batch.count);
    if (batch.generationGuidance?.includes('CODE COMPLETENESS REPAIR')) {
      assert.equal(batch.count, 1);
      assert(batch.generationGuidance.includes('Replacement 1 replaces original question 2'));
      assert(batch.generationGuidance.includes('begin q with [topic:11]'));
      assert(batch.generationGuidance.includes('Do not ask for the output or behavior'));
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

test('OpenRouter code-incomplete answers reach the shared topic-preserving repair instead of exhausting provider retries', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  let providerCalls = 0;
  const provider = {
    generateText: async (prompt: string) => {
      providerCalls++;
      if (prompt.includes('CODE COMPLETENESS REPAIR')) {
        assert(prompt.includes('begin q with [topic:11]'));
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
