import { Router, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { In } from "typeorm";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import {
  validateManualSubmission,
  upsertSubmission,
  getSubmission,
  listSubmissionsForTask,
  markGraded
} from "../../services/edu/manualSubmissions";
import { logger } from "../../utils/logger";

const router = Router();
const taskRepo = () => AppDataSource.getRepository(EduTask);
const studentRepo = () => AppDataSource.getRepository(Student);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);

const UPLOADS_ROOT = process.env.UPLOADS_DIR ? String(process.env.UPLOADS_DIR) : path.resolve(process.cwd(), "uploads");
const MANUAL_DIR = path.join(UPLOADS_ROOT, "manual-submissions");
const ALLOWED_EXT = new Set([".pdf", ".txt", ".md", ".zip", ".png", ".jpg", ".jpeg", ".docx", ".py", ".java", ".cpp", ".js"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

/** Load a MANUAL task with its class/teacher; null if not found or not MANUAL. */
async function loadManualTask(taskId: number): Promise<EduTask | null> {
  if (!Number.isFinite(taskId)) return null;
  const task = await taskRepo().findOne({
    where: { id: taskId },
    relations: ["lesson", "lesson.class", "lesson.class.teacher"]
  });
  if (!task || task.taskMode !== "MANUAL") return null;
  return task;
}

// Student submits (or resubmits) text and/or a file for a manual task.
router.post("/manual-tasks/:taskId/submit", authRequired, (req: AuthRequest, res: Response, next) => {
  upload.single("file")(req as any, res as any, (err: any) => {
    if (err) {
      if (String(err?.code || "") === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "FILE_TOO_LARGE" });
      return res.status(400).json({ message: "INVALID_UPLOAD" });
    }
    return next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS" });
    }
    const taskId = parseInt(req.params.taskId, 10);
    const task = await loadManualTask(taskId);
    if (!task) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== task.lesson?.class?.id) {
      return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
    }
    if (task.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (task.deadline && new Date() > new Date(task.deadline)) return res.status(403).json({ message: "DEADLINE_PASSED" });
    const previous = await getSubmission(task.id, student.id);
    if (previous?.status === "GRADED") return res.status(409).json({ message: "SUBMISSION_ALREADY_GRADED" });

    const file = (req as any).file as Express.Multer.File | undefined;
    let fileStorageKey: string | null = null;
    let fileName: string | null = null;
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
    const validation = validateManualSubmission({ text, fileStorageKey });
    if (!validation.ok) {
      if (fileStorageKey) fs.rmSync(path.join(MANUAL_DIR, path.basename(fileStorageKey)), { force: true });
      return res.status(400).json({ message: validation.error });
    }

    let submission;
    try {
      submission = await upsertSubmission(task.id, student.id, { text, fileStorageKey, fileName });
    } catch (error) {
      if (fileStorageKey) fs.rmSync(path.join(MANUAL_DIR, path.basename(fileStorageKey)), { force: true });
      throw error;
    }
    if (previous?.fileStorageKey && previous.fileStorageKey !== submission.fileStorageKey) {
      fs.rmSync(path.join(MANUAL_DIR, path.basename(previous.fileStorageKey)), { force: true });
    }
    return res.status(201).json({
      submission: {
        id: submission.id,
        status: submission.status,
        hasFile: Boolean(submission.fileStorageKey),
        fileName: submission.fileName ?? null,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error: any) {
    logger.error("[edu/manualTasks] submit failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Student fetches their own submission.
router.get("/manual-tasks/:taskId/submission", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) return res.status(403).json({ message: "ONLY_STUDENTS" });
    const taskId = parseInt(req.params.taskId, 10);
    if (!Number.isFinite(taskId)) return res.status(400).json({ message: "INVALID_ID" });
    const task = await loadManualTask(taskId);
    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!task || !student || student.class?.id !== task.lesson?.class?.id) return res.status(403).json({ message: "ACCESS_DENIED" });
    const submission = await getSubmission(taskId, req.studentId);
    if (!submission) return res.json({ submission: null });
    return res.json({
      submission: {
        text: submission.text ?? null,
        hasFile: Boolean(submission.fileStorageKey),
        fileName: submission.fileName ?? null,
        status: submission.status,
        updatedAt: submission.updatedAt
      }
    });
  } catch (error: any) {
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
    const taskId = parseInt(req.params.taskId, 10);
    const task = await loadManualTask(taskId);
    if (!task) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });
    const taskClassId = task.lesson?.class?.id;
    const access = taskClassId ? await authorizeClassForReq(req, taskClassId, "STUDENT_DATA_VIEW") : null;
    if (!access || !access.allowed) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const submissions = await listSubmissionsForTask(task.id);
    const studentIds = submissions.map((submission) => submission.studentId);
    const grades = studentIds.length
      ? await gradeRepo().find({ where: { task: { id: task.id }, student: { id: In(studentIds) } }, relations: ["student"] })
      : [];
    const gradeByStudent = new Map(grades.map((grade) => [grade.student?.id, grade]));
    return res.json({
      submissions: submissions.map((s) => ({
        studentId: s.studentId,
        studentName: `${s.student?.lastName ?? ""} ${s.student?.firstName ?? ""}`.trim(),
        text: s.text ?? null,
        hasFile: Boolean(s.fileStorageKey),
        fileName: s.fileName ?? null,
        status: s.status,
        updatedAt: s.updatedAt,
        grade: gradeByStudent.has(s.studentId)
          ? {
              total: gradeByStudent.get(s.studentId)?.total ?? null,
              maxScore: gradeByStudent.get(s.studentId)?.maxScore ?? null,
              feedback: gradeByStudent.get(s.studentId)?.feedback ?? null
            }
          : null
      }))
    });
  } catch (error: any) {
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
    if (!Number.isInteger(taskId) || !Number.isInteger(studentId)) return res.status(400).json({ message: "INVALID_ID" });
    const task = await loadManualTask(taskId);
    if (!task?.lesson?.class) return res.status(404).json({ message: "MANUAL_TASK_NOT_FOUND" });
    const access = await authorizeClassForReq(req, task.lesson.class.id, "GRADE_EDIT");
    if (!access?.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    const submission = await getSubmission(taskId, studentId);
    if (!submission) return res.status(404).json({ message: "SUBMISSION_NOT_FOUND" });
    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || student.class?.id !== task.lesson.class.id) return res.status(403).json({ message: "STUDENT_NOT_IN_CLASS" });
    const maxScore = Math.max(1, Number(req.body?.maxScore) || (task.rubric || []).reduce((sum, item) => sum + Number(item.maxPoints || 0), 0) || 100);
    const total = Number(req.body?.total);
    if (!Number.isFinite(total) || total < 0 || total > maxScore) return res.status(400).json({ message: "INVALID_GRADE_VALUE" });
    let grade = await gradeRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } } });
    if (!grade) grade = gradeRepo().create({ task: { id: taskId } as EduTask, student, testsPassed: 0, testsTotal: 0 });
    grade.total = Math.round(total);
    grade.maxScore = Math.round(maxScore);
    grade.score = Math.round(total);
    grade.feedback = typeof req.body?.feedback === "string" ? req.body.feedback.slice(0, 10_000) : null;
    grade.isManuallyGraded = true;
    grade.isCompleted = true;
    await gradeRepo().save(grade);
    await markGraded(taskId, studentId);
    return res.json({ grade: { id: grade.id, total: grade.total, maxScore: grade.maxScore, feedback: grade.feedback, isManuallyGraded: true } });
  } catch (error: any) {
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
    const relative = submission.fileStorageKey.replace(/^manual-submissions[\\/]/, "");
    const root = path.resolve(MANUAL_DIR);
    const filePath = path.resolve(root, relative);
    if (!filePath.startsWith(`${root}${path.sep}`)) return res.status(400).json({ message: "INVALID_FILE" });
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "FILE_NOT_FOUND" });
    return res.download(filePath, submission.fileName || path.basename(filePath));
  } catch (error: any) {
    logger.error("[edu/manualTasks] file download failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
