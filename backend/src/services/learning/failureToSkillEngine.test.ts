import assert from "node:assert/strict";
import test from "node:test";
import { deriveSkillEvidence, recordLearningEvent, recordLearningOutcome, type LearningRepositories } from "./failureToSkillEngine";
import { LearningAttempt } from "../../entities/LearningAttempt";
import { LearningEvent } from "../../entities/LearningEvent";

function fakeRepositories(): LearningRepositories & { attemptsRows: LearningAttempt[]; eventsRows: LearningEvent[] } {
  const attemptsRows: LearningAttempt[] = [];
  const eventsRows: LearningEvent[] = [];
  let nextAttemptId = 1;
  let nextEventId = 1;
  const attempts = {
    create(value: Partial<LearningAttempt>) { return Object.assign(new LearningAttempt(), value); },
    async find(options: any) {
      return attemptsRows.filter((row) => Object.entries(options.where ?? {}).every(([key, value]) => (row as any)[key] === value));
    },
    async findOne(options: any) {
      return attemptsRows.find((row) => Object.entries(options.where ?? {}).every(([key, value]) => (row as any)[key] === value)) ?? null;
    },
    async save(value: LearningAttempt) {
      if (!value.id) value.id = nextAttemptId++;
      if (!value.createdAt) value.createdAt = new Date(Date.now() + value.id);
      if (!value.updatedAt) value.updatedAt = value.createdAt;
      const index = attemptsRows.findIndex((row) => row.id === value.id);
      if (index >= 0) attemptsRows[index] = value;
      else attemptsRows.push(value);
      return value;
    },
  } as any;
  const events = {
    create(value: Partial<LearningEvent>) { return Object.assign(new LearningEvent(), value); },
    async findOne(options: any) {
      return eventsRows.find((row) => Object.entries(options.where ?? {}).every(([key, value]) => (row as any)[key] === value)) ?? null;
    },
    async save(value: LearningEvent) {
      if (eventsRows.some((row) => row.dedupeKey === value.dedupeKey)) throw new Error("duplicate");
      value.id = nextEventId++;
      value.createdAt = new Date(Date.now() + value.id);
      eventsRows.push(value);
      return value;
    },
  } as any;
  return { attempts, events, attemptsRows, eventsRows };
}

test("records a failed learning attempt with category and first failed test", async () => {
  const repos = fakeRepositories();
  const result = await recordLearningOutcome({
    principalType: "USER",
    principalId: 7,
    taskKind: "LIBRARY",
    taskId: 42,
    topicLabel: "Loops",
    outcome: "FAILED",
    failureCategory: "off_by_one",
    firstFailedTestId: 3,
    submissionId: "submission-1",
  }, repos);

  assert.equal(result.attempt.outcome, "FAILED");
  assert.equal(result.attempt.failureCategory, "off_by_one");
  assert.equal(result.attempt.firstFailedTestId, 3);
  assert.equal(repos.eventsRows[0]?.eventType, "coding_attempt_failed");
});

test("records a successful retry and derives evidence after failure", async () => {
  const repos = fakeRepositories();
  await recordLearningOutcome({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, topicLabel: "Loops", outcome: "FAILED", failureCategory: "logic" }, repos);
  const solved = await recordLearningOutcome({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, topicLabel: "Loops", outcome: "SOLVED" }, repos);

  assert.equal(solved.solvedAfterFailure, true);
  assert.equal(repos.eventsRows.filter((event) => event.eventType === "solved_after_failure").length, 1);
  const evidence = deriveSkillEvidence(repos.attemptsRows);
  assert.equal(evidence.solvedAfterFailure, 1);
  assert.deepEqual(evidence.overcomeCategories, [{ name: "logic", tasks: 1 }]);
  assert.equal(evidence.topics[0]?.improving, true);
  assert.equal(evidence.recentSkills[0]?.outcome, "Evidence collected");
});

test("deduplicates hint events and keeps the highest shown level", async () => {
  const repos = fakeRepositories();
  const failed = await recordLearningOutcome({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, outcome: "FAILED", failureCategory: "runtime" }, repos);
  await recordLearningEvent({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, learningAttemptId: failed.attempt.id, eventType: "hint_viewed", hintLevel: 1, dedupeKey: "hint-1" }, repos);
  await recordLearningEvent({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, learningAttemptId: failed.attempt.id, eventType: "hint_viewed", hintLevel: 1, dedupeKey: "hint-1" }, repos);
  await recordLearningEvent({ principalType: "USER", principalId: 7, taskKind: "LIBRARY", taskId: 42, learningAttemptId: failed.attempt.id, eventType: "hint_viewed", hintLevel: 3, dedupeKey: "hint-3" }, repos);

  assert.equal(repos.eventsRows.filter((event) => event.eventType === "hint_viewed").length, 2);
  assert.equal(repos.attemptsRows[0]?.highestHintLevelShown, 3);
});

test("returns empty evidence for a legacy user without learning history", () => {
  const evidence = deriveSkillEvidence([]);
  assert.equal(evidence.practicedTasks, 0);
  assert.equal(evidence.solvedTasks, 0);
  assert.deepEqual(evidence.topics, []);
  assert.deepEqual(evidence.recentSkills, []);
});
