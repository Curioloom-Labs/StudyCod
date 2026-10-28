import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioAvatarVisibility1793900000000 } from "./1793900000000-AddPortfolioAvatarVisibility";

test("Portfolio avatar visibility defaults to private", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioAvatarVisibility1793900000000().up(queryRunner);
  assert.deepEqual(statements, [
    "ALTER TABLE portfolio_profiles ADD COLUMN share_avatar TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility",
  ]);
});

test("avatar visibility rollback refuses to discard an owner's sharing choice", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "1" }]; } } as any;
  await assert.rejects(() => new AddPortfolioAvatarVisibility1793900000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("avatar visibility rollback removes only a column with no explicit shares", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPortfolioAvatarVisibility1793900000000().down(queryRunner);
  assert.equal(statements[statements.length - 1], "ALTER TABLE portfolio_profiles DROP COLUMN share_avatar");
});
