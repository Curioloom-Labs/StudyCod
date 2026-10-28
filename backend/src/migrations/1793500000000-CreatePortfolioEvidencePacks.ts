import type { MigrationInterface, QueryRunner } from "typeorm";

/** Create expiring, revocable bearer grants for explicitly selected Portfolio items. */
export class CreatePortfolioEvidencePacks1793500000000 implements MigrationInterface {
  name = "CreatePortfolioEvidencePacks1793500000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE portfolio_evidence_packs (
      id CHAR(36) NOT NULL PRIMARY KEY,
      owner_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      title VARCHAR(120) NOT NULL,
      specialization VARCHAR(120) NOT NULL DEFAULT '',
      include_profile TINYINT(1) NOT NULL DEFAULT 1,
      work_ids_json TEXT NOT NULL,
      evidence_ids_json TEXT NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      revoked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_portfolio_evidence_pack_token (token_hash),
      KEY ix_portfolio_evidence_pack_owner (owner_id, created_at),
      CONSTRAINT fk_portfolio_evidence_pack_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_evidence_packs") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: portfolio_evidence_packs contains share grants. Export or migrate them before removing this schema.");
    }
    await q.query("DROP TABLE portfolio_evidence_packs");
  }
}
