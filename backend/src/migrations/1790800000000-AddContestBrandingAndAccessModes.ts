import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestBrandingAndAccessModes1790800000000 implements MigrationInterface {
  name = "AddContestBrandingAndAccessModes1790800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table) return;

    const columns: Array<{ name: string; sql: string }> = [
      { name: "icon", sql: "VARCHAR(16) NOT NULL DEFAULT '🏆'" },
      { name: "banner_theme", sql: "VARCHAR(20) NOT NULL DEFAULT 'forest'" },
      { name: "banner_image_url", sql: "VARCHAR(512) NULL" },
      { name: "scoreboard_visibility", sql: "ENUM('LIVE','AFTER_END','ORGANIZERS_ONLY') NOT NULL DEFAULT 'LIVE'" },
      { name: "participant_access_mode", sql: "ENUM('SELF_REGISTRATION','ISSUED_ACCOUNTS') NOT NULL DEFAULT 'SELF_REGISTRATION'" },
    ];
    for (const column of columns) {
      if (!table.findColumnByName(column.name)) {
        await queryRunner.query(`ALTER TABLE \`contests\` ADD COLUMN \`${column.name}\` ${column.sql}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table) return;
    for (const name of ["participant_access_mode", "scoreboard_visibility", "banner_image_url", "banner_theme", "icon"]) {
      if (table.findColumnByName(name)) await queryRunner.query(`ALTER TABLE \`contests\` DROP COLUMN \`${name}\``);
    }
  }
}
