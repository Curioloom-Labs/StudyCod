import test from "node:test";
import assert from "node:assert/strict";
import { calculateEduTestScores } from "./testScoring";
import { TestData } from "../../entities/TestData";

test("percentage-weighted subtasks preserve absolute and partial grading on a 100-point maximum", () => {
  const tests = [
    { id: 1, points: 1, isHidden: true, subtask: "Basic", subtaskScoringMode: "PARTIAL", subtaskWeightPercent: 40 },
    { id: 2, points: 1, isHidden: true, subtask: "Basic", subtaskScoringMode: "PARTIAL", subtaskWeightPercent: 40 },
    { id: 3, points: 1, isHidden: true, subtask: "Advanced", subtaskScoringMode: "ABSOLUTE", subtaskWeightPercent: 60 },
    { id: 4, points: 1, isHidden: true, subtask: "Advanced", subtaskScoringMode: "ABSOLUTE", subtaskWeightPercent: 60 },
  ] as TestData[];

  const partial = calculateEduTestScores(tests, new Set(["1", "3"]));
  assert.equal(partial.maxScore, 10_000);
  assert.equal(partial.score, 2_000);
  assert.deepEqual(partial.groupScores.map(group => [group.group, group.score, group.maxScore]), [
    ["Basic", 2_000, 4_000],
    ["Advanced", 0, 6_000],
  ]);

  const complete = calculateEduTestScores(tests, new Set(["1", "2", "3", "4"]));
  assert.equal(complete.score, complete.maxScore);
});

test("legacy tests without subtask weights keep their existing point scoring", () => {
  const result = calculateEduTestScores([
    { id: 1, points: 2, isHidden: false, subtask: null, subtaskScoringMode: "ABSOLUTE", subtaskWeightPercent: null },
    { id: 2, points: 3, isHidden: true, subtask: null, subtaskScoringMode: "ABSOLUTE", subtaskWeightPercent: null },
  ] as TestData[], new Set(["1"]));
  assert.equal(result.score, 2);
  assert.equal(result.maxScore, 5);
});
