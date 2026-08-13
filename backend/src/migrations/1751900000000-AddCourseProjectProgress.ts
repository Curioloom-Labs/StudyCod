import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourseProjectProgress1751900000000 implements MigrationInterface {
  name = "AddCourseProjectProgress1751900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query("SHOW COLUMNS FROM `course_item_progress` LIKE 'project_data'");
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryRunner.query("ALTER TABLE `course_item_progress` ADD COLUMN `project_data` MEDIUMTEXT NULL AFTER `completed_at`");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query("SHOW COLUMNS FROM `course_item_progress` LIKE 'project_data'");
    if (Array.isArray(rows) && rows.length > 0) {
      await queryRunner.query("ALTER TABLE `course_item_progress` DROP COLUMN `project_data`");
    }
  }
}
