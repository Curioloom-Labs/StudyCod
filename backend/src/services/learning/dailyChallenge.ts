/**
 * Deterministic "challenge of the day" selection.
 *
 * Same date => same task for everyone (a shared daily challenge), with no
 * storage required: a stable hash of the date string picks an index into the
 * candidate pool. An optional salt lets you run independent daily streams
 * (e.g. per language). Pure + deterministic.
 */
export interface DailyChallengePick<T> {
  date: string;     // YYYY-MM-DD (UTC)
  item: T;
  index: number;
  poolSize: number;
}

const MAX_HASH_INPUT_LENGTH = 256;

/** FNV-1a 32-bit hash — small, dependency-free, stable across runs. */
export function fnv1a(str: string): number {
  const bounded = String(str ?? "").slice(0, MAX_HASH_INPUT_LENGTH);
  let h = 0x811c9dc5;
  for (let i = 0; i < MAX_HASH_INPUT_LENGTH; i += 1) {
    const code = bounded.charCodeAt(i);
    if (Number.isNaN(code)) break;
    h ^= code;
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

export function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Pick the daily item from `pool`. Returns null only for an empty pool.
 * `salt` produces an independent stream (e.g. language or class id).
 */
export function pickDailyChallenge<T>(pool: T[], date: Date, salt = ""): DailyChallengePick<T> | null {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const key = `${toDateKey(date)}|${salt}`;
  const index = fnv1a(key) % pool.length;
  return { date: toDateKey(date), item: pool[index], index, poolSize: pool.length };
}

/**
 * The next N distinct daily challenges starting from `date` (e.g. for a
 * "this week" strip). Avoids immediate repeats when the pool is large enough.
 */
export function upcomingDailyChallenges<T>(pool: T[], date: Date, days: number, salt = ""): Array<DailyChallengePick<T>> {
  const out: Array<DailyChallengePick<T>> = [];
  const n = Math.max(1, Math.min(31, Math.floor(days)));
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + i));
    const pick = pickDailyChallenge(pool, d, salt);
    if (pick) out.push(pick);
  }
  return out;
}
