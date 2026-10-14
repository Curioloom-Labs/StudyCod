import { Router, type Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { authRequired, type AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { courseTestsSchema, courseTaskTestConfig, replaceCourseTaskTests } from "../../services/edu/courseTaskTests";
import { logger } from "../../utils/logger";
const router = Router();
router.param("taskId", (_req, res, next, value) => { if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { res.status(400).json({ message: "INVALID_ID" }); return; } next(); });
async function authorizedTask(req: AuthRequest, res: Response) {
  if (!req.userId || req.studentId || req.userType === "STUDENT") { res.status(403).json({ message: "ONLY_TEACHERS" }); return null; }
  const task = await AppDataSource.getRepository(EduTask).findOne({ where: { id: Number(req.params.taskId) }, relations: ["lesson", "lesson.class"] });
  if (!task) { res.status(404).json({ message: "TASK_NOT_FOUND" }); return null; }
  const access = await authorizeClassForReq(req, task.lesson.class.id, "CONTENT_AUTHOR");
  if (!access?.allowed) { res.status(403).json({ message: "ACCESS_DENIED" }); return null; }
  if (task.taskMode !== "CODE") { res.status(400).json({ message: "TASK_IS_NOT_CODE" }); return null; }
  return task;
}
function failure(req: AuthRequest, res: Response, error: unknown) { const e = error as { statusCode?: number; message?: string };
  if (e.statusCode) return res.status(e.statusCode).json({ message: e.message });
  logger.error("[edu/courseTaskTests] failed", { requestId: req.requestId, error }); return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" }); }
router.get("/course-tasks/:taskId/tests", authRequired, async (req: AuthRequest, res: Response) => {
  try { const task = await authorizedTask(req, res); if (task) return res.json(await courseTaskTestConfig(task)); } catch (error) { return failure(req, res, error); }
});
router.put("/course-tasks/:taskId/tests", authRequired, async (req: AuthRequest, res: Response) => {
  try { const task = await authorizedTask(req, res); if (!task) return;
    const body = z.object({ testData: courseTestsSchema, maxAttempts: z.number().int().min(1).max(100), expectedRevision: z.string().regex(/^[a-f0-9]{64}$/) }).strict().safeParse(req.body);
    if (!body.success) return res.status(400).json({ message: "INVALID_TEST_DATA" });
    return res.json(await replaceCourseTaskTests(task, body.data.testData, body.data.maxAttempts, body.data.expectedRevision));
  } catch (error) { return failure(req, res, error); }
});
export default router;
