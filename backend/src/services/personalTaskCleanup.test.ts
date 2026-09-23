import test from "node:test";
import assert from "node:assert/strict";
import { resolvePersonalTaskCleanupPassGrade } from "./personalTaskCleanup";

test("personal task test data is retained until full score by default", () => {
  assert.equal(resolvePersonalTaskCleanupPassGrade(), 100);
});

test("personal task test cleanup still clamps an explicit threshold", () => {
  assert.equal(resolvePersonalTaskCleanupPassGrade(60), 60);
  assert.equal(resolvePersonalTaskCleanupPassGrade(120), 100);
});
