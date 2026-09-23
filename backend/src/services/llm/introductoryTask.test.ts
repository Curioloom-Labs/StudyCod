import test from "node:test";
import assert from "node:assert/strict";
import { AIResponseValidator } from "./AIResponseValidator";
import { getCurriculumPolicyViolationForGeneratedTask } from "../ai/curriculumPolicy";
import { createIntroductoryHelloWorldTask } from "./introductoryTask";

test("introductory practice is deterministic and valid for the first Python topic", () => {
  const task = createIntroductoryHelloWorldTask({
    topicTitle: "Вступ до Python та інтерпретатора",
    lang: "PYTHON",
    language: "uk",
  });

  const validated = AIResponseValidator.validateGenerateTask(
    task,
    "Вступ до Python та інтерпретатора",
    0,
    ["NO_INPUT_FIXED_OUTPUT"],
  );

  assert.equal(validated.outputFormat, "Hello, World!");
  assert.equal(validated.examples[0]?.input, "");
  assert.equal(validated.examples[0]?.output, "Hello, World!");
  assert.equal(
    getCurriculumPolicyViolationForGeneratedTask({
      lang: "PYTHON",
      topicIndex: 0,
      topicTitle: "Вступ до Python та інтерпретатора",
      title: validated.title,
      practicalTask: validated.practicalTask,
    }),
    null,
  );
});

test("introductory practice accepts the catalog's Practice 1/1 title", () => {
  const topicTitle = "Практика 1/1: Вступ до Python та інтерпретатора";
  const task = createIntroductoryHelloWorldTask({
    topicTitle,
    lang: "PYTHON",
    language: "uk",
  });

  const validated = AIResponseValidator.validateGenerateTask(
    task,
    topicTitle,
    0,
    ["NO_INPUT_FIXED_OUTPUT"],
  );

  assert.equal(
    getCurriculumPolicyViolationForGeneratedTask({
      lang: "PYTHON",
      topicIndex: 0,
      topicTitle,
      title: validated.title,
      practicalTask: validated.practicalTask,
    }),
    null,
  );
});

test("introductory practice localizes the statement and retains a judgeable contract", () => {
  const task = createIntroductoryHelloWorldTask({
    topicTitle: "Introduction to Python",
    lang: "PYTHON",
    language: "en",
  });

  assert.match(task.practicalTask, /Write a complete program/);
  assert.equal(task.ioType, "NO_INPUT_FIXED_OUTPUT");
  assert.equal(task.examples[0]?.output, task.outputFormat);
});
