import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioEvidenceOrder1794000000000 } from "./1794000000000-AddPortfolioEvidenceOrder";

test("Portfolio evidence order migration adds an owner-scoped order to both evidence sources", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioEvidenceOrder1794000000000().up(queryRunner);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /portfolio_evidence[\s\S]*ADD COLUMN sort_order INT NOT NULL DEFAULT 0[\s\S]*ix_portfolio_evidence_owner_order/);
  assert.match(statements[1], /portfolio_sourced_evidence[\s\S]*ADD COLUMN sort_order INT NOT NULL DEFAULT 0[\s\S]*ix_portfolio_sourced_evidence_owner_order/);
});

test("Portfolio evidence order rollback blocks after an owner curates order", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "1" }]; } } as any;
  await assert.rejects(() => new AddPortfolioEvidenceOrder1794000000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("Portfolio evidence order rollback removes unused order columns and indexes", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPortfolioEvidenceOrder1794000000000().down(queryRunner);
  assert.ok(statements.some(sql => sql.includes("portfolio_sourced_evidence DROP INDEX ix_portfolio_sourced_evidence_owner_order, DROP COLUMN sort_order")));
  assert.ok(statements.some(sql => sql.includes("portfolio_evidence DROP INDEX ix_portfolio_evidence_owner_order, DROP COLUMN sort_order")));
});
