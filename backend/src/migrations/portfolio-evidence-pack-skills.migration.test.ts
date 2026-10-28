import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioEvidencePackSkills1794300000000 } from "./1794300000000-AddPortfolioEvidencePackSkills";

const table = (hasSkillsColumn: boolean) => ({
  findColumnByName: (name: string) => name === "skill_ids_json" && hasSkillsColumn ? ({ name }) : undefined,
}) as any;

test("Evidence Pack competencies are added as a nullable additive column", async () => {
  const statements: string[] = [];
  const queryRunner = {
    getTable: async () => table(false),
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any;
  await new AddPortfolioEvidencePackSkills1794300000000().up(queryRunner);
  assert.deepEqual(statements, ["ALTER TABLE portfolio_evidence_packs ADD skill_ids_json TEXT NULL AFTER evidence_ids_json"]);
});

test("Evidence Pack competency rollback preserves selected skills", async () => {
  const statements: string[] = [];
  const queryRunner = {
    getTable: async () => table(true),
    query: async (sql: string) => { statements.push(sql); return [{ row_count: "1" }]; },
  } as any;
  await assert.rejects(() => new AddPortfolioEvidencePackSkills1794300000000().down(queryRunner), /contain selected competencies/);
  assert.equal(statements.some(sql => sql.includes("DROP COLUMN")), false);
});

test("empty Evidence Pack competency selections can be rolled back", async () => {
  const statements: string[] = [];
  const queryRunner = {
    getTable: async () => table(true),
    query: async (sql: string) => { statements.push(sql); return [{ row_count: "0" }]; },
  } as any;
  await new AddPortfolioEvidencePackSkills1794300000000().down(queryRunner);
  assert.deepEqual(statements, [
    "SELECT COUNT(*) AS row_count FROM portfolio_evidence_packs WHERE skill_ids_json IS NOT NULL AND skill_ids_json <> '[]'",
    "ALTER TABLE portfolio_evidence_packs DROP COLUMN skill_ids_json",
  ]);
});
