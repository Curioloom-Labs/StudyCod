import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { EduLesson } from "../../entities/EduLesson";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { courseAttemptState, startCourseLessonAttempt, assertCourseLessonActive, assertCoursePracticeActive, buildCourseControlReport, finishCourseLessonAttempt, assertCourseAssessmentReady } from "./courseLessonAttempt";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { EduTask } from "../../entities/EduTask";
import { TestData } from "../../entities/TestData";

const at = new Date("2026-10-11T12:00:00Z");
test("course control clock expires at the boundary and supports untimed work", () => {
  const attempt = { id: 1, startedAt: at, status: "IN_PROGRESS", timeLimitMinutes: 1 } as LessonAttempt;
  assert.equal(courseAttemptState(null).status, "NOT_STARTED");
  assert.equal(courseAttemptState(attempt, at.getTime() + 59_000).remainingSeconds, 1);
  assert.equal(courseAttemptState(attempt, at.getTime() + 60_000).status, "COMPLETED");
  assert.equal(courseAttemptState({ ...attempt, timeLimitMinutes: 0 }, at.getTime() + 99_000).remainingSeconds, null);
});
test("reloading reuses the first attempt and never resets an expired attempt", async t => {
  let stored: LessonAttempt | null = null;
  let writes = 0;
  const repo = { findOne: async () => stored, create: (draft: any) => draft, save: async (draft: any) => { writes++; stored = { id: 1, ...draft }; return stored; } };
  const qb: any = { setLock() { return this; }, where() { return this; }, getOne: async () => ({ id: 7 }) };
  const lesson = { id: 1, type: "CONTROL", timeLimitMinutes: 30, controlHasPractice: false } as EduLesson;
  t.mock.method(AppDataSource, "transaction", async (...args: any[]) => args[args.length - 1]({ getRepository: (entity: unknown) => entity === EduLesson ? { findOne: async () => lesson } : repo, createQueryBuilder: () => qb }));
  const initial = await startCourseLessonAttempt(lesson, 7);
  const reload = await startCourseLessonAttempt(lesson, 7);
  assert.equal(initial.startedAt, reload.startedAt);
  assert.equal(writes, 1);
  stored!.startedAt = new Date(Date.now() - 31 * 60_000);
  await assert.rejects(startCourseLessonAttempt(lesson, 7), /CONTROL_WORK_COMPLETED/);
  assert.equal(writes, 1);
});

test("an unfinished assessment cannot start its clock and freeze missing grading criteria", async () => {
  let tasks: any[] = [], rows: any[] = [];
  const qb: any = { select() { return this; }, addSelect() { return this; }, where() { return this; }, groupBy() { return this; }, getRawMany: async () => rows };
  const manager: any = { getRepository: (entity: unknown) => entity === EduTask ? { find: async () => tasks } : entity === TestData ? { createQueryBuilder: () => qb } : {} };
  const lesson = { id: 1, type: "CONTROL", controlHasPractice: true, controlHasTheory: false } as EduLesson;
  await assert.rejects(assertCourseAssessmentReady(lesson, manager), /ASSESSMENT_NOT_READY/);
  tasks = [{ id: 2, taskMode: "CODE", isClosed: false }];
  await assert.rejects(assertCourseAssessmentReady(lesson, manager), /ASSESSMENT_NOT_READY/);
  rows = [{ taskId: 2, count: 1 }]; await assertCourseAssessmentReady(lesson, manager);
  await assert.rejects(assertCourseAssessmentReady({ ...lesson, controlHasTheory: true, quizJson: '{"questions":[]}' }, manager), /ASSESSMENT_NOT_READY/);
  await assertCourseAssessmentReady({ ...lesson, controlHasTheory: true, quizJson: '{"questions":[{"id":"one","type":"TRUE_FALSE","correct":false}]}' }, manager);
});
test("control submissions require an active attempt; ordinary lessons remain available", async t => {
  let stored: LessonAttempt | null = null;
  t.mock.method(AppDataSource, "getRepository", () => ({ findOne: async () => stored }));
  const lesson = { id: 1, type: "CONTROL" } as EduLesson;
  await assert.rejects(assertCourseLessonActive(lesson, 7), /ATTEMPT_NOT_STARTED/);
  stored = { startedAt: new Date(Date.now() - 61_000), status: "IN_PROGRESS", timeLimitMinutes: 1 } as LessonAttempt;
  await assert.rejects(assertCourseLessonActive(lesson, 7), /CONTROL_WORK_COMPLETED/);
  await assertCourseLessonActive({ ...lesson, type: "LESSON" }, 7);
});
test("course practice is gated by the required quiz across submission types", async t => {
  let quiz: unknown = null;
  t.mock.method(AppDataSource, "getRepository", (entity: unknown): any => ({ findOne: async () => entity === QuizAttempt ? quiz : { startedAt: new Date(), status: "IN_PROGRESS", timeLimitMinutes: 30 } }));
  const lesson = { id: 1, type: "CONTROL", controlHasTheory: true } as EduLesson;
  await assert.rejects(assertCoursePracticeActive(lesson, 7), /QUIZ_REQUIRED/);
  quiz = { status: "NEEDS_MANUAL" };
  await assertCoursePracticeActive(lesson, 7);
});


test("course control report keeps manual review pending and updates when raw points arrive", () => {
  const lesson: any = { controlHasTheory: true, controlHasPractice: true };
  const tasks: any[] = [{ id: 1, title: "Explain", taskMode: "MANUAL" }, { id: 2, title: "Code", taskMode: "CODE" }];
  const submitted: any[] = [{ taskId: 1, status: "SUBMITTED" }];
  const quiz: any = { status: "AUTO_GRADED", autoPercent: 100 };
  const pending = buildCourseControlReport(lesson, tasks, [], submitted, quiz, true);
  assert.equal(pending.finalPercent, null);
  assert.equal(pending.pendingReview, 1);
  assert.deepEqual(pending.missingTaskIds, [2]);
  // Older manual grades stored total in raw points. Report normalizes the raw fields.
  const grades: any[] = [{ task: { id: 1 }, total: 10, score: 10, maxScore: 20, isManuallyGraded: true }];
  const reviewed = buildCourseControlReport(lesson, tasks, grades, submitted, quiz, true);
  assert.equal(reviewed.practicePercent, 25);
  assert.equal(reviewed.finalPercent, 63);
  assert.equal(reviewed.tasks[1].percent, 0);
});

test("course report treats an unfinished quiz as zero only after completion", () => {
  const lesson: any = { controlHasTheory: true, controlHasPractice: false };
  assert.equal(buildCourseControlReport(lesson, [], [], [], null, false).finalPercent, null);
  assert.equal(buildCourseControlReport(lesson, [], [], [], null, true).finalPercent, 0);
  const quiz: any = { status: "NEEDS_MANUAL", autoPercent: 100 };
  assert.equal(buildCourseControlReport(lesson, [], [], [], quiz, true).finalPercent, null);
  quiz.status = "MANUAL_GRADED"; quiz.finalPercent = 0;
  assert.equal(buildCourseControlReport(lesson, [], [], [], quiz, true).finalPercent, 0);
});

test("control report uses the newest grade and excludes a disabled practice section", () => {
  const tasks: any[] = [{ id: 1, title: "Code", taskMode: "CODE" }];
  const grades: any[] = [{ task: { id: 1 }, total: 80 }, { task: { id: 1 }, total: 100 }];
  assert.equal(buildCourseControlReport({ controlHasPractice: true } as any, tasks, grades, [], null, true).finalPercent, 80);
  assert.equal(buildCourseControlReport({ controlHasPractice: false, controlHasTheory: true } as any, tasks, grades, [], { status: "AUTO_GRADED", autoPercent: 50 } as any, true).finalPercent, 50);
});

function mockFinish(t: any, classId = 3, started = true, timed = false) {
  const lesson = { id: 1, class: { id: 3 }, type: "CONTROL", tasks: [], controlHasTheory: false };
  const attempt = started ? { id: 1, lesson, startedAt: timed ? at : new Date(), timeLimitMinutes: timed ? 1 : 0, status: "IN_PROGRESS", isFinished: false, finishedAt: null as Date | null } : null;
  let saves = 0;
  const qb: any = { leftJoinAndSelect() { return this; }, setLock() { return this; }, where() { return this; }, getOne: async () => ({ id: 7, class: { id: classId } }) };
  t.mock.method(AppDataSource, "transaction", async (...args: any[]) => {
    assert.equal(args[0], "SERIALIZABLE");
    return args[1]({ createQueryBuilder: () => qb, getRepository: (entity: unknown) => ({
      findOne: async () => entity === EduLesson ? lesson : entity === LessonAttempt ? attempt : null,
      save: async () => { saves++; return attempt; },
    }) });
  });
  return { attempt, saves: () => saves };
}

test("finishing an untimed course control is idempotent and keeps the first completion time", async t => {
  const state = mockFinish(t);
  const first = await finishCourseLessonAttempt(1, 7);
  const repeated = await finishCourseLessonAttempt(1, 7);
  assert.equal(first.attempt.status, "COMPLETED");
  assert.equal("reason" in first.attempt && first.attempt.reason, "FINISHED");
  assert.equal("finishedAt" in first.attempt && first.attempt.finishedAt, "finishedAt" in repeated.attempt && repeated.attempt.finishedAt);
  assert.equal(state.saves(), 1);
  assert.equal(first.report.finalPercent, 0);
});

test("finishing a course control requires current class membership and a started attempt", async t => {
  let state = mockFinish(t, 4);
  await assert.rejects(finishCourseLessonAttempt(1, 7), /ACCESS_DENIED/);
  assert.equal(state.saves(), 0);
  t.mock.restoreAll();
  state = mockFinish(t, 3, false);
  await assert.rejects(finishCourseLessonAttempt(1, 7), /ATTEMPT_NOT_STARTED/);
  assert.equal(state.saves(), 0);
});

test("finishing after a course timer expires records the timer boundary", async t => {
  const state = mockFinish(t, 3, true, true);
  const result = await finishCourseLessonAttempt(1, 7);
  assert.equal("reason" in result.attempt && result.attempt.reason, "TIME_EXPIRED");
  assert.equal(state.attempt?.finishedAt?.toISOString(), new Date(at.getTime() + 60000).toISOString());
});
