import type { NextFunction, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import type { AuthRequest } from "./authMiddleware";
import { logger } from "../utils/logger";

const userRepo = () => AppDataSource.getRepository(User);

export async function placementGate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId) return next();

    // Students & educational flows should not be blocked by placement.
    if (req.userType && req.userType !== "USER") return next();

    const user = await userRepo().findOne({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }

    if (user.role === "SYSTEM_ADMIN") return next();
    if (user.userMode !== "PERSONAL") return next();

    if (Boolean((user as any).placementDone)) return next();

    return res.status(403).json({
      message: "PLACEMENT_REQUIRED"
    });
  } catch (err: any) {
    logger.error('[placementGate] failed', { message: err?.message });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
}
