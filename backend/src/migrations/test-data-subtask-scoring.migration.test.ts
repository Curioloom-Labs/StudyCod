import test from "node:test";
import assert from "node:assert/strict";
import { AddTestDataSubtaskScoring1794500000000 } from "./1794500000000-AddTestDataSubtaskScoring";

test("subtask scoring migration adds mode and optional maximum-score percentage", async () => {
  const migration = new AddTestDataSubtaskScoring1794500000000();
  const statements: string[] = [];

  await migration.up({
    hasTable: async () => true,
    hasColumn: async (_table: string, column: string) => column === "subtask_scoring_mode",
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);

  assert.deepEqual(statements, [
    "ALTER TABLE `test_data` ADD COLUMN `subtask_weight_percent` INT NULL AFTER `subtask_scoring_mode`",
  ]);
});

test("subtask scoring migration safely adds missing columns and is idempotent", async () => {
  const migration = new AddTestDataSubtaskScoring1794500000000();
  const statements: string[] = [];

  await migration.up({
    hasTable: async () => true,
    hasColumn: async () => false,
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);
  await migration.up({
    hasTable: async () => true,
    hasColumn: async () => true,
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);
  await migration.up({ hasTable: async () => false, query: async (sql: string) => { statements.push(sql); return []; } } as any);

  assert.equal(statements.length, 2);
  assert.match(statements[0], /subtask_scoring_mode/);
  assert.match(statements[1], /subtask_weight_percent/);
});
