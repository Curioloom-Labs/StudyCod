import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { Task } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { UserCourseEnrollment } from "../entities/UserCourseEnrollment";
import tasksRouter from "./tasks";

async function call(method: string, path: string, userId: number, query = {}) {
  const layer = tasksRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const res = { status(value: number) { status = value; return res; }, json(value: unknown) { body = value; return res; }, setHeader() {} };
  await layer.route.stack.at(-1).handle({ userId, learningRuntime: "PYTHON", body: {}, headers: { "x-ui-language": "uk" }, query }, res);
  return { status, body };
}

test("rejected duplicate generation requests keep the original request's reservation", async (t) => {
  let finish!: () => void;
  let started!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const entered = new Promise<void>((resolve) => { started = resolve; });
  t.mock.method(AppDataSource, "getRepository", () => ({ findOne: async () => { started(); await pending; return null; } }) as any);
  const first = call("post", "/generate", 920001);
  try {
    await entered;
    for (let attempt = 0; attempt < 2; attempt++) {
      const duplicate = await call("post", "/generate", 920001);
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.message, "GENERATE_REQUEST_IN_PROGRESS");
    }
  } finally {
    finish();
    await first;
  }
});

test("an unfinished course exercise does not block Lab generation", async (t) => {
  const conditions: string[] = [];
  const query: any = {};
  for (const method of ["leftJoin", "where", "andWhere", "orderBy", "select"]) {
    query[method] = (condition: string) => { conditions.push(condition); return query; };
  }
  query.getOne = async () => conditions.includes("task.course_enrollment_id IS NULL") ? null : { id: 777, type: "TOPIC" };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === User) return { findOne: async () => ({ id: 920002, userMode: "PERSONAL" }) } as any;
    if (entity === Task) return { createQueryBuilder: () => query } as any;
    if (entity === Topic) return { find: async () => [] } as any;
    throw new Error("Unexpected repository");
  });
  const result = await call("post", "/generate", 920002);
  assert.equal(result.status, 404);
  assert.equal(result.body.message, "NO_TOPICS");
});

test("course task lists use the authorized enrollment instead of the active Lab runtime", async (t) => {
  const conditions: string[] = [];
  const query: any = { getMany: async () => [] };
  for (const method of ["leftJoinAndSelect", "where", "andWhere", "orderBy"]) {
    query[method] = (condition: string) => { conditions.push(condition); return query; };
  }
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => {
    if (entity === UserCourseEnrollment) return { findOne: async () => ({ id: 99, variant: { runtime: "CPP" } }) } as any;
    if (entity === Task) return { createQueryBuilder: () => query } as any;
    throw new Error("Unexpected repository");
  });
  const course = await call("get", "/", 920003, { scope: "COURSE", courseEnrollmentId: "99" });
  assert.equal(course.status, 200);
  assert.ok(conditions.includes("task.course_enrollment_id = :enrollmentId"));
  assert.ok(!conditions.includes("task.lang = :runtime"));
  conditions.length = 0;
  const lab = await call("get", "/", 920003, { scope: "LAB" });
  assert.equal(lab.status, 200);
  assert.ok(conditions.includes("task.lang = :runtime"));
  assert.ok(conditions.includes("task.course_enrollment_id IS NULL"));
});
