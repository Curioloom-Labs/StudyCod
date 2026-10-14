import test from "node:test";
import assert from "node:assert/strict";
import { createLessonBodySchema, quizAnswersBodySchema, manualQuizGradeBodySchema } from "./lessonContracts";

test("lesson creation preserves theory and assessment settings", () => {
  const settings = { type: "CONTROL", title: "Lesson", theory: "Explanation", hasTheory: true, timeLimitMinutes: 40, controlHasTheory: true, controlHasPractice: false };
  assert.deepEqual(createLessonBodySchema.parse({ ...settings, title: " Lesson " }), settings);
});
test("lesson creation rejects blank titles and invalid durations", () => {
  assert.equal(createLessonBodySchema.safeParse({ type: "LESSON", title: " " }).success, false);
  for (const minutes of [0, -1, 1.5, 1441, "40"]) assert.equal(createLessonBodySchema.safeParse({ type: "CONTROL", title: "Quiz", timeLimitMinutes: minutes }).success, false);
});
test("quiz submission requires an answer map and bounded entries", () => {
  for (const answers of [null, [], "text", 1]) assert.equal(quizAnswersBodySchema.safeParse({ answers }).success, false);
  assert.deepEqual(quizAnswersBodySchema.parse({ answers: { q1: 0, q2: false, q3: [0, 2] } }).answers, { q1: 0, q2: false, q3: [0, 2] });
  assert.equal(quizAnswersBodySchema.safeParse({ answers: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [String(i), 0])) }).success, false);
});
test("manual grades reject empty, coerced and non-finite scores", () => {
  for (const score of [null, "", "3", -1, Infinity, NaN]) assert.equal(manualQuizGradeBodySchema.safeParse({ manualScores: { q: score } }).success, false);
  assert.equal(manualQuizGradeBodySchema.safeParse({ manualScores: { q: 0, q2: 1.25 } }).success, true);
});
