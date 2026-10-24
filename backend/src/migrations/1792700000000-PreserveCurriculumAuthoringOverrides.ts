import type { MigrationInterface, QueryRunner } from "typeorm";

export class PreserveCurriculumAuthoringOverrides1792700000000 implements MigrationInterface {
  name = "PreserveCurriculumAuthoringOverrides1792700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["courses", "course_modules", "course_items"]) {
      if (await queryRunner.hasTable(table) && !(await queryRunner.hasColumn(table, "authoring_overrides"))) {
        await queryRunner.query(`ALTER TABLE ${table} ADD authoring_overrides TEXT NULL`);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["course_items", "course_modules", "courses"]) {
      if (await queryRunner.hasTable(table) && await queryRunner.hasColumn(table, "authoring_overrides")) {
        await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN authoring_overrides`);
      }
    }
  }
}
