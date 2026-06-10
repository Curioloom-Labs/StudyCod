import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Semester aggregation support:
 *  - widen `summary_grades.assessment_type` enum to include SEMESTER
 *  - make `summary_grades.topic_id` nullable (SEMESTER rows span topics)
 *  - add `summary_grades.semester` (which semester an aggregate belongs to)
 *  - add `topics_new.semester` (which semester a topic belongs to)
 *
 * Idempotent guards before each change.
 */
export class AddSemesterGrades1748700200000 implements MigrationInterface {
  name = "AddSemesterGrades1748700200000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const sgTables = await queryRunner.query("SHOW TABLES LIKE 'summary_grades'");
    if (Array.isArray(sgTables) && sgTables.length > 0) {
      // Widen the assessment_type enum (only if SEMESTER not already present).
      const typeCol = await queryRunner.query("SHOW COLUMNS FROM `summary_grades` LIKE 'assessment_type'");
      const typeDef = Array.isArray(typeCol) && typeCol.length > 0 ? String((typeCol[0] as any).Type || "") : "";
      if (typeDef && !/SEMESTER/i.test(typeDef)) {
        await queryRunner.query(
          "ALTER TABLE `summary_grades` MODIFY COLUMN `assessment_type` ENUM('PRACTICE','INTERMEDIATE','CONTROL','SEMESTER') NOT NULL DEFAULT 'INTERMEDIATE'"
        );
      }

      // Make topic_id nullable.
      const topicCol = await queryRunner.query("SHOW COLUMNS FROM `summary_grades` LIKE 'topic_id'");
      const topicNullable = Array.isArray(topicCol) && topicCol.length > 0 ? String((topicCol[0] as any).Null || "") : "";
      if (topicNullable && topicNullable.toUpperCase() !== "YES") {
        await queryRunner.query("ALTER TABLE `summary_grades` MODIFY COLUMN `topic_id` INT NULL");
      }

      // Add semester column.
      const semCol = await queryRunner.query("SHOW COLUMNS FROM `summary_grades` LIKE 'semester'");
      if (!Array.isArray(semCol) || semCol.length === 0) {
        await queryRunner.query("ALTER TABLE `summary_grades` ADD COLUMN `semester` INT NULL");
      }
    }

    const topicTables = await queryRunner.query("SHOW TABLES LIKE 'topics_new'");
    if (Array.isArray(topicTables) && topicTables.length > 0) {
      const semCol = await queryRunner.query("SHOW COLUMNS FROM `topics_new` LIKE 'semester'");
      if (!Array.isArray(semCol) || semCol.length === 0) {
        await queryRunner.query("ALTER TABLE `topics_new` ADD COLUMN `semester` INT NULL AFTER `thematic_formula`");
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const topicSem = await queryRunner.query("SHOW COLUMNS FROM `topics_new` LIKE 'semester'");
    if (Array.isArray(topicSem) && topicSem.length > 0) {
      await queryRunner.query("ALTER TABLE `topics_new` DROP COLUMN `semester`");
    }

    // Remove any SEMESTER aggregate rows before narrowing the enum back.
    await queryRunner.query("DELETE FROM `summary_grades` WHERE `assessment_type` = 'SEMESTER'");

    const sgSem = await queryRunner.query("SHOW COLUMNS FROM `summary_grades` LIKE 'semester'");
    if (Array.isArray(sgSem) && sgSem.length > 0) {
      await queryRunner.query("ALTER TABLE `summary_grades` DROP COLUMN `semester`");
    }

    await queryRunner.query(
      "ALTER TABLE `summary_grades` MODIFY COLUMN `assessment_type` ENUM('PRACTICE','INTERMEDIATE','CONTROL') NOT NULL DEFAULT 'INTERMEDIATE'"
    );
  }
}
