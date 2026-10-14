import test from "node:test";
import assert from "node:assert/strict";
import router from "./edu";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { EduLesson } from "../entities/EduLesson";
import { Membership } from "../entities/Membership";
import { Organization } from "../entities/Organization";
import { Class } from "../entities/Class";

async function invoke(path: string, method: string, request: any) {
  const layer = (router as any).stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]);
  const response: any = { code: 200, status(code: number) { this.code = code; return this; }, json(body: unknown) { this.body = body; return this; } };
  await layer.route.stack[layer.route.stack.length - 1].handle(request, response);
  return response;
}
test("class creation honors the selected organization and rejects unrelated organizations", async t => {
  let written: any = null;
  const roles = new Map([[1, "TEACHER"], [2, "ORG_ADMIN"], [4, "ASSISTANT"]]);
  const repo = (entity: unknown) => {
    if (entity === Organization) return { findOne: async (query: any) => ({ id: query.where.id }) };
    if (entity === User) return { findOne: async () => ({ id: 9, userMode: "EDUCATIONAL", role: "USER", eduSessionVersion: 0 }), createQueryBuilder: () => { const qb: any = { where: () => qb, andWhere: () => qb, getExists: async () => false }; return qb; } };
    if (entity === Membership) return { findOneBy: async (query: any) => roles.has(query.organization.id) ? { role: roles.get(query.organization.id) } : null };
    if (entity === Class) return { create: (draft: any) => draft, save: async (draft: any) => { written = draft; return draft; } };
    throw new Error("Unexpected repository");
  };
  t.mock.method(AppDataSource, "transaction", async (_isolation: any, fn: any) => fn({ getRepository: repo }));
  const response = await invoke("/classes", "post", { userId: 9, userType: "USER", eduSessionVersion: 0, body: { name: "  Class B  ", organizationId: 2 } });
  assert.equal(response.code, 201);
  assert.equal(written.organization.id, 2);
  assert.equal(written.name, "Class B");
  written = null;
  const denied = await invoke("/classes", "post", { userId: 9, userType: "USER", eduSessionVersion: 0, body: { name: "Other", organizationId: 3 } });
  assert.equal(denied.code, 403);
  assert.equal(written, null);
  const assistant = await invoke("/classes", "post", { userId: 9, userType: "USER", eduSessionVersion: 0, body: { name: "Assistant", organizationId: 4 } });
  assert.equal(assistant.code, 403);
  assert.equal(written, null);
  const student = await invoke("/classes", "post", { userType: "STUDENT", body: { name: "Student", organizationId: 2 } });
  assert.equal(student.code, 403);
  assert.equal(written, null);
});
test("class lesson list preserves both coincident topic and course IDs", async t => {
  const date = new Date();
  const qb: any = { leftJoinAndSelect() { return this; }, where() { return this; }, orderBy() { return this; }, addOrderBy() { return this; }, getMany: async () => [{ id: 1, title: "Topic", tasks: [], createdAt: date }] };
  t.mock.method(AppDataSource, "getRepository", (entity: unknown) => entity === EduLesson
    ? { find: async () => [{ id: 1, title: "Course", type: "LESSON", tasks: [], createdAt: date }] }
    : { createQueryBuilder: () => qb });
  const response = await invoke("/classes/:classId/lessons", "get", { classAccess: { cls: { id: 3 } } });
  assert.equal(response.code, 200);
  assert.deepEqual(response.body.lessons.map((lesson: any) => [lesson.source, lesson.type, lesson.title]), [["course", "LESSON", "Course"], ["legacy", "TOPIC", "Topic"]]);
});
