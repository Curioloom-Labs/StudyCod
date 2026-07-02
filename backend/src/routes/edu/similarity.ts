import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { EduGrade } from "../../entities/EduGrade";
import { buildSimilarityPairs, markSharedLines, type SimilaritySubmission } from "../../services/edu/similarity";
import { logger } from "../../utils/logger";

/**
 * Code-similarity (antiplagiat) report for a class (Tier 2). Teacher-only.
 * Reuses contest plagiarism fingerprinting over existing code submissions.
 */
const router = Router();
const gradeRepo = () => AppDataSource.getRepository(EduGrade);

const MIN_SIMILARITY = 0.7;

router.get("/classes/:classId/similarity", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await authorizeClassForReq(req, classId, "CLASS_VIEW");
    if (!access || !access.allowed) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    const cls = access.cls;

    const rows = await gradeRepo()
      .createQueryBuilder("g")
      .innerJoin("g.task", "t")
      .innerJoin("t.lesson", "l")
      .innerJoin("l.class", "c")
      .innerJoin("g.student", "s")
      .where("c.id = :classId", { classId })
      .andWhere("g.submitted_code IS NOT NULL")
      .andWhere("g.submitted_code <> ''")
      .orderBy("g.created_at", "DESC")
      .select("g.submittedCode", "code")
      .addSelect("t.id", "taskId")
      .addSelect("t.title", "taskTitle")
      .addSelect("s.id", "studentId")
      .addSelect("s.firstName", "firstName")
      .addSelect("s.lastName", "lastName")
      .getRawMany();

    const lang = (cls.language as string) || "JAVA";
    // Dedupe to the latest submission per (task, student); collect names.
    const byTask = new Map<number, { title: string; subs: Map<number, string> }>();
    const nameById = new Map<number, string>();
    for (const r of rows) {
      const taskId = Number(r.taskId);
      const studentId = Number(r.studentId);
      if (!byTask.has(taskId)) byTask.set(taskId, { title: String(r.taskTitle || "Task"), subs: new Map() });
      const group = byTask.get(taskId)!;
      if (!group.subs.has(studentId)) group.subs.set(studentId, String(r.code || "")); // first = latest (DESC)
      if (!nameById.has(studentId)) nameById.set(studentId, `${r.lastName || ""} ${r.firstName || ""}`.trim() || `#${studentId}`);
    }

    const groups: Array<{ taskId: number; taskTitle: string; pairs: any[] }> = [];
    for (const [taskId, { title, subs }] of byTask) {
      if (subs.size < 2) continue;
      const list: SimilaritySubmission[] = Array.from(subs, ([studentId, code]) => ({ studentId, code }));
      const pairs = buildSimilarityPairs(list, { minSimilarity: MIN_SIMILARITY, lang });
      if (!pairs.length) continue;
      groups.push({
        taskId,
        taskTitle: title,
        pairs: pairs.map(p => ({
          a: { id: p.aStudentId, name: nameById.get(p.aStudentId) || `#${p.aStudentId}` },
          b: { id: p.bStudentId, name: nameById.get(p.bStudentId) || `#${p.bStudentId}` },
          similarity: p.similarity
        }))
      });
    }

    return res.json({ minSimilarity: MIN_SIMILARITY, groups });
  } catch (error: any) {
    logger.error("[edu/similarity] failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Side-by-side compare of two students' submissions for a task (Tier 2).
router.get("/classes/:classId/similarity/compare", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    const taskId = parseInt(String(req.query.taskId), 10);
    const aId = parseInt(String(req.query.a), 10);
    const bId = parseInt(String(req.query.b), 10);
    if (![classId, taskId, aId, bId].every(Number.isFinite)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await authorizeClassForReq(req, classId, "CLASS_VIEW");
    if (!access || !access.allowed) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    const cls = access.cls;

    const rows = await gradeRepo()
      .createQueryBuilder("g")
      .innerJoin("g.task", "t")
      .innerJoin("t.lesson", "l")
      .innerJoin("l.class", "c")
      .innerJoin("g.student", "s")
      .where("c.id = :classId", { classId })
      .andWhere("t.id = :taskId", { taskId })
      .andWhere("s.id IN (:...ids)", { ids: [aId, bId] })
      .andWhere("g.submitted_code IS NOT NULL")
      .orderBy("g.created_at", "DESC")
      .select("g.submittedCode", "code")
      .addSelect("t.title", "taskTitle")
      .addSelect("s.id", "studentId")
      .addSelect("s.firstName", "firstName")
      .addSelect("s.lastName", "lastName")
      .getRawMany();

    const latest = new Map<number, { code: string; name: string }>();
    let taskTitle = "Task";
    for (const r of rows) {
      taskTitle = String(r.taskTitle || taskTitle);
      const sid = Number(r.studentId);
      if (!latest.has(sid)) latest.set(sid, { code: String(r.code || ""), name: `${r.lastName || ""} ${r.firstName || ""}`.trim() || `#${sid}` });
    }
    const a = latest.get(aId);
    const b = latest.get(bId);
    if (!a || !b) return res.status(404).json({ message: "SUBMISSION_NOT_FOUND" });

    const shared = markSharedLines(a.code, b.code);
    return res.json({
      taskTitle,
      a: { studentId: aId, name: a.name, code: a.code },
      b: { studentId: bId, name: b.name, code: b.code },
      shared
    });
  } catch (error: any) {
    logger.error("[edu/similarity] compare failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
