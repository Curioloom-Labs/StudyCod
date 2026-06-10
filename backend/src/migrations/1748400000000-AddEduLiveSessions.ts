import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Live, code-aware classroom sessions. Each row ties a (unique) LiveKit room
 * name to a class and optionally a lesson, records who started it, and whether
 * it is still LIVE. Idempotent: re-running on an existing table is a no-op.
 */
export class AddEduLiveSessions1748400000000 implements MigrationInterface {
  name = "AddEduLiveSessions1748400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_live_sessions'");
    if (Array.isArray(tables) && tables.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE edu_live_sessions (
        id INT NOT NULL AUTO_INCREMENT,
        class_id INT NOT NULL,
        lesson_id INT NULL,
        room_name VARCHAR(128) NOT NULL,
        title VARCHAR(255) NULL,
        status ENUM('LIVE','ENDED') NOT NULL DEFAULT 'LIVE',
        started_by_user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        ended_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        UNIQUE INDEX idx_edu_live_sessions_room (room_name),
        INDEX idx_edu_live_sessions_class_status (class_id, status),
        CONSTRAINT fk_edu_live_sessions_class FOREIGN KEY (class_id) REFERENCES classes (id) ON DELETE CASCADE,
        CONSTRAINT fk_edu_live_sessions_lesson FOREIGN KEY (lesson_id) REFERENCES edu_lessons (id) ON DELETE SET NULL,
        CONSTRAINT fk_edu_live_sessions_user FOREIGN KEY (started_by_user_id) REFERENCES users (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_live_sessions'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    await queryRunner.query("DROP TABLE `edu_live_sessions`");
  }
}
