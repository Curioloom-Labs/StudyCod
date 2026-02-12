import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { TopicTask } from "../../entities/TopicTask";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { ControlWork } from "../../entities/ControlWork";
import { detectAICode } from "../../services/ai/aiCodeDetector";
import { markControlWorkAttemptCompletedIfReadyWithManager, saveControlSummaryGradeForNewSystemWithManager } from "../../services/edu/controlWorkGrading";
import { AssessmentType } from "../../types/AssessmentType";
import { logger } from "../../utils/logger";
import { createRouteLimiter } from "../../middleware/routeRateLimit";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const classRepo = () => AppDataSource.getRepository(Class);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);

// AI-heavy endpoint: protect against bursts.
const aiDetectLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 10, message: "RATE_LIMIT" });

const manualTaskGradeBodySchema = z.object({
  total: z.number().finite().min(0).max(12),
  feedback: z.string().max(20_000).optional()
});

const controlWorkGradeBodySchema = z.object({
  grade: z.number().finite().min(0).max(12)
});

const updateGradeBodySchema = z
  .object({
    total: z.number().finite().min(0).max(12).optional(),
    feedback: z.string().max(20_000).optional()
  })
  .strict();

function messageForGradeBodyError(err: z.ZodError, missingMessage: string, invalidMessage: string): string {
  for (const issue of err.issues) {
    const path = issue.path.join(".");
    if (path === "total" || path === "grade") {
      // missing required value
      if (issue.code === "invalid_type" && (issue as any).received === "undefined") return missingMessage;
      // wrong type / out of range
      return invalidMessage;
    }
  }
  return invalidMessage;
}

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(12, Math.round(n)));
}

function disableCache(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

router.post("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_GRADE" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const parsedBody = manualTaskGradeBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      const msg = messageForGradeBodyError(parsedBody.error, "GRADE_REQUIRED", "INVALID_GRADE_RANGE");
      return res.status(400).json({ message: msg });
    }

    const { total, feedback } = parsedBody.data;

    const normalizedTotal = clampGradeToInt(total);

    const task = await topicTaskRepo()
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .leftJoinAndSelect("task.controlWork", "controlWork")
      .where("task.id = :taskId", { taskId })
      .getOne();

    if (!task) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (!task.topic.class || task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (!task.topic.class || student.class.id !== task.topic.class.id) {
      return res.status(403).json({ message: "STUDENT_NOT_IN_CLASS" });
    }

    let grade = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.student_id = :studentId", { studentId })
      .andWhere("grade.topic_task_id = :taskId", { taskId })
      .orderBy("grade.created_at", "DESC")
      .getOne();

    if (grade) {
      grade.total = normalizedTotal;
      grade.feedback = feedback || null;
      grade.isManuallyGraded = true;
      grade.isCompleted = true;
      await gradeRepo().save(grade);
    } else {
      grade = gradeRepo().create({
        student,
        topicTask: task,
        total: normalizedTotal,
        feedback: feedback || null,
        isManuallyGraded: true,
        isCompleted: true,
        testsPassed: 0,
        testsTotal: 0
      });
      await gradeRepo().save(grade);
    }

    res.json({
      message: "GRADE_SAVED",
      grade: {
        id: grade.id,
        total: grade.total,
        feedback: grade.feedback,
        isManuallyGraded: grade.isManuallyGraded
      }
    });

    if (task.controlWork && task.controlWork.id) {
      try {
        await AppDataSource.transaction("SERIALIZABLE", async manager => {
          await saveControlSummaryGradeForNewSystemWithManager(manager, task.controlWork!.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, task.controlWork!.id, studentId);
        });
      } catch (e: any) {
        logger.error("Failed to recalculate control work grade after manual grading", { requestId: req.requestId, err: e });
      }
    }
  } catch (error: any) {
    logger.error("Error creating/updating grade", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_GRADE" });
    }

    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const task = await topicTaskRepo()
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("task.id = :taskId", { taskId })
      .getOne();

    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

    if (!task.topic.class || task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const existing = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.student_id = :studentId", { studentId })
      .andWhere("grade.topic_task_id = :taskId", { taskId })
      .getMany();

    if (existing.length === 0) {
      return res.json({ message: "NO_GRADES_TO_DELETE", deleted: 0 });
    }

    await gradeRepo().remove(existing);

    return res.json({ message: "GRADE_DELETED", deleted: existing.length });
  } catch (error: any) {
    logger.error("Error deleting task grades", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/tasks/pending-review", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_PENDING_REVIEWS" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) {
      return res.status(404).json({ message: "USER_NOT_FOUND" });
    }

    if (user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_PENDING_REVIEWS" });
    }

    const classes = await classRepo().find({
      where: { teacher: { id: user.id } as any },
      relations: ["students"]
    });

    if (classes.length === 0) {
      return res.json({ pendingReviews: [] });
    }

    const studentIds = (classes as any[]).flatMap(c => (c.students || []).map((s: any) => s.id));
    if (studentIds.length === 0) {
      return res.json({ pendingReviews: [] });
    }

    const pendingGrades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoinAndSelect("grade.task", "task")
      .leftJoinAndSelect("grade.topicTask", "topicTask")
      .leftJoinAndSelect("task.lesson", "lesson")
      .leftJoinAndSelect("lesson.class", "lessonClass")
      .leftJoinAndSelect("grade.student", "student")
      .where("grade.student_id IN (:...studentIds)", { studentIds })
      .andWhere("grade.is_manually_graded = :isManuallyGraded", { isManuallyGraded: false })
      .andWhere("(grade.total IS NULL OR grade.total = 0)")
      .orderBy("grade.created_at", "DESC")
      .getMany();

    const pendingReviews = pendingGrades.map(grade => ({
      gradeId: grade.id,
      student: {
        id: (grade as any).student.id,
        firstName: (grade as any).student.firstName,
        lastName: (grade as any).student.lastName,
        middleName: (grade as any).student.middleName || undefined,
        email: (grade as any).student.email
      },
      task: (grade as any).task
        ? {
            id: (grade as any).task.id,
            title: (grade as any).task.title,
            lesson: (grade as any).task.lesson
              ? {
                  id: (grade as any).task.lesson.id,
                  title: (grade as any).task.lesson.title,
                  type: (grade as any).task.lesson.type
                }
              : undefined
          }
        : (grade as any).topicTask
          ? {
              id: (grade as any).topicTask.id,
              title: (grade as any).topicTask.title,
              lesson: undefined
            }
          : null,
      submittedCode: grade.submittedCode,
      submittedAt: grade.createdAt.toISOString(),
      system: (grade as any).task ? ("old" as const) : ("new" as const)
    }));

    res.json({ pendingReviews });
  } catch (error: any) {
    logger.error("Error fetching pending reviews", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/control-works/:controlWorkId/students/:studentId/grade", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_GRADE" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(controlWorkId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const parsedBody = controlWorkGradeBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      const msg = messageForGradeBodyError(parsedBody.error, "GRADE_REQUIRED", "INVALID_GRADE_RANGE");
      return res.status(400).json({ message: msg });
    }

    const normalizedGrade = clampGradeToInt(parsedBody.data.grade);

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("controlWork.id = :controlWorkId", { controlWorkId })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({ message: "CONTROL_WORK_NOT_FOUND" });
    }

    if (!controlWork.topic.class || controlWork.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({ message: "STUDENT_NOT_IN_CLASS" });
    }

    let summaryGrade = await summaryGradeRepo()
      .createQueryBuilder("summaryGrade")
      .leftJoinAndSelect("summaryGrade.controlWork", "cw")
      .where("summaryGrade.student_id = :studentId", { studentId })
      .andWhere("summaryGrade.control_work_id = :controlWorkId", { controlWorkId })
      .getOne();

    if (summaryGrade) {
      summaryGrade.grade = normalizedGrade;
      summaryGrade.controlWork = controlWork;
      summaryGrade.topic = controlWork.topic;
      summaryGrade.class = controlWork.topic.class;
      summaryGrade.assessmentType = AssessmentType.CONTROL;
      if (!summaryGrade.name) {
        summaryGrade.name = controlWork.title || `Контрольна робота #${controlWork.id}`;
      }
      await summaryGradeRepo().save(summaryGrade);
    } else {
      summaryGrade = summaryGradeRepo().create({
        student,
        class: controlWork.topic.class,
        controlWork,
        topic: controlWork.topic,
        grade: normalizedGrade,
        assessmentType: AssessmentType.CONTROL,
        name: controlWork.title || `Контрольна робота #${controlWork.id}`
      });
      await summaryGradeRepo().save(summaryGrade);
    }

    res.json({ message: "GRADE_SAVED", summaryGrade: { id: summaryGrade.id, grade: summaryGrade.grade } });
  } catch (error: any) {
    logger.error("Error updating control work grade", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/topic-tasks/:taskId/students/:studentId/work", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_WORK" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_WORK" });
    }

    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_PARAMS" });
    }

    const topicTask = await topicTaskRepo().findOne({
      where: { id: taskId },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });

    if (!topicTask || !topicTask.topic?.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (!topicTask.topic.class.teacher || topicTask.topic.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (!student.class.teacher || student.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const submissions = await gradeRepo().find({
      where: { student: { id: studentId } as any, topicTask: { id: taskId } as any } as any,
      order: { createdAt: "DESC" as any }
    });

    res.json({
      task: {
        id: topicTask.id,
        title: topicTask.title,
        type: topicTask.type,
        topicId: topicTask.topic.id,
        topicTitle: topicTask.topic.title
      },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName || null
      },
      submissions: submissions.map(g => ({
        id: g.id,
        total: g.total,
        testsPassed: g.testsPassed,
        testsTotal: g.testsTotal,
        feedback: g.feedback,
        isManuallyGraded: g.isManuallyGraded,
        isCompleted: g.isCompleted,
        submittedCode: g.submittedCode,
        testResults: g.testResults,
        createdAt: g.createdAt ? g.createdAt.toISOString() : null,
        updatedAt: g.updatedAt ? g.updatedAt.toISOString() : null
      }))
    });
  } catch (error: any) {
    logger.error("Error getting topic task student work", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/topic-tasks/:taskId/students/:studentId/ai-detect", authRequired, aiDetectLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_AI_DETECT" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_AI_DETECT" });
    }

    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_PARAMS" });
    }

    const topicTask = await topicTaskRepo().findOne({
      where: { id: taskId },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });

    if (!topicTask || !topicTask.topic?.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (!topicTask.topic.class.teacher || topicTask.topic.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (!student.class.teacher || student.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const latest = await gradeRepo().findOne({
      where: { student: { id: studentId } as any, topicTask: { id: taskId } as any } as any,
      order: { createdAt: "DESC" as any } as any
    });

    if (!latest || !latest.submittedCode || !latest.submittedCode.trim()) {
      return res.json({
        message: "NO_SUBMISSION",
        task: { id: topicTask.id, title: topicTask.title },
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName, middleName: student.middleName || null },
        detection: null
      });
    }

    const detection = await detectAICode({
      gradeId: latest.id,
      language: topicTask.topic.class.language,
      taskTitle: topicTask.title,
      taskDescription: topicTask.description,
      template: topicTask.template,
      submittedCode: latest.submittedCode,
      requestId: (req as any).requestId,
      userId: user.id,
      topicTaskId: topicTask.id
    });

    res.json({
      task: { id: topicTask.id, title: topicTask.title, topicId: topicTask.topic.id, topicTitle: topicTask.topic.title },
      student: { id: student.id, firstName: student.firstName, lastName: student.lastName, middleName: student.middleName || null },
      gradeId: latest.id,
      createdAt: latest.createdAt ? latest.createdAt.toISOString() : null,
      detection
    });
  } catch (error: any) {
    logger.error("Error running AI detector", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/control-works/:controlWorkId/students/:studentId/work", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_WORK" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_WORK" });
    }

    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(controlWorkId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_PARAMS" });
    }

    const controlWork = await controlWorkRepo().findOne({
      where: { id: controlWorkId },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });

    if (!controlWork || !controlWork.topic?.class) {
      return res.status(404).json({ message: "CONTROL_WORK_NOT_FOUND" });
    }

    if (!controlWork.topic.class.teacher || controlWork.topic.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (!student.class.teacher || student.class.teacher.id !== user.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const summaryGrade = await summaryGradeRepo().findOne({
      where: { student: { id: studentId } as any, controlWork: { id: controlWorkId } as any } as any
    });

    let quizReview: any | null = null;
    if ((summaryGrade as any)?.quizResultsJson) {
      try {
        quizReview = JSON.parse((summaryGrade as any).quizResultsJson);
      } catch {
        quizReview = null;
      }
    }

    const practiceTasks = await topicTaskRepo().find({
      where: {
        topic: { id: controlWork.topic.id } as any,
        type: "CONTROL" as any,
        controlWork: { id: controlWorkId } as any
      } as any,
      order: { order: "ASC" as any, id: "ASC" as any }
    });

    const taskIds = practiceTasks.map(t => t.id);

    const allGrades = taskIds.length
      ? await gradeRepo()
          .createQueryBuilder("g")
          .leftJoinAndSelect("g.topicTask", "topicTask")
          .where("g.student_id = :studentId", { studentId })
          .andWhere("g.topic_task_id IN (:...taskIds)", { taskIds })
          .orderBy("g.created_at", "DESC")
          .getMany()
      : [];

    const latestByTask = new Map<number, EduGrade>();
    for (const g of allGrades) {
      const tid = g.topicTask?.id || null;
      if (!tid) continue;
      if (!latestByTask.has(tid)) latestByTask.set(tid, g);
    }

    disableCache(res);
    res.json({
      controlWork: {
        id: controlWork.id,
        title: controlWork.title,
        hasTheory: controlWork.hasTheory,
        hasPractice: controlWork.hasPractice
      },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName || null
      },
      summaryGrade: summaryGrade
        ? {
            id: summaryGrade.id,
            grade: (summaryGrade as any).grade,
            theoryGrade: (summaryGrade as any).theoryGrade,
            createdAt: summaryGrade.createdAt ? summaryGrade.createdAt.toISOString() : null
          }
        : null,
      quizReview,
      practiceTasks: practiceTasks.map(t => {
        const g = latestByTask.get(t.id) || null;
        return {
          taskId: t.id,
          taskTitle: t.title,
          grade: g ? g.total : null,
          gradeId: g ? g.id : null,
          testsPassed: g ? g.testsPassed : 0,
          testsTotal: g ? g.testsTotal : 0,
          feedback: g ? g.feedback : null,
          isManuallyGraded: g ? g.isManuallyGraded : false,
          submittedCode: g ? g.submittedCode : null,
          testResults: g ? g.testResults : null,
          createdAt: g && g.createdAt ? g.createdAt.toISOString() : null
        };
      })
    });
  } catch (error: any) {
    logger.error("Error getting control work student work", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/grades/:gradeId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_GRADES" });
    }

    const gradeId = parseInt(req.params.gradeId, 10);
    if (isNaN(gradeId)) {
      return res.status(400).json({ message: "INVALID_GRADE_ID" });
    }

    const parsedBody = updateGradeBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      // Keep legacy code used by clients for invalid manual update.
      return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    }
    const { total, feedback } = parsedBody.data;

    const updated = await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const grade = await manager.getRepository(EduGrade).findOne({
        where: { id: gradeId },
        relations: ["student", "student.class", "student.class.teacher", "task", "topicTask", "topicTask.controlWork"]
      });

      if (!grade) {
        throw new Error("GRADE_NOT_FOUND");
      }

      if (!grade.student.class || grade.student.class.teacher.id !== user.id) {
        throw new Error("ACCESS_DENIED");
      }

      if (total !== undefined) {
        if (total < 0 || total > 12) {
          throw new Error("INVALID_GRADE_VALUE");
        }
        grade.total = total;
      }

      if (feedback !== undefined) {
        grade.feedback = feedback || null;
      }

      grade.isManuallyGraded = true;
      await manager.getRepository(EduGrade).save(grade);

      const controlWorkId = grade.topicTask?.type === "CONTROL" ? grade.topicTask?.controlWork?.id : null;
      if (controlWorkId) {
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, grade.student.id, null);
        await markControlWorkAttemptCompletedIfReadyWithManager(manager, controlWorkId, grade.student.id);
      }

      return grade;
    });

    res.json({
      message: "GRADE_UPDATED",
      grade: { id: updated.id, total: updated.total!, feedback: updated.feedback || undefined, isManuallyGraded: updated.isManuallyGraded }
    });
  } catch (error: any) {
    if (error?.message === "GRADE_NOT_FOUND") {
      return res.status(404).json({ message: "GRADE_NOT_FOUND" });
    }
    if (error?.message === "ACCESS_DENIED") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    if (error?.message === "INVALID_GRADE_VALUE") {
      return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    }

    logger.error("Error updating grade", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
