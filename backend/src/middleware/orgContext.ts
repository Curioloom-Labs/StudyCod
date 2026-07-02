import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./authMiddleware";
import { logger } from "../utils/logger";
import { authorizeClassAction, type ClassAccessResult } from "../services/edu/classAccess";
import { writeAudit } from "../services/audit/auditLog";
import type { Capability } from "../services/edu/rbac";

/** Request carrying the resolved class-access decision (set by requireClassCapability). */
export type ClassAccessRequest = AuthRequest & { classAccess?: ClassAccessResult };

export interface RequireClassCapabilityOptions {
  /** Route param holding the class id. Default `"classId"`. */
  param?: string;
}

/**
 * In-handler authorization for an already-resolved class id, wiring the request's
 * SYSTEM_ADMIN flag into {@link authorizeClassAction}. Use this in handlers that
 * resolve the class from a non-`classId` resource (task → topic → class, grade →
 * student → class, …) and can't use the {@link requireClassCapability} middleware.
 *
 * Returns `null` when the class does not exist (404). Otherwise the result's
 * `allowed` carries the decision (403 when false).
 */
export function authorizeClassForReq(req: AuthRequest, classId: number, capability: Capability) {
  return authorizeClassAction(req.userId as number, classId, capability, {
    isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
  });
}

/**
 * Enforcing per-class capability guard built on {@link authorizeClassAction}.
 *
 * This guard is **always enforcing** and **not fail-open**: it is the
 * load-bearing replacement for the legacy `class.teacher_id` ownership filter. It
 * is safe to enforce because the class owner is grandfathered to TEACHER, so no
 * existing teacher can be locked out of their own class; the only behavioural
 * changes are (a) org admins/assistants gain access to classes in their org and
 * (b) unrelated users are denied. (Org-level actions without a class — creating
 * orgs, managing members — are guarded separately in `routes/edu/orgs.ts`.)
 *
 * On success the resolved {@link ClassAccessResult} is attached to
 * `req.classAccess` so the handler can reuse the loaded class without refetching.
 */
export function requireClassCapability(capability: Capability, opts: RequireClassCapabilityOptions = {}) {
  const param = opts.param ?? "classId";
  return async (req: ClassAccessRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId || (req.userType && req.userType !== "USER")) {
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }
      const classId = parseInt(String(req.params[param]), 10);
      if (!Number.isFinite(classId)) {
        res.status(400).json({ message: "INVALID_CLASS_ID" });
        return;
      }

      const access = await authorizeClassAction(req.userId, classId, capability, {
        isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
      });
      if (!access) {
        res.status(404).json({ message: "CLASS_NOT_FOUND" });
        return;
      }
      if (!access.allowed) {
        await writeAudit({
          actorType: "USER",
          actorId: req.userId,
          action: "rbac.deny",
          targetType: "class",
          targetId: classId,
          orgId: access.cls.organizationId ?? null,
          metadata: { capability, role: access.effectiveRole },
          requestId: req.requestId,
          ip: req.ip
        });
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }

      req.classAccess = access;
      return next();
    } catch (err: unknown) {
      // Not fail-open: an authorization check that errors must deny, not allow.
      logger.error("[rbac] class capability check errored; denying", {
        capability,
        message: err instanceof Error ? err.message : String(err)
      });
      res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
      return;
    }
  };
}
