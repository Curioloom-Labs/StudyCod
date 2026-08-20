import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The consolidated legacy migration was already recorded on some installations
 * before edu_hint_feedback was introduced. Keep this repair as a tracked,
 * forward-only migration so hint-quality analytics never depends on a missing
 * table or on boot-time shadow migrations.
 */
export class EnsureEduHintFeedbackTable1760000000000 implements MigrationInterface {
  name = "EnsureEduHintFeedbackTable1760000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS edu_hint_feedback (
        id INT NOT NULL AUTO_INCREMENT,
        student_id INT NOT NULL,
        topic_task_id INT NOT NULL,
        grade_id INT NULL,
        submission_id VARCHAR(128) NULL,
        code_hash VARCHAR(128) NOT NULL,
        verdict VARCHAR(32) NULL,
        \`signal\` ENUM('UP','DOWN') NOT NULL,
        \`reason_code\` ENUM('HELPFUL','NOT_SPECIFIC','INCORRECT','TOO_HARD','TOO_VERBOSE','OTHER') NULL,
        reason_text TEXT NULL,
        hints_shown INT NOT NULL DEFAULT 0,
        hints_total INT NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_edu_hint_feedback_student_task_code (student_id, topic_task_id, code_hash),
        INDEX idx_edu_hint_feedback_topic_created (topic_task_id, created_at),
        INDEX idx_edu_hint_feedback_grade (grade_id),
        INDEX idx_edu_hint_feedback_signal_reason (\`signal\`, \`reason_code\`),
        CONSTRAINT fk_edu_hint_feedback_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        CONSTRAINT fk_edu_hint_feedback_topic_task FOREIGN KEY (topic_task_id) REFERENCES topic_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_edu_hint_feedback_grade FOREIGN KEY (grade_id) REFERENCES edu_grades(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Forward-only repair; deleting feedback data during rollback is unsafe.
  }
}
