import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds the per-class `grade_scale_mode` column to `classes`.
 *
 * LINEAR keeps the historical proportional point conversion; MON switches the
 * 12-point system to the official Ukrainian (МОН) non-linear band table.
 * Defaults to LINEAR so existing classes keep their current displayed grades.
 *
 * Idempotent: SHOW COLUMNS guard before ALTER.
 */
export class AddClassGradeScaleMode1748700000000 implements MigrationInterface {
  name = "AddClassGradeScaleMode1748700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'grade_scale_mode'");
    if (!Array.isArray(col) || col.length === 0) {
      await queryRunner.query(
        "ALTER TABLE `classes` ADD COLUMN `grade_scale_mode` ENUM('LINEAR','MON') NOT NULL DEFAULT 'LINEAR' AFTER `grading_system`"
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'grade_scale_mode'");
    if (Array.isArray(col) && col.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP COLUMN `grade_scale_mode`");
    }
  }
}
