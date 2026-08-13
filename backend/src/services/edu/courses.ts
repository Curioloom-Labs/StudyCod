import { AppDataSource } from "../../data-source";
import { Course, type CourseStatus } from "../../entities/Course";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem, type CourseItemKind } from "../../entities/CourseItem";
import { CourseVariant, type CourseRuntime } from "../../entities/CourseVariant";

/**
 * Course-template authoring (P2.1). Reusable Course → Module → Item tree that is
 * later forked onto Classes (P2.2). Org-scoped: every course belongs to one org.
 */
const COURSE_ITEM_KINDS: CourseItemKind[] = ["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"];
const COURSE_RUNTIMES: CourseRuntime[] = ["JAVA", "PYTHON", "CPP"];

export function isCourseItemKind(value: unknown): value is CourseItemKind {
  return typeof value === "string" && (COURSE_ITEM_KINDS as string[]).includes(value);
}

export function normalizeCourseRuntime(value: unknown): CourseRuntime {
  const v = String(value ?? "").toUpperCase();
  return (COURSE_RUNTIMES as string[]).includes(v) ? (v as CourseRuntime) : "PYTHON";
}

/** @deprecated Use normalizeCourseRuntime; retained for older authoring tests. */

export function normalizeCourseStatus(value: unknown): CourseStatus {
  return value === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
}

const courseRepo = () => AppDataSource.getRepository(Course);
const moduleRepo = () => AppDataSource.getRepository(CourseModule);
const itemRepo = () => AppDataSource.getRepository(CourseItem);
const variantRepo = () => AppDataSource.getRepository(CourseVariant);

export async function createCourse(input: {
  orgId: number;
  title: string;
  description?: string | null;
  runtime?: unknown;
  createdByUserId: number;
}): Promise<Course> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("TITLE_REQUIRED");
  const runtime = normalizeCourseRuntime(input.runtime);
  const course = courseRepo().create({
    organization: { id: input.orgId } as any,
    title,
    description: input.description ?? null,
    catalogKey: null,
    level: "FOUNDATION",
    isBase: false,
    status: "DRAFT",
    createdByUserId: input.createdByUserId
  });
  const saved = await courseRepo().save(course);
  await variantRepo().save(variantRepo().create({
    course: { id: saved.id } as any,
    runtime,
    title: runtime === "CPP" ? "C++" : runtime === "JAVA" ? "Java" : "Python",
    status: "DRAFT"
  }));
  return saved;
}

export async function listCourses(orgId: number): Promise<Course[]> {
  return await courseRepo().find({
    where: { organization: { id: orgId } },
    relations: ["variants"],
    order: { updatedAt: "DESC" }
  });
}

/** Full tree (modules + items, ordered) for an org-scoped course, or null. */
export async function getCourseTree(courseId: number, orgId: number): Promise<Course | null> {
  const course = await courseRepo().findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course || course.organizationId !== orgId) return null;
  const modules = await moduleRepo().find({
    where: { course: { id: courseId } },
    relations: ["items"],
    order: { order: "ASC" }
  });
  for (const m of modules) {
    m.items = [...(m.items ?? [])].sort((a, b) => a.order - b.order);
  }
  course.modules = modules;
  course.variants = await variantRepo().find({ where: { course: { id: courseId } }, order: { id: "ASC" } });
  return course;
}

export async function addModule(courseId: number, title: string, order: number): Promise<CourseModule> {
  const t = String(title ?? "").trim();
  if (!t) throw new Error("TITLE_REQUIRED");
  const mod = moduleRepo().create({ course: { id: courseId } as any, title: t, order: Math.max(0, Math.floor(order) || 0) });
  return await moduleRepo().save(mod);
}

export async function addItem(input: {
  moduleId: number;
  kind: unknown;
  title: string;
  order: number;
  content?: Record<string, unknown> | null;
}): Promise<CourseItem> {
  if (!isCourseItemKind(input.kind)) throw new Error("INVALID_ITEM_KIND");
  const t = String(input.title ?? "").trim();
  if (!t) throw new Error("TITLE_REQUIRED");
  const item = itemRepo().create({
    module: { id: input.moduleId } as any,
    kind: input.kind,
    title: t,
    order: Math.max(0, Math.floor(input.order) || 0),
    content: input.content ?? null
  });
  return await itemRepo().save(item);
}

/** Publish/unpublish; only PUBLISHED courses are assignable to classes (P2.2). */
export async function setCourseStatus(courseId: number, orgId: number, status: CourseStatus): Promise<Course | null> {
  const course = await courseRepo().findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course || course.organizationId !== orgId) return null;
  course.status = normalizeCourseStatus(status);
  return await courseRepo().save(course);
}
