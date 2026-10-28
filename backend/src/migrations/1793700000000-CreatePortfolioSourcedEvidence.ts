import type { MigrationInterface, QueryRunner } from "typeorm";

/** Store owner-selected evidence linked to validated StudyCod source records. */
export class CreatePortfolioSourcedEvidence1793700000000 implements MigrationInterface {
  name = "CreatePortfolioSourcedEvidence1793700000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE portfolio_sourced_evidence (
      id CHAR(36) NOT NULL PRIMARY KEY,
      owner_id INT NOT NULL,
      source_type VARCHAR(32) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      source_snapshot_json LONGTEXT NOT NULL,
      description TEXT NOT NULL,
      skill_ids_json TEXT NOT NULL,
      visibility ENUM('PRIVATE','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
      archived_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_portfolio_sourced_evidence_source (owner_id, source_type, source_key),
      KEY ix_portfolio_sourced_evidence_owner (owner_id, archived_at, updated_at),
      CONSTRAINT fk_portfolio_sourced_evidence_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_sourced_evidence") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: portfolio_sourced_evidence contains saved evidence. Export or migrate it before removing this table.");
    }
    await q.query("DROP TABLE portfolio_sourced_evidence");
  }
}
