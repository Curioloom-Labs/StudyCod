import type { MigrationInterface, QueryRunner } from "typeorm";

/** EDU onboarding metadata and the organization type selected during signup. */
export class AddEduOrganizationOnboarding1752900000000 implements MigrationInterface {
  name = "AddEduOrganizationOnboarding1752900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orgColumns = await queryRunner.query("SHOW COLUMNS FROM `organizations` LIKE 'institution_type'");
    if (!Array.isArray(orgColumns) || orgColumns.length === 0) {
      await queryRunner.query("ALTER TABLE `organizations` ADD COLUMN `institution_type` VARCHAR(32) NOT NULL DEFAULT 'OTHER' AFTER `name`");
    }

    const userColumns = await queryRunner.query("SHOW COLUMNS FROM `users` LIKE 'middle_name'");
    if (!Array.isArray(userColumns) || userColumns.length === 0) {
      await queryRunner.query("ALTER TABLE `users` ADD COLUMN `middle_name` VARCHAR(100) NULL AFTER `first_name`");
    }

    const intents = await queryRunner.query("SHOW TABLES LIKE 'edu_registration_intents'");
    if (!Array.isArray(intents) || intents.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`edu_registration_intents\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`organization_name\` VARCHAR(200) NOT NULL,
          \`institution_type\` VARCHAR(32) NOT NULL,
          \`expires_at\` TIMESTAMP NOT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`uq_edu_registration_intent_user\` (\`user_id\`),
          CONSTRAINT \`fk_edu_registration_intent_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const intents = await queryRunner.query("SHOW TABLES LIKE 'edu_registration_intents'");
    if (Array.isArray(intents) && intents.length > 0) await queryRunner.query("DROP TABLE `edu_registration_intents`");

    const userColumns = await queryRunner.query("SHOW COLUMNS FROM `users` LIKE 'middle_name'");
    if (Array.isArray(userColumns) && userColumns.length > 0) await queryRunner.query("ALTER TABLE `users` DROP COLUMN `middle_name`");

    const orgColumns = await queryRunner.query("SHOW COLUMNS FROM `organizations` LIKE 'institution_type'");
    if (Array.isArray(orgColumns) && orgColumns.length > 0) await queryRunner.query("ALTER TABLE `organizations` DROP COLUMN `institution_type`");
  }
}
