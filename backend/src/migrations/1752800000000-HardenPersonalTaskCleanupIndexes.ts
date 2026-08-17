import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Indexes the two recurring personal-task maintenance paths:
 * - deleting test cases after a passing grade;
 * - collecting content hashes for the on-disk test cache sweep.
 *
 * The checks make this safe on databases that already received an equivalent
 * index under a different deployment attempt.
 */
export class HardenPersonalTaskCleanupIndexes1752800000000 implements MigrationInterface {
  name = "HardenPersonalTaskCleanupIndexes1752800000000";

  private async hasIndex(queryRunner: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await queryRunner.query(
      "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
      [table, name],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async addIndex(queryRunner: QueryRunner, table: string, name: string, columns: string): Promise<void> {
    if (await this.hasIndex(queryRunner, table, name)) return;
    await queryRunner.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` (${columns})`);
  }

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.addIndex(queryRunner, "test_data", "idx_test_data_personal_task", "`personal_task_id`");
    await this.addIndex(queryRunner, "test_data", "idx_test_data_input_sha256", "`input_sha256`");
    await this.addIndex(queryRunner, "test_data", "idx_test_data_output_sha256", "`output_sha256`");
    await this.addIndex(queryRunner, "grades", "idx_grades_task_user_total", "`task_id`, `user_id`, `total`");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, name] of [
      ["test_data", "idx_test_data_personal_task"],
      ["test_data", "idx_test_data_input_sha256"],
      ["test_data", "idx_test_data_output_sha256"],
      ["grades", "idx_grades_task_user_total"],
    ] as const) {
      if (await this.hasIndex(queryRunner, table, name)) {
        await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${name}\``);
      }
    }
  }
}
