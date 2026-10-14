import test from "node:test";
import assert from "node:assert/strict";
import router from "./lessonQuiz";
import lessonsRouter from "./lessons";
import { AppDataSource } from "../../data-source";
import { EduLesson } from "../../entities/EduLesson";
import { Student } from "../../entities/Student";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { Class } from "../../entities/Class";
import { Membership } from "../../entities/Membership";

async function invoke(path: string, method: string, request: Record<string, unknown>, target = router) {
  const layer = (target as any).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  assert.ok(layer, `Route ${method} ${path} exists`);
  const handler = layer.route.stack.at(-1).handle;
  const response: any = { statusCode: 200, body: null, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, send() { return this; } };
  await handler({ params: { lessonId: "1", studentId: "7" }, headers: {}, ...request }, response);
  return response;
}

function repositories(t: any, attempt: any = null) {
  const saved: any[] = [];
  const cls = { id: 3, teacher: { id: 9 }, organizationId: null };
  const quiz = { questions: [{ id: "bool", type: "TRUE_FALSE", correct: false }, { id: "written", type: "OPEN_TEXT", points: 2 }] };
  const lesson = { id: 1, class: cls, quizJson: JSON.stringify(quiz) };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === EduLesson) return { findOne: async () => lesson };
    if (entity === Student) return { findOne: async () => ({ id: 7, class: cls }) };
    if (entity === QuizAttempt) return { findOne: async () => attempt, create: (value: unknown) => value, save: async (value: unknown) => { saved.push(value); return value; } };
    return { findOne: async () => cls };
  });
  t.mock.method(AppDataSource, "transaction", async (...args: any[]) => args[args.length - 1]({ createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => ({ id: 7 }) }), getRepository: (entity: unknown) => AppDataSource.getRepository(entity as any) }));
  return saved;
}

test("student quiz exposes final manual result without keys", async t => {
  repositories(t, { answersJson: JSON.stringify({ bool: false, written: "Own explanation", unexpected: "ignored" }), status: "MANUAL_GRADED", autoScore: "1", manualScore: "1.5", maxScore: "3", autoPercent: 100, finalPercent: 83 });
  const response = await invoke("/lessons/:lessonId/quiz", "get", { userType: "STUDENT", studentId: 7 });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.attempt.finalPercent, 83);
  assert.equal(response.body.attempt.manualScore, 1.5);
  assert.equal(response.body.quiz.questions[0].correct, undefined);
  assert.equal(response.body.attempt.needsManual, false);
  assert.deepEqual(response.body.submittedAnswers, { bool: false, written: "Own explanation" });
});
test("invalid student answers are rejected without writing an attempt", async t => {
  const saved = repositories(t);
  const response = await invoke("/lessons/:lessonId/quiz/submit", "post", { userType: "STUDENT", studentId: 7, body: { answers: [] } });
  assert.equal(response.statusCode, 400);
  assert.equal(saved.length, 0);
});
test("boolean false is persisted and scored correctly", async t => {
  const saved = repositories(t);
  const response = await invoke("/lessons/:lessonId/quiz/submit", "post", { userType: "STUDENT", studentId: 7, body: { answers: { bool: false, written: "Text" } } });
  assert.equal(response.statusCode, 201);
  assert.equal(response.body.result.autoScore, 1);
  assert.equal(saved[0].status, "NEEDS_MANUAL");
  assert.equal(JSON.parse(saved[0].answersJson).bool, false);
});
test("manual grading requires every open question and accepts explicit zero", async t => {
  const saved = repositories(t, { autoScore: 1, maxScore: 3, status: "NEEDS_MANUAL" });
  const request = { userId: 9, userType: "USER" };
  const missing = await invoke("/lessons/:lessonId/quiz/attempts/:studentId/grade-manual", "post", { ...request, body: { manualScores: {} } });
  assert.equal(missing.statusCode, 400);
  assert.equal(saved.length, 0);
  const complete = await invoke("/lessons/:lessonId/quiz/attempts/:studentId/grade-manual", "post", { ...request, body: { manualScores: { written: 0 } } });
  assert.equal(complete.statusCode, 200);
  assert.equal(complete.body.result.finalPercent, 33);
  assert.equal(saved[0].status, "MANUAL_GRADED");
});

test("User-backed student opens course lesson without staff authorization or quiz keys", async t => {
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => ({
    findOne: async () => entity === Student ? { id: 7, class: { id: 3 } } : {
      id: 1, class: { id: 3 }, type: "LESSON", title: "Lesson", tasks: [],
      createdAt: new Date(), quizJson: JSON.stringify({ questions: [{ id: "q", type: "TRUE_FALSE", correct: true }] }),
    },
  }));
  const response = await invoke("/lessons/:id", "get", { params: { id: "1" }, query: {}, userId: 9, userType: "STUDENT", studentId: 7 }, lessonsRouter);
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body.lesson.quizJson).questions[0].correct, undefined);
});

for (const type of ["TOPIC", "CONTROL"]) {
  test(`explicit ${type} never opens a coincident course lesson`, async t => {
    let courseReads = 0;
    const qb: any = { leftJoinAndSelect() { return this; }, where() { return this; }, andWhere() { return this; }, getOne: async () => null };
    t.mock.method(AppDataSource, "getRepository", (entity: unknown) => ({ findOne: async () => { if (entity === EduLesson) courseReads++; return { id: 1, type: "LESSON" }; }, createQueryBuilder: () => qb }));
    const response = await invoke("/lessons/:id", "get", { params: { id: "1" }, query: { type } }, lessonsRouter);
    assert.equal(response.statusCode, 404);
    assert.equal(courseReads, 0);
  });
}
test("a missing explicitly selected course lesson does not fall through to a legacy ID", async t => {
  t.mock.method(AppDataSource, "getRepository", () => ({ findOne: async () => null }));
  const response = await invoke("/lessons/:id", "get", { params: { id: "1" }, query: { source: "course" } }, lessonsRouter);
  assert.equal(response.statusCode, 404);
});
test("manual grading rejects scores over the question maximum instead of silently clamping", async t => {
  const saved = repositories(t, { autoScore: 1, maxScore: 3, status: "NEEDS_MANUAL" });
  const response = await invoke("/lessons/:lessonId/quiz/attempts/:studentId/grade-manual", "post", { userId: 9, userType: "USER", body: { manualScores: { written: 3 } } });
  assert.equal(response.statusCode, 400);
  assert.equal(saved.length, 0);
});
test("an assigned teacher can edit the course lesson quiz through the central authorizer", async t => {
  let saved = false;
  let freezeDuringSave = false;
  let reads = 0;
  const cls = { id: 3, organizationId: 2, teacher: { id: 9 }, teachers: [{ id: 11 }] };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === EduLesson) return { findOne: async () => ({ id: 1, class: cls }), save: async () => { saved = true; } };
    if (entity === Class) return { findOne: async () => cls };
    if (entity === Membership) return { findOne: async () => ({ role: "TEACHER" }) };
    return { count: async () => freezeDuringSave && ++reads > 1 ? 1 : 0 };
  });
  t.mock.method(AppDataSource, "transaction", async (...args: any[]) => args[args.length - 1]({ createQueryBuilder: () => ({ setLock() { return this; }, where() { return this; }, getOne: async () => ({ id: 7 }) }), getRepository: (entity: unknown) => AppDataSource.getRepository(entity as any) }));
  const response = await invoke("/lessons/:lessonId/quiz", "put", { userId: 11, userType: "USER", body: { quiz: [{ question: "Q", options: { A: "First", B: "Second" }, correct: "A" }] } });
  assert.equal(response.statusCode, 204);
  assert.equal(saved, true);
  saved = false;
  freezeDuringSave = true;
  const raced = await invoke("/lessons/:lessonId/quiz", "put", { userId: 11, userType: "USER", body: { quiz: [{ question: "Changed", options: { A: "First" }, correct: "A" }] } });
  assert.equal(raced.statusCode, 409);
  assert.equal(saved, false, "The transaction rechecks submissions after acquiring the lesson lock");
});

test("malformed stored own answers do not prevent reviewing a quiz result", async t => {
  repositories(t, { status: "AUTO_GRADED", answersJson: "{broken" });
  const response = await invoke("/lessons/:lessonId/quiz", "get", { userType: "STUDENT", studentId: 7 });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.submittedAnswers, {});
  assert.equal(response.body.quiz.questions[0].correct, undefined);
});
