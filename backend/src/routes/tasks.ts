import { encodeAiComparisonFeedback, parseGradeComparisonFeedback } from "../utils/gradeComparisonFeedback";
import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { createHash } from "crypto";
import { AppDataSource } from "../data-source";
import { Task, TaskType } from "../entities/Task";
import type { TaskIoType, TaskLang } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { getPersonalMiniProjectDefinition, PERSONAL_MINI_PROJECT_INTERVAL } from "../data/personalMiniProjects";
import {
  getPersonalThematicStartTopicIndex,
  getSequentialCompletedThematicTopicCount,
  PERSONAL_REGULAR_TOPIC_TASK_COUNT,
} from "../utils/personalCurriculumProgress";
import { Grade } from "../entities/Grade";
import { User } from "../entities/User";
import { TestData } from "../entities/TestData";
import { TheoryBlock } from "../entities/TheoryBlock";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { In } from "typeorm";
import { safeAICall, sendAIError, neutralizePromptInjection } from "../services/ai/safeAICall";
import { generateAlgorithmicHints, explainSubmissionError, type HintLanguage } from "../services/ai/failureHints";
import { debugMentorReply, type DebugChatMessage, DEBUG_CHAT_MAX_HISTORY, DEBUG_CHAT_MAX_MESSAGE_CHARS } from "../services/ai/debugMentor";
import { computeIntegrityScore } from "../services/integrity/proctoringScore";
import { initialConceptState, reviewConcept, gradeFromOutcome, dueConcepts, DEFAULT_EASE_FACTOR, type ConceptReviewState as ConceptReviewStateShape } from "../services/learning/spacedRepetition";
import { ConceptReviewState } from "../entities/ConceptReviewState";
import { SubmissionIntegrity } from "../entities/SubmissionIntegrity";
import { SolveSession } from "../entities/SolveSession";
import { boundSnapshots, type ReplaySnapshot } from "../services/replay/replaySession";
import { getStableDifus } from "../utils/adaptiveDifficulty";
import { executeCodeWithInput } from "../services/codeExecutionService";
import { computeTotalFromParts, evaluateCodeWithAI } from "../ai/evaluator";
import { judgeWithSemaphore } from "../services/judgeWorker";
import { buildJudgeTests, loadTestContentByIds, sweepTestCache } from "../services/judgeWorker/testCache";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { normalizeMarkdownText } from "../utils/markdownNormalize";
import { inferNeedsInput } from "../utils/inferNeedsInput";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { chooseDefaultCheckerFromExpectedOutputs } from "../utils/checkerSpec";
import { concatForAI, decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, normalizeSafeCodeFilePath, pickEntryContent } from "../utils/multiFileSubmission";
import { buildLearningFirstFailure } from "../services/learning/firstFailure";
import { recordLearningOutcome } from "../services/learning/failureToSkillEngine";
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
import { encodeWebTaskPayload, normalizeWebTaskTemplate } from "../utils/webTaskPayload";
import { getSharedRedisClient, redisKey } from "../services/redis/sharedRedis";
import { cleanupCompletedPersonalTaskTests } from "../services/personalTaskCleanup";
import {
  buildLocalizedTopicTitleEnById as buildLocalizedTopicTitleEnByIdService,
  translateTopicTheoryUkToEn as translateTopicTheoryUkToEnService,
} from "../services/translation/topicTitleTranslator";
const tasksRouter = Router();

type ApiCodeFile = { path: string; content: string };
type UiLanguage = "uk" | "en";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// Topic-title localization helpers were extracted to
// services/translation/topicTitleTranslator.ts (audit M1 starter). Adapter
// wrappers below preserve the existing handler call sites until the broader
// route refactor lands.
async function buildLocalizedTopicTitleEnById(params: {
  req: AuthRequest;
  topics: Array<Topic | null | undefined>;
}): Promise<Map<number, string>> {
  return buildLocalizedTopicTitleEnByIdService({
    topics: params.topics,
    logContext: { requestId: params.req.requestId, userId: params.req.userId },
  });
}

async function translateTheoryUkToEn(params: {
  req: AuthRequest;
  topicId?: number | null;
  text: string;
}): Promise<string> {
  return translateTopicTheoryUkToEnService({
    text: params.text,
    topicId: params.topicId,
    logContext: { requestId: params.req.requestId, userId: params.req.userId },
  });
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
    const p = normalizeSafeCodeFilePath((f as any).path) ?? "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    // Keep paths constrained to the same safe relative subset as the judge.
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

  const headerLang = String(req.headers["x-ui-language"] ?? req.headers["x-lang"] ?? req.uiLanguage ?? "").toLowerCase().trim();
  if (headerLang.startsWith("en")) return "en";
  if (headerLang.startsWith("uk")) return "uk";

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
const conceptReviewRepo = () => AppDataSource.getRepository(ConceptReviewState);
const submissionIntegrityRepo = () => AppDataSource.getRepository(SubmissionIntegrity);
const solveSessionRepo = () => AppDataSource.getRepository(SolveSession);

function resolvePrincipal(req: AuthRequest): { type: "USER" | "STUDENT"; id: number } | null {
  const type: "USER" | "STUDENT" = req.userType === "STUDENT" ? "STUDENT" : "USER";
  const id = req.principalId ?? (type === "STUDENT" ? req.studentId : req.userId);
  if (!Number.isFinite(Number(id)) || Number(id) <= 0) return null;
  return { type, id: Number(id) };
}
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);

const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Difference in whole calendar days between two local dates. Uses the UTC of
// each date's local Y/M/D so it is immune to DST (a spring-forward day is only
// 23h, which would make a naive (ms / 86400000) diff round down to 0 and freeze
// the streak on a legitimate consecutive-day visit).
function diffInCalendarDays(later: Date, earlier: Date): number {
  const a = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const b = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((a - b) / MILLISECONDS_PER_DAY);
}

async function updateLearningStreakForUser(userId: number): Promise<void> {
  const user = await userRepo().findOne({ where: { id: userId } });
  if (!user) return;

  const today = startOfDay(new Date());
  const previous = user.lastActivityDate ? startOfDay(new Date(user.lastActivityDate)) : null;

  if (!previous) {
    user.currentStreak = 1;
  } else {
    const daysDiff = diffInCalendarDays(today, previous);
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
const PERSONAL_TOPIC_PASS_GRADE = 60;

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

const GENERATE_RESERVE_LUA = `
local cooldownKey = KEYS[1]
local inflightKey = KEYS[2]

local nowMs = tonumber(ARGV[1])
local cooldownMs = tonumber(ARGV[2])
local inflightTtlMs = tonumber(ARGV[3])

if redis.call('EXISTS', inflightKey) == 1 then
  return {0, 2000}
end

local cooldownRaw = redis.call('GET', cooldownKey)
if cooldownRaw then
  local notBefore = tonumber(cooldownRaw) or 0
  if notBefore > nowMs then
    return {1, notBefore - nowMs}
  end
end

redis.call('SET', inflightKey, tostring(nowMs), 'PX', inflightTtlMs)
local nextNotBefore = nowMs + cooldownMs
redis.call('SET', cooldownKey, tostring(nextNotBefore), 'PX', math.max(cooldownMs * 3, 60000))
return {2, cooldownMs}
`;

function randomIntInclusive(min: number, max: number): number {
  const lo = Math.floor(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function makeGenerateThrottleKey(userId: number, lang: "JAVA" | "PYTHON" | "CPP"): string {
  return `${userId}:${lang}`;
}

function generateCooldownRedisKey(throttleKey: string): string {
  return redisKey("tasks", "generate", "cooldown", throttleKey);
}

function generateInflightRedisKey(throttleKey: string): string {
  return redisKey("tasks", "generate", "inflight", throttleKey);
}

async function reserveGenerateSlot(params: {
  throttleKey: string;
  nowMs: number;
  cooldownMs: number;
  inflightTtlMs: number;
}): Promise<{ kind: "ok" | "inflight" | "cooldown"; retryAfterMs: number }> {
  const redis = await getSharedRedisClient().catch(() => null);
  if (redis) {
    const raw = await redis.eval(GENERATE_RESERVE_LUA, {
      keys: [
        generateCooldownRedisKey(params.throttleKey),
        generateInflightRedisKey(params.throttleKey),
      ],
      arguments: [
        String(params.nowMs),
        String(params.cooldownMs),
        String(params.inflightTtlMs),
      ],
    }).catch(() => null);

    const payload = Array.isArray(raw) ? raw : [];
    const state = Number(payload[0] ?? 2);
    const retryAfterMs = Math.max(200, Number(payload[1] ?? 0));

    if (state === 0) {
      return { kind: "inflight", retryAfterMs: Math.max(2000, retryAfterMs) };
    }
    if (state === 1) {
      return { kind: "cooldown", retryAfterMs };
    }
    return { kind: "ok", retryAfterMs: 0 };
  }

  if (generateInFlightByUserLang.has(params.throttleKey)) {
    return { kind: "inflight", retryAfterMs: 2000 };
  }

  const notBefore = generateCooldownByUserLang.get(params.throttleKey) ?? 0;
  if (notBefore > params.nowMs) {
    return { kind: "cooldown", retryAfterMs: Math.max(200, notBefore - params.nowMs) };
  }

  generateInFlightByUserLang.add(params.throttleKey);
  generateCooldownByUserLang.set(params.throttleKey, params.nowMs + params.cooldownMs);
  return { kind: "ok", retryAfterMs: 0 };
}

async function releaseGenerateSlot(throttleKey: string): Promise<void> {
  generateInFlightByUserLang.delete(throttleKey);

  const redis = await getSharedRedisClient().catch(() => null);
  if (!redis) return;

  await redis.del(generateInflightRedisKey(throttleKey)).catch(() => undefined);
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

function buildPrevTopicsTextFromRange(params: { topics: Topic[]; startTopicIndex: number; endTopicIndex: number; titleByTopicId?: Map<number, string> }): string {
  const selected = params.topics.filter(t => t.topicIndex >= params.startTopicIndex && t.topicIndex <= params.endTopicIndex);
  const titles = selected
    .map(t => {
      const topicId = Number((t as any)?.id);
      const localized = Number.isFinite(topicId) ? params.titleByTopicId?.get(topicId) : undefined;
      return String(localized ?? t.title ?? "").trim();
    })
    .filter(Boolean);
  return titles.join("\n");
}

async function refreshPersonalMiniProjectIfNeeded(params: {
  task: Task;
  definition: ReturnType<typeof getPersonalMiniProjectDefinition>;
}): Promise<Task> {
  const { task, definition } = params;
  if (task.completed !== 0) return task;

  const existingTests = await testDataRepo().find({
    where: { personalTask: { id: task.id } } as any,
    order: { id: "ASC" } as any,
  });
  const needsRefresh = !task.description.includes("### Формат вводу") || existingTests.length < definition.tests.length;
  if (!needsRefresh) return task;

  task.description = definition.description;
  task.projectSpec = definition.projectSpec;
  await taskRepo().save(task);

  existingTests.slice(0, definition.tests.length).forEach((row, index) => {
    row.input = definition.tests[index].input;
    row.expectedOutput = definition.tests[index].expectedOutput;
    row.points = definition.tests[index].points;
  });
  const newTests = definition.tests.slice(existingTests.length).map(test => testDataRepo().create({
    input: test.input,
    expectedOutput: test.expectedOutput,
    points: test.points,
    personalTask: { id: task.id } as any,
  }));
  await testDataRepo().save([...existingTests, ...newTests]);
  return task;
}

async function findOrCreatePersonalMiniProject(params: {
  userId: number;
  lang: "JAVA" | "PYTHON" | "CPP";
  sequence: number;
  topics: Topic[];
}): Promise<Task | null> {
  const prefix = `MPJ:${params.lang}:${params.sequence}`;
  const existing = await taskRepo()
    .createQueryBuilder("task")
    .where("task.user_id = :userId", { userId: params.userId })
    .andWhere("task.lang = :lang", { lang: params.lang })
    .andWhere("task.subtitle LIKE :prefix", { prefix: `${prefix}|%` })
    .orderBy("task.createdAt", "ASC")
    .getOne();
  const definition = getPersonalMiniProjectDefinition(params.lang, params.sequence);
  if (existing) return refreshPersonalMiniProjectIfNeeded({ task: existing, definition });

  const task = await taskRepo().save(taskRepo().create({
    user: { id: params.userId } as any,
    topic: null,
    title: `${definition.title} · ${params.sequence + 1}`,
    subtitle: `${prefix}|MINI_PROJECT|${definition.key}`,
    description: definition.description,
    descriptionMarkdown: definition.description,
    template: definition.template,
    taskMode: "CODE",
    projectSpec: definition.projectSpec,
    draftCode: definition.template,
    finalCode: "",
    completed: 0,
    lang: params.lang,
    difus: 0,
    numInTopic: 1,
    topicIndex: params.topics.length > 0 ? params.topics[params.topics.length - 1].topicIndex : 0,
    type: "TOPIC" as TaskType,
    ioType: "STDIN_STDOUT" as TaskIoType,
  })) as Task;

  const tests = definition.tests.map(test => testDataRepo().create({
    input: test.input,
    expectedOutput: test.expectedOutput,
    points: test.points,
    personalTask: { id: task.id } as any,
  }));
  await testDataRepo().save(tests);
  return task;
}

/* Legacy bulk grade helper no longer used by the current task route.
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

*/
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

  // Separate blocks that need translation from those that don't
  const needsTranslation: typeof blocks = [];
  
  for (const b of blocks) {
    const contentEn = String((b as any).contentEn ?? "");
    const isFresh =
      contentEn.trim().length > 0 &&
      !looksLikeTranslationProviderErrorText(contentEn) &&
      Number((b as any).translationVersionEn ?? 0) === Number((b as any).version ?? 0);

    if (isFresh) {
      out.set(b.id, contentEn);
    } else {
      needsTranslation.push(b);
    }
  }

  // Batch translate remaining blocks (improves performance with many blocks)
  if (needsTranslation.length > 0) {
    const toTranslate = needsTranslation.map(b => ({
      id: b.id,
      markdown: String(b.content ?? "")
    }));

    const translatedMap = await (async () => {
      const temp = new Map<number, string>();
      const maxConcurrency = 5;
      
      for (let i = 0; i < toTranslate.length; i += maxConcurrency) {
        const batch = toTranslate.slice(i, i + maxConcurrency);
        const promises = batch.map(async (item) => {
          try {
            const translated = await translateMarkdownUkToEn(item.markdown);
            if (translated.trim().length > 0 && !looksLikeTranslationProviderErrorText(translated)) {
              temp.set(item.id, translated);
            }
          } catch (error: any) {
            logger.warn("[tasks] translate theory block uk->en failed", {
              requestId: params.req.requestId,
              userId: params.req.userId,
              theoryBlockId: item.id,
              error: error?.message ?? String(error)
            });
          }
        });

        await Promise.all(promises);
      }

      return temp;
    })();

    // Batch update all translated blocks at once
    const blocksToSave = needsTranslation
      .filter(b => translatedMap.has(b.id))
      .map(b => {
        const translated = translatedMap.get(b.id)!;
        (b as any).contentEn = translated;
        (b as any).translationVersionEn = Number((b as any).version ?? 1);
        (b as any).translatedAtEn = new Date();
        return b;
      });

    if (blocksToSave.length > 0) {
      try {
        await theoryBlockRepo().save(blocksToSave);
      } catch (error: any) {
        logger.warn("[tasks] batch save translated theory blocks failed", {
          requestId: params.req.requestId,
          userId: params.req.userId,
          count: blocksToSave.length,
          error: error?.message ?? String(error)
        });
      }
    }

    // Add translated results to output
    for (const [blockId, translated] of translatedMap.entries()) {
      out.set(blockId, translated);
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

function looksLikeNumberedChecklistPracticalTask(text: string): boolean {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s+/.test(line));

  if (lines.length < 3) return false;

  const sample = lines.slice(0, Math.min(lines.length, 8));
  const numbered = sample.filter((line) => /^\d+[\.)]\s+/.test(line)).length;
  const bullets = sample.filter((line) => /^[-*•]\s+/.test(line)).length;
  const markers = numbered + bullets;

  if (numbered < 2 && markers < 4) return false;
  return markers / sample.length >= 0.55;
}

function rewriteChecklistPracticalTaskToNarrative(text: string): string {
  const source = String(text ?? "").trim();
  if (!source) return "";
  if (!looksLikeNumberedChecklistPracticalTask(source)) return source;

  const fragments = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^\s*(?:\d+[\.)]|[-*•])\s+/, "").trim())
    .filter(Boolean)
    .map((part) => {
      const compact = part.replace(/\s+/g, " ").trim();
      if (!compact) return "";
      return /[.!?…:]$/.test(compact) ? compact : `${compact}.`;
    })
    .filter(Boolean);

  if (fragments.length < 2) return source;
  return fragments.join(" ");
}

function formatStatementSectionValueForMarkdown(value: string, options?: {
  preferCodeBlock?: boolean;
}): string {
  const normalized = normalizeMarkdownText(String(value ?? ""))
    .split(/\r?\n/)
    .filter(line => !/^\s*```(?:[a-z0-9_-]+)?\s*$/i.test(line))
    .join("\n")
    .trim();
  if (!normalized) return "";

  const sanitized = normalized
    .replace(/```/g, "")
    .split(/\r?\n/)
    .map(line => line.replace(/^\s*`([^`\n]*)`\s*$/, "$1"))
    .join("\n")
    .trim();
  const hasMultipleLines = /\n/.test(sanitized);
  if (options?.preferCodeBlock || hasMultipleLines) {
    return `\`\`\`text\n${sanitized}\n\`\`\``;
  }

  return sanitized;
}

function composeTaskStatementMarkdown(params: {
  practicalTask: string;
  inputFormat?: string | null;
  outputFormat?: string | null;
  constraints?: string | null;
  uiLanguage?: UiLanguage;
}): string {
  const practical = rewriteChecklistPracticalTaskToNarrative(
    normalizeMarkdownText(String(params.practicalTask ?? "")).trim()
  );
  const inputFormat = normalizeMarkdownText(String(params.inputFormat ?? "")).trim();
  const outputFormat = normalizeMarkdownText(String(params.outputFormat ?? "")).trim();
  const constraints = normalizeMarkdownText(String(params.constraints ?? "")).trim();
  const uiLanguage = params.uiLanguage ?? "uk";

  const sections: string[] = [];
  if (practical) sections.push(practical);

  const fallbackInputFormat = i18nText(uiLanguage, "Вхідних даних немає. (stdin порожній)", "No input data. (stdin is empty)");
  const fallbackOutputFormat = i18nText(uiLanguage, "Виведіть результат згідно умови.", "Output the result according to the statement.");
  const renderedInputFormat = inputFormat
    ? formatStatementSectionValueForMarkdown(inputFormat, {
        preferCodeBlock: /\n/.test(inputFormat)
      })
    : fallbackInputFormat;
  const renderedOutputFormat = outputFormat
    ? formatStatementSectionValueForMarkdown(outputFormat, {
        // Output format is a strict contract for judge checks; keep it visually exact.
        preferCodeBlock: true
      })
    : fallbackOutputFormat;

  // Always include formats so students see the same contract that tests use.
  sections.push(i18nText(uiLanguage, "#### Формат вхідних даних", "#### Input format"));
  sections.push(renderedInputFormat);

  sections.push(i18nText(uiLanguage, "#### Формат вихідних даних", "#### Output format"));
  sections.push(renderedOutputFormat);

  if (constraints) {
    sections.push(i18nText(uiLanguage, "#### Обмеження", "#### Constraints"));
    sections.push(constraints);
  }

  return sections.join("\n\n").trim();
}

function stripCodeCommentsForVariableCheck(source: string, lang: TaskLang): string {
  const text = String(source || "");
  const out: string[] = [];
  let inBlockComment = false;

  // Use a linear scan so attacker-controlled source cannot trigger the
  // quadratic backtracking behavior of the old comment-removal regexes.
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] || "";

    if (lang !== "PYTHON" && inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      } else if (ch === "\n") {
        out.push("\n");
      }
      continue;
    }

    if (lang === "PYTHON" && ch === "#") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i += 1;
      continue;
    }

    if (lang !== "PYTHON" && ch === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (lang !== "PYTHON" && ch === "/" && next === "/") {
      while (i + 1 < text.length && text[i + 1] !== "\n") i += 1;
      continue;
    }

    out.push(ch);
  }

  return out.join("");
}

function shouldRequireVariableDeclarations(task: Task): boolean {
  if (task.taskMode === "WEB") return false;
  const haystack = [
    task.title,
    task.subtitle,
    task.description,
    (task as any)?.topic?.title,
  ].map(v => String(v || "")).join(" ").toLowerCase();

  return (
    /типи\s+даних|змінн|оголосити|створити\s+змінн|variables?|data\s+types?|declare|assignment/.test(haystack)
    && !/масив|array|цикл|loop|function|функц/.test(haystack)
  );
}

const MAX_DECLARATION_SOURCE_LENGTH = 65536;
const MAX_DECLARATION_SCAN = 4096;

function isAsciiWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isAsciiIdentifierStart(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || char === "_";
}

function isAsciiIdentifierPart(char: string): boolean {
  const code = char.charCodeAt(0);
  return isAsciiIdentifierStart(char) || (code >= 48 && code <= 57);
}

function countVariableDeclarations(source: string, lang: TaskLang): number {
  const clean = stripCodeCommentsForVariableCheck(source, lang);
  if (lang === "PYTHON") {
    return clean
      .split(/\r?\n/)
      .filter(line => /^\s*[A-Za-z_]\w*\s*=\s*(?!=)/.test(line) && !/^\s*(print|return)\b/.test(line.trim()))
      .length;
  }

  const types = lang === "CPP"
    ? ["std::string", "long long", "string", "int", "long", "double", "float", "bool", "char", "auto"]
    : ["byte", "short", "int", "long", "float", "double", "boolean", "char", "String", "var"];
  let count = 0;

  for (const statement of clean.slice(0, MAX_DECLARATION_SOURCE_LENGTH).split(";")) {
    const trimmed = statement.trimStart();
    let typeName: string | null = null;

    for (const candidate of types) {
      if (trimmed.startsWith(candidate)) {
        const boundary = trimmed.charAt(candidate.length);
        if (!boundary || isAsciiWhitespace(boundary)) {
          typeName = candidate;
          break;
        }
      }
    }

    if (!typeName) continue;

    let index = typeName.length;
    for (let steps = 0; steps < MAX_DECLARATION_SCAN; steps += 1) {
      const char = trimmed.charAt(index);
      if (!isAsciiWhitespace(char)) break;
      index += 1;
    }

    const first = trimmed.charAt(index);
    if (!first || !isAsciiIdentifierStart(first)) continue;
    index += 1;
    for (let steps = 0; steps < MAX_DECLARATION_SCAN; steps += 1) {
      const char = trimmed.charAt(index);
      if (!isAsciiIdentifierPart(char)) break;
      index += 1;
    }

    for (let steps = 0; steps < MAX_DECLARATION_SCAN; steps += 1) {
      const char = trimmed.charAt(index);
      if (!isAsciiWhitespace(char)) break;
      index += 1;
    }
    const tail = trimmed.charAt(index);
    if (!tail || tail === "=") count += 1;
  }

  return count;
}

function validateVariableDeclarationTaskSubmission(task: Task, source: string, uiLanguage: UiLanguage): string | null {
  if (!shouldRequireVariableDeclarations(task)) return null;

  const oneVariableOnly = /одн(у|а|ієї)\s+змінн|one\s+variable|single\s+variable/.test(String(task.description || "").toLowerCase());
  const required = oneVariableOnly ? 1 : 2;
  const found = countVariableDeclarations(source, task.lang);
  if (found >= required) return null;

  return i18nText(
    uiLanguage,
    `Ця задача перевіряє створення змінних. Зараз у коді знайдено ${found} оголошень/присвоєнь, потрібно щонайменше ${required}. Не друкуй готовий текст напряму — створи змінні й виведи їх значення.`,
    `This task checks variable creation. Your code has ${found} declaration/assignment(s), but at least ${required} are required. Do not print hardcoded text directly — create variables and output their values.`
  );
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
/* Legacy theory fallback superseded by getTopicTheoryInfo.
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

*/
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
  const s = normalizeLegacyOutputFormatSection(String(statementMarkdown ?? ""));
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

/**
 * Older generated tasks sometimes stored each expected output line as an
 * inline Markdown code span (`7`, `25.5`, `true`). That renders as separate
 * rounded pills instead of one output sample. Normalize that persisted
 * representation when the task is read; newly generated tasks already use a
 * fenced text block.
 */
function normalizeLegacyOutputFormatSection(statementMarkdown: string): string {
  const source = String(statementMarkdown ?? "");
  if (!source.trim()) return source;

  return source.replace(
    /(^#{2,6}\s*(?:Формат\s+вихідних\s+даних|Output\s+format)\s*$)([\s\S]*?)(?=^#{2,6}\s+|(?![\s\S]))/gim,
    (match, heading: string, rawBody: string) => {
      const body = String(rawBody ?? "").trim();
      if (!body || /^```/i.test(body)) return match;

      const outputLines = body
        .split(/\r?\n/)
        .filter((line: string) => !/^\s*```(?:text)?\s*$/i.test(line))
        .map((line: string) => line.replace(/^\s*`([^`\n]*)`\s*$/, "$1"));
      const output = outputLines.join("\n").trim();
      if (!output) return match;

      return `${heading}\n\n\`\`\`text\n${output}\n\`\`\``;
    }
  );
}

function extractHintsFromGradeFeedback(feedback: string | null | undefined): string[] {
  const text = String(feedback ?? "");
  if (!text.trim()) return [];
  const marker = text.match(/(?:\u041f\u0456\u0434\u043a\u0430\u0437\u043a\u0438|Hints)\s*(?:\([^:\n]*\))?\s*:/iu);
  if (!marker || typeof marker.index !== "number") return [];

  return text
    .slice(marker.index + marker[0].length)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith("-") && line.slice(1).trim().length > 0)
    .map(line => line.slice(1).trim())
    .slice(0, 4);
}

function latestTaskGrade(task: Task): Grade | null {
  const grades = Array.isArray((task as any).grades) ? (task as any).grades as Grade[] : [];
  return [...grades]
    .filter(Boolean)
    .sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)))[0] ?? null;
}

function mapTaskToDto(task: Task, gradeTaskIds?: Set<number>, opts?: {
  includeTheoryDebug?: boolean;
  uiLanguage?: UiLanguage;
  localizedTheoryEnByBlockId?: Map<number, string>;
  localizedLegacyTheoryEnByTopicId?: Map<number, string>;
  localizedTopicTitleEnByTopicId?: Map<number, string>;
  latestGrade?: Grade | null;
}) {
  const uiLanguage = opts?.uiLanguage ?? "uk";
  const lastGrade = opts?.latestGrade ?? latestTaskGrade(task);
  const hasGrade = gradeTaskIds ? gradeTaskIds.has(task.id) : Boolean(lastGrade) || !!task.completed;
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
  const rawTopicTitle = typeof (task.topic as any)?.title === "string" ? (task.topic as any).title : null;
  const topicTitle = uiLanguage === "en" && typeof topicId === "number" && Number.isFinite(topicId)
    ? (opts?.localizedTopicTitleEnByTopicId?.get(topicId) ?? rawTopicTitle)
    : rawTopicTitle;
  const topicIndex = typeof (task as any)?.topicIndex === "number" && Number.isFinite((task as any).topicIndex)
    ? Number((task as any).topicIndex)
    : null;

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
    topicIndex,
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
    projectSpec: (task as any).projectSpec ?? null,
    webTemplateFiles: taskMode === "WEB" ? normalizedWebTemplate?.files ?? normalizeWebTaskFiles((task as any).webTemplateFiles ?? []) : undefined,
    webValidationRules: taskMode === "WEB" ? normalizeWebRules((task as any).webValidationRules ?? normalizedWebTemplate?.rules ?? []) : undefined,
    starterCode,
    starterFiles: starterFiles ?? undefined,
    starterEntryFile: starterEntry ?? undefined,
    userCode,
    userFiles: userFiles ?? undefined,
    userEntryFile: userEntry ?? undefined,
    finalCode: task.finalCode || null,
    lastGradeTotal: lastGrade?.total ?? null,
    lastGradeFeedback: lastGrade?.aiFeedback ?? null,
    lastGradeHints: extractHintsFromGradeFeedback(lastGrade?.aiFeedback),
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
    return Math.max(25_000, Math.min(90_000, Math.floor(v)));
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
    semanticRetries: params.type === "CONTROL" ? 1 : 0,
    allowedIoTypes: generationAllowedIoTypes,
    previousTasks: previousTasksBrief,
    previousTaskPractices: previousTaskPracticesForUniq,
    previousTaskTitles: previousTaskTitlesForUniq,
    ...(params.prevTopicsText ? { prevTopics: params.prevTopicsText, isControl: params.type === "CONTROL" } : {})
  } as any, {
    language: params.userLanguage,
    requestId: params.requestId,
    maxAttempts: params.type === "CONTROL" ? 2 : 1,
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
    const latestGradesByTaskId = new Map<number, Grade>();
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
        if (typeof tid === "number") {
          gradeTaskIds.add(tid);
          const current = latestGradesByTaskId.get(tid);
          if (!current || Number(new Date(g.createdAt)) > Number(new Date(current.createdAt))) {
            latestGradesByTaskId.set(tid, g);
          }
        }
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
    const localizedTopicTitleEnByTopicId = uiLanguage === "en"
      ? await buildLocalizedTopicTitleEnById({ req, topics: tasks.map(t => (t as any)?.topic) })
      : new Map<number, string>();

    if (includeTheoryDebug) res.setHeader("Cache-Control", "no-store");
    return res.json(tasks.map(t => mapTaskToDto(t, gradeTaskIds, {
      includeTheoryDebug,
      uiLanguage,
      latestGrade: latestGradesByTaskId.get(t.id) ?? null,
      localizedTheoryEnByBlockId,
      localizedLegacyTheoryEnByTopicId,
      localizedTopicTitleEnByTopicId
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
    const grades = await gradeRepo().find({
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
      take: 1
    });
    const grade = grades[0] ?? null;
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
    const localizedTopicTitleEnByTopicId = uiLanguage === "en"
      ? await buildLocalizedTopicTitleEnById({ req, topics: [(task as any)?.topic] })
      : new Map<number, string>();

    if (includeTheoryDebug) res.setHeader("Cache-Control", "no-store");
    return res.json(mapTaskToDto(task, gradeTaskIds, {
      includeTheoryDebug,
      uiLanguage,
      latestGrade: grade,
      localizedTheoryEnByBlockId,
      localizedLegacyTheoryEnByTopicId,
      localizedTopicTitleEnByTopicId
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

    const submittedGrade = await gradeRepo().findOne({
      where: { user: { id: req.userId }, task: { id: task.id } },
      order: { createdAt: "DESC" }
    });
    let submittedReview: any = null;
    if (submittedGrade?.comparisonFeedback) {
      try {
        const parsed = JSON.parse(String(submittedGrade.comparisonFeedback));
        if (parsed && Array.isArray(parsed.questions)) submittedReview = parsed;
      } catch {
        submittedReview = null;
      }
    }

    return res.json({
      taskId: task.id,
      title: task.title,
      count: questions.length,
      questions,
      submitted: Boolean(submittedGrade),
      submittedGrade: submittedGrade ? {
        total: Number(submittedGrade.total ?? 0),
        correctAnswers: Number(submittedReview?.correctAnswers ?? 0),
        totalQuestions: Number(submittedReview?.totalQuestions ?? questions.length)
      } : null,
      submittedReview
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

    // Persist submission atomically. The pre-check above is only a fast path:
    // two concurrent submits (e.g. a double-click) could both pass it and
    // create duplicate grades. Serialize per-user with a row lock and re-check
    // inside the transaction — same pattern as the practice-task submit path.
    const savedGrade = await AppDataSource.transaction("SERIALIZABLE", async manager => {
      await manager
        .createQueryBuilder(User, "user")
        .setLock("pessimistic_write")
        .where("user.id = :userId", { userId: req.userId })
        .getOne();

      const gradeRepoM = manager.getRepository(Grade);
      const alreadySubmitted = await gradeRepoM.findOne({
        where: { user: { id: req.userId }, task: { id: task.id } },
        order: { createdAt: "DESC" }
      });
      if (alreadySubmitted) {
        throw new Error("QUIZ_ALREADY_SUBMITTED");
      }

      await manager.getRepository(Task).update({ id: task.id } as any, {
        completed: 1,
        finalCode: JSON.stringify(answers)
      } as any);

      const grade = gradeRepoM.create({
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
      return await gradeRepoM.save(grade);
    });

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
    if (error?.message === "QUIZ_ALREADY_SUBMITTED") {
      return res.status(409).json({ message: "QUIZ_ALREADY_SUBMITTED" });
    }
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

// On-demand "Explain my error" — a plain-language explanation of why a run
// failed (compile / runtime / TLE / wrong answer), distinct from the terse
// hint ladder produced automatically on submit. Rate-limited to bound AI spend.
tasksRouter.post("/explain-error", authMiddleware, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const langRaw = String(body.language ?? "").trim().toUpperCase();
    const language = (["JAVA", "PYTHON", "CPP"].includes(langRaw) ? langRaw : "PYTHON") as HintLanguage;

    const code = String(body.code ?? "").slice(0, 20_000);
    if (!code.trim()) {
      return res.status(400).json({ message: "CODE_REQUIRED" });
    }

    const verdict = String(body.verdict ?? "").slice(0, 32);
    const stderr = body.stderr == null ? "" : String(body.stderr).slice(0, 8000);
    const taskTitle = String(body.taskTitle ?? "").slice(0, 300);
    const taskText = String(body.taskText ?? "").slice(0, 4000);

    const rawFailures = Array.isArray(body.failures) ? body.failures.slice(0, 3) : [];
    const failures = rawFailures
      .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
      .map((f) => ({
        testId: typeof f.testId === "number" ? f.testId : undefined,
        input: String(f.input ?? "").slice(0, 1000),
        expected: String(f.expected ?? "").slice(0, 1000),
        actual: String(f.actual ?? "").slice(0, 1000),
        verdict: f.verdict == null ? undefined : String(f.verdict).slice(0, 32),
        stderr: f.stderr == null ? null : String(f.stderr).slice(0, 2000),
      }));

    // Nothing to explain if the run succeeded and carried no error signal.
    const hasError = verdict && verdict.toUpperCase() !== "AC" || stderr.trim() || failures.length > 0;
    if (!hasError) {
      return res.status(400).json({ message: "NO_ERROR_TO_EXPLAIN" });
    }

    const result = await explainSubmissionError({
      taskTitle,
      taskText,
      language,
      code,
      verdict,
      stderr,
      failures,
    });

    return res.json({ explanation: result.explanation, source: result.source });
  } catch (error: any) {
    logger.warn("[tasks] explain-error failed", { requestId: req.requestId, error: error?.message });
    return res.status(503).json({ message: "EXPLAIN_UNAVAILABLE" });
  }
});

// Save a recorded solve session (bounded snapshots) for later replay.
tasksRouter.post("/solve-replay", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const principal = resolvePrincipal(req);
    if (!principal) return res.status(401).json({ message: "UNAUTHORIZED" });

    const b = (req.body ?? {}) as Record<string, unknown>;
    const rawSnaps = Array.isArray(b.snapshots) ? b.snapshots : [];
    const snapshots: ReplaySnapshot[] = rawSnaps
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({ tMs: Number(s.tMs) || 0, code: String(s.code ?? "") }));
    const bounded = boundSnapshots(snapshots);
    if (bounded.length === 0) return res.status(400).json({ message: "NO_SNAPSHOTS" });

    const taskKindRaw = String(b.taskKind ?? "").toUpperCase();
    const taskKind = (["LIBRARY", "TOPIC", "CONTEST", "PLAYGROUND"].includes(taskKindRaw) ? taskKindRaw : "UNKNOWN") as
      "LIBRARY" | "TOPIC" | "CONTEST" | "PLAYGROUND" | "UNKNOWN";
    const taskId = Number.isFinite(Number(b.taskId)) && Number(b.taskId) > 0 ? Number(b.taskId) : null;
    const language = (String(b.language ?? "").slice(0, 16) || null);
    const durationMs = Math.max(0, Math.floor(Number(b.durationMs) || (bounded[bounded.length - 1]?.tMs ?? 0)));
    const finalVerdict = b.finalVerdict == null ? null : String(b.finalVerdict).slice(0, 16);

    const row = solveSessionRepo().create({
      principalType: principal.type,
      principalId: principal.id,
      taskKind,
      taskId,
      language,
      snapshots: JSON.stringify(bounded),
      durationMs,
      finalVerdict,
    });
    await solveSessionRepo().save(row);
    return res.status(201).json({ id: row.id, snapshotCount: bounded.length });
  } catch (error: any) {
    logger.warn("[tasks] solve-replay save failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "SAVE_FAILED" });
  }
});

// Fetch a saved solve session for playback (own sessions only).
tasksRouter.get("/solve-replay/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const principal = resolvePrincipal(req);
    if (!principal) return res.status(401).json({ message: "UNAUTHORIZED" });
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ message: "INVALID_ID" });

    const row = await solveSessionRepo().findOne({ where: { id } as any });
    if (!row) return res.status(404).json({ message: "NOT_FOUND" });
    if (row.principalType !== principal.type || row.principalId !== principal.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    let snapshots: ReplaySnapshot[] = [];
    try { snapshots = JSON.parse(row.snapshots) as ReplaySnapshot[]; } catch { /* corrupt → empty */ }

    return res.json({
      id: row.id,
      taskKind: row.taskKind,
      taskId: row.taskId,
      language: row.language,
      durationMs: row.durationMs,
      finalVerdict: row.finalVerdict,
      createdAt: row.createdAt,
      snapshots,
    });
  } catch (error: any) {
    logger.warn("[tasks] solve-replay fetch failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "FETCH_FAILED" });
  }
});

// Integrity score from client-side proctoring signals (stateless: computed and
// returned; persistence for teacher review is a follow-up). Privacy-respecting:
// only aggregate behavioural counts, never keystrokes/screen.
tasksRouter.post("/proctoring-score", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    const result = computeIntegrityScore({
      finalCodeLength: num(b.finalCodeLength),
      totalPastedChars: num(b.totalPastedChars),
      largestPasteChars: num(b.largestPasteChars),
      pasteCount: num(b.pasteCount),
      blurCount: num(b.blurCount),
      solveDurationMs: num(b.solveDurationMs),
      typedChars: b.typedChars == null ? undefined : num(b.typedChars),
    });

    // Persist the event for teacher review (best-effort — never fail the
    // response on a write error). Only logged when a task is referenced.
    const principal = resolvePrincipal(req);
    const taskKindRaw = String(b.taskKind ?? "").toUpperCase();
    const taskKind = (["LIBRARY", "TOPIC", "CONTEST"].includes(taskKindRaw) ? taskKindRaw : "UNKNOWN") as
      "LIBRARY" | "TOPIC" | "CONTEST" | "UNKNOWN";
    const taskId = Number.isFinite(Number(b.taskId)) && Number(b.taskId) > 0 ? Number(b.taskId) : null;
    if (principal && (taskId || taskKind !== "UNKNOWN")) {
      void submissionIntegrityRepo()
        .save(
          submissionIntegrityRepo().create({
            principalType: principal.type,
            principalId: principal.id,
            taskKind,
            taskId,
            score: result.score,
            level: result.level,
            flags: JSON.stringify(result.flags),
          })
        )
        .catch((err) => logger.warn("[tasks] proctoring persist failed", { requestId: req.requestId, error: err?.message }));
    }

    return res.json(result);
  } catch (error: any) {
    logger.warn("[tasks] proctoring-score failed", { requestId: req.requestId, error: error?.message });
    return res.status(400).json({ message: "INVALID_SIGNALS" });
  }
});

// Spaced-repetition: record a practice outcome for a concept and advance its
// SM-2 schedule. Stateful — the (principal, concept) row is loaded, updated and
// persisted, so review schedules survive across sessions.
tasksRouter.post("/concept-review", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const principal = resolvePrincipal(req);
    if (!principal) return res.status(401).json({ message: "UNAUTHORIZED" });

    const b = (req.body ?? {}) as Record<string, unknown>;
    const conceptKey = String(b.conceptKey ?? "").trim().slice(0, 191);
    if (!conceptKey) return res.status(400).json({ message: "CONCEPT_KEY_REQUIRED" });

    const now = Date.now();
    const existing = await conceptReviewRepo().findOne({
      where: { principalType: principal.type, principalId: principal.id, conceptKey } as any,
    });

    const state: ConceptReviewStateShape = existing
      ? {
          repetitions: existing.repetitions,
          easeFactor: Number(existing.easeFactor) || DEFAULT_EASE_FACTOR,
          intervalDays: existing.intervalDays,
          dueAtMs: existing.dueAt ? new Date(existing.dueAt).getTime() : now,
          mastered: existing.mastered,
        }
      : initialConceptState(now);

    const outcome = (b.outcome && typeof b.outcome === "object" ? b.outcome : {}) as Record<string, unknown>;
    const grade = typeof b.grade === "number"
      ? b.grade
      : gradeFromOutcome({
          solved: Boolean(outcome.solved),
          attempts: Math.max(1, Math.floor(Number(outcome.attempts) || 1)),
          hintsUsed: Math.max(0, Math.floor(Number(outcome.hintsUsed) || 0)),
          testsPassedRatio: Number.isFinite(Number(outcome.testsPassedRatio)) ? Number(outcome.testsPassedRatio) : undefined,
        });

    const next = reviewConcept(state, grade, now);

    const row: ConceptReviewState = existing ?? conceptReviewRepo().create({
      principalType: principal.type,
      principalId: principal.id,
      conceptKey,
    });
    row.repetitions = next.repetitions;
    row.easeFactor = next.easeFactor;
    row.intervalDays = next.intervalDays;
    row.dueAt = new Date(next.dueAtMs);
    row.mastered = next.mastered;
    await conceptReviewRepo().save(row);

    return res.json({ conceptKey, state: next, grade });
  } catch (error: any) {
    logger.warn("[tasks] concept-review failed", { requestId: req.requestId, error: error?.message });
    return res.status(400).json({ message: "INVALID_REVIEW" });
  }
});

// Concepts that are due for review now, soonest-overdue first.
tasksRouter.get("/concepts/due", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const principal = resolvePrincipal(req);
    if (!principal) return res.status(401).json({ message: "UNAUTHORIZED" });

    const rows = await conceptReviewRepo().find({
      where: { principalType: principal.type, principalId: principal.id } as any,
    });
    const now = Date.now();
    const items = rows.map((r) => ({
      conceptKey: r.conceptKey,
      state: {
        repetitions: r.repetitions,
        easeFactor: Number(r.easeFactor) || DEFAULT_EASE_FACTOR,
        intervalDays: r.intervalDays,
        dueAtMs: r.dueAt ? new Date(r.dueAt).getTime() : now,
        mastered: r.mastered,
      },
    }));
    const due = dueConcepts(items, now);
    return res.json({ now, total: items.length, due });
  } catch (error: any) {
    logger.warn("[tasks] concepts/due failed", { requestId: req.requestId, error: error?.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Multi-turn Socratic debug mentor. Stateless: the client replays the bounded
// transcript each turn. Student messages are prompt-injection sanitized before
// reaching the LLM; replies are post-filtered to never contain code blocks.
tasksRouter.post("/debug-chat", authMiddleware, submissionRateLimitMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const langRaw = String(body.language ?? "").trim().toUpperCase();
    const language = (["JAVA", "PYTHON", "CPP"].includes(langRaw) ? langRaw : "PYTHON") as HintLanguage;

    const code = String(body.code ?? "").slice(0, 20_000);
    if (!code.trim()) {
      return res.status(400).json({ message: "CODE_REQUIRED" });
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages: DebugChatMessage[] = rawMessages
      .filter((m): m is Record<string, unknown> => !!m && typeof m === "object")
      .map((m) => {
        const role: DebugChatMessage["role"] = String(m.role) === "mentor" ? "mentor" : "student";
        let content = String(m.content ?? "").slice(0, DEBUG_CHAT_MAX_MESSAGE_CHARS);
        // Sanitize ONLY student turns (mentor turns are our own output).
        if (role === "student") content = neutralizePromptInjection(content);
        return { role, content };
      })
      .filter((m) => m.content.trim().length > 0)
      .slice(-DEBUG_CHAT_MAX_HISTORY);

    if (messages.length === 0) {
      return res.status(400).json({ message: "MESSAGE_REQUIRED" });
    }

    const rawFailures = Array.isArray(body.failures) ? body.failures.slice(0, 3) : [];
    const failures = rawFailures
      .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
      .map((f) => ({
        testId: typeof f.testId === "number" ? f.testId : undefined,
        input: String(f.input ?? "").slice(0, 1000),
        expected: String(f.expected ?? "").slice(0, 1000),
        actual: String(f.actual ?? "").slice(0, 1000),
        verdict: f.verdict == null ? undefined : String(f.verdict).slice(0, 32),
        stderr: f.stderr == null ? null : String(f.stderr).slice(0, 2000),
      }));

    const result = await debugMentorReply({
      context: {
        taskTitle: String(body.taskTitle ?? "").slice(0, 300),
        taskText: String(body.taskText ?? "").slice(0, 4000),
        language,
        code,
        verdict: String(body.verdict ?? "").slice(0, 32),
        stderr: body.stderr == null ? "" : String(body.stderr).slice(0, 8000),
        failures,
      },
      history: messages,
    });

    return res.json({ reply: result.reply, source: result.source });
  } catch (error: any) {
    logger.warn("[tasks] debug-chat failed", { requestId: req.requestId, error: error?.message });
    return res.status(503).json({ message: "DEBUG_CHAT_UNAVAILABLE" });
  }
});

tasksRouter.post("/generate", authMiddleware, async (req: AuthRequest, res: Response) => {
  let throttleKey: string | null = null;
  try {
    const requestStartedAt = Date.now();
    const DISABLE_AI_DEADLINES = String(process.env.TASKS_GENERATE_DISABLE_DEADLINE || '').trim() === '1';
    // Total budget for the whole generation flow (quiz/task/tests).
    // Override with TASKS_GENERATE_BUDGET_MS to match your upstream proxy timeout.
    // If your proxy timeout is 60s, set this to something like 45-55s.
    const REQUEST_BUDGET_MS = (() => {
      if (DISABLE_AI_DEADLINES) {
        // Explicit "no deadline" mode for internal guards.
        // This keeps fallback/test-generation branches from short-circuiting due to synthetic request budgets.
        return Number.MAX_SAFE_INTEGER;
      }
      const raw = Number(process.env.TASKS_GENERATE_BUDGET_MS);
      const v = Number.isFinite(raw) ? raw : 45_000;
      // Keep sane bounds; lower bound prevents too aggressive aborts, upper bound avoids runaway waits.
      return Math.max(15_000, Math.min(120_000, Math.floor(v)));
    })();
    const userId = req.userId!;
    const rawLang = String(req.lang ?? "").toUpperCase().trim();
    const lang: "JAVA" | "PYTHON" | "CPP" = rawLang === "PYTHON" ? "PYTHON" : rawLang === "CPP" ? "CPP" : "JAVA";
    const forcePersonalControl = req.body && typeof req.body === "object" && (req.body as any).forceControl === true;
    throttleKey = makeGenerateThrottleKey(userId, lang);

    const now = Date.now();
    const cooldownMs = randomIntInclusive(GENERATE_COOLDOWN_MIN_MS, GENERATE_COOLDOWN_MAX_MS);
    const inflightTtlMs = Math.max(15_000, Math.min(180_000, REQUEST_BUDGET_MS + 15_000));
    const reservation = await reserveGenerateSlot({
      throttleKey,
      nowMs: now,
      cooldownMs,
      inflightTtlMs,
    });

    if (reservation.kind === "inflight") {
      res.setHeader("Retry-After", "2");
      return res.status(409).json({
        status: "blocked",
        message: "GENERATE_REQUEST_IN_PROGRESS",
        retryAfterMs: reservation.retryAfterMs,
      });
    }

    if (reservation.kind === "cooldown") {
      const retryAfterMs = reservation.retryAfterMs;
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1000))));
      return res.status(429).json({
        status: "blocked",
        message: "GENERATE_COOLDOWN_ACTIVE",
        retryAfterMs
      });
    }

    // Opportunistic cleanup for expired cooldown entries.
    if (generateCooldownByUserLang.size > 1000) {
      for (const [k, ts] of generateCooldownByUserLang.entries()) {
        if (ts <= now) generateCooldownByUserLang.delete(k);
      }
    }

    const userLanguage = resolveUiLanguage(req);
    const wantsEn = userLanguage === "en";
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
      .andWhere("(task.subtitle IS NULL OR task.subtitle NOT LIKE :miniProjectPrefix)", { miniProjectPrefix: "MPJ:%" })
      .groupBy("task.topic_index")
      .getRawMany();
    const countByTopicIndex = new Map<number, number>();
    for (const row of rawCounts) {
      const idx = Number((row as any)?.topicIndex);
      const cnt = Number((row as any)?.cnt);
      if (Number.isFinite(idx) && Number.isFinite(cnt)) countByTopicIndex.set(idx, cnt);
    }

    // Topic completion is based on a passing grade, not merely on the fact
    // that a task row was generated or submitted. A failed submission can be
    // retried, but it must not unlock the next topic/project.
    const passedRawCounts = await taskRepo()
      .createQueryBuilder("task")
      .leftJoin("task.grades", "grade")
      .select("task.topic_index", "topicIndex")
      .addSelect("COUNT(DISTINCT task.id)", "cnt")
      .where("task.user_id = :userId", { userId })
      .andWhere("task.lang = :lang", { lang })
      .andWhere("task.type = :type", { type: "TOPIC" })
      .andWhere("(task.subtitle IS NULL OR task.subtitle NOT LIKE :miniProjectPrefix)", { miniProjectPrefix: "MPJ:%" })
      .andWhere("task.completed = 1")
      .andWhere("grade.total >= :passGrade", { passGrade: PERSONAL_TOPIC_PASS_GRADE })
      .groupBy("task.topic_index")
      .getRawMany();
    const passedCountByTopicIndex = new Map<number, number>();
    for (const row of passedRawCounts) {
      const idx = Number((row as any)?.topicIndex);
      const cnt = Number((row as any)?.cnt);
      if (Number.isFinite(idx) && Number.isFinite(cnt)) passedCountByTopicIndex.set(idx, cnt);
    }

    const topicTasksForRetry = await taskRepo().find({
      where: { user: { id: userId }, lang, type: "TOPIC" },
      relations: ["grades"],
      order: { createdAt: "ASC" }
    });
    const retryTaskByTopicIndex = new Map<number, Task>();
    for (const candidate of topicTasksForRetry) {
      if (String(candidate.subtitle ?? "").startsWith("MPJ:")) continue;
      if (!candidate.completed) continue;
      const grades = [...(candidate.grades ?? [])].sort((a, b) => Number(new Date(b.createdAt)) - Number(new Date(a.createdAt)));
      const latest = grades[0];
      if (!latest || Number(latest.total ?? 0) < PERSONAL_TOPIC_PASS_GRADE) {
        if (!retryTaskByTopicIndex.has(candidate.topicIndex)) retryTaskByTopicIndex.set(candidate.topicIndex, candidate);
      }
    }

    // Personal control work insertion: after each 5 fully completed topics (since placement), generate/continue a control work.
    // Topic 0 is the one-task introduction, not a thematic topic. Milestones
    // and control-work ranges must therefore start at topic 1 (or after the
    // placement boundary, whichever comes later).
    const baseStartTopicIndex = getPersonalThematicStartTopicIndex(masteredUntilTopicIndex);
    const sequentialCompletedTopics = getSequentialCompletedThematicTopicCount({
      topics,
      countByTopicIndex: passedCountByTopicIndex,
      baseStartTopicIndex
    });

    // Every three sequentially completed topics unlock a ready-to-solve
    // project. It is persisted as a normal personal task, so the existing
    // judge, hints, skill evidence and progress UI continue to work unchanged.
    const projectDue = sequentialCompletedTopics > 0 && sequentialCompletedTopics % PERSONAL_MINI_PROJECT_INTERVAL === 0;
    if (projectDue) {
      const sequence = Math.floor(sequentialCompletedTopics / PERSONAL_MINI_PROJECT_INTERVAL) - 1;
      const projectTask = await findOrCreatePersonalMiniProject({ userId, lang, sequence, topics });
      const projectGrade = projectTask
        ? await gradeRepo().findOne({ where: { user: { id: userId }, task: { id: projectTask.id } }, order: { createdAt: "DESC" } })
        : null;
      const projectPassed = Boolean(projectGrade && Number(projectGrade.total ?? 0) >= PERSONAL_TOPIC_PASS_GRADE);
      if (projectTask && !projectPassed) {
        return res.json({
          status: "ok",
          task: mapTaskToDto(projectTask, undefined, { uiLanguage: userLanguage })
        });
      }
    }

    const controlDue = sequentialCompletedTopics > 0 && sequentialCompletedTopics % PERSONAL_CONTROL_BATCH_SIZE === 0;
    const forceControlDue = forcePersonalControl && sequentialCompletedTopics > 0;
    if (controlDue || forceControlDue) {
      const segmentIndex = controlDue
        ? Math.floor(sequentialCompletedTopics / PERSONAL_CONTROL_BATCH_SIZE) - 1
        : Math.max(0, Math.ceil(sequentialCompletedTopics / PERSONAL_CONTROL_BATCH_SIZE) - 1);
      const startTopicIndex = baseStartTopicIndex + segmentIndex * PERSONAL_CONTROL_BATCH_SIZE;
      const endTopicIndex = controlDue
        ? startTopicIndex + PERSONAL_CONTROL_BATCH_SIZE - 1
        : Math.min(startTopicIndex + PERSONAL_CONTROL_BATCH_SIZE - 1, baseStartTopicIndex + sequentialCompletedTopics - 1);
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
      const topicsInRange = topics.filter(t => t.topicIndex >= startTopicIndex && t.topicIndex <= endTopicIndex);
      const localizedControlTopicTitles = wantsEn
        ? await buildLocalizedTopicTitleEnById({ req, topics: topicsInRange })
        : new Map<number, string>();
      const prevTopicsText = buildPrevTopicsTextFromRange({
        topics,
        startTopicIndex,
        endTopicIndex,
        titleByTopicId: localizedControlTopicTitles
      });

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
      const passedCount = passedCountByTopicIndex.get(t.topicIndex) ?? 0;
      const required = t.topicIndex === 0 ? REQUIRED_TASKS_FOR_INTRO_TOPIC : REQUIRED_TASKS_FOR_REGULAR_TOPIC;
      if (passedCount < required) {
        const retryTask = retryTaskByTopicIndex.get(t.topicIndex);
        if (retryTask) {
          return res.json({
            status: "ok",
            task: mapTaskToDto(retryTask, undefined, { uiLanguage: userLanguage })
          });
        }
        if (count < required) {
          topic = t;
          break;
        }
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
    const topicTheoryForAi = wantsEn
      ? await translateTheoryUkToEn({ req, topicId: topic.id, text: topicTheory })
      : topicTheory;

    const requiredTasksInThisTopic = topic.topicIndex === 0 ? 1 : PERSONAL_REGULAR_TOPIC_TASK_COUNT;
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

    const prevTopicsForReinforcementCandidates = topics
      .filter(t => t.topicIndex < topic.topicIndex)
      .slice(-6);
    const localizedTopicTitleEnByTopicId = wantsEn
      ? await buildLocalizedTopicTitleEnById({ req, topics: [topic, ...prevTopicsForReinforcementCandidates] })
      : new Map<number, string>();
    const topicTitleForAi = wantsEn
      ? (localizedTopicTitleEnByTopicId.get(topic.id) ?? topic.title)
      : topic.title;
    const prevTopicsForReinforcement = prevTopicsForReinforcementCandidates
      .map(t => {
        const topicId = Number((t as any)?.id);
        const localized = Number.isFinite(topicId) ? localizedTopicTitleEnByTopicId.get(topicId) : undefined;
        return String(localized ?? t.title ?? "").trim();
      })
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
      return Math.max(25_000, Math.min(90_000, Math.floor(v)));
    })();
    // Keep some budget for test-data generation + DB writes.
    // Cap low to avoid nginx 504; generation retries still happen inside this budget.
    const taskBudgetMs = Math.max(10_000, Math.min(TASK_BUDGET_CAP_MS, remainingBeforeTask - 6_000));

    const aiTaskResult = await safeAICall('generateTask', {
      topicTitle: topicTitleForAi,
      theory: topicTheoryForAi,
      lang,
      topicIndex: topic.topicIndex,
      numInTopic,
      isFirstTask: numInTopic === 1,
      difus,
      userId,
      topicId: topic.id,
      semanticRetries: 0,
      allowedIoTypes: generationAllowedIoTypes,
      ...(prevTopicsForReinforcement ? { prevTopics: prevTopicsForReinforcement } : {}),
      previousTasks: previousTasksBrief,
      previousTaskPractices: previousTaskPracticesForUniq,
      previousTaskTitles: previousTaskTitlesForUniq
    }, {
      language: userLanguage,
      requestId: req.requestId,
      // One semantic retry prevents a malformed/contradictory AI task from
      // reaching the learner (for example, asking for input in a no-input
      // topic while declaring an empty stdin).
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
    const baseTitle = aiTitleRaw || i18nText(userLanguage, `Практика: ${topic.title}`, `Practice: ${topicTitleForAi}`);
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
          taskTitle: topicTitleForAi,
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

    const savedHydrated = await taskRepo().findOne({
      where: { id: saved.id },
      relations: ["topic", "topic.theoryBlock"]
    });

    return res.json({
      status: "ok",
      task: mapTaskToDto(savedHydrated ?? saved, undefined, {
        uiLanguage: userLanguage,
        localizedTopicTitleEnByTopicId: localizedTopicTitleEnByTopicId
      })
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
    if (throttleKey) await releaseGenerateSlot(throttleKey);
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
    relations: ["testData", "topic"]
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
  const variableDeclarationError = validateVariableDeclarationTaskSubmission(task, sourceText, resolveUiLanguage(req));
  if (variableDeclarationError) {
    // This is an intentional learning guard, not a broken request. Return a
    // regular failed-check result so the IDE can show the explanation and hint
    // without presenting it as a server error.
    return res.status(200).json({
      status: "VALIDATION_FAILED",
      message: variableDeclarationError,
      validation: {
        code: "VARIABLE_DECLARATION_REQUIRED",
        message: variableDeclarationError
      },
      grade: {
        gradingMode: "TESTS" as const,
        total: 0,
        aiFeedback: variableDeclarationError,
        testsPassed: 0,
        testsTotal: 1,
        score: 0,
        maxScore: 1,
        groupScores: [{ group: "validation", score: 0, maxScore: 1 }],
        testResults: [{
          testId: 0,
          input: "",
          expectedOutput: "",
          actualOutput: "",
          passed: false,
          verdict: "WA",
          error: variableDeclarationError,
          errorKind: "VARIABLE_DECLARATION_REQUIRED"
        }],
        hints: [variableDeclarationError]
      }
    });
  }

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
    if (Number(savedGrade.total ?? 0) >= PERSONAL_TOPIC_PASS_GRADE) {
      await cleanupCompletedPersonalTaskTests({ taskId: task.id }).catch((error: unknown) => {
        logger.warn("[tasks] completed personal-task test cleanup failed", { requestId: req.requestId, taskId: task.id, error });
      });
      await sweepTestCache(0).catch(error => {
        logger.warn("[tasks] completed personal-task cache cleanup failed", { requestId: req.requestId, taskId: task.id, error });
      });
    }
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
    testId?: number;
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
  const { tests } = await buildJudgeTests(judgedTests, {
    meta: t => ({
      hidden: false,
      group: "public",
      weight: effectiveIoType === "NO_INPUT_FREE_OUTPUT" ? Math.max(1, maxScore) : (t.points || 1)
    }),
    hashes: t => ({ inputHash: (t as any).inputSha256, outputHash: (t as any).outputSha256 }),
    loadContent: loadTestContentByIds
  });
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
  const isPersonalMiniProject = String(task.subtitle ?? "").startsWith("MPJ:");
  const checker: CheckerSpec = effectiveIoType === "NO_INPUT_FREE_OUTPUT"
    ? { type: "nonempty" }
    : isPersonalMiniProject
      ? { type: "whitespace" }
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
          testId: t.id,
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
          testId: t.id,
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
  if (Number(savedGrade.total ?? 0) >= PERSONAL_TOPIC_PASS_GRADE) {
    await cleanupCompletedPersonalTaskTests({ taskId: task.id }).catch((error: unknown) => {
      logger.warn("[tasks] completed personal-task test cleanup failed", { requestId: req.requestId, taskId: task.id, error });
    });
    await sweepTestCache(0).catch(error => {
      logger.warn("[tasks] completed personal-task cache cleanup failed", { requestId: req.requestId, taskId: task.id, error });
    });
  }

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
  let learningAttempt: Awaited<ReturnType<typeof recordLearningOutcome>> | null = null;
  try {
    learningAttempt = await recordLearningOutcome({
      principalType: "USER",
      principalId: req.userId,
      taskKind: "PERSONAL",
      taskId: task.id,
      topicId: task.topic?.id ?? null,
      topicLabel: task.topic?.title ?? null,
      submissionId: String(savedGrade.id),
      outcome: passedTests >= judgedTests.length ? "SOLVED" : "FAILED",
      failureCategory: learningFirstFailure?.errorKind ?? (workerRes?.verdict === "CE" ? "compile" : null),
      firstFailedTestId: learningFirstFailure?.testId ?? null,
    });
  } catch (error: any) {
    logger.warn("[learning] personal outcome persistence failed", { requestId: req.requestId, error: error?.message });
  }
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
    },
    learningAttempt: learningAttempt
      ? {
          id: learningAttempt.attempt.id,
          outcome: learningAttempt.attempt.outcome,
          failureCategory: learningAttempt.attempt.failureCategory ?? null,
          firstFailedTestId: learningAttempt.attempt.firstFailedTestId ?? null,
          highestHintLevelShown: learningAttempt.attempt.highestHintLevelShown ?? 0,
          solvedAfterFailure: learningAttempt.solvedAfterFailure,
        }
      : null,
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
