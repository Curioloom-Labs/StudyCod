import test from "node:test";
import assert from "node:assert/strict";
import { getCurriculumPolicyViolationForGeneratedTask } from "./curriculumPolicy";

test("curriculumPolicy: CPP early topics forbid variables (UA слово)", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 0,
    title: "Вступ до C++",
    practicalTask: "Оголоси змінну x типу int та виведи її значення."
  });
  assert.ok(v);
  assert.match(String(v), /UNTAUGHT_CONCEPT/i);
});

test("curriculumPolicy: rejects non-judgeable project scaffolding tasks", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Налаштування проєкту та структура файлів",
    practicalTask: "Створіть каталог my_project, а всередині src та include, створіть файли main.cpp та my_class.h."
  });
  assert.ok(v);
  assert.match(String(v), /NON_JUDGEABLE_TASK/i);
});

test("curriculumPolicy: CPP early topics allow hello world print", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 0,
    title: "Вступ до C++",
    practicalTask: "Без вхідних даних. Виведіть у консоль рядок \"Hello, C++!\" рівно один раз."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: CPP early topics forbid explicit type declaration int x", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Структура файлів",
    practicalTask: "Створи програму, де є int x = 5; і виведи x."
  });
  assert.ok(v);
  assert.match(String(v), /(UNTAUGHT_CONCEPT|NON_JUDGEABLE_TASK)/i);
});

test("curriculumPolicy: CPP variables topic allows variables", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 2,
    title: "Змінні",
    practicalTask: "Оголоси змінну x і виведи її значення."
  });
  assert.equal(v, null);
});
