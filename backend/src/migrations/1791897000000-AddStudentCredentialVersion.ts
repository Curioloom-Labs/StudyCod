import type { MigrationInterface, QueryRunner } from "typeorm";
export class AddStudentCredentialVersion1791897000000 implements MigrationInterface {
  name = "AddStudentCredentialVersion1791897000000";
  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn("students", "credential_version"))) await queryRunner.query("ALTER TABLE students ADD credential_version INT UNSIGNED NOT NULL DEFAULT 0");
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn("students", "credential_version")) await queryRunner.query("ALTER TABLE students DROP COLUMN credential_version");
  }
}
