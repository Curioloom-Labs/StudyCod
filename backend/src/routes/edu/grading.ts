import { gradeReviewRevision, summaryReviewRevision, emptyReviewRevision, requireReviewRevision } from "../../services/edu/reviewRevision";
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
import { normalizeRubric, computeRubricTotal, validateRubricDefinition, validateRubricScores } from "../../services/edu/rubric";
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

import { HttpError } from "../../utils/httpError";
import { withGradeWrite, withStudentGradeWrite, requireGradebookId, requireRawGrade } from "../../services/edu/gradebookWrites";
import { lockClassActor } from "../../services/edu/lifecycleAccess";
import { ManualSubmission } from "../../entities/ManualSubmission";
import { LessonAttempt } from "../../entities/LessonAttempt";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const eduTaskRepo = () => AppDataSource.getRepository(EduTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function errorMessage(error: unknown): string {
  return String(readProperty(error, "message") ?? "");
}

// AI-heavy endpoint: protect against bursts.
const aiDetectLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 10, message: "RATE_LIMIT" });

const manualTaskGradeBodySchema = z.object({
  total: z.number().finite().min(0).max(100),
  feedback: z.string().max(20_000).optional(),
  expectedRevision: z.unknown().optional()
});

const controlWorkGradeBodySchema = z.object({
  grade: z.number().finite().min(0).max(100).optional(),
  useCalculated: z.boolean().optional(),
  expectedRevision: z.unknown().optional()
}).refine(value => value.useCalculated === true ? value.grade === undefined : value.grade !== undefined);

const updateGradeBodySchema = z
  .object({
    total: z.number().finite().min(0).max(100).optional(),
    feedback: z.string().max(20_000).optional(),
    expectedRevision: z.unknown().optional(),
    latestOnly: z.boolean().optional()
  })
  .strict().refine(value => value.total !== undefined || value.feedback !== undefined);

function messageForGradeBodyError(err: z.ZodError, missingMessage: string, invalidMessage: string): string {
  for (const issue of err.issues) {
    const path = issue.path.join(".");
    if (path === "total" || path === "grade") {
      // missing required value
      if (issue.code === "invalid_type" && readProperty(issue, "received") === "undefined") return missingMessage;
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


async function recalculateControl(manager: import("typeorm").EntityManager, grade: EduGrade) {
  const controlWorkId = grade.topicTask?.type === "CONTROL" ? grade.topicTask.controlWork?.id : null;
  if (!controlWorkId) return;
  await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, grade.student.id, null);
  await markControlWorkAttemptCompletedIfReadyWithManager(manager, controlWorkId, grade.student.id);
}

async function markManualArtifactGraded(manager: import("typeorm").EntityManager, grade: EduGrade) {
  if (grade.task?.taskMode !== "MANUAL") return;
  const repo = manager.getRepository(ManualSubmission);
  const artifact = await repo.findOneBy({ task: { id: grade.task.id }, student: { id: grade.student.id } });
  if (artifact) await repo.update(artifact.id, { status: "GRADED" });
}

router.post("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_GRADE" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const taskId = requireGradebookId(req.params.taskId);
    const studentId = requireGradebookId(req.params.studentId);
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

    let task = await topicTaskRepo()
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

    const classId = task.topic.class!.id;
    const { grade, student, wasExistingGrade, currentTask } = await withStudentGradeWrite(studentId, classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, student) => {
      const currentTask = await manager.getRepository(TopicTask).findOne({ where: { id: taskId, topic: { class: { id: classId } } }, relations: ["topic", "topic.class", "controlWork"] });
      if (!currentTask) throw new HttpError(409, "TASK_CHANGED");
      const repo = manager.getRepository(EduGrade);
      let grade = await repo.createQueryBuilder("grade").where("grade.student_id = :studentId", { studentId })
        .andWhere("grade.topic_task_id = :taskId", { taskId }).orderBy("grade.created_at", "DESC").addOrderBy("grade.id", "DESC").setLock("pessimistic_write").getOne();
      requireReviewRevision(parsedBody.data.expectedRevision, grade ? gradeReviewRevision(grade) : emptyReviewRevision("task", studentId, taskId));
      const wasExistingGrade = Boolean(grade);
      if (grade) {
        const patch = { total: normalizedTotal, isManuallyGraded: true, isCompleted: true, rubricScores: null, score: null, maxScore: null, ...(feedback !== undefined ? { feedback: feedback || null } : {}) };
        await repo.update(grade.id, patch); Object.assign(grade, patch);
      } else {
        grade = await repo.save(repo.create({ student, topicTask: currentTask, total: normalizedTotal, feedback: feedback || null, isManuallyGraded: true, isCompleted: true, testsPassed: 0, testsTotal: 0 }));
      }
      grade.student = student; grade.topicTask = currentTask;
      await recalculateControl(manager, grade);
      return { grade, student, wasExistingGrade, currentTask };
    });
    task = currentTask;

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
      feedback: grade.feedback || null,
      className: task.topic.class?.name ?? null,
      gradingSystem: task.topic.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(task.topic.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });

  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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

    const taskId = requireGradebookId(req.params.taskId);
    const studentId = requireGradebookId(req.params.studentId);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const task = await topicTaskRepo()
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .leftJoinAndSelect("task.controlWork", "controlWork")
      .where("task.id = :taskId", { taskId })
      .getOne();

    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

    const taskClassAccess = task.topic.class
      ? await authorizeClassForReq(req, task.topic.class.id, "GRADE_EDIT")
      : null;
    if (!taskClassAccess || !taskClassAccess.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const deleted = await withStudentGradeWrite(studentId, task.topic.class!.id, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, student) => {
      const currentTask = await manager.getRepository(TopicTask).findOne({ where: { id: taskId, topic: { class: { id: student.class.id } } }, relations: ["controlWork"] });
      if (!currentTask) throw new HttpError(409, "TASK_CHANGED");
      const repo = manager.getRepository(EduGrade);
      const existing = await repo.findBy({ student: { id: studentId }, topicTask: { id: taskId } });
      if (existing.length) await repo.delete(existing.map(grade => grade.id));
      await recalculateControl(manager, { student, topicTask: currentTask } as EduGrade);
      return existing.length;
    });
    return res.json({ message: deleted ? "GRADE_DELETED" : "NO_GRADES_TO_DELETE", deleted });
  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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
      .leftJoin("class.teachers", "assignedTeacher")
      .where("(class.teacher_id = :teacherId OR assignedTeacher.id = :teacherId)", { teacherId: user.id })
      .distinct(true)
      .getRawMany();
    const studentIds = studentIdRows.map(r => Number(r.id));
    if (studentIds.length === 0) {
      return res.json({ pendingReviews: [] });
    }

    const pendingGrades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoinAndSelect("grade.task", "task")
      .leftJoinAndSelect("grade.topicTask", "topicTask")
      .leftJoinAndSelect("topicTask.topic", "topicTaskTopic")
      .leftJoinAndSelect("topicTaskTopic.class", "topicTaskClass")
      .leftJoinAndSelect("task.lesson", "lesson")
      .leftJoinAndSelect("lesson.class", "lessonClass")
      .leftJoinAndSelect("grade.student", "student")
      .where("grade.student_id IN (:...studentIds)", { studentIds })
      .andWhere("grade.is_manually_graded = :isManuallyGraded", { isManuallyGraded: false })
      .andWhere("(grade.total IS NULL OR grade.total = 0)")
      .orderBy("grade.created_at", "DESC")
      .getMany();

    const pendingReviews = pendingGrades.map(grade => {
      const taskClass = (grade).task?.lesson?.class;
      const topicClass = (grade).topicTask?.topic?.class;
      const reviewClass = taskClass || topicClass || null;
      return ({
        gradeId: grade.id,
        classId: reviewClass?.id ?? null,
        className: reviewClass?.name ?? null,
        student: {
          id: (grade).student.id,
          firstName: (grade).student.firstName,
          lastName: (grade).student.lastName,
          middleName: (grade).student.middleName || undefined,
          email: (grade).student.email
        },
        task: (grade).task
          ? {
              id: (grade).task.id,
              title: (grade).task.title,
              rubric: normalizeRubric((grade).task.rubric),
              lesson: (grade).task.lesson
                ? {
                    id: (grade).task.lesson.id,
                    title: (grade).task.lesson.title,
                    type: (grade).task.lesson.type
                  }
                : undefined
            }
          : (grade).topicTask
            ? {
                id: (grade).topicTask.id,
                title: (grade).topicTask.title,
                lesson: undefined
              }
            : null,
        submittedCode: grade.submittedCode,
        submittedAt: grade.createdAt.toISOString(),
        system: (grade).task ? ("old" as const) : ("new" as const)
      });
    });

    res.json({ pendingReviews });
  } catch (error: unknown) {
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

    const controlWorkId = requireGradebookId(req.params.controlWorkId);
    const studentId = requireGradebookId(req.params.studentId);
    if (isNaN(controlWorkId) || isNaN(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const parsedBody = controlWorkGradeBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      const msg = messageForGradeBodyError(parsedBody.error, "GRADE_REQUIRED", "INVALID_GRADE_RANGE");
      return res.status(400).json({ message: msg });
    }

    const normalizedGrade = parsedBody.data.useCalculated === true ? null : clampGradeToInt(parsedBody.data.grade);

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

    const { student, summaryGrade, wasExistingSummaryGrade } = await withStudentGradeWrite(studentId, controlWork.topic.class.id, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, student) => {
      const currentControl = await manager.getRepository(ControlWork).findOne({ where: { id: controlWorkId, topic: { class: { id: student.class.id } } }, relations: ["topic"] });
      if (!currentControl) throw new HttpError(409, "TASK_CHANGED");
      const repo = manager.getRepository(SummaryGrade);
      let summaryGrade = await repo.findOne({ where: { student: { id: studentId }, controlWork: { id: controlWorkId } }, order: { createdAt: "DESC", id: "DESC" } });
      requireReviewRevision(parsedBody.data.expectedRevision, summaryGrade ? summaryReviewRevision(summaryGrade) : emptyReviewRevision("control", studentId, controlWorkId));
      const wasExistingSummaryGrade = Boolean(summaryGrade);
      if (normalizedGrade === null) {
        if (summaryGrade) await repo.update(summaryGrade.id, { manualOverrideGrade: null });
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, student.id, null);
      } else {
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, student.id, null);
        summaryGrade = await repo.findOne({ where: { student: { id: studentId }, controlWork: { id: controlWorkId } }, order: { createdAt: "DESC", id: "DESC" } });
        if (summaryGrade) await repo.update(summaryGrade.id, { grade: normalizedGrade, manualOverrideGrade: normalizedGrade });
        else await repo.save(repo.create({ student, class: student.class, topic: currentControl.topic, controlWork: currentControl, grade: normalizedGrade, manualOverrideGrade: normalizedGrade, calculatedGrade: null, assessmentType: AssessmentType.CONTROL, name: currentControl.title || 'Control #' + controlWorkId }));
      }
      summaryGrade = await repo.findOne({ where: { student: { id: studentId }, controlWork: { id: controlWorkId } }, order: { createdAt: "DESC", id: "DESC" } });
      return { student, summaryGrade, wasExistingSummaryGrade };
    });

    res.json({ message: "GRADE_SAVED", summaryGrade: summaryGrade ? { id: summaryGrade.id, grade: summaryGrade.grade, manualOverrideGrade: summaryGrade.manualOverrideGrade, calculatedGrade: summaryGrade.calculatedGrade } : null });

    if (summaryGrade) void notifyStudentGradeChange({
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
      grade: Number(summaryGrade.grade),
      className: controlWork.topic.class?.name ?? null,
      gradingSystem: controlWork.topic.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(controlWork.topic.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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
  } catch (error: unknown) {
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
      where: { student: { id: studentId }, topicTask: { id: taskId } },
      order: { createdAt: "DESC" }
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
      language: topicTask.topic.language,
      taskTitle: topicTask.title,
      taskDescription: topicTask.description,
      template: topicTask.template,
      submittedCode: latest.submittedCode,
      requestId: (req).requestId,
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
  } catch (error: unknown) {
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
      where: { student: { id: studentId }, controlWork: { id: controlWorkId } }
    });

    let quizReview: unknown = null;
    if ((summaryGrade)?.quizResultsJson) {
      try {
        quizReview = JSON.parse((summaryGrade).quizResultsJson);
      } catch {
        quizReview = null;
      }
    }

    const practiceTasks = await topicTaskRepo().find({
      where: {
        topic: { id: controlWork.topic.id },
        type: "CONTROL",
        controlWork: { id: controlWorkId }
      },
      order: { order: "ASC", id: "ASC" }
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
            grade: (summaryGrade).grade,
            theoryGrade: (summaryGrade).theoryGrade,
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
  } catch (error: unknown) {
    logger.error("Error getting control work student work", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/grades/:gradeId/review", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_GRADES" });
    const grade = await withGradeWrite(requireGradebookId(req.params.gradeId), { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (_manager, grade) => grade);
    res.set("Cache-Control", "no-store");
    return res.json({ grade: { id: grade.id, total: grade.total, feedback: grade.feedback, revision: gradeReviewRevision(grade) } });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/grades/:gradeId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_GRADES" });

    const gradeId = requireGradebookId(req.params.gradeId);
    if (isNaN(gradeId)) {
      return res.status(400).json({ message: "INVALID_GRADE_ID" });
    }

    const parsedBody = updateGradeBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      // Keep legacy code used by clients for invalid manual update.
      return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    }
    const { total, feedback } = parsedBody.data;

    const updated = await withGradeWrite(gradeId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, grade) => {
      requireReviewRevision(parsedBody.data.expectedRevision, gradeReviewRevision(grade));
      if (parsedBody.data.latestOnly && (grade.topicTask || grade.task)) {
        const latest = await manager.getRepository(EduGrade).findOne({ where: { student: { id: grade.student.id }, ...(grade.topicTask ? { topicTask: { id: grade.topicTask.id } } : { task: { id: grade.task!.id } }) }, order: { createdAt: "DESC", id: "DESC" } });
        if (latest?.id !== grade.id) throw new HttpError(409, "GRADE_CHANGED");
      }
      const patch: Partial<Pick<EduGrade, "total" | "feedback" | "isManuallyGraded" | "isCompleted" | "rubricScores" | "score" | "maxScore">> = {};
      if (total !== undefined) Object.assign(patch, { total: requireRawGrade(total), isManuallyGraded: true, isCompleted: true, rubricScores: null, score: null, maxScore: null });
      if (feedback !== undefined) patch.feedback = feedback || null;
      await manager.getRepository(EduGrade).update(grade.id, patch); Object.assign(grade, patch);
      if (total !== undefined) { await markManualArtifactGraded(manager, grade); await recalculateControl(manager, grade); }
      return grade;
    });

    res.json({
      message: "GRADE_UPDATED",
      grade: { id: updated.id, total: updated.total!, feedback: updated.feedback || undefined, isManuallyGraded: updated.isManuallyGraded }
    });

    if (updated.total !== null) void notifyStudentGradeChange({
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
      grade: updated.total!,
      feedback: updated.feedback || null,
      className: updated.student.class?.name ?? null,
      gradingSystem: updated.student.class?.gradingSystem ?? null,
      gradeScaleMode: normalizeScaleMode(updated.student.class?.gradeScaleMode),
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });
  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    if (errorMessage(error) === "GRADE_NOT_FOUND") {
      return res.status(404).json({ message: "GRADE_NOT_FOUND" });
    }
    if (errorMessage(error) === "ACCESS_DENIED") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    if (errorMessage(error) === "INVALID_GRADE_VALUE") {
      return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    }

    logger.error("Error updating grade", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// --- Rubric grading (Tier 1) ---

async function ownedEduTaskOr403(req: AuthRequest, res: Response, capability: "CONTENT_AUTHOR" | "GRADE_EDIT" = "CONTENT_AUTHOR"): Promise<EduTask | null> {
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
    ? await authorizeClassForReq(req, task.lesson.class.id, capability)
    : null;
  if (!access || !access.allowed) {
    res.status(403).json({ message: "ACCESS_DENIED" });
    return null;
  }
  return task;
}

// Read a task's rubric (teacher).
async function rubricHasWork(manager: import("typeorm").EntityManager, task: EduTask): Promise<boolean> {
  return Boolean(await manager.getRepository(EduGrade).countBy({ task: { id: task.id } })
    || await manager.getRepository(ManualSubmission).countBy({ task: { id: task.id } })
    || (task.lesson.type === "CONTROL" && await manager.getRepository(LessonAttempt).countBy({ lesson: { id: task.lesson.id } })));
}

router.get("/tasks/:taskId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const task = await ownedEduTaskOr403(req, res, "GRADE_EDIT");
    if (!task) return;
    const editAccess = await authorizeClassForReq(req, task.lesson.class.id, "CONTENT_AUTHOR");
    return res.json({ rubric: normalizeRubric(task.rubric), locked: await rubricHasWork(AppDataSource.manager, task), canEdit: Boolean(editAccess?.allowed) });
  } catch (error: unknown) {
    logger.error("[edu/rubric] get failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Define/replace a task's rubric (teacher).
router.put("/tasks/:taskId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const task = await ownedEduTaskOr403(req, res);
    if (!task) return;
    const rubric = validateRubricDefinition(req.body?.rubric);
    if (rubric === null) throw new HttpError(400, "INVALID_RUBRIC");
    await AppDataSource.transaction("READ COMMITTED", async manager => {
      await lockClassActor(manager, task.lesson.class.id, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, "CONTENT_AUTHOR");
      const repo = manager.getRepository(EduTask);
      const current = await repo.findOne({ where: { id: task.id }, lock: { mode: "pessimistic_write" } });
      if (!current) throw new HttpError(404, "TASK_NOT_FOUND");
      const currentTask = await repo.findOne({ where: { id: task.id, lesson: { class: { id: task.lesson.class.id } } }, relations: ["lesson"] });
      if (!currentTask) throw new HttpError(409, "TASK_CHANGED");
      if (JSON.stringify(normalizeRubric(current.rubric)) === JSON.stringify(rubric)) return;
      if (await rubricHasWork(manager, currentTask)) throw new HttpError(409, "RUBRIC_LOCKED");
      await repo.update(task.id, { rubric: rubric.length ? rubric : null });
    });
    return res.json({ rubric });
  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    logger.error("[edu/rubric] put failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Grade a submission by rubric: total is derived from per-criterion scores.
router.post("/grades/:gradeId/rubric", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_GRADES" });
    const gradeId = requireGradebookId(req.params.gradeId);
    if (isNaN(gradeId)) return res.status(400).json({ message: "INVALID_GRADE_ID" });

    const parsed = z.object({
      scores: z.record(z.string(), z.number().finite()),
      feedback: z.string().max(20_000).optional(),
      expectedRevision: z.unknown().optional()
    }).safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });

    const { grade, result } = await withGradeWrite(gradeId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, grade) => {
      requireReviewRevision(parsed.data.expectedRevision, gradeReviewRevision(grade));
      const rubric = normalizeRubric(grade.task?.rubric);
      if (!rubric.length) throw new HttpError(400, "NO_RUBRIC");
      if (!validateRubricScores(rubric, parsed.data.scores)) throw new HttpError(400, "INVALID_RUBRIC_SCORES");
      const result = computeRubricTotal(rubric, parsed.data.scores);
      const patch = { total: result.percent, rubricScores: JSON.stringify(parsed.data.scores), isManuallyGraded: true, isCompleted: true, score: null, maxScore: null, ...(parsed.data.feedback !== undefined ? { feedback: parsed.data.feedback || null } : {}) };
      await manager.getRepository(EduGrade).update(grade.id, patch); Object.assign(grade, patch);
      await markManualArtifactGraded(manager, grade);
      await recalculateControl(manager, grade);
      return { grade, result };
    });

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
  } catch (error: unknown) {
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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
        language: grade.topicTask?.topic?.language || "PYTHON",
        taskDescription: grade.task?.description || undefined
      });
      return res.json({ review });
    } catch (e: unknown) {
      if (errorMessage(e) === "AI_UNAVAILABLE") {
        return res.status(503).json({ message: "AI_UNAVAILABLE" });
      }
      throw e;
    }
  } catch (error: unknown) {
    logger.error("[edu/aiCodeReview] route failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
