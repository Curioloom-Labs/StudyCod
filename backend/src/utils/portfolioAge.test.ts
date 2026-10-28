import test from "node:test";
import assert from "node:assert/strict";
import { parsePortfolioBirthDate, portfolioSharingAgeStatus, privatePortfolioBirthDate } from "./portfolioAge";

const today = new Date("2026-10-28T12:00:00.000Z");

test("Portfolio age status is private-share eligible only on or after the eighteenth birthday", () => {
  assert.equal(portfolioSharingAgeStatus({ birthDay: 28, birthMonth: 10, birthYear: 2008 }, today), "ADULT");
  assert.equal(portfolioSharingAgeStatus({ birthDay: 29, birthMonth: 10, birthYear: 2008 }, today), "UNDER_18");
  assert.equal(portfolioSharingAgeStatus({ birthDay: 29, birthMonth: 10, birthYear: 2012 }, today), "UNDER_18");
});

test("Portfolio age gate fails closed for missing, malformed, or future birth dates", () => {
  assert.equal(portfolioSharingAgeStatus({ birthDay: 1, birthMonth: 1, birthYear: null }, today), "UNKNOWN");
  assert.equal(portfolioSharingAgeStatus({ birthDay: 31, birthMonth: 2, birthYear: 2000 }, today), "UNKNOWN");
  assert.equal(portfolioSharingAgeStatus({ birthDay: 29, birthMonth: 2, birthYear: 2028 }, today), "UNKNOWN");
  assert.equal(parsePortfolioBirthDate("2009-02-29", today), null);
  assert.equal(parsePortfolioBirthDate("2026-10-29", today), null);
});

test("private Portfolio date codec preserves a valid birthday without timezone conversion", () => {
  const parsed = parsePortfolioBirthDate("2000-02-29", today);
  assert.deepEqual(parsed, { birthDay: 29, birthMonth: 2, birthYear: 2000, isoDate: "2000-02-29" });
  assert.equal(privatePortfolioBirthDate(parsed!), "2000-02-29");
  assert.equal(portfolioSharingAgeStatus({ birthDay: 29, birthMonth: 2, birthYear: 2000 }, new Date("2018-02-28T12:00:00.000Z")), "UNDER_18");
});
