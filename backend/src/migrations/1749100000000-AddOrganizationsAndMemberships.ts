import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * SaaS Phase 1 foundation: organizations (tenants) and memberships (per-org
 * roles). Purely additive — no existing table is touched and nothing is enforced
 * yet, so Personal/Contest/EDU behaviour is unchanged. Idempotent.
 */
export class AddOrganizationsAndMemberships1749100000000 implements MigrationInterface {
  name = "AddOrganizationsAndMemberships1749100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orgs = await queryRunner.query("SHOW TABLES LIKE 'organizations'");
    if (!Array.isArray(orgs) || orgs.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`organizations\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`name\` VARCHAR(200) NOT NULL,
          \`slug\` VARCHAR(80) NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`idx_org_slug\` (\`slug\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    const memberships = await queryRunner.query("SHOW TABLES LIKE 'memberships'");
    if (!Array.isArray(memberships) || memberships.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`memberships\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`org_id\` INT NOT NULL,
          \`role\` ENUM('ORG_ADMIN','TEACHER','ASSISTANT','STUDENT','PARENT') NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`uq_membership_user_org\` (\`user_id\`, \`org_id\`),
          CONSTRAINT \`fk_membership_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_membership_org\` FOREIGN KEY (\`org_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const memberships = await queryRunner.query("SHOW TABLES LIKE 'memberships'");
    if (Array.isArray(memberships) && memberships.length > 0) {
      await queryRunner.query("DROP TABLE `memberships`");
    }
    const orgs = await queryRunner.query("SHOW TABLES LIKE 'organizations'");
    if (Array.isArray(orgs) && orgs.length > 0) {
      await queryRunner.query("DROP TABLE `organizations`");
    }
  }
}
