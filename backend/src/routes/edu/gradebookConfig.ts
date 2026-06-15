import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { computeWeightedGrade, mapGradesToCategoryGrades, normalizeGradebookConfig } from "../../services/edu/gradebookCalc";
import { formatGradeForSystem, normalizeScaleMode } from "../../utils/gradingScale";
import { DEFAULT_GRADING_SYSTEM } from "../../types/GradingSystem";
import { logger } from "../../utils/logger";

/**
 * Weighted-category gradebook config per class (P2.6). Setting a config opts the
 * class into the generalized gradebook; null keeps the thematic/semester model.
 * Item→category tagging + full aggregation is a later step (P2.6c); the preview
 * endpoint computes a final from explicitly supplied category percents.
 */
const router = Router();
const classRepo = () => AppDataSource.getRepository(Class);
const taskRepo = () => AppDataSource.getRepository(EduTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);

async function loadOwnedClass(req: AuthRequest): Promise<Class | null> {
  const classId = parseInt(req.params.classId, 10);
  if (!Number.isFinite(classId)) return null;
  const cls = await classRepo().findOne({ where: { id: classId }, relations: ["teacher"] });
  if (!cls || cls.teacher?.id !== req.userId) return null;
  return cls;
}

function ensureTeacher(req: AuthRequest, res: Response): boolean {
  if (req.userType === "STUDENT" || req.studentId || !req.userId) {
    res.status(403).json({ message: "ONLY_TEACHERS" });
    return false;
  }
  return true;
}

router.get("/classes/:classId/gradebook-config", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const cls = await loadOwnedClass(req);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    return res.json({ config: cls.gradebookConfig ?? null });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] get failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/classes/:classId/gradebook-config", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const cls = await loadOwnedClass(req);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    // null/empty clears the config (revert to thematic/semester model).
    if (req.body?.config == null) {
      cls.gradebookConfig = null;
      await classRepo().save(cls);
      return res.json({ config: null });
    }

    const normalized = normalizeGradebookConfig(req.body.config);
    if (!normalized) return res.status(400).json({ message: "INVALID_CONFIG" });
    cls.gradebookConfig = normalized;
    await classRepo().save(cls);
    return res.json({ config: normalized });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] put failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Compute a final from explicit category percents (UI preview / what-if).
router.post("/classes/:classId/gradebook-config/preview", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const cls = await loadOwnedClass(req);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!cls.gradebookConfig) return res.status(409).json({ message: "NO_GRADEBOOK_CONFIG" });

    const grades = Array.isArray(req.body?.grades) ? req.body.grades : [];
    const sanitized = grades
      .filter((g: any) => g && typeof g.categoryId === "string")
      .map((g: any) => ({ categoryId: g.categoryId, percent: Number(g.percent) }));

    const result = computeWeightedGrade(cls.gradebookConfig, sanitized);
    return res.json({ result });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] preview failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List a class's EduTasks (fork lessons) with their gradebook category tag.
router.get("/classes/:classId/gradebook/tasks", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const cls = await loadOwnedClass(req);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const rows = await taskRepo()
      .createQueryBuilder("task")
      .innerJoin("task.lesson", "lesson")
      .where("lesson.class_id = :classId", { classId: cls.id })
      .select(["task.id AS id", "task.title AS title", "task.gradebook_category_id AS categoryId"])
      .getRawMany();

    return res.json({
      tasks: rows.map((r: any) => ({ id: Number(r.id), title: r.title, categoryId: r.categoryId ?? null }))
    });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] list tasks failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Tag a task to a gradebook category (or clear with null).
router.put("/tasks/:taskId/gradebook-category", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const taskId = parseInt(req.params.taskId, 10);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: "INVALID_ID" });
    const task = await taskRepo().findOne({
      where: { id: taskId },
      relations: ["lesson", "lesson.class", "lesson.class.teacher"]
    });
    if (!task || task.lesson?.class?.teacher?.id !== req.userId) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const categoryId = req.body?.categoryId == null ? null : String(req.body.categoryId).trim();
    if (categoryId) {
      const config = task.lesson.class.gradebookConfig;
      const known = (config?.categories ?? []).some((c) => c.id === categoryId);
      if (!known) return res.status(400).json({ message: "UNKNOWN_CATEGORY" });
    }
    task.gradebookCategoryId = categoryId || null;
    await taskRepo().save(task);
    return res.json({ taskId: task.id, gradebookCategoryId: task.gradebookCategoryId });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] tag task failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Compute a student's weighted final from their real grades, in the class scale.
router.get("/classes/:classId/gradebook/student/:studentId/final", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!ensureTeacher(req, res)) return;
    const cls = await loadOwnedClass(req);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    if (!cls.gradebookConfig) return res.status(409).json({ message: "NO_GRADEBOOK_CONFIG" });
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isFinite(studentId)) return res.status(400).json({ message: "INVALID_ID" });

    // Graded tasks (with a category) in this class for this student.
    const rows = await gradeRepo()
      .createQueryBuilder("grade")
      .innerJoin("grade.task", "task")
      .innerJoin("task.lesson", "lesson")
      .where("grade.student_id = :studentId", { studentId })
      .andWhere("lesson.class_id = :classId", { classId: cls.id })
      .andWhere("task.gradebook_category_id IS NOT NULL")
      .andWhere("grade.total IS NOT NULL")
      .select(["grade.total AS total", "task.gradebook_category_id AS categoryId"])
      .getRawMany();

    const categoryGrades = mapGradesToCategoryGrades(
      rows.map((r: any) => ({ categoryId: r.categoryId, total: Number(r.total) }))
    );
    const result = computeWeightedGrade(cls.gradebookConfig, categoryGrades);
    const display =
      result.final == null
        ? "-"
        : formatGradeForSystem(result.final, cls.gradingSystem || DEFAULT_GRADING_SYSTEM, normalizeScaleMode(cls.gradeScaleMode));

    return res.json({ final: result.final, display, categories: result.categories });
  } catch (error: any) {
    logger.error("[edu/gradebookConfig] student final failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
