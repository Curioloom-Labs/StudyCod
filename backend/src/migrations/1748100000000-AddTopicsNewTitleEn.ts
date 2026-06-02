import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `topics_new.title_en` — a persisted English translation of the topic
 * title, populated lazily by the translation service (audit M3).
 *
 * Without this column, every GET that needs English copy triggers a
 * synchronous uk -> en HTTP call to the configured translation provider on
 * cache miss, blocking the request handler. With the column, the translation
 * is fetched once and written back, after which the route reads it directly.
 *
 * Backwards-compatible: column is nullable and defaults to NULL; existing
 * rows continue to work, the translation service falls back to live
 * translation when the column is empty.
 */
export class AddTopicsNewTitleEn1748100000000 implements MigrationInterface {
  name = "AddTopicsNewTitleEn1748100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query(
      "SHOW COLUMNS FROM `topics_new` LIKE 'title_en'"
    );
    if (Array.isArray(columns) && columns.length > 0) {
      return;
    }
    await queryRunner.query(
      "ALTER TABLE `topics_new` ADD COLUMN `title_en` VARCHAR(512) NULL DEFAULT NULL"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = await queryRunner.query(
      "SHOW COLUMNS FROM `topics_new` LIKE 'title_en'"
    );
    if (!Array.isArray(columns) || columns.length === 0) return;
    await queryRunner.query("ALTER TABLE `topics_new` DROP COLUMN `title_en`");
  }
}
