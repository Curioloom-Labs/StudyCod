import test from "node:test";
import assert from "node:assert/strict";
import { buildTutorContext, buildTutorPrompt, normalizeTutorAnswer } from "./aiTutor";

test("buildTutorContext summarizes recent work, handles empty", () => {
  assert.match(buildTutorContext([]), /немає історії/);
  const c = buildTutorContext([{ taskTitle: "Цикли", total: 80 }, { taskTitle: "Масиви", total: null }]);
  assert.match(c, /Цикли: 80\/100/);
  assert.match(c, /Масиви: без оцінки/);
});

test("buildTutorContext caps at 12 items", () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ taskTitle: `T${i}`, total: 50 }));
  const lines = buildTutorContext(items).split("\n").filter(l => l.startsWith("- "));
  assert.equal(lines.length, 12);
});

test("buildTutorPrompt includes question + context + JSON instruction", () => {
  const p = buildTutorPrompt("Як працює рекурсія?", "ctx-here");
  assert.match(p, /Як працює рекурсія\?/);
  assert.match(p, /ctx-here/);
  assert.match(p, /JSON/);
});

test("normalizeTutorAnswer trims, filters tips, tolerates junk", () => {
  const r = normalizeTutorAnswer({ answer: "  hi  ", tips: ["a", "", "  b  ", 3] });
  assert.equal(r.answer, "hi");
  assert.deepEqual(r.tips, ["a", "b", "3"]);
  assert.deepEqual(normalizeTutorAnswer(null), { answer: "", tips: [] });
  assert.deepEqual(normalizeTutorAnswer({ tips: "x" }), { answer: "", tips: [] });
});
