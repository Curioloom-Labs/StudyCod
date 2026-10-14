import { Router, Response, type NextFunction, type Request } from "express";
import { HttpError } from "../../utils/httpError";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { In } from "typeorm";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { writeSensitiveStudentRead } from "../../services/audit/auditLog";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import {
  validateManualSubmission,
  upsertSubmission,
  getSubmission,
  listSubmissionsForTask,
  gradeManualSubmission,
  manualSubmissionRevision
} from "../../services/edu/manualSubmissions";
import { logger } from "../../utils/logger";
import { UPLOADS_ROOT } from "../../config/storagePaths";
import { assertCoursePracticeActive } from "../../services/edu/courseLessonAttempt";

const router = Router();
for (const name of ["taskId", "studentId"]) {
  router.param(name, (_req, res, next, value) => {
    if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) { res.status(400).json({ message: "INVALID_ID" }); return; }
    next();
  });
}
const taskRepo = () => AppDataSource.getRepository(EduTask);
const studentRepo = () => AppDataSource.getRepository(Student);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);

const MANUAL_DIR = path.join(UPLOADS_ROOT, "manual-submissions");
const ALLOWED_EXT = new Set([".pdf", ".txt", ".md", ".zip", ".png", ".jpg", ".jpeg", ".docx", ".py", ".java", ".cpp", ".js"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

type ManualTaskRequest = AuthRequest & {
  file?: Express.Multer.File;
};

/** Load a MANUAL task with its class/teacher; null if not found or not MANUAL. */
async function loadManualTask(taskId: number): Promise<EduTask | null> {
  if (!Number.isSafeInteger(taskId) || taskId <= 0) return null;
  const task = await taskRepo().findOne({
    where: { id: taskId },
    relations: ["lesson", "lesson.class", "lesson.class.teacher"]
  });
  if (!task || task.taskMode !== "MANUAL") return null;
  return task;
}

// Student submits (or resubmits) text and/or a file for a manual task.
router.post("/manual-tasks/:taskId/submit", authRequired, (req: ManualTaskRequest, res: Response, next: NextFunction) => {
  upload.single("file")(req as unknown as Request, res, (err?: unknown) => {
    if (err) {
      if (typeof err === "object" && err !== null && "code" in err && String(err.code) === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "FILE_TOO_LARGE" });
      }
      return res.status(400).json({ message: "INVALID_UPLOAD" });
    }
    return next();
  });
}, async (req: ManualTaskRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS" });
    }
    const taskId = Number(req.params.taskId);
    const task = await loadManualTask(taskId);
    if (!task) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== task.lesson?.class?.id) {
      return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
    }
    await assertCoursePracticeActive(task.lesson, student.id);
    if (task.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (task.deadline && new Date() > new Date(task.deadline)) return res.status(403).json({ message: "DEADLINE_PASSED" });
    const previous = await getSubmission(task.id, student.id);
    if (previous?.status === "GRADED") return res.status(409).json({ message: "SUBMISSION_ALREADY_GRADED" });

    const file = req.file;
    let fileStorageKey: string | undefined;
    let fileName: string | undefined;
    if (file && file.buffer && file.size) {
      const ext = path.extname(String(file.originalname || "")).toLowerCase();
      if (ext && !ALLOWED_EXT.has(ext)) return res.status(400).json({ message: "UNSUPPORTED_FILE_TYPE" });
      const token = crypto.randomBytes(12).toString("hex");
      const stored = `${task.id}_${student.id}_${Date.now()}_${token}${ext}`;
      fs.mkdirSync(MANUAL_DIR, { recursive: true });
      fs.writeFileSync(path.join(MANUAL_DIR, stored), file.buffer);
      fileStorageKey = `manual-submissions/${stored}`;
      fileName = String(file.originalname || stored).slice(0, 255);
    }

    const text = typeof req.body?.text === "string" ? req.body.text : null;
    const validation = validateManualSubmission({ text, fileStorageKey: fileStorageKey ?? previous?.fileStorageKey });
    if (!validation.ok) {
      if (fileStorageKey) fs.rmSync(path.join(MANUAL_DIR, path.basename(fileStorageKey)), { force: true });
      return res.status(400).json({ message: validation.error });
    }

    let submission;
    let replacedFileStorageKey: string | null = null;
    try {
      ({ submission, replacedFileStorageKey } = await upsertSubmission(task.id, student.id, { text, fileStorageKey, fileName }));
    } catch (error) {
      if (fileStorageKey) fs.rmSync(path.join(MANUAL_DIR, path.basename(fileStorageKey)), { force: true });
      throw error;
    }
    if (replacedFileStorageKey) {
      try { fs.rmSync(path.join(MANUAL_DIR, path.basename(replacedFileStorageKey)), { force: true }); }
      catch (error) { logger.warn("[edu/manualTasks] replaced attachment cleanup failed", { requestId: req.requestId, err: error }); }
    }
    return res.status(201).json({
      submission: {
        id: submission.id,
        revision: manualSubmissionRevision(submission),
        status: submission.status,
        hasFile: Boolean(submission.fileStorageKey),
        fileName: submission.fileName ?? null,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "SUBMISSION_ALREADY_GRADED") return res.status(409).json({ message: error.message });
    if (error instanceof Error && ["EMPTY_SUBMISSION", "TEXT_TOO_LONG"].includes(error.message)) return res.status(400).json({ message: error.message });
    if (error instanceof Error && ["ATTEMPT_NOT_STARTED", "CONTROL_WORK_COMPLETED", "QUIZ_REQUIRED", "TASK_IS_CLOSED", "DEADLINE_PASSED"].includes(error.message)) return res.status(403).json({ message: error.message });
    logger.error("[edu/manualTasks] submit failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Student fetches their own submission.
router.get("/manual-tasks/:taskId/submission", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) return res.status(403).json({ message: "ONLY_STUDENTS" });
    const taskId = Number(req.params.taskId);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: "INVALID_ID" });
    const task = await loadManualTask(taskId);
    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!task || !student || student.class?.id !== task.lesson?.class?.id) return res.status(403).json({ message: "ACCESS_DENIED" });
    const submission = await getSubmission(taskId, req.studentId);
    let submissionAllowed = true;
    let submissionBlockedReason: string | null = null;
    try { await assertCoursePracticeActive(task.lesson, req.studentId); }
    catch (error) { submissionAllowed = false; submissionBlockedReason = (error as Error).message; }
    const taskInfo = { submissionAllowed, submissionBlockedReason, id: task.id, title: task.title, description: task.description, rubric: task.rubric ?? [],
      deadline: task.deadline ?? null, isClosed: task.isClosed, lessonId: task.lesson.id };
    if (!submission) return res.json({ task: taskInfo, submission: null });
    const grade = submission.status === "GRADED" ? await gradeRepo().findOne({ where: { task: { id: taskId }, student: { id: req.studentId } }, order: { createdAt: "DESC", id: "DESC" } }) : null;
    return res.json({
      task: taskInfo,
      submission: {
        revision: manualSubmissionRevision(submission),
        grade: grade ? { score: grade.score, maxScore: grade.maxScore, total: grade.total, feedback: grade.feedback } : null,
        text: submission.text ?? null,
        hasFile: Boolean(submission.fileStorageKey),
        fileName: submission.fileName ?? null,
        status: submission.status,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error: unknown) {
    logger.error("[edu/manualTasks] get submission failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher lists all submissions for a manual task (their class only).
router.get("/manual-tasks/:taskId/submissions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const taskId = Number(req.params.taskId);
    const task = await loadManualTask(taskId);
    if (!task) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });
    const taskClassId = task.lesson?.class?.id;
    const access = taskClassId ? await authorizeClassForReq(req, taskClassId, "STUDENT_DATA_VIEW") : null;
    if (!access || !access.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const submissions = await listSubmissionsForTask(task.id);
    await writeSensitiveStudentRead({
      actorType: "USER",
      actorId: req.principalId ?? req.userId ?? req.studentId ?? null,
      action: "student-data.read.work",
      classId: taskClassId ?? null,
      orgId: access.cls.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip,
      metadata: { taskId: task.id, studentCount: submissions.length }
    });
    const studentIds = submissions.map((submission) => submission.studentId);
    const grades = studentIds.length
      ? await gradeRepo().find({ where: { task: { id: task.id }, student: { id: In(studentIds) } }, relations: ["student"], order: { createdAt: "ASC", id: "ASC" } })
      : [];
    const gradeByStudent = new Map(grades.map((grade) => [grade.student?.id, grade]));
    return res.json({
      submissions: submissions.map((s) => ({
        studentId: s.studentId,
        revision: manualSubmissionRevision(s, gradeByStudent.get(s.studentId)),
        studentName: `${s.student?.lastName ?? ""} ${s.student?.firstName ?? ""}`.trim(),
        text: s.text ?? null,
        hasFile: Boolean(s.fileStorageKey),
        fileName: s.fileName ?? null,
        status: s.status,
        updatedAt: s.updatedAt,
        grade: gradeByStudent.has(s.studentId)
          ? {
              total: gradeByStudent.get(s.studentId)?.total ?? null,
              score: gradeByStudent.get(s.studentId)?.score ?? null,
              maxScore: gradeByStudent.get(s.studentId)?.maxScore ?? null,
              feedback: gradeByStudent.get(s.studentId)?.feedback ?? null
            }
          : null
      }))
    });
  } catch (error: unknown) {
    logger.error("[edu/manualTasks] list submissions failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher grades a manual submission and creates/updates the EduGrade used by
// the journal. A manual artifact is not useful if it can only be viewed.
router.post("/manual-tasks/:taskId/submissions/:studentId/grade", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) return res.status(403).json({ message: "ONLY_TEACHERS" });
    const taskId = Number(req.params.taskId);
    const studentId = Number(req.params.studentId);
    if (!Number.isSafeInteger(taskId) || taskId <= 0 || !Number.isSafeInteger(studentId) || studentId <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const task = await loadManualTask(taskId);
    if (!task?.lesson?.class) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });
    const access = await authorizeClassForReq(req, task.lesson.class.id, "GRADE_EDIT");
    if (!access?.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    const submission = await getSubmission(taskId, studentId);
    if (!submission) return res.status(404).json({ message: "SUBMISSION_NOT_FOUND" });
    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || student.class?.id !== task.lesson.class.id) return res.status(403).json({ message: "STUDENT_NOT_IN_CLASS" });
    const maxScore = req.body?.maxScore ?? ((task.rubric || []).reduce((sum, item) => sum + Number(item.maxPoints || 0), 0) || 100);
    const total = Number(req.body?.total);
    if (typeof req.body?.total !== "number" || typeof maxScore !== "number" || !Number.isSafeInteger(maxScore) || maxScore <= 0 || maxScore > 100_000 || !Number.isSafeInteger(total) || total < 0 || total > maxScore) return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    const { grade, revision } = await gradeManualSubmission(task, student, {
      total, maxScore,
      feedback: typeof req.body?.feedback === "string" ? req.body.feedback.slice(0, 10_000) : null,
      expectedRevision: typeof req.body?.expectedRevision === "string" ? req.body.expectedRevision : undefined,
    }, { userId: req.userId!, sessionVersion: req.eduSessionVersion });
    return res.json({ revision, grade: { id: grade.id, total: grade.total, score: grade.score, maxScore: grade.maxScore, feedback: grade.feedback, isManuallyGraded: true } });
  } catch (error: unknown) {
    if (error instanceof Error && ["SUBMISSION_CHANGED", "RUBRIC_CHANGED"].includes(error.message)) return res.status(409).json({ message: error.message });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    if (error instanceof Error && error.message === "SUBMISSION_NOT_FOUND") return res.status(404).json({ message: error.message });
    logger.error("[edu/manualTasks] grade failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Download a submitted artifact only for the student or an authorized teacher.
router.get("/manual-tasks/:taskId/submissions/:studentId/file", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = Number(req.params.taskId);
    const studentId = Number(req.params.studentId);
    const task = await loadManualTask(taskId);
    if (!task?.lesson?.class) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });
    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || student.class?.id !== task.lesson.class.id) return res.status(404).json({ message: "SUBMISSION_NOT_FOUND" });
    if (req.studentId) {
      if (req.studentId !== studentId) return res.status(403).json({ message: "ACCESS_DENIED" });
    } else {
      const access = await authorizeClassForReq(req, task.lesson.class.id, "STUDENT_DATA_VIEW");
      if (!access?.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    const submission = await getSubmission(taskId, studentId);
    if (!submission?.fileStorageKey) return res.status(404).json({ message: "FILE_NOT_FOUND" });
    await writeSensitiveStudentRead({
      actorType: req.userType === "STUDENT" ? "STUDENT" : "USER",
      actorId: req.principalId ?? req.userId ?? req.studentId ?? null,
      action: "student-data.read.file",
      studentId,
      classId: task.lesson.class.id,
      orgId: task.lesson.class.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip,
      metadata: { taskId }
    });
    const relative = submission.fileStorageKey.replace(/^manual-submissions[\\/]/, "");
    const root = path.resolve(MANUAL_DIR);
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`)) return res.status(400).json({ message: "INVALID_FILE" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "FILE_NOT_FOUND" });
    return res.download(filePath, submission.fileName || path.basename(filePath));
  } catch (error: unknown) {
    logger.error("[edu/manualTasks] file download failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
