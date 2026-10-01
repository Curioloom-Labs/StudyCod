import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestDiscoveryMetadata1760300000000 implements MigrationInterface {
  name = "AddContestDiscoveryMetadata1760300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table) return;

    if (!table.findColumnByName("tags")) {
      await queryRunner.query("ALTER TABLE `contests` ADD COLUMN `tags` TEXT NULL");
    }
    if (!table.findColumnByName("difficulty")) {
      await queryRunner.query("ALTER TABLE `contests` ADD COLUMN `difficulty` VARCHAR(12) NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table) return;

    if (table.findColumnByName("difficulty")) {
      await queryRunner.query("ALTER TABLE `contests` DROP COLUMN `difficulty`");
    }
    if (table.findColumnByName("tags")) {
      await queryRunner.query("ALTER TABLE `contests` DROP COLUMN `tags`");
    }
  }
}
