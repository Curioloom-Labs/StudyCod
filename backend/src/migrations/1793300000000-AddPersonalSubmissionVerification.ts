import type { MigrationInterface, QueryRunner } from "typeorm";

/** Preserve the server-side verification facts needed to create truthful evidence. */
export class AddPersonalSubmissionVerification1793300000000 implements MigrationInterface {
  name = "AddPersonalSubmissionVerification1793300000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE grades
      ADD COLUMN verification_method VARCHAR(24) NULL,
      ADD COLUMN judge_verdict VARCHAR(8) NULL,
      ADD COLUMN tests_passed INT NULL,
      ADD COLUMN tests_total INT NULL,
      ADD KEY ix_grade_owner_verification (user_id,verification_method,judge_verdict,created_at)`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(
      "SELECT COUNT(*) AS row_count FROM grades WHERE verification_method IS NOT NULL OR judge_verdict IS NOT NULL OR tests_passed IS NOT NULL OR tests_total IS NOT NULL"
    ) as Array<{ row_count: number | string }>;
    if (Number(rows[0]?.row_count ?? 0) > 0) {
      throw new Error("Rollback blocked: saved submission verification facts exist. Export or migrate them before removing these columns.");
    }
    await q.query(`ALTER TABLE grades DROP INDEX ix_grade_owner_verification,
      DROP COLUMN verification_method,DROP COLUMN judge_verdict,DROP COLUMN tests_passed,DROP COLUMN tests_total`);
  }
}
