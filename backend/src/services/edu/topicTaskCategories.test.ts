import assert from "node:assert/strict";
import test from "node:test";
import { regularTopicPracticeTasks } from "./topicTaskCategories";

test("regular topic practice excludes tasks that belong to control works", () => {
  const tasks = [
    { id: 1, type: "PRACTICE" },
    { id: 2, type: "CONTROL" },
    { id: 3, type: "PRACTICE" },
  ];

  assert.deepEqual(regularTopicPracticeTasks(tasks).map(task => task.id), [1, 3]);
});

test("regular topic practice safely handles missing task lists", () => {
  assert.deepEqual(regularTopicPracticeTasks(undefined), []);
  assert.deepEqual(regularTopicPracticeTasks(null), []);
});
