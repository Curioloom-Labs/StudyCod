import test from "node:test";
import assert from "node:assert/strict";
import { buildSkillTree, type SkillTopicInput } from "./skillTree";

const topics: SkillTopicInput[] = [
  { id: 1, title: "Variables", order: 0, masteryPct: 1 },
  { id: 2, title: "Loops", order: 1, prerequisites: [1], masteryPct: 0.5, started: true },
  { id: 3, title: "Arrays", order: 2, prerequisites: [2], masteryPct: 0 },
  { id: 4, title: "Dicts", order: 3, prerequisites: [3], masteryPct: 0 },
];

test("classifies mastered / in_progress / locked", () => {
  const tree = buildSkillTree(topics);
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  assert.equal(byId.get(1)!.status, "mastered");
  assert.equal(byId.get(2)!.status, "in_progress"); // unlocked (1 mastered), started
  assert.equal(byId.get(3)!.status, "locked"); // prereq 2 not mastered
  assert.equal(byId.get(4)!.status, "locked");
});

test("available when unlocked but not started", () => {
  const tree = buildSkillTree([
    { id: 1, title: "A", order: 0, masteryPct: 1 },
    { id: 2, title: "B", order: 1, prerequisites: [1], masteryPct: 0, started: false },
  ]);
  assert.equal(tree.nodes.find((n) => n.id === 2)!.status, "available");
});

test("recommends the first in-progress, else first available", () => {
  const tree = buildSkillTree(topics);
  assert.equal(tree.nextNodeId, 2);
  assert.equal(tree.nodes.find((n) => n.id === 2)!.isNext, true);

  const allMasteredButLast = buildSkillTree([
    { id: 1, title: "A", order: 0, masteryPct: 1 },
    { id: 2, title: "B", order: 1, prerequisites: [1], masteryPct: 0 },
  ]);
  assert.equal(allMasteredButLast.nextNodeId, 2); // available
});

test("edges mirror prerequisites", () => {
  const tree = buildSkillTree(topics);
  assert.deepEqual(
    tree.edges.sort((a, b) => a.to - b.to),
    [
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 4 },
    ]
  );
});
