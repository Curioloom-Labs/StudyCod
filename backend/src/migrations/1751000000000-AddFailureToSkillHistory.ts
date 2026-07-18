import type { MigrationInterface, QueryRunner } from "typeorm";

/** Append-only Failure-to-Skill history and first-party learning events. */
export class AddFailureToSkillHistory1751000000000 implements MigrationInterface {
  name = "AddFailureToSkillHistory1751000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const attempts = await queryRunner.query("SHOW TABLES LIKE 'learning_attempts'");
    if (!Array.isArray(attempts) || attempts.length === 0) {
      await queryRunner.query(`
        CREATE TABLE learning_attempts (
          id INT NOT NULL AUTO_INCREMENT,
          principal_type ENUM('USER','STUDENT') NOT NULL,
          principal_id INT NOT NULL,
          task_kind ENUM('LIBRARY','PERSONAL','EDU','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
          task_id INT NOT NULL,
          topic_id INT NULL,
          topic_label VARCHAR(160) NULL,
          submission_id VARCHAR(128) NULL,
          source_attempt_id INT NULL,
          outcome ENUM('FAILED','SOLVED') NOT NULL,
          failure_category VARCHAR(64) NULL,
          first_failed_test_id INT NULL,
          highest_hint_level_shown TINYINT UNSIGNED NOT NULL DEFAULT 0,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX idx_learning_attempts_principal (principal_type, principal_id, created_at),
          INDEX idx_learning_attempts_task (task_kind, task_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }

    const events = await queryRunner.query("SHOW TABLES LIKE 'learning_events'");
    if (!Array.isArray(events) || events.length === 0) {
      await queryRunner.query(`
        CREATE TABLE learning_events (
          id INT NOT NULL AUTO_INCREMENT,
          principal_type ENUM('USER','STUDENT') NOT NULL,
          principal_id INT NOT NULL,
          task_kind ENUM('LIBRARY','PERSONAL','EDU','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
          task_id INT NULL,
          learning_attempt_id INT NULL,
          failure_category VARCHAR(64) NULL,
          hint_level TINYINT UNSIGNED NULL,
          dedupe_key VARCHAR(191) NOT NULL,
          event_type ENUM('coding_attempt_failed','hint_viewed','retry_started','solved_after_failure','recommended_task_opened') NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE INDEX uq_learning_events_dedupe (dedupe_key),
          INDEX idx_learning_events_principal (principal_type, principal_id, created_at),
          INDEX idx_learning_events_task (task_kind, task_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const events = await queryRunner.query("SHOW TABLES LIKE 'learning_events'");
    if (Array.isArray(events) && events.length > 0) await queryRunner.query("DROP TABLE `learning_events`");
    const attempts = await queryRunner.query("SHOW TABLES LIKE 'learning_attempts'");
    if (Array.isArray(attempts) && attempts.length > 0) await queryRunner.query("DROP TABLE `learning_attempts`");
  }
}
