import type { MigrationInterface, QueryRunner } from "typeorm";

/** Persist the owner's explicitly selected competencies on each share grant. */
export class AddPortfolioEvidencePackSkills1794300000000 implements MigrationInterface {
  name = "AddPortfolioEvidencePackSkills1794300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("portfolio_evidence_packs");
    if (!table) throw new Error("Cannot add Evidence Pack competencies before portfolio_evidence_packs exists.");
    if (!table.findColumnByName("skill_ids_json")) {
      await queryRunner.query("ALTER TABLE portfolio_evidence_packs ADD skill_ids_json TEXT NULL AFTER evidence_ids_json");
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("portfolio_evidence_packs");
    if (!table?.findColumnByName("skill_ids_json")) return;
    const rows = await queryRunner.query(
      "SELECT COUNT(*) AS row_count FROM portfolio_evidence_packs WHERE skill_ids_json IS NOT NULL AND skill_ids_json <> '[]'",
    ) as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Evidence Packs contain selected competencies. Export or migrate them before removing this column.");
    }
    await queryRunner.query("ALTER TABLE portfolio_evidence_packs DROP COLUMN skill_ids_json");
  }
}
