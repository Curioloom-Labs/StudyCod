import { Request, Response, NextFunction } from 'express';
import type { ParamsFlatDictionary } from "express-serve-static-core";
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { UserRole } from '../entities/User';
import { logger } from '../utils/logger';
export interface AuthRequest extends Request<ParamsFlatDictionary> {
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
  lang?: string;
  difus?: number;
  requestId?: string;
}
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'No token provided'
    });
  }
  const token = authHeader.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId?: number;
      studentId?: number;
      type?: "STUDENT" | "USER";
      lang?: string;
      role?: UserRole;
    };
    if (payload.type === "STUDENT" && payload.studentId) {
      req.studentId = payload.studentId;
      req.userType = "STUDENT";
      req.principalId = payload.studentId;
      req.lang = payload.lang;
      req.userRole = null;
    } else {
      req.userId = payload.userId;
      req.userType = "USER";
      req.principalId = payload.userId;
      req.lang = payload.lang;
      req.userRole = payload.role || null;
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
export const authOptional = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }
  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId?: number;
      studentId?: number;
      type?: "STUDENT" | "USER";
      lang?: string;
      role?: UserRole;
    };
    if (payload.type === "STUDENT" && payload.studentId) {
      req.studentId = payload.studentId;
      req.userType = "STUDENT";
      req.principalId = payload.studentId;
      req.lang = payload.lang;
      req.userRole = null;
    } else {
      req.userId = payload.userId;
      req.userType = "USER";
      req.principalId = payload.userId;
      req.lang = payload.lang;
      req.userRole = payload.role || null;
    }
  } catch (error) {
    // Treat invalid tokens as anonymous for public endpoints.
    logger.warn('Optional token verification failed');
  }
  return next();
};

export default authMiddleware;