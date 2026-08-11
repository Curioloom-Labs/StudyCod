import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Makes personal submission replay/idempotency data explicit and repairs the
 * project_spec column on every task-like table. Both operations are guarded
 * so this migration is safe against partially upgraded production databases.
 */
export class RepairSubmissionAndProjectSchema1751500000000 implements MigrationInterface {
  name = "RepairSubmissionAndProjectSchema1751500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = async (table: string): Promise<boolean> => {
      const rows = await queryRunner.query("SHOW TABLES LIKE ?", [table]);
      return Array.isArray(rows) && rows.length > 0;
    };
    const hasColumn = async (table: string, column: string): Promise<boolean> => {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    };

    if (await tableExists("grades")) {
      if (!(await hasColumn("grades", "client_submission_id"))) {
        await queryRunner.query("ALTER TABLE `grades` ADD COLUMN `client_submission_id` VARCHAR(128) NULL");
      }
      if (!(await hasColumn("grades", "code_hash"))) {
        await queryRunner.query("ALTER TABLE `grades` ADD COLUMN `code_hash` VARCHAR(128) NULL");
      }
      if (!(await hasColumn("grades", "hints_json"))) {
        await queryRunner.query("ALTER TABLE `grades` ADD COLUMN `hints_json` TEXT NULL");
      }
      if (!(await hasColumn("grades", "hints_status"))) {
        await queryRunner.query("ALTER TABLE `grades` ADD COLUMN `hints_status` VARCHAR(16) NULL");
      }

      const indexes = await queryRunner.query("SHOW INDEX FROM `grades` WHERE Key_name = 'uq_grades_user_task_client_submission'");
      if (!Array.isArray(indexes) || indexes.length === 0) {
        await queryRunner.query(
          "ALTER TABLE `grades` ADD UNIQUE KEY `uq_grades_user_task_client_submission` (`user_id`, `task_id`, `client_submission_id`)"
        );
      }
    }

    for (const table of ["tasks", "topic_tasks", "edu_tasks", "library_tasks"]) {
      if (!(await tableExists(table))) continue;
      if (!(await hasColumn(table, "project_spec"))) {
        await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`project_spec\` MEDIUMTEXT NULL`);
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Forward-only repair: removing these columns would reintroduce production drift.
  }
}
