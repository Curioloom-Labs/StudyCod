import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioSections1795400000000 } from "./1795400000000-AddPortfolioSections";

test("portfolio sections are added without rewriting existing profiles", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioSections1795400000000().up(queryRunner);
  assert.deepEqual(statements, ["ALTER TABLE portfolio_profiles ADD COLUMN content_json TEXT NULL AFTER share_avatar"]);
});

test("portfolio sections rollback protects saved content", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "2" }]; } } as any;
  await assert.rejects(() => new AddPortfolioSections1795400000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("portfolio sections rollback removes an unused column", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPortfolioSections1795400000000().down(queryRunner);
  assert.equal(statements[statements.length - 1], "ALTER TABLE portfolio_profiles DROP COLUMN content_json");
});
