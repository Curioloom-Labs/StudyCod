import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewUserPrompt, normalizeReviewResult } from "./aiCodeReview";

test("buildReviewUserPrompt numbers lines and includes language + task context", () => {
  const p = buildReviewUserPrompt("a=1\nb=2", "PYTHON", "Sum two numbers");
  assert.match(p, /Python/);
  assert.match(p, /Sum two numbers/);
  assert.match(p, /1: a=1/);
  assert.match(p, /2: b=2/);
});

test("normalizeReviewResult clamps lines, defaults severity, drops empty, caps count", () => {
  const r = normalizeReviewResult({
    summary: "  ok  ",
    comments: [
      { line: 2, severity: "warning", message: "bug here" },
      { line: 999, severity: "error", message: "out of range line -> null" },
      { line: 1, severity: "nonsense", message: "bad severity -> suggestion" },
      { line: 3, severity: "info", message: "   " },          // empty -> dropped
      { severity: "info", message: "general comment" }          // no line -> null
    ]
  }, 5);
  assert.equal(r.summary, "ok");
  assert.equal(r.comments.length, 4, "empty-message comment dropped");
  // sorted by line, nulls last
  assert.deepEqual(r.comments.map(c => c.line), [1, 2, null, null]);
  assert.equal(r.comments.find(c => c.line === 1)!.severity, "suggestion", "unknown severity -> suggestion");
  assert.equal(r.comments.find(c => c.severity === "error")!.line, null, "999 > lineCount -> null");
});

test("normalizeReviewResult tolerates junk", () => {
  assert.deepEqual(normalizeReviewResult(null, 10), { summary: "", comments: [] });
  assert.deepEqual(normalizeReviewResult({ comments: "x" }, 10), { summary: "", comments: [] });
});
