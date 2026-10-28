import type { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCourseDiagnosticAssessments1793100000000 implements MigrationInterface {
  name = "CreateCourseDiagnosticAssessments1793100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`course_diagnostic_assessments\` (
      \`id\` int NOT NULL AUTO_INCREMENT,
      \`enrollment_id\` int NOT NULL,
      \`attempt_number\` int NOT NULL DEFAULT 1,
      \`assessment_data\` text NOT NULL,
      \`status\` enum('READY','SUBMITTED') NOT NULL DEFAULT 'READY',
      \`result_data\` text NULL,
      \`submitted_at\` timestamp NULL,
      \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE INDEX \`uq_course_diagnostic_attempt\` (\`enrollment_id\`, \`attempt_number\`),
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`fk_course_diagnostic_enrollment\` FOREIGN KEY (\`enrollment_id\`) REFERENCES \`user_course_enrollments\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("course_diagnostic_assessments"))) return;

    const rows = await queryRunner.query(
      "SELECT COUNT(*) AS row_count FROM `course_diagnostic_assessments`"
    ) as Array<{ row_count: number | string }>;
    const rowCount = Number(rows[0]?.row_count);
    if (!Number.isSafeInteger(rowCount) || rowCount < 0) {
      throw new Error(
        "Rollback blocked: could not verify the course diagnostic assessment row count. No schema or data was changed."
      );
    }
    if (rowCount > 0) {
      throw new Error(
        "Rollback blocked: course diagnostic assessments contain learner data. Export or migrate it before removing this table."
      );
    }

    await queryRunner.query("DROP TABLE IF EXISTS `course_diagnostic_assessments`");
  }
}
