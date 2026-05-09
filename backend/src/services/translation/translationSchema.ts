import { AppDataSource } from "../../data-source";
import { logger } from "../../utils/logger";
import { redisKey, runWithRedis } from "../redis/sharedRedis";

type CacheEntry = { value: boolean; at: number };
const cache: Record<string, CacheEntry | undefined> = {};
const CACHE_TTL_MS = 60_000;
const CACHE_TTL_SECONDS = Math.max(1, Math.ceil(CACHE_TTL_MS / 1000));

function redisCacheKey(key: string): string {
  return redisKey("translation-columns", key);
}

async function getRedisCache(key: string): Promise<boolean | null> {
  const raw = await runWithRedis("translation schema cache get", async redis => {
    return await redis.get(redisCacheKey(key));
  });

  if (typeof raw !== "string") return null;
  if (raw === "1" || raw.toLowerCase() === "true") return true;
  if (raw === "0" || raw.toLowerCase() === "false") return false;
  return null;
}

async function setRedisCache(key: string, value: boolean): Promise<void> {
  await runWithRedis("translation schema cache set", async redis => {
    await redis.set(redisCacheKey(key), value ? "1" : "0", {
      EX: CACHE_TTL_SECONDS,
    });
    return true;
  });
}

async function hasColumns(tableName: string, columnNames: string[]): Promise<boolean> {
  const key = `${tableName}:${columnNames.join(",")}`;
  const hit = cache[key];
  // Re-check occasionally in dev.
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const redisHit = await getRedisCache(key);
  if (redisHit !== null) {
    cache[key] = { value: redisHit, at: Date.now() };
    return redisHit;
  }

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
    await setRedisCache(key, value);
    return value;
  } catch (err: any) {
    logger.warn("[translate] failed to check translation columns", {
      tableName,
      err: err?.message ?? String(err)
    });
    cache[key] = { value: false, at: Date.now() };
    await setRedisCache(key, false);
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
