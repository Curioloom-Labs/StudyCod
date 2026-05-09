import { createClient } from "redis";
import type { RedisReply } from "rate-limit-redis";
import { env } from "../../env";
import { logger } from "../../utils/logger";

type SharedRedisClient = ReturnType<typeof createClient>;

const redisEnabled = Boolean(env.__redisEnabled);
const redisUrl = String(env.__redisUrl ?? "redis://127.0.0.1:6379").trim() || "redis://127.0.0.1:6379";
const redisKeyPrefix = String(env.__redisKeyPrefix ?? "studycod:").trim() || "studycod:";

let client: SharedRedisClient | null = null;
let connectPromise: Promise<SharedRedisClient | null> | null = null;
let disabledLogged = false;
let connectFailedLogged = false;
let lastRedisErrorLogAt = 0;
let lastRedisErrorMessage = "";

function shouldLogRedisError(message: string): boolean {
  const now = Date.now();
  const normalized = String(message ?? "").trim();
  const isSame = normalized === lastRedisErrorMessage;
  const minIntervalMs = 10_000;
  if (!isSame) {
    lastRedisErrorMessage = normalized;
    lastRedisErrorLogAt = now;
    return true;
  }
  if (now - lastRedisErrorLogAt >= minIntervalMs) {
    lastRedisErrorLogAt = now;
    return true;
  }
  return false;
}

function redactRedisUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return raw;
  }
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "unknown");
}

function ensureClient(): SharedRedisClient {
  if (client) return client;

  const c = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries: number) => {
        const attempt = Math.max(0, Number(retries) || 0);
        return Math.min(5_000, 250 * Math.pow(2, Math.min(attempt, 5)));
      }
    }
  });

  c.on("ready", () => {
    connectFailedLogged = false;
    logger.info("[redis] ready", {
      url: redactRedisUrl(redisUrl),
    });
  });

  c.on("error", (err: Error) => {
    const message = err?.message ?? "Redis client error";
    if (shouldLogRedisError(message)) {
      logger.warn("[redis] error", {
        message,
      });
    }
  });

  c.on("end", () => {
    logger.warn("[redis] disconnected");
  });

  client = c;
  return c;
}

export function getRedisClientForStore(): SharedRedisClient | null {
  if (!redisEnabled) return null;
  return ensureClient();
}

export function isRedisEnabled(): boolean {
  return redisEnabled;
}

export function getRedisKeyPrefix(): string {
  return redisKeyPrefix;
}

export function redisKey(...parts: Array<string | number>): string {
  const suffix = parts
    .map(v => String(v))
    .map(v => v.trim())
    .filter(Boolean)
    .join(":");
  return `${redisKeyPrefix}${suffix}`;
}

export async function getSharedRedisClient(): Promise<SharedRedisClient | null> {
  if (!redisEnabled) {
    if (!disabledLogged) {
      disabledLogged = true;
      logger.info("[redis] disabled");
    }
    return null;
  }

  const c = ensureClient();
  if (c.isOpen) return c;

  if (!connectPromise) {
    connectPromise = (async () => {
      try {
        await c.connect();
        connectFailedLogged = false;
        return c;
      } catch (err: unknown) {
        if (!connectFailedLogged) {
          connectFailedLogged = true;
          logger.warn("[redis] connect failed", {
            message: getErrorMessage(err),
            url: redactRedisUrl(redisUrl),
          });
        }
        return null;
      } finally {
        connectPromise = null;
      }
    })();
  }

  return await connectPromise;
}

export function getReadyRedisClient(): SharedRedisClient | null {
  if (!redisEnabled) return null;
  if (!client) return null;
  return client.isOpen ? client : null;
}

export async function runWithRedis<T>(opName: string, run: (redis: SharedRedisClient) => Promise<T>): Promise<T | null> {
  const c = await getSharedRedisClient();
  if (!c) return null;

  try {
    return await run(c);
  } catch (err: unknown) {
    logger.warn(`[redis] ${opName} failed`, {
      message: getErrorMessage(err),
    });
    return null;
  }
}

export function createRedisSendCommand() {
  return async (...args: string[]): Promise<RedisReply> => {
    const c = await getSharedRedisClient();
    if (!c) {
      throw new Error("REDIS_UNAVAILABLE");
    }
    return await c.sendCommand(args) as RedisReply;
  };
}

/**
 * Gracefully close Redis connection pool.
 * Call this during application shutdown to clean up resources.
 */
export async function shutdownRedis(): Promise<void> {
  if (!client) return;

  try {
    if (client.isOpen) {
      await client.quit();
      logger.info("[redis] disconnected gracefully");
    }
  } catch (err: unknown) {
    logger.warn("[redis] shutdown error", {
      message: getErrorMessage(err)
    });
  } finally {
    client = null;
    connectPromise = null;
  }
}
