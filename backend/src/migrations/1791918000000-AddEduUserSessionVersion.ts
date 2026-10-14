import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEduUserSessionVersion1791918000000 implements MigrationInterface {
  name = "AddEduUserSessionVersion1791918000000";
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("users", "edu_session_version"))) {
      await queryRunner.query("ALTER TABLE users ADD edu_session_version INT UNSIGNED NOT NULL DEFAULT 0");
    }
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn("users", "edu_session_version")) {
      await queryRunner.query("ALTER TABLE users DROP COLUMN edu_session_version");
    }
  }
}
