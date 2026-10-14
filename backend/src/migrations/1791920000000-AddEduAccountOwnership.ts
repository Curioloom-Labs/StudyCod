import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddEduAccountOwnership1791920000000 implements MigrationInterface {
  name = "AddEduAccountOwnership1791920000000";
  async up(runner: QueryRunner): Promise<void> {
    // Issuer provenance survives activation. This can resume after MySQL DDL
    // auto-commit without resetting an already activated account on repetition.
    if (!(await runner.hasColumn("users", "edu_account_setup_required"))) await runner.query("ALTER TABLE users ADD edu_account_setup_required TINYINT NOT NULL DEFAULT 0");
    if (!(await runner.hasColumn("users", "edu_issuer_org_id"))) await runner.query("ALTER TABLE users ADD edu_issuer_org_id INT NULL");
    await runner.query(`UPDATE users u JOIN (
      SELECT target_id, MIN(org_id) org_id FROM audit_logs
      WHERE action = 'org.staff_account.create' AND target_type = 'user' AND org_id IS NOT NULL GROUP BY target_id
    ) issued ON issued.target_id = u.id
    SET u.edu_account_setup_required = 1, u.edu_issuer_org_id = issued.org_id
    WHERE u.user_mode <> 'CONTEST' AND u.edu_issuer_org_id IS NULL`);
  }
  async down(runner: QueryRunner): Promise<void> {
    if (await runner.hasColumn("users", "edu_issuer_org_id")) await runner.query("ALTER TABLE users DROP COLUMN edu_issuer_org_id");
    if (await runner.hasColumn("users", "edu_account_setup_required")) await runner.query("ALTER TABLE users DROP COLUMN edu_account_setup_required");
  }
}
