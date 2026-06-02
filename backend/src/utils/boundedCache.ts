/**
 * Tiny LRU+TTL cache with no external dependencies.
 *
 * Why not depend on `lru-cache`? It would be a perfectly fine choice, but for
 * the handful of small hot caches we have it is not worth a new transitive
 * dependency. This implementation uses the insertion-order property of
 * `Map.prototype.keys()` to keep the implementation under 60 lines.
 *
 * Trade-offs:
 *  - `get()` is O(1) but mutates Map order (delete + re-set), so it is not
 *    safe to call from within iteration of the cache.
 *  - Expired entries are evicted lazily on access plus a hard size cap on
 *    `set()`. There is no background timer — important for short-lived
 *    Node processes where idle timers prevent clean shutdown.
 */
export interface BoundedCacheOptions {
  /** Hard upper bound on the number of entries. */
  maxEntries: number;
  /** Time-to-live for each entry in milliseconds. */
  ttlMs: number;
}

interface Entry<V> {
  value: V;
  expiresAt: number;
}

export class BoundedCache<K, V> {
  private readonly store = new Map<K, Entry<V>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: BoundedCacheOptions) {
    if (!Number.isFinite(options.maxEntries) || options.maxEntries <= 0) {
      throw new Error("BoundedCache: maxEntries must be a positive number");
    }
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error("BoundedCache: ttlMs must be a positive number");
    }
    this.maxEntries = Math.floor(options.maxEntries);
    this.ttlMs = Math.floor(options.ttlMs);
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    // Touch: move to most-recently-used position.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict least-recently-used (the first key in insertion order).
      const oldestKey = this.store.keys().next().value as K | undefined;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }
}
