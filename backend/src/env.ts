import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { z } from "zod";
(() => {
  const envCandidates = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")];
  const envPath = envCandidates.find(p => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
  dotenv.config({
    path: envPath,
    encoding: "utf8",
    override: false
  });
})();
const isProduction = process.env.NODE_ENV === "production";
const enforcePathExistence = isProduction && process.platform !== "win32";
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
  JUDGE_LOCK_STALE_MS: z.string().optional()
}).transform(env => {
  const corsOrigins = normalizeOrigins(env.CORS_ORIGIN);
  return {
    ...env,
    __isProduction: isProduction,
    __corsOrigins: corsOrigins,
    __trustProxy: (() => {
      const raw = (env.TRUST_PROXY ?? "").trim();
      if (raw === "") return isProduction ? 1 : 0;
      if (raw === "true") return 1;
      if (raw === "false") return 0;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : isProduction ? 1 : 0;
    })(),
    __judgeWorkerEntry: (env.JUDGE_WORKER_ENTRY ?? "").trim(),
    __nsjailPath: ((env.NSJAIL_PATH ?? "") || "/usr/bin/nsjail").trim(),
    __nsjailConfig: (env.NSJAIL_CONFIG ?? "").trim(),
    __nsjailUseConfig: String(env.NSJAIL_USE_CONFIG ?? "").trim() === "1",
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
    })()
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
    if (!env.__judgeWorkerEntry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["JUDGE_WORKER_ENTRY"],
        message: "JUDGE_WORKER_ENTRY must be set in production"
      });
    } else if (enforcePathExistence) {
      try {
        if (!fs.existsSync(env.__judgeWorkerEntry)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["JUDGE_WORKER_ENTRY"],
            message: `JUDGE_WORKER_ENTRY does not exist: ${env.__judgeWorkerEntry}`
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JUDGE_WORKER_ENTRY"],
          message: "Unable to access JUDGE_WORKER_ENTRY path"
        });
      }
    }
    if (!env.__nsjailConfig) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NSJAIL_CONFIG"],
        message: "NSJAIL_CONFIG must be set in production"
      });
    } else if (enforcePathExistence) {
      try {
        if (!fs.existsSync(env.__nsjailConfig)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["NSJAIL_CONFIG"],
            message: `NSJAIL_CONFIG does not exist: ${env.__nsjailConfig}`
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["NSJAIL_CONFIG"],
          message: "Unable to access NSJAIL_CONFIG path"
        });
      }
    }
    if (!env.__nsjailPath) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["NSJAIL_PATH"],
        message: "NSJAIL_PATH must be set in production"
      });
    } else if (enforcePathExistence) {
      try {
        if (!fs.existsSync(env.__nsjailPath)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["NSJAIL_PATH"],
            message: `NSJAIL_PATH does not exist: ${env.__nsjailPath}`
          });
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["NSJAIL_PATH"],
          message: "Unable to access NSJAIL_PATH path"
        });
      }
    }
    const wantsConfig = String(process.env.NSJAIL_USE_CONFIG ?? "").trim() === "1";
    if (!wantsConfig && enforcePathExistence) {
      const resolveChroot = (lang: "java" | "cpp" | "python"): string => {
        const byLang = lang === "java" ? env.__nsjailChrootJava : lang === "cpp" ? env.__nsjailChrootCpp : env.__nsjailChrootPython;
        return (byLang || env.__nsjailChroot || "").trim();
      };
      for (const lang of ["java", "cpp", "python"] as const) {
        const ch = resolveChroot(lang);
        if (!ch) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [lang === "java" ? "NSJAIL_CHROOT_JAVA" : lang === "cpp" ? "NSJAIL_CHROOT_CPP" : "NSJAIL_CHROOT_PYTHON"],
            message: `NSJAIL chroot must be set for ${lang} in production (set NSJAIL_CHROOT_${lang.toUpperCase()} or NSJAIL_CHROOT)`
          });
          continue;
        }
        try {
          if (!fs.existsSync(ch)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [lang === "java" ? "NSJAIL_CHROOT_JAVA" : lang === "cpp" ? "NSJAIL_CHROOT_CPP" : "NSJAIL_CHROOT_PYTHON"],
              message: `NSJAIL chroot directory does not exist: ${ch} (for ${lang})`
            });
            continue;
          }
          const st = fs.statSync(ch);
          if (!st.isDirectory()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [lang === "java" ? "NSJAIL_CHROOT_JAVA" : lang === "cpp" ? "NSJAIL_CHROOT_CPP" : "NSJAIL_CHROOT_PYTHON"],
              message: `NSJAIL chroot path is not a directory: ${ch} (for ${lang})`
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [lang === "java" ? "NSJAIL_CHROOT_JAVA" : lang === "cpp" ? "NSJAIL_CHROOT_CPP" : "NSJAIL_CHROOT_PYTHON"],
            message: `Unable to access NSJAIL chroot directory: ${ch} (for ${lang})`
          });
        }
      }
    }
  }
});
export type AppEnv = z.infer<typeof EnvSchema>;
export const env: AppEnv = EnvSchema.parse(process.env);