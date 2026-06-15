import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Parent↔student links + a `student_id` on org_invitations so a PARENT invite
 * can target a specific child. Additive and idempotent.
 */
export class AddParentLinks1749400000000 implements MigrationInterface {
  name = "AddParentLinks1749400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const parentLinks = await queryRunner.query("SHOW TABLES LIKE 'parent_links'");
    if (!Array.isArray(parentLinks) || parentLinks.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`parent_links\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`parent_user_id\` INT NOT NULL,
          \`student_id\` INT NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`uq_parent_student\` (\`parent_user_id\`, \`student_id\`),
          CONSTRAINT \`fk_parentlink_user\` FOREIGN KEY (\`parent_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_parentlink_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    const inviteTables = await queryRunner.query("SHOW TABLES LIKE 'org_invitations'");
    if (Array.isArray(inviteTables) && inviteTables.length > 0) {
      const studentCol = await queryRunner.query("SHOW COLUMNS FROM `org_invitations` LIKE 'student_id'");
      if (!Array.isArray(studentCol) || studentCol.length === 0) {
        await queryRunner.query("ALTER TABLE `org_invitations` ADD COLUMN `student_id` INT NULL AFTER `role`");
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const inviteTables = await queryRunner.query("SHOW TABLES LIKE 'org_invitations'");
    if (Array.isArray(inviteTables) && inviteTables.length > 0) {
      const studentCol = await queryRunner.query("SHOW COLUMNS FROM `org_invitations` LIKE 'student_id'");
      if (Array.isArray(studentCol) && studentCol.length > 0) {
        await queryRunner.query("ALTER TABLE `org_invitations` DROP COLUMN `student_id`");
      }
    }
    const parentLinks = await queryRunner.query("SHOW TABLES LIKE 'parent_links'");
    if (Array.isArray(parentLinks) && parentLinks.length > 0) {
      await queryRunner.query("DROP TABLE `parent_links`");
    }
  }
}
