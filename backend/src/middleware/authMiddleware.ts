import { Request, Response, NextFunction } from 'express';
import type { ParamsFlatDictionary } from "express-serve-static-core";
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { AppDataSource } from '../data-source';
import { User } from '../entities/User';
import { UserMode, UserRole } from '../entities/User';
import { logger } from '../utils/logger';
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
};

async function hydrateAuthContext(req: AuthRequest, payload: JwtPayload): Promise<"ok" | "not-found" | "invalid"> {
  if (payload.type === "STUDENT" && payload.studentId) {
    req.studentId = payload.studentId;
    req.userType = "STUDENT";
    req.principalId = payload.studentId;
    req.lang = payload.lang;
    req.userRole = null;
    req.userMode = "EDUCATIONAL";
    return "ok";
  }

  const userId = Number(payload.userId);
  if (!Number.isFinite(userId) || userId <= 0) return "invalid";

  req.userId = userId;
  req.userType = "USER";
  req.principalId = userId;

  const user = await AppDataSource.getRepository(User).findOne({
    where: { id: userId },
    select: ["id", "lang", "role", "userMode"]
  });

  if (!user) return "not-found";

  req.lang = user.lang || payload.lang;
  req.userRole = user.role || null;
  req.userMode = user.userMode || null;
  return "ok";
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'No token provided'
    });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
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
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
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