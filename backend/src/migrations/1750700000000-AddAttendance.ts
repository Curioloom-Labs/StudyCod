import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-student/day attendance (see entities/Attendance). Tier 1. Idempotent.
 * EDU-only; additive (new table) — does not touch Personal/Contest.
 *
 * ⚠ NOT verified against a live DB in this session — run `npm run db:migrate`
 * on a copy before prod.
 */
export class AddAttendance1750700000000 implements MigrationInterface {
  name = "AddAttendance1750700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'attendance'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`attendance\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`class_id\` INT NOT NULL,
        \`student_id\` INT NOT NULL,
        \`date\` DATE NOT NULL,
        \`status\` ENUM('PRESENT','ABSENT','LATE','EXCUSED') NOT NULL DEFAULT 'PRESENT',
        \`lesson_id\` INT NULL,
        \`recorded_by_user_id\` INT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`uq_attendance_class_student_date\` (\`class_id\`, \`student_id\`, \`date\`),
        INDEX \`idx_attendance_class_date\` (\`class_id\`, \`date\`),
        CONSTRAINT \`fk_attendance_class\` FOREIGN KEY (\`class_id\`) REFERENCES \`classes\` (\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_attendance_student\` FOREIGN KEY (\`student_id\`) REFERENCES \`students\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'attendance'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `attendance`");
    }
  }
}
