import { Router } from "express";
import { AppDataSource } from "../data-source";
import { Grade } from "../entities/Grade";
import { Task } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { logger } from "../utils/logger";
const router = Router();
const gradeRepo = () => AppDataSource.getRepository(Grade);
function mapTaskToDto(task: Task | null | undefined) {
  if (!task) return null;
  const taskWithRelations = task as Task & {
    topic?: Topic;
  };
  const topic = taskWithRelations.topic;
  return {
    id: task.id,
    title: task.title,
    descriptionMarkdown: task.description,
    starterCode: task.template,
    userCode: task.finalCode || task.draftCode || "",
    status: task.completed ? "GRADED" : task.finalCode ? "SUBMITTED" : "OPEN",
    lessonInTopic: task.numInTopic ?? 1,
    repeatAttempt: 0,
    kind: task.type,
    createdAt: task.createdAt,
    language: task.lang,
    topic: topic ? {
      id: topic.id,
      title: topic.title,
      orderIndex: topic.topicIndex,
      isIntro: topic.isControl || false
    } : null
  };
}
router.get("/", authRequired, async (req: AuthRequest, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const where: any = {
      user: {
        id: req.userId
      }
    };
    if (req.lang) {
      where.task = {
        lang: req.lang
      };
    }
    const grades = await gradeRepo().find({
      where,
      order: {
        createdAt: "DESC"
      },
      relations: ["task", "task.topic"]
    });
    const data = grades.map(g => {
      const isIntro = g.task?.type === "INTRO";
      return {
        id: g.id,
        total: isIntro ? null : g.total ?? null,
        workScore: isIntro ? null : g.workScore ?? null,
        optimizationScore: isIntro ? null : g.optimizationScore ?? null,
        integrityScore: isIntro ? null : g.integrityScore ?? null,
        aiFeedback: g.aiFeedback,
        createdAt: g.createdAt,
        task: mapTaskToDto(g.task)
      };
    });
    return res.json(data);
  } catch (err) {
    logger.error("GET /grades error", { requestId: req.requestId, err });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
export const gradeRouter = router;
export default router;