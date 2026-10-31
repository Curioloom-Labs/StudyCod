import test from "node:test";
import assert from "node:assert/strict";
import { allocateSubtaskTestCounts, parseTaskSubtasks } from "./taskSubtasks";

test("generated condition subtasks preserve names, requirements and percentage weights", () => {
  const parsed = parseTaskSubtasks(`## Умова\nЗадача.\n\n## Підзадачі\n### 1. Додатні числа — 35%\nОброби лише додатні числа.\n### 2. Усі цілі числа — 65%\nОпрацюй також нуль і від’ємні значення.\n\n## Приклади\n### Приклад 1`);
  assert.deepEqual(parsed, [
    { name: "Додатні числа", description: "Оброби лише додатні числа.", weightPercent: 35 },
    { name: "Усі цілі числа", description: "Опрацюй також нуль і від’ємні значення.", weightPercent: 65 },
  ]);
});

test("subtask parser ignores absent and invalid percentage sections", () => {
  assert.deepEqual(parseTaskSubtasks("## Problem\nSingle-path task."), []);
  assert.deepEqual(parseTaskSubtasks("## Subtasks\n### 1. A — 40%\nOne.\n### 2. B — 50%\nTwo."), []);
});

test("test counts follow percentage weights and give each subtask at least one case", () => {
  const subtasks = [
    { name: "Basic", description: "", weightPercent: 25 },
    { name: "Advanced", description: "", weightPercent: 75 },
  ];
  assert.deepEqual(allocateSubtaskTestCounts(5, subtasks), [2, 3]);
  assert.deepEqual(allocateSubtaskTestCounts(2, subtasks), [1, 1]);
  assert.equal(allocateSubtaskTestCounts(1, subtasks), null);
});
