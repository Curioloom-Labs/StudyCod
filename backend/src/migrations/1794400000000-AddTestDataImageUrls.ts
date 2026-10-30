import type { MigrationInterface, QueryRunner } from "typeorm";

/** Optional public image attachments for sample and judge test cases. */
export class AddTestDataImageUrls1794400000000 implements MigrationInterface {
  name = "AddTestDataImageUrls1794400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("test_data");
    if (!table || table.findColumnByName("image_urls")) return;
    await queryRunner.query("ALTER TABLE test_data ADD image_urls TEXT NULL AFTER points");
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("test_data");
    if (!table?.findColumnByName("image_urls")) return;
    await queryRunner.query("ALTER TABLE test_data DROP COLUMN image_urls");
  }
}
