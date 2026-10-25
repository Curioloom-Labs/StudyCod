import assert from "node:assert/strict";
import test from "node:test";
import type { QueryRunner } from "typeorm";
import { PreserveCurriculumAuthoringOverrides1792700000000 } from "./1792700000000-PreserveCurriculumAuthoringOverrides";

function fakeQueryRunner(existingTables: string[] = ["courses", "course_modules", "course_items"]) {
  const tables = new Set(existingTables);
  const columns = new Map(existingTables.map((table) => [table, new Set<string>()]));
  const queries: string[] = [];
  const queryRunner = {
    hasTable: async (table: string) => tables.has(table),
    hasColumn: async (table: string, column: string) => columns.get(table)?.has(column) ?? false,
    query: async (sql: string) => {
      queries.push(sql);
      const add = sql.match(/^ALTER TABLE (\w+) ADD (\w+) TEXT NULL$/i);
      const drop = sql.match(/^ALTER TABLE (\w+) DROP COLUMN (\w+)$/i);
      if (add) columns.get(add[1])?.add(add[2]);
      if (drop) columns.get(drop[1])?.delete(drop[2]);
    },
  } as unknown as QueryRunner;
  return { queryRunner, columns, queries };
}

test("authoring override migration adds columns once and removes them on rollback", async () => {
  const migration = new PreserveCurriculumAuthoringOverrides1792700000000();
  const fixture = fakeQueryRunner();

  await migration.up(fixture.queryRunner);
  assert.deepEqual([...fixture.queries], [
    "ALTER TABLE courses ADD authoring_overrides TEXT NULL",
    "ALTER TABLE course_modules ADD authoring_overrides TEXT NULL",
    "ALTER TABLE course_items ADD authoring_overrides TEXT NULL",
  ]);
  assert.ok([...fixture.columns.values()].every((columns) => columns.has("authoring_overrides")));

  fixture.queries.length = 0;
  await migration.up(fixture.queryRunner);
  assert.deepEqual(fixture.queries, [], "re-running migration must be idempotent");

  await migration.down(fixture.queryRunner);
  assert.deepEqual(fixture.queries.slice(-3), [
    "ALTER TABLE course_items DROP COLUMN authoring_overrides",
    "ALTER TABLE course_modules DROP COLUMN authoring_overrides",
    "ALTER TABLE courses DROP COLUMN authoring_overrides",
  ]);
  assert.ok([...fixture.columns.values()].every((columns) => !columns.has("authoring_overrides")));
});

test("authoring override migration safely ignores absent curriculum tables", async () => {
  const fixture = fakeQueryRunner(["unrelated_table"]);
  await new PreserveCurriculumAuthoringOverrides1792700000000().up(fixture.queryRunner);
  assert.deepEqual(fixture.queries, []);
});
