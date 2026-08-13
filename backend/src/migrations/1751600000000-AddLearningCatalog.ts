import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Introduces the global learning catalog. A course is now a domain, while a
 * CourseVariant owns the executable runtime. Progress, prerequisites and IAD
 * are stored per user/course context rather than on the user profile.
 */
export class AddLearningCatalog1751600000000 implements MigrationInterface {
  name = "AddLearningCatalog1751600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = async (table: string): Promise<boolean> => {
      const rows = await queryRunner.query("SHOW TABLES LIKE ?", [table]);
      return Array.isArray(rows) && rows.length > 0;
    };
    const hasColumn = async (table: string, column: string): Promise<boolean> => {
      const rows = await queryRunner.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      return Array.isArray(rows) && rows.length > 0;
    };

    if (await tableExists("courses")) {
      if (!(await hasColumn("courses", "catalog_key"))) {
        await queryRunner.query("ALTER TABLE `courses` ADD COLUMN `catalog_key` VARCHAR(120) NULL");
      }
      if (!(await hasColumn("courses", "level"))) {
        await queryRunner.query("ALTER TABLE `courses` ADD COLUMN `level` ENUM('FOUNDATION','SPECIALIZATION','ADVANCED') NOT NULL DEFAULT 'FOUNDATION'");
      }
      if (!(await hasColumn("courses", "is_base"))) {
        await queryRunner.query("ALTER TABLE `courses` ADD COLUMN `is_base` TINYINT(1) NOT NULL DEFAULT 0");
      }
      const courseIndexes = await queryRunner.query("SHOW INDEX FROM `courses` WHERE Key_name = 'uq_courses_catalog_key'");
      if (!Array.isArray(courseIndexes) || courseIndexes.length === 0) {
        await queryRunner.query("ALTER TABLE `courses` ADD UNIQUE KEY `uq_courses_catalog_key` (`catalog_key`)");
      }
    }

    if (!(await tableExists("course_variants"))) {
      await queryRunner.query(`
        CREATE TABLE \`course_variants\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`course_id\` INT NOT NULL,
          \`runtime\` ENUM('JAVA','PYTHON','CPP') NOT NULL,
          \`title\` VARCHAR(200) NOT NULL,
          \`status\` ENUM('DRAFT','PUBLISHED') NOT NULL DEFAULT 'DRAFT',
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_course_variant_runtime\` (\`course_id\`, \`runtime\`),
          CONSTRAINT \`fk_course_variant_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    // Preserve existing EDU courses as variants before the old course-level
    // language field is removed in the follow-up cleanup migration.
    if (await hasColumn("courses", "language")) {
      await queryRunner.query(`
        INSERT INTO \`course_variants\` (\`course_id\`, \`runtime\`, \`title\`, \`status\`)
        SELECT c.id, c.language, c.title, c.status
        FROM \`courses\` c
        LEFT JOIN \`course_variants\` v ON v.course_id = c.id AND v.runtime = c.language
        WHERE v.id IS NULL
      `);
    }

    const courseCount = await queryRunner.query("SELECT COUNT(*) AS total FROM `courses` WHERE `catalog_key` IS NOT NULL");
    if (Number(courseCount?.[0]?.total ?? 0) === 0) {
      await queryRunner.query(`
        INSERT INTO \`courses\` (\`org_id\`, \`title\`, \`description\`, \`language\`, \`catalog_key\`, \`level\`, \`is_base\`, \`status\`)
        VALUES
          (NULL, 'Python Core', 'Повна фундаментальна база Python: синтаксис, дані, керування потоком, функції, модулі, ООП та робота з помилками.', 'PYTHON', 'python-core', 'FOUNDATION', 1, 'PUBLISHED'),
          (NULL, 'Java Core', 'Фундаментальна база Java від синтаксису до об’єктно-орієнтованого програмування та колекцій.', 'JAVA', 'java-core', 'FOUNDATION', 1, 'PUBLISHED'),
          (NULL, 'C++ Core', 'Фундаментальна база C++: типи, керування пам’яттю, функції, класи та стандартна бібліотека.', 'CPP', 'cpp-core', 'FOUNDATION', 1, 'PUBLISHED'),
          (NULL, 'Flask', 'Створення вебзастосунків на Flask після повного Python Core.', 'PYTHON', 'flask', 'SPECIALIZATION', 0, 'PUBLISHED'),
          (NULL, 'FastAPI', 'Створення сучасних API на FastAPI після повного Python Core.', 'PYTHON', 'fastapi', 'SPECIALIZATION', 0, 'PUBLISHED'),
          (NULL, 'Computer Vision', 'Обробка зображень та комп’ютерний зір після Python Core і профільної теорії.', 'PYTHON', 'computer-vision', 'ADVANCED', 0, 'DRAFT')
      `);
    }

    const catalogRuntimes: Array<[string, string, string]> = [
      ["python-core", "PYTHON", "Python"],
      ["java-core", "JAVA", "Java"],
      ["cpp-core", "CPP", "C++"],
      ["flask", "PYTHON", "Python"],
      ["fastapi", "PYTHON", "Python"],
      ["computer-vision", "PYTHON", "Python"]
    ];
    for (const [catalogKey, runtime, title] of catalogRuntimes) {
      await queryRunner.query(`
        INSERT INTO \`course_variants\` (\`course_id\`, \`runtime\`, \`title\`, \`status\`)
        SELECT c.id, ?, ?, CASE WHEN c.status = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'DRAFT' END
        FROM \`courses\` c
        LEFT JOIN \`course_variants\` v ON v.course_id = c.id AND v.runtime = ?
        WHERE c.catalog_key = ? AND v.id IS NULL
      `, [runtime, title, runtime, catalogKey]);
    }

    if (!(await tableExists("course_dependencies"))) {
      await queryRunner.query(`
        CREATE TABLE \`course_dependencies\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`course_id\` INT NOT NULL,
          \`prerequisite_course_id\` INT NOT NULL,
          \`required_completion_percent\` DECIMAL(5,2) NOT NULL DEFAULT 100,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_course_dependency\` (\`course_id\`, \`prerequisite_course_id\`),
          CONSTRAINT \`fk_dependency_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_dependency_prerequisite\` FOREIGN KEY (\`prerequisite_course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    await queryRunner.query(`
      INSERT IGNORE INTO \`course_dependencies\` (\`course_id\`, \`prerequisite_course_id\`, \`required_completion_percent\`)
      SELECT child.id, base.id, 100
      FROM \`courses\` child CROSS JOIN \`courses\` base
      WHERE child.catalog_key IN ('flask', 'fastapi') AND base.catalog_key = 'python-core'
    `);
    await queryRunner.query(`
      INSERT IGNORE INTO \`course_dependencies\` (\`course_id\`, \`prerequisite_course_id\`, \`required_completion_percent\`)
      SELECT child.id, base.id, 100
      FROM \`courses\` child CROSS JOIN \`courses\` base
      WHERE child.catalog_key = 'computer-vision' AND base.catalog_key = 'python-core'
    `);

    if (!(await tableExists("user_course_enrollments"))) {
      await queryRunner.query(`
        CREATE TABLE \`user_course_enrollments\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`user_id\` INT NOT NULL,
          \`course_id\` INT NOT NULL,
          \`variant_id\` INT NOT NULL,
          \`status\` ENUM('LOCKED','AVAILABLE','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'AVAILABLE',
          \`completion_percent\` DECIMAL(5,2) NOT NULL DEFAULT 0,
          \`mastery_score\` DECIMAL(5,3) NOT NULL DEFAULT 0,
          \`final_assessment_passed\` TINYINT(1) NOT NULL DEFAULT 0,
          \`completed_at\` TIMESTAMP NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_user_course_variant\` (\`user_id\`, \`variant_id\`),
          INDEX \`idx_user_enrollment_status\` (\`user_id\`, \`status\`),
          CONSTRAINT \`fk_enrollment_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_enrollment_course\` FOREIGN KEY (\`course_id\`) REFERENCES \`courses\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_enrollment_variant\` FOREIGN KEY (\`variant_id\`) REFERENCES \`course_variants\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    // Existing users get an enrollment in their current base path. This is a
    // data-preserving bridge; application code will stop reading users.lang in
    // the next migration once all clients use the catalog context.
    const usersHaveLang = await hasColumn("users", "lang");
    if (usersHaveLang) {
      await queryRunner.query(`
        INSERT IGNORE INTO \`user_course_enrollments\` (\`user_id\`, \`course_id\`, \`variant_id\`, \`status\`, \`mastery_score\`)
        SELECT u.id, c.id, v.id, 'AVAILABLE',
          CASE u.lang WHEN 'PYTHON' THEN COALESCE(u.difus_python, 0)
                      WHEN 'CPP' THEN COALESCE(u.difus_cpp, 0)
                      ELSE COALESCE(u.difus_java, 0) END
        FROM \`users\` u
        JOIN \`courses\` c ON BINARY c.catalog_key = BINARY CASE u.lang WHEN 'PYTHON' THEN 'python-core' WHEN 'CPP' THEN 'cpp-core' ELSE 'java-core' END
        JOIN \`course_variants\` v ON v.course_id = c.id AND BINARY v.runtime = BINARY u.lang
      `);
    }

    if (!(await tableExists("course_item_progress"))) {
      await queryRunner.query(`
        CREATE TABLE \`course_item_progress\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`enrollment_id\` INT NOT NULL,
          \`item_id\` INT NOT NULL,
          \`status\` ENUM('NOT_STARTED','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'NOT_STARTED',
          \`score\` DECIMAL(5,2) NULL,
          \`completed_at\` TIMESTAMP NULL,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`uq_enrollment_item_progress\` (\`enrollment_id\`, \`item_id\`),
          CONSTRAINT \`fk_item_progress_enrollment\` FOREIGN KEY (\`enrollment_id\`) REFERENCES \`user_course_enrollments\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_item_progress_item\` FOREIGN KEY (\`item_id\`) REFERENCES \`course_items\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    if (!(await tableExists("learning_evidence"))) {
      await queryRunner.query(`
        CREATE TABLE \`learning_evidence\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`enrollment_id\` INT NOT NULL,
          \`skill_key\` VARCHAR(128) NULL,
          \`source_type\` ENUM('GRADE','QUIZ','THEORY','FINAL_ASSESSMENT','PLACEMENT') NOT NULL,
          \`source_id\` VARCHAR(128) NULL,
          \`score\` DECIMAL(5,3) NOT NULL,
          \`difficulty\` DECIMAL(5,3) NULL,
          \`model_version\` INT NOT NULL DEFAULT 2,
          \`created_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`),
          INDEX \`idx_learning_evidence_enrollment\` (\`enrollment_id\`, \`created_at\`),
          CONSTRAINT \`fk_learning_evidence_enrollment\` FOREIGN KEY (\`enrollment_id\`) REFERENCES \`user_course_enrollments\`(\`id\`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Forward-only migration: user progress and evidence must not be deleted by
    // an accidental rollback. A future data-retention migration can archive it.
  }
}
