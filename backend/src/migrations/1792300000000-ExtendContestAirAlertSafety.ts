import type { MigrationInterface, QueryRunner } from "typeorm";

export class ExtendContestAirAlertSafety1792300000000 implements MigrationInterface {
  name = "ExtendContestAirAlertSafety1792300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("contests");
    if (!table) return;

    const columns: Array<[string, string]> = [
      ["safety_red_location_uid", "INT NULL"],
      ["safety_red_location_name", "VARCHAR(255) NULL"],
      ["safety_red_alert_last_level", "VARCHAR(6) NULL"],
      ["safety_red_downgrade_alert_key", "VARCHAR(180) NULL"],
      ["safety_red_lock_mode", "VARCHAR(24) NOT NULL DEFAULT 'PAUSE_10_MIN'"],
      ["safety_manual_locked", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["safety_global_lock_started_at", "DATETIME(3) NULL"],
      ["safety_global_extension_seconds", "INT NOT NULL DEFAULT 0"],
    ];
    for (const [name, definition] of columns) {
      if (!table.findColumnByName(name)) {
        await queryRunner.query(`ALTER TABLE \`contests\` ADD COLUMN \`${name}\` ${definition}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const name of [
      "safety_global_extension_seconds",
      "safety_global_lock_started_at",
      "safety_manual_locked",
      "safety_red_lock_mode",
      "safety_red_downgrade_alert_key",
      "safety_red_alert_last_level",
      "safety_red_location_name",
      "safety_red_location_uid",
    ]) {
      if (await queryRunner.hasColumn("contests", name)) {
        await queryRunner.query(`ALTER TABLE \`contests\` DROP COLUMN \`${name}\``);
      }
    }
  }
}
