import type { MigrationInterface, QueryRunner } from "typeorm";

/** Attach owner-selected taxonomy labels to Portfolio work without changing prior records. */
export class AddPortfolioWorkSkills1793600000000 implements MigrationInterface {
  name = "AddPortfolioWorkSkills1793600000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query("ALTER TABLE portfolio_works ADD COLUMN skill_ids_json TEXT NULL AFTER technologies_json");
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(
      "SELECT COUNT(*) AS row_count FROM portfolio_works WHERE JSON_VALID(skill_ids_json)=1 AND JSON_LENGTH(skill_ids_json)>0"
    ) as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Portfolio work has selected skill tags. Export or migrate them before removing this column.");
    }
    await q.query("ALTER TABLE portfolio_works DROP COLUMN skill_ids_json");
  }
}
