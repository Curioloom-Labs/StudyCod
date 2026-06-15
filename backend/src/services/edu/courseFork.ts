import { createHash } from "crypto";
import { AppDataSource } from "../../data-source";
import { Course } from "../../entities/Course";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem, type CourseItemKind } from "../../entities/CourseItem";
import { Class } from "../../entities/Class";
import { EduLesson } from "../../entities/EduLesson";
import { EduTask } from "../../entities/EduTask";
import { CourseAssignment, type OriginEntry } from "../../entities/CourseAssignment";
import { renderPageContent } from "./contentRender";

/**
 * Fork-on-assign planning (P2.2). Pure logic that turns a course template tree
 * into a plan of EduLessons + EduTasks to materialize in a class. Kept free of
 * DB/ORM so it is unit-testable; the actual writes apply this plan in a tx.
 *
 * Each planned entity carries its source course-item id + a content hash, so the
 * opt-in pull (P2.3) can detect template changes and local teacher edits.
 */
export interface PlannedTask {
  sourceItemId: number;
  sourceHash: string;
  title: string;
  description: string;
  template: string;
  taskMode: "CODE" | "WEB" | "MANUAL";
  webTemplateFiles?: unknown;
  webValidationRules?: unknown;
  webValidationProfile?: unknown;
}

export interface PlannedLesson {
  sourceModuleId: number;
  title: string;
  theory: string | null;
  quizJson: string | null;
  tasks: PlannedTask[];
}

export interface ForkPlan {
  lessons: PlannedLesson[];
  /** Course-item kinds the fork could not map (e.g. MANUAL until P2 manual tasks land). */
  skipped: Array<{ sourceItemId: number; kind: CourseItemKind }>;
}

/** Stable hash of an item's authored payload, order-independent for object keys. */
export function hashCourseItem(item: Pick<CourseItem, "kind" | "title" | "content">): string {
  const canonical = stableStringify({ kind: item.kind, title: item.title, content: item.content ?? null });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * Hash of an EduTask's authored fields. Computed over the materialized form (not
 * the course item), so comparing fork-time vs current detects local teacher edits.
 */
export function hashEduTask(task: {
  title?: string | null;
  description?: string | null;
  template?: string | null;
  taskMode?: string | null;
  webTemplateFiles?: unknown;
  webValidationRules?: unknown;
  webValidationProfile?: unknown;
}): string {
  const canonical = stableStringify({
    title: task.title ?? "",
    description: task.description ?? "",
    template: task.template ?? "",
    taskMode: task.taskMode ?? "CODE",
    webTemplateFiles: task.webTemplateFiles ?? null,
    webValidationRules: task.webValidationRules ?? null,
    webValidationProfile: task.webValidationProfile ?? null
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** Map a single task-bearing course item (CODE_TASK/WEB_TASK/MANUAL) to EduTask fields. */
export function planTaskFromItem(item: Pick<CourseItem, "id" | "kind" | "title" | "content">): PlannedTask {
  const content = (item.content ?? {}) as Record<string, unknown>;
  const taskMode: "CODE" | "WEB" | "MANUAL" =
    item.kind === "WEB_TASK" ? "WEB" : item.kind === "MANUAL" ? "MANUAL" : "CODE";
  return {
    sourceItemId: item.id,
    sourceHash: hashCourseItem(item),
    title: item.title,
    description: asString(content.description),
    template: asString(content.template),
    taskMode,
    webTemplateFiles: content.webTemplateFiles,
    webValidationRules: content.webValidationRules,
    webValidationProfile: content.webValidationProfile
  };
}

/**
 * Build a fork plan from an already-loaded course tree (modules ordered, each
 * with ordered items). One lesson per module; THEORY/PAGE items fold into the
 * lesson's theory, QUIZ into quizJson, CODE_TASK/WEB_TASK become tasks.
 */
export function planForkFromCourse(course: Pick<Course, "modules">): ForkPlan {
  const lessons: PlannedLesson[] = [];
  const skipped: ForkPlan["skipped"] = [];

  for (const mod of course.modules ?? []) {
    const lesson: PlannedLesson = {
      sourceModuleId: mod.id,
      title: mod.title,
      theory: null,
      quizJson: null,
      tasks: []
    };
    const theoryChunks: string[] = [];

    for (const item of mod.items ?? []) {
      const content = (item.content ?? {}) as Record<string, unknown>;
      switch (item.kind) {
        case "THEORY":
        case "PAGE": {
          const rendered = renderPageContent(item.title, content as any);
          if (rendered) theoryChunks.push(rendered);
          break;
        }
        case "QUIZ": {
          // Quiz payload travels as-is; the quiz engine reads quiz_json.
          lesson.quizJson = JSON.stringify(content.quiz ?? content);
          break;
        }
        case "CODE_TASK":
        case "WEB_TASK":
        case "MANUAL": {
          lesson.tasks.push(planTaskFromItem(item));
          break;
        }
        default:
          // Any future kind not yet mapped: recorded as skipped.
          skipped.push({ sourceItemId: item.id, kind: item.kind });
      }
    }

    lesson.theory = theoryChunks.length > 0 ? theoryChunks.join("\n") : null;
    lessons.push(lesson);
  }

  return { lessons, skipped };
}

export interface AssignResult {
  assignmentId: number;
  lessonsCreated: number;
  tasksCreated: number;
  skipped: number;
}

/**
 * Fork a PUBLISHED course onto a class: materialize the plan as EduLessons +
 * EduTasks and record a CourseAssignment with the origin map. Atomic. The course
 * must belong to `orgId` (the caller's authorized org) and be PUBLISHED.
 */
export async function assignCourseToClass(input: {
  classId: number;
  courseId: number;
  orgId: number;
}): Promise<AssignResult> {
  // Load the course tree (ordered) outside the tx; it is template data.
  const course = await AppDataSource.getRepository(Course).findOne({
    where: { id: input.courseId },
    relations: ["organization"]
  });
  if (!course || course.organizationId !== input.orgId) throw new Error("COURSE_NOT_FOUND");
  if (course.status !== "PUBLISHED") throw new Error("COURSE_NOT_PUBLISHED");

  const modules = await AppDataSource.getRepository(CourseModule).find({
    where: { course: { id: input.courseId } },
    order: { order: "ASC" }
  });
  for (const m of modules) {
    m.items = await AppDataSource.getRepository(CourseItem).find({
      where: { module: { id: m.id } },
      order: { order: "ASC" }
    });
  }
  course.modules = modules;

  const plan = planForkFromCourse(course);

  return await AppDataSource.transaction(async (manager) => {
    const cls = await manager.getRepository(Class).findOne({ where: { id: input.classId } });
    if (!cls || cls.organizationId !== input.orgId) throw new Error("CLASS_NOT_IN_ORG");

    const originMap: Record<string, OriginEntry> = {};
    const moduleMap: Record<string, number> = {};
    let lessonsCreated = 0;
    let tasksCreated = 0;

    for (const plannedLesson of plan.lessons) {
      const lesson = manager.getRepository(EduLesson).create({
        class: cls,
        type: "LESSON",
        title: plannedLesson.title,
        theory: plannedLesson.theory,
        hasTheory: Boolean(plannedLesson.theory),
        quizJson: plannedLesson.quizJson
      });
      await manager.getRepository(EduLesson).save(lesson);
      lessonsCreated++;
      moduleMap[String(plannedLesson.sourceModuleId)] = lesson.id;

      for (const plannedTask of plannedLesson.tasks) {
        const task = manager.getRepository(EduTask).create({
          lesson,
          title: plannedTask.title,
          description: plannedTask.description,
          template: plannedTask.template,
          taskMode: plannedTask.taskMode as any,
          webTemplateFiles: plannedTask.webTemplateFiles as any,
          webValidationRules: plannedTask.webValidationRules as any,
          webValidationProfile: plannedTask.webValidationProfile as any,
          maxAttempts: 1,
          isClosed: false
        });
        await manager.getRepository(EduTask).save(task);
        tasksCreated++;
        originMap[String(plannedTask.sourceItemId)] = {
          sourceHash: plannedTask.sourceHash,
          localHash: hashEduTask(task),
          eduTaskId: task.id
        };
      }
    }

    const assignment = manager.getRepository(CourseAssignment).create({
      class: cls,
      course,
      originMap,
      moduleMap,
      forkedAt: new Date()
    });
    await manager.getRepository(CourseAssignment).save(assignment);

    return { assignmentId: assignment.id, lessonsCreated, tasksCreated, skipped: plan.skipped.length };
  });
}
