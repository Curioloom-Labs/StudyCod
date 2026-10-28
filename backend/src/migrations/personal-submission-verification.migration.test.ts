import test from "node:test";
import assert from "node:assert/strict";
import { AddPersonalSubmissionVerification1793300000000 } from "./1793300000000-AddPersonalSubmissionVerification";

test("submission verification migration adds nullable facts without guessing legacy provenance", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPersonalSubmissionVerification1793300000000().up(queryRunner);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /ADD COLUMN verification_method VARCHAR\(24\) NULL/);
  assert.match(statements[0], /ADD COLUMN judge_verdict VARCHAR\(8\) NULL/);
  assert.match(statements[0], /ADD COLUMN tests_passed INT NULL/);
  assert.match(statements[0], /ADD COLUMN tests_total INT NULL/);
  assert.doesNotMatch(statements[0], /\bUPDATE\s+grades\b/i);
});

test("submission verification rollback refuses to remove saved Judge facts", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "2" }]; } } as any;
  await assert.rejects(() => new AddPersonalSubmissionVerification1793300000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.startsWith("ALTER TABLE grades DROP")), false);
});

test("empty submission verification columns can roll back cleanly", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPersonalSubmissionVerification1793300000000().down(queryRunner);
  assert.equal(statements[1], "ALTER TABLE grades DROP INDEX ix_grade_owner_verification,\n      DROP COLUMN verification_method,DROP COLUMN judge_verdict,DROP COLUMN tests_passed,DROP COLUMN tests_total");
});
