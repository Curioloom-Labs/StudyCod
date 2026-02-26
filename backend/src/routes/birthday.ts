import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendBirthdayGreetingsForDate } from "../services/birthdayGreetingService";

const router = Router();

router.post("/check", async (req: Request, res: Response) => {
  try {
    const secret = req.headers["x-cron-secret"] || (req as any).body?.secret;
    if (secret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        message: "UNAUTHORIZED",
      });
    }

    const rawDate = String((req as any).body?.date ?? "").trim();
    const dryRun = Boolean((req as any).body?.dryRun);
    const rawLimit = (req as any).body?.limit;

    const date = rawDate ? new Date(rawDate) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({
        message: "BAD_DATE",
      });
    }

    const limit = rawLimit == null || rawLimit === "" ? undefined : Number(rawLimit);

    const result = await sendBirthdayGreetingsForDate(date, {
      dryRun,
      limit: Number.isFinite(limit) ? limit : undefined,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    logger.error("[birthday] POST /birthday/check error", {
      requestId: (req as any).requestId,
      message: err?.message,
    });
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

export const birthdayRouter = router;
export default router;
