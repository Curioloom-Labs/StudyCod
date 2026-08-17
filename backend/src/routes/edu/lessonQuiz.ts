import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import { EduLesson } from "../../entities/EduLesson";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { gradeQuiz, stripQuizForStudent, manualPointsAwarded, type Quiz } from "../../services/edu/quizGrader";
import { logger } from "../../utils/logger";
import { safeAICall } from "../../services/ai/safeAICall";

/**
 * Lesson quizzes using the new quiz engine (P2.5). Operates on EduLesson.quizJson
 * (the shape the course fork produces). Legacy control-work quizzes are unrelated
 * and untouched.
 */
const router = Router();
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const studentRepo = () => AppDataSource.getRepository(Student);
const attemptRepo = () => AppDataSource.getRepository(QuizAttempt);
const userRepo = () => AppDataSource.getRepository(User);

function isQuizAttemptDuplicateError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").toUpperCase();
  if (code === "ER_DUP_ENTRY" || code === "23505") return true;
  const message = String((error as any)?.message ?? "").toLowerCase();
  return message.includes("uq_quiz_lesson_student")
    || message.includes("duplicate entry")
    || message.includes("unique constraint");
}

function normalizeLegacyQuiz(raw: unknown): Array<{ question: string; options: Record<string, string>; correct: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.map((item: any) => {
    const options = Array.isArray(item?.options)
      ? Object.fromEntries(item.options.map((value: unknown, index: number) => [String.fromCharCode(65 + index), String(value ?? "")]))
      : (item?.options && typeof item.options === "object" ? item.options : {});
    const correctIndex = Number(item?.correctIndex ?? item?.correct);
    const correct = Number.isInteger(correctIndex) && correctIndex >= 0
      ? String.fromCharCode(65 + correctIndex)
      : String(item?.correct ?? "A");
    return { question: String(item?.q ?? item?.question ?? ""), options, correct };
  }).filter((item) => item.question.trim() && Object.keys(item.options).length > 0);
}

async function loadTeacherLesson(req: AuthRequest, lessonId: number): Promise<EduLesson | null> {
  if (!req.userId || req.userType === "STUDENT") return null;
  const user = await userRepo().findOne({ where: { id: req.userId }, select: ["id", "userMode"] });
  if (!user || user.userMode !== "EDUCATIONAL") return null;
  const lesson = await lessonRepo().findOne({ where: { id: lessonId }, relations: ["class", "class.teacher"] });
  return lesson && lesson.class?.teacher?.id === req.userId ? lesson : null;
}

// Teacher Studio uses a legacy, editor-friendly quiz shape. Keep this route
// compatible with that UI while storing the validated payload on EduLesson.
router.post("/lessons/:lessonId/generate-quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const lessonId = Number(req.params.lessonId);
    if (!Number.isInteger(lessonId) || lessonId <= 0) return res.status(400).json({ message: "INVALID_LESSON_ID" });
    const lesson = await loadTeacherLesson(req, lessonId);
    if (!lesson) return res.status(403).json({ message: "ONLY_LESSON_TEACHER" });
    const count = Math.min(30, Math.max(1, Math.floor(Number(req.body?.count) || 8)));
    const result = await safeAICall("generateQuiz", {
      lang: lesson.class.language,
      prevTopics: String(req.body?.topicTitle || lesson.title).trim(),
      count,
      userId: req.userId
    }, { expectedCount: count, language: req.headers["accept-language"]?.toString().includes("en") ? "en" : "uk", requestId: req.requestId, maxAttempts: 2 });
    if (!result.success) return res.status(502).json({ message: "AI_GENERATION_FAILED" });
    const quiz = normalizeLegacyQuiz(JSON.parse(result.data.quizJson));
    if (!quiz.length) return res.status(502).json({ message: "EMPTY_QUIZ_GENERATED" });
    lesson.quizJson = JSON.stringify(quiz);
    lesson.hasTheory = true;
    await lessonRepo().save(lesson);
    return res.json({ count: quiz.length, quiz, quizJson: lesson.quizJson });
  } catch (error: any) {
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
    const quiz = normalizeLegacyQuiz(req.body?.quiz);
    if (!quiz.length || quiz.length > 100) return res.status(400).json({ message: "INVALID_QUIZ" });
    lesson.quizJson = JSON.stringify(quiz);
    lesson.hasTheory = true;
    await lessonRepo().save(lesson);
    return res.status(204).send();
  } catch (error: any) {
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
      const questions = parsed.map((item: any, index: number) => {
        const options = Array.isArray(item?.options)
          ? item.options.map((value: unknown) => String(value ?? ""))
          : Object.values(item?.options || {}).map((value) => String(value ?? ""));
        const correctKey = String(item?.correct ?? "A");
        const correctIndex = Array.isArray(item?.options)
          ? Number(item?.correctIndex ?? item?.correct)
          : Math.max(0, Object.keys(item?.options || {}).indexOf(correctKey));
        return {
          id: String(item?.id ?? index),
          type: "SINGLE_CHOICE" as const,
          prompt: String(item?.q ?? item?.question ?? ""),
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
  if (!Number.isFinite(lessonId)) return null;
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

    const attempt = await attemptRepo().findOne({ where: { lesson: { id: lessonId }, student: { id: req.studentId } } });
    return res.json({
      quiz: stripQuizForStudent(quiz),
      attempt: attempt
        ? { status: attempt.status, autoScore: Number(attempt.autoScore), maxScore: Number(attempt.maxScore), autoPercent: attempt.autoPercent }
        : null
    });
  } catch (error: any) {
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

    const answers = (req.body?.answers ?? {}) as Record<string, unknown>;
    const result = gradeQuiz(quiz, answers);

    const attempt = attemptRepo().create({
      lesson: { id: lessonId } as EduLesson,
      student: { id: req.studentId } as Student,
      answersJson: JSON.stringify(answers),
      autoScore: result.autoScore,
      maxScore: result.maxScore,
      autoPercent: result.autoPercent,
      status: result.needsManual ? "NEEDS_MANUAL" : "AUTO_GRADED"
    });
    await attemptRepo().save(attempt);

    return res.status(201).json({
      result: {
        autoScore: result.autoScore,
        maxScore: result.maxScore,
        autoPercent: result.autoPercent,
        needsManual: result.needsManual,
        results: result.results
      }
    });
  } catch (error: any) {
    if (isQuizAttemptDuplicateError(error)) {
      return res.status(409).json({ message: "QUIZ_ALREADY_SUBMITTED" });
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
        status: a.status,
        updatedAt: a.updatedAt
      }))
    });
  } catch (error: any) {
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
  } catch (error: any) {
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

    const manualScores = (req.body?.manualScores ?? {}) as Record<string, unknown>;
    const manual = manualPointsAwarded(quiz, manualScores);

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
  } catch (error: any) {
    logger.error("[edu/lessonQuiz] manual grade failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
