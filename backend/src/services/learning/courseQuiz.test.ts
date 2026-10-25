import assert from "node:assert/strict";
import test from "node:test";
import { gradeCourseQuiz, learnerSafeCourseQuizContent, parseCourseQuiz } from "./courseQuiz";

const authoredQuiz = {
  title: "Prefix sums",
  quiz: [
    { question: "What does prefix[0] represent?", options: ["Nothing", "The first value"], correct: 0 },
    { question: "Which formula answers [l, r)?", options: { A: "P[r] - P[l]", B: "P[l] - P[r]" }, correct: "A" },
  ],
};

test("course quiz parser normalizes array and labeled options into stable question ids", () => {
  assert.deepEqual(parseCourseQuiz(authoredQuiz), [
    { id: "question-1", question: "What does prefix[0] represent?", options: ["Nothing", "The first value"], correct: 0 },
    { id: "question-2", question: "Which formula answers [l, r)?", options: ["P[r] - P[l]", "P[l] - P[r]"], correct: 0 },
  ]);
});

test("course quiz parser accepts wrapped JSON and rejects malformed or oversized questions", () => {
  assert.equal(parseCourseQuiz({ quiz: JSON.stringify({ questions: authoredQuiz.quiz }) })?.length, 2);
  assert.equal(parseCourseQuiz({ quiz: [{ question: "Missing choices", correct: 0 }] }), null);
  assert.equal(parseCourseQuiz({ quiz: [{ question: "Too few", options: ["Only one"], correct: 0 }] }), null);
  assert.equal(parseCourseQuiz({ quiz: [{ question: "No key", options: ["A", "B"] }] }), null);
  assert.equal(parseCourseQuiz({ quiz: Array.from({ length: 101 }, (_, index) => ({ question: `Q${index}`, options: ["A", "B"], correct: 0 })) }), null);
});

test("learner-safe course content never includes correct-answer fields", () => {
  const safe = learnerSafeCourseQuizContent(authoredQuiz);
  assert.deepEqual(safe, {
    quiz: [
      { id: "question-1", question: "What does prefix[0] represent?", options: ["Nothing", "The first value"] },
      { id: "question-2", question: "Which formula answers [l, r)?", options: ["P[r] - P[l]", "P[l] - P[r]"] },
    ],
  });
  assert.equal(JSON.stringify(safe).includes("correct"), false);
});

test("quiz grading requires one valid answer per question and returns feedback after grading", () => {
  const questions = parseCourseQuiz(authoredQuiz)!;
  const result = gradeCourseQuiz(questions, [
    { questionId: "question-1", selectedIndex: 0 },
    { questionId: "question-2", selectedIndex: 1 },
  ]);
  assert.deepEqual(result, {
    score: 50,
    correctCount: 1,
    total: 2,
    passed: false,
    review: [
      { questionId: "question-1", question: "What does prefix[0] represent?", options: ["Nothing", "The first value"], selectedIndex: 0, correctIndex: 0 },
      { questionId: "question-2", question: "Which formula answers [l, r)?", options: ["P[r] - P[l]", "P[l] - P[r]"], selectedIndex: 1, correctIndex: 0 },
    ],
  });
  assert.equal(gradeCourseQuiz(questions, [{ questionId: "question-1", selectedIndex: 0 }]), null);
  assert.equal(gradeCourseQuiz(questions, [
    { questionId: "question-1", selectedIndex: 0 },
    { questionId: "question-1", selectedIndex: 1 },
  ]), null);
  assert.equal(gradeCourseQuiz(questions, [
    { questionId: "question-1", selectedIndex: 0 },
    { questionId: "question-2", selectedIndex: 9 },
  ]), null);
  assert.equal(gradeCourseQuiz(questions, [
    { questionId: "question-1", selectedIndex: 0 },
    { questionId: "other-question", selectedIndex: 0 },
  ]), null);
});

test("quiz passing threshold follows the shared 60 percent practice threshold", () => {
  const questions = parseCourseQuiz(authoredQuiz)!;
  const passed = gradeCourseQuiz(questions, [
    { questionId: "question-1", selectedIndex: 0 },
    { questionId: "question-2", selectedIndex: 0 },
  ]);
  assert.equal(passed?.passed, true);
  assert.equal(passed?.score, 100);
});
