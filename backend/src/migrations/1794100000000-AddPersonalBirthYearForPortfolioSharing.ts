import type { MigrationInterface, QueryRunner } from "typeorm";

/** Add the minimum missing age datum for private Portfolio sharing eligibility. */
export class AddPersonalBirthYearForPortfolioSharing1794100000000 implements MigrationInterface {
  name = "AddPersonalBirthYearForPortfolioSharing1794100000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE users ADD COLUMN birth_year SMALLINT UNSIGNED NULL AFTER birth_month");
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM users WHERE birth_year IS NOT NULL") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: users have saved private birth years used for Portfolio age protection. Export or migrate this data before removing it.");
    }
    await q.query("ALTER TABLE users DROP COLUMN birth_year");
  }
}
