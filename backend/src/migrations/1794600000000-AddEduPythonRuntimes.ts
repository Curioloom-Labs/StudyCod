import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEduPythonRuntimes1794600000000 implements MigrationInterface {
  name = "AddEduPythonRuntimes1794600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("edu_tasks") && !(await queryRunner.hasColumn("edu_tasks", "python_runtime_profile"))) {
      await queryRunner.query("ALTER TABLE `edu_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'");
    }
    if (await queryRunner.hasTable("topic_tasks") && !(await queryRunner.hasColumn("topic_tasks", "python_runtime_profile"))) {
      await queryRunner.query("ALTER TABLE `topic_tasks` ADD `python_runtime_profile` varchar(24) NOT NULL DEFAULT 'STANDARD'");
    }
    if (await queryRunner.hasTable("test_data") && !(await queryRunner.hasColumn("test_data", "assets"))) {
      await queryRunner.query("ALTER TABLE `test_data` ADD `assets` longtext NULL");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable("test_data") && await queryRunner.hasColumn("test_data", "assets")) {
      await queryRunner.query("ALTER TABLE `test_data` DROP COLUMN `assets`");
    }
    if (await queryRunner.hasTable("topic_tasks") && await queryRunner.hasColumn("topic_tasks", "python_runtime_profile")) {
      await queryRunner.query("ALTER TABLE `topic_tasks` DROP COLUMN `python_runtime_profile`");
    }
    if (await queryRunner.hasTable("edu_tasks") && await queryRunner.hasColumn("edu_tasks", "python_runtime_profile")) {
      await queryRunner.query("ALTER TABLE `edu_tasks` DROP COLUMN `python_runtime_profile`");
    }
  }
}
