import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds manual-grade columns to quiz_attempts: `manual_score` (teacher-awarded
 * points for OPEN_TEXT questions) and `final_percent` (auto+manual). Additive,
 * idempotent.
 */
export class AddQuizAttemptManualGrade1750400000000 implements MigrationInterface {
  name = "AddQuizAttemptManualGrade1750400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'quiz_attempts'");
    if (!Array.isArray(tables) || tables.length === 0) return;

    const manual = await queryRunner.query("SHOW COLUMNS FROM `quiz_attempts` LIKE 'manual_score'");
    if (!Array.isArray(manual) || manual.length === 0) {
      await queryRunner.query("ALTER TABLE `quiz_attempts` ADD COLUMN `manual_score` DECIMAL(7,2) NOT NULL DEFAULT 0");
    }
    const finalPct = await queryRunner.query("SHOW COLUMNS FROM `quiz_attempts` LIKE 'final_percent'");
    if (!Array.isArray(finalPct) || finalPct.length === 0) {
      await queryRunner.query("ALTER TABLE `quiz_attempts` ADD COLUMN `final_percent` INT NULL");
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = await queryRunner.query("SHOW TABLES LIKE 'quiz_attempts'");
    if (!Array.isArray(tables) || tables.length === 0) return;
    const finalPct = await queryRunner.query("SHOW COLUMNS FROM `quiz_attempts` LIKE 'final_percent'");
    if (Array.isArray(finalPct) && finalPct.length > 0) {
      await queryRunner.query("ALTER TABLE `quiz_attempts` DROP COLUMN `final_percent`");
    }
    const manual = await queryRunner.query("SHOW COLUMNS FROM `quiz_attempts` LIKE 'manual_score'");
    if (Array.isArray(manual) && manual.length > 0) {
      await queryRunner.query("ALTER TABLE `quiz_attempts` DROP COLUMN `manual_score`");
    }
  }
}
