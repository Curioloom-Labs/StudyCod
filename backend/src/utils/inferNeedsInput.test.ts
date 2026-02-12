import test from "node:test";
import assert from "node:assert/strict";
import { inferNeedsInput } from "./inferNeedsInput";

test("inferNeedsInput: AI inputFormat says no input", () => {
  const needs = inferNeedsInput({
    taskDescription: "Визначити тип даних змінної hello та вивести результат.",
    aiInputFormat: "Немає вхідних даних. Використовуйте значення, які ви вкажете в коді."
  });
  assert.equal(needs, false);
});

test("inferNeedsInput: AI inputFormat says reads from console", () => {
  const needs = inferNeedsInput({
    taskDescription: "Обчислити суму двох чисел.",
    aiInputFormat: "Програма читає з консолі: два цілих числа a і b."
  });
  assert.equal(needs, true);
});

test("inferNeedsInput: task description explicit no input", () => {
  const needs = inferNeedsInput({
    taskDescription: "Без вхідних даних. Виведіть Hello, world!",
    aiInputFormat: null
  });
  assert.equal(needs, false);
});

test("inferNeedsInput: task description mentions input", () => {
  const needs = inferNeedsInput({
    taskDescription: "Вхідні дані: одне ціле число n. Виведіть n*n.",
    aiInputFormat: null
  });
  assert.equal(needs, true);
});
