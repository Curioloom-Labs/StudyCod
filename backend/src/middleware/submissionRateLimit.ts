import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./authMiddleware";
import { env } from "../env";
import { getSharedRedisClient, isRedisEnabled, redisKey } from "../services/redis/sharedRedis";

type RateState = {
  short: number[];
  long: number[];
  inflight: number;
  lastSeenAt: number;
};

const store = new Map<string, RateState>();
let cleanupTimer: NodeJS.Timeout | null = null;

function ensureCleanupTimer(longWindowMs: number): void {
  if (cleanupTimer) return;

  const intervalMs = Math.max(30_000, Math.min(longWindowMs, 5 * 60_000));
  cleanupTimer = setInterval(() => {
    const idleCutoff = Date.now() - Math.max(longWindowMs * 2, 120_000);
    for (const [k, v] of store) {
      if (v.lastSeenAt < idleCutoff) {
        store.delete(k);
      }
    }
  }, intervalMs);
  cleanupTimer.unref?.();
}

const SUBMISSION_LIMIT_LUA = `
local shortKey = KEYS[1]
local longKey = KEYS[2]
local inflightKey = KEYS[3]

local now = tonumber(ARGV[1])
local shortWindow = tonumber(ARGV[2])
local longWindow = tonumber(ARGV[3])
local shortMax = tonumber(ARGV[4])
local longMax = tonumber(ARGV[5])
local member = ARGV[6]
local ttlMs = tonumber(ARGV[7])
local trackInflight = tonumber(ARGV[8])
local inflightMax = tonumber(ARGV[9])
local inflightTtlMs = tonumber(ARGV[10])

if trackInflight == 1 then
  local inflight = tonumber(redis.call('GET', inflightKey) or '0')
  if inflight >= inflightMax then
    local ttl = tonumber(redis.call('PTTL', inflightKey) or '0')
    local retryMs = ttl > 0 and ttl or 1000
    return {0, retryMs}
  end
end

redis.call('ZREMRANGEBYSCORE', shortKey, 0, now - shortWindow)
redis.call('ZREMRANGEBYSCORE', longKey, 0, now - longWindow)

local shortCount = redis.call('ZCARD', shortKey)
if shortCount >= shortMax then
  local oldest = redis.call('ZRANGE', shortKey, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2] or now)
  local retryMs = math.max(1, oldestScore + shortWindow - now)
  return {0, retryMs}
end

local longCount = redis.call('ZCARD', longKey)
if longCount >= longMax then
  local oldest = redis.call('ZRANGE', longKey, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2] or now)
  local retryMs = math.max(1, oldestScore + longWindow - now)
  return {0, retryMs}
end

redis.call('ZADD', shortKey, now, member)
redis.call('PEXPIRE', shortKey, ttlMs)

redis.call('ZADD', longKey, now, member)
redis.call('PEXPIRE', longKey, ttlMs)

if trackInflight == 1 then
  redis.call('INCR', inflightKey)
  if inflightTtlMs and inflightTtlMs > 0 then
    redis.call('PEXPIRE', inflightKey, inflightTtlMs)
  end
end

return {1, 0}
`;

const RELEASE_INFLIGHT_LUA = `
local inflightKey = KEYS[1]

local current = tonumber(redis.call('GET', inflightKey) or '0')
if current <= 1 then
  redis.call('DEL', inflightKey)
  return 0
end

local nextValue = redis.call('DECR', inflightKey)
return tonumber(nextValue or 0)
`;

function nowMs(): number {
  return Date.now();
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getClientKey(req: AuthRequest): string {
  const pid = (req as any)?.principalId;
  if (typeof pid === "number" && Number.isFinite(pid) && pid > 0) return `user:${pid}`;

  const ip = String((req as any)?.ip ?? "").trim();
  if (ip) return `ip:${ip}`;

  const xfwd = String((req.headers["x-forwarded-for"] as any) ?? "");
  const first = xfwd.split(",")[0]?.trim();
  if (first) return `ip:${first}`;

  return "ip:unknown";
}

function pruneWindow(ts: number[], cutoffExclusive: number): number[] {
  let i = 0;
  while (i < ts.length && ts[i] < cutoffExclusive) i++;
  return i > 0 ? ts.slice(i) : ts;
}

function retryAfterSeconds(ts: number[], windowMs: number, now: number): number {
  if (!ts.length) return Math.max(1, Math.ceil(windowMs / 1000));
  const oldest = ts[0];
  const ms = oldest + windowMs - now;
  return Math.max(1, Math.ceil(ms / 1000));
}

function capHistoryWindow(ts: number[], maxEntries: number): number[] {
  if (ts.length <= maxEntries) return ts;
  return ts.slice(ts.length - maxEntries);
}

async function checkRedisRateLimit(params: {
  key: string;
  now: number;
  shortWindowMs: number;
  longWindowMs: number;
  shortMax: number;
  longMax: number;
  trackInflight: boolean;
  inFlightMax: number;
  inFlightTtlMs: number;
}): Promise<{ allowed: boolean; retryAfterSeconds: number; acquiredInFlight: boolean } | null> {
  if (!isRedisEnabled()) return null;
  const redis = await getSharedRedisClient();
  if (!redis) return null;

  const shortKey = redisKey("submission-rate", params.key, "short");
  const longKey = redisKey("submission-rate", params.key, "long");
  const inflightKey = redisKey("submission-rate", params.key, "inflight");
  const ttlMs = Math.max(params.longWindowMs * 2, 120_000);
  const member = `${params.now}-${Math.random().toString(36).slice(2, 10)}`;

  const raw = await redis.eval(SUBMISSION_LIMIT_LUA, {
    keys: [shortKey, longKey, inflightKey],
    arguments: [
      String(params.now),
      String(params.shortWindowMs),
      String(params.longWindowMs),
      String(params.shortMax),
      String(params.longMax),
      member,
      String(ttlMs),
      params.trackInflight ? "1" : "0",
      String(params.inFlightMax),
      String(params.inFlightTtlMs),
    ],
  });

  const payload = Array.isArray(raw) ? raw : [];
  const allowed = Number(payload[0] ?? 0) === 1;
  const retryMs = Number(payload[1] ?? 0);

  return {
    allowed,
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(retryMs / 1000)),
    acquiredInFlight: allowed && params.trackInflight,
  };
}

async function releaseRedisInFlight(key: string): Promise<void> {
  if (!isRedisEnabled()) return;
  const redis = await getSharedRedisClient();
  if (!redis) return;

  const inflightKey = redisKey("submission-rate", key, "inflight");
  await redis.eval(RELEASE_INFLIGHT_LUA, {
    keys: [inflightKey],
    arguments: [],
  });
}

function attachResponseRelease(
  res: Response,
  release: () => Promise<void> | void,
): boolean {
  const on = (res as any)?.on;
  if (typeof on !== "function") return false;

  let released = false;
  const onDone = () => {
    if (released) return;
    released = true;
    void release();
  };

  try {
    on.call(res, "finish", onDone);
    on.call(res, "close", onDone);
    return true;
  } catch {
    return false;
  }
}

export async function submissionRateLimitMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const key = getClientKey(req);
  const now = nowMs();

  const shortWindowMs = clampInt((env as any).__rateLimitShortWindowMs ?? 10_000, 250, 10 * 60_000);
  const longWindowMs = clampInt((env as any).__rateLimitLongWindowMs ?? 60_000, 1000, 60 * 60_000);

  // Don't let a single key dominate the global execution queue.
  const maxQueueSize = clampInt((env as any).__maxExecutionQueueSize ?? 50, 0, 1_000_000);
  const fairCap = maxQueueSize > 0 ? Math.max(1, Math.floor(maxQueueSize * 0.5)) : 1;

  const shortMaxCfg = clampInt((env as any).__rateLimitShortMax ?? 5, 1, 1_000_000);
  const longMaxCfg = clampInt((env as any).__rateLimitLongMax ?? 20, 1, 1_000_000);
  const inFlightMaxCfg = clampInt(
    (env as any).__rateLimitInFlightMax ?? Math.max(1, Math.floor(fairCap * 0.5)),
    1,
    1_000_000,
  );

  const shortMax = Math.min(shortMaxCfg, fairCap);
  const longMax = Math.min(longMaxCfg, fairCap);
  const inFlightMax = Math.min(inFlightMaxCfg, fairCap);
  const inFlightTtlMs = clampInt(
    (env as any).__rateLimitInFlightTtlMs ?? Math.max(longWindowMs * 2, 120_000),
    1_000,
    24 * 60 * 60 * 1000,
  );
  const trackInflight = typeof (res as any)?.on === "function";

  ensureCleanupTimer(longWindowMs);

  let redisDecision: Awaited<ReturnType<typeof checkRedisRateLimit>> = null;
  let redisUnavailable = false;
  try {
    redisDecision = await checkRedisRateLimit({
      key,
      now,
      shortWindowMs,
      longWindowMs,
      shortMax,
      longMax,
      trackInflight,
      inFlightMax,
      inFlightTtlMs,
    });
    redisUnavailable = isRedisEnabled() && !redisDecision;
  } catch {
    redisUnavailable = isRedisEnabled();
  }

  // When Redis is configured it is part of the abuse/cost-control boundary.
  // Failing open to a process-local Map would make limits inconsistent across
  // workers and could multiply expensive judge/AI requests. If Redis is not
  // configured at all, the local fallback below remains available for dev.
  if (redisUnavailable) {
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: "RATE_LIMIT_BACKEND_UNAVAILABLE",
      status: 503,
      message: "Submission protection is temporarily unavailable. Please retry shortly."
    });
    return;
  }

  if (redisDecision) {
    if (!redisDecision.allowed) {
      res.setHeader("Retry-After", String(redisDecision.retryAfterSeconds));
      res.status(429).json({
        error: "Too many submissions",
        status: 429,
      });
      return;
    }

    if (redisDecision.acquiredInFlight) {
      attachResponseRelease(res, () => releaseRedisInFlight(key));
    }

    next();
    return;
  }

  const state: RateState = store.get(key) ?? { short: [], long: [], inflight: 0, lastSeenAt: now };
  state.lastSeenAt = now;

  const shortCutoff = now - shortWindowMs;
  const longCutoff = now - longWindowMs;
  state.short = pruneWindow(state.short, shortCutoff);
  state.long = pruneWindow(state.long, longCutoff);

  if (state.short.length >= shortMax) {
    const ra = retryAfterSeconds(state.short, shortWindowMs, now);
    res.setHeader("Retry-After", String(ra));
    res.status(429).json({
      error: "Too many submissions",
      status: 429
    });
    return;
  }

  if (state.long.length >= longMax) {
    const ra = retryAfterSeconds(state.long, longWindowMs, now);
    res.setHeader("Retry-After", String(ra));
    res.status(429).json({
      error: "Too many submissions",
      status: 429
    });
    return;
  }

  if (trackInflight && state.inflight >= inFlightMax) {
    res.setHeader("Retry-After", "1");
    res.status(429).json({
      error: "Too many submissions",
      status: 429,
    });
    return;
  }

  state.short.push(now);
  state.long.push(now);
  if (trackInflight) {
    state.inflight += 1;
  }
  state.short = capHistoryWindow(state.short, shortMax + 2);
  state.long = capHistoryWindow(state.long, longMax + 2);
  store.set(key, state);

  if (trackInflight) {
    attachResponseRelease(res, async () => {
      const current = store.get(key);
      if (!current) return;
      current.inflight = Math.max(0, current.inflight - 1);
      current.lastSeenAt = nowMs();
      store.set(key, current);
    });
  }

  if (store.size > 10_000) {
    const idleCutoff = now - Math.max(longWindowMs * 2, 120_000);
    for (const [k, v] of store) {
      if (v.lastSeenAt < idleCutoff) store.delete(k);
    }
  }

  next();
}
