import { Router, NextFunction, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import { TestData } from "../../entities/TestData";
import { executeCodeWithInput } from "../../services/codeExecutionService";
import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  validateWebTaskSubmission,
} from "../../services/webTaskValidationService";
import { encodeWebTaskPayload } from "../../utils/webTaskPayload";

/** Student-facing handlers for materialised course EduTasks.
 * The legacy router below serves TopicTask. Keeping this router first makes the
 * two storage models explicit and prevents course tasks from falling into the
 * legacy repository by accident.
 */
const router = Router();
const taskRepo = () => AppDataSource.getRepository(EduTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const studentRepo = () => AppDataSource.getRepository(Student);
const testRepo = () => AppDataSource.getRepository(TestData);

async function loadTask(taskId: number): Promise<EduTask | null> {
  if (!Number.isInteger(taskId)) return null;
  return taskRepo().findOne({
    where: { id: taskId },
    relations: ["lesson", "lesson.class", "lesson.class.teacher", "theory"],
  });
}

async function visibleTask(req: AuthRequest, taskId: number): Promise<{ task: EduTask; student: Student } | null> {
  if (req.userType !== "STUDENT" || !req.studentId) return null;
  const task = await loadTask(taskId);
  if (!task?.lesson?.class) return null;
  const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
  if (!student?.class || student.class.id !== task.lesson.class.id) return null;
  return { task, student };
}

function languageFor(task: EduTask): "JAVA" | "PYTHON" | "CPP" {
  return task.lesson.class.language;
}

function normalizedOutput(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

async function latestGrade(taskId: number, studentId: number): Promise<EduGrade | null> {
  return gradeRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } }, order: { createdAt: "DESC" } });
}

async function handleIfCourseTask(req: AuthRequest, res: Response, next: NextFunction, fn: (ctx: { task: EduTask; student: Student }) => Promise<unknown>) {
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return next();
  const task = await loadTask(taskId);
  if (!task) return next();
  const ctx = await visibleTask(req, taskId);
  // Without an explicit course source marker, let the legacy TopicTask router
  // handle a colliding numeric id that belongs to the student's class.
  if (!ctx) return String(req.query.source ?? "") === "course"
    ? res.status(403).json({ message: "ACCESS_DENIED" })
    : next();
  try {
    await fn(ctx);
  } catch (error: any) {
    const status = Number(error?.statusCode ?? error?.status ?? 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({ message: error?.message || "INTERNAL_SERVER_ERROR" });
  }
}

router.get("/tasks/:taskId", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    const grade = await latestGrade(task.id, student.id);
    const attemptsUsed = await gradeRepo().count({ where: { task: { id: task.id }, student: { id: student.id } } });
    const tests = await testRepo().count({ where: { task: { id: task.id } } });
    return res.json({ task: {
      id: task.id,
      title: task.title,
      description: task.description,
      template: task.template,
      taskMode: task.taskMode,
      webTemplateFiles: task.webTemplateFiles ?? null,
      webValidationRules: task.webValidationRules ?? null,
      language: languageFor(task),
      testDataCount: tests,
      savedCode: grade?.submittedCode ?? null,
      maxAttempts: task.maxAttempts,
      attemptsUsed,
      deadline: task.deadline ?? null,
      isClosed: task.isClosed,
      lesson: { id: task.lesson.id, title: task.lesson.title, type: task.lesson.type, hasTheory: task.lesson.hasTheory },
      hasGrade: Boolean(grade),
      grade: grade ? { id: grade.id, total: grade.total, testsPassed: grade.testsPassed, testsTotal: grade.testsTotal, isCompleted: grade.isCompleted, isManuallyGraded: grade.isManuallyGraded, feedback: grade.feedback } : null,
    }});
  });
});

router.post("/tasks/:taskId/run", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task }) => {
    if (task.taskMode !== "CODE") return res.status(400).json({ message: "TASK_IS_NOT_CODE" });
    const code = z.string().min(1).max(200_000).safeParse(req.body?.code);
    if (!code.success) return res.status(400).json({ message: "CODE_REQUIRED" });
    const result = await executeCodeWithInput(code.data, languageFor(task), String(req.body?.input ?? ""), 5000);
    return res.json({ output: result.stdout, stderr: result.stderr, success: result.success });
  });
});

router.post("/tasks/:taskId/submit", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    if (task.taskMode !== "CODE") return res.status(400).json({ message: "TASK_IS_NOT_CODE" });
    if (task.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (task.deadline && new Date() > new Date(task.deadline)) return res.status(403).json({ message: "DEADLINE_PASSED" });
    const code = z.string().min(1).max(200_000).safeParse(req.body?.code);
    if (!code.success) return res.status(400).json({ message: "CODE_REQUIRED" });
    const used = await gradeRepo().count({ where: { task: { id: task.id }, student: { id: student.id } } });
    if (used >= Math.max(1, task.maxAttempts)) return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    const tests = await testRepo().find({ where: { task: { id: task.id } }, order: { id: "ASC" } });
    if (!tests.length) {
      const execution = await executeCodeWithInput(code.data, languageFor(task), "", 10000);
      const passed = execution.success;
      const result = [{ testId: 0, passed, verdict: passed ? "AC" : "RE" }];
      const grade = await gradeRepo().save(gradeRepo().create({ task, student, total: passed ? 100 : 0, score: passed ? 100 : 0, maxScore: 100, testsPassed: passed ? 1 : 0, testsTotal: 1, submittedCode: code.data, testResults: JSON.stringify(result), isCompleted: passed, isManuallyGraded: false, feedback: "No authored tests; submission was executed successfully." }));
      return res.json({ grade: { id: grade.id, total: grade.total, testsPassed: grade.testsPassed, testsTotal: grade.testsTotal, isManuallyGraded: false, isCompleted: grade.isCompleted }, testResults: result, scoring: { score: grade.score ?? 0, maxScore: 100 } });
    }
    const results: Array<{ testId: number; passed: boolean; verdict: string }> = [];
    for (const test of tests) {
      const execution = await executeCodeWithInput(code.data, languageFor(task), test.input, 10000);
      const passed = execution.success && normalizedOutput(execution.stdout) === normalizedOutput(test.expectedOutput);
      results.push({ testId: test.id, passed, verdict: passed ? "AC" : execution.success ? "WA" : "RE" });
    }
    const passed = results.filter((item) => item.passed).length;
    const total = Math.round((passed / results.length) * 100);
    const grade = gradeRepo().create({ task, student, total, score: total, maxScore: 100, testsPassed: passed, testsTotal: results.length, submittedCode: code.data, testResults: JSON.stringify(results), isCompleted: passed === results.length, isManuallyGraded: false, feedback: null });
    const saved = await gradeRepo().save(grade);
    return res.json({ grade: { id: saved.id, total: saved.total, testsPassed: saved.testsPassed, testsTotal: saved.testsTotal, isManuallyGraded: false, isCompleted: saved.isCompleted }, testResults: results, scoring: { score: total, maxScore: 100 } });
  });
});

router.post("/tasks/:taskId/complete", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    const grade = await latestGrade(task.id, student.id);
    if (!grade) return res.status(400).json({ message: "NO_SUBMISSION" });
    grade.isCompleted = true;
    const saved = await gradeRepo().save(grade);
    return res.json({ grade: { id: saved.id, total: saved.total, testsPassed: saved.testsPassed, testsTotal: saved.testsTotal, isManuallyGraded: saved.isManuallyGraded, isCompleted: true } });
  });
});

router.get("/tasks/:taskId/web-template", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task }) => {
    if (task.taskMode !== "WEB") return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    return res.json({ taskId: task.id, taskMode: "WEB", files: task.webTemplateFiles ?? [{ path: "index.html", content: "" }, { path: "styles.css", content: "" }, { path: "script.js", content: "" }], rules: task.webValidationRules ?? [] });
  });
});

router.post("/tasks/:taskId/web-check", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task }) => {
    if (task.taskMode !== "WEB") return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    const files = normalizeWebTaskFiles(req.body?.files ?? []);
    const rules = normalizeWebValidationRules(task.webValidationRules ?? []);
    const profile = normalizeWebValidationProfile(task.webValidationProfile ?? "FREE_WEB");
    return res.json({ taskMode: "WEB", ...validateWebTaskSubmission({ files, rules, profile, referenceFiles: task.webTemplateFiles ?? [] }) });
  });
});

router.post("/tasks/:taskId/web-submit", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    if (task.taskMode !== "WEB") return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    if (task.isClosed || (task.deadline && new Date() > new Date(task.deadline))) return res.status(403).json({ message: "TASK_NOT_ACCEPTING_SUBMISSIONS" });
    const used = await gradeRepo().count({ where: { task: { id: task.id }, student: { id: student.id } } });
    if (used >= Math.max(1, task.maxAttempts)) return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    const files = normalizeWebTaskFiles(req.body?.files ?? []);
    const check = validateWebTaskSubmission({ files, rules: normalizeWebValidationRules(task.webValidationRules ?? []), profile: normalizeWebValidationProfile(task.webValidationProfile ?? "FREE_WEB"), referenceFiles: task.webTemplateFiles ?? [] });
    const maxScore = check.maxScore > 0 ? check.maxScore : Math.max(1, check.totalRules);
    const score = check.maxScore > 0 ? check.score : check.passedRules;
    const total = Math.round((score / maxScore) * 100);
    const grade = await gradeRepo().save(gradeRepo().create({ task, student, total, score, maxScore, testsPassed: check.passedRules, testsTotal: check.totalRules, submittedCode: encodeWebTaskPayload({ mode: "WEB", version: 1, files }), testResults: JSON.stringify(check.results), isCompleted: check.passed, isManuallyGraded: false, feedback: check.passed ? null : "Some validation rules failed." }));
    return res.json({ grade: { id: grade.id, total: grade.total, testsPassed: grade.testsPassed, testsTotal: grade.testsTotal, isManuallyGraded: false }, testResults: check.results, scoring: { score, maxScore }, taskMode: "WEB" });
  });
});

export default router;
