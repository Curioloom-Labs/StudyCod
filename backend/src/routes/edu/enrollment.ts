import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { setJoinCode, enrollViaJoinCode } from "../../services/edu/joinCode";
import { writeAudit } from "../../services/audit/auditLog";
import { logger } from "../../utils/logger";

/**
 * Self-enrolment via class join codes (Student↔User unification, dual-mode).
 * Teachers rotate/clear a code; authenticated Users enroll with it. Legacy
 * generated-credential students are untouched.
 */
const router = Router();
const classRepo = () => AppDataSource.getRepository(Class);

// Teacher reads their class's current join code.
router.get("/classes/:classId/join-code", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });
    const cls = await classRepo().findOne({ where: { id: classId }, relations: ["teacher"] });
    if (!cls || cls.teacher?.id !== req.userId) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    return res.json({ joinCode: cls.joinCode ?? null });
  } catch (error: any) {
    logger.error("[edu/enrollment] get join code failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher generates/rotates or clears their class's join code.
router.post("/classes/:classId/join-code", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });
    const cls = await classRepo().findOne({ where: { id: classId }, relations: ["teacher"] });
    if (!cls || cls.teacher?.id !== req.userId) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const code = await setJoinCode(classId, parsed.data.enabled);
    await writeAudit({
      actorType: "USER",
      actorId: req.userId,
      action: parsed.data.enabled ? "class.join_code.set" : "class.join_code.clear",
      targetType: "class",
      targetId: classId,
      orgId: cls.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({ joinCode: code });
  } catch (error: any) {
    logger.error("[edu/enrollment] set join code failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Authenticated User self-enrolls into a class with a join code.
router.post("/classes/join", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_USERS_CAN_ENROLL" });
    }
    const parsed = z.object({ code: z.string().min(1).max(16) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    try {
      const result = await enrollViaJoinCode(req.userId, parsed.data.code);
      if (!result.alreadyEnrolled) {
        await writeAudit({
          actorType: "USER",
          actorId: req.userId,
          action: "class.enroll",
          targetType: "class",
          targetId: result.classId,
          metadata: { studentId: result.studentId },
          requestId: req.requestId,
          ip: req.ip
        });
      }
      return res.status(result.alreadyEnrolled ? 200 : 201).json({ enrollment: result });
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (msg === "INVALID_CODE") return res.status(404).json({ message: "INVALID_CODE" });
      if (msg === "USER_NOT_FOUND") return res.status(401).json({ message: "UNAUTHORIZED" });
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/enrollment] enroll failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
