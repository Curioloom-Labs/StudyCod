import "reflect-metadata";
import express, { type Request as ExpressRequest } from "express";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
import { RedisStore } from "connect-redis";
import passport from "passport";
import lusca from "lusca";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AppDataSource } from "./data-source";
import { setupGoogleStrategy } from "./middleware/googleAuth";
import { authRouter } from "./routes/auth";
import { profileRouter } from "./routes/profile";
import { tasksRouter } from "./routes/tasks";
import { gradeRouter } from "./routes/gradeRoutes";
import { streakRouter } from "./routes/streak";
import { birthdayRouter } from "./routes/birthday";
import eduRouter from "./routes/edu";
import topicsRouter from "./routes/topics";
import { theoryRouter } from "./routes/theory";
import adminRouter from "./routes/admin";
import supportRouter from "./routes/support";
import supportDeskRouter from "./routes/adminSupport";
import libraryRouter from "./routes/library";
import contestsRouter from "./routes/contests";
import emailsRouter from "./routes/emails";
import certificateRouter from "./routes/certificate";
import playgroundRouter from "./routes/playground";
import lspRouter from "./routes/lsp";
import blogRouter from "./routes/blog";
import notificationsRouter from "./routes/notifications";
import { maintenanceMiddleware } from "./middleware/maintenanceMiddleware";
import { geoBlockMiddleware } from "./middleware/geoBlockMiddleware";
import { evaluateGeoBlock } from "./services/geoBlockService";
import { requestContextMiddleware } from "./middleware/requestContext";
import { placementGate } from "./middleware/placementGate";
import { authMiddleware } from "./middleware/authMiddleware";
import { forbidContestModeUsers } from "./middleware/contestModeGuard";
import { PORT, CORS_ORIGIN, CORS_ORIGINS, SESSION_SECRET, IS_PRODUCTION, TRUST_PROXY, JWT_SECRET } from "./config";
import jwt from "jsonwebtoken";
import { logger } from "./utils/logger";
import { HttpError } from "./utils/httpError";
import { spawn } from "child_process";
import * as fsSync from "fs";
import * as path from "path";
import { resolveJudgeSandboxConfig, resolveJudgeWorkerEntry } from "./services/judgeWorker/workerPaths";
import { getExecutionQueueMode } from "./services/execution/distributedJudgeQueueSingleton";
import { getJudgeExecutionMetrics } from "./services/judgeWorker";
import { sweepTestCache } from "./services/judgeWorker/testCache";
import { cleanupCompletedPersonalTaskTests } from "./services/personalTaskCleanup";
import { getOpenRouterRuntimeDiagnostics } from "./services/llm/OpenRouterProvider";
import { env } from "./env";
import { setRetryAfterForOverload } from "./middleware/overloadRetryAfter";
import { startCertificateQueueWorker } from "./services/certificates/CertificateQueueWorker";
import {
  LEGACY_MIGRATION_HISTORY_BASELINE,
  getLegacyMigrationHistoryRowByName,
  getLegacyMigrationHistoryRowByTableName,
  stampLegacyMigrationHistory,
} from "./migrations/legacyMigrationHistory";
import { createRedisRateLimitStore } from "./middleware/routeRateLimit";
import { getRedisClientForStore, getRedisKeyPrefix, getSharedRedisClient, isRedisEnabled } from "./services/redis/sharedRedis";
import { shutdownRedis } from "./services/redis/sharedRedis";
import { seedTopicsIfNeeded } from "./utils/seedTopics";
import { checkReadiness, renderPrometheusMetrics } from "./observability/health";
import { httpMetricsMiddleware } from "./observability/httpMetrics";
const app = express();

// Graceful shutdown plumbing.
//
// The HTTP server handle is set in bootstrap() once app.listen() resolves.
// shutdown() is idempotent and bounded: it stops accepting new connections,
// drains in-flight ones with a deadline, releases Redis, then exits. Without
// this, SIGTERM during a slow request would cut the client off and orphan
// child processes (e.g. nsjail health probes spawned in /health/judge).
let httpServer: import("http").Server | null = null;
let shutdownInProgress = false;

const SHUTDOWN_DRAIN_TIMEOUT_MS = (() => {
  const raw = (process.env.SHUTDOWN_DRAIN_TIMEOUT_MS ?? "").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1000 ? n : 15_000;
})();

async function gracefulShutdown(reason: string, exitCode: number): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  logger.info("[shutdown] starting graceful shutdown", { reason, exitCode, drainTimeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS });

  // 1) Stop accepting new HTTP connections and drain existing ones.
  if (httpServer) {
    const drained = await new Promise<boolean>(resolve => {
      let settled = false;
      const onDone = (ok: boolean) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      const timer = setTimeout(() => {
        logger.warn("[shutdown] HTTP drain timeout exceeded, forcing close", { timeoutMs: SHUTDOWN_DRAIN_TIMEOUT_MS });
        onDone(false);
      }, SHUTDOWN_DRAIN_TIMEOUT_MS);
      timer.unref?.();
      httpServer!.close(err => {
        clearTimeout(timer);
        if (err) {
          logger.warn("[shutdown] HTTP server close error", { error: err?.message });
        }
        onDone(true);
      });
    });
    logger.info("[shutdown] HTTP server drained", { cleanly: drained });
  }

  // 2) Release Redis after HTTP so in-flight handlers could still use it.
  try {
    await shutdownRedis();
  } catch (err: any) {
    logger.warn("[shutdown] Redis shutdown error", { error: err?.message });
  }

  process.exit(exitCode);
}

process.on("SIGTERM", () => { void gracefulShutdown("SIGTERM", 0); });
process.on("SIGINT", () => { void gracefulShutdown("SIGINT", 0); });
if (isRedisEnabled()) {
  void getSharedRedisClient();
}

function createSessionStore(): session.Store | undefined {
  const mode = String((env as any).__sessionStore ?? process.env.SESSION_STORE ?? "").trim().toLowerCase();
  if (mode !== "redis") {
    logger.info("[session] using in-memory store", { mode: mode || "memory" });
    return undefined;
  }

  try {
    const redisClient = getRedisClientForStore();
    if (!redisClient) {
      const message = "[session] SESSION_STORE=redis requested but redis is unavailable";
      logger.error(message);
      if (IS_PRODUCTION) {
        throw new Error(message);
      }
      logger.warn("[session] falling back to in-memory store in non-production");
      return undefined;
    }

    void getSharedRedisClient().then(client => {
      if (client) {
        logger.info("[session] using redis store");
      } else {
        logger.warn("[session] redis unavailable; session store will fallback to in-process behavior until reconnect");
      }
    });

    return new RedisStore({
      client: redisClient,
      prefix: `${getRedisKeyPrefix()}sess:`
    });
  } catch (err: any) {
    logger.error("[session] redis store initialization failed", {
      message: err?.message
    });
    return undefined;
  }
}

const serverStartedAt = new Date();

// Operational visibility: judge misconfiguration should not prevent the backend from booting,
// but we must make it obvious in logs so it gets fixed quickly.
if (IS_PRODUCTION) {
  const issues: string[] = [];
  if (!env.__judgeWorkerEntry) issues.push("JUDGE_WORKER_ENTRY is empty");
  if (!env.__nsjailConfig) issues.push("NSJAIL_CONFIG is empty");
  if (!env.__nsjailPath) issues.push("NSJAIL_PATH is empty");
  // NSJAIL_USE_CONFIG is no longer required in production: judge infers config-mode from NSJAIL_CONFIG.

  if (issues.length) {
    logger.error("[startup] judge is misconfigured; submissions/check endpoints will fail", {
      issues,
      nsjailUseConfig: env.__nsjailUseConfig ? "1" : "0",
      workerEntry: env.__judgeWorkerEntry || null,
      nsjailPath: env.__nsjailPath || null,
      nsjailConfig: env.__nsjailConfig || null,
    });
  }
}

// Only treat as a disconnect a real syscall/stream error originating in
// node:net or node:http. Previously any object with code:'EPIPE' triggered
// the silent-ignore path, which would also hide bugs that happen to throw
// such an object from business logic.
function isDisconnectError(err: any): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as any).code;
  if (code !== "EPIPE" && code !== "ECONNRESET" && code !== "ERR_STREAM_DESTROYED") {
    return false;
  }
  const syscall = (err as any).syscall;
  // EPIPE/ECONNRESET from sockets always have a syscall (write/read/shutdown).
  // ERR_STREAM_DESTROYED is a Node stream error and has no syscall but does
  // come from node-internal stack frames — accept it without a syscall.
  if (code === "ERR_STREAM_DESTROYED") return true;
  return typeof syscall === "string" && syscall.length > 0;
}

// Global limiter key.
//
// Anonymous requests are keyed by client IP. Authenticated requests are keyed
// by IP + signed principal id, which fixes two problems at once:
//   1. A shared NAT (an entire classroom behind one school IP) no longer
//      shares a single 300/min bucket — each student gets their own.
//   2. A leaked/revoked token replayed from a DIFFERENT network keys to
//      `attackerIP:principal`, which can never exhaust the victim's real
//      `victimIP:principal` bucket — so it cannot be used to DoS the victim.
//
// We verify the JWT signature here (cheap HMAC) so the principal id cannot be
// spoofed; we intentionally do NOT run the async revocation check — this only
// selects a rate-limit bucket, and authz/revocation is still enforced later in
// authMiddleware. An invalid signature simply falls back to IP-only keying.
function resolveGlobalRateLimitKey(req: express.Request): string {
  const ip = req.ip ?? "unknown";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(authHeader.slice("Bearer ".length), JWT_SECRET) as {
        userId?: number;
        studentId?: number;
      };
      const principalId = payload?.studentId ?? payload?.userId;
      if (principalId) return `${ip}:p${principalId}`;
    } catch {
      // Invalid/expired token → treat as anonymous for bucketing.
    }
  }
  return ip;
}

// In production behind a reverse proxy, clients can disconnect while we are still computing.
// Writing a response to a closed socket may produce EPIPE/ECONNRESET; do not crash the process.
process.on("uncaughtException", (err: any) => {
  if (isDisconnectError(err)) {
    logger.warn("Socket disconnected (ignored)", {
      code: err?.code,
      message: err?.message
    });
    return;
  }
  logger.error("Uncaught exception", { err });
  // Fail-fast for unknown errors, but drain HTTP/Redis first so in-flight
  // clients get a clean close instead of a TCP reset.
  void gracefulShutdown("uncaughtException", 1);
});

// Unhandled promise rejections are usually LOCAL bugs (a missed `.catch` on a
// fire-and-forget call), not process-wide corruption like an uncaughtException.
// Killing the whole server on the first one means a single stray rejection
// anywhere — including inside a third-party lib or a background timer — takes
// down auth, admin, and every in-flight request. We therefore log every
// rejection and only fail fast when they arrive faster than a threshold within
// a rolling window, which signals a genuine systemic problem (e.g. a hot loop
// of rejections) rather than a one-off.
//
// Set UNHANDLED_REJECTION_FATAL_THRESHOLD=0 to never auto-restart on rejections.
const UNHANDLED_REJECTION_WINDOW_MS = (() => {
  const n = Number.parseInt(String(process.env.UNHANDLED_REJECTION_WINDOW_MS ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 1000 ? n : 60_000;
})();
const UNHANDLED_REJECTION_FATAL_THRESHOLD = (() => {
  const raw = String(process.env.UNHANDLED_REJECTION_FATAL_THRESHOLD ?? "").trim();
  if (raw === "") return 25;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 25;
})();
let unhandledRejectionTimestamps: number[] = [];
process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled rejection", { reason });
  if (UNHANDLED_REJECTION_FATAL_THRESHOLD <= 0) return;

  const now = Date.now();
  unhandledRejectionTimestamps.push(now);
  unhandledRejectionTimestamps = unhandledRejectionTimestamps.filter(t => now - t <= UNHANDLED_REJECTION_WINDOW_MS);

  if (unhandledRejectionTimestamps.length >= UNHANDLED_REJECTION_FATAL_THRESHOLD) {
    logger.error("Unhandled rejection rate exceeded threshold; draining and restarting", {
      count: unhandledRejectionTimestamps.length,
      windowMs: UNHANDLED_REJECTION_WINDOW_MS,
      threshold: UNHANDLED_REJECTION_FATAL_THRESHOLD
    });
    void gracefulShutdown("unhandledRejection-threshold", 1);
  }
});

app.set("trust proxy", TRUST_PROXY);
// API-only CSP. Backend almost exclusively returns JSON, but some flows
// (Google OAuth callback redirect, the few HTML probe responses) need a
// tight default. `default-src 'none'` blocks any script/style/image fetch
// initiated by a response that somehow ends up rendered in a browser.
// `frame-ancestors 'none'` prevents clickjacking against any future iframe-
// serving endpoint. Frontend has its own CSP; this is strictly for the API.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-site" }
}));
// NOTE: In express-rate-limit, limit=0 means "allow 0 requests" (i.e. always 429).
// We only enable global rate limiting in production.
if (IS_PRODUCTION) {
  const globalRateLimitStore = createRedisRateLimitStore("global");
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    keyGenerator: req => resolveGlobalRateLimitKey(req),
    store: globalRateLimitStore,
    passOnStoreError: true,
    skip: req => req.path === "/health" || req.path === "/api/health",
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, _next, options) => {
      // express-rate-limit sets standard rate limit headers; add a simple JSON body for clients.
      const retryAfterSeconds = (() => {
        try {
          const resetTime = (req as any)?.rateLimit?.resetTime as Date | undefined;
          if (resetTime instanceof Date) {
            const deltaMs = resetTime.getTime() - Date.now();
            return Math.max(1, Math.ceil(deltaMs / 1000));
          }
        } catch {}
        return 60;
      })();
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(options.statusCode).json({
        error: "RATE_LIMIT",
        status: options.statusCode,
        message: "RATE_LIMIT",
        retryAfterSeconds
      });
    }
  }));
}
// Build the allowlist once at startup. `__corsOrigins` is already a normalized
// comma-split array; `CORS_ORIGIN` may itself be a comma-list (legacy callers).
// Treating `[CORS_ORIGIN]` as a single string in fallback breaks comma-list
// configs and can silently lock everything out — splitting + filtering avoids
// that. If nothing resolves and we are NOT in production, we default to the
// vite dev origin so local boots don't break.
const corsAllowlist: string[] = (() => {
  const fromArray = Array.isArray(CORS_ORIGINS) ? CORS_ORIGINS : [];
  const fromScalar = String(CORS_ORIGIN ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  const merged = Array.from(new Set([...fromArray, ...fromScalar]));
  if (merged.length === 0 && !IS_PRODUCTION) {
    return ["http://localhost:5173"];
  }
  return merged;
})();

if (corsAllowlist.length === 0) {
  logger.error("[cors] No allowed origins resolved — all cross-origin browser requests will be rejected");
} else {
  logger.info("[cors] allowlist resolved", { origins: corsAllowlist });
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = corsAllowlist.includes(origin);
    return cb(allowed ? null : new Error("CORS_NOT_ALLOWED"), allowed);
  },
  credentials: true
}));
app.use((_req, res, next) => {
  res.charset = 'utf-8';
  next();
});

// Attach a low-level response error handler so socket write errors don't crash the process.
app.use((req, res, next) => {
  res.on("error", (err: any) => {
    if (isDisconnectError(err)) {
      logger.warn("Response error due to disconnect (ignored)", {
        code: err?.code,
        path: req.originalUrl,
        method: req.method
      });
      return;
    }
    logger.error("Response stream error", {
      err,
      path: req.originalUrl,
      method: req.method
    });
  });
  next();
});

// Per-route body limits.
//
// Previously a single 50MB limit was applied globally — that is DoS-friendly
// because every endpoint (including /auth/login and /health) had to accept and
// parse multi-MB payloads. We now keep a tight default for all routes and only
// raise the limit for routes that legitimately need it (library task
// create/update with many test cases, admin imports, topics archive upload).
//
// Configuration:
//   BODY_LIMIT_DEFAULT (default "256kb")
//   BODY_LIMIT_LARGE   (default "50mb")
// Legacy API_BODY_LIMIT / BODY_LIMIT are still respected but now configure the
// LARGE limit (they used to configure everything).
const LARGE_BODY_PATH_PREFIXES = [
  "/library", "/api/library",
  "/admin", "/api/admin",
  "/topics", "/api/topics",
  "/contests", "/api/contests"
];
const defaultBodyLimit = String(process.env.BODY_LIMIT_DEFAULT || "256kb");
const largeBodyLimit = String(
  process.env.BODY_LIMIT_LARGE
    || process.env.API_BODY_LIMIT
    || process.env.BODY_LIMIT
    || "50mb"
);

function isLargeBodyPath(path: string): boolean {
  for (const prefix of LARGE_BODY_PATH_PREFIXES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

const jsonParserDefault = express.json({ limit: defaultBodyLimit });
const jsonParserLarge = express.json({ limit: largeBodyLimit });
const urlencodedParserDefault = express.urlencoded({ extended: false, limit: defaultBodyLimit });
const urlencodedParserLarge = express.urlencoded({ extended: false, limit: largeBodyLimit });

app.use((req, res, next) => {
  (isLargeBodyPath(req.path) ? jsonParserLarge : jsonParserDefault)(req, res, next);
});
app.use((req, res, next) => {
  (isLargeBodyPath(req.path) ? urlencodedParserLarge : urlencodedParserDefault)(req, res, next);
});
app.use(requestContextMiddleware);
app.use(httpMetricsMiddleware);
app.use(geoBlockMiddleware);
app.use(maintenanceMiddleware);
const sessionStore = createSessionStore();
const sessionMiddleware = session({
  store: sessionStore,
  secret: SESSION_SECRET,
  // Do NOT persist empty sessions: prevents Redis/session bloat and accidental
  // session creation for anonymous probes (/health, bots, preflights).
  saveUninitialized: false,
  resave: false,
  name: "__sid",
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
    // Set COOKIE_DOMAIN=.studycod.space in prod to share the session across
    // subdomains (school./contest.). Unset = host-only (current behaviour).
    domain: (process.env.COOKIE_DOMAIN || "").trim() || undefined
  }
});

// Paths that never need a session (health probes and internal diagnostics).
// We early-return to avoid even touching the session store.
const SESSIONLESS_PATH_PREFIXES = ["/health", "/api/health", "/ready", "/api/ready", "/metrics", "/api/metrics", "/internal/", "/api/internal/"];
function isSessionlessPath(path: string): boolean {
  if (path === "/" || path === "/api" || path === "/api/") return true;
  for (const prefix of SESSIONLESS_PATH_PREFIXES) {
    if (path === prefix.replace(/\/$/, "") || path.startsWith(prefix)) return true;
  }
  return false;
}
function isGoogleOAuthPath(req: ExpressRequest): boolean {
  if (req.method !== "GET") return false;
  return [
    "/api/auth/google",
    "/api/auth/google/callback",
    "/auth/google",
    "/auth/google/callback",
  ].includes(req.path);
}
app.use((req, res, next) => {
  if (isSessionlessPath(req.path)) return next();
  return sessionMiddleware(req, res, next);
});
app.use(passport.initialize());
const passportSessionMiddleware = passport.session();
app.use((req, res, next) => {
  if (isSessionlessPath(req.path)) return next();
  return passportSessionMiddleware(req, res, next);
});

// Protect cookie-authenticated state-changing requests. The Angular-compatible
// cookie/header mode lets the browser client send the token without placing it
// in URLs or request bodies. Tests use JWT fixtures and intentionally bypass
// this browser-only middleware.
if (process.env.NODE_ENV !== "test") {
  const csrfMiddleware = lusca.csrf({
    angular: true,
    cookie: {
      options: {
        httpOnly: false,
        secure: IS_PRODUCTION,
        sameSite: "lax"
      }
    }
  });
  // Health/readiness/metrics probes deliberately bypass sessions. Lusca
  // requires req.session even for safe GET requests, so do not invoke it for
  // those sessionless endpoints.
  app.use((req, res, next) => {
    // OAuth redirects are top-level GET requests initiated by Google and do
    // not carry the browser's CSRF header/token. OAuth state validation covers
    // these endpoints; state-changing exchange requests remain protected.
    if (isSessionlessPath(req.path) || isGoogleOAuthPath(req)) return next();
    return csrfMiddleware(req, res, next);
  });
}
setupGoogleStrategy();
if (!IS_PRODUCTION) {
  app.use(morgan("dev"));
}
app.get("/", (_req, res) => {
  res.json({
    message: "StudyCod API",
    version: "1.0.0",
    status: "ok"
  });
});
app.get(["/api", "/api/"], (_req, res) => {
  res.json({
    message: "StudyCod API (namespaced)",
    version: "1.0.0",
    status: "ok"
  });
});
app.get(["/csrf-token", "/api/csrf-token"], (_req, res) => {
  res.status(204).end();
});
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    status: "ok",
    service: "studycod-backend",
    version: "1.0.0",
    startedAt: serverStartedAt.toISOString(),
    buildSha: process.env.BUILD_SHA || process.env.GIT_SHA || process.env.COMMIT_SHA || null,
    buildTime: process.env.BUILD_TIME || null,
    nodeEnv: process.env.NODE_ENV || null,
    isProduction: IS_PRODUCTION
  });
});

// Geo verdict endpoint. Always returns 200 (never blocked) so the SPA can read
// the decision and render the dedicated block page. Exempt from geoBlockMiddleware
// via the bypass list. We expose only the boolean + country, never the raw IP.
app.get(["/geo", "/api/geo"], (req, res) => {
  const verdict = evaluateGeoBlock(req);
  res.json({
    geoBlocked: verdict.blocked,
    country: verdict.country
  });
});

// Readiness probe: unlike /health (liveness), this reports whether the instance
// can serve traffic right now (DB reachable). Orchestrators should gate traffic
// on a 200 here so rolling deploys don't route at instances still booting or
// running startup migrations. Returns 503 with per-dependency detail otherwise.
app.get(["/ready", "/api/ready"], async (_req, res) => {
  try {
    const result = await checkReadiness();
    res.status(result.ready ? 200 : 503).json({
      status: result.ready ? "ready" : "not-ready",
      checks: result.checks
    });
  } catch (err: any) {
    res.status(503).json({ status: "not-ready", error: String(err?.message || "READINESS_CHECK_FAILED") });
  }
});

// Prometheus metrics. Gated in production (operational info) behind
// METRICS_ENABLED=1, mirroring the other internal diagnostics endpoints.
const METRICS_EXPOSED = !IS_PRODUCTION || String(process.env.METRICS_ENABLED || "").trim() === "1";
app.get(["/metrics", "/api/metrics"], (_req, res) => {
  if (!METRICS_EXPOSED) {
    return res.status(404).json({ error: "NOT_FOUND", status: 404 });
  }
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.status(200).send(renderPrometheusMetrics());
});

// Internal diagnostics endpoint. Exposed only in non-production by default.
app.get(["/internal/load", "/api/internal/load"], (_req, res) => {
  if (IS_PRODUCTION) {
    return res.status(404).json({ error: "NOT_FOUND", status: 404 });
  }

  const m = getJudgeExecutionMetrics();
  res.json({
    mode: getExecutionQueueMode(),
    active: m.active,
    queued: m.queued,
    peakActive: m.peakActive,
    peakQueueLength: m.peakQueueLength,
    maxConcurrent: m.maxConcurrent,
    maxQueueSize: m.maxQueueSize,
    maxRetries: m.maxRetries,
    avgExecutionTimeMs: Math.round(m.avgExecutionTimeMs),
    avgQueueWaitTimeMs: Math.round(m.averageQueueWaitTime),
    totalRejectedQueueFull: m.totalRejectedQueueFull,
    totalRequeuedExpired: m.totalRequeuedExpired,
    totalDeadLettered: m.totalDeadLettered,
    deadLetterQueueLength: m.deadLetterQueueLength,
    totalCompleted: m.totalCompleted,
  });
});

app.get(["/internal/ai/openrouter", "/api/internal/ai/openrouter"], (_req, res) => {
  const exposeInProduction = String(process.env.EXPOSE_INTERNAL_AI_DIAGNOSTICS || "").trim() === "1";
  if (IS_PRODUCTION && !exposeInProduction) {
    return res.status(404).json({ error: "NOT_FOUND", status: 404 });
  }

  return res.json({
    status: "ok",
    service: "studycod-backend",
    diagnostics: getOpenRouterRuntimeDiagnostics()
  });
});

// Cache the judge health probe result. A per-second monitor would otherwise
// spawn one nsjail child per request — expensive and noisy. TTL kept short
// enough that a real outage surfaces within a few polls.
const JUDGE_HEALTH_CACHE_TTL_MS = (() => {
  const raw = (process.env.JUDGE_HEALTH_CACHE_TTL_MS ?? "").trim();
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 5_000;
})();
let judgeHealthCache: { at: number; status: number; body: any } | null = null;
let judgeHealthInFlight: Promise<void> | null = null;

app.get(["/health/judge", "/api/health/judge"], async (_req, res) => {
  const now = Date.now();
  if (judgeHealthCache && now - judgeHealthCache.at < JUDGE_HEALTH_CACHE_TTL_MS) {
    return res.status(judgeHealthCache.status).json(judgeHealthCache.body);
  }
  // Coalesce concurrent probes: only one underlying spawn runs at a time.
  if (judgeHealthInFlight) {
    await judgeHealthInFlight;
    if (judgeHealthCache) {
      return res.status(judgeHealthCache.status).json(judgeHealthCache.body);
    }
  }
  let resolveInFlight: () => void = () => {};
  judgeHealthInFlight = new Promise<void>(r => { resolveInFlight = r; });
  try {
    const nsjailPath = env.__nsjailPath || "/usr/bin/nsjail";
    const nsjailExists = (() => {
      try {
        return !!nsjailPath && fsSync.existsSync(nsjailPath);
      } catch {
        return false;
      }
    })();

    const nsjailExecutable = (() => {
      if (!nsjailExists) return false;
      // Windows doesn't have POSIX executable bits; treat existence as executable.
      if (process.platform === "win32") return true;
      try {
        fsSync.accessSync(nsjailPath, fsSync.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    })();

    const workerEntry = await resolveJudgeWorkerEntry();
    const configPath = resolveJudgeSandboxConfig();

    const judgeVersion = (() => {
      try {
        // workerEntry is typically judge/dist/index.js
        const pkgPath = path.resolve(path.dirname(workerEntry), "..", "package.json");
        const raw = fsSync.readFileSync(pkgPath, "utf8");
        const parsed = JSON.parse(raw);
        return typeof parsed?.version === "string" ? parsed.version : null;
      } catch {
        return null;
      }
    })();

    const readInt = (name: string, fallback: number): number => {
      const v = parseInt(String(process.env[name] ?? ""), 10);
      return Number.isFinite(v) && v > 0 ? v : fallback;
    };

    const limits = {
      maxInputBytes: readInt("JUDGE_MAX_INPUT_BYTES", 32 * 1024 * 1024),
      maxTests: readInt("JUDGE_MAX_TESTS", 5000),
      maxTestInputBytes: readInt("JUDGE_MAX_TEST_INPUT_BYTES", 1024 * 1024),
      maxTestOutputBytes: readInt("JUDGE_MAX_TEST_OUTPUT_BYTES", 1024 * 1024),
      // Alias to match clients that expect a single output cap.
      maxOutputBytes: readInt("JUDGE_MAX_TEST_OUTPUT_BYTES", 1024 * 1024),
      maxFiles: readInt("JUDGE_MAX_FILES", 64),
      maxSourceBytes: 1024 * 1024
    };

    const sandboxMode = IS_PRODUCTION ? "config" : (env.__nsjailUseConfig ? "config" : "cli");

    const ok = Boolean(workerEntry) && Boolean(configPath) && nsjailExists && nsjailExecutable;
    if (!ok) {
      const body = { error: "Judge unavailable", status: 503 };
      judgeHealthCache = { at: Date.now(), status: 503, body };
      res.status(503).json(body);
      return;
    }

    const health = await new Promise<any>((resolve, reject) => {
      const nodeBin = process.execPath;
      const childEnv = {
        ...process.env,
        NSJAIL_PATH: nsjailPath,
        NSJAIL_CONFIG: configPath,
        NSJAIL_USE_CONFIG: IS_PRODUCTION ? "1" : (env.__nsjailUseConfig ? "1" : "0"),
        NSJAIL_CWD: env.__nsjailCwd || "/work",
        NSJAIL_CHROOT: env.__nsjailChroot || "",
        NSJAIL_CHROOT_JAVA: env.__nsjailChrootJava || "",
        NSJAIL_CHROOT_CPP: env.__nsjailChrootCpp || "",
        NSJAIL_CHROOT_PYTHON: env.__nsjailChrootPython || ""
      };
      const child = spawn(nodeBin, [workerEntry, "--health"], {
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv,
        windowsHide: true
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let outSize = 0;
      let errSize = 0;
      const MAX_BYTES = 1024 * 1024;
      // Prevent child process from keeping parent alive if orphaned
      child.unref();

      const kill = () => {
        try {
          // Try SIGTERM first (graceful), then SIGKILL as fallback
          const wasKilled = child.kill("SIGTERM");
          if (!wasKilled) return;
          setTimeout(() => {
            if (!child.killed) {
              try {
                child.kill("SIGKILL");
              } catch {}
            }
          }, 500);
        } catch {}
      };
      const timeoutMs = Math.max(1000, Number(process.env.JUDGE_HEALTH_TIMEOUT_MS ?? 5000));
      const timeout = setTimeout(() => {
        kill();
        reject(new Error("JUDGE_HEALTH_TIMEOUT"));
      }, timeoutMs);
      child.stdout?.on("data", (b: Buffer) => {
        outSize += b.length;
        if (outSize > MAX_BYTES) {
          kill();
          return;
        }
        stdoutChunks.push(b);
      });
      child.stderr?.on("data", (b: Buffer) => {
        errSize += b.length;
        if (errSize > MAX_BYTES) {
          kill();
          return;
        }
        stderrChunks.push(b);
      });
      child.on("error", e => {
        clearTimeout(timeout);
        reject(e);
      });
      child.on("close", code => {
        clearTimeout(timeout);
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        if (!stdout) {
          reject(new Error(`JUDGE_HEALTH_NO_OUTPUT: exit=${code ?? "null"} stderr=${stderr.slice(0, 2048)}`));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          if (parsed?.status !== "ok") {
            reject(new Error(`JUDGE_HEALTH_ERROR: ${String(parsed?.reason ?? "unknown")}`));
            return;
          }
          resolve(parsed);
        } catch (e: any) {
          reject(new Error(`JUDGE_HEALTH_BAD_JSON: ${e?.message || "parse error"} stdout=${stdout.slice(0, 2048)} stderr=${stderr.slice(0, 2048)}`));
        }
      });
    });

    const body = {
      ...health,
      version: judgeVersion,
      backend: { sandboxMode, workerEntry, configPath, limits }
    };
    judgeHealthCache = { at: Date.now(), status: 200, body };
    res.json(body);
  } catch (err: any) {
    logger.error("Judge health probe failed", { err });
    const body = { error: "Judge unavailable", status: 503 };
    // Cache failures briefly too, so a real outage doesn't fork-bomb us.
    judgeHealthCache = { at: Date.now(), status: 503, body };
    res.status(503).json(body);
  } finally {
    resolveInFlight();
    judgeHealthInFlight = null;
  }
});
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/tasks", authMiddleware, forbidContestModeUsers, placementGate, tasksRouter);
app.use("/grades", authMiddleware, forbidContestModeUsers, placementGate, gradeRouter);
app.use("/edu", eduRouter);
app.use("/topics", authMiddleware, forbidContestModeUsers, placementGate, topicsRouter);
app.use("/theory", authMiddleware, forbidContestModeUsers, placementGate, theoryRouter);
app.use("/streak", authMiddleware, forbidContestModeUsers, placementGate, streakRouter);
app.use("/birthday", authMiddleware, forbidContestModeUsers, placementGate, birthdayRouter);
app.use("/admin", authMiddleware, forbidContestModeUsers, adminRouter);
app.use("/support", supportRouter);
app.use("/support/desk", supportDeskRouter);
app.use("/library", authMiddleware, forbidContestModeUsers, libraryRouter);
app.use("/contests", contestsRouter);
app.use("/certificate", certificateRouter);
app.use("/playground", playgroundRouter);
app.use("/lsp", lspRouter);
app.use("/blog", blogRouter);
app.use("/notifications", notificationsRouter);
app.use("/emails", emailsRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/tasks", authMiddleware, forbidContestModeUsers, placementGate, tasksRouter);
app.use("/api/grades", authMiddleware, forbidContestModeUsers, placementGate, gradeRouter);
app.use("/api/edu", eduRouter);
app.use("/api/topics", authMiddleware, forbidContestModeUsers, placementGate, topicsRouter);
app.use("/api/theory", authMiddleware, forbidContestModeUsers, placementGate, theoryRouter);
app.use("/api/streak", authMiddleware, forbidContestModeUsers, placementGate, streakRouter);
app.use("/api/birthday", authMiddleware, forbidContestModeUsers, placementGate, birthdayRouter);
app.use("/api/admin", authMiddleware, forbidContestModeUsers, adminRouter);
app.use("/api/support", supportRouter);
app.use("/api/support/desk", supportDeskRouter);
app.use("/api/library", authMiddleware, forbidContestModeUsers, libraryRouter);
app.use("/api/contests", contestsRouter);
app.use("/api/certificate", certificateRouter);
app.use("/api/playground", playgroundRouter);
app.use("/api/lsp", lspRouter);
app.use("/api/blog", blogRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/emails", emailsRouter);
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error("Unhandled error", { err });

  // If response headers/body have already been streamed, we cannot write a
  // JSON error body — doing so throws ERR_HTTP_HEADERS_SENT and masks the
  // real failure. Hand off to Express's default finalhandler, which closes
  // the connection cleanly.
  if (res.headersSent) {
    return next(err);
  }

  const status = Number(err?.statusCode ?? err?.status ?? 500);
  const isHttpError = err instanceof HttpError || err?.name === "HttpError";

  // If the judge scheduler is overloaded, tell clients when to retry.
  // This must be present on overload 503 responses.
  setRetryAfterForOverload(err, res);
  const expose = isHttpError ? (err as HttpError).expose !== false : status < 500;

  const error = expose
    ? String(err?.message || "INTERNAL_SERVER_ERROR")
    : (process.env.NODE_ENV === "production" ? "INTERNAL_SERVER_ERROR" : String(err?.message || "INTERNAL_SERVER_ERROR"));

  res.status(Number.isFinite(status) ? status : 500).json({
    error,
    status: Number.isFinite(status) ? status : 500
  });
});

type StartupMigrationOutcome = {
  attempted: boolean;
  succeeded: boolean;
  appliedNames: string[];
  attemptCount: number;
  autoStampedMigrations: string[];
  errorMessage?: string;
  remediationHint?: string;
};

// Match MySQL "table already exists" by stable error code/errno, NOT by
// the localized message text. mysql2 surfaces both `code`
// (ER_TABLE_EXISTS_ERROR) and `errno` (1050). The message-based check was
// kept as a last-resort fallback for non-mysql2 drivers; on locale-translated
// MySQL servers the previous regex on /already exists/ silently broke.
function isLegacyTableExistsMigrationError(error: any): boolean {
  const code = String(error?.code || error?.driverError?.code || "").trim().toUpperCase();
  if (code === "ER_TABLE_EXISTS_ERROR") return true;
  const errno = Number(error?.errno ?? error?.driverError?.errno);
  if (Number.isFinite(errno) && errno === 1050) return true;
  const sqlState = String(error?.sqlState || error?.driverError?.sqlState || "").trim();
  if (sqlState === "42S01") return true;
  // Last resort for drivers that only expose a message — kept English only;
  // the structured signals above are authoritative.
  return /\bER_TABLE_EXISTS_ERROR\b|\balready exists\b/i.test(String(error?.message || ""));
}

function extractFailedMigrationName(error: any): string | undefined {
  const directName = String(error?.migration?.name || "").trim();
  if (directName) return directName;

  const message = String(error?.message || "");
  const stack = String(error?.stack || "");
  const source = `${message}\n${stack}`;
  const match = source.match(/Migration\s+"([^"]+)"\s+failed/i);
  const parsedName = String(match?.[1] || "").trim();
  return parsedName || undefined;
}

function extractAlreadyExistingTableName(error: any): string | undefined {
  // Prefer the FAILED SQL string — that is locale-independent and unambiguous.
  // The localized message ("Table 'x' already exists") is only consulted as a
  // fallback because the SQL is always emitted by us.
  const sqlRaw = String(error?.sql || error?.query || error?.driverError?.sql || "");
  const createMatch = sqlRaw.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?`?([a-zA-Z0-9_]+)`?/i);
  if (createMatch?.[1]) {
    return String(createMatch[1]).trim().toLowerCase();
  }

  const rawMessage = String(
    error?.message ||
    error?.sqlMessage ||
    error?.driverError?.message ||
    error?.driverError?.sqlMessage ||
    ""
  );
  // Generic table-name extraction: any quoted identifier in the message.
  // Locale-independent because we only look for backtick / single-quote
  // wrappers around an identifier, not specific English phrases.
  const quotedMatch = rawMessage.match(/[`']([a-zA-Z0-9_.]+)[`']/);
  if (quotedMatch?.[1]) {
    const parts = String(quotedMatch[1]).split(".");
    return String(parts[parts.length - 1]).trim().toLowerCase();
  }

  return undefined;
}

function getStartupMigrationRemediationHint(error: any): string | undefined {
  if (!isLegacyTableExistsMigrationError(error)) return undefined;

  return "Legacy schema detected (tables exist without migration history). Run `npm run db:bootstrap-migration-history` once before restarting backend workers.";
}

async function runStartupMigrations(): Promise<StartupMigrationOutcome> {
  if (!env.__runMigrationsOnStartup) {
    logger.info("[startup:migrations] skipped (RUN_MIGRATIONS_ON_STARTUP=false)");
    return {
      attempted: false,
      succeeded: false,
      appliedNames: [],
      attemptCount: 0,
      autoStampedMigrations: []
    };
  }

  const autoBootstrapLegacyHistory = Boolean(env.__autoBootstrapMigrationHistoryOnStartup);
  const maxRecoveryAttempts = 6;
  const autoStampedMigrations: string[] = [];
  const autoStampAttempted = new Set<string>();

  for (let attempt = 1; attempt <= maxRecoveryAttempts; attempt += 1) {
    try {
      const hasPending = await AppDataSource.showMigrations();
      const applied = await AppDataSource.runMigrations({
        transaction: "all"
      });

      logger.info("[startup:migrations] completed", {
        attempt,
        hadPending: hasPending,
        appliedCount: applied.length,
        appliedNames: applied.map(m => m.name),
        autoStampedMigrations
      });

      return {
        attempted: true,
        succeeded: true,
        appliedNames: applied.map(m => m.name),
        attemptCount: attempt,
        autoStampedMigrations
      };
    } catch (error: any) {
      const remediationHint = getStartupMigrationRemediationHint(error);
      const failedMigrationName = extractFailedMigrationName(error);
      const failedTableName = extractAlreadyExistingTableName(error);
      const legacyMigrationRowByName = getLegacyMigrationHistoryRowByName(failedMigrationName);
      const legacyMigrationRowByTableName = getLegacyMigrationHistoryRowByTableName(failedTableName);
      const candidateMigrationNames = [
        legacyMigrationRowByName?.name,
        legacyMigrationRowByTableName?.name,
      ]
        .map(name => String(name || "").trim())
        .filter(Boolean)
        .filter((name, idx, all) => all.indexOf(name) === idx)
        .filter(name => !autoStampAttempted.has(name));

      const baselineFallbackNames = candidateMigrationNames.length === 0
        ? LEGACY_MIGRATION_HISTORY_BASELINE
          .map(row => row.name)
          .filter(name => !autoStampAttempted.has(name))
        : [];

      const migrationsToAutoStamp = candidateMigrationNames.length > 0
        ? candidateMigrationNames
        : baselineFallbackNames;

      const canAutoStampLegacyHistory =
        autoBootstrapLegacyHistory &&
        isLegacyTableExistsMigrationError(error) &&
        migrationsToAutoStamp.length > 0;

      if (canAutoStampLegacyHistory) {
        for (const migrationName of migrationsToAutoStamp) {
          autoStampAttempted.add(migrationName);
        }

        try {
          const stampResult = await stampLegacyMigrationHistory(AppDataSource, {
            names: migrationsToAutoStamp
          });

          for (const migrationName of migrationsToAutoStamp) {
            if (!autoStampedMigrations.includes(migrationName)) {
              autoStampedMigrations.push(migrationName);
            }
          }

          logger.warn("[startup:migrations] auto-stamped legacy migration history row", {
            attempt,
            failedMigrationName,
            failedTableName,
            migrationCount: migrationsToAutoStamp.length,
            migrations: migrationsToAutoStamp,
            mode: candidateMigrationNames.length > 0 ? "targeted" : "baseline-fallback",
            inserted: stampResult.inserted,
            exists: stampResult.exists,
            skippedUnknown: stampResult.skippedUnknown
          });

          continue;
        } catch (stampError: any) {
          logger.error("[startup:migrations] failed to auto-stamp legacy migration history row", {
            attempt,
            failedMigrationName,
            failedTableName,
            migrationCount: migrationsToAutoStamp.length,
            migrations: migrationsToAutoStamp,
            message: stampError?.message,
            code: stampError?.code
          });
        }
      }

      logger.error("[startup:migrations] failed", {
        attempt,
        message: error?.message,
        code: error?.code,
        failedMigrationName,
        failedTableName,
        autoBootstrapLegacyHistory,
        remediationHint
      });

      return {
        attempted: true,
        succeeded: false,
        appliedNames: [],
        attemptCount: attempt,
        autoStampedMigrations,
        errorMessage: String(error?.message || "MIGRATION_FAILED"),
        remediationHint
      };
    }
  }

  return {
    attempted: true,
    succeeded: false,
    appliedNames: [],
    attemptCount: maxRecoveryAttempts,
    autoStampedMigrations,
    errorMessage: "MIGRATION_RECOVERY_ATTEMPTS_EXHAUSTED"
  };
}

async function bootstrap(): Promise<void> {
  try {
    await AppDataSource.initialize();
    logger.info("Data Source initialized");

    const migrationOutcome = await runStartupMigrations();
    logger.info("[startup:db] strict migration mode", {
      migrationAttempted: migrationOutcome.attempted,
      migrationSucceeded: migrationOutcome.succeeded,
      migrationAppliedCount: migrationOutcome.appliedNames.length,
      migrationAttemptCount: migrationOutcome.attemptCount,
      migrationAutoStampedCount: migrationOutcome.autoStampedMigrations.length,
      migrationAutoStamped: migrationOutcome.autoStampedMigrations
    });

    if (migrationOutcome.attempted && !migrationOutcome.succeeded) {
      const remediationSuffix = migrationOutcome.remediationHint
        ? ` | ${migrationOutcome.remediationHint}`
        : "";
      throw new Error(`Startup migrations failed: ${migrationOutcome.errorMessage || "MIGRATION_FAILED"}${remediationSuffix}`);
    }

    startCertificateQueueWorker();

    // Remove test payloads left behind by already-solved generated personal
    // tasks. Grades keep the result/snapshot, so this is safe and idempotent.
    void cleanupCompletedPersonalTaskTests()
      .then(() => sweepTestCache(0))
      .catch(error => {
        logger.warn("[startup] completed personal-task/cache cleanup failed", { error });
      });

    // Seed defaults: ON in dev/test, OFF in production. Production seeding
    // on every boot can re-insert rows that were intentionally removed and
    // hides real curriculum-data regressions. Operators can re-enable
    // explicitly with SEED_TOPICS_ON_STARTUP=true.
    const seedDefault = IS_PRODUCTION ? "false" : "true";
    const shouldSeed = String(process.env.SEED_TOPICS_ON_STARTUP ?? seedDefault).toLowerCase() !== "false";
    if (shouldSeed) {
      await seedTopicsIfNeeded();
    } else {
      logger.info("[seed-topics] skipped", { reason: process.env.SEED_TOPICS_ON_STARTUP ? "env:false" : "prod-default" });
    }

    httpServer = app.listen(PORT, () => {
      logger.info("Server listening", { port: PORT });
    });
    // Avoid hanging sockets blocking shutdown forever.
    httpServer.keepAliveTimeout = 60_000;
    httpServer.headersTimeout = 65_000;

    // Periodically GC the on-disk test cache (TTL-based). Best-effort; never throws.
    const cacheSweepMs = Math.max(60 * 60 * 1000, parseInt(String(process.env.JUDGE_TEST_CACHE_SWEEP_MS ?? ""), 10) || 6 * 60 * 60 * 1000);
    const cacheSweepTimer = setInterval(() => {
      void sweepTestCache().catch(() => undefined);
    }, cacheSweepMs);
    cacheSweepTimer.unref?.();
  } catch (err) {
    logger.error("Database initialization error", {
      err
    });
    process.exit(1);
  }
}

void bootstrap();
