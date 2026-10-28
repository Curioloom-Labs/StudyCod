import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioProfileTechnologies1793800000000 } from "./1793800000000-AddPortfolioProfileTechnologies";

test("profile technologies migration is additive", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioProfileTechnologies1793800000000().up(queryRunner);
  assert.deepEqual(statements, [
    "ALTER TABLE portfolio_profiles ADD COLUMN technologies_json TEXT NULL AFTER specialization",
  ]);
});

test("profile technologies rollback refuses to discard configured profile stacks", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: "1" }];
    },
  } as any;
  await assert.rejects(() => new AddPortfolioProfileTechnologies1793800000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("profile technologies rollback removes only an unconfigured column", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: "0" }];
    },
  } as any;
  await new AddPortfolioProfileTechnologies1793800000000().down(queryRunner);
  assert.equal(statements[statements.length - 1], "ALTER TABLE portfolio_profiles DROP COLUMN technologies_json");
});
