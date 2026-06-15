import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Audit trail table (see entities/AuditLog). Foundation for the COPPA/FERPA
 * data-access journal and the future RBAC/role-change log. Idempotent.
 */
export class AddAuditLogs1749000000000 implements MigrationInterface {
  name = "AddAuditLogs1749000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'audit_logs'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`audit_logs\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`actor_type\` VARCHAR(16) NOT NULL,
        \`actor_id\` INT NULL,
        \`action\` VARCHAR(100) NOT NULL,
        \`target_type\` VARCHAR(32) NULL,
        \`target_id\` INT NULL,
        \`org_id\` INT NULL,
        \`metadata\` TEXT NULL,
        \`request_id\` VARCHAR(64) NULL,
        \`ip\` VARCHAR(64) NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_audit_target\` (\`target_type\`, \`target_id\`),
        INDEX \`idx_audit_actor\` (\`actor_type\`, \`actor_id\`),
        INDEX \`idx_audit_created\` (\`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'audit_logs'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `audit_logs`");
    }
  }
}
