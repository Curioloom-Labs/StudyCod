import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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
import { buildJudgeTests, loadTestContentByIds } from "../services/judgeWorker/testCache";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, normalizeSafeCodeFilePath } from "../utils/multiFileSubmission";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { chooseDefaultCheckerFromExpectedOutputs } from "../utils/checkerSpec";
import { env } from "../env";
import { FRONTEND_URL } from "../config";
import { emailService } from "../services/emailService";
import { certificateService } from "../services/certificates/CertificateService";
import { computeScoreboard, type ScoreboardSubmission } from "../services/contest/scoreboard";
import { publishContestEvent, subscribeContestEvents, type ContestEvent } from "../services/contest/contestEvents";

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

const ALL_JUDGE_LANGS = [
  "java", "python", "cpp", "c", "csharp", "kotlin",
  "js", "go", "rust", "pascal",
  "d", "dart", "haskell", "lisp", "lua", "perl", "php", "ruby", "swift"
] as const;

const NATIVE_LIMITS = { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 };
const SCRIPTING_LIMITS = { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 };
const DEFAULT_LIMITS_BY_LANG: Record<JudgeLanguage, { time_limit_ms: number; memory_limit_mb: number; output_limit_kb: number }> = {
  java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
  python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
  cpp: { ...NATIVE_LIMITS },
  c: { ...NATIVE_LIMITS },
  csharp: { time_limit_ms: 1200, memory_limit_mb: 1024, output_limit_kb: 64 },
  kotlin: { time_limit_ms: 1400, memory_limit_mb: 384, output_limit_kb: 64 },
  js: { ...SCRIPTING_LIMITS },
  go: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  rust: { ...NATIVE_LIMITS },
  pascal: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  d: { ...NATIVE_LIMITS },
  dart: { ...SCRIPTING_LIMITS },
  haskell: { ...NATIVE_LIMITS },
  lisp: { time_limit_ms: 2000, memory_limit_mb: 384, output_limit_kb: 64 },
  lua: { ...SCRIPTING_LIMITS },
  perl: { ...SCRIPTING_LIMITS },
  php: { ...SCRIPTING_LIMITS },
  ruby: { ...SCRIPTING_LIMITS },
  swift: { ...NATIVE_LIMITS },
};
type JudgeLanguage = (typeof ALL_JUDGE_LANGS)[number];
const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getClientIp(req: AuthRequest): string | null {
  const fromCf = String(req.headers["cf-connecting-ip"] ?? "").trim();
  if (fromCf) return fromCf;
  const fromXffRaw = req.headers["x-forwarded-for"];
  const fromXff = Array.isArray(fromXffRaw)
    ? String(fromXffRaw[0] ?? "").split(",")[0]?.trim()
    : String(fromXffRaw ?? "").split(",")[0]?.trim();
  if (fromXff) return fromXff;
  const fromReqIp = String(req.ip ?? "").trim();
  return fromReqIp || null;
}

async function verifyTurnstileToken(params: {
  secretKey: string;
  token: string;
  remoteIp?: string | null;
}): Promise<{ success: boolean; errorCodes: string[] }> {
  const verifyUrl = String(env.TURNSTILE_VERIFY_URL ?? "").trim() || TURNSTILE_SITEVERIFY_URL;
  const body = new URLSearchParams();
  body.set("secret", params.secretKey);
  body.set("response", params.token);
  if (params.remoteIp) body.set("remoteip", params.remoteIp);

  try {
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!response.ok) return { success: false, errorCodes: [`HTTP_${response.status}`] };
    const data = (await response.json()) as any;
    const errorCodes = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    return { success: data?.success === true, errorCodes };
  } catch {
    return { success: false, errorCodes: ["VERIFY_REQUEST_FAILED"] };
  }
}

function normalizeJudgeLanguage(raw: unknown): JudgeLanguage | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  return (ALL_JUDGE_LANGS as readonly string[]).includes(s) ? (s as JudgeLanguage) : null;
}

// Optional compiler/version id (e.g. "pypy3", "java21"); judge validates family membership.
function normCompilerId(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  return /^[a-z0-9_+-]{1,32}$/i.test(s) ? s : undefined;
}

const ENTRY_FILE_BY_LANG: Record<JudgeLanguage, string> = {
  java: "Main.java", python: "main.py", cpp: "main.cpp", c: "main.c",
  csharp: "Program.cs", kotlin: "Main.kt", js: "main.js", go: "main.go",
  rust: "main.rs", pascal: "main.pas", d: "main.d", dart: "main.dart",
  haskell: "main.hs", lisp: "main.lisp", lua: "main.lua", perl: "main.pl",
  php: "main.php", ruby: "main.rb", swift: "main.swift",
};
function entryFileForJudgeLanguage(lang: JudgeLanguage): string {
  return ENTRY_FILE_BY_LANG[lang] ?? "Main.java";
}

type ApiCodeFile = { path: string; content: string };
function normalizeApiFiles(raw: unknown): ApiCodeFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiCodeFile[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const p = normalizeSafeCodeFilePath((f as any).path) ?? "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    out.push({ path: p, content: c });
  }
  const byPath = new Map<string, ApiCodeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}

function getAllowedJudgeLanguages(_task: LibraryTask): JudgeLanguage[] {
  // No per-problem restriction: every contest problem accepts every supported language.
  return Array.from(ALL_JUDGE_LANGS) as JudgeLanguage[];
}

function isContestOnlyUser(req: AuthRequest): boolean {
  return req.userType === "USER" && req.userMode === "CONTEST";
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

  if (contest.visibility === "PUBLIC") {
    // Contest-only accounts must not discover unrelated public contests.
    if (isContestOnlyUser(req)) {
      return canAccessContest({ contest, req });
    }
    return true;
  }
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

  const notificationEmail = await (async (): Promise<string | null> => {
    if (principalType === "USER") {
      const u = await userRepo().findOne({ where: { id: principalId } as any });
      const email = String(u?.email ?? "").trim().toLowerCase();
      return email || null;
    }
    const s = await studentRepo().findOne({ where: { id: principalId } as any });
    const email = String(s?.email ?? "").trim().toLowerCase();
    return email || null;
  })();

  const created: ContestParticipant = participantRepo().create();
  Object.assign(created, {
    contest: { id: params.contestId } as any,
    principalType,
    displayName,
    notificationEmail,
    notificationFullName: displayName || null,
    ...(principalType === "USER" ? { user: { id: principalId } as any } : { student: { id: principalId } as any }),
  });
  const saved: ContestParticipant = await participantRepo().save(created as any);
  return saved;
}

async function ensureContestParticipantNotificationColumns(): Promise<void> {
  const rows = (await AppDataSource.query(
    `
    SELECT COLUMN_NAME as columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'contest_participants'
      AND COLUMN_NAME IN ('notification_email', 'notification_full_name')
    `
  )) as Array<any>;

  const existing = new Set((rows || []).map((r) => String(r?.columnName ?? "").trim().toLowerCase()));

  if (!existing.has("notification_email")) {
    await AppDataSource.query(
      `ALTER TABLE contest_participants ADD COLUMN notification_email VARCHAR(255) NULL`
    );
  }

  if (!existing.has("notification_full_name")) {
    await AppDataSource.query(
      `ALTER TABLE contest_participants ADD COLUMN notification_full_name VARCHAR(180) NULL`
    );
  }
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

  if (contest.visibility === "PUBLIC") {
    if (!isContestOnlyUser(req)) return true;

    // Contest-only accounts can access only contests where they are participants.
    if (!req.userId) return false;
    const participant = await participantRepo().findOne({
      where: {
        contest: { id: contest.id } as any,
        user: { id: req.userId } as any,
      } as any,
    });
    return !!participant;
  }

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

let ensureContestAdminTablesPromise: Promise<void> | null = null;
async function ensureContestAdminTables(): Promise<void> {
  if (ensureContestAdminTablesPromise) return ensureContestAdminTablesPromise;
  ensureContestAdminTablesPromise = (async () => {
    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_organizers (
        contest_id INT NOT NULL,
        user_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (contest_id, user_id),
        INDEX idx_contest_organizers_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );

    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_runtime_state (
        contest_id INT NOT NULL,
        is_paused TINYINT(1) NOT NULL DEFAULT 0,
        paused_at DATETIME NULL,
        paused_by_user_id INT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (contest_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );

    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_annulments (
        id BIGINT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        problem_id INT NOT NULL,
        participant_id INT NOT NULL DEFAULT 0,
        reason TEXT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_by_user_id INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_contest_annulments_target (contest_id, problem_id, participant_id),
        INDEX idx_contest_annulments_contest (contest_id),
        INDEX idx_contest_annulments_problem (problem_id),
        INDEX idx_contest_annulments_participant (participant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );

    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_integrity_events (
        id BIGINT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        participant_id INT NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        detail VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_contest_integrity_contest (contest_id),
        INDEX idx_contest_integrity_participant (participant_id),
        INDEX idx_contest_integrity_contest_participant (contest_id, participant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );

    await ensureContestParticipantNotificationColumns();
  })();
  return ensureContestAdminTablesPromise;
}

async function isContestOrganizer(contestId: number, userId: number): Promise<boolean> {
  if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(userId) || userId <= 0) return false;
  try {
    await ensureContestAdminTables();
    const rows = (await AppDataSource.query(
      `SELECT user_id as userId FROM contest_organizers WHERE contest_id = ? AND user_id = ? LIMIT 1`,
      [contestId, userId]
    )) as Array<any>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function getContestPausedState(contestId: number): Promise<boolean> {
  if (!Number.isFinite(contestId) || contestId <= 0) return false;
  try {
    await ensureContestAdminTables();
    const rows = (await AppDataSource.query(
      `SELECT is_paused as isPaused FROM contest_runtime_state WHERE contest_id = ? LIMIT 1`,
      [contestId]
    )) as Array<any>;
    const value = rows[0]?.isPaused;
    return Number(value) === 1 || value === true;
  } catch {
    return false;
  }
}

async function setContestPausedState(contestId: number, paused: boolean, actorUserId: number): Promise<void> {
  await ensureContestAdminTables();
  if (paused) {
    await AppDataSource.query(
      `
      INSERT INTO contest_runtime_state (contest_id, is_paused, paused_at, paused_by_user_id, updated_at)
      VALUES (?, 1, NOW(), ?, NOW())
      ON DUPLICATE KEY UPDATE is_paused = 1, paused_at = NOW(), paused_by_user_id = VALUES(paused_by_user_id), updated_at = NOW()
      `,
      [contestId, actorUserId]
    );
  } else {
    await AppDataSource.query(
      `
      INSERT INTO contest_runtime_state (contest_id, is_paused, paused_at, paused_by_user_id, updated_at)
      VALUES (?, 0, NULL, NULL, NOW())
      ON DUPLICATE KEY UPDATE is_paused = 0, paused_at = NULL, paused_by_user_id = NULL, updated_at = NOW()
      `,
      [contestId]
    );
  }
}

async function isProblemAnnulledForParticipant(contestId: number, problemId: number, participantId: number): Promise<boolean> {
  if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0 || !Number.isFinite(participantId) || participantId <= 0) {
    return false;
  }
  try {
    await ensureContestAdminTables();
    const rows = (await AppDataSource.query(
      `
      SELECT id
      FROM contest_annulments
      WHERE contest_id = ?
        AND problem_id = ?
        AND is_active = 1
        AND (participant_id = 0 OR participant_id = ?)
      LIMIT 1
      `,
      [contestId, problemId, participantId]
    )) as Array<any>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function canManageContest(params: { contest: Contest; req: AuthRequest }): Promise<boolean> {
  const { contest, req } = params;
  if (req.userRole === "SYSTEM_ADMIN" && req.userId) return true;
  if (req.userId && (contest as any)?.createdBy?.id === req.userId) return true;
  if (req.userId) {
    const row = await contestRepo().findOne({ where: { id: contest.id } as any, relations: ["createdBy"] as any });
    if (row?.createdBy?.id === req.userId) return true;
    const organizer = await isContestOrganizer(contest.id, req.userId);
    if (organizer) return true;
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

function randomContestPassword(): string {
  return crypto.randomBytes(9).toString("base64url");
}

function splitFullName(raw: unknown): { fullName: string; firstName: string | null; lastName: string | null } {
  const fullName = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
  if (!fullName) return { fullName: "", firstName: null, lastName: null };
  const parts = fullName.split(" ").filter(Boolean);
  if (parts.length === 1) return { fullName, firstName: parts[0], lastName: null };
  return {
    fullName,
    firstName: parts.slice(0, -1).join(" ").slice(0, 100) || null,
    lastName: parts[parts.length - 1]?.slice(0, 100) || null,
  };
}

function usernamePrefixFromFullName(raw: unknown): string {
  const base = String(raw ?? "").trim().toLowerCase();
  const latin = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const token = latin.split(" ")[0] || "";
  return sanitizeContestUsernamePrefix(token || "ct");
}

function escapeHtml(input: unknown): string {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeContestUsernamePrefix(raw: unknown): string {
  const base = String(raw ?? "ct").trim().toLowerCase();
  const safe = base.replace(/[^a-z0-9_-]/g, "").slice(0, 12);
  return safe || "ct";
}

async function allocateUniqueContestUsername(prefix: string, contestId: number): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const suffix = crypto.randomBytes(4).toString("hex");
    const username = `${prefix}_${contestId}_${suffix}`;
    const existing = await userRepo().findOne({ where: { username } as any });
    if (!existing) return username;
  }
  const fallback = `${prefix}_${contestId}_${Date.now()}`.slice(0, 50);
  return fallback;
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

let ensureContestCommunityTablesPromise: Promise<void> | null = null;
async function ensureContestCommunityTables(): Promise<void> {
  if (ensureContestCommunityTablesPromise) return ensureContestCommunityTablesPromise;
  ensureContestCommunityTablesPromise = (async () => {
    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_questions (
        id BIGINT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        participant_id INT NULL,
        author_name VARCHAR(255) NOT NULL,
        question_text TEXT NOT NULL,
        answer_text TEXT NULL,
        answered_by_user_id INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        answered_at DATETIME NULL,
        PRIMARY KEY (id),
        INDEX idx_contest_questions_contest_created (contest_id, created_at),
        INDEX idx_contest_questions_participant (participant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );

    await AppDataSource.query(
      `
      CREATE TABLE IF NOT EXISTS contest_announcements (
        id BIGINT NOT NULL AUTO_INCREMENT,
        contest_id INT NOT NULL,
        author_user_id INT NULL,
        author_name VARCHAR(255) NOT NULL,
        announcement_text TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        INDEX idx_contest_announcements_contest_created (contest_id, created_at),
        INDEX idx_contest_announcements_author (author_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `
    );
  })();
  return ensureContestCommunityTablesPromise;
}

// Contest community feed (questions + announcements)
// Live ICPC-style scoreboard. Read-only aggregation over contest submissions.
contestsRouter.get("/:id/scoreboard", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = parseInt(req.params.id, 10);
    if (isNaN(contestId)) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const subs = await submissionRepo().find({
      where: { contest: { id: contestId } } as any,
      relations: ["participant", "problem"] as any,
    });

    const endsAtMs = contest.endsAt ? new Date(contest.endsAt).getTime() : null;
    const submissionTimes = subs.map((s) => new Date(s.createdAt).getTime());
    const startMs = contest.startsAt
      ? new Date(contest.startsAt).getTime()
      : submissionTimes.length
        ? Math.min(...submissionTimes)
        : Date.now();

    const scoreSubs: ScoreboardSubmission[] = subs
      .filter((s) => s.participant && s.problem)
      .map((s) => ({
        participantId: s.participant.id,
        problemId: s.problem.id,
        verdict: s.verdict ?? null,
        createdAtMs: new Date(s.createdAt).getTime(),
      }))
      // Only count submissions made during the contest window (exclude upsolve).
      .filter((s) => endsAtMs == null || s.createdAtMs <= endsAtMs);

    const board = computeScoreboard(scoreSubs, { startMs, penaltyPerWrong: 20 });

    const participants: Record<number, string> = {};
    const problems: Record<number, string> = {};
    for (const s of subs) {
      if (s.participant) participants[s.participant.id] = String((s.participant as any).displayName ?? `#${s.participant.id}`);
      if (s.problem) problems[s.problem.id] = String((s.problem as any).label ?? `#${s.problem.id}`);
    }

    res.set("Cache-Control", "no-store");
    return res.json({
      rows: board.rows,
      generatedAtMs: board.generatedAtMs,
      startMs,
      endsAtMs,
      participants,
      problems,
    });
  } catch (error: any) {
    logger.warn("[contests] scoreboard failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

contestsRouter.get("/:id/community", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const canManage = req.userId ? await canManageContest({ contest, req }) : false;
    const principalParticipantId = await (async (): Promise<number | null> => {
      if (canManage) return null;
      if (!req.userId && !req.studentId) return null;
      const participant = await participantRepo().findOne({
        where: {
          contest: { id: contestId } as any,
          ...(req.userId ? { user: { id: req.userId } as any } : { student: { id: req.studentId } as any }),
        } as any,
      });
      return participant?.id ?? null;
    })();

    await ensureContestCommunityTables();

    const qLimit = (() => {
      const n = Number((req.query as any)?.qLimit);
      if (!Number.isFinite(n)) return 300;
      return Math.max(1, Math.min(1000, Math.floor(n)));
    })();
    const aLimit = (() => {
      const n = Number((req.query as any)?.aLimit);
      if (!Number.isFinite(n)) return 200;
      return Math.max(1, Math.min(1000, Math.floor(n)));
    })();

    const questions = (await AppDataSource.query(
      `
      SELECT id,
             participant_id as participantId,
             author_name as author,
             question_text as text,
             created_at as createdAt,
             answer_text as answer,
             answered_at as answeredAt
      FROM contest_questions
      WHERE contest_id = ?
        AND (? = 1 OR participant_id = ?)
      ORDER BY created_at ASC, id ASC
      LIMIT ?
      `,
      [contestId, canManage ? 1 : 0, principalParticipantId ?? -1, qLimit]
    )) as Array<any>;

    const announcements = (await AppDataSource.query(
      `
      SELECT id,
             author_name as author,
             announcement_text as text,
             created_at as createdAt
      FROM contest_announcements
      WHERE contest_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      `,
      [contestId, aLimit]
    )) as Array<any>;

    return res.json({
      contestId,
      questions: questions.map((q) => ({
        id: Number(q.id),
        participantId: Number.isFinite(Number(q.participantId)) ? Number(q.participantId) : null,
        author: String(q.author ?? "participant"),
        text: String(q.text ?? ""),
        createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
        answer: q.answer != null ? String(q.answer) : null,
        answeredAt: q.answeredAt ? new Date(q.answeredAt).toISOString() : null,
        status: q.answer != null ? "ANSWERED" : "OPEN",
      })),
      announcements: announcements.map((a) => ({
        id: Number(a.id),
        author: String(a.author ?? "organizer"),
        text: String(a.text ?? ""),
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/community error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Participant question to organizer
contestsRouter.post("/:id/community/questions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ text: z.string().min(1).max(10_000) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    const text = parsed.data.text.trim();
    if (!text) return res.status(400).json({ message: "EMPTY_TEXT" });

    const participant = await getOrCreateParticipant({ contestId, req });
    if ((participant as any).isDisqualified) {
      return res.status(403).json({ message: "PARTICIPANT_DISQUALIFIED" });
    }

    await ensureContestCommunityTables();
    const insertResult: any = await AppDataSource.query(
      `
      INSERT INTO contest_questions (contest_id, participant_id, author_name, question_text, created_at)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [contestId, participant.id, String(participant.displayName ?? "participant"), text]
    );
    const newId = Number(insertResult?.insertId ?? 0);
    if (!Number.isFinite(newId) || newId <= 0) {
      return res.status(500).json({ message: "CREATE_FAILED" });
    }

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             author_name as author,
             question_text as text,
             created_at as createdAt,
             answer_text as answer,
             answered_at as answeredAt
      FROM contest_questions
      WHERE id = ? AND contest_id = ?
      LIMIT 1
      `,
      [newId, contestId]
    )) as Array<any>;
    const q = rows[0];
    if (!q) return res.status(500).json({ message: "CREATE_FAILED" });

    return res.json({
      question: {
        id: Number(q.id),
        author: String(q.author ?? "participant"),
        text: String(q.text ?? ""),
        createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
        answer: q.answer != null ? String(q.answer) : null,
        answeredAt: q.answeredAt ? new Date(q.answeredAt).toISOString() : null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] POST /:id/community/questions error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer answer to question
contestsRouter.patch("/:id/community/questions/:questionId/answer", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.id);
    const questionId = Number(req.params.questionId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(questionId) || questionId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ answer: z.string().min(1).max(10_000) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    const answer = parsed.data.answer.trim();
    if (!answer) return res.status(400).json({ message: "EMPTY_ANSWER" });

    await ensureContestCommunityTables();

    const existsRows = (await AppDataSource.query(
      `SELECT id FROM contest_questions WHERE id = ? AND contest_id = ? LIMIT 1`,
      [questionId, contestId]
    )) as Array<any>;
    if (!existsRows.length) return res.status(404).json({ message: "QUESTION_NOT_FOUND" });

    await AppDataSource.query(
      `
      UPDATE contest_questions
      SET answer_text = ?, answered_at = NOW(), answered_by_user_id = ?
      WHERE id = ? AND contest_id = ?
      `,
      [answer, req.userId, questionId, contestId]
    );

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             author_name as author,
             question_text as text,
             created_at as createdAt,
             answer_text as answer,
             answered_at as answeredAt
      FROM contest_questions
      WHERE id = ? AND contest_id = ?
      LIMIT 1
      `,
      [questionId, contestId]
    )) as Array<any>;
    const q = rows[0];
    if (!q) return res.status(404).json({ message: "QUESTION_NOT_FOUND" });

    return res.json({
      question: {
        id: Number(q.id),
        author: String(q.author ?? "participant"),
        text: String(q.text ?? ""),
        createdAt: q.createdAt ? new Date(q.createdAt).toISOString() : new Date().toISOString(),
        answer: q.answer != null ? String(q.answer) : null,
        answeredAt: q.answeredAt ? new Date(q.answeredAt).toISOString() : null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id/community/questions/:questionId/answer error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer announcement
contestsRouter.post("/:id/community/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ text: z.string().min(1).max(20_000) });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });
    const text = parsed.data.text.trim();
    if (!text) return res.status(400).json({ message: "EMPTY_TEXT" });

    await ensureContestCommunityTables();

    const u = await userRepo().findOne({ where: { id: req.userId } as any });
    const authorName = String(u?.username ?? "organizer").trim() || "organizer";

    const insertResult: any = await AppDataSource.query(
      `
      INSERT INTO contest_announcements (contest_id, author_user_id, author_name, announcement_text, created_at)
      VALUES (?, ?, ?, ?, NOW())
      `,
      [contestId, req.userId, authorName, text]
    );
    const newId = Number(insertResult?.insertId ?? 0);
    if (!Number.isFinite(newId) || newId <= 0) {
      return res.status(500).json({ message: "CREATE_FAILED" });
    }

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             author_name as author,
             announcement_text as text,
             created_at as createdAt
      FROM contest_announcements
      WHERE id = ? AND contest_id = ?
      LIMIT 1
      `,
      [newId, contestId]
    )) as Array<any>;
    const a = rows[0];
    if (!a) return res.status(500).json({ message: "CREATE_FAILED" });

    // Push the new announcement to live SSE subscribers.
    publishContestEvent(contestId, {
      kind: "announcement",
      id: Number(a.id),
      text: String(a.text ?? ""),
      author: String(a.author ?? "organizer"),
      at: Date.now(),
    });

    return res.json({
      announcement: {
        id: Number(a.id),
        author: String(a.author ?? "organizer"),
        text: String(a.text ?? ""),
        createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : new Date().toISOString(),
      },
    });
  } catch (error: any) {
    logger.error("[contests] POST /:id/community/announcements error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

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

    let contestOnlyUserParticipantContestIds: Set<number> | null = null;
    if (isContestOnlyUser(req) && req.userId) {
      const rows = await participantRepo().find({
        where: { user: { id: req.userId } as any } as any,
        relations: ["contest"] as any,
      });
      contestOnlyUserParticipantContestIds = new Set(
        rows
          .map((row) => Number((row as any)?.contest?.id))
          .filter((id) => Number.isFinite(id) && id > 0)
      );
    }

    const visible: Contest[] = [];
    for (const c of contests) {
      if (contestOnlyUserParticipantContestIds && !contestOnlyUserParticipantContestIds.has(c.id)) {
        continue;
      }
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
    if (isContestOnlyUser(req)) {
      return res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
    }

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
    if (isContestOnlyUser(req)) {
      return res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
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
      scoringMode: z.enum(["IOI", "ICPC"]).optional(),
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
      scoringMode: data.scoringMode ?? "IOI",
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
        scoringMode: z.enum(["IOI", "ICPC"]).optional(),
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
    if (data.scoringMode !== undefined) (contest as any).scoringMode = data.scoringMode;

    const saved = await contestRepo().save(contest as any);
    return res.json({
      id: saved.id,
      isPublished: saved.isPublished,
      title: saved.title,
      startsAt: saved.startsAt ? new Date(saved.startsAt).toISOString() : null,
      endsAt: saved.endsAt ? new Date(saved.endsAt).toISOString() : null,
      allowUpsolve: (saved as any).allowUpsolve ?? true,
      scoringMode: (saved as any).scoringMode ?? "IOI",
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
    const isPaused = await getContestPausedState(id);

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
        scoringMode: (contest as any).scoringMode ?? "IOI",
        createdBy: contest.createdBy ? { id: contest.createdBy.id, username: contest.createdBy.username } : null,
        classId: (contest as any)?.class?.id ?? null,
      },
      access: {
        canAccessContent: canContent,
        isJoined,
        joinRequired: contest.visibility === "PRIVATE_CODE" && !canContent,
        canManage: isPrivileged,
        isPaused,
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
    if (isContestOnlyUser(req)) {
      return res.status(403).json({ message: "CONTEST_MODE_RESTRICTED" });
    }

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

// Participant: get own contest account metadata (handle/note)
contestsRouter.get("/:id/account", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const participant = await getOrCreateParticipant({ contestId, req });
    return res.json({
      contestId,
      account: {
        handle: (participant as any).contestAccountHandle ?? null,
        note: (participant as any).contestAccountNote ?? null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/account error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Participant: set own contest account metadata (handle/note)
contestsRouter.put("/:id/account", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z
      .object({
        handle: z.string().max(120).nullable().optional(),
        note: z.string().max(255).nullable().optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: "EMPTY_PATCH" });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const norm = (v: unknown, max: number): string | null => {
      const s = String(v ?? "").trim();
      if (!s) return null;
      return s.slice(0, max);
    };

    const participant = await getOrCreateParticipant({ contestId, req });
    if (Object.prototype.hasOwnProperty.call(parsed.data, "handle")) {
      (participant as any).contestAccountHandle = norm((parsed.data as any).handle, 120);
    }
    if (Object.prototype.hasOwnProperty.call(parsed.data, "note")) {
      (participant as any).contestAccountNote = norm((parsed.data as any).note, 255);
    }
    const saved = await participantRepo().save(participant as any);

    return res.json({
      contestId,
      account: {
        handle: (saved as any).contestAccountHandle ?? null,
        note: (saved as any).contestAccountNote ?? null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] PUT /:id/account error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: pause or resume contest runtime
contestsRouter.patch("/:id/admin/pause", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ paused: z.boolean() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    await setContestPausedState(contestId, parsed.data.paused, req.userId);
    const isPaused = await getContestPausedState(contestId);
    return res.json({ contestId, isPaused });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id/admin/pause error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: list organizers
contestsRouter.get("/:id/admin/organizers", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    await ensureContestAdminTables();

    const rows = (await AppDataSource.query(
      `
      SELECT u.id as userId,
             u.username as username,
             co.created_at as addedAt
      FROM contest_organizers co
      JOIN users u ON u.id = co.user_id
      WHERE co.contest_id = ?
      ORDER BY co.created_at ASC, co.user_id ASC
      `,
      [contestId]
    )) as Array<any>;

    const isPaused = await getContestPausedState(contestId);
    return res.json({
      contestId,
      isPaused,
      owner: contest.createdBy ? { userId: contest.createdBy.id, username: contest.createdBy.username } : null,
      organizers: rows.map((r) => ({
        userId: Number(r.userId),
        username: String(r.username ?? ""),
        addedAt: r.addedAt ? new Date(r.addedAt).toISOString() : null,
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/organizers error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Owner/admin: add organizer
contestsRouter.post("/:id/admin/organizers", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const isOwner = contest.createdBy?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ userId: z.number().int().positive() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const targetUserId = parsed.data.userId;
    const targetUser = await userRepo().findOne({ where: { id: targetUserId } as any });
    if (!targetUser) return res.status(404).json({ message: "USER_NOT_FOUND" });
    if (contest.createdBy?.id === targetUserId) return res.status(400).json({ message: "USER_IS_OWNER" });

    await ensureContestAdminTables();
    await AppDataSource.query(
      `
      INSERT INTO contest_organizers (contest_id, user_id, created_at)
      VALUES (?, ?, NOW())
      ON DUPLICATE KEY UPDATE created_at = created_at
      `,
      [contestId, targetUserId]
    );

    return res.json({
      organizer: {
        userId: targetUser.id,
        username: targetUser.username,
      },
    });
  } catch (error: any) {
    logger.error("[contests] POST /:id/admin/organizers error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Owner/admin: remove organizer
contestsRouter.delete("/:id/admin/organizers/:userId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    const targetUserId = Number(req.params.userId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const isOwner = contest.createdBy?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    await ensureContestAdminTables();
    await AppDataSource.query(
      `DELETE FROM contest_organizers WHERE contest_id = ? AND user_id = ?`,
      [contestId, targetUserId]
    );

    return res.json({ removed: true, userId: targetUserId });
  } catch (error: any) {
    logger.error("[contests] DELETE /:id/admin/organizers/:userId error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Owner/admin: generate dedicated CONTEST accounts for this contest and auto-join them.
contestsRouter.post("/:id/admin/accounts/generate", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const isOwner = contest.createdBy?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    await ensureContestAdminTables();

    const schema = z.object({
      entries: z.array(z.object({
        fullName: z.string().min(1).max(160),
        email: z.string().email().max(255),
      })).min(1).max(300).optional(),

      // Legacy fallback mode (kept for backward compatibility)
      count: z.number().int().min(1).max(200).optional(),
      usernamePrefix: z.string().min(1).max(24).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const roster = Array.isArray(parsed.data.entries) && parsed.data.entries.length > 0
      ? parsed.data.entries.map((e) => ({
          fullName: splitFullName(e.fullName).fullName,
          email: String(e.email).trim().toLowerCase(),
        }))
      : Array.from({ length: parsed.data.count ?? 1 }).map(() => ({
          fullName: "",
          email: "",
        }));

    const legacyPrefix = sanitizeContestUsernamePrefix(parsed.data.usernamePrefix ?? "ct");

    const created: Array<{
      userId: number;
      username: string;
      password: string;
      participantId: number;
      fullName: string | null;
      email: string | null;
    }> = [];

    for (const row of roster) {
      const byNamePrefix = row.fullName ? usernamePrefixFromFullName(row.fullName) : legacyPrefix;
      const username = await allocateUniqueContestUsername(byNamePrefix, contestId);
      const password = randomContestPassword();
      const passwordHash = await bcrypt.hash(password, 10);
      const split = splitFullName(row.fullName);
      const displayName = split.fullName || username;

      const user = userRepo().create({
        username,
        email: null,
        password: passwordHash,
        lang: "JAVA",
        difusJava: 0,
        difusPython: 0,
        difusCpp: 0,
        emailVerified: true,
        role: "USER",
        userMode: "CONTEST",
        firstName: split.firstName,
        lastName: split.lastName,
      } as any);
      const savedUser = await userRepo().save(user as any);

      const participant: ContestParticipant = participantRepo().create();
      Object.assign(participant, {
        contest: { id: contestId } as any,
        user: { id: savedUser.id } as any,
        principalType: "USER",
        displayName,
        notificationEmail: row.email || null,
        notificationFullName: split.fullName || displayName,
      });
      const savedParticipant = await participantRepo().save(participant as any);

      created.push({
        userId: savedUser.id,
        username: savedUser.username,
        password,
        participantId: savedParticipant.id,
        fullName: split.fullName || null,
        email: row.email || null,
      });
    }

    return res.json({
      contestId,
      created,
    });
  } catch (error: any) {
    logger.error("[contests] POST /:id/admin/accounts/generate error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Owner/admin: send generated contest credentials to participants by email from StudyCod.
contestsRouter.post("/:id/admin/accounts/send-emails", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const isOwner = contest.createdBy?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isOwner && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({
      recipients: z.array(z.object({
        fullName: z.string().min(1).max(160),
        email: z.string().email().max(255),
        username: z.string().min(1).max(120),
        password: z.string().min(1).max(200),
      })).min(1).max(300),
      includeContestInfo: z.boolean().optional(),
      customMessage: z.string().max(5000).optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const includeContestInfo = parsed.data.includeContestInfo !== false;
    const customMessage = String(parsed.data.customMessage ?? "").trim();
    const contestUrl = `${String(FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "")}/contest/contests/${contestId}`;

    const sent: Array<{ email: string }> = [];
    const failed: Array<{ email: string; reason: string }> = [];

    for (const r of parsed.data.recipients) {
      const email = String(r.email).trim().toLowerCase();
      const fullName = String(r.fullName).trim();
      const username = String(r.username).trim();
      const password = String(r.password);

      const introHtml = `<p style="margin:0 0 12px 0;">Вітаємо, <b>${escapeHtml(fullName)}</b>!</p>
<p style="margin:0 0 12px 0;">Для участі у контесті вам створено окремий акаунт StudyCod:</p>
<ul style="margin:0 0 12px 18px;padding:0;line-height:1.7;">
  <li><b>Логін:</b> ${escapeHtml(username)}</li>
  <li><b>Пароль:</b> ${escapeHtml(password)}</li>
</ul>`;

      const contestHtml = includeContestInfo
        ? `<p style="margin:0 0 8px 0;"><b>Контест:</b> ${escapeHtml(contest.title)}</p>
<p style="margin:0 0 8px 0;"><b>Початок:</b> ${contest.startsAt ? escapeHtml(new Date(contest.startsAt).toLocaleString("uk-UA")) : "—"}</p>
<p style="margin:0 0 12px 0;"><b>Завершення:</b> ${contest.endsAt ? escapeHtml(new Date(contest.endsAt).toLocaleString("uk-UA")) : "—"}</p>
<p style="margin:0 0 12px 0;">Посилання: <a href="${contestUrl}">${contestUrl}</a></p>`
        : "";

      const customHtml = customMessage
        ? `<div style="margin:12px 0 0 0;padding:12px;border:1px solid #1f3552;border-radius:10px;background:#0a1422;">${escapeHtml(customMessage).replace(/\n/g, "<br />")}</div>`
        : "";

      const html = `${introHtml}${contestHtml}${customHtml}`;
      const text = [
        `Вітаємо, ${fullName}!`,
        "",
        "Для участі у контесті вам створено окремий акаунт StudyCod:",
        `Логін: ${username}`,
        `Пароль: ${password}`,
        includeContestInfo ? "" : "",
        includeContestInfo ? `Контест: ${contest.title}` : "",
        includeContestInfo ? `Початок: ${contest.startsAt ? new Date(contest.startsAt).toLocaleString("uk-UA") : "—"}` : "",
        includeContestInfo ? `Завершення: ${contest.endsAt ? new Date(contest.endsAt).toLocaleString("uk-UA") : "—"}` : "",
        includeContestInfo ? `Посилання: ${contestUrl}` : "",
        customMessage ? "" : "",
        customMessage || "",
      ].filter(Boolean).join("\n");

      try {
        await emailService.sendNotificationEmail({
          to: email,
          subject: `StudyCod · Доступ до контесту «${contest.title}»`,
          title: "Дані для входу в контест",
          contentHtml: html,
          text,
        });
        sent.push({ email });
      } catch (error: any) {
        failed.push({
          email,
          reason: String(error?.message ?? "SEND_FAILED"),
        });
      }
    }

    return res.json({
      contestId,
      total: parsed.data.recipients.length,
      sentCount: sent.length,
      failedCount: failed.length,
      failed,
    });
  } catch (error: any) {
    logger.error("[contests] POST /:id/admin/accounts/send-emails error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: list annulments
contestsRouter.get("/:id/admin/annulments", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    await ensureContestAdminTables();
    const rows = (await AppDataSource.query(
      `
      SELECT id,
             problem_id as problemId,
             participant_id as participantId,
             reason,
             is_active as isActive,
             created_by_user_id as createdByUserId,
             created_at as createdAt,
             updated_at as updatedAt
      FROM contest_annulments
      WHERE contest_id = ?
      ORDER BY updated_at DESC, id DESC
      `,
      [contestId]
    )) as Array<any>;

    return res.json({
      contestId,
      annulments: rows.map((r) => ({
        id: Number(r.id),
        problemId: Number(r.problemId),
        participantId: Number(r.participantId) > 0 ? Number(r.participantId) : null,
        reason: r.reason != null ? String(r.reason) : null,
        isActive: Number(r.isActive) === 1 || r.isActive === true,
        createdByUserId: Number(r.createdByUserId),
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/annulments error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: set annulment active/inactive for a problem (all or specific participant)
contestsRouter.patch("/:id/admin/annulments", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({
      problemId: z.number().int().positive(),
      participantId: z.number().int().positive().nullable().optional(),
      annulled: z.boolean(),
      reason: z.string().max(5000).nullable().optional(),
    });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const problemId = parsed.data.problemId;
    const participantId = parsed.data.participantId != null ? parsed.data.participantId : 0;

    const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any });
    if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });

    if (participantId > 0) {
      const participant = await participantRepo().findOne({ where: { id: participantId, contest: { id: contestId } } as any });
      if (!participant) return res.status(404).json({ message: "PARTICIPANT_NOT_FOUND" });
    }

    await ensureContestAdminTables();

    await AppDataSource.query(
      `
      INSERT INTO contest_annulments (
        contest_id, problem_id, participant_id, reason, is_active, created_by_user_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        reason = VALUES(reason),
        is_active = VALUES(is_active),
        created_by_user_id = VALUES(created_by_user_id),
        updated_at = NOW()
      `,
      [contestId, problemId, participantId, parsed.data.reason?.trim() || null, parsed.data.annulled ? 1 : 0, req.userId]
    );

    const rows = (await AppDataSource.query(
      `
      SELECT id,
             problem_id as problemId,
             participant_id as participantId,
             reason,
             is_active as isActive,
             created_by_user_id as createdByUserId,
             created_at as createdAt,
             updated_at as updatedAt
      FROM contest_annulments
      WHERE contest_id = ? AND problem_id = ? AND participant_id = ?
      LIMIT 1
      `,
      [contestId, problemId, participantId]
    )) as Array<any>;
    const row = rows[0];
    if (!row) return res.status(500).json({ message: "UPDATE_FAILED" });

    return res.json({
      annulment: {
        id: Number(row.id),
        problemId: Number(row.problemId),
        participantId: Number(row.participantId) > 0 ? Number(row.participantId) : null,
        reason: row.reason != null ? String(row.reason) : null,
        isActive: Number(row.isActive) === 1 || row.isActive === true,
        createdByUserId: Number(row.createdByUserId),
        createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      },
    });
  } catch (error: any) {
    logger.error("[contests] PATCH /:id/admin/annulments error", { requestId: req.requestId, err: error });
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

    // Aggregate integrity events per participant (focus loss / paste / fullscreen exit).
    await ensureContestAdminTables();
    const integrityRows = (await AppDataSource.query(
      `
      SELECT participant_id as participantId, event_type as eventType, COUNT(*) as cnt
      FROM contest_integrity_events
      WHERE contest_id = ?
      GROUP BY participant_id, event_type
      `,
      [contestId]
    )) as Array<any>;
    const integrityByParticipant = new Map<number, { total: number; byType: Record<string, number> }>();
    for (const r of integrityRows) {
      const pid = Number(r.participantId);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const cnt = Number(r.cnt ?? 0) || 0;
      const entry = integrityByParticipant.get(pid) ?? { total: 0, byType: {} };
      entry.total += cnt;
      entry.byType[String(r.eventType ?? "OTHER")] = cnt;
      integrityByParticipant.set(pid, entry);
    }

    return res.json({
      contestId,
      participants: participants.map((p) => ({
        id: p.id,
        displayName: p.displayName,
        principalType: p.principalType,
        joinedAt: p.joinedAt ? new Date(p.joinedAt).toISOString() : null,
        contestAccountHandle: (p as any).contestAccountHandle ?? null,
        contestAccountNote: (p as any).contestAccountNote ?? null,
        isDisqualified: !!(p as any).isDisqualified,
        disqualificationReason: (p as any).disqualificationReason ?? null,
        disqualifiedAt: (p as any).disqualifiedAt ? new Date((p as any).disqualifiedAt).toISOString() : null,
        integrity: integrityByParticipant.get(p.id) ?? { total: 0, byType: {} },
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/participants error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// --- Code similarity (plagiarism heuristic) ---
function similarityTokenShingles(src: string, k = 5): Set<string> {
  let s = String(src ?? "").slice(0, 20_000);
  // Strip comments so cosmetic changes don't hide copies.
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ").replace(/#[^\n]*/g, " ");
  const tokens = s.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean);
  const set = new Set<string>();
  if (tokens.length < k) {
    if (tokens.length) set.add(tokens.join(" "));
    return set;
  }
  for (let i = 0; i + k <= tokens.length; i++) set.add(tokens.slice(i, i + k).join(" "));
  return set;
}
function similarityJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

// Organizer/admin: pairwise code-similarity for a problem's latest submissions.
contestsRouter.get("/:id/admin/similarity", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });
    const contestId = Number(req.params.id);
    const problemId = Number((req.query as any)?.problemId);
    if (!Number.isFinite(contestId) || contestId <= 0 || !Number.isFinite(problemId) || problemId <= 0) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const threshold = (() => {
      const n = Number((req.query as any)?.threshold);
      return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.6;
    })();

    // Latest CONTEST submission per participant for this problem.
    const rows = (await AppDataSource.query(
      `
      SELECT s.participant_id as participantId, s.submitted_code as code, s.language as language
      FROM contest_submissions s
      JOIN (
        SELECT participant_id, MAX(id) as maxId
        FROM contest_submissions
        WHERE contest_id = ? AND problem_id = ? AND phase = 'CONTEST'
        GROUP BY participant_id
      ) m ON s.id = m.maxId
      LIMIT 600
      `,
      [contestId, problemId]
    )) as Array<any>;

    const participants = await participantRepo().find({ where: { contest: { id: contestId } } as any });
    const nameById = new Map<number, string>();
    for (const p of participants) nameById.set(p.id, String((p as any).displayName ?? `#${p.id}`));

    type Entry = { participantId: number; displayName: string; language: string; shingles: Set<string> };
    const entries: Entry[] = [];
    for (const r of rows) {
      const pid = Number(r.participantId);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const raw = String(r.code ?? "");
      const decoded = decodeMultiFileSubmissionV1(raw);
      const text = decoded?.files?.length ? decoded.files.map((f) => f.content).join("\n") : raw;
      const shingles = similarityTokenShingles(text);
      if (shingles.size === 0) continue;
      entries.push({ participantId: pid, displayName: nameById.get(pid) ?? `#${pid}`, language: String(r.language ?? ""), shingles });
    }

    const pairs: Array<{
      a: { participantId: number; displayName: string };
      b: { participantId: number; displayName: string };
      similarity: number;
      language: string;
    }> = [];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const sim = similarityJaccard(entries[i].shingles, entries[j].shingles);
        if (sim >= threshold) {
          pairs.push({
            a: { participantId: entries[i].participantId, displayName: entries[i].displayName },
            b: { participantId: entries[j].participantId, displayName: entries[j].displayName },
            similarity: Math.round(sim * 1000) / 1000,
            language: entries[i].language === entries[j].language ? entries[i].language : `${entries[i].language}/${entries[j].language}`,
          });
        }
      }
    }
    pairs.sort((x, y) => y.similarity - x.similarity);

    return res.json({
      contestId,
      problemId,
      threshold,
      comparedSubmissions: entries.length,
      pairs: pairs.slice(0, 100),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/admin/similarity error", { requestId: req.requestId, err: error });
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

    const participant = await participantRepo().findOne({
      where: { id: participantId, contest: { id: contestId } } as any,
      relations: ["user", "student"] as any,
    });
    if (!participant) return res.status(404).json({ message: "PARTICIPANT_NOT_FOUND" });

    (participant as any).isDisqualified = parsed.data.disqualified;
    (participant as any).disqualificationReason = parsed.data.disqualified ? (parsed.data.reason?.trim() || null) : null;
    (participant as any).disqualifiedAt = parsed.data.disqualified ? new Date() : null;
    const saved = await participantRepo().save(participant as any);

    let notification: {
      attempted: boolean;
      sent: boolean;
      recipientEmail: string | null;
      reason: string | null;
    } = {
      attempted: false,
      sent: false,
      recipientEmail: null,
      reason: null,
    };

    if (parsed.data.disqualified) {
      const snapshotEmail = String((participant as any)?.notificationEmail ?? "").trim().toLowerCase();
      const userEmail = String((participant as any)?.user?.email ?? "").trim().toLowerCase();
      const studentEmail = String((participant as any)?.student?.email ?? "").trim().toLowerCase();
      const recipientEmail = snapshotEmail || userEmail || studentEmail || "";

      if (!snapshotEmail && recipientEmail) {
        try {
          (saved as any).notificationEmail = recipientEmail;
          await participantRepo().save(saved as any);
        } catch (persistError: any) {
          logger.warn("[contests] failed to persist participant notification_email snapshot", {
            requestId: req.requestId,
            contestId,
            participantId,
            recipientEmail,
            err: persistError,
          });
        }
      }

      const reasonText = String((saved as any).disqualificationReason ?? "").trim() || "Не вказано";
      const disqualifiedAtIso = (saved as any).disqualifiedAt
        ? new Date((saved as any).disqualifiedAt).toISOString()
        : new Date().toISOString();
      const disqualifiedAtDisplay = new Date(disqualifiedAtIso).toLocaleString("uk-UA");
      const contestUrl = `${String(FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "")}/contest/contests/${contestId}`;

      if (!recipientEmail) {
        notification = {
          attempted: false,
          sent: false,
          recipientEmail: null,
          reason: "EMAIL_NOT_AVAILABLE",
        };
      } else {
        const participantName = String((participant as any).notificationFullName ?? participant.displayName ?? "учасник").trim() || "учасник";
        const contentHtml = `
<p style="margin:0 0 12px 0;">Вітаємо, <b>${escapeHtml(participantName)}</b>.</p>
<p style="margin:0 0 12px 0;">Повідомляємо, що вас дискваліфіковано з контесту <b>${escapeHtml(contest.title)}</b>.</p>
<p style="margin:0 0 8px 0;"><b>Дата/час рішення:</b> ${escapeHtml(disqualifiedAtDisplay)}</p>
<p style="margin:0 0 12px 0;"><b>Причина дискваліфікації:</b> ${escapeHtml(reasonText)}</p>

<div style="margin:0 0 12px 0;padding:12px;border:1px solid #1f3552;border-radius:10px;background:#0a1422;">
  <p style="margin:0 0 8px 0;"><b>Нагадування про академічну доброчесність:</b></p>
  <ul style="margin:0 0 0 18px;padding:0;line-height:1.7;">
    <li>самостійне виконання завдань без списування;</li>
    <li>заборона на плагіат, передачу або спільне написання змагального коду;</li>
    <li>дотримання правил контесту та чесної конкуренції.</li>
  </ul>
</div>

<p style="margin:0 0 8px 0;">Якщо вважаєте, що рішення прийнято помилково, зверніться до організатора контесту та надайте пояснення.</p>
<p style="margin:0;">Посилання на контест: <a href="${contestUrl}">${contestUrl}</a></p>
        `;

        const text = [
          `Вітаємо, ${participantName}.`,
          "",
          `Вас дискваліфіковано з контесту \"${contest.title}\".`,
          `Дата/час рішення: ${disqualifiedAtDisplay}`,
          `Причина дискваліфікації: ${reasonText}`,
          "",
          "Нагадування про академічну доброчесність:",
          "- самостійне виконання завдань без списування;",
          "- заборона на плагіат, передачу або спільне написання змагального коду;",
          "- дотримання правил контесту та чесної конкуренції.",
          "",
          "Якщо вважаєте, що рішення прийнято помилково, зверніться до організатора контесту.",
          `Посилання на контест: ${contestUrl}`,
        ].join("\n");

        try {
          await emailService.sendNotificationEmail({
            to: recipientEmail,
            subject: `StudyCod · Дискваліфікація з контесту «${contest.title}»`,
            title: "Повідомлення про дискваліфікацію",
            contentHtml,
            text,
          });
          notification = {
            attempted: true,
            sent: true,
            recipientEmail,
            reason: null,
          };
        } catch (mailError: any) {
          logger.error("[contests] disqualification email send failed", {
            requestId: req.requestId,
            contestId,
            participantId,
            recipientEmail,
            err: mailError,
          });
          notification = {
            attempted: true,
            sent: false,
            recipientEmail,
            reason: "EMAIL_SEND_FAILED",
          };
        }
      }
    }

    return res.json({
      participant: {
        id: saved.id,
        isDisqualified: !!(saved as any).isDisqualified,
        disqualificationReason: (saved as any).disqualificationReason ?? null,
        disqualifiedAt: (saved as any).disqualifiedAt ? new Date((saved as any).disqualifiedAt).toISOString() : null,
      },
      notification,
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
        contestAccountHandle: (participant as any).contestAccountHandle ?? null,
        contestAccountNote: (participant as any).contestAccountNote ?? null,
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
          // Optional subtask identifier for binary (0/full) subtask scoring.
          subtask: z.number().int().min(1).max(100000).optional(),
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
                subtask: typeof (tt as any).subtask === "number" ? String((tt as any).subtask) : null,
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
            subtask: (t as any).subtask ?? null,
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
      const isPrivileged = req.userRole === "SYSTEM_ADMIN" || Boolean(req.userId && (await canManageContest({ contest, req })));
      if (!timeState.started && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_NOT_STARTED" });
      }
      const allowUpsolve = (contest as any).allowUpsolve ?? true;
      if (!timeState.active && !(timeState.finished && allowUpsolve) && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_NOT_ACTIVE" });
      }

      const isPaused = await getContestPausedState(contestId);
      if (isPaused && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_PAUSED" });
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
        files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) })).max(64).optional(),
        language: z.string().optional(),
        compiler: z.string().max(32).optional(),
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
      const defaultLimitsByLang = DEFAULT_LIMITS_BY_LANG;
      const effectiveLimits = {
        time_limit_ms: taskLimits.time_limit_ms ?? defaultLimitsByLang[judgeLang].time_limit_ms,
        memory_limit_mb: taskLimits.memory_limit_mb ?? defaultLimitsByLang[judgeLang].memory_limit_mb,
        output_limit_kb: taskLimits.output_limit_kb ?? defaultLimitsByLang[judgeLang].output_limit_kb,
      };

      const normalizedFiles = normalizeApiFiles((validated.data as any).files);
      const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
      const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
      const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
      let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
      const isMultiFile = effectiveFiles.length > 0;
      if (isMultiFile && !effectiveFiles.some((f) => f.path === entryFile)) {
        effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
      }
      const sourceText = isMultiFile ? (effectiveFiles.find((f) => f.path === entryFile)?.content ?? "") : providedCode;

      const workerReq: WorkerJudgeRequest = {
        submission_id: `contest_run_${contestId}_${problemId}_${Date.now()}`,
        language: judgeLang,
        ...(normCompilerId((validated.data as any).compiler) ? { compiler: normCompilerId((validated.data as any).compiler) } : {}),
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
        return res.json({
          stdout: "",
          stderr: (combined || fallbackHint).slice(0, 40_000),
          exitCode: 1,
          success: false,
          verdict: "CE",
          timeMs: null,
          memoryKb: null,
        });
      }

      const t0 = workerRes.tests?.[0];
      const stdout = (t0 as any)?.actual ?? "";
      const stderr = (t0 as any)?.stderr ?? "";
      const success = workerRes.verdict === "AC" || workerRes.verdict === "WA";
      const timeMs = Number.isFinite(Number((t0 as any)?.time_ms)) ? Number((t0 as any)?.time_ms) : null;
      const memoryKb = Number.isFinite(Number((t0 as any)?.memory_kb)) ? Number((t0 as any)?.memory_kb) : null;
      return res.json({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
        exitCode: success ? 0 : 1,
        success,
        verdict: workerRes.verdict ?? null,
        timeMs,
        memoryKb,
      });
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

      const isPrivileged = req.userRole === "SYSTEM_ADMIN" || (req.userId && (await canManageContest({ contest, req })));
      const isPaused = await getContestPausedState(contestId);
      if (isPaused && !isPrivileged) {
        return res.status(403).json({ message: "CONTEST_PAUSED" });
      }

      const participant = await getOrCreateParticipant({ contestId, req });
      if ((participant as any).isDisqualified) {
        return res.status(403).json({ message: "PARTICIPANT_DISQUALIFIED" });
      }

      const schema = z
        .object({
          code: z.string().min(1).max(200_000).optional(),
          files: z.array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) })).max(64).optional(),
          language: z.string().optional(),
          compiler: z.string().max(32).optional(),
          turnstileToken: z.string().min(1).max(4096).optional(),
        })
        .refine((v) => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
          message: "code or files required",
        });
      const validated = schema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
      }

      const turnstileSecretKey = String(env.TURNSTILE_SECRET_KEY ?? "").trim();
      const enforceTurnstileOnContestSubmit = Boolean(env.__turnstileEnforceContestSubmit);
      // Human verification is enforced for regular participants.
      // Privileged users (SYSTEM_ADMIN / contest managers) are allowed to submit without Turnstile token.
      if (enforceTurnstileOnContestSubmit && turnstileSecretKey && !isPrivileged) {
        const token = String((validated.data as any).turnstileToken ?? "").trim();
        if (!token) {
          return res.status(400).json({ message: "TURNSTILE_REQUIRED" });
        }
        const verification = await verifyTurnstileToken({
          secretKey: turnstileSecretKey,
          token,
          remoteIp: getClientIp(req),
        });
        if (!verification.success) {
          return res.status(403).json({ message: "TURNSTILE_FAILED", errorCodes: verification.errorCodes });
        }
      }

      const problem = await problemRepo().findOne({ where: { id: problemId, contest: { id: contestId } } as any, relations: ["libraryTask"] as any });
      if (!problem) return res.status(404).json({ message: "PROBLEM_NOT_FOUND" });
      const taskId = (problem.libraryTask as any)?.id;
      const task = await libraryRepo().findOne({ where: { id: taskId } as any, relations: ["author"] as any });
      if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

      // Metadata-only: exclude the big `input` column (read lazily for cache misses only).
      const tests = await testDataRepo().find({
        where: { libraryTask: { id: task.id } } as any,
        order: { id: "ASC" } as any,
        select: {
          id: true,
          isHidden: true,
          kind: true,
          points: true,
          subtask: true,
          expectedOutput: true,
          inputSha256: true,
          outputSha256: true
        } as any
      });
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
      const defaultLimitsByLang = DEFAULT_LIMITS_BY_LANG;
      const effectiveLimits = {
        time_limit_ms: taskLimits.time_limit_ms ?? defaultLimitsByLang[judgeLang].time_limit_ms,
        memory_limit_mb: taskLimits.memory_limit_mb ?? defaultLimitsByLang[judgeLang].memory_limit_mb,
        output_limit_kb: taskLimits.output_limit_kb ?? defaultLimitsByLang[judgeLang].output_limit_kb,
      };

      const explicitChecker = (task as any).checkerSpec as CheckerSpec | null | undefined;
      const effectiveChecker = explicitChecker ?? chooseDefaultCheckerFromExpectedOutputs(tests.map((t) => t.expectedOutput || ""));
      const maxScore = tests.reduce((sum, t) => sum + (t.points || 1), 0);
      const hasSubtasks = tests.some(t => String((t as any).subtask ?? "").trim().length > 0);

      const normalizedFiles = normalizeApiFiles((validated.data as any).files);
      const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
      const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
      const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
      let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
      const isMultiFile = effectiveFiles.length > 0;
      if (isMultiFile && !effectiveFiles.some((f) => f.path === entryFile)) {
        effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
      }
      const sourceText = isMultiFile ? (effectiveFiles.find((f) => f.path === entryFile)?.content ?? "") : providedCode;
      const persistedSubmitted = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;

      const principalTag = req.userType === "STUDENT" ? `student_${req.studentId}` : `user_${req.userId}`;
      const { tests: workerTests } = await buildJudgeTests(tests, {
        meta: (t) => {
          const subtaskRaw = (t as any).subtask ?? "";
          const subtaskGroup = String(subtaskRaw ?? "").trim();
          const group = hasSubtasks ? (subtaskGroup ? subtaskGroup : `unassigned_${t.id}`) : t.isHidden === true ? "hidden" : "public";
          return { hidden: t.isHidden === true, group, weight: t.points || 1 };
        },
        hashes: (t) => ({ inputHash: (t as any).inputSha256, outputHash: (t as any).outputSha256 }),
        loadContent: loadTestContentByIds
      });
      const submitCompiler = normCompilerId((validated.data as any).compiler);
      const workerReq: WorkerJudgeRequest = {
        submission_id: `contest_${contestId}_${problemId}_${principalTag}_${Date.now()}`,
        language: judgeLang,
        ...(submitCompiler ? { compiler: submitCompiler } : {}),
        source: sourceText,
        ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
        // IOI-style binary subtasks: each `test.subtask` becomes a group,
        // group score is 0/full depending on whether all tests in the subtask passed.
        group_scoring_mode: hasSubtasks ? "BINARY_ALL_OR_NOT" : undefined,
        tests: workerTests,
        limits: effectiveLimits,
        checker: effectiveChecker,
        // Debug captures per-test actual/expected so we can return failing-test
        // detail to the solver. Hidden-test payloads are filtered out below and
        // never leave the server.
        debug: true,
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
      const groupScores = Array.isArray((workerRes as any).group_scores)
        ? (workerRes as any).group_scores.map((gs: any) => ({
            group: String(gs?.group ?? ""),
            score: Number.isFinite(Number(gs?.score)) ? Number(gs.score) : 0,
            max_score: Number.isFinite(Number(gs?.max_score)) ? Number(gs.max_score) : 0,
          }))
        : null;

      const truncateForClient = (value: unknown, max = 4_000): string => {
        const s = String(value ?? "");
        return s.length > max ? `${s.slice(0, max)}\n… (truncated)` : s;
      };

      type PerTestResult = {
        index: number;
        group: string;
        hidden: boolean;
        verdict: string | null;
        timeMs: number | null;
        memoryKb: number | null;
      };
      const perTest: PerTestResult[] = [];
      let firstFailure:
        | {
            index: number;
            verdict: string | null;
            hidden: boolean;
            group: string;
            input?: string;
            expected?: string;
            actual?: string;
            stderr?: string;
          }
        | null = null;
      let maxTimeMs = 0;
      let maxMemoryKb = 0;

      if (workerRes.verdict === "CE" && workerRes.compile) {
        compileErrorKind = workerRes.compile.error_kind ?? null;
        const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        compileError = combined ? combined.slice(0, 40_000) : "Compilation error";
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (let i = 0; i < tests.length; i++) {
          const t = tests[i];
          const r = byId.get(String(t.id));
          const verdict = r?.verdict ?? null;
          const passed = verdict === "AC";
          const hidden = t.isHidden === true;
          const subtask = String((t as any).subtask ?? "").trim();
          const group = subtask || (hidden ? "hidden" : "public");
          const timeMs = Number.isFinite(Number(r?.time_ms)) ? Number(r?.time_ms) : null;
          const memoryKb = Number.isFinite(Number(r?.memory_kb)) ? Number(r?.memory_kb) : null;
          if (timeMs != null && timeMs > maxTimeMs) maxTimeMs = timeMs;
          if (memoryKb != null && memoryKb > maxMemoryKb) maxMemoryKb = memoryKb;

          perTest.push({ index: i + 1, group, hidden, verdict, timeMs, memoryKb });

          if (passed) {
            totalPassed++;
            totalScore += t.points || 1;
          } else if (!firstFailure) {
            // Only expose input/expected/actual for NON-hidden (sample/public) tests.
            firstFailure = hidden
              ? { index: i + 1, verdict, hidden: true, group }
              : {
                  index: i + 1,
                  verdict,
                  hidden: false,
                  group,
                  // Input sample comes from the judge (debug) since the route no longer
                  // loads the full `input` column; expected output is still in metadata.
                  input: truncateForClient((r as any)?.input ?? ""),
                  expected: truncateForClient(t.expectedOutput ?? ""),
                  actual: truncateForClient((r as any)?.actual ?? ""),
                  stderr: truncateForClient((r as any)?.stderr ?? "", 2_000),
                };
          }
        }
      }

      const scoringScore = typeof workerRes.score === "number" ? workerRes.score : totalScore;
      const scoringMaxScore = typeof workerRes.max_score === "number" ? workerRes.max_score : maxScore;
      const weighted = scaleScoreToProblemPoints(scoringScore, scoringMaxScore, (problem as any).points ?? null);
      const annulled = await isProblemAnnulledForParticipant(contestId, problemId, participant.id);
      const finalScore = annulled ? 0 : weighted.score;

      const newSubmission: ContestSubmission = submissionRepo().create();
      Object.assign(newSubmission, {
        contest: { id: contestId } as any,
        problem: { id: problemId } as any,
        participant: { id: participant.id } as any,
        language: judgeLang,
        submittedCode: persistedSubmitted,
        verdict: workerRes.verdict ?? null,
        score: finalScore,
        maxScore: weighted.maxScore,
        testsPassed: totalPassed,
        testsTotal: tests.length,
        compileErrorKind,
        groupScores: groupScores ? JSON.stringify(groupScores) : null,
        phase: submissionPhase,
      });
      const saved: ContestSubmission = await submissionRepo().save(newSubmission as any);

      // Notify live SSE subscribers that the board may have changed. No scores
      // are included, so this is freeze-safe — clients refetch /standings.
      publishContestEvent(contestId, { kind: "scoreboard", at: Date.now() });

      return res.json({
        submissionId: saved.id,
        phase: submissionPhase,
        verdict: workerRes.verdict ?? null,
        testsPassed: totalPassed,
        testsTotal: tests.length,
        score: finalScore,
        maxScore: weighted.maxScore,
        compileError,
        compileErrorKind,
        annulled,
        maxTimeMs: maxTimeMs > 0 ? maxTimeMs : null,
        maxMemoryKb: maxMemoryKb > 0 ? maxMemoryKb : null,
        tests: perTest,
        firstFailure,
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
               compile_error_kind as compileErrorKind,
               group_scores as groupScores
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
          groupScores: (() => {
            if (r.groupScores == null) return null;
            try {
              const parsed = typeof r.groupScores === "string" ? JSON.parse(r.groupScores) : r.groupScores;
              if (!Array.isArray(parsed)) return null;
              return parsed.map((gs: any) => ({
                group: String(gs?.group ?? ""),
                score: Number.isFinite(Number(gs?.score)) ? Number(gs.score) : 0,
                maxScore: Number.isFinite(Number(gs?.max_score)) ? Number(gs.max_score) : Number.isFinite(Number(gs?.maxScore)) ? Number(gs.maxScore) : 0,
              }));
            } catch {
              return null;
            }
          })(),
      })),
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/problems/:problemId/submissions error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Per-problem progress summary for the current participant (used for the scoreboard-like table).
// Includes best contest-phase score and last submission (any phase).
// Participant integrity signal (tab/focus loss, large paste, fullscreen exit).
// Best-effort, recorded only during the active window for non-managers.
const INTEGRITY_EVENT_TYPES = new Set(["FOCUS_LOST", "BLUR", "PASTE", "FULLSCREEN_EXIT"]);
contestsRouter.post("/:id/integrity", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const timeState = getContestTimeState(contest);
    if (!timeState.active) return res.json({ recorded: false });

    const schema = z.object({ type: z.string().min(1).max(32), detail: z.string().max(255).optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const type = parsed.data.type.trim().toUpperCase();
    if (!INTEGRITY_EVENT_TYPES.has(type)) return res.status(400).json({ message: "UNKNOWN_EVENT_TYPE" });

    // Don't track organizers/admins.
    const isManager = req.userId ? await canManageContest({ contest, req }) : false;
    if (isManager) return res.json({ recorded: false });

    const participant = await getOrCreateParticipant({ contestId, req });
    if ((participant as any).isDisqualified) return res.json({ recorded: false });

    await ensureContestAdminTables();
    // Coarse anti-spam cap.
    const countRows = (await AppDataSource.query(
      `SELECT COUNT(*) as c FROM contest_integrity_events WHERE contest_id = ? AND participant_id = ?`,
      [contestId, participant.id]
    )) as Array<any>;
    if (Number(countRows?.[0]?.c ?? 0) >= 2000) return res.json({ recorded: false });

    await AppDataSource.query(
      `INSERT INTO contest_integrity_events (contest_id, participant_id, event_type, detail, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [contestId, participant.id, type, parsed.data.detail ?? null]
    );
    return res.json({ recorded: true });
  } catch (error: any) {
    logger.error("[contests] POST /:id/integrity error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

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

    await ensureContestAdminTables();
    const annulmentRows = (await AppDataSource.query(
      `
      SELECT problem_id as problemId,
             participant_id as participantId,
             is_active as isActive
      FROM contest_annulments
      WHERE contest_id = ?
        AND is_active = 1
        AND (participant_id = 0 OR participant_id = ?)
      `,
      [contestId, participant.id]
    )) as Array<any>;
    const globallyAnnulled = new Set<number>();
    const participantAnnulled = new Set<number>();
    for (const r of annulmentRows) {
      const problemId = Number(r.problemId);
      const participantId = Number(r.participantId);
      if (!Number.isFinite(problemId) || problemId <= 0) continue;
      if (participantId === 0) globallyAnnulled.add(problemId);
      else if (participantId === participant.id) participantAnnulled.add(problemId);
    }

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
      const isAnnulled = globallyAnnulled.has(p.id) || participantAnnulled.has(p.id);
      const lastId = lastIdByProblem.get(p.id) ?? null;
      const last = lastId ? lastById.get(lastId) ?? null : null;
      return {
        problemId: p.id,
        order: p.order,
        label: p.label ?? labelFromOrder(p.order),
        title: p.libraryTask?.title ?? "",
        maxScore,
        bestContestScore: isAnnulled ? 0 : best.bestScore,
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

// Unified live standings. Returns IOI totals AND ICPC (solved + penalty) stats,
// first-to-solve markers, per-problem max points, and freeze metadata. The
// `scoringMode` field tells the UI which ranking is authoritative; `rows` are
// pre-sorted accordingly. (The legacy ICPC-only GET /:id/scoreboard route still
// exists for older clients.)
const ICPC_PENALTY_PER_WRONG = 20;
contestsRouter.get("/:id/standings", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const scoringMode: "IOI" | "ICPC" = (contest as any).scoringMode === "ICPC" ? "ICPC" : "IOI";

    const problems = await problemRepo().find({
      where: { contest: { id: contestId } } as any,
      relations: ["libraryTask"] as any,
      order: { order: "ASC" } as any,
    });

    // Per-problem max points (problem.points override, else sum of test points).
    const taskIds = problems.map((p) => Number((p.libraryTask as any)?.id)).filter((x) => Number.isFinite(x) && x > 0);
    const maxByTask = await getMaxScoreByLibraryTaskId(taskIds);
    const problemMaxPoints = (p: ContestProblem): number => {
      const pts = (p as any).points;
      if (pts != null && Number(pts) > 0) return Math.floor(Number(pts));
      const tid = Number((p.libraryTask as any)?.id);
      return Number.isFinite(tid) && tid > 0 ? (maxByTask.get(tid) ?? 0) : 0;
    };

    const participants = await participantRepo().find({ where: { contest: { id: contestId } } as any, order: { joinedAt: "ASC" } as any });
    const activeParticipants = participants.filter((p) => !(p as any).isDisqualified);

    await ensureContestAdminTables();
    const annulmentRows = (await AppDataSource.query(
      `
      SELECT problem_id as problemId,
             participant_id as participantId,
             is_active as isActive
      FROM contest_annulments
      WHERE contest_id = ?
        AND is_active = 1
      `,
      [contestId]
    )) as Array<any>;
    const globalAnnulledProblems = new Set<number>();
    const participantProblemAnnulled = new Set<string>();
    for (const r of annulmentRows) {
      const problemId = Number(r.problemId);
      const participantId = Number(r.participantId);
      if (!Number.isFinite(problemId) || problemId <= 0) continue;
      if (participantId === 0) {
        globalAnnulledProblems.add(problemId);
      } else if (Number.isFinite(participantId) && participantId > 0) {
        participantProblemAnnulled.add(`${participantId}:${problemId}`);
      }
    }
    const isAnnulledFor = (participantId: number, problemId: number): boolean =>
      globalAnnulledProblems.has(problemId) || participantProblemAnnulled.has(`${participantId}:${problemId}`);

    const endsAtMs = contest.endsAt ? new Date(contest.endsAt).getTime() : null;
    const startsAtMs = contest.startsAt ? new Date(contest.startsAt).getTime() : null;
    const nowMs = Date.now();
    // Freeze the final hour by default (UI decides how to render frozen rows).
    const freezeAtMs = endsAtMs != null ? endsAtMs - 60 * 60 * 1000 : null;
    const finished = endsAtMs != null && nowMs > endsAtMs;
    const frozen = freezeAtMs != null && nowMs >= freezeAtMs && !finished;
    // Managers/admins always see the live board; participants see a frozen board
    // (submissions after the freeze cutoff are withheld) during the freeze window.
    const isManager = req.userId ? await canManageContest({ contest, req }) : false;
    const viewerFrozen = frozen && !isManager;
    const cutoffMs = viewerFrozen && freezeAtMs != null ? freezeAtMs : null;

    const baseProblems = problems.map((p) => ({
      id: p.id,
      order: p.order,
      label: p.label ?? labelFromOrder(p.order),
      maxScore: problemMaxPoints(p),
    }));

    if (activeParticipants.length === 0) {
      return res.json({
        contestId,
        scoringMode,
        problems: baseProblems,
        rows: [],
        firstBlood: {},
        freeze: { enabled: freezeAtMs != null, freezeAtMs, frozen: viewerFrozen, isManagerView: isManager },
        disqualifiedCount: participants.length,
        generatedAtMs: nowMs,
      });
    }

    // Fetch all contest-phase submissions once; derive both IOI best scores and
    // ICPC stats in JS so the freeze cutoff can be applied uniformly.
    const allSubs = (await AppDataSource.query(
      `
      SELECT id,
             participant_id as participantId,
             problem_id as problemId,
             verdict as verdict,
             COALESCE(score, 0) as score,
             created_at as createdAt
      FROM contest_submissions
      WHERE contest_id = ? AND phase = 'CONTEST'
      ORDER BY created_at ASC, id ASC
      `,
      [contestId]
    )) as Array<any>;

    // IOI best score per (participant, problem) as of the freeze cutoff, and a
    // "pending" flag for cells whose latest activity is hidden behind the freeze.
    const byKey = new Map<string, { bestScore: number; bestAt: string | null }>();
    const pendingByKey = new Set<string>();
    const submissionTimes: number[] = [];
    for (const s of allSubs) {
      const pid = Number(s.participantId);
      const pr = Number(s.problemId);
      if (!Number.isFinite(pid) || !Number.isFinite(pr)) continue;
      const tMs = new Date(s.createdAt).getTime();
      if (Number.isFinite(tMs)) submissionTimes.push(tMs);
      const key = `${pid}:${pr}`;
      if (cutoffMs != null && tMs > cutoffMs) {
        pendingByKey.add(key);
        continue;
      }
      const sc = Number(s.score ?? 0) || 0;
      const prev = byKey.get(key);
      if (!prev || sc > prev.bestScore) {
        byKey.set(key, { bestScore: sc, bestAt: new Date(s.createdAt).toISOString() });
      }
    }

    const icpcStartMs = startsAtMs ?? (submissionTimes.length ? Math.min(...submissionTimes) : nowMs);

    const scoreSubs: ScoreboardSubmission[] = allSubs
      .filter((s) => !isAnnulledFor(Number(s.participantId), Number(s.problemId)))
      .filter((s) => endsAtMs == null || new Date(s.createdAt).getTime() <= endsAtMs)
      .filter((s) => cutoffMs == null || new Date(s.createdAt).getTime() <= cutoffMs)
      .map((s) => ({
        participantId: Number(s.participantId),
        problemId: Number(s.problemId),
        verdict: s.verdict != null ? String(s.verdict) : null,
        createdAtMs: new Date(s.createdAt).getTime(),
      }));
    const icpcBoard = computeScoreboard(scoreSubs, { startMs: icpcStartMs, penaltyPerWrong: ICPC_PENALTY_PER_WRONG, nowMs });
    const icpcByParticipant = new Map<number, (typeof icpcBoard.rows)[number]>();
    for (const r of icpcBoard.rows) icpcByParticipant.set(r.participantId, r);

    // First-to-solve per problem: earliest AC across all participants.
    const firstBlood: Record<number, { participantId: number; atMs: number }> = {};
    for (const r of icpcBoard.rows) {
      for (const [pidStr, cell] of Object.entries(r.problems)) {
        if (!cell.solved || cell.firstAcMs == null) continue;
        const problemId = Number(pidStr);
        const current = firstBlood[problemId];
        if (!current || cell.firstAcMs < current.atMs) {
          firstBlood[problemId] = { participantId: r.participantId, atMs: cell.firstAcMs };
        }
      }
    }

    const rows = activeParticipants
      .map((p) => {
        const icpc = icpcByParticipant.get(p.id);
        const perProblem = problems.map((pr) => {
          const key = `${p.id}:${pr.id}`;
          const hit = byKey.get(key);
          const annulled = isAnnulledFor(p.id, pr.id);
          const cell = icpc?.problems[pr.id];
          return {
            problemId: pr.id,
            score: annulled ? 0 : (hit?.bestScore ?? 0),
            bestAt: hit?.bestAt ?? null,
            // ICPC enrichments
            solved: annulled ? false : Boolean(cell?.solved),
            attempts: annulled ? 0 : Number(cell?.tries ?? 0),
            penaltyMinutes: annulled ? 0 : Number(cell?.penaltyMinutes ?? 0),
            firstAcMs: annulled ? null : (cell?.firstAcMs ?? null),
            isFirstBlood: !annulled && cell?.solved === true && cell?.firstAcMs != null && firstBlood[pr.id]?.participantId === p.id,
            pending: !annulled && pendingByKey.has(key),
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
          solved: Number(icpc?.solved ?? 0),
          penalty: Number(icpc?.penalty ?? 0),
          lastAcMs: icpc?.lastAcMs ?? null,
          lastImprovementAt,
          problems: perProblem,
        };
      })
      .sort((a, b) => {
        if (scoringMode === "ICPC") {
          if (b.solved !== a.solved) return b.solved - a.solved;
          if (a.penalty !== b.penalty) return a.penalty - b.penalty;
          const la = a.lastAcMs ?? Number.POSITIVE_INFINITY;
          const lb = b.lastAcMs ?? Number.POSITIVE_INFINITY;
          if (la !== lb) return la - lb;
          return a.participantId - b.participantId;
        }
        if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
        const ta = a.lastImprovementAt ? new Date(a.lastImprovementAt).getTime() : Number.POSITIVE_INFINITY;
        const tb = b.lastImprovementAt ? new Date(b.lastImprovementAt).getTime() : Number.POSITIVE_INFINITY;
        if (ta !== tb) return ta - tb;
        return a.participantId - b.participantId;
      })
      .map((r, idx) => ({ rank: idx + 1, ...r }));

    return res.json({
      contestId,
      scoringMode,
      problems: baseProblems,
      rows,
      firstBlood,
      freeze: { enabled: freezeAtMs != null, freezeAtMs, frozen: viewerFrozen, isManagerView: isManager },
      disqualifiedCount: participants.length - activeParticipants.length,
      generatedAtMs: nowMs,
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/standings error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Live updates over Server-Sent Events. EventSource cannot set headers, so a
// token may be supplied via ?token= and is promoted to a Bearer header here.
function sseAuthShim(req: AuthRequest, _res: Response, next: () => void): void {
  const qToken = typeof (req.query as any)?.token === "string" ? String((req.query as any).token) : "";
  if (!req.headers.authorization && qToken) {
    req.headers.authorization = `Bearer ${qToken}`;
  }
  next();
}

contestsRouter.get("/:id/events", sseAuthShim, authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });
    const allowed = await canAccessContest({ contest, req });
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx) so events flush immediately.
      "X-Accel-Buffering": "no",
    });
    (res as any).flushHeaders?.();
    res.write("retry: 5000\n\n");
    res.write(`event: ready\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);

    const send = (event: ContestEvent) => {
      try {
        res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      } catch {
        // connection likely closed; cleanup happens on "close"
      }
    };
    const unsubscribe = subscribeContestEvents(contestId, send);
    const heartbeat = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        // ignore
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      try {
        res.end();
      } catch {
        // ignore
      }
    });
  } catch (error: any) {
    logger.error("[contests] GET /:id/events error", { requestId: req.requestId, err: error });
    if (!res.headersSent) res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Organizer/admin: enqueue certificate generation for all non-disqualified participants
contestsRouter.post("/:id/generate-certificates", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId || req.userType !== "USER") return res.status(403).json({ message: "ONLY_USERS" });

    const contestId = Number(req.params.id);
    if (!Number.isFinite(contestId) || contestId <= 0) return res.status(400).json({ message: "INVALID_ID" });

    const contest = await contestRepo().findOne({ where: { id: contestId } as any, relations: ["createdBy", "class"] as any });
    if (!contest) return res.status(404).json({ message: "NOT_FOUND" });

    const canManage = await canManageContest({ contest, req });
    if (!canManage) return res.status(403).json({ message: "ACCESS_DENIED" });

    const schema = z.object({ forceRegenerate: z.boolean().optional() });
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT", errors: parsed.error.issues });

    const job = await certificateService.enqueueContestGeneration({
      contestId,
      requestedByUserId: req.userId,
      forceRegenerate: parsed.data.forceRegenerate,
    });

    return res.json({
      queued: true,
      contestId,
      jobId: job.jobId,
    });
  } catch (error: any) {
    if (String(error?.message ?? "") === "CERTIFICATES_DISABLED_FOR_CONTEST") {
      return res.status(400).json({ message: "CERTIFICATES_DISABLED_FOR_CONTEST" });
    }
    logger.error("[contests] POST /:id/generate-certificates error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default contestsRouter;
