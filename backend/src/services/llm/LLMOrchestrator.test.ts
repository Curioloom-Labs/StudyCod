import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMOrchestrator, type AiQuizResult } from './LLMOrchestrator';

type QuizBatch = {
  lang: 'PYTHON';
  prevTopics: string;
  count: number;
  questionStyle: 'CONCEPTS';
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

  assert.deepEqual(requestedCounts, [12, 12, 12, 9]);
  assert.equal(JSON.parse(result.quizJson).length, 45);
});

test('large quizzes reject duplicate question stems across batches', async () => {
  const orchestrator = new LLMOrchestrator() as unknown as QuizBatchAccess;
  await assert.rejects(orchestrator.generateQuizInBatches({
    lang: 'PYTHON', prevTopics: 'arrays', count: 13, questionStyle: 'CONCEPTS',
  }, async batch => ({
    quizJson: JSON.stringify(Array.from({ length: batch.count }, (_, index) => ({
      q: `Question concept ${index + 1}`,
      options: ['A', 'B', 'C', 'D', 'E'],
      correct: 0,
    }))),
  })), /duplicate question stems/i);
});
