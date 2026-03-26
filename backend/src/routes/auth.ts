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
import { logger } from "../utils/logger";
import { getUserIadForLang } from "../utils/iad";
import { env } from "../env";
export const authRouter = Router();
const userRepo = () => AppDataSource.getRepository(User);

type GoogleExchangeFlow = "success" | "complete";
type PendingGoogleExchange = {
  flow: GoogleExchangeFlow;
  token: string;
  expiresAtMs: number;
};

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const GOOGLE_EXCHANGE_CODE_TTL_MS = 3 * 60 * 1000;
const GOOGLE_EXCHANGE_COOKIE_NAME = "__sc_google_exchange";
const GOOGLE_EXCHANGE_COOKIE_PATH = "/api/auth/google";
const pendingGoogleExchangeCodes = new Map<string, PendingGoogleExchange>();

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

function cleanupExpiredGoogleExchangeCodes(nowMs = Date.now()): void {
  for (const [code, pending] of pendingGoogleExchangeCodes.entries()) {
    if (pending.expiresAtMs <= nowMs) pendingGoogleExchangeCodes.delete(code);
  }
}

function issueGoogleExchangeCode(flow: GoogleExchangeFlow, token: string): string {
  cleanupExpiredGoogleExchangeCodes();
  const code = crypto.randomBytes(32).toString("base64url");
  pendingGoogleExchangeCodes.set(code, {
    flow,
    token,
    expiresAtMs: Date.now() + GOOGLE_EXCHANGE_CODE_TTL_MS
  });
  return code;
}

function consumeGoogleExchangeCode(codeRaw: unknown): PendingGoogleExchange | null {
  const code = typeof codeRaw === "string" ? codeRaw.trim() : "";
  if (!code) return null;
  const pending = pendingGoogleExchangeCodes.get(code) ?? null;
  if (!pending) return null;
  pendingGoogleExchangeCodes.delete(code);
  if (pending.expiresAtMs <= Date.now()) return null;
  return pending;
}

function isGoogleExchangeFlowAllowed(expectedFlow: GoogleExchangeFlow | null, actualFlow: GoogleExchangeFlow): boolean {
  if (!expectedFlow) return true;
  return expectedFlow === actualFlow;
}

export const __authGoogleExchangeTestOnly = {
  issueGoogleExchangeCode,
  consumeGoogleExchangeCode,
  cleanupExpiredGoogleExchangeCodes,
  getCookieValue,
  isGoogleExchangeFlowAllowed,
  _setPendingCode: (code: string, pending: PendingGoogleExchange) => {
    pendingGoogleExchangeCodes.set(code, pending);
  },
  _clearPendingCodes: () => {
    pendingGoogleExchangeCodes.clear();
  },
  _pendingCodeCount: () => pendingGoogleExchangeCodes.size
};

function signUserToken(user: User): string {
  return jwt.sign({
    userId: user.id,
    lang: user.lang,
    role: user.role,
    userMode: user.userMode
  }, JWT_SECRET, {
    expiresIn: "7d"
  });
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
  password: z.string().min(6),
  course: z.string().optional(),
  lang: z.string().optional(),
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
  newPassword: z.string().min(6)
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
      email,
      password,
      turnstileToken,
      course,
      lang,
      firstName,
      lastName,
      birthDay,
      birthMonth
    } = validated.data;

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
authRouter.post("/login", async (req: AuthRequest, res: Response) => {
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
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({
        message: "INVALID_CREDENTIALS"
      });
    }
    if (user.userMode === "CONTEST") {
      return res.status(403).json({
        message: "USE_CONTEST_LOGIN"
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
authRouter.get("/google", passport.authenticate("google", {
  scope: ["profile", "email"]
}));

authRouter.post("/contest-login", async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, turnstileToken } = req.body as { username?: string; password?: string; turnstileToken?: string };
    if (!username || !password) {
      return res.status(400).json({ message: "USERNAME_AND_PASSWORD_REQUIRED" });
    }

    if (!(await enforceAuthTurnstile(req, res, turnstileToken))) {
      return;
    }

    const user = await userRepo().findOne({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "INVALID_CREDENTIALS" });
    }

    if (user.userMode !== "CONTEST") {
      return res.status(403).json({ message: "ONLY_CONTEST_ACCOUNTS_ALLOWED" });
    }

    const token = signUserToken(user);
    return res.json({ token, user: buildUserDto(user) });
  } catch (err) {
    logger.error("[auth] Contest login error", { requestId: req.requestId, err });
    return res.status(500).json({ message: "INTERNAL_ERROR" });
  }
});

authRouter.get("/google/callback", passport.authenticate("google", {
  failureRedirect: `${FRONTEND_URL}/auth/google/error`
}), async (req: Request, res: Response) => {
  try {
    const user = req.user as User & {
      isNewUser?: boolean;
    };
    if (user.isNewUser) {
      const tempToken = jwt.sign({
        ...user,
        temp: true
      }, JWT_SECRET, {
        expiresIn: "10m"
      });
      const code = issueGoogleExchangeCode("complete", tempToken);
      setGoogleExchangeCookie(res, code);
      return res.redirect(`${FRONTEND_URL}/auth/google/complete?code=${encodeURIComponent(code)}`);
    }
    const token = signUserToken(user);
    const code = issueGoogleExchangeCode("success", token);
    setGoogleExchangeCookie(res, code);
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
    const pending = consumeGoogleExchangeCode(code);
    if (!pending) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }
    if (!isGoogleExchangeFlowAllowed(expectedFlow, pending.flow)) {
      return res.status(400).json({ message: "INVALID_CODE_FLOW" });
    }
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
    clearGoogleExchangeCookie(res);
    const pending = consumeGoogleExchangeCode(code);
    if (!pending) {
      return res.status(400).json({ message: "INVALID_OR_EXPIRED_CODE" });
    }
    if (!isGoogleExchangeFlowAllowed(expectedFlow, pending.flow)) {
      return res.status(400).json({ message: "INVALID_CODE_FLOW" });
    }
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

    cleanupExpiredGoogleExchangeCodes();
    const cookieCode = getCookieValue(req.headers.cookie, GOOGLE_EXCHANGE_COOKIE_NAME);

    return res.json({
      ok: true,
      cookieExchangeEnabled: true,
      hasExchangeCookie: !!cookieCode,
      cookieName: GOOGLE_EXCHANGE_COOKIE_NAME,
      cookiePath: GOOGLE_EXCHANGE_COOKIE_PATH,
      cookieSameSite: googleExchangeCookieSameSite,
      cookieSecure: googleExchangeCookieSecure,
      pendingCodes: pendingGoogleExchangeCodes.size,
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
    const email: string | null = payload.email || null;
    const avatarUrl: string | null = payload.avatarUrl || null;
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
      return res.status(400).json({
        message: "EMAIL_ALREADY_EXISTS"
      });
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
      userMode: "PERSONAL"
    });
    await userRepo().save(user);
    const jwtToken = signUserToken(user);
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
authRouter.post("/resend-verification", async (req: AuthRequest, res: Response) => {
  try {
    const {
      email
    } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({
        message: "EMAIL_REQUIRED"
      });
    }
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
authRouter.post("/forgot-password", async (req: AuthRequest, res: Response) => {
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
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updateResult = await userRepo()
      .createQueryBuilder()
      .update(User)
      .set({
        password: passwordHash,
        passwordResetToken: null,
        passwordResetExpires: null
      })
      .where("passwordResetToken = :tokenHash", { tokenHash })
      .andWhere("passwordResetExpires IS NOT NULL")
      .andWhere("passwordResetExpires > :now", { now: new Date() })
      .execute();

    if (!updateResult.affected || updateResult.affected < 1) {
      return res.status(400).json({
        message: "INVALID_OR_EXPIRED_TOKEN"
      });
    }

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