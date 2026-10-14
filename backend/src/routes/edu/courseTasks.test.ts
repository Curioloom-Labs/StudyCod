import test from "node:test";
import assert from "node:assert/strict";
import router from "./courseTasks";
import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import { TestData } from "../../entities/TestData";
import worker = require("../../services/judgeWorker");

async function getTask(source: string) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === "/tasks/:taskId" && entry.route.methods.get);
  const res: any = { code: 200, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  let nextCalls = 0;
  await layer.route.stack.at(-1).handle({ params: { taskId: "7" }, query: { source } }, res, () => { nextCalls++; });
  return { res, nextCalls };
}
test("explicit legacy task source bypasses course IDs without any reads", async t => {
  t.mock.method(AppDataSource, "getRepository", () => { throw new Error("Must not read the course table"); });
  const result = await getTask("legacy");
  assert.equal(result.nextCalls, 1);
});
test("explicit missing course task returns 404 without resolving a coincident legacy task", async t => {
  t.mock.method(AppDataSource, "getRepository", () => ({ findOne: async () => null }));
  const result = await getTask("course");
  assert.equal(result.res.code, 404);
  assert.equal(result.nextCalls, 0);
});

function mockSubmission(t: any, grade: unknown = null) {
  const task = { id: 7, taskMode: "CODE", maxAttempts: 3, isClosed: false, lesson: { id: 2, type: "LESSON", class: { id: 3 } } };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown): any => {
    if (entity === EduTask) return { findOne: async () => task };
    if (entity === Student) return { findOne: async () => ({ id: 4, class: { id: 3 } }) };
    if (entity === EduGrade) return { findOne: async () => grade, count: async () => 0 };
    if (entity === TestData) return { find: async () => [] };
    throw new Error("Unexpected repository");
  });
  t.mock.method(AppDataSource, "transaction", () => { throw new Error("Must not consume an attempt"); });
  t.mock.method(worker, "judgeWithSemaphore", () => { throw new Error("Must not execute code"); });
}
async function submit() {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === "/tasks/:taskId/submit" && entry.route.methods.post);
  const res: any = { code: 200, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await layer.route.stack.at(-1).handle({ method: "POST", userType: "STUDENT", studentId: 4, params: { taskId: "7" }, query: { source: "course" }, body: { code: "print(1)" } }, res, () => { throw new Error("Must not resolve legacy task"); });
  return res;
}
test("an unconfigured course CODE task cannot award 100 or consume an attempt", async t => {
  mockSubmission(t);
  const res = await submit();
  assert.equal(res.code, 409); assert.equal(res.body.message, "NO_TESTS_CONFIGURED");
});
test("a passed or manually reviewed course grade cannot be overwritten through direct submission", async t => {
  for (const grade of [{ isCompleted: true }, { isManuallyGraded: true }]) {
    mockSubmission(t, grade);
    const res = await submit();
    assert.equal(res.code, 409); assert.equal(res.body.message, "TASK_ALREADY_COMPLETED");
  }
});
