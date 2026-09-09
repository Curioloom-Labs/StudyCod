import { Router, Request, Response } from "express";
import { logger } from "../utils/logger";
import { sendBirthdayGreetingsForDate } from "../services/birthdayGreetingService";
import { isCronAuthorized } from "../middleware/cronAuth";

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

router.post("/check", async (req: Request, res: Response) => {
  try {
    if (!isCronAuthorized(req)) {
      return res.status(401).json({
        message: "UNAUTHORIZED",
      });
    }

    const body = isRecord(req.body) ? req.body : {};
    const rawDate = String(body.date ?? "").trim();
    const dryRun = Boolean(body.dryRun);
    const rawLimit = body.limit;

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
  } catch (err: unknown) {
    logger.error("[birthday] POST /birthday/check error", {
      requestId: isRecord(req) ? req.requestId : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

export const birthdayRouter = router;
export default router;
