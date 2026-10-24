import type { Task } from "../types";

/** A practice URL must never open a different course item's task. */
export function tasksForCourseItem(tasks: Task[], courseItemId: number | null): Task[] {
  if (courseItemId == null) return tasks;
  return tasks.filter((task) => task.courseItemId === courseItemId
    || (task.courseItemId == null && String(task.subtitle ?? "").startsWith(`CATALOG_ITEM:${courseItemId}|`)));
}
