import { describe, expect, it } from "vitest";
import { emptyCourseQuizQuestion, normalizeCourseQuiz, serializeCourseQuiz, validateCourseQuiz } from "./courseQuiz";

describe("course quiz authoring", () => {
  it("normalizes the existing labeled-options format and writes the grader's array format", () => {
    const questions = normalizeCourseQuiz([
      { question: "Which value is even?", options: { А: "3", Б: "4", В: "5" }, correct: "Б" },
      { q: "How many?", options: ["one", "two"], correct: 1 },
    ]);

    expect(questions).toEqual([
      { question: "Which value is even?", options: ["3", "4", "5"], correct: 1 },
      { question: "How many?", options: ["one", "two"], correct: 1 },
    ]);
    expect(serializeCourseQuiz(questions ?? [])).toEqual([
      { question: "Which value is even?", options: ["3", "4", "5"], correct: 1 },
      { question: "How many?", options: ["one", "two"], correct: 1 },
    ]);
  });

  it("rejects empty prompts and options and supplies a usable starting question", () => {
    const draft = emptyCourseQuizQuestion();
    expect(draft).toEqual({ question: "", options: ["", ""], correct: 0 });
    expect(validateCourseQuiz([draft])).toEqual([
      "QUESTION_1_NEEDS_TEXT",
      "QUESTION_1_HAS_EMPTY_OPTION",
    ]);
    expect(validateCourseQuiz([])).toEqual(["QUIZ_NEEDS_QUESTION"]);
  });
});
