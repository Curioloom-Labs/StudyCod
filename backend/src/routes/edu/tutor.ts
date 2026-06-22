import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { EduGrade } from "../../entities/EduGrade";
import { findActiveStudentForUser } from "../../services/edu/studentLink";
import { askTutor, buildTutorContext, type TutorHistoryItem } from "../../services/edu/aiTutor";
import { createRouteLimiter } from "../../middleware/routeRateLimit";
import { logger } from "../../utils/logger";

/**
 * Personal AI tutor (Tier 2). Student-only, on-demand, grounded in the
 * student's own recent grades. Stateless — no schema.
 */
const router = Router();
const gradeRepo = () => AppDataSource.getRepository(EduGrade);

const tutorLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 12, message: "RATE_LIMIT" });

router.post("/tutor", authRequired, tutorLimiter, async (req: AuthRequest, res: Response) => {
  try {
    // Resolve the asking student (legacy shell student or a User-backed one).
    let studentId: number | null = null;
    if (req.userType === "STUDENT" && req.studentId) {
      studentId = req.studentId;
    } else if (req.userId) {
      const linked = await findActiveStudentForUser(req.userId);
      studentId = linked?.id ?? null;
    }
    if (!studentId) return res.status(403).json({ message: "STUDENTS_ONLY" });

    const parsed = z.object({ question: z.string().min(1).max(2000) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const grades = await gradeRepo().find({
      where: { student: { id: studentId } },
      relations: ["task"],
      order: { createdAt: "DESC" },
      take: 12
    });
    const history: TutorHistoryItem[] = grades.map(g => ({
      taskTitle: g.task?.title || "Завдання",
      total: g.total ?? null
    }));

    try {
      const tutor = await askTutor({ question: parsed.data.question, context: buildTutorContext(history) });
      return res.json({ tutor });
    } catch (e: any) {
      if (String(e?.message) === "AI_UNAVAILABLE") return res.status(503).json({ message: "AI_UNAVAILABLE" });
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/tutor] failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
