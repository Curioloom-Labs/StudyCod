import test from "node:test";
import assert from "node:assert/strict";
import { CreateGrowthProjects1792800000000 } from "./1792800000000-CreateGrowthProjects";
import { CreateGrowthCompanyAssessments1792900000000 } from "./1792900000000-CreateGrowthCompanyAssessments";
import { CreateTalentInterviews1793000000000 } from "./1793000000000-CreateTalentInterviews";

const legacyFeatureMigrations = [
  ["Portfolio project data", new CreateGrowthProjects1792800000000()],
  ["Assess company data", new CreateGrowthCompanyAssessments1792900000000()],
  ["Assess interview and Judge data", new CreateTalentInterviews1793000000000()],
] as const;

for (const [label, migration] of legacyFeatureMigrations) {
  test(`${label} migration rollback is blocked before any SQL runs`, async () => {
    const statements: string[] = [];
    const queryRunner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;

    await assert.rejects(
      () => migration.down(queryRunner),
      /Rollback blocked:.*inventory-backed forward-only migration.*no data or schema was changed\./
    );
    assert.deepEqual(statements, []);
  });
}
