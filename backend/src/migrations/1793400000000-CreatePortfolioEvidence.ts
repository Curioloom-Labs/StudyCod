import type { MigrationInterface, QueryRunner } from "typeorm";

/** Store owner-selected references to server-verified Personal Judge records. */
export class CreatePortfolioEvidence1793400000000 implements MigrationInterface {
  name = "CreatePortfolioEvidence1793400000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE portfolio_evidence (
      id CHAR(36) NOT NULL PRIMARY KEY,
      owner_id INT NOT NULL,
      source_grade_id INT NOT NULL,
      description VARCHAR(1000) NOT NULL DEFAULT '',
      skill_ids_json TEXT NOT NULL,
      visibility VARCHAR(16) NOT NULL DEFAULT 'PRIVATE',
      archived_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_portfolio_evidence_owner_grade (owner_id, source_grade_id),
      KEY ix_portfolio_evidence_owner_visibility (owner_id, visibility, archived_at),
      CONSTRAINT fk_portfolio_evidence_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_portfolio_evidence_grade FOREIGN KEY (source_grade_id) REFERENCES grades(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query("SELECT COUNT(*) AS row_count FROM portfolio_evidence") as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: portfolio_evidence contains selected Skill Evidence. Export or migrate it before removing this schema.");
    }
    await q.query("DROP TABLE portfolio_evidence");
  }
}
