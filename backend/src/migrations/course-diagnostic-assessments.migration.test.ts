import assert from "node:assert/strict";
import test from "node:test";
import { CreateCourseDiagnosticAssessments1793100000000 } from "./1793100000000-CreateCourseDiagnosticAssessments";

test("course diagnostic assessment rollback preserves learner data", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: 2 }];
    },
  } as any;

  await assert.rejects(
    () => new CreateCourseDiagnosticAssessments1793100000000().down(queryRunner),
    /Rollback blocked: course diagnostic assessments contain learner data/
  );
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT COUNT\(\*\).*course_diagnostic_assessments/);
});

test("course diagnostic assessment rollback drops only an empty table", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    query: async (sql: string) => {
      statements.push(sql);
      return [{ row_count: 0 }];
    },
  } as any;

  await new CreateCourseDiagnosticAssessments1793100000000().down(queryRunner);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /^SELECT COUNT\(\*\).*course_diagnostic_assessments/);
  assert.equal(statements[1], "DROP TABLE IF EXISTS `course_diagnostic_assessments`");
});

test("course diagnostic assessment rollback blocks when the row count cannot be verified", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any;

  await assert.rejects(
    () => new CreateCourseDiagnosticAssessments1793100000000().down(queryRunner),
    /Rollback blocked: could not verify the course diagnostic assessment row count/
  );
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^SELECT COUNT\(\*\).*course_diagnostic_assessments/);
});

test("course diagnostic assessment rollback is a no-op when the table is absent", async () => {
  let queryCalled = false;
  const queryRunner = {
    hasTable: async () => false,
    query: async () => { queryCalled = true; return []; },
  } as any;

  await new CreateCourseDiagnosticAssessments1793100000000().down(queryRunner);
  assert.equal(queryCalled, false);
});
