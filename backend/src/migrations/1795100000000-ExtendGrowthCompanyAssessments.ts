import type { MigrationInterface, QueryRunner } from "typeorm";

export class ExtendGrowthCompanyAssessments1795100000000 implements MigrationInterface {
  name = "ExtendGrowthCompanyAssessments1795100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE growth_company_assessments
      MODIFY candidate_id INT NULL,
      ADD candidate_email VARCHAR(320) NULL AFTER candidate_id,
      ADD invitation_token_hash CHAR(64) NULL,
      ADD invitation_expires_at DATETIME(3) NULL,
      ADD invitation_sent_at DATETIME(3) NULL,
      ADD answers_submitted_at DATETIME(3) NULL,
      ADD selected_portfolio_json LONGTEXT NULL,
      ADD estimated_minutes SMALLINT UNSIGNED NULL,
      ADD deadline_at DATETIME(3) NULL,
      ADD ai_policy VARCHAR(24) NULL,
      ADD UNIQUE KEY uq_growth_company_invitation_token (invitation_token_hash),
      ADD KEY ix_growth_company_candidate_email (company_id,candidate_email,status,created_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT COUNT(*) AS row_count FROM growth_company_assessments
       WHERE candidate_id IS NULL OR candidate_email IS NOT NULL OR invitation_token_hash IS NOT NULL
         OR answers_submitted_at IS NOT NULL OR selected_portfolio_json IS NOT NULL`,
    ) as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: Assess invitations, submitted answers, or portfolio evidence would be lost.");
    }

    await queryRunner.query(`ALTER TABLE growth_company_assessments
      DROP KEY ix_growth_company_candidate_email,
      DROP KEY uq_growth_company_invitation_token,
      DROP COLUMN selected_portfolio_json,
      DROP COLUMN answers_submitted_at,
      DROP COLUMN invitation_sent_at,
      DROP COLUMN invitation_expires_at,
      DROP COLUMN invitation_token_hash,
      DROP COLUMN ai_policy,
      DROP COLUMN deadline_at,
      DROP COLUMN estimated_minutes,
      DROP COLUMN candidate_email,
      MODIFY candidate_id INT NOT NULL`);
  }
}
