import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { systemAdminGuard } from "../middleware/rolesGuard";
import { maintenanceService } from "../services/maintenanceService";
const router = Router();
const enableSchema = z.object({
  title: z.string().trim().min(1).max(255),
  message: z.string().trim().min(1).max(20_000),
  until: z.union([z.string().datetime({
    offset: true
  }), z.string().datetime(), z.null()]).optional()
});
router.get("/", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  const state = await maintenanceService.getState();
  return res.json({
    state
  });
});
router.post("/enable", authRequired, systemAdminGuard, async (req: AuthRequest, res: Response) => {
  const validated = enableSchema.safeParse(req.body);
  if (!validated.success) {
    return res.status(400).json({
      message: "INVALID_INPUT",
      errors: validated.error.errors
    });
  }
  const rawUntil = validated.data.until ?? null;
  const until = rawUntil === null ? null : new Date(rawUntil);
  if (until && !Number.isFinite(until.getTime())) {
    return res.status(400).json({
      message: "INVALID_UNTIL"
    });
  }
  const state = await maintenanceService.enable({
    title: validated.data.title,
    message: validated.data.message,
    until
  });
  return res.json({
    ok: true,
    state
  });
});
router.post("/disable", authRequired, systemAdminGuard, async (_req: AuthRequest, res: Response) => {
  const state = await maintenanceService.disable();
  return res.json({
    ok: true,
    state
  });
});
export default router;