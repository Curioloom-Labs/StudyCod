import assert from "node:assert/strict";
import test from "node:test";
import {
  assignmentSchema,
  createTaskSchema,
  createTopicSchema,
  generateTheorySchema,
  theoryContentSchema,
} from "./topicContracts";

test("topic contracts coerce bounded scalar route inputs", () => {
  const parsed = createTopicSchema.parse({
    title: "  Conditions  ",
    language: "PYTHON",
    classId: "42",
    order: "3",
  });

  assert.deepEqual(parsed, {
    title: "Conditions",
    language: "PYTHON",
    classId: 42,
    order: 3,
  });
});

test("topic contracts reject malformed authoring payloads", () => {
  assert.equal(createTaskSchema.safeParse({ type: "PRACTICE", title: "" }).success, false);
  assert.equal(theoryContentSchema.safeParse({ content: 123 }).success, false);
  assert.equal(generateTheorySchema.safeParse({ taskType: "PRACTICE" }).success, false);
});

test("assignment contract preserves student selection for downstream validation", () => {
  const parsed = assignmentSchema.parse({ deadline: "2030-01-02T10:00:00.000Z", studentIds: [1, "2"] });
  assert.equal(parsed.deadline, "2030-01-02T10:00:00.000Z");
  assert.deepEqual(parsed.studentIds, [1, "2"]);
});
