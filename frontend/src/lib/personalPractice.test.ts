import { describe, expect, it } from "vitest";
import type { Task } from "../types";
import { tasksForCourseItem } from "./personalPractice";

const task = (id: number, courseItemId?: number, subtitle?: string) => ({ id, courseItemId, subtitle }) as Task;

describe("personal practice selection", () => {
  const tasks = [task(1, 41), task(2, 42), task(3)];

  it("keeps a new practice empty so its generation action stays available", () => {
    expect(tasksForCourseItem(tasks, 43)).toEqual([]);
  });

  it("opens only the requested course item even when another task is newer", () => {
    expect(tasksForCourseItem(tasks, 42).map((item) => item.id)).toEqual([2]);
  });

  it("supports legacy catalog subtitles without confusing adjacent item IDs", () => {
    const legacy = [task(4, undefined, "CATALOG_ITEM:42|practice"), task(5, undefined, "CATALOG_ITEM:420|practice")];
    expect(tasksForCourseItem(legacy, 42).map((item) => item.id)).toEqual([4]);
    expect(tasksForCourseItem([task(6, 43, "CATALOG_ITEM:42|practice")], 42)).toEqual([]);
  });

  it("leaves the Lab list supplied by the API intact", () => {
    expect(tasksForCourseItem(tasks, null)).toBe(tasks);
  });
});
