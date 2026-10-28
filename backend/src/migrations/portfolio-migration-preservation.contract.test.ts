import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { CreatePortfolioFoundation1793200000000 } from "./1793200000000-CreatePortfolioFoundation";
import { AddPersonalSubmissionVerification1793300000000 } from "./1793300000000-AddPersonalSubmissionVerification";
import { CreatePortfolioEvidence1793400000000 } from "./1793400000000-CreatePortfolioEvidence";
import { CreatePortfolioEvidencePacks1793500000000 } from "./1793500000000-CreatePortfolioEvidencePacks";
import { AddPortfolioWorkSkills1793600000000 } from "./1793600000000-AddPortfolioWorkSkills";
import { CreatePortfolioSourcedEvidence1793700000000 } from "./1793700000000-CreatePortfolioSourcedEvidence";
import { AddPortfolioProfileTechnologies1793800000000 } from "./1793800000000-AddPortfolioProfileTechnologies";
import { AddPortfolioAvatarVisibility1793900000000 } from "./1793900000000-AddPortfolioAvatarVisibility";
import { AddPortfolioEvidenceOrder1794000000000 } from "./1794000000000-AddPortfolioEvidenceOrder";
import { AddPersonalBirthYearForPortfolioSharing1794100000000 } from "./1794100000000-AddPersonalBirthYearForPortfolioSharing";
import { AddAssessInterviewExpiryIndex1794200000000 } from "./1794200000000-AddAssessInterviewExpiryIndex";
import { AddPortfolioEvidencePackSkills1794300000000 } from "./1794300000000-AddPortfolioEvidencePackSkills";

const migrationPattern = /^(\d+)-[^/]+\.(?:ts|js)$/;
const portfolioMigrationStart = 1793200000000;
const portfolioMigrationEnd = 1794300000000;
const allowedAlterTargets = new Set([
  "grades",
  "growth_interviews",
  "users",
]);

test("Portfolio and Assess migrations preserve legacy rows and only add schema", () => {
  const migrationFiles = fs.readdirSync(__dirname)
    .filter(file => {
      const timestamp = Number(file.match(migrationPattern)?.[1]);
      return Number.isFinite(timestamp) && timestamp >= portfolioMigrationStart && timestamp <= portfolioMigrationEnd;
    })
    .sort((left, right) => left.localeCompare(right));

  assert.equal(migrationFiles.length, 12, "all current Portfolio and Assess migrations must be checked");

  for (const file of migrationFiles) {
    const source = fs.readFileSync(path.join(__dirname, file), "utf8");
    const upStart = source.indexOf("async up(");
    const downStart = source.indexOf("async down(", upStart);
    assert.notEqual(upStart, -1, `${file} must define up()`);
    assert.notEqual(downStart, -1, `${file} must define down()`);
    const up = source.slice(upStart, downStart);

    assert.doesNotMatch(
      up,
      /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX)|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|RENAME\s+TABLE|MODIFY\s+COLUMN)\b/i,
      `${file} up() must not remove or rewrite existing schema or rows`,
    );
    assert.doesNotMatch(
      up,
      /\b(?:INSERT\s+INTO|UPDATE)\s+`?(?:users|grades|tasks|organizations|memberships|notifications|growth_[a-z_]+)/i,
      `${file} up() must not rewrite or seed existing user, Learn, EDU, notification, or Growth rows`,
    );

    for (const match of up.matchAll(/\bCREATE\s+TABLE\s+`?([a-z0-9_]+)/gi)) {
      assert.match(match[1], /^portfolio_/, `${file} may create only Portfolio-owned tables`);
    }
    for (const match of up.matchAll(/\bALTER\s+TABLE\s+`?([a-z0-9_]+)/gi)) {
      assert.ok(
        match[1].startsWith("portfolio_") || allowedAlterTargets.has(match[1]),
        `${file} alters unexpected table ${match[1]}`,
      );
    }
  }
});

const migrations = [
  new CreatePortfolioFoundation1793200000000(),
  new AddPersonalSubmissionVerification1793300000000(),
  new CreatePortfolioEvidence1793400000000(),
  new CreatePortfolioEvidencePacks1793500000000(),
  new AddPortfolioWorkSkills1793600000000(),
  new CreatePortfolioSourcedEvidence1793700000000(),
  new AddPortfolioProfileTechnologies1793800000000(),
  new AddPortfolioAvatarVisibility1793900000000(),
  new AddPortfolioEvidenceOrder1794000000000(),
  new AddPersonalBirthYearForPortfolioSharing1794100000000(),
  new AddAssessInterviewExpiryIndex1794200000000(),
  new AddPortfolioEvidencePackSkills1794300000000(),
];

test("Portfolio and Assess migration up() methods issue only additive SQL", async () => {
  const allowedAlterTargets = new Set(["grades", "growth_interviews", "users"]);

  for (const migration of migrations) {
    const statements: string[] = [];
    const queryRunner = {
      query: async (sql: string) => {
        statements.push(sql);
        return [];
      },
      hasColumn: async (_table: string, _column: string) => false,
      hasIndex: async (_table: string, _index: string) => false,
      getTable: async () => ({
        findColumnByName: () => undefined,
        findIndexByName: () => undefined,
        columns: [],
        indices: [],
      }),
    } as any;

    await migration.up(queryRunner);
    assert.ok(statements.length > 0, `${migration.name} must issue schema changes through QueryRunner`);

    for (const statement of statements) {
      assert.doesNotMatch(
        statement,
        /\b(?:DROP\s+(?:TABLE|COLUMN|INDEX)|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?|RENAME\s+TABLE|MODIFY\s+COLUMN)\b/i,
        `${migration.name} emitted destructive SQL: ${statement}`,
      );
      assert.doesNotMatch(
        statement,
        /\b(?:INSERT\s+INTO|UPDATE)\s+`?(?:users|grades|tasks|organizations|memberships|notifications|growth_[a-z_]+)/i,
        `${migration.name} wrote to existing user, Learn, EDU, notification, or Growth rows: ${statement}`,
      );

      for (const match of statement.matchAll(/\bCREATE\s+TABLE\s+`?([a-z0-9_]+)/gi)) {
        assert.match(match[1], /^portfolio_/, `${migration.name} may create only Portfolio-owned tables`);
      }
      for (const match of statement.matchAll(/\bALTER\s+TABLE\s+`?([a-z0-9_]+)/gi)) {
        assert.ok(
          match[1].startsWith("portfolio_") || allowedAlterTargets.has(match[1]),
          `${migration.name} alters unexpected table ${match[1]}`,
        );
      }
    }
  }
});
