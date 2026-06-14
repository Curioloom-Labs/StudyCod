import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { UserRole } from '../entities/User';
export const rolesGuard = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userId) {
      return res.status(401).json({
        message: 'Unauthorized'
      });
    }
    const userRole = req.userRole;
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({
        message: 'Forbidden: Insufficient permissions',
      });
    }
    next();
  };
};
export const systemAdminGuard = rolesGuard(['SYSTEM_ADMIN']);
export const teacherOrAdminGuard = rolesGuard(['TEACHER', 'SYSTEM_ADMIN']);