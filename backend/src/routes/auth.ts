import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import passport from "passport";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { emailService } from "../services/emailService";
import { maintenanceService } from "../services/maintenanceService";
import { JWT_SECRET, FRONTEND_URL } from "../config";
import { isGoogleOAuthEnabled } from "../config/googleOAuth";
import { logger } from "../utils/logger";
import { getUserIadForLang } from "../utils/iad";
import { env } from "../env";
import { generateJti, revokeJti, revokeUserTokensBeforeTime } from "../services/auth/jwtRevocation";
import { createRouteLimiter } from "../middleware/routeRateLimit";
import { AUTH_COOKIE_NAME, clearSharedAuthCookie, setSharedAuthCookie } from "../utils/authCookie";
export const authRouter = Router();

// Pre-computed bcrypt hash used when the user does not exist, so bcrypt.compare
// always runs regardless of lookup result — prevents response-time timing oracle.
const DUMMY_BCRYPT_HASH = "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

const loginLimiter = createRouteLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: "TOO_MANY_LOGIN_ATTEMPTS",
});

const emailActionLimiter = createRouteLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: "TOO_MANY_EMAIL_REQUESTS",
});
const userRepo = () => AppDataSource.getRepository(User);

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const GOOGLE_LINK_SESSION_KEY = "googleLinkUserId";
const GOOGLE_AUTH_MODE_SESSION_KEY = "googleAuthUserMode";
type GoogleAuthUserMode = "PERSONAL" | "EDUCATIONAL" | "CONTEST";

function parseBool(raw: unknown, fallback: boolean): boolean {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return fallback;
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function normalizeSameSite(raw: unknown): "lax" | "strict" | "none" {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "strict") return "strict";
  if (s === "none") return "none";
  return "lax";
}

const googleExchangeCookieSameSite = normalizeSameSite(process.env.AUTH_GOOGLE_EXCHANGE_COOKIE_SAMESITE);
const googleExchangeCookieSecure = parseBool(
  process.env.AUTH_GOOGLE_EXCHANGE_COOKIE_SECURE,
  process.env.NODE_ENV === "production" || googleExchangeCookieSameSite === "none"
);
const googleExchangeHealthEnabled = parseBool(
  process.env.AUTH_GOOGLE_EXCHANGE_HEALTH_ENABLED,
  process.env.NODE_ENV !== "production"
);
const authTurnstileHealthEnabled = parseBool(
  process.env.AUTH_TURNSTILE_HEALTH_ENABLED,
  process.env.NODE_ENV !== "production"
);

function resolveRequestLocale(req: Request): "uk" | "en" {
  const explicit = String((req.headers["x-ui-language"] ?? req.headers["x-lang"] ?? "")).toLowerCase().trim();
  if (explicit.startsWith("en")) return "en";
  if (explicit.startsWith("uk")) return "uk";
  const accept = String(req.headers["accept-language"] ?? "").toLowerCase();
  return accept.includes("en") ? "en" : "uk";
}

function getCookieValue(header: string | undefined, key: string): string | null {
  const raw = String(header ?? "");
  if (!raw) return null;
  const parts = raw.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    if (k !== key) continue;
    const v = part.slice(idx + 1).trim();
    if (!v) return null;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  }
  return null;
}

function setGoogleExchangeCookie(res: Response, code: string): void {
  res.cookie(GOOGLE_EXCHANGE_COOKIE_NAME, code, {
    httpOnly: true,
    secure: googleExchangeCookieSecure,
    sameSite: googleExchangeCookieSameSite,
    maxAge: GOOGLE_EXCHANGE_CODE_TTL_MS,
    path: GOOGLE_EXCHANGE_COOKIE_PATH
  });
}

function clearGoogleExchangeCookie(res: Response): void {
  res.clearCookie(GOOGLE_EXCHANGE_COOKIE_NAME, {
    httpOnly: true,
    secure: googleExchangeCookieSecure,
    sameSite: googleExchangeCookieSameSite,
    path: GOOGLE_EXCHANGE_COOKIE_PATH
  });
}

function getClientIp(req: AuthRequest): string | null {
  const fromCf = String(req.headers["cf-connecting-ip"] ?? "").trim();
  if (fromCf) return fromCf;
  const fromXffRaw = req.headers["x-forwarded-for"];
  const fromXff = Array.isArray(fromXffRaw)
    ? String(fromXffRaw[0] ?? "").split(",")[0]?.trim()
    : String(fromXffRaw ?? "").split(",")[0]?.trim();
  if (fromXff) return fromXff;
  const fromReqIp = String(req.ip ?? "").trim();
  return fromReqIp || null;
}

async function verifyTurnstileToken(params: {
  secretKey: string;
  token: string;
  remoteIp?: string | null;
}): Promise<{ success: boolean; errorCodes: string[] }> {
  const verifyUrl = String(env.TURNSTILE_VERIFY_URL ?? "").trim() || TURNSTILE_SITEVERIFY_URL;
  const body = new URLSearchParams();
  body.set("secret", params.secretKey);
  body.set("response", params.token);
  if (params.remoteIp) body.set("remoteip", params.remoteIp);

  try {
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) return { success: false, errorCodes: [`HTTP_${response.status}`] };
    const data = (await response.json()) as any;
    const errorCodes = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    return { success: data?.success === true, errorCodes };
  } catch {
    return { success: false, errorCodes: ["VERIFY_REQUEST_FAILED"] };
  }
}

async function enforceAuthTurnstile(req: AuthRequest, res: Response, turnstileTokenRaw: unknown): Promise<boolean> {
  const enforceTurnstileOnAuth = Boolean(env.__turnstileEnforceAuth);
  if (!enforceTurnstileOnAuth) return true;

  const turnstileSecretKey = String(env.TURNSTILE_SECRET_KEY ?? "").trim();
  if (!turnstileSecretKey) {
    logger.error("[auth] Turnstile auth enforcement enabled but TURNSTILE_SECRET_KEY is empty", { requestId: req.requestId });
    res.status(503).json({ message: "TURNSTILE_MISCONFIGURED" });
    return false;
  }

  const turnstileToken = typeof turnstileTokenRaw === "string" ? turnstileTokenRaw.trim() : "";
  if (!turnstileToken) {
    res.status(400).json({ message: "TURNSTILE_REQUIRED" });
    return false;
  }

  const turnstileResult = await verifyTurnstileToken({
    secretKey: turnstileSecretKey,
    token: turnstileToken,
    remoteIp: getClientIp(req),
  });
  if (!turnstileResult.success) {
    res.status(400).json({ message: "TURNSTILE_FAILED", errorCodes: turnstileResult.errorCodes });
    return false;
  }

  return true;
}

import { 
  getSharedRedisClient, 
  isRedisEnabled, 
  redisKey 
} from "../services/redis/sharedRedis";

type GoogleExchangeFlow = "success" | "complete";
type PendingGoogleExchange = {
  flow: GoogleExchangeFlow;
  token: string;
  expiresAtMs: number;
};

const GOOGLE_EXCHANGE_CODE_TTL_MS = 5 * 60 * 1000; // Increase to 5 minutes
const GOOGLE_EXCHANGE_COOKIE_NAME = "__sc_google_exchange";
const GOOGLE_EXCHANGE_COOKIE_PATH = "/api/auth/google";
const pendingGoogleExchangeCodesFallback = new Map<string, PendingGoogleExchange>();

async function peekGoogleExchangeCode(codeRaw: unknown): Promise<PendingGoogleExchange | null> {
  const code = typeof codeRaw === "string" ? codeRaw.trim() : "";
  if (!code) return null;

  if (isRedisEnabled()) {
    try {
      const redis = await getSharedRedisClient();
      if (redis) {
        const key = redisKey("auth", "google-exchange", code);
        const data = await redis.get(key);
        if (data) {
          return JSON.parse(data) as PendingGoogleExchange;
        }
        return null;
      }
    } catch (err) {
      logger.warn("[auth] Redis peekGoogleExchangeCode failed, falling back", { err });
    }
  }

  const pending = pendingGoogleExchangeCodesFallback.get(code) ?? null;
  if (!pending) return null;
  if (pending.expiresAtMs <= Date.now()) {
    pendingGoogleExchangeCodesFallback.delete(code);
    return null;
  }
  return pending;
}

async function issueGoogleExchangeCode(flow: GoogleExchangeFlow, token: string): Promise<string> {
  const code = crypto.randomBytes(32).toString("base64url");
  const pending: PendingGoogleExchange = {
    flow,
    token,
    expiresAtMs: Date.now() + GOOGLE_EXCHANGE_CODE_TTL_MS
  };

  if (isRedisEnabled()) {
    try {
      const redis = await getSharedRedisClient();
      if (redis) {
        const key = redisKey("auth", "google-exchange", code);
        await redis.set(key, JSON.stringify(pending), {
          PX: GOOGLE_EXCHANGE_CODE_TTL_MS
        });
        return code;
      }
    } catch (err) {
      logger.warn("[auth] Redis issueGoogleExchangeCode failed, falling back", { err });
    }
  }

  // Cleanup map periodically
  if (pendingGoogleExchangeCodesFallback.size > 1000) {
    const now = Date.now();
    for (const [k, v] of pendingGoogleExchangeCodesFallback.entries()) {
      if (v.expiresAtMs <= now) pendingGoogleExchangeCodesFallback.delete(k);
    }
  }

  pendingGoogleExchangeCodesFallback.set(code, pending);
  return code;
}

async function consumeGoogleExchangeCode(codeRaw: unknown): Promise<PendingGoogleExchange | null> {
  const code = typeof codeRaw === "string" ? codeRaw.trim() : "";
  if (!code) return null;

  const pending = await peekGoogleExchangeCode(code);
  if (!pending) return null;

  if (isRedisEnabled()) {
    try {
      const redis = await getSharedRedisClient();
      if (redis) {
        const key = redisKey("auth", "google-exchange", code);
        await redis.del(key);
      }
    } catch (err) {
      logger.warn("[auth] Redis consumeGoogleExchangeCode failed", { err });
    }
  }
  
  pendingGoogleExchangeCodesFallback.delete(code);
  return pending;
}

function isGoogleExchangeFlowAllowed(expectedFlow: GoogleExchangeFlow | null, actualFlow: GoogleExchangeFlow): boolean {
  if (!expectedFlow) return true;
  return expectedFlow === actualFlow;
}

export const __authGoogleExchangeTestOnly = {
  issueGoogleExchangeCode,
  peekGoogleExchangeCode,
  consumeGoogleExchangeCode,
  cleanupExpiredGoogleExchangeCodes: () => {
    const now = Date.now();
    for (const [k, v] of pendingGoogleExchangeCodesFallback.entries()) {
      if (v.expiresAtMs <= now) pendingGoogleExchangeCodesFallback.delete(k);
    }
  },
  getCookieValue,
  isGoogleExchangeFlowAllowed,
  _setPendingCode: (code: string, pending: PendingGoogleExchange) => {
    pendingGoogleExchangeCodesFallback.set(code, pending);
  },
  _clearPendingCodes: () => {
    pendingGoogleExchangeCodesFallback.clear();
  },
  _pendingCodeCount: () => pendingGoogleExchangeCodesFallback.size
};

function signUserToken(user: User): string {
  return jwt.sign({
    userId: user.id,
    lang: user.lang,
    role: user.role,
    userMode: user.userMode,
    jti: generateJti()
  }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

function getAuthToken(req: Request): string | null {
  const authorization = String(req.headers.authorization ?? "");
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim() || null;
  return getCookieValue(req.headers.cookie, AUTH_COOKIE_NAME);
}

authRouter.post("/logout", async (req: Request, res: Response) => {
  // Clear the httpOnly session even when the access token is already expired.
  clearSharedAuthCookie(res);
  const token = getAuthToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { jti?: string; userId?: number; iat?: number; exp?: number };
      if (payload.jti) {
        const ttl = payload.exp && payload.iat ? Math.max(1, payload.exp - Math.floor(Date.now() / 1000)) : 7 * 24 * 60 * 60;
        await revokeJti(payload.jti, ttl);
      }
      if (payload.userId) await revokeUserTokensBeforeTime(payload.userId, Date.now());
    } catch {
      // Logout is idempotent: an invalid/expired token must not prevent cookie cleanup.
    }
  }
  return res.status(204).send();
});

function getGoogleLinkUserIdFromSession(req: Request): number | null {
  const raw = Number((req.session as any)?.[GOOGLE_LINK_SESSION_KEY] ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw;
}

function clearGoogleLinkSession(req: Request): void {
  if (req.session) {
    delete (req.session as any)[GOOGLE_LINK_SESSION_KEY];
  }
}

function normalizeGoogleAuthMode(raw: unknown): GoogleAuthUserMode {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "edu" || value === "school" || value === "educational") return "EDUCATIONAL";
  if (value === "contest" || value === "contests") return "CONTEST";
  return "PERSONAL";
}

function getGoogleAuthModeFromSession(req: Request): GoogleAuthUserMode {
  return normalizeGoogleAuthMode((req.session as any)?.[GOOGLE_AUTH_MODE_SESSION_KEY]);
}

function clearGoogleAuthModeSession(req: Request): void {
  if (req.session) {
    delete (req.session as any)[GOOGLE_AUTH_MODE_SESSION_KEY];
  }
}

function redirectToGoogleError(res: Response, reason?: string): void {
  const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  res.redirect(`${FRONTEND_URL}/auth/google/error${suffix}`);
}
authRouter.get("/maintenance", async (_req: Request, res: Response) => {
  const state = await maintenanceService.getStateCached();
  return res.json({
    maintenance: state.enabled,
    title: state.title,
    message: state.message,
    until: state.until
  });
});
function normalizeLang(input?: string | null): UserLang {
  const raw = (input || "").toUpperCase().replace(/\s+/g, "").trim();
  if (raw === "CPP" || raw === "C++" || raw.startsWith("C++")) return "CPP";
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}
function buildUserDto(user: User) {
  const iadValue = getUserIadForLang(user, user.lang);
  return {
    id: user.id,
    username: user.username,
    course: user.lang,
    lang: user.lang,
    iad: iadValue ?? 0,
    difus: iadValue ?? 0,
    avatarUrl: user.avatarUrl ?? null,
    contestHandles: {
      codeforces: user.cfHandle ?? null,
      atcoder: user.atcoderHandle ?? null,
      leetcode: user.leetcodeHandle ?? null,
      codechef: user.codechefHandle ?? null,
    },
    userMode: user.userMode,
    role: user.role || null,
    googleId: user.googleId ?? null,
    placementDone: Boolean((user as any).placementDone),
    placementLevel: (user as any).placementLevel ?? null,
    placementScore: (user as any).placementScore ?? null,
    placementMasteredUntilTopicIndexJava: (user as any).placementMasteredUntilTopicIndexJava ?? null,
    placementMasteredUntilTopicIndexPython: (user as any).placementMasteredUntilTopicIndexPython ?? null,
    placementCodingPassed: Boolean((user as any).placementCodingPassed),
    placementCodingLevel: (user as any).placementCodingLevel ?? null,
    placementCodingTaskId: (user as any).placementCodingTaskId ?? null,
    placementCodingScore: (user as any).placementCodingScore ?? null,
    placementCodingDoneAt: (user as any).placementCodingDoneAt ?? null
  };
}
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(8),
  turnstileToken: z.string().min(1).max(4096).optional(),
  course: z.string().optional(),
  lang: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDay: z.number().int().min(1).max(31),
  birthMonth: z.number().int().min(1).max(12)
});
const googleCompleteSchema = z.object({
  token: z.string().min(1),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  course: z.string().optional(),
  lang: z.string().optional(),
  userMode: z.enum(["PERSONAL", "EDUCATIONAL", "CONTEST"]).optional(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDay: z.number().int().min(1).max(31),
  birthMonth: z.number().int().min(1).max(12)
});
const forgotPasswordSchema = z.object({
  email: z.string().email()
});
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8)
});
authRouter.post("/register", async (req: AuthRequest, res: Response) => {
  try {
    const validated = registerSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const {
      username,
      password,
      turnstileToken,
      course,
      lang,
      firstName,
      lastName,
      birthDay,
      birthMonth
    } = validated.data;
    // Normalize email so case variants can't create duplicate accounts and so
    // it matches the lowercased lookups in forgot-password / resend-verification.
    const email = validated.data.email.trim().toLowerCase();

    if (!(await enforceAuthTurnstile(req, res, turnstileToken))) {
      return;
    }

    const existingUser = await userRepo().findOne({
      where: [{
        username
      }, {
        email
      }]
    });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.username === username ? "USERNAME_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS"
      });
    }
    const normalizedLang = normalizeLang(course || lang || "JAVA");
    const hash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    const user = userRepo().create({
      username,
      email,
      password: hash,
      lang: normalizedLang,
      iadJava: 0,
      iadPython: 0,
      iadCpp: 0,
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
      firstName,
      lastName,
      birthDay,
      birthMonth,
      role: "USER",
      userMode: "PERSONAL"
    });
    await userRepo().save(user);
    const locale = resolveRequestLocale(req);
    emailService.sendVerificationEmail(email, verificationToken, username, locale).catch(err => {
      logger.error("[auth] sendVerificationEmail failed", { requestId: req.requestId, email, username, err });
    });
    return res.status(201).json({
      message: "REGISTRATION_SUCCESSFUL_EMAIL_SENT",
      requiresEmailVerification: true
    });
  } catch (err) {
    logger.error("[auth] Register error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
authRouter.post("/login", loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const {
      username,
      password,
      turnstileToken
    } = req.body as {
      username?: string;
      password?: string;
      turnstileToken?: string;
    };
    if (!username || !password) {
      return res.status(400).json({
        message: "USERNAME_AND_PASSWORD_REQUIRED"
      });
    }

    if (!(await enforceAuthTurnstile(req, res, turnstileToken))) {
      return;
    }

    const user = await userRepo().findOne({
      where: {
        username
      }
    });
    const passwordMatch = await bcrypt.compare(password, user?.password ?? DUMMY_BCRYPT_HASH);
    if (!user || !passwordMatch) {
      return res.status(400).json({
        message: "INVALID_CREDENTIALS"
      });
    }
    if (!user.emailVerified) {
      return res.status(403).json({
        message: "EMAIL_NOT_VERIFIED",
        requiresEmailVerification: true
      });
    }

    // During maintenance we allow SYSTEM_ADMIN to log in (so they can disable maintenance),
    // but block regular users.
    const state = await maintenanceService.getStateCached();
    if (state.enabled && user.role !== "SYSTEM_ADMIN") {
      return res.status(503).json({
        maintenance: true,
        title: state.title,
        message: state.message,
        until: state.until
      });
    }

    const token = signUserToken(user);
    setSharedAuthCookie(res, token);
    return res.json({
      token,
      user: buildUserDto(user)
    });
  } catch (err) {
    logger.error("[auth] Login error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_ERROR"
    });
  }
});
authRouter.post("/google/link-session", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType === "STUDENT") {
      return res.status(403).json({ message: "ONLY_USER_ACCOUNTS_CAN_LINK_GOOGLE" });
    }
    if (!isGoogleOAuthEnabled()) {
      return res.status(503).json({ message: "GOOGLE_OAUTH_DISABLED" });
    }
    (req.session as any)[GOOGLE_LINK_SESSION_KEY] = req.userId;
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    return res.json({ ok: true });
  } catch (err) {
    logger.error("[auth] Google link-session error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

authRouter.get("/google", async (req: Request, res: Response, next) => {
  if (!isGoogleOAuthEnabled()) {
    return redirectToGoogleError(res, "GOOGLE_OAUTH_DISABLED");
  }

  const isLinkFlow = String(req.query.link ?? "").trim().toLowerCase() === "true";
  if (isLinkFlow && !getGoogleLinkUserIdFromSession(req)) {
    return redirectToGoogleError(res, "GOOGLE_LINK_SESSION_REQUIRED");
  }

  if (req.session) {
    if (isLinkFlow) {
      clearGoogleAuthModeSession(req);
    } else {
      (req.session as any)[GOOGLE_AUTH_MODE_SESSION_KEY] = normalizeGoogleAuthMode(
        req.query.mode ?? req.query.userMode ?? req.query.surface
      );
    }

    await new Promise<void>((resolve) => {
      req.session.save((err) => {
        if (err) {
          logger.warn("[auth] Google auth mode session save failed (continuing)", {
            requestId: (req as any).requestId,
            error: err?.message
          });
        }
        resolve();
      });
    });
  }

  const isRegistrationFlow = String(req.query.signup ?? "").trim() === "1";
  return passport.authenticate("google", {
    scope: ["profile", "email", "https://www.googleapis.com/auth/user.birthday.read"],
    // Birthday is an additional, sensitive scope. Ask for it again only when
    // the user explicitly chose Google registration, not on every login.
    includeGrantedScopes: true,
    ...(isRegistrationFlow ? { prompt: "consent" } : {})
  })(req, res, next);
});

authRouter.post("/contest-login", loginLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, turnstileToken } = req.body as { username?: string; password?: string; turnstileToken?: string };
    if (!username || !password) {
      return res.status(400).json({ message: "USERNAME_AND_PASSWORD_REQUIRED" });
    }

    if (!(await enforceAuthTurnstile(req, res, turnstileToken))) {
      return;
    }

    const user = await userRepo().findOne({ where: { username } });
    const passwordMatch = await bcrypt.compare(password, user?.password ?? DUMMY_BCRYPT_HASH);
    if (!user || !passwordMatch) {
      return res.status(401).json({ message: "INVALID_CREDENTIALS" });
    }

    const token = signUserToken(user);
    setSharedAuthCookie(res, token);
    return res.json({ token, user: buildUserDto(user) });
  } catch (err) {
    logger.error("[auth] Contest login error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_ERROR" });
  }
});

authRouter.get("/google/callback", (req: Request, res: Response, next) => {
  if (!isGoogleOAuthEnabled()) {
    return redirectToGoogleError(res, "GOOGLE_OAUTH_DISABLED");
  }
  return passport.authenticate("google", {
    failureRedirect: `${FRONTEND_URL}/auth/google/error`
  })(req, res, next);
}, async (req: Request, res: Response) => {
  try {
    const googleLinkUserId = getGoogleLinkUserIdFromSession(req);
    const requestedGoogleMode = getGoogleAuthModeFromSession(req);
    clearGoogleLinkSession(req);
    clearGoogleAuthModeSession(req);

    // Session fixation defence: anonymous session id may have been chosen by
    // the attacker before login. Rotate it now that we are about to attach
    // user state. We preserve passport's stored user payload across the
    // regeneration. Best-effort: callback flow continues even if no session
    // is attached (e.g. if session middleware is skipped for this path).
    if (typeof (req.session as any)?.regenerate === "function") {
      const passportState = (req.session as any)?.passport;
      await new Promise<void>(resolve => {
        (req.session as any).regenerate((err: any) => {
          if (err) {
            logger.warn("[auth] session regenerate failed (continuing)", {
              requestId: (req as any).requestId,
              error: err?.message
            });
          } else if (passportState && req.session) {
            (req.session as any).passport = passportState;
          }
          resolve();
        });
      });
    }

    const user = req.user as User & {
      isNewUser?: boolean;
      isGoogleLinkFlow?: boolean;
      linkUserId?: number;
      email?: string | null;
      avatarUrl?: string | null;
      googleId?: string | null;
    };
    if (googleLinkUserId) {
      const currentUser = await userRepo().findOne({
        where: {
          id: googleLinkUserId
        }
      });
      if (!currentUser) {
        return redirectToGoogleError(res, "GOOGLE_LINK_USER_NOT_FOUND");
      }

      const linkedGoogleId = String(user?.googleId ?? "").trim();
      if (!linkedGoogleId) {
        return redirectToGoogleError(res, "GOOGLE_ID_REQUIRED");
      }

      const existingByGoogle = await userRepo().findOne({
        where: {
          googleId: linkedGoogleId
        }
      });
      if (existingByGoogle && existingByGoogle.id !== currentUser.id) {
        return redirectToGoogleError(res, "GOOGLE_ACCOUNT_ALREADY_LINKED");
      }

      currentUser.googleId = linkedGoogleId;
      if (!currentUser.email && user.email) currentUser.email = user.email;
      if (!currentUser.avatarUrl && user.avatarUrl) currentUser.avatarUrl = user.avatarUrl;
      await userRepo().save(currentUser);

      const token = signUserToken(currentUser);
      const code = await issueGoogleExchangeCode("success", token);
      setGoogleExchangeCookie(res, code);
      return res.redirect(`${FRONTEND_URL}/auth/google/success?code=${encodeURIComponent(code)}`);
    }

    if (user.isNewUser) {
      const tempToken = jwt.sign({
        googleId: user.googleId ?? null,
        email: user.email ?? null,
        avatarUrl: user.avatarUrl ?? null,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        birthDay: user.birthDay ?? null,
        birthMonth: user.birthMonth ?? null,
        userMode: requestedGoogleMode,
        temp: true,
        jti: generateJti()
      }, JWT_SECRET, {
        expiresIn: "10m"
      });
      const code = await issueGoogleExchangeCode("complete", tempToken);
      setGoogleExchangeCookie(res, code);
      return res.redirect(`${FRONTEND_URL}/auth/google/complete?code=${encodeURIComponent(code)}`);
    }
    // One Google identity is valid across Personal, EDU and Contest. The
    // selected mode controls the destination UI; it must not reject an
    // already-linked account or force duplicate credentials.
    const token = signUserToken(user);
    const code = await issueGoogleExchangeCode("success", token);
    setGoogleExchangeCookie(res, code);

    logger.info("[auth] Google login success, redirecting to frontend", {
      userId: user.id,
      flow: "success"
    });

    return res.redirect(`${FRONTEND_URL}/auth/google/success?code=${encodeURIComponent(code)}`);
  } catch (err) {
    logger.error("[auth] Google callback error", { requestId: (req as any).requestId, err });
    return res.redirect(`${FRONTEND_URL}/auth/google/error`);
  }
});
authRouter.post("/google/exchange-code", async (req: AuthRequest, res: Response) => {
  try {
    const { code, flow } = req.body as { code?: unknown; flow?: unknown };
    const expectedFlow = flow === "success" || flow === "complete" ? flow : null;
    const pending = await peekGoogleExchangeCode(code);
    if (!pending) {
      logger.warn("[auth] Invalid or expired Google exchange code", { 
        code: typeof code === "string" ? `${code.slice(0, 4)}...` : "non-string",
        requestId: req.requestId 
      });
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }
    if (!isGoogleExchangeFlowAllowed(expectedFlow, pending.flow)) {
      logger.warn("[auth] Google exchange flow mismatch", { 
        expected: expectedFlow, 
        actual: pending.flow,
        requestId: req.requestId 
      });
      return res.status(400).json({ message: "INVALID_CODE_FLOW" });
    }
    await consumeGoogleExchangeCode(code);
    if (pending.flow === "success") setSharedAuthCookie(res, pending.token);
    return res.json({ token: pending.token, flow: pending.flow });
  } catch (err) {
    logger.error("[auth] Google exchange-code error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
authRouter.post("/google/exchange-cookie", async (req: AuthRequest, res: Response) => {
  try {
    const { flow } = req.body as { flow?: unknown };
    const expectedFlow = flow === "success" || flow === "complete" ? flow : null;
    const code = getCookieValue(req.headers.cookie, GOOGLE_EXCHANGE_COOKIE_NAME);
    const pending = await peekGoogleExchangeCode(code);
    if (!pending) {
      logger.warn("[auth] Invalid or expired Google exchange cookie", { 
        hasCookie: !!code,
        requestId: req.requestId 
      });
      clearGoogleExchangeCookie(res);
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }
    if (!isGoogleExchangeFlowAllowed(expectedFlow, pending.flow)) {
      logger.warn("[auth] Google exchange cookie flow mismatch", { 
        expected: expectedFlow, 
        actual: pending.flow,
        requestId: req.requestId 
      });
      return res.status(400).json({ message: "INVALID_CODE_FLOW" });
    }
    clearGoogleExchangeCookie(res);
    await consumeGoogleExchangeCode(code);
    if (pending.flow === "success") setSharedAuthCookie(res, pending.token);
    return res.json({ token: pending.token, flow: pending.flow });
  } catch (err) {
    logger.error("[auth] Google exchange-cookie error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
authRouter.get("/google/exchange-health", async (req: AuthRequest, res: Response) => {
  try {
    if (!googleExchangeHealthEnabled) {
      return res.status(404).json({ message: "NOT_FOUND" });
    }

    const cookieCode = getCookieValue(req.headers.cookie, GOOGLE_EXCHANGE_COOKIE_NAME);
    const redisEnabledFlag = isRedisEnabled();
    let redisReady = false;
    if (redisEnabledFlag) {
      const client = await getSharedRedisClient();
      redisReady = !!client && client.isOpen;
    }

    return res.json({
      ok: true,
      redisEnabled: redisEnabledFlag,
      redisReady,
      cookieExchangeEnabled: true,
      hasExchangeCookie: !!cookieCode,
      cookieName: GOOGLE_EXCHANGE_COOKIE_NAME,
      cookiePath: GOOGLE_EXCHANGE_COOKIE_PATH,
      cookieSameSite: googleExchangeCookieSameSite,
      cookieSecure: googleExchangeCookieSecure,
      pendingCodesInFallback: pendingGoogleExchangeCodesFallback.size,
      now: new Date().toISOString()
    });
  } catch (err) {
    logger.error("[auth] Google exchange-health error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
authRouter.get("/turnstile-health", async (_req: AuthRequest, res: Response) => {
  try {
    if (!authTurnstileHealthEnabled) {
      return res.status(404).json({ message: "NOT_FOUND" });
    }

    const turnstileSecretKey = String(env.TURNSTILE_SECRET_KEY ?? "").trim();
    const verifyUrl = String(env.TURNSTILE_VERIFY_URL ?? "").trim() || TURNSTILE_SITEVERIFY_URL;

    return res.json({
      ok: true,
      turnstileAuthEnforced: Boolean(env.__turnstileEnforceAuth),
      turnstileContestSubmitEnforced: Boolean(env.__turnstileEnforceContestSubmit),
      turnstileSecretConfigured: turnstileSecretKey.length > 0,
      verifyUrl,
      now: new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[auth] Turnstile health error", { err });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});
authRouter.post("/google/complete", async (req: AuthRequest, res: Response) => {
  try {
    const validated = googleCompleteSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const {
      token,
      username,
      password,
      course,
      lang,
      userMode,
      firstName,
      lastName,
      birthDay,
      birthMonth
    } = validated.data;
    let payload: any;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({
        message: "INVALID_TOKEN"
      });
    }
    if (!payload || payload.temp !== true) {
      return res.status(400).json({
        message: "INVALID_TOKEN"
      });
    }
    const googleId: string | null = payload.googleId || null;
    const email: string | null = payload.email ? String(payload.email).trim().toLowerCase() : null;
    const avatarUrl: string | null = payload.avatarUrl || null;
    const requestedUserMode = normalizeGoogleAuthMode(userMode ?? payload.userMode);
    if (!googleId) {
      return res.status(400).json({
        message: "GOOGLE_ID_REQUIRED"
      });
    }
    if (!email) {
      return res.status(400).json({
        message: "EMAIL_REQUIRED"
      });
    }
    const existingByGoogle = await userRepo().findOne({
      where: {
        googleId
      }
    });
    if (existingByGoogle) {
      const jwtToken = signUserToken(existingByGoogle);
      setSharedAuthCookie(res, jwtToken);
      return res.json({
        token: jwtToken,
        user: buildUserDto(existingByGoogle)
      });
    }
    const existingByEmail = await userRepo().findOne({
      where: {
        email
      }
    });
    if (existingByEmail) {
      // Google has already verified this email. Link it to the existing
      // StudyCod identity instead of failing when the selected mode differs.
      existingByEmail.googleId = googleId;
      if (!existingByEmail.avatarUrl && avatarUrl) existingByEmail.avatarUrl = avatarUrl;
      await userRepo().save(existingByEmail);
      const jwtToken = signUserToken(existingByEmail);
      setSharedAuthCookie(res, jwtToken);
      return res.json({ token: jwtToken, user: buildUserDto(existingByEmail) });
    }
    const existingByUsername = await userRepo().findOne({
      where: {
        username
      }
    });
    if (existingByUsername) {
      return res.status(400).json({
        message: "USERNAME_ALREADY_EXISTS"
      });
    }
    const normalizedLang = normalizeLang(course || lang || "JAVA");
    const hash = await bcrypt.hash(password, 10);
    const user = userRepo().create({
      username,
      email,
      password: hash,
      lang: normalizedLang,
      iadJava: 0,
      iadPython: 0,
      iadCpp: 0,
      emailVerified: true,
      emailVerificationToken: null,
      googleId,
      avatarUrl,
      firstName,
      lastName,
      birthDay,
      birthMonth,
      role: "USER",
      userMode: requestedUserMode
    });
    await userRepo().save(user);
    const jwtToken = signUserToken(user);
    setSharedAuthCookie(res, jwtToken);
    return res.json({
      token: jwtToken,
      user: buildUserDto(user)
    });
  } catch (err) {
    logger.error("[auth] Google complete error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
authRouter.get("/verify-email", async (req: AuthRequest, res: Response) => {
  try {
    const {
      token
    } = req.query;
    if (!token || typeof token !== "string") {
      return res.status(400).json({
        message: "TOKEN_REQUIRED"
      });
    }
    const user = await userRepo()
      .createQueryBuilder("user")
      .where("user.emailVerificationToken = :token", { token })
      .andWhere("user.emailVerificationExpires IS NOT NULL")
      .andWhere("user.emailVerificationExpires > :now", { now: new Date() })
      .getOne();
    if (!user) {
      return res.status(400).json({
        message: "INVALID_TOKEN"
      });
    }
    if (user.emailVerified) {
      return res.status(400).json({
        message: "EMAIL_ALREADY_VERIFIED"
      });
    }
    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await userRepo().save(user);
    const jwtToken = signUserToken(user);
    setSharedAuthCookie(res, jwtToken);
    return res.json({
      token: jwtToken,
      user: buildUserDto(user)
    });
  } catch (err) {
    logger.error("[auth] Verify email error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_ERROR"
    });
  }
});
authRouter.post("/resend-verification", emailActionLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const {
      email: rawEmail
    } = req.body;
    if (!rawEmail || typeof rawEmail !== "string") {
      return res.status(400).json({
        message: "EMAIL_REQUIRED"
      });
    }
    const email = rawEmail.trim().toLowerCase();
    const user = await userRepo().findOne({
      where: {
        email
      }
    });
    if (!user) {
      return res.json({
        message: "EMAIL_SENT"
      });
    }
    if (user.emailVerified) {
      return res.status(400).json({
        message: "EMAIL_ALREADY_VERIFIED"
      });
    }
    const verificationToken = crypto.randomBytes(32).toString("hex");
    user.emailVerificationToken = verificationToken;
    user.emailVerificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    await userRepo().save(user);
    const locale = resolveRequestLocale(req);
    emailService.sendVerificationEmail(user.email!, verificationToken, user.username, locale).catch(err => {
      logger.error("[auth] sendVerificationEmail failed", { requestId: req.requestId, email: user.email, username: user.username, err });
    });
    return res.json({
      message: "EMAIL_SENT"
    });
  } catch (err) {
    logger.error("[auth] Resend verification error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_ERROR"
    });
  }
});
authRouter.post("/forgot-password", emailActionLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const validated = forgotPasswordSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const email = validated.data.email.trim().toLowerCase();
    const user = await userRepo().findOne({
      where: {
        email
      }
    });
    if (!user || !user.email) {
      return res.json({
        message: "RESET_EMAIL_SENT"
      });
    }
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetToken = tokenHash;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
    await userRepo().save(user);
    const locale = resolveRequestLocale(req);
    emailService.sendPasswordResetEmail(user.email, rawToken, user.username, locale).catch(err => {
      logger.error("[auth] sendPasswordResetEmail failed", { requestId: req.requestId, email: user.email, username: user.username, err });
    });
    return res.json({
      message: "RESET_EMAIL_SENT"
    });
  } catch (err) {
    logger.error("[auth] Forgot password error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
authRouter.post("/reset-password", async (req: AuthRequest, res: Response) => {
  try {
    const validated = resetPasswordSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
      });
    }
    const {
      token,
      newPassword
    } = validated.data;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await userRepo().findOne({
      where: { passwordResetToken: tokenHash }
    });
    if (!user || !user.passwordResetExpires || user.passwordResetExpires <= new Date()) {
      return res.status(400).json({
        message: "INVALID_OR_EXPIRED_TOKEN"
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await userRepo().save(user);
    await revokeUserTokensBeforeTime(user.id, Date.now());

    return res.json({
      message: "PASSWORD_UPDATED"
    });
  } catch (err) {
    logger.error("[auth] Reset password error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
