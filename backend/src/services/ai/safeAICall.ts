import { Response } from 'express';
import { getLLMOrchestrator, type LLMTaskLanguage } from '../llm/LLMOrchestrator';
import { AIResponseValidator, AIValidationError, makeAIValidationError } from '../llm/AIResponseValidator';
import { logger } from '../../utils/logger';
import { getCurriculumPolicyViolationForGeneratedTask, rewriteNonJudgeablePracticalTaskToJudgeable } from './curriculumPolicy';
import { isAiCircuitOpen, recordAiCircuitSuccess, recordAiCircuitFailure } from './aiCircuitBreaker';
export type AIMode = 'generateTask' | 'generateTheory' | 'generateQuiz' | 'generateTaskCondition' | 'generateTaskTemplate' | 'generateTestData';
export interface AIError {
  statusCode: number;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
}

type JsonObject = Record<string, unknown>;

function asJsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return String(error ?? "");
}

type TaskIoType = "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";
type TaskType = "PRACTICE" | "CONTROL";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required and must be a non-empty string`);
  }
  return value;
}

function requiredTaskLanguage(value: unknown): LLMTaskLanguage {
  if (value === "JAVA" || value === "PYTHON" || value === "CPP") return value;
  throw new Error('language must be "JAVA", "PYTHON" or "CPP"');
}

function requiredTaskType(value: unknown): TaskType {
  if (value === "PRACTICE" || value === "CONTROL") return value;
  throw new Error('taskType must be "PRACTICE" or "CONTROL"');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function optionalTaskIoTypes(value: unknown): TaskIoType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed: TaskIoType[] = ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"];
  const values = value.filter((item): item is TaskIoType =>
    typeof item === "string" && allowed.includes(item as TaskIoType)
  );
  return values.length > 0 ? values : undefined;
}

function optionalTaskIoType(value: unknown): TaskIoType | undefined {
  return value === "STDIN_STDOUT" || value === "NO_INPUT_FIXED_OUTPUT" || value === "NO_INPUT_FREE_OUTPUT"
    ? value
    : undefined;
}

function computeDefaultRetryAfterMs(statusCode: number): number {
  if (statusCode === 429) return 10_000;
  return 0;
}

// Circuit breaker state is shared across instances via Redis (with a local
// in-memory fallback). See ./aiCircuitBreaker. The breaker is keyed by AI mode.
function getNowMs(): number {
  return Date.now();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Patterns that try to break out of the surrounding prompt context. Matches at
// any position; replaced with a visible marker so reviewers can spot abuse
// rather than silently dropping content. Covers UA / EN / RU phrasings of
// "ignore previous instructions" and common role-impersonation markers.
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /^[ \t]*(?:system|assistant|user|developer)\s*:/gim,
  /<\|(?:im_start|im_end|start|end|system|user|assistant)\|>/gi,
  /\[\/?(?:INST|SYS)\]/gi,
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|earlier|above|all)\b[^.\n]{0,40}\b(?:instructions?|prompts?|rules?|system\s*prompt)\b/gi,
  // NB: JS `\b`/`\w` are ASCII-only — they do NOT recognise Cyrillic word
  // boundaries, so the previous `\b…\b` anchors never matched Ukrainian/Russian
  // input (a real prompt-injection bypass for the primary audience). We use the
  // `u` flag with Unicode letter/number classes for boundaries and word stems.
  /(?<![\p{L}\p{N}_])(?:проігнор[\p{L}\p{N}_]*|ігнор[\p{L}\p{N}_]*|забуд[\p{L}\p{N}_]*|відкин[\p{L}\p{N}_]*|скасуй?[\p{L}\p{N}_]*)[^.\n]{0,40}(?:попередн[\p{L}\p{N}_]*|вище|усі|всі)[^.\n]{0,40}(?:інструкц[\p{L}\p{N}_]*|правил[\p{L}\p{N}_]*|вказівк[\p{L}\p{N}_]*|промпт[\p{L}\p{N}_]*)/giu,
  /(?<![\p{L}\p{N}_])(?:игнорир[\p{L}\p{N}_]*|забудь[\p{L}\p{N}_]*|отмени[\p{L}\p{N}_]*|сбрось[\p{L}\p{N}_]*)[^.\n]{0,40}(?:предыдущ[\p{L}\p{N}_]*|выше|все)[^.\n]{0,40}(?:инструкц[\p{L}\p{N}_]*|правил[\p{L}\p{N}_]*|промпт[\p{L}\p{N}_]*)/giu,
  /\byou\s+are\s+now\b[^.\n]{0,80}/gi,
  /\b(?:act|behave|pretend)\s+as\s+(?:an?\s+)?(?:system|admin|developer|root|jailbroken)\b/gi,
];

export function neutralizePromptInjection(text: string): string {
  let out = text;
  for (const re of PROMPT_INJECTION_PATTERNS) {
    out = out.replace(re, "[redacted]");
  }
  // Triple-backtick fences inside user input could close a fenced block we
  // wrap it in. Collapse them to a single backtick — harmless and visible.
  out = out.replace(/```+/g, "`");
  return out;
}

function sanitizeText(input: unknown, maxLen: number): string {
  const s = String(input ?? '');
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const safe = neutralizePromptInjection(cleaned);
  const trimmed = safe.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function stripNumericTitlePrefix(title: string): string {
  // Matches titles like "(2/3) Something".
  return String(title ?? '').replace(/^\(\s*\d+\s*\/\s*\d+\s*\)\s*/i, '').trim();
}

function normalizeForUniqueness(text: string): string {
  const s = String(text ?? '');
  // Remove code blocks to focus on semantics.
  const noCode = s.replace(/```[\s\S]*?```/g, ' ');
  // Remove numbers so "same task with different constants" is still treated as similar.
  const noDigits = noCode.replace(/\d+/g, ' ');
  // Keep letters/numbers for UA/EN; avoid unicode property escapes for older Node runtimes.
  const asciiUa = noDigits
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9\s]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return asciiUa;
}

function tokenizeForUniqueness(text: string): string[] {
  const norm = normalizeForUniqueness(text);
  if (!norm) return [];
  const stop = new Set([
    'виведіть', 'вивести', 'виводьте', 'вивід', 'вихідні', 'дані', 'формат', 'вхідні',
    'зчитати', 'зчитайте', 'введіть', 'ввести', 'ввід',
    'print', 'output', 'input', 'stdin', 'stdout',
    'program', 'write', 'read', 'given', 'calculate', 'compute'
  ]);
  return norm
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length >= 4)
    .filter(t => !stop.has(t));
}

function setSimilarityMetrics(aTokens: string[], bTokens: string[]): { jaccard: number; overlap: number; intersection: number; aSize: number; bSize: number } {
  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  if (aSet.size === 0 || bSet.size === 0) {
    return { jaccard: 0, overlap: 0, intersection: 0, aSize: aSet.size, bSize: bSet.size };
  }
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  const jaccard = union > 0 ? inter / union : 0;
  const denom = Math.min(aSet.size, bSet.size);
  const overlap = denom > 0 ? inter / denom : 0;
  return { jaccard, overlap, intersection: inter, aSize: aSet.size, bSize: bSet.size };
}

function sanitizeParams(mode: AIMode, params: unknown): JsonObject {
  const p: JsonObject = { ...asJsonObject(params) };

  if ('topicTitle' in p) p.topicTitle = sanitizeText(p.topicTitle, 200);
  if ('theory' in p) p.theory = sanitizeText(p.theory, 12_000);
  if ('prevTopics' in p) p.prevTopics = sanitizeText(p.prevTopics, 2000);
  if ('taskDescription' in p) p.taskDescription = sanitizeText(p.taskDescription, 8000);
  if ('taskTitle' in p) p.taskTitle = sanitizeText(p.taskTitle, 200);
  if ('description' in p) p.description = sanitizeText(p.description, 8000);
  if ('responseLanguage' in p) p.responseLanguage = sanitizeText(p.responseLanguage, 64);

  if (mode === 'generateTask') {
    p.numInTopic = typeof p.numInTopic === 'number' ? Math.max(1, Math.floor(p.numInTopic)) : p.numInTopic;
    if (typeof p.topicIndex === 'number') p.topicIndex = Math.max(0, Math.floor(p.topicIndex));
    if (typeof p.difus === 'number') p.difus = Math.max(0, Math.min(1, p.difus));

    if (typeof p.previousTasks === 'string') p.previousTasks = sanitizeText(p.previousTasks, 4000);

    const previousTaskPractices = Array.isArray(p.previousTaskPractices)
      ? p.previousTaskPractices as unknown[]
      : undefined;
    if (previousTaskPractices) {
      const sanitizedPreviousTaskPractices = previousTaskPractices
        .map(s => sanitizeText(s, 2000))
        .filter(s => s.trim().length > 0)
        .slice(0, 8);
      if (sanitizedPreviousTaskPractices.length === 0) delete p.previousTaskPractices;
      else p.previousTaskPractices = sanitizedPreviousTaskPractices;
    }
    const previousTaskTitles = Array.isArray(p.previousTaskTitles)
      ? p.previousTaskTitles as unknown[]
      : undefined;
    if (previousTaskTitles) {
      const sanitizedPreviousTaskTitles = previousTaskTitles
        .map(s => sanitizeText(s, 200))
        .filter(s => s.trim().length > 0)
        .slice(0, 12);
      if (sanitizedPreviousTaskTitles.length === 0) delete p.previousTaskTitles;
      else p.previousTaskTitles = sanitizedPreviousTaskTitles;
    }

    const allowedIoTypes = Array.isArray(p.allowedIoTypes)
      ? p.allowedIoTypes as unknown[]
      : undefined;
    if (allowedIoTypes) {
      const allowed = new Set<TaskIoType>(["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"]);
      const sanitizedAllowedIoTypes = allowedIoTypes
        .map(s => typeof s === 'string' ? s.trim() : '')
        .filter((s): s is TaskIoType => allowed.has(s as TaskIoType))
        .slice(0, 3);
      if (sanitizedAllowedIoTypes.length === 0) delete p.allowedIoTypes;
      else p.allowedIoTypes = sanitizedAllowedIoTypes;
    }
  }
  if (mode === 'generateQuiz') {
    if (typeof p.count === 'number') p.count = Math.max(1, Math.min(50, Math.floor(p.count)));
  }
  if (mode === 'generateTestData') {
    if (typeof p.count === 'number') p.count = Math.max(1, Math.min(50, Math.floor(p.count)));
  }
  if (mode === 'generateTaskCondition') {
    if (typeof p.difficulty === 'number') p.difficulty = Math.max(1, Math.min(5, Math.floor(p.difficulty)));
  }
  return p;
}

function classifyAIProviderStatus(errorMessage: string): number {
  const msg = (errorMessage || '').toLowerCase();
  if (
    msg.includes('core_operation_missing') ||
    msg.includes('forbidden_scope_violation') ||
    msg.includes('multi_task_not_allowed') ||
    msg.includes('anchor_topic_mismatch') ||
    msg.includes('anchor_invalid_payload') ||
    msg.includes('anchor_too_vague') ||
    msg.includes('topic_mismatch_hard_fail')
  ) return 400;
  // Be careful: random numeric strings can contain '429' (e.g., 429496...), so match more precisely.
  if (msg.includes('rate limit') || msg.includes('too many requests') || /\b429\b/.test(msg) || msg.includes('http 429') || msg.includes('status 429')) return 429;
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('30s exceeded') || msg.includes('deadline exceeded') || msg.includes('request aborted')) return 504;
  if (msg.includes('no openrouter api keys') || msg.includes('all api keys exhausted') || msg.includes('api key')) return 503;
  if (msg.includes('invalid request') || msg.includes('400')) return 400;
  return 503;
}

function isSemanticValidationError(errorMessage: string): boolean {
  const msg = (errorMessage || '').toUpperCase();
  return msg.includes('CORE_OPERATION_MISSING') ||
    msg.includes('FORBIDDEN_SCOPE_VIOLATION') ||
    msg.includes('MULTI_TASK_NOT_ALLOWED') ||
    msg.includes('ANCHOR_TOPIC_MISMATCH') ||
    msg.includes('ANCHOR_INVALID_PAYLOAD') ||
    msg.includes('ANCHOR_TOO_VAGUE') ||
    msg.includes('TOPIC_MISMATCH_HARD_FAIL');
}
function validateInputParams(mode: AIMode, params: JsonObject): void {
  switch (mode) {
    case 'generateTask':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (!params.theory || typeof params.theory !== 'string' || !params.theory.trim()) {
        throw new Error('theory is required and must be a non-empty string');
      }
      if (typeof params.lang !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      if (typeof params.numInTopic !== 'number' || params.numInTopic < 1) {
        throw new Error('numInTopic is required and must be a positive number');
      }
      if (typeof params.isFirstTask !== 'boolean') {
        throw new Error('isFirstTask is required and must be a boolean');
      }
      if (params.topicIndex !== undefined) {
        const v = Number(params.topicIndex);
        if (!Number.isFinite(v) || v < 0) {
          throw new Error('topicIndex must be a non-negative number if provided');
        }
      }
      break;
    case 'generateTheory':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (typeof params.lang !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      break;
    case 'generateQuiz':
      if (typeof params.lang !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      if (!params.prevTopics || typeof params.prevTopics !== 'string' || !params.prevTopics.trim()) {
        throw new Error('prevTopics is required and must be a non-empty string');
      }
      if (params.count !== undefined && (typeof params.count !== 'number' || params.count < 1)) {
        throw new Error('count must be a positive number if provided');
      }
      break;
    case 'generateTaskCondition':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (typeof params.taskType !== 'string' || !['PRACTICE', 'CONTROL'].includes(params.taskType)) {
        throw new Error('taskType is required and must be "PRACTICE" or "CONTROL"');
      }
      if (typeof params.language !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.language)) {
        throw new Error('language is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      if (params.difficulty !== undefined && (typeof params.difficulty !== 'number' || params.difficulty < 1 || params.difficulty > 5)) {
        throw new Error('difficulty must be a number between 1 and 5 if provided');
      }
      break;
    case 'generateTaskTemplate':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (typeof params.language !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.language)) {
        throw new Error('language is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      break;
    case 'generateTestData':
      if (!params.taskDescription || typeof params.taskDescription !== 'string' || !params.taskDescription.trim()) {
        throw new Error('taskDescription is required and must be a non-empty string');
      }
      if (!params.taskTitle || typeof params.taskTitle !== 'string' || !params.taskTitle.trim()) {
        throw new Error('taskTitle is required and must be a non-empty string');
      }
      if (typeof params.lang !== 'string' || !['JAVA', 'PYTHON', 'CPP'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON" or "CPP"');
      }
      if (typeof params.count !== 'number' || params.count < 1) {
        throw new Error('count is required and must be a positive number');
      }
      break;
    default:
      throw new Error(`Unknown AI mode: ${mode}`);
  }
}
function validateResultBeforeSave(mode: AIMode, result: unknown): void {
  const resultObject = asJsonObject(result);
  switch (mode) {
    case 'generateTask':
      if (!resultObject.title || !resultObject.practicalTask || !resultObject.codeTemplate) {
        throw new Error('Generated task is missing required fields');
      }
      if (!resultObject.examples || !Array.isArray(resultObject.examples) || resultObject.examples.length === 0) {
        throw new Error('Generated task must have at least one example');
      }
      break;
    case 'generateTheory':
      if (!resultObject.theory || typeof resultObject.theory !== 'string' || !resultObject.theory.trim()) {
        throw new Error('Generated theory is empty or invalid');
      }
      break;
    case 'generateQuiz':
      if (typeof resultObject.quizJson !== 'string' || !resultObject.quizJson) {
        throw new Error('Generated quiz is missing quizJson');
      }
      let quiz: unknown;
      try {
        quiz = JSON.parse(resultObject.quizJson);
      } catch (e) {
        throw new Error('Generated quiz JSON is invalid');
      }
      if (!Array.isArray(quiz) || quiz.length === 0) {
        throw new Error('Generated quiz is empty');
      }
      break;
    case 'generateTaskCondition':
      if (!resultObject.description || typeof resultObject.description !== 'string' || !resultObject.description.trim()) {
        throw new Error('Generated task condition is empty or invalid');
      }
      break;
    case 'generateTaskTemplate':
      if (!resultObject.template || typeof resultObject.template !== 'string' || !resultObject.template.trim()) {
        throw new Error('Generated task template is empty or invalid');
      }
      break;
    case 'generateTestData':
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error('Generated test data is empty');
      }
      for (const test of result) {
        const testObject = asJsonObject(test);
        if (typeof testObject.input !== 'string') {
          throw new Error('Generated test data contains invalid entries: input must be a string');
        }
        if (typeof testObject.output !== 'string' || !testObject.output.trim()) {
          throw new Error('Generated test data contains invalid entries: output must be a non-empty string');
        }
      }
      break;
  }
}
export async function safeAICall<T = any>(mode: AIMode, params: unknown, options?: {
  expectedCount?: number;
  logRawResponse?: boolean;
  language?: "uk" | "en";
  requestId?: string;
  /** Override default retry attempts (default: 4). */
  maxAttempts?: number;
  /** Hard deadline for this AI call (in milliseconds). Aborts upstream fetches when supported. */
  totalTimeoutMs?: number;
}): Promise<{
  success: true;
  data: T;
} | {
  success: false;
  error: AIError;
}> {
  try {
    const sanitizedParams = sanitizeParams(mode, params);
    validateInputParams(mode, sanitizedParams);

    if (await isAiCircuitOpen(mode)) {
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: Temporarily unavailable (circuit open)',
          error: 'Circuit breaker is open due to recent AI provider failures',
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }

    const orchestrator = getLLMOrchestrator();
    const language: "uk" | "en" = options?.language === "en" ? "en" : "uk";
    let result: unknown;
    const startedAt = getNowMs();

    const maxAttempts = typeof options?.maxAttempts === 'number' && Number.isFinite(options.maxAttempts)
      ? Math.max(1, Math.min(6, Math.floor(options.maxAttempts)))
      : 4;

    const totalTimeoutMs = typeof options?.totalTimeoutMs === 'number' && Number.isFinite(options.totalTimeoutMs)
      ? Math.max(500, Math.floor(options.totalTimeoutMs))
      : null;

    const AbortControllerCtor = globalThis.AbortController as (new () => AbortController) | undefined;
    const controller = totalTimeoutMs && AbortControllerCtor ? new AbortControllerCtor() : null;
    const timeoutId = totalTimeoutMs && controller ? setTimeout(() => controller.abort(), totalTimeoutMs) : null;
    // For rate limiting (429), a short retry often hits the same window.
    // Be slightly more patient to reduce user-visible 429s.
    let lastRetryAfterMs = 0;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          if (totalTimeoutMs !== null && getNowMs() - startedAt >= totalTimeoutMs) {
            throw new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)');
          }
          switch (mode) {
          case 'generateTask':
            const taskTopicTitle = requiredString(sanitizedParams.topicTitle, 'topicTitle');
            const taskTheory = requiredString(sanitizedParams.theory, 'theory');
            const taskLanguage = requiredTaskLanguage(sanitizedParams.lang);
            const taskAllowedIoTypes = optionalTaskIoTypes(sanitizedParams.allowedIoTypes);
            result = await orchestrator.generateTaskWithAI({
              topicTitle: taskTopicTitle,
              theory: taskTheory,
              lang: taskLanguage,
              topicIndex: optionalNumber(sanitizedParams.topicIndex),
              numInTopic: Number(sanitizedParams.numInTopic),
              isFirstTask: sanitizedParams.isFirstTask === true,
              difus: optionalNumber(sanitizedParams.difus),
              isControl: optionalBoolean(sanitizedParams.isControl),
              prevTopics: optionalString(sanitizedParams.prevTopics),
              previousTasks: optionalString(sanitizedParams.previousTasks),
              allowedIoTypes: taskAllowedIoTypes,
              userId: optionalNumber(sanitizedParams.userId),
              topicId: optionalNumber(sanitizedParams.topicId),
              language,
              signal: controller?.signal,
              requestId: options?.requestId,
              semanticRetries: optionalNumber(sanitizedParams.semanticRetries)
            });
            const taskResult = AIResponseValidator.validateGenerateTask(
              result,
              taskTopicTitle,
              optionalNumber(sanitizedParams.topicIndex),
              taskAllowedIoTypes
            );
            result = taskResult;

            // Curriculum stage policy enforcement (e.g., prevent tasks requiring concepts not taught yet).
            {
              let violation = getCurriculumPolicyViolationForGeneratedTask({
                lang: taskLanguage,
                topicIndex: optionalNumber(sanitizedParams.topicIndex),
                topicTitle: optionalString(sanitizedParams.topicTitle),
                title: taskResult.title,
                practicalTask: taskResult.practicalTask
              });

              if (violation && violation.includes('NON_JUDGEABLE_TASK')) {
                const originalPracticalTask = taskResult.practicalTask;
                const rewrittenPracticalTask = rewriteNonJudgeablePracticalTaskToJudgeable(originalPracticalTask);

                if (rewrittenPracticalTask && rewrittenPracticalTask !== originalPracticalTask) {
                  const rewrittenViolation = getCurriculumPolicyViolationForGeneratedTask({
                    lang: taskLanguage,
                    topicIndex: optionalNumber(sanitizedParams.topicIndex),
                    topicTitle: optionalString(sanitizedParams.topicTitle),
                    title: taskResult.title,
                    practicalTask: rewrittenPracticalTask
                  });

                  if (!rewrittenViolation) {
                    taskResult.practicalTask = rewrittenPracticalTask;
                    violation = null;
                    logger.info('[ai] auto-rewrote non-judgeable practicalTask', {
                      mode,
                      requestId: options?.requestId ?? null,
                      attempt,
                      lang: taskLanguage,
                      topicIndex: optionalNumber(sanitizedParams.topicIndex),
                      title: taskResult.title,
                      beforePreview: sanitizeText(originalPracticalTask, 220),
                      afterPreview: sanitizeText(rewrittenPracticalTask, 220)
                    });
                  } else {
                    violation = rewrittenViolation;
                  }
                }
              }

              if (violation) {
                throw makeAIValidationError('generateTask', `Task generation validation failed: ${violation}`, {
                  topicIndex: optionalNumber(sanitizedParams.topicIndex),
                  lang: taskLanguage,
                  title: taskResult.title,
                  practicalTask: taskResult.practicalTask
                });
              }
            }

            // Optional policy enforcement (e.g., forbid stdin before it's taught).
            if (taskAllowedIoTypes && taskAllowedIoTypes.length > 0) {
              const allowed = new Set(taskAllowedIoTypes);
              const ioType = taskResult.ioType ?? 'STDIN_STDOUT';
              if (!allowed.has(ioType)) {
                const isNoInputTask = ioType === 'NO_INPUT_FIXED_OUTPUT' || ioType === 'NO_INPUT_FREE_OUTPUT';
                const isStdinOnlyPreference = allowed.size === 1 && allowed.has('STDIN_STDOUT');
                // STDIN-only is a curriculum preference once input has been
                // taught, not a correctness requirement. Some providers
                // still return a fully consistent no-input task despite the
                // enum/prompt. Keep that task instead of turning it into a
                // deterministic fallback; only reject genuinely unknown or
                // otherwise unsupported IO types.
                if (!(isStdinOnlyPreference && isNoInputTask)) {
                  throw makeAIValidationError('generateTask', `Task generation validation failed: ioType "${ioType}" is not allowed for this stage`, result);
                }
              }
            }

            // Optional policy enforcement: ensure tasks within a topic are meaningfully different.
            // This is best-effort and bounded by safeAICall retries.
            {
              const prevPractices = Array.isArray(sanitizedParams.previousTaskPractices)
                ? sanitizedParams.previousTaskPractices.filter((value): value is string => typeof value === "string")
                : [];
              const prevTitles = Array.isArray(sanitizedParams.previousTaskTitles)
                ? sanitizedParams.previousTaskTitles.filter((value): value is string => typeof value === "string")
                : [];

              const candPractice = taskResult.practicalTask;
              const candTitle = taskResult.title;

              const candTitleNorm = stripNumericTitlePrefix(candTitle).toLowerCase();
              const prevTitleNorms = prevTitles.map(t => stripNumericTitlePrefix(t).toLowerCase()).filter(Boolean);
              const exactTitleDuplicate = candTitleNorm.length > 0 && prevTitleNorms.includes(candTitleNorm);

              if (exactTitleDuplicate) {
                throw makeAIValidationError('generateTask', `Task generation validation failed: duplicate title within topic ("${candTitleNorm}")`, {
                  title: candTitle,
                  practicalTask: candPractice
                });
              }

              const candTokens = tokenizeForUniqueness(candPractice);
              if (candTokens.length > 0 && prevPractices.length > 0) {
                let best = { score: 0, jaccard: 0, overlap: 0, intersection: 0, prevSnippet: '' };
                for (const prev of prevPractices) {
                  const prevTokens = tokenizeForUniqueness(prev);
                  const m = setSimilarityMetrics(candTokens, prevTokens);
                  const score = Math.max(m.jaccard, m.overlap);
                  if (score > best.score) {
                    best = {
                      score,
                      jaccard: m.jaccard,
                      overlap: m.overlap,
                      intersection: m.intersection,
                      prevSnippet: sanitizeText(prev, 280)
                    };
                  }
                }

                // Heuristic: if overlap is very high with a meaningful intersection, treat as a duplicate.
                const tooSimilar = best.score >= 0.82 && best.intersection >= 10;
                if (tooSimilar) {
                  throw makeAIValidationError(
                    'generateTask',
                    `Task generation validation failed: task is too similar to a previous task in this topic (similarity=${best.score.toFixed(2)}, overlap=${best.overlap.toFixed(2)}, jaccard=${best.jaccard.toFixed(2)})`,
                    {
                      title: candTitle,
                      practicalTask: candPractice,
                      similarity: best,
                      note: 'Regenerate with a different plot/data/wording and different examples.'
                    }
                  );
                }
              }
            }
            break;
          case 'generateTheory':
            result = await orchestrator.generateTheoryWithAI({
              topicTitle: requiredString(sanitizedParams.topicTitle, 'topicTitle'),
              lang: requiredTaskLanguage(sanitizedParams.lang),
              taskDescription: optionalString(sanitizedParams.taskDescription),
              taskType: sanitizedParams.taskType === "PRACTICE" || sanitizedParams.taskType === "CONTROL"
                ? sanitizedParams.taskType
                : undefined,
              difficulty: optionalNumber(sanitizedParams.difficulty),
              responseLanguage: optionalString(sanitizedParams.responseLanguage),
              userId: optionalNumber(sanitizedParams.userId),
              topicId: optionalNumber(sanitizedParams.topicId),
              language,
              signal: controller?.signal
            });
            result = AIResponseValidator.validateGenerateTheory(result);
            break;
          case 'generateQuiz':
            result = await orchestrator.generateQuizWithAI({
              lang: requiredTaskLanguage(sanitizedParams.lang),
              prevTopics: requiredString(sanitizedParams.prevTopics, 'prevTopics'),
              count: optionalNumber(sanitizedParams.count),
              responseLanguage: optionalString(sanitizedParams.responseLanguage),
              userId: optionalNumber(sanitizedParams.userId),
              topicId: optionalNumber(sanitizedParams.topicId),
              language,
              signal: controller?.signal
            });
            const expectedCount = options?.expectedCount || optionalNumber(sanitizedParams.count) || 12;
            result = AIResponseValidator.validateGenerateQuiz(result, expectedCount);
            break;
          case 'generateTaskCondition':
            result = await orchestrator.generateTaskCondition({
              topicTitle: requiredString(sanitizedParams.topicTitle, 'topicTitle'),
              taskTitle: optionalString(sanitizedParams.taskTitle),
              taskType: requiredTaskType(sanitizedParams.taskType),
              difficulty: optionalNumber(sanitizedParams.difficulty),
              language: requiredTaskLanguage(sanitizedParams.language),
              responseLanguage: optionalString(sanitizedParams.responseLanguage),
              userId: optionalNumber(sanitizedParams.userId),
              topicId: optionalNumber(sanitizedParams.topicId),
              userLanguage: language,
              signal: controller?.signal
            });
            result = AIResponseValidator.validateGenerateTaskCondition(result);
            break;
          case 'generateTaskTemplate':
            result = await orchestrator.generateTaskTemplate({
              topicTitle: requiredString(sanitizedParams.topicTitle, 'topicTitle'),
              taskTitle: optionalString(sanitizedParams.taskTitle),
              language: requiredTaskLanguage(sanitizedParams.language),
              description: optionalString(sanitizedParams.description),
              responseLanguage: optionalString(sanitizedParams.responseLanguage),
              userId: optionalNumber(sanitizedParams.userId),
              topicId: optionalNumber(sanitizedParams.topicId),
              userLanguage: language,
              signal: controller?.signal
            });
            result = AIResponseValidator.validateGenerateTaskTemplate(result);
            break;
          case 'generateTestData':
            result = await orchestrator.generateTestDataWithAI({
              taskDescription: requiredString(sanitizedParams.taskDescription, 'taskDescription'),
              taskTitle: requiredString(sanitizedParams.taskTitle, 'taskTitle'),
              lang: requiredTaskLanguage(sanitizedParams.lang),
              count: Number(sanitizedParams.count),
              ioType: optionalTaskIoType(sanitizedParams.ioType),
              userId: optionalNumber(sanitizedParams.userId),
              language,
              signal: controller?.signal
            });
            const expectedTestCount = options?.expectedCount
              || (sanitizedParams.ioType && sanitizedParams.ioType !== 'STDIN_STDOUT' ? 1 : optionalNumber(sanitizedParams.count))
              || 12;
            result = AIResponseValidator.validateGenerateTestData(result, expectedTestCount);
            break;
          default:
            throw new Error(`Unknown AI mode: ${mode}`);
        }
        await recordAiCircuitSuccess(mode);
        break;
        } catch (error) {
        const errorMsg = errorMessage(error);
        const looksLikeValidationError =
          error instanceof AIValidationError ||
          String(error && typeof error === 'object' && 'name' in error ? error.name : '') === 'AIValidationError' ||
          /validation failed/i.test(errorMsg) ||
          isSemanticValidationError(errorMsg);

        if (looksLikeValidationError) {
          // Some validation errors are transient/model-specific. For generation modes, retry a few times
          // instead of failing fast (bounded by maxAttempts and totalTimeoutMs).
          const canRetryValidation = (mode === 'generateTask' || mode === 'generateTestData') && attempt < maxAttempts;
          if (canRetryValidation) {
            logger.debug('[ai] invalid response (retrying)', {
              mode,
              requestId: options?.requestId ?? null,
              attempt,
              maxAttempts,
              error: errorMsg
            });
          } else {
            logger.warn('[ai] invalid response', {
              mode,
              requestId: options?.requestId ?? null,
              attempt,
              maxAttempts,
              error: errorMsg
            });
          }

          if (options?.logRawResponse && error instanceof AIValidationError && error.rawResponse) {
            logger.debug('[ai] raw response', {
              mode,
              requestId: options?.requestId ?? null,
              raw: String(error.rawResponse).slice(0, 4000)
            });
          }

          if (canRetryValidation) {
            const backoff = Math.min(2000, 250 * attempt) + Math.floor(Math.random() * 250);
            lastRetryAfterMs = backoff;
            if (totalTimeoutMs !== null) {
              const remaining = totalTimeoutMs - (getNowMs() - startedAt);
              const sleepMs = Math.max(0, Math.min(backoff, remaining - 50));
              if (sleepMs > 0) await sleep(sleepMs);
              else {
                return {
                  success: false,
                  error: {
                    statusCode: 504,
                    message: 'AI_GENERATION_FAILED: Invalid response structure',
                    error: 'AI_GENERATION_FAILED: Request aborted (deadline exceeded)',
                    details: {
                      mode,
                      requestId: options?.requestId || null,
                      attempt,
                      elapsedMs: getNowMs() - startedAt,
                      validationError: errorMsg
                    }
                  }
                };
              }
            } else {
              await sleep(backoff);
            }
            continue;
          }

          return {
            success: false,
            error: {
              statusCode: 400,
              message: 'AI_GENERATION_FAILED: Invalid response structure',
                error: errorMsg,
              details: {
                mode,
                requestId: options?.requestId || null,
                validationError: errorMsg
              }
            }
          };
        }

        const providerErrorMessage = errorMsg;
        const statusCode = classifyAIProviderStatus(providerErrorMessage);
        const retryable = statusCode === 429 || statusCode === 503 || statusCode === 504;
        const canRetry = attempt < maxAttempts && retryable;

        logger.warn('[ai] provider error', {
          mode,
          requestId: options?.requestId ?? null,
          attempt,
          maxAttempts,
          statusCode,
          retryable,
          error: providerErrorMessage
        });
        if (retryable) {
          await recordAiCircuitFailure(mode);
        }

        if (canRetry) {
          // Exponential backoff with jitter; for rate limiting, lean a bit more conservative.
          const base = statusCode === 429 ? 1000 : 250;
          const cap = statusCode === 429 ? 12_000 : 2500;
          const expBackoff = Math.min(cap, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 250);
          // If we got rate-limited, the provider often needs a full cool-down.
          // On the first retry, prefer waiting close to our default Retry-After.
          const backoff = statusCode === 429 && attempt === 1
            ? computeDefaultRetryAfterMs(429) + Math.floor(Math.random() * 500)
            : expBackoff;
          lastRetryAfterMs = backoff;
          if (totalTimeoutMs !== null) {
            const remaining = totalTimeoutMs - (getNowMs() - startedAt);
            const sleepMs = Math.max(0, Math.min(backoff, remaining - 50));
            if (sleepMs > 0) await sleep(sleepMs);
            else {
              return {
                success: false,
                error: {
                  statusCode: 504,
                  message: 'AI_GENERATION_FAILED: AI provider error',
                  error: 'AI_GENERATION_FAILED: Request aborted (deadline exceeded)',
                  details: {
                    mode,
                    requestId: options?.requestId || null,
                    attempt,
                    elapsedMs: getNowMs() - startedAt
                  }
                }
              };
            }
          } else {
            await sleep(backoff);
          }
          continue;
        }

        return {
          success: false,
          error: {
            statusCode,
            message: 'AI_GENERATION_FAILED: AI provider error',
            error: providerErrorMessage,
            details: {
              mode,
              requestId: options?.requestId || null,
              attempt,
              elapsedMs: getNowMs() - startedAt,
              ...(statusCode === 429 ? {
                retryAfterMs: Math.max(lastRetryAfterMs || 0, computeDefaultRetryAfterMs(statusCode))
              } : {})
            }
          }
        };
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (result === undefined) {
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: AI provider error',
          error: 'No result',
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }

    if (result && typeof result === 'object' && 'error' in result && result.error) {
      logger.error('[ai] error result', { mode, requestId: options?.requestId ?? null, error: String(result.error) });
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: AI returned error',
          error: String(result.error),
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }
    try {
      validateResultBeforeSave(mode, result);
    } catch (validationError) {
      const validationErrorMessage = errorMessage(validationError);
      logger.warn('[ai] invalid result', { mode, requestId: options?.requestId ?? null, error: validationErrorMessage });
      return {
        success: false,
        error: {
          statusCode: 400,
          message: 'AI_GENERATION_FAILED: Generated data is invalid',
          error: validationErrorMessage,
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }
    return {
      success: true,
      data: result as T
    };
  } catch (error) {
    const unexpectedErrorMessage = errorMessage(error);
    logger.error('[ai] unexpected error', { mode, requestId: options?.requestId ?? null, error: unexpectedErrorMessage });
    let statusCode = 400;
    if (unexpectedErrorMessage.includes('AI_GENERATION_FAILED') || unexpectedErrorMessage.includes('timeout') || unexpectedErrorMessage.includes('network')) {
      statusCode = classifyAIProviderStatus(unexpectedErrorMessage);
    }
    return {
      success: false,
      error: {
        statusCode,
        message: unexpectedErrorMessage.includes('required') || unexpectedErrorMessage.includes('must be') ? `Invalid input: ${unexpectedErrorMessage}` : 'AI_GENERATION_FAILED: Unexpected error',
        error: unexpectedErrorMessage,
        details: {
          mode,
          requestId: options?.requestId || null
        }
      }
    };
  }
}
export function sendAIError(res: Response, error: AIError): void {
  const statusCode = Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 502;
  const details = error.details && typeof error.details === 'object'
    ? error.details as Record<string, unknown>
    : {};
  const retryAfterMs = Number(details.retryAfterMs);

  if (statusCode === 429) {
    const normalizedRetryAfterMs = Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? retryAfterMs
      : computeDefaultRetryAfterMs(429);
    const retryAfterSeconds = Math.max(1, Math.ceil(normalizedRetryAfterMs / 1000));
    // Standard hint for clients/proxies.
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  // Provider messages/details can contain URLs, quota metadata, stack traces,
  // or other implementation details. Only expose the stable message and the
  // retry hint needed by clients.
  res.status(statusCode).json({
    message: error.message,
    ...(statusCode === 429 && Number.isFinite(retryAfterMs) && retryAfterMs > 0
      ? { details: { retryAfterMs } }
      : {})
  });
}
