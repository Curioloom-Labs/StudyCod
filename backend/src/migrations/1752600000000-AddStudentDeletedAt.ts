import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddStudentDeletedAt1752600000000 implements MigrationInterface {
  name = "AddStudentDeletedAt1752600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'deleted_at'");
    if (!Array.isArray(columns) || columns.length === 0) {
      await queryRunner.query("ALTER TABLE `students` ADD COLUMN `deleted_at` TIMESTAMP NULL");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'deleted_at'");
    if (Array.isArray(columns) && columns.length > 0) {
      await queryRunner.query("ALTER TABLE `students` DROP COLUMN `deleted_at`");
    }
  }
}
