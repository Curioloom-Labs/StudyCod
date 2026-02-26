import test from "node:test";
import assert from "node:assert/strict";
import { getBirthdayMatchParams, isLeapYear } from "./birthdayGreetingService";

test("isLeapYear: basic cases", () => {
  assert.equal(isLeapYear(2024), true);
  assert.equal(isLeapYear(2025), false);
  assert.equal(isLeapYear(1900), false);
  assert.equal(isLeapYear(2000), true);
});

test("getBirthdayMatchParams: normal date matches single day", () => {
  const d = new Date("2026-03-10T12:00:00.000Z");
  const { month, days } = getBirthdayMatchParams(d);
  assert.equal(month, 3);
  assert.deepEqual(days, [10]);
});

test("getBirthdayMatchParams: Feb 28 in non-leap year includes Feb 29 birthdays", () => {
  const d = new Date("2026-02-28T12:00:00.000Z"); // 2026 is not leap
  const { month, days } = getBirthdayMatchParams(d);
  assert.equal(month, 2);
  assert.deepEqual(days.sort((a, b) => a - b), [28, 29]);
});

test("getBirthdayMatchParams: Feb 28 in leap year does not include Feb 29", () => {
  const d = new Date("2024-02-28T12:00:00.000Z"); // leap year
  const { month, days } = getBirthdayMatchParams(d);
  assert.equal(month, 2);
  assert.deepEqual(days, [28]);
});

test("getBirthdayMatchParams: Feb 29 in leap year matches Feb 29", () => {
  const d = new Date("2024-02-29T12:00:00.000Z");
  const { month, days } = getBirthdayMatchParams(d);
  assert.equal(month, 2);
  assert.deepEqual(days, [29]);
});
