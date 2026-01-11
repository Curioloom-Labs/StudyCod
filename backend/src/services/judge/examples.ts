import { Task } from "./types/Task";
import { judgeSolution } from "./engine/JudgeEngine";
import { validateTaskConfig } from "./engine/TaskValidator";
export const exampleTaskExact: Task = {
  id: "task-1",
  title: "Double Number",
  description: "Прочитайте число з вводу і виведіть його подвоєне значення",
  input: "5",
  judgeMode: "EXACT",
  expectedOutput: "10",
  createdAt: new Date()
};
export const exampleTaskRegex: Task = {
  id: "task-2",
  title: "Email Validator",
  description: "Прочитайте рядок з вводу і перевірте, чи він є валідним email адресом. Виведіть 'valid' або 'invalid'",
  input: "user@example.com",
  judgeMode: "REGEX",
  regexPattern: "^valid$|^invalid$",
  regexFlags: "i",
  createdAt: new Date()
};
export const exampleTaskNumeric: Task = {
  id: "task-3",
  title: "Circle Area",
  description: "Прочитайте радіус кола з вводу і обчисліть площу. Використовуйте π ≈ 3.14159",
  input: "5",
  judgeMode: "NUMERIC",
  expectedOutput: "78.53975",
  tolerance: 0.01,
  createdAt: new Date()
};
export const exampleTaskCustom: Task = {
  id: "task-4",
  title: "Sorted Array",
  description: "Виведіть відсортований масив чисел через пробіл",
  input: null,
  judgeMode: "CUSTOM",
  customValidator: "isSortedArray",
  createdAt: new Date()
};
export const exampleTaskManual: Task = {
  id: "task-5",
  title: "Programming Essay",
  description: "Напишіть коротке есе про важливість програмування",
  input: null,
  judgeMode: "MANUAL",
  createdAt: new Date()
};
export function exampleUsage() {
  console.log("=== Приклад 1: EXACT режим ===");
  const result1 = judgeSolution({
    task: exampleTaskExact,
    userOutput: "10"
  });
  console.log("Success:", result1.success);
  console.log("Message:", result1.message);
  console.log("Details:", result1.details);
  console.log("\n=== Приклад 2: REGEX режим ===");
  const result2 = judgeSolution({
    task: exampleTaskRegex,
    userOutput: "valid"
  });
  console.log("Success:", result2.success);
  console.log("Message:", result2.message);
  console.log("\n=== Приклад 3: NUMERIC режим ===");
  const result3 = judgeSolution({
    task: exampleTaskNumeric,
    userOutput: "78.54"
  });
  console.log("Success:", result3.success);
  console.log("Message:", result3.message);
  console.log("Difference:", result3.details?.difference);
  console.log("\n=== Приклад 4: CUSTOM режим ===");
  const result4 = judgeSolution({
    task: exampleTaskCustom,
    userOutput: "1 2 3 4 5"
  });
  console.log("Success:", result4.success);
  console.log("Message:", result4.message);
  console.log("\n=== Приклад 5: MANUAL режим ===");
  const result5 = judgeSolution({
    task: exampleTaskManual,
    userOutput: "Програмування - це важлива навичка..."
  });
  console.log("Success:", result5.success);
  console.log("Message:", result5.message);
}
export function exampleValidation() {
  console.log("=== Валідація конфігурації ===");
  try {
    validateTaskConfig(exampleTaskExact);
    console.log("✓ EXACT task is valid");
  } catch (error: any) {
    console.log("✗ EXACT task error:", error.message);
  }
  const invalidTask: Task = {
    id: "invalid-1",
    title: "Invalid Task",
    description: "This task is missing required fields",
    input: null,
    judgeMode: "EXACT",
    expectedOutput: "10",
    createdAt: new Date()
  };
  try {
    validateTaskConfig(invalidTask);
    console.log("✓ Invalid task passed validation (unexpected)");
  } catch (error: any) {
    console.log("✗ Invalid task correctly rejected:", error.message);
  }
}