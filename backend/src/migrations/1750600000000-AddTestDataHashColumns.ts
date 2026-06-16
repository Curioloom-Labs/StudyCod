import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds `test_data.input_sha256` / `output_sha256` — content hashes addressing the on-disk
 * test cache. They let `/check` read only test metadata (no large text blobs) on a cache
 * hit. Additive, idempotent, nullable (lazily backfilled at runtime).
 */
export class AddTestDataHashColumns1750600000000 implements MigrationInterface {
  name = "AddTestDataHashColumns1750600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'test_data'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const inputCol = await queryRunner.query("SHOW COLUMNS FROM `test_data` LIKE 'input_sha256'");
    if (!Array.isArray(inputCol) || inputCol.length === 0) {
      await queryRunner.query("ALTER TABLE `test_data` ADD COLUMN `input_sha256` CHAR(64) NULL");
    }
    const outputCol = await queryRunner.query("SHOW COLUMNS FROM `test_data` LIKE 'output_sha256'");
    if (!Array.isArray(outputCol) || outputCol.length === 0) {
      await queryRunner.query("ALTER TABLE `test_data` ADD COLUMN `output_sha256` CHAR(64) NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'test_data'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const outputCol = await queryRunner.query("SHOW COLUMNS FROM `test_data` LIKE 'output_sha256'");
    if (Array.isArray(outputCol) && outputCol.length > 0) {
      await queryRunner.query("ALTER TABLE `test_data` DROP COLUMN `output_sha256`");
    }
    const inputCol = await queryRunner.query("SHOW COLUMNS FROM `test_data` LIKE 'input_sha256'");
    if (Array.isArray(inputCol) && inputCol.length > 0) {
      await queryRunner.query("ALTER TABLE `test_data` DROP COLUMN `input_sha256`");
    }
  }
}
