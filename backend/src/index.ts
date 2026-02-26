import "reflect-metadata";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import session from "express-session";
import passport from "passport";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { AppDataSource } from "./data-source";
import { setupGoogleStrategy } from "./middleware/googleAuth";
import { applyDbPatches } from "./utils/dbPatches";
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
import libraryRouter from "./routes/library";
import contestsRouter from "./routes/contests";
import emailsRouter from "./routes/emails";
import { maintenanceMiddleware } from "./middleware/maintenanceMiddleware";
import { requestContextMiddleware } from "./middleware/requestContext";
import { placementGate } from "./middleware/placementGate";
import { authMiddleware } from "./middleware/authMiddleware";
import { PORT, CORS_ORIGIN, CORS_ORIGINS, SESSION_SECRET, IS_PRODUCTION, TRUST_PROXY } from "./config";
import { logger } from "./utils/logger";
import { HttpError } from "./utils/httpError";
import { spawn } from "child_process";
import * as fsSync from "fs";
import * as path from "path";
import { resolveJudgeSandboxConfig, resolveJudgeWorkerEntry } from "./services/judgeWorker/workerPaths";
import { env } from "./env";
import { setRetryAfterForOverload } from "./middleware/overloadRetryAfter";
import { executionScheduler } from "./services/execution/executionSchedulerSingleton";
const app = express();

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

function isDisconnectError(err: any): boolean {
  const code = err?.code;
  return code === "EPIPE" || code === "ECONNRESET" || code === "ERR_STREAM_DESTROYED";
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
  logger.error("Uncaught exception", {
    err
  });
  // Fail-fast for unknown errors.
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  logger.error("Unhandled rejection", {
    reason
  });
});

app.set("trust proxy", TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: false
}));
// NOTE: In express-rate-limit, limit=0 means "allow 0 requests" (i.e. always 429).
// We only enable global rate limiting in production.
if (IS_PRODUCTION) {
  app.use(rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
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
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = (CORS_ORIGINS.length ? CORS_ORIGINS : [CORS_ORIGIN]).includes(origin);
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

// Some endpoints (e.g. library task create/update) may send large JSON payloads
// containing many tests with large input/output.
const bodyLimit = String(process.env.API_BODY_LIMIT || process.env.BODY_LIMIT || "50mb");
app.use(express.json({
  limit: bodyLimit
}));
app.use(express.urlencoded({
  extended: false,
  limit: bodyLimit
}));
app.use(requestContextMiddleware);
app.use(maintenanceMiddleware);
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  name: "__sid",
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(passport.initialize());
app.use(passport.session());
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

// Internal diagnostics endpoint. Exposed only in non-production by default.
app.get(["/internal/load", "/api/internal/load"], (_req, res) => {
  if (IS_PRODUCTION) {
    return res.status(404).json({ error: "NOT_FOUND", status: 404 });
  }

  const m = executionScheduler.getMetrics();
  res.json({
    active: m.active,
    queued: m.queued,
    peakActive: m.peakActive,
    peakQueueLength: m.peakQueueLength,
    maxConcurrent: m.maxConcurrent,
    maxQueueSize: m.maxQueueSize,
    avgExecutionTimeMs: Math.round(m.avgExecutionTimeMs),
    avgQueueWaitTimeMs: Math.round(m.averageQueueWaitTime),
    totalRejectedQueueFull: m.totalRejectedQueueFull,
    totalCompleted: m.totalCompleted,
  });
});

app.get(["/health/judge", "/api/health/judge"], async (_req, res) => {
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
      res.status(503).json({
        error: "Judge unavailable",
        status: 503
      });
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
      const kill = () => {
        try {
          child.kill("SIGKILL");
        } catch {}
      };
      const timeout = setTimeout(() => {
        kill();
        reject(new Error("JUDGE_HEALTH_TIMEOUT"));
      }, 2000);
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

    res.json({
      ...health,
      version: judgeVersion,
      backend: {
        sandboxMode,
        workerEntry,
        configPath,
        limits
      }
    });
  } catch (err: any) {
    logger.error("Judge health probe failed", { err });
    res.status(503).json({
      error: "Judge unavailable",
      status: 503
    });
  }
});
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/tasks", authMiddleware, placementGate, tasksRouter);
app.use("/grades", authMiddleware, placementGate, gradeRouter);
app.use("/edu", eduRouter);
app.use("/topics", authMiddleware, placementGate, topicsRouter);
app.use("/theory", authMiddleware, placementGate, theoryRouter);
app.use("/streak", authMiddleware, placementGate, streakRouter);
app.use("/birthday", authMiddleware, placementGate, birthdayRouter);
app.use("/admin", adminRouter);
app.use("/support", supportRouter);
app.use("/library", authMiddleware, libraryRouter);
app.use("/contests", contestsRouter);
app.use("/emails", emailsRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/tasks", authMiddleware, placementGate, tasksRouter);
app.use("/api/grades", authMiddleware, placementGate, gradeRouter);
app.use("/api/edu", eduRouter);
app.use("/api/topics", authMiddleware, placementGate, topicsRouter);
app.use("/api/theory", authMiddleware, placementGate, theoryRouter);
app.use("/api/streak", authMiddleware, placementGate, streakRouter);
app.use("/api/birthday", authMiddleware, placementGate, birthdayRouter);
app.use("/api/admin", adminRouter);
app.use("/api/support", supportRouter);
app.use("/api/library", authMiddleware, libraryRouter);
app.use("/api/contests", contestsRouter);
app.use("/api/emails", emailsRouter);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { err });

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
AppDataSource.initialize().then(async () => {
  logger.info("Data Source initialized");
  await applyDbPatches();
  const {
    seedTopicsIfNeeded
  } = await import("./utils/seedTopics");
  const shouldSeed = String(process.env.SEED_TOPICS_ON_STARTUP ?? "true").toLowerCase() !== "false";
  if (shouldSeed) {
    await seedTopicsIfNeeded();
  } else {
    logger.info("[seed-topics] skipped (SEED_TOPICS_ON_STARTUP=false)");
  }
  app.listen(PORT, () => {
    logger.info("Server listening", {
      port: PORT
    });
  });
}).catch(err => {
  logger.error("Database initialization error", {
    err
  });
  process.exit(1);
});