import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Manual-task student submissions (text + optional file). Additive, idempotent.
 */
export class AddManualSubmissions1750000000000 implements MigrationInterface {
  name = "AddManualSubmissions1750000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'manual_submissions'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`manual_submissions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`task_id\` INT NOT NULL,
        \`student_id\` INT NOT NULL,
        \`text\` TEXT NULL,
        \`file_storage_key\` VARCHAR(300) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`status\` ENUM('SUBMITTED','GRADED') NOT NULL DEFAULT 'SUBMITTED',
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_manual_task_student\` (\`task_id\`, \`student_id\`),
        CONSTRAINT \`fk_manual_task\` FOREIGN KEY (\`task_id\`) REFERENCES \`edu_tasks\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_manual_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'manual_submissions'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `manual_submissions`");
    }
  }
}
