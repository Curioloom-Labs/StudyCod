import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Append-only integrity event log from client-side proctoring signals. Backs
 * services/integrity/proctoringScore so a teacher can review flagged
 * submissions. Idempotent: re-running on an existing table is a no-op.
 */
export class AddSubmissionIntegrity1748300000000 implements MigrationInterface {
  name = "AddSubmissionIntegrity1748300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'submission_integrity'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE submission_integrity (
        id INT NOT NULL AUTO_INCREMENT,
        principal_type ENUM('USER','STUDENT') NOT NULL,
        principal_id INT NOT NULL,
        task_kind ENUM('LIBRARY','TOPIC','CONTEST','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        task_id INT NULL,
        score INT NOT NULL,
        level ENUM('clean','review','suspicious') NOT NULL,
        flags TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_submission_integrity_principal (principal_type, principal_id),
        INDEX idx_submission_integrity_task (task_kind, task_id),
        INDEX idx_submission_integrity_level (level)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'submission_integrity'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `submission_integrity`");
  }
}
