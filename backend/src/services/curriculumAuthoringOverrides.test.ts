import assert from "node:assert/strict";
import test from "node:test";
import {
  hasCurriculumAuthoringOverrides,
  markCurriculumAuthoringOverrides,
  mergeCurriculumSourceFields,
} from "./curriculumAuthoringOverrides";

test("source sync keeps only the fields an author explicitly edited", () => {
  const dynamicPractice = { generatedAfterTheory: true, exercise: { prompt: "Generate a new task", learningContract: { topicKey: "prefix-sums" } } };
  const current: { title: string; description: string; status: string; content: unknown } = { title: "Authored title", description: "Old description", status: "PUBLISHED", content: dynamicPractice };
  const incoming: Partial<typeof current> = { title: "Source title", description: "New description", status: "DRAFT", content: { description: "New source prompt" } };

  assert.deepEqual(
    mergeCurriculumSourceFields(current, incoming, { title: true, content: true }),
    { title: "Authored title", description: "New description", status: "DRAFT", content: dynamicPractice },
  );
  assert.equal(mergeCurriculumSourceFields({ order: 8 }, { order: 2 }, { order: true }).order, 8);
  assert.equal(mergeCurriculumSourceFields({ order: 8 }, { order: 2 }, {}).order, 2);
});

test("source override markers accumulate and identify author-created rows", () => {
  const overrides = markCurriculumAuthoringOverrides({ title: true }, ["order", "content"], true);

  assert.deepEqual(overrides, { title: true, order: true, content: true, created: true });
  assert.equal(hasCurriculumAuthoringOverrides(overrides), true);
  assert.equal(hasCurriculumAuthoringOverrides(null), false);
  assert.deepEqual(markCurriculumAuthoringOverrides(["invalid"], [], false), {});
});
