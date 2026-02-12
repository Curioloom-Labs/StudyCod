import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import type { Response } from "express";
import { IS_PRODUCTION } from "../config";
import type { AuthRequest } from "./authMiddleware";
import { logger } from "../utils/logger";

function getRetryAfterSeconds(req: any, fallbackSeconds: number): number {
  const resetTime = req?.rateLimit?.resetTime as Date | undefined;
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
  return (req: any, res: Response, _next: any, options: any) => {
    const retryAfterSeconds = getRetryAfterSeconds(req, fallbackWindowSeconds);
    res.setHeader("Retry-After", String(retryAfterSeconds));

    logger.warn("Rate limit", {
      path: req.originalUrl,
      method: req.method,
      key: keyByPrincipalOrIp(req as AuthRequest),
      retryAfterSeconds,
      requestId: (req as any)?.requestId
    });

    res.status(options.statusCode).json({
      error: message,
      status: options.statusCode,
      message,
      retryAfterSeconds
    });
  };
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
    const noop = ((_req: any, _res: any, next: any) => next()) as RateLimitRequestHandler;
    (noop as any).resetKey = () => {};
    (noop as any).getKey = () => undefined;
    return noop;
  }

  const windowSeconds = Math.max(1, Math.round(opts.windowMs / 1000));

  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => keyByPrincipalOrIp(req as unknown as AuthRequest),
    handler: jsonRateLimitHandler(opts.message || "RATE_LIMIT", windowSeconds)
  });
}
