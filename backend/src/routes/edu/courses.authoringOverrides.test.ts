import assert from "node:assert/strict";
import test from "node:test";
import type { Response } from "express";
import { AppDataSource } from "../../data-source";
import { AuditLog } from "../../entities/AuditLog";
import { Course } from "../../entities/Course";
import { CourseItem } from "../../entities/CourseItem";
import { CourseModule } from "../../entities/CourseModule";
import type { AuthRequest } from "../../middleware/authMiddleware";
import { buildOlympiadPracticeContract } from "../../services/learning/learningContract";
import coursesRouter from "./courses";

const sourceCourse = () => Object.assign(new Course(), {
  id: 501,
  organizationId: null,
  catalogKey: "olympiad-python",
  title: "Olympiad Programming: Python",
  description: "Source description",
  status: "PUBLISHED",
  authoringOverrides: null,
});

async function call(method: string, path: string, body: unknown, identity: object) {
  const layer = coursesRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer, `Missing ${method} ${path}`);
  let status = 200;
  let responseBody: unknown;
  const res = {
    status(code: number) { status = code; return res; },
    json(value: unknown) { responseBody = value; return res; },
  };
  const req = {
    ...identity,
    params: { courseId: "501", itemId: "801", moduleId: "701" },
    body,
    headers: {},
    ip: "127.0.0.1",
  } as unknown as AuthRequest;
  await layer.route.stack.at(-1).handle(req, res as unknown as Response);
  return { status, body: responseBody };
}

const admin = { userId: 7, userType: "USER", userRole: "SYSTEM_ADMIN" };
const ordinaryUser = { userId: 8, userType: "USER", userRole: "USER" };

test("System Admin can edit a YAML course and the route records only the changed field", async (t) => {
  const course = sourceCourse();
  const savedCourses: Course[] = [];
  const courseRepository = {
    findOne: async () => course,
    save: async (value: Course) => { savedCourses.push(value); return value; },
  };
  const auditRepository = { create: (value: unknown) => value, save: async (value: unknown) => value };
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Course) return courseRepository;
    if (entity === AuditLog) return auditRepository;
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("put", "/courses/:courseId", { title: "Python Olympiad Training" }, admin);

  assert.equal(result.status, 200);
  assert.equal(course.title, "Python Olympiad Training");
  assert.deepEqual(course.authoringOverrides, { title: true });
  assert.equal(savedCourses.length, 1);
});

test("non-admin cannot edit a YAML-backed global course", async (t) => {
  const course = sourceCourse();
  let saveCount = 0;
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Course) return {
      findOne: async () => course,
      save: async (value: Course) => { saveCount += 1; return value; },
    };
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("put", "/courses/:courseId", { title: "Unauthorized edit" }, ordinaryUser);

  assert.equal(result.status, 404);
  assert.equal(saveCount, 0);
  assert.equal(course.title, "Olympiad Programming: Python");
});

test("the System Admin global editor lists YAML-backed catalog courses", async (t) => {
  const course = sourceCourse();
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Course) return { find: async () => [course] };
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("get", "/global/courses", {}, admin);
  const listedCourse = (result.body as { courses: Array<Record<string, unknown>> }).courses[0];

  assert.equal(result.status, 200);
  assert.equal(listedCourse.catalogKey, "olympiad-python");
  assert.equal(listedCourse.isSourceManagedCourse, true);
  assert.equal(listedCourse.hasAuthoringOverrides, false);
});

test("published source courses reject a lesson edit before it can make the course incomplete", async (t) => {
  const course = sourceCourse();
  const module = Object.assign(new CourseModule(), { id: 701, courseId: course.id, course, items: [] as CourseItem[] });
  const persistedItem = Object.assign(new CourseItem(), {
    id: 801,
    module,
    moduleId: module.id,
    kind: "THEORY",
    title: "Prefix sums",
    order: 0,
    content: { markdown: "# Prefix sums" },
    authoringOverrides: null,
  });
  module.items = [persistedItem];
  let saveCount = 0;
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === CourseItem) return {
      findOne: async () => Object.assign(new CourseItem(), persistedItem),
      save: async (value: CourseItem) => { saveCount += 1; return value; },
    };
    if (entity === Course) return { findOne: async () => course };
    if (entity === CourseModule) return { find: async () => [module] };
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("put", "/items/:itemId", { content: {} }, admin);

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { message: "COURSE_CONTENT_INCOMPLETE", issues: ["ITEM_801_HAS_NO_CONTENT"] });
  assert.equal(saveCount, 0);
  assert.equal(persistedItem.authoringOverrides, null);
  assert.deepEqual(persistedItem.content, { markdown: "# Prefix sums" });
});

test("published source courses require draft status before adding a module", async (t) => {
  const course = sourceCourse();
  let findCount = 0;
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Course) return { findOne: async () => { findCount += 1; return course; } };
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("post", "/courses/:courseId/modules", { title: "New module", order: 13 }, admin);

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { message: "COURSE_MUST_BE_DRAFT_TO_EDIT_STRUCTURE" });
  assert.equal(findCount, 1);
});

test("valid published-course task edits keep the dynamic learning contract", async (t) => {
  const course = sourceCourse();
  const contract = buildOlympiadPracticeContract({
    courseKey: "olympiad-python",
    topicKey: "prefix-sums",
    topicTitle: "Practice: Prefix sums",
    runtime: "PYTHON",
    objective: "Answer range-sum queries.",
    sequence: 1,
    total: 3,
  });
  const dynamicContent = { exercise: { prompt: "Generate a fresh range-sum task.", runtime: "PYTHON", learningContract: contract } };
  const module = Object.assign(new CourseModule(), { id: 701, courseId: course.id, course, items: [] as CourseItem[] });
  const item = Object.assign(new CourseItem(), {
    id: 801,
    module,
    moduleId: module.id,
    kind: "CODE_TASK",
    title: "Prefix sums practice",
    order: 1,
    content: dynamicContent,
    authoringOverrides: null,
  });
  module.items = [item];
  const auditRepository = { create: (value: unknown) => value, save: async (value: unknown) => value };
  const savedItems: CourseItem[] = [];
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === CourseItem) return {
      findOne: async () => item,
      save: async (value: CourseItem) => { savedItems.push(value); return value; },
    };
    if (entity === Course) return { findOne: async () => course };
    if (entity === CourseModule) return { find: async () => [module] };
    if (entity === AuditLog) return auditRepository;
    throw new Error("Unexpected repository");
  }) as unknown as typeof AppDataSource.getRepository);

  const result = await call("put", "/items/:itemId", { title: "Prefix sums practice · authored" }, admin);

  assert.equal(result.status, 200);
  const savedItem = savedItems[0];
  assert.ok(savedItem);
  const savedOverrides = savedItem.authoringOverrides as Record<string, unknown> | null;
  assert.equal(savedOverrides?.title, true);
  assert.equal(savedItem.content, dynamicContent);
  assert.equal(savedItem.id, item.id);
  const savedExercise = savedItem.content?.exercise as { learningContract?: { topicKey?: string } } | undefined;
  assert.equal(savedExercise?.learningContract?.topicKey, "prefix-sums");
});
