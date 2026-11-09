import assert from "node:assert/strict";
import test from "node:test";
import { WidenCourseDiagnosticAssessmentData1794900000000 } from "./1794900000000-WidenCourseDiagnosticAssessmentData";

test("course diagnostic assessment storage widens to mediumtext", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    getTable: async () => ({ findColumnByName: () => ({ type: "text" }) }),
    query: async (sql: string) => { statements.push(sql); return []; },
  } as any;

  await new WidenCourseDiagnosticAssessmentData1794900000000().up(queryRunner);
  assert.deepEqual(statements, [
    "ALTER TABLE `course_diagnostic_assessments` MODIFY `assessment_data` MEDIUMTEXT NOT NULL",
  ]);
});

test("course diagnostic assessment storage rollback blocks payload truncation", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    getTable: async () => ({ findColumnByName: () => ({ type: "mediumtext" }) }),
    query: async (sql: string) => {
      statements.push(sql);
      return [{ oversized_row_count: "1" }];
    },
  } as any;

  await assert.rejects(
    () => new WidenCourseDiagnosticAssessmentData1794900000000().down(queryRunner),
    /exceed TEXT capacity/,
  );
  assert.equal(statements.length, 1);
  assert.match(statements[0], /OCTET_LENGTH/);
});

test("course diagnostic assessment storage rollback shrinks only when all payloads fit", async () => {
  const statements: string[] = [];
  const queryRunner = {
    hasTable: async () => true,
    query: async (sql: string) => {
      statements.push(sql);
      return [{ oversized_row_count: 0 }];
    },
  } as any;

  await new WidenCourseDiagnosticAssessmentData1794900000000().down(queryRunner);
  assert.equal(statements.length, 2);
  assert.equal(statements[1], "ALTER TABLE `course_diagnostic_assessments` MODIFY `assessment_data` TEXT NOT NULL");
});
