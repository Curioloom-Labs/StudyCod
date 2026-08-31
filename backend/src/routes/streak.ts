import { Router, Response, Request } from "express";
import { AppDataSource } from "../data-source";
import { User } from "../entities/User";
import { emailService } from "../services/emailService";
import { Not, IsNull } from "typeorm";
import { logger } from "../utils/logger";
import { isCronAuthorized } from "../middleware/cronAuth";
const router = Router();
const userRepo = () => AppDataSource.getRepository(User);
router.post("/check", async (req: Request, res: Response) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const users = await userRepo().find({
      where: {
        currentStreak: Not(0),
        lastActivityDate: Not(IsNull())
      }
    });
    const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;
    const MIN_STREAK_FOR_NOTIFICATION = 3;
    const DAY_BEFORE_STREAK_BREAK = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let notified = 0;
    for (const user of users) {
      if (user.currentStreak < MIN_STREAK_FOR_NOTIFICATION) continue;
      if (!user.lastActivityDate) continue;
      if (!user.email || !user.emailVerified) continue;
      const lastActivity = new Date(user.lastActivityDate);
      lastActivity.setHours(0, 0, 0, 0);
      const daysSinceLastActivity = Math.floor((today.getTime() - lastActivity.getTime()) / MILLISECONDS_PER_DAY);
      if (daysSinceLastActivity === DAY_BEFORE_STREAK_BREAK) {
        try {
          await emailService.sendStreakBreakNotification(user.email, user.username, user.currentStreak);
          notified++;
        } catch (err) {
          logger.error("[streak] failed to send streak break email", {
            requestId: (req as any).requestId,
            email: user.email,
            userId: user.id,
            err,
          });
        }
      }
    }
    return res.json({
      success: true,
      notified
    });
  } catch (err) {
    logger.error("[streak] POST /streak/check error", { requestId: (req as any).requestId, err });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
export const streakRouter = router;
export default router;
