import { Router, Response, NextFunction } from "express";
import { z } from "zod";
import AdmZip from "adm-zip";
import { validateUploadedZip, ZipValidationError, ZipExtractionBudget, ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES } from "../utils/zipUploadValidator";
import multer from "multer";
import { createHash } from "crypto";
import { AppDataSource } from "../data-source";
import { authOptional, authRequired, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { teacherOrAdminGuard } from "../middleware/rolesGuard";
import { User } from "../entities/User";
import { LibraryTask, type LibraryTaskLang, type LibraryTaskStatus } from "../entities/LibraryTask";
import { LibraryTaskAttempt } from "../entities/LibraryTaskAttempt";
import { recommendDifficulty, shouldRecalibrate } from "../services/calibration/difficultyCalibration";
import { SubmissionIntegrity } from "../entities/SubmissionIntegrity";
import { pickDailyChallenge } from "../services/learning/dailyChallenge";
import { TaskTheory } from "../entities/TaskTheory";
import { TestData } from "../entities/TestData";
import { TopicNew } from "../entities/TopicNew";
import { TopicTask } from "../entities/TopicTask";
import { executeCodeWithInput, compareOutput, filterStderrWithLang } from "../services/codeExecutionService";
import { judgeWithSemaphore } from "../services/judgeWorker";
import { buildJudgeTests, loadTestContentByIds } from "../services/judgeWorker/testCache";
import { JudgeBusyError } from "../services/judgeWorker/Semaphore";
import type { CheckerSpec, JudgeLanguage, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { In, Not } from "typeorm";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { chooseDefaultCheckerFromExpectedOutputs } from "../utils/checkerSpec";
import { decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, normalizeSafeCodeFilePath, pickEntryContent } from "../utils/multiFileSubmission";
import { looksLikeTranslationProviderErrorText, translateMarkdownUkToEn, translateTextUkToEn } from "../services/translation/translateUkToEn";
import { hasLibraryTaskEnTranslationColumns } from "../services/translation/translationSchema";
import { env } from "../env";
import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  type WebTaskValidationProfile,
  type WebTaskValidationRule,
  validateWebTaskSubmission,
} from "../services/webTaskValidationService";
import { normalizeWebTaskTemplate } from "../utils/webTaskPayload";
import { normalizeWebTaskInput } from "../utils/normalizeWebTaskInput";

const libraryRouter = Router();

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

function normalizeWebRules(raw: unknown): WebTaskValidationRule[] {
  return normalizeWebValidationRules(raw);
}

function normalizeWebProfile(raw: unknown): WebTaskValidationProfile {
  return normalizeWebValidationProfile(raw ?? "FREE_WEB");
}

function assertLibraryWebFilesWithinLimits(files: ReturnType<typeof normalizeWebTaskFiles>) {
  const maxFileSize = Number((env as any).__webTaskMaxFileSize ?? 200_000);
  const maxTotalSize = Number((env as any).__webTaskMaxTotalSize ?? 500_000);
  let total = 0;
  for (const f of files) {
    const size = Buffer.byteLength(String(f.content ?? ""), "utf8");
    if (size > maxFileSize) {
      throw new HttpError(400, "WEB_FILE_TOO_LARGE", { code: "WEB_FILE_TOO_LARGE", expose: true });
    }
    total += size;
  }
  if (total > maxTotalSize) {
    throw new HttpError(400, "WEB_PAYLOAD_TOO_LARGE", { code: "WEB_PAYLOAD_TOO_LARGE", expose: true });
  }
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
    case "kotlin":
      return "Main.kt";
    case "csharp":
      return "Program.cs";
    case "js":
      return "main.js";
    case "go":
      return "main.go";
    case "rust":
      return "main.rs";
    case "pascal":
      return "main.pas";
    case "d":
      return "main.d";
    case "dart":
      return "main.dart";
    case "haskell":
      return "main.hs";
    case "lisp":
      return "main.lisp";
    case "lua":
      return "main.lua";
    case "perl":
      return "main.pl";
    case "php":
      return "main.php";
    case "ruby":
      return "main.rb";
    case "swift":
      return "main.swift";
  }
}

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  const n = parseInt(String(raw ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const LIBRARY_ARCHIVE_UPLOAD_MAX_MB = parsePositiveInt(process.env.LIBRARY_ARCHIVE_UPLOAD_MAX_MB, 120);
const LIBRARY_ARCHIVE_UPLOAD_MAX_FILES = parsePositiveInt(process.env.LIBRARY_ARCHIVE_UPLOAD_MAX_FILES, 100);
const LIBRARY_ARCHIVE_UPLOAD_MAX_BYTES = LIBRARY_ARCHIVE_UPLOAD_MAX_MB * 1024 * 1024;

const archiveUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIBRARY_ARCHIVE_UPLOAD_MAX_BYTES,
    files: LIBRARY_ARCHIVE_UPLOAD_MAX_FILES,
  },
});

const archiveUploadAny = archiveUpload.any();
const archiveUploadMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  archiveUploadAny(req as any, res as any, (error: any) => {
    if (!error) return next();

    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          message: "ARCHIVE_TOO_LARGE",
          maxFileSizeMb: LIBRARY_ARCHIVE_UPLOAD_MAX_MB,
        });
      }
      if (error.code === "LIMIT_FILE_COUNT") {
        return res.status(400).json({
          message: "TOO_MANY_ARCHIVE_FILES",
          maxFiles: LIBRARY_ARCHIVE_UPLOAD_MAX_FILES,
        });
      }
      return res.status(400).json({
        message: "INVALID_ARCHIVE_UPLOAD",
        code: error.code,
      });
    }

    return next(error);
  });
};

const userRepo = () => AppDataSource.getRepository(User);
const libraryRepo = () => AppDataSource.getRepository(LibraryTask);
const attemptRepo = () => AppDataSource.getRepository(LibraryTaskAttempt);
const theoryRepo = () => AppDataSource.getRepository(TaskTheory);
const testDataRepo = () => AppDataSource.getRepository(TestData);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);

type LibraryTaskQuality = {
  attempts: number;
  solvedRate: number;
  avgScoreRatio: number;
  score: number;
};

function isProblemCodeDuplicateError(error: any): boolean {
  const msg = String(error?.message ?? "");
  return error?.code === "ER_DUP_ENTRY" && (msg.includes("uq_library_tasks_problem_code") || msg.includes("problem_code"));
}

async function allocateUniqueProblemCode(base: string, excludeTaskId?: number): Promise<string> {
  const rawBase = String(base ?? "").trim();
  const baseCode = (rawBase || "LIB").slice(0, 64);
  let candidate = baseCode;
  let i = 1;
  while (i <= 2000) {
    const where = excludeTaskId
      ? ({ problemCode: candidate, id: Not(excludeTaskId) } as any)
      : ({ problemCode: candidate } as any);
    const existing = await libraryRepo().findOne({ where });
    if (!existing) return candidate;
    const suffix = `_${i}`;
    candidate = `${baseCode.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
    i += 1;
  }
  // Fallback (extremely unlikely)
  return `${baseCode.slice(0, 56)}_${Date.now().toString().slice(-7)}`;
}

const JUDGE_LANGUAGES: readonly JudgeLanguage[] = [
  "java", "python", "cpp", "c", "csharp", "kotlin",
  "js", "go", "rust", "pascal",
  "d", "dart", "haskell", "lisp", "lua", "perl", "php", "ruby", "swift"
];

// Every task accepts every supported language — no per-task language restriction.
const ALL_JUDGE_LANGS: JudgeLanguage[] = [...JUDGE_LANGUAGES];

// Optional compiler/version id (e.g. "pypy3", "java21", "cpp23"). The judge validates that
// it belongs to the language family; here we only sanity-check the shape.
function normCompilerId(raw: unknown): string | undefined {
  const s = String(raw ?? "").trim();
  return /^[a-z0-9_+-]{1,32}$/i.test(s) ? s : undefined;
}

function parseDisabledJudgeLanguagesEnv(): Set<JudgeLanguage> {
  const raw = String(process.env.JUDGE_DISABLED_LANGUAGES ?? process.env.DISABLED_JUDGE_LANGUAGES ?? "").trim();
  if (!raw) return new Set();
  const parts = raw
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const disabled = new Set<JudgeLanguage>();
  for (const p of parts) {
    const lang = normalizeJudgeLanguage(p);
    if (lang) disabled.add(lang);
  }
  return disabled;
}

const DISABLED_JUDGE_LANGS = parseDisabledJudgeLanguagesEnv();

function filterEnabledJudgeLanguages(langs: JudgeLanguage[]): JudgeLanguage[] {
  if (DISABLED_JUDGE_LANGS.size === 0) return langs;
  return langs.filter(l => !DISABLED_JUDGE_LANGS.has(l));
}

const DEFAULT_LIMITS_BY_LANG: Record<JudgeLanguage, { time_limit_ms: number; memory_limit_mb: number; output_limit_kb: number }> = {
  java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
  python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
  cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  c: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  // dotnet CLI is memory-hungry under nsjail/chroot. Keep a higher default.
  csharp: { time_limit_ms: 2000, memory_limit_mb: 1024, output_limit_kb: 64 },
  kotlin: { time_limit_ms: 1400, memory_limit_mb: 384, output_limit_kb: 64 },
  js: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  go: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  rust: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  pascal: { time_limit_ms: 1000, memory_limit_mb: 256, output_limit_kb: 64 },
  d: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  dart: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  haskell: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
  lisp: { time_limit_ms: 2000, memory_limit_mb: 384, output_limit_kb: 64 },
  lua: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  perl: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  php: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  ruby: { time_limit_ms: 2000, memory_limit_mb: 256, output_limit_kb: 64 },
  swift: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 },
};

function normalizeLang(input: any): LibraryTaskLang {
  const raw = String(input ?? "").toUpperCase().trim();
  if (raw === "CPP" || raw === "C++" || raw.startsWith("C++")) return "CPP";
  return raw.startsWith("PY") ? "PYTHON" : "JAVA";
}

function defaultJudgeLanguageFromTask(task: LibraryTask): JudgeLanguage {
  const allowed = getAllowedJudgeLanguages(task);
  return (allowed[0] || "java") as JudgeLanguage;
}

function normalizeJudgeLanguage(input: any): JudgeLanguage | null {
  const raw = String(input ?? "").trim().toLowerCase();
  return (JUDGE_LANGUAGES as readonly string[]).includes(raw) ? (raw as JudgeLanguage) : null;
}

function getAllowedJudgeLanguages(_task: LibraryTask): JudgeLanguage[] {
  // No per-task restriction: every task accepts every globally-enabled language.
  // (A task's stored `allowedLanguages` is intentionally ignored here.)
  const filteredAll = filterEnabledJudgeLanguages(ALL_JUDGE_LANGS);
  return filteredAll.length > 0 ? filteredAll : ["java"];
}

function ensureJudgeConfigDefaults(task: LibraryTask, tests: TestData[]): boolean {
  let dirty = false;

  // Limits: choose a safe default considering all allowed languages.
  const allowed = getAllowedJudgeLanguages(task);
  const maxTime = Math.max(...allowed.map(l => DEFAULT_LIMITS_BY_LANG[l].time_limit_ms));
  const maxMem = Math.max(...allowed.map(l => DEFAULT_LIMITS_BY_LANG[l].memory_limit_mb));
  const maxOut = Math.max(...allowed.map(l => DEFAULT_LIMITS_BY_LANG[l].output_limit_kb));

  const time = Number((task as any).timeLimitMs);
  if (!Number.isFinite(time) || time <= 0) {
    (task as any).timeLimitMs = maxTime;
    dirty = true;
  }
  const mem = Number((task as any).memoryLimitMb);
  if (!Number.isFinite(mem) || mem <= 0) {
    (task as any).memoryLimitMb = maxMem;
    dirty = true;
  }
  const out = Number((task as any).outputLimitKb);
  if (!Number.isFinite(out) || out <= 0) {
    (task as any).outputLimitKb = maxOut;
    dirty = true;
  }

  const checker = (task as any).checkerSpec as CheckerSpec | null | undefined;
  if (!checker || typeof checker !== "object" || typeof (checker as any).type !== "string") {
    (task as any).checkerSpec = chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || ""));
    dirty = true;
  }

  return dirty;
}

function canReadTask(task: LibraryTask, userId: number | null, userRole: string | null): boolean {
  if (task.status === "APPROVED") return true;
  if (userRole === "SYSTEM_ADMIN") return true;
  if (userId && (task as any)?.author?.id === userId) return true;
  return false;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeScoreTo100(rawScore: number, rawMaxScore: number): number {
  const max = Number(rawMaxScore ?? 0);
  const score = Number(rawScore ?? 0);
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round((score / max) * 100)));
}

async function computeTaskQualityMap(taskIds: number[]): Promise<Map<number, LibraryTaskQuality>> {
  const ids = (taskIds || []).filter((x) => Number.isFinite(x) && x > 0);
  const out = new Map<number, LibraryTaskQuality>();
  if (!ids.length) return out;

  const rows = await attemptRepo()
    .createQueryBuilder("a")
    .select("a.library_task_id", "taskId")
    .addSelect("COUNT(a.id)", "attempts")
    .addSelect(
      "SUM(CASE WHEN a.last_tests_total IS NOT NULL AND a.last_tests_total > 0 AND a.last_tests_passed IS NOT NULL AND a.last_tests_passed >= a.last_tests_total THEN 1 ELSE 0 END)",
      "solved"
    )
    .addSelect(
      "AVG(CASE WHEN a.last_max_score IS NOT NULL AND a.last_max_score > 0 AND a.last_score IS NOT NULL THEN (a.last_score / a.last_max_score) ELSE NULL END)",
      "avgScoreRatio"
    )
    .where("a.library_task_id IN (:...ids)", { ids })
    .andWhere("a.last_tests_total IS NOT NULL")
    .andWhere("a.last_tests_total > 0")
    .groupBy("a.library_task_id")
    .getRawMany<Array<{ taskId: string | number; attempts: string | number; solved: string | number; avgScoreRatio: string | number | null }>>();

  for (const row of rows as any) {
    const taskId = Number((row as any).taskId ?? 0);
    const attempts = Number((row as any).attempts ?? 0) || 0;
    const solved = Number((row as any).solved ?? 0) || 0;
    const avgScoreRatio = clamp01(Number((row as any).avgScoreRatio ?? 0) || 0);
    if (!Number.isFinite(taskId) || taskId <= 0 || attempts <= 0) continue;
    const solvedRate = clamp01(solved / attempts);
    const qualityScore = Math.round((0.7 * solvedRate + 0.3 * avgScoreRatio) * 100);
    out.set(taskId, {
      attempts,
      solvedRate,
      avgScoreRatio,
      score: qualityScore,
    });
  }

  return out;
}

function buildTaskDto(task: LibraryTask, quality: LibraryTaskQuality | null = null) {
  const taskMode = String((task as any).taskMode ?? "CODE") === "WEB" ? "WEB" : "CODE";
  const normalizedWeb = taskMode === "WEB" ? normalizeWebTaskTemplate((task as any).template) : null;
  return {
    id: task.id,
    problemCode: (task as any).problemCode ?? null,
    slug: (task as any).slug ?? null,
    title: task.title,
    description: task.description,
    template: task.template,
    taskMode,
    webTemplateFiles: taskMode === "WEB" ? normalizeWebTaskFiles((task as any).webTemplateFiles ?? normalizedWeb?.files ?? []) : null,
    webValidationRules: taskMode === "WEB" ? normalizeWebRules((task as any).webValidationRules ?? normalizedWeb?.rules ?? []) : null,
    webValidationProfile: taskMode === "WEB" ? normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB") : null,
    templatesByLanguage: (task as any).templatesByLanguage ?? null,
    lang: task.lang,
    difficulty: (task as any).difficulty ?? null,
    tags: (task as any).tags ?? null,
    section: (task as any).section ?? null,
    maxAttempts: task.maxAttempts,
    timeLimitMs: (task as any).timeLimitMs ?? null,
    memoryLimitMb: (task as any).memoryLimitMb ?? null,
    outputLimitKb: (task as any).outputLimitKb ?? null,
    checkerSpec: (task as any).checkerSpec ?? null,
    // Always return a resolved list (and apply global disables), so the UI stays consistent.
    allowedLanguages: getAllowedJudgeLanguages(task),
    status: task.status,
    rejectionReason: task.rejectionReason ?? null,
    submittedAt: task.submittedAt ?? null,
    publishedAt: task.publishedAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    quality,
    author: (task as any)?.author
      ? {
          id: (task as any).author.id,
          username: (task as any).author.username,
        }
      : null,
  };
}

const LIBRARY_TASK_EN_TRANSLATION_VERSION = 1;

function computeLibraryTaskEnSourceHash(task: Pick<LibraryTask, "title" | "description">): string {
  // Include the translation version in the hash so we can invalidate cached translations
  // after changing our Markdown-masking/translation behavior.
  const src = `v${LIBRARY_TASK_EN_TRANSLATION_VERSION}\nTITLE\n${task.title}\nDESC\n${task.description}`;
  return createHash("sha256").update(src, "utf8").digest("hex");
}

function isLibraryTaskEnFresh(taskWithEn: LibraryTask, expectedSourceHash: string): boolean {
  const titleEn = String((taskWithEn as any).titleEn ?? "");
  const descEn = String((taskWithEn as any).descriptionEn ?? "");
  const okTitle = titleEn.trim().length > 0 && !looksLikeTranslationProviderErrorText(titleEn);
  const okDesc = descEn.trim().length > 0 && !looksLikeTranslationProviderErrorText(descEn);
  const okHash = String((taskWithEn as any).translationSourceHashEn ?? "").trim() === expectedSourceHash;
  const okVer = Number((taskWithEn as any).translationVersionEn ?? 0) === LIBRARY_TASK_EN_TRANSLATION_VERSION;
  return okTitle && okDesc && okHash && okVer;
}

async function localizeLibraryTasksToEn(
  tasks: LibraryTask[],
  req: AuthRequest
): Promise<Map<number, { title: string; description: string }>> {
  const out = new Map<number, { title: string; description: string }>();
  const ids = Array.from(new Set(tasks.map(t => t.id).filter((x): x is number => typeof x === "number")));
  if (ids.length === 0) return out;

  const hasCols = await hasLibraryTaskEnTranslationColumns();
  if (!hasCols) {
    logger.warn("[library] EN translation requested but DB columns are missing; serving uk content", {
      requestId: req.requestId,
      userId: (req as any).userId ?? null
    });
    return out;
  }

  // Translation columns are marked select:false, so we explicitly select them.
  const rows = await libraryRepo()
    .createQueryBuilder("t")
    .where("t.id IN (:...ids)", { ids })
    .addSelect([
      "t.titleEn",
      "t.descriptionEn",
      "t.translationSourceHashEn",
      "t.translationVersionEn",
      "t.translatedAtEn",
    ])
    .getMany();

  const byId = new Map<number, LibraryTask>();
  for (const r of rows) byId.set(r.id, r);

  // Translate missing/stale ones sequentially to be gentle to free API.
  for (const id of ids) {
    const t = byId.get(id);
    if (!t) continue;

    const sourceHash = computeLibraryTaskEnSourceHash(t);
    if (isLibraryTaskEnFresh(t, sourceHash)) {
      out.set(id, {
        title: (t as any).titleEn as string,
        description: (t as any).descriptionEn as string,
      });
      continue;
    }

    try {
      const [titleEn, descriptionEn] = await Promise.all([
        translateTextUkToEn(t.title),
        translateMarkdownUkToEn(t.description)
      ]);

      await AppDataSource.query(
        `UPDATE \`library_tasks\`
           SET \`title_en\` = ?,
               \`description_en\` = ?,
               \`translation_source_hash_en\` = ?,
               \`translation_version_en\` = ?,
               \`translated_at_en\` = ?,
               \`updated_at\` = \`updated_at\`
         WHERE \`id\` = ?`,
        [titleEn, descriptionEn, sourceHash, LIBRARY_TASK_EN_TRANSLATION_VERSION, new Date(), id]
      );

      (t as any).titleEn = titleEn;
      (t as any).descriptionEn = descriptionEn;
      (t as any).translationSourceHashEn = sourceHash;
      (t as any).translationVersionEn = LIBRARY_TASK_EN_TRANSLATION_VERSION;
      (t as any).translatedAtEn = new Date();
      out.set(id, { title: titleEn, description: descriptionEn });
    } catch (error: any) {
      logger.warn("[library] translate uk->en failed", {
        requestId: req.requestId,
        userId: (req as any).userId ?? null,
        libraryTaskId: id,
        error: error?.message ?? String(error)
      });
      // Best-effort: fall back to Ukrainian content.
    }
  }

  return out;
}

function buildAttemptSummary(attempt: LibraryTaskAttempt | null) {
  if (!attempt) return null;
  const passed = attempt.lastTestsPassed;
  const total = attempt.lastTestsTotal;
  const solved = typeof passed === "number" && typeof total === "number" && total > 0 && passed >= total;
  return {
    solved,
    lastTestsPassed: passed ?? null,
    lastTestsTotal: total ?? null,
    lastScore: attempt.lastScore ?? null,
    lastMaxScore: attempt.lastMaxScore ?? null,
    submissionsCount: attempt.submissionsCount ?? 0,
    lastCheckedAt: attempt.lastCheckedAt ?? null,
  };
}

function truncateText(s: string, max: number): string {
  const v = String(s ?? "");
  if (v.length <= max) return v;
  return v.slice(0, max) + `\n…(truncated, ${v.length - max} more chars)`;
}

const JUDGE_LANGS = ["java", "python", "cpp", "c", "csharp", "kotlin"] as const;
type JudgeLangId = typeof JUDGE_LANGS[number];
const JUDGE_LANG_SET = new Set<string>(JUDGE_LANGS as readonly string[]);

function normalizeTemplatesByLanguage(params: {
  baseTemplate: string;
  allowedLanguages?: JudgeLangId[] | null;
  raw?: unknown;
}): Record<string, string> | null {
  const base = String(params.baseTemplate ?? "");
  const allowed = Array.isArray(params.allowedLanguages) ? params.allowedLanguages : null;
  const obj = params.raw && typeof params.raw === "object" && !Array.isArray(params.raw) ? (params.raw as Record<string, unknown>) : null;

  // If allowed languages are specified, ensure each has a template.
  if (allowed && allowed.length > 0) {
    const out: Record<string, string> = {};
    for (const l of allowed) {
      const v = typeof obj?.[l] === "string" ? String(obj?.[l] ?? "") : "";
      out[l] = (v.trim() ? v : base);
    }
    return out;
  }

  // Otherwise keep only known language keys, if any were provided.
  if (!obj) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!JUDGE_LANG_SET.has(k)) continue;
    if (typeof v !== "string") continue;
    const s = String(v ?? "");
    if (!s.trim()) continue;
    out[k] = s;
  }
  return Object.keys(out).length ? out : null;
}

const createLibraryTaskSchema = z.object({
  title: z.string().min(1).max(255),
  problemCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .optional(),
  slug: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/)
    .optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  tags: z.array(z.string().min(1).max(32)).max(20).optional(),
  section: z.string().min(1).max(80).optional(),
  taskMode: z.enum(["CODE", "WEB"]).optional(),
  webTemplateFiles: z
    .array(
      z.object({
        path: z.enum(["index.html", "styles.css", "script.js"]),
        content: z.string().max(200_000),
      })
    )
    .max(3)
    .optional(),
  webValidationRules: z
    .array(
      z.object({
        id: z.string().optional(),
        type: z.enum([
          "required_selector",
          "forbidden_selector",
          "required_text",
          "forbidden_text",
          "required_script_pattern",
          "forbidden_script_pattern",
          "required_attribute",
          "forbidden_attribute",
          "required_style",
          "forbidden_style",
        ]),
        message: z.string().max(1000).optional(),
        points: z.number().int().min(0).max(1000).optional(),
        selector: z.string().max(500).optional(),
        attribute: z.string().max(200).optional(),
        value: z.string().max(1000).optional(),
        valuePattern: z.string().max(2000).optional(),
        property: z.string().max(200).optional(),
        text: z.string().max(2000).optional(),
        pattern: z.string().max(2000).optional(),
        flags: z.string().max(10).optional(),
      })
    )
    .max(200)
    .optional(),
  webValidationProfile: z
    .object({
      id: z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"]).optional(),
      allowHtml: z.boolean().optional(),
      allowCss: z.boolean().optional(),
      allowJs: z.boolean().optional(),
      allowInlineStyle: z.boolean().optional(),
      allowInlineScript: z.boolean().optional(),
      allowExternalResources: z.boolean().optional(),
      lockHtml: z.boolean().optional(),
      lockCss: z.boolean().optional(),
      lockJs: z.boolean().optional(),
    })
    .or(z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"]))
    .optional(),
  description: z.string().min(1),
  template: z.string().min(1),
  templatesByLanguage: z.preprocess(
    (v) => (v == null ? undefined : v),
    z.record(z.string(), z.string().max(200_000))
  ).optional(),
  lang: z.enum(["JAVA", "PYTHON", "CPP"]).optional(),
  maxAttempts: z.number().int().min(1).max(100).optional(),
  timeLimitMs: z.number().int().min(100).max(60000).optional(),
  memoryLimitMb: z.number().int().min(16).max(2048).optional(),
  outputLimitKb: z.number().int().min(4).max(1024).optional(),
  checkerSpec: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("exact") }),
      z.object({ type: z.literal("whitespace") }),
      z.object({ type: z.literal("float"), epsilon: z.number().positive().max(1) }),
    ])
    .optional(),
  allowedLanguages: z
    .array(z.enum(["java", "python", "cpp", "c", "csharp", "kotlin"]))
    .min(1)
    .max(6)
    .optional(),
  theory: z.string().optional(),
  tests: z
    .array(
      z.object({
        input: z.string(),
        expectedOutput: z.string(),
        isHidden: z.boolean().optional(),
        points: z.number().int().min(1).max(1000).optional(),
        // Subtask id used for binary (0/full) subtask scoring in contests.
        // Stored on each test row; total 100 points is expected to be distributed across subtasks via `points`.
        subtask: z.number().int().min(1).max(100000).optional(),
      })
    )
    .optional(),
});

const updateLibraryTaskSchema = createLibraryTaskSchema.partial();

libraryRouter.get("/tasks", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const lang = req.query.lang ? normalizeLang(req.query.lang) : null;
    const judgeLanguage = req.query.judgeLanguage ? normalizeJudgeLanguage(req.query.judgeLanguage) : null;
    const q = String(req.query.q ?? "").trim();
    const uiLang = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
    const wantsEn = uiLang.startsWith("en");

    const pageRaw = parseInt(String(req.query.page ?? "1"), 10);
    const pageSizeRaw = parseInt(String(req.query.pageSize ?? "20"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(100, pageSizeRaw) : 20;

    const qb = libraryRepo().createQueryBuilder("t")
      .leftJoinAndSelect("t.author", "author")
      .where("t.status = :st", { st: "APPROVED" as LibraryTaskStatus });

    if (lang) qb.andWhere("t.lang = :lang", { lang });
    if (judgeLanguage) {
      // allowed_languages is stored as simple-json (TEXT). When NULL => allow all languages.
      // Filter matches exact JSON string values: ["java", ...]
      qb.andWhere("(t.allowed_languages IS NULL OR t.allowed_languages LIKE :jl)", { jl: `%\"${judgeLanguage}\"%` });
    }
    if (q) {
      qb.andWhere("(t.title LIKE :q OR t.description LIKE :q)", { q: `%${q}%` });
    }
    qb.orderBy("t.updatedAt", "DESC");

    const [tasks, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    const enById = wantsEn ? await localizeLibraryTasksToEn(tasks, req) : new Map<number, { title: string; description: string }>();

    const ids = tasks.map(t => t.id);
    const attempts = ids.length && req.userId
      ? await attemptRepo().find({
          where: {
            user: { id: req.userId },
            libraryTask: { id: In(ids) }
          } as any,
          relations: ["libraryTask"]
        })
      : [];
    const attemptByTaskId = new Map<number, LibraryTaskAttempt>();
    for (const a of attempts) {
      const tid = (a as any)?.libraryTask?.id;
      if (typeof tid === "number") attemptByTaskId.set(tid, a);
    }

    const qualityByTaskId = await computeTaskQualityMap(ids);

    return res.json({
      tasks: tasks.map(t => {
        const dto: any = buildTaskDto(t, qualityByTaskId.get(t.id) ?? null);
        const en = enById.get(t.id);
        if (en) {
          dto.title = en.title;
          dto.description = en.description;
        }
        dto.attempt = buildAttemptSummary(attemptByTaskId.get(t.id) ?? null);
        return dto;
      }),
      total,
      page,
      pageSize,
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Stable fetch by problemCode or slug.
libraryRouter.get("/tasks/by/:key", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const key = String(req.params.key ?? "").trim();
    if (!key) return res.status(400).json({ message: "INVALID_KEY" });
    const uiLang = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
    const wantsEn = uiLang.startsWith("en");

    const task = await libraryRepo().findOne({
      where: [{ problemCode: key } as any, { slug: key } as any],
      relations: ["author", "theory"],
    });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const tests = await testDataRepo().find({
      where: { libraryTask: { id: task.id } } as any,
      order: { id: "ASC" },
    });

    const isPrivileged = req.userRole === "SYSTEM_ADMIN" || (req.userId && task.author?.id === req.userId);
    const visibleTests = isPrivileged
      ? tests
      : tests.filter(t => {
          const kind = (t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE");
          return kind === "SAMPLE";
        });

    const enById = wantsEn ? await localizeLibraryTasksToEn([task], req) : new Map<number, { title: string; description: string }>();
    const qualityByTaskId = await computeTaskQualityMap([task.id]);
    const dto: any = buildTaskDto(task, qualityByTaskId.get(task.id) ?? null);
    const en = enById.get(task.id);
    if (en) {
      dto.title = en.title;
      dto.description = en.description;
    }

    return res.json({
      task: dto,
      theory: task.theory?.content ?? null,
      tests: visibleTests.map(t => ({
        id: t.id,
        input: t.input,
        expectedOutput: t.expectedOutput,
        isHidden: !!t.isHidden,
        kind: ((t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE")) as any,
        points: t.points,
      })),
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks/by/:key error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.get("/tasks/mine", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ message: "UNAUTHORIZED" });
    const uiLang = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
    const wantsEn = uiLang.startsWith("en");

    const tasks = await libraryRepo().find({
      where: { author: { id: user.id }, isHiddenFromLibrary: false } as any,
      relations: ["author"],
      order: { updatedAt: "DESC" },
      take: 200,
    });

    const ids = tasks.map(t => t.id);
    const attempts = ids.length
      ? await attemptRepo().find({
          where: {
            user: { id: user.id },
            libraryTask: { id: In(ids) }
          } as any,
          relations: ["libraryTask"]
        })
      : [];
    const attemptByTaskId = new Map<number, LibraryTaskAttempt>();
    for (const a of attempts) {
      const tid = (a as any)?.libraryTask?.id;
      if (typeof tid === "number") attemptByTaskId.set(tid, a);
    }

    const qualityByTaskId = await computeTaskQualityMap(ids);

    const enById = wantsEn ? await localizeLibraryTasksToEn(tasks, req) : new Map<number, { title: string; description: string }>();

    return res.json({
      tasks: tasks.map(t => {
        const dto: any = buildTaskDto(t, qualityByTaskId.get(t.id) ?? null);
        const en = enById.get(t.id);
        if (en) {
          dto.title = en.title;
          dto.description = en.description;
        }
        dto.attempt = buildAttemptSummary(attemptByTaskId.get(t.id) ?? null);
        return dto;
      })
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks/mine error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.get("/tasks/:id", authOptional, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    const uiLang = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
    const wantsEn = uiLang.startsWith("en");

    const task = await libraryRepo().findOne({
      where: { id } as any,
      relations: ["author", "theory"],
    });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const tests = await testDataRepo().find({
      where: { libraryTask: { id: task.id } } as any,
      order: { id: "ASC" },
    });

    const isPrivileged = req.userRole === "SYSTEM_ADMIN" || (req.userId && task.author?.id === req.userId);
    const visibleTests = isPrivileged
      ? tests
      : tests.filter(t => {
          const kind = (t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE");
          return kind === "SAMPLE";
        });

    const enById = wantsEn ? await localizeLibraryTasksToEn([task], req) : new Map<number, { title: string; description: string }>();
    const qualityByTaskId = await computeTaskQualityMap([task.id]);
    const dto: any = buildTaskDto(task, qualityByTaskId.get(task.id) ?? null);
    const en = enById.get(task.id);
    if (en) {
      dto.title = en.title;
      dto.description = en.description;
    }

    return res.json({
      task: dto,
      theory: task.theory?.content ?? null,
      tests: visibleTests.map(t => ({
        id: t.id,
        input: t.input,
        expectedOutput: t.expectedOutput,
        isHidden: !!t.isHidden,
        kind: ((t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE")) as any,
        points: t.points,
      })),
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks/:id error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.get("/tasks/:id/attempt", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    // EDU students currently do not have a User record, so we cannot persist attempts in DB
    // without a separate student-specific attempt table. For now, the frontend stores drafts locally.
    if (!req.userId) {
      return res.json({ attempt: null });
    }

    const attempt = await attemptRepo().findOne({
      where: {
        user: { id: req.userId },
        libraryTask: { id: task.id }
      } as any
    });

    const requestedLang = normalizeJudgeLanguage(req.query.language);
    const lang = requestedLang ?? defaultJudgeLanguageFromTask(task);
    const draftByLang = attempt?.draftCodeByLanguage ?? null;
    const submittedByLang = attempt?.lastSubmittedCodeByLanguage ?? null;
    const selectedDraft = draftByLang && typeof draftByLang === "object" ? (draftByLang as any)[lang] : null;
    const selectedSubmitted = submittedByLang && typeof submittedByLang === "object" ? (submittedByLang as any)[lang] : null;

    const draftDecoded = decodeMultiFileSubmissionV1(selectedDraft ?? attempt?.draftCode ?? "");
    const submittedDecoded = decodeMultiFileSubmissionV1(selectedSubmitted ?? attempt?.lastSubmittedCode ?? null);

    const draftEntryContent = draftDecoded ? pickEntryContent(draftDecoded) : (selectedDraft ?? attempt?.draftCode ?? "");
    const submittedEntryContent = submittedDecoded ? pickEntryContent(submittedDecoded) : (selectedSubmitted ?? attempt?.lastSubmittedCode ?? null);

    return res.json({
      attempt: attempt
        ? {
            draftCode: draftEntryContent ?? "",
            draftFiles: draftDecoded?.files ?? undefined,
            draftEntryFile: draftDecoded?.entry ?? undefined,
            lastSubmittedCode: submittedEntryContent ?? null,
            lastSubmittedFiles: submittedDecoded?.files ?? undefined,
            lastSubmittedEntryFile: submittedDecoded?.entry ?? undefined,
            lastVerdict: attempt.lastVerdict ?? null,
            lastScore: attempt.lastScore ?? null,
            lastMaxScore: attempt.lastMaxScore ?? null,
            lastTestsPassed: attempt.lastTestsPassed ?? null,
            lastTestsTotal: attempt.lastTestsTotal ?? null,
            submissionsCount: attempt.submissionsCount ?? 0,
            lastCheckedAt: attempt.lastCheckedAt ?? null,
            updatedAt: attempt.updatedAt
          }
        : null
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks/:id/attempt error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.put("/tasks/:id/attempt", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const schema = z
      .object({
        draftCode: z.string().max(200_000).optional(),
        files: z
          .array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) }))
          .max(64)
          .optional(),
        language: z.string().optional(),
      })
      .refine(v => (typeof v.draftCode === "string" && v.draftCode.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
        message: "draftCode or files required",
      });
    const validated = schema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    // For EDU students we accept the request (so UI auto-save works), but do not persist in DB.
    if (!req.userId) {
      return res.json({ ok: true });
    }

    let attempt = await attemptRepo().findOne({
      where: {
        user: { id: req.userId },
        libraryTask: { id: task.id }
      } as any
    });

    const lang = normalizeJudgeLanguage(validated.data.language) ?? defaultJudgeLanguageFromTask(task);
    const allowedLangs = getAllowedJudgeLanguages(task);
    if (!allowedLangs.includes(lang)) {
      return res.status(400).json({ message: "LANGUAGE_NOT_ALLOWED", allowedLanguages: allowedLangs });
    }

    const normalizedFiles = normalizeApiFiles((validated.data as any).files);
    const entryFile = entryFileForJudgeLanguage(lang);
    const persistedDraft = normalizedFiles.length
      ? encodeMultiFileSubmissionV1({ entry: entryFile, files: normalizedFiles })
      : String((validated.data as any).draftCode ?? "");
    if (!attempt) {
      attempt = attemptRepo().create({
        user: { id: req.userId } as any,
        libraryTask: { id: task.id } as any,
        draftCode: persistedDraft
      });
    } else {
      attempt.draftCode = persistedDraft;
    }

    const nextMap: Record<string, string> = { ...(attempt.draftCodeByLanguage ?? {}) };
    nextMap[lang] = persistedDraft;
    attempt.draftCodeByLanguage = nextMap;

    await attemptRepo().save(attempt);
    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[library] PUT /tasks/:id/attempt error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.get("/tasks/:id/web-template", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const normalized = normalizeWebTaskTemplate((task as any).template);
    return res.json({
      taskId: task.id,
      taskMode: "WEB",
      files: normalizeWebTaskFiles((task as any).webTemplateFiles ?? normalized.files),
      rules: normalizeWebRules((task as any).webValidationRules ?? normalized.rules),
      profile: normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB"),
    });
  } catch (error: any) {
    logger.error("[library] GET /tasks/:id/web-template error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.put("/tasks/:id/web-draft", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertLibraryWebFilesWithinLimits(files);

    // For EDU students (no userId) accept request without DB persistence, matching existing behavior.
    if (!req.userId) {
      return res.json({ ok: true });
    }

    let attempt = await attemptRepo().findOne({
      where: {
        user: { id: req.userId },
        libraryTask: { id: task.id }
      } as any
    });

    const serialized = JSON.stringify({ mode: "WEB", version: 1, files });
    if (!attempt) {
      attempt = attemptRepo().create({
        user: { id: req.userId } as any,
        libraryTask: { id: task.id } as any,
        draftCode: serialized
      });
    } else {
      attempt.draftCode = serialized;
    }
    await attemptRepo().save(attempt);
    return res.json({ ok: true });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[library] PUT /tasks/:id/web-draft error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.post("/tasks/:id/web-check", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertLibraryWebFilesWithinLimits(files);
    const rules = normalizeWebRules((task as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (task as any).webTemplateFiles ?? [] });
    const rawMaxScore = check.maxScore > 0 ? check.maxScore : check.totalRules;
    const normalizedScore = normalizeScoreTo100(check.score, rawMaxScore);

    return res.json({
      taskMode: "WEB",
      verdict: check.passed ? "AC" : "WA",
      testsPassed: check.passedRules,
      testsTotal: check.totalRules,
      score: normalizedScore,
      maxScore: 100,
      publicTestResultsCompact: check.results.map((r, idx) => ({
        testId: idx + 1,
        passed: r.passed,
        verdict: r.passed ? "AC" : "WA",
        errorKind: r.passed ? null : "web_rule"
      })),
      publicTestResults: check.results.map((r, idx) => ({
        testId: idx + 1,
        passed: r.passed,
        verdict: r.passed ? "AC" : "WA",
        error: r.passed ? null : r.message,
        errorKind: r.passed ? null : "web_rule"
      }))
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[library] POST /tasks/:id/web-check error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.post("/tasks/:id/web-submit", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertLibraryWebFilesWithinLimits(files);
    const rules = normalizeWebRules((task as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (task as any).webTemplateFiles ?? [] });
    const rawMaxScore = check.maxScore > 0 ? check.maxScore : check.totalRules;
    const normalizedScore = normalizeScoreTo100(check.score, rawMaxScore);

    if (req.userId) {
      let attempt = await attemptRepo().findOne({ where: { user: { id: req.userId }, libraryTask: { id: task.id } } as any });
      const serialized = JSON.stringify({ mode: "WEB", version: 1, files });
      if (!attempt) {
        attempt = attemptRepo().create({
          user: { id: req.userId } as any,
          libraryTask: { id: task.id } as any,
          draftCode: serialized,
          lastSubmittedCode: serialized,
        });
      } else {
        attempt.draftCode = serialized;
        attempt.lastSubmittedCode = serialized;
      }
      attempt.lastVerdict = check.passed ? "AC" : "WA";
      attempt.lastScore = normalizedScore;
      attempt.lastMaxScore = 100;
      attempt.lastTestsPassed = check.passedRules;
      attempt.lastTestsTotal = check.totalRules;
      attempt.submissionsCount = (attempt.submissionsCount ?? 0) + 1;
      attempt.lastCheckedAt = new Date();
      await attemptRepo().save(attempt);
    }

    return res.json({
      taskMode: "WEB",
      verdict: check.passed ? "AC" : "WA",
      testsPassed: check.passedRules,
      testsTotal: check.totalRules,
      score: normalizedScore,
      maxScore: 100,
      publicTestResultsCompact: check.results.map((r, idx) => ({
        testId: idx + 1,
        passed: r.passed,
        verdict: r.passed ? "AC" : "WA",
        errorKind: r.passed ? null : "web_rule"
      }))
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[library] POST /tasks/:id/web-submit error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.post("/tasks/:id/run", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const schema = z
      .object({
        code: z.string().min(1).max(200_000).optional(),
        files: z
          .array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) }))
          .max(64)
          .optional(),
        input: z.string().optional(),
        language: z.string().optional(),
        compiler: z.string().max(32).optional(),
      })
      .refine(v => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
        message: "code or files required",
      });
    const validated = schema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const selectedLang = normalizeJudgeLanguage(validated.data.language) ?? defaultJudgeLanguageFromTask(task);
    const selectedCompiler = normCompilerId((validated.data as any).compiler);
    const allowedLangs = getAllowedJudgeLanguages(task);
    if (!allowedLangs.includes(selectedLang)) {
      return res.status(400).json({ message: "LANGUAGE_NOT_ALLOWED", allowedLanguages: allowedLangs });
    }

    const normalizedFiles = normalizeApiFiles((validated.data as any).files);
    const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
    const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
    const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(selectedLang);
    let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
    const isMultiFile = effectiveFiles.length > 0;
    if (isMultiFile && !effectiveFiles.some(f => f.path === entryFile)) {
      effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
    }
    const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : providedCode;
    const persistedDraft = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;

    // Persist as draft for convenience (does not affect grades).
    if (req.userId) {
      try {
        let attempt = await attemptRepo().findOne({ where: { user: { id: req.userId }, libraryTask: { id: task.id } } as any });
        if (!attempt) {
          attempt = attemptRepo().create({ user: { id: req.userId } as any, libraryTask: { id: task.id } as any, draftCode: persistedDraft });
        } else {
          attempt.draftCode = persistedDraft;
        }

        const nextMap: Record<string, string> = { ...(attempt.draftCodeByLanguage ?? {}) };
        nextMap[selectedLang] = persistedDraft;
        attempt.draftCodeByLanguage = nextMap;
        await attemptRepo().save(attempt);
      } catch {}
    }

    // For Java/Python we can run locally for single-file submissions; for multi-file always use judge worker.
    if (!isMultiFile && (selectedLang === "java" || selectedLang === "python")) {
      const localLang = selectedLang === "java" ? "JAVA" : "PYTHON";
      const r = await executeCodeWithInput(sourceText, localLang as any, validated.data.input ?? "", 10000, { compiler: selectedCompiler });
      return res.json({
        stdout: r.stdout,
        stderr: filterStderrWithLang(r.stderr, localLang as any),
        exitCode: r.exitCode,
        success: r.success
      });
    }

    const principalTag = req.userType === "STUDENT" ? `student_${req.studentId}` : `user_${req.userId}`;
    const workerReq: WorkerJudgeRequest = {
      submission_id: `library_run_${principalTag}_${task.id}_${Date.now()}`,
      language: selectedLang,
      ...(selectedCompiler ? { compiler: selectedCompiler } : {}),
      source: sourceText,
      ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
      tests: [
        {
          id: "custom",
          input: validated.data.input ?? "",
          output: "",
          hidden: false,
          group: "custom",
          weight: 1
        }
      ],
      limits: {
        time_limit_ms: Number.isFinite((task as any).timeLimitMs) && (task as any).timeLimitMs > 0 ? (task as any).timeLimitMs : 5000,
        memory_limit_mb:
          Number.isFinite((task as any).memoryLimitMb) && (task as any).memoryLimitMb > 0
            ? (task as any).memoryLimitMb
            : DEFAULT_LIMITS_BY_LANG[selectedLang].memory_limit_mb,
        output_limit_kb: Number.isFinite((task as any).outputLimitKb) && (task as any).outputLimitKb > 0 ? (task as any).outputLimitKb : 256,
      },
      checker: { type: "exact" },
      debug: true,
      run_all: true,
      rerun_failed_once: false,
    };

    let workerRes: WorkerJudgeResponse;
    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(503, "Judge unavailable", {
        code: "JUDGE_UNAVAILABLE",
        expose: true,
        cause: e
      });
    }

    if (workerRes.verdict === "CE" && workerRes.compile) {
      const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      const fallbackHint =
        "Compilation error. If the message is empty, the compiler/toolchain is likely missing in the sandbox rootfs (e.g. /usr/bin/gcc, /usr/bin/g++, /usr/bin/dotnet, /usr/bin/kotlinc).";
      return res.json({ stdout: "", stderr: truncateText(combined || fallbackHint, 40_000), exitCode: 1, success: false });
    }
    const t0 = workerRes.tests?.[0];
    const stdout = (t0 as any)?.actual ?? "";
    const stderr = (t0 as any)?.stderr ?? "";
    const success = workerRes.verdict === "AC" || workerRes.verdict === "WA";
    return res.json({ stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: success ? 0 : 1, success });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message, status: error.statusCode });
    }
    logger.error("[library] POST /tasks/:id/run error", { requestId: req.requestId, err: error });
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", status: 500 });
  }
});

libraryRouter.post("/tasks/:id/check", authRequired, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    const principalId = req.userId ?? req.studentId ?? null;
    if (!principalId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const schema = z
      .object({
        code: z.string().min(1).max(200_000).optional(),
        files: z
          .array(z.object({ path: z.string().min(1).max(180), content: z.string().max(200_000) }))
          .max(64)
          .optional(),
        language: z.string().optional(),
        compiler: z.string().max(32).optional(),
      })
      .refine(v => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
        message: "code or files required",
      });
    const validated = schema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    // Metadata-only load: deliberately exclude the big `input` column. Test input is read
    // lazily (only for cache misses) during materialisation, so a warm cache reads no input
    // blobs. `expected_output` is kept for checker auto-selection (typically small).
    const tests = await testDataRepo().find({
      where: { libraryTask: { id: task.id } } as any,
      order: { id: "ASC" },
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

    const isSample = (t: TestData): boolean => {
      const kind = (t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE");
      return kind === "SAMPLE";
    };
    const isJudge = (t: TestData): boolean => !isSample(t);
    const publicTestsTotal = tests.filter(isSample).length;

    const requested = normalizeJudgeLanguage(validated.data.language);
    const allowedLangs = getAllowedJudgeLanguages(task);
    const judgeLang: JudgeLanguage = (requested ?? defaultJudgeLanguageFromTask(task));
    const selectedCompiler = normCompilerId((validated.data as any).compiler);
    if (!allowedLangs.includes(judgeLang)) {
      return res.status(400).json({ message: "LANGUAGE_NOT_ALLOWED", allowedLanguages: allowedLangs });
    }
    const taskLimits = {
      time_limit_ms: Number.isFinite((task as any).timeLimitMs) && (task as any).timeLimitMs > 0 ? (task as any).timeLimitMs : undefined,
      memory_limit_mb: Number.isFinite((task as any).memoryLimitMb) && (task as any).memoryLimitMb > 0 ? (task as any).memoryLimitMb : undefined,
      output_limit_kb: Number.isFinite((task as any).outputLimitKb) && (task as any).outputLimitKb > 0 ? (task as any).outputLimitKb : undefined,
    };
    const effectiveLimits = {
      time_limit_ms: taskLimits.time_limit_ms ?? DEFAULT_LIMITS_BY_LANG[judgeLang].time_limit_ms,
      memory_limit_mb: taskLimits.memory_limit_mb ?? DEFAULT_LIMITS_BY_LANG[judgeLang].memory_limit_mb,
      output_limit_kb: taskLimits.output_limit_kb ?? DEFAULT_LIMITS_BY_LANG[judgeLang].output_limit_kb,
    };

    const explicitChecker = (task as any).checkerSpec as CheckerSpec | null | undefined;
    const effectiveChecker = explicitChecker ?? chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || ""));

    const maxScore = tests.reduce((sum, t) => sum + (t.points || 1), 0);

    const normalizedFiles = normalizeApiFiles((validated.data as any).files);
    const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
    const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
    const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
    let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
    const isMultiFile = effectiveFiles.length > 0;
    if (isMultiFile && !effectiveFiles.some(f => f.path === entryFile)) {
      effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
    }
    const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : providedCode;
    const persistedSubmitted = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;

    const principalTag = req.userType === "STUDENT" ? `student_${req.studentId}` : `user_${req.userId}`;
    const { tests: workerTests } = await buildJudgeTests(tests, {
      meta: t => ({
        hidden: t.isHidden === true,
        group: t.isHidden === true ? "hidden" : "public",
        weight: t.points || 1
      }),
      hashes: t => ({ inputHash: t.inputSha256, outputHash: t.outputSha256 }),
      loadContent: loadTestContentByIds
    });
    const workerReq: WorkerJudgeRequest = {
      submission_id: `library_${principalTag}_${task.id}_${Date.now()}`,
      language: judgeLang,
      ...(selectedCompiler ? { compiler: selectedCompiler } : {}),
      source: sourceText,
      ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
      tests: workerTests,
      limits: effectiveLimits,
      checker: effectiveChecker,
      debug: false,
      rerun_failed_once: true,
      run_all: true
    };

    let workerRes: WorkerJudgeResponse | null = null;
    let totalPassed = 0;
    let totalScore = 0;
    let hiddenPassed = 0;
    let compileError: string | null = null;
    let compileErrorKind: string | null = null;
    // Detailed results are intentionally capped to keep HTTP response small.
    const publicResultsLimit = Math.max(0, Math.min(200, parseInt(String(process.env.LIBRARY_CHECK_PUBLIC_RESULTS_LIMIT ?? "25"), 10) || 25));
    // Compact results contain only statuses (no large input/output) and can safely include many tests.
    const publicCompactLimit = Math.max(0, Math.min(20000, parseInt(String(process.env.LIBRARY_CHECK_PUBLIC_COMPACT_LIMIT ?? "5000"), 10) || 5000));
    const publicResults: Array<{ testId: number; input: string; actualOutput: string; passed: boolean; verdict?: string | null; error?: string | null; errorKind?: string | null }> = [];
    const publicResultsCompact: Array<{ testId: number; passed: boolean; verdict?: string | null; errorKind?: string | null }> = [];

    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("[judge] worker failed (library check)", {
        requestId: req.requestId,
        submission: workerReq.submission_id,
        error: errMsg,
        err: e
      });
      throw new HttpError(503, "Judge unavailable", {
        code: "JUDGE_UNAVAILABLE",
        expose: true,
        cause: e
      });
    }

    if (workerRes) {
      if (workerRes.verdict === "CE" && workerRes.compile) {
        // IMPORTANT: Do not duplicate huge compile stderr for every test.
        // Return compile error once and keep per-test list empty.
        compileErrorKind = workerRes.compile.error_kind ?? null;
        const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        const fallbackHint =
          "Compilation error. If the message is empty, the compiler/toolchain is likely missing in the sandbox rootfs (e.g. /usr/bin/gcc, /usr/bin/g++, /usr/bin/dotnet, /usr/bin/kotlinc).";
        compileError = truncateText(combined || fallbackHint, 40_000);
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const passed = r?.verdict === "AC";
          if (passed) {
            totalPassed++;
            totalScore += t.points || 1;
            if (isJudge(t)) hiddenPassed++;
          }
          if (isJudge(t)) continue;
          if (publicResultsCompact.length < publicCompactLimit) {
            publicResultsCompact.push({
              testId: t.id,
              passed,
              verdict: r?.verdict ?? null,
              errorKind: (r as any)?.error_kind ?? null
            });
          }

          if (publicResults.length < publicResultsLimit) {
            publicResults.push({
              testId: t.id,
              // OJ-style: do not expose judge test I/O.
              input: "",
              actualOutput: "",
              passed,
              verdict: r?.verdict ?? null,
              error: passed ? null : (r?.stderr ? truncateText(r.stderr, 20_000) : null),
              errorKind: (r as any)?.error_kind ?? null
            });
          }
        }
        if (typeof workerRes.score === "number") totalScore = workerRes.score;
      }
    }

    const scoringScore = typeof workerRes?.score === "number" ? workerRes.score : totalScore;
    const scoringMaxScore = typeof workerRes?.max_score === "number" ? workerRes.max_score : maxScore;
    const normalizedScore = normalizeScoreTo100(scoringScore, scoringMaxScore);

    // Upsert attempt (draft + last check summary).
    if (req.userId) {
      try {
        let attempt = await attemptRepo().findOne({ where: { user: { id: req.userId }, libraryTask: { id: task.id } } as any });
        if (!attempt) {
          attempt = attemptRepo().create({
            user: { id: req.userId } as any,
            libraryTask: { id: task.id } as any,
            draftCode: persistedSubmitted
          });
        } else {
          attempt.draftCode = persistedSubmitted;
        }
        attempt.lastSubmittedCode = persistedSubmitted;

        const nextDraftMap: Record<string, string> = { ...(attempt.draftCodeByLanguage ?? {}) };
        nextDraftMap[judgeLang] = persistedSubmitted;
        attempt.draftCodeByLanguage = nextDraftMap;

        const nextSubMap: Record<string, string> = { ...(attempt.lastSubmittedCodeByLanguage ?? {}) };
        nextSubMap[judgeLang] = persistedSubmitted;
        attempt.lastSubmittedCodeByLanguage = nextSubMap;

        attempt.lastVerdict = workerRes?.verdict ?? null;
        attempt.lastScore = normalizedScore;
        attempt.lastMaxScore = 100;
        attempt.lastTestsPassed = totalPassed;
        attempt.lastTestsTotal = tests.length;
        attempt.submissionsCount = (attempt.submissionsCount ?? 0) + 1;
        attempt.lastCheckedAt = new Date();
        await attemptRepo().save(attempt);
      } catch {}
    }

    return res.json({
      verdict: workerRes?.verdict ?? null,
      testsPassed: totalPassed,
      testsTotal: tests.length,
      score: normalizedScore,
      maxScore: 100,
      compileError,
      compileErrorKind,
      publicTestResultsTotal: publicTestsTotal,
      publicTestResultsTruncated: publicTestsTotal > publicResults.length,
      publicTestResultsDetailedLimit: publicResultsLimit,
      publicTestResultsCompact: publicResultsCompact,
      publicTestResultsCompactTruncated: publicTestsTotal > publicResultsCompact.length,
      publicTestResultsCompactLimit: publicCompactLimit,
      hidden: {
        passed: hiddenPassed,
        total: tests.filter(isJudge).length
      },
      publicTestResults: publicResults
    });
  } catch (error: any) {
    logger.error("[library] POST /tasks/:id/check error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.post("/tasks", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });
    const validated = createLibraryTaskSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ message: "UNAUTHORIZED" });

    const data = validated.data;
    const normalizedTaskInput = normalizeWebTaskInput(data);
    const taskMode = normalizedTaskInput.taskMode;
    const normalizedWebFiles = normalizedTaskInput.webTemplateFiles;
    const normalizedWebRules = normalizedTaskInput.webValidationRules;
    const normalizedWebProfile = normalizedTaskInput.webValidationProfile;

    if (taskMode === "WEB") {
      assertLibraryWebFilesWithinLimits(normalizedWebFiles ?? normalizeWebTaskFiles([]));
    }

    if (Array.isArray((data as any).allowedLanguages) && (data as any).allowedLanguages.some((l: any) => DISABLED_JUDGE_LANGS.has(l))) {
      return res.status(400).json({
        message: "LANGUAGE_DISABLED",
        disabledLanguages: Array.from(DISABLED_JUDGE_LANGS)
      });
    }
    const allowedLanguages = (Array.isArray((data as any).allowedLanguages) ? ((data as any).allowedLanguages as JudgeLangId[]) : null);
    const templatesByLanguage = normalizeTemplatesByLanguage({
      baseTemplate: normalizedTaskInput.template,
      allowedLanguages,
      raw: (data as any).templatesByLanguage,
    });

    const task = libraryRepo().create({
      author: { id: user.id } as any,
      title: data.title.trim(),
      problemCode: data.problemCode?.trim() ?? null,
      slug: data.slug?.trim() ?? null,
      difficulty: data.difficulty ?? null,
      tags: data.tags ?? null,
      section: data.section?.trim() ?? null,
      taskMode: taskMode as any,
      webTemplateFiles: normalizedWebFiles,
      webValidationRules: normalizedWebRules,
      webValidationProfile: normalizedWebProfile,
      description: data.description.trim(),
      template: normalizedTaskInput.template,
      templatesByLanguage,
      lang: normalizeLang(data.lang),
      maxAttempts: data.maxAttempts ?? 3,
      timeLimitMs: data.timeLimitMs ?? null,
      memoryLimitMb: data.memoryLimitMb ?? null,
      outputLimitKb: data.outputLimitKb ?? null,
      checkerSpec: (data.checkerSpec as any) ?? null,
      allowedLanguages: data.allowedLanguages ?? null,
      status: "DRAFT",
      rejectionReason: null,
      submittedAt: null,
      publishedAt: null,
    });

    await libraryRepo().save(task);

    // Auto-generate stable identifiers if not provided.
    let dirty = false;
    if (!(task as any).problemCode) {
      (task as any).problemCode = await allocateUniqueProblemCode(`LIB${task.id}`, task.id);
      dirty = true;
    }
    if (!(task as any).slug) {
      const base = String(task.title || "task").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "task";
      (task as any).slug = `${base}-${task.id}`;
      dirty = true;
    }
    if (dirty) {
      try {
        await libraryRepo().save(task);
      } catch (err: any) {
        if (isProblemCodeDuplicateError(err)) {
          (task as any).problemCode = await allocateUniqueProblemCode(String((task as any).problemCode || `LIB${task.id}`), task.id);
          await libraryRepo().save(task);
        } else {
          throw err;
        }
      }
    }

    if (data.theory && data.theory.trim()) {
      const th = theoryRepo().create({
        libraryTask: { id: task.id } as any,
        content: data.theory.trim(),
      });
      await theoryRepo().save(th);
    }

    if (Array.isArray(data.tests) && data.tests.length > 0) {
      const rows = data.tests.map(t =>
        testDataRepo().create({
          libraryTask: { id: task.id } as any,
          input: String(t.input ?? ""),
          expectedOutput: String(t.expectedOutput ?? ""),
          isHidden: !!t.isHidden,
          kind: (!!t.isHidden ? "JUDGE" : "SAMPLE") as any,
          source: "LIBRARY_IMPORTED",
          points: t.points ?? 1,
          subtask: typeof (t as any).subtask === "number" ? String((t as any).subtask) : null,
        })
      );
      await testDataRepo().save(rows);
    }

    const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author", "theory"] });

    return res.status(201).json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
  } catch (error: any) {
    logger.error("[library] POST /tasks error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.patch("/tasks/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });

    const validated = updateLibraryTaskSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author", "theory"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const isOwner = task.author?.id === req.userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    if (task.status === "APPROVED" || task.status === "PENDING") {
      return res.status(400).json({ message: "CANNOT_EDIT_IN_STATUS", status: task.status });
    }

    const data = validated.data;

    if ((data as any).allowedLanguages !== undefined && Array.isArray((data as any).allowedLanguages) && (data as any).allowedLanguages.some((l: any) => DISABLED_JUDGE_LANGS.has(l))) {
      return res.status(400).json({
        message: "LANGUAGE_DISABLED",
        disabledLanguages: Array.from(DISABLED_JUDGE_LANGS)
      });
    }

    if (typeof data.title === "string") task.title = data.title.trim();
    if (typeof (data as any).problemCode === "string") (task as any).problemCode = (data as any).problemCode.trim();
    if (typeof (data as any).slug === "string") (task as any).slug = (data as any).slug.trim();
    if ((data as any).difficulty !== undefined) (task as any).difficulty = (data as any).difficulty ?? null;
    if ((data as any).tags !== undefined) (task as any).tags = (data as any).tags ?? null;
    if ((data as any).section !== undefined) (task as any).section = String((data as any).section ?? "").trim() || null;
    if (typeof data.description === "string") task.description = data.description.trim();
    const effectiveTaskMode = String(((data as any).taskMode ?? (task as any).taskMode ?? "CODE")) === "WEB" ? "WEB" : "CODE";
    const normalizedTaskInput = normalizeWebTaskInput(
      {
        taskMode: (data as any).taskMode,
        template: data.template,
        webTemplateFiles: (data as any).webTemplateFiles,
        webValidationRules: (data as any).webValidationRules,
        webValidationProfile: (data as any).webValidationProfile,
      },
      {
        taskMode: (task as any).taskMode,
        template: task.template,
        webTemplateFiles: (task as any).webTemplateFiles,
        webValidationRules: (task as any).webValidationRules,
        webValidationProfile: (task as any).webValidationProfile,
      }
    );
    (task as any).taskMode = normalizedTaskInput.taskMode;
    task.template = normalizedTaskInput.template;
    if ((data as any).templatesByLanguage !== undefined) {
      const effectiveAllowed = ((data as any).allowedLanguages !== undefined)
        ? ((data as any).allowedLanguages ?? null)
        : ((task as any).allowedLanguages ?? null);
      const effectiveBaseTemplate = (typeof data.template === "string") ? data.template : task.template;
      (task as any).templatesByLanguage = normalizeTemplatesByLanguage({
        baseTemplate: effectiveBaseTemplate,
        allowedLanguages: Array.isArray(effectiveAllowed) ? (effectiveAllowed as JudgeLangId[]) : null,
        raw: (data as any).templatesByLanguage,
      });
    } else if ((data as any).allowedLanguages !== undefined) {
      // allowedLanguages changed but templatesByLanguage wasn't explicitly updated: keep existing but ensure every allowed lang has a template.
      const effectiveAllowed = (data as any).allowedLanguages ?? null;
      if (Array.isArray(effectiveAllowed) && effectiveAllowed.length > 0) {
        (task as any).templatesByLanguage = normalizeTemplatesByLanguage({
          baseTemplate: task.template,
          allowedLanguages: effectiveAllowed as JudgeLangId[],
          raw: (task as any).templatesByLanguage,
        });
      }
    }
    if (data.lang) task.lang = normalizeLang(data.lang);
    if (typeof data.maxAttempts === "number") task.maxAttempts = data.maxAttempts;
    if ((data as any).timeLimitMs !== undefined) (task as any).timeLimitMs = (data as any).timeLimitMs ?? null;
    if ((data as any).memoryLimitMb !== undefined) (task as any).memoryLimitMb = (data as any).memoryLimitMb ?? null;
    if ((data as any).outputLimitKb !== undefined) (task as any).outputLimitKb = (data as any).outputLimitKb ?? null;
    if ((data as any).checkerSpec !== undefined) (task as any).checkerSpec = (data as any).checkerSpec ?? null;
    if ((data as any).allowedLanguages !== undefined) (task as any).allowedLanguages = (data as any).allowedLanguages ?? null;

    if (effectiveTaskMode === "WEB") {
      const effectiveWebFiles = normalizedTaskInput.webTemplateFiles ?? normalizeWebTaskFiles([]);
      assertLibraryWebFilesWithinLimits(effectiveWebFiles);
      (task as any).webTemplateFiles = effectiveWebFiles;
      (task as any).webValidationRules = normalizedTaskInput.webValidationRules ?? [];
      (task as any).webValidationProfile = normalizedTaskInput.webValidationProfile ?? normalizeWebProfile("FREE_WEB");
    } else {
      (task as any).webTemplateFiles = null;
      (task as any).webValidationRules = null;
      (task as any).webValidationProfile = null;
    }

    // Editing resets rejection reason.
    task.rejectionReason = null;

    await libraryRepo().save(task);

    if (data.theory !== undefined) {
      const existing = await theoryRepo().findOne({ where: { libraryTask: { id: task.id } } as any });
      const next = String(data.theory ?? "").trim();
      if (!next) {
        if (existing) await theoryRepo().remove(existing);
      } else {
        if (existing) {
          existing.content = next;
          await theoryRepo().save(existing);
        } else {
          await theoryRepo().save(
            theoryRepo().create({ libraryTask: { id: task.id } as any, content: next })
          );
        }
      }
    }

    if (data.tests !== undefined) {
      // Replace all tests.
      await AppDataSource.query("DELETE FROM test_data WHERE library_task_id = ?", [task.id]);
      if (Array.isArray(data.tests) && data.tests.length > 0) {
        const rows = data.tests.map(t =>
          testDataRepo().create({
            libraryTask: { id: task.id } as any,
            input: String(t.input ?? ""),
            expectedOutput: String(t.expectedOutput ?? ""),
            isHidden: !!t.isHidden,
            kind: (!!t.isHidden ? "JUDGE" : "SAMPLE") as any,
            source: "LIBRARY_IMPORTED",
            points: t.points ?? 1,
            subtask: typeof (t as any).subtask === "number" ? String((t as any).subtask) : null,
          })
        );
        await testDataRepo().save(rows);
      }
    }

    const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author", "theory"] });
    return res.json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
  } catch (error: any) {
    logger.error("[library] PATCH /tasks/:id error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.delete("/tasks/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const isOwner = task.author?.id === req.userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    // Allow deleting only non-published drafts. (We also allow deleting REJECTED so authors can clean up.)
    if (task.status === "APPROVED" || task.status === "PENDING") {
      return res.status(400).json({ message: "CANNOT_DELETE_IN_STATUS", status: task.status });
    }

    await AppDataSource.transaction(async (m) => {
      // Defensive deletes (FKs are expected to CASCADE, but explicit deletes keep it robust across old schemas).
      try { await m.query("DELETE FROM library_task_revisions WHERE library_task_id = ?", [id]); } catch {}
      try { await m.query("DELETE FROM library_task_attempts WHERE library_task_id = ?", [id]); } catch {}
      try { await m.query("DELETE FROM test_data WHERE library_task_id = ?", [id]); } catch {}
      try { await m.query("DELETE FROM task_theories WHERE library_task_id = ?", [id]); } catch {}
      await m.query("DELETE FROM library_tasks WHERE id = ?", [id]);
    });

    return res.json({ ok: true });
  } catch (error: any) {
    logger.error("[library] DELETE /tasks/:id error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.post("/tasks/:id/submit", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const isOwner = task.author?.id === req.userId;
    if (!isAdmin && !isOwner) return res.status(403).json({ message: "ACCESS_DENIED" });

    if (task.status !== "DRAFT" && task.status !== "REJECTED") {
      return res.status(400).json({ message: "CANNOT_SUBMIT_IN_STATUS", status: task.status });
    }

    // Auto-fill judge configuration defaults (limits + checker) so moderation always sees a fully configured task.
    // If the author explicitly set values, we keep them.
    const tests = await testDataRepo().find({
      where: { libraryTask: { id: task.id } } as any,
      order: { id: "ASC" } as any,
    });
    if (ensureJudgeConfigDefaults(task, tests)) {
      await libraryRepo().save(task);
    }

    task.status = "PENDING";
    task.submittedAt = new Date();
    task.rejectionReason = null;
    await libraryRepo().save(task);

    const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author"] });
    return res.json({ task: full ? buildTaskDto(full) : buildTaskDto(task) });
  } catch (error: any) {
    logger.error("[library] POST /tasks/:id/submit error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

const copyToTopicSchema = z.object({
  topicId: z.number().int().positive(),
});

libraryRouter.post("/tasks/:id/copy-to-topic", authRequired, teacherOrAdminGuard, async (req: AuthRequest, res: Response) => {
  try {
    const libraryTaskId = parseInt(req.params.id, 10);
    if (isNaN(libraryTaskId)) return res.status(400).json({ message: "INVALID_ID" });

    const validated = copyToTopicSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: validated.error.issues });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ message: "UNAUTHORIZED" });
    if (user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS" });
    }

    const topic = await topicRepo().findOne({
      where: { id: validated.data.topicId } as any,
      relations: ["class", "class.teacher"],
    });
    if (!topic) return res.status(404).json({ message: "TOPIC_NOT_FOUND" });
    if (topic.class && topic.class.teacher?.id !== user.id && req.userRole !== "SYSTEM_ADMIN") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const libTask = await libraryRepo().findOne({
      where: { id: libraryTaskId } as any,
      relations: ["author", "theory"],
    });
    if (!libTask) return res.status(404).json({ message: "LIBRARY_TASK_NOT_FOUND" });
    if (libTask.status !== "APPROVED" && req.userRole !== "SYSTEM_ADMIN" && libTask.author?.id !== user.id) {
      return res.status(403).json({ message: "ONLY_APPROVED_TASKS" });
    }

    const newTopicTask = topicTaskRepo().create({
      topic: { id: topic.id } as any,
      title: libTask.title,
      description: libTask.description,
      template: libTask.template,
      taskMode: (String((libTask as any).taskMode ?? "CODE") === "WEB" ? "WEB" : "CODE") as any,
      webTemplateFiles: normalizeWebTaskFiles((libTask as any).webTemplateFiles ?? []),
      webValidationRules: normalizeWebRules((libTask as any).webValidationRules ?? []),
      type: "PRACTICE",
      order: 0,
      maxAttempts: libTask.maxAttempts ?? 3,
      deadline: null,
    });
    await topicTaskRepo().save(newTopicTask);

    if (libTask.theory?.content) {
      const th = theoryRepo().create({
        topicTask: { id: newTopicTask.id } as any,
        content: libTask.theory.content,
      });
      await theoryRepo().save(th);
    }

    const tests = await testDataRepo().find({
      where: { libraryTask: { id: libTask.id } } as any,
      order: { id: "ASC" },
    });

    if (tests.length > 0) {
      const rows = tests.map(t =>
        testDataRepo().create({
          topicTask: { id: newTopicTask.id } as any,
          input: t.input,
          expectedOutput: t.expectedOutput,
          isHidden: !!t.isHidden,
          kind: (((t as any).kind ?? (t.isHidden ? "JUDGE" : "SAMPLE")) as any),
          source: "LIBRARY_IMPORTED",
          points: t.points,
          subtask: (t as any).subtask ?? null,
        })
      );
      await testDataRepo().save(rows);
    }

    return res.status(201).json({
      ok: true,
      topicTask: { id: newTopicTask.id, title: newTopicTask.title },
    });
  } catch (error: any) {
    logger.error("[library] POST /tasks/:id/copy-to-topic error", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

function readZipJson<T>(zip: AdmZip, path: string, budget?: ZipExtractionBudget): T {
  const entry = zip.getEntry(path);
  if (!entry) throw new Error(`Missing ${path}`);
  // Decompress through the budget so a lying-header zip-bomb is bounded by the
  // ACTUAL decompressed byte count, not the attacker-controlled header.
  const raw = budget ? budget.readEntryText(entry) : entry.getData().toString("utf-8");
  return JSON.parse(raw) as T;
}

type UploadArchiveFile = { buffer: Buffer; originalname: string; fieldname?: string };

function normalizeImportArchiveFiles(req: AuthRequest): UploadArchiveFile[] {
  const out: UploadArchiveFile[] = [];

  const one = (req as any).file as UploadArchiveFile | undefined;
  if (one?.buffer) out.push(one);

  const many = (req as any).files as UploadArchiveFile[] | Record<string, UploadArchiveFile[]> | undefined;
  if (Array.isArray(many)) {
    for (const f of many) {
      if (f?.buffer) out.push(f);
    }
  } else if (many && typeof many === "object") {
    for (const list of Object.values(many)) {
      if (!Array.isArray(list)) continue;
      for (const f of list) {
        if (f?.buffer) out.push(f);
      }
    }
  }

  // Keep only known fields used by frontend/API clients.
  const filtered = out.filter(f => {
    const field = String(f.fieldname ?? "archive").trim();
    return field === "archive" || field === "archives";
  });

  // De-duplicate by (name + size + first bytes hash-ish) to avoid accidental duplicates if middleware populates both file/files.
  const seen = new Set<string>();
  const deduped: UploadArchiveFile[] = [];
  for (const f of filtered) {
    const sig = `${f.originalname || "archive.zip"}|${f.buffer.length}|${f.buffer.subarray(0, 16).toString("hex")}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    deduped.push(f);
  }
  return deduped;
}

function extractTaskArchiveCandidates(file: UploadArchiveFile): Array<{ sourceName: string; buffer: Buffer }> {
  const sourceName = String(file.originalname || "archive.zip");
  const primaryZip = new AdmZip(file.buffer);
  // Reject zip-slip / oversized / suspicious-ratio archives up front, on header
  // metadata. Per-task content is additionally bounded by actual decompressed
  // bytes inside importSingleLibraryArchive.
  validateUploadedZip(primaryZip);

  // Standard single-task archive.
  if (primaryZip.getEntry("task.json")) {
    return [{ sourceName, buffer: file.buffer }];
  }

  // Bundle mode: an archive that contains multiple task archives (*.zip).
  const nestedZipEntries = primaryZip
    .getEntries()
    .filter(e => !e.isDirectory && String(e.entryName || "").toLowerCase().endsWith(".zip"));

  if (!nestedZipEntries.length) {
    // Fallback to keep old behavior/error messaging.
    return [{ sourceName, buffer: file.buffer }];
  }

  // Bound the TOTAL actual bytes inflated across all nested archives so a
  // bundle of lying-header bombs cannot exhaust memory before per-task checks.
  const bundleBudget = new ZipExtractionBudget(ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES, ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES);
  const out: Array<{ sourceName: string; buffer: Buffer }> = [];
  for (const entry of nestedZipEntries) {
    try {
      const nestedBuffer = bundleBudget.readEntry(entry);
      if (!nestedBuffer || nestedBuffer.length === 0) continue;
      out.push({
        sourceName: `${sourceName}::${entry.entryName}`,
        buffer: nestedBuffer,
      });
    } catch (err) {
      // A blown budget is fatal for the whole bundle — stop inflating.
      if (err instanceof ZipValidationError) throw err;
      // Skip otherwise-unreadable nested entry; a detailed error surfaces when
      // the candidate is imported.
    }
  }

  return out.length ? out : [{ sourceName, buffer: file.buffer }];
}

async function importSingleLibraryArchive(params: {
  user: User;
  hideFromLibrary: boolean;
  buffer: Buffer;
}): Promise<LibraryTask> {
  const { user, hideFromLibrary, buffer } = params;
  const zip = new AdmZip(buffer);
  // Defence in depth: validate header metadata (zip-slip / caps / ratio) and
  // charge every decompressed entry against a per-task actual-byte budget.
  validateUploadedZip(zip);
  const zipBudget = new ZipExtractionBudget();

  const archiveTaskSchema = z.object({
    title: z.string().min(1).max(255),
    description: z.string().min(1),
    template: z.string().optional(),
    taskMode: z.enum(["CODE", "WEB"]).optional(),
    webTemplateFiles: z
      .array(
        z.object({
          path: z.enum(["index.html", "styles.css", "script.js"]),
          content: z.string().max(200_000),
        })
      )
      .max(3)
      .optional(),
    webValidationRules: z
      .array(
        z.object({
          id: z.string().optional(),
          type: z.enum([
            "required_selector",
            "forbidden_selector",
            "required_text",
            "forbidden_text",
            "required_script_pattern",
            "forbidden_script_pattern",
            "required_attribute",
            "forbidden_attribute",
            "required_style",
            "forbidden_style",
          ]),
          message: z.string().max(1000).optional(),
          points: z.number().int().min(0).max(1000).optional(),
          selector: z.string().max(500).optional(),
          attribute: z.string().max(200).optional(),
          value: z.string().max(1000).optional(),
          valuePattern: z.string().max(2000).optional(),
          property: z.string().max(200).optional(),
          text: z.string().max(2000).optional(),
          pattern: z.string().max(2000).optional(),
          flags: z.string().max(10).optional(),
        })
      )
      .max(200)
      .optional(),
    webValidationProfile: z
      .object({
        id: z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"]).optional(),
        allowHtml: z.boolean().optional(),
        allowCss: z.boolean().optional(),
        allowJs: z.boolean().optional(),
        allowInlineStyle: z.boolean().optional(),
        allowInlineScript: z.boolean().optional(),
        allowExternalResources: z.boolean().optional(),
        lockHtml: z.boolean().optional(),
        lockCss: z.boolean().optional(),
        lockJs: z.boolean().optional(),
      })
      .or(z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"]))
      .optional(),
    // optional metadata (same constraints as API schema, but with coercion)
    problemCode: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/)
      .optional(),
    slug: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/)
      .optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    tags: z
      .preprocess(
        (v) => {
          if (Array.isArray(v)) return v;
          if (typeof v === "string") {
            return v
              .split(",")
              .map(x => String(x).trim())
              .filter(Boolean);
          }
          return undefined;
        },
        z.array(z.string().min(1).max(32)).max(20)
      )
      .optional(),
    section: z.string().min(1).max(80).optional(),
    maxAttempts: z.coerce.number().int().min(1).max(100).optional(),
    timeLimitMs: z.coerce.number().int().min(100).max(60000).optional(),
    memoryLimitMb: z.coerce.number().int().min(16).max(2048).optional(),
    outputLimitKb: z.coerce.number().int().min(4).max(1024).optional(),
    checkerSpec: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("exact") }),
        z.object({ type: z.literal("whitespace") }),
        z.object({ type: z.literal("float"), epsilon: z.coerce.number().positive().max(1) }),
      ])
      .optional(),
    allowedLanguages: z
      .preprocess(
        (v) => {
          if (v == null) return undefined;
          if (Array.isArray(v)) return v;
          if (typeof v === "string") {
            return v
              .split(/[\s,]+/g)
              .map(x => String(x).trim().toLowerCase())
              .filter(Boolean);
          }
          return v;
        },
        z.array(z.enum(["java", "python", "cpp", "c", "csharp", "kotlin"]))
          .min(1)
          .max(6)
      )
      .optional(),
    templatesByLanguage: z.record(z.string(), z.string()).optional(),
  });

  const taskJsonRaw = readZipJson<any>(zip, "task.json", zipBudget);
  const parsedTaskJson = archiveTaskSchema.safeParse(taskJsonRaw);
  if (!parsedTaskJson.success) {
    const err = new Error("INVALID_TASK_JSON") as Error & { issues?: unknown[] };
    err.issues = parsedTaskJson.error.issues;
    throw err;
  }

  const taskJson = parsedTaskJson.data;
  const normalizedTaskInput = normalizeWebTaskInput(taskJson);
  if (!normalizedTaskInput.template.trim()) {
    const err = new Error("INVALID_TASK_JSON") as Error & { issues?: unknown[] };
    err.issues = [{ path: ["template"], message: "Required" }];
    throw err;
  }

  if (Array.isArray((taskJson as any).allowedLanguages) && (taskJson as any).allowedLanguages.some((l: any) => DISABLED_JUDGE_LANGS.has(l))) {
    const err = new Error("LANGUAGE_DISABLED") as Error & { disabledLanguages?: string[] };
    err.disabledLanguages = Array.from(DISABLED_JUDGE_LANGS);
    throw err;
  }

  const title = String(taskJson.title ?? "").trim();
  const description = String(taskJson.description ?? "").trim();
  const template = normalizedTaskInput.template;
  const maxAttempts = typeof taskJson.maxAttempts === "number" && Number.isFinite(taskJson.maxAttempts)
    ? Math.max(1, Math.floor(taskJson.maxAttempts))
    : 3;

  const incomingProblemCode = taskJson.problemCode?.trim() ?? null;
  if (!hideFromLibrary && incomingProblemCode) {
    const exists = await libraryRepo().findOne({ where: { problemCode: incomingProblemCode } as any });
    if (exists) {
      const err = new Error("PROBLEM_CODE_TAKEN") as Error & { problemCode?: string };
      err.problemCode = incomingProblemCode;
      throw err;
    }
  }

  const normalizedTemplatesByLanguage = normalizeTemplatesByLanguage({
    baseTemplate: template,
    allowedLanguages: Array.isArray((taskJson as any).allowedLanguages) ? ((taskJson as any).allowedLanguages as JudgeLangId[]) : null,
    raw: (taskJson as any).templatesByLanguage,
  });

  if (normalizedTaskInput.taskMode === "WEB") {
    const archiveWebFiles = normalizedTaskInput.webTemplateFiles ?? normalizeWebTaskFiles([]);
    assertLibraryWebFilesWithinLimits(archiveWebFiles ?? normalizeWebTaskFiles([]));
  }

  const task = libraryRepo().create({
    author: { id: user.id } as any,
    title,
    problemCode: hideFromLibrary ? null : incomingProblemCode,
    slug: hideFromLibrary ? null : (taskJson.slug?.trim() ?? null),
    difficulty: (taskJson as any).difficulty ?? null,
    tags: (taskJson as any).tags ?? null,
    section: taskJson.section?.trim() ?? null,
    taskMode: normalizedTaskInput.taskMode as any,
    webTemplateFiles: normalizedTaskInput.webTemplateFiles,
    webValidationRules: normalizedTaskInput.webValidationRules,
    webValidationProfile: normalizedTaskInput.webValidationProfile,
    description,
    template,
    templatesByLanguage: normalizedTemplatesByLanguage,
    maxAttempts,
    timeLimitMs: (taskJson as any).timeLimitMs ?? null,
    memoryLimitMb: (taskJson as any).memoryLimitMb ?? null,
    outputLimitKb: (taskJson as any).outputLimitKb ?? null,
    checkerSpec: (taskJson as any).checkerSpec ?? null,
    allowedLanguages: (taskJson as any).allowedLanguages ?? null,
    isHiddenFromLibrary: hideFromLibrary,
    status: "DRAFT",
    rejectionReason: null,
    submittedAt: null,
    publishedAt: null,
  });

  await libraryRepo().save(task);

  const theoryEntry = zip.getEntry("theory.md");
  if (theoryEntry) {
    const content = zipBudget.readEntryText(theoryEntry).trim();
    if (content) {
      await theoryRepo().save(theoryRepo().create({ libraryTask: { id: task.id } as any, content }));
    }
  }

  const testsEntry = zip.getEntry("tests.json");
  if (testsEntry) {
    const tests = readZipJson<Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number; subtask?: number | string }>>(zip, "tests.json", zipBudget);
    if (Array.isArray(tests) && tests.length > 0) {
      const rows = tests.map(t =>
        testDataRepo().create({
          libraryTask: { id: task.id } as any,
          input: String(t.input ?? ""),
          expectedOutput: String(t.expectedOutput ?? ""),
          isHidden: !!t.isHidden,
          kind: (!!t.isHidden ? "JUDGE" : "SAMPLE") as any,
          source: "LIBRARY_IMPORTED",
          points: Number.isFinite(Number(t.points)) ? Math.max(1, Math.floor(Number(t.points))) : 1,
          subtask: t.subtask == null ? null : String(t.subtask),
        })
      );
      await testDataRepo().save(rows);
    }
  }

  const full = await libraryRepo().findOne({ where: { id: task.id } as any, relations: ["author"] });
  return full ?? task;
}

/**
 * Archive format for library task import/export:
 * - task.json (required)
 * - tests.json (optional)
 * - theory.md (optional)
 *
 * NOTE: Library tasks are no longer restricted to a single course language.
 * Use per-judge-language templates (templatesByLanguage) and/or allowedLanguages
 * via the API after import. The archive format intentionally does not include a
 * "lang" field.
 */
libraryRouter.post("/tasks/import-archive", authRequired, archiveUploadMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) return res.status(403).json({ message: "ONLY_USERS" });
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user) return res.status(401).json({ message: "UNAUTHORIZED" });

    const files = normalizeImportArchiveFiles(req);
    if (!files.length) return res.status(400).json({ message: "ARCHIVE_REQUIRED" });
    const hideFromLibraryRaw = String((req.body as any)?.hideFromLibrary ?? "").trim().toLowerCase();
    const hideFromLibrary = hideFromLibraryRaw === "1" || hideFromLibraryRaw === "true" || hideFromLibraryRaw === "yes";

    const candidates = files.flatMap(extractTaskArchiveCandidates);
    const importedTasks: any[] = [];
    const failures: Array<{ source: string; message: string; errors?: unknown[]; disabledLanguages?: string[]; problemCode?: string }> = [];

    for (const candidate of candidates) {
      try {
        const imported = await importSingleLibraryArchive({
          user,
          hideFromLibrary,
          buffer: candidate.buffer,
        });
        importedTasks.push(buildTaskDto(imported));
      } catch (error: any) {
        const msg = String(error?.message || "INTERNAL_SERVER_ERROR");
        failures.push({
          source: candidate.sourceName,
          message: msg,
          errors: Array.isArray(error?.issues) ? error.issues : undefined,
          disabledLanguages: Array.isArray(error?.disabledLanguages) ? error.disabledLanguages : undefined,
          problemCode: typeof error?.problemCode === "string" ? error.problemCode : undefined,
        });
      }
    }

    if (importedTasks.length === 0) {
      return res.status(400).json({
        message: failures[0]?.message || "IMPORT_FAILED",
        importedCount: 0,
        failedCount: failures.length,
        failures,
      });
    }

    // Backward compatibility for existing callers expecting { task }.
    const firstTask = importedTasks[0];
    if (failures.length === 0) {
      return res.status(201).json({
        task: firstTask,
        tasks: importedTasks,
        importedCount: importedTasks.length,
        failedCount: 0,
      });
    }

    return res.status(207).json({
      task: firstTask,
      tasks: importedTasks,
      importedCount: importedTasks.length,
      failedCount: failures.length,
      failures,
    });
  } catch (error: any) {
    // Archive-level rejection (zip-slip / oversized / lying-header bomb).
    if (error instanceof ZipValidationError) {
      return res.status(400).json({ message: error.code });
    }
    logger.error("[library] import archive failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: error?.message || "INTERNAL_SERVER_ERROR" });
  }
});

// Challenge of the day — deterministic per (date, lang) over approved tasks.
libraryRouter.get("/daily-challenge", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const lang = String(req.query.lang ?? "").trim().toUpperCase();
    const qb = libraryRepo()
      .createQueryBuilder("t")
      .select(["t.id"])
      .where("t.status = :st", { st: "APPROVED" as LibraryTaskStatus });
    const rows = await qb.getMany();
    const ids = rows.map((r) => r.id).filter((n) => Number.isFinite(n));
    const pick = pickDailyChallenge(ids, new Date(), lang);
    if (!pick) return res.json({ available: false });

    const task = await libraryRepo().findOne({ where: { id: pick.item } as any });
    if (!task) return res.json({ available: false });

    return res.json({
      available: true,
      date: pick.date,
      task: {
        id: task.id,
        title: task.title,
        difficulty: (task as any).difficulty ?? null,
        problemCode: (task as any).problemCode ?? null,
        slug: (task as any).slug ?? null,
        section: (task as any).section ?? null,
      },
    });
  } catch (error: any) {
    logger.warn("[library] daily-challenge failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Empirical difficulty suggestion from real attempt stats (author/admin only).
libraryRouter.get("/tasks/:id/difficulty-suggestion", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const isAuthor = task.author?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isAuthor && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    const attempts = await attemptRepo().find({ where: { libraryTask: { id } } as any });
    const distinctUsers = attempts.length;
    const solved = attempts.filter((a) => String(a.lastVerdict ?? "").toUpperCase() === "AC");
    const solvedUsers = solved.length;
    const avgAttemptsToSolve = solvedUsers > 0
      ? solved.reduce((sum, a) => sum + Math.max(1, a.submissionsCount || 1), 0) / solvedUsers
      : undefined;

    const rec = recommendDifficulty({ distinctUsers, solvedUsers, avgAttemptsToSolve });
    const current = ((task as any).difficulty ?? null) as "EASY" | "MEDIUM" | "HARD" | null;

    return res.json({
      current,
      ...rec,
      shouldRecalibrate: shouldRecalibrate(current, rec),
      sample: { distinctUsers, solvedUsers, avgAttemptsToSolve: avgAttemptsToSolve ?? null },
    });
  } catch (error: any) {
    logger.warn("[library] difficulty-suggestion failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Integrity events recorded for this task (author/admin only), newest first.
libraryRouter.get("/tasks/:id/integrity-events", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });
    const isAuthor = task.author?.id === req.userId;
    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    if (!isAuthor && !isAdmin) return res.status(403).json({ message: "ACCESS_DENIED" });

    const limit = Math.max(1, Math.min(200, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const events = await AppDataSource.getRepository(SubmissionIntegrity).find({
      where: { taskKind: "LIBRARY", taskId: id } as any,
      order: { createdAt: "DESC" } as any,
      take: limit,
    });

    return res.json({
      total: events.length,
      events: events.map((e) => ({
        principalType: e.principalType,
        principalId: e.principalId,
        score: e.score,
        level: e.level,
        flags: (() => { try { return JSON.parse(e.flags ?? "[]"); } catch { return []; } })(),
        createdAt: e.createdAt,
      })),
    });
  } catch (error: any) {
    logger.warn("[library] integrity-events failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

libraryRouter.get("/tasks/:id/export-archive", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const task = await libraryRepo().findOne({ where: { id } as any, relations: ["author", "theory"] });
    if (!task) return res.status(404).json({ message: "NOT_FOUND" });

    const allowed = canReadTask(task, req.userType === "USER" ? (req.userId ?? null) : null, req.userRole ?? null);
    if (!allowed) return res.status(403).json({ message: "ACCESS_DENIED" });

    const tests = await testDataRepo().find({ where: { libraryTask: { id: task.id } } as any, order: { id: "ASC" } });

    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(
        JSON.stringify(
          {
            format: "studycod-task-archive",
            version: 1,
            exportedAt: new Date().toISOString(),
            kind: "library-task",
          },
          null,
          2
        ),
        "utf-8"
      )
    );
    zip.addFile(
      "task.json",
      Buffer.from(
        JSON.stringify(
          {
            title: task.title,
            problemCode: (task as any).problemCode ?? undefined,
            slug: (task as any).slug ?? undefined,
            difficulty: (task as any).difficulty ?? undefined,
            tags: (task as any).tags ?? undefined,
            section: (task as any).section ?? undefined,
            taskMode: (task as any).taskMode ?? "CODE",
            webTemplateFiles: (task as any).webTemplateFiles ?? undefined,
            webValidationRules: (task as any).webValidationRules ?? undefined,
            webValidationProfile: (task as any).webValidationProfile ?? undefined,
            description: task.description,
            template: task.template,
            maxAttempts: task.maxAttempts,
            timeLimitMs: (task as any).timeLimitMs ?? undefined,
            memoryLimitMb: (task as any).memoryLimitMb ?? undefined,
            outputLimitKb: (task as any).outputLimitKb ?? undefined,
            checkerSpec: (task as any).checkerSpec ?? undefined,
            allowedLanguages: (task as any).allowedLanguages ?? undefined,
            templatesByLanguage: (task as any).templatesByLanguage ?? undefined,
          },
          null,
          2
        ),
        "utf-8"
      )
    );

    if (tests.length > 0) {
      zip.addFile(
        "tests.json",
        Buffer.from(
          JSON.stringify(
            tests.map(t => ({
              input: t.input,
              expectedOutput: t.expectedOutput,
              isHidden: !!t.isHidden,
              points: t.points,
              subtask: (t as any).subtask ?? null,
            })),
            null,
            2
          ),
          "utf-8"
        )
      );
    }

    if (task.theory?.content) {
      zip.addFile("theory.md", Buffer.from(task.theory.content, "utf-8"));
    }

    const desiredFilename = `library_task_${task.id}.zip`;
    const fallbackFilename = `library_task_${task.id}.zip`;
    const encoded = encodeURIComponent(desiredFilename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const buffer = zip.toBuffer();

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=\"${fallbackFilename}\"; filename*=UTF-8''${encoded}`);
    return res.send(buffer);
  } catch (error: any) {
    logger.error("[library] export archive failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: error?.message || "INTERNAL_SERVER_ERROR" });
  }
});

export default libraryRouter;
