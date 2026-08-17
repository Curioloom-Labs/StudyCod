import { AppDataSource } from "../data-source";
import { Course } from "../entities/Course";
import { CourseDependency } from "../entities/CourseDependency";
import { CourseItem } from "../entities/CourseItem";
import { CourseItemProgress, type CourseProjectProgressData } from "../entities/CourseItemProgress";
import { CourseVariant } from "../entities/CourseVariant";
import { EnrollmentStatus, UserCourseEnrollment } from "../entities/UserCourseEnrollment";
import { Task } from "../entities/Task";
import { User } from "../entities/User";
import { IsNull } from "typeorm";
import { judgeWithSemaphore } from "./judgeWorker";
import type { JudgeFile, JudgeRequest } from "./judgeWorker/types";

const courseRepo = () => AppDataSource.getRepository(Course);
const variantRepo = () => AppDataSource.getRepository(CourseVariant);
const dependencyRepo = () => AppDataSource.getRepository(CourseDependency);
const enrollmentRepo = () => AppDataSource.getRepository(UserCourseEnrollment);
const itemRepo = () => AppDataSource.getRepository(CourseItem);
const progressRepo = () => AppDataSource.getRepository(CourseItemProgress);
const taskRepo = () => AppDataSource.getRepository(Task);

function percent(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

function runtimeLabel(runtime: string): string {
  return runtime === "CPP" ? "C++" : runtime === "JAVA" ? "Java" : "Python";
}

function isMiniProject(item: CourseItem): boolean {
  const content = (item.content || {}) as any;
  return item.kind === "MANUAL" && content.project === true && content.projectSpec != null;
}

function projectSpecFor(item: CourseItem): any {
  return ((item.content || {}) as any).projectSpec || null;
}

function projectMilestoneIds(item: CourseItem): string[] {
  const milestones = projectSpecFor(item)?.milestones;
  if (!Array.isArray(milestones)) return [];
  return milestones.map((milestone: any) => String(milestone?.id || "").trim()).filter(Boolean);
}

function projectProgressOrDefault(progress?: CourseItemProgress | null): CourseProjectProgressData {
  const data = progress?.projectData;
  return data && typeof data === "object" ? {
    milestoneIds: Array.isArray(data.milestoneIds) ? data.milestoneIds.map(String) : [],
    draft: typeof data.draft === "string" ? data.draft : "",
    readme: typeof data.readme === "string" ? data.readme : "",
    status: data.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT",
    submittedAt: data.submittedAt || null,
  } : { milestoneIds: [], draft: "", readme: "", status: "DRAFT", submittedAt: null };
}

function enrollmentPriority(status: EnrollmentStatus): number {
  if (status === "IN_PROGRESS") return 0;
  if (status === "COMPLETED") return 1;
  if (status === "AVAILABLE") return 2;
  return 3;
}

function requiredItem(item: CourseItem): boolean {
  return (item.content as any)?.required !== false;
}

function nextActionForItems(items: CourseItem[], progressByItem: Map<number, CourseItemProgress>) {
  const next = items.find((item) => requiredItem(item) && progressByItem.get(item.id)?.status !== "COMPLETED");
  if (!next) return null;
  const progress = progressByItem.get(next.id);
  return {
    itemId: next.id,
    title: next.title,
    kind: next.kind,
    status: progress?.status ?? "NOT_STARTED",
  };
}

async function assertSequentialAccess(enrollmentId: number, courseId: number, itemId: number): Promise<void> {
  const items = await itemRepo().find({
    where: { module: { course: { id: courseId } }, isActive: true },
    relations: ["module"],
  });
  items.sort((left, right) => left.module.order - right.module.order || left.order - right.order || left.id - right.id);
  const targetIndex = items.findIndex((item) => item.id === itemId);
  if (targetIndex < 0) return;
  const progress = await progressRepo().find({ where: { enrollment: { id: enrollmentId } } });
  const progressByItem = new Map(progress.map((entry) => [entry.itemId, entry]));
  const previous = items.slice(0, targetIndex).find((item) => requiredItem(item) && progressByItem.get(item.id)?.status !== "COMPLETED");
  if (previous) {
    throw Object.assign(new Error("COURSE_SEQUENCE_LOCKED"), { statusCode: 409, previousItemId: previous.id });
  }
}

function normalizedTitle(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");
}

function jsonContent(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Keep the catalog roadmap in sync with tasks created before the course-aware
 * Practice route existed. The migration covers existing rows once, but users
 * can create legacy tasks after that migration, so the bridge must also run on
 * the read path. It only moves progress forward and never overwrites a course
 * task that is already completed.
 */
async function syncLegacyPersonalProgress(userId: number, course: Course, enrollment: UserCourseEnrollment): Promise<void> {
  const runtime = String(enrollment.variant?.runtime ?? "").toUpperCase();
  if (!course.isBase || !["PYTHON", "JAVA", "CPP"].includes(runtime)) return;

  const items = await itemRepo().find({
    where: { module: { course: { id: course.id } }, isActive: true },
    order: { id: "ASC" },
  });
  const theoryByTitle = new Map(items.filter((item) => item.kind === "THEORY").map((item) => [normalizedTitle(item.title), item]));
  const theoryByKey = new Map(items
    .filter((item) => item.kind === "THEORY")
    .map((item) => {
      const content = jsonContent(item.content);
      return [String(content.sourceKey ?? content.sourcePath ?? item.contentKey ?? ""), item] as const;
    })
    .filter(([key]) => key));
  const theoryByIndex = new Map<number, CourseItem>();
  const practicesByTheory = new Map<number, CourseItem[]>();
  for (const item of items) {
    const content = jsonContent(item.content);
    if (item.kind === "THEORY") {
      const sourceKey = String(content.sourceKey ?? content.sourcePath ?? "");
      const match = sourceKey.match(/(?:^|\.)(?:topic|lesson)[.-]?(\d+)\./i);
      if (match) theoryByIndex.set(Number(match[1]), item);
    }
    if (item.kind === "CODE_TASK") {
      const theoryId = Number(content.theoryItemId ?? 0);
      const theory = theoryId > 0
        ? items.find((candidate) => candidate.kind === "THEORY" && candidate.id === theoryId)
        : theoryByKey.get(String(content.theoryItemKey ?? ""));
      if (theory) {
        const group = practicesByTheory.get(theory.id) ?? [];
        group.push(item);
        practicesByTheory.set(theory.id, group);
      }
    }
  }
  for (const group of practicesByTheory.values()) {
    group.sort((left, right) => Number(jsonContent(left.content).exercise?.sequence ?? 0) - Number(jsonContent(right.content).exercise?.sequence ?? 0) || left.id - right.id);
  }
  if (!theoryByTitle.size && !theoryByIndex.size) return;

  const legacyTasks = await taskRepo()
    .createQueryBuilder("task")
    .innerJoinAndSelect("task.topic", "topic")
    .leftJoinAndSelect("task.grades", "grades")
    .where("task.user_id = :userId", { userId })
    .andWhere("task.lang = :runtime", { runtime })
    .andWhere("task.type IN (:...legacyTypes)", { legacyTypes: ["INTRO", "TOPIC"] })
    .andWhere("(task.subtitle IS NULL OR task.subtitle NOT LIKE :catalogPrefix)", { catalogPrefix: "CATALOG_ITEM:%" })
    .orderBy("task.created_at", "ASC")
    .addOrderBy("task.id", "ASC")
    .getMany();
  const rows = legacyTasks
    .map((task) => ({
      id: task.id,
      topicIndex: task.topicIndex,
      numInTopic: task.numInTopic,
      completed: task.completed,
      createdAt: task.createdAt,
      title: task.title,
      topicTitle: task.topic?.title ?? null,
      bestScore: Math.max(-1, ...(task.grades ?? []).map((grade) => Number(grade.total ?? -1))),
    }));
  if (!rows.length) return;

  const progress = await progressRepo().find({ where: { enrollment: { id: enrollment.id } } });
  const progressByItem = new Map(progress.map((entry) => [entry.itemId, entry]));
  let changed = false;
  for (const row of rows) {
    const topicIndex = Number(row.topicIndex);
    const theory = theoryByTitle.get(normalizedTitle(row.topicTitle)) || theoryByIndex.get(topicIndex);
    if (!theory) continue;
    const bestScore = Number(row.bestScore);
    const passed = Number(row.completed) === 1 || (Number.isFinite(bestScore) && bestScore >= 60);
    const score = Number.isFinite(bestScore) && bestScore >= 0 ? Math.max(0, Math.min(100, bestScore)) : passed ? 100 : null;
    const practiceGroup = practicesByTheory.get(theory.id) ?? [];
    const sequence = Math.max(1, Math.floor(Number(row.numInTopic) || 1));
    const practice = practiceGroup[sequence - 1] || practiceGroup[0];
    // Older generated practice items may not have a usable theoryItemId, and
    // a legacy task can exist before the catalog practice row is generated.
    // In both cases the topic is already touched, so retain that signal on
    // the theory node instead of leaving the roadmap at 0%.
    const targets = passed
      ? [theory, practice].filter(Boolean) as CourseItem[]
      : practice ? [practice] : [theory];

    for (const item of targets) {
      const existing = progressByItem.get(item.id) || progressRepo().create({ enrollment: { id: enrollment.id } as any, item: { id: item.id } as any });
      if (passed) {
        if (existing.status === "COMPLETED" && Number(existing.score ?? -1) >= Number(score ?? -1)) continue;
        existing.status = "COMPLETED";
        existing.score = score;
        existing.completedAt = existing.completedAt || new Date(row.createdAt);
      } else {
        if (existing.status && existing.status !== "NOT_STARTED") continue;
        existing.status = "IN_PROGRESS";
      }
      await progressRepo().save(existing);
      progressByItem.set(item.id, existing);
      changed = true;
    }
  }
  if (changed) {
    if (enrollment.status === "AVAILABLE") enrollment.status = "IN_PROGRESS";
    await recalculateEnrollmentProgress(enrollment);
  }
}

/**
 * A user can have legacy duplicate enrollments for one course (for example,
 * after changing runtime variants). Every course-scoped operation must use
 * the active enrollment first, otherwise activation can succeed on one row
 * while the UI reads another AVAILABLE row.
 */
async function findBestCourseEnrollment(userId: number, courseId: number, relations: string[] = []) {
  const enrollments = await enrollmentRepo().find({
    where: { user: { id: userId }, course: { id: courseId } },
    relations,
  });
  return enrollments.sort((left, right) => {
    const priority = enrollmentPriority(left.status) - enrollmentPriority(right.status);
    if (priority !== 0) return priority;
    const updated = (right.updatedAt?.getTime?.() || 0) - (left.updatedAt?.getTime?.() || 0);
    return updated !== 0 ? updated : right.id - left.id;
  })[0] || null;
}

async function getEnrolledItemContext(userId: number, itemId: number) {
  const item = await itemRepo().findOne({ where: { id: itemId, isActive: true }, relations: ["module", "module.course"] });
  if (!item?.module?.course || !isMiniProject(item)) throw Object.assign(new Error("COURSE_PROJECT_NOT_FOUND"), { statusCode: 404 });
  const enrollment = await findBestCourseEnrollment(userId, item.module.course.id);
  if (!enrollment) throw Object.assign(new Error("COURSE_NOT_ENROLLED"), { statusCode: 403 });
  if (enrollment.status === "AVAILABLE" || enrollment.status === "LOCKED") {
    throw Object.assign(new Error("COURSE_NOT_ACTIVE"), { statusCode: 409 });
  }
  await assertSequentialAccess(enrollment.id, item.module.course.id, item.id);
  const dependencyState = await getPrerequisiteState(userId, enrollment.courseId);
  if (!dependencyState.satisfied && !item.module.course.isBase) {
    throw Object.assign(new Error("PREREQUISITES_INCOMPLETE"), { statusCode: 423, prerequisites: dependencyState.prerequisites });
  }
  const progress = await progressRepo().findOne({ where: { enrollment: { id: enrollment.id }, item: { id: item.id } } });
  return { item, enrollment, progress };
}

async function recalculateEnrollmentProgress(enrollment: UserCourseEnrollment): Promise<UserCourseEnrollment> {
  const items = await AppDataSource.getRepository(CourseItem).createQueryBuilder("item")
    .innerJoin("item.module", "module")
    .where("module.course_id = :courseId", { courseId: enrollment.courseId })
    .andWhere("item.is_active = 1")
    .getMany();
  const requiredItems = items.filter((candidate) => (candidate.content as any)?.required !== false);
  const completedIds = new Set((await progressRepo().find({ where: { enrollment: { id: enrollment.id }, status: "COMPLETED" } })).map((entry) => entry.itemId));
  enrollment.completionPercent = requiredItems.length === 0 ? 0 : percent((requiredItems.filter((candidate) => completedIds.has(candidate.id)).length / requiredItems.length) * 100);
  if (enrollment.completionPercent >= 100 && enrollment.finalAssessmentPassed) {
    enrollment.status = "COMPLETED";
    enrollment.completedAt = enrollment.completedAt || new Date();
  } else if (enrollment.status === "AVAILABLE") {
    enrollment.status = "IN_PROGRESS";
  }
  return enrollmentRepo().save(enrollment);
}

async function ensureBaseEnrollments(userId: number, baseVariants: CourseVariant[], current: UserCourseEnrollment[]): Promise<UserCourseEnrollment[]> {
  const byVariant = new Map(current.map((entry) => [entry.variantId, entry]));
  for (const variant of baseVariants) {
    if (byVariant.has(variant.id)) continue;
    const created = enrollmentRepo().create({
      user: { id: userId } as any,
      course: { id: variant.courseId } as any,
      variant: { id: variant.id } as any,
      status: "AVAILABLE",
      completionPercent: 0,
      masteryScore: 0,
      finalAssessmentPassed: false,
    });
    byVariant.set(variant.id, await enrollmentRepo().save(created));
  }
  return Array.from(byVariant.values());
}

async function getPrerequisiteState(userId: number, courseId: number): Promise<{
  satisfied: boolean;
  prerequisites: Array<{ courseId: number; title: string; requiredCompletionPercent: number; completionPercent: number; status: EnrollmentStatus | null }>;
}> {
  const dependencies = await dependencyRepo().find({
    where: { course: { id: courseId } },
    relations: ["prerequisiteCourse"],
    order: { id: "ASC" },
  });
  if (dependencies.length === 0) return { satisfied: true, prerequisites: [] };

  const prerequisiteIds = dependencies.map((dependency) => dependency.prerequisiteCourseId);
  const enrollments = await enrollmentRepo().find({ where: { user: { id: userId } } });
  const byCourse = new Map(enrollments.map((enrollment) => [enrollment.courseId, enrollment]));
  const prerequisites = dependencies.map((dependency) => {
    const enrollment = byCourse.get(dependency.prerequisiteCourseId);
    return {
      courseId: dependency.prerequisiteCourseId,
      title: dependency.prerequisiteCourse.title,
      requiredCompletionPercent: percent(dependency.requiredCompletionPercent),
      completionPercent: percent(enrollment?.completionPercent),
      status: enrollment?.status ?? null,
    };
  });
  // Keep the local variable explicit: all dependencies are AND dependencies.
  void prerequisiteIds;
  return {
    satisfied: prerequisites.every((item) => item.completionPercent >= item.requiredCompletionPercent && item.status === "COMPLETED"),
    prerequisites,
  };
}

export async function getLearningCatalog(userId: number) {
  const courses = await courseRepo().find({
    where: { organization: IsNull() },
    relations: ["variants"],
    order: { level: "ASC", id: "ASC" },
  });
  const enrollments = await enrollmentRepo().find({ where: { user: { id: userId } }, relations: ["course", "variant"] });
  const baseVariants = courses.filter((course) => course.isBase).flatMap((course) => course.variants || []);
  const allEnrollments = await ensureBaseEnrollments(userId, baseVariants, enrollments);
  const byVariant = new Map(allEnrollments.map((enrollment) => [enrollment.variantId, enrollment]));

  return Promise.all(courses.map(async (course) => {
    const dependencyState = await getPrerequisiteState(userId, course.id);
    return {
      id: course.id,
      key: course.catalogKey,
      title: course.title,
      description: course.description,
      level: course.level,
      isBase: course.isBase,
      status: course.status,
      prerequisites: dependencyState.prerequisites,
      variants: (course.variants || []).map((variant) => {
        const enrollment = byVariant.get(variant.id);
        const available = dependencyState.satisfied && variant.status === "PUBLISHED";
        return {
          id: variant.id,
          runtime: variant.runtime,
          runtimeLabel: runtimeLabel(variant.runtime),
          title: variant.title,
          status: variant.status,
          enrollment: enrollment ? {
            id: enrollment.id,
            status: available && enrollment.status === "LOCKED" ? "AVAILABLE" : enrollment.status,
            completionPercent: percent(enrollment.completionPercent),
            masteryScore: Number(enrollment.masteryScore ?? 0),
            finalAssessmentPassed: Boolean(enrollment.finalAssessmentPassed),
            completedAt: enrollment.completedAt ?? null,
          } : null,
          gate: available ? null : {
            code: dependencyState.satisfied ? "VARIANT_NOT_PUBLISHED" : "PREREQUISITES_INCOMPLETE",
            prerequisites: dependencyState.prerequisites,
          },
        };
      }),
    };
  }));
}

/** Lightweight Personal hub payload. EDU never calls this route. */
export async function getLearningMe(userId: number) {
  const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
  const catalog = await getLearningCatalog(userId);
  const enrollments = catalog.flatMap((course) => course.variants.flatMap((variant) => variant.enrollment
    ? [{
        enrollmentId: variant.enrollment.id,
        courseId: course.id,
        courseKey: course.key,
        title: course.title,
        description: course.description,
        runtime: variant.runtime,
        runtimeLabel: variant.runtimeLabel,
        level: course.level,
        status: variant.enrollment.status,
        completionPercent: variant.enrollment.completionPercent,
        finalAssessmentPassed: variant.enrollment.finalAssessmentPassed,
        completedAt: variant.enrollment.completedAt,
        gate: variant.gate,
      }]
    : []));
  const currentEnrollmentId = user?.currentCourseEnrollmentId
    ?? enrollments.find((entry) => entry.status === "IN_PROGRESS")?.enrollmentId
    ?? null;
  const current = enrollments.find((entry) => entry.enrollmentId === currentEnrollmentId) ?? null;
  return { currentEnrollmentId, current, enrollments };
}

export async function setCurrentCourseEnrollment(userId: number, enrollmentId: number) {
  return AppDataSource.transaction("SERIALIZABLE", async (manager) => {
    const enrollment = await manager.getRepository(UserCourseEnrollment).findOne({
      where: { id: enrollmentId, user: { id: userId } },
      relations: ["course", "variant"],
    });
    if (!enrollment) throw Object.assign(new Error("ENROLLMENT_NOT_FOUND"), { statusCode: 404 });
    if (enrollment.course.organizationId != null) throw Object.assign(new Error("PERSONAL_COURSE_REQUIRED"), { statusCode: 403 });
    if (enrollment.status === "LOCKED") throw Object.assign(new Error("COURSE_LOCKED"), { statusCode: 423 });
    if (enrollment.status === "AVAILABLE") {
      enrollment.status = "IN_PROGRESS";
      await manager.getRepository(UserCourseEnrollment).save(enrollment);
    }
    await manager.getRepository(User).update({ id: userId }, { currentCourseEnrollmentId: enrollment.id });
    return enrollment;
  });
}

export async function enrollInCourseVariant(userId: number, variantId: number, expectedCourseId?: number): Promise<UserCourseEnrollment> {
  // Course activation is a user-level state, not a variant-level toggle. The
  // serializable transaction prevents two concurrent clicks from leaving two
  // IN_PROGRESS enrollments behind.
  return AppDataSource.transaction("SERIALIZABLE", async (manager) => {
    const variant = await manager.getRepository(CourseVariant).findOne({ where: { id: variantId }, relations: ["course"] });
    if (!variant || !variant.course) throw Object.assign(new Error("COURSE_VARIANT_NOT_FOUND"), { statusCode: 404 });
    if (expectedCourseId != null && variant.courseId !== expectedCourseId) throw Object.assign(new Error("VARIANT_COURSE_MISMATCH"), { statusCode: 400 });
    if (variant.status !== "PUBLISHED") throw Object.assign(new Error("COURSE_NOT_PUBLISHED"), { statusCode: 409 });

    const dependencyState = await getPrerequisiteState(userId, variant.courseId);
    if (!dependencyState.satisfied) {
      throw Object.assign(new Error("PREREQUISITES_INCOMPLETE"), {
        statusCode: 423,
        prerequisites: dependencyState.prerequisites,
      });
    }

    const enrollments = manager.getRepository(UserCourseEnrollment);
    // Lock the user's enrollment rows before deciding which one is active.
    // This also serializes concurrent activation requests on MySQL, where a
    // plain read followed by an UPDATE could otherwise race.
    await enrollments.createQueryBuilder("enrollment")
      .where("enrollment.user_id = :userId", { userId })
      .setLock("pessimistic_write")
      .getMany();
    const existing = await enrollments.findOne({ where: { user: { id: userId }, variant: { id: variantId } } });
    if (existing) {
      if (existing.status === "LOCKED" || existing.status === "AVAILABLE") {
        existing.status = "IN_PROGRESS";
        // Existing base enrollments are provisioned as AVAILABLE. Persist the
        // activation before the follow-up query, otherwise the UI immediately
        // reloads the stale AVAILABLE row and reports a false activation error.
        await enrollments.save(existing);
      }
    } else {
      const created = enrollments.create({
        user: { id: userId } as any,
        course: { id: variant.courseId } as any,
        variant: { id: variantId } as any,
        status: "IN_PROGRESS",
        completionPercent: 0,
        masteryScore: 0,
        finalAssessmentPassed: false,
      });
      await enrollments.save(created);
    }

    const activated = await enrollments.findOne({ where: { user: { id: userId }, variant: { id: variantId } } });
    if (!activated) throw new Error("COURSE_ENROLLMENT_CREATE_FAILED");
    await manager.getRepository(User).update({ id: userId }, { currentCourseEnrollmentId: activated.id });
    return activated;
  });
}

export async function getCourseForUser(userId: number, courseId: number) {
  const course = await courseRepo().findOne({
    where: { id: courseId, organization: IsNull() },
    relations: ["modules", "modules.items", "variants"],
  });
  if (!course) throw Object.assign(new Error("COURSE_NOT_FOUND"), { statusCode: 404 });

  const enrollment = await findBestCourseEnrollment(userId, course.id, ["variant"]);
  if (!enrollment) throw Object.assign(new Error("COURSE_NOT_ENROLLED"), { statusCode: 403 });

  const dependencyState = await getPrerequisiteState(userId, course.id);
  if (!dependencyState.satisfied && !course.isBase) {
    throw Object.assign(new Error("PREREQUISITES_INCOMPLETE"), {
      statusCode: 423,
      prerequisites: dependencyState.prerequisites,
    });
  }

  await syncLegacyPersonalProgress(userId, course, enrollment);

  const progress = await progressRepo().find({ where: { enrollment: { id: enrollment.id } } });
  const progressByItem = new Map(progress.map((entry) => [entry.itemId, entry]));
  const modules = [...(course.modules || [])].sort((a, b) => a.order - b.order || a.id - b.id);
  const orderedItems = modules.flatMap((module) => [...(module.items || [])]
    .filter((item) => item.isActive !== false)
    .sort((a, b) => a.order - b.order || a.id - b.id));
  return {
    id: course.id,
    key: course.catalogKey,
    title: course.title,
    description: course.description,
    level: course.level,
    isBase: course.isBase,
    runtime: enrollment.variant.runtime,
    enrollment: {
      id: enrollment.id,
      variantId: enrollment.variantId,
      status: enrollment.status,
      completionPercent: percent(enrollment.completionPercent),
      masteryScore: Number(enrollment.masteryScore ?? 0),
      finalAssessmentPassed: Boolean(enrollment.finalAssessmentPassed),
    },
    nextAction: nextActionForItems(orderedItems, progressByItem),
    modules: modules.map((module) => ({
      id: module.id,
      title: module.title,
      items: [...(module.items || [])].filter((item) => item.isActive !== false).sort((a, b) => a.order - b.order || a.id - b.id).map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        order: item.order,
        content: item.content || {},
        progress: progressByItem.get(item.id) ? {
          status: progressByItem.get(item.id)!.status,
          score: progressByItem.get(item.id)!.score ?? null,
          completedAt: progressByItem.get(item.id)!.completedAt ?? null,
        } : { status: "NOT_STARTED" as const, score: null, completedAt: null },
      })),
    })),
  };
}

/**
 * Resolve the exact course item used by the Practice generator.
 * Keeping this check in the catalog service makes the API enforce the same
 * prerequisite/theory gates as the roadmap UI.
 */
export async function getCoursePracticeContext(userId: number, itemId: number) {
  const item = await itemRepo().findOne({ where: { id: itemId, isActive: true }, relations: ["module", "module.course"] });
  if (!item?.module?.course) throw Object.assign(new Error("COURSE_ITEM_NOT_FOUND"), { statusCode: 404 });
  if (item.kind !== "CODE_TASK") {
    throw Object.assign(new Error("COURSE_ITEM_NOT_GENERATABLE"), { statusCode: 409 });
  }

  const enrollment = await findBestCourseEnrollment(userId, item.module.course.id, ["variant"]);
  if (!enrollment) throw Object.assign(new Error("COURSE_NOT_ENROLLED"), { statusCode: 403 });
  if (enrollment.status === "AVAILABLE" || enrollment.status === "LOCKED") {
    throw Object.assign(new Error("COURSE_NOT_ACTIVE"), { statusCode: 409 });
  }
  await assertSequentialAccess(enrollment.id, item.module.course.id, item.id);

  const dependencyState = await getPrerequisiteState(userId, enrollment.courseId);
  if (!dependencyState.satisfied && !item.module.course.isBase) {
    throw Object.assign(new Error("PREREQUISITES_INCOMPLETE"), { statusCode: 423, prerequisites: dependencyState.prerequisites });
  }

  const content = (item.content || {}) as any;
  const theoryItemId = Number(content.theoryItemId ?? 0);
  let theoryItem: CourseItem | null = null;
  if (theoryItemId > 0 && content.generatedAfterTheory === true) {
    theoryItem = await itemRepo().findOne({ where: { id: theoryItemId } });
    const theoryProgress = await progressRepo().findOne({
      where: { enrollment: { id: enrollment.id }, item: { id: theoryItemId }, status: "COMPLETED" },
    });
    if (!theoryProgress) {
      throw Object.assign(new Error("THEORY_REQUIRED_BEFORE_PRACTICE"), { statusCode: 409, theoryItemId });
    }
  }

  const progress = await progressRepo().findOne({ where: { enrollment: { id: enrollment.id }, item: { id: item.id } } });
  return {
    item,
    course: item.module.course,
    enrollment,
    progress,
    theoryMarkdown: typeof (theoryItem?.content as any)?.markdown === "string"
      ? String((theoryItem?.content as any).markdown)
      : "",
  };
}

/** Mark a catalog practice as started as soon as its workspace is opened. */
export async function startCourseItem(userId: number, itemId: number): Promise<void> {
  const context = await getCoursePracticeContext(userId, itemId);
  if (context.progress?.status === "COMPLETED") return;
  const progress = context.progress || progressRepo().create({
    enrollment: { id: context.enrollment.id } as any,
    item: { id: context.item.id } as any,
  });
  progress.status = "IN_PROGRESS";
  await progressRepo().save(progress);
}

export async function completeCourseItem(
  userId: number,
  itemId: number,
  score?: number,
  source: "direct" | "practice" = "direct",
): Promise<UserCourseEnrollment> {
  const item = await itemRepo().findOne({ where: { id: itemId, isActive: true }, relations: ["module", "module.course"] });
  if (!item?.module?.course) throw Object.assign(new Error("COURSE_ITEM_NOT_FOUND"), { statusCode: 404 });
  if (source === "direct" && ["CODE_TASK", "WEB_TASK", "QUIZ"].includes(item.kind)) {
    throw Object.assign(new Error("COURSE_ITEM_REQUIRES_SUBMISSION"), { statusCode: 409 });
  }
  const enrollment = await findBestCourseEnrollment(userId, item.module.course.id);
  if (!enrollment) throw Object.assign(new Error("COURSE_NOT_ENROLLED"), { statusCode: 403 });
  if (enrollment.status === "AVAILABLE" || enrollment.status === "LOCKED") {
    throw Object.assign(new Error("COURSE_NOT_ACTIVE"), { statusCode: 409 });
  }
  await assertSequentialAccess(enrollment.id, item.module.course.id, item.id);
  if (isMiniProject(item)) {
    throw Object.assign(new Error("PROJECT_SUBMISSION_REQUIRED"), { statusCode: 409 });
  }
  const dependencyState = await getPrerequisiteState(userId, enrollment.courseId);
  if (!dependencyState.satisfied && !item.module.course.isBase) {
    throw Object.assign(new Error("PREREQUISITES_INCOMPLETE"), { statusCode: 423, prerequisites: dependencyState.prerequisites });
  }

  const requiredTheoryItemId = Number((item.content as any)?.theoryItemId ?? 0);
  if (requiredTheoryItemId > 0 && (item.content as any)?.generatedAfterTheory === true) {
    const theoryProgress = await progressRepo().findOne({ where: { enrollment: { id: enrollment.id }, item: { id: requiredTheoryItemId }, status: "COMPLETED" } });
    if (!theoryProgress) {
      throw Object.assign(new Error("THEORY_REQUIRED_BEFORE_PRACTICE"), { statusCode: 409, theoryItemId: requiredTheoryItemId });
    }
  }

  const progress = await progressRepo().findOne({ where: { enrollment: { id: enrollment.id }, item: { id: item.id } } })
    || progressRepo().create({ enrollment: { id: enrollment.id } as any, item: { id: item.id } as any });
  progress.status = "COMPLETED";
  progress.score = score == null ? null : percent(score);
  progress.completedAt = new Date();
  await progressRepo().save(progress);

  return recalculateEnrollmentProgress(enrollment);
}

export async function getCourseProject(userId: number, itemId: number) {
  const { item, enrollment, progress } = await getEnrolledItemContext(userId, itemId);
  return {
    itemId: item.id,
    enrollmentId: enrollment.id,
    projectKey: (item.content as any)?.projectKey || null,
    projectSpec: projectSpecFor(item),
    progress: projectProgressOrDefault(progress),
    itemStatus: progress?.status || "NOT_STARTED",
  };
}

function projectCheckError(message: string, statusCode = 422): never {
  throw Object.assign(new Error(message), { statusCode });
}

function normalizeProjectCheckFiles(value: unknown): JudgeFile[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) projectCheckError("PROJECT_FILES_INVALID");
  const files: JudgeFile[] = [];
  let totalBytes = 0;
  for (const candidate of value) {
    const file = candidate as any;
    const filePath = typeof file?.path === "string" ? file.path.trim() : "";
    const content = typeof file?.content === "string" ? file.content : null;
    if (!filePath || content == null || filePath.startsWith("/") || filePath.includes("\\") || filePath.split("/").some((part: string) => part === "..")) {
      projectCheckError("PROJECT_FILES_INVALID");
    }
    if (!/^[A-Za-z0-9._/-]+$/.test(filePath) || filePath === "main.py" || filePath.includes("__studycod_check__")) {
      projectCheckError("PROJECT_FILE_PATH_NOT_ALLOWED");
    }
    if (Buffer.byteLength(content, "utf8") > 200_000) projectCheckError("PROJECT_FILE_TOO_LARGE");
    totalBytes += Buffer.byteLength(content, "utf8");
    files.push({ path: filePath, content });
  }
  if (totalBytes > 1_000_000) projectCheckError("PROJECT_FILES_TOO_LARGE");
  return files;
}

function buildProjectCheckHarness(spec: any): string {
  const kind = String(spec?.kind || "");
  if (kind === "flask") {
    return [
      "import importlib",
      "module = importlib.import_module(" + JSON.stringify(String(spec.module || "app")) + ")",
      "factory = getattr(module, 'create_app', None)",
      "if factory is not None:",
      "    try:",
      "        application = factory(testing=True)",
      "    except TypeError:",
      "        application = factory()",
      "else:",
      "    application = getattr(module, 'app', None)",
      "if application is None or not hasattr(application, 'test_client'):",
      "    raise AssertionError('Flask app or create_app was not found')",
      "application.config.update(TESTING=True)",
      "client = application.test_client()",
      "for path in " + JSON.stringify(Array.isArray(spec.probePaths) ? spec.probePaths : ["/"]) + ":",
      "    response = client.get(path)",
      "    if response.status_code >= 500:",
      "        raise AssertionError(f'{path} returned {response.status_code}')",
      "print('OK')",
      "",
    ].join("\n");
  }
  if (kind === "fastapi") {
    return [
      "import importlib",
      "from fastapi.testclient import TestClient",
      "module = importlib.import_module(" + JSON.stringify(String(spec.module || "app.main")) + ")",
      "factory = getattr(module, 'create_app', None)",
      "if factory is not None:",
      "    try:",
      "        application = factory()",
      "    except TypeError:",
      "        application = factory(testing=True)",
      "else:",
      "    application = getattr(module, 'app', None)",
      "if application is None:",
      "    raise AssertionError('FastAPI app or create_app was not found')",
      "client = TestClient(application)",
      "for path in " + JSON.stringify(Array.isArray(spec.probePaths) ? spec.probePaths : ["/docs"]) + ":",
      "    response = client.get(path)",
      "    if response.status_code >= 500:",
      "        raise AssertionError(f'{path} returned {response.status_code}')",
      "print('OK')",
      "",
    ].join("\n");
  }
  if (kind === "computer-vision") {
    const files = Array.isArray(spec.files) ? spec.files.map(String) : [];
    return [
      "from pathlib import Path",
      "import importlib.util",
      "files = " + JSON.stringify(files),
      "for index, file_name in enumerate(files):",
      "    path = Path(file_name)",
      "    if not path.is_file():",
      "        raise AssertionError(f'missing project module: {file_name}')",
      "    module_spec = importlib.util.spec_from_file_location(f'project_module_{index}', path)",
      "    module = importlib.util.module_from_spec(module_spec)",
      "    module_spec.loader.exec_module(module)",
      "print('OK')",
      "",
    ].join("\n");
  }
  projectCheckError("PROJECT_CHECK_NOT_CONFIGURED", 409);
}

export async function checkCourseProject(userId: number, itemId: number, rawFiles: unknown) {
  const { item } = await getEnrolledItemContext(userId, itemId);
  const checkSpec = projectSpecFor(item)?.checkSpec;
  if (!checkSpec || !["flask", "fastapi", "computer-vision"].includes(String(checkSpec.kind))) {
    projectCheckError("PROJECT_CHECK_NOT_CONFIGURED", 409);
  }
  const studentFiles = normalizeProjectCheckFiles(rawFiles);
  const files: JudgeFile[] = [...studentFiles, { path: "main.py", content: buildProjectCheckHarness(checkSpec) }];
  const request: JudgeRequest = {
    submission_id: `project-${userId}-${itemId}-${Date.now()}`,
    language: "python",
    compiler: "python-libs",
    files,
    entry: "main.py",
    tests: [{ id: "project-contract", input: "", output: "OK\n", hidden: false }],
    checker: { type: "exact" },
    limits: { time_limit_ms: 4_000, memory_limit_mb: 256, output_limit_kb: 16 },
    run_all: false,
    debug: false,
  };
  const result = await judgeWithSemaphore(request, { timeoutMs: 12_000 });
  return {
    passed: result.verdict === "AC",
    verdict: result.verdict,
    message: result.verdict === "AC" ? "PROJECT_CHECK_PASSED" : "PROJECT_CHECK_FAILED",
    tests: result.tests,
  };
}

async function saveProjectProgress(userId: number, itemId: number, input: { milestoneIds: string[]; draft: string; readme: string }, submit: boolean) {
  const { item, enrollment, progress: existing } = await getEnrolledItemContext(userId, itemId);
  const allowedIds = new Set(projectMilestoneIds(item));
  const milestoneIds = [...new Set(input.milestoneIds.map((id) => String(id).trim()).filter((id) => allowedIds.has(id)))];
  const requiredIds = projectMilestoneIds(item);
  if (submit && (requiredIds.some((id) => !milestoneIds.includes(id)) || !input.draft.trim() || !input.readme.trim())) {
    throw Object.assign(new Error("PROJECT_REQUIREMENTS_INCOMPLETE"), { statusCode: 422 });
  }
  const progress = existing || progressRepo().create({ enrollment: { id: enrollment.id } as any, item: { id: item.id } as any });
  progress.projectData = {
    milestoneIds,
    draft: input.draft,
    readme: input.readme,
    status: submit ? "SUBMITTED" : "DRAFT",
    submittedAt: submit ? new Date().toISOString() : (progress.projectData?.submittedAt || null),
  };
  progress.status = submit ? "COMPLETED" : "IN_PROGRESS";
  progress.score = submit ? 100 : null;
  progress.completedAt = submit ? new Date() : null;
  await progressRepo().save(progress);
  const updatedEnrollment = await recalculateEnrollmentProgress(enrollment);
  if (submit && (item.content as any)?.finalAssessment === true) {
    updatedEnrollment.finalAssessmentPassed = true;
    updatedEnrollment.status = "COMPLETED";
    updatedEnrollment.completionPercent = 100;
    updatedEnrollment.completedAt = updatedEnrollment.completedAt || new Date();
    await enrollmentRepo().save(updatedEnrollment);
  }
  return {
    enrollment: updatedEnrollment,
    project: {
      itemId: item.id,
      enrollmentId: enrollment.id,
      projectKey: (item.content as any)?.projectKey || null,
      projectSpec: projectSpecFor(item),
      progress: projectProgressOrDefault(progress),
      itemStatus: progress.status,
    },
  };
}

export async function saveCourseProject(userId: number, itemId: number, input: { milestoneIds: string[]; draft: string; readme: string }) {
  return saveProjectProgress(userId, itemId, input, false);
}

export async function submitCourseProject(userId: number, itemId: number, input: { milestoneIds: string[]; draft: string; readme: string }) {
  return saveProjectProgress(userId, itemId, input, true);
}

export async function passFinalAssessment(userId: number, enrollmentId: number): Promise<UserCourseEnrollment> {
  const enrollment = await enrollmentRepo().findOne({ where: { id: enrollmentId, user: { id: userId } }, relations: ["course"] });
  if (!enrollment) throw Object.assign(new Error("ENROLLMENT_NOT_FOUND"), { statusCode: 404 });
  if (percent(enrollment.completionPercent) < 100) {
    throw Object.assign(new Error("COURSE_ITEMS_INCOMPLETE"), { statusCode: 409 });
  }
  const finalAssessment = (await itemRepo().find({
    where: { module: { course: { id: enrollment.courseId } }, isActive: true },
    relations: ["module"],
    order: { order: "DESC", id: "DESC" },
  })).find((item) => Boolean((item.content as any)?.finalAssessment));
  if (!finalAssessment) {
    throw Object.assign(new Error("FINAL_WORK_REQUIRED"), { statusCode: 409 });
  }
  const progress = await progressRepo().findOne({ where: { enrollment: { id: enrollment.id }, item: { id: finalAssessment.id } } });
  if (!progress || progress.status !== "COMPLETED" || progress.projectData?.status !== "SUBMITTED") {
    throw Object.assign(new Error("FINAL_WORK_REQUIRED"), { statusCode: 409 });
  }
  enrollment.finalAssessmentPassed = true;
  enrollment.completionPercent = 100;
  enrollment.status = "COMPLETED";
  enrollment.completedAt = enrollment.completedAt || new Date();
  return enrollmentRepo().save(enrollment);
}

export async function getEnrollmentIad(userId: number, enrollmentId: number) {
  const enrollment = await enrollmentRepo().findOne({ where: { id: enrollmentId, user: { id: userId } }, relations: ["course", "variant"] });
  if (!enrollment) throw Object.assign(new Error("ENROLLMENT_NOT_FOUND"), { statusCode: 404 });
  return {
    enrollmentId: enrollment.id,
    courseId: enrollment.courseId,
    courseTitle: enrollment.course.title,
    runtime: enrollment.variant.runtime,
    completionPercent: percent(enrollment.completionPercent),
    masteryScore: Number(enrollment.masteryScore ?? 0),
    modelVersion: 2,
    isCompletionGate: false,
    note: "IAD адаптує практику та показує засвоєння; prerequisite відкривається лише після формального завершення курсу.",
  };
}
