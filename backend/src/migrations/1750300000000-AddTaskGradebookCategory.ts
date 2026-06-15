import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `edu_tasks.gradebook_category_id` (P2.6c) tagging a task to a weighted
 * gradebook category. Additive, idempotent.
 */
export class AddTaskGradebookCategory1750300000000 implements MigrationInterface {
  name = "AddTaskGradebookCategory1750300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_tasks'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `edu_tasks` LIKE 'gradebook_category_id'");
    if (!Array.isArray(col) || col.length === 0) {
      await queryRunner.query("ALTER TABLE `edu_tasks` ADD COLUMN `gradebook_category_id` VARCHAR(64) NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'edu_tasks'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `edu_tasks` LIKE 'gradebook_category_id'");
    if (Array.isArray(col) && col.length > 0) {
      await queryRunner.query("ALTER TABLE `edu_tasks` DROP COLUMN `gradebook_category_id`");
    }
  }
}
