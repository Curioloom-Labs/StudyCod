import test from "node:test";
import assert from "node:assert/strict";
import { dynamicOlympiadPracticeMetadata, isDynamicOlympiadPracticeTask, validateGeneratedPracticeSet } from "./generatedPractice";

const validTask = {
  type: "TOPIC" as const,
  taskMode: "CODE" as const,
  courseEnrollmentId: 9,
  courseItem: {
    content: {
      exercise: {
        learningContract: {
          kind: "OLYMPIAD_ALGORITHMIC_PRACTICE",
          version: 3,
          courseKey: "olympiad-python",
          topicKey: "prefix-sums",
        },
      },
    },
  },
};

test("only dynamic Olympiad course practice is accepted for a training contest", () => {
  assert.equal(isDynamicOlympiadPracticeTask(validTask), true);
  assert.deepEqual(dynamicOlympiadPracticeMetadata(validTask), { courseKey: "olympiad-python", topicKey: "prefix-sums" });
  assert.equal(isDynamicOlympiadPracticeTask({ ...validTask, courseEnrollmentId: null }), false);
  assert.equal(isDynamicOlympiadPracticeTask({ ...validTask, type: "INTRO" }), false);
  assert.equal(isDynamicOlympiadPracticeTask({ ...validTask, taskMode: "WEB" }), false);
  assert.equal(isDynamicOlympiadPracticeTask({
    ...validTask,
    courseItem: { content: { exercise: { learningContract: { ...validTask.courseItem.content.exercise.learningContract, kind: "DETERMINISTIC" } } } },
  }), false);
});

test("generated contest sets enforce the requested topic shape and shared course runtime", () => {
  const prefix = { courseKey: "olympiad-python", topicKey: "prefix-sums", runtime: "PYTHON" };
  const search = { courseKey: "olympiad-python", topicKey: "binary-search", runtime: "PYTHON" };
  assert.equal(validateGeneratedPracticeSet("THEMATIC", [prefix, { ...prefix }]), null);
  assert.equal(validateGeneratedPracticeSet("THEMATIC", [prefix, search]), "GENERATED_SET_TOPIC_MISMATCH");
  assert.equal(validateGeneratedPracticeSet("MIXED", [prefix, { ...prefix }]), "GENERATED_SET_NEEDS_MULTIPLE_TOPICS");
  assert.equal(validateGeneratedPracticeSet("MIXED", [prefix, search]), null);
  assert.equal(validateGeneratedPracticeSet("MIXED", [prefix, { ...search, runtime: "CPP" }]), "GENERATED_SET_RUNTIME_MISMATCH");
  assert.equal(validateGeneratedPracticeSet("MIXED", [prefix, { ...search, courseKey: "olympiad-java" }]), "GENERATED_SET_COURSE_MISMATCH");
  assert.equal(validateGeneratedPracticeSet("MIXED", [prefix]), "GENERATED_SET_SIZE_INVALID");
});
