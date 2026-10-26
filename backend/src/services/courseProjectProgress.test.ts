import assert from "node:assert/strict";
import test from "node:test";
import type { CourseProjectProgressData } from "../entities/CourseItemProgress";
import { applyCourseProjectCheckData } from "./courseProjectProgress";

test("checking a completed course project preserves its submitted snapshot and completion data", () => {
  const submitted: CourseProjectProgressData = {
    milestoneIds: ["core", "tests"],
    draft: "original solution",
    files: [{ path: "main.py", content: "original solution" }],
    lastCheck: { score: 100, verdict: "AC", testsPassed: 8, testsTotal: 8, checkedAt: "2026-01-01T00:00:00.000Z", filesHash: "original-hash" },
    status: "SUBMITTED",
    submittedAt: "2026-01-01T00:00:00.000Z",
  };
  const next = applyCourseProjectCheckData(
    submitted,
    [{ path: "main.py", content: "new draft" }],
    "main.py",
    { score: 40, verdict: "WA", testsPassed: 2, testsTotal: 8, checkedAt: "2026-02-01T00:00:00.000Z", filesHash: "new-hash" },
  );
  assert.equal(next.status, "SUBMITTED");
  assert.equal(next.submittedAt, submitted.submittedAt);
  assert.equal(next.draft, "new draft");
  assert.equal(next.lastCheck?.score, 40);
  assert.equal(next.submissionHistory?.length, 1);
  assert.equal(next.submissionHistory?.[0].draft, "original solution");
  assert.equal(next.submissionHistory?.[0].lastCheck?.filesHash, "original-hash");
  assert.equal(submitted.files?.[0].content, "original solution", "the historical object is not mutated");
});

test("a not-yet-submitted project remains a draft after its first check", () => {
  const draft: CourseProjectProgressData = { milestoneIds: [], draft: "", status: "DRAFT", submittedAt: null };
  const next = applyCourseProjectCheckData(draft, [{ path: "main.py", content: "starter" }], "main.py", {
    score: 0, verdict: "WA", testsPassed: 0, testsTotal: 1, checkedAt: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(next.status, "DRAFT");
  assert.equal(next.submissionHistory?.length, 0);
});
