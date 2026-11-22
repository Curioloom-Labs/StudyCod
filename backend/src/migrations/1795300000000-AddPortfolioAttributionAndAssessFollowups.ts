import type { MigrationInterface, QueryRunner } from "typeorm";

/** Capture candidate-attributed Portfolio work and reviewer follow-up in Assess. */
export class AddPortfolioAttributionAndAssessFollowups1795300000000 implements MigrationInterface {
  name = "AddPortfolioAttributionAndAssessFollowups1795300000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE portfolio_works
      ADD COLUMN contribution_summary TEXT NOT NULL DEFAULT '' AFTER solution,
      ADD COLUMN outcome_summary TEXT NOT NULL DEFAULT '' AFTER contribution_summary`);
    await q.query(`ALTER TABLE portfolio_evidence_packs
      ADD COLUMN recipient_name VARCHAR(120) NULL,
      ADD COLUMN purpose VARCHAR(200) NULL`);

    await q.query(`CREATE TABLE growth_assess_followups (
      id CHAR(36) NOT NULL PRIMARY KEY,
      assessment_id CHAR(36) NOT NULL,
      company_id CHAR(36) NOT NULL,
      asked_by INT NOT NULL,
      candidate_id INT NOT NULL,
      reviewer_type VARCHAR(16) NOT NULL,
      question VARCHAR(1200) NOT NULL,
      response TEXT NULL,
      asked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      answered_at DATETIME(3) NULL,
      KEY ix_growth_assess_followup_assessment (assessment_id, asked_at),
      KEY ix_growth_assess_followup_candidate (candidate_id, answered_at, asked_at),
      CONSTRAINT fk_growth_assess_followup_assessment FOREIGN KEY (assessment_id) REFERENCES growth_company_assessments(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_followup_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_followup_reviewer FOREIGN KEY (asked_by) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_followup_candidate FOREIGN KEY (candidate_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(`SELECT
      (SELECT COUNT(*) FROM growth_assess_followups) AS followups,
      (SELECT COUNT(*) FROM portfolio_works WHERE contribution_summary<>'' OR outcome_summary<>'') AS attributed_work,
      (SELECT COUNT(*) FROM portfolio_evidence_packs WHERE recipient_name IS NOT NULL OR purpose IS NOT NULL) AS targeted_packs`) as Array<Record<string, number | string>>;
    if (Object.values(rows[0] ?? {}).some(value => Number(value) > 0)) {
      throw new Error("Rollback blocked: candidate attribution or reviewer follow-up data would be lost.");
    }
    await q.query("DROP TABLE growth_assess_followups");
    await q.query("ALTER TABLE portfolio_evidence_packs DROP COLUMN purpose, DROP COLUMN recipient_name");
    await q.query("ALTER TABLE portfolio_works DROP COLUMN outcome_summary, DROP COLUMN contribution_summary");
  }
}
