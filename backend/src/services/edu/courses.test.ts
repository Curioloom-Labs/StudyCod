import test from "node:test";
import assert from "node:assert/strict";
import { isCourseItemKind, normalizeCourseLanguage, normalizeCourseStatus } from "./courses";

test("isCourseItemKind accepts the fixed kinds, rejects others", () => {
  for (const k of ["THEORY", "PAGE", "CODE_TASK", "WEB_TASK", "QUIZ", "MANUAL"]) {
    assert.equal(isCourseItemKind(k), true, k);
  }
  assert.equal(isCourseItemKind("FORUM"), false);
  assert.equal(isCourseItemKind("code_task"), false, "case-sensitive");
  assert.equal(isCourseItemKind(undefined), false);
});

test("normalizeCourseLanguage uppercases known langs, defaults to PYTHON", () => {
  assert.equal(normalizeCourseLanguage("java"), "JAVA");
  assert.equal(normalizeCourseLanguage("CPP"), "CPP");
  assert.equal(normalizeCourseLanguage("python"), "PYTHON");
  assert.equal(normalizeCourseLanguage("rust"), "PYTHON");
  assert.equal(normalizeCourseLanguage(undefined), "PYTHON");
});

test("normalizeCourseStatus only yields PUBLISHED for the exact value", () => {
  assert.equal(normalizeCourseStatus("PUBLISHED"), "PUBLISHED");
  assert.equal(normalizeCourseStatus("DRAFT"), "DRAFT");
  assert.equal(normalizeCourseStatus("published"), "DRAFT");
  assert.equal(normalizeCourseStatus(undefined), "DRAFT");
});
