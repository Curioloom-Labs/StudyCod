import { AppDataSource } from "../data-source";
import { logger } from "./logger";

// =============================================================================
// LEGACY SHADOW MIGRATIONS — DO NOT RE-WIRE WITHOUT EXPLICIT OPT-IN.
// -----------------------------------------------------------------------------
// This module historically ran ad-hoc `ALTER TABLE` / `SHOW COLUMNS` statements
// at boot to repair schema drift. That bypasses TypeORM migration history,
// races across multi-instance startup, and makes rollbacks impossible.
//
// As of the hardening pass, `applyDbPatches()` is NOT called from anywhere in
// the codebase. The functions remain here as a temporary safety net while the
// equivalent fixes are ported into proper migrations. New code MUST use
// TypeORM migrations. To intentionally run these legacy patches in an
// emergency, set `DB_PATCHES_ENABLED=1` AND call `applyDbPatches()` from a
// one-shot script — never from server startup.
// =============================================================================

// Keep legacy db patch code readable while ensuring logs go through the centralized logger.
// (This shadows the global `console` only within this module.)
const console = {
  warn: (...args: any[]) => logger.warn(args[0], args[1]),
  log: (...args: any[]) => logger.info(args[0], args[1]),
  error: (...args: any[]) => logger.error(args[0], args[1])
} as const;

/**
 * Public guarded entry point. Throws unless DB_PATCHES_ENABLED=1 — kept this
 * way so future code cannot accidentally re-introduce shadow migrations at
 * server startup. The legitimate caller is a one-shot recovery script.
 *
 * The MIGRATION caller must NOT go through here — it uses the unguarded
 * `_legacyDbPatchesForMigration` below.
 */
export async function applyDbPatches(): Promise<void> {
  const enabled = String(process.env.DB_PATCHES_ENABLED ?? "").trim() === "1";
  if (!enabled) {
    throw new Error(
      "DB_PATCHES_DISABLED: applyDbPatches() is a legacy shadow-migration entry point. " +
      "Port the needed fix to a TypeORM migration. To intentionally run it from a one-shot script, " +
      "set DB_PATCHES_ENABLED=1."
    );
  }
  logger.warn("[dbPatches] running legacy shadow migrations (DB_PATCHES_ENABLED=1)");
  await _legacyDbPatchesForMigration();
}

/**
 * UNGUARDED body — exported ONLY for the consolidating migration at
 * `migrations/1748000000000-RunLegacyDbPatches.ts`. Do not call from server
 * runtime code. The leading underscore is a soft signal — `applyDbPatches`
 * above is the public surface.
 *
 * Every step here is internally idempotent (SHOW COLUMNS / SHOW TABLES checks
 * before any ALTER), so re-running on an already-patched schema is a no-op.
 */
export async function _legacyDbPatchesForMigration(): Promise<void> {
  await ensureUserModeEnums();
  await ensureCppLanguageEnums();
  await ensureClassesGradingSystemColumn();
  await ensureTargetedAssignmentsColumns();
  await ensureUsersDifusColumns();
  await ensureTestDataIsHiddenColumn();
  await ensureTestDataKindColumn();
  await ensureTestDataSubtaskColumn();
  await ensureTestDataSourceColumn();
  await ensureTestDataPaginationIndexes();
  await backfillTestDataKindFromIsHidden();
  await ensureTestDataTextColumns();
  await ensureEduGradesScoringColumns();
  await ensureEduPerformanceIndexes();
  await ensureUsersPlacementColumns();
  await ensureUsersContestHandleColumns();
  await ensureMarketingEmailsEnabledColumns();
  await ensureStudentsUiLanguageColumn();
  await ensureUsersBirthdayGreetedYearColumn();
  await ensureTasksIoTypeColumn();
  await fixIntroPythonFixedSumTaskTests();
  await ensureMaintenanceStateTable();
  await ensureMaintenanceStateSingletonRow();
  await ensureTheoryBlocksTable();
  await ensureTheoryBlocksContentColumn();
  await dropTheoryBlockRevisionsTableIfExists();
  await ensureSupportTicketsTable();
  await ensureSupportChatTables();
  await ensureGradeAppealsTables();
  await ensureEduHintFeedbackTable();
  await ensureAppealsAndInsightsIndexes();
  await ensureTeacherDigestDeliveriesTable();
  await migrateLegacySupportTicketsToChatIfNeeded();
  await ensureLibraryTasksTable();
  await ensureLibraryTasksOjColumns();
  await ensureLibraryTaskRevisionsTable();
  await ensureLibraryTaskRevisionsSnapshotColumn();
  await ensureLibraryTaskAttemptsTable();
  await ensureLibraryTaskAttemptsMultiLangColumns();
  await ensureWebTaskColumns();
  await ensureTaskTheoriesLibraryTaskColumn();
  await ensureTestDataLibraryTaskColumn();
  await ensureContestTables();
  await ensureContestSubmissionsGroupScoresColumn();
  await ensureCertificateTables();
  await ensureTopicsTheoryBlockIdColumn();
  await ensureTopicsTheoryMarkdownColumn();
  await ensureTopicsNewTheoryBlockIdColumn();
  await migrateLegacyTopicTheoryMarkdownToTheoryBlocks();
  await normalizeAndSanitizeTheoryBlocks();
  await fixNoInputFixedExampleTaskTests();
}

async function ensureUsersDifusColumns(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'users'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const ensureColumn = async (columnName: string, sql: string): Promise<void> => {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE ?", [columnName])) as Array<any>;
      if (Array.isArray(col) && col.length > 0) return;
      logger.warn(`[DB Patch] Column users.${columnName} is missing. Applying ALTER TABLE...`);
      await AppDataSource.query(sql);
      logger.info(`[DB Patch] Added column users.${columnName}`);
    };

    await ensureColumn("difus_cpp", "ALTER TABLE `users` ADD COLUMN `difus_cpp` DECIMAL(6,3) NOT NULL DEFAULT 0");
    await ensureColumn("last_difus_grade_id_java", "ALTER TABLE `users` ADD COLUMN `last_difus_grade_id_java` INT NULL DEFAULT NULL");
    await ensureColumn("last_difus_grade_id_python", "ALTER TABLE `users` ADD COLUMN `last_difus_grade_id_python` INT NULL DEFAULT NULL");
    await ensureColumn("last_difus_grade_id_cpp", "ALTER TABLE `users` ADD COLUMN `last_difus_grade_id_cpp` INT NULL DEFAULT NULL");

    const ensureDecimalColumn = async (columnName: string): Promise<void> => {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE ?", [columnName])) as Array<any>;
      if (!Array.isArray(col) || col.length === 0) return;
      const type = String(col?.[0]?.Type ?? "").toLowerCase();
      if (type.includes("decimal(6,3)")) return;
      logger.warn(`[DB Patch] Converting users.${columnName} to DECIMAL(6,3)...`, { from: type });
      await AppDataSource.query(`ALTER TABLE \`users\` MODIFY COLUMN \`${columnName}\` DECIMAL(6,3) NOT NULL DEFAULT 0`);
      logger.info(`[DB Patch] Converted users.${columnName} to DECIMAL(6,3)`);
    };

    await ensureDecimalColumn("difus_java");
    await ensureDecimalColumn("difus_python");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure users difus columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureUserModeEnums(): Promise<void> {
  await ensureEnumColumnHasValues({ table: "users", column: "user_mode", values: ["PERSONAL", "EDUCATIONAL", "CONTEST"] });
}

async function ensureContestTables(): Promise<void> {
  await ensureContestsTable();
  await ensureContestProblemsTable();
  await ensureContestParticipantsTable();
  await ensureContestSubmissionsTable();
}

async function ensureCertificateTables(): Promise<void> {
  await ensureContestCertificateSettingsTable();
  await ensureCertificateTemplatesTable();
  await ensureCertificateFieldsTable();
  await ensureEnumColumnHasValues({
    table: "certificate_fields",
    column: "field_key",
    values: [
      "contest_name",
      "name",
      "full_name",
      "place",
      "score",
      "max_score",
      "date",
      "organizer",
      "signature",
      "certificate_id",
      "qr_code",
    ],
  });
  await ensureCertificatesTable();
  await ensureCertificateJobQueueTable();
}

async function ensureContestCertificateSettingsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'contest_certificate_settings'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table contest_certificate_settings is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE contest_certificate_settings (
        id INT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        certificate_mode ENUM('none','studycod','custom') NOT NULL DEFAULT 'none',
        default_template_id INT NULL,
        send_email_enabled TINYINT(1) NOT NULL DEFAULT 1,
        generation_status ENUM('idle','queued','running','completed','failed') NOT NULL DEFAULT 'idle',
        last_generation_job_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_contest_certificate_settings_contest (contest_id),
        INDEX idx_contest_certificate_settings_mode (certificate_mode),
        CONSTRAINT fk_contest_certificate_settings_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table contest_certificate_settings");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contest_certificate_settings table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureCertificateTemplatesTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'certificate_templates'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table certificate_templates is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE certificate_templates (
        id INT NOT NULL AUTO_INCREMENT,
        contest_id INT NULL,
        name VARCHAR(180) NOT NULL,
        type ENUM('studycod','custom') NOT NULL DEFAULT 'studycod',
        html_template MEDIUMTEXT NULL,
        css_template MEDIUMTEXT NULL,
        background_pdf_url VARCHAR(1024) NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        version INT NOT NULL DEFAULT 1,
        created_by_user_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_certificate_templates_contest (contest_id),
        INDEX idx_certificate_templates_type_active (type, is_active),
        CONSTRAINT fk_certificate_templates_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
        CONSTRAINT fk_certificate_templates_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table certificate_templates");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure certificate_templates table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureCertificateFieldsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'certificate_fields'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table certificate_fields is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE certificate_fields (
        id INT NOT NULL AUTO_INCREMENT,
        template_id INT NOT NULL,
        field_key ENUM('contest_name','name','full_name','place','score','max_score','date','organizer','signature','certificate_id','qr_code') NOT NULL,
        is_enabled TINYINT(1) NOT NULL DEFAULT 1,
        is_required TINYINT(1) NOT NULL DEFAULT 0,
        x DECIMAL(10,2) NULL,
        y DECIMAL(10,2) NULL,
        width DECIMAL(10,2) NULL,
        height DECIMAL(10,2) NULL,
        font_size INT NULL,
        font_weight VARCHAR(40) NULL,
        color VARCHAR(32) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_certificate_fields_template (template_id),
        CONSTRAINT fk_certificate_fields_template FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table certificate_fields");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure certificate_fields table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureCertificatesTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'certificates'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table certificates is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE certificates (
        id INT NOT NULL AUTO_INCREMENT,
        certificate_id VARCHAR(120) NOT NULL,
        contest_id INT NOT NULL,
        participant_id INT NOT NULL,
        user_id INT NULL,
        student_id INT NULL,
        template_id INT NULL,
        status ENUM('queued','rendered','emailed','failed') NOT NULL DEFAULT 'queued',
        score INT NOT NULL DEFAULT 0,
        max_score INT NOT NULL DEFAULT 0,
        place_text VARCHAR(64) NULL,
        participant_name VARCHAR(255) NOT NULL,
        organizer_name VARCHAR(255) NOT NULL,
        issued_at DATETIME(6) NULL,
        pdf_storage_key VARCHAR(1024) NULL,
        qr_code_data_url MEDIUMTEXT NULL,
        checksum_sha256 VARCHAR(128) NULL,
        email_sent_at DATETIME(6) NULL,
        revoked_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_certificates_certificate_id (certificate_id),
        UNIQUE KEY uq_certificates_contest_participant (contest_id, participant_id),
        INDEX idx_certificates_user (user_id),
        INDEX idx_certificates_student (student_id),
        INDEX idx_certificates_contest (contest_id),
        CONSTRAINT fk_certificates_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
        CONSTRAINT fk_certificates_participant FOREIGN KEY (participant_id) REFERENCES contest_participants(id) ON DELETE CASCADE,
        CONSTRAINT fk_certificates_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT fk_certificates_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
        CONSTRAINT fk_certificates_template FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table certificates");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure certificates table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureCertificateJobQueueTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'certificate_job_queue'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table certificate_job_queue is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE certificate_job_queue (
        id INT NOT NULL AUTO_INCREMENT,
        queue_name ENUM('generate_batch','pdf_render','email_send') NOT NULL,
        status ENUM('queued','processing','done','failed') NOT NULL DEFAULT 'queued',
        payload_json MEDIUMTEXT NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 3,
        available_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        last_error TEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_certificate_job_queue_pick (queue_name, status, available_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table certificate_job_queue");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure certificate_job_queue table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureContestsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'contests'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `contests` LIKE 'allow_upsolve'")) as Array<any>;
      if (!Array.isArray(col) || col.length === 0) {
        logger.warn("[DB Patch] Column contests.allow_upsolve is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contests` ADD COLUMN allow_upsolve TINYINT(1) NOT NULL DEFAULT 1");
        logger.info("[DB Patch] Added column contests.allow_upsolve");
      }

      const scoringCol = (await AppDataSource.query("SHOW COLUMNS FROM `contests` LIKE 'scoring_mode'")) as Array<any>;
      if (!Array.isArray(scoringCol) || scoringCol.length === 0) {
        logger.warn("[DB Patch] Column contests.scoring_mode is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contests` ADD COLUMN scoring_mode ENUM('IOI','ICPC') NOT NULL DEFAULT 'IOI'");
        logger.info("[DB Patch] Added column contests.scoring_mode");
      }
      return;
    }

    logger.warn("[DB Patch] Table contests is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE contests (
        id INT NOT NULL AUTO_INCREMENT,
        created_by_user_id INT NOT NULL,
        class_id INT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        visibility ENUM('PUBLIC','PRIVATE_CODE','CLASS') NOT NULL DEFAULT 'PUBLIC',
        join_code VARCHAR(64) NULL,
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        is_published TINYINT(1) NOT NULL DEFAULT 1,
        allow_upsolve TINYINT(1) NOT NULL DEFAULT 1,
        scoring_mode ENUM('IOI','ICPC') NOT NULL DEFAULT 'IOI',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_contests_created_by (created_by_user_id),
        INDEX idx_contests_visibility_published (visibility, is_published),
        INDEX idx_contests_starts_at (starts_at),
        INDEX idx_contests_ends_at (ends_at),
        CONSTRAINT fk_contests_created_by_user FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_contests_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table contests");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contests table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureContestProblemsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'contest_problems'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) {
      const pointsCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_problems` LIKE 'points'")) as Array<any>;
      if (!Array.isArray(pointsCol) || pointsCol.length === 0) {
        logger.warn("[DB Patch] Column contest_problems.points is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_problems` ADD COLUMN points INT NULL AFTER label");
        logger.info("[DB Patch] Added column contest_problems.points");
      }
      return;
    }

    logger.warn("[DB Patch] Table contest_problems is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE contest_problems (
        id INT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        library_task_id INT NOT NULL,
        \`order\` INT NOT NULL DEFAULT 0,
        label VARCHAR(8) NULL,
        points INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_contest_problems_contest_order (contest_id, \`order\`),
        INDEX idx_contest_problems_contest_order (contest_id, \`order\`),
        INDEX idx_contest_problems_task (library_task_id),
        CONSTRAINT fk_contest_problems_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
        CONSTRAINT fk_contest_problems_library_task FOREIGN KEY (library_task_id) REFERENCES library_tasks(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table contest_problems");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contest_problems table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureContestParticipantsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'contest_participants'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) {
      const dqCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_participants` LIKE 'is_disqualified'")) as Array<any>;
      if (!Array.isArray(dqCol) || dqCol.length === 0) {
        logger.warn("[DB Patch] Column contest_participants.is_disqualified is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN is_disqualified TINYINT(1) NOT NULL DEFAULT 0 AFTER display_name");
        logger.info("[DB Patch] Added column contest_participants.is_disqualified");
      }

      const reasonCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_participants` LIKE 'disqualification_reason'")) as Array<any>;
      if (!Array.isArray(reasonCol) || reasonCol.length === 0) {
        logger.warn("[DB Patch] Column contest_participants.disqualification_reason is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN disqualification_reason TEXT NULL AFTER is_disqualified");
        logger.info("[DB Patch] Added column contest_participants.disqualification_reason");
      }

      const atCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_participants` LIKE 'disqualified_at'")) as Array<any>;
      if (!Array.isArray(atCol) || atCol.length === 0) {
        logger.warn("[DB Patch] Column contest_participants.disqualified_at is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN disqualified_at DATETIME NULL AFTER disqualification_reason");
        logger.info("[DB Patch] Added column contest_participants.disqualified_at");
      }

      const accountHandleCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_participants` LIKE 'contest_account_handle'")) as Array<any>;
      if (!Array.isArray(accountHandleCol) || accountHandleCol.length === 0) {
        logger.warn("[DB Patch] Column contest_participants.contest_account_handle is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN contest_account_handle VARCHAR(120) NULL AFTER is_disqualified");
        logger.info("[DB Patch] Added column contest_participants.contest_account_handle");
      }

      const accountNoteCol = (await AppDataSource.query("SHOW COLUMNS FROM `contest_participants` LIKE 'contest_account_note'")) as Array<any>;
      if (!Array.isArray(accountNoteCol) || accountNoteCol.length === 0) {
        logger.warn("[DB Patch] Column contest_participants.contest_account_note is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_participants` ADD COLUMN contest_account_note VARCHAR(255) NULL AFTER contest_account_handle");
        logger.info("[DB Patch] Added column contest_participants.contest_account_note");
      }
      return;
    }

    logger.warn("[DB Patch] Table contest_participants is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE contest_participants (
        id INT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        user_id INT NULL,
        student_id INT NULL,
        principal_type ENUM('USER','STUDENT') NOT NULL,
        display_name VARCHAR(180) NOT NULL,
        is_disqualified TINYINT(1) NOT NULL DEFAULT 0,
        contest_account_handle VARCHAR(120) NULL,
        contest_account_note VARCHAR(255) NULL,
        disqualification_reason TEXT NULL,
        disqualified_at DATETIME NULL,
        joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_contest_participants_contest_user (contest_id, user_id),
        UNIQUE KEY uq_contest_participants_contest_student (contest_id, student_id),
        INDEX idx_contest_participants_contest (contest_id),
        INDEX idx_contest_participants_user (user_id),
        INDEX idx_contest_participants_student (student_id),
        CONSTRAINT fk_contest_participants_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
        CONSTRAINT fk_contest_participants_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_contest_participants_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table contest_participants");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contest_participants table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureUsersContestHandleColumns(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'users'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const ensureColumn = async (columnName: string, sql: string): Promise<void> => {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE ?", [columnName])) as Array<any>;
      if (Array.isArray(col) && col.length > 0) return;
      logger.warn(`[DB Patch] Column users.${columnName} is missing. Applying ALTER TABLE...`);
      await AppDataSource.query(sql);
      logger.info(`[DB Patch] Added column users.${columnName}`);
    };

    await ensureColumn("cf_handle", "ALTER TABLE `users` ADD COLUMN `cf_handle` VARCHAR(100) NULL DEFAULT NULL");
    await ensureColumn("atcoder_handle", "ALTER TABLE `users` ADD COLUMN `atcoder_handle` VARCHAR(100) NULL DEFAULT NULL");
    await ensureColumn("leetcode_handle", "ALTER TABLE `users` ADD COLUMN `leetcode_handle` VARCHAR(100) NULL DEFAULT NULL");
    await ensureColumn("codechef_handle", "ALTER TABLE `users` ADD COLUMN `codechef_handle` VARCHAR(100) NULL DEFAULT NULL");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure users contest handle columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureContestSubmissionsTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'contest_submissions'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) {
      const col = (await AppDataSource.query("SHOW COLUMNS FROM `contest_submissions` LIKE 'phase'")) as Array<any>;
      if (!Array.isArray(col) || col.length === 0) {
        logger.warn("[DB Patch] Column contest_submissions.phase is missing. Adding...");
        await AppDataSource.query("ALTER TABLE `contest_submissions` ADD COLUMN phase ENUM('CONTEST','UPSOLVE') NOT NULL DEFAULT 'CONTEST'");
        logger.info("[DB Patch] Added column contest_submissions.phase");
      }
      return;
    }

    logger.warn("[DB Patch] Table contest_submissions is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE contest_submissions (
        id INT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        problem_id INT NOT NULL,
        participant_id INT NOT NULL,
        language VARCHAR(16) NOT NULL,
        submitted_code MEDIUMTEXT NOT NULL,
        verdict VARCHAR(16) NULL,
        score INT NULL,
        max_score INT NULL,
        tests_passed INT NULL,
        tests_total INT NULL,
        compile_error_kind VARCHAR(64) NULL,
        phase ENUM('CONTEST','UPSOLVE') NOT NULL DEFAULT 'CONTEST',
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        INDEX idx_contest_submissions_contest_created_at (contest_id, created_at),
        INDEX idx_contest_submissions_contest_problem (contest_id, problem_id),
        INDEX idx_contest_submissions_participant_problem (participant_id, problem_id),
        INDEX idx_contest_submissions_language (language),
        INDEX idx_contest_submissions_phase (phase),
        CONSTRAINT fk_contest_submissions_contest FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
        CONSTRAINT fk_contest_submissions_problem FOREIGN KEY (problem_id) REFERENCES contest_problems(id) ON DELETE CASCADE,
        CONSTRAINT fk_contest_submissions_participant FOREIGN KEY (participant_id) REFERENCES contest_participants(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table contest_submissions");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contest_submissions table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
    });
  }
}

async function ensureEnumColumnHasValues(params: {
  table: string;
  column: string;
  values: string[];
}): Promise<void> {
  try {
    const tables = (await AppDataSource.query(`SHOW TABLES LIKE ?`, [params.table])) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query(`SHOW COLUMNS FROM \`${params.table}\` LIKE ?`, [params.column])) as Array<any>;
    if (!Array.isArray(col) || col.length === 0) return;

    const type = String(col?.[0]?.Type ?? "");
    const nullFlag = String(col?.[0]?.Null ?? "YES").toUpperCase();
    const currentDefault = col?.[0]?.Default;

    const want = params.values;
    const hasAll = want.every(v => type.includes(`'${v}'`));
    if (hasAll) return;

    const nullable = nullFlag === "YES";
    const enumSql = `ENUM(${want.map(v => `'${v}'`).join(',')})`;
    const nullSql = nullable ? "NULL" : "NOT NULL";
    const defStr = currentDefault !== undefined && currentDefault !== null ? String(currentDefault) : null;
    const defaultSql = defStr && want.includes(defStr)
      ? `DEFAULT '${defStr}'`
      : (nullable ? "DEFAULT NULL" : `DEFAULT '${want[0]}'`);

    logger.warn("[DB Patch] Widening enum column to include values...", { table: params.table, column: params.column, from: type, to: enumSql });
    await AppDataSource.query(`ALTER TABLE \`${params.table}\` MODIFY COLUMN \`${params.column}\` ${enumSql} ${nullSql} ${defaultSql}`);
    logger.info("[DB Patch] Enum column updated", { table: params.table, column: params.column });
  } catch (err: any) {
    logger.error("[DB Patch] Failed to widen enum column", {
      table: params.table,
      column: params.column,
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureCppLanguageEnums(): Promise<void> {
  // C++ support: widen legacy language enums to include 'CPP'.
  const values = ["JAVA", "PYTHON", "CPP"];
  await ensureEnumColumnHasValues({ table: "users", column: "lang", values });
  await ensureEnumColumnHasValues({ table: "tasks", column: "lang", values });
  await ensureEnumColumnHasValues({ table: "topics", column: "lang", values });
  await ensureEnumColumnHasValues({ table: "classes", column: "language", values });
  await ensureEnumColumnHasValues({ table: "topics_new", column: "language", values });
  await ensureEnumColumnHasValues({ table: "library_tasks", column: "lang", values });
}

async function ensureClassesGradingSystemColumn(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'classes'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `classes` LIKE 'grading_system'")) as Array<any>;
    if (!Array.isArray(col) || col.length === 0) {
      logger.warn("[DB Patch] Column classes.grading_system is missing. Applying ALTER TABLE...");
      await AppDataSource.query(
        "ALTER TABLE `classes` ADD COLUMN `grading_system` ENUM('PERCENT_100','POINTS_12','POINTS_10','LETTER_AF','ECTS_AF','GPA_4') NOT NULL DEFAULT 'PERCENT_100' AFTER `language`"
      );
      logger.info("[DB Patch] Added column classes.grading_system");
    }

    await ensureEnumColumnHasValues({
      table: "classes",
      column: "grading_system",
      values: ["PERCENT_100", "POINTS_12", "POINTS_10", "LETTER_AF", "ECTS_AF", "GPA_4"]
    });
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure classes.grading_system column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTargetedAssignmentsColumns(): Promise<void> {
  try {
    const ensureJsonColumn = async (table: string, column: string): Promise<void> => {
      const tableRows = (await AppDataSource.query(`SHOW TABLES LIKE '${table}'`)) as Array<any>;
      if (!Array.isArray(tableRows) || tableRows.length === 0) return;

      const col = (await AppDataSource.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column])) as Array<any>;
      if (Array.isArray(col) && col.length > 0) return;

      logger.warn(`[DB Patch] Column ${table}.${column} is missing. Applying ALTER TABLE...`);
      await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` JSON NULL`);
      logger.info(`[DB Patch] Added column ${table}.${column}`);
    };

    await ensureJsonColumn("topic_tasks", "assigned_student_ids");
    await ensureJsonColumn("control_works", "assigned_student_ids");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure targeted assignment columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTheoryBlocksContentColumn(): Promise<void> {
  // Theory content can easily exceed MySQL TEXT limit (64KB) when importing full course materials.
  // Use MEDIUMTEXT (~16MB) for stability.
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'theory_blocks'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `theory_blocks` LIKE 'content'")) as Array<any>;
    const type = String(col?.[0]?.Type ?? "").toLowerCase();
    if (!type) return;
    if (type.includes("mediumtext") || type.includes("longtext")) return;

    logger.warn("[DB Patch] Widening theory_blocks.content to MEDIUMTEXT...");
    await AppDataSource.query("ALTER TABLE `theory_blocks` MODIFY COLUMN `content` MEDIUMTEXT NOT NULL");
    logger.info("[DB Patch] theory_blocks.content is MEDIUMTEXT");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to widen theory_blocks.content:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTopicsTheoryMarkdownColumn(): Promise<void> {
  // Keep legacy mirror in sync: topics.theory_markdown may also exceed TEXT limit.
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'topics'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `topics` LIKE 'theory_markdown'")) as Array<any>;
    if (!Array.isArray(col) || col.length === 0) return;

    const type = String(col?.[0]?.Type ?? "").toLowerCase();
    const nullable = String(col?.[0]?.Null ?? "YES").toUpperCase() === "YES";
    if (!type) return;
    if (type.includes("mediumtext") || type.includes("longtext")) return;

    logger.warn("[DB Patch] Widening topics.theory_markdown to MEDIUMTEXT...");
    await AppDataSource.query(
      `ALTER TABLE \`topics\` MODIFY COLUMN \`theory_markdown\` MEDIUMTEXT ${nullable ? "NULL" : "NOT NULL"}`
    );
    logger.info("[DB Patch] topics.theory_markdown is MEDIUMTEXT");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to widen topics.theory_markdown:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function dropTheoryBlockRevisionsTableIfExists(): Promise<void> {
  // We intentionally drop this table to prevent serving stale snapshots/rollback data.
  // See: admin theory history feature (now disabled).
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'theory_block_revisions'")) as Array<any>;
    if (!Array.isArray(rows) || rows.length === 0) return;

    logger.warn("[DB Patch] Dropping table theory_block_revisions (obsolete)...");
    await AppDataSource.query("DROP TABLE `theory_block_revisions`");
    logger.info("[DB Patch] Dropped table theory_block_revisions");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to drop theory_block_revisions table:", {
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
        snapshot LONGTEXT NOT NULL,
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

async function ensureLibraryTaskRevisionsSnapshotColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'library_task_revisions'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `library_task_revisions` LIKE 'snapshot'")) as Array<any>;
    if (!Array.isArray(col) || col.length === 0) return;

    const type = String(col?.[0]?.Type ?? "").toLowerCase();
    const nullable = String(col?.[0]?.Null ?? "NO").toUpperCase() === "YES";
    if (!type) return;
    if (type.includes("longtext")) return;

    logger.warn("[DB Patch] Widening library_task_revisions.snapshot to LONGTEXT...", { from: type });
    await AppDataSource.query(
      `ALTER TABLE \`library_task_revisions\` MODIFY COLUMN \`snapshot\` LONGTEXT ${nullable ? "NULL" : "NOT NULL"}`
    );
    logger.info("[DB Patch] library_task_revisions.snapshot is LONGTEXT");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to widen library_task_revisions.snapshot:", {
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
    await addColumn("ALTER TABLE `library_tasks` ADD COLUMN `is_hidden_from_library` TINYINT(1) NOT NULL DEFAULT 0 AFTER `max_attempts`", "is_hidden_from_library");

    // Backfill and sanitize stable identifiers for existing tasks.
    // This also resolves historical duplicate problem_code values before adding a UNIQUE index.
    try {
      const rows = (await AppDataSource.query("SELECT id, problem_code FROM `library_tasks` ORDER BY id ASC")) as Array<{
        id: number;
        problem_code: string | null;
      }>;
      const used = new Set<string>();
      let changed = 0;

      const fit64 = (s: string): string => String(s ?? "").slice(0, 64);

      for (const r of rows || []) {
        const id = Number((r as any)?.id);
        if (!Number.isFinite(id) || id <= 0) continue;

        const raw = String((r as any)?.problem_code ?? "").trim();
        const base = fit64(raw || `LIB${id}`) || `LIB${id}`;

        let candidate = base;
        let i = 1;
        while (used.has(candidate)) {
          const suffix = `_${i}`;
          candidate = `${base.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
          i += 1;
          if (i > 100000) break;
        }

        used.add(candidate);
        if (candidate !== raw) {
          await AppDataSource.query("UPDATE `library_tasks` SET `problem_code` = ? WHERE `id` = ?", [candidate, id]);
          changed += 1;
        }
      }

      await AppDataSource.query("UPDATE `library_tasks` SET `slug` = CONCAT('task-', `id`) WHERE (`slug` IS NULL OR `slug` = '')");
      if (changed > 0) {
        logger.warn(`[DB Patch] Reconciled duplicate/empty library_tasks.problem_code values for ${changed} row(s)`);
      }
      logger.info("[DB Patch] Backfilled library_tasks problem_code/slug");
    } catch (e: any) {
      logger.warn("[DB Patch] Failed to backfill/sanitize library_tasks problem_code/slug", { message: e?.message, code: e?.code });
    }

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
        task_mode ENUM('CODE','WEB') NOT NULL DEFAULT 'CODE',
        web_template_files MEDIUMTEXT NULL,
        web_validation_rules MEDIUMTEXT NULL,
        web_validation_profile MEDIUMTEXT NULL,
        problem_code VARCHAR(64) NULL,
        slug VARCHAR(128) NULL,
        difficulty ENUM('EASY','MEDIUM','HARD') NULL,
        tags TEXT NULL,
        section VARCHAR(80) NULL,
        lang ENUM('JAVA','PYTHON','CPP') NOT NULL DEFAULT 'JAVA',
        max_attempts INT NOT NULL DEFAULT 3,
        is_hidden_from_library TINYINT(1) NOT NULL DEFAULT 0,
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

async function ensureMarketingEmailsEnabledColumns(): Promise<void> {
  try {
    const ensure = async (table: "users" | "students"): Promise<void> => {
      const tableRows = (await AppDataSource.query(`SHOW TABLES LIKE '${table}'`)) as Array<any>;
      if (!Array.isArray(tableRows) || tableRows.length === 0) return;

      const col = (await AppDataSource.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'marketing_emails_enabled'`)) as Array<any>;
      if (Array.isArray(col) && col.length > 0) return;

      logger.warn(`[DB Patch] Column ${table}.marketing_emails_enabled is missing. Applying ALTER TABLE...`);
      await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`marketing_emails_enabled\` TINYINT(1) NOT NULL DEFAULT 1`);

      // Best-effort backfill for rows inserted before the column existed.
      try {
        await AppDataSource.query(`UPDATE \`${table}\` SET \`marketing_emails_enabled\` = 1 WHERE \`marketing_emails_enabled\` IS NULL`);
      } catch {
        // Ignore: column is NOT NULL so this may be a no-op depending on DB.
      }

      logger.info(`[DB Patch] Added column ${table}.marketing_emails_enabled`);
    };

    await ensure("users");
    await ensure("students");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure marketing_emails_enabled columns:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureStudentsUiLanguageColumn(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'students'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `students` LIKE 'ui_language'")) as Array<any>;
    if (!Array.isArray(col) || col.length === 0) {
      logger.warn("[DB Patch] Column students.ui_language is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `students` ADD COLUMN `ui_language` ENUM('uk','en') NOT NULL DEFAULT 'en' AFTER `email`");
      logger.info("[DB Patch] Added column students.ui_language");
    }

    await ensureEnumColumnHasValues({
      table: "students",
      column: "ui_language",
      values: ["uk", "en"]
    });
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure students.ui_language column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureUsersBirthdayGreetedYearColumn(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'users'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `users` LIKE 'birthday_greeted_year'")) as Array<any>;
    if (Array.isArray(col) && col.length > 0) return;

    logger.warn("[DB Patch] Column users.birthday_greeted_year is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `users` ADD COLUMN `birthday_greeted_year` INT NULL DEFAULT NULL");
    logger.info("[DB Patch] Added column users.birthday_greeted_year");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure users.birthday_greeted_year column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTasksIoTypeColumn(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'tasks'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const col = (await AppDataSource.query("SHOW COLUMNS FROM `tasks` LIKE 'io_type'")) as Array<any>;
    if (Array.isArray(col) && col.length > 0) return;

    logger.warn("[DB Patch] Column tasks.io_type is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `tasks` ADD COLUMN `io_type` ENUM('STDIN_STDOUT','NO_INPUT_FIXED_OUTPUT','NO_INPUT_FREE_OUTPUT') NOT NULL DEFAULT 'STDIN_STDOUT'");

    // Backfill for legacy rows (best-effort; default covers it, but keep it explicit).
    try {
      await AppDataSource.query("UPDATE `tasks` SET `io_type` = 'STDIN_STDOUT' WHERE `io_type` IS NULL OR `io_type` = ''");
    } catch {
      // ignore
    }

    logger.info("[DB Patch] Added column tasks.io_type");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure tasks.io_type column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureWebTaskColumns(): Promise<void> {
  const ensureForTable = async (table: string): Promise<void> => {
    try {
      const tableRows = (await AppDataSource.query("SHOW TABLES LIKE ?", [table])) as Array<any>;
      if (!Array.isArray(tableRows) || tableRows.length === 0) return;

      const hasColumn = async (columnName: string): Promise<boolean> => {
        const col = (await AppDataSource.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [columnName])) as Array<any>;
        return Array.isArray(col) && col.length > 0;
      };

      if (!(await hasColumn("task_mode"))) {
        logger.warn(`[DB Patch] Column ${table}.task_mode is missing. Applying ALTER TABLE...`);
        await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`task_mode\` ENUM('CODE','WEB') NOT NULL DEFAULT 'CODE' AFTER \`template\``);
        logger.info(`[DB Patch] Added column ${table}.task_mode`);
      }

      if (!(await hasColumn("web_template_files"))) {
        logger.warn(`[DB Patch] Column ${table}.web_template_files is missing. Applying ALTER TABLE...`);
        await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`web_template_files\` MEDIUMTEXT NULL AFTER \`task_mode\``);
        logger.info(`[DB Patch] Added column ${table}.web_template_files`);
      }

      if (!(await hasColumn("web_validation_rules"))) {
        logger.warn(`[DB Patch] Column ${table}.web_validation_rules is missing. Applying ALTER TABLE...`);
        await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`web_validation_rules\` MEDIUMTEXT NULL AFTER \`web_template_files\``);
        logger.info(`[DB Patch] Added column ${table}.web_validation_rules`);
      }

      if (!(await hasColumn("web_validation_profile"))) {
        logger.warn(`[DB Patch] Column ${table}.web_validation_profile is missing. Applying ALTER TABLE...`);
        await AppDataSource.query(`ALTER TABLE \`${table}\` ADD COLUMN \`web_validation_profile\` MEDIUMTEXT NULL AFTER \`web_validation_rules\``);
        logger.info(`[DB Patch] Added column ${table}.web_validation_profile`);
      }
    } catch (err: any) {
      logger.error(`[DB Patch] Failed to ensure web task columns for ${table}:`, {
        message: err?.message,
        code: err?.code,
        errno: err?.errno,
        sqlState: err?.sqlState
      });
    }
  };

  // Keep entity<->schema parity for all task-like tables that support CODE/WEB mode.
  await ensureForTable("tasks");
  await ensureForTable("library_tasks");
  await ensureForTable("topic_tasks");
  await ensureForTable("edu_tasks");
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
      "idx_edu_grades_student_topic_task_id",
      "CREATE INDEX `idx_edu_grades_student_topic_task_id` ON `edu_grades` (`student_id`, `topic_task_id`, `id`)"
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

async function ensureGradeAppealsTables(): Promise<void> {
  try {
    const appealRows = (await AppDataSource.query("SHOW TABLES LIKE 'grade_appeals'")) as Array<any>;
    if (!Array.isArray(appealRows) || appealRows.length === 0) {
      console.warn("[DB Patch] Table grade_appeals is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE grade_appeals (
          id INT NOT NULL AUTO_INCREMENT,
          student_id INT NOT NULL,
          class_id INT NOT NULL,
          teacher_user_id INT NULL,
          edu_grade_id INT NULL,
          summary_grade_id INT NULL,
          resolved_by_user_id INT NULL,
          target_type ENUM('EDU_GRADE','SUMMARY_GRADE') NOT NULL,
          status ENUM('SUBMITTED','IN_REVIEW','NEEDS_INFO','RESOLVED_ACCEPTED','RESOLVED_PARTIAL','RESOLVED_REJECTED','CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
          reason_code ENUM('CHECK_TEST_RESULTS','CHECK_FEEDBACK','CHECK_CALCULATION','CHECK_THEMATIC','OTHER') NOT NULL,
          reason_text TEXT NOT NULL,
          desired_outcome TEXT NULL,
          resolution_text TEXT NULL,
          previous_grade INT NULL,
          new_grade INT NULL,
          grade_changed TINYINT(1) NOT NULL DEFAULT 0,
          started_review_at DATETIME NULL,
          resolved_at DATETIME NULL,
          last_message_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX idx_grade_appeals_student_status_created (student_id, status, created_at),
          INDEX idx_grade_appeals_class_status_created (class_id, status, created_at),
          INDEX idx_grade_appeals_edu_grade_status (edu_grade_id, status),
          INDEX idx_grade_appeals_summary_grade_status (summary_grade_id, status),
          INDEX idx_grade_appeals_last_message_at (last_message_at),
          CONSTRAINT fk_grade_appeals_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_grade_appeals_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT fk_grade_appeals_teacher_user FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT fk_grade_appeals_edu_grade FOREIGN KEY (edu_grade_id) REFERENCES edu_grades(id) ON DELETE CASCADE,
          CONSTRAINT fk_grade_appeals_summary_grade FOREIGN KEY (summary_grade_id) REFERENCES summary_grades(id) ON DELETE CASCADE,
          CONSTRAINT fk_grade_appeals_resolved_user FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB Patch] Created table grade_appeals");
    }

    const messageRows = (await AppDataSource.query("SHOW TABLES LIKE 'grade_appeal_messages'")) as Array<any>;
    if (!Array.isArray(messageRows) || messageRows.length === 0) {
      console.warn("[DB Patch] Table grade_appeal_messages is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE grade_appeal_messages (
          id INT NOT NULL AUTO_INCREMENT,
          appeal_id INT NOT NULL,
          sender_type ENUM('STUDENT','TEACHER','SYSTEM') NOT NULL,
          sender_user_id INT NULL,
          sender_student_id INT NULL,
          text TEXT NOT NULL,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          INDEX idx_grade_appeal_messages_appeal_created (appeal_id, created_at),
          INDEX idx_grade_appeal_messages_sender_user (sender_user_id),
          INDEX idx_grade_appeal_messages_sender_student (sender_student_id),
          CONSTRAINT fk_grade_appeal_messages_appeal FOREIGN KEY (appeal_id) REFERENCES grade_appeals(id) ON DELETE CASCADE,
          CONSTRAINT fk_grade_appeal_messages_sender_user FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
          CONSTRAINT fk_grade_appeal_messages_sender_student FOREIGN KEY (sender_student_id) REFERENCES students(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log("[DB Patch] Created table grade_appeal_messages");
    }

    const lastMessageCol = (await AppDataSource.query("SHOW COLUMNS FROM `grade_appeals` LIKE 'last_message_at'")) as Array<any>;
    if (!Array.isArray(lastMessageCol) || lastMessageCol.length === 0) {
      console.warn("[DB Patch] Column grade_appeals.last_message_at is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `grade_appeals` ADD COLUMN `last_message_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER `resolved_at`");
      await AppDataSource.query("ALTER TABLE `grade_appeals` ADD INDEX `idx_grade_appeals_last_message_at` (`last_message_at`)");
      console.log("[DB Patch] Added column grade_appeals.last_message_at");
    }
  } catch (err: any) {
    console.error("[DB Patch] Failed to ensure grade appeal tables:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureEduHintFeedbackTable(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'edu_hint_feedback'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) {
      logger.warn("[DB Patch] Table edu_hint_feedback is missing. Creating...");
      await AppDataSource.query(`
        CREATE TABLE edu_hint_feedback (
          id INT NOT NULL AUTO_INCREMENT,
          student_id INT NOT NULL,
          topic_task_id INT NOT NULL,
          grade_id INT NULL,
          submission_id VARCHAR(128) NULL,
          code_hash VARCHAR(128) NOT NULL,
          verdict VARCHAR(32) NULL,
          signal ENUM('UP','DOWN') NOT NULL,
          reason_code ENUM('HELPFUL','NOT_SPECIFIC','INCORRECT','TOO_HARD','TOO_VERBOSE','OTHER') NULL,
          reason_text TEXT NULL,
          hints_shown INT NOT NULL DEFAULT 0,
          hints_total INT NOT NULL DEFAULT 0,
          created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (id),
          UNIQUE KEY uq_edu_hint_feedback_student_task_code (student_id, topic_task_id, code_hash),
          INDEX idx_edu_hint_feedback_topic_created (topic_task_id, created_at),
          INDEX idx_edu_hint_feedback_grade (grade_id),
          INDEX idx_edu_hint_feedback_signal_reason (signal, reason_code),
          CONSTRAINT fk_edu_hint_feedback_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
          CONSTRAINT fk_edu_hint_feedback_topic_task FOREIGN KEY (topic_task_id) REFERENCES topic_tasks(id) ON DELETE CASCADE,
          CONSTRAINT fk_edu_hint_feedback_grade FOREIGN KEY (grade_id) REFERENCES edu_grades(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      logger.info("[DB Patch] Created table edu_hint_feedback");
      return;
    }

    const hasColumn = async (columnName: string): Promise<boolean> => {
      const rows = (await AppDataSource.query("SHOW COLUMNS FROM `edu_hint_feedback` LIKE ?", [columnName])) as Array<any>;
      return Array.isArray(rows) && rows.length > 0;
    };

    const ensureColumn = async (columnName: string, sql: string): Promise<void> => {
      if (await hasColumn(columnName)) return;
      logger.warn(`[DB Patch] Column edu_hint_feedback.${columnName} is missing. Applying ALTER TABLE...`);
      await AppDataSource.query(sql);
      logger.info(`[DB Patch] Added column edu_hint_feedback.${columnName}`);
    };

    await ensureColumn("grade_id", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `grade_id` INT NULL AFTER `topic_task_id`");
    await ensureColumn("submission_id", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `submission_id` VARCHAR(128) NULL AFTER `grade_id`");
    await ensureColumn("code_hash", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `code_hash` VARCHAR(128) NOT NULL DEFAULT '' AFTER `submission_id`");
    await ensureColumn("verdict", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `verdict` VARCHAR(32) NULL AFTER `code_hash`");
    await ensureColumn("signal", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `signal` ENUM('UP','DOWN') NOT NULL DEFAULT 'UP' AFTER `verdict`");
    await ensureColumn("reason_code", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `reason_code` ENUM('HELPFUL','NOT_SPECIFIC','INCORRECT','TOO_HARD','TOO_VERBOSE','OTHER') NULL AFTER `signal`");
    await ensureColumn("reason_text", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `reason_text` TEXT NULL AFTER `reason_code`");
    await ensureColumn("hints_shown", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `hints_shown` INT NOT NULL DEFAULT 0 AFTER `reason_text`");
    await ensureColumn("hints_total", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `hints_total` INT NOT NULL DEFAULT 0 AFTER `hints_shown`");
    await ensureColumn("created_at", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) AFTER `hints_total`");
    await ensureColumn("updated_at", "ALTER TABLE `edu_hint_feedback` ADD COLUMN `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6) AFTER `created_at`");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure edu_hint_feedback table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureAppealsAndInsightsIndexes(): Promise<void> {
  const hasTable = async (table: string): Promise<boolean> => {
    const rows = (await AppDataSource.query(`SHOW TABLES LIKE '${table}'`)) as Array<any>;
    return Array.isArray(rows) && rows.length > 0;
  };

  const hasIndex = async (table: string, indexName: string): Promise<boolean> => {
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
    await ensureIndex(
      "grade_appeals",
      "idx_grade_appeals_class_status_last_message_created",
      "CREATE INDEX `idx_grade_appeals_class_status_last_message_created` ON `grade_appeals` (`class_id`, `status`, `last_message_at`, `created_at`)"
    );

    await ensureIndex(
      "grade_appeals",
      "idx_grade_appeals_student_last_message_created",
      "CREATE INDEX `idx_grade_appeals_student_last_message_created` ON `grade_appeals` (`student_id`, `last_message_at`, `created_at`)"
    );

    await ensureIndex(
      "edu_hint_feedback",
      "idx_edu_hint_feedback_topic_created",
      "CREATE INDEX `idx_edu_hint_feedback_topic_created` ON `edu_hint_feedback` (`topic_task_id`, `created_at`)"
    );

    await ensureIndex(
      "edu_hint_feedback",
      "idx_edu_hint_feedback_signal_reason",
      "CREATE INDEX `idx_edu_hint_feedback_signal_reason` ON `edu_hint_feedback` (`signal`, `reason_code`)"
    );

    await ensureIndex(
      "edu_hint_feedback",
      "idx_edu_hint_feedback_grade",
      "CREATE INDEX `idx_edu_hint_feedback_grade` ON `edu_hint_feedback` (`grade_id`)"
    );

    const hasUniqueHintKey = await hasIndex("edu_hint_feedback", "uq_edu_hint_feedback_student_task_code");
    if (!hasUniqueHintKey && await hasTable("edu_hint_feedback")) {
      await AppDataSource.query(`
        DELETE old_feedback FROM edu_hint_feedback old_feedback
        INNER JOIN edu_hint_feedback new_feedback
          ON old_feedback.student_id = new_feedback.student_id
         AND old_feedback.topic_task_id = new_feedback.topic_task_id
         AND old_feedback.code_hash = new_feedback.code_hash
         AND old_feedback.id < new_feedback.id
      `);

      await AppDataSource.query(
        "ALTER TABLE `edu_hint_feedback` ADD UNIQUE KEY `uq_edu_hint_feedback_student_task_code` (`student_id`, `topic_task_id`, `code_hash`)"
      );
      logger.info("[DB Patch] Added unique index uq_edu_hint_feedback_student_task_code");
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure appeals/insights indexes:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTeacherDigestDeliveriesTable(): Promise<void> {
  try {
    const rows = (await AppDataSource.query("SHOW TABLES LIKE 'teacher_digest_deliveries'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Table teacher_digest_deliveries is missing. Creating...");
    await AppDataSource.query(`
      CREATE TABLE teacher_digest_deliveries (
        id INT NOT NULL AUTO_INCREMENT,
        class_id INT NOT NULL,
        teacher_user_id INT NOT NULL,
        week_key VARCHAR(16) NOT NULL,
        window_days INT NOT NULL DEFAULT 7,
        status ENUM('RESERVED','SENT') NOT NULL DEFAULT 'RESERVED',
        payload_json MEDIUMTEXT NULL,
        last_error TEXT NULL,
        sent_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_teacher_digest_deliveries_class_week (class_id, week_key),
        INDEX idx_teacher_digest_deliveries_teacher_week (teacher_user_id, week_key),
        INDEX idx_teacher_digest_deliveries_status_created (status, created_at),
        CONSTRAINT fk_teacher_digest_deliveries_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
        CONSTRAINT fk_teacher_digest_deliveries_teacher FOREIGN KEY (teacher_user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    logger.info("[DB Patch] Created table teacher_digest_deliveries");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure teacher_digest_deliveries table:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState,
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

async function ensureContestSubmissionsGroupScoresColumn(): Promise<void> {
  try {
    const tableRows = (await AppDataSource.query("SHOW TABLES LIKE 'contest_submissions'")) as Array<any>;
    if (!Array.isArray(tableRows) || tableRows.length === 0) return;

    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `contest_submissions` LIKE 'group_scores'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Column contest_submissions.group_scores is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `contest_submissions` ADD COLUMN `group_scores` TEXT NULL AFTER `compile_error_kind`");
    logger.info("[DB Patch] Added column contest_submissions.group_scores");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure contest_submissions.group_scores column:", {
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

async function ensureTestDataSubtaskColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'subtask'")) as Array<any>;
    if (Array.isArray(rows) && rows.length > 0) return;

    logger.warn("[DB Patch] Column test_data.subtask is missing. Applying ALTER TABLE...");
    await AppDataSource.query("ALTER TABLE `test_data` ADD COLUMN `subtask` VARCHAR(64) NULL AFTER `points`");
    logger.info("[DB Patch] Added column test_data.subtask");
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure test_data.subtask column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTestDataSourceColumn(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const rows = (await AppDataSource.query("SHOW COLUMNS FROM `test_data` LIKE 'source'")) as Array<any>;
    if (!Array.isArray(rows) || rows.length === 0) {
      logger.warn("[DB Patch] Column test_data.source is missing. Applying ALTER TABLE...");
      await AppDataSource.query("ALTER TABLE `test_data` ADD COLUMN `source` ENUM('MANUAL','AI_GENERATED','LIBRARY_IMPORTED') NOT NULL DEFAULT 'MANUAL' AFTER `kind`");
      await AppDataSource.query("ALTER TABLE `test_data` ADD INDEX `idx_test_data_source` (`source`)");
      logger.info("[DB Patch] Added column test_data.source");
    }

    await ensureEnumColumnHasValues({
      table: "test_data",
      column: "source",
      values: ["MANUAL", "AI_GENERATED", "LIBRARY_IMPORTED"]
    });

    // Best-effort backfill for legacy rows attached directly to library tasks.
    await AppDataSource.query(
      "UPDATE `test_data` SET `source` = 'LIBRARY_IMPORTED' WHERE `library_task_id` IS NOT NULL AND (`source` IS NULL OR `source` = '' OR `source` = 'MANUAL')"
    );
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure test_data.source column:", {
      message: err?.message,
      code: err?.code,
      errno: err?.errno,
      sqlState: err?.sqlState
    });
  }
}

async function ensureTestDataPaginationIndexes(): Promise<void> {
  try {
    const tables = (await AppDataSource.query("SHOW TABLES LIKE 'test_data'")) as Array<any>;
    if (!Array.isArray(tables) || tables.length === 0) return;

    const hasIndex = async (name: string): Promise<boolean> => {
      const rows = (await AppDataSource.query("SHOW INDEX FROM `test_data` WHERE Key_name = ?", [name])) as Array<any>;
      return Array.isArray(rows) && rows.length > 0;
    };

    if (!(await hasIndex("idx_test_data_topic_task_created_id"))) {
      await AppDataSource.query(
        "CREATE INDEX `idx_test_data_topic_task_created_id` ON `test_data` (`topic_task_id`, `created_at`, `id`)"
      );
      logger.info("[DB Patch] Added index idx_test_data_topic_task_created_id");
    }

    if (!(await hasIndex("idx_test_data_topic_task_source_created_id"))) {
      await AppDataSource.query(
        "CREATE INDEX `idx_test_data_topic_task_source_created_id` ON `test_data` (`topic_task_id`, `source`, `created_at`, `id`)"
      );
      logger.info("[DB Patch] Added index idx_test_data_topic_task_source_created_id");
    }
  } catch (err: any) {
    logger.error("[DB Patch] Failed to ensure test_data pagination indexes:", {
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
      await AppDataSource.query("INSERT INTO test_data (input, expected_output, is_hidden, points, created_at, personal_task_id) VALUES (?, ?, 0, 100, NOW(), ?)", ["", "8", taskId]);
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
      await AppDataSource.query("INSERT INTO test_data (input, expected_output, is_hidden, points, created_at, personal_task_id) VALUES (?, ?, 0, 100, NOW(), ?)", ["", c.expected, c.id]);
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