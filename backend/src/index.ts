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
import eduRouter from "./routes/edu";
import topicsRouter from "./routes/topics";
import adminRouter from "./routes/admin";
import supportRouter from "./routes/support";
import { maintenanceMiddleware } from "./middleware/maintenanceMiddleware";
import { requestContextMiddleware } from "./middleware/requestContext";
import { PORT, CORS_ORIGIN, CORS_ORIGINS, SESSION_SECRET, IS_PRODUCTION, TRUST_PROXY } from "./config";
import { logger } from "./utils/logger";
const app = express();
app.set("trust proxy", TRUST_PROXY);
app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: IS_PRODUCTION ? 300 : 0,
  standardHeaders: true,
  legacyHeaders: false
}));
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
app.use(express.json({
  limit: "512kb"
}));
app.use(express.urlencoded({
  extended: false,
  limit: "512kb"
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
    version: "1.0.0"
  });
});
app.use("/auth", authRouter);
app.use("/profile", profileRouter);
app.use("/tasks", tasksRouter);
app.use("/grades", gradeRouter);
app.use("/edu", eduRouter);
app.use("/topics", topicsRouter);
app.use("/streak", streakRouter);
app.use("/admin", adminRouter);
app.use("/support", supportRouter);
app.use("/api/auth", authRouter);
app.use("/api/profile", profileRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/grades", gradeRouter);
app.use("/api/edu", eduRouter);
app.use("/api/topics", topicsRouter);
app.use("/api/streak", streakRouter);
app.use("/api/admin", adminRouter);
app.use("/api/support", supportRouter);
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", {
    err
  });
  const status = err.status || 500;
  const message = process.env.NODE_ENV === "production" ? "INTERNAL_SERVER_ERROR" : err.message || "INTERNAL_SERVER_ERROR";
  res.status(status).json({
    message,
    code: err.code || message,
    requestId: res.locals?.requestId || null,
    ...(process.env.NODE_ENV !== "production" && {
      stack: err.stack
    })
  });
});
AppDataSource.initialize().then(async () => {
  logger.info("Data Source initialized");
  await applyDbPatches();
  const {
    seedTopicsIfNeeded
  } = await import("./utils/seedTopics");
  await seedTopicsIfNeeded();
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