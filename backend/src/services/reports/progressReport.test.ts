import test from "node:test";
import assert from "node:assert/strict";
import { buildProgressReportModel, renderProgressReportHtml } from "./progressReport";

const at = new Date("2026-05-31T10:00:00.000Z");

test("aggregates mastered / in-progress / average", () => {
  const m = buildProgressReportModel({
    studentName: "Anna Ivanenko",
    className: "10-A",
    generatedAt: at,
    topics: [
      { title: "Variables", masteryPct: 1, status: "COMPLETED", practiceAverage: 95, controlGrade: 90 },
      { title: "Loops", masteryPct: 0.5, status: "IN_PROGRESS", practiceAverage: 50 },
      { title: "Arrays", masteryPct: 0, status: "NOT_STARTED" },
    ],
  });
  assert.equal(m.overall.totalTopics, 3);
  assert.equal(m.overall.masteredTopics, 1);
  assert.equal(m.overall.inProgressTopics, 1);
  assert.equal(m.overall.avgMasteryPct, 50); // (1 + .5 + 0)/3 = .5
});

test("clamps mastery and rounds grades", () => {
  const m = buildProgressReportModel({
    studentName: "X",
    generatedAt: at,
    topics: [{ title: "T", masteryPct: 1.7, practiceAverage: 88.6, controlGrade: null }],
  });
  assert.equal(m.topics[0].masteryPct, 1);
  assert.equal(m.topics[0].practiceAverage, 89);
  assert.equal(m.topics[0].controlGrade, null);
});

test("html is self-contained and escapes user content", () => {
  const m = buildProgressReportModel({
    studentName: "<script>x</script>",
    generatedAt: at,
    topics: [{ title: "A & B <hack>", masteryPct: 0.9 }],
  });
  const html = renderProgressReportHtml(m);
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /Звіт про прогрес/);
  assert.ok(!html.includes("<script>x</script>"), "must escape name");
  assert.match(html, /A &amp; B &lt;hack&gt;/);
});

test("empty topics renders gracefully", () => {
  const m = buildProgressReportModel({ studentName: "Y", generatedAt: at, topics: [] });
  const html = renderProgressReportHtml(m);
  assert.match(html, /Немає тем/);
  assert.equal(m.overall.avgMasteryPct, 0);
});
