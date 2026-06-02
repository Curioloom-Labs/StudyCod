import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Recorded solve sessions for replay (bounded snapshot list per session).
 * Idempotent: re-running on an existing table is a no-op.
 */
export class AddSolveSessions1748400000000 implements MigrationInterface {
  name = "AddSolveSessions1748400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'solve_sessions'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE solve_sessions (
        id INT NOT NULL AUTO_INCREMENT,
        principal_type ENUM('USER','STUDENT') NOT NULL,
        principal_id INT NOT NULL,
        task_kind ENUM('LIBRARY','TOPIC','CONTEST','PLAYGROUND','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
        task_id INT NULL,
        language VARCHAR(16) NULL,
        snapshots MEDIUMTEXT NOT NULL,
        duration_ms INT NOT NULL DEFAULT 0,
        final_verdict VARCHAR(16) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_solve_sessions_principal (principal_type, principal_id),
        INDEX idx_solve_sessions_task (task_kind, task_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'solve_sessions'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `solve_sessions`");
  }
}
