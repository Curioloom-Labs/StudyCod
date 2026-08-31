import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import type { AuthRequest } from "./authMiddleware";
import type { UserRole } from "../entities/User";
import { maintenanceService } from "../services/maintenanceService";

/**
 * Paths that should remain reachable during maintenance.
 *
 * Goals:
 * - Users should see maintenance instead of broken UX.
 * - Frontend must still be able to read the maintenance state.
 * - Admins must be able to log in and disable maintenance.
 */
export function isMaintenanceBypassPath(pathname: string): boolean {
  // Allow health checks.
  if (pathname === "/health" || pathname === "/api/health") return true;

  // Allow reading maintenance state (frontend banner/page).
  if (pathname === "/api/auth/maintenance" || pathname === "/auth/maintenance") return true;

  // Allow login so SYSTEM_ADMIN/support agents can authenticate and work the queue.
  // Non-admins will still be blocked inside the login handler once credentials are verified.
  if (pathname === "/api/auth/login" || pathname === "/auth/login") return true;

  // Allow admin API/UI routes.
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
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as {
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
  if (isMaintenanceBypassPath(pathname)) return next();
  const state = await maintenanceService.getStateCached();
  if (!state.enabled) return next();
  const role = tryGetRoleFromBearer(req);
  if (role === "SYSTEM_ADMIN" || role === "SUPPORT") return next();
  return res.status(503).json({
    maintenance: true,
    title: state.title,
    message: state.message,
    until: state.until
  });
}
