import { AppDataSource } from "../data-source";
import { logger } from "./logger";

// Keep legacy db patch code readable while ensuring logs go through the centralized logger.
// (This shadows the global `console` only within this module.)
const console = {
  warn: (...args: any[]) => logger.warn(args[0], args[1]),
  log: (...args: any[]) => logger.info(args[0], args[1]),
  error: (...args: any[]) => logger.error(args[0], args[1])
} as const;

export async function applyDbPatches(): Promise<void> {
  await ensureTestDataIsHiddenColumn();
  await ensureTestDataKindColumn();
  await backfillTestDataKindFromIsHidden();
  await ensureTestDataTextColumns();
  await ensureEduGradesScoringColumns();
  await ensureEduPerformanceIndexes();
  await ensureUsersPlacementColumns();
  await fixIntroPythonFixedSumTaskTests();
  await ensureMaintenanceStateTable();
  await ensureMaintenanceStateSingletonRow();
  await ensureTheoryBlocksTable();
  await ensureTheoryBlockRevisionsTable();
  await ensureSupportTicketsTable();
  await ensureSupportChatTables();
  await migrateLegacySupportTicketsToChatIfNeeded();
  await ensureLibraryTasksTable();
  await ensureLibraryTasksOjColumns();
  await ensureLibraryTaskRevisionsTable();
  await ensureLibraryTaskAttemptsTable();
  await ensureLibraryTaskAttemptsMultiLangColumns();
  await ensureTaskTheoriesLibraryTaskColumn();
  await ensureTestDataLibraryTaskColumn();
  await ensureTopicsTheoryBlockIdColumn();
  await ensureTopicsNewTheoryBlockIdColumn();
  await migrateLegacyTopicTheoryMarkdownToTheoryBlocks();
  await normalizeAndSanitizeTheoryBlocks();
  await fixNoInputFixedExampleTaskTests();
}

async function ensureTheoryBlockRevisionsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'theory_block_revisions'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table theory_block_revisions is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE theory_block_revisions (
        id INT NOT NULL AUTO_INCREMENT,
        theory_block_id INT NOT NULL,
        version INT NOT NULL,
        action ENUM('CREATE','UPDATE','ROLLBACK','AUTO') NOT NULL DEFAULT 'UPDATE',
        comment VARCHAR(255) NULL,
        snapshot MEDIUMTEXT NOT NULL,
        created_by_user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_theory_block_revisions_block_version (theory_block_id, version),
        INDEX idx_theory_block_revisions_block_created (theory_block_id, created_at),
        CONSTRAINT fk_theory_block_revisions_block FOREIGN KEY (theory_block_id) REFERENCES theory_blocks(id) ON DELETE CASCADE,
        CONSTRAINT fk_theory_block_revisions_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table theory_block_revisions");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure theory_block_revisions table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureLibraryTaskRevisionsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'library_task_revisions'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table library_task_revisions is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE library_task_revisions (
        id INT NOT NULL AUTO_INCREMENT,
        library_task_id INT NOT NULL,
        version INT NOT NULL,
        action ENUM('APPROVE','ROLLBACK','MANUAL') NOT NULL DEFAULT 'APPROVE',
        comment VARCHAR(255) NULL,
        snapshot MEDIUMTEXT NOT NULL,
        created_by_user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_library_task_revisions_task_version (library_task_id, version),
        INDEX idx_library_task_revisions_task_created (library_task_id, created_at),
        CONSTRAINT fk_library_task_revisions_task FOREIGN KEY (library_task_id) REFERENCES library_tasks(id) ON DELETE CASCADE,
        CONSTRAINT fk_library_task_revisions_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table library_task_revisions");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure library_task_revisions table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureLibraryTaskAttemptsMultiLangColumns(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'library_task_attempts'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const hasColumn = async (name: string): Promise<boolean> => {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `library_task_attempts` LIKE ?", [name])) as Array<any>;
      return Array.isArray(col) && col.length > 0;
    };

    if (!(await hasColumn("draft_code_by_language"))) {
      logger.warn("[DB Patch] Column library_task_attempts.draft_code_by_language is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `library_task_attempts` ADD COLUMN `draft_code_by_language` MEDIUMTEXT NULL AFTER `draft_code`");
      logger.info("[DB Patch] Added column library_task_attempts.draft_code_by_language");
    }

    if (!(await hasColumn("last_submitted_code_by_language"))) {
      logger.warn("[DB Patch] Column library_task_attempts.last_submitted_code_by_language is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `library_task_attempts` ADD COLUMN `last_submitted_code_by_language` MEDIUMTEXT NULL AFTER `last_submitted_code`");
      logger.info("[DB Patch] Added column library_task_attempts.last_submitted_code_by_language");
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure library_task_attempts multi-language columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureLibraryTasksOjColumns(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'library_tasks'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const hasColumn = async (name: string): Promise<boolean> => {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `library_tasks` LIKE ?", [name])) as Array<any>;
      return Array.isArray(col) && col.length > 0;
    };

    const addColumn = async (sql: string, columnName: string): Promise<void> => {
      if (await hasColumn(columnName)) return;
      logger.warn("[DB Patch] Column library_tasks." + columnName + " is missing. Applying ALTER TABLE...");
      await AppDataSource.query(sql);
      logger.info("[DB Patch] Added column library_tasks." + columnName);
    };

    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `problem_code` VARCHAR(64) NULL AFTER `template`", "problem_code");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `slug` VARCHAR(128) NULL AFTER `problem_code`", "slug");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `difficulty` ENUM('EASY','MEDIUM','HARD') NULL AFTER `slug`", "difficulty");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `tags` TEXT NULL AFTER `difficulty`", "tags");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `section` VARCHAR(80) NULL AFTER `tags`", "section");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `time_limit_ms` INT NULL AFTER `max_attempts`", "time_limit_ms");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `memory_limit_mb` INT NULL AFTER `time_limit_ms`", "memory_limit_mb");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `output_limit_kb` INT NULL AFTER `memory_limit_mb`", "output_limit_kb");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `checker_spec` TEXT NULL AFTER `output_limit_kb`", "checker_spec");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `allowed_languages` TEXT NULL AFTER `checker_spec`", "allowed_languages");
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `templates_by_language` MEDIUMTEXT NULL AFTER `allowed_languages`", "templates_by_language");

    // Indexes (best-effort; ignore errors for duplicate names, etc.)
    try {
      const rows = (await AppDataSource.query("SHOW INDEX FROM `library_tasks` WHERE Key_name = 'uq_library_tasks_problem_code'")) as Array<any>;
      if (!Array.isArray(rows) || rows.length === 0) {
        await AppDataSource.query("ALTER TABLE `library_tasks` ADD UNIQUE KEY `uq_library_tasks_problem_code` (`problem_code`)");
        logger.info("[DB Patch] Added unique index uq_library_tasks_problem_code");
      }
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to ensure unique index uq_library_tasks_problem_code", { message: e?.message, code: e?.code });
    }

    try {
      const rows = (await AppDataSource.query("SHOW INDEX FROM `library_tasks` WHERE Key_name = 'idx_library_tasks_slug'")) as Array<any>;
      if (!Array.isArray(rows) || rows.length === 0) {
        await AppDataSource.query("CREATE INDEX `idx_library_tasks_slug` ON `library_tasks` (`slug`)");
        logger.info("[DB Patch] Added index idx_library_tasks_slug");
      }
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to ensure index idx_library_tasks_slug", { message: e?.message, code: e?.code });
    }

    // Backfill stable identifiers for existing tasks.
    try {
      await AppDataSource.query("UPDATE `library_tasks` SET `problem_code` = CONCAT('LIB', `id`) WHERE (`problem_code` IS NULL OR `problem_code` = '')");
      await AppDataSource.query("UPDATE `library_tasks` SET `slug` = CONCAT('task-', `id`) WHERE (`slug` IS NULL OR `slug` = '')");
      logger.info("[DB Patch] Backfilled library_tasks problem_code/slug");
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to backfill library_tasks problem_code/slug", { message: e?.message, code: e?.code });
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure library_tasks OJ columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTestDataTextColumns(): Promise<void> {
  // Some tasks have very large tests (tens/hundreds of thousands of chars).
  // MySQL TEXT is limited to 64KB; we need MEDIUMTEXT (~16MB) for stability.
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const inputCol = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'input'")) as Array<any>;
    const expectedCol = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'expected_output'")) as Array<any>;

    const inputType = String(inputCol?.[0]?.Type ?? "").toLowerCase();
    const expectedType = String(expectedCol?.[0]?.Type ?? "").toLowerCase();
    const inputNull = String(inputCol?.[0]?.Null ?? "NO").toUpperCase() === "YES";
    const expectedNull = String(expectedCol?.[0]?.Null ?? "NO").toUpperCase() === "YES";

    const needsInput = inputType && !inputType.includes("mediumtext");
    const needsExpected = expectedType && !expectedType.includes("mediumtext");
    if (!needsInput && !needsExpected) return;

    logger.warn("[DB Patch] Widening test_data input/expected_output columns to MEDIUMTEXT...");
    if (needsInput) {
      await AppDataSource.query(
        `ALTER TABLE \`test_data\` MODIFY COLUMN \`input\` MEDIUMTEXT ${inputNull ? "NULL" : "NOT NULL"}`
      );
    }
    if (needsExpected) {
      await AppDataSource.query(
        `ALTER TABLE \`test_data\` MODIFY COLUMN \`expected_output\` MEDIUMTEXT ${expectedNull ? "NULL" : "NOT NULL"}`
      );
    }
    logger.info("[DB Patch] test_data input/expected_output columns are MEDIUMTEXT");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to widen test_data columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureLibraryTaskAttemptsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'library_task_attempts'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table library_task_attempts is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE library_task_attempts (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        library_task_id INT NOT NULL,
        draft_code MEDIUMTEXT NOT NULL,
        draft_code_by_language MEDIUMTEXT NULL,
        last_submitted_code MEDIUMTEXT NULL,
        last_submitted_code_by_language MEDIUMTEXT NULL,
        last_verdict VARCHAR(16) NULL,
        last_score INT NULL,
        last_max_score INT NULL,
        last_tests_passed INT NULL,
        last_tests_total INT NULL,
        submissions_count INT NOT NULL DEFAULT 0,
        last_checked_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_library_task_attempts_user_task (user_id, library_task_id),
        INDEX idx_library_task_attempts_user (user_id),
        INDEX idx_library_task_attempts_task (library_task_id),
        CONSTRAINT fk_library_task_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_library_task_attempts_task FOREIGN KEY (library_task_id) REFERENCES library_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table library_task_attempts");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure library_task_attempts table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureLibraryTasksTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'library_tasks'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table library_tasks is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE library_tasks (
        id INT NOT NULL AUTO_INCREMENT,
        author_user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        template TEXT NOT NULL,
        problem_code VARCHAR(64) NULL,
        slug VARCHAR(128) NULL,
        difficulty ENUM('EASY','MEDIUM','HARD') NULL,
        tags TEXT NULL,
        section VARCHAR(80) NULL,
        lang ENUM('JAVA','PYTHON') NOT NULL DEFAULT 'JAVA',
        max_attempts INT NOT NULL DEFAULT 3,
        time_limit_ms INT NULL,
        memory_limit_mb INT NULL,
        output_limit_kb INT NULL,
        checker_spec TEXT NULL,
        allowed_languages TEXT NULL,
        templates_by_language MEDIUMTEXT NULL,
        status ENUM('DRAFT','PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'DRAFT',
        rejection_reason TEXT NULL,
        submitted_at DATETIME(6) NULL,
        published_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_library_tasks_problem_code (problem_code),
        INDEX idx_library_tasks_slug (slug),
        INDEX idx_library_tasks_status_updated_at (status, updated_at),
        INDEX idx_library_tasks_lang_status (lang, status),
        INDEX idx_library_tasks_author (author_user_id),
        CONSTRAINT fk_library_tasks_author FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table library_tasks");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure library_tasks table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTaskTheoriesLibraryTaskColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'task_theories'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `task_theories` LIKE 'library_task_id'")) as Array<any>;
    if (Array.isArray(col) && col.length > 0) return;

    logger.warn("[DB Patch] Column task_theories.library_task_id is missing. Applying ALTER TABLE...");
    try {
      await AppDataSource.query("ALTER TABLE `task_theories` ADD COLUMN `library_task_id` INT NULL AFTER `edu_task_id`");
      await AppDataSource.query("ALTER TABLE `task_theories` ADD UNIQUE KEY `uq_task_theories_library_task_id` (`library_task_id`)");
      await AppDataSource.query("ALTER TABLE `task_theories` ADD CONSTRAINT `fk_task_theories_library_task` FOREIGN KEY (`library_task_id`) REFERENCES `library_tasks`(`id`) ON DELETE CASCADE");
      logger.info("[DB Patch] Added column task_theories.library_task_id");
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to add task_theories.library_task_id (may already exist / FK name conflict):", {
        message: e?.message,
        code: e?.code
      });
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure task_theories.library_task_id:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTestDataLibraryTaskColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'library_task_id'")) as Array<any>;
    if (Array.isArray(col) && col.length > 0) return;

    logger.warn("[DB Patch] Column test_data.library_task_id is missing. Applying ALTER TABLE...");
    try {
      await AppDataSource.query("ALTER TABLE `test_data` ADD COLUMN `library_task_id` INT NULL AFTER `personal_task_id`");
      await AppDataSource.query("ALTER TABLE `test_data` ADD INDEX `idx_test_data_library_task_id` (`library_task_id`)");
      await AppDataSource.query("ALTER TABLE `test_data` ADD CONSTRAINT `fk_test_data_library_task` FOREIGN KEY (`library_task_id`) REFERENCES `library_tasks`(`id`) ON DELETE CASCADE");
      logger.info("[DB Patch] Added column test_data.library_task_id");
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to add test_data.library_task_id (may already exist / FK name conflict):", {
        message: e?.message,
        code: e?.code
      });
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure test_data.library_task_id:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureUsersPlacementColumns(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'users'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const doneCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_done'")) as Array<any>;
    if (!Array.isArray(doneCol) || doneCol.length === 0) {
      logger.warn("[DB Patch] Column users.placement_done is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_done` TINYINT(1) NOT NULL DEFAULT 0");
      logger.info("[DB Patch] Added column users.placement_done");
    }

    const levelCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_level'")) as Array<any>;
    if (!Array.isArray(levelCol) || levelCol.length === 0) {
      logger.warn("[DB Patch] Column users.placement_level is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_level` ENUM('BEGINNER','INTERMEDIATE','ADVANCED') NULL DEFAULT NULL");
      logger.info("[DB Patch] Added column users.placement_level");
    }

    const scoreCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_score'")) as Array<any>;
    if (!Array.isArray(scoreCol) || scoreCol.length === 0) {
      logger.warn("[DB Patch] Column users.placement_score is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_score` INT NULL DEFAULT NULL");
      logger.info("[DB Patch] Added column users.placement_score");
    }

    const masteredJavaCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_mastered_until_topic_index_java'")) as Array<any>;
    if (!Array.isArray(masteredJavaCol) || masteredJavaCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_mastered_until_topic_index_java is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_mastered_until_topic_index_java` INT NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_mastered_until_topic_index_java");
    }

    const masteredPythonCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_mastered_until_topic_index_python'")) as Array<any>;
    if (!Array.isArray(masteredPythonCol) || masteredPythonCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_mastered_until_topic_index_python is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_mastered_until_topic_index_python` INT NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_mastered_until_topic_index_python");
    }

    const doneAtCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_done_at'")) as Array<any>;
    if (!Array.isArray(doneAtCol) || doneAtCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_done_at is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_done_at` DATETIME(6) NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_done_at");
    }

    const codingPassedCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_coding_passed'")) as Array<any>;
    if (!Array.isArray(codingPassedCol) || codingPassedCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_coding_passed is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_coding_passed` TINYINT(1) NOT NULL DEFAULT 0");
      console.log("[DB Patch] Added column users.placement_coding_passed");
    }

    const codingLevelCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_coding_level'")) as Array<any>;
    if (!Array.isArray(codingLevelCol) || codingLevelCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_coding_level is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_coding_level` ENUM('BEGINNER','INTERMEDIATE','ADVANCED') NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_coding_level");
    }

    const codingTaskIdCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_coding_task_id'")) as Array<any>;
    if (!Array.isArray(codingTaskIdCol) || codingTaskIdCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_coding_task_id is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_coding_task_id` VARCHAR(80) NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_coding_task_id");
    }

    const codingScoreCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_coding_score'")) as Array<any>;
    if (!Array.isArray(codingScoreCol) || codingScoreCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_coding_score is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_coding_score` INT NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_coding_score");
    }

    const codingDoneAtCol = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'placement_coding_done_at'")) as Array<any>;
    if (!Array.isArray(codingDoneAtCol) || codingDoneAtCol.length === 0) {
      console.warn("[DB Patch] Column users.placement_coding_done_at is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `placement_coding_done_at` DATETIME(6) NULL DEFAULT NULL");
      console.log("[DB Patch] Added column users.placement_coding_done_at");
    }
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure users placement columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureEduGradesScoringColumns(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'edu_grades'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const scoreCol = (await AppDataSource.query("SHOW COLUMNS FROM `edu_grades` LIKE 'score'")) as Array<any>;
    if (!Array.isArray(scoreCol) || scoreCol.length === 0) {
      console.warn("[DB Patch] Column edu_grades.score is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `edu_grades` ADD COLUMN `score` INT NULL");
      console.log("[DB Patch] Added column edu_grades.score");
    }

    const maxScoreCol = (await AppDataSource.query("SHOW COLUMNS FROM `edu_grades` LIKE 'max_score'")) as Array<any>;
    if (!Array.isArray(maxScoreCol) || maxScoreCol.length === 0) {
      console.warn("[DB Patch] Column edu_grades.max_score is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `edu_grades` ADD COLUMN `max_score` INT NULL");
      console.log("[DB Patch] Added column edu_grades.max_score");
    }

    const groupScoresCol = (await AppDataSource.query("SHOW COLUMNS FROM `edu_grades` LIKE 'group_scores'")) as Array<any>;
    if (!Array.isArray(groupScoresCol) || groupScoresCol.length === 0) {
      console.warn("[DB Patch] Column edu_grades.group_scores is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `edu_grades` ADD COLUMN `group_scores` TEXT NULL");
      console.log("[DB Patch] Added column edu_grades.group_scores");
    }
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure edu_grades scoring columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureEduPerformanceIndexes(): Promise<void> {
  const hasTable = async (table: string): Promise<boolean> => {
    const rows = (await AppDataSource.query(`SHOW TABLES LIKE '${table}'`)) as Array<any>;
    return Array.isArray(rows) && rows.length > 0;
  };

  const hasIndex = async (table: string, indexName: string): Promise<boolean> => {
    // indexName is always a hard-coded constant from this file.
    const rows = (await AppDataSource.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`)) as Array<any>;
    return Array.isArray(rows) && rows.length > 0;
  };

  const ensureIndex = async (table: string, indexName: string, createSql: string): Promise<void> => {
    if (!(await hasTable(table))) return;
    if (await hasIndex(table, indexName)) return;

    logger.warn("[DB Patch] Missing index; creating...", { table, indexName });
    await AppDataSource.query(createSql);
    logger.info("[DB Patch] Index created", { table, indexName });
  };

  try {
    // Hot-path: student grade history & latest grade lookups.
    await ensureIndex(
      "edu_grades",
      "idx_edu_grades_student_topic_task_created_at",
      "CREATE INDEX `idx_edu_grades_student_topic_task_created_at` ON `edu_grades` (`student_id`, `topic_task_id`, `created_at`)"
    );
    await ensureIndex(
      "edu_grades",
      "idx_edu_grades_student_task_created_at",
      "CREATE INDEX `idx_edu_grades_student_task_created_at` ON `edu_grades` (`student_id`, `task_id`, `created_at`)"
    );

    // Hot-path: control work quiz/summary grade lookups.
    await ensureIndex(
      "summary_grades",
      "idx_summary_grades_student_control_type",
      "CREATE INDEX `idx_summary_grades_student_control_type` ON `summary_grades` (`student_id`, `control_work_id`, `assessment_type`)"
    );
    await ensureIndex(
      "summary_grades",
      "idx_summary_grades_student_created_at",
      "CREATE INDEX `idx_summary_grades_student_created_at` ON `summary_grades` (`student_id`, `created_at`)"
    );

    // Hot-path: control work attempt status.
    await ensureIndex(
      "lesson_attempts",
      "idx_lesson_attempts_control_student_status_started_at",
      "CREATE INDEX `idx_lesson_attempts_control_student_status_started_at` ON `lesson_attempts` (`control_work_id`, `student_id`, `status`, `started_at`)"
    );

    // Hot-path: control work tasks and topic tasks.
    await ensureIndex(
      "topic_tasks",
      "idx_topic_tasks_control_type_order",
      "CREATE INDEX `idx_topic_tasks_control_type_order` ON `topic_tasks` (`control_work_id`, `type`, `order`)"
    );
    await ensureIndex(
      "topic_tasks",
      "idx_topic_tasks_topic_type_assigned_order",
      "CREATE INDEX `idx_topic_tasks_topic_type_assigned_order` ON `topic_tasks` (`topic_id`, `type`, `is_assigned`, `order`)"
    );
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure edu performance indexes", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureMaintenanceStateTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'maintenance_state'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] Table maintenance_state is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE maintenance_state (
        id INT NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        title VARCHAR(255) NOT NULL DEFAULT 'Технічне обслуговування',
        message TEXT NOT NULL,
        until DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log("[DB Patch] Created table maintenance_state");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure maintenance_state table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureMaintenanceStateSingletonRow(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'maintenance_state'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;
    const rows = (await AppDataSource.query("SELECT id FROM maintenance_state WHERE id = 1 LIMIT 1")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] maintenance_state singleton row is missing. Inserting id=1...");
    await AppDataSource.query("INSERT INTO maintenance_state (id, enabled, title, message, until, created_at, updated_at) VALUES (1, 0, 'Технічне обслуговування', 'Ми оновлюємо платформу.', NULL, NOW(6), NOW(6))");
    console.log("[DB Patch] Inserted maintenance_state singleton row");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure maintenance_state singleton row:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureSupportTicketsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'support_tickets'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] Table support_tickets is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE support_tickets (
        id INT NOT NULL AUTO_INCREMENT,
        user_email VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status ENUM('OPEN','ANSWERED','CLOSED') NOT NULL DEFAULT 'OPEN',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        answered_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        INDEX idx_support_tickets_created_at (created_at),
        INDEX idx_support_tickets_status_created_at (status, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log("[DB Patch] Created table support_tickets");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure support_tickets table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureSupportChatTables(): Promise<void> {
  try {
    const convRows = (await AppDataSource.query("SHOW TABLES LIKE 'support_conversations'")) as Array<any>;
    if (!Array.isArray(convRows) || convRows.length === 0) {
      console.warn("[DB Patch] Table support_conversations is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE support_conversations (
          id INT NOT NULL AUTO_INCREMENT,
          user_id INT NULL,
          student_id INT NULL,
          user_email VARCHAR(255) NOT NULL,
          subject VARCHAR(255) NOT NULL,
          status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
          legacy_ticket_id INT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          last_message_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_support_conversations_legacy_ticket_id (legacy_ticket_id),
          INDEX idx_support_conversations_user_id (user_id),
          INDEX idx_support_conversations_student_id (student_id),
          INDEX idx_support_conversations_user_email (user_email),
          INDEX idx_support_conversations_status_last_message (status, last_message_at),
          CONSTRAINT fk_support_conversations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT fk_support_conversations_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB Patch] Created table support_conversations");
    }

    const msgRows = (await AppDataSource.query("SHOW TABLES LIKE 'support_messages'")) as Array<any>;
    if (!Array.isArray(msgRows) || msgRows.length === 0) {
      console.warn("[DB Patch] Table support_messages is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE support_messages (
          id INT NOT NULL AUTO_INCREMENT,
          conversation_id INT NOT NULL,
          sender_type ENUM('USER','ADMIN','SYSTEM') NOT NULL,
          sender_user_id INT NULL,
          sender_student_id INT NULL,
          text TEXT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX idx_support_messages_conversation_created_at (conversation_id, created_at),
          CONSTRAINT fk_support_messages_conversation FOREIGN KEY (conversation_id) REFERENCES support_conversations(id) ON DELETE CASCADE,
          CONSTRAINT fk_support_messages_sender_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT fk_support_messages_sender_student FOREIGN KEY (sender_student_id) REFERENCES students(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB Patch] Created table support_messages");
    }

    const attRows = (await AppDataSource.query("SHOW TABLES LIKE 'support_attachments'")) as Array<any>;
    if (!Array.isArray(attRows) || attRows.length === 0) {
      console.warn("[DB Patch] Table support_attachments is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE support_attachments (
          id INT NOT NULL AUTO_INCREMENT,
          message_id INT NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(127) NOT NULL DEFAULT 'application/octet-stream',
          size_bytes INT UNSIGNED NOT NULL,
          storage_key VARCHAR(512) NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX idx_support_attachments_message_id (message_id),
          CONSTRAINT fk_support_attachments_message FOREIGN KEY (message_id) REFERENCES support_messages(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB Patch] Created table support_attachments");
    }

    // Best-effort schema alignment for existing installs
    const convStudentCol = (await AppDataSource.query("SHOW COLUMNS FROM `support_conversations` LIKE 'student_id'")) as Array<any>;
    if (!Array.isArray(convStudentCol) || convStudentCol.length === 0) {
      console.warn("[DB Patch] Column support_conversations.student_id is missing. Applying ALTER TABLE...");
      try {
        await AppDataSource.query("ALTER TABLE `support_conversations` ADD COLUMN `student_id` INT NULL AFTER `user_id`");
        await AppDataSource.query("ALTER TABLE `support_conversations` ADD INDEX `idx_support_conversations_student_id` (`student_id`)");
        await AppDataSource.query("ALTER TABLE `support_conversations` ADD CONSTRAINT `fk_support_conversations_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL");
        console.log("[DB Patch] Added column support_conversations.student_id");
      } catch (e: any) {
        console.warn("[DB Patch] Failed to add support_conversations.student_id (may already exist / FK name conflict):", {
          message: e?.message,
          code: e?.code
        });
      }
    }

    const msgStudentCol = (await AppDataSource.query("SHOW COLUMNS FROM `support_messages` LIKE 'sender_student_id'")) as Array<any>;
    if (!Array.isArray(msgStudentCol) || msgStudentCol.length === 0) {
      console.warn("[DB Patch] Column support_messages.sender_student_id is missing. Applying ALTER TABLE...");
      try {
        await AppDataSource.query("ALTER TABLE `support_messages` ADD COLUMN `sender_student_id` INT NULL AFTER `sender_user_id`");
        await AppDataSource.query("ALTER TABLE `support_messages` ADD CONSTRAINT `fk_support_messages_sender_student` FOREIGN KEY (`sender_student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL");
        console.log("[DB Patch] Added column support_messages.sender_student_id");
      } catch (e: any) {
        console.warn("[DB Patch] Failed to add support_messages.sender_student_id (may already exist / FK name conflict):", {
          message: e?.message,
          code: e?.code
        });
      }
    }
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure support chat tables:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function migrateLegacySupportTicketsToChatIfNeeded(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'support_tickets'")) as Array<any>;
    const convTables = (await AppDataSource.query("SHOW TABLES LIKE 'support_conversations'")) as Array<any>;
    const msgTables = (await AppDataSource.query("SHOW TABLES LIKE 'support_messages'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;
    if (!Array.isArray(convTables) || convTables.length === 0) return;
    if (!Array.isArray(msgTables) || msgTables.length === 0) return;

    const existing = (await AppDataSource.query("SELECT id FROM support_conversations LIMIT 1")) as Array<any>;
    if (Array.isArray(existing) && existing.length > 0) return;

    const tickets = (await AppDataSource.query("SELECT id, user_email, subject, message, status, created_at, answered_at FROM support_tickets ORDER BY created_at ASC")) as Array<any>;
    if (!Array.isArray(tickets) || tickets.length === 0) return;

    console.warn(`[DB Patch] Migrating legacy support_tickets -> support_conversations/messages (${tickets.length} ticket(s))...`);
    for (const t of tickets) {
      const insertConv: any = await AppDataSource.query(
        "INSERT INTO support_conversations (user_id, student_id, user_email, subject, status, legacy_ticket_id, created_at, updated_at, last_message_at) VALUES (NULL, NULL, ?, ?, ?, ?, ?, ?, ?)",
        [String(t.user_email), String(t.subject), String(t.status) === "CLOSED" ? "CLOSED" : "OPEN", Number(t.id), t.created_at ?? new Date(), t.created_at ?? new Date(), t.created_at ?? new Date()]
      );
      const conversationId = Number(insertConv?.insertId);
      if (!conversationId) continue;
      await AppDataSource.query(
        "INSERT INTO support_messages (conversation_id, sender_type, sender_user_id, text, created_at) VALUES (?, 'USER', NULL, ?, ?)",
        [conversationId, String(t.message ?? ""), t.created_at ?? new Date()]
      );
      if (String(t.status) === "ANSWERED" && t.answered_at) {
        await AppDataSource.query(
          "INSERT INTO support_messages (conversation_id, sender_type, sender_user_id, text, created_at) VALUES (?, 'ADMIN', NULL, ?, ?)",
          [conversationId, "(legacy) Answered via email.", t.answered_at]
        );
        await AppDataSource.query("UPDATE support_conversations SET last_message_at = ? WHERE id = ?", [t.answered_at, conversationId]);
      }
    }
    console.log("[DB Patch] Legacy support tickets migrated to chat tables");
  } catch (err: any) {
    console.error("[DB Patch] Failed migrating support_tickets to chat:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function normalizeAndSanitizeTheoryBlocks(): Promise<void> {
  try {
    const exists = (await AppDataSource.query("SHOW TABLES LIKE 'theory_blocks'")) as Array<any>;
    if (!Array.isArray(exists) || exists.length === 0) return;
    const rows = (await AppDataSource.query("SELECT id, title, content FROM theory_blocks")) as Array<{
      id: number;
      title: string;
      content: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return;
    const headerRe = /^#{2,3}\s*(Практика|Practice|Завдання|Вправа|Task|Exercise)\b.*$/im;
    const forbiddenWord = /(\bПрактика\b|\bЗавдання\b)/i;
    let changed = 0;
    for (const r of rows) {
      const original = String(r.content ?? "");
      let next = original;
      const hasRealNewlines = next.includes("\n");
      const escapedNewlinesCount = (next.match(/\\n/g) || []).length;
      if (!hasRealNewlines && escapedNewlinesCount >= 2 || escapedNewlinesCount >= 6) {
        next = next.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t");
      }
      next = next.replace(/\r\n/g, "\n");
      const m = headerRe.exec(next);
      if (m && typeof m.index === "number" && m.index >= 0) {
        next = next.slice(0, m.index).trim();
      }
      const idx = next.search(forbiddenWord);
      if (idx >= 0) {
        next = next.slice(0, idx).trim();
      }
      if (!next.trim()) {
        const title = String(r.title ?? "Теорія").trim() || "Теорія";
        next = `## ${title}\n\n_Теорія буде додана найближчим часом._`;
      }
      if (next !== original) {
        await AppDataSource.query("UPDATE theory_blocks SET content = ?, updated_at = NOW(6) WHERE id = ?", [next, r.id]);
        changed++;
      }
    }
    if (changed > 0) {
      console.warn(`[DB Patch] Normalized/sanitized theory_blocks: updated ${changed} row(s).`);
    }
  } catch (err: any) {
    console.error("[DB Patch] Failed to normalize/sanitize theory_blocks:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureTestDataIsHiddenColumn(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'is_hidden'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) {
      return;
    }
    console.warn("[DB Patch] Column test_data.is_hidden is missing. Applying ALTER TABLE to add it...");
    await AppDataSource.query("ALTER TABLE `test_data` ADD COLUMN `is_hidden` TINYINT(1) NOT NULL DEFAULT 0");
    console.log("[DB Patch] Added column test_data.is_hidden");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure test_data.is_hidden column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTestDataKindColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'kind'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Column test_data.kind is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `test_data` ADD COLUMN `kind` ENUM('SAMPLE','JUDGE') NOT NULL DEFAULT 'JUDGE' AFTER `is_hidden`");
    await AppDataSource.query("ALTER TABLE `test_data` ADD INDEX `idx_test_data_kind` (`kind`)");
    logger.info("[DB Patch] Added column test_data.kind");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure test_data.kind column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function backfillTestDataKindFromIsHidden(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const kindCol = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'kind'")) as Array<any>;
    if (!Array.isArray(kindCol) || kindCol.length === 0) return;

    // If this runs on an already backfilled DB it's effectively a no-op.
    const r = await AppDataSource.query(
      "UPDATE `test_data` SET `kind` = CASE WHEN `is_hidden` = 0 THEN 'SAMPLE' ELSE 'JUDGE' END WHERE `kind` IS NULL OR `kind` = ''"
    );
    const changed = Number((r as any)?.affectedRows ?? 0);
    if (changed > 0) {
      logger.warn(`[DB Patch] Backfilled test_data.kind from is_hidden for ${changed} row(s)`);
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to backfill test_data.kind:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureTheoryBlocksTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'theory_blocks'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] Table theory_blocks is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE theory_blocks (
        id INT NOT NULL AUTO_INCREMENT,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        level INT NULL,
        tags TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log("[DB Patch] Created table theory_blocks");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure theory_blocks table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureTopicsTheoryBlockIdColumn(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `topics` LIKE 'theory_block_id'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] Column topics.theory_block_id is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `topics` ADD COLUMN `theory_block_id` INT NULL");
    console.log("[DB Patch] Added column topics.theory_block_id");
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure topics.theory_block_id column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function ensureTopicsNewTheoryBlockIdColumn(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `topics_new` LIKE 'theory_block_id'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;
    console.warn("[DB Patch] Column topics_new.theory_block_id is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `topics_new` ADD COLUMN `theory_block_id` INT NULL");
    console.log("[DB Patch] Added column topics_new.theory_block_id");
  } catch (err: any) {
    console.warn("[DB Patch] Skipped ensure topics_new.theory_block_id (table may not exist):", {
      message: err?.message,
      code: err?.code
    });
  }
}
async function migrateLegacyTopicTheoryMarkdownToTheoryBlocks(): Promise<void> {
  try {
    const legacyCol = (await AppDataSource.query("SHOW COLUMNS FROM `topics` LIKE 'theory_markdown'")) as Array<any>;
    if (!Array.isArray(legacyCol) || legacyCol.length === 0) return;
    const topics = (await AppDataSource.query("SELECT id, title, theory_markdown FROM topics WHERE (theory_block_id IS NULL OR theory_block_id = 0) AND theory_markdown IS NOT NULL AND TRIM(theory_markdown) <> ''")) as Array<{
      id: number;
      title: string;
      theory_markdown: string;
    }>;
    if (!Array.isArray(topics) || topics.length === 0) return;
    const existingBlocks = (await AppDataSource.query("SELECT id, content FROM theory_blocks")) as Array<{
      id: number;
      content: string;
    }>;

    // A small deterministic hash for deduping content during migration.
    // Avoids relying on Node built-ins/types in this patch runner context.
    const hash = (s: string) => {
      let h = 0xcbf29ce484222325n; // FNV-1a 64-bit offset basis
      for (let i = 0; i < s.length; i++) {
        h ^= BigInt(s.charCodeAt(i));
        h = (h * 0x100000001b3n) & 0xffffffffffffffffn; // FNV prime & mask to 64-bit
      }
      return h.toString(16).padStart(16, "0");
    };
    const byHash = new Map<string, number>();
    for (const b of existingBlocks) {
      byHash.set(hash(String(b.content ?? "")), Number(b.id));
    }
    console.warn(`[DB Patch] Migrating ${topics.length} legacy topics.theory_markdown -> theory_blocks...`);
    for (const t of topics) {
      const content = String(t.theory_markdown ?? "").trim();
      if (!content) continue;
      const h = hash(content);
      let blockId = byHash.get(h);
      if (!blockId) {
        const insertRes: any = await AppDataSource.query("INSERT INTO theory_blocks (title, content, version, level, tags, created_at, updated_at) VALUES (?, ?, 1, NULL, NULL, NOW(6), NOW(6))", [String(t.title ?? "Theory"), content]);
        blockId = Number(insertRes?.insertId);
        if (blockId) byHash.set(h, blockId);
      }
      if (blockId) {
        await AppDataSource.query("UPDATE topics SET theory_block_id = ? WHERE id = ?", [blockId, t.id]);
      }
    }
    console.log("[DB Patch] Legacy topic theory migrated to theory_blocks");
  } catch (err: any) {
    console.error("[DB Patch] Failed migrating topics.theory_markdown to theory_blocks:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function fixIntroPythonFixedSumTaskTests(): Promise<void> {
  try {
    const candidates = (await AppDataSource.query("SELECT id, title, description, lang FROM tasks WHERE lang='PYTHON' AND title LIKE '%Вступ до Python та інтерпретатора%';")) as Array<{
      id: number;
      title: string;
      description: string;
      lang: string;
    }>;
    if (!Array.isArray(candidates) || candidates.length === 0) return;
    const isNoInput = (s: string) => !/\binput\b|stdin|вхідн\s*і\s*дан\s*і|введенн|читат|зчитат/i.test(s) && !/Немає\s+вхідних\s+даних/i.test(s);
    const matchesStatement = (s: string) => /\ba\b[^\n]{0,80}(?:значенн\w*\s*)?5/i.test(s) && /\bb\b[^\n]{0,80}(?:значенн\w*\s*)?3/i.test(s) && /сум/i.test(s) && /вивед/i.test(s);
    const taskIdsToFix = candidates.filter(t => {
      const desc = String(t.description ?? "");
      return isNoInput(desc) && matchesStatement(desc);
    }).map(t => t.id);
    if (taskIdsToFix.length === 0) return;
    console.warn(`[DB Patch] Fixing intro Python fixed-sum task tests for ${taskIdsToFix.length} personal task(s)...`);
    for (const taskId of taskIdsToFix) {
      await AppDataSource.query("DELETE FROM test_data WHERE personal_task_id = ?", [taskId]);
      await AppDataSource.query("INSERT INTO test_data (input, expected_output, is_hidden, points, created_at, personal_task_id) VALUES (?, ?, 0, 12, NOW(), ?)", ["", "8", taskId]);
    }
    console.log("[DB Patch] Intro Python fixed-sum task tests fixed");
  } catch (err: any) {
    console.error("[DB Patch] Failed to fix intro Python fixed-sum task tests:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}
async function fixNoInputFixedExampleTaskTests(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SELECT id, title, description FROM tasks WHERE lang='PYTHON' AND description IS NOT NULL AND TRIM(description) <> ''")) as Array<{
      id: number;
      title: string;
      description: string;
    }>;
    if (!Array.isArray(rows) || rows.length === 0) return;
    const needsInput = (s: string) => /\binput\b|stdin|вхідн\s*і\s*дан\s*і|введенн|читат|зчитат/i.test(s) && !/Немає\s+вхідних\s+даних/i.test(s);
    const isFormatted = (s: string) => /\b(сума\s*:|sum\s*:|формат\s+виводу|output\s+format|добуток|product|multiply)\b/i.test(s);
    const extractExpected = (s: string): string | null => {
      const text = String(s ?? "");
      if (needsInput(text)) return null;
      if (isFormatted(text)) return null;
      if (!/(вивед|output|print)/i.test(text)) return null;
      const m = text.match(/(^|[^\d])(\d{1,9})\s*\+\s*(\d{1,9})([^\d]|$)/);
      if (m) {
        const a = Number(m[2]);
        const b = Number(m[3]);
        if (Number.isFinite(a) && Number.isFinite(b)) return String(a + b);
      }
      const aMatch = text.match(/\ba\b[^\d\n]{0,80}(\d{1,9})/i);
      const bMatch = text.match(/\bb\b[^\d\n]{0,80}(\d{1,9})/i);
      if (aMatch && bMatch) {
        const a = Number(aMatch[1]);
        const b = Number(bMatch[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        if (/\b(добуток|product|multiply)\b/i.test(text)) return String(a * b);
        if (/\b(різниц|difference|subtract)\b/i.test(text)) return String(a - b);
        if (/\b(сума|sum|add)\b/i.test(text)) return String(a + b);
      }
      return null;
    };
    const candidates = rows.map(t => ({
      id: t.id,
      expected: extractExpected(t.description)
    })).filter(t => t.expected !== null) as Array<{
      id: number;
      expected: string;
    }>;
    if (candidates.length === 0) return;
    console.warn(`[DB Patch] Fixing no-input fixed-example personal task tests for ${candidates.length} task(s)...`);
    for (const c of candidates) {
      await AppDataSource.query("DELETE FROM test_data WHERE personal_task_id = ?", [c.id]);
      await AppDataSource.query("INSERT INTO test_data (input, expected_output, is_hidden, points, created_at, personal_task_id) VALUES (?, ?, 0, 12, NOW(), ?)", ["", c.expected, c.id]);
    }
    console.log("[DB Patch] No-input fixed-example task tests fixed");
  } catch (err: any) {
    console.error("[DB Patch] Failed to fix no-input fixed-example task tests:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}