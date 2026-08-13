import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { writeSensitiveStudentRead } from "../../services/audit/auditLog";
import { authorizeClassAction } from "../../services/edu/classAccess";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { TopicTask } from "../../entities/TopicTask";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { normalizeRubric, computeRubricTotal } from "../../services/edu/rubric";
import { reviewCode } from "../../services/edu/aiCodeReview";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { ControlWork } from "../../entities/ControlWork";
import { detectAICode } from "../../services/ai/aiCodeDetector";
import { markControlWorkAttemptCompletedIfReadyWithManager, saveControlSummaryGradeForNewSystemWithManager } from "../../services/edu/controlWorkGrading";
import { notifyStudentGradeChange } from "../../services/edu/gradeNotificationService";
import { AssessmentType } from "../../types/AssessmentType";
import { logger } from "../../utils/logger";
import { createRouteLimiter } from "../../middleware/routeRateLimit";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { normalizeScaleMode } from "../../utils/gradingScale";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const eduTaskRepo = () => AppDataSource.getRepository(EduTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);

// AI-heavy endpoint: protect against bursts.
const aiDetectLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 10, message: "RATE_LIMIT" });

const manualTaskGradeBodySchema = z.object({
  total: z.number().finite().min(0).max(100),
  feedback: z.string().max(20_000).optional()
});

const controlWorkGradeBodySchema = z.object({
  grade: z.number().finite().min(0).max(100)
});

const updateGradeBodySchema = z
  .object({
    total: z.number().finite().min(0).max(100).optional(),
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
  return Math.max(0, Math.min(100, Math.round(n)));
}

function resolveRequestLocale(req: AuthRequest): "uk" | "en" {
  return resolveUiLocaleFromHeaders(req.headers, "uk");
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

    const taskClassAccess = task.topic.class
      ? await authorizeClassForReq(req, task.topic.class.id, "GRADE_EDIT")
      : null;
    if (!taskClassAccess || !taskClassAccess.allowed) {
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

    const wasExistingGrade = Boolean(grade);

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

    void notifyStudentGradeChange({
      student: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        uiLanguage: student.uiLanguage
      },
      kind: "task",
      event: wasExistingGrade ? "updated" : "created",
      itemTitle: task.title,
      grade: normalizedTotal,
      feedback: feedback || null,
      className: task.topic.class?.name ?? null,
      gradingSystem: task.topic.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(task.topic.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
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

    const taskClassAccess = task.topic.class
      ? await authorizeClassForReq(req, task.topic.class.id, "GRADE_EDIT")
      : null;
    if (!taskClassAccess || !taskClassAccess.allowed) {
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

    // Fetch only the student ids for this teacher's classes — avoids hydrating
    // full Student rows (incl. password hashes) just to read their ids.
    const studentIdRows = await studentRepo()
      .createQueryBuilder("s")
      .select("s.id", "id")
      .innerJoin("s.class", "class")
      .where("class.teacher_id = :teacherId", { teacherId: user.id })
      .getRawMany();
    const studentIds = studentIdRows.map(r => Number(r.id));
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
            rubric: normalizeRubric((grade as any).task.rubric),
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

    if (!controlWork.topic.class) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    const cwClassAccess = await authorizeClassForReq(req, controlWork.topic.class.id, "GRADE_EDIT");
    if (!cwClassAccess || !cwClassAccess.allowed) {
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

    const wasExistingSummaryGrade = Boolean(summaryGrade);

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

    void notifyStudentGradeChange({
      student: {
        id: student.id,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        uiLanguage: student.uiLanguage
      },
      kind: "control",
      event: wasExistingSummaryGrade ? "updated" : "created",
      itemTitle: controlWork.title || `Контрольна робота #${controlWork.id}`,
      grade: normalizedGrade,
      className: controlWork.topic.class?.name ?? null,
      gradingSystem: controlWork.topic.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(controlWork.topic.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });
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

    const parsePositiveInt = (value: unknown): number | null => {
      const raw = Array.isArray(value) ? value[0] : value;
      const n = Number.parseInt(String(raw ?? ""), 10);
      if (!Number.isFinite(n) || n <= 0) return null;
      return n;
    };

    const parsedLimit = parsePositiveInt(req.query.limit);
    const limit = parsedLimit ? Math.min(parsedLimit, 50) : 20;
    const beforeId = parsePositiveInt(req.query.beforeId);

    const topicTask = await topicTaskRepo().findOne({
      where: { id: taskId },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });

    if (!topicTask || !topicTask.topic?.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const workAccess = await authorizeClassForReq(req, student.class.id, "STUDENT_DATA_VIEW");
    if (!workAccess || !workAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    await writeSensitiveStudentRead({
      actorType: "USER",
      actorId: req.userId,
      action: "student-data.read.work",
      studentId,
      classId: student.class.id,
      orgId: student.class.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip,
      metadata: { taskId }
    });

    const submissionsQb = gradeRepo()
      .createQueryBuilder("grade")
      .select([
        "grade.id",
        "grade.total",
        "grade.testsPassed",
        "grade.testsTotal",
        "grade.feedback",
        "grade.isManuallyGraded",
        "grade.isCompleted",
        "grade.submittedCode",
        "grade.createdAt",
        "grade.updatedAt"
      ])
      .where("grade.student_id = :studentId", { studentId })
      .andWhere("grade.topic_task_id = :taskId", { taskId })
      .orderBy("grade.id", "DESC")
      .limit(limit + 1);

    if (beforeId) {
      submissionsQb.andWhere("grade.id < :beforeId", { beforeId });
    }

    const submissionsChunk = await submissionsQb.getMany();
    const hasMore = submissionsChunk.length > limit;
    const submissionsPage = hasMore ? submissionsChunk.slice(0, limit) : submissionsChunk;
    const nextCursor = hasMore && submissionsPage.length > 0 ? submissionsPage[submissionsPage.length - 1].id : null;

    const submissionsTotal = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.student_id = :studentId", { studentId })
      .andWhere("grade.topic_task_id = :taskId", { taskId })
      .getCount();

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
      submissions: submissionsPage.map(g => ({
        id: g.id,
        total: g.total,
        testsPassed: g.testsPassed,
        testsTotal: g.testsTotal,
        feedback: g.feedback,
        isManuallyGraded: g.isManuallyGraded,
        isCompleted: g.isCompleted,
        submittedCode: g.submittedCode,
        createdAt: g.createdAt ? g.createdAt.toISOString() : null,
        updatedAt: g.updatedAt ? g.updatedAt.toISOString() : null
      })),
      submissionsTotal,
      hasMore,
      nextCursor
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

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const aiDetectAccess = await authorizeClassForReq(req, student.class.id, "STUDENT_DATA_VIEW");
    if (!aiDetectAccess || !aiDetectAccess.allowed) {
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

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class", "class.teacher"] });
    if (!student || !student.class) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    if (student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const cwWorkAccess = await authorizeClassForReq(req, student.class.id, "STUDENT_DATA_VIEW");
    if (!cwWorkAccess || !cwWorkAccess.allowed) {
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

      const access = grade.student.class
        ? await authorizeClassAction(req.userId as number, grade.student.class.id, "GRADE_EDIT", {
            manager,
            isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
          })
        : null;
      if (!access || !access.allowed) {
        throw new Error("ACCESS_DENIED");
      }

      if (total !== undefined) {
        if (total < 0 || total > 100) {
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

    void notifyStudentGradeChange({
      student: {
        id: updated.student.id,
        email: updated.student.email,
        firstName: updated.student.firstName,
        lastName: updated.student.lastName,
        middleName: updated.student.middleName,
        uiLanguage: updated.student.uiLanguage
      },
      kind: "task",
      event: "updated",
      itemTitle: updated.topicTask?.title || updated.task?.title || `Task #${updated.id}`,
      grade: updated.total ?? 0,
      feedback: updated.feedback || null,
      className: updated.student.class?.name ?? null,
      gradingSystem: updated.student.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(updated.student.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
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

// --- Rubric grading (Tier 1) ---

async function ownedEduTaskOr403(req: AuthRequest, res: Response): Promise<EduTask | null> {
  if (req.userType === "STUDENT" || req.studentId || !req.userId) {
    res.status(403).json({ message: "ONLY_TEACHERS" });
    return null;
  }
  const taskId = parseInt(req.params.taskId, 10);
  if (isNaN(taskId)) {
    res.status(400).json({ message: "INVALID_ID" });
    return null;
  }
  const task = await eduTaskRepo()
    .createQueryBuilder("t")
    .leftJoinAndSelect("t.lesson", "l")
    .leftJoinAndSelect("l.class", "c")
    .leftJoinAndSelect("c.teacher", "teacher")
    .where("t.id = :taskId", { taskId })
    .getOne();
  if (!task) {
    res.status(404).json({ message: "TASK_NOT_FOUND" });
    return null;
  }
  const access = task.lesson?.class
    ? await authorizeClassForReq(req, task.lesson.class.id, "CONTENT_AUTHOR")
    : null;
  if (!access || !access.allowed) {
    res.status(403).json({ message: "ACCESS_DENIED" });
    return null;
  }
  return task;
}

// Read a task's rubric (teacher).
router.get("/tasks/:taskId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const task = await ownedEduTaskOr403(req, res);
    if (!task) return;
    return res.json({ rubric: normalizeRubric(task.rubric) });
  } catch (error: any) {
    logger.error("[edu/rubric] get failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Define/replace a task's rubric (teacher).
router.put("/tasks/:taskId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const task = await ownedEduTaskOr403(req, res);
    if (!task) return;
    const parsed = z.object({ rubric: z.array(z.any()) }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const rubric = normalizeRubric(parsed.data.rubric);
    task.rubric = rubric.length ? rubric : null;
    await eduTaskRepo().save(task);
    return res.json({ rubric });
  } catch (error: any) {
    logger.error("[edu/rubric] put failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Grade a submission by rubric: total is derived from per-criterion scores.
router.post("/grades/:gradeId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_GRADES" });
    }
    const gradeId = parseInt(req.params.gradeId, 10);
    if (isNaN(gradeId)) return res.status(400).json({ message: "INVALID_GRADE_ID" });

    const parsed = z.object({
      scores: z.record(z.string(), z.number()),
      feedback: z.string().optional()
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const grade = await gradeRepo().findOne({
      where: { id: gradeId },
      relations: ["student", "student.class", "student.class.teacher", "task", "topicTask"]
    });
    if (!grade) return res.status(404).json({ message: "GRADE_NOT_FOUND" });
    const rubricGradeAccess = grade.student.class
      ? await authorizeClassForReq(req, grade.student.class.id, "GRADE_EDIT")
      : null;
    if (!rubricGradeAccess || !rubricGradeAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    const rubric = normalizeRubric(grade.task?.rubric);
    if (!rubric.length) return res.status(400).json({ message: "NO_RUBRIC" });

    const result = computeRubricTotal(rubric, parsed.data.scores);
    grade.total = result.percent;
    grade.rubricScores = JSON.stringify(parsed.data.scores);
    if (parsed.data.feedback !== undefined) grade.feedback = parsed.data.feedback || null;
    grade.isManuallyGraded = true;
    await gradeRepo().save(grade);

    res.json({
      message: "GRADE_UPDATED",
      grade: { id: grade.id, total: grade.total, feedback: grade.feedback || undefined, rubric: result }
    });

    void notifyStudentGradeChange({
      student: {
        id: grade.student.id,
        email: grade.student.email,
        firstName: grade.student.firstName,
        lastName: grade.student.lastName,
        middleName: grade.student.middleName,
        uiLanguage: grade.student.uiLanguage
      },
      kind: "task",
      event: "updated",
      itemTitle: grade.task?.title || `Task #${grade.id}`,
      grade: result.percent,
      feedback: grade.feedback || null,
      className: grade.student.class?.name ?? null,
      gradingSystem: grade.student.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(grade.student.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });
  } catch (error: any) {
    logger.error("[edu/rubric] grade failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// AI inline code-review of a submission (Tier 2). On-demand, teacher-only.
router.post("/grades/:gradeId/ai-review", authRequired, aiDetectLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const gradeId = parseInt(req.params.gradeId, 10);
    if (isNaN(gradeId)) return res.status(400).json({ message: "INVALID_GRADE_ID" });

    const grade = await gradeRepo().findOne({
      where: { id: gradeId },
      relations: ["student", "student.class", "student.class.teacher", "task"]
    });
    if (!grade) return res.status(404).json({ message: "GRADE_NOT_FOUND" });
    const aiReviewAccess = grade.student.class
      ? await authorizeClassForReq(req, grade.student.class.id, "GRADE_EDIT")
      : null;
    if (!aiReviewAccess || !aiReviewAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    const code = grade.submittedCode || "";
    if (!code.trim()) return res.status(400).json({ message: "NO_CODE" });

    try {
      const review = await reviewCode({
        code,
        language: (grade.student.class.language as string) || "JAVA",
        taskDescription: grade.task?.description || undefined
      });
      return res.json({ review });
    } catch (e: any) {
      if (String(e?.message) === "AI_UNAVAILABLE") {
        return res.status(503).json({ message: "AI_UNAVAILABLE" });
      }
      throw e;
    }
  } catch (error: any) {
    logger.error("[edu/aiCodeReview] route failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
