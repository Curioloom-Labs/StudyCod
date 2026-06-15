import test from "node:test";
import assert from "node:assert/strict";
import { gradeQuiz, stripQuizForStudent, manualPointsAwarded, type Quiz } from "./quizGrader";

test("SINGLE_CHOICE: correct vs wrong", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "SINGLE_CHOICE", correctIndex: 2, points: 5 }] };
  assert.equal(gradeQuiz(quiz, { q1: 2 }).autoScore, 5);
  assert.equal(gradeQuiz(quiz, { q1: 1 }).autoScore, 0);
  assert.equal(gradeQuiz(quiz, {}).autoScore, 0);
});

test("MULTIPLE_CHOICE: all-or-nothing, order-independent", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "MULTIPLE_CHOICE", correctIndexes: [0, 2], points: 4 }] };
  assert.equal(gradeQuiz(quiz, { q1: [2, 0] }).autoScore, 4);
  assert.equal(gradeQuiz(quiz, { q1: [0] }).autoScore, 0, "partial selection earns nothing");
  assert.equal(gradeQuiz(quiz, { q1: [0, 1, 2] }).autoScore, 0, "extra selection earns nothing");
});

test("TRUE_FALSE", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "TRUE_FALSE", correct: true }] };
  assert.equal(gradeQuiz(quiz, { q1: true }).autoScore, 1);
  assert.equal(gradeQuiz(quiz, { q1: false }).autoScore, 0);
});

test("SHORT_ANSWER: accept list, case-insensitive by default", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "SHORT_ANSWER", accept: ["Paris", "paris city"] }] };
  assert.equal(gradeQuiz(quiz, { q1: "  PARIS " }).autoScore, 1);
  assert.equal(gradeQuiz(quiz, { q1: "london" }).autoScore, 0);
});

test("SHORT_ANSWER: case-sensitive when flagged", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "SHORT_ANSWER", accept: ["ABC"], caseSensitive: true }] };
  assert.equal(gradeQuiz(quiz, { q1: "abc" }).autoScore, 0);
  assert.equal(gradeQuiz(quiz, { q1: "ABC" }).autoScore, 1);
});

test("SHORT_ANSWER: regex pattern, and a bad regex never throws", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "SHORT_ANSWER", pattern: "^\\d{3}$" }] };
  assert.equal(gradeQuiz(quiz, { q1: "123" }).autoScore, 1);
  assert.equal(gradeQuiz(quiz, { q1: "12" }).autoScore, 0);

  const bad: Quiz = { questions: [{ id: "q1", type: "SHORT_ANSWER", pattern: "(" }] };
  assert.equal(gradeQuiz(bad, { q1: "anything" }).autoScore, 0);
});

test("FILL_BLANK: fractional credit per blank", () => {
  const quiz: Quiz = {
    questions: [
      {
        id: "q1",
        type: "FILL_BLANK",
        points: 4,
        blanks: [{ accept: ["a"] }, { accept: ["b"] }, { accept: ["c"] }, { accept: ["d"] }]
      }
    ]
  };
  assert.equal(gradeQuiz(quiz, { q1: ["a", "b", "x", "x"] }).autoScore, 2, "2 of 4 → half of 4 points");
  assert.equal(gradeQuiz(quiz, { q1: ["a", "b", "c", "d"] }).autoScore, 4);
});

test("MATCHING: fractional credit per pair", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "MATCHING", points: 2, correctMatches: [1, 0, 2] }] };
  assert.equal(gradeQuiz(quiz, { q1: [1, 0, 2] }).autoScore, 2);
  // 2 of 3 correct → 2 * (2/3) = 1.33
  assert.equal(gradeQuiz(quiz, { q1: [1, 0, 0] }).autoScore, 1.33);
});

test("OPEN_TEXT marks the quiz as needing manual grading and is excluded from autoPercent", () => {
  const quiz: Quiz = {
    questions: [
      { id: "q1", type: "SINGLE_CHOICE", correctIndex: 0, points: 1 },
      { id: "q2", type: "OPEN_TEXT", points: 9 }
    ]
  };
  const r = gradeQuiz(quiz, { q1: 0, q2: "an essay" });
  assert.equal(r.needsManual, true);
  assert.equal(r.maxScore, 10);
  assert.equal(r.autoScore, 1);
  assert.equal(r.autoPercent, 100, "auto portion (the 1-pt MCQ) is fully correct");
});

test("stripQuizForStudent removes all answer keys but keeps renderable fields", () => {
  const quiz: Quiz = {
    questions: [
      { id: "q1", type: "SINGLE_CHOICE", prompt: "?", options: ["a", "b"], correctIndex: 1, points: 2 },
      { id: "q2", type: "MULTIPLE_CHOICE", options: ["x", "y", "z"], correctIndexes: [0, 2] },
      { id: "q3", type: "TRUE_FALSE", correct: true },
      { id: "q4", type: "SHORT_ANSWER", accept: ["secret"], pattern: "^s" },
      { id: "q5", type: "FILL_BLANK", blanks: [{ accept: ["one"] }, { accept: ["two"] }] },
      { id: "q6", type: "MATCHING", correctMatches: [1, 0] }
    ]
  };
  const stripped = stripQuizForStudent(quiz) as any;
  const byId = Object.fromEntries(stripped.questions.map((q: any) => [q.id, q]));

  assert.equal(byId.q1.correctIndex, undefined);
  assert.deepEqual(byId.q1.options, ["a", "b"], "options kept for rendering");
  assert.equal(byId.q2.correctIndexes, undefined);
  assert.equal(byId.q3.correct, undefined);
  assert.equal(byId.q4.accept, undefined);
  assert.equal(byId.q4.pattern, undefined);
  assert.equal(byId.q5.blanks.length, 2, "blank count kept");
  assert.deepEqual(byId.q5.blanks[0].accept, [], "blank answers removed");
  assert.equal(byId.q6.correctMatches, undefined);
  assert.equal(byId.q6.pairCount, 2, "pair count exposed instead of answers");

  // Hard guarantee: the serialized stripped quiz must not contain the secret.
  assert.equal(JSON.stringify(stripped).includes("secret"), false);
});

test("manualPointsAwarded clamps to question points and ignores non-open questions", () => {
  const quiz: Quiz = {
    questions: [
      { id: "q1", type: "SINGLE_CHOICE", correctIndex: 0, points: 5 },
      { id: "q2", type: "OPEN_TEXT", points: 10 },
      { id: "q3", type: "OPEN_TEXT", points: 4 }
    ]
  };
  const r = manualPointsAwarded(quiz, { q2: 8, q3: 99, q1: 5 });
  assert.equal(r.manualAwarded, 8 + 4, "q3 clamped to its 4-pt max; q1 ignored");
  assert.deepEqual(r.invalidIds, ["q1"], "non-open question id reported as invalid");
  assert.deepEqual(r.openQuestionIds.sort(), ["q2", "q3"]);
});

test("manualPointsAwarded floors negatives and ignores junk", () => {
  const quiz: Quiz = { questions: [{ id: "q1", type: "OPEN_TEXT", points: 6 }] };
  assert.equal(manualPointsAwarded(quiz, { q1: -3 }).manualAwarded, 0);
  assert.equal(manualPointsAwarded(quiz, { q1: "abc" }).manualAwarded, 0);
  assert.equal(manualPointsAwarded(quiz, {}).manualAwarded, 0);
});

test("defaults points to 1 and tolerates a malformed quiz", () => {
  assert.equal(gradeQuiz({ questions: [{ id: "q1", type: "TRUE_FALSE", correct: false }] }, { q1: false }).maxScore, 1);
  assert.deepEqual(gradeQuiz(null, null).results, []);
  assert.equal(gradeQuiz({ questions: [{ id: "q1", type: "SINGLE_CHOICE" as any }] } as any, {}).autoScore, 0);
});
