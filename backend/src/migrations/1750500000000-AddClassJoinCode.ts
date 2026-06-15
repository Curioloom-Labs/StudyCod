import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `classes.join_code` for User-backed self-enrolment (Student↔User
 * unification, dual-mode). Additive, idempotent. Legacy students unaffected.
 */
export class AddClassJoinCode1750500000000 implements MigrationInterface {
  name = "AddClassJoinCode1750500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'join_code'");
    if (!Array.isArray(col) || col.length === 0) {
      await queryRunner.query("ALTER TABLE `classes` ADD COLUMN `join_code` VARCHAR(16) NULL");
      await queryRunner.query("ALTER TABLE `classes` ADD UNIQUE INDEX `uq_class_join_code` (`join_code`)");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const idx = await queryRunner.query("SHOW INDEX FROM `classes` WHERE Key_name = 'uq_class_join_code'");
    if (Array.isArray(idx) && idx.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP INDEX `uq_class_join_code`");
    }
    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'join_code'");
    if (Array.isArray(col) && col.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP COLUMN `join_code`");
    }
  }
}
