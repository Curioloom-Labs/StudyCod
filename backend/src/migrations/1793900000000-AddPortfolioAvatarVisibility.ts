import type { MigrationInterface, QueryRunner } from "typeorm";

/** Keep account photos private in Portfolio until the owner explicitly shares one. */
export class AddPortfolioAvatarVisibility1793900000000 implements MigrationInterface {
  name = "AddPortfolioAvatarVisibility1793900000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE portfolio_profiles ADD COLUMN share_avatar TINYINT(1) NOT NULL DEFAULT 0 AFTER visibility");
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_profiles WHERE share_avatar=1") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Portfolio profiles explicitly share account photos. Export or migrate this preference before removing it.");
    }
    await q.query("ALTER TABLE portfolio_profiles DROP COLUMN share_avatar");
  }
}
