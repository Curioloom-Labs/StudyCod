import assert from "node:assert/strict";
import test from "node:test";
import {
  localizeCourseItem,
  localizedCourseDescription,
  localizedCourseTitle,
  localizedModuleTitle,
} from "./curriculumLocalization";

test("Ukrainian Course Studio overrides remain visible without replacing English catalog metadata", () => {
  const authored = {
    catalogKey: "olympiad-python",
    title: "Edited course title",
    description: "Edited course description",
    authoringOverrides: { title: true, description: true },
  };

  assert.equal(localizedCourseTitle(authored, "uk"), "Edited course title");
  assert.equal(localizedCourseDescription(authored, "uk"), "Edited course description");
  assert.notEqual(localizedCourseTitle(authored, "en"), "Edited course title");
  assert.notEqual(localizedCourseDescription(authored, "en"), "Edited course description");
});

test("Ukrainian module title edits do not replace the English module translation", () => {
  const key = "olympiad-python.module.4";
  const authoredTitle = "Edited prefix-sums module";

  assert.equal(localizedModuleTitle(key, "uk", authoredTitle), authoredTitle);
  assert.notEqual(localizedModuleTitle(key, "en", authoredTitle), authoredTitle);
});

test("Ukrainian theory edits remain local while English continues to use its authored translation", () => {
  const result = localizeCourseItem({
    contentKey: "olympiad-python.maximum-subarray.theory",
    title: "Edited lesson title",
    content: { markdown: "Українська авторська теорія" },
  }, "en");

  assert.notEqual(result.title, "Edited lesson title");
  assert.notEqual(result.content?.markdown, "Українська авторська теорія");
  const ukrainian = localizeCourseItem({
    contentKey: "olympiad-python.maximum-subarray.theory",
    title: "Edited lesson title",
    content: { markdown: "Українська авторська теорія" },
  }, "uk");
  assert.equal(ukrainian.title, "Edited lesson title");
  assert.equal(ukrainian.content?.markdown, "Українська авторська теорія");
});

test("English task localization keeps the generated contract while using its translated learner prompt", () => {
  const marker = "English learner sees authored markdown";
  const result = localizeCourseItem({
    contentKey: "olympiad-python.maximum-subarray.practice-2",
    title: "Edited EDGE_CASES practice",
    content: {
      exercise: {
        prompt: marker,
        learningContract: { kind: "OLYMPIAD_ALGORITHMIC_PRACTICE", stage: "EDGE_CASES", objective: "Authored edge cases" },
      },
    },
  }, "en");

  assert.notEqual(result.title, "Edited EDGE_CASES practice");
  assert.notEqual((result.content?.exercise as Record<string, unknown>).prompt, marker);
  assert.equal(((result.content?.exercise as Record<string, any>).learningContract).stage, "EDGE_CASES");
});
