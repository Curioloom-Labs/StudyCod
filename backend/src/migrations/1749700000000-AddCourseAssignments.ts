import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Course assignments — the fork-on-assign record linking a course template to a
 * class, with a per-item origin map for the opt-in pull. Additive, idempotent.
 */
export class AddCourseAssignments1749700000000 implements MigrationInterface {
  name = "AddCourseAssignments1749700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (Array.isArray(existing) && existing.length > 0) return;

    await queryRunner.query(`
      CREATE TABLE \`course_assignments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`class_id\` INT NOT NULL,
        \`course_id\` INT NOT NULL,
        \`origin_map\` TEXT NULL,
        \`forked_at\` TIMESTAMP NOT NULL,
        \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        INDEX \`idx_assignment_class\` (\`class_id\`),
        CONSTRAINT \`fk_assignment_class\` FOREIGN KEY (\`class_id\`) REFERENCES \`classes\`(\`id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_assignment_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const existing = await queryRunner.query("SHOW TABLES LIKE 'course_assignments'");
    if (Array.isArray(existing) && existing.length > 0) {
      await queryRunner.query("DROP TABLE `course_assignments`");
    }
  }
}
