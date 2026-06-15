import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `classes.gradebook_config` (weighted-category gradebook, P2.6). Null keeps
 * the existing thematic/semester behaviour. Additive, idempotent.
 */
export class AddClassGradebookConfig1750200000000 implements MigrationInterface {
  name = "AddClassGradebookConfig1750200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'gradebook_config'");
    if (!Array.isArray(col) || col.length === 0) {
      await queryRunner.query("ALTER TABLE `classes` ADD COLUMN `gradebook_config` TEXT NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'classes'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `classes` LIKE 'gradebook_config'");
    if (Array.isArray(col) && col.length > 0) {
      await queryRunner.query("ALTER TABLE `classes` DROP COLUMN `gradebook_config`");
    }
  }
}
