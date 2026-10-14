import test from "node:test";
import assert from "node:assert/strict";
import router from "./manualTasks";
import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import * as submissions from "../../services/edu/manualSubmissions";

test("manual rubric grade stores raw points and a normalized journal percentage, including explicit zero", async t => {
  const saved: any[] = [];
  const cls = { id: 3, organizationId: null };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown): any => {
    if (entity === EduTask) return { findOne: async () => ({ id: 1, taskMode: "MANUAL", lesson: { id: 1, class: cls }, rubric: [] }) };
    if (entity === Student) return { findOne: async () => ({ id: 7, class: cls }) };
    if (entity === EduGrade) return { findOne: async () => null, create: (value: any) => value, save: async (value: any) => { saved.push(value); return value; } };
    return { findOne: async () => cls };
  });
  t.mock.method(submissions, "getSubmission", async () => ({ status: "SUBMITTED" }));
  t.mock.method(submissions, "gradeManualSubmission", async (task: any, student: any, input: any) => {
    const grade = { total: Math.round(input.total / input.maxScore * 100), score: input.total, maxScore: input.maxScore };
    saved.push(grade);
    return { grade, revision: "saved" };
  });
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === "/manual-tasks/:taskId/submissions/:studentId/grade");
  const invoke = async (total: unknown, maxScore: unknown = 20) => {
    const response: any = { code: 200, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
    await layer.route.stack[layer.route.stack.length - 1].handle({ params: { taskId: "1", studentId: "7" }, userId: 9, userType: "USER", userRole: "SYSTEM_ADMIN", body: { total, maxScore } }, response);
    return response;
  };
  assert.equal((await invoke(10)).code, 200);
  assert.equal(saved[0].total, 50);
  assert.equal(saved[0].score, 10);
  assert.equal(saved[0].maxScore, 20);
  assert.equal((await invoke(0)).code, 200);
  assert.equal(saved[1].total, 0);
  assert.equal((await invoke(21)).code, 400);
  assert.equal((await invoke("")).code, 400);
  assert.equal((await invoke(0, 0)).code, 400);
  assert.equal((await invoke(10, "20")).code, 400);
  assert.equal(saved.length, 2);
});
