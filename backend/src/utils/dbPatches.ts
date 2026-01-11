import { AppDataSource } from "../data-source";
export async function applyDbPatches(): Promise<void> {
  await ensureTestDataIsHiddenColumn();
  await fixIntroPythonFixedSumTaskTests();
  await ensureMaintenanceStateTable();
  await ensureMaintenanceStateSingletonRow();
  await ensureTheoryBlocksTable();
  await ensureSupportTicketsTable();
  await ensureTopicsTheoryBlockIdColumn();
  await ensureTopicsNewTheoryBlockIdColumn();
  await migrateLegacyTopicTheoryMarkdownToTheoryBlocks();
  await normalizeAndSanitizeTheoryBlocks();
  await fixNoInputFixedExampleTaskTests();
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
    const crypto = await import("crypto");
    const hash = (s: string) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
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