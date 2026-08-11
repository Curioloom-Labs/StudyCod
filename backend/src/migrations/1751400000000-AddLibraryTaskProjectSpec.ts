import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * LibraryTask has the same optional mini-project field as the other task
 * tables. Keep this separate from AddMiniProjectSpec because that migration
 * is already applied in production.
 */
export class AddLibraryTaskProjectSpec1751400000000 implements MigrationInterface {
  name = "AddLibraryTaskProjectSpec1751400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      "SHOW COLUMNS FROM `library_tasks` LIKE 'project_spec'",
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      await queryRunner.query(
        "ALTER TABLE `library_tasks` ADD COLUMN `project_spec` MEDIUMTEXT NULL AFTER `task_mode`",
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      "SHOW COLUMNS FROM `library_tasks` LIKE 'project_spec'",
    );
    if (Array.isArray(rows) && rows.length > 0) {
      await queryRunner.query(
        "ALTER TABLE `library_tasks` DROP COLUMN `project_spec`",
      );
    }
  }
}
