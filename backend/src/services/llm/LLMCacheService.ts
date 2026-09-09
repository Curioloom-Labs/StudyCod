import * as crypto from 'crypto';
import { logger } from '../../utils/logger';
import { env } from '../../env';
export type LLMCacheMode = 'generateTask' | 'generateTheory' | 'generateQuiz' | 'generateTaskCondition' | 'generateTaskTemplate' | 'generateTestData';
interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}
interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface RedisClientLike {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  connect(): Promise<unknown>;
  on(event: "error", listener: (error: Error) => void): RedisClientLike;
  on(event: "connect", listener: () => void): RedisClientLike;
}

interface RedisModuleLike {
  createClient(options: { url: string }): RedisClientLike;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, CacheEntry<unknown>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
  // Hard cap on entries so a single instance can't grow unbounded within the TTL
  // window (large LLM JSON values × high prompt cardinality could exhaust RAM on a
  // memory-constrained box). Map keeps insertion order, so we evict the oldest
  // entry (LRU: get() refreshes recency by re-inserting).
  private readonly maxEntries: number = (() => {
    const n = Number.parseInt(String(env.LLM_MEMORY_CACHE_MAX_ENTRIES ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 500;
  })();
  constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }
  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    // Refresh recency for LRU ordering.
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    // Re-insert to move the key to the most-recent position.
    this.cache.delete(key);
    this.cache.set(key, {
      data: value,
      expiresAt
    });
    // Evict least-recently-used entries beyond the cap.
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}
class RedisCacheAdapter implements CacheAdapter {
  private client: RedisClientLike | null = null;
  public isConnected: boolean = false;
  public initPromise: Promise<void>;
  constructor() {
    this.initPromise = this.initializeRedis();
  }
  private async initializeRedis(): Promise<void> {
    try {
      let redis: Partial<RedisModuleLike> | null = null;
      try {
        redis = require("redis") as Partial<RedisModuleLike>;
      } catch {
        this.isConnected = false;
        return;
      }
      if (!redis?.createClient) {
        this.isConnected = false;
        return;
      }
      const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
      this.client = redis.createClient({
        url: redisUrl
      });
      this.client.on('error', (err: Error) => {
        logger.warn('[llm-cache] redis error', { message: err.message });
        this.isConnected = false;
      });
      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('[llm-cache] redis connected');
      });
      await this.client.connect();
    } catch (error: unknown) {
      this.isConnected = false;
      logger.debug('[llm-cache] redis unavailable', { message: errorMessage(error) });
    }
  }
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error: unknown) {
      logger.warn('[llm-cache] redis get failed', { message: errorMessage(error) });
      return null;
    }
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error: unknown) {
      logger.warn('[llm-cache] redis set failed', { message: errorMessage(error) });
    }
  }
  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(key);
    } catch (error: unknown) {
      logger.warn('[llm-cache] redis delete failed', { message: errorMessage(error) });
    }
  }
}
export class LLMCacheService {
  private adapter: CacheAdapter;
  private cachePrefix = 'llm:';
  constructor() {
    this.adapter = new MemoryCacheAdapter();
    if (env.REDIS_URL) {
      const redisAdapter = new RedisCacheAdapter();
      (async () => {
        try {
          await redisAdapter.initPromise;
          await new Promise(resolve => setTimeout(resolve, 500));
          if (redisAdapter.isConnected) {
            this.adapter = redisAdapter;
            logger.info('[llm-cache] using redis');
          }
        } catch (error) {}
      })();
    }
  }
  private getTTL(mode: LLMCacheMode): number {
    const ttlMap: Record<LLMCacheMode, number> = {
      generateTask: 24 * 60 * 60,
      generateTheory: 24 * 60 * 60,
      generateQuiz: 6 * 60 * 60,
      generateTestData: 6 * 60 * 60,
      generateTaskCondition: 12 * 60 * 60,
      generateTaskTemplate: 12 * 60 * 60
    };
    return ttlMap[mode] || 6 * 60 * 60;
  }
  private generateCacheKey(mode: LLMCacheMode, params: unknown): string {
    const source = params && typeof params === "object"
      ? params as Record<string, unknown>
      : {};
    const cleaned: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      const value = source[key];
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    const normalized = JSON.stringify(cleaned) ?? "{}";
    const hash = crypto.createHash('sha256').update(`${mode}:${normalized}`).digest('hex').substring(0, 16);
    const key = `${this.cachePrefix}${mode}:${hash}`;
    logger.debug('[llm-cache] key', { mode, key, paramsKeys: Object.keys(cleaned) });
    return key;
  }
  async get<T>(mode: LLMCacheMode, params: unknown): Promise<T | null> {
    try {
      const key = this.generateCacheKey(mode, params);
      const cached = await this.adapter.get<T>(key);
      if (cached) {
        logger.debug('[llm-cache] hit', { mode });
        return cached;
      }
      logger.debug('[llm-cache] miss', { mode });
      return null;
    } catch (error: unknown) {
      logger.warn('[llm-cache] get failed', { mode, message: errorMessage(error) });
      return null;
    }
  }
  async set<T>(mode: LLMCacheMode, params: unknown, value: T): Promise<void> {
    try {
      const key = this.generateCacheKey(mode, params);
      const ttl = this.getTTL(mode);
      await this.adapter.set(key, value, ttl);
      logger.debug('[llm-cache] set', { mode, ttlSeconds: ttl });
    } catch (error: unknown) {
      logger.warn('[llm-cache] set failed', { mode, message: errorMessage(error) });
    }
  }
  async invalidate(mode: LLMCacheMode, params: unknown): Promise<void> {
    try {
      const key = this.generateCacheKey(mode, params);
      await this.adapter.delete(key);
      logger.debug('[llm-cache] invalidate', { mode });
    } catch (error: unknown) {
      logger.warn('[llm-cache] invalidate failed', { mode, message: errorMessage(error) });
    }
  }
  async clearAll(): Promise<void> {
    logger.warn('[llm-cache] clearAll not implemented');
  }
}
let cacheServiceInstance: LLMCacheService | null = null;
export function getLLMCacheService(): LLMCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new LLMCacheService();
  }
  return cacheServiceInstance;
}
