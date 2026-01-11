import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import type { AuthRequest } from "./authMiddleware";
import type { UserRole } from "../entities/User";
import { maintenanceService } from "../services/maintenanceService";
function isAllowedPath(pathname: string): boolean {
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname === "/api/auth") return true;
  if (pathname.startsWith("/auth/")) return true;
  if (pathname === "/auth") return true;
  if (pathname.startsWith("/api/admin/")) return true;
  if (pathname === "/api/admin") return true;
  if (pathname.startsWith("/admin/")) return true;
  if (pathname === "/admin") return true;
  return false;
}
function tryGetRoleFromBearer(req: AuthRequest): UserRole | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      role?: UserRole;
    };
    return payload?.role ?? null;
  } catch {
    return null;
  }
}
export async function maintenanceMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const originalUrl = (req.originalUrl || req.url || "").toString();
  const pathname = originalUrl.split("?")[0] || "";
  if (isAllowedPath(pathname)) return next();
  const state = await maintenanceService.getStateCached();
  if (!state.enabled) return next();
  const role = tryGetRoleFromBearer(req);
  if (role === "SYSTEM_ADMIN") return next();
  return res.status(503).json({
    maintenance: true,
    title: state.title,
    message: state.message,
    until: state.until
  });
}