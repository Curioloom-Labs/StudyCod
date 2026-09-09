import rateLimit, { RateLimitRequestHandler, type Options } from "express-rate-limit";
import { RedisStore as RedisRateLimitStore } from "rate-limit-redis";
import type { NextFunction, Request, Response } from "express";
import { IS_PRODUCTION } from "../config";
import type { AuthRequest } from "./authMiddleware";
import { logger } from "../utils/logger";
import { createRedisSendCommand, getRedisKeyPrefix, isRedisEnabled } from "../services/redis/sharedRedis";

type RateLimitRequest = AuthRequest & {
  rateLimit?: {
    resetTime?: Date;
  };
};

function getRetryAfterSeconds(req: RateLimitRequest, fallbackSeconds: number): number {
  const resetTime = req.rateLimit?.resetTime;
  if (resetTime instanceof Date) {
    const deltaMs = resetTime.getTime() - Date.now();
    return Math.max(1, Math.ceil(deltaMs / 1000));
  }
  return fallbackSeconds;
}

function keyByPrincipalOrIp(req: AuthRequest): string {
  if (req.studentId) return `student:${req.studentId}`;
  if (req.userId) return `user:${req.userId}`;
  return req.ip ?? "unknown";
}

function jsonRateLimitHandler(message: string, fallbackWindowSeconds: number) {
  return (req: Request, res: Response, _next: NextFunction, options: Options) => {
    const rateLimitReq = req as RateLimitRequest;
    const retryAfterSeconds = getRetryAfterSeconds(rateLimitReq, fallbackWindowSeconds);
    res.setHeader("Retry-After", String(retryAfterSeconds));

    logger.warn("Rate limit", {
      path: req.originalUrl,
      method: req.method,
      key: keyByPrincipalOrIp(rateLimitReq),
      retryAfterSeconds,
      requestId: rateLimitReq.requestId
    });

    res.status(options.statusCode).json({
      error: message,
      status: options.statusCode,
      message,
      retryAfterSeconds
    });
  };
}

export function createRedisRateLimitStore(prefix: string) {
  if (!isRedisEnabled()) return undefined;

  return new RedisRateLimitStore({
    sendCommand: createRedisSendCommand(),
    prefix: `${getRedisKeyPrefix()}ratelimit:${prefix}:`
  });
}

export type RouteLimiterOptions = {
  /** Whether limiter is enabled. Defaults to IS_PRODUCTION. */
  enabled?: boolean;
  /** Window in milliseconds. */
  windowMs: number;
  /** Max requests per window. */
  limit: number;
  /** Response message. Defaults to RATE_LIMIT. */
  message?: string;
};

/**
 * Creates a JSON rate limiter that keys by principal (student/user) when available, otherwise by IP.
 *
 * IMPORTANT: place it after `authRequired` if you want per-user/per-student limits.
 */
export function createRouteLimiter(opts: RouteLimiterOptions): RateLimitRequestHandler {
  const enabled = opts.enabled ?? IS_PRODUCTION;
  if (!enabled) {
    const noop = ((_req: Request, _res: Response, next: NextFunction) => next()) as RateLimitRequestHandler;
    noop.resetKey = (_key: string) => {};
    noop.getKey = (_key: string) => undefined;
    return noop;
  }

  const windowSeconds = Math.max(1, Math.round(opts.windowMs / 1000));
  const store = createRedisRateLimitStore("route");

  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    store,
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => keyByPrincipalOrIp(req as unknown as AuthRequest),
    handler: jsonRateLimitHandler(opts.message || "RATE_LIMIT", windowSeconds)
  });
}
