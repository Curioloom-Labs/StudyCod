import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * COPPA/FERPA/GDPR-K hooks: age + parental-consent fields on students.
 * Additive and idempotent.
 */
export class AddStudentConsentFields1749500000000 implements MigrationInterface {
  name = "AddStudentConsentFields1749500000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'students'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const birth = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'birth_date'");
    if (!Array.isArray(birth) || birth.length === 0) {
      await queryRunner.query("ALTER TABLE `students` ADD COLUMN `birth_date` DATE NULL AFTER `email`");
    }
    const consent = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'parental_consent_at'");
    if (!Array.isArray(consent) || consent.length === 0) {
      await queryRunner.query("ALTER TABLE `students` ADD COLUMN `parental_consent_at` TIMESTAMP NULL AFTER `birth_date`");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'students'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const consent = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'parental_consent_at'");
    if (Array.isArray(consent) && consent.length > 0) {
      await queryRunner.query("ALTER TABLE `students` DROP COLUMN `parental_consent_at`");
    }
    const birth = await queryRunner.query("SHOW COLUMNS FROM `students` LIKE 'birth_date'");
    if (Array.isArray(birth) && birth.length > 0) {
      await queryRunner.query("ALTER TABLE `students` DROP COLUMN `birth_date`");
    }
  }
}
