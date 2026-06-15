import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./authMiddleware";
import { env } from "../env";
import { logger } from "../utils/logger";
import { AppDataSource } from "../data-source";
import { Class } from "../entities/Class";
import { Student } from "../entities/Student";
import { listUserMemberships } from "../services/edu/membership";
import { roleCan, type Capability } from "../services/edu/rbac";
import { writeAudit } from "../services/audit/auditLog";
import type { OrgRole } from "../types/OrgRole";

/** Resolve the target org from a `:classId`-style route param (the class's org). */
export function orgIdFromClassParam(param = "classId") {
  return async (req: AuthRequest): Promise<number | null> => {
    const id = parseInt(String(req.params[param]), 10);
    if (!Number.isFinite(id)) return null;
    const cls = await AppDataSource.getRepository(Class).findOne({ where: { id } });
    return cls?.organizationId ?? null;
  };
}

/** Resolve the target org from a `:studentId`-style route param (the student's class's org). */
export function orgIdFromStudentParam(param = "studentId") {
  return async (req: AuthRequest): Promise<number | null> => {
    const id = parseInt(String(req.params[param]), 10);
    if (!Number.isFinite(id)) return null;
    const student = await AppDataSource.getRepository(Student).findOne({ where: { id }, relations: ["class"] });
    return student?.class?.organizationId ?? null;
  };
}

/**
 * Org-scoped capability guard for EDU routes. Resolves the caller's role in the
 * relevant organization (their membership) and checks {@link roleCan}.
 *
 * Two modes via EDU_RBAC_ENFORCE:
 *  - shadow (default): a would-be denial is audited as "rbac.shadow_deny" but
 *    the request still proceeds. Lets us validate the matrix + backfill against
 *    real traffic before anything can lock a teacher out.
 *  - enforce: a denial returns 403.
 *
 * Fail-open: any internal error (DB hiccup, etc.) logs and allows, so this guard
 * can never become the reason a legitimate action breaks. Applies only to
 * USER-type principals; students/parents as principals arrive in a later phase.
 */
export interface RequireCapabilityOptions {
  /** Resolve the org the action targets (e.g. from a class's org_id). Omit to use the user's sole org. */
  resolveOrgId?: (req: AuthRequest) => Promise<number | null> | number | null;
}

export function requireCapability(capability: Capability, opts: RequireCapabilityOptions = {}) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.userId || (req.userType && req.userType !== "USER")) {
        return next();
      }

      const memberships = await listUserMemberships(req.userId);

      let orgId: number | null = null;
      if (opts.resolveOrgId) {
        orgId = await opts.resolveOrgId(req);
      } else if (memberships.length === 1) {
        orgId = memberships[0].organizationId;
      }

      let role: OrgRole | null = null;
      if (orgId != null) {
        role = memberships.find((m) => m.organizationId === orgId)?.role ?? null;
      }

      const allowed = role != null && roleCan(role, capability);
      if (allowed) return next();

      const enforce = Boolean(env.__eduRbacEnforce);
      await writeAudit({
        actorType: "USER",
        actorId: req.userId,
        action: enforce ? "rbac.deny" : "rbac.shadow_deny",
        targetType: "capability",
        targetId: orgId ?? null,
        orgId: orgId ?? null,
        metadata: { capability, role, enforce },
        requestId: req.requestId,
        ip: req.ip
      });

      if (enforce) {
        res.status(403).json({ message: "FORBIDDEN" });
        return;
      }
      return next();
    } catch (err: unknown) {
      logger.warn("[rbac] capability check errored; allowing", {
        capability,
        message: err instanceof Error ? err.message : String(err)
      });
      return next();
    }
  };
}
