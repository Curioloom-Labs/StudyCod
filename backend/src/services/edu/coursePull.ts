import { hashCourseItem, hashEduTask, planTaskFromItem } from "./courseFork";
import { AppDataSource } from "../../data-source";
import { CourseModule } from "../../entities/CourseModule";
import { CourseItem } from "../../entities/CourseItem";
import { CourseAssignment, type OriginEntry } from "../../entities/CourseAssignment";
import { EduTask } from "../../entities/EduTask";
import { EduLesson } from "../../entities/EduLesson";

const TASK_KINDS = new Set(["CODE_TASK", "WEB_TASK"]);

/**
 * Opt-in pull diffing (P2.3). After a fork, the course template and the class's
 * local copy drift apart independently. This computes, per source course-item,
 * how it changed so the UI can show a "N updates" banner with per-item choices.
 *
 * Three reference points per item:
 *  - origin.sourceHash: course-item hash captured at fork time.
 *  - upstreamHash:      hash of the item in the course template NOW.
 *  - origin.localHash:  EduTask hash captured at fork time.
 *  - state.localHash:   hash of the materialized EduTask in the class NOW.
 *
 * Upstream change = upstreamHash ≠ origin.sourceHash (course-item hasher).
 * Local change    = state.localHash ≠ origin.localHash (EduTask hasher).
 *
 * Pure (no DB) so it is unit-testable; the route fetches the three sources.
 */
export type PullStatus =
  | "UNCHANGED"
  | "TEMPLATE_UPDATED" // upstream changed, local untouched → safe to pull
  | "LOCALLY_MODIFIED" // teacher edited locally, upstream unchanged → keep local
  | "CONFLICT" // both changed → needs explicit choice
  | "NEW_UPSTREAM" // item added to the template since fork
  | "REMOVED_UPSTREAM"; // item deleted from the template since fork

export interface PullDiffEntry {
  sourceItemId: number;
  status: PullStatus;
  title: string | null;
}

export interface LocalItemState {
  sourceItemId: number;
  /** Hash of the current local EduTask's authored content, or null if it was deleted locally. */
  localHash: string | null;
  title: string | null;
}

/**
 * @param originMap   fork-time origin entries keyed by source item id
 * @param upstream    current course items (template now)
 * @param localStates current local hashes keyed by source item id
 */
export function computePullDiff(
  originMap: Record<string, OriginEntry>,
  upstream: Array<Pick<CourseItem, "id" | "kind" | "title" | "content">>,
  localStates: LocalItemState[]
): PullDiffEntry[] {
  const localById = new Map<number, LocalItemState>(localStates.map((s) => [s.sourceItemId, s]));
  const upstreamById = new Map<number, Pick<CourseItem, "id" | "kind" | "title" | "content">>(
    upstream.map((u) => [u.id, u])
  );
  const result: PullDiffEntry[] = [];

  // Items known at fork time (in originMap): classify drift.
  for (const [key, origin] of Object.entries(originMap)) {
    const sourceItemId = Number(key);
    const up = upstreamById.get(sourceItemId);
    const local = localById.get(sourceItemId);

    if (!up) {
      result.push({ sourceItemId, status: "REMOVED_UPSTREAM", title: local?.title ?? null });
      continue;
    }

    const upstreamHash = hashCourseItem(up);
    const templateChanged = upstreamHash !== origin.sourceHash;
    // EduTask deleted locally, or its current hash differs from the fork-time
    // EduTask hash → the teacher changed it. Fall back to sourceHash for older
    // assignments forked before localHash was recorded.
    const forkLocalHash = origin.localHash ?? origin.sourceHash;
    const localChanged = local == null || local.localHash == null || local.localHash !== forkLocalHash;

    let status: PullStatus;
    if (templateChanged && localChanged) status = "CONFLICT";
    else if (templateChanged) status = "TEMPLATE_UPDATED";
    else if (localChanged) status = "LOCALLY_MODIFIED";
    else status = "UNCHANGED";

    result.push({ sourceItemId, status, title: up.title });
  }

  // Items present upstream but not in the origin map → added after the fork.
  for (const up of upstream) {
    if (!(String(up.id) in originMap)) {
      result.push({ sourceItemId: up.id, status: "NEW_UPSTREAM", title: up.title });
    }
  }

  return result;
}

/** Banner summary: counts that warrant surfacing "N updates available". */
export function summarizePullDiff(entries: PullDiffEntry[]): {
  total: number;
  actionable: number;
  byStatus: Record<PullStatus, number>;
} {
  const byStatus = {
    UNCHANGED: 0,
    TEMPLATE_UPDATED: 0,
    LOCALLY_MODIFIED: 0,
    CONFLICT: 0,
    NEW_UPSTREAM: 0,
    REMOVED_UPSTREAM: 0
  } as Record<PullStatus, number>;
  for (const e of entries) byStatus[e.status]++;
  // "Actionable" = something the teacher might want to pull/resolve.
  const actionable = byStatus.TEMPLATE_UPDATED + byStatus.CONFLICT + byStatus.NEW_UPSTREAM + byStatus.REMOVED_UPSTREAM;
  return { total: entries.length, actionable, byStatus };
}

export interface ApplyPullResult {
  applied: number;
  skipped: number;
}

/**
 * Apply selected upstream updates to a class's forked tasks (P2.3b). Only items
 * whose upstream content actually changed since the fork are pulled; the change
 * is re-checked server-side so a stale client choice can't clobber a task whose
 * template did not move. Existing EduTasks are overwritten in place (preserving
 * their id, so attempts/grades stay attached). NEW/REMOVED upstream items are
 * out of scope here. Atomic.
 */
export async function applyPullUpdates(
  classId: number,
  orgId: number,
  sourceItemIds: number[],
  opts: { removeDeleted?: boolean } = {}
): Promise<ApplyPullResult> {
  const requested = new Set(sourceItemIds.map((n) => Number(n)));
  if (requested.size === 0) return { applied: 0, skipped: 0 };

  const assignment = await AppDataSource.getRepository(CourseAssignment).findOne({
    where: { class: { id: classId } },
    relations: ["class", "course"],
    order: { forkedAt: "DESC" }
  });
  if (!assignment || assignment.class?.organizationId !== orgId) throw new Error("ASSIGNMENT_NOT_FOUND");

  // Current upstream items keyed by id, plus the module they belong to.
  const modules = await AppDataSource.getRepository(CourseModule).find({
    where: { course: { id: assignment.courseId } }
  });
  const upstreamById = new Map<number, CourseItem>();
  const itemModuleId = new Map<number, number>();
  const moduleTitle = new Map<number, string>();
  for (const m of modules) {
    moduleTitle.set(m.id, m.title);
    const items = await AppDataSource.getRepository(CourseItem).find({ where: { module: { id: m.id } } });
    for (const it of items) {
      upstreamById.set(it.id, it);
      itemModuleId.set(it.id, m.id);
    }
  }

  const originMap: Record<string, OriginEntry> = { ...(assignment.originMap ?? {}) };
  const moduleMap: Record<string, number> = { ...(assignment.moduleMap ?? {}) };
  let applied = 0;
  let skipped = 0;

  await AppDataSource.transaction(async (manager) => {
    for (const sourceItemId of requested) {
      const origin = originMap[String(sourceItemId)];
      const up = upstreamById.get(sourceItemId);

      // Case A: a tracked task item whose template changed → overwrite in place.
      if (origin && up && origin.eduTaskId != null) {
        if (hashCourseItem(up) === origin.sourceHash) {
          skipped++; // upstream unchanged → don't clobber local
          continue;
        }
        const task = await manager.getRepository(EduTask).findOne({ where: { id: origin.eduTaskId } });
        if (!task) {
          skipped++;
          continue;
        }
        applyPlannedToTask(task, planTaskFromItem(up));
        await manager.getRepository(EduTask).save(task);
        originMap[String(sourceItemId)] = {
          sourceHash: hashCourseItem(up),
          localHash: hashEduTask(task),
          eduTaskId: task.id
        };
        applied++;
        continue;
      }

      // Case B: NEW_UPSTREAM task item (in template, absent from origin) → create.
      if (!origin && up && TASK_KINDS.has(String(up.kind))) {
        const moduleId = itemModuleId.get(sourceItemId);
        if (moduleId == null) {
          skipped++;
          continue;
        }
        // Ensure a lesson exists for this module (create if the module is new).
        let lessonId = moduleMap[String(moduleId)];
        if (lessonId == null) {
          const lesson = manager.getRepository(EduLesson).create({
            class: assignment.class,
            type: "LESSON",
            title: moduleTitle.get(moduleId) ?? "Module"
          });
          await manager.getRepository(EduLesson).save(lesson);
          lessonId = lesson.id;
          moduleMap[String(moduleId)] = lessonId;
        }
        const planned = planTaskFromItem(up);
        const task = manager.getRepository(EduTask).create({
          lesson: { id: lessonId } as any,
          title: planned.title,
          description: planned.description,
          template: planned.template,
          taskMode: planned.taskMode as any,
          webTemplateFiles: planned.webTemplateFiles as any,
          webValidationRules: planned.webValidationRules as any,
          webValidationProfile: planned.webValidationProfile as any,
          maxAttempts: 1,
          isClosed: false
        });
        await manager.getRepository(EduTask).save(task);
        originMap[String(sourceItemId)] = {
          sourceHash: hashCourseItem(up),
          localHash: hashEduTask(task),
          eduTaskId: task.id
        };
        applied++;
        continue;
      }

      // Case C: REMOVED_UPSTREAM — tracked item gone from the template. Opt-in
      // only, and non-destructive: close the task (keeps attempts/grades) and
      // stop tracking it, rather than deleting graded content.
      if (origin && !up && origin.eduTaskId != null) {
        if (!opts.removeDeleted) {
          skipped++;
          continue;
        }
        const task = await manager.getRepository(EduTask).findOne({ where: { id: origin.eduTaskId } });
        if (task) {
          task.isClosed = true;
          await manager.getRepository(EduTask).save(task);
        }
        delete originMap[String(sourceItemId)];
        applied++;
        continue;
      }

      skipped++;
    }

    assignment.originMap = originMap;
    assignment.moduleMap = moduleMap;
    await manager.getRepository(CourseAssignment).save(assignment);
  });

  return { applied, skipped };
}

/** Overwrite an EduTask's authored fields from a planned task (shared by pull paths). */
function applyPlannedToTask(task: EduTask, planned: ReturnType<typeof planTaskFromItem>): void {
  task.title = planned.title;
  task.description = planned.description;
  task.template = planned.template;
  task.taskMode = planned.taskMode as any;
  task.webTemplateFiles = planned.webTemplateFiles as any;
  task.webValidationRules = planned.webValidationRules as any;
  task.webValidationProfile = planned.webValidationProfile as any;
}
