import test from "node:test";
import assert from "node:assert/strict";
import { CreatePortfolioFoundation1793200000000 } from "./1793200000000-CreatePortfolioFoundation";

test("Portfolio schema rollback refuses to drop user data", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
      return sql.includes("portfolio_works") ? [{ row_count: "1" }] : [{ row_count: "0" }];
    },
  } as any;
  await assert.rejects(() => new CreatePortfolioFoundation1793200000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.startsWith("DROP TABLE")), false);
});

test("empty Portfolio schema can roll back cleanly", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new CreatePortfolioFoundation1793200000000().down(queryRunner);
  assert.deepEqual(statements.filter(sql => sql.startsWith("DROP TABLE")), [
    "DROP TABLE portfolio_works",
    "DROP TABLE portfolio_profiles",
  ]);
});
