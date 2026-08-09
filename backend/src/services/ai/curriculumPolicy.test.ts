import test from "node:test";
import assert from "node:assert/strict";
import { getCurriculumPolicyViolationForGeneratedTask, rewriteNonJudgeablePracticalTaskToJudgeable } from "./curriculumPolicy";

test("curriculumPolicy: first topic only allows Hello World-style output", () => {
  const arithmetic = getCurriculumPolicyViolationForGeneratedTask({
    lang: "JAVA",
    topicIndex: 0,
    topicTitle: "Вступ до Java",
    title: "Арифметика для початківців",
    practicalTask: "Виведіть суму двох чисел у консоль та обчисліть результат."
  });
  assert.match(String(arithmetic), /Hello World|arithmetic|multi-step/i);

  const hello = getCurriculumPolicyViolationForGeneratedTask({
    lang: "JAVA",
    topicIndex: 0,
    topicTitle: "Вступ до Java",
    title: "Hello, World!",
    practicalTask: "Напишіть повну програму, яка виводить у консоль точний рядок Hello, World! одним рядком."
  });
  assert.equal(hello, null);
});

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

test("curriculumPolicy: allows generic 'create a program' phrasing without file/project operations", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Основи C++",
    practicalTask: "Створіть програму, яка зчитує два числа та виводить їх суму."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: title mentioning project does not force NON_JUDGEABLE", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Налаштування проєкту",
    practicalTask: "Створіть програму, яка виводить рядок Hello, C++."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: rejects explicit file-name creation instructions", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Практика",
    practicalTask: "Створіть main.cpp і CMakeLists.txt, після чого налаштуйте проєкт для збірки."
  });
  assert.ok(v);
  assert.match(String(v), /NON_JUDGEABLE_TASK/i);
});

test("curriculumPolicy: rewrite helper strips scaffolding clause and keeps judgeable requirement", () => {
  const rewritten = rewriteNonJudgeablePracticalTaskToJudgeable(
    "Створіть main.cpp і CMakeLists.txt. Зчитайте два числа та виведіть їх суму."
  );

  assert.ok(rewritten);
  assert.match(String(rewritten), /зчитайте|виведіть/i);
  assert.doesNotMatch(String(rewritten), /main\.cpp|cmakelists\.txt/i);

  const violation = getCurriculumPolicyViolationForGeneratedTask({
    lang: "CPP",
    topicIndex: 1,
    title: "Практика",
    practicalTask: rewritten,
  });
  assert.equal(violation, null);
});

test("curriculumPolicy: rewrite helper returns null when task is only scaffolding", () => {
  const rewritten = rewriteNonJudgeablePracticalTaskToJudgeable(
    "Створіть каталог src та include, налаштуйте CMake і додайте main.cpp"
  );
  assert.equal(rewritten, null);
});

test("curriculumPolicy: rewrite helper adds stdout hint when output is not explicit", () => {
  const rewritten = rewriteNonJudgeablePracticalTaskToJudgeable(
    "Create project folder and main.cpp. Compute the sum of two numbers."
  );

  assert.ok(rewritten);
  assert.match(String(rewritten), /stdout|output|print/i);
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

test("curriculumPolicy: rejects function implementation tasks (EN)", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 4,
    title: "Data types",
    practicalTask: "Write a Python function identify_data_type(x) that returns the argument type as a string."
  });
  assert.ok(v);
  assert.match(String(v), /NON_JUDGEABLE_TASK/i);
});

test("curriculumPolicy: rejects function implementation tasks (UA)", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 4,
    title: "Типи даних",
    practicalTask: "Напишіть функцію identify_data_type(x), яка повертає тип аргументу у вигляді рядка."
  });
  assert.ok(v);
  assert.match(String(v), /NON_JUDGEABLE_TASK/i);
});

test("curriculumPolicy: allows mathematical function descriptions", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 4,
    title: "Functions",
    practicalTask: "Given a function f(x) = x^2 + 1, compute f(5) and print the result."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: function-impl tasks ALLOWED on Functions topic (UA)", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 5,
    topicTitle: "Функції",
    title: "Функція суми",
    practicalTask: "Напишіть функцію sum_two(a, b), яка повертає суму двох цілих чисел."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: function-impl tasks ALLOWED on Functions topic (EN)", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 5,
    topicTitle: "Functions and methods",
    title: "Sum function",
    practicalTask: "Implement function sum_two(a, b) that returns the sum of two integers."
  });
  assert.equal(v, null);
});

test("curriculumPolicy: function-impl tasks REJECTED on non-functions topic", () => {
  const v = getCurriculumPolicyViolationForGeneratedTask({
    lang: "PYTHON",
    topicIndex: 3,
    topicTitle: "Loops",
    title: "Sum function",
    practicalTask: "Implement function sum_two(a, b) that returns the sum of two integers."
  });
  assert.ok(v);
  assert.match(String(v), /NON_JUDGEABLE_TASK/i);
});
