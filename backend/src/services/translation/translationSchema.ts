import { AppDataSource } from "../../data-source";
import { logger } from "../../utils/logger";

type CacheEntry = { value: boolean; at: number };
const cache: Record<string, CacheEntry | undefined> = {};

async function hasColumns(tableName: string, columnNames: string[]): Promise<boolean> {
  const key = `${tableName}:${columnNames.join(",")}`;
  const hit = cache[key];
  // Re-check occasionally in dev.
  if (hit && Date.now() - hit.at < 60_000) return hit.value;

  try {
    const rows = (await AppDataSource.query(
      `SELECT COUNT(*) as c
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME IN (${columnNames.map(() => "?").join(",")})`,
      [tableName, ...columnNames]
    )) as Array<{ c: number | string }>;

    const c = rows?.[0]?.c;
    const n = typeof c === "string" ? parseInt(c, 10) : Number(c ?? 0);
    const value = Number.isFinite(n) && n >= columnNames.length;
    cache[key] = { value, at: Date.now() };
    return value;
  } catch (err: any) {
    logger.warn("[translate] failed to check translation columns", {
      tableName,
      err: err?.message ?? String(err)
    });
    cache[key] = { value: false, at: Date.now() };
    return false;
  }
}

/**
 * Returns true if the DB has the EN translation columns on theory_blocks.
 *
 * This lets the backend run safely even if migrations were not applied yet.
 */
export async function hasTheoryBlockEnTranslationColumns(): Promise<boolean> {
  return hasColumns("theory_blocks", ["title_en", "content_en", "translation_version_en", "translated_at_en"]);
}

/**
 * Returns true if the DB has the EN translation columns on library_tasks.
 */
export async function hasLibraryTaskEnTranslationColumns(): Promise<boolean> {
  return hasColumns("library_tasks", [
    "title_en",
    "description_en",
    "translation_source_hash_en",
    "translation_version_en",
    "translated_at_en",
  ]);
}
