import test from "node:test";
import assert from "node:assert/strict";
import { CreatePortfolioSourcedEvidence1793700000000 } from "./1793700000000-CreatePortfolioSourcedEvidence";

test("sourced evidence rollback refuses to drop selected evidence", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "2" }]; } } as any;
  await assert.rejects(() => new CreatePortfolioSourcedEvidence1793700000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP TABLE")), false);
});

test("sourced evidence rollback removes an unused empty table", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new CreatePortfolioSourcedEvidence1793700000000().down(queryRunner);
  assert.deepEqual(statements, [
    "SELECT COUNT(*) AS row_count FROM portfolio_sourced_evidence",
    "DROP TABLE portfolio_sourced_evidence",
  ]);
});

test("sourced evidence migration creates an additive owner-scoped source table", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new CreatePortfolioSourcedEvidence1793700000000().up(queryRunner);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /CREATE TABLE portfolio_sourced_evidence/);
  assert.match(statements[0], /UNIQUE KEY uq_portfolio_sourced_evidence_source/);
  assert.match(statements[0], /FOREIGN KEY \(owner_id\) REFERENCES users\(id\)/);
});
