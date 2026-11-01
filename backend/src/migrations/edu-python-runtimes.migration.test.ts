import test from "node:test";
import assert from "node:assert/strict";
import { AddEduPythonRuntimes1794600000000 } from "./1794600000000-AddEduPythonRuntimes";

test("EDU Python runtime migration adds the profile and asset columns", async () => {
  const migration = new AddEduPythonRuntimes1794600000000();
  const statements: string[] = [];

  await migration.up({
    hasTable: async () => true,
    hasColumn: async () => false,
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);

  assert.deepEqual(statements, [
    "ALTER TABLE `edu_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'",
    "ALTER TABLE `topic_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'",
    "ALTER TABLE `test_data` ADD `assets` longtext NULL",
  ]);
});

test("EDU Python runtime migration tolerates synchronized, partial, or absent tables", async () => {
  const migration = new AddEduPythonRuntimes1794600000000();
  const statements: string[] = [];

  await migration.up({
    hasTable: async () => true,
    hasColumn: async (table: string, column: string) =>
      (table === "edu_tasks" && column === "python_runtime_profile") ||
      (table === "test_data" && column === "assets"),
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);
  assert.deepEqual(statements, [
    "ALTER TABLE `topic_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'",
  ]);

  await migration.up({
    hasTable: async () => false,
    hasColumn: async () => false,
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);
  assert.equal(statements.length, 1);
});

test("EDU Python runtime migration rollback drops only existing columns", async () => {
  const migration = new AddEduPythonRuntimes1794600000000();
  const statements: string[] = [];

  await migration.down({
    hasTable: async () => true,
    hasColumn: async (_table: string, column: string) => column !== "assets",
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any);

  assert.deepEqual(statements, [
    "ALTER TABLE `topic_tasks` DROP COLUMN `python_runtime_profile`",
    "ALTER TABLE `edu_tasks` DROP COLUMN `python_runtime_profile`",
  ]);
});
