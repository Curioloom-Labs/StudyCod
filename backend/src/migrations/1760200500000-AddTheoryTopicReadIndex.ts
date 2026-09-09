import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Supports the metadata-only theory sidebar query:
 * language = ? AND class_id IS NULL ORDER BY `order`.
 */
export class AddTheoryTopicReadIndex1760200500000 implements MigrationInterface {
  name = "AddTheoryTopicReadIndex1760200500000";

  private async hasTable(queryRunner: QueryRunner, table: string): Promise<boolean> {
    const rows = await queryRunner.query(
      "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1",
      [table],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async hasIndex(queryRunner: QueryRunner, table: string, name: string): Promise<boolean> {
    const rows = await queryRunner.query(
      "SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
      [table, name],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = "topics_new";
    const index = "idx_topics_new_language_class_order";
    if (!(await this.hasTable(queryRunner, table)) || await this.hasIndex(queryRunner, table, index)) return;

    await queryRunner.query(
      `ALTER TABLE \`${table}\` ADD INDEX \`${index}\` (\`language\`, \`class_id\`, \`order\`)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = "topics_new";
    const index = "idx_topics_new_language_class_order";
    if (await this.hasIndex(queryRunner, table, index)) {
      await queryRunner.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
    }
  }
}
