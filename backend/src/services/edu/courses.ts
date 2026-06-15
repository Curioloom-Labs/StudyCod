import { AppDataSource } from "../../data-source";
import { Course, type CourseLanguage, type CourseStatus } from "../../entities/Course";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem, type CourseItemKind } from "../../entities/CourseItem";

/**
 * Course-template authoring (P2.1). Reusable Course → Module → Item tree that is
 * later forked onto Classes (P2.2). Org-scoped: every course belongs to one org.
 */
const COURSE_ITEM_KINDS: CourseItemKind[] = ["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"];
const COURSE_LANGUAGES: CourseLanguage[] = ["JAVA", "PYTHON", "CPP"];

export function isCourseItemKind(value: unknown): value is CourseItemKind {
  return typeof value === "string" && (COURSE_ITEM_KINDS as string[]).includes(value);
}

export function normalizeCourseLanguage(value: unknown): CourseLanguage {
  const v = String(value ?? "").toUpperCase();
  return (COURSE_LANGUAGES as string[]).includes(v) ? (v as CourseLanguage) : "PYTHON";
}

export function normalizeCourseStatus(value: unknown): CourseStatus {
  return value === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
}

const courseRepo = () => AppDataSource.getRepository(Course);
const moduleRepo = () => AppDataSource.getRepository(CourseModule);
const itemRepo = () => AppDataSource.getRepository(CourseItem);

export async function createCourse(input: {
  orgId: number;
  title: string;
  description?: string | null;
  language?: unknown;
  createdByUserId: number;
}): Promise<Course> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("TITLE_REQUIRED");
  const course = courseRepo().create({
    organization: { id: input.orgId } as any,
    title,
    description: input.description ?? null,
    language: normalizeCourseLanguage(input.language),
    status: "DRAFT",
    createdByUserId: input.createdByUserId
  });
  return await courseRepo().save(course);
}

export async function listCourses(orgId: number): Promise<Course[]> {
  return await courseRepo().find({
    where: { organization: { id: orgId } },
    order: { updatedAt: "DESC" }
  });
}

/** Full tree (modules + items, ordered) for an org-scoped course, or null. */
export async function getCourseTree(courseId: number, orgId: number): Promise<Course | null> {
  const course = await courseRepo().findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course || course.organizationId !== orgId) return null;
  const modules = await moduleRepo().find({ where: { course: { id: courseId } }, order: { order: "ASC" } });
  for (const m of modules) {
    m.items = await itemRepo().find({ where: { module: { id: m.id } }, order: { order: "ASC" } });
  }
  course.modules = modules;
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
