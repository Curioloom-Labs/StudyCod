import test from "node:test";
import assert from "node:assert/strict";
import { CreatePortfolioEvidence1793400000000 } from "./1793400000000-CreatePortfolioEvidence";

test("Skill Evidence schema rollback refuses to drop selected records", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: "1" }];
    },
  } as any;
  await assert.rejects(() => new CreatePortfolioEvidence1793400000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.startsWith("DROP TABLE")), false);
});

test("empty Skill Evidence schema can roll back cleanly", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new CreatePortfolioEvidence1793400000000().down(queryRunner);
  assert.deepEqual(statements, [
    "SELECT COUNT(*) AS row_count FROM portfolio_evidence",
    "DROP TABLE portfolio_evidence",
  ]);
});
