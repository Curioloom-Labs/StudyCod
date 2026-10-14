import test from "node:test";
import assert from "node:assert/strict";
import { studentQuizJson } from "./studentQuizPayload";

test("legacy student JSON keeps option keys and removes all answer metadata", () => {
  const raw = JSON.stringify([{ question: "Choose", options: { А: "First", Б: "Second" }, correct: "Б", correctIndex: 1, explanation: "Secret" }]);
  assert.deepEqual(JSON.parse(studentQuizJson(raw)!), [{ question: "Choose", options: { А: "First", Б: "Second" } }]);
  assert.equal(JSON.parse(raw)[0].correct, "Б", "stored teacher content stays intact");
});

test("modern student JSON strips nested keys and preserves answer input counts", () => {
  const raw = JSON.stringify({ questions: [{ id: "a", type: "FILL_BLANK", blanks: [{ accept: ["secret"] }] }, { id: "b", type: "MATCHING", correctMatches: [1, 0] }] });
  const safe = JSON.parse(studentQuizJson(raw)!);
  assert.equal(JSON.stringify(safe).includes("secret"), false);
  assert.equal(safe.questions[0].blanks.length, 1);
  assert.equal(safe.questions[1].pairCount, 2);
  assert.equal(safe.questions[1].correctMatches, undefined);
});

test("invalid stored quiz JSON fails closed", () => {
  for (const raw of [undefined, null, "", "{", "null", "42", '[null]', '{"correct":"secret"}']) assert.equal(studentQuizJson(raw), null);
});
