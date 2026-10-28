import test from "node:test";
import assert from "node:assert/strict";
import { AddPersonalBirthYearForPortfolioSharing1794100000000 } from "./1794100000000-AddPersonalBirthYearForPortfolioSharing";

test("Portfolio age gate adds a nullable private birth year without backfilling guesses", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPersonalBirthYearForPortfolioSharing1794100000000().up(queryRunner);
  assert.deepEqual(statements, ["ALTER TABLE users ADD COLUMN birth_year SMALLINT UNSIGNED NULL AFTER birth_month"]);
});

test("birth year rollback refuses to discard age protection data", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "1" }]; } } as any;
  await assert.rejects(() => new AddPersonalBirthYearForPortfolioSharing1794100000000().down(queryRunner), /Rollback blocked/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("birth year rollback drops only an unused nullable field", async () => {
  const statements: string[] = [];
  const queryRunner = { query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; } } as any;
  await new AddPersonalBirthYearForPortfolioSharing1794100000000().down(queryRunner);
  assert.equal(statements[statements.length - 1], "ALTER TABLE users DROP COLUMN birth_year");
});
