import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./authMiddleware";
import { env } from "../env";

type RateState = {
  short: number[];
  long: number[];
  lastSeenAt: number;
};

const store = new Map<string, RateState>();

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

export function submissionRateLimitMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const key = getClientKey(req);
  const now = nowMs();

  const shortWindowMs = clampInt((env as any).__rateLimitShortWindowMs ?? 10_000, 250, 10 * 60_000);
  const longWindowMs = clampInt((env as any).__rateLimitLongWindowMs ?? 60_000, 1000, 60 * 60_000);

  // Don't let a single key dominate the global execution queue.
  const maxQueueSize = clampInt((env as any).__maxExecutionQueueSize ?? 50, 0, 1_000_000);
  const fairCap = maxQueueSize > 0 ? Math.max(1, Math.floor(maxQueueSize * 0.5)) : 1;

  const shortMaxCfg = clampInt((env as any).__rateLimitShortMax ?? 5, 1, 1_000_000);
  const longMaxCfg = clampInt((env as any).__rateLimitLongMax ?? 20, 1, 1_000_000);

  const shortMax = Math.min(shortMaxCfg, fairCap);
  const longMax = Math.min(longMaxCfg, fairCap);

  const state: RateState = store.get(key) ?? { short: [], long: [], lastSeenAt: now };
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

  state.short.push(now);
  state.long.push(now);
  store.set(key, state);

  const idleCutoff = now - Math.max(longWindowMs * 2, 120_000);
  if (store.size > 10_000) {
    for (const [k, v] of store) {
      if (v.lastSeenAt < idleCutoff) store.delete(k);
    }
  }

  next();
}
