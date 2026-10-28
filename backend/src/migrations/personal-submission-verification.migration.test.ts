import test from "node:test";
import assert from "node:assert/strict";
import { AddPersonalSubmissionVerification1793300000000 } from "./1793300000000-AddPersonalSubmissionVerification";

test("submission verification migration preserves existing test-count columns and adds only missing fields", async () => {
  const statements: string[] = [];
  const existingColumns = new Set(["tests_passed", "tests_total"]);
  const existingIndexes = new Set<string>();
  const queryRunner = {
    hasColumn: async (_table: string, name: string) => existingColumns.has(name),
    getTable: async () => ({ indices: [...existingIndexes].map(name => ({ name })) }),
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any;

  await new AddPersonalSubmissionVerification1793300000000().up(queryRunner);
  assert.deepEqual(statements, [
    "ALTER TABLE grades ADD COLUMN verification_method VARCHAR(24) NULL",
    "ALTER TABLE grades ADD COLUMN judge_verdict VARCHAR(8) NULL",
    "ALTER TABLE grades ADD KEY ix_grade_owner_verification (user_id,verification_method,judge_verdict,created_at)",
  ]);
  assert.doesNotMatch(statements.join("\n"), /\bUPDATE\s+grades\b/i);
});

test("submission verification migration is safe to retry after a partial DDL run", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasColumn: async () => true,
    getTable: async () => ({ indices: [{ name: "ix_grade_owner_verification" }] }),
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any;

  await new AddPersonalSubmissionVerification1793300000000().up(queryRunner);
  assert.deepEqual(statements, []);
});

test("submission verification rollback never drops possibly pre-existing grade columns", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await assert.rejects(
    () => new AddPersonalSubmissionVerification1793300000000().down(queryRunner),
    /Rollback blocked: this migration can reuse pre-existing grade columns/
  );
  assert.deepEqual(statements, []);
});
