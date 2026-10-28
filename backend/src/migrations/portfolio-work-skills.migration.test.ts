import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioWorkSkills1793600000000 } from "./1793600000000-AddPortfolioWorkSkills";

test("Portfolio work skill rollback refuses to remove selected taxonomy tags", async () => {
  const statements: string[] = [];
  const queryRunner = {
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: "1" }];
    },
  } as any;
  await assert.rejects(() => new AddPortfolioWorkSkills1793600000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("Portfolio work skill rollback removes an unused empty column", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPortfolioWorkSkills1793600000000().down(queryRunner);
  assert.ok(statements.some(sql => sql === "ALTER TABLE portfolio_works DROP COLUMN skill_ids_json"));
});

test("Portfolio work skill migration is additive and leaves existing work rows intact", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioWorkSkills1793600000000().up(queryRunner);
  assert.deepEqual(statements, ["ALTER TABLE portfolio_works ADD COLUMN skill_ids_json TEXT NULL AFTER technologies_json"]);
});
