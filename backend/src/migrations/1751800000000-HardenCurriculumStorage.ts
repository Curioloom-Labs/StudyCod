import type { MigrationInterface, QueryRunner } from "typeorm";

/** Adds stable source identity and archival metadata for idempotent curriculum sync. */
export class HardenCurriculumStorage1751800000000 implements MigrationInterface {
  name = "HardenCurriculumStorage1751800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasTable = async (table: string) => {
      const rows = await queryRunner.query("SHOW TABLES LIKE ?", [table]);
      return Array.isArray(rows) && rows.length > 0;
    };
    const hasColumn = async (table: string, column: string) => {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    };
    const addColumn = async (table: string, column: string, definition: string) => {
      if (await hasTable(table) && !(await hasColumn(table, column))) await queryRunner.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    };

    await addColumn("courses", "source_hash", "VARCHAR(64) NULL");
    await addColumn("courses", "content_version", "INT NOT NULL DEFAULT 1");
    await addColumn("courses", "last_synced_at", "TIMESTAMP NULL");
    await addColumn("course_modules", "content_key", "VARCHAR(160) NULL");
    await addColumn("course_modules", "source_hash", "VARCHAR(64) NULL");
    await addColumn("course_items", "content_key", "VARCHAR(200) NULL");
    await addColumn("course_items", "source_hash", "VARCHAR(64) NULL");
    await addColumn("course_items", "source_path", "VARCHAR(255) NULL");
    await addColumn("course_items", "content_version", "INT NOT NULL DEFAULT 1");
    await addColumn("course_items", "is_active", "TINYINT(1) NOT NULL DEFAULT 1");

    if (await hasTable("course_modules")) {
      const indexes = await queryRunner.query("SHOW INDEX FROM `course_modules` WHERE Key_name = 'uq_course_module_content_key'");
      if (!Array.isArray(indexes) || indexes.length === 0) await queryRunner.query("ALTER TABLE `course_modules` ADD UNIQUE KEY `uq_course_module_content_key` (`course_id`, `content_key`)");
    }
    if (await hasTable("course_items")) {
      const indexes = await queryRunner.query("SHOW INDEX FROM `course_items` WHERE Key_name = 'uq_course_item_content_key'");
      if (!Array.isArray(indexes) || indexes.length === 0) await queryRunner.query("ALTER TABLE `course_items` ADD UNIQUE KEY `uq_course_item_content_key` (`module_id`, `content_key`)");
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Forward-only: removing source identity would make future syncs unsafe.
  }
}
