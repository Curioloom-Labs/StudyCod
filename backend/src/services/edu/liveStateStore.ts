/**
 * Shared backing store for ephemeral Live Classroom session state (live code
 * snapshots, active challenges, breakout assignments). These are transient,
 * non-gradebook artifacts written/read many times during a lesson.
 *
 * Two modes, chosen at runtime by whether Redis is configured:
 *  - Redis enabled  → state lives in Redis with a TTL, so a student's publish
 *    and the teacher's read land on the same data across replicas (the whole
 *    point of moving off per-process Maps).
 *  - Redis disabled → an in-process Map per namespace with the same TTL/eviction
 *    semantics, so local dev / single-node / test runs behave identically with
 *    zero external dependencies.
 *
 * The public API is uniformly async so callers don't branch on the mode.
 */
import { isRedisEnabled, runWithRedis, redisKey, getSharedRedisClient } from "../redis/sharedRedis";

interface MemEntry {
  value: unknown;
  /** Absolute expiry in epoch ms; null = never auto-expires. */
  expiresAtMs: number | null;
}

const memStores = new Map<string, Map<string, MemEntry>>();

/** Production live state must be shared across replicas. */
export async function isLiveStateReady(): Promise<boolean> {
  if (!isRedisEnabled()) return process.env.NODE_ENV !== "production";
  return Boolean(await getSharedRedisClient());
}

function memStore(ns: string): Map<string, MemEntry> {
  let m = memStores.get(ns);
  if (!m) {
    m = new Map<string, MemEntry>();
    memStores.set(ns, m);
  }
  return m;
}

/** Drop expired entries; if a capacity cap is given and still exceeded, evict the soonest-expiring (== oldest, since TTL is constant per namespace). */
function memPrune(m: Map<string, MemEntry>, nowMs: number, maxEntries?: number): void {
  for (const [k, e] of m) {
    if (e.expiresAtMs !== null && e.expiresAtMs <= nowMs) m.delete(k);
  }
  if (!maxEntries || m.size <= maxEntries) return;
  const soonestFirst = [...m.entries()].sort(
    (a, b) => (a[1].expiresAtMs ?? Infinity) - (b[1].expiresAtMs ?? Infinity)
  );
  for (const [k] of soonestFirst) {
    if (m.size <= maxEntries) break;
    m.delete(k);
  }
}

function keyOf(ns: string, key: string | number): string {
  return redisKey("live", ns, String(key));
}

export interface SetOptions {
  /** Only enforced for the in-memory fallback (Redis bounds itself via TTL). */
  maxEntries?: number;
}

export async function setLiveState(
  ns: string,
  key: string | number,
  value: unknown,
  ttlSec: number | null,
  opts: SetOptions = {}
): Promise<void> {
  if (isRedisEnabled()) {
    await runWithRedis(`live:set:${ns}`, async (redis) => {
      const payload = JSON.stringify(value);
      if (ttlSec && ttlSec > 0) {
        await redis.set(keyOf(ns, key), payload, { EX: Math.ceil(ttlSec) });
      } else {
        await redis.set(keyOf(ns, key), payload);
      }
      return true;
    });
    return;
  }

  const nowMs = Date.now();
  const m = memStore(ns);
  memPrune(m, nowMs, opts.maxEntries);
  m.set(String(key), {
    value,
    expiresAtMs: ttlSec && ttlSec > 0 ? nowMs + Math.ceil(ttlSec) * 1000 : null
  });
}

export async function getLiveState<T>(ns: string, key: string | number): Promise<T | null> {
  if (isRedisEnabled()) {
    const raw = await runWithRedis(`live:get:${ns}`, async (redis) => redis.get(keyOf(ns, key)));
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const m = memStore(ns);
  const entry = m.get(String(key));
  if (!entry) return null;
  if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
    m.delete(String(key));
    return null;
  }
  return entry.value as T;
}

export async function deleteLiveState(ns: string, key: string | number): Promise<void> {
  if (isRedisEnabled()) {
    await runWithRedis(`live:del:${ns}`, async (redis) => redis.del(keyOf(ns, key)));
    return;
  }
  memStore(ns).delete(String(key));
}

/** Test-only: clear the in-memory fallback for a namespace (no-op for Redis mode). */
export function __resetLiveStateForTests(ns?: string): void {
  if (ns) memStores.delete(ns);
  else memStores.clear();
}
