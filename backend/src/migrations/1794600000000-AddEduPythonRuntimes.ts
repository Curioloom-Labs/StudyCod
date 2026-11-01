import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEduPythonRuntimes1794600000000 implements MigrationInterface {
  name = "AddEduPythonRuntimes1794600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `edu_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'");
    await queryRunner.query("ALTER TABLE `topic_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'");
    await queryRunner.query("ALTER TABLE `test_data` ADD `assets` longtext NULL");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `test_data` DROP COLUMN `assets`");
    await queryRunner.query("ALTER TABLE `topic_tasks` DROP COLUMN `python_runtime_profile`");
    await queryRunner.query("ALTER TABLE `edu_tasks` DROP COLUMN `python_runtime_profile`");
  }
}
