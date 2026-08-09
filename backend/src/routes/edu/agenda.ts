import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { getDeadlinesForClasses, classifyAgenda, summarizeAgenda } from "../../services/edu/agenda";
import { logger } from "../../utils/logger";

/**
 * Deadline agenda/calendar (Tier 1). Derived from existing task/control-work
 * deadlines — no schema. Students see their class; teachers see their classes.
 */
const router = Router();
const classRepo = () => AppDataSource.getRepository(Class);
const studentRepo = () => AppDataSource.getRepository(Student);

const DAY = 24 * 60 * 60 * 1000;

function parseDate(raw: unknown, fallback: Date): Date {
  const d = new Date(String(raw ?? ""));
  return Number.isFinite(d.getTime()) ? d : fallback;
}

router.get("/agenda", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    // Keep enough history and future range for calendar navigation. Explicit
    // query dates still win, so clients can request a narrower window.
    const from = parseDate(req.query.from, new Date(now.getTime() - 365 * DAY));
    const to = parseDate(req.query.to, new Date(now.getTime() + 730 * DAY));

    let classIds: number[] = [];
    if (req.userType === "STUDENT" && req.studentId) {
      const s = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
      if (s?.class) classIds = [s.class.id];
    } else if (req.userId) {
      const [taught, enrolled] = await Promise.all([
        classRepo().find({ where: { teacher: { id: req.userId } }, select: ["id"] }),
        studentRepo().find({ where: { user: { id: req.userId } }, relations: ["class"] })
      ]);
      const ids = new Set<number>();
      for (const c of taught) ids.add(c.id);
      for (const s of enrolled) if (s.class) ids.add(s.class.id);
      classIds = Array.from(ids);
    }

    const raw = await getDeadlinesForClasses(classIds, from, to);
    const items = classifyAgenda(raw, now);
    return res.json({ items, summary: summarizeAgenda(items) });
  } catch (error: any) {
    logger.error("[edu/agenda] failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
