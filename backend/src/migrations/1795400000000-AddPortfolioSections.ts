import type { MigrationInterface, QueryRunner } from "typeorm";

/** Stores optional professional portfolio sections and their presentation order. */
export class AddPortfolioSections1795400000000 implements MigrationInterface {
  name = "AddPortfolioSections1795400000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE portfolio_profiles ADD COLUMN content_json TEXT NULL AFTER share_avatar");
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_profiles WHERE content_json IS NOT NULL AND content_json <> ''") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Portfolio section content exists. Export it before removing this column.");
    }
    await q.query("ALTER TABLE portfolio_profiles DROP COLUMN content_json");
  }
}
