import { Request, Response, NextFunction } from 'express';
import type { ParamsFlatDictionary } from "express-serve-static-core";
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { UserMode, UserRole } from '../entities/User';
import { logger } from '../utils/logger';
import { resolveUiLocaleFromHeaders, UiLocale } from '../utils/uiLocale';
import { isJtiRevoked, wasTokenIssuedBeforeRevocation } from '../services/auth/jwtRevocation';
import { getCachedUser, setCachedUser, type CachedUser } from '../services/auth/userCache';
import { getStudentUiLangMarker, setStudentUiLangMarker } from '../services/auth/studentUiLangCache';
import { setRequestContextFields } from '../utils/requestContextStore';
import { AUTH_COOKIE_NAME } from '../utils/authCookie';

/**
 * Carries the authenticated principal. EDU runs a deliberate dual identity model
 * (real `User` accounts vs class-scoped `Student` profiles); exactly one of
 * `userId` / `studentId` is set per request. This seam is FROZEN — see
 * docs/edu-identity-model.md before branching on it or touching student auth.
 * Notably: never delete a Student to "migrate" identity (grades cascade off
 * `student_id`); link in place via `students.user_id` instead.
 */
export interface AuthRequest extends Request<ParamsFlatDictionary, any, any, any, Record<string, any>> {
  userId?: number;
  studentId?: number;
  userType?: "USER" | "STUDENT";
  /**
   * Canonical authenticated principal id.
   * - USER: equals userId
   * - STUDENT: equals studentId
   */
  principalId?: number;
  userRole?: UserRole | null;
  userMode?: UserMode | null;
  lang?: string;
  uiLanguage?: UiLocale;
  iad?: number;
  difus?: number;
  requestId?: string;
}

type JwtPayload = {
  userId?: number;
  studentId?: number;
  type?: "STUDENT" | "USER";
  lang?: string;
  role?: UserRole;
  userMode?: UserMode;
  jti?: string;
  iat?: number;
};

function getCookieValue(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }
  return getCookieValue(req, AUTH_COOKIE_NAME);
}

async function syncStudentUiLanguage(studentId: number, uiLanguage: UiLocale, requestId?: string): Promise<void> {
  try {
    // Skip the per-request DB write while a recent Redis marker confirms the row
    // is already synced. On a marker miss / Redis being unavailable we fall back
    // to the idempotent UPDATE, so correctness never depends on Redis.
    const marker = await getStudentUiLangMarker(studentId);
    if (marker === uiLanguage) return;
    await AppDataSource.query(
      "UPDATE `students` SET `ui_language` = ? WHERE `id` = ? AND (`ui_language` IS NULL OR `ui_language` <> ?)",
      [uiLanguage, studentId, uiLanguage]
    );
    void setStudentUiLangMarker(studentId, uiLanguage);
  } catch (err: any) {
    logger.warn("[auth] Failed to sync student ui_language", {
      requestId,
      studentId,
      uiLanguage,
      err: err?.message || err
    });
  }
}

async function hydrateAuthContext(req: AuthRequest, payload: JwtPayload): Promise<"ok" | "not-found" | "invalid"> {
  if (payload.type === "STUDENT" && payload.studentId) {
    const uiLanguage = resolveUiLocaleFromHeaders(req.headers, "en");
    req.studentId = payload.studentId;
    req.userType = "STUDENT";
    req.principalId = payload.studentId;
    req.lang = payload.lang;
    req.uiLanguage = uiLanguage;
    req.userRole = null;
    req.userMode = "EDUCATIONAL";

    // Best-effort sync, non-blocking for request path.
    void syncStudentUiLanguage(payload.studentId, uiLanguage, req.requestId);

    return "ok";
  }

  req.uiLanguage = resolveUiLocaleFromHeaders(req.headers, "en");

  const userId = Number(payload.userId);
  if (!Number.isFinite(userId) || userId <= 0) return "invalid";

  req.userId = userId;
  req.userType = "USER";
  req.principalId = userId;

  // Try Redis first (short TTL). Falls back to DB transparently on miss /
  // Redis unavailability. This collapses the per-request MySQL roundtrip for
  // poll-heavy endpoints.
  let user: CachedUser | null = null;
  try {
    user = await getCachedUser(userId);
  } catch (err: any) {
    logger.warn('[auth] user cache lookup failed, falling back to DB', {
      userId,
      requestId: req.requestId,
      error: err?.message
    });
  }

  if (!user) {
    const row = await AppDataSource.getRepository(User).findOne({
      where: { id: userId },
      select: ["id", "lang", "role", "userMode"]
    });
    if (!row) return "not-found";
    user = {
      id: row.id,
      lang: row.lang ?? null,
      role: row.role ?? null,
      userMode: row.userMode ?? null
    };
    // Fire-and-forget — failures to cache must never block a request.
    void setCachedUser(user).catch(err => {
      logger.warn('[auth] user cache write failed', {
        userId,
        requestId: req.requestId,
        error: err?.message
      });
    });
  }

  req.lang = user.lang || payload.lang;
  req.userRole = user.role || null;
  req.userMode = user.userMode || null;
  return "ok";
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({
      message: 'No token provided'
    });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Check if JWT has been revoked
    if (payload.jti && await isJtiRevoked(payload.jti)) {
      logger.warn('[auth] Revoked token used', { jti: payload.jti, userId: payload.userId, studentId: payload.studentId });
      return res.status(401).json({
        message: 'Token has been revoked'
      });
    }
    
    // Check if token was issued before user's token revocation timestamp
    if (payload.userId && payload.iat) {
      const wasRevoked = await wasTokenIssuedBeforeRevocation(payload.userId, payload.iat * 1000);
      if (wasRevoked) {
        logger.warn('[auth] Token issued before revocation timestamp', { userId: payload.userId });
        return res.status(401).json({
          message: 'Token is no longer valid'
        });
      }
    }
    
    const status = await hydrateAuthContext(req, payload);
    if (status === "not-found") {
      return res.status(401).json({
        message: 'User not found'
      });
    }
    if (status === "invalid") {
      return res.status(401).json({
        message: 'Invalid token'
      });
    }
    if (req.principalId) setRequestContextFields({ principalId: req.principalId });
    next();
  } catch (error) {
    logger.warn('Token verification failed');
    return res.status(401).json({
      message: 'Invalid token'
    });
  }
};
export const authRequired = authMiddleware;

// Optional auth: if a Bearer token is provided and valid, populates AuthRequest.
// If missing (or invalid), continues as anonymous.
export const authOptional = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    
    // Check if JWT has been revoked
    if (payload.jti && await isJtiRevoked(payload.jti)) {
      logger.warn('[auth] Revoked token used in optional auth', { jti: payload.jti });
      return next();
    }
    
    // Check if token was issued before user's token revocation timestamp
    if (payload.userId && payload.iat) {
      const wasRevoked = await wasTokenIssuedBeforeRevocation(payload.userId, payload.iat * 1000);
      if (wasRevoked) {
        return next();
      }
    }
    
    const status = await hydrateAuthContext(req, payload);
    if (status !== "ok") {
      return next();
    }
  } catch (error) {
    // Treat invalid tokens as anonymous for public endpoints.
    logger.warn('Optional token verification failed');
  }
  return next();
};

export default authMiddleware;
