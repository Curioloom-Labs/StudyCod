import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestAirAlertSafety1791982000000 implements MigrationInterface {
  name = "AddContestAirAlertSafety1791982000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const contestTable = await queryRunner.getTable("contests");
    if (contestTable && !contestTable.findColumnByName("safety_alerts_enabled")) {
      await queryRunner.query("ALTER TABLE `contests` ADD COLUMN `safety_alerts_enabled` TINYINT(1) NOT NULL DEFAULT 0");
    }

    const participantTable = await queryRunner.getTable("contest_participants");
    if (!participantTable) return;
    const columns: Array<[string, string]> = [
      ["safety_location_uid", "INT NULL"],
      ["safety_location_name", "VARCHAR(255) NULL"],
      ["safety_pause_started_at", "DATETIME(3) NULL"],
      ["safety_pause_until", "DATETIME(3) NULL"],
      ["safety_extension_seconds", "INT NOT NULL DEFAULT 0"],
      ["safety_acknowledged_alert_key", "VARCHAR(180) NULL"],
    ];
    for (const [name, definition] of columns) {
      if (!participantTable.findColumnByName(name)) {
        await queryRunner.query(`ALTER TABLE \`contest_participants\` ADD COLUMN \`${name}\` ${definition}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const participantColumns = [
      "safety_acknowledged_alert_key",
      "safety_extension_seconds",
      "safety_pause_until",
      "safety_pause_started_at",
      "safety_location_name",
      "safety_location_uid",
    ];
    for (const name of participantColumns) {
      if (await queryRunner.hasColumn("contest_participants", name)) {
        await queryRunner.query(`ALTER TABLE \`contest_participants\` DROP COLUMN \`${name}\``);
      }
    }
    if (await queryRunner.hasColumn("contests", "safety_alerts_enabled")) {
      await queryRunner.query("ALTER TABLE `contests` DROP COLUMN `safety_alerts_enabled`");
    }
  }
}
