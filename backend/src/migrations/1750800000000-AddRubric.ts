import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Rubric grading (Tier 1): `edu_tasks.rubric` (criteria) + `edu_grades.rubric_scores`
 * (per-criterion breakdown). Additive nullable columns, idempotent.
 *
 * ⚠ NOT verified against a live DB in this session — run `npm run db:migrate`
 * on a copy before prod.
 */
export class AddRubric1750800000000 implements MigrationInterface {
  name = "AddRubric1750800000000";

  private async hasColumn(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await q.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
    return Array.isArray(rows) && rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(queryRunner, "edu_tasks", "rubric"))) {
      await queryRunner.query("ALTER TABLE `edu_tasks` ADD COLUMN `rubric` TEXT NULL");
    }
    if (!(await this.hasColumn(queryRunner, "edu_grades", "rubric_scores"))) {
      await queryRunner.query("ALTER TABLE `edu_grades` ADD COLUMN `rubric_scores` TEXT NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await this.hasColumn(queryRunner, "edu_grades", "rubric_scores")) {
      await queryRunner.query("ALTER TABLE `edu_grades` DROP COLUMN `rubric_scores`");
    }
    if (await this.hasColumn(queryRunner, "edu_tasks", "rubric")) {
      await queryRunner.query("ALTER TABLE `edu_tasks` DROP COLUMN `rubric`");
    }
  }
}
