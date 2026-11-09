import type { MigrationInterface, QueryRunner } from "typeorm";

export class WidenCourseDiagnosticAssessmentData1794900000000 implements MigrationInterface {
  name = "WidenCourseDiagnosticAssessmentData1794900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("course_diagnostic_assessments"))) {
      throw new Error("Cannot widen course diagnostic assessment data: table is missing.");
    }

    const table = await queryRunner.getTable("course_diagnostic_assessments");
    const column = table?.findColumnByName("assessment_data");
    if (!column) {
      throw new Error("Cannot widen course diagnostic assessment data: column is missing.");
    }
    if (["mediumtext", "longtext"].includes(column.type.toLowerCase())) return;

    await queryRunner.query(
      "ALTER TABLE `course_diagnostic_assessments` MODIFY `assessment_data` MEDIUMTEXT NOT NULL"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("course_diagnostic_assessments"))) return;

    const rows = await queryRunner.query(
      "SELECT COUNT(*) AS oversized_row_count FROM `course_diagnostic_assessments` WHERE OCTET_LENGTH(`assessment_data`) > 65535"
    ) as Array<{ oversized_row_count: number | string }>;
    const oversizedCount = Number(rows[0]?.oversized_row_count);
    if (!Number.isSafeInteger(oversizedCount) || oversizedCount < 0) {
      throw new Error("Rollback blocked: could not verify diagnostic assessment payload sizes.");
    }
    if (oversizedCount > 0) {
      throw new Error("Rollback blocked: diagnostic assessments exceed TEXT capacity; no schema or data was changed.");
    }

    await queryRunner.query(
      "ALTER TABLE `course_diagnostic_assessments` MODIFY `assessment_data` TEXT NOT NULL"
    );
  }
}
