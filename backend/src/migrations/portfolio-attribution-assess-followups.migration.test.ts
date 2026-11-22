import test from "node:test";
import assert from "node:assert/strict";
import { AddPortfolioAttributionAndAssessFollowups1795300000000 } from "./1795300000000-AddPortfolioAttributionAndAssessFollowups";

test("Portfolio attribution, targeted Evidence Packs, and Assess follow-ups are added without rewriting existing rows", async () => {
  const statements: string[] = [];
  const runner = { query: async (sql: string) => { statements.push(sql); return []; } } as any;
  await new AddPortfolioAttributionAndAssessFollowups1795300000000().up(runner);
  assert.equal(statements.length, 3);
  assert.match(statements[0], /ADD COLUMN contribution_summary TEXT NOT NULL DEFAULT ''/);
  assert.match(statements[0], /ADD COLUMN outcome_summary TEXT NOT NULL DEFAULT ''/);
  assert.match(statements[1], /recipient_name VARCHAR\(120\)/);
  assert.match(statements[1], /purpose VARCHAR\(200\)/);
  assert.match(statements[2], /CREATE TABLE growth_assess_followups/);
  assert.match(statements[2], /FOREIGN KEY \(assessment_id\)/);
  assert.match(statements[2], /FOREIGN KEY \(candidate_id\)/);
});

test("Assess and Portfolio rollback refuses to discard stored candidate and reviewer data", async () => {
  const statements: string[] = [];
  const runner = { query: async (sql: string) => { statements.push(sql); return [{ followups: "1", attributed_work: "0", targeted_packs: "0" }]; } } as any;
  await assert.rejects(() => new AddPortfolioAttributionAndAssessFollowups1795300000000().down(runner), /candidate attribution or reviewer follow-up data would be lost/);
  assert.equal(statements.length, 1);
  assert.doesNotMatch(statements.join("\n"), /DROP TABLE|DROP COLUMN/);
});

test("empty Assess and Portfolio additions can be rolled back", async () => {
  const statements: string[] = [];
  const runner = { query: async (sql: string) => { statements.push(sql); return [{ followups: "0", attributed_work: "0", targeted_packs: "0" }]; } } as any;
  await new AddPortfolioAttributionAndAssessFollowups1795300000000().down(runner);
  assert.match(statements[0], /SELECT COUNT\(\*\) FROM growth_assess_followups/);
  assert.match(statements[1], /DROP TABLE growth_assess_followups/);
  assert.match(statements[2], /DROP COLUMN purpose, DROP COLUMN recipient_name/);
  assert.match(statements[3], /DROP COLUMN outcome_summary, DROP COLUMN contribution_summary/);
});
