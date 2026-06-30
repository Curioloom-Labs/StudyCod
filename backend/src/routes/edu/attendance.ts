import { Router, Response } from "express";
import { z } from "zod";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import type { Capability } from "../../services/edu/rbac";
import { Class } from "../../entities/Class";
import { getAttendanceForDate, setAttendanceForDate, summarizeAttendance, isValidDate } from "../../services/edu/attendance";
import { writeAudit } from "../../services/audit/auditLog";
import { logger } from "../../utils/logger";

/**
 * Attendance taking (Tier 1). Teacher (class owner) records per-student status
 * for a date. EDU-only.
 */
const router = Router();

const todayIso = () => new Date().toISOString().slice(0, 10);

async function ownedClassOr404(
  req: AuthRequest,
  res: Response,
  capability: Capability = "CLASS_EDIT"
): Promise<Class | null> {
  if (req.userType === "STUDENT" || req.studentId || !req.userId) {
    res.status(403).json({ message: "ONLY_TEACHERS" });
    return null;
  }
  const classId = parseInt(req.params.classId, 10);
  if (!Number.isFinite(classId)) {
    res.status(400).json({ message: "INVALID_ID" });
    return null;
  }
  const access = await authorizeClassForReq(req, classId, capability);
  if (!access || !access.allowed) {
    res.status(404).json({ message: "CLASS_NOT_FOUND" });
    return null;
  }
  return access.cls;
}

router.get("/classes/:classId/attendance", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const cls = await ownedClassOr404(req, res, "CLASS_VIEW");
    if (!cls) return;
    const date = typeof req.query.date === "string" && isValidDate(req.query.date) ? req.query.date : todayIso();
    const records = await getAttendanceForDate(cls.id, date);
    return res.json({
      date,
      records: records.map(r => ({ studentId: r.studentId, status: r.status })),
      summary: summarizeAttendance(records)
    });
  } catch (error: any) {
    logger.error("[edu/attendance] get failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/classes/:classId/attendance", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const cls = await ownedClassOr404(req, res);
    if (!cls) return;
    const parsed = z.object({
      date: z.string(),
      lessonId: z.number().int().optional(),
      entries: z.array(z.object({
        studentId: z.number().int(),
        status: z.enum(["PRESENT", "ABSENT", "LATE", "EXCUSED"])
      }))
    }).safeParse(req.body);
    if (!parsed.success || !isValidDate(parsed.data.date)) {
      return res.status(400).json({ message: "INVALID_INPUT" });
    }

    const records = await setAttendanceForDate(cls.id, parsed.data.date, parsed.data.entries, req.userId ?? null, parsed.data.lessonId ?? null);
    await writeAudit({
      actorType: "USER",
      actorId: req.userId!,
      action: "class.attendance.set",
      targetType: "class",
      targetId: cls.id,
      metadata: { date: parsed.data.date, count: parsed.data.entries.length },
      orgId: cls.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip
    });
    return res.json({
      date: parsed.data.date,
      records: records.map(r => ({ studentId: r.studentId, status: r.status })),
      summary: summarizeAttendance(records)
    });
  } catch (error: any) {
    logger.error("[edu/attendance] set failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
