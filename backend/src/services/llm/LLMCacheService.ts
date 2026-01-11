import * as crypto from 'crypto';
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
class MemoryCacheAdapter implements CacheAdapter {
  private cache = new Map<string, CacheEntry<any>>();
  private cleanupInterval: NodeJS.Timeout | null = null;
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
    return entry.data as T;
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.cache.set(key, {
      data: value,
      expiresAt
    });
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
  private client: any = null;
  public isConnected: boolean = false;
  public initPromise: Promise<void>;
  constructor() {
    this.initPromise = this.initializeRedis();
  }
  private async initializeRedis(): Promise<void> {
    try {
      let redis: any = null;
      try {
        redis = require('redis');
      } catch {
        this.isConnected = false;
        return;
      }
      if (!redis || !redis.createClient) {
        this.isConnected = false;
        return;
      }
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.client = redis.createClient({
        url: redisUrl
      });
      this.client.on('error', (err: Error) => {
        if (process.env.NODE_ENV !== 'production') {
          console.error('[LLMCache] Redis error:', err.message);
        }
        this.isConnected = false;
      });
      this.client.on('connect', () => {
        this.isConnected = true;
        if (process.env.NODE_ENV !== 'production') {
          console.log('[LLMCache] Redis connected');
        }
      });
      await this.client.connect();
    } catch (error: any) {
      this.isConnected = false;
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[LLMCache] Redis not available:', error.message);
      }
    }
  }
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected || !this.client) return null;
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error: any) {
      console.error('[LLMCache] Redis get error:', error.message);
      return null;
    }
  }
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error: any) {
      console.error('[LLMCache] Redis set error:', error.message);
    }
  }
  async delete(key: string): Promise<void> {
    if (!this.isConnected || !this.client) return;
    try {
      await this.client.del(key);
    } catch (error: any) {
      console.error('[LLMCache] Redis delete error:', error.message);
    }
  }
}
export class LLMCacheService {
  private adapter: CacheAdapter;
  private cachePrefix = 'llm:';
  constructor() {
    this.adapter = new MemoryCacheAdapter();
    if (process.env.REDIS_URL) {
      const redisAdapter = new RedisCacheAdapter();
      (async () => {
        try {
          await redisAdapter.initPromise;
          await new Promise(resolve => setTimeout(resolve, 500));
          if (redisAdapter.isConnected) {
            this.adapter = redisAdapter;
            if (process.env.NODE_ENV !== 'production') {
              console.log('[LLMCache] Using Redis cache');
            }
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
  private generateCacheKey(mode: LLMCacheMode, params: any): string {
    const cleaned: any = {};
    for (const key of Object.keys(params).sort()) {
      const value = params[key];
      if (value !== undefined) {
        cleaned[key] = value;
      }
    }
    const normalized = JSON.stringify(cleaned);
    const hash = crypto.createHash('sha256').update(`${mode}:${normalized}`).digest('hex').substring(0, 16);
    const key = `${this.cachePrefix}${mode}:${hash}`;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[LLMCache] Generated key for ${mode}`, {
        key,
        paramsKeys: Object.keys(cleaned),
        topicTitle: cleaned.topicTitle,
        taskType: cleaned.taskType,
        language: cleaned.language
      });
    }
    return key;
  }
  async get<T>(mode: LLMCacheMode, params: any): Promise<T | null> {
    try {
      const key = this.generateCacheKey(mode, params);
      const cached = await this.adapter.get<T>(key);
      if (cached) {
        console.log(`[LLMCache] Cache HIT for ${mode}`);
        return cached;
      }
      console.log(`[LLMCache] Cache MISS for ${mode}`);
      return null;
    } catch (error: any) {
      console.error(`[LLMCache] Get error for ${mode}:`, error.message);
      return null;
    }
  }
  async set<T>(mode: LLMCacheMode, params: any, value: T): Promise<void> {
    try {
      const key = this.generateCacheKey(mode, params);
      const ttl = this.getTTL(mode);
      await this.adapter.set(key, value, ttl);
      console.log(`[LLMCache] Cached result for ${mode} (TTL: ${ttl}s)`);
    } catch (error: any) {
      console.error(`[LLMCache] Set error for ${mode}:`, error.message);
    }
  }
  async invalidate(mode: LLMCacheMode, params: any): Promise<void> {
    try {
      const key = this.generateCacheKey(mode, params);
      await this.adapter.delete(key);
      console.log(`[LLMCache] Invalidated cache for ${mode}`);
    } catch (error: any) {
      console.error(`[LLMCache] Invalidate error for ${mode}:`, error.message);
    }
  }
  async clearAll(): Promise<void> {
    console.warn('[LLMCache] clearAll() called - not fully implemented for Redis');
  }
}
let cacheServiceInstance: LLMCacheService | null = null;
export function getLLMCacheService(): LLMCacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new LLMCacheService();
  }
  return cacheServiceInstance;
}