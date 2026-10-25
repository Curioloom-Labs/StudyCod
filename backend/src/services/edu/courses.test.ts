import test from "node:test";
import assert from "node:assert/strict";
import { attachPrecedingTheoryReference, authoredCoursePublishIssues, isCourseItemKind, normalizeCourseRuntime, normalizeCourseStatus } from "./courses";
import { buildOlympiadPracticeContract } from "../learning/learningContract";

test("isCourseItemKind accepts the fixed kinds, rejects others", () => {
  for (const k of ["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"]) {
    assert.equal(isCourseItemKind(k), true, k);
  }
  assert.equal(isCourseItemKind("FORUM"), false);
  assert.equal(isCourseItemKind("code_task"), false, "case-sensitive");
  assert.equal(isCourseItemKind(undefined), false);
});

test("normalizeCourseRuntime uppercases known runtimes, defaults to PYTHON", () => {
  assert.equal(normalizeCourseRuntime("java"), "JAVA");
  assert.equal(normalizeCourseRuntime("CPP"), "CPP");
  assert.equal(normalizeCourseRuntime("python"), "PYTHON");
  assert.equal(normalizeCourseRuntime("rust"), "PYTHON");
  assert.equal(normalizeCourseRuntime(undefined), "PYTHON");
});

test("normalizeCourseStatus only yields PUBLISHED for the exact value", () => {
  assert.equal(normalizeCourseStatus("PUBLISHED"), "PUBLISHED");
  assert.equal(normalizeCourseStatus("DRAFT"), "DRAFT");
  assert.equal(normalizeCourseStatus("published"), "DRAFT");
  assert.equal(normalizeCourseStatus(undefined), "DRAFT");
});

test("authored global courses cannot publish empty modules, lesson content, or invalid quizzes", () => {
  assert.deepEqual(authoredCoursePublishIssues([]), ["COURSE_HAS_NO_MODULES"]);
  assert.deepEqual(authoredCoursePublishIssues([{ id: 4, items: [] }]), ["MODULE_4_IS_EMPTY"]);
  assert.deepEqual(authoredCoursePublishIssues([{ id: 4, items: [{ id: 9, kind: "THEORY", content: { markdown: "  " }, isActive: true }] }]), ["ITEM_9_HAS_NO_CONTENT"]);
  assert.deepEqual(authoredCoursePublishIssues([{ id: 4, items: [{ id: 11, kind: "QUIZ", content: { quiz: [{ question: "Q", options: ["A", "B"] }] }, isActive: true }] }]), ["ITEM_11_QUIZ_INVALID"]);
});

test("authored global courses reject incomplete dynamic Olympiad task contracts", () => {
  const validContract = buildOlympiadPracticeContract({
    courseKey: "olympiad-custom-42",
    topicKey: "prefix-sums",
    topicTitle: "Prefix sums",
    runtime: "JAVA",
    objective: "Answer range-sum queries.",
    sequence: 1,
    total: 3,
  });
  const moduleWith = (learningContract: unknown) => [{ id: 4, items: [
    { id: 10, kind: "CODE_TASK" as const, content: { exercise: { prompt: "Generate a fresh range-sum problem.", runtime: "JAVA", learningContract } }, isActive: true },
  ] }];
  assert.deepEqual(authoredCoursePublishIssues(moduleWith(validContract)), []);
  assert.deepEqual(authoredCoursePublishIssues(moduleWith({ ...validContract, requiredCases: [] })), ["ITEM_10_OLYMPIAD_PRACTICE_CONTRACT_INVALID"]);
  assert.deepEqual(authoredCoursePublishIssues(moduleWith({ ...validContract, runtime: "CPP" })), ["ITEM_10_OLYMPIAD_PRACTICE_CONTRACT_INVALID"]);
});

test("authored global course publishing accepts real theory, quizzes, and dynamic Judge practice contracts", () => {
  const issues = authoredCoursePublishIssues([{ id: 4, items: [
    { id: 9, kind: "THEORY", content: { markdown: "# Prefix sums" }, isActive: true },
    { id: 11, kind: "QUIZ", content: { quiz: [{ question: "Which prefix formula answers [l, r)?", options: ["P[r] - P[l]", "P[l] - P[r]"], correct: 0 }] }, isActive: true },
    { id: 10, kind: "CODE_TASK", content: { generated: true, exercise: { prompt: "Generate a range-sum problem." } }, isActive: true },
  ] }]);
  assert.deepEqual(issues, []);
});

test("dynamic practice links to the nearest preceding lesson theory without storing a fixed problem", () => {
  const content = { generated: true, exercisePolicy: "generate-after-reading", generatedAfterTheory: true, exercise: { prompt: "Generate a range-sum task." } };
  const linked = attachPrecedingTheoryReference(content, 3, [
    { id: 4, kind: "THEORY", order: 0, contentKey: "lesson-a" },
    { id: 5, kind: "PAGE", order: 2, contentKey: "lesson-b" },
    { id: 6, kind: "CODE_TASK", order: 2, contentKey: "old-practice" },
  ]);
  assert.equal(linked.theoryItemId, 5);
  assert.equal(linked.theoryItemKey, "lesson-b");
  assert.equal(linked.generated, true);
  assert.equal(linked.exercise, content.exercise);
});

test("reordering theory repairs a dynamic practice link and removes stale links when theory moves later", () => {
  const stale = { generatedAfterTheory: true, theoryItemId: 4, theoryItemKey: "old-theory", exercise: { prompt: "Generate" } };
  const relinked = attachPrecedingTheoryReference(stale, 3, [
    { id: 5, kind: "THEORY", order: 1, contentKey: "new-theory" },
  ], true);
  assert.equal(relinked.theoryItemId, 5);
  assert.equal(relinked.theoryItemKey, "new-theory");

  const unlinked = attachPrecedingTheoryReference(stale, 0, [
    { id: 5, kind: "THEORY", order: 1, contentKey: "new-theory" },
  ], true);
  assert.equal("theoryItemId" in unlinked, false);
  assert.equal(unlinked.generatedAfterTheory, true);
});
