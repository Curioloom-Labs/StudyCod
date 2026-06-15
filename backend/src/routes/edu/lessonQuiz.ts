import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { EduLesson } from "../../entities/EduLesson";
import { Student } from "../../entities/Student";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { gradeQuiz, stripQuizForStudent, manualPointsAwarded, type Quiz } from "../../services/edu/quizGrader";
import { logger } from "../../utils/logger";

/**
 * Lesson quizzes using the new quiz engine (P2.5). Operates on EduLesson.quizJson
 * (the shape the course fork produces). Legacy control-work quizzes are unrelated
 * and untouched.
 */
const router = Router();
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const studentRepo = () => AppDataSource.getRepository(Student);
const attemptRepo = () => AppDataSource.getRepository(QuizAttempt);

function parseQuiz(raw: string | null | undefined): Quiz | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.questions)) return parsed as Quiz;
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
    if (lesson.class?.teacher?.id !== req.userId) return res.status(403).json({ message: "ACCESS_DENIED" });

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
    if (lesson.class?.teacher?.id !== req.userId) return res.status(403).json({ message: "ACCESS_DENIED" });

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
    if (lesson.class?.teacher?.id !== req.userId) return res.status(403).json({ message: "ACCESS_DENIED" });

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
