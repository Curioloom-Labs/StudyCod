import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config';
import { UserRole } from '../entities/User';
import { logger } from '../utils/logger';
export interface AuthRequest extends Request {
  userId?: number;
  studentId?: number;
  userType?: "USER" | "STUDENT";
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
      req.userId = payload.studentId;
      req.userType = "STUDENT";
      req.lang = payload.lang;
      req.userRole = null;
    } else {
      req.userId = payload.userId;
      req.userType = "USER";
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
export default authMiddleware;