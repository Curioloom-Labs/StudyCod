import test from "node:test";
import assert from "node:assert/strict";
import { compareLibraryJudgeGroups, hasLibrarySubtasks, libraryTestGroup, normalizeLibraryGroupScores } from "./libraryTaskScoring";

test("library subtasks use explicit groups and deterministic fallback groups", () => {
  const tests = [
    { id: 1, isHidden: false, subtask: 1 },
    { id: 2, isHidden: true, subtask: 1 },
    { id: 3, isHidden: true, subtask: null },
  ];

  assert.equal(hasLibrarySubtasks(tests), true);
  assert.equal(libraryTestGroup(tests[0], true), "1");
  assert.equal(libraryTestGroup(tests[1], true), "1");
  assert.equal(libraryTestGroup(tests[2], true), "unassigned_3");
});

test("dependent library groups sort naturally and keep unassigned tests last", () => {
  const groups = ["10", "2", "unassigned_9", "1"].sort(compareLibraryJudgeGroups);
  assert.deepEqual(groups, ["1", "2", "10", "unassigned_9"]);
});

test("library tests without subtasks preserve public/hidden groups", () => {
  assert.equal(hasLibrarySubtasks([{ id: 1, isHidden: false }, { id: 2, isHidden: true }]), false);
  assert.equal(libraryTestGroup({ id: 1, isHidden: false }, false), "public");
  assert.equal(libraryTestGroup({ id: 2, isHidden: true }, false), "hidden");
});

test("worker group scores are normalized to the library API shape", () => {
  assert.deepEqual(
    normalizeLibraryGroupScores([
      { group: "1", score: 25, max_score: 50 },
      { group: "2", score: "bad", max_score: 50 },
    ]),
    [
      { group: "1", score: 25, maxScore: 50 },
      { group: "2", score: 0, maxScore: 50 },
    ],
  );
  assert.equal(normalizeLibraryGroupScores(null), null);
});
