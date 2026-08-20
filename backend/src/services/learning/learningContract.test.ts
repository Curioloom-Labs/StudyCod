import assert from "node:assert/strict";
import test from "node:test";
import { buildPracticeContract, practiceStageFor, projectAssessmentContract } from "./learningContract";

test("practice stages progress from foundation to edge cases to transfer", () => {
  assert.equal(practiceStageFor(1, 3), "FOUNDATION");
  assert.equal(practiceStageFor(2, 3), "EDGE_CASES");
  assert.equal(practiceStageFor(3, 3), "TRANSFER");
  assert.equal(practiceStageFor(1, 1), "FOUNDATION");
});

test("practice contract is explicit and deterministic", () => {
  const contract = buildPracticeContract({
    courseKey: "python-core",
    topicKey: "loops",
    topicTitle: "Цикли",
    exerciseFocus: "Порахувати статистику набору даних у циклі.",
    sequence: 2,
    total: 3,
  });
  assert.equal(contract.version, 2);
  assert.equal(contract.stage, "EDGE_CASES");
  assert.ok(contract.taskIntent.includes("Цикли"));
  assert.ok(contract.evidence.length >= 3);
  assert.ok(contract.minimumExamples >= 5);
});

test("projects receive a separate assessment mode", () => {
  const contract = projectAssessmentContract({
    hasAuthoredTests: false,
    hasWebHarness: false,
    milestones: [{ id: "model", title: "Модель", description: "Опиши модель." }],
  });
  assert.equal(contract.mode, "STATIC_REVIEW");
  assert.equal(contract.checkBeforeSubmit, false);
  assert.equal(contract.requiredEvidence[0]?.id, "model");
});

