import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { EduLesson } from "../../entities/EduLesson";
import { Student } from "../../entities/Student";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { gradeQuiz, stripQuizForStudent, manualPointsAwarded, type Quiz } from "../../services/edu/quizGrader";
import { logger } from "../../utils/logger";
import { safeAICall } from "../../services/ai/safeAICall";
import { quizAnswersBodySchema, manualQuizGradeBodySchema } from "./lessonContracts";
import { assertCourseLessonActive } from "../../services/edu/courseLessonAttempt";

/**
 * Lesson quizzes using the new quiz engine (P2.5). Operates on EduLesson.quizJson
 * (the shape the course fork produces). Legacy control-work quizzes are unrelated
 * and untouched.
 */
const router = Router();
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const studentRepo = () => AppDataSource.getRepository(Student);
const attemptRepo = () => AppDataSource.getRepository(QuizAttempt);
async function saveUnsubmittedQuiz(lessonId: number, quizJson: string) {
  return AppDataSource.transaction(async manager => {
    const repo = manager.getRepository(EduLesson);
    const lesson = await repo.findOne({ where: { id: lessonId }, lock: { mode: "pessimistic_write" } });
    if (!lesson) throw new Error("LESSON_NOT_FOUND");
    if (await manager.getRepository(QuizAttempt).count({ where: { lesson: { id: lessonId } } })) throw new Error("QUIZ_HAS_SUBMISSIONS");
    lesson.quizJson = quizJson;
    lesson.hasTheory = true;
    await repo.save(lesson);
  });
}

for (const name of ["lessonId", "studentId"]) {
  router.param(name, (req, res, next, value) => {
    if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) {
      res.status(400).json({ message: "INVALID_ID" });
      return;
    }
    next();
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeOptions(raw: unknown): Record<string, string> {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.map((value, index) => [String.fromCharCode(65 + index), String(value ?? "")]));
  }
  if (!isRecord(raw)) return {};
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value ?? "")]));
}

function isQuizAttemptDuplicateError(error: unknown): boolean {
  const code = String(isRecord(error) ? error.code ?? "" : "").toUpperCase();
  if (code === "ER_DUP_ENTRY" || code === "23505") return true;
  const message = String(isRecord(error) ? error.message ?? "" : "").toLowerCase();
  return message.includes("uq_quiz_lesson_student")
    || message.includes("duplicate entry")
    || message.includes("unique constraint");
}

function normalizeLegacyQuiz(raw: unknown): Array<{ question: string; options: Record<string, string>; correct: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((rawItem) => {
    const item = isRecord(rawItem) ? rawItem : {};
    const options = normalizeOptions(item.options);
    const correctIndex = Number(item.correctIndex ?? item.correct);
    const correct = Number.isInteger(correctIndex) && correctIndex >= 0
      ? String.fromCharCode(65 + correctIndex)
      : String(item.correct ?? "A");
    return { question: String(item.q ?? item.question ?? ""), options, correct };
  }).filter((item) => item.question.trim() && Object.keys(item.options).length > 0);
}

async function loadTeacherLesson(req: AuthRequest, lessonId: number): Promise<EduLesson | null> {
  if (!req.userId || req.userType === "STUDENT") return null;
  const lesson = await lessonRepo().findOne({ where: { id: lessonId }, relations: ["class", "class.teacher"] });
  const access = lesson?.class?.id ? await authorizeClassForReq(req, lesson.class.id, "CONTENT_AUTHOR") : null;
  return access?.allowed ? lesson : null;
}

// Teacher Studio uses a legacy, editor-friendly quiz shape. Keep this route
// compatible with that UI while storing the validated payload on EduLesson.
router.post("/lessons/:lessonId/generate-quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ message: "INVALID_LESSON_ID" });
    const lesson = await loadTeacherLesson(req, lessonId);
    if (!lesson) return res.status(403).json({ message: "ONLY_LESSON_TEACHER" });
    if (await attemptRepo().count({ where: { lesson: { id: lessonId } } })) return res.status(409).json({ message: "QUIZ_HAS_SUBMISSIONS" });
    const count = Math.min(30, Math.max(1, Math.floor(Number(req.body?.count) || 8)));
    const result = await safeAICall("generateQuiz", {
      // Legacy lesson quizzes do not belong to a TopicNew yet. Do not infer
      // their language from the class; retain the historical fallback.
      lang: "PYTHON",
      prevTopics: String(req.body?.topicTitle || lesson.title).trim(),
      count,
      userId: req.userId
    }, { expectedCount: count, language: req.headers["accept-language"]?.toString().includes("en") ? "en" : "uk", requestId: req.requestId, maxAttempts: 2 });
    if (!result.success) return res.status(502).json({ message: "AI_GENERATION_FAILED" });
    const quiz = normalizeLegacyQuiz(JSON.parse(result.data.quizJson));
    if (!quiz.length) return res.status(502).json({ message: "EMPTY_QUIZ_GENERATED" });
    const quizJson = JSON.stringify(quiz);
    await saveUnsubmittedQuiz(lessonId, quizJson);
    return res.json({ count: quiz.length, quiz, quizJson });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "QUIZ_HAS_SUBMISSIONS") return res.status(409).json({ message: error.message });
    logger.error("[edu/lessonQuiz] generate quiz failed", { requestId: req.requestId, err: error });
    return res.status(502).json({ message: "AI_GENERATION_FAILED" });
  }
});

router.put("/lessons/:lessonId/quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ message: "INVALID_LESSON_ID" });
    const lesson = await loadTeacherLesson(req, lessonId);
    if (!lesson) return res.status(403).json({ message: "ONLY_LESSON_TEACHER" });
    if (await attemptRepo().count({ where: { lesson: { id: lessonId } } })) return res.status(409).json({ message: "QUIZ_HAS_SUBMISSIONS" });
    const quiz = normalizeLegacyQuiz(req.body?.quiz);
    if (!quiz.length || quiz.length > 100) return res.status(400).json({ message: "INVALID_QUIZ" });
    await saveUnsubmittedQuiz(lessonId, JSON.stringify(quiz));
    return res.status(204).send();
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "QUIZ_HAS_SUBMISSIONS") return res.status(409).json({ message: error.message });
    logger.error("[edu/lessonQuiz] save quiz failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

function parseQuiz(raw: string | null | undefined): Quiz | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.questions)) return parsed as Quiz;
    // Teacher Studio stores its compact legacy array shape. Convert it at the
    // boundary so the student-facing quiz engine can grade the same payload.
    if (Array.isArray(parsed)) {
      const questions = parsed.map((rawItem, index: number) => {
        const item = isRecord(rawItem) ? rawItem : {};
        const optionMap = normalizeOptions(item.options);
        const options = Object.values(optionMap);
        const correctKey = String(item.correct ?? "A");
        const correctIndex = Array.isArray(item.options)
          ? Number(item.correctIndex ?? item.correct)
          : Math.max(0, Object.keys(optionMap).indexOf(correctKey));
        return {
          id: String(item.id ?? index),
          type: "SINGLE_CHOICE" as const,
          prompt: String(item.q ?? item.question ?? ""),
          options,
          correctIndex: Number.isInteger(correctIndex) && correctIndex >= 0 ? correctIndex : 0
        };
      }).filter((question) => question.prompt.trim() && question.options.length > 0);
      return questions.length ? { questions } : null;
    }
    return null;
  } catch {
    return null;
  }
}

async function loadLessonWithClass(lessonId: number): Promise<EduLesson | null> {
  if (!Number.isSafeInteger(lessonId) || lessonId <= 0) return null;
  return await lessonRepo().findOne({
    where: { id: lessonId },
    relations: ["class", "class.teacher"]
  });
}

// Student fetches a lesson's quiz without answer keys.
router.get("/lessons/:lessonId/quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) return res.status(403).json({ message: "ONLY_STUDENTS" });
    const lessonId = parseInt(req.params.lessonId, 10);
    const lesson = await loadLessonWithClass(lessonId);
    if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== lesson.class?.id) {
      return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
    }

    const quiz = parseQuiz(lesson.quizJson);
    if (!quiz) return res.json({ quiz: null });

    let submissionAllowed = true;
    let submissionBlockedReason: string | null = null;
    try { await assertCourseLessonActive(lesson, req.studentId); }
    catch (error) { submissionAllowed = false; submissionBlockedReason = (error as Error).message; }
    const attempt = await attemptRepo().findOne({ where: { lesson: { id: lessonId }, student: { id: req.studentId } } });
    let submittedAnswers: Record<string, unknown> | null = null;
    if (attempt) {
      submittedAnswers = {};
      try {
        const stored: unknown = JSON.parse(attempt.answersJson || "{}");
        if (isRecord(stored) && !Array.isArray(stored)) submittedAnswers = Object.fromEntries(
          quiz.questions.filter(question => Object.prototype.hasOwnProperty.call(stored, question.id)).map(question => [question.id, stored[question.id]])
        );
      } catch { /* A malformed historic answer must not prevent access to the result. */ }
    }
    return res.json({
      quiz: stripQuizForStudent(quiz),
      submittedAnswers,
      submissionAllowed, submissionBlockedReason,
      attempt: attempt
        ? { status: attempt.status, autoScore: Number(attempt.autoScore), manualScore: Number(attempt.manualScore), maxScore: Number(attempt.maxScore), autoPercent: attempt.autoPercent, finalPercent: attempt.finalPercent ?? null, needsManual: attempt.status === "NEEDS_MANUAL" }
        : null
    });
  } catch (error: unknown) {
    logger.error("[edu/lessonQuiz] get quiz failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Student submits answers → auto-graded, persisted as a QuizAttempt.
router.post("/lessons/:lessonId/quiz/submit", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) return res.status(403).json({ message: "ONLY_STUDENTS" });
    const lessonId = parseInt(req.params.lessonId, 10);
    const lesson = await loadLessonWithClass(lessonId);
    if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== lesson.class?.id) {
      return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
    }

    const quiz = parseQuiz(lesson.quizJson);
    if (!quiz) return res.status(400).json({ message: "NO_QUIZ" });

    const existing = await attemptRepo().findOne({ where: { lesson: { id: lessonId }, student: { id: req.studentId } } });
    if (existing) return res.status(409).json({ message: "QUIZ_ALREADY_SUBMITTED" });

    await assertCourseLessonActive(lesson, req.studentId);

    const parsedBody = quizAnswersBodySchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ message: "INVALID_ANSWERS" });
    const answers = parsedBody.data.answers;
    const result = await AppDataSource.transaction(async manager => {
      await manager.createQueryBuilder(Student, "student").setLock("pessimistic_write").where("student.id = :studentId", { studentId: req.studentId }).getOne();
      const current = await manager.getRepository(EduLesson).findOne({ where: { id: lessonId }, lock: { mode: "pessimistic_write" } });
      const currentQuiz = parseQuiz(current?.quizJson);
      if (!currentQuiz || !current) throw new Error("NO_QUIZ");
      const repo = manager.getRepository(QuizAttempt);
      if (await repo.findOne({ where: { lesson: { id: lessonId }, student: { id: req.studentId } } })) throw new Error("QUIZ_ALREADY_SUBMITTED");
      await assertCourseLessonActive(current, req.studentId!, manager);
      const result = gradeQuiz(currentQuiz, answers);
      const attempt = repo.create({
      lesson: { id: lessonId } as EduLesson,
      student: { id: req.studentId } as Student,
      answersJson: JSON.stringify(answers),
      autoScore: result.autoScore,
      maxScore: result.maxScore,
      autoPercent: result.autoPercent,
      status: result.needsManual ? "NEEDS_MANUAL" : "AUTO_GRADED"
    });
      await repo.save(attempt);
      return result;
    });

    return res.status(201).json({
      result: {
        autoScore: result.autoScore,
        maxScore: result.maxScore,
        autoPercent: result.autoPercent,
        needsManual: result.needsManual,
        results: result.results
      }
    });
  } catch (error: unknown) {
    if (isQuizAttemptDuplicateError(error) || (error instanceof Error && error.message === "QUIZ_ALREADY_SUBMITTED")) {
      return res.status(409).json({ message: "QUIZ_ALREADY_SUBMITTED" });
    }
    if (error instanceof Error && ["ATTEMPT_NOT_STARTED", "CONTROL_WORK_COMPLETED"].includes(error.message)) {
      return res.status(403).json({ message: error.message });
    }
    logger.error("[edu/lessonQuiz] submit failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher lists attempts for a lesson quiz (their class only).
router.get("/lessons/:lessonId/quiz/attempts", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const lessonId = parseInt(req.params.lessonId, 10);
    const lesson = await loadLessonWithClass(lessonId);
    if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });
    const lessonAccess = lesson.class?.id ? await authorizeClassForReq(req, lesson.class.id, "GRADE_EDIT") : null;
    if (!lessonAccess || !lessonAccess.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const attempts = await attemptRepo().find({
      where: { lesson: { id: lessonId } },
      relations: ["student"],
      order: { updatedAt: "DESC" }
    });
    return res.json({
      attempts: attempts.map((a) => ({
        studentId: a.studentId,
        studentName: `${a.student?.lastName ?? ""} ${a.student?.firstName ?? ""}`.trim(),
        autoScore: Number(a.autoScore),
        maxScore: Number(a.maxScore),
        autoPercent: a.autoPercent,
        finalPercent: a.finalPercent ?? null,
        status: a.status,
        updatedAt: a.updatedAt
      }))
    });
  } catch (error: unknown) {
    logger.error("[edu/lessonQuiz] list attempts failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher views one attempt's answers + the quiz's OPEN_TEXT questions to grade.
router.get("/lessons/:lessonId/quiz/attempts/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const lessonId = parseInt(req.params.lessonId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const lesson = await loadLessonWithClass(lessonId);
    if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });
    const lessonAccess = lesson.class?.id ? await authorizeClassForReq(req, lesson.class.id, "GRADE_EDIT") : null;
    if (!lessonAccess || !lessonAccess.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const attempt = await attemptRepo().findOne({ where: { lesson: { id: lessonId }, student: { id: studentId } } });
    if (!attempt) return res.status(404).json({ message: "ATTEMPT_NOT_FOUND" });

    const quiz = parseQuiz(lesson.quizJson);
    let answers: Record<string, unknown> = {};
    try {
      answers = attempt.answersJson ? JSON.parse(attempt.answersJson) : {};
    } catch {
      answers = {};
    }
    const openQuestions = (quiz?.questions ?? [])
      .filter(q => q.type === "OPEN_TEXT")
      .map(q => ({ id: q.id, prompt: q.prompt ?? null, points: q.points ?? 1, answer: String(answers[q.id] ?? "") }));

    return res.json({
      attempt: {
        status: attempt.status,
        autoScore: Number(attempt.autoScore),
        manualScore: Number(attempt.manualScore),
        maxScore: Number(attempt.maxScore),
        autoPercent: attempt.autoPercent,
        finalPercent: attempt.finalPercent ?? null
      },
      openQuestions
    });
  } catch (error: unknown) {
    logger.error("[edu/lessonQuiz] attempt detail failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Teacher grades the OPEN_TEXT questions of a student's attempt → final score.
router.post("/lessons/:lessonId/quiz/attempts/:studentId/grade-manual", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const lessonId = parseInt(req.params.lessonId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (!Number.isFinite(lessonId) || !Number.isFinite(studentId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const lesson = await loadLessonWithClass(lessonId);
    if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });
    const lessonAccess = lesson.class?.id ? await authorizeClassForReq(req, lesson.class.id, "GRADE_EDIT") : null;
    if (!lessonAccess || !lessonAccess.allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const attempt = await attemptRepo().findOne({ where: { lesson: { id: lessonId }, student: { id: studentId } } });
    if (!attempt) return res.status(404).json({ message: "ATTEMPT_NOT_FOUND" });

    const quiz = parseQuiz(lesson.quizJson);
    if (!quiz) return res.status(400).json({ message: "NO_QUIZ" });

    const parsedBody = manualQuizGradeBodySchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ message: "INVALID_MANUAL_SCORES" });
    const manualScores = parsedBody.data.manualScores;
    const openQuestions = quiz.questions.filter(question => question.type === "OPEN_TEXT");
    if (!openQuestions.length || openQuestions.some(question => !Object.prototype.hasOwnProperty.call(manualScores, question.id))) {
      return res.status(400).json({ message: "MANUAL_SCORES_REQUIRED" });
    }
    const manual = manualPointsAwarded(quiz, manualScores);
    if (manual.invalidIds.length || openQuestions.some(question => {
      const points = Number(question.points);
      const max = Number.isFinite(points) && points > 0 ? points : 1;
      return manualScores[question.id] > max;
    })) return res.status(400).json({ message: "INVALID_MANUAL_SCORES" });

    const finalScore = Number(attempt.autoScore) + manual.manualAwarded;
    const maxScore = Number(attempt.maxScore);
    const finalPercent = maxScore > 0 ? Math.round((finalScore / maxScore) * 100) : 0;

    attempt.manualScore = manual.manualAwarded;
    attempt.finalPercent = finalPercent;
    attempt.status = "MANUAL_GRADED";
    await attemptRepo().save(attempt);

    return res.json({
      result: {
        autoScore: Number(attempt.autoScore),
        manualScore: manual.manualAwarded,
        finalScore: Math.round(finalScore * 100) / 100,
        maxScore,
        finalPercent,
        ignoredQuestionIds: manual.invalidIds
      }
    });
  } catch (error: unknown) {
    logger.error("[edu/lessonQuiz] manual grade failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
