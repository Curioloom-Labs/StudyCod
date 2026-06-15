import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Widen edu_tasks.task_mode to include MANUAL (hand-graded text/file tasks —
 * Phase 2 table-stakes). Idempotent: only alters the enum if MANUAL is absent.
 */
export class AddManualTaskMode1749900000000 implements MigrationInterface {
  name = "AddManualTaskMode1749900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_tasks'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `edu_tasks` LIKE 'task_mode'");
    const def = Array.isArray(col) && col.length > 0 ? String((col[0] as any).Type || "") : "";
    if (def && !/MANUAL/i.test(def)) {
      await queryRunner.query(
        "ALTER TABLE `edu_tasks` MODIFY COLUMN `task_mode` ENUM('CODE','WEB','MANUAL') NOT NULL DEFAULT 'CODE'"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_tasks'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    // Reverting to CODE/WEB only; convert any MANUAL rows to CODE first to avoid truncation.
    await queryRunner.query("UPDATE `edu_tasks` SET `task_mode` = 'CODE' WHERE `task_mode` = 'MANUAL'");
    await queryRunner.query(
      "ALTER TABLE `edu_tasks` MODIFY COLUMN `task_mode` ENUM('CODE','WEB') NOT NULL DEFAULT 'CODE'"
    );
  }
}
