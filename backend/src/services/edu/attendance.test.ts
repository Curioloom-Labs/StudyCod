import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAttendanceStatus, isValidDate, summarizeAttendance } from "./attendance";

test("normalizeAttendanceStatus accepts valid, rejects junk", () => {
  assert.equal(normalizeAttendanceStatus("PRESENT"), "PRESENT");
  assert.equal(normalizeAttendanceStatus("EXCUSED"), "EXCUSED");
  assert.equal(normalizeAttendanceStatus("present"), null, "case-sensitive");
  assert.equal(normalizeAttendanceStatus("HERE"), null);
  assert.equal(normalizeAttendanceStatus(undefined), null);
});

test("isValidDate requires YYYY-MM-DD", () => {
  assert.equal(isValidDate("2026-06-22"), true);
  assert.equal(isValidDate("2026-6-2"), false);
  assert.equal(isValidDate("22/06/2026"), false);
  assert.equal(isValidDate(""), false);
  assert.equal(isValidDate(20260622), false);
});

test("summarizeAttendance tallies per status", () => {
  const c = summarizeAttendance([
    { status: "PRESENT" }, { status: "PRESENT" }, { status: "ABSENT" }, { status: "LATE" }, { status: "EXCUSED" }
  ]);
  assert.deepEqual(c, { present: 2, absent: 1, late: 1, excused: 1, total: 5 });
});
