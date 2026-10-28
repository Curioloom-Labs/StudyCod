import type { MigrationInterface, QueryRunner } from "typeorm";

/** Store owner-curated profile technologies without changing existing profiles. */
export class AddPortfolioProfileTechnologies1793800000000 implements MigrationInterface {
  name = "AddPortfolioProfileTechnologies1793800000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE portfolio_profiles ADD COLUMN technologies_json TEXT NULL AFTER specialization");
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(
      "SELECT COUNT(*) AS row_count FROM portfolio_profiles WHERE technologies_json IS NOT NULL AND technologies_json <> '[]'"
    ) as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Portfolio profile technologies are configured. Export or migrate them before removing this column.");
    }
    await q.query("ALTER TABLE portfolio_profiles DROP COLUMN technologies_json");
  }
}
