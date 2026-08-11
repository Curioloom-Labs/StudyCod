import test from "node:test";
import assert from "node:assert/strict";
import {
  getIadCeilingForTopic,
  getIadDeltaByGrade,
  getIadTopicWeight,
} from "./difus";

test("IAD v2 gives materially less credit for introductory topics", () => {
  const firstTopic = getIadDeltaByGrade(100, { topicIndex: 0 });
  const laterTopic = getIadDeltaByGrade(100, { topicIndex: 10 });

  assert.ok(firstTopic > 0);
  assert.ok(firstTopic < 0.003);
  assert.ok(laterTopic > firstTopic * 4);
  assert.equal(getIadTopicWeight(0), 0.18);
  assert.equal(getIadTopicWeight(10), 0.82);
});

test("IAD v2 keeps early topics below an advanced-looking ceiling", () => {
  assert.equal(getIadCeilingForTopic(0), 0.025);
  assert.equal(getIadCeilingForTopic(2), 0.06);
  assert.equal(getIadCeilingForTopic(7), 0.24);
  assert.ok(getIadCeilingForTopic(2) < 0.196);
});

test("IAD v2 treats a merely good grade as weaker evidence than mastery", () => {
  const good = getIadDeltaByGrade(75, { topicIndex: 10 });
  const excellent = getIadDeltaByGrade(95, { topicIndex: 10 });
  assert.ok(good > 0);
  assert.ok(good < excellent);
});

