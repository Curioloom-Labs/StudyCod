import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddMiniProjectSpec1751300000000 implements MigrationInterface {
  name = "AddMiniProjectSpec1751300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["tasks", "topic_tasks", "edu_tasks"]) {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'project_spec'`);
      if (!Array.isArray(rows) || rows.length === 0) {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`project_spec\` MEDIUMTEXT NULL AFTER \`task_mode\``);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["tasks", "topic_tasks", "edu_tasks"]) {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'project_spec'`);
      if (Array.isArray(rows) && rows.length > 0) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP COLUMN \`project_spec\``);
      }
    }
  }
}
