import { Router, NextFunction, Response } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { Student } from "../../entities/Student";
import { EduLesson } from "../../entities/EduLesson";
import { judgeWithSemaphore } from "../../services/judgeWorker";
import { courseTestsRevision, courseJudgeGrade } from "../../services/edu/courseTaskTests";
import { TestData } from "../../entities/TestData";
import { executeCodeWithInput } from "../../services/codeExecutionService";
import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  validateWebTaskSubmission,
} from "../../services/webTaskValidationService";
import { encodeWebTaskPayload } from "../../utils/webTaskPayload";
import { generateAlgorithmicHints } from "../../services/ai/failureHints";
import { assertCoursePracticeActive } from "../../services/edu/courseLessonAttempt";

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

function languageFor(_task: EduTask): "JAVA" | "PYTHON" | "CPP" {
  // Materialised legacy course tasks do not carry a topic language. Classes
  // are language-agnostic, so keep the old execution contract with a safe
  // compatibility default instead of reading a class field.
  return "PYTHON";
}

function uiLanguageFor(req: AuthRequest): "uk" | "en" {
  return String(req.headers["accept-language"] ?? "").toLowerCase().startsWith("en") ? "en" : "uk";
}

async function latestGrade(taskId: number, studentId: number): Promise<EduGrade | null> {
  return gradeRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } }, order: { createdAt: "DESC", id: "DESC" } });
}

/**
 * Persist a course-task attempt while serializing the per-student counter.
 * The pre-check in the handlers is only a fast path; the lock below is the
 * authorization boundary that prevents two concurrent requests from both
 * consuming the final allowed attempt.
 */
async function saveCourseGradeWithinAttemptLimit(task: EduTask, student: Student, draft: Partial<EduGrade>, expectedTestsRevision?: string): Promise<EduGrade> {
  return AppDataSource.transaction("SERIALIZABLE", async manager => {
    await manager
      .createQueryBuilder(Student, "student")
      .setLock("pessimistic_write")
      .where("student.id = :studentId", { studentId: student.id })
      .getOne();

    await manager.getRepository(EduLesson).findOne({ where: { id: task.lesson.id }, lock: { mode: "pessimistic_write" } });
    const current = await manager.getRepository(EduTask).findOne({ where: { id: task.id }, lock: { mode: "pessimistic_write" } });
    if (!current) throw Object.assign(new Error("TASK_NOT_FOUND"), { statusCode: 404 });
    if (current.isClosed || current.deadline && new Date() > current.deadline) throw Object.assign(new Error("TASK_NOT_ACCEPTING_SUBMISSIONS"), { statusCode: 403 });
    const maxAttempts = Math.max(1, Number(current.maxAttempts) || 1);
    if (expectedTestsRevision) {
      const currentTests = await manager.getRepository(TestData).find({ where: { task: { id: task.id } }, order: { id: "ASC" } });
      if (courseTestsRevision(currentTests, 0) !== expectedTestsRevision) throw Object.assign(new Error("TESTS_CHANGED"), { statusCode: 409 });
    }
    const gradeRepoM = manager.getRepository(EduGrade);
    await assertCoursePracticeActive(task.lesson, student.id, manager);
    const prior = await gradeRepoM.findOne({ where: { task: { id: task.id }, student: { id: student.id } }, order: { createdAt: "DESC", id: "DESC" } });
    if (prior?.isCompleted || prior?.isManuallyGraded) throw Object.assign(new Error("TASK_ALREADY_COMPLETED"), { statusCode: 409 });
    const used = await gradeRepoM.count({ where: { task: { id: task.id }, student: { id: student.id } } });
    if (used >= maxAttempts) {
      throw Object.assign(new Error("MAX_ATTEMPTS_REACHED"), { statusCode: 403 });
    }

    const created = gradeRepoM.create({ ...draft, task, student });
    const saved = await gradeRepoM.save(created);
    return Array.isArray(saved) ? saved[0] : saved;
  });
}

async function handleIfCourseTask(req: AuthRequest, res: Response, next: NextFunction, fn: (ctx: { task: EduTask; student: Student }) => Promise<unknown>) {
  if (req.query.source === "legacy") return next();
  const taskId = Number(req.params.taskId);
  if (!Number.isInteger(taskId)) return next();
  const task = await loadTask(taskId);
  if (!task) return req.query.source === "course" ? res.status(404).json({ message: "TASK_NOT_FOUND" }) : next();
  const ctx = await visibleTask(req, taskId);
  // Without an explicit course source marker, let the legacy TopicTask router
  // handle a colliding numeric id that belongs to the student's class.
  if (!ctx) return String(req.query.source ?? "") === "course"
    ? res.status(403).json({ message: "ACCESS_DENIED" })
    : next();
  try {
    if (req.method !== "GET") {
      await assertCoursePracticeActive(ctx.task.lesson, ctx.student.id);
    }
    await fn(ctx);
  } catch (error: unknown) {
    const errorRecord = error && typeof error === "object" ? error as Record<string, unknown> : {};
    const status = Number(errorRecord.statusCode ?? errorRecord.status ?? 500);
    const message = typeof errorRecord.message === "string" ? errorRecord.message : "INTERNAL_SERVER_ERROR";
    return res.status(status >= 400 && status < 600 ? status : 500).json({ message });
  }
}

router.get("/tasks/:taskId", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    let submissionAllowed = true;
    let submissionBlockedReason: string | null = null;
    try { await assertCoursePracticeActive(task.lesson, student.id); }
    catch (error) { submissionAllowed = false; submissionBlockedReason = (error as Error).message; }
    const grade = await latestGrade(task.id, student.id);
    const attemptsUsed = await gradeRepo().count({ where: { task: { id: task.id }, student: { id: student.id } } });
    const tests = await testRepo().count({ where: { task: { id: task.id } } });
    return res.json({ task: {
      id: task.id,
      title: task.title,
      description: task.description,
      template: task.template,
      taskMode: task.taskMode,
      projectSpec: task.projectSpec ?? null,
      webTemplateFiles: task.webTemplateFiles ?? null,
      webValidationRules: task.webValidationRules ?? null,
      language: languageFor(task),
      testDataCount: tests,
      savedCode: grade?.submittedCode ?? null,
      maxAttempts: task.maxAttempts,
      attemptsUsed,
      deadline: task.deadline ?? null,
      isClosed: task.isClosed || !submissionAllowed || task.taskMode === "CODE" && tests === 0 || Boolean(grade?.isCompleted || grade?.isManuallyGraded) || attemptsUsed >= task.maxAttempts,
      submissionAllowed, submissionBlockedReason,
      lesson: { id: task.lesson.id, title: task.lesson.title, type: task.lesson.type, hasTheory: task.lesson.hasTheory },
      hasGrade: Boolean(grade),
      grade: grade ? { id: grade.id, total: grade.total, testsPassed: grade.testsPassed, testsTotal: grade.testsTotal, isCompleted: grade.isCompleted, isManuallyGraded: grade.isManuallyGraded, feedback: grade.feedback, score: grade.score, maxScore: grade.maxScore,
        testResults: grade.testResults ? (() => { try { return JSON.parse(grade.testResults); } catch { return []; } })() : [] } : null,
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
    const prior = await latestGrade(task.id, student.id);
    if (prior?.isCompleted || prior?.isManuallyGraded) return res.status(409).json({ message: "TASK_ALREADY_COMPLETED" });
    const used = await gradeRepo().count({ where: { task: { id: task.id }, student: { id: student.id } } });
    if (used >= Math.max(1, task.maxAttempts)) return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    const tests = await testRepo().find({ where: { task: { id: task.id } }, order: { id: "ASC" } });
    if (!tests.length) return res.status(409).json({ message: "NO_TESTS_CONFIGURED" });
    const hasSubtasks = tests.some(test => Boolean(test.subtask));
    const workerResult = await judgeWithSemaphore({
      submission_id: `edu_course_${student.id}_${task.id}_${randomUUID()}`, cache_owner: `edu-student:${student.id}`,
      language: "python", source: code.data, run_all: true, debug: false,
      group_scoring_mode: hasSubtasks ? "BINARY_ALL_OR_NOT" : "SUM",
      tests: tests.map(test => ({ id: test.id, input: test.input, output: test.expectedOutput, hidden: test.isHidden,
        weight: test.points || 1, group: hasSubtasks ? test.subtask || `unassigned_${test.id}` : test.isHidden ? "hidden" : "public" })),
      checker: { type: "whitespace" }, limits: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 256 },
    });
    const result = courseJudgeGrade(tests, workerResult);
    const saved = await saveCourseGradeWithinAttemptLimit(task, student, { total: result.total, score: result.score,
      maxScore: result.maxScore, testsPassed: result.testsPassed, testsTotal: result.testsTotal, submittedCode: code.data,
      testResults: JSON.stringify(result.testResults), groupScores: JSON.stringify(result.groupScores),
      isCompleted: result.isCompleted, isManuallyGraded: false, feedback: null }, courseTestsRevision(tests, 0));
    // Hidden inputs and expected outputs never leave the judge boundary through AI hints.
    const failures = result.testResults.filter(test => !test.passed);
    const hints = failures.length ? await generateAlgorithmicHints({ taskTitle: task.title, taskText: task.description,
      language: languageFor(task), code: code.data, failures, maxHints: 4, uiLanguage: uiLanguageFor(req) }).catch(() => [])
      : result.testsPassed < result.testsTotal ? [uiLanguageFor(req) === "en" ? "Public examples passed. Check boundary cases and input constraints." : "Відкриті приклади пройдено. Перевірте граничні випадки й обмеження вхідних даних."] : [];
    return res.json({ grade: { id: saved.id, total: saved.total, testsPassed: saved.testsPassed, testsTotal: saved.testsTotal,
      isManuallyGraded: false, isCompleted: saved.isCompleted }, testResults: result.testResults, hints,
      scoring: { score: result.score, maxScore: result.maxScore, groupScores: result.groupScores } });
  });
});

router.post("/tasks/:taskId/complete", authRequired, async (req: AuthRequest, res: Response, next: NextFunction) => {
  await handleIfCourseTask(req, res, next, async ({ task, student }) => {
    if (task.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (task.deadline && new Date() > new Date(task.deadline)) return res.status(403).json({ message: "DEADLINE_PASSED" });
    const grade = await latestGrade(task.id, student.id);
    if (!grade) return res.status(400).json({ message: "NO_SUBMISSION" });
    if (!grade.isCompleted) return res.status(409).json({ message: "TASK_NOT_PASSED" });
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
    const grade = await saveCourseGradeWithinAttemptLimit(task, student, { total, score, maxScore, testsPassed: check.passedRules, testsTotal: check.totalRules, submittedCode: encodeWebTaskPayload({ mode: "WEB", version: 1, files }), testResults: JSON.stringify(check.results), isCompleted: check.passed, isManuallyGraded: false, feedback: check.passed ? null : "Some validation rules failed." });
    return res.json({ grade: { id: grade.id, total: grade.total, testsPassed: grade.testsPassed, testsTotal: grade.testsTotal, isManuallyGraded: false }, testResults: check.results, hints: check.passed ? [] : check.results.filter(result => !result.passed).map(result => result.message || "Перевір цю вимогу ще раз.").slice(0, 4), scoring: { score, maxScore }, taskMode: "WEB" });
  });
});

export default router;
