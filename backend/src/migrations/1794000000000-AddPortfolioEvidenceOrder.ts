import type { MigrationInterface, QueryRunner } from "typeorm";

/** Let Portfolio owners curate the order of Judge and source-linked evidence. */
export class AddPortfolioEvidenceOrder1794000000000 implements MigrationInterface {
  name = "AddPortfolioEvidenceOrder1794000000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE portfolio_evidence
      ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER skill_ids_json,
      ADD KEY ix_portfolio_evidence_owner_order (owner_id, archived_at, sort_order)`);
    await q.query(`ALTER TABLE portfolio_sourced_evidence
      ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER skill_ids_json,
      ADD KEY ix_portfolio_sourced_evidence_owner_order (owner_id, archived_at, sort_order)`);
  }

  async down(q: QueryRunner): Promise<void> {
    const gradeRows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_evidence WHERE sort_order<>0") as Array<{ row_count: number | string }>;
    const sourcedRows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_sourced_evidence WHERE sort_order<>0") as Array<{ row_count: number | string }>;
    if (Number(gradeRows[0]?.row_count ?? 0) > 0 || Number(sourcedRows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Portfolio evidence has a saved owner-selected order. Export or migrate this preference before removing it.");
    }
    await q.query("ALTER TABLE portfolio_sourced_evidence DROP INDEX ix_portfolio_sourced_evidence_owner_order, DROP COLUMN sort_order");
    await q.query("ALTER TABLE portfolio_evidence DROP INDEX ix_portfolio_evidence_owner_order, DROP COLUMN sort_order");
  }
}
