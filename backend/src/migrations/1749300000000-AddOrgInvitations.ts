import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Organization invitations (see entities/OrgInvitation). Additive; nothing else
 * is touched. Idempotent.
 */
export class AddOrgInvitations1749300000000 implements MigrationInterface {
  name = "AddOrgInvitations1749300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'org_invitations'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`org_invitations\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`org_id\` INT NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`role\` ENUM('ORG_ADMIN','TEACHER','ASSISTANT','STUDENT','PARENT') NOT NULL,
        \`token\` VARCHAR(80) NOT NULL,
        \`status\` ENUM('PENDING','ACCEPTED','REVOKED') NOT NULL DEFAULT 'PENDING',
        \`invited_by_user_id\` INT NULL,
        \`accepted_by_user_id\` INT NULL,
        \`expires_at\` TIMESTAMP NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`idx_invite_token\` (\`token\`),
        INDEX \`idx_invite_org\` (\`org_id\`),
        CONSTRAINT \`fk_invite_org\` FOREIGN KEY (\`org_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'org_invitations'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `org_invitations`");
    }
  }
}
