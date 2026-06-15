import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `course_assignments.module_map` (source module id → created EduLesson id)
 * so NEW_UPSTREAM items can be placed under the right lesson on pull. Additive,
 * idempotent.
 */
export class AddAssignmentModuleMap1749800000000 implements MigrationInterface {
  name = "AddAssignmentModuleMap1749800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `course_assignments` LIKE 'module_map'");
    if (!Array.isArray(col) || col.length === 0) {
      await queryRunner.query("ALTER TABLE `course_assignments` ADD COLUMN `module_map` TEXT NULL AFTER `origin_map`");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const col = await queryRunner.query("SHOW COLUMNS FROM `course_assignments` LIKE 'module_map'");
    if (Array.isArray(col) && col.length > 0) {
      await queryRunner.query("ALTER TABLE `course_assignments` DROP COLUMN `module_map`");
    }
  }
}
