import type { NextFunction, Response } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import type { AuthRequest } from "./authMiddleware";

const userRepo = () => AppDataSource.getRepository(User);

/**
 * Blocks non-contest routes for contest-only user accounts.
 */
export async function forbidContestModeUsers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.userId || req.userType !== "USER") return next();

    if (req.userMode === "CONTEST") {
      return res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
    }

    if (req.userMode) return next();

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ message: "UNAUTHORIZED" });

    if (user.userMode === "CONTEST") {
      return res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
    }

    return next();
  } catch {
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
}
