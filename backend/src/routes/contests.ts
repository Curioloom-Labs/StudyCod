import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { authOptional, authRequired, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { Contest, type ContestVisibility } from "../entities/Contest";
import { ContestProblem } from "../entities/ContestProblem";
import { ContestParticipant } from "../entities/ContestParticipant";
import { ContestSubmission } from "../entities/ContestSubmission";
import { User } from "../entities/User";
import { Student } from "../entities/Student";
import { Class } from "../entities/Class";
import { LibraryTask } from "../entities/LibraryTask";
import { TestData } from "../entities/TestData";
import { judgeWithSemaphore } from "../services/judgeWorker";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1 } from "../utils/multiFileSubmission";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";

const contestsRouter = Router();

const contestRepo = () => AppDataSource.getRepository(Contest);
const problemRepo = () => AppDataSource.getRepository(ContestProblem);
const participantRepo = () => AppDataSource.getRepository(ContestParticipant);
const submissionRepo = () => AppDataSource.getRepository(ContestSubmission);
const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const classRepo = () => AppDataSource.getRepository(Class);
const libraryRepo = () => AppDataSource.getRepository(LibraryTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);

const ALL_JUDGE_LANGS = ["java", "python", "cpp", "c", "csharp", "kotlin"] as const;
type JudgeLanguage = (typeof ALL_JUDGE_LANGS)[number];

function normalizeJudgeLanguage(raw: unknown): JudgeLanguage | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return (ALL_JUDGE_LANGS as readonly string[]).includes(s) ? (s as JudgeLanguage) : null;
}

function entryFileForJudgeLanguage(lang: JudgeLanguage): string {
  switch (lang) {
    case "java":
      return "Main.java";
    case "python":
      return "main.py";
    case "cpp":
      return "main.cpp";
    case "c":
      return "main.c";
    case "csharp":
      return "main.cs";
    case "kotlin":
      return "main.kt";
  }
}

type ApiCodeFile = { path: string; content: string };
function normalizeApiFiles(raw: unknown): ApiCodeFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiCodeFile[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const p = typeof (f as any).path === "string" ? (f as any).path.trim() : "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    if (p.includes("/") || p.includes("\\") || p.includes("..") || p.startsWith(".")) continue;
    out.push({ path: p, content: c });
  }
  const byPath = new Map<string, ApiCodeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}

function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some((s) => {
    const text = String(s ?? "").trim();
    if (!text) return false;
    return /[-+]?\d+\.\d+/.test(text) || /[-+]?\d+(?:\.\d+)?[eE][-+]?\d+/.test(text);
  });
  return hasFloatLike ? { type: "float", epsilon: 1e-6 } : { type: "whitespace" };
}

function getAllowedJudgeLanguages(task: LibraryTask): JudgeLanguage[] {
  const raw = Array.isArray((task as any).allowedLanguages) ? (task as any).allowedLanguages : null;
  const normalized = (raw || [])
    .map((x: any) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set<JudgeLanguage>();
  for (const x of normalized) {
    if ((ALL_JUDGE_LANGS as readonly string[]).includes(x)) allowed.add(x as JudgeLanguage);
  }
  if (allowed.size > 0) return Array.from(allowed);
  return Array.from(ALL_JUDGE_LANGS) as JudgeLanguage[];
}

function isNowWithinContest(contest: Contest): boolean {
  const now = Date.now();
  const startOk = !contest.startsAt || now >= new Date(contest.startsAt).getTime();
  const endOk = !contest.endsAt || now <= new Date(contest.endsAt).getTime();
  return startOk && endOk;
}

function getContestTimeState(contest: Contest): { started: boolean; finished: boolean; active: boolean } {
  const now = Date.now();
  const startsAtMs = contest.startsAt ? new Date(contest.startsAt).getTime() : null;
  const endsAtMs = contest.endsAt ? new Date(contest.endsAt).getTime() : null;
  const started = startsAtMs === null ? true : now >= startsAtMs;
  const finished = endsAtMs === null ? false : now > endsAtMs;
  const active = started && !finished;
  return { started, finished, active };
}

async function canViewContestMeta(params: { contest: Contest; req: AuthRequest }): Promise<boolean> {
  const { contest, req } = params;

  // Unpublished: only creator/admin.
  if (contest.isPublished === false) {
    if (req.userRole === "SYSTEM_ADMIN" && req.userId) return true;
    if (req.userId && (contest as any)?.createdBy?.id === req.userId) return true;
    if (req.userId) {
      const row = await contestRepo().findOne({ where: { id: contest.id } as any, relations: ["createdBy"] as any });
      if (row?.createdBy?.id === req.userId) return true;
    }
    return false;
  }

  if (contest.visibility === "PUBLIC") return true;
  // PRIVATE_CODE: don't leak contest existence/details to users who haven't joined.
  if (contest.visibility === "PRIVATE_CODE") return canAccessContest({ contest, req });

  // CLASS contests: avoid leaking existence to unauth / unrelated users.
  return canAccessContest({ contest, req });
}

async function getOrCreateParticipant(params: { contestId: number; req: AuthRequest }): Promise<ContestParticipant> {
  const principalId = params.req.userId ?? params.req.studentId ?? null;
  const principalType = params.req.userId ? ("USER" as const) : (params.req.studentId ? ("STUDENT" as const) : null);
  if (!principalId || !principalType) throw new HttpError(401, "UNAUTHORIZED", { expose: true });

  const existing = await participantRepo().findOne({
    where: {
      contest: { id: params.contestId } as any,
      ...(principalType === "USER" ? { user: { id: principalId } as any } : { student: { id: principalId } as any }),
    } as any,
  });
  if (existing) return existing;

  const displayName = await (async () => {
    if (principalType === "USER") {
      const u = await userRepo().findOne({ where: { id: principalId } as any });
      const name = String(u?.username ?? "").trim();
      return name || `user_${principalId}`;
    }
    const s = await studentRepo().findOne({ where: { id: principalId } as any });
    const n = `${String(s?.lastName ?? "").trim()} ${String(s?.firstName ?? "").trim()}`.trim();
    return n || `student_${principalId}`;
  })();

  const created: ContestParticipant = participantRepo().create();
  Object.assign(created, {
    contest: { id: params.contestId } as any,
    principalType,
    displayName,
    ...(principalType === "USER" ? { user: { id: principalId } as any } : { student: { id: principalId } as any }),
  });
  const saved: ContestParticipant = await participantRepo().save(created as any);
  return saved;
}

async function canAccessContest(params: { contest: Contest; req: AuthRequest }): Promise<boolean> {
  const { contest, req } = params;
  if (contest.isPublished === false) {
    // Only creator and SYSTEM_ADMIN can see unpublished contests.
    if (req.userRole === "SYSTEM_ADMIN" && req.userId) return true;
    if (req.userId && (contest as any)?.createdBy?.id === req.userId) return true;
    // If creator relation wasn't loaded, check by id.
    if (req.userId) {
      const row = await contestRepo().findOne({ where: { id: contest.id } as any, relations: ["createdBy"] as any });
      if (row?.createdBy?.id === req.userId) return true;
    }
    return false;
  }

  if (contest.visibility === "PUBLIC") return true;

  // For PRIVATE_CODE and CLASS: require auth and either joined or eligible.
  const principalId = req.userId ?? req.studentId ?? null;
  if (!principalId) return false;

  // Creator/admin can always access.
  if (req.userRole === "SYSTEM_ADMIN" && req.userId) return true;
  if (req.userId) {
    const row = (contest as any)?.createdBy?.id ? contest : await contestRepo().findOne({ where: { id: contest.id } as any, relations: ["createdBy"] as any });
    if ((row as any)?.createdBy?.id === req.userId) return true;
  }

  if (contest.visibility === "CLASS") {
    if (req.studentId) {
      const s = await studentRepo().findOne({ where: { id: req.studentId } as any, relations: ["class"] as any });
      const classId = (contest as any)?.class?.id ?? (contest as any)?.class_id;
      if (s?.class?.id && classId && s.class.id === classId) return true;
    }
    if (req.userId) {
      const classId = (contest as any)?.class?.id ?? (contest as any)?.class_id;
      if (classId) {
        const c = await classRepo().findOne({ where: { id: classId } as any, relations: ["teacher"] as any });
        if (c?.teacher?.id === req.userId) return true;
      }
    }
  }

  // Joined participants can access.
  const p = await participantRepo().findOne({
    where: {
      contest: { id: contest.id } as any,
      ...(req.userId ? { user: { id: req.userId } as any } : { student: { id: req.studentId } as any }),
    } as any,
  });
  return !!p;
}

async function canManageContest(params: { contest: Contest; req: AuthRequest }): Promise<boolean> {
  const { contest, req } = params;
  if (req.userRole === "SYSTEM_ADMIN" && req.userId) return true;
  if (req.userId && (contest as any)?.createdBy?.id === req.userId) return true;
  if (req.userId) {
    const row = await contestRepo().findOne({ where: { id: contest.id } as any, relations: ["createdBy"] as any });
    if (row?.createdBy?.id === req.userId) return true;
  }
  return false;
}

function labelFromOrder(order: number): string {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (order >= 0 && order < base.length) return base[order];
  return `P${order + 1}`;
}

function scaleScoreToProblemPoints(rawScore: number, rawMax: number, problemPoints: number | null | undefined): { score: number; maxScore: number } {
  const s = Number(rawScore);
  const m = Number(rawMax);
  const p = Number(problemPoints ?? NaN);
  if (!Number.isFinite(p) || p <= 0) {
    return {
      score: Number.isFinite(s) ? s : 0,
      maxScore: Number.isFinite(m) && m > 0 ? m : 0,
    };
  }
  if (!Number.isFinite(m) || m <= 0) return { score: 0, maxScore: Math.floor(p) };
  const normalized = Number.isFinite(s) ? Math.max(0, Math.min(1, s / m)) : 0;
  const weightedMax = Math.floor(p);
  const weightedScore = Math.max(0, Math.min(weightedMax, Math.round(normalized * weightedMax)));
  return { score: weightedScore, maxScore: weightedMax };
}

async function getMaxScoreByLibraryTaskId(libraryTaskIds: number[]): Promise<Map<number, number>> {
  const ids = (libraryTaskIds || []).filter((x) => Number.isFinite(x) && x > 0);
  const uniq = Array.from(new Set(ids));
  const map = new Map<number, number>();
  if (uniq.length === 0) return map;

  const placeholders = uniq.map(() => "?").join(",");
  const rows = (await AppDataSource.query(
    `
    SELECT library_task_id as taskId,
           SUM(COALESCE(points, 1)) as maxScore
    FROM test_data
    WHERE library_task_id IN (${placeholders})
    GROUP BY library_task_id
    `,
    uniq
  )) as Array<any>;

  for (const r of rows || []) {
    const tid = Number(r.taskId);
    const sc = Number(r.maxScore);
    if (!Number.isFinite(tid) || tid <= 0) continue;
    map.set(tid, Number.isFinite(sc) && sc > 0 ? sc : 0);
  }
  return map;
}

// Public list
contestsRouter.get("/", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const shouldIncludeUnpublishedCandidates = Boolean(req.userId) || isAdmin;

    const findOptions: any = {
      order: { createdAt: "DESC" } as any,
      relations: ["createdBy", "class"] as any,
      take: 300,
    };
    if (!shouldIncludeUnpublishedCandidates) {
      findOptions.where = { isPublished: true } as any;
    }

    const contests = await contestRepo().find(findOptions);

    const visible: Contest[] = [];
    for (const c of contests) {
      const canMeta = await canViewContestMeta({ contest: c, req });
      if (canMeta) visible.push(c);
    }

    return res.json({
      contests: visible.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description ?? null,
        visibility: c.visibility,
        startsAt: c.startsAt ? new Date(c.startsAt).toISOString() : null,
        endsAt: c.endsAt ? new Date(c.endsAt).toISOString() : null,
        isPublished: c.isPublished,
        allowUpsolve: (c as any).allowUpsolve ?? true,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
        createdBy: c.createdBy ? { id: c.createdBy.id, username: c.createdBy.username } : null,
        classId: (c as any)?.class?.id ?? null,
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET / error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Join PRIVATE_CODE contest by code (without knowing contestId)
contestsRouter.post("/join-by-code", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const schema = z.object({ code: z.string().min(1).max(64) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "CODE_REQUIRED" });
    const provided = parsed.data.code.trim();
    if (!provided) return res.status(400).json({ message: "CODE_REQUIRED" });

    const contest = await contestRepo().findOne({
      where: { isPublished: true, visibility: "PRIVATE_CODE", joinCode: provided } as any,
      relations: ["createdBy", "class"] as any,
    });

    // Don't reveal anything: same response for wrong/unknown code.
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const participant = await getOrCreateParticipant({ contestId: contest.id, req });
    return res.json({ joined: true, contestId: contest.id, participantId: participant.id });
  } catch (error: any) {
    logger.error("[contests] POST /join-by-code error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Create contest (USER only)
contestsRouter.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") {
      return res.status(403).json({ message: "ONLY_USERS" });
    }

    const schema = z.object({
      title: z.string().min(3).max(255),
      description: z.string().max(50_000).optional(),
      visibility: z.enum(["PUBLIC", "PRIVATE_CODE", "CLASS"]).default("PUBLIC"),
      joinCode: z.string().min(4).max(64).optional(),
      classId: z.number().int().positive().optional(),
      startsAt: z.string().datetime().optional(),
      endsAt: z.string().datetime().optional(),
      isPublished: z.boolean().optional(),
      allowUpsolve: z.boolean().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }
    const data = parsed.data;

    if (data.visibility === "PRIVATE_CODE") {
      if (!data.joinCode) return res.status(400).json({ message: "JOIN_CODE_REQUIRED" });
    }
    if (data.visibility === "CLASS") {
      if (!data.classId) return res.status(400).json({ message: "CLASS_ID_REQUIRED" });
      const c = await classRepo().findOne({ where: { id: data.classId } as any, relations: ["teacher"] as any });
      if (!c) return res.status(404).json({ message: "CLASS_NOT_FOUND" });
      if (c.teacher.id !== req.userId && req.userRole !== "SYSTEM_ADMIN") {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    }

    const contest: Contest = contestRepo().create();
    Object.assign(contest, {
      createdBy: { id: req.userId } as any,
      title: data.title.trim(),
      description: data.description?.trim() ?? null,
      visibility: data.visibility as ContestVisibility,
      joinCode: data.visibility === "PRIVATE_CODE" ? String(data.joinCode).trim() : null,
      class: data.visibility === "CLASS" ? ({ id: data.classId } as any) : null,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      isPublished: typeof data.isPublished === "boolean" ? data.isPublished : false,
      allowUpsolve: typeof data.allowUpsolve === "boolean" ? data.allowUpsolve : true,
    });
    const saved: Contest = await contestRepo().save(contest as any);
    return res.json({ id: saved.id });
  } catch (error: any) {
    logger.error("[contests] POST / error", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Update contest basic settings (creator/admin)
contestsRouter.patch("/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") {
      return res.status(403).json({ message: "ONLY_USERS" });
    }

    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    if (contest.createdBy?.id !== req.userId && req.userRole !== "SYSTEM_ADMIN") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const schema = z
      .object({
        title: z.string().min(3).max(255).optional(),
        description: z.string().max(50_000).nullable().optional(),
        startsAt: z.string().datetime().nullable().optional(),
        endsAt: z.string().datetime().nullable().optional(),
        isPublished: z.boolean().optional(),
        allowUpsolve: z.boolean().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "EMPTY_PATCH" });

    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    }
    const data = parsed.data;

    const nextStartsAt = data.startsAt !== undefined ? (data.startsAt ? new Date(data.startsAt) : null) : contest.startsAt;
    const nextEndsAt = data.endsAt !== undefined ? (data.endsAt ? new Date(data.endsAt) : null) : contest.endsAt;
    if (nextStartsAt && nextEndsAt && nextEndsAt.getTime() < nextStartsAt.getTime()) {
      return res.status(400).json({ message: "END_BEFORE_START" });
    }

    if (data.title !== undefined) contest.title = data.title.trim();
    if (data.description !== undefined) contest.description = data.description === null ? null : data.description.trim();
    if (data.startsAt !== undefined) contest.startsAt = nextStartsAt;
    if (data.endsAt !== undefined) contest.endsAt = nextEndsAt;
    if (data.isPublished !== undefined) contest.isPublished = data.isPublished;
    if (data.allowUpsolve !== undefined) (contest as any).allowUpsolve = data.allowUpsolve;

    const saved = await contestRepo().save(contest as any);
    return res.json({
      id: saved.id,
      isPublished: saved.isPublished,
      title: saved.title,
      startsAt: saved.startsAt ? new Date(saved.startsAt).toISOString() : null,
      endsAt: saved.endsAt ? new Date(saved.endsAt).toISOString() : null,
      allowUpsolve: (saved as any).allowUpsolve ?? true,
    });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id error", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Contest details + problems list
contestsRouter.get("/:id", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const canMeta = await canViewContestMeta({ contest, req });
    if (!canMeta) return res.status(403).json({ message: "ACCESS_DENIED" });

    const canContent = await canAccessContest({ contest, req });

    const joined = await (async () => {
      const principalId = req.userId ?? req.studentId ?? null;
      if (!principalId) return null;
      return participantRepo().findOne({
        where: {
          contest: { id } as any,
          ...(req.userId ? { user: { id: req.userId } as any } : { student: { id: req.studentId } as any }),
        } as any,
      });
    })();
    const isJoined = !!joined;

    const problems = await problemRepo().find({
      where: { contest: { id } } as any,
      relations: ["libraryTask"] as any,
      order: { order: "ASC" } as any,
    });

    const now = Date.now();
    const startsAtMs = contest.startsAt ? new Date(contest.startsAt).getTime() : null;
    const endsAtMs = contest.endsAt ? new Date(contest.endsAt).getTime() : null;

    const isCreator = req.userId ? contest.createdBy?.id === req.userId : false;
    const isPrivileged = isCreator || req.userRole === "SYSTEM_ADMIN";
    const isBeforeStart = startsAtMs !== null && now < startsAtMs;

    // If contest hasn't started yet, hide problems for non-creator.
    // If contest requires joining (PRIVATE_CODE) and user hasn't joined, hide problems.
    const showProblems = (isPrivileged || !isBeforeStart) && (canContent || contest.visibility === "PUBLIC");

    return res.json({
      contest: {
        id: contest.id,
        title: contest.title,
        description: contest.description ?? null,
        visibility: contest.visibility,
        startsAt: contest.startsAt ? new Date(contest.startsAt).toISOString() : null,
        endsAt: contest.endsAt ? new Date(contest.endsAt).toISOString() : null,
        isPublished: contest.isPublished,
        allowUpsolve: (contest as any).allowUpsolve ?? true,
        createdBy: contest.createdBy ? { id: contest.createdBy.id, username: contest.createdBy.username } : null,
        classId: (contest as any)?.class?.id ?? null,
      },
      access: {
        canAccessContent: canContent,
        isJoined,
        joinRequired: contest.visibility === "PRIVATE_CODE" && !canContent,
        canManage: isPrivileged,
      },
      problems: showProblems
        ? problems.map((p) => ({
            id: p.id,
            order: p.order,
            label: p.label ?? labelFromOrder(p.order),
            points: (p as any).points ?? null,
            title: p.libraryTask?.title ?? "",
            libraryTaskId: (p.libraryTask as any)?.id ?? null,
          }))
        : problems.map((p) => ({
            id: p.id,
            order: p.order,
            label: p.label ?? labelFromOrder(p.order),
            points: (p as any).points ?? null,
            title: "(hidden until start)",
            libraryTaskId: null,
          })),
      serverTime: new Date().toISOString(),
      phase: {
        started: startsAtMs === null ? true : now >= startsAtMs,
        finished: endsAtMs === null ? false : now > endsAtMs,
      },
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Join contest
contestsRouter.post("/:id/join", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ message: "INVALID_ID" });
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const contest = await contestRepo().findOne({ where: { id } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    if (contest.isPublished === false && req.userRole !== "SYSTEM_ADMIN" && contest.createdBy?.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (contest.visibility === "PRIVATE_CODE") {
      const schema = z.object({ code: z.string().min(1).max(64) });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "CODE_REQUIRED" });
      const provided = parsed.data.code.trim();
      const expected = String(contest.joinCode ?? "").trim();
      if (!expected || provided !== expected) return res.status(403).json({ message: "INVALID_CODE" });
    }

    if (contest.visibility === "CLASS") {
      const classId = (contest as any)?.class?.id ?? null;
      if (!classId) return res.status(500).json({ message: "CONTEST_CLASS_MISSING" });
      if (req.studentId) {
        const s = await studentRepo().findOne({ where: { id: req.studentId } as any, relations: ["class"] as any });
        if (!s?.class?.id || s.class.id !== classId) return res.status(403).json({ message: "ACCESS_DENIED" });
      } else if (req.userId) {
        const c = await classRepo().findOne({ where: { id: classId } as any, relations: ["teacher"] as any });
        if (c?.teacher?.id !== req.userId && req.userRole !== "SYSTEM_ADMIN") return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    }

    const participant = await getOrCreateParticipant({ contestId: id, req });
    return res.json({ joined: true, participantId: participant.id });
  } catch (error: any) {
    logger.error("[contests] POST /:id/join error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: list participants and disqualification status
contestsRouter.get("/:id/admin/participants", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const participants = await participantRepo().find({
      where: { contest: { id: contestId } } as any,
      order: { joinedAt: "ASC" } as any,
    });

    return res.json({
      contestId,
      participants: participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        principalType: p.principalType,
        joinedAt: p.joinedAt ? new Date(p.joinedAt).toISOString() : null,
        isDisqualified: !!(p as any).isDisqualified,
        disqualificationReason: (p as any).disqualificationReason ?? null,
        disqualifiedAt: (p as any).disqualifiedAt ? new Date((p as any).disqualifiedAt).toISOString() : null,
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/participants error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: disqualify or restore participant
contestsRouter.patch("/:id/admin/participants/:participantId/disqualify", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(participantId) || participantId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ disqualified: z.boolean(), reason: z.string().max(2000).nullable().optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const participant = await participantRepo().findOne({ where: { id: participantId, contest: { id: contestId } } as any });
    if (!participant) return res.status(404).json({ message: "PARTICIPANT_NOT_FOUND" });

    (participant as any).isDisqualified = parsed.data.disqualified;
    (participant as any).disqualificationReason = parsed.data.disqualified ? (parsed.data.reason?.trim() || null) : null;
    (participant as any).disqualifiedAt = parsed.data.disqualified ? new Date() : null;
    const saved = await participantRepo().save(participant as any);

    return res.json({
      participant: {
        id: saved.id,
        isDisqualified: !!(saved as any).isDisqualified,
        disqualificationReason: (saved as any).disqualificationReason ?? null,
        disqualifiedAt: (saved as any).disqualifiedAt ? new Date((saved as any).disqualifiedAt).toISOString() : null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id/admin/participants/:participantId/disqualify error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: inspect submissions of specific participant
contestsRouter.get("/:id/admin/participants/:participantId/submissions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    const participantId = Number(req.params.participantId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(participantId) || participantId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const participant = await participantRepo().findOne({ where: { id: participantId, contest: { id: contestId } } as any });
    if (!participant) return res.status(404).json({ message: "PARTICIPANT_NOT_FOUND" });

    const limit = (() => {
      const n = Number((req.query as any)?.limit);
      if (!Number.isFinite(n)) return 100;
      return Math.max(1, Math.min(500, Math.floor(n)));
    })();

    const rows = (await AppDataSource.query(
      `
        SELECT s.id,
               s.created_at as createdAt,
               s.phase,
               s.language,
               s.verdict,
               s.score,
               s.max_score as maxScore,
               s.tests_passed as testsPassed,
               s.tests_total as testsTotal,
               s.compile_error_kind as compileErrorKind,
               s.submitted_code as submittedCode,
               cp.id as contestProblemId,
               cp.\`order\` as problemOrder,
               cp.label as problemLabel
        FROM contest_submissions s
        JOIN contest_problems cp ON cp.id = s.problem_id
        WHERE s.contest_id = ? AND s.participant_id = ?
        ORDER BY s.id DESC
        LIMIT ?
      `,
      [contestId, participantId, limit]
    )) as Array<any>;

    return res.json({
      contestId,
      participant: {
        id: participant.id,
        displayName: participant.displayName,
        principalType: participant.principalType,
        isDisqualified: !!(participant as any).isDisqualified,
      },
      submissions: rows.map((r) => ({
        id: Number(r.id),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        phase: r.phase === "UPSOLVE" ? "UPSOLVE" : "CONTEST",
        language: String(r.language ?? ""),
        verdict: r.verdict != null ? String(r.verdict) : null,
        score: r.score != null ? Number(r.score) : null,
        maxScore: r.maxScore != null ? Number(r.maxScore) : null,
        testsPassed: r.testsPassed != null ? Number(r.testsPassed) : null,
        testsTotal: r.testsTotal != null ? Number(r.testsTotal) : null,
        compileErrorKind: r.compileErrorKind != null ? String(r.compileErrorKind) : null,
        submittedCode: String(r.submittedCode ?? ""),
        problem: {
          id: Number(r.contestProblemId),
          order: Number(r.problemOrder ?? 0),
          label: String(r.problemLabel ?? labelFromOrder(Number(r.problemOrder ?? 0))),
        },
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/participants/:participantId/submissions error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Add problem to contest (creator/admin)
contestsRouter.post("/:id/problems", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    if (contest.createdBy.id !== req.userId && req.userRole !== "SYSTEM_ADMIN") return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.union([
      z.object({
        mode: z.literal("CREATE"),
        title: z.string().min(3).max(255),
        description: z.string().min(1).max(100_000),
        template: z.string().min(1).max(200_000),
        maxAttempts: z.number().int().min(1).max(100).optional(),
        difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
        tests: z.array(z.object({
          input: z.string(),
          expectedOutput: z.string(),
          isHidden: z.boolean().optional(),
          points: z.number().int().min(1).max(1000).optional(),
        })).optional(),
      }),
      z.object({ mode: z.literal("COPY"), libraryTaskId: z.number().int().positive() }),
    ]);
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const nextOrder = await problemRepo().count({ where: { contest: { id: contestId } } as any });

    const contestLocalTask: LibraryTask = await (async () => {
      if (parsed.data.mode === "CREATE") {
        const t: LibraryTask = libraryRepo().create();
        Object.assign(t, {
          author: { id: req.userId } as any,
          title: parsed.data.title.trim(),
          description: parsed.data.description.trim(),
          template: parsed.data.template,
          difficulty: parsed.data.difficulty ?? null,
          lang: "JAVA" as any,
          maxAttempts: parsed.data.maxAttempts ?? 999999,
          isHiddenFromLibrary: true,
          status: "DRAFT" as any,
        });
        const savedTask: LibraryTask = await libraryRepo().save(t as any);
        if (Array.isArray(parsed.data.tests) && parsed.data.tests.length > 0) {
          const rows: TestData[] = testDataRepo().create(
            parsed.data.tests.map((tt) => ({
              libraryTask: { id: savedTask.id } as any,
              input: String(tt.input ?? ""),
              expectedOutput: String(tt.expectedOutput ?? ""),
              isHidden: !!tt.isHidden,
              kind: (!!tt.isHidden ? "JUDGE" : "SAMPLE") as any,
              points: tt.points ?? 1,
            })) as any
          ) as any;
          await testDataRepo().save(rows as any);
        }
        return savedTask;
      }
      // COPY: snapshot into a new DRAFT library task owned by creator.
      const src = await libraryRepo().findOne({ where: { id: parsed.data.libraryTaskId } as any });
      if (!src) throw new HttpError(404, "LIBRARY_TASK_NOT_FOUND", { expose: true });
      const clone: LibraryTask = libraryRepo().create();
      Object.assign(clone, {
        author: { id: req.userId } as any,
        title: src.title,
        description: src.description,
        template: src.template,
        templatesByLanguage: (src as any).templatesByLanguage ?? null,
        difficulty: (src as any).difficulty ?? null,
        tags: (src as any).tags ?? null,
        section: (src as any).section ?? null,
        timeLimitMs: (src as any).timeLimitMs ?? null,
        memoryLimitMb: (src as any).memoryLimitMb ?? null,
        outputLimitKb: (src as any).outputLimitKb ?? null,
        checkerSpec: (src as any).checkerSpec ?? null,
        allowedLanguages: (src as any).allowedLanguages ?? null,
        lang: (src as any).lang ?? "JAVA",
        maxAttempts: 999999,
        isHiddenFromLibrary: true,
        status: "DRAFT" as any,
      });
      const savedClone: LibraryTask = await libraryRepo().save(clone as any);
      const tests = await testDataRepo().find({ where: { libraryTask: { id: src.id } } as any, order: { id: "ASC" } as any });
      if (tests.length) {
        const copied: TestData[] = testDataRepo().create(
          tests.map((t) => ({
            input: t.input,
            expectedOutput: t.expectedOutput,
            isHidden: t.isHidden,
            kind: (t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE"),
            points: t.points,
            libraryTask: { id: savedClone.id } as any,
          })) as any
        ) as any;
        await testDataRepo().save(copied as any);
      }
      return savedClone;
    })();

    const p: ContestProblem = problemRepo().create();
    Object.assign(p, {
      contest: { id: contestId } as any,
      libraryTask: { id: contestLocalTask.id } as any,
      order: nextOrder,
      label: labelFromOrder(nextOrder),
      points: null,
    });
    const saved: ContestProblem = await problemRepo().save(p as any);
    return res.json({ problemId: saved.id, libraryTaskId: contestLocalTask.id, order: saved.order, label: saved.label, points: (saved as any).points ?? null });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[contests] POST /:id/problems error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Update contest problem settings (label / points / order) (creator/admin)
contestsRouter.patch("/:id/problems/:problemId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.id);
    const problemId = Number(req.params.problemId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    if (contest.createdBy?.id !== req.userId && req.userRole !== "SYSTEM_ADMIN") return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z
      .object({
        label: z.string().min(1).max(8).nullable().optional(),
        points: z.number().int().min(1).max(100000).nullable().optional(),
        order: z.number().int().min(0).max(1000).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "EMPTY_PATCH" });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const data = parsed.data;

    const current = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any });
    if (!current) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });

    if (data.order !== undefined && data.order !== current.order) {
      const all = await problemRepo().find({ where: { contest: { id: contestId } } as any, order: { order: "ASC" } as any });
      const without = all.filter((x) => x.id !== current.id);
      const newIndex = Math.max(0, Math.min(without.length, data.order));
      without.splice(newIndex, 0, current);
      const orderedIds = without.map((x) => x.id);

      await AppDataSource.transaction(async (trx) => {
        // Phase 1: move all current orders out of the unique range.
        await trx.query("UPDATE contest_problems SET `order` = `order` + 10000 WHERE contest_id = ?", [contestId]);

        // Phase 2: assign final compact 0..N-1 orders.
        for (let i = 0; i < orderedIds.length; i++) {
          await trx.query(
            "UPDATE contest_problems SET `order` = ? WHERE id = ? AND contest_id = ?",
            [i, orderedIds[i], contestId]
          );
        }
      });
    }

    const fresh = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any });
    if (!fresh) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });

    if (data.label !== undefined) {
      const v = data.label === null ? null : data.label.trim();
      fresh.label = v && v.length > 0 ? v : null;
    }
    if (data.points !== undefined) {
      (fresh as any).points = data.points === null ? null : data.points;
    }

    const saved = await problemRepo().save(fresh as any);
    return res.json({
      problem: {
        id: saved.id,
        order: saved.order,
        label: saved.label ?? labelFromOrder(saved.order),
        points: (saved as any).points ?? null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id/problems/:problemId error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Problem statement (contest access enforced). Returns same level of detail as library task, but scoped.
contestsRouter.get("/:id/problems/:problemId", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    const problemId = Number(req.params.problemId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const isCreator = req.userId ? contest.createdBy?.id === req.userId : false;
    const isPrivileged = isCreator || req.userRole === "SYSTEM_ADMIN";
    const isBeforeStart = contest.startsAt ? Date.now() < new Date(contest.startsAt).getTime() : false;
    if (isBeforeStart && !isPrivileged) return res.status(403).json({ message: "CONTEST_NOT_STARTED" });

    const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any, relations: ["libraryTask"] as any });
    if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });

    const task = await libraryRepo().findOne({ where: { id: (problem.libraryTask as any).id } as any });
    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

    return res.json({
      problem: {
        id: problem.id,
        order: problem.order,
        label: problem.label ?? labelFromOrder(problem.order),
      },
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        template: task.template,
        templatesByLanguage: (task as any).templatesByLanguage ?? null,
        allowedLanguages: getAllowedJudgeLanguages(task),
        timeLimitMs: (task as any).timeLimitMs ?? null,
        memoryLimitMb: (task as any).memoryLimitMb ?? null,
        outputLimitKb: (task as any).outputLimitKb ?? null,
        checkerSpec: (task as any).checkerSpec ?? null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/problems/:problemId error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Run code inside contest on custom input (no submission saved, no scoreboard effect)
contestsRouter.post(
  "/:id/problems/:problemId/run",
  authRequired,
  submissionRateLimitMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const contestId = Number(req.params.id);
      const problemId = Number(req.params.problemId);
      if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
        return res.status(400).json({ message: "INVALID_ID" });
      }

      const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
      if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

      const allowed = await canAccessContest({ contest, req });
      if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

      const timeState = getContestTimeState(contest);
      const isPrivileged = req.userRole === "SYSTEM_ADMIN" || (req.userId && contest.createdBy?.id === req.userId);
      if (!timeState.started && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_NOT_STARTED" });
      }
      const allowUpsolve = (contest as any).allowUpsolve ?? true;
      if (!timeState.active && !(timeState.finished && allowUpsolve) && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_NOT_ACTIVE" });
      }

      const principalId = req.userId ?? req.studentId ?? null;
      if (principalId) {
        const existingParticipant = await participantRepo().findOne({
          where: {
            contest: { id: contestId } as any,
            ...(req.userId ? { user: { id: req.userId } as any } : { student: { id: req.studentId } as any }),
          } as any,
        });
        if (existingParticipant && (existingParticipant as any).isDisqualified) {
          return res.status(403).json({ message: "PARTICIPANT_DISQUALIFIED" });
        }
      }

      const schema = z.object({
        code: z.string().min(1).max(200_000).optional(),
        files: z.array(z.object({ path: z.string().min(1).max(120), content: z.string().max(200_000) })).max(64).optional(),
        language: z.string().optional(),
        input: z.string().max(200_000).optional(),
      }).refine((v) => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
        message: "code or files required",
      });
      const validated = schema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
      }

      const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any, relations: ["libraryTask"] as any });
      if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });
      const taskId = (problem.libraryTask as any)?.id;
      const task = await libraryRepo().findOne({ where: { id: taskId } as any, relations: ["author"] as any });
      if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

      const requested = normalizeJudgeLanguage(validated.data.language);
      const allowedLangs = getAllowedJudgeLanguages(task);
      const judgeLang: JudgeLanguage = requested ?? (allowedLangs[0] ?? "java");
      if (!allowedLangs.includes(judgeLang)) {
        return res.status(400).json({ message: "LANGUAGE_NOT_ALLOWED", allowedLanguages: allowedLangs });
      }

      const taskLimits = {
        time_limit_ms: Number.isFinite((task as any).timeLimitMs) && (task as any).timeLimitMs > 0 ? (task as any).timeLimitMs : undefined,
        memory_limit_mb: Number.isFinite((task as any).memoryLimitMb) && (task as any).memoryLimitMb > 0 ? (task as any).memoryLimitMb : undefined,
        output_limit_kb: Number.isFinite((task as any).outputLimitKb) && (task as any).outputLimitKb > 0 ? (task as any).outputLimitKb : undefined,
      };
      const defaultLimitsByLang: Record<JudgeLanguage, { time_limit_ms: number; memory_limit_mb: number; output_limit_kb: number }> = {
        java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
        python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
        cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
        c: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
        csharp: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
        kotlin: { time_limit_ms: 1400, memory_limit_mb: 384, output_limit_kb: 64 },
      };
      const effectiveLimits = {
        time_limit_ms: taskLimits.time_limit_ms ?? defaultLimitsByLang[judgeLang].time_limit_ms,
        memory_limit_mb: taskLimits.memory_limit_mb ?? defaultLimitsByLang[judgeLang].memory_limit_mb,
        output_limit_kb: taskLimits.output_limit_kb ?? defaultLimitsByLang[judgeLang].output_limit_kb,
      };

      const normalizedFiles = normalizeApiFiles((validated.data as any).files);
      const entryFile = entryFileForJudgeLanguage(judgeLang);
      const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
      const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
      let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
      const isMultiFile = effectiveFiles.length > 0;
      if (isMultiFile && !effectiveFiles.some((f) => f.path === entryFile)) {
        effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
      }
      const sourceText = isMultiFile ? (effectiveFiles.find((f) => f.path === entryFile)?.content ?? "") : providedCode;

      const workerReq: WorkerJudgeRequest = {
        submission_id: `contest_run_${contestId}_${problemId}_${Date.now()}`,
        language: judgeLang,
        source: sourceText,
        ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
        tests: [
          {
            id: "custom",
            input: String((validated.data as any).input ?? ""),
            output: "",
            hidden: false,
            group: "custom",
            weight: 1,
          },
        ],
        limits: effectiveLimits,
        checker: { type: "exact" },
        debug: true,
        rerun_failed_once: false,
        run_all: true,
      };

      let workerRes: WorkerJudgeResponse;
      try {
        workerRes = await judgeWithSemaphore(workerReq);
      } catch (e: any) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(503, "Judge unavailable", { code: "JUDGE_UNAVAILABLE", expose: true, cause: e });
      }

      if (workerRes.verdict === "CE" && workerRes.compile) {
        const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        const fallbackHint = "Compilation error. If the message is empty, the compiler/toolchain is likely missing in the sandbox rootfs.";
        return res.json({ stdout: "", stderr: (combined || fallbackHint).slice(0, 40_000), exitCode: 1, success: false });
      }

      const t0 = workerRes.tests?.[0];
      const stdout = (t0 as any)?.actual ?? "";
      const stderr = (t0 as any)?.stderr ?? "";
      const success = workerRes.verdict === "AC" || workerRes.verdict === "WA";
      return res.json({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: success ? 0 : 1, success });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ message: error.message, ...(error.details ? { details: error.details } : {}) });
      }
      logger.error("[contests] POST /:id/problems/:problemId/run error", { requestId: req.requestId, err: error });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

// Submit/check solution inside contest (IOI: record every submission, scoreboard uses best score per problem)
contestsRouter.post(
  "/:id/problems/:problemId/check",
  authRequired,
  submissionRateLimitMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const contestId = Number(req.params.id);
      const problemId = Number(req.params.problemId);
      if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
        return res.status(400).json({ message: "INVALID_ID" });
      }

      const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
      if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

      const allowed = await canAccessContest({ contest, req });
      if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

      const timeState = getContestTimeState(contest);
      if (!timeState.started) {
        return res.status(403).json({ message: "CONTEST_NOT_STARTED" });
      }
      const allowUpsolve = (contest as any).allowUpsolve ?? true;
      const submissionPhase: "CONTEST" | "UPSOLVE" = timeState.active ? "CONTEST" : (timeState.finished && allowUpsolve ? "UPSOLVE" : "CONTEST");
      if (!timeState.active && !(timeState.finished && allowUpsolve)) {
        return res.status(403).json({ message: "CONTEST_NOT_ACTIVE" });
      }

      const participant = await getOrCreateParticipant({ contestId, req });
      if ((participant as any).isDisqualified) {
        return res.status(403).json({ message: "PARTICIPANT_DISQUALIFIED" });
      }

      const schema = z
        .object({
          code: z.string().min(1).max(200_000).optional(),
          files: z.array(z.object({ path: z.string().min(1).max(120), content: z.string().max(200_000) })).max(64).optional(),
          language: z.string().optional(),
        })
        .refine((v) => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
          message: "code or files required",
        });
      const validated = schema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
      }

      const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any, relations: ["libraryTask"] as any });
      if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });
      const taskId = (problem.libraryTask as any)?.id;
      const task = await libraryRepo().findOne({ where: { id: taskId } as any, relations: ["author"] as any });
      if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

      const tests = await testDataRepo().find({ where: { libraryTask: { id: task.id } } as any, order: { id: "ASC" } as any });
      if (!tests.length) return res.status(400).json({ message: "NO_TESTS_DEFINED_FOR_THIS_TASK" });

      const requested = normalizeJudgeLanguage(validated.data.language);
      const allowedLangs = getAllowedJudgeLanguages(task);
      const judgeLang: JudgeLanguage = requested ?? (allowedLangs[0] ?? "java");
      if (!allowedLangs.includes(judgeLang)) {
        return res.status(400).json({ message: "LANGUAGE_NOT_ALLOWED", allowedLanguages: allowedLangs });
      }

      const taskLimits = {
        time_limit_ms: Number.isFinite((task as any).timeLimitMs) && (task as any).timeLimitMs > 0 ? (task as any).timeLimitMs : undefined,
        memory_limit_mb: Number.isFinite((task as any).memoryLimitMb) && (task as any).memoryLimitMb > 0 ? (task as any).memoryLimitMb : undefined,
        output_limit_kb: Number.isFinite((task as any).outputLimitKb) && (task as any).outputLimitKb > 0 ? (task as any).outputLimitKb : undefined,
      };
      const defaultLimitsByLang: Record<JudgeLanguage, { time_limit_ms: number; memory_limit_mb: number; output_limit_kb: number }> = {
        java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
        python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
        cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
        c: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
        csharp: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
        kotlin: { time_limit_ms: 1400, memory_limit_mb: 384, output_limit_kb: 64 },
      };
      const effectiveLimits = {
        time_limit_ms: taskLimits.time_limit_ms ?? defaultLimitsByLang[judgeLang].time_limit_ms,
        memory_limit_mb: taskLimits.memory_limit_mb ?? defaultLimitsByLang[judgeLang].memory_limit_mb,
        output_limit_kb: taskLimits.output_limit_kb ?? defaultLimitsByLang[judgeLang].output_limit_kb,
      };

      const explicitChecker = (task as any).checkerSpec as CheckerSpec | null | undefined;
      const effectiveChecker = explicitChecker ?? chooseDefaultCheckerFromExpectedOutputs(tests.map((t) => t.expectedOutput || ""));
      const maxScore = tests.reduce((sum, t) => sum + (t.points || 1), 0);

      const normalizedFiles = normalizeApiFiles((validated.data as any).files);
      const entryFile = entryFileForJudgeLanguage(judgeLang);
      const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
      const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
      let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
      const isMultiFile = effectiveFiles.length > 0;
      if (isMultiFile && !effectiveFiles.some((f) => f.path === entryFile)) {
        effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
      }
      const sourceText = isMultiFile ? (effectiveFiles.find((f) => f.path === entryFile)?.content ?? "") : providedCode;
      const persistedSubmitted = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;

      const principalTag = req.userType === "STUDENT" ? `student_${req.studentId}` : `user_${req.userId}`;
      const workerReq: WorkerJudgeRequest = {
        submission_id: `contest_${contestId}_${problemId}_${principalTag}_${Date.now()}`,
        language: judgeLang,
        source: sourceText,
        ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
        tests: tests.map((t) => ({
          id: t.id,
          input: t.input || "",
          output: t.expectedOutput || "",
          hidden: t.isHidden === true,
          group: t.isHidden === true ? "hidden" : "public",
          weight: t.points || 1,
        })),
        limits: effectiveLimits,
        checker: effectiveChecker,
        debug: false,
        rerun_failed_once: true,
        run_all: true,
      };

      let workerRes: WorkerJudgeResponse;
      try {
        workerRes = await judgeWithSemaphore(workerReq);
      } catch (e: any) {
        if (e instanceof HttpError) throw e;
        throw new HttpError(503, "Judge unavailable", { code: "JUDGE_UNAVAILABLE", expose: true, cause: e });
      }

      let totalPassed = 0;
      let totalScore = 0;
      let compileError: string | null = null;
      let compileErrorKind: string | null = null;

      if (workerRes.verdict === "CE" && workerRes.compile) {
        compileErrorKind = workerRes.compile.error_kind ?? null;
        const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        compileError = combined ? combined.slice(0, 40_000) : "Compilation error";
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const passed = r?.verdict === "AC";
          if (passed) {
            totalPassed++;
            totalScore += t.points || 1;
          }
        }
      }

      const scoringScore = typeof workerRes.score === "number" ? workerRes.score : totalScore;
      const scoringMaxScore = typeof workerRes.max_score === "number" ? workerRes.max_score : maxScore;
      const weighted = scaleScoreToProblemPoints(scoringScore, scoringMaxScore, (problem as any).points ?? null);

      const newSubmission: ContestSubmission = submissionRepo().create();
      Object.assign(newSubmission, {
        contest: { id: contestId } as any,
        problem: { id: problemId } as any,
        participant: { id: participant.id } as any,
        language: judgeLang,
        submittedCode: persistedSubmitted,
        verdict: workerRes.verdict ?? null,
        score: weighted.score,
        maxScore: weighted.maxScore,
        testsPassed: totalPassed,
        testsTotal: tests.length,
        compileErrorKind,
        phase: submissionPhase,
      });
      const saved: ContestSubmission = await submissionRepo().save(newSubmission as any);

      return res.json({
        submissionId: saved.id,
        phase: submissionPhase,
        verdict: workerRes.verdict ?? null,
        testsPassed: totalPassed,
        testsTotal: tests.length,
        score: weighted.score,
        maxScore: weighted.maxScore,
        compileError,
        compileErrorKind,
      });
    } catch (error: any) {
      if (error instanceof HttpError) {
        return res.status(error.statusCode).json({ message: error.message, ...(error.details ? { details: error.details } : {}) });
      }
      logger.error("[contests] POST /:id/problems/:problemId/check error", { requestId: req.requestId, err: error });
      return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
    }
  }
);

// Recent submissions for a contest problem (own only).
// Returns newest-first and includes phase (CONTEST/UPSOLVE).
contestsRouter.get("/:id/problems/:problemId/submissions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    const problemId = Number(req.params.problemId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    // Validate problem belongs to contest.
    const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any });
    if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });

    const participant = await getOrCreateParticipant({ contestId, req });
    const limit = (() => {
      const n = Number((req.query as any)?.limit);
      if (!Number.isFinite(n)) return 20;
      return Math.max(1, Math.min(50, Math.floor(n)));
    })();

    const rows = (await AppDataSource.query(
      `
        SELECT id,
               created_at as createdAt,
               phase,
               language,
               verdict,
               score,
               max_score as maxScore,
               tests_passed as testsPassed,
               tests_total as testsTotal,
               compile_error_kind as compileErrorKind
        FROM contest_submissions
        WHERE contest_id = ? AND problem_id = ? AND participant_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      [contestId, problemId, participant.id, limit]
    )) as Array<any>;

    return res.json({
      contestId,
      problemId,
      participantId: participant.id,
      submissions: rows.map((r) => ({
        id: Number(r.id),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        phase: (r.phase === "UPSOLVE" ? "UPSOLVE" : "CONTEST") as any,
        language: String(r.language ?? ""),
        verdict: r.verdict != null ? String(r.verdict) : null,
        score: r.score != null ? Number(r.score) : null,
        maxScore: r.maxScore != null ? Number(r.maxScore) : null,
        testsPassed: r.testsPassed != null ? Number(r.testsPassed) : null,
        testsTotal: r.testsTotal != null ? Number(r.testsTotal) : null,
        compileErrorKind: r.compileErrorKind != null ? String(r.compileErrorKind) : null,
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/problems/:problemId/submissions error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Per-problem progress summary for the current participant (used for e-olymp-like table).
// Includes best contest-phase score and last submission (any phase).
contestsRouter.get("/:id/my-progress", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const participant = await getOrCreateParticipant({ contestId, req });

    const problems = await problemRepo().find({
      where: { contest: { id: contestId } } as any,
      relations: ["libraryTask"] as any,
      order: { order: "ASC" } as any,
    });

    // Max score per library task (sum(points) with default 1).
    const taskIds = problems.map((p) => Number((p.libraryTask as any)?.id)).filter((x) => Number.isFinite(x) && x > 0);
    const maxByTask = new Map<number, number>();
    if (taskIds.length) {
      const uniq = Array.from(new Set(taskIds));
      const placeholders = uniq.map(() => "?").join(",");
      const rows = (await AppDataSource.query(
        `
          SELECT library_task_id as taskId,
                 SUM(COALESCE(points, 1)) as maxScore
          FROM test_data
          WHERE library_task_id IN (${placeholders})
          GROUP BY library_task_id
        `,
        uniq
      )) as Array<any>;
      for (const r of rows) {
        const tid = Number(r.taskId);
        const ms = Number(r.maxScore);
        if (Number.isFinite(tid) && tid > 0 && Number.isFinite(ms)) maxByTask.set(tid, ms);
      }
    }

    // Best contest-phase score per problem.
    const bestRows = (await AppDataSource.query(
      `
        SELECT x.problem_id as problemId,
               x.bestScore as bestScore,
               MIN(s.created_at) as bestAt
        FROM (
          SELECT problem_id,
                 MAX(COALESCE(score, 0)) as bestScore
          FROM contest_submissions
          WHERE contest_id = ? AND participant_id = ? AND phase = 'CONTEST'
          GROUP BY problem_id
        ) x
        JOIN contest_submissions s
          ON s.contest_id = ?
         AND s.participant_id = ?
         AND s.phase = 'CONTEST'
         AND s.problem_id = x.problem_id
         AND COALESCE(s.score, 0) = x.bestScore
        GROUP BY x.problem_id, x.bestScore
      `,
      [contestId, participant.id, contestId, participant.id]
    )) as Array<any>;
    const bestByProblem = new Map<number, { bestScore: number; bestAt: string | null }>();
    for (const r of bestRows) {
      const pid = Number(r.problemId);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      bestByProblem.set(pid, {
        bestScore: Number(r.bestScore ?? 0) || 0,
        bestAt: r.bestAt ? new Date(r.bestAt).toISOString() : null,
      });
    }

    // Last submission per problem (any phase). Use max(id) as most recent.
    const lastIdRows = (await AppDataSource.query(
      `
        SELECT problem_id as problemId,
               MAX(id) as lastId
        FROM contest_submissions
        WHERE contest_id = ? AND participant_id = ?
        GROUP BY problem_id
      `,
      [contestId, participant.id]
    )) as Array<any>;
    const lastIdByProblem = new Map<number, number>();
    for (const r of lastIdRows) {
      const pid = Number(r.problemId);
      const lid = Number(r.lastId);
      if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(lid) || lid <= 0) continue;
      lastIdByProblem.set(pid, lid);
    }

    const lastIds = Array.from(lastIdByProblem.values());
    const lastById = new Map<number, any>();
    if (lastIds.length) {
      const placeholders = lastIds.map(() => "?").join(",");
      const rows = (await AppDataSource.query(
        `
          SELECT id,
                 problem_id as problemId,
                 created_at as createdAt,
                 phase,
                 language,
                 verdict,
                 score,
                 max_score as maxScore,
                 tests_passed as testsPassed,
                 tests_total as testsTotal
          FROM contest_submissions
          WHERE id IN (${placeholders})
        `,
        lastIds
      )) as Array<any>;
      for (const r of rows) {
        const id = Number(r.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        lastById.set(id, {
          id,
          problemId: Number(r.problemId),
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
          phase: r.phase === "UPSOLVE" ? "UPSOLVE" : "CONTEST",
          language: String(r.language ?? ""),
          verdict: r.verdict != null ? String(r.verdict) : null,
          score: r.score != null ? Number(r.score) : null,
          maxScore: r.maxScore != null ? Number(r.maxScore) : null,
          testsPassed: r.testsPassed != null ? Number(r.testsPassed) : null,
          testsTotal: r.testsTotal != null ? Number(r.testsTotal) : null,
        });
      }
    }

    const out = problems.map((p) => {
      const taskId = Number((p.libraryTask as any)?.id);
      const maxScore = ((p as any).points ?? null) != null
        ? Number((p as any).points)
        : (Number.isFinite(taskId) && taskId > 0 ? (maxByTask.get(taskId) ?? null) : null);
      const best = bestByProblem.get(p.id) ?? { bestScore: 0, bestAt: null };
      const lastId = lastIdByProblem.get(p.id) ?? null;
      const last = lastId ? lastById.get(lastId) ?? null : null;
      return {
        problemId: p.id,
        order: p.order,
        label: p.label ?? labelFromOrder(p.order),
        title: p.libraryTask?.title ?? "",
        maxScore,
        bestContestScore: best.bestScore,
        bestContestAt: best.bestAt,
        last,
      };
    });

    return res.json({ contestId, participantId: participant.id, problems: out });
  } catch (error: any) {
    logger.error("[contests] GET /:id/my-progress error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Scoreboard (IOI): sum of best score per problem.
contestsRouter.get("/:id/scoreboard", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const problems = await problemRepo().find({ where: { contest: { id: contestId } } as any, order: { order: "ASC" } as any });

    const participants = await participantRepo().find({ where: { contest: { id: contestId } } as any, order: { joinedAt: "ASC" } as any });
    const activeParticipants = participants.filter((p) => !(p as any).isDisqualified);

    if (activeParticipants.length === 0) {
      return res.json({
        contestId,
        problems: problems.map((p) => ({ id: p.id, order: p.order, label: p.label ?? labelFromOrder(p.order) })),
        rows: [],
        disqualifiedCount: participants.length,
      });
    }

    // Fetch best score per (participant, problem). Tie-breaker: earliest time that achieved best.
    const bestRows = (await AppDataSource.query(
      `
      SELECT s.participant_id as participantId,
             s.problem_id as problemId,
             MAX(COALESCE(s.score, 0)) as bestScore,
             MIN(CASE WHEN COALESCE(s.score, 0) = (
                SELECT MAX(COALESCE(s2.score,0)) FROM contest_submissions s2
                WHERE s2.participant_id = s.participant_id AND s2.problem_id = s.problem_id AND s2.phase = 'CONTEST'
             ) THEN s.created_at ELSE NULL END) as bestAt
      FROM contest_submissions s
      WHERE s.contest_id = ? AND s.phase = 'CONTEST'
      GROUP BY s.participant_id, s.problem_id
      `,
      [contestId]
    )) as Array<any>;

    const byKey = new Map<string, { bestScore: number; bestAt: string | null }>();
    for (const r of bestRows) {
      const pid = Number(r.participantId);
      const pr = Number(r.problemId);
      if (!Number.isFinite(pid) || !Number.isFinite(pr)) continue;
      const key = `${pid}:${pr}`;
      byKey.set(key, {
        bestScore: Number(r.bestScore ?? 0) || 0,
        bestAt: r.bestAt ? new Date(r.bestAt).toISOString() : null,
      });
    }

    const rows = activeParticipants
      .map((p) => {
        const perProblem = problems.map((pr) => {
          const key = `${p.id}:${pr.id}`;
          const hit = byKey.get(key);
          return {
            problemId: pr.id,
            score: hit?.bestScore ?? 0,
            bestAt: hit?.bestAt ?? null,
          };
        });
        const total = perProblem.reduce((sum, x) => sum + (Number(x.score) || 0), 0);
        const last = perProblem
          .map((x) => (x.bestAt ? new Date(x.bestAt).getTime() : null))
          .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
        const lastImprovementAt = last.length ? new Date(Math.max(...last)).toISOString() : null;
        return {
          participantId: p.id,
          displayName: p.displayName,
          totalScore: total,
          lastImprovementAt,
          problems: perProblem,
        };
      })
      .sort((a, b) => {
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        // Tie-breaker: earlier last improvement wins.
        const ta = a.lastImprovementAt ? new Date(a.lastImprovementAt).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.lastImprovementAt ? new Date(b.lastImprovementAt).getTime() : Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return a.participantId - b.participantId;
      })
      .map((r, idx) => ({ rank: idx + 1, ...r }));

    return res.json({
      contestId,
      problems: problems.map((p) => ({ id: p.id, order: p.order, label: p.label ?? labelFromOrder(p.order) })),
      rows,
      disqualifiedCount: participants.length - activeParticipants.length,
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/scoreboard error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default contestsRouter;
