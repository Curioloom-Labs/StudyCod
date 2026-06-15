import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Course templates (Phase 2): courses → modules → items. Reusable content that
 * is later forked onto Classes (P2.2). Additive and idempotent.
 */
export class AddCourseTemplates1749600000000 implements MigrationInterface {
  name = "AddCourseTemplates1749600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const courses = await queryRunner.query("SHOW TABLES LIKE 'courses'");
    if (!Array.isArray(courses) || courses.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`courses\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`org_id\` INT NULL,
          \`title\` VARCHAR(200) NOT NULL,
          \`description\` TEXT NULL,
          \`language\` ENUM('JAVA','PYTHON','CPP') NOT NULL,
          \`status\` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
          \`created_by_user_id\` INT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_course_org\` (\`org_id\`),
          CONSTRAINT \`fk_course_org\` FOREIGN KEY (\`org_id\`) REFERENCES \`organizations\`(\`id\`) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    const modules = await queryRunner.query("SHOW TABLES LIKE 'course_modules'");
    if (!Array.isArray(modules) || modules.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`course_modules\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`course_id\` INT NOT NULL,
          \`title\` VARCHAR(200) NOT NULL,
          \`order\` INT NOT NULL DEFAULT 0,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_module_course\` (\`course_id\`),
          CONSTRAINT \`fk_module_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    const items = await queryRunner.query("SHOW TABLES LIKE 'course_items'");
    if (!Array.isArray(items) || items.length === 0) {
      await queryRunner.query(`
        CREATE TABLE \`course_items\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`module_id\` INT NOT NULL,
          \`kind\` ENUM('THEORY','PAGE','CODE_TASK','WEB_TASK','QUIZ','MANUAL') NOT NULL,
          \`title\` VARCHAR(255) NOT NULL,
          \`order\` INT NOT NULL DEFAULT 0,
          \`content\` TEXT NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_item_module\` (\`module_id\`),
          CONSTRAINT \`fk_item_module\` FOREIGN KEY (\`module_id\`) REFERENCES \`course_modules\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ["course_items", "course_modules", "courses"]) {
      const exists = await queryRunner.query(`SHOW TABLES LIKE '${table}'`);
      if (Array.isArray(exists) && exists.length > 0) {
        await queryRunner.query(`DROP TABLE \`${table}\``);
      }
    }
  }
}
