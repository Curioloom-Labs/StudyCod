import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddContestAwards1792600000000 implements MigrationInterface {
  name = "AddContestAwards1792600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("contest_participants", "retain_participation"))) {
      await queryRunner.query("ALTER TABLE contest_participants ADD retain_participation TINYINT(1) NOT NULL DEFAULT 0");
    }
    await queryRunner.query(`CREATE TABLE IF NOT EXISTS contest_awards (
      contest_id INT NOT NULL PRIMARY KEY,
      source_version CHAR(64) NOT NULL,
      decisions_json JSON NOT NULL,
      confirmed_by_user_id INT NOT NULL,
      confirmed_at DATETIME(3) NOT NULL,
      CONSTRAINT fk_contest_awards_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP TABLE IF EXISTS contest_awards");
    if (await queryRunner.hasColumn("contest_participants", "retain_participation")) {
      await queryRunner.query("ALTER TABLE contest_participants DROP COLUMN retain_participation");
    }
  }
}
