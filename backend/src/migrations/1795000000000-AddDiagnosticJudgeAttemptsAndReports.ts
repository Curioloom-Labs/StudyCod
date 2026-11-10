import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddDiagnosticJudgeAttemptsAndReports1795000000000 implements MigrationInterface {
  name = "AddDiagnosticJudgeAttemptsAndReports1795000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable("course_diagnostic_assessments"))) {
      throw new Error("Cannot add diagnostic Judge attempts: course diagnostic assessments table is missing.");
    }
    const columns: Array<[string, string]> = [
      ["task_attempts_data", "MEDIUMTEXT NULL"],
      ["report_status", "ENUM('NOT_REQUESTED','PENDING','PROCESSING','READY','FAILED') NOT NULL DEFAULT 'NOT_REQUESTED'"],
      ["mentor_report", "MEDIUMTEXT NULL"],
      ["report_attempts", "INT UNSIGNED NOT NULL DEFAULT 0"],
      ["report_next_attempt_at", "DATETIME NULL"],
      ["report_email_attempts", "INT UNSIGNED NOT NULL DEFAULT 0"],
      ["report_email_next_attempt_at", "DATETIME NULL"],
      ["report_email_sent_at", "DATETIME NULL"],
    ];
    for (const [name, definition] of columns) {
      if (!(await queryRunner.hasColumn("course_diagnostic_assessments", name))) {
        await queryRunner.query(`ALTER TABLE \`course_diagnostic_assessments\` ADD COLUMN \`${name}\` ${definition}`);
      }
    }

    if (!(await queryRunner.hasTable("notifications"))) {
      throw new Error("Cannot add diagnostic report notifications: notifications table is missing.");
    }
    await queryRunner.query(`ALTER TABLE \`notifications\` MODIFY COLUMN \`type\` ENUM(
      'BLOG_COMMENT','BLOG_REPLY','GROWTH_REVIEW_INVITATION','GROWTH_REVIEW_ASSIGNED',
      'GROWTH_REVIEW_ASSIGNED_TO_AUTHOR','GROWTH_REVIEW_ACCEPTED','GROWTH_REVIEW_DECLINED',
      'GROWTH_REVIEW_SUBMITTED','GROWTH_REVIEW_REQUESTED','COMPANY_TEAM_INVITATION',
      'COMPANY_ASSESSMENT_INVITATION','COMPANY_ASSESSMENT_UPDATED','COURSE_DIAGNOSTIC_REPORT_READY'
    ) NOT NULL`);
  }

  public async down(): Promise<void> {
    throw new Error("Rollback blocked: diagnostic attempts and mentor reports are learner assessment records. Use a reviewed forward-only migration.");
  }
}
