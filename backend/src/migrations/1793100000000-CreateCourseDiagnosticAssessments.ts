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
    await queryRunner.query("DROP TABLE IF EXISTS `course_diagnostic_assessments`");
  }
}
