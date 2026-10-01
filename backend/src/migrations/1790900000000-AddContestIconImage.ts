import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestIconImage1790900000000 implements MigrationInterface {
  name = "AddContestIconImage1790900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table || table.findColumnByName("icon_image_url")) return;
    await queryRunner.query("ALTER TABLE `contests` ADD COLUMN `icon_image_url` VARCHAR(512) NULL");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (table?.findColumnByName("icon_image_url")) {
      await queryRunner.query("ALTER TABLE `contests` DROP COLUMN `icon_image_url`");
    }
  }
}
