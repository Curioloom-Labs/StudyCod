import test from "node:test";
import assert from "node:assert/strict";
import { explicitlyDeclaresNoInput, inferNeedsInput } from "./inferNeedsInput";

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

test("inferNeedsInput: negative Ukrainian input-format wording is not mistaken for required input", () => {
  const params = {
    taskDescription: "Список елементів уже заданий у програмі.",
    aiInputFormat: "Вхідні дані не використовуються, оскільки список визначено в умові."
  };
  assert.equal(inferNeedsInput(params), false);
  assert.equal(explicitlyDeclaresNoInput(params), true);
});

test("inferNeedsInput: negative English input-format wording is not mistaken for required input", () => {
  const needs = inferNeedsInput({
    taskDescription: "The values are already given in the task.",
    aiInputFormat: "Input data is not used because all values are fixed."
  });
  assert.equal(needs, false);
});

test("inferNeedsInput: explicit input format still wins when it requires console input", () => {
  const params = {
    taskDescription: "Вхідні дані подано в умові.",
    aiInputFormat: "Програма читає з консолі два цілих числа."
  };
  assert.equal(explicitlyDeclaresNoInput(params), false);
  assert.equal(inferNeedsInput(params), true);
});
