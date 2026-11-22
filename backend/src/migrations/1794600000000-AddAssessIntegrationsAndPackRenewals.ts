import type { MigrationInterface, QueryRunner } from "typeorm";

export class AddAssessIntegrationsAndPackRenewals1794600000000 implements MigrationInterface {
  name = "AddAssessIntegrationsAndPackRenewals1794600000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE growth_company_assessments
      ADD COLUMN role_profile VARCHAR(32) NOT NULL DEFAULT 'SOFTWARE_ENGINEERING',
      ADD COLUMN rubric_json TEXT NULL,
      ADD COLUMN decision_json TEXT NULL`);

    await q.query(`ALTER TABLE portfolio_evidence_packs
      ADD COLUMN renewed_from_pack_id CHAR(36) NULL,
      ADD COLUMN renewal_key_hash CHAR(64) NULL,
      ADD UNIQUE KEY uq_portfolio_evidence_pack_renewal (renewed_from_pack_id)`);

    await q.query(`CREATE TABLE growth_assess_api_keys (
      id CHAR(36) NOT NULL PRIMARY KEY,
      company_id CHAR(36) NOT NULL,
      created_by INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      key_prefix VARCHAR(24) NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      scopes_json TEXT NOT NULL,
      last_used_at DATETIME(3) NULL,
      revoked_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY ix_growth_assess_api_key_company (company_id, revoked_at, created_at),
      CONSTRAINT fk_growth_assess_api_key_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_api_key_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await q.query(`CREATE TABLE growth_assess_webhooks (
      id CHAR(36) NOT NULL PRIMARY KEY,
      company_id CHAR(36) NOT NULL,
      created_by INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      target_url VARCHAR(2048) NOT NULL,
      encrypted_secret TEXT NOT NULL,
      events_json TEXT NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY ix_growth_assess_webhook_company (company_id, enabled, created_at),
      CONSTRAINT fk_growth_assess_webhook_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_webhook_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    await q.query(`CREATE TABLE growth_assess_webhook_deliveries (
      id CHAR(36) NOT NULL PRIMARY KEY,
      event_id CHAR(36) NOT NULL,
      webhook_id CHAR(36) NOT NULL,
      company_id CHAR(36) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
      attempt_count INT NOT NULL DEFAULT 0,
      next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      last_http_status SMALLINT NULL,
      last_error VARCHAR(512) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      completed_at DATETIME(3) NULL,
      UNIQUE KEY uq_growth_assess_webhook_event (webhook_id, event_id),
      KEY ix_growth_assess_webhook_delivery_due (status, next_attempt_at, created_at),
      KEY ix_growth_assess_webhook_delivery_company (company_id, created_at),
      CONSTRAINT fk_growth_assess_webhook_delivery_subscription FOREIGN KEY (webhook_id) REFERENCES growth_assess_webhooks(id) ON DELETE CASCADE,
      CONSTRAINT fk_growth_assess_webhook_delivery_company FOREIGN KEY (company_id) REFERENCES growth_companies(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = await q.query(`SELECT
      (SELECT COUNT(*) FROM growth_assess_api_keys) AS api_keys,
      (SELECT COUNT(*) FROM growth_assess_webhooks) AS webhooks,
      (SELECT COUNT(*) FROM growth_assess_webhook_deliveries) AS deliveries,
      (SELECT COUNT(*) FROM portfolio_evidence_packs WHERE renewed_from_pack_id IS NOT NULL OR renewal_key_hash IS NOT NULL) AS renewed_packs,
      (SELECT COUNT(*) FROM growth_company_assessments WHERE role_profile<>'SOFTWARE_ENGINEERING' OR rubric_json IS NOT NULL OR decision_json IS NOT NULL) AS customized_assessments`) as Array<Record<string, number | string>>;
    if (Object.values(rows[0] ?? {}).some(value => Number(value) > 0)) {
      throw new Error("Rollback blocked: Assess integrations, role rubrics, hiring decisions, or renewed Portfolio links would be lost.");
    }
    await q.query("DROP TABLE growth_assess_webhook_deliveries");
    await q.query("DROP TABLE growth_assess_webhooks");
    await q.query("DROP TABLE growth_assess_api_keys");
    await q.query(`ALTER TABLE portfolio_evidence_packs
      DROP INDEX uq_portfolio_evidence_pack_renewal,
      DROP COLUMN renewal_key_hash,
      DROP COLUMN renewed_from_pack_id`);
    await q.query(`ALTER TABLE growth_company_assessments
      DROP COLUMN decision_json,
      DROP COLUMN rubric_json,
      DROP COLUMN role_profile`);
  }
}
