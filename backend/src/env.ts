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
  TRUST_PROXY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BACKUP_API_KEYS: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_URL: z.string().optional(),
  OPENROUTER_REFERER: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  TURNSTILE_VERIFY_URL: z.string().optional(),
  TURNSTILE_ENFORCE_CONTEST_SUBMIT: z.string().optional(),
  TURNSTILE_ENFORCE_AUTH: z.string().optional(),

  // Cloudflare AI worker base URL (used by LLM provider and can be reused for translation)
  CLOUDFLARE_AI_URL: z.string().optional(),

  // Free uk->en translator for theory blocks (optional overrides)
  TRANSLATE_UK_EN_URL: z.string().optional(),
  TRANSLATE_UK_EN_TIMEOUT_MS: z.string().optional(),
  TRANSLATE_UK_EN_MAX_CHUNK_CHARS: z.string().optional(),
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
  MAX_EXECUTION_QUEUE_SIZE: z.string().optional(),
  EXECUTION_SCHEDULER_LOG_INTERVAL_MS: z.string().optional(),

  // Per-user submission rate limit (short + long windows)
  RATE_LIMIT_SHORT_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_SHORT_MAX: z.string().optional(),
  RATE_LIMIT_LONG_WINDOW_MS: z.string().optional(),
  RATE_LIMIT_LONG_MAX: z.string().optional(),

  // Retry-After header for overload responses
  OVERLOAD_RETRY_AFTER_SECONDS: z.string().optional(),

  // Web task feature flags/limits
  WEB_TASKS_ENABLED: z.string().optional(),
  WEB_TASK_MAX_FILE_SIZE: z.string().optional(),
  WEB_TASK_MAX_TOTAL_SIZE: z.string().optional(),
  WEB_TASK_PREVIEW_RATE_LIMIT: z.string().optional(),
}).transform(env => {
  const corsOrigins = normalizeOrigins(env.CORS_ORIGIN);
  const cfBase = String(env.CLOUDFLARE_AI_URL ?? "").trim();
  const cfTranslate = cfBase ? `${cfBase.replace(/\/$/, "")}/translate` : "";
  return {
    ...env,
    __isProduction: isProduction,
    __corsOrigins: corsOrigins,
    __translateUkEnUrl: ((env.TRANSLATE_UK_EN_URL ?? "") || cfTranslate || "https://libretranslate.de/translate").trim(),
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
    __judgeWorkerEntry: (env.JUDGE_WORKER_ENTRY ?? "").trim(),
    __turnstileEnforceContestSubmit: parseBoolEnv(env.TURNSTILE_ENFORCE_CONTEST_SUBMIT),
    __turnstileEnforceAuth: parseBoolEnv(env.TURNSTILE_ENFORCE_AUTH),
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
  }
});
export type AppEnv = z.infer<typeof EnvSchema>;
export const env: AppEnv = EnvSchema.parse(process.env);