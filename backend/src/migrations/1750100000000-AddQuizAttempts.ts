import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lesson quiz attempts for the new quiz engine (P2.5). Additive, idempotent.
 */
export class AddQuizAttempts1750100000000 implements MigrationInterface {
  name = "AddQuizAttempts1750100000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'quiz_attempts'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`quiz_attempts\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`lesson_id\` INT NOT NULL,
        \`student_id\` INT NOT NULL,
        \`answers_json\` TEXT NULL,
        \`auto_score\` DECIMAL(7,2) NOT NULL DEFAULT 0,
        \`max_score\` DECIMAL(7,2) NOT NULL DEFAULT 0,
        \`auto_percent\` INT NOT NULL DEFAULT 0,
        \`status\` ENUM('AUTO_GRADED','NEEDS_MANUAL','MANUAL_GRADED') NOT NULL DEFAULT 'AUTO_GRADED',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_quiz_lesson_student\` (\`lesson_id\`, \`student_id\`),
        CONSTRAINT \`fk_quiz_lesson\` FOREIGN KEY (\`lesson_id\`) REFERENCES \`edu_lessons\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_quiz_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'quiz_attempts'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `quiz_attempts`");
    }
  }
}
