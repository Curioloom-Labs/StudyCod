import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMOrchestrator, type AiQuizResult } from './LLMOrchestrator';
import { runWithPromptExecutionContext } from './promptExecution';

type QuizBatch = {
  lang: 'PYTHON';
  prevTopics: string;
  count: number;
  questionStyle: 'CONCEPTS';
  generationGuidance?: string;
  avoidQuestionStems?: string[];
};

type QuizBatchAccess = {
  generateQuizInBatches(
    params: QuizBatch,
    generateBatch: (batch: QuizBatch) => Promise<AiQuizResult>,
  ): Promise<AiQuizResult>;
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
