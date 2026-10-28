import test from "node:test";
import assert from "node:assert/strict";
import { CreatePortfolioEvidencePacks1793500000000 } from "./1793500000000-CreatePortfolioEvidencePacks";

test("Evidence Pack rollback refuses to remove share grants", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "1" }]; } } as any;
  await assert.rejects(() => new CreatePortfolioEvidencePacks1793500000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.startsWith("DROP TABLE")), false);
});

test("empty Evidence Pack schema can roll back cleanly", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new CreatePortfolioEvidencePacks1793500000000().down(queryRunner);
  assert.deepEqual(statements, [
    "SELECT COUNT(*) AS row_count FROM portfolio_evidence_packs",
    "DROP TABLE portfolio_evidence_packs",
  ]);
});
