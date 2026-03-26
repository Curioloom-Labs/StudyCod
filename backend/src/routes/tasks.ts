import { encodeAiComparisonFeedback, parseGradeComparisonFeedback } from "../utils/gradeComparisonFeedback";
import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { createHash } from "crypto";
import { AppDataSource } from "../data-source";
import { Task, TaskType } from "../entities/Task";
import type { TaskIoType } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { Grade } from "../entities/Grade";
import { User } from "../entities/User";
import { TestData } from "../entities/TestData";
import { TheoryBlock } from "../entities/TheoryBlock";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { In } from "typeorm";
import { generateTaskWithAI, generateTheoryWithAI, generateQuizWithAI } from "../services/openRouterService";
import { safeAICall, sendAIError } from "../services/ai/safeAICall";
import { generateAlgorithmicHints } from "../services/ai/failureHints";
import { checkMilestone } from "../utils/milestoneDetector";
import { getStableDifus } from "../utils/adaptiveDifficulty";
import { executeCodeWithInput } from "../services/codeExecutionService";
import { computeTotalFromParts, evaluateCodeWithAI } from "../ai/evaluator";
import { judgeWithSemaphore } from "../services/judgeWorker";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { normalizeMarkdownText } from "../utils/markdownNormalize";
import { inferNeedsInput } from "../utils/inferNeedsInput";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { concatForAI, decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, pickEntryContent } from "../utils/multiFileSubmission";
import { buildLearningFirstFailure } from "../services/learning/firstFailure";
import { hasTheoryBlockEnTranslationColumns } from "../services/translation/translationSchema";
import { looksLikeTranslationProviderErrorText, translateMarkdownUkToEn } from "../services/translation/translateUkToEn";
import { env } from "../env";
import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  type WebTaskValidationProfile,
  type WebTaskValidationRule,
  validateWebTaskSubmission,
} from "../services/webTaskValidationService";
import { decodeWebTaskPayload, encodeWebTaskPayload, normalizeWebTaskTemplate } from "../utils/webTaskPayload";
const tasksRouter = Router();

type ApiCodeFile = { path: string; content: string };
type UiLanguage = "uk" | "en";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeClientSubmissionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return trimmed.slice(0, 128);
  return trimmed;
}

function normalizeApiFiles(raw: unknown): ApiCodeFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiCodeFile[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const p = typeof (f as any).path === "string" ? (f as any).path.trim() : "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    // Keep it simple (no folders) – matches judge validation.
    if (p.includes("/") || p.includes("\\") || p.includes("..") || p.startsWith(".")) continue;
    out.push({ path: p, content: c });
  }
  const byPath = new Map<string, ApiCodeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}

const personalWebDraftStore = new Map<string, {
  files: ReturnType<typeof normalizeWebTaskFiles>;
  updatedAt: number;
}>();

function personalWebDraftKey(userId: number, taskId: number): string {
  return `${userId}:${taskId}`;
}

function normalizeWebRules(raw: unknown): WebTaskValidationRule[] {
  return normalizeWebValidationRules(raw);
}

function normalizeWebProfile(raw: unknown): WebTaskValidationProfile {
  return normalizeWebValidationProfile(raw ?? "FREE_WEB");
}

function assertPersonalWebFilesWithinLimits(files: ReturnType<typeof normalizeWebTaskFiles>) {
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

function resolveUiLanguage(req: AuthRequest): UiLanguage {
  const q = String((req.query as any)?.uiLang ?? "").toLowerCase().trim();
  if (q.startsWith("en")) return "en";
  if (q.startsWith("uk")) return "uk";

  const bodyLang = String((req.body as any)?.language ?? "").toLowerCase().trim();
  if (bodyLang === "en") return "en";
  if (bodyLang === "uk") return "uk";

  const accept = String(req.headers["accept-language"] ?? "").toLowerCase();
  return accept.includes("en") ? "en" : "uk";
}

function i18nText<T extends string>(uiLanguage: UiLanguage, uk: T, en: T): T {
  return (uiLanguage === "en" ? en : uk) as T;
}
function taskNeedsInput(taskDesc: string): boolean {
  // Kept for backwards compatibility inside this file.
  return inferNeedsInput({
    taskDescription: taskDesc,
    aiInputFormat: null
  });
}
function tryExtractFixedAdditionSumNoInput(taskText: string): number | null {
  const s = String(taskText ?? "");
  if (taskNeedsInput(s)) return null;
  if (/\b(сума\s*:|sum\s*:|формат\s+виводу|output\s+format)\b/i.test(s)) return null;
  if (/\b(добуток|product|multiply)\b/i.test(s)) return null;
  const m = s.match(/(^|[^\d])(\d{1,9})\s*\+\s*(\d{1,9})([^\d]|$)/);
  if (!m) return null;
  if (!/(вивед|output|print)/i.test(s)) return null;
  const a = Number(m[2]);
  const b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + b;
}
function computeDeterministicNoInputExpectedOutput(taskText: string): string | null {
  const s = String(taskText ?? "");
  if (taskNeedsInput(s)) return null;
  if (/\b(сума\s*:|sum\s*:|формат\s+виводу|output\s+format)\b/i.test(s)) return null;
  const add = tryExtractFixedAdditionSumNoInput(s);
  if (add !== null) return String(add);
  const aMatch = s.match(/\ba\b[^\d\n]{0,80}(\d{1,9})/i);
  const bMatch = s.match(/\bb\b[^\d\n]{0,80}(\d{1,9})/i);
  if (aMatch && bMatch) {
    const a = Number(aMatch[1]);
    const b = Number(bMatch[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (/\b(добуток|product|multiply)\b/i.test(s)) return String(a * b);
      if (/\b(різниц|difference|subtract)\b/i.test(s)) return String(a - b);
      if (/\b(сума|sum|add)\b/i.test(s)) return String(a + b);
    }
  }
  return null;
}
function isIntroPythonFixedSumTask(taskDesc: string, title: string): boolean {
  const t = String(title ?? "").trim();
  const s = String(taskDesc ?? "");
  if (!/Вступ\s+до\s+Python\s+та\s+інтерпретатора/i.test(t)) return false;
  if (taskNeedsInput(s)) return false;
  return /\ba\b[^\n]{0,80}(?:значенн\w*\s*)?5/i.test(s) && /\bb\b[^\n]{0,80}(?:значенн\w*\s*)?3/i.test(s) && /сум/i.test(s) && /вивед/i.test(s);
}
function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some(s => {
    const v = String(s ?? "");
    return /(^|\s)[-+]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?(\s|$)/.test(v) || /(^|\s)[-+]?\d+(?:[eE][-+]?\d+)(\s|$)/.test(v);
  });
  return hasFloatLike ? {
    type: "float",
    epsilon: 1e-6
  } : {
    type: "whitespace"
  };
}

function inferEffectiveIoTypeForPersonalTask(task: Task, tests: Array<{ input?: string | null; expectedOutput?: string | null }>): TaskIoType {
  // Respect explicit NO_INPUT_* values. Only override legacy/backfilled STDIN_STDOUT when the stored tests clearly indicate no-input.
  if (task.ioType === "NO_INPUT_FIXED_OUTPUT" || task.ioType === "NO_INPUT_FREE_OUTPUT") return task.ioType;

  const normalizedInputs = tests.map(t => String(t?.input ?? "").trim());
  const hasAnyInput = normalizedInputs.some(s => s.length > 0);
  if (hasAnyInput) return "STDIN_STDOUT";

  // No-input tests: decide whether output is fixed/deterministic (has meaningful expected output)
  // or free-output (expected output blank / placeholder).
  const outputs = tests.map(t => String(t?.expectedOutput ?? "").trim());
  const hasAnyExpected = outputs.some(s => s.length > 0);
  const looksLikePlaceholder = outputs.every(s => {
    if (!s) return true;
    return /(any\s+non-?empty\s+output|non-?empty\s+output|будь-як\w*\s+непорожн\w*\s+вивід|будь-як\w*\s+текст)/i.test(s);
  });

  if (hasAnyExpected && !looksLikePlaceholder) return "NO_INPUT_FIXED_OUTPUT";
  return "NO_INPUT_FREE_OUTPUT";
}

function sanitizeTestResultsForStudent(results: any): Array<{ testId: number; passed: boolean; verdict?: string | null; errorKind?: string | null; error?: string | null }> {
  if (!Array.isArray(results)) return [];
  return results
    .map((r: any) => ({
      testId: Number(r?.testId ?? r?.test_id ?? 0),
      passed: !!r?.passed,
      verdict: r?.verdict ?? null,
      errorKind: r?.errorKind ?? r?.error_kind ?? null,
      error: r?.error ?? null
    }))
    .filter(r => Number.isFinite(r.testId) && r.testId > 0);
}
const taskRepo = () => AppDataSource.getRepository(Task);
const topicRepo = () => AppDataSource.getRepository(Topic);
const gradeRepo = () => AppDataSource.getRepository(Grade);
const userRepo = () => AppDataSource.getRepository(User);
const testDataRepo = () => AppDataSource.getRepository(TestData);
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

async function updateLearningStreakForUser(userId: number): Promise<void> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return;

  const today = startOfDay(new Date());
  const previous = user.lastActivityDate ? startOfDay(new Date(user.lastActivityDate)) : null;

  if (!previous) {
    user.currentStreak = 1;
  } else {
    const daysDiff = Math.floor((today.getTime() - previous.getTime()) / MILLISECONDS_PER_DAY);
    if (daysDiff <= 0) {
      // Already had activity today: do not increment streak.
    } else if (daysDiff === 1) {
      user.currentStreak = Math.max(1, Number(user.currentStreak ?? 0) + 1);
    } else {
      user.currentStreak = 1;
    }
  }

  user.longestStreak = Math.max(Number(user.longestStreak ?? 0), Number(user.currentStreak ?? 0));
  user.lastActivityDate = new Date();
  await userRepo().save(user);
}

async function syncPostLearningProgress(params: {
  userId: number;
  lang: "JAVA" | "PYTHON" | "CPP";
  topicIndex?: number | null;
  requestId?: string;
}): Promise<void> {
  const user = await userRepo().findOne({ where: { id: params.userId } });
  if (!user || user.userMode !== "PERSONAL") {
    return;
  }

  const normalizedTopicIndex = Number.isFinite(Number(params.topicIndex))
    ? Math.max(0, Math.floor(Number(params.topicIndex)))
    : 0;

  try {
    await updateLearningStreakForUser(params.userId);
  } catch (error) {
    logger.warn("[tasks] syncPostLearningProgress streak update failed", {
      requestId: params.requestId,
      userId: params.userId,
      error
    });
  }

  try {
    await getStableDifus(params.userId, params.lang, normalizedTopicIndex, userRepo, gradeRepo);
  } catch (error) {
    logger.warn("[tasks] syncPostLearningProgress difus update failed", {
      requestId: params.requestId,
      userId: params.userId,
      lang: params.lang,
      topicIndex: normalizedTopicIndex,
      error
    });
  }
}
type TaskStatus = "OPEN" | "SUBMITTED" | "GRADED";

// Personal mode: after each 5 fully completed topics (since placement), generate a control work:
// 1 quiz task (15 questions) + 3 practical coding tasks.
const PERSONAL_CONTROL_BATCH_SIZE = 5;
const PERSONAL_CONTROL_QUIZ_COUNT = 15;
const PERSONAL_CONTROL_PRACTICE_COUNT = 3;
const PERSONAL_CONTROL_PRACTICE_COEFF = 1.3;
const PERSONAL_CONTROL_PASS_GRADE = 60;

const GENERATE_COOLDOWN_MIN_MS = (() => {
  const raw = Number(process.env.TASKS_GENERATE_COOLDOWN_MIN_MS);
  const v = Number.isFinite(raw) ? Math.floor(raw) : 5_000;
  return Math.max(1_000, Math.min(60_000, v));
})();

const GENERATE_COOLDOWN_MAX_MS = (() => {
  const raw = Number(process.env.TASKS_GENERATE_COOLDOWN_MAX_MS);
  const fallback = 10_000;
  const v = Number.isFinite(raw) ? Math.floor(raw) : fallback;
  const bounded = Math.max(1_000, Math.min(60_000, v));
  return Math.max(GENERATE_COOLDOWN_MIN_MS, bounded);
})();

const generateCooldownByUserLang = new Map<string, number>();
const generateInFlightByUserLang = new Set<string>();

function randomIntInclusive(min: number, max: number): number {
  const lo = Math.floor(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function makeGenerateThrottleKey(userId: number, lang: "JAVA" | "PYTHON" | "CPP"): string {
  return `${userId}:${lang}`;
}

function buildPersonalControlBatchPrefix(params: { lang: "JAVA" | "PYTHON" | "CPP"; startTopicIndex: number; endTopicIndex: number }): string {
  return `PCW:${params.lang}:${params.startTopicIndex}-${params.endTopicIndex}`;
}

function parsePersonalControlBatchPrefix(subtitle: unknown): string | null {
  if (typeof subtitle !== "string") return null;
  const s = subtitle.trim();
  if (!s.startsWith("PCW:")) return null;
  const prefix = s.split("|")[0] || "";
  return prefix.startsWith("PCW:") ? prefix : null;
}

function isPersonalControlQuizTask(task: Pick<Task, "type" | "subtitle">): boolean {
  if (task.type !== "CONTROL") return false;
  return typeof (task as any).subtitle === "string" && String((task as any).subtitle).includes("|QUIZ|");
}

function clampGrade0to100Int(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function computePersonalControlFinalGrade(params: { quizGrade: number | null; practiceGrades: Array<number | null> }): {
  practiceAvg: number | null;
  practiceAdjusted: number | null;
  finalGrade: number | null;
  passed: boolean;
} {
  const quiz = typeof params.quizGrade === "number" && Number.isFinite(params.quizGrade) ? params.quizGrade : null;
  const practiceNumbers = params.practiceGrades.filter((g): g is number => typeof g === "number" && Number.isFinite(g));
  const practiceAvg = practiceNumbers.length === PERSONAL_CONTROL_PRACTICE_COUNT
    ? practiceNumbers.reduce((a, b) => a + b, 0) / practiceNumbers.length
    : null;
  const practiceAdjusted = practiceAvg === null ? null : (practiceAvg * PERSONAL_CONTROL_PRACTICE_COEFF);

  const finalRaw = (quiz !== null && practiceAdjusted !== null)
    ? ((quiz + practiceAdjusted) / 2)
    : null;
  const finalGrade = finalRaw === null ? null : clampGrade0to100Int(finalRaw);
  const passed = typeof finalGrade === "number" ? finalGrade >= PERSONAL_CONTROL_PASS_GRADE : false;
  return { practiceAvg, practiceAdjusted, finalGrade, passed };
}

function buildTopicsRangeLabel(params: { startTopicIndex: number; endTopicIndex: number }): string {
  // Human-friendly 1-based indexes in UI.
  return `${params.startTopicIndex + 1}-${params.endTopicIndex + 1}`;
}

function buildPrevTopicsTextFromRange(params: { topics: Topic[]; startTopicIndex: number; endTopicIndex: number }): string {
  const selected = params.topics.filter(t => t.topicIndex >= params.startTopicIndex && t.topicIndex <= params.endTopicIndex);
  const titles = selected.map(t => String(t.title || "").trim()).filter(Boolean);
  return titles.join("\n");
}

function getSequentialCompletedTopicCount(params: {
  topics: Topic[];
  countByTopicIndex: Map<number, number>;
  baseStartTopicIndex: number;
}): number {
  let completed = 0;
  for (const t of params.topics) {
    if (t.topicIndex < params.baseStartTopicIndex) continue;
    const required = t.topicIndex === 0 ? 1 : 3;
    const count = params.countByTopicIndex.get(t.topicIndex) ?? 0;
    if (count >= required) completed++;
    else break;
  }
  return completed;
}

async function getLatestGradesByTaskId(params: { userId: number; taskIds: number[] }): Promise<Map<number, Grade>> {
  const out = new Map<number, Grade>();
  if (!params.taskIds.length) return out;
  const grades = await gradeRepo()
    .createQueryBuilder("grade")
    .where("grade.user_id = :userId", { userId: params.userId })
    .andWhere("grade.task_id IN (:...taskIds)", { taskIds: params.taskIds })
    .orderBy("grade.created_at", "DESC")
    .getMany();
  for (const g of grades) {
    const taskId = typeof (g as any)?.task?.id === "number" ? (g as any).task.id : (g as any)?.task_id;
    const id = Number(taskId);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (!out.has(id)) out.set(id, g);
  }
  return out;
}

async function buildLocalizedTheoryEnByBlockId(params: {
  req: AuthRequest;
  theoryBlockIds: number[];
}): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!params.theoryBlockIds.length) return out;

  const hasCols = await hasTheoryBlockEnTranslationColumns();
  if (!hasCols) return out;

  const blocks = await theoryBlockRepo()
    .createQueryBuilder("b")
    .where("b.id IN (:...ids)", { ids: params.theoryBlockIds })
    .addSelect(["b.contentEn", "b.translationVersionEn", "b.translatedAtEn"])
    .getMany();

  for (const b of blocks) {
    const contentEn = String((b as any).contentEn ?? "");
    const isFresh =
      contentEn.trim().length > 0 &&
      !looksLikeTranslationProviderErrorText(contentEn) &&
      Number((b as any).translationVersionEn ?? 0) === Number((b as any).version ?? 0);

    if (isFresh) {
      out.set(b.id, contentEn);
      continue;
    }

    try {
      const translated = await translateMarkdownUkToEn(String(b.content ?? ""));
      if (translated.trim().length > 0 && !looksLikeTranslationProviderErrorText(translated)) {
        (b as any).contentEn = translated;
        (b as any).translationVersionEn = Number((b as any).version ?? 1);
        (b as any).translatedAtEn = new Date();
        await theoryBlockRepo().save(b);
        out.set(b.id, translated);
      }
    } catch (error: any) {
      logger.warn("[tasks] translate theory block uk->en failed", {
        requestId: params.req.requestId,
        userId: params.req.userId,
        theoryBlockId: b.id,
        error: error?.message ?? String(error)
      });
    }
  }

  return out;
}

async function buildLocalizedLegacyTheoryEnByTopicId(params: {
  req: AuthRequest;
  topics: Array<Topic | null | undefined>;
}): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = new Map<number, string>();

  for (const topic of params.topics) {
    const topicId = Number((topic as any)?.id);
    if (!Number.isFinite(topicId) || topicId <= 0) continue;
    const hasTheoryBlock = !!(topic as any)?.theoryBlock;
    if (hasTheoryBlock) continue;
    const legacy = String((topic as any)?.theoryMarkdown ?? "").trim();
    if (!legacy) continue;
    if (!unique.has(topicId)) unique.set(topicId, legacy);
  }

  for (const [topicId, markdown] of unique.entries()) {
    try {
      const translated = await translateMarkdownUkToEn(markdown);
      if (translated.trim().length > 0 && !looksLikeTranslationProviderErrorText(translated)) {
        out.set(topicId, translated);
      }
    } catch (error: any) {
      logger.warn("[tasks] translate legacy topic theory uk->en failed", {
        requestId: params.req.requestId,
        userId: params.req.userId,
        topicId,
        error: error?.message ?? String(error)
      });
    }
  }

  return out;
}

function stripPracticeLikeSectionsFromTheory(rawTheory: string): string {
  const t = normalizeMarkdownText(rawTheory).trim();
  if (!t) return "";
  const headerRe = /^#{2,3}\s*(Практика|Practice|Завдання|Вправа|Task|Exercise)\b.*$/im;
  const m = headerRe.exec(t);
  if (m && typeof m.index === "number" && m.index >= 0) {
    return t.slice(0, m.index).trim();
  }
  const forbiddenWord = /(\bПрактика\b|\bЗавдання\b)/i;
  const idx = t.search(forbiddenWord);
  if (idx >= 0) return t.slice(0, idx).trim();
  return t;
}
function stripPracticeHeader(rawPractice: string): string {
  const s = normalizeMarkdownText(rawPractice).trim();
  if (!s) return "";
  return s.replace(/^###\s*(Практика|Practice)\b\s*/i, "").replace(/^###\s*(Практичне\s+завдання|Practical\s+task)\b\s*/i, "").trim();
}

function sanitizeGeneratedTestText(raw: unknown, kind: "input" | "output"): string {
  let s = normalizeMarkdownText(String(raw ?? ""));
  if (!s) return "";

  // Remove markdown fences if model wrapped values as code blocks.
  s = s.replace(/^```[a-zA-Z0-9_-]*\s*/g, "").replace(/```$/g, "").trim();

  // Remove common field prefixes that occasionally leak from model formatting.
  if (kind === "input") {
    s = s.replace(/^\s*(input|stdin|вхід|вхідні\s+дані)\s*[:：]\s*/i, "").trim();
  } else {
    s = s.replace(/^\s*(output|stdout|expected(?:\s+output)?|вихід|вихідні\s+дані|очікуван(?:ий|а)\s+вивід)\s*[:：]\s*/i, "").trim();
  }

  return s;
}

function looksLikeJudgeSuccessText(text: string): boolean {
  const s = String(text ?? "").trim().toLowerCase();
  if (!s) return false;
  if (/програма\s+скомпілювал/i.test(s) && /виконал/i.test(s) && /без\s+помил/i.test(s)) return true;
  if (/(compiled|build)\s+(successfully|ok)/i.test(s) && /(executed|ran|run)/i.test(s)) return true;
  if (/program\s+(?:has\s+)?(?:compiled|executed|ran)\s+(?:successfully|without\s+errors)/i.test(s)) return true;
  return false;
}

function sanitizeGeneratedTestExample(params: {
  input: unknown;
  output: unknown;
  ioType: TaskIoType;
}): { input: string; output: string } | null {
  const input = sanitizeGeneratedTestText(params.input, "input");
  let output = sanitizeGeneratedTestText(params.output, "output");

  if (looksLikeJudgeSuccessText(output)) return null;

  if (params.ioType === "NO_INPUT_FREE_OUTPUT") {
    return { input: "", output: "(any non-empty output)" };
  }

  if (!output.trim()) return null;

  if (params.ioType === "STDIN_STDOUT") {
    if (!input.trim()) return null;
    return { input, output };
  }

  // NO_INPUT_FIXED_OUTPUT
  return { input: "", output };
}

function normalizeTestInputKey(input: string, ioType: TaskIoType): string {
  if (ioType === "NO_INPUT_FIXED_OUTPUT" || ioType === "NO_INPUT_FREE_OUTPUT") return "__NO_INPUT__";
  return String(input ?? "").replace(/\r\n/g, "\n").trim();
}

function mergeConsistentExamples(params: {
  base: Array<{ input: string; output: string }>;
  candidates: Array<{ input: string; output: string }>;
  ioType: TaskIoType;
  maxCount: number;
  fixedNoInputExpected?: string | null;
}): { merged: Array<{ input: string; output: string }>; droppedConflicts: number } {
  const out: Array<{ input: string; output: string }> = [];
  const expectedByInput = new Map<string, string>();
  let droppedConflicts = 0;

  const pushIfConsistent = (ex: { input: string; output: string }): void => {
    if (out.length >= params.maxCount) return;
    const key = normalizeTestInputKey(ex.input, params.ioType);
    const normalizedOutput = String(ex.output ?? "").trim();
    if (!normalizedOutput) return;

    // Strong rule for deterministic no-input tasks: expected output must be exact.
    if (params.ioType === "NO_INPUT_FIXED_OUTPUT" && params.fixedNoInputExpected && normalizedOutput !== params.fixedNoInputExpected.trim()) {
      droppedConflicts += 1;
      return;
    }

    const known = expectedByInput.get(key);
    if (known && known !== normalizedOutput) {
      droppedConflicts += 1;
      return;
    }
    if (!known) expectedByInput.set(key, normalizedOutput);

    // Keep only one example per normalized input key.
    if (out.some(item => normalizeTestInputKey(item.input, params.ioType) === key)) return;
    out.push({ input: ex.input, output: normalizedOutput });
  };

  for (const ex of params.base) pushIfConsistent(ex);
  for (const ex of params.candidates) pushIfConsistent(ex);

  return { merged: out, droppedConflicts };
}

function composeTaskStatementMarkdown(params: {
  practicalTask: string;
  inputFormat?: string | null;
  outputFormat?: string | null;
  constraints?: string | null;
  uiLanguage?: UiLanguage;
}): string {
  const practical = normalizeMarkdownText(String(params.practicalTask ?? "")).trim();
  const inputFormat = normalizeMarkdownText(String(params.inputFormat ?? "")).trim();
  const outputFormat = normalizeMarkdownText(String(params.outputFormat ?? "")).trim();
  const constraints = normalizeMarkdownText(String(params.constraints ?? "")).trim();
  const uiLanguage = params.uiLanguage ?? "uk";

  const sections: string[] = [];
  if (practical) sections.push(practical);

  // Always include formats so students see the same contract that tests use.
  sections.push(i18nText(uiLanguage, "#### Формат вхідних даних", "#### Input format"));
  sections.push(inputFormat || i18nText(uiLanguage, "Вхідних даних немає. (stdin порожній)", "No input data. (stdin is empty)"));

  sections.push(i18nText(uiLanguage, "#### Формат вихідних даних", "#### Output format"));
  sections.push(outputFormat || i18nText(uiLanguage, "Виведіть результат згідно умови.", "Output the result according to the statement."));

  if (constraints) {
    sections.push(i18nText(uiLanguage, "#### Обмеження", "#### Constraints"));
    sections.push(constraints);
  }

  return sections.join("\n\n").trim();
}

function pickNoInputFixedExpectedOutput(params: {
  examples?: Array<{ input?: unknown; output?: unknown }>;
  outputFormat?: unknown;
}): string | null {
  const examples = Array.isArray(params.examples) ? params.examples : [];
  const first = examples.length ? examples[0] : null;
  const fromExample = first && typeof (first as any).output === "string" ? String((first as any).output).trim() : "";
  if (fromExample) return fromExample;
  const fromOutputFormat = typeof params.outputFormat === "string" ? String(params.outputFormat).trim() : "";
  if (fromOutputFormat) return fromOutputFormat;
  return null;
}
function getTopicTheoryMarkdown(task: Task, uiLanguage: UiLanguage = "uk"): string {
  const fromBlock = (task.topic as any)?.theoryBlock?.content;
  const theory = stripPracticeLikeSectionsFromTheory(String(fromBlock ?? ""));
  if (theory) return theory;
  const legacy = stripPracticeLikeSectionsFromTheory(String((task.topic as any)?.theoryMarkdown ?? ""));
  if (legacy) return legacy;
  return i18nText(
    uiLanguage,
    "## Теорія\n\n_Теорія для цієї теми ще не додана. Повідом викладачу або відкрий довідку._",
    "## Theory\n\n_Theory for this topic has not been added yet. Please ask your teacher or open the docs._"
  );
}

type TopicTheorySource = "topic.theoryBlock" | "topic.theoryMarkdown" | "fallback";
function getTopicTheoryInfo(task: Task, opts?: {
  uiLanguage?: UiLanguage;
  localizedTheoryEnByBlockId?: Map<number, string>;
  localizedLegacyTheoryEnByTopicId?: Map<number, string>;
}): {
  markdown: string;
  source: TopicTheorySource;
  theoryBlockId: number | null;
  theoryBlockUpdatedAt: string | null;
  blockLength: number;
  legacyLength: number;
} {
  const uiLanguage = opts?.uiLanguage ?? "uk";
  const block = (task.topic as any)?.theoryBlock;
  const blockId = typeof block?.id === "number" ? block.id : null;
  const blockRaw = uiLanguage === "en" && blockId && opts?.localizedTheoryEnByBlockId?.has(blockId)
    ? String(opts.localizedTheoryEnByBlockId.get(blockId) ?? "")
    : String(block?.content ?? "");
  const blockContent = stripPracticeLikeSectionsFromTheory(blockRaw);
  if (blockContent) {
    return {
      markdown: blockContent,
      source: "topic.theoryBlock",
      theoryBlockId: blockId,
      theoryBlockUpdatedAt: block?.updatedAt ? new Date(block.updatedAt).toISOString() : null,
      blockLength: blockContent.length,
      legacyLength: stripPracticeLikeSectionsFromTheory(String((task.topic as any)?.theoryMarkdown ?? "")).length
    };
  }

  const topicId = Number((task.topic as any)?.id);
  const legacyRaw = uiLanguage === "en" && Number.isFinite(topicId) && opts?.localizedLegacyTheoryEnByTopicId?.has(topicId)
    ? String(opts.localizedLegacyTheoryEnByTopicId.get(topicId) ?? "")
    : String((task.topic as any)?.theoryMarkdown ?? "");
  const legacyContent = stripPracticeLikeSectionsFromTheory(legacyRaw);
  if (legacyContent) {
    return {
      markdown: legacyContent,
      source: "topic.theoryMarkdown",
      theoryBlockId: blockId,
      theoryBlockUpdatedAt: block?.updatedAt ? new Date(block.updatedAt).toISOString() : null,
      blockLength: stripPracticeLikeSectionsFromTheory(String(block?.content ?? "")).length,
      legacyLength: legacyContent.length
    };
  }

  const fallback = i18nText(
    uiLanguage,
    "## Теорія\n\n_Теорія для цієї теми ще не додана. Повідом викладачу або відкрий довідку._",
    "## Theory\n\n_Theory for this topic has not been added yet. Please ask your teacher or open the docs._"
  );
  return {
    markdown: fallback,
    source: "fallback",
    theoryBlockId: blockId,
    theoryBlockUpdatedAt: block?.updatedAt ? new Date(block.updatedAt).toISOString() : null,
    blockLength: stripPracticeLikeSectionsFromTheory(String(block?.content ?? "")).length,
    legacyLength: stripPracticeLikeSectionsFromTheory(String((task.topic as any)?.theoryMarkdown ?? "")).length
  };
}
function computeTaskStatus(task: Task, hasGrade: boolean): TaskStatus {
  if (hasGrade || !!task.completed) return "GRADED";
  if (task.finalCode) return "SUBMITTED";
  return "OPEN";
}

function shouldIncludeTheoryInStatement(task: Task): boolean {
  // Show topic theory only once per topic (on the first task in the topic).
  // numInTopic is 1-based.
  const n = typeof task.numInTopic === "number" && Number.isFinite(task.numInTopic) ? task.numInTopic : 1;
  // For non-topic tasks (e.g., control) keep existing behavior conservative: include theory only when topic exists and it's the first in topic.
  return !!task.topic && n === 1;
}

function theoryLooksLikeInputIsTaught(theory: string, lang: "JAVA" | "PYTHON" | "CPP"): boolean {
  const t = String(theory ?? "");
  if (!t.trim()) return false;
  // Detect when stdin/input has been introduced in the curriculum.
  // We intentionally look for explicit API mentions to avoid false positives.
  if (lang === "PYTHON") {
    return /\binput\s*\(/i.test(t) || /\bsys\.stdin\b/i.test(t) || /\breadline\s*\(/i.test(t);
  }
  if (lang === "CPP") {
    return /\bstd::cin\b/i.test(t) || /\bcin\s*>>/i.test(t) || /\bgetline\s*\(/i.test(t);
  }
  // JAVA
  return /\bSystem\.in\b/.test(t) || /\bScanner\s*\(/.test(t) || /\bBufferedReader\b/.test(t) || /\bInputStreamReader\b/.test(t);
}

function titleLooksLikeInputIsTaught(title: string, lang: "JAVA" | "PYTHON" | "CPP"): boolean {
  const s = String(title ?? "").toLowerCase();
  if (!s.trim()) return false;
  // Titles are much shorter than theory; keep the checks simple and forgiving.
  if (lang === "PYTHON") return s.includes("input") || s.includes("ввід") || s.includes("вход");
  if (lang === "CPP") return s.includes("cin") || s.includes("getline") || s.includes("ввід") || s.includes("вивід") || s.includes("вход") || s.includes("вывод");
  return s.includes("scanner") || s.includes("system.in") || s.includes("bufferedreader") || s.includes("ввід") || s.includes("вход");
}

function isStdinAllowedForTopic(params: { allTopics: Topic[]; lang: "JAVA" | "PYTHON" | "CPP"; topicIndex: number }): boolean {
  for (const t of params.allTopics) {
    if (t.topicIndex > params.topicIndex) break;
    const theory = String((t as any)?.theoryBlock?.content ?? (t as any)?.theoryMarkdown ?? "");
    if (theoryLooksLikeInputIsTaught(theory, params.lang)) return true;
    // When we only fetched topic metadata (no theory) we still want stdin policy to work.
    if (titleLooksLikeInputIsTaught(String((t as any)?.title ?? ""), params.lang)) return true;
  }
  return false;
}

function envFlag(name: string, fallback = false): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) ? Math.floor(raw) : fallback;
}

const FORCE_STDIN_AFTER_INPUT = envFlag('TASKS_FORCE_STDIN_AFTER_INPUT', false);
const FORCE_STDIN_FROM_TOPIC_INDEX = envInt('TASKS_FORCE_STDIN_FROM_TOPIC_INDEX', 0);
const STRICT_TEST_CONSISTENCY = envFlag('TASKS_STRICT_TEST_CONSISTENCY', true);
const TEST_CONSISTENCY_RETRY_ATTEMPTS = Math.max(0, envInt('TASKS_TEST_CONSISTENCY_RETRY_ATTEMPTS', 1));

function chooseGenerationAllowedIoTypes(params: {
  stdinAllowed: boolean;
  numInTopic: number;
  topicIndex: number;
}): Array<"STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT"> | undefined {
  if (!params.stdinAllowed) {
    return ["NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"];
  }

  const strictStdin = FORCE_STDIN_AFTER_INPUT && params.topicIndex >= FORCE_STDIN_FROM_TOPIC_INDEX;
  if (strictStdin) {
    return ["STDIN_STDOUT"];
  }

  // Default behavior: once input is learned, prefer stdin tasks frequently (roughly 2 of each 3 tasks).
  const shouldPreferStdinTask = params.numInTopic % 3 !== 1;
  return shouldPreferStdinTask ? ["STDIN_STDOUT"] : undefined;
}

function sanitizeMetaOutputFormatInStatement(
  statementMarkdown: string,
  ioType: TaskIoType | null | undefined,
  uiLanguage: UiLanguage = "uk"
): string {
  const s = String(statementMarkdown ?? "");
  if (!s) return s;
  const re = /(Програма\s+скомпілювал[а-яіїє]*\s+та\s+виконал[а-яіїє]*\s+без\s+помилок\.)|(Program\s+compiled\s+and\s+ran\s+without\s+errors\.?)/gi;
  if (!re.test(s)) return s;

  const replacement = (() => {
    if (ioType === "NO_INPUT_FREE_OUTPUT") {
      return i18nText(
        uiLanguage,
        "Виведіть будь-який непорожній рядок (без підказок типу \"Відповідь:\").",
        "Print any non-empty line (without helper phrases like \"Answer:\")."
      );
    }
    if (ioType === "NO_INPUT_FIXED_OUTPUT") {
      return i18nText(
        uiLanguage,
        "Виведіть точний результат згідно умови (stdout має збігатися символ у символ).",
        "Print the exact result according to the statement (stdout must match character by character)."
      );
    }
    return i18nText(
      uiLanguage,
      "Виведіть результат згідно умови (без додаткових пояснювальних фраз у виводі).",
      "Print the result according to the statement (without extra explanatory phrases in output)."
    );
  })();

  // Replace only the meta message itself; keep the rest of the statement intact.
  return s.replace(re, replacement);
}

function mapTaskToDto(task: Task, gradeTaskIds?: Set<number>, opts?: {
  includeTheoryDebug?: boolean;
  uiLanguage?: UiLanguage;
  localizedTheoryEnByBlockId?: Map<number, string>;
  localizedLegacyTheoryEnByTopicId?: Map<number, string>;
}) {
  const uiLanguage = opts?.uiLanguage ?? "uk";
  const hasGrade = gradeTaskIds ? gradeTaskIds.has(task.id) : !!task.completed;
  const status: TaskStatus = computeTaskStatus(task, hasGrade);
  const rawPractice = sanitizeMetaOutputFormatInStatement(
    (task.descriptionMarkdown || task.description || "").toString(),
    (task as any).ioType,
    uiLanguage
  );
  const isControlStandalone = task.type === "CONTROL" && !task.topic;

  const includeTheory = isControlStandalone ? false : shouldIncludeTheoryInStatement(task);
  const theoryInfo = includeTheory
    ? getTopicTheoryInfo(task, {
        uiLanguage,
        localizedTheoryEnByBlockId: opts?.localizedTheoryEnByBlockId,
        localizedLegacyTheoryEnByTopicId: opts?.localizedLegacyTheoryEnByTopicId
      })
    : null;
  const theoryMarkdown = includeTheory ? (theoryInfo?.markdown || "") : "";
  const practiceText = isControlStandalone ? normalizeMarkdownText(rawPractice).trim() : stripPracticeHeader(rawPractice);
  const practiceHeader = i18nText(uiLanguage, "### Практика", "### Practice");
  const controlPlaceholder = i18nText(uiLanguage, "_Контрольне завдання ще не додано._", "_Control task has not been added yet._");
  const practicePlaceholder = i18nText(uiLanguage, "_Практичне завдання ще не додано._", "_Practical task has not been added yet._");
  const normalizedDescription = isControlStandalone
    ? (practiceText || controlPlaceholder)
    : (includeTheory
        ? `${theoryMarkdown}\n\n${practiceHeader}\n\n${practiceText || practicePlaceholder}`.trim()
        : `${practiceHeader}\n\n${practiceText || practicePlaceholder}`.trim());

  const topicId = typeof (task.topic as any)?.id === "number" ? (task.topic as any).id : null;
  const topicTitle = typeof (task.topic as any)?.title === "string" ? (task.topic as any).title : null;

  const starterDecoded = decodeMultiFileSubmissionV1(task.template);
  const starterFiles = starterDecoded?.files ?? null;
  const starterEntry = starterDecoded?.entry ?? null;
  const starterCode = starterDecoded ? pickEntryContent(starterDecoded) : task.template;
  const taskMode = String((task as any).taskMode ?? "CODE") === "WEB" ? "WEB" : "CODE";
  const normalizedWebTemplate = taskMode === "WEB"
    ? normalizeWebTaskTemplate((task as any).template)
    : null;

  const codeRaw = status === "GRADED" ? task.finalCode || "" : task.draftCode || "";
  const userDecoded = decodeMultiFileSubmissionV1(codeRaw);
  const userFiles = userDecoded?.files ?? null;
  const userEntry = userDecoded?.entry ?? null;
  const userCode = userDecoded ? pickEntryContent(userDecoded) : codeRaw;

  return {
    id: task.id,
    title: task.title,
    subtitle: task.subtitle || undefined,
    topicId,
    topicTitle,
    descriptionMarkdown: normalizedDescription,
    theoryMarkdown: theoryMarkdown || undefined,
    ...(opts?.includeTheoryDebug
      ? {
          theoryDebug: {
            included: includeTheory,
            topicId,
            topicTitle,
            source: theoryInfo?.source ?? null,
            theoryBlockId: theoryInfo?.theoryBlockId ?? null,
            theoryBlockUpdatedAt: theoryInfo?.theoryBlockUpdatedAt ?? null,
            blockLength: theoryInfo?.blockLength ?? 0,
            legacyLength: theoryInfo?.legacyLength ?? 0,
            serverTime: new Date().toISOString()
          }
        }
      : {}),
    practiceText,
    taskMode,
    webTemplateFiles: taskMode === "WEB" ? normalizedWebTemplate?.files ?? normalizeWebTaskFiles((task as any).webTemplateFiles ?? []) : undefined,
    webValidationRules: taskMode === "WEB" ? normalizeWebRules((task as any).webValidationRules ?? normalizedWebTemplate?.rules ?? []) : undefined,
    starterCode,
    starterFiles: starterFiles ?? undefined,
    starterEntryFile: starterEntry ?? undefined,
    userCode,
    userFiles: userFiles ?? undefined,
    userEntryFile: userEntry ?? undefined,
    finalCode: task.finalCode || null,
    status,
    lessonInTopic: task.numInTopic ?? 1,
    repeatAttempt: 0,
    kind: task.type,
    createdAt: task.createdAt,
    language: task.lang
  };
}

async function generateAndPersistPersonalProgrammingTask(params: {
  requestStartedAt: number;
  requestBudgetMs: number;
  requestId?: string;
  userLanguage: "uk" | "en";
  userId: number;
  lang: "JAVA" | "PYTHON" | "CPP";
  difus: number;
  type: TaskType;
  topic: Topic | null;
  topicIndex: number;
  numInTopic: number;
  requiredTasksInThisGroup: number;
  // Prompt context
  topicTitleForAi: string;
  theoryForAi: string;
  prevTopicsText?: string;
  subtitle?: string;
  // Uniqueness context
  existingTasksForContext: Array<{ id: number; title?: string | null; description?: string | null; numInTopic?: number | null }>;
  allTopics: Topic[];
  stdinPolicyTopicIndex: number;
}): Promise<Task> {
  const stdinAllowed = isStdinAllowedForTopic({
    allTopics: params.allTopics,
    lang: params.lang,
    topicIndex: params.stdinPolicyTopicIndex
  });
  const generationAllowedIoTypes = chooseGenerationAllowedIoTypes({
    stdinAllowed,
    numInTopic: params.numInTopic,
    topicIndex: params.stdinPolicyTopicIndex
  });

  const previousTasksBrief = params.existingTasksForContext
    .map(t => {
      const practice = stripPracticeHeader(String((t as any).description || "")).replace(/\s+/g, " ").trim();
      const short = practice.length > 240 ? practice.slice(0, 240) + "…" : practice;
      return `- ${String((t as any).title || "(без назви)").trim()}: ${short}`;
    })
    .filter(Boolean)
    .join("\n");

  const previousTaskPracticesForUniq = params.existingTasksForContext
    .map(t => stripPracticeHeader(String((t as any).description || "")).trim())
    .filter(s => s.length > 0)
    .slice(0, 8);
  const previousTaskTitlesForUniq = params.existingTasksForContext
    .map(t => String((t as any).title || "").trim())
    .filter(Boolean)
    .slice(0, 12);

  const remainingBeforeTask = params.requestBudgetMs - (Date.now() - params.requestStartedAt);
  const disableDeadlines = String(process.env.TASKS_GENERATE_DISABLE_DEADLINE || '').trim() === '1';
  // Allow increasing task-generation budget when proxy timeout is higher.
  // Default: ~75% of the total request budget, capped to a reasonable ceiling.
  const TASK_BUDGET_CAP_MS = (() => {
    const raw = Number(process.env.TASKS_GENERATE_TASK_BUDGET_MS);
    const fallback = Math.floor(params.requestBudgetMs * 0.75);
    const v = Number.isFinite(raw) ? raw : fallback;
    // Guard against accidental under-budgeting (e.g., 10-15s) which causes frequent deadline aborts.
    // We still respect the remaining request budget below.
    return Math.max(25_000, Math.min(50_000, Math.floor(v)));
  })();
  const taskBudgetMs = Math.max(10_000, Math.min(TASK_BUDGET_CAP_MS, remainingBeforeTask - 6_000));

  const aiTaskResult = await safeAICall('generateTask', {
    topicTitle: params.topicTitleForAi,
    theory: String(params.theoryForAi || i18nText(params.userLanguage, "Контрольна робота. Теорії не потрібно.", "Control work. No theory is required.")).trim()
      || i18nText(params.userLanguage, "Контрольна робота.", "Control work."),
    lang: params.lang,
    topicIndex: params.topicIndex,
    numInTopic: params.numInTopic,
    isFirstTask: params.numInTopic === 1,
    difus: params.difus,
    userId: params.userId,
    topicId: params.topic?.id,
    semanticRetries: 1,
    allowedIoTypes: generationAllowedIoTypes,
    previousTasks: previousTasksBrief,
    previousTaskPractices: previousTaskPracticesForUniq,
    previousTaskTitles: previousTaskTitlesForUniq,
    ...(params.prevTopicsText ? { prevTopics: params.prevTopicsText, isControl: params.type === "CONTROL" } : {})
  } as any, {
    language: params.userLanguage,
    requestId: params.requestId,
    maxAttempts: 2,
    ...(disableDeadlines ? {} : { totalTimeoutMs: taskBudgetMs })
  });
  if (!aiTaskResult.success) {
    // Let caller translate to HTTP.
    throw aiTaskResult.error;
  }
  const aiTask = aiTaskResult.data;
  const practicalOnly = String((aiTask as any).practicalTask ?? "").trim();
  // Use a single, stable template per language (AI templates often drift and can break expectations).
  const template = (() => {
    if (params.lang === "PYTHON") {
      return [
        "def main():",
        "    # TODO: implement the solution according to the statement",
        "    pass",
        "",
        "if __name__ == \"__main__\":",
        "    main()"
      ].join("\n");
    }
    if (params.lang === "CPP") {
      return [
        "#include <bits/stdc++.h>",
        "using namespace std;",
        "",
        "int main() {",
        "    ios::sync_with_stdio(false);",
        "    cin.tie(nullptr);",
        "",
        "    // TODO: implement the solution according to the statement",
        "",
        "    return 0;",
        "}"
      ].join("\n");
    }
    return [
      "public class Main {",
      "  public static void main(String[] args) {",
      "    // TODO: implement the solution according to the statement",
      "  }",
      "}"
    ].join("\n");
  })();

  const knownIoTypes = new Set(["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"] as const);
  const aiIoRaw = typeof (aiTask as any)?.ioType === "string" ? String((aiTask as any).ioType).trim() : "";
  const inferredNeedsInput = inferNeedsInput({
    taskDescription: practicalOnly,
    aiInputFormat: (aiTask as any)?.inputFormat
  });
  const deterministicNoInput = (params.lang === "PYTHON" && params.topic && isIntroPythonFixedSumTask(practicalOnly, params.topic.title)) || computeDeterministicNoInputExpectedOutput(practicalOnly) !== null;
  const inferred = (knownIoTypes.has(aiIoRaw as any)
    ? (aiIoRaw as any)
    : (inferredNeedsInput
        ? "STDIN_STDOUT"
        : (deterministicNoInput ? "NO_INPUT_FIXED_OUTPUT" : "NO_INPUT_FREE_OUTPUT"))) as TaskIoType;

  const ioType: TaskIoType = (!stdinAllowed && inferred === "STDIN_STDOUT")
    ? (deterministicNoInput ? "NO_INPUT_FIXED_OUTPUT" : "NO_INPUT_FREE_OUTPUT")
    : inferred;

  const fixedNoInputExpected = ioType === "NO_INPUT_FIXED_OUTPUT" ? pickNoInputFixedExpectedOutput({
    examples: Array.isArray((aiTask as any)?.examples) ? (aiTask as any).examples : [],
    outputFormat: (aiTask as any)?.outputFormat
  }) : null;

  const statementMarkdown = composeTaskStatementMarkdown({
    practicalTask: practicalOnly,
    inputFormat: ioType === "STDIN_STDOUT"
      ? (aiTask as any)?.inputFormat
      : i18nText(params.userLanguage, "Вхідних даних немає.", "No input data."),
    outputFormat: ioType === "NO_INPUT_FIXED_OUTPUT" ? (fixedNoInputExpected || (aiTask as any)?.outputFormat) : (aiTask as any)?.outputFormat,
    constraints: (aiTask as any)?.constraints,
    uiLanguage: params.userLanguage
  });

  const aiTitleRaw = typeof (aiTask as any)?.title === "string" ? String((aiTask as any).title).trim() : "";
  const baseTitle = aiTitleRaw || (params.type === "CONTROL"
    ? i18nText(params.userLanguage, "Контрольна практика", "Control practice")
    : i18nText(params.userLanguage, `Практика: ${params.topicTitleForAi}`, `Practice: ${params.topicTitleForAi}`));
  const titlePrefix = params.requiredTasksInThisGroup > 1 ? `(${params.numInTopic}/${params.requiredTasksInThisGroup}) ` : "";
  const uniqueTitle = `${titlePrefix}${baseTitle}`.trim();

  const task = taskRepo().create({
    user: { id: params.userId } as any,
    topic: params.topic ? ({ id: params.topic.id } as any) : null,
    title: uniqueTitle,
    subtitle: typeof params.subtitle === "string" ? params.subtitle : "",
    description: statementMarkdown,
    descriptionMarkdown: statementMarkdown,
    template,
    draftCode: "",
    finalCode: "",
    completed: 0,
    lang: params.lang,
    difus: params.difus,
    numInTopic: params.numInTopic,
    topicIndex: params.topicIndex,
    type: params.type,
    ioType
  });
  const saved = await taskRepo().save(task);

  const needsInput = ioType === "STDIN_STDOUT";
  const REQUIRED_TEST_COUNT = needsInput ? 12 : 1;
  let testExamples: Array<{ input: string; output: string }> = [];

  if (ioType === "NO_INPUT_FREE_OUTPUT") {
    testExamples = [{ input: "", output: "(any non-empty output)" }];
  }
  if (testExamples.length === 0 && ioType === "NO_INPUT_FIXED_OUTPUT") {
    if (fixedNoInputExpected && fixedNoInputExpected.trim().length > 0) {
      testExamples = [{ input: "", output: fixedNoInputExpected.trim() }];
    }
  }
  const deterministicIntro = params.lang === "PYTHON" && params.topic && isIntroPythonFixedSumTask(practicalOnly, params.topic.title);
  if (testExamples.length === 0 && deterministicIntro) {
    testExamples = [{ input: "", output: "8" }];
  } else {
    const expected = computeDeterministicNoInputExpectedOutput(practicalOnly);
    if (testExamples.length === 0 && expected !== null) testExamples = [{ input: "", output: expected }];
  }

    const aiExamples = Array.isArray((aiTask as any)?.examples)
      ? (aiTask as any).examples
          .map((ex: any) => sanitizeGeneratedTestExample({
            input: ex?.input,
            output: ex?.output,
            ioType
          }))
          .filter((ex: { input: string; output: string } | null): ex is { input: string; output: string } => !!ex)
      : [];

  if (testExamples.length === 0 && aiExamples.length > 0) {
    testExamples = aiExamples.slice(0, Math.max(1, Math.min(REQUIRED_TEST_COUNT, aiExamples.length)));
  }

  if (testExamples.length < REQUIRED_TEST_COUNT) {
    const remainingBeforeTests = params.requestBudgetMs - (Date.now() - params.requestStartedAt);
    const testsBudgetMs = Math.max(4_000, Math.min(10_000, remainingBeforeTests - 1500));
    const remainingCount = REQUIRED_TEST_COUNT - testExamples.length;

    // Same protection as /tasks/generate: if we're near the nginx timeout, do not start test generation.
    // Use task examples instead so we can return a task quickly.
    const SHOULD_SKIP_TESTDATA_MS = 6_000;
    if (remainingBeforeTests < SHOULD_SKIP_TESTDATA_MS) {
      if (aiExamples.length === 0 && testExamples.length === 0) {
        await taskRepo().remove(saved);
        throw {
          statusCode: 504,
          message: "AI_GENERATION_FAILED: Not enough time budget remaining to generate tests",
          error: "REQUEST_DEADLINE_EXCEEDED",
          details: {
            remainingBeforeTests,
            lang: params.lang,
            mode: "generateTestData"
          }
        };
      }

      logger.warn("[tasks] skipping generateTestData (control) due to low remaining request budget", {
        requestId: params.requestId,
        userId: params.userId,
        lang: params.lang,
        remainingBeforeTests
      });

      const mergedFallback = mergeConsistentExamples({
        base: testExamples,
        candidates: aiExamples,
        ioType,
        maxCount: REQUIRED_TEST_COUNT,
        fixedNoInputExpected
      });
      testExamples = mergedFallback.merged.length ? mergedFallback.merged : aiExamples.slice(0, 1);
      if (mergedFallback.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
        await taskRepo().remove(saved);
        throw {
          statusCode: 400,
          message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
          error: "INCONSISTENT_TEST_DATA",
          details: {
            mode: "generateTestData",
            droppedConflicts: mergedFallback.droppedConflicts,
            ioType,
            lang: params.lang
          }
        };
      }
    } else {

    for (let consistencyAttempt = 0; consistencyAttempt <= TEST_CONSISTENCY_RETRY_ATTEMPTS; consistencyAttempt++) {
      const testDataResult = await safeAICall('generateTestData', {
        taskDescription: statementMarkdown || practicalOnly,
        taskTitle: params.topicTitleForAi,
        lang: params.lang,
        count: remainingCount,
        userId: params.userId
      }, {
        expectedCount: remainingCount,
        language: params.userLanguage,
        requestId: params.requestId,
        maxAttempts: 1,
        ...(disableDeadlines ? {} : { totalTimeoutMs: testsBudgetMs })
      });
      if (!testDataResult.success) {
        const status = Number(testDataResult.error?.statusCode ?? 0);
        const canFallback = status === 429 || status === 503 || status === 504;
        if (!canFallback) {
          await taskRepo().remove(saved);
          throw testDataResult.error;
        }
        if (aiExamples.length === 0) {
          await taskRepo().remove(saved);
          throw testDataResult.error;
        }
        logger.warn("[tasks] generateTestData rate-limited; using task examples as fallback tests", {
          requestId: params.requestId,
          userId: params.userId,
          lang: params.lang,
          status
        });

        const mergedFallback = mergeConsistentExamples({
          base: testExamples,
          candidates: aiExamples,
          ioType,
          maxCount: REQUIRED_TEST_COUNT,
          fixedNoInputExpected
        });
        if (mergedFallback.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
          await taskRepo().remove(saved);
          throw {
            statusCode: 400,
            message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
            error: "INCONSISTENT_TEST_DATA",
            details: {
              mode: "generateTestData",
              droppedConflicts: mergedFallback.droppedConflicts,
              ioType,
              lang: params.lang
            }
          };
        }

        testExamples = mergedFallback.merged.length
          ? mergedFallback.merged
          : aiExamples.slice(0, Math.max(1, Math.min(REQUIRED_TEST_COUNT, aiExamples.length)));
        break;
      }

      const additional = (testDataResult.data || [])
        .map((ex: any) => sanitizeGeneratedTestExample({
          input: ex?.input,
          output: ex?.output,
          ioType
        }))
        .filter((ex: { input: string; output: string } | null): ex is { input: string; output: string } => !!ex);
      const mergedResult = mergeConsistentExamples({
        base: testExamples,
        candidates: additional,
        ioType,
        maxCount: REQUIRED_TEST_COUNT,
        fixedNoInputExpected
      });
      if (mergedResult.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
        if (consistencyAttempt < TEST_CONSISTENCY_RETRY_ATTEMPTS) {
          logger.warn("[tasks] inconsistent generated tests detected, retrying generateTestData", {
            requestId: params.requestId,
            userId: params.userId,
            lang: params.lang,
            ioType,
            droppedConflicts: mergedResult.droppedConflicts,
            consistencyAttempt: consistencyAttempt + 1,
            maxConsistencyAttempts: TEST_CONSISTENCY_RETRY_ATTEMPTS + 1
          });
          continue;
        }
        await taskRepo().remove(saved);
        throw {
          statusCode: 400,
          message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
          error: "INCONSISTENT_TEST_DATA",
          details: {
            mode: "generateTestData",
            droppedConflicts: mergedResult.droppedConflicts,
            ioType,
            lang: params.lang
          }
        };
      }

      testExamples = mergedResult.merged;
      if (mergedResult.droppedConflicts > 0) {
        logger.warn("[tasks] dropped inconsistent generated tests", {
          requestId: params.requestId,
          userId: params.userId,
          topicId: params.topic?.id ?? null,
          droppedConflicts: mergedResult.droppedConflicts,
          ioType
        });
      }
      break;
    }
    }
  }

  const pointsByIndex: number[] = (() => {
    const n = Math.max(1, testExamples.length);
    const totalPoints = 100;
    if (n === 1) return [totalPoints];
    const base = Math.floor(totalPoints / n);
    const rem = totalPoints % n;
    const arr = new Array(n).fill(base);
    for (let i = 0; i < rem; i++) arr[i] = arr[i] + 1;
    return arr;
  })();

  const newTestData = testExamples.map((ex, idx) => testDataRepo().create({
    input: ex.input || "",
    expectedOutput: ex.output || "",
    points: pointsByIndex[idx] ?? 1,
    personalTask: { id: saved.id } as any
  }));
  await testDataRepo().save(newTestData);
  return saved;
}
tasksRouter.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const debugTheoryRequested = ["1", "true", "yes"].includes(String((req.query as any)?.debugTheory ?? "").toLowerCase());
    const includeTheoryDebug = await (async () => {
      if (!debugTheoryRequested) return false;
      const u = await userRepo().findOne({ where: { id: req.userId } });
      return u?.role === "SYSTEM_ADMIN";
    })();
    const uiLanguage = resolveUiLanguage(req);

    const tasks = await taskRepo().find({
      where: {
        user: {
          id: req.userId
        },
        ...(req.lang && {
          lang: req.lang as "JAVA" | "PYTHON" | "CPP"
        })
      },
      order: {
        createdAt: "DESC"
      },
      relations: ["user", "topic", "topic.theoryBlock"]
    });
    const ids = tasks.map(t => t.id);
    const gradeTaskIds = new Set<number>();
    if (ids.length > 0) {
      const grades = await gradeRepo().find({
        where: {
          user: {
            id: req.userId
          },
          task: {
            id: In(ids)
          }
        },
        relations: ["task"]
      });
      for (const g of grades) {
        const tid = (g as any)?.task?.id;
        if (typeof tid === "number") gradeTaskIds.add(tid);
      }
    }
    const theoryBlockIds = uiLanguage === "en"
      ? Array.from(new Set(tasks.map(t => Number((t.topic as any)?.theoryBlock?.id)).filter((id): id is number => Number.isFinite(id) && id > 0)))
      : [];
    const localizedTheoryEnByBlockId = uiLanguage === "en"
      ? await buildLocalizedTheoryEnByBlockId({ req, theoryBlockIds })
      : new Map<number, string>();
    const localizedLegacyTheoryEnByTopicId = uiLanguage === "en"
      ? await buildLocalizedLegacyTheoryEnByTopicId({ req, topics: tasks.map(t => (t as any)?.topic) })
      : new Map<number, string>();

    if (includeTheoryDebug) res.setHeader("Cache-Control", "no-store");
    return res.json(tasks.map(t => mapTaskToDto(t, gradeTaskIds, {
      includeTheoryDebug,
      uiLanguage,
      localizedTheoryEnByBlockId,
      localizedLegacyTheoryEnByTopicId
    })));
  } catch (error) {
    logger.error("[tasks] GET /tasks error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({
      message: "Invalid id"
    });
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }

    const debugTheoryRequested = ["1", "true", "yes"].includes(String((req.query as any)?.debugTheory ?? "").toLowerCase());
    const includeTheoryDebug = await (async () => {
      if (!debugTheoryRequested) return false;
      const u = await userRepo().findOne({ where: { id: req.userId } });
      return u?.role === "SYSTEM_ADMIN";
    })();
    const uiLanguage = resolveUiLanguage(req);

    const task = await taskRepo().findOne({
      where: {
        id,
        user: {
          id: req.userId
        }
      },
      relations: ["user", "topic", "topic.theoryBlock", "testData"]
    });
    if (!task) return res.status(404).json({
      message: "Task not found"
    });
    const grade = await gradeRepo().findOne({
      where: {
        user: {
          id: req.userId
        },
        task: {
          id: task.id
        }
      }
    });
    const gradeTaskIds = new Set<number>();
    if (grade) gradeTaskIds.add(task.id);
    const theoryBlockId = Number((task as any)?.topic?.theoryBlock?.id);
    const theoryBlockIds = uiLanguage === "en" && Number.isFinite(theoryBlockId) && theoryBlockId > 0 ? [theoryBlockId] : [];
    const localizedTheoryEnByBlockId = uiLanguage === "en"
      ? await buildLocalizedTheoryEnByBlockId({ req, theoryBlockIds })
      : new Map<number, string>();
    const localizedLegacyTheoryEnByTopicId = uiLanguage === "en"
      ? await buildLocalizedLegacyTheoryEnByTopicId({ req, topics: [(task as any)?.topic] })
      : new Map<number, string>();

    if (includeTheoryDebug) res.setHeader("Cache-Control", "no-store");
    return res.json(mapTaskToDto(task, gradeTaskIds, {
      includeTheoryDebug,
      uiLanguage,
      localizedTheoryEnByBlockId,
      localizedLegacyTheoryEnByTopicId
    }));
  } catch {
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});

// Personal control work: quiz task helpers
tasksRouter.get("/:id/quiz", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const uiLanguage = resolveUiLanguage(req);
    const optionLabels = uiLanguage === "en" ? ["A", "B", "C", "D", "E"] : ["А", "Б", "В", "Г", "Д"];

    const task = await taskRepo().findOne({
      where: { id, user: { id: req.userId } },
      select: ["id", "title", "type", "subtitle", "template", "completed"] as any
    });
    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });
    if (!isPersonalControlQuizTask(task)) return res.status(400).json({ message: "TASK_IS_NOT_QUIZ" });

    let quiz: any[];
    try {
      quiz = JSON.parse(String(task.template || ""));
    } catch {
      return res.status(400).json({ message: "INVALID_QUIZ_FORMAT" });
    }
    if (!Array.isArray(quiz) || quiz.length === 0) return res.status(400).json({ message: "INVALID_QUIZ_FORMAT" });

    const questions = quiz.map((q, i) => {
      const rawOptions = Array.isArray((q as any).options)
        ? {
            [optionLabels[0]]: (q as any).options[0] || "",
            [optionLabels[1]]: (q as any).options[1] || "",
            [optionLabels[2]]: (q as any).options[2] || "",
            [optionLabels[3]]: (q as any).options[3] || "",
            [optionLabels[4]]: (q as any).options[4] || ""
          }
        : ((q as any).options || {
            [optionLabels[0]]: "",
            [optionLabels[1]]: "",
            [optionLabels[2]]: "",
            [optionLabels[3]]: "",
            [optionLabels[4]]: ""
          });
      return {
        index: i,
        question: (q as any).question || (q as any).q || "",
        options: rawOptions
      };
    });

    return res.json({
      taskId: task.id,
      title: task.title,
      count: questions.length,
      questions
    });
  } catch (error: any) {
    logger.error("[tasks] GET /:id/quiz error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.post("/:id/submit-quiz", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
    const uiLanguage = resolveUiLanguage(req);
    const optionLabels = uiLanguage === "en" ? ["A", "B", "C", "D", "E"] : ["А", "Б", "В", "Г", "Д"];
    const optionIndexByLabel: Record<string, number> = {
      A: 0,
      B: 1,
      C: 2,
      D: 3,
      E: 4,
      А: 0,
      Б: 1,
      В: 2,
      Г: 3,
      Д: 4
    };
    const normalizeOption = (value: unknown): string => {
      const key = String(value ?? "").toUpperCase().trim();
      const idx = optionIndexByLabel[key];
      return Number.isFinite(idx) ? optionLabels[idx] : key;
    };

    const answers = Array.isArray((req.body as any)?.answers) ? (req.body as any).answers : null;
    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: "ANSWERS_REQUIRED" });
    }

    const task = await taskRepo().findOne({
      where: { id, user: { id: req.userId } },
      select: ["id", "title", "type", "subtitle", "template", "completed", "lang"] as any
    });
    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });
    if (!isPersonalControlQuizTask(task)) return res.status(400).json({ message: "TASK_IS_NOT_QUIZ" });

    const existingGrade = await gradeRepo().findOne({
      where: { user: { id: req.userId }, task: { id: task.id } },
      order: { createdAt: "DESC" }
    });
    if (existingGrade) return res.status(409).json({ message: "QUIZ_ALREADY_SUBMITTED" });

    let quiz: any[];
    try {
      quiz = JSON.parse(String(task.template || ""));
    } catch {
      return res.status(400).json({ message: "INVALID_QUIZ_FORMAT" });
    }
    if (!Array.isArray(quiz) || quiz.length === 0) return res.status(400).json({ message: "INVALID_QUIZ_FORMAT" });

    let correctAnswers = 0;
    const totalQuestions = quiz.length;
    const reviewQuestions: any[] = [];

    const answerAt = (i: number) => (answers as any[])[i];

    for (let i = 0; i < quiz.length; i++) {
      const question = quiz[i];
      const studentAnswer = answerAt(i);
      const correctAnswer = (question as any).correct;

      let normalizedCorrect: string;
      if (typeof correctAnswer === "number") {
        normalizedCorrect = optionLabels[correctAnswer] || optionLabels[0];
      } else {
        normalizedCorrect = normalizeOption(correctAnswer);
      }

      const normalizedStudent = normalizeOption(studentAnswer);
      const isCorrect = normalizedStudent === normalizedCorrect;
      if (isCorrect) correctAnswers++;

      const rawOptions = Array.isArray((question as any).options)
        ? {
            [optionLabels[0]]: (question as any).options[0] || "",
            [optionLabels[1]]: (question as any).options[1] || "",
            [optionLabels[2]]: (question as any).options[2] || "",
            [optionLabels[3]]: (question as any).options[3] || "",
            [optionLabels[4]]: (question as any).options[4] || ""
          }
        : ((question as any).options || {
            [optionLabels[0]]: "",
            [optionLabels[1]]: "",
            [optionLabels[2]]: "",
            [optionLabels[3]]: "",
            [optionLabels[4]]: ""
          });

      reviewQuestions.push({
        index: i,
        question: (question as any).question || (question as any).q || "",
        options: rawOptions,
        correct: normalizedCorrect,
        student: normalizedStudent || null,
        isCorrect
      });
    }

    const quizGrade = clampGrade0to100Int(Math.round(correctAnswers / totalQuestions * 100));

    // Persist submission
    await taskRepo().update({ id: task.id } as any, {
      completed: 1,
      finalCode: JSON.stringify(answers)
    } as any);

    const reviewJson = (() => {
      try {
        return JSON.stringify({
          version: 1,
          correctAnswers,
          totalQuestions,
          questions: reviewQuestions
        });
      } catch {
        return null;
      }
    })();

    const grade = gradeRepo().create({
      user: { id: req.userId } as any,
      task: { id: task.id } as any,
      total: quizGrade,
      workScore: 0,
      optimizationScore: 0,
      integrityScore: 0,
      aiFeedback: i18nText(
        uiLanguage,
        `Тест: правильних відповідей ${correctAnswers}/${totalQuestions}. Оцінка: ${quizGrade}/100.`,
        `Quiz: correct answers ${correctAnswers}/${totalQuestions}. Grade: ${quizGrade}/100.`
      ),
      codeSnapshot: JSON.stringify(answers),
      comparisonFeedback: reviewJson,
      previousGradeId: null
    });
    const savedGrade = await gradeRepo().save(grade);

    await syncPostLearningProgress({
      userId: req.userId,
      lang: task.lang,
      topicIndex: task.topicIndex,
      requestId: req.requestId
    });

    // If this quiz belongs to a control batch, compute current summary.
    const batchPrefix = parsePersonalControlBatchPrefix((task as any).subtitle);
    let summary: any = null;
    if (batchPrefix) {
      const batchTasks = await taskRepo()
        .createQueryBuilder("t")
        .where("t.user_id = :userId", { userId: req.userId })
        .andWhere("t.lang = :lang", { lang: task.lang })
        .andWhere("t.type = :type", { type: "CONTROL" })
        .andWhere("t.subtitle LIKE :pref", { pref: `${batchPrefix}%` })
        .getMany();
      const practice = batchTasks.filter(t => typeof (t as any).subtitle === "string" && String((t as any).subtitle).includes("|PRACTICE|"));

      const practiceGrades: Array<number | null> = [];
      for (const pt of practice) {
        const g = await gradeRepo().findOne({
          where: { user: { id: req.userId }, task: { id: pt.id } },
          order: { createdAt: "DESC" }
        });
        practiceGrades.push(g?.total ?? null);
      }
      // Pad to exact length for formula.
      while (practiceGrades.length < PERSONAL_CONTROL_PRACTICE_COUNT) practiceGrades.push(null);

      const calc = computePersonalControlFinalGrade({ quizGrade, practiceGrades: practiceGrades.slice(0, PERSONAL_CONTROL_PRACTICE_COUNT) });
      summary = {
        quizGrade,
        practiceAvg: calc.practiceAvg,
        practiceAdjusted: calc.practiceAdjusted,
        finalGrade: calc.finalGrade,
        passed: calc.passed,
        passGrade: PERSONAL_CONTROL_PASS_GRADE,
        maxGrade: 100
      };
    }

    return res.json({
      message: "QUIZ_SUBMITTED",
      grade: {
        id: (savedGrade as any).id,
        total: quizGrade,
        correctAnswers,
        totalQuestions
      },
      review: {
        version: 1,
        correctAnswers,
        totalQuestions,
        questions: reviewQuestions
      },
      summary
    });
  } catch (error: any) {
    logger.error("[tasks] POST /:id/submit-quiz error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.get("/:id/control-summary", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "INVALID_ID" });
    if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });

    const task = await taskRepo().findOne({
      where: { id, user: { id: req.userId } },
      select: ["id", "type", "subtitle", "lang"] as any
    });
    if (!task) return res.status(404).json({ message: "TASK_NOT_FOUND" });

    const batchPrefix = parsePersonalControlBatchPrefix((task as any).subtitle);
    if (!batchPrefix) return res.status(400).json({ message: "TASK_IS_NOT_CONTROL_BATCH" });

    const batchTasks = await taskRepo()
      .createQueryBuilder("t")
      .where("t.user_id = :userId", { userId: req.userId })
      .andWhere("t.lang = :lang", { lang: task.lang })
      .andWhere("t.type = :type", { type: "CONTROL" })
      .andWhere("t.subtitle LIKE :pref", { pref: `${batchPrefix}%` })
      .orderBy("t.createdAt", "ASC")
      .getMany();

    const quizTask = batchTasks.find(t => isPersonalControlQuizTask(t));
    const practice = batchTasks.filter(t => typeof (t as any).subtitle === "string" && String((t as any).subtitle).includes("|PRACTICE|"));

    const quizGradeRow = quizTask
      ? await gradeRepo().findOne({ where: { user: { id: req.userId }, task: { id: quizTask.id } }, order: { createdAt: "DESC" } })
      : null;
    const quizGrade = quizGradeRow?.total ?? null;

    const practiceGrades: Array<number | null> = [];
    for (const pt of practice) {
      const g = await gradeRepo().findOne({ where: { user: { id: req.userId }, task: { id: pt.id } }, order: { createdAt: "DESC" } });
      practiceGrades.push(g?.total ?? null);
    }
    while (practiceGrades.length < PERSONAL_CONTROL_PRACTICE_COUNT) practiceGrades.push(null);

    const calc = computePersonalControlFinalGrade({ quizGrade: typeof quizGrade === "number" ? quizGrade : null, practiceGrades: practiceGrades.slice(0, PERSONAL_CONTROL_PRACTICE_COUNT) });

    const isCompleted = typeof calc.finalGrade === "number";
    return res.json({
      batch: batchPrefix,
      quizTaskId: quizTask?.id ?? null,
      practiceTaskIds: practice.map(t => t.id),
      quizGrade,
      practiceGrades: practiceGrades.slice(0, PERSONAL_CONTROL_PRACTICE_COUNT),
      practiceAvg: calc.practiceAvg,
      practiceAdjusted: calc.practiceAdjusted,
      finalGrade: calc.finalGrade,
      passed: calc.passed,
      passGrade: PERSONAL_CONTROL_PASS_GRADE,
      maxGrade: 100,
      completed: isCompleted
    });
  } catch (error: any) {
    logger.error("[tasks] GET /:id/control-summary error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.post("/generate", authMiddleware, async (req: AuthRequest, res: Response) => {
  let throttleKey: string | null = null;
  try {
    const requestStartedAt = Date.now();
    // Total budget for the whole generation flow (quiz/task/tests).
    // Override with TASKS_GENERATE_BUDGET_MS to match your upstream proxy timeout.
    // If your proxy timeout is 60s, set this to something like 45-55s.
    const REQUEST_BUDGET_MS = (() => {
      const raw = Number(process.env.TASKS_GENERATE_BUDGET_MS);
      const v = Number.isFinite(raw) ? raw : 45_000;
      // Keep sane bounds; lower bound prevents too aggressive aborts, upper bound avoids runaway waits.
      return Math.max(15_000, Math.min(120_000, Math.floor(v)));
    })();
    const DISABLE_AI_DEADLINES = String(process.env.TASKS_GENERATE_DISABLE_DEADLINE || '').trim() === '1';
    const userId = req.userId!;
    const rawLang = String(req.lang ?? "").toUpperCase().trim();
    const lang: "JAVA" | "PYTHON" | "CPP" = rawLang === "PYTHON" ? "PYTHON" : rawLang === "CPP" ? "CPP" : "JAVA";
    throttleKey = makeGenerateThrottleKey(userId, lang);

    // Prevent parallel generation for the same user+language.
    if (generateInFlightByUserLang.has(throttleKey)) {
      res.setHeader("Retry-After", "2");
      return res.status(409).json({
        status: "blocked",
        message: "GENERATE_REQUEST_IN_PROGRESS",
        retryAfterMs: 2000
      });
    }

    // Enforce interval between generation requests (default random 5-10s).
    const now = Date.now();
    const notBefore = generateCooldownByUserLang.get(throttleKey) ?? 0;
    if (notBefore > now) {
      const retryAfterMs = Math.max(200, notBefore - now);
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      return res.status(429).json({
        status: "blocked",
        message: "GENERATE_COOLDOWN_ACTIVE",
        retryAfterMs
      });
    }

    generateInFlightByUserLang.add(throttleKey);
    generateCooldownByUserLang.set(
      throttleKey,
      now + randomIntInclusive(GENERATE_COOLDOWN_MIN_MS, GENERATE_COOLDOWN_MAX_MS)
    );

    // Opportunistic cleanup for expired cooldown entries.
    if (generateCooldownByUserLang.size > 1000) {
      for (const [k, ts] of generateCooldownByUserLang.entries()) {
        if (ts <= now) generateCooldownByUserLang.delete(k);
      }
    }

    const userLanguage = resolveUiLanguage(req);
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) return res.status(404).json({
      message: "USER_NOT_FOUND"
    });
    if (user.userMode !== "PERSONAL") {
      return res.status(403).json({
        message: "LEARNING_MODE_ONLY"
      });
    }

    const masteredUntilTopicIndex = (() => {
      const raw = lang === "JAVA"
        ? (user as any).placementMasteredUntilTopicIndexJava
        : lang === "PYTHON"
          ? (user as any).placementMasteredUntilTopicIndexPython
          : null;
      const v = raw === null || raw === undefined ? -1 : Number(raw);
      if (!Number.isFinite(v)) return -1;
      return Math.max(-1, Math.floor(v));
    })();
    // Fast blocking check: if there exists an unfinished task without a grade, do not generate a new one.
    // Avoid N+1 queries over tasks/grades.
    const blocking = await taskRepo()
      .createQueryBuilder("task")
      .leftJoin("task.grades", "grade")
      .where("task.user_id = :userId", { userId })
      .andWhere("task.lang = :lang", { lang })
      .andWhere("task.completed = 0")
      .andWhere("grade.id IS NULL")
      .orderBy("task.createdAt", "ASC")
      .select(["task.id", "task.type", "task.subtitle"])
      .getOne();
    if (blocking) {
      const isControlBatch = blocking.type === "CONTROL" && !!parsePersonalControlBatchPrefix((blocking as any).subtitle);
      return res.status(400).json({
        status: "blocked",
        message: isControlBatch ? "COMPLETE_CONTROL_WORK" : "COMPLETE_PREVIOUS_TASK",
        taskId: blocking.id
      });
    }
    // IMPORTANT: do NOT eagerly load theory blocks for all topics here.
    // For large curricula this can become a heavy query and slow down /generate enough to hit nginx timeouts.
    // We only need topic metadata for sequencing/selection; theory is loaded only for the chosen topic.
    const topics = await topicRepo().find({
      where: { lang },
      order: { topicIndex: "ASC" },
      select: ["id", "title", "topicIndex", "lang"] as any
    });
    if (!topics.length) return res.status(404).json({
      status: "error",
      message: "NO_TOPICS"
    });
    const REQUIRED_TASKS_FOR_INTRO_TOPIC = 1;
    const REQUIRED_TASKS_FOR_REGULAR_TOPIC = 3;
    // Count tasks per topicIndex in one query (avoids per-topic COUNT()).
    const rawCounts = await taskRepo()
      .createQueryBuilder("task")
      .select("task.topic_index", "topicIndex")
      .addSelect("COUNT(task.id)", "cnt")
      .where("task.user_id = :userId", { userId })
      .andWhere("task.lang = :lang", { lang })
      .andWhere("task.type = :type", { type: "TOPIC" })
      .groupBy("task.topic_index")
      .getRawMany();
    const countByTopicIndex = new Map<number, number>();
    for (const row of rawCounts) {
      const idx = Number((row as any)?.topicIndex);
      const cnt = Number((row as any)?.cnt);
      if (Number.isFinite(idx) && Number.isFinite(cnt)) countByTopicIndex.set(idx, cnt);
    }

    // Personal control work insertion: after each 5 fully completed topics (since placement), generate/continue a control work.
    const baseStartTopicIndex = masteredUntilTopicIndex + 1;
    const sequentialCompletedTopics = getSequentialCompletedTopicCount({
      topics,
      countByTopicIndex,
      baseStartTopicIndex
    });
    const controlDue = sequentialCompletedTopics > 0 && sequentialCompletedTopics % PERSONAL_CONTROL_BATCH_SIZE === 0;
    if (controlDue) {
      const segmentIndex = Math.floor(sequentialCompletedTopics / PERSONAL_CONTROL_BATCH_SIZE) - 1;
      const startTopicIndex = baseStartTopicIndex + segmentIndex * PERSONAL_CONTROL_BATCH_SIZE;
      const endTopicIndex = startTopicIndex + PERSONAL_CONTROL_BATCH_SIZE - 1;
      const batchPrefix = buildPersonalControlBatchPrefix({ lang, startTopicIndex, endTopicIndex });
      const batchTasks = await taskRepo()
        .createQueryBuilder("task")
        .where("task.user_id = :userId", { userId })
        .andWhere("task.lang = :lang", { lang })
        .andWhere("task.type = :type", { type: "CONTROL" })
        .andWhere("task.subtitle LIKE :pref", { pref: `${batchPrefix}%` })
        .orderBy("task.createdAt", "ASC")
        .select(["task.id", "task.title", "task.subtitle", "task.description", "task.numInTopic", "task.topicIndex", "task.type", "task.lang", "task.difus", "task.ioType", "task.template", "task.completed"])
        .getMany();

      const quizTask = (batchTasks as Task[]).find(t => isPersonalControlQuizTask(t));
      const practiceTasks = (batchTasks as Task[]).filter(t => typeof (t as any).subtitle === "string" && String((t as any).subtitle).includes("|PRACTICE|"));

      const rangeLabel = buildTopicsRangeLabel({ startTopicIndex, endTopicIndex });
      const prevTopicsText = buildPrevTopicsTextFromRange({ topics, startTopicIndex, endTopicIndex });

      if (!quizTask) {
        const remainingBeforeQuiz = REQUEST_BUDGET_MS - (Date.now() - requestStartedAt);
        // Quiz generation can be slower on free/provider-constrained models.
        // Keep this budget configurable and a bit more generous than before to reduce 504/deadline aborts.
        const QUIZ_BUDGET_CAP_MS = (() => {
          const raw = Number(process.env.TASKS_GENERATE_QUIZ_BUDGET_MS);
          const fallback = 20_000;
          const v = Number.isFinite(raw) ? raw : fallback;
          return Math.max(10_000, Math.min(35_000, Math.floor(v)));
        })();
        const quizBudgetMs = Math.max(8_000, Math.min(QUIZ_BUDGET_CAP_MS, remainingBeforeQuiz - 5_000));
        const quizResult = await safeAICall('generateQuiz', {
          lang,
          prevTopics: prevTopicsText,
          count: PERSONAL_CONTROL_QUIZ_COUNT,
          userId
        }, {
          expectedCount: PERSONAL_CONTROL_QUIZ_COUNT,
          language: userLanguage,
          requestId: req.requestId,
          maxAttempts: 3,
          ...(DISABLE_AI_DEADLINES ? {} : { totalTimeoutMs: quizBudgetMs })
        });
        if (!quizResult.success) {
          return sendAIError(res, quizResult.error);
        }

        const quizTitle = i18nText(
          userLanguage,
          `Контрольна (${rangeLabel}): Тест (${PERSONAL_CONTROL_QUIZ_COUNT} питань)`,
          `Control (${rangeLabel}): Quiz (${PERSONAL_CONTROL_QUIZ_COUNT} questions)`
        );
        const quizDescription = [
          i18nText(userLanguage, "### Тест", "### Quiz"),
          "",
          i18nText(userLanguage, `Ця контрольна охоплює теми ${rangeLabel}:`, `This control work covers topics ${rangeLabel}:`),
          prevTopicsText ? prevTopicsText.split("\n").map((t, i) => `${i + 1}. ${t}`).join("\n") : i18nText(userLanguage, "(теми не визначені)", "(topics are not defined)"),
          "",
          i18nText(userLanguage, "Оберіть правильну відповідь для кожного питання (А/Б/В/Г/Д).", "Choose the correct option for each question (A/B/C/D/E).")
        ].join("\n");

        const quizSaved = await taskRepo().save(taskRepo().create({
          user: { id: userId } as any,
          topic: null,
          title: quizTitle,
          subtitle: `${batchPrefix}|QUIZ|v1`,
          description: quizDescription,
          descriptionMarkdown: quizDescription,
          template: String(quizResult.data.quizJson),
          draftCode: "",
          finalCode: "",
          completed: 0,
          lang,
          difus: 0,
          numInTopic: 1,
          topicIndex: endTopicIndex,
          type: "CONTROL" as TaskType,
          ioType: "NO_INPUT_FREE_OUTPUT" as TaskIoType
        })) as any;

        return res.json({
          status: "ok",
          task: mapTaskToDto(quizSaved, undefined, { uiLanguage: userLanguage })
        });
      }

      if (practiceTasks.length < PERSONAL_CONTROL_PRACTICE_COUNT) {
        const difus = await getStableDifus(userId, lang, endTopicIndex, userRepo, gradeRepo);
        const nextPracticeNum = practiceTasks.length + 1;
        const controlTheoryForAi = [
          i18nText(userLanguage, `Контрольна робота (персонал) за темами ${rangeLabel}.`, `Personal control work for topics ${rangeLabel}.`),
          i18nText(userLanguage, "Не використовуй поняття, яких ще не було у цих темах.", "Do not use concepts that were not covered in these topics yet."),
          i18nText(userLanguage, "Не роби multi-task структур (завдання 1/2/3 в одному).", "Do not create multi-task structures (task 1/2/3 in one)."),
          i18nText(userLanguage, "Одна задача — одна умова.", "One task — one statement."),
          "",
          i18nText(userLanguage, "Перелік тем:", "Topics list:"),
          prevTopicsText
        ].join("\n").trim();

        try {
          const saved = await generateAndPersistPersonalProgrammingTask({
            requestStartedAt,
            requestBudgetMs: REQUEST_BUDGET_MS,
            requestId: req.requestId,
            userLanguage,
            userId,
            lang,
            difus,
            type: "CONTROL",
            topic: null,
            topicIndex: endTopicIndex,
            numInTopic: nextPracticeNum,
            requiredTasksInThisGroup: PERSONAL_CONTROL_PRACTICE_COUNT,
            topicTitleForAi: i18nText(userLanguage, `Контрольна (${rangeLabel}): Практика`, `Control (${rangeLabel}): Practice`),
            theoryForAi: controlTheoryForAi,
            prevTopicsText,
            subtitle: `${batchPrefix}|PRACTICE|${nextPracticeNum}`,
            existingTasksForContext: practiceTasks.map(t => ({
              id: t.id,
              title: t.title,
              description: t.description,
              numInTopic: t.numInTopic
            })),
            allTopics: topics,
            stdinPolicyTopicIndex: endTopicIndex
          });
          return res.json({
            status: "ok",
            task: mapTaskToDto(saved, undefined, { uiLanguage: userLanguage })
          });
        } catch (err: any) {
          if (err && err.statusCode) return sendAIError(res, err);
          throw err;
        }
      }
      // If quiz + all practice tasks already exist, /generate can continue to the next topic.
    }

    let topic: Topic | null = null;
    for (const t of topics) {
      if (t.topicIndex <= masteredUntilTopicIndex) continue;
      const count = countByTopicIndex.get(t.topicIndex) ?? 0;
      const required = t.topicIndex === 0 ? REQUIRED_TASKS_FOR_INTRO_TOPIC : REQUIRED_TASKS_FOR_REGULAR_TOPIC;
      if (count < required) {
        topic = t;
        break;
      }
    }
    if (!topic) return res.status(400).json({
      status: "blocked",
      message: "ALL_TOPICS_COMPLETED"
    });
    const difus = await getStableDifus(userId, lang, topic.topicIndex, userRepo, gradeRepo);

    const existingTasksInTopic = await taskRepo().find({
      where: {
        user: {
          id: userId
        },
        topic: {
          id: topic.id
        }
      },
      order: {
        numInTopic: "ASC"
      },
      select: ["id", "title", "description", "numInTopic"] as any
    });
    const numInTopic = existingTasksInTopic.length + 1;
    let description = "";
    let template = (() => {
      if (lang === "PYTHON") return "# write code here\n";
      if (lang === "CPP") {
        return [
          "#include <iostream>",
          "using namespace std;",
          "",
          "int main() {",
          "    ios::sync_with_stdio(false);",
          "    cin.tie(nullptr);",
          "",
          "    // TODO: implement the solution according to the statement",
          "",
          "    return 0;",
          "}"
        ].join("\n");
      }
      return ["public class Main {", "  public static void main(String[] args) {", "  }", "}"].join("\n");
    })();
    // Load theory lazily for just this topic.
    const topicWithTheory = await topicRepo().findOne({
      where: { id: topic.id } as any,
      relations: ["theoryBlock"]
    });
    const topicTheory = stripPracticeLikeSectionsFromTheory(String((topicWithTheory as any)?.theoryBlock?.content ?? (topicWithTheory as any)?.theoryMarkdown ?? ""));

    const requiredTasksInThisTopic = topic.topicIndex === 0 ? 1 : 3;
    const stdinAllowed = isStdinAllowedForTopic({
      allTopics: topics,
      lang,
      topicIndex: topic.topicIndex
    });
    const generationAllowedIoTypes = chooseGenerationAllowedIoTypes({
      stdinAllowed,
      numInTopic,
      topicIndex: topic.topicIndex
    });

    const prevTopicsForReinforcement = topics
      .filter(t => t.topicIndex < topic.topicIndex)
      .slice(-6)
      .map(t => String(t.title || "").trim())
      .filter(Boolean)
      .join("\n");

    const previousTasksBrief = existingTasksInTopic
      .map(t => {
        const practice = stripPracticeHeader(String((t as any).description || "")).replace(/\s+/g, " ").trim();
        const short = practice.length > 240 ? practice.slice(0, 240) + "…" : practice;
        return `- ${String(t.title || "(без назви)").trim()}: ${short}`;
      })
      .filter(Boolean)
      .join("\n");

    // Structured previous-task context (used for deterministic uniqueness checks in the AI wrapper).
    const previousTaskPracticesForUniq = existingTasksInTopic
      .map(t => stripPracticeHeader(String((t as any).description || "")).trim())
      .filter(s => s.length > 0)
      .slice(0, 8);
    const previousTaskTitlesForUniq = existingTasksInTopic
      .map(t => String((t as any).title || "").trim())
      .filter(Boolean)
      .slice(0, 12);

    const remainingBeforeTask = REQUEST_BUDGET_MS - (Date.now() - requestStartedAt);
    // Allow increasing task-generation budget when proxy timeout is higher.
    // Default: ~75% of the total request budget, capped to a reasonable ceiling.
    const TASK_BUDGET_CAP_MS = (() => {
      const raw = Number(process.env.TASKS_GENERATE_TASK_BUDGET_MS);
      const fallback = Math.floor(REQUEST_BUDGET_MS * 0.75);
      const v = Number.isFinite(raw) ? raw : fallback;
      // Guard against accidental under-budgeting (e.g., 10-15s) which causes frequent deadline aborts.
      // We still respect the remaining request budget below.
      return Math.max(25_000, Math.min(50_000, Math.floor(v)));
    })();
    // Keep some budget for test-data generation + DB writes.
    // Cap low to avoid nginx 504; generation retries still happen inside this budget.
    const taskBudgetMs = Math.max(10_000, Math.min(TASK_BUDGET_CAP_MS, remainingBeforeTask - 6_000));

    const aiTaskResult = await safeAICall('generateTask', {
      topicTitle: topic.title,
      theory: topicTheory,
      lang,
      topicIndex: topic.topicIndex,
      numInTopic,
      isFirstTask: numInTopic === 1,
      difus,
      userId,
      topicId: topic.id,
      semanticRetries: 1,
      allowedIoTypes: generationAllowedIoTypes,
      ...(prevTopicsForReinforcement ? { prevTopics: prevTopicsForReinforcement } : {}),
      previousTasks: previousTasksBrief,
      previousTaskPractices: previousTaskPracticesForUniq,
      previousTaskTitles: previousTaskTitlesForUniq
    }, {
      language: userLanguage,
      requestId: req.requestId,
      maxAttempts: 2,
      ...(DISABLE_AI_DEADLINES ? {} : { totalTimeoutMs: taskBudgetMs })
    });
    if (!aiTaskResult.success) {
      return sendAIError(res, aiTaskResult.error);
    }
    const aiTask = aiTaskResult.data;
    const practicalOnly = String(aiTask.practicalTask ?? "").trim();
    // Keep a single stable template per language; ignore AI-provided code templates.
    // (AI templates often include implementation or drift in structure.)
    // We still keep codeTemplate restrictions in prompts, but runtime uses our template.
    // template remains as computed above.
    const knownIoTypes = new Set(["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"] as const);
    const aiIoRaw = typeof (aiTask as any)?.ioType === "string" ? String((aiTask as any).ioType).trim() : "";
    const inferredNeedsInput = inferNeedsInput({
      taskDescription: practicalOnly,
      aiInputFormat: (aiTask as any)?.inputFormat
    });
    const deterministicNoInput = (lang === "PYTHON" && isIntroPythonFixedSumTask(practicalOnly, topic.title)) || computeDeterministicNoInputExpectedOutput(practicalOnly) !== null;
    const inferred = (knownIoTypes.has(aiIoRaw as any)
      ? (aiIoRaw as any)
      : (inferredNeedsInput
          ? "STDIN_STDOUT"
          : (deterministicNoInput ? "NO_INPUT_FIXED_OUTPUT" : "NO_INPUT_FREE_OUTPUT"))) as "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";

    // If stdin isn't allowed for this topic, never select STDIN_STDOUT.
    const ioType = (!stdinAllowed && inferred === "STDIN_STDOUT")
      ? (deterministicNoInput ? "NO_INPUT_FIXED_OUTPUT" : "NO_INPUT_FREE_OUTPUT")
      : inferred;

    const fixedNoInputExpected = ioType === "NO_INPUT_FIXED_OUTPUT" ? pickNoInputFixedExpectedOutput({
      examples: Array.isArray((aiTask as any)?.examples) ? (aiTask as any).examples : [],
      outputFormat: (aiTask as any)?.outputFormat
    }) : null;
    const statementMarkdown = composeTaskStatementMarkdown({
      practicalTask: practicalOnly,
      inputFormat: ioType === "STDIN_STDOUT"
        ? (aiTask as any)?.inputFormat
        : i18nText(userLanguage, "Вхідних даних немає.", "No input data."),
      // For NO_INPUT_FIXED_OUTPUT we want the visible output section to match the exact expected output.
      outputFormat: ioType === "NO_INPUT_FIXED_OUTPUT" ? (fixedNoInputExpected || (aiTask as any)?.outputFormat) : (aiTask as any)?.outputFormat,
      constraints: (aiTask as any)?.constraints,
      uiLanguage: userLanguage
    });
    description = statementMarkdown;

    const aiTitleRaw = typeof (aiTask as any)?.title === "string" ? String((aiTask as any).title).trim() : "";
    const baseTitle = aiTitleRaw || i18nText(userLanguage, `Практика: ${topic.title}`, `Practice: ${topic.title}`);
    const titlePrefix = requiredTasksInThisTopic > 1 ? `(${numInTopic}/${requiredTasksInThisTopic}) ` : "";
    const uniqueTitle = `${titlePrefix}${baseTitle}`.trim();
    const task = taskRepo().create({
      user: {
        id: userId
      },
      topic,
      title: uniqueTitle,
      subtitle: "",
      description,
      descriptionMarkdown: description,
      template,
      draftCode: "",
      finalCode: "",
      completed: 0,
      lang,
      difus,
      numInTopic,
      topicIndex: topic.topicIndex,
      type: "TOPIC" as TaskType,
      ioType
    });
    const saved = await taskRepo().save(task);
    const needsInput = ioType === "STDIN_STDOUT";
    const REQUIRED_TEST_COUNT = needsInput ? 12 : 1;
    let testExamples: Array<{
      input: string;
      output: string;
    }> = [];
    if (ioType === "NO_INPUT_FREE_OUTPUT") {
      // Free-output tasks: judge will only require non-empty stdout.
      // We still store a human-friendly placeholder as expected output.
      testExamples = [{ input: "", output: "(any non-empty output)" }];
    }
    if (testExamples.length === 0 && ioType === "NO_INPUT_FIXED_OUTPUT") {
      // Fixed-output no-input tasks: generate tests deterministically from the exact expected output.
      // This prevents statement/test mismatches caused by test-data generation hallucinating different constants.
      if (fixedNoInputExpected && fixedNoInputExpected.trim().length > 0) {
        testExamples = [{ input: "", output: fixedNoInputExpected.trim() }];
      }
    }
    const deterministicIntro = lang === "PYTHON" && isIntroPythonFixedSumTask(practicalOnly, topic.title);
    if (testExamples.length === 0 && deterministicIntro) {
      testExamples = [{
        input: "",
        output: "8"
      }];
    } else {
      const expected = computeDeterministicNoInputExpectedOutput(practicalOnly);
      if (testExamples.length === 0 && expected !== null) testExamples = [{
        input: "",
        output: expected
      }];
    }
    // Reuse AI-provided examples when possible (can reduce or avoid a separate test-generation call).
    const aiExamples = Array.isArray((aiTask as any)?.examples)
      ? (aiTask as any).examples
          .map((ex: any) => sanitizeGeneratedTestExample({
            input: ex?.input,
            output: ex?.output,
            ioType
          }))
          .filter((ex: { input: string; output: string } | null): ex is { input: string; output: string } => !!ex)
      : [];

    // If we still don't have tests, seed from examples.
    if (testExamples.length === 0 && aiExamples.length > 0) {
      testExamples = aiExamples.slice(0, Math.max(1, Math.min(REQUIRED_TEST_COUNT, aiExamples.length)));
    }

    if (testExamples.length < REQUIRED_TEST_COUNT) {
      const taskDescriptionForTests = statementMarkdown || practicalOnly;

      const remainingBeforeTests = REQUEST_BUDGET_MS - (Date.now() - requestStartedAt);
      const testsBudgetMs = Math.max(4_000, Math.min(10_000, remainingBeforeTests - 1500));

      // If we're close to the nginx timeout, skip test-data generation to guarantee a timely response.
      // We'll fall back to examples produced by the task generation itself.
      const SHOULD_SKIP_TESTDATA_MS = 6_000;
      if (remainingBeforeTests < SHOULD_SKIP_TESTDATA_MS) {
        const fallbackExamples = aiExamples;
        if (fallbackExamples.length === 0 && testExamples.length === 0) {
          await taskRepo().remove(saved);
          return res.status(503).json({
            message: "AI_GENERATION_FAILED",
            error: "Not enough time budget remaining to generate tests, and no examples were available for fallback"
          });
        }
        logger.warn("[tasks] skipping generateTestData due to low remaining request budget", {
          requestId: req.requestId,
          userId,
          topicId: topic.id,
          lang,
          remainingBeforeTests
        });

        const mergedFallback = mergeConsistentExamples({
          base: testExamples,
          candidates: fallbackExamples,
          ioType,
          maxCount: REQUIRED_TEST_COUNT,
          fixedNoInputExpected
        });
        testExamples = mergedFallback.merged.length ? mergedFallback.merged : (fallbackExamples.slice(0, 1));
        if (mergedFallback.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
          await taskRepo().remove(saved);
          return sendAIError(res, {
            statusCode: 400,
            message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
            error: "INCONSISTENT_TEST_DATA",
            details: {
              mode: "generateTestData",
              droppedConflicts: mergedFallback.droppedConflicts,
              ioType,
              topicId: topic.id,
              lang
            }
          });
        }
      } else {

      const remainingCount = REQUIRED_TEST_COUNT - testExamples.length;
      for (let consistencyAttempt = 0; consistencyAttempt <= TEST_CONSISTENCY_RETRY_ATTEMPTS; consistencyAttempt++) {
        const testDataResult = await safeAICall('generateTestData', {
          taskDescription: taskDescriptionForTests || description,
          taskTitle: topic.title,
          lang,
          count: remainingCount,
          userId
        }, {
          expectedCount: remainingCount,
          language: userLanguage,
          requestId: req.requestId,
          maxAttempts: 1,
          ...(DISABLE_AI_DEADLINES ? {} : { totalTimeoutMs: testsBudgetMs })
        });
        if (!testDataResult.success) {
          // If upstream AI is rate-limited/unavailable, fall back to examples produced by the task generation itself.
          // This avoids failing the whole task generation flow under provider pressure.
          const status = Number(testDataResult.error?.statusCode ?? 0);
          const canFallback = status === 429 || status === 503 || status === 504;
          if (!canFallback) {
            await taskRepo().remove(saved);
            return sendAIError(res, testDataResult.error);
          }

          const fallbackExamples = aiExamples;

          if (fallbackExamples.length === 0) {
            // Should not happen because generateTask validator requires examples, but keep a safe fallback.
            await taskRepo().remove(saved);
            return sendAIError(res, testDataResult.error);
          }

          logger.warn("[tasks] generateTestData rate-limited; using task examples as fallback tests", {
            requestId: req.requestId,
            userId,
            topicId: topic.id,
            lang,
            status,
            retryAfterMs: testDataResult.error?.details?.retryAfterMs
          });

          const mergedFallback = mergeConsistentExamples({
            base: testExamples,
            candidates: fallbackExamples,
            ioType,
            maxCount: REQUIRED_TEST_COUNT,
            fixedNoInputExpected
          });
          if (mergedFallback.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
            await taskRepo().remove(saved);
            return sendAIError(res, {
              statusCode: 400,
              message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
              error: "INCONSISTENT_TEST_DATA",
              details: {
                mode: "generateTestData",
                droppedConflicts: mergedFallback.droppedConflicts,
                ioType,
                topicId: topic.id,
                lang
              }
            });
          }

          testExamples = mergedFallback.merged.length
            ? mergedFallback.merged
            : fallbackExamples.slice(0, Math.max(1, Math.min(REQUIRED_TEST_COUNT, fallbackExamples.length)));
          break;
        }

        const additional = (testDataResult.data || [])
          .map((ex: any) => sanitizeGeneratedTestExample({
            input: ex?.input,
            output: ex?.output,
            ioType
          }))
          .filter((ex: { input: string; output: string } | null): ex is { input: string; output: string } => !!ex);
        const mergedResult = mergeConsistentExamples({
          base: testExamples,
          candidates: additional,
          ioType,
          maxCount: REQUIRED_TEST_COUNT,
          fixedNoInputExpected
        });
        if (mergedResult.droppedConflicts > 0 && STRICT_TEST_CONSISTENCY) {
          if (consistencyAttempt < TEST_CONSISTENCY_RETRY_ATTEMPTS) {
            logger.warn("[tasks] inconsistent generated tests detected, retrying generateTestData", {
              requestId: req.requestId,
              userId,
              topicId: topic.id,
              lang,
              ioType,
              droppedConflicts: mergedResult.droppedConflicts,
              consistencyAttempt: consistencyAttempt + 1,
              maxConsistencyAttempts: TEST_CONSISTENCY_RETRY_ATTEMPTS + 1
            });
            continue;
          }
          await taskRepo().remove(saved);
          return sendAIError(res, {
            statusCode: 400,
            message: "AI_GENERATION_FAILED: Generated tests contradict task condition/examples",
            error: "INCONSISTENT_TEST_DATA",
            details: {
              mode: "generateTestData",
              droppedConflicts: mergedResult.droppedConflicts,
              ioType,
              topicId: topic.id,
              lang
            }
          });
        }

        testExamples = mergedResult.merged;
        if (mergedResult.droppedConflicts > 0) {
          logger.warn("[tasks] dropped inconsistent generated tests", {
            requestId: req.requestId,
            userId,
            topicId: topic.id,
            droppedConflicts: mergedResult.droppedConflicts,
            ioType
          });
        }
        break;
      }
      }
    }
    // Keep max grade scale (100) stable even if we had to fall back to fewer tests.
    const pointsByIndex: number[] = (() => {
      const n = Math.max(1, testExamples.length);
      const totalPoints = 100;
      if (n === 1) return [totalPoints];
      const base = Math.floor(totalPoints / n);
      const rem = totalPoints % n;
      const arr = new Array(n).fill(base);
      for (let i = 0; i < rem; i++) arr[i] = arr[i] + 1;
      return arr;
    })();

    const newTestData = testExamples.map((ex, idx) => testDataRepo().create({
      input: ex.input || "",
      expectedOutput: ex.output || "",
      points: pointsByIndex[idx] ?? 1,
      personalTask: {
        id: saved.id
      }
    }));
    await testDataRepo().save(newTestData);
    return res.json({
      status: "ok",
      task: mapTaskToDto(saved, undefined, { uiLanguage: userLanguage })
    });
  } catch (error: any) {
    logger.error("[tasks] POST /generate error", { requestId: req.requestId, userId: req.userId, error });
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        error: error.error
      });
    }
    return res.status(500).json({
      message: "Internal server error"
    });
  } finally {
    if (throttleKey) generateInFlightByUserLang.delete(throttleKey);
  }
});
tasksRouter.post("/reset-topic", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const uiLanguage = resolveUiLanguage(req);
    const userId = req.userId!;
    const {
      topicId
    } = req.body;
    if (!topicId || typeof topicId !== "number") {
      return res.status(400).json({
        message: i18nText(uiLanguage, "topicId є обов'язковим і має бути числом", "topicId is required and must be a number")
      });
    }
    const tasks = await taskRepo().find({
      where: {
        user: {
          id: userId
        },
        topic: {
          id: topicId
        }
      }
    });
    for (const task of tasks) {
      await gradeRepo().delete({
        user: {
          id: userId
        },
        task: {
          id: task.id
        }
      });
    }
    await taskRepo().delete({
      user: {
        id: userId
      },
      topic: {
        id: topicId
      }
    });
    return res.json({
      message: i18nText(uiLanguage, "Тему успішно скинуто", "Topic reset successfully")
    });
  } catch (error: any) {
    logger.error("[tasks] POST /reset-topic error", { requestId: req.requestId, userId: req.userId, error });
    const uiLanguage = resolveUiLanguage(req);
    return res.status(500).json({
      message: i18nText(uiLanguage, "Внутрішня помилка сервера", "Internal server error")
    });
  }
});

tasksRouter.get("/:id/web-template", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = Number(req.params.id);
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }
    const task = await taskRepo().findOne({
      where: {
        id,
        user: { id: req.userId }
      }
    });
    if (!task) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
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
    logger.error("[tasks] GET /:id/web-template error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.put("/:id/web-draft", authMiddleware, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = Number(req.params.id);
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const task = await taskRepo().findOne({ where: { id, user: { id: req.userId } } });
    if (!task) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertPersonalWebFilesWithinLimits(files);

    const rules = normalizeWebRules((task as any).webValidationRules ?? []);
    const encoded = encodeWebTaskPayload({ mode: "WEB", version: 1, files, rules });
    task.draftCode = encoded;
    await taskRepo().save(task);

    personalWebDraftStore.set(personalWebDraftKey(req.userId, id), {
      files,
      updatedAt: Date.now(),
    });

    return res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[tasks] PUT /:id/web-draft error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.post("/:id/web-check", authMiddleware, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = Number(req.params.id);
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const task = await taskRepo().findOne({ where: { id, user: { id: req.userId } } });
    if (!task) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertPersonalWebFilesWithinLimits(files);
    const rules = normalizeWebRules((task as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (task as any).webTemplateFiles ?? [] });

    return res.json({ taskMode: "WEB", ...check });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[tasks] POST /:id/web-check error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.post("/:id/web-submit", authMiddleware, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    const id = Number(req.params.id);
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const task = await taskRepo().findOne({ where: { id, user: { id: req.userId } } });
    if (!task) {
      throw new HttpError(404, "TASK_NOT_FOUND", { code: "TASK_NOT_FOUND", expose: true });
    }
    if (String((task as any).taskMode ?? "CODE") !== "WEB") {
      throw new HttpError(400, "TASK_IS_NOT_WEB", { code: "TASK_IS_NOT_WEB", expose: true });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertPersonalWebFilesWithinLimits(files);
    const rules = normalizeWebRules((task as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((task as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (task as any).webTemplateFiles ?? [] });

    const maxScore = check.maxScore > 0 ? check.maxScore : Math.max(1, check.totalRules);
    const score = check.maxScore > 0 ? check.score : check.passedRules;
    const ratio = maxScore > 0 ? score / maxScore : 0;
    const total = Math.max(1, Math.min(100, Math.round(ratio * 100)));

    const codeSnapshot = encodeWebTaskPayload({ mode: "WEB", version: 1, files, rules });
    task.finalCode = codeSnapshot;
    task.completed = 1;
    await taskRepo().save(task);

    const feedback = check.passed
      ? "All web validation rules passed."
      : check.results.filter(r => !r.passed).map(r => `- ${r.message}`).join("\n");

    const grade = gradeRepo().create({
      user: { id: req.userId },
      task: { id: task.id },
      total,
      workScore: 0,
      optimizationScore: 0,
      integrityScore: 0,
      aiFeedback: feedback,
      codeSnapshot,
      previousGradeId: null,
      comparisonFeedback: null,
    } as any);
    const savedGradeResult = await gradeRepo().save(grade);
    const savedGrade = Array.isArray(savedGradeResult) ? savedGradeResult[0] : savedGradeResult;

    await syncPostLearningProgress({
      userId: req.userId,
      lang: task.lang,
      topicIndex: task.topicIndex,
      requestId: req.requestId
    });

    const testResults = check.results.map((r, idx) => ({
      testId: idx + 1,
      passed: r.passed,
      verdict: r.passed ? "AC" : "WA",
      errorKind: r.passed ? null : "web_rule",
      error: r.passed ? null : r.message,
    }));

    return res.json({
      grade: {
        id: savedGrade.id,
        gradingMode: "TESTS",
        total: savedGrade.total,
        testsPassed: check.passedRules,
        testsTotal: check.totalRules,
        score,
        maxScore,
        testResults,
        aiFeedback: feedback,
        createdAt: savedGrade.createdAt,
      },
      taskMode: "WEB",
      scoring: {
        score,
        maxScore,
      },
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("[tasks] POST /:id/web-submit error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

tasksRouter.post(
  "/:id/save-draft",
  authMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({
    errors: errors.array()
  });
  const id = Number(req.params.id);
  const { code, files } = req.body as { code?: string; files?: unknown };
  if (!req.userId) {
    return res.status(401).json({
      message: "UNAUTHORIZED"
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    }
  });
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const persisted = normalizedFiles.length
    ? encodeMultiFileSubmissionV1({ entry: task.lang === "PYTHON" ? "main.py" : "Main.java", files: normalizedFiles })
    : String(code ?? "");

  task.draftCode = persisted;
  await taskRepo().save(task);
  return res.json({
    success: true
  });
}
);
tasksRouter.post(
  "/:id/submit",
  authMiddleware,
  submissionRateLimitMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body("mode").optional().isIn(["TESTS", "AI"]),
    body("clientSubmissionId").optional().isString().isLength({ min: 1, max: 128 }),
    body("codeHash").optional().isString().isLength({ min: 8, max: 128 }),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError(400, "VALIDATION_ERROR", {
      code: "VALIDATION_ERROR",
      expose: true
    });
  }
  const id = Number(req.params.id);
  const {
    code,
    files,
    mode,
    clientSubmissionId
  } = req.body as {
    code?: string;
    files?: unknown;
    mode?: "TESTS" | "AI";
    clientSubmissionId?: string;
  };
  const submitMode: "TESTS" | "AI" = mode ?? "TESTS";
  if (!req.userId) {
    throw new HttpError(401, "UNAUTHORIZED", {
      code: "UNAUTHORIZED",
      expose: true
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    },
    relations: ["testData"]
  });
  if (!task) {
    throw new HttpError(404, "Task not found", {
      code: "TASK_NOT_FOUND",
      expose: true
    });
  }

  if (isPersonalControlQuizTask(task)) {
    throw new HttpError(400, "QUIZ_TASK_USE_SUBMIT_QUIZ", {
      code: "QUIZ_TASK_USE_SUBMIT_QUIZ",
      expose: true
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(code) : null;
  const entryFile = decodedFromCode?.entry || (task.lang === "PYTHON" ? "main.py" : task.lang === "CPP" ? "main.cpp" : "Main.java");
  const effectiveFiles = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
  const isMultiFile = effectiveFiles.length > 0;
  const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : String(code ?? "");
  const persistedSubmission = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : String(code ?? "");
  const normalizedClientSubmissionId = normalizeClientSubmissionId(clientSubmissionId);
  const serverCodeHash = sha256Hex(persistedSubmission);

  // For AI grading, concatenate all files for better context.
  const aiCodeText = isMultiFile ? concatForAI({ version: 1, entry: entryFile, files: effectiveFiles }) : sourceText;
  if (submitMode === "TESTS" && (!task.testData || task.testData.length === 0)) {
    throw new HttpError(400, "Test data is required for personal tasks. Please regenerate the task.", {
      code: "TEST_DATA_REQUIRED",
      expose: true
    });
  }
  const MIN_GRADE = 1;
  const MAX_GRADE = 100;
  const TASK_COMPLETED_FLAG = 1;
  if (submitMode === "AI") {
    const previous = await gradeRepo().findOne({
      where: {
        user: {
          id: req.userId
        },
        task: {
          id: task.id
        }
      },
      order: {
        createdAt: "DESC"
      },
      relations: ["task"]
    });
    const ai = await evaluateCodeWithAI({
      code: aiCodeText,
      language: task.lang,
      task,
      previousCode: previous?.codeSnapshot ?? undefined,
      previousGrade: previous?.total ?? undefined,
      previousScores: previous ? {
        work: Number(previous.workScore ?? 0),
        optimization: Number(previous.optimizationScore ?? 0),
        integrity: Number(previous.integrityScore ?? 0)
      } : undefined
    });
    const total = computeTotalFromParts({
      work: ai.work,
      optimization: ai.optimization,
      integrity: ai.integrity
    });
    const comparisonFeedbackText = ai.comparison?.changes?.length ? ai.comparison.changes.map(c => {
      const category = c.category === "work" ? "Працездатність" : c.category === "optimization" ? "Оптимізація" : "Доброчесність";
      const sign = c.delta >= 0 ? "+" : "";
      const line = c.codeLine ? ` (рядок ${c.codeLine})` : "";
      return `${category}: ${sign}${c.delta}${line} — ${c.reason}`;
    }).join("\n") : null;
    const encodedComparisonFeedback = encodeAiComparisonFeedback({
      comparisonFeedback: comparisonFeedbackText ?? null,
      aiUnavailableFallback: Boolean(ai.fallbackUsed)
    });
    task.finalCode = persistedSubmission;
    task.completed = TASK_COMPLETED_FLAG;
    await taskRepo().save(task);
    const grade = gradeRepo().create({
      user: {
        id: req.userId
      },
      task: {
        id: task.id
      },
      total: Math.min(MAX_GRADE, Math.max(MIN_GRADE, total)),
      workScore: ai.work,
      optimizationScore: ai.optimization,
      integrityScore: ai.integrity,
      aiFeedback: ai.feedback,
      codeSnapshot: persistedSubmission,
      previousGradeId: previous?.id ?? null,
      comparisonFeedback: encodedComparisonFeedback
    });
    const savedGradeResult = await gradeRepo().save(grade);
    const savedGrade = Array.isArray(savedGradeResult) ? savedGradeResult[0] : savedGradeResult;
    const parsedComparisonFeedback = parseGradeComparisonFeedback(savedGrade.comparisonFeedback);

    await syncPostLearningProgress({
      userId: req.userId,
      lang: task.lang,
      topicIndex: task.topicIndex,
      requestId: req.requestId
    });

    return res.json({
      grade: {
        id: savedGrade.id,
        gradingMode: "AI" as const,
        total: savedGrade.total,
        workScore: savedGrade.workScore ?? 0,
        optimizationScore: savedGrade.optimizationScore ?? 0,
        integrityScore: savedGrade.integrityScore ?? 0,
        aiFeedback: savedGrade.aiFeedback,
        aiUnavailableFallback: parsedComparisonFeedback.aiUnavailableFallback || Boolean(ai.fallbackUsed),
        comparisonFeedback: parsedComparisonFeedback.comparisonFeedback,
        previousGrade: previous?.total ?? null,
        createdAt: savedGrade.createdAt
      },
      submissionMeta: {
        submissionId: String(savedGrade.id),
        clientSubmissionId: normalizedClientSubmissionId,
        codeHash: serverCodeHash
      }
    });
  }
  let total = 0;
  let passedTests = 0;
  let hintsForUser: string[] = [];
  const learningFeedbackCandidates: Array<{
    passed: boolean;
    isPublic: boolean;
    input?: string;
    expected?: string;
    actual?: string;
    error_kind?: string | null;
  }> = [];
  const testResultsDetailed: Array<{
    testId: number;
    input: string;
    expectedOutput?: string;
    actualOutput: string;
    passed: boolean;
    verdict?: string | null;
    error?: string | null;
    errorKind?: string | null;
  }> = [];
  const sorted = [...(task.testData || [])].sort((a, b) => a.id - b.id);
  const effectiveIoType = inferEffectiveIoTypeForPersonalTask(task, sorted);
  const maxScore = sorted.reduce((sum, t) => sum + (t.points || 1), 0);

  // For free-output tasks we only need to ensure non-empty stdout once.
  // Collapse to a single test to reduce judge load and keep grading scale (12) stable via weight.
  const judgedTests = effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? sorted.slice(0, 1) : sorted;
  const tests = judgedTests.map(t => ({
    id: t.id,
    input: t.input || "",
    output: t.expectedOutput || "",
    hidden: false,
    group: "public",
    weight: effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? Math.max(1, maxScore) : (t.points || 1)
  }));
  const judgeLang = task.lang === "JAVA" ? "java" : task.lang === "PYTHON" ? "python" : "cpp";
  const defaultLimitsByLang = {
    java: {
      time_limit_ms: 1200,
      memory_limit_mb: 256,
      output_limit_kb: 64
    },
    python: {
      time_limit_ms: 900,
      memory_limit_mb: 128,
      output_limit_kb: 64
    },
    cpp: {
      time_limit_ms: 800,
      memory_limit_mb: 256,
      output_limit_kb: 64
    }
  } as const;
  const checker: CheckerSpec = effectiveIoType === "NO_INPUT_FREE_OUTPUT"
    ? { type: "nonempty" }
    : chooseDefaultCheckerFromExpectedOutputs(sorted.map(t => t.expectedOutput || ""));
  const workerReq: WorkerJudgeRequest = {
    submission_id: `personal_${req.userId}_${task.id}_${Date.now()}`,
    language: judgeLang,
    source: sourceText,
    ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
    tests,
    limits: defaultLimitsByLang[judgeLang],
    checker,
    debug: false,
    rerun_failed_once: true
  };
  let workerRes: WorkerJudgeResponse | null = null;
  workerRes = await judgeWithSemaphore(workerReq);
  if (workerRes) {
    if (workerRes.verdict === "CE" && workerRes.compile) {
      const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      for (const t of judgedTests) {
        learningFeedbackCandidates.push({
          passed: false,
          isPublic: true,
          input: t.input || "",
          expected: (t.expectedOutput ?? "").toString(),
          actual: "",
          error_kind: workerRes.compile.error_kind ?? null
        });
        testResultsDetailed.push({
          testId: t.id,
          input: t.input || "",
          expectedOutput: (t.expectedOutput ?? "").toString(),
          actualOutput: "",
          passed: false,
          verdict: "CE",
          error: compileErr || "Compilation error",
          errorKind: workerRes.compile.error_kind ?? null
        });
      }
    } else {
      const resultsById = new Map<string, (typeof workerRes.tests)[number]>();
      for (const r of workerRes.tests) {
        resultsById.set(String(r.test_id), r);
      }
      for (const t of judgedTests) {
        const r = resultsById.get(String(t.id));
        const actualTrimmed = typeof r?.actual === "string" ? r.actual.trim() : "";
        const passed = r?.verdict === "AC" || (
          effectiveIoType === "NO_INPUT_FREE_OUTPUT" &&
          r?.verdict === "WA" &&
          actualTrimmed.length > 0
        );
        if (passed) {
          passedTests++;
          total += effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? Math.max(1, maxScore) : (t.points || 1);
        }
        learningFeedbackCandidates.push({
          passed,
          isPublic: true,
          input: t.input || "",
          expected: (r?.expected ?? t.expectedOutput ?? "").toString(),
          actual: r?.actual ?? "",
          error_kind: (r as any)?.error_kind ?? null
        });
        testResultsDetailed.push({
          testId: t.id,
          input: t.input || "",
          expectedOutput: (r?.expected ?? t.expectedOutput ?? "").toString(),
          actualOutput: r?.actual ?? "",
          passed,
          verdict: r?.verdict ?? null,
          error: r?.stderr ?? null,
          errorKind: (r as any)?.error_kind ?? null
        });
      }
      // For NO_INPUT_FREE_OUTPUT we deliberately ignore judge score/max_score because older judge builds
      // may not support the nonempty checker yet and would report WA/0 even for valid non-empty output.
      if (effectiveIoType !== "NO_INPUT_FREE_OUTPUT" && typeof workerRes.score === "number" && typeof workerRes.max_score === "number") {
        total = workerRes.score;
      }
    }
  }
  const feedbackLines: string[] = [];
  feedbackLines.push(`Пройдено тестів: ${passedTests}/${judgedTests.length}`);
  feedbackLines.push("");
  for (const r of testResultsDetailed) {
    if (r.passed) {
      feedbackLines.push(`✓ Тест ${r.testId}: пройдено`);
    } else if (r.error) {
      feedbackLines.push(`✗ Тест ${r.testId}: помилка — ${r.error}`);
    } else {
      feedbackLines.push(`✗ Тест ${r.testId}: не пройдено`);
    }
  }

  if (effectiveIoType === "NO_INPUT_FIXED_OUTPUT" && passedTests < judgedTests.length) {
    const firstFail = testResultsDetailed.find(r => !r.passed);
    if (firstFail) {
      const expected = String(firstFail.expectedOutput ?? "").trim();
      const actual = String(firstFail.actualOutput ?? "").trim();
      const clip = (s: string) => s.length > 1200 ? s.slice(0, 1200) + "\n…(truncated)" : s;
      feedbackLines.push("");
      feedbackLines.push("Очікуваний вивід (точно):");
      feedbackLines.push(clip(expected || "(порожньо)"));
      feedbackLines.push("");
      feedbackLines.push("Ваш вивід:");
      feedbackLines.push(clip(actual || "(порожньо)"));
    }
  }
  if (passedTests < judgedTests.length) {
    try {
      const expectedById = new Map<number, string>();
      for (const t of judgedTests) expectedById.set(t.id, (t.expectedOutput || "").toString());
      const failuresForHints = testResultsDetailed.filter(r => !r.passed).slice(0, 3).map(r => ({
        testId: r.testId,
        input: r.input || "",
        expected: expectedById.get(r.testId) ?? "",
        actual: r.actualOutput || "",
        verdict: r.verdict ?? undefined,
        stderr: r.error ?? null
      }));
      const hints = await generateAlgorithmicHints({
        taskTitle: task.title,
        taskText: task.descriptionMarkdown || task.description,
        language: task.lang,
        code: aiCodeText,
        failures: failuresForHints,
        maxHints: 4
      });
      if (hints.length) {
        hintsForUser = hints;
        feedbackLines.push("");
        feedbackLines.push("Підказки (щоб пройти тести):");
        for (const h of hints) feedbackLines.push(`- ${h}`);
      }
    } catch {}
  }
  const feedback = feedbackLines.join("\n");

  const scoringScore = effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? total : (typeof workerRes?.score === "number" ? workerRes.score : total);
  const scoringMaxScore = effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? Math.max(1, maxScore) : (typeof workerRes?.max_score === "number" ? workerRes.max_score : maxScore);
  const scoringGroupScores = effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? [{
    group: "public",
    score: scoringScore,
    maxScore: scoringMaxScore
  }] : (Array.isArray(workerRes?.group_scores) ? workerRes.group_scores.map(gs => ({
    group: String((gs as any).group ?? ""),
    score: Number((gs as any).score ?? 0),
    maxScore: Number((gs as any).max_score ?? 0)
  })) : [{
    group: "public",
    score: scoringScore,
    maxScore: scoringMaxScore
  }]);

  task.finalCode = persistedSubmission;
  task.completed = TASK_COMPLETED_FLAG;
  await taskRepo().save(task);
  const grade = gradeRepo().create({
    user: {
      id: req.userId
    },
    task: {
      id: task.id
    },
    total: Math.min(MAX_GRADE, Math.max(MIN_GRADE, total)),
    workScore: 0,
    optimizationScore: 0,
    integrityScore: 0,
    aiFeedback: feedback,
    codeSnapshot: persistedSubmission,
    comparisonFeedback: null,
    previousGradeId: null
  });
  const savedGradeResult = await gradeRepo().save(grade);
  const savedGrade = Array.isArray(savedGradeResult) ? savedGradeResult[0] : savedGradeResult;

  await syncPostLearningProgress({
    userId: req.userId,
    lang: task.lang,
    topicIndex: task.topicIndex,
    requestId: req.requestId
  });

  const learningFirstFailure = buildLearningFirstFailure({
    verdict: workerRes?.verdict ?? null,
    tests: learningFeedbackCandidates
  });
  return res.json({
    grade: {
      id: savedGrade.id,
      gradingMode: "TESTS" as const,
      total: savedGrade.total,
      aiFeedback: savedGrade.aiFeedback,
      testsPassed: passedTests,
      testsTotal: judgedTests.length,
      score: scoringScore,
      maxScore: scoringMaxScore,
      groupScores: scoringGroupScores,
      testResults: sanitizeTestResultsForStudent(testResultsDetailed),
      hints: hintsForUser,
      createdAt: savedGrade.createdAt
    },
    submissionMeta: {
      submissionId: String(savedGrade.id),
      clientSubmissionId: normalizedClientSubmissionId,
      codeHash: serverCodeHash
    },
    learningFeedback: {
      verdict: workerRes?.verdict ?? null,
      firstFailure: learningFirstFailure
    }
  });
}
);
tasksRouter.post(
  "/:id/run",
  authMiddleware,
  submissionRateLimitMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body("input").optional().isString(),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError(400, "VALIDATION_ERROR", {
      code: "VALIDATION_ERROR",
      expose: true
    });
  }
  const id = Number(req.params.id);
  const {
    code,
    files,
    input
  } = req.body as {
    code?: string;
    files?: unknown;
    input?: string;
  };
  if (!req.userId) {
    throw new HttpError(401, "UNAUTHORIZED", {
      code: "UNAUTHORIZED",
      expose: true
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    }
  });
  if (!task) {
    throw new HttpError(404, "Task not found", {
      code: "TASK_NOT_FOUND",
      expose: true
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(code) : null;
  const entryFile = decodedFromCode?.entry || (task.lang === "PYTHON" ? "main.py" : task.lang === "CPP" ? "main.cpp" : "Main.java");
  const effectiveFiles = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
  const isMultiFile = effectiveFiles.length > 0;
  const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : String(code ?? "");

  const CODE_RUN_TIMEOUT_MS = 5000;
  if (isMultiFile) {
    const judgeLang = task.lang === "JAVA" ? "java" : task.lang === "PYTHON" ? "python" : "cpp";
    const workerReq: WorkerJudgeRequest = {
      submission_id: `personal_run_${req.userId}_${task.id}_${Date.now()}`,
      language: judgeLang,
      source: sourceText,
      files: effectiveFiles,
      entry: entryFile,
      tests: [
        {
          id: "custom",
          input: input || "",
          output: "",
          hidden: false,
          group: "custom",
          weight: 1
        }
      ],
      limits: {
        time_limit_ms: CODE_RUN_TIMEOUT_MS,
        memory_limit_mb: judgeLang === "python" ? 128 : 256,
        output_limit_kb: 256
      },
      checker: { type: "exact" },
      debug: true,
      run_all: true,
      rerun_failed_once: false
    };
    const workerRes = await judgeWithSemaphore(workerReq);
    if (workerRes.verdict === "CE" && workerRes.compile) {
      const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      return res.json({ output: "", stderr: combined || "Compilation error", success: false });
    }
    const t0 = workerRes.tests?.[0] as any;
    const stdout = String(t0?.actual ?? "");
    const stderr = String(t0?.stderr ?? "");
    return res.json({ output: stdout, stderr, success: true });
  }

  const result = await executeCodeWithInput(sourceText, task.lang, input || "", CODE_RUN_TIMEOUT_MS);
  return res.json({ output: result.stdout, stderr: result.stderr, success: result.success });
}
);
export { tasksRouter };
export default tasksRouter;