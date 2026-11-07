import type { Response } from "express";
import type { AuthRequest } from "../middleware/authMiddleware";

export const PERSONAL_ACCOUNT_REQUIRED = "PERSONAL_USER_REQUIRED";

export function isPersonalAccountPrincipal(
  request: Pick<AuthRequest, "userId" | "userType" | "userMode">,
): request is Pick<AuthRequest, "userId" | "userType" | "userMode"> & { userId: number; userType: "USER"; userMode: "PERSONAL" } {
  return Number.isSafeInteger(request.userId)
    && Number(request.userId) > 0
    && request.userType === "USER"
    && request.userMode === "PERSONAL";
}

export function requirePersonalAccountPrincipal(request: AuthRequest, response: Response): number | null {
  if (!isPersonalAccountPrincipal(request)) {
    response.status(403).json({ code: PERSONAL_ACCOUNT_REQUIRED, message: PERSONAL_ACCOUNT_REQUIRED });
    return null;
  }
  return request.userId;
}

export function requirePersonalAccountMiddleware(request: AuthRequest, response: Response, next: () => void): void {
  if (!isPersonalAccountPrincipal(request)) {
    response.status(403).json({ code: PERSONAL_ACCOUNT_REQUIRED, message: PERSONAL_ACCOUNT_REQUIRED });
    return;
  }
  next();
}
