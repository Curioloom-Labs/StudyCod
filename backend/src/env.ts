import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";
(() => {
  // IMPORTANT: Load env only from the backend package folder.
  // We intentionally do NOT search parent folders to avoid “external .env” surprises.
  const findBackendRoot = (startDir: string): string | null => {
    let dir = startDir;
    for (let i = 0; i < 20; i++) {
      const pkgPath = path.join(dir, "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const raw = fs.readFileSync(pkgPath, "utf8");
          const pkg = JSON.parse(raw);
          if (pkg?.name === "studycod-backend") {
            return dir;
          }
        } catch {
          // ignore
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return null;
  };

  const backendRoot = findBackendRoot(__dirname) ?? process.cwd();
  const envPath = path.join(backendRoot, ".env");
  dotenv.config({
    path: fs.existsSync(envPath) ? envPath : undefined,
    encoding: "utf8",
    override: false,
  });
})();
const isProduction = process.env.NODE_ENV === "production";
const enforcePathExistence = isProduction && process.platform !== "win32";

function parseBoolEnv(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function requiredInProduction(name: string) {
  return z.string().transform(v => v.trim()).refine(v => !isProduction ? true : v.length > 0, {
    message: `Missing required environment variable in production: ${name}`
  });
}
function nonEmptyString(defaultValue: string) {
  return z.string().optional().transform(v => v == null ? defaultValue : v.trim()).pipe(z.string());
}
function optionalInt(defaultValue: number) {
  return z.string().optional().transform(v => {
    const raw = (v ?? "").trim();
    if (!raw) return defaultValue;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? n : defaultValue;
  }).pipe(z.number().int());
}
function normalizeOrigins(input: string): string[] {
  const raw = input.split(",").map(s => s.trim()).filter(Boolean);
  return raw.length > 0 ? raw : [];
}
const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: optionalInt(4000),
  FRONTEND_URL: nonEmptyString("http://localhost:5173"),
  BACKEND_PUBLIC_URL: nonEmptyString("http://localhost:4000"),
  CORS_ORIGIN: nonEmptyString("http://localhost:5173"),
  JWT_SECRET: requiredInProduction("JWT_SECRET").optional().transform(v => (v ?? "").trim()),
  SESSION_SECRET: requiredInProduction("SESSION_SECRET").optional().transform(v => (v ?? "").trim()),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().optional(),
  DB_PORT: z.string().optional(),
  DB_USER: z.string().optional(),
  DB_PASS: z.string().optional(),
  DB_NAME: z.string().optional(),
  DB_POOL_SIZE: z.string().optional(),
  DB_CONNECT_TIMEOUT_MS: z.string().optional(),
  DB_ACQUIRE_TIMEOUT_MS: z.string().optional(),
  DB_POOL_QUEUE_LIMIT: z.string().optional(),
  TRUST_PROXY: z.string().optional(),
  SESSION_STORE: z.string().optional(),
  REDIS_URL: z.string().optional(),
  REDIS_ENABLED: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BACKUP_API_KEYS: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_TEXT_MODEL: z.string().optional(),
  OPENROUTER_JSON_MODEL: z.string().optional(),
  OPENROUTER_REASONING_ENABLED: z.string().optional(),
  OPENROUTER_FALLBACK_MODELS: z.string().optional(),
  OPENROUTER_MODEL_FALLBACKS: z.string().optional(),
  OPENROUTER_LOG_MODEL_CANDIDATES: z.string().optional(),
  EXPOSE_INTERNAL_AI_DIAGNOSTICS: z.string().optional(),
  OPENROUTER_URL: z.string().optional(),
  OPENROUTER_REFERER: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_VERIFY_URL: z.string().optional(),
  TURNSTILE_ENFORCE_CONTEST_SUBMIT: z.string().optional(),
  TURNSTILE_ENFORCE_AUTH: z.string().optional(),

  // EDU SaaS RBAC: when off (default) capability checks run in shadow mode
  // (audit a would-be denial, but allow). Flip on to hard-enforce org roles.
  EDU_RBAC_ENFORCE: z.string().optional(),

  // Cloudflare AI worker base URL (used by LLM provider and can be reused for translation)
  CLOUDFLARE_AI_URL: z.string().optional(),
  // Shared secret sent to the Cloudflare AI worker as `x-internal-secret`.
  // Must match the worker's WORKER_SHARED_SECRET. Without it the worker is an
  // open, unauthenticated proxy to paid Workers AI inference.
  CLOUDFLARE_AI_INTERNAL_SECRET: z.string().optional(),

  // Free uk->en translator for theory blocks (optional overrides)
  TRANSLATE_UK_EN_URL: z.string().optional(),
  TRANSLATE_UK_EN_TIMEOUT_MS: z.string().optional(),
  TRANSLATE_UK_EN_MAX_CHUNK_CHARS: z.string().optional(),
  // Opt-in to routing content through PUBLIC third-party translators
  // (libretranslate.de / api.mymemory.translated.net). Off by default because
  // it exfiltrates course/student content to an uncontrolled host.
  TRANSLATE_ALLOW_PUBLIC_FALLBACK: z.string().optional(),
  JUDGE_WORKER_ENTRY: z.string().optional(),
  NSJAIL_PATH: z.string().optional(),
  NSJAIL_CONFIG: z.string().optional(),
  NSJAIL_USE_CONFIG: z.string().optional(),
  NSJAIL_CWD: z.string().optional(),
  NSJAIL_CHROOT: z.string().optional(),
  NSJAIL_CHROOT_JAVA: z.string().optional(),
  NSJAIL_CHROOT_CPP: z.string().optional(),
  NSJAIL_CHROOT_PYTHON: z.string().optional(),
  JUDGE_LOCK_PATH: z.string().optional(),
  JUDGE_LOCK_STALE_MS: z.string().optional(),

  // Execution load control (backend -> judge)
  MAX_CONCURRENT_EXECUTIONS: z.string().optional(),
  // Cluster-wide concurrency cap for the distributed queue. Defaults to the
  // per-instance MAX_CONCURRENT_EXECUTIONS; raise to N*per-instance for N replicas.
  MAX_GLOBAL_CONCURRENT_EXECUTIONS: z.string().optional(),
  MAX_EXECUTION_QUEUE_SIZE: z.string().optional(),
  EXECUTION_SCHEDULER_LOG_INTERVAL_MS: z.string().optional(),
  EXECUTION_QUEUE_MODE: z.string().optional(),
  EXECUTION_QUEUE_POLL_INTERVAL_MS: z.string().optional(),
  EXECUTION_QUEUE_CLAIM_TTL_MS: z.string().optional(),
  EXECUTION_QUEUE_RESULT_TTL_MS: z.string().optional(),
  EXECUTION_QUEUE_RESULT_POLL_MS: z.string().optional(),
  EXECUTION_QUEUE_MAX_RETRIES: z.string().optional(),
  EXECUTION_QUEUE_DLQ_MAX_ITEMS: z.string().optional(),

  // Per-user submission rate limit (short + long windows)
  RATE_LIMIT_SHORT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_SHORT_MAX: z.string().optional(),
  RATE_LIMIT_LONG_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_LONG_MAX: z.string().optional(),

  // Retry-After header for overload responses
  OVERLOAD_RETRY_AFTER_SECONDS: z.string().optional(),

  // Database startup flow
  RUN_MIGRATIONS_ON_STARTUP: z.string().optional(),
  AUTO_BOOTSTRAP_MIGRATION_HISTORY_ON_STARTUP: z.string().optional(),

  // Web task feature flags/limits
  WEB_TASKS_ENABLED: z.string().optional(),
  WEB_TASK_MAX_FILE_SIZE: z.string().optional(),
  WEB_TASK_MAX_TOTAL_SIZE: z.string().optional(),
  WEB_TASK_PREVIEW_RATE_LIMIT: z.string().optional(),

  // LLM task orchestrator tunables
  LLM_TASK_TIMEOUT_MS: z.string().optional(),
  LLM_TASK_MAX_TOKENS: z.string().optional(),
  LLM_TASK_THEORY_CONTEXT_CHARS: z.string().optional(),
  LLM_TASK_PREVIOUS_TASKS_CONTEXT_CHARS: z.string().optional(),
  LLM_TASK_ANCHOR_CACHE_TTL_MS: z.string().optional(),
  LLM_TASK_ANCHOR_CACHE_ENABLED: z.string().optional(),

  // Auth user cache (Redis short-TTL for authMiddleware)
  AUTH_USER_CACHE_TTL_SECONDS: z.string().optional(),

  // LiveKit (self-hosted SFU) — powers the EDU live, code-aware classroom.
  // When all three are set the live-classroom routes mint join tokens; when
  // unset the feature is treated as disabled and the routes return 503.
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  LIVEKIT_TOKEN_TTL_MINUTES: z.string().optional(),
}).transform(env => {
  const corsOrigins = normalizeOrigins(env.CORS_ORIGIN);
  const cfBase = String(env.CLOUDFLARE_AI_URL ?? "").trim();
  const cfTranslate = cfBase ? `${cfBase.replace(/\/$/, "")}/translate` : "";
  return {
    ...env,
    __isProduction: isProduction,
    __corsOrigins: corsOrigins,
    __cloudflareAiInternalSecret: (env.CLOUDFLARE_AI_INTERNAL_SECRET ?? "").trim(),
    // Resolved translation endpoint. EMPTY by default: only an explicit
    // TRANSLATE_UK_EN_URL or your own Cloudflare worker (derived from
    // CLOUDFLARE_AI_URL) is used. We deliberately no longer fall back to the
    // public libretranslate.de host — see __translateAllowPublicFallback.
    __translateUkEnUrl: ((env.TRANSLATE_UK_EN_URL ?? "") || cfTranslate || "").trim(),
    __translateAllowPublicFallback: parseBoolEnv(env.TRANSLATE_ALLOW_PUBLIC_FALLBACK),
    __translateUkEnTimeoutMs: (() => {
      const raw = (env.TRANSLATE_UK_EN_TIMEOUT_MS ?? "").trim();
      if (!raw) return 15_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 15_000;
    })(),
    __translateUkEnMaxChunkChars: (() => {
      const raw = (env.TRANSLATE_UK_EN_MAX_CHUNK_CHARS ?? "").trim();
      if (!raw) return 1800;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 200 ? n : 1800;
    })(),
    __trustProxy: (() => {
      const raw = (env.TRUST_PROXY ?? "").trim();
      if (raw === "") return isProduction ? 1 : 0;
      if (raw === "true") return 1;
      if (raw === "false") return 0;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : isProduction ? 1 : 0;
    })(),
    __sessionStore: (() => {
      const isTest = (env.NODE_ENV ?? "").trim().toLowerCase() === "test";
      if (isTest) return "memory";
      return ((env.SESSION_STORE ?? "") || "memory").trim().toLowerCase();
    })(),
    __redisUrl: ((env.REDIS_URL ?? "") || "redis://127.0.0.1:6379").trim(),
    __redisEnabled: (() => {
      const isTest = (env.NODE_ENV ?? "").trim().toLowerCase() === "test";
      const raw = (env.REDIS_ENABLED ?? "").trim();
      if (raw) return parseBoolEnv(raw);
      if (isTest) return false;
      const hasRedisUrl = ((env.REDIS_URL ?? "") || "").trim().length > 0;
      const sessionWantsRedis = ((env.SESSION_STORE ?? "") || "").trim().toLowerCase() === "redis";
      return hasRedisUrl || sessionWantsRedis;
    })(),
    __redisKeyPrefix: (() => {
      const raw = ((env.REDIS_KEY_PREFIX ?? "") || "studycod:").trim();
      if (!raw) return "studycod:";
      return raw.endsWith(":") ? raw : `${raw}:`;
    })(),
    __judgeWorkerEntry: (env.JUDGE_WORKER_ENTRY ?? "").trim(),
    __turnstileEnforceContestSubmit: parseBoolEnv(env.TURNSTILE_ENFORCE_CONTEST_SUBMIT),
    __turnstileEnforceAuth: parseBoolEnv(env.TURNSTILE_ENFORCE_AUTH),
    __eduRbacEnforce: parseBoolEnv(env.EDU_RBAC_ENFORCE),
    __nsjailPath: ((env.NSJAIL_PATH ?? "") || "/usr/bin/nsjail").trim(),
    __nsjailConfig: (env.NSJAIL_CONFIG ?? "").trim(),
    __nsjailUseConfig: parseBoolEnv(env.NSJAIL_USE_CONFIG),
    __nsjailCwd: ((env.NSJAIL_CWD ?? "") || "/work").trim(),
    __nsjailChroot: (env.NSJAIL_CHROOT ?? "").trim(),
    __nsjailChrootJava: (env.NSJAIL_CHROOT_JAVA ?? "").trim(),
    __nsjailChrootCpp: (env.NSJAIL_CHROOT_CPP ?? "").trim(),
    __nsjailChrootPython: (env.NSJAIL_CHROOT_PYTHON ?? "").trim(),
    __judgeLockPath: (env.JUDGE_LOCK_PATH ?? "").trim(),
    __judgeLockStaleMs: (() => {
      const raw = (env.JUDGE_LOCK_STALE_MS ?? "").trim();
      if (!raw) return 120_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 120_000;
    })(),

    __maxConcurrentExecutions: (() => {
      const raw = (env.MAX_CONCURRENT_EXECUTIONS ?? "").trim();
      if (!raw) return 12;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 12;
    })(),
    // 0/unset => fall back to per-instance cap (handled in the queue).
    __maxGlobalConcurrentExecutions: (() => {
      const raw = (env.MAX_GLOBAL_CONCURRENT_EXECUTIONS ?? "").trim();
      if (!raw) return 0;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    })(),
    __maxExecutionQueueSize: (() => {
      const raw = (env.MAX_EXECUTION_QUEUE_SIZE ?? "").trim();
      if (!raw) return 50;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : 50;
    })(),
    __executionSchedulerLogIntervalMs: (() => {
      const raw = (env.EXECUTION_SCHEDULER_LOG_INTERVAL_MS ?? "").trim();
      if (!raw) return 10_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 10_000;
    })(),
    __executionQueueMode: (() => {
      const isTest = (env.NODE_ENV ?? "").trim().toLowerCase() === "test";
      const raw = (env.EXECUTION_QUEUE_MODE ?? "").trim().toLowerCase();
      if (raw === "local" || raw === "memory" || raw === "in-process" || raw === "inprocess") {
        return "local" as const;
      }
      if (raw === "redis" || raw === "distributed") {
        return "distributed" as const;
      }
      if (isTest) return "local" as const;

      const redisEnabledRaw = (env.REDIS_ENABLED ?? "").trim();
      const redisExplicitlyEnabled = redisEnabledRaw ? parseBoolEnv(redisEnabledRaw) : false;
      const hasRedisUrl = ((env.REDIS_URL ?? "") || "").trim().length > 0;
      const sessionWantsRedis = ((env.SESSION_STORE ?? "") || "").trim().toLowerCase() === "redis";
      return redisExplicitlyEnabled || hasRedisUrl || sessionWantsRedis
        ? ("distributed" as const)
        : ("local" as const);
    })(),
    __executionQueuePollIntervalMs: (() => {
      const raw = (env.EXECUTION_QUEUE_POLL_INTERVAL_MS ?? "").trim();
      if (!raw) return 100;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 20 ? n : 100;
    })(),
    __executionQueueClaimTtlMs: (() => {
      const raw = (env.EXECUTION_QUEUE_CLAIM_TTL_MS ?? "").trim();
      if (!raw) return 180_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 30_000 ? n : 180_000;
    })(),
    __executionQueueResultTtlMs: (() => {
      const raw = (env.EXECUTION_QUEUE_RESULT_TTL_MS ?? "").trim();
      if (!raw) return 300_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 30_000 ? n : 300_000;
    })(),
    __executionQueueResultPollMs: (() => {
      const raw = (env.EXECUTION_QUEUE_RESULT_POLL_MS ?? "").trim();
      if (!raw) return 40;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 10 ? n : 40;
    })(),
    __executionQueueMaxRetries: (() => {
      const raw = (env.EXECUTION_QUEUE_MAX_RETRIES ?? "").trim();
      if (!raw) return 2;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : 2;
    })(),
    __executionQueueDeadLetterMaxItems: (() => {
      const raw = (env.EXECUTION_QUEUE_DLQ_MAX_ITEMS ?? "").trim();
      if (!raw) return 1000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 10 ? n : 1000;
    })(),

    __rateLimitShortWindowMs: (() => {
      const raw = (env.RATE_LIMIT_SHORT_WINDOW_MS ?? "").trim();
      if (!raw) return 10_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 10_000;
    })(),
    __rateLimitShortMax: (() => {
      const raw = (env.RATE_LIMIT_SHORT_MAX ?? "").trim();
      if (!raw) return 5;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 5;
    })(),
    __rateLimitLongWindowMs: (() => {
      const raw = (env.RATE_LIMIT_LONG_WINDOW_MS ?? "").trim();
      if (!raw) return 60_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 60_000;
    })(),
    __rateLimitLongMax: (() => {
      const raw = (env.RATE_LIMIT_LONG_MAX ?? "").trim();
      if (!raw) return 20;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 20;
    })(),
    __overloadRetryAfterSeconds: (() => {
      const raw = (env.OVERLOAD_RETRY_AFTER_SECONDS ?? "").trim();
      if (!raw) return 3;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 3;
    })(),

    __runMigrationsOnStartup: (() => {
      const raw = (env.RUN_MIGRATIONS_ON_STARTUP ?? "").trim();
      if (!raw) return true;
      return parseBoolEnv(raw);
    })(),
    // Auto-stamping silently inserts rows into typeorm_migrations for failed
    // migrations that look like legacy schema drift. That is convenient in
    // dev/test but in production it can hide a real migration regression.
    // Default: ON outside production, OFF in production. Operators can still
    // opt back in by setting AUTO_BOOTSTRAP_MIGRATION_HISTORY_ON_STARTUP=1.
    __autoBootstrapMigrationHistoryOnStartup: (() => {
      const raw = (env.AUTO_BOOTSTRAP_MIGRATION_HISTORY_ON_STARTUP ?? "").trim();
      if (!raw) return !isProduction;
      return parseBoolEnv(raw);
    })(),

    __webTasksEnabled: parseBoolEnv(env.WEB_TASKS_ENABLED),
    __webTaskMaxFileSize: (() => {
      const raw = (env.WEB_TASK_MAX_FILE_SIZE ?? "").trim();
      if (!raw) return 200_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 1024 ? n : 200_000;
    })(),
    __webTaskMaxTotalSize: (() => {
      const raw = (env.WEB_TASK_MAX_TOTAL_SIZE ?? "").trim();
      if (!raw) return 500_000;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 2048 ? n : 500_000;
    })(),
    __webTaskPreviewRateLimit: (() => {
      const raw = (env.WEB_TASK_PREVIEW_RATE_LIMIT ?? "").trim();
      if (!raw) return 10;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 10;
    })(),

    __llmTaskTimeoutMs: (() => {
      const raw = (env.LLM_TASK_TIMEOUT_MS ?? "").trim();
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      const v = Number.isFinite(n) ? n : 45_000;
      return Math.max(10_000, Math.min(120_000, v));
    })(),
    __llmTaskMaxTokens: (() => {
      const raw = (env.LLM_TASK_MAX_TOKENS ?? "").trim();
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      const v = Number.isFinite(n) ? n : 2600;
      return Math.max(1200, Math.min(4000, v));
    })(),
    __llmTaskTheoryContextChars: (() => {
      const raw = (env.LLM_TASK_THEORY_CONTEXT_CHARS ?? "").trim();
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      const v = Number.isFinite(n) ? n : 1200;
      return Math.max(400, Math.min(3000, v));
    })(),
    __llmTaskPreviousTasksContextChars: (() => {
      const raw = (env.LLM_TASK_PREVIOUS_TASKS_CONTEXT_CHARS ?? "").trim();
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      const v = Number.isFinite(n) ? n : 1200;
      return Math.max(400, Math.min(3000, v));
    })(),
    __llmTaskAnchorCacheTtlMs: (() => {
      const raw = (env.LLM_TASK_ANCHOR_CACHE_TTL_MS ?? "").trim();
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      const v = Number.isFinite(n) ? n : 30 * 60 * 1000;
      return Math.max(10_000, Math.min(24 * 60 * 60 * 1000, v));
    })(),
    __llmTaskAnchorCacheEnabled: (() => {
      const raw = (env.LLM_TASK_ANCHOR_CACHE_ENABLED ?? "").trim().toLowerCase();
      if (!raw) return true;
      return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
    })(),

    __liveKitUrl: (env.LIVEKIT_URL ?? "").trim(),
    __liveKitApiKey: (env.LIVEKIT_API_KEY ?? "").trim(),
    __liveKitApiSecret: (env.LIVEKIT_API_SECRET ?? "").trim(),
    __liveKitEnabled: Boolean(
      (env.LIVEKIT_URL ?? "").trim() &&
      (env.LIVEKIT_API_KEY ?? "").trim() &&
      (env.LIVEKIT_API_SECRET ?? "").trim()
    ),
    __liveKitTokenTtlMinutes: (() => {
      const raw = (env.LIVEKIT_TOKEN_TTL_MINUTES ?? "").trim();
      if (!raw) return 60;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 5 ? Math.min(n, 720) : 60;
    })(),
  };
}).superRefine((env, ctx) => {
  if (env.__isProduction) {
    if (env.CORS_ORIGIN.trim() === "*") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN cannot be '*' in production"
      });
    }
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JWT_SECRET"],
        message: "JWT_SECRET must be set and at least 32 characters in production"
      });
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be set and at least 32 characters in production"
      });
    }
    const usingDiscreteDb = !env.DATABASE_URL;
    if (usingDiscreteDb) {
      const pass = (env.DB_PASS ?? "").trim();
      if (!pass) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["DB_PASS"],
          message: "DB_PASS must be set in production when DATABASE_URL is not provided"
        });
      }
    }
    // NOTE: Judge/nsjail environment variables are intentionally NOT hard-required
    // for the whole backend process to boot.
    //
    // Rationale:
    // - A misconfigured judge should not take down auth/admin/maintenance endpoints.
    // - Judge endpoints will surface a clear configuration error at runtime.
    //
    // We still keep strict checks for core security/runtime settings above.
    if (env.__cloudflareAiInternalSecret.length === 0 && (env.CLOUDFLARE_AI_URL ?? "").trim().length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CLOUDFLARE_AI_INTERNAL_SECRET"],
        message:
          "CLOUDFLARE_AI_INTERNAL_SECRET must be set in production when CLOUDFLARE_AI_URL is configured — without it the worker is an open proxy to paid Workers AI inference",
      });
    }
  }
});
export type AppEnv = z.infer<typeof EnvSchema>;
export const env: AppEnv = EnvSchema.parse(process.env);