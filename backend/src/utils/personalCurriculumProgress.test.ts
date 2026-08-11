import test from "node:test";
import assert from "node:assert/strict";
import {
  getPersonalThematicStartTopicIndex,
  getSequentialCompletedThematicTopicCount,
} from "./personalCurriculumProgress";

const topics = [0, 1, 2, 3, 4, 5].map((topicIndex) => ({ topicIndex }));

function counts(...completedTopicIndexes: number[]): Map<number, number> {
  return new Map(completedTopicIndexes.map((topicIndex) => [topicIndex, topicIndex === 0 ? 1 : 3]));
}

test("intro topic does not count as a completed thematic topic", () => {
  assert.equal(
    getSequentialCompletedThematicTopicCount({
      topics,
      countByTopicIndex: counts(0, 1, 2),
      baseStartTopicIndex: 0,
    }),
    2
  );
});

test("thematic milestones start with topic after intro", () => {
  const completed = getSequentialCompletedThematicTopicCount({
    topics,
    countByTopicIndex: counts(0, 1, 2, 3, 4, 5),
    baseStartTopicIndex: getPersonalThematicStartTopicIndex(-1),
  });

  assert.equal(completed, 5);
  assert.equal(getPersonalThematicStartTopicIndex(-1), 1);
  assert.equal(getPersonalThematicStartTopicIndex(0), 1);
  assert.equal(getPersonalThematicStartTopicIndex(4), 5);
});
