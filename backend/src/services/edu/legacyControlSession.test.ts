import test from 'node:test';
import assert from 'node:assert/strict';
import { AppDataSource } from '../../data-source';
import { Student } from '../../entities/Student';
import { ControlWork } from '../../entities/ControlWork';
import { LessonAttempt } from '../../entities/LessonAttempt';
import { TopicTask } from '../../entities/TopicTask';
import { TestData } from '../../entities/TestData';
import { changeLegacyControlSession } from './legacyControlSession';
import { assessmentRemainingSeconds } from '../../../../shared/utils/assessmentClock';
import { legacyStudentQuestions, normalizeLegacyAnswer } from '../../../../shared/utils/legacyQuiz';

function setup(t: any, overrides: Record<string, any> = {}) {
  const control = { id: 12, isAssigned: true, assignedStudentIds: null, hasTheory: true, hasPractice: false, timeLimitMinutes: 45, deadline: new Date(Date.now() + 10 * 60000), quizJson: '[{"q":"Question","options":["a","b"],"correct":0}]', topic: { class: { id: 3 } }, ...overrides.control };
  const attempts: any[] = overrides.attempts ?? [];
  let taskReads = 0;
  const manager = { getRepository(entity: unknown): any {
    if (entity === Student) return { findOne: async () => ({ id: 7, class: { id: 3 } }) };
    if (entity === ControlWork) return { findOne: async () => control };
    if (entity === TopicTask) return { find: async () => { taskReads++; return overrides.tasks ?? [{ id: 1, description: 'Solve', taskMode: 'CODE' }]; } };
    if (entity === TestData) return { count: async () => overrides.tests ?? 0 };
    if (entity === LessonAttempt) return {
      findOne: async ({ where }: any) => attempts.find(a => (!where.controlWork || a.controlWork.id === where.controlWork.id) && (!where.status || a.status === where.status)) ?? null,
      create: (value: any) => ({ id: 1, ...value }), save: async (value: any) => { if (!attempts.includes(value)) attempts.push(value); return value; }
    };
    throw new Error('Unexpected repository');
  } };
  t.mock.method(AppDataSource, 'transaction', async (...args: any[]) => args[args.length - 1](manager));
  return { attempts, taskReads: () => taskReads };
}

test('quiz-only start creates one timed attempt without requiring practice tests', async t => {
  const state = setup(t);
  const first = await changeLegacyControlSession(12, 7, 'START');
  const resumed = await changeLegacyControlSession(12, 7, 'START');
  assert.equal(state.attempts.length, 1);
  assert.equal(state.taskReads(), 0);
  assert.equal(resumed.startedAt, first.startedAt);
  assert.ok(first.remainingSeconds! <= 600 && first.remainingSeconds! > 590);
});
test('finished attempts cannot be reset even when no work was submitted', async t => {
  setup(t, { attempts: [{ controlWork: { id: 12 }, status: 'COMPLETED', startedAt: new Date(), timeLimitMinutes: 45 }] });
  await assert.rejects(changeLegacyControlSession(12, 7, 'START'), /CONTROL_WORK_COMPLETED/);
});
test('deadline and practice readiness are enforced before creating an attempt', async t => {
  setup(t, { control: { deadline: new Date(Date.now() - 1000) } });
  await assert.rejects(changeLegacyControlSession(12, 7, 'START'), /CONTROL_WORK_DEADLINE_PASSED/);
});
test('practice-only assessment requires actual grading tests', async t => {
  const state = setup(t, { control: { hasTheory: false, hasPractice: true } });
  await assert.rejects(changeLegacyControlSession(12, 7, 'START'), /ASSESSMENT_NOT_READY/);
  assert.equal(state.attempts.length, 0);
});
test('another active control cannot run in parallel', async t => {
  setup(t, { attempts: [{ controlWork: { id: 99 }, status: 'IN_PROGRESS', startedAt: new Date(), timeLimitMinutes: 45 }] });
  await assert.rejects(changeLegacyControlSession(12, 7, 'START'), /CONTROL_WORK_ALREADY_IN_PROGRESS/);
});
test('absolute clock uses the earlier of duration and deadline across reloads', () => {
  const start = new Date('2026-10-31T10:00:00Z');
  assert.equal(assessmentRemainingSeconds(start, 45, '2026-10-31T10:10:00Z', Date.parse('2026-10-31T10:03:00Z')), 420);
  assert.equal(assessmentRemainingSeconds(start, 5, '2026-10-31T10:10:00Z', Date.parse('2026-10-31T10:03:00Z')), 120);
  assert.equal(assessmentRemainingSeconds(start, 45, '2026-10-31T10:10:00Z', Date.parse('2026-10-31T10:11:00Z')), 0);
});
test('both stored question formats preserve code and normalize option keys for scoring', () => {
  const questions = legacyStudentQuestions(JSON.stringify([{ q: 'What prints?\n```python\nprint(1)\n```', options: ['1', '2'] }, { question: 'Question', options: { A: 'Yes', B: 'No' } }]));
  assert.match(questions[0].question, /print\(1\)/);
  assert.deepEqual(questions[0].options, { А: '1', Б: '2' });
  assert.equal(normalizeLegacyAnswer(0), normalizeLegacyAnswer('A'));
  assert.equal(normalizeLegacyAnswer('Б'), normalizeLegacyAnswer('1'));
});
