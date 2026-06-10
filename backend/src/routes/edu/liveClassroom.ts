import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { EduLesson } from "../../entities/EduLesson";
import { EduLiveSession } from "../../entities/EduLiveSession";
import { EduGrade } from "../../entities/EduGrade";
import { EduTask } from "../../entities/EduTask";
import { User } from "../../entities/User";
import { logger } from "../../utils/logger";
import {
  isLiveClassroomEnabled,
  mintRoomToken,
  teacherIdentity,
  studentIdentity,
  type LiveRole
} from "../../services/edu/liveClassroom";
import { buildLiveSnapshot, type LiveAttempt, type LiveStudent } from "../../services/edu/liveMonitor";
import { setLiveCode, getLiveCode } from "../../services/edu/liveCode";
import { startChallenge, getChallenge, endChallenge, type LiveChallenge } from "../../services/edu/liveChallenge";
import { openBreakouts, getBreakouts, findStudentGroup, getGroup, closeBreakouts, type BreakoutState } from "../../services/edu/liveBreakout";
import { buildLiveSignals, generateLiveBriefing } from "../../services/edu/liveCopilot";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";

const router = Router();

const classRepo = () => AppDataSource.getRepository(Class);
const studentRepo = () => AppDataSource.getRepository(Student);
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const liveRepo = () => AppDataSource.getRepository(EduLiveSession);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const taskRepo = () => AppDataSource.getRepository(EduTask);
const userRepo = () => AppDataSource.getRepository(User);

// Activity older than this is treated as "idle" (not part of the live session),
// so a long-passed task from days ago doesn't masquerade as current work.
const LIVE_OVERVIEW_WINDOW_MS = 3 * 60 * 60 * 1000;

function disableCache(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

interface LiveSessionDto {
  id: number;
  classId: number | null;
  lessonId: number | null;
  title: string | null;
  status: string;
  roomName: string;
  createdAt: string | null;
  endedAt: string | null;
}

function sessionDto(s: EduLiveSession): LiveSessionDto {
  return {
    id: s.id,
    classId: s.class?.id ?? null,
    lessonId: s.lesson?.id ?? null,
    title: s.title ?? null,
    status: s.status,
    roomName: s.roomName,
    createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null,
    endedAt: s.endedAt ? new Date(s.endedAt).toISOString() : null
  };
}

function newRoomName(classId: number): string {
  return `cls-${classId}-${randomBytes(8).toString("hex")}`;
}

/**
 * Load the class only if the authenticated USER is allowed to teach it
 * (owner teacher, or any SYSTEM_ADMIN). Returns null when not permitted so the
 * caller can answer 404 without leaking existence.
 */
async function loadTeacherClass(req: AuthRequest, classId: number): Promise<Class | null> {
  const isAdmin = req.userRole === "SYSTEM_ADMIN";
  return classRepo().findOne({
    where: isAdmin ? { id: classId } : { id: classId, teacher: { id: req.userId } }
  });
}

function requireEnabled(res: Response): boolean {
  if (!isLiveClassroomEnabled()) {
    res.status(503).json({ message: "LIVE_CLASSROOM_DISABLED" });
    return false;
  }
  return true;
}

/**
 * Resolve read access to a class for a feature usable by both sides: the
 * teacher who owns it (or an admin) and any student enrolled in it. Returns the
 * caller's role, or null after writing the appropriate error response.
 */
async function resolveClassAccess(
  req: AuthRequest,
  res: Response,
  classId: number
): Promise<"teacher" | "student" | null> {
  if (req.userType === "STUDENT" && req.studentId) {
    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== classId) {
      res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
      return null;
    }
    return "student";
  }
  if (req.userId) {
    const cls = await loadTeacherClass(req, classId);
    if (!cls) {
      res.status(404).json({ message: "CLASS_NOT_FOUND" });
      return null;
    }
    return "teacher";
  }
  res.status(401).json({ message: "UNAUTHORIZED" });
  return null;
}

function challengeDto(ch: LiveChallenge) {
  const endsAtMs = ch.startedAtMs + ch.durationSec * 1000;
  return {
    id: ch.id,
    taskId: ch.taskId,
    taskTitle: ch.taskTitle,
    startedAtMs: ch.startedAtMs,
    durationSec: ch.durationSec,
    endsAtMs,
    remainingSeconds: Math.max(0, Math.round((endsAtMs - Date.now()) / 1000))
  };
}

/**
 * Teacher opens (or re-opens) the live classroom for a class. At most one LIVE
 * session exists per class: if one is already running we return it instead of
 * spawning a second room. Responds with the session plus a host join token.
 */
router.post("/classes/:classId/live-sessions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireEnabled(res)) return;
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_START_LIVE" });
    }

    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const rawLessonId = (req.body && (req.body.lessonId ?? req.body.lesson_id)) as unknown;
    let lesson: EduLesson | null = null;
    if (rawLessonId != null && rawLessonId !== "") {
      const lessonId = parseInt(String(rawLessonId), 10);
      if (!isNaN(lessonId)) {
        lesson = await lessonRepo().findOne({
          where: { id: lessonId, class: { id: classId } }
        });
        if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });
      }
    }

    let session = await liveRepo().findOne({
      where: { class: { id: classId }, status: "LIVE" },
      relations: ["class", "lesson"],
      order: { id: "DESC" }
    });

    if (!session) {
      // Fresh lesson — clear any stale breakout state from a previous one.
      closeBreakouts(classId);
      session = liveRepo().create({
        class: cls,
        lesson: lesson ?? null,
        roomName: newRoomName(classId),
        title: lesson?.title ?? null,
        status: "LIVE",
        startedBy: { id: req.userId } as User
      });
      session = await liveRepo().save(session);
      // Reload with relations for a consistent DTO.
      session = (await liveRepo().findOne({
        where: { id: session.id },
        relations: ["class", "lesson"]
      }))!;
    }

    const teacher = await userRepo().findOne({ where: { id: req.userId }, select: ["id", "username"] });
    const minted = await mintRoomToken({
      room: session.roomName,
      identity: teacherIdentity(req.userId),
      name: teacher?.username || "Teacher",
      role: "host"
    });

    disableCache(res);
    return res.json({ session: sessionDto(session), ...minted });
  } catch (error: any) {
    logger.error("[edu/live] start session failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Active session lookup, usable by the teacher (to see/resume) or by a student
 * of the class (to know a lesson is live and show a Join button). No token is
 * returned here — callers obtain one via the join endpoint.
 */
router.get("/classes/:classId/live-sessions/active", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await resolveClassAccess(req, res, classId);
    if (!access) return;

    const session = await liveRepo().findOne({
      where: { class: { id: classId }, status: "LIVE" },
      relations: ["class", "lesson"],
      order: { id: "DESC" }
    });

    disableCache(res);
    return res.json({ session: session ? sessionDto(session) : null, enabled: isLiveClassroomEnabled() });
  } catch (error: any) {
    logger.error("[edu/live] active lookup failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Mint a join token for a session. Teacher-of-class (or admin) joins as host;
 * a student of the session's class joins as participant. Anyone else is denied.
 */
router.post("/live-sessions/:id/join", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireEnabled(res)) return;
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: "INVALID_ID" });

    const session = await liveRepo().findOne({
      where: { id: sessionId },
      relations: ["class", "lesson"]
    });
    if (!session || !session.class) return res.status(404).json({ message: "SESSION_NOT_FOUND" });
    if (session.status !== "LIVE") return res.status(409).json({ message: "SESSION_ENDED" });

    let role: LiveRole;
    let identity: string;
    let name: string;

    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
      if (!student || student.class?.id !== session.class.id) {
        return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });
      }
      role = "participant";
      identity = studentIdentity(student.id);
      name = `${student.lastName ?? ""} ${student.firstName ?? ""}`.trim() || `#${student.id}`;
    } else if (req.userId) {
      const cls = await loadTeacherClass(req, session.class.id);
      if (!cls) return res.status(403).json({ message: "NOT_CLASS_TEACHER" });
      const teacher = await userRepo().findOne({ where: { id: req.userId }, select: ["id", "username"] });
      role = "host";
      identity = teacherIdentity(req.userId);
      name = teacher?.username || "Teacher";
    } else {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const minted = await mintRoomToken({ room: session.roomName, identity, name, role });
    disableCache(res);
    return res.json({ session: sessionDto(session), ...minted });
  } catch (error: any) {
    logger.error("[edu/live] join failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Teacher ends the live session. The LiveKit room itself drains as participants
 * disconnect; we mark the durable record ENDED so it stops surfacing as active.
 */
router.post("/live-sessions/:id/end", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_END_LIVE" });
    }
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: "INVALID_ID" });

    const session = await liveRepo().findOne({
      where: { id: sessionId },
      relations: ["class", "lesson"]
    });
    if (!session || !session.class) return res.status(404).json({ message: "SESSION_NOT_FOUND" });

    const cls = await loadTeacherClass(req, session.class.id);
    if (!cls) return res.status(403).json({ message: "NOT_CLASS_TEACHER" });

    if (session.status === "LIVE") {
      session.status = "ENDED";
      session.endedAt = new Date();
      await liveRepo().save(session);
      // Tear down any breakout rooms so they don't linger into the next lesson.
      closeBreakouts(session.class.id);
    }

    disableCache(res);
    return res.json({ session: sessionDto(session) });
  } catch (error: any) {
    logger.error("[edu/live] end session failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

type LiveOverviewStudentRow = ReturnType<typeof buildLiveSnapshot>["students"][number] & {
  currentTaskTitle: string | null;
};

interface LiveOverviewResult {
  totals: ReturnType<typeof buildLiveSnapshot>["totals"];
  students: LiveOverviewStudentRow[];
  generatedAtMs: number;
}

/**
 * Shared aggregation behind the live heatmap and the AI suffler: for each
 * student in the class, their most recent coding activity across ANY task in
 * the recent window, mapped to a status plus the task they're on.
 */
async function computeLiveOverview(classId: number): Promise<LiveOverviewResult> {
  const students = await studentRepo().find({ where: { class: { id: classId } } });
  if (students.length === 0) {
    return { totals: { not_started: 0, in_progress: 0, stuck: 0, passed: 0 }, students: [], generatedAtMs: Date.now() };
  }

  const roster: LiveStudent[] = students.map((s) => ({
    studentId: s.id,
    name: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || `#${s.id}`
  }));

  const studentIds = students.map((s) => s.id);
  const since = new Date(Date.now() - LIVE_OVERVIEW_WINDOW_MS);

  // Newest-first so the first row seen per student is their latest activity.
  const grades = await gradeRepo()
    .createQueryBuilder("g")
    .leftJoinAndSelect("g.student", "student")
    .leftJoinAndSelect("g.task", "task")
    .leftJoinAndSelect("g.topicTask", "topicTask")
    .where("student.id IN (:...studentIds)", { studentIds })
    .andWhere("g.updated_at >= :since", { since })
    .orderBy("g.updated_at", "DESC")
    .getMany();

  const attempts: LiveAttempt[] = [];
  const currentTaskByStudent = new Map<number, string | null>();
  for (const g of grades) {
    const sid = g.student?.id;
    if (!sid) continue;
    if (currentTaskByStudent.has(sid)) continue; // keep only the latest per student
    const tp = Number(g.testsPassed ?? 0);
    const tt = Number(g.testsTotal ?? 0);
    attempts.push({
      studentId: sid,
      verdict: tt > 0 && tp >= tt ? "AC" : "WA",
      testsPassed: tp,
      testsTotal: tt,
      updatedAtMs: g.updatedAt ? new Date(g.updatedAt).getTime() : null
    });
    currentTaskByStudent.set(sid, g.task?.title ?? g.topicTask?.title ?? null);
  }

  const snapshot = buildLiveSnapshot(roster, attempts, Date.now());
  const studentsWithTask = snapshot.students.map((s) => ({
    ...s,
    currentTaskTitle: currentTaskByStudent.get(s.studentId) ?? null
  }));

  return { totals: snapshot.totals, students: studentsWithTask, generatedAtMs: snapshot.generatedAtMs };
}

/**
 * Class-wide live code overview — the teacher's heatmap next to the video: who
 * needs help right now, without asking. Teacher-of-class (or admin) only.
 */
router.get("/classes/:classId/live-overview", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_LIVE" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const overview = await computeLiveOverview(classId);
    disableCache(res);
    return res.json(overview);
  } catch (error: any) {
    logger.error("[edu/live] overview failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Student publishes a snapshot of their current editor content. Stored only
 * while a live session is running for their class (otherwise silently skipped),
 * so editor streaming is scoped to an actual lesson rather than always-on. The
 * snapshot is ephemeral and read back by the teacher's live room view.
 */
router.post("/tasks/:taskId/live-code", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_PUBLISH_CODE" });
    }
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({ message: "INVALID_ID" });

    const code = typeof req.body?.code === "string" ? req.body.code : "";
    const taskTitle = typeof req.body?.taskTitle === "string" ? req.body.taskTitle.slice(0, 255) : null;

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || !student.class) return res.status(204).end();

    const liveSession = await liveRepo().findOne({
      where: { class: { id: student.class.id }, status: "LIVE" }
    });
    if (!liveSession) return res.status(204).end(); // no live lesson → don't stream

    setLiveCode(student.id, { classId: student.class.id, taskId, taskTitle, code });
    return res.status(204).end();
  } catch (error: any) {
    logger.error("[edu/live] publish code failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Teacher reads a student's latest editor snapshot — the read-only code stream
 * behind clicking a student in the live panel. Teacher-of-class (or admin) only,
 * and only for a student that belongs to the class.
 */
router.get("/classes/:classId/students/:studentId/live-code", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_LIVE" });
    }
    const classId = parseInt(req.params.classId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(classId) || isNaN(studentId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const student = await studentRepo().findOne({ where: { id: studentId, class: { id: classId } } });
    if (!student) return res.status(404).json({ message: "STUDENT_NOT_FOUND" });

    const snap = getLiveCode(studentId);
    disableCache(res);
    if (!snap || snap.classId !== classId) {
      return res.json({ snapshot: null });
    }
    return res.json({
      snapshot: {
        code: snap.code,
        taskId: snap.taskId,
        taskTitle: snap.taskTitle,
        updatedAtMs: snap.updatedAtMs
      }
    });
  } catch (error: any) {
    logger.error("[edu/live] read code failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Lightweight task picker for the challenge launcher: CODE tasks belonging to
 * the class (via lesson), most recent first. Teacher-of-class (or admin) only.
 */
router.get("/classes/:classId/practice-tasks", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    // Only tasks students can actually open: closed tasks can't be solved
    // (canEdit is false), so a challenge over one would never populate the
    // leaderboard.
    const tasks = await taskRepo().find({
      where: { taskMode: "CODE", isClosed: false, lesson: { class: { id: classId } } },
      relations: ["lesson"],
      order: { id: "DESC" },
      take: 100
    });

    disableCache(res);
    return res.json({
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, lessonTitle: t.lesson?.title ?? null }))
    });
  } catch (error: any) {
    logger.error("[edu/live] list practice tasks failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Teacher fires a timed live challenge over an existing CODE task. Students
 * solve it through the normal task/judge flow; passes after the start time are
 * ranked on the leaderboard. One active challenge per class; requires a LIVE
 * session so challenges only happen inside a lesson.
 */
router.post("/classes/:classId/live-challenges", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_START_CHALLENGE" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const liveSession = await liveRepo().findOne({ where: { class: { id: classId }, status: "LIVE" } });
    if (!liveSession) return res.status(409).json({ message: "NO_LIVE_SESSION" });

    const taskId = parseInt(String(req.body?.taskId ?? ""), 10);
    if (isNaN(taskId)) return res.status(400).json({ message: "INVALID_TASK_ID" });

    const rawDuration = parseInt(String(req.body?.durationSec ?? ""), 10);
    const durationSec = Number.isFinite(rawDuration) ? Math.max(15, Math.min(600, rawDuration)) : 90;

    const task = await taskRepo().findOne({ where: { id: taskId, isClosed: false, lesson: { class: { id: classId } } } });
    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

    const challenge = startChallenge({ classId, taskId, taskTitle: task.title, durationSec });
    disableCache(res);
    return res.json({ challenge: challengeDto(challenge) });
  } catch (error: any) {
    logger.error("[edu/live] start challenge failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Current active challenge for the class (teacher or enrolled student). */
router.get("/classes/:classId/live-challenges/active", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await resolveClassAccess(req, res, classId);
    if (!access) return;

    const challenge = getChallenge(classId);
    disableCache(res);
    return res.json({ challenge: challenge ? challengeDto(challenge) : null });
  } catch (error: any) {
    logger.error("[edu/live] active challenge failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Live leaderboard for the active challenge: students who reached AC on the
 * challenge task after it started, ranked by when they passed. Reads edu_grades
 * (one latest row per student/task), so re-solving refreshes the pass time.
 */
router.get("/classes/:classId/live-challenges/leaderboard", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await resolveClassAccess(req, res, classId);
    if (!access) return;

    const challenge = getChallenge(classId);
    if (!challenge) {
      disableCache(res);
      return res.json({ challenge: null, entries: [], generatedAtMs: Date.now() });
    }

    const students = await studentRepo().find({ where: { class: { id: classId } } });
    const nameById = new Map<number, string>();
    for (const s of students) {
      nameById.set(s.id, `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || `#${s.id}`);
    }

    const since = new Date(challenge.startedAtMs);
    const grades = await gradeRepo()
      .createQueryBuilder("g")
      .leftJoinAndSelect("g.student", "student")
      .where("g.task_id = :taskId", { taskId: challenge.taskId })
      .andWhere("g.updated_at >= :since", { since })
      .getMany();

    const entries = grades
      .filter((g) => g.student && nameById.has(g.student.id))
      .filter((g) => Number(g.testsTotal ?? 0) > 0 && Number(g.testsPassed ?? 0) >= Number(g.testsTotal ?? 0))
      .map((g) => {
        const passedAtMs = g.updatedAt ? new Date(g.updatedAt).getTime() : challenge.startedAtMs;
        return {
          studentId: g.student.id,
          name: nameById.get(g.student.id)!,
          passedAtMs,
          solveSeconds: Math.max(0, Math.round((passedAtMs - challenge.startedAtMs) / 1000))
        };
      })
      .sort((a, b) => a.passedAtMs - b.passedAtMs);

    disableCache(res);
    return res.json({ challenge: challengeDto(challenge), entries, generatedAtMs: Date.now() });
  } catch (error: any) {
    logger.error("[edu/live] challenge leaderboard failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Lessons of the class for the in-room materials picker (teacher attaches a
 * lesson to the live session so its theory/tasks show beside the video).
 */
router.get("/classes/:classId/lessons-list", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const lessons = await lessonRepo().find({
      where: { class: { id: classId } },
      order: { id: "DESC" },
      take: 200
    });
    disableCache(res);
    return res.json({ lessons: lessons.map((l) => ({ id: l.id, title: l.title, type: l.type })) });
  } catch (error: any) {
    logger.error("[edu/live] lessons-list failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Teacher attaches (or detaches) a lesson to the live session. */
router.put("/live-sessions/:id/lesson", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: "INVALID_ID" });

    const session = await liveRepo().findOne({ where: { id: sessionId }, relations: ["class", "lesson"] });
    if (!session || !session.class) return res.status(404).json({ message: "SESSION_NOT_FOUND" });

    const cls = await loadTeacherClass(req, session.class.id);
    if (!cls) return res.status(403).json({ message: "NOT_CLASS_TEACHER" });

    const rawLessonId = req.body?.lessonId;
    if (rawLessonId == null) {
      session.lesson = null;
    } else {
      const lessonId = parseInt(String(rawLessonId), 10);
      if (isNaN(lessonId)) return res.status(400).json({ message: "INVALID_LESSON_ID" });
      const lesson = await lessonRepo().findOne({ where: { id: lessonId, class: { id: session.class.id } } });
      if (!lesson) return res.status(404).json({ message: "LESSON_NOT_FOUND" });
      session.lesson = lesson;
      session.title = lesson.title;
    }
    await liveRepo().save(session);

    const fresh = (await liveRepo().findOne({ where: { id: sessionId }, relations: ["class", "lesson"] }))!;
    disableCache(res);
    return res.json({ session: sessionDto(fresh) });
  } catch (error: any) {
    logger.error("[edu/live] attach lesson failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * Lesson materials for the session's attached lesson — theory + task list —
 * readable by the teacher or any student of the class. The in-room panel that
 * makes a live session feel like an actual lesson, not just a video call.
 */
router.get("/live-sessions/:id/materials", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const sessionId = parseInt(req.params.id, 10);
    if (isNaN(sessionId)) return res.status(400).json({ message: "INVALID_ID" });

    const session = await liveRepo().findOne({ where: { id: sessionId }, relations: ["class", "lesson"] });
    if (!session || !session.class) return res.status(404).json({ message: "SESSION_NOT_FOUND" });

    const access = await resolveClassAccess(req, res, session.class.id);
    if (!access) return;

    if (!session.lesson) {
      disableCache(res);
      return res.json({ lessonId: null, title: null, theory: null, hasTheory: false, tasks: [] });
    }

    const lesson = await lessonRepo().findOne({ where: { id: session.lesson.id }, relations: ["tasks"] });
    disableCache(res);
    return res.json({
      lessonId: lesson?.id ?? null,
      title: lesson?.title ?? null,
      theory: lesson?.hasTheory ? lesson?.theory ?? null : null,
      hasTheory: Boolean(lesson?.hasTheory && lesson?.theory),
      tasks: (lesson?.tasks ?? []).map((t) => ({ id: t.id, title: t.title }))
    });
  } catch (error: any) {
    logger.error("[edu/live] materials failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * AI suffler: on-demand teacher briefing for the live lesson. Builds the same
 * live overview, derives deterministic signals (stuck clusters, idle students,
 * readiness), then asks the LLM for a short diagnosis + concrete actions — with
 * a rule-based fallback so it always returns something even if AI is down. This
 * is on-demand (a button), not polled, to keep AI cost/latency off the hot path.
 */
router.post("/classes/:classId/live-copilot", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const overview = await computeLiveOverview(classId);
    const signals = buildLiveSignals(
      overview.students.map((s) => ({
        studentId: s.studentId,
        name: s.name,
        status: s.status,
        currentTaskTitle: s.currentTaskTitle
      }))
    );
    const locale = resolveUiLocaleFromHeaders(req.headers, "uk");
    const briefing = await generateLiveBriefing(signals, locale);

    disableCache(res);
    return res.json({ signals, briefing, totals: overview.totals, generatedAtMs: Date.now() });
  } catch (error: any) {
    logger.error("[edu/live] copilot failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Teacher ends the active challenge. */
router.post("/classes/:classId/live-challenges/end", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_END_CHALLENGE" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    endChallenge(classId);
    disableCache(res);
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[edu/live] end challenge failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// ---- Breakout rooms -------------------------------------------------------

async function buildBreakoutDto(state: BreakoutState) {
  const students = await studentRepo().find({ where: { class: { id: state.classId } } });
  const nameById = new Map<number, string>();
  for (const s of students) {
    nameById.set(s.id, `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || `#${s.id}`);
  }
  return {
    groups: state.groups.map((g) => ({
      index: g.index,
      students: g.studentIds.map((id) => ({ id, name: nameById.get(id) ?? `#${id}` }))
    }))
  };
}

/**
 * Teacher opens breakout rooms: splits the class roster round-robin into N
 * groups, each its own LiveKit room. Requires a live session.
 */
router.post("/classes/:classId/breakouts", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireEnabled(res)) return;
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_OPEN_BREAKOUTS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const liveSession = await liveRepo().findOne({ where: { class: { id: classId }, status: "LIVE" } });
    if (!liveSession) return res.status(409).json({ message: "NO_LIVE_SESSION" });

    const count = parseInt(String(req.body?.count ?? ""), 10);
    const students = await studentRepo().find({ where: { class: { id: classId } } });
    const state = openBreakouts(classId, Number.isFinite(count) ? count : 2, students.map((s) => s.id));

    disableCache(res);
    return res.json(await buildBreakoutDto(state));
  } catch (error: any) {
    logger.error("[edu/live] open breakouts failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Current breakout state (teacher or enrolled student); student also gets their group index. */
router.get("/classes/:classId/breakouts", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const access = await resolveClassAccess(req, res, classId);
    if (!access) return;

    const state = getBreakouts(classId);
    disableCache(res);
    if (!state) return res.json({ active: false, groups: [], myGroupIndex: null });

    const dto = await buildBreakoutDto(state);
    const myGroupIndex =
      req.userType === "STUDENT" && req.studentId ? findStudentGroup(classId, req.studentId)?.index ?? null : null;
    return res.json({ active: true, ...dto, myGroupIndex });
  } catch (error: any) {
    logger.error("[edu/live] get breakouts failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Student fetches a join token for their assigned breakout room (if any). */
router.get("/classes/:classId/breakouts/my-token", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireEnabled(res)) return;
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || student.class?.id !== classId) return res.status(403).json({ message: "NOT_A_CLASS_MEMBER" });

    const group = findStudentGroup(classId, req.studentId);
    disableCache(res);
    if (!group) return res.json({ active: false });

    const minted = await mintRoomToken({
      room: group.roomName,
      identity: studentIdentity(req.studentId),
      name: `${student.lastName ?? ""} ${student.firstName ?? ""}`.trim() || `#${student.id}`,
      role: "participant"
    });
    return res.json({ active: true, groupIndex: group.index, ...minted });
  } catch (error: any) {
    logger.error("[edu/live] breakout my-token failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Teacher fetches a host token to hop into a specific breakout group. */
router.post("/classes/:classId/breakouts/token/:index", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!requireEnabled(res)) return;
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    const index = parseInt(req.params.index, 10);
    if (isNaN(classId) || isNaN(index)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    const group = getGroup(classId, index);
    if (!group) return res.status(404).json({ message: "GROUP_NOT_FOUND" });

    const teacher = await userRepo().findOne({ where: { id: req.userId }, select: ["id", "username"] });
    const minted = await mintRoomToken({
      room: group.roomName,
      identity: teacherIdentity(req.userId),
      name: teacher?.username || "Teacher",
      role: "host"
    });
    disableCache(res);
    return res.json({ groupIndex: group.index, ...minted });
  } catch (error: any) {
    logger.error("[edu/live] breakout teacher token failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

/** Teacher closes all breakout rooms; everyone returns to the main room. */
router.post("/classes/:classId/breakouts/close", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId || !req.userId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({ message: "INVALID_ID" });

    const cls = await loadTeacherClass(req, classId);
    if (!cls) return res.status(404).json({ message: "CLASS_NOT_FOUND" });

    closeBreakouts(classId);
    disableCache(res);
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[edu/live] close breakouts failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
