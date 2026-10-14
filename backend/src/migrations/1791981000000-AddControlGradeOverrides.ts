import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddControlGradeOverrides1791981000000 implements MigrationInterface {
  name = "AddControlGradeOverrides1791981000000";
  async up(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable("summary_grades");
    if (!table) throw new Error("SUMMARY_GRADES_TABLE_REQUIRED");
    for (const column of ["manual_override_grade", "calculated_grade"]) {
      if (!table.columns.some(item => item.name === column)) await runner.query(`ALTER TABLE summary_grades ADD COLUMN ${column} INT NULL DEFAULT NULL`);
    }
  }
  async down(runner: QueryRunner): Promise<void> {
    const table = await runner.getTable("summary_grades");
    for (const column of ["calculated_grade", "manual_override_grade"]) {
      if (table?.columns.some(item => item.name === column)) await runner.query(`ALTER TABLE summary_grades DROP COLUMN ${column}`);
    }
  }
}
