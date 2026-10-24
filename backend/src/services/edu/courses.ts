import { AppDataSource } from "../../data-source";
import { Course, type CourseStatus } from "../../entities/Course";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem, type CourseItemKind } from "../../entities/CourseItem";
import { CourseVariant, type CourseRuntime } from "../../entities/CourseVariant";
import { IsNull } from "typeorm";
import { olympiadPracticeContractIssues } from "../learning/learningContract";
import { parseCourseQuiz } from "../learning/courseQuiz";
import { markCurriculumAuthoringOverrides } from "../curriculumAuthoringOverrides";

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

type PublishableItem = {
  id: number;
  kind: CourseItemKind;
  content?: Record<string, unknown> | null;
  isActive?: boolean;
};
type PublishableModule = { id: number; items: PublishableItem[] };

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Checks that a database-authored global course contains learner-facing material before publication. */
export function authoredCoursePublishIssues(modules: PublishableModule[]): string[] {
  const issues: string[] = [];
  if (modules.length === 0) return ["COURSE_HAS_NO_MODULES"];

  for (const module of modules) {
    const items = (module.items ?? []).filter((item) => item.isActive !== false);
    if (items.length === 0) {
      issues.push(`MODULE_${module.id}_IS_EMPTY`);
      continue;
    }
    for (const item of items) {
      const content = item.content ?? {};
      const exercise = typeof content.exercise === "object" && content.exercise !== null
        ? content.exercise as Record<string, unknown>
        : {};
      const learningContract = typeof exercise.learningContract === "object" && exercise.learningContract !== null && !Array.isArray(exercise.learningContract)
        ? exercise.learningContract as Record<string, unknown>
        : null;
      if (item.kind === "CODE_TASK" && learningContract?.kind === "OLYMPIAD_ALGORITHMIC_PRACTICE") {
        const expectedRuntime = typeof exercise.runtime === "string" ? exercise.runtime : undefined;
        if (olympiadPracticeContractIssues(learningContract, expectedRuntime).length > 0) {
          issues.push(`ITEM_${item.id}_OLYMPIAD_PRACTICE_CONTRACT_INVALID`);
        }
      }
      const hasContent = item.kind === "THEORY" || item.kind === "PAGE"
        ? hasText(content.markdown) || hasText(content.html) || hasText(content.description)
        : item.kind === "CODE_TASK"
          ? hasText(exercise.prompt) || (typeof exercise.learningContract === "object" && exercise.learningContract !== null)
          : item.kind === "QUIZ"
            ? parseCourseQuiz(content) !== null
            : hasText(content.description) || hasText(content.markdown) || hasText(content.template);
      if (!hasContent) issues.push(`ITEM_${item.id}_${item.kind === "QUIZ" ? "QUIZ_INVALID" : "HAS_NO_CONTENT"}`);
    }
  }
  return issues;
}

export function attachPrecedingTheoryReference(
  content: Record<string, unknown>,
  itemOrder: number,
  earlierItems: Array<Pick<CourseItem, "id" | "kind" | "order" | "contentKey">>,
  replaceExisting = false,
): Record<string, unknown> {
  if (content.generatedAfterTheory !== true || (!replaceExisting && Number(content.theoryItemId) > 0)) return content;
  const precedingTheory = earlierItems
    .filter((candidate) => (candidate.kind === "THEORY" || candidate.kind === "PAGE") && candidate.order < itemOrder)
    .sort((a, b) => b.order - a.order || b.id - a.id)[0];
  if (!precedingTheory) {
    if (!replaceExisting || !Number(content.theoryItemId)) return content;
    const unlinked = { ...content };
    delete unlinked.theoryItemId;
    delete unlinked.theoryItemKey;
    return unlinked;
  }
  return {
    ...content,
    theoryItemId: precedingTheory.id,
    ...(precedingTheory.contentKey ? { theoryItemKey: precedingTheory.contentKey } : {}),
  };
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
    organization: { id: input.orgId },
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
    course: { id: saved.id },
    runtime,
    title: runtime === "CPP" ? "C++" : runtime === "JAVA" ? "Java" : "Python",
    status: "DRAFT"
  }));
  return saved;
}

/** Create an admin-authored global catalog course using the existing course tree. */
export async function createGlobalCourse(input: {
  title: string;
  description?: string | null;
  runtime?: unknown;
  createdByUserId: number;
}): Promise<Course> {
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("TITLE_REQUIRED");
  const runtime = normalizeCourseRuntime(input.runtime);
  const course = courseRepo().create({
    organization: null,
    title,
    description: input.description ?? null,
    catalogKey: null,
    level: "FOUNDATION",
    isBase: false,
    status: "DRAFT",
    createdByUserId: input.createdByUserId,
  });
  const saved = await courseRepo().save(course);
  await variantRepo().save(variantRepo().create({
    course: { id: saved.id },
    runtime,
    title: runtime === "CPP" ? "C++" : runtime === "JAVA" ? "Java" : "Python",
    status: "DRAFT",
  }));
  return (await courseRepo().findOne({ where: { id: saved.id }, relations: ["variants"] })) ?? saved;
}

export async function listGlobalCourses(): Promise<Course[]> {
  return courseRepo().find({
    where: { organization: IsNull() },
    relations: ["variants"],
    order: { updatedAt: "DESC" },
  });
}

export async function listCourses(orgId: number): Promise<Course[]> {
  return await courseRepo().find({
    where: { organization: { id: orgId } },
    relations: ["variants"],
    order: { updatedAt: "DESC" }
  });
}

/** Full tree (modules + items, ordered) for an org-scoped course, or null. */
export async function getCourseTree(courseId: number, orgId: number | null): Promise<Course | null> {
  const course = await courseRepo().findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course || (course.organizationId ?? null) !== orgId) return null;
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
  const course = await courseRepo().findOne({ where: { id: courseId } });
  if (!course) throw new Error("COURSE_NOT_FOUND");
  const mod = moduleRepo().create({
    course: { id: courseId },
    title: t,
    order: Math.max(0, Math.floor(order) || 0),
    ...(course.catalogKey ? { authoringOverrides: markCurriculumAuthoringOverrides(null, ["title", "order"], true) } : {}),
  });
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
  let content = input.content ? { ...input.content } : null;
  const module = await moduleRepo().findOne({ where: { id: input.moduleId }, relations: ["course"] });
  if (input.kind === "CODE_TASK" && content) {
    if (module?.course && module.course.organizationId == null && !module.course.catalogKey && content.generatedAfterTheory === true) {
      const earlierItems = await itemRepo().find({ where: { module: { id: input.moduleId } }, order: { order: "ASC" } });
      content = attachPrecedingTheoryReference(content, input.order, earlierItems);
    }
  }
  const item = itemRepo().create({
    module: { id: input.moduleId },
    kind: input.kind,
    title: t,
    order: Math.max(0, Math.floor(input.order) || 0),
    content,
    ...(module?.course?.catalogKey ? { authoringOverrides: markCurriculumAuthoringOverrides(null, ["kind", "title", "order", "content"], true) } : {}),
  });
  return await itemRepo().save(item);
}

/** Publish/unpublish; only PUBLISHED courses are assignable to classes (P2.2). */
export async function setCourseStatus(courseId: number, orgId: number | null, status: CourseStatus): Promise<Course | null> {
  const course = await courseRepo().findOne({ where: { id: courseId }, relations: ["organization"] });
  if (!course || (course.organizationId ?? null) !== orgId) return null;
  course.status = normalizeCourseStatus(status);
  if (course.catalogKey) {
    course.authoringOverrides = markCurriculumAuthoringOverrides(course.authoringOverrides, ["status"]);
  }
  if (course.status === "PUBLISHED" && course.organizationId == null) {
    const modules = await moduleRepo().find({ where: { course: { id: courseId } }, relations: ["items"], order: { order: "ASC" } });
    const issues = authoredCoursePublishIssues(modules);
    if (issues.length) throw Object.assign(new Error("COURSE_CONTENT_INCOMPLETE"), { issues });
  }
  await courseRepo().save(course);
  const variants = await variantRepo().find({ where: { course: { id: courseId } } });
  for (const variant of variants) variant.status = course.status;
  if (variants.length) await variantRepo().save(variants);
  return await courseRepo().findOne({ where: { id: courseId }, relations: ["variants"] });
}
