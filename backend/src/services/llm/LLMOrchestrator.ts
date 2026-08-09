import { CloudflareAIProvider } from './CloudflareAIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { LocalLLMProvider } from './LocalLLMProvider';
import type { LLMProvider } from './LLMProvider';
import { tryFixJsonResponse } from '../../../../shared/utils/taskValidator';
import { AIResponseValidator } from './AIResponseValidator';
import { logger } from '../../utils/logger';
import { redisKey, runWithRedis } from '../redis/sharedRedis';
import { BoundedCache } from '../../utils/boundedCache';
import { env } from '../../env';

export type LLMTaskLanguage = "JAVA" | "PYTHON" | "CPP";

export interface AiTaskGenerationResult {
  title: string;
  topic: string;
  difficulty: number;
  theoryMarkdown: string;
  practicalTask: string;
  /**
   * Machine-only task IO type (not meant to be shown in the statement).
   * Used to generate tests and pick a judge checker.
   */
  ioType?: "STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT";
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  examples: Array<{
    input: string;
    output: string;
    explanation: string;
  }>;
  codeTemplate: string;
}
export interface AiTheoryResult {
  theory: string;
}
export interface AiQuizResult {
  quizJson: string;
}
export interface TestDataExample {
  input: string;
  output: string;
  explanation?: string;
}

type TaskAnchor = {
  topic: string;
  coreOperation: string;
  allowedScope: string[];
  forbiddenScope: string[];
};

// Tunables sourced from env.ts so values are parsed, validated and bounded
// in one place. Reverse proxies (e.g., nginx proxy_read_timeout) must be
// >= LLM_TASK_TIMEOUT_MS to avoid 504s on slower generations.
const LLM_TASK_TIMEOUT_MS = env.__llmTaskTimeoutMs;
const LLM_TASK_MAX_TOKENS = env.__llmTaskMaxTokens;
const LLM_TASK_THEORY_CONTEXT_CHARS = env.__llmTaskTheoryContextChars;
const LLM_TASK_PREVIOUS_TASKS_CONTEXT_CHARS = env.__llmTaskPreviousTasksContextChars;
const LLM_TASK_ANCHOR_CACHE_TTL_MS = env.__llmTaskAnchorCacheTtlMs;
const LLM_TASK_ANCHOR_CACHE_ENABLED = env.__llmTaskAnchorCacheEnabled;

function cloneTaskAnchor(anchor: TaskAnchor): TaskAnchor {
  return {
    topic: String(anchor.topic ?? ''),
    coreOperation: String(anchor.coreOperation ?? ''),
    allowedScope: Array.isArray(anchor.allowedScope) ? anchor.allowedScope.map(s => String(s ?? '')) : [],
    forbiddenScope: Array.isArray(anchor.forbiddenScope) ? anchor.forbiddenScope.map(s => String(s ?? '')) : []
  };
}

function isTaskAnchor(value: unknown): value is TaskAnchor {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.topic === 'string'
    && typeof raw.coreOperation === 'string'
    && Array.isArray(raw.allowedScope)
    && Array.isArray(raw.forbiddenScope);
}

function taskAnchorRedisKey(cacheKey: string): string {
  return redisKey('llm-anchor', cacheKey);
}

function buildTaskAnchorCacheKey(params: {
  topicTitle: string;
  lang: LLMTaskLanguage;
}): string {
  return `${params.lang}|${String(params.topicTitle ?? '').trim().toLowerCase()}`;
}

function compactPromptText(raw: string, maxLength: number): string {
  const normalized = String(raw ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;

  const clipped = normalized.slice(0, maxLength);
  const preferredBoundary = Math.max(
    clipped.lastIndexOf('\n\n'),
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? ')
  );
  const cutAt = preferredBoundary > Math.floor(maxLength * 0.65)
    ? preferredBoundary + 1
    : maxLength;
  return clipped.slice(0, cutAt).trim();
}

function getDifficultyPrompt(difus: number, isEnglish: boolean = false): string {
  if (isEnglish) {
    if (difus < 0.2) return "Level: BEGINNER (Very easy). The task should be as simple as possible, focus only on syntax. No complex algorithms.";
    if (difus < 0.4) return "Level: EASY. Simple task, minimum conditions. Focus on understanding the topic.";
    if (difus < 0.6) return "Level: MEDIUM. Add 1-2 simple conditions or branching. Standard difficulty.";
    if (difus < 0.8) return "Level: ABOVE MEDIUM. Requires some thinking. Can add an unobvious moment in the statement.";
    return "Level: HARD. Task for logical thinking. Requires optimization or handling edge cases.";
  }
  if (difus < 0.2) return "Рівень: ПОЧАТКОВИЙ (Дуже легко). Завдання має бути максимально простим, лише на відпрацювання синтаксису. Жодних складних алгоритмів.";
  if (difus < 0.4) return "Рівень: ЛЕГКИЙ. Просте завдання, мінімум умов. Фокус на розумінні теми.";
  if (difus < 0.6) return "Рівень: СЕРЕДНІЙ. Додай 1-2 прості умови або розгалуження. Стандартна складність.";
  if (difus < 0.8) return "Рівень: ВИЩЕ СЕРЕДНЬОГО. Потрібно трохи подумати. Можна додати неочевидний момент в умові.";
  return "Рівень: СКЛАДНИЙ. Завдання на логічне мислення. Вимагає оптимізації або обробки граничних випадків.";
}

function normalizeResponseLanguage(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 64);
}

function buildResponseLanguageInstruction(responseLanguage: string | null, isEnglishUI: boolean): string {
  if (!responseLanguage) return "";
  return isEnglishUI
    ? `\n\nIMPORTANT RESPONSE LANGUAGE: Write all explanatory text in ${responseLanguage}. Keep source code syntax unchanged.`
    : `\n\nВАЖЛИВО: Пиши весь пояснювальний текст мовою "${responseLanguage}". Синтаксис коду залишай мовою програмування.`;
}

function shouldFallbackToOpenRouter(error: any): boolean {
  if (!error) return false;
  if (error.shouldFallback) return true;
  const message = error.message || String(error);
  // Fall back when Cloudflare worker is down, overloaded or temporarily refusing.
  return message.includes('502') || message.includes('Bad Gateway') || message.includes('HTTP 429') || message.includes('429 Too') || message.toLowerCase().includes('too many requests');
}

function shouldFallbackToCloudflare(error: any): boolean {
  if (!error) return false;
  const message = (error.message || String(error)).toLowerCase();
  // Fall back when OpenRouter is rate-limited or temporarily unavailable.
  return message.includes('rate limit') || message.includes('temporarily rate-limited') || message.includes('too many requests') || /\b429\b/.test(message) || message.includes('timeout') || message.includes('timed out');
}

function isCloudflareConfigured(): boolean {
  return !!String(process.env.CLOUDFLARE_AI_URL || '').trim();
}

function isOpenRouterConfigured(): boolean {
  const primary = String(process.env.OPENROUTER_API_KEY || '').trim();
  const backups = String(process.env.OPENROUTER_BACKUP_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
  return !!primary || backups.length > 0;
}

function isLocalConfigured(): boolean {
  return !!String(process.env.LOCAL_LLM_URL || '').trim();
}

function preferredProvider(): 'cloudflare' | 'openrouter' | 'local' | 'auto' {
  const raw = String(process.env.LLM_PROVIDER || 'auto').toLowerCase().trim();
  if (raw === 'cloudflare') return 'cloudflare';
  if (raw === 'openrouter') return 'openrouter';
  if (raw === 'local' || raw === 'local-llm' || raw === 'selfhosted') return 'local';
  return 'auto';
}
function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = error.message || String(error);
  return message.includes('timeout') || message.includes('network') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('Failed to parse') || message.includes('Empty response') || message.includes('Invalid JSON');
}
export class LLMOrchestrator {
  private cloudflareProvider: CloudflareAIProvider;
  private openRouterProvider: OpenRouterProvider;
  private localProvider: LocalLLMProvider;
  // Bounded LRU+TTL: previously a Map with size-256-trigger that only evicted
  // expired entries — under hot traffic with fresh entries it could grow
  // unboundedly across long-lived processes.
  private static readonly taskAnchorCache = new BoundedCache<string, TaskAnchor>({
    maxEntries: 512,
    ttlMs: LLM_TASK_ANCHOR_CACHE_TTL_MS
  });
  constructor() {
    this.cloudflareProvider = new CloudflareAIProvider();
    this.openRouterProvider = new OpenRouterProvider();
    this.localProvider = new LocalLLMProvider();
  }

  private async getCachedTaskAnchor(cacheKey: string): Promise<TaskAnchor | null> {
    if (!LLM_TASK_ANCHOR_CACHE_ENABLED) return null;
    const anchor = LLMOrchestrator.taskAnchorCache.get(cacheKey);
    if (!anchor) return null;
    return cloneTaskAnchor(anchor);
  }

  private async getCachedTaskAnchorFromRedis(cacheKey: string): Promise<TaskAnchor | null> {
    if (!LLM_TASK_ANCHOR_CACHE_ENABLED) return null;
    const raw = await runWithRedis('llm anchor cache get', async redis => {
      return await redis.get(taskAnchorRedisKey(cacheKey));
    });
    if (typeof raw !== 'string' || !raw.trim()) return null;

    try {
      const parsed = JSON.parse(raw);
      if (!isTaskAnchor(parsed)) return null;
      const anchor = cloneTaskAnchor(parsed);
      LLMOrchestrator.taskAnchorCache.set(cacheKey, anchor);
      return anchor;
    } catch {
      return null;
    }
  }

  private setCachedTaskAnchor(cacheKey: string, anchor: TaskAnchor): void {
    if (!LLM_TASK_ANCHOR_CACHE_ENABLED) return;
    const normalizedAnchor = cloneTaskAnchor(anchor);
    LLMOrchestrator.taskAnchorCache.set(cacheKey, normalizedAnchor);

    void runWithRedis('llm anchor cache set', async redis => {
      await redis.set(taskAnchorRedisKey(cacheKey), JSON.stringify(normalizedAnchor), {
        PX: LLM_TASK_ANCHOR_CACHE_TTL_MS,
      });
      return true;
    });
  }

  private normalizeTemplateTodoComments(params: {
    template: string;
    language: LLMTaskLanguage;
    todoText: string;
  }): string {
    const original = params.template ?? '';
    const template = String(original).replace(/\r\n/g, '\n');
    const lines = template.split('\n');

    const hasCyrillic = /[\u0400-\u04FF]/.test(template);
    const looksLikeRussianInstruction = /\b(присвойте|переменн|переменных|выведите|введите|считайте|найдите)\b/i.test(template);
    const shouldAggressivelyNormalizeComments = hasCyrillic && looksLikeRussianInstruction;

    const normalizePython = (line: string): string => {
      const todoMatch = line.match(/^(\s*)#\s*todo\b.*$/i);
      if (todoMatch) return `${todoMatch[1]}# TODO: ${params.todoText}`;

      if (shouldAggressivelyNormalizeComments) {
        const m = line.match(/^(\s*)#\s*.+$/);
        if (m) return `${m[1]}# TODO: ${params.todoText}`;
      }
      return line;
    };

    const normalizeJava = (line: string): string => {
      const todoMatch = line.match(/^(\s*)\/\/\s*todo\b.*$/i);
      if (todoMatch) return `${todoMatch[1]}// TODO: ${params.todoText}`;

      if (shouldAggressivelyNormalizeComments) {
        const m = line.match(/^(\s*)\/\/\s*.+$/);
        if (m) return `${m[1]}// TODO: ${params.todoText}`;
      }
      return line;
    };

    const normalizedLines = lines.map(line => {
      if (params.language === "PYTHON") return normalizePython(line);
      return normalizeJava(line);
    });

    return normalizedLines.join('\n').trim();
  }
  async generateTaskWithAI(params: {
    topicTitle: string;
    theory: string;
    lang: LLMTaskLanguage;
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    /** Optional brief list of previously generated tasks in the same topic (to enforce uniqueness). */
    previousTasks?: string;
    /** Optional IO-type allowlist (e.g., disallow STDIN before input is taught). */
    allowedIoTypes?: Array<"STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT">;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    /** Optional request cancellation/deadline. */
    signal?: AbortSignal;
    /** Semantic-gate retries inside generateTaskFromAnchor (0..2). */
    semanticRetries?: number;
    /** Inbound request id for trace correlation across HTTP -> orchestrator. */
    requestId?: string;
  }): Promise<AiTaskGenerationResult> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateTaskWithAI({
        topicTitle: params.topicTitle,
        theory: params.theory,
        lang: params.lang,
        numInTopic: params.numInTopic,
        isFirstTask: params.isFirstTask,
        difus: params.difus,
        isControl: params.isControl,
        prevTopics: params.prevTopics,
        previousTasks: params.previousTasks,
        allowedIoTypes: params.allowedIoTypes,
        userId: params.userId,
        topicId: params.topicId
      }, {
        signal: params.signal
      });
      return AIResponseValidator.validateGenerateTask(raw, params.topicTitle);
    };

    const tryOpenRouter = async () => {
      return await this.generateTaskWithAI_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateTaskWithAI_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    // OpenRouter preferred.
    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateTaskAnchor(params: {
    topicTitle: string;
    lang: LLMTaskLanguage;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
    requestId?: string;
  }, providerOverride?: LLMProvider): Promise<{
    topic: string;
    coreOperation: string;
    allowedScope: string[];
    forbiddenScope: string[];
  }> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const isEnglish = params.language === "en";
    const anchorSchema = {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: isEnglish ? `Task topic (MUST be "${params.topicTitle}")` : `Тема завдання (ОБОВ'ЯЗКОВО "${params.topicTitle}")`
        },
        coreOperation: {
          type: "string",
          description: isEnglish ? "One clear statement of exactly what needs to be done" : "Одна чітке формулювання того, ЩО саме потрібно зробити"
        },
        allowedScope: {
          type: "array",
          items: {
            type: "string"
          },
          description: isEnglish ? "What is allowed to be done, which actions are permitted" : "Що дозволено робити, які дії дозволені"
        },
        forbiddenScope: {
          type: "array",
          items: {
            type: "string"
          },
          description: isEnglish ? "What is strictly forbidden, which actions MUST NOT be performed" : "Що категорично заборонено, які дії НЕ МОЖНА виконувати"
        }
      },
      required: ["topic", "coreOperation", "allowedScope", "forbiddenScope"]
    };
    const systemPrompt = isEnglish
      ? `You are a semantic architect of learning tasks. Create an anchor for a task. Return ONLY JSON.`
      : `Ти семантичний архітектор навчальних завдань. Створюй anchor для завдання. Відповідай ТІЛЬКИ JSON.`;
    const userPrompt = isEnglish
      ? `Create a semantic anchor for a task on the topic "${params.topicTitle}" (language: ${langName}).

CRITICALLY IMPORTANT:
- The "topic" field in JSON MUST exactly match "${params.topicTitle}" (1:1)
- coreOperation: ONE clear statement of what exactly needs to be done (always emphasize: "write a complete program that...")
- allowedScope: what is allowed in the task (must include "complete program with main()")
- forbiddenScope: ALWAYS include: "standalone function/method/class implementation" and "unit tests" — even if the topic is about functions, the task must be about writing a complete program, not just implementing a function

Return ONLY JSON without explanations.`
      : `Створи semantic anchor для завдання з теми "${params.topicTitle}" (мова: ${langName}).

КРИТИЧНО ВАЖЛИВО:
- Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.topicTitle}" точно (1:1)
- coreOperation: ОДНА дія, що саме потрібно зробити (завжди наголошуй: "напиши повну програму, яка...")
- allowedScope: що дозволено робити в завданні (ОБОВ'ЯЗКОВО "повна програма з main()")
- forbiddenScope: ЗАВЖДИ включай: "реалізація окремих функцій/методів/класів" та "unit-тести" — навіть якщо тема про функції, завдання ПОВИННО бути про написання повної програми, а не просто реалізацію функції

Поверни ТІЛЬКИ JSON без пояснень.`;
    const expectedTopic = params.topicTitle.trim();
    const cacheKey = buildTaskAnchorCacheKey({
      topicTitle: expectedTopic,
      lang: params.lang
    });
    const fallbackAnchor = isEnglish ? {
      topic: expectedTopic,
      coreOperation: `Solve a problem on the topic "${expectedTopic}" and output the result to stdout`,
      allowedScope: [expectedTopic, 'basic language constructs', 'stdout output', 'complete program with main()'],
      forbiddenScope: [
        'multi-task structure',
        'compiler meta-messages',
        'creating files/projects',
        'implementing standalone functions/methods/classes',
        'writing unit tests instead of a complete program',
        'asking for just a function body without main()',
        'IDE/build tool configuration'
      ]
    } : {
      topic: expectedTopic,
      coreOperation: `Розв'язати задачу з теми "${expectedTopic}" та вивести результат у stdout`,
      allowedScope: [expectedTopic, 'базові конструкції мови', 'вивід у stdout', 'повна програма з main()'],
      forbiddenScope: [
        'multi-task структура',
        'мета-повідомлення компілятора',
        'створення файлів/проєктів',
        'реалізація окремих функцій/методів/класів',
        'написання unit-тестів замість повної програми',
        'просити писати лише тіло функції без main()',
        'налаштування IDE/інструментів збірки'
      ]
    };

    const cachedAnchor = await this.getCachedTaskAnchor(cacheKey);
    if (cachedAnchor) {
      logger.debug('[llm] using cached task anchor', {
        requestId: params.requestId,
        userId: params.userId,
        topicId: params.topicId,
        topic: expectedTopic,
        lang: params.lang
      });
      return cachedAnchor;
    }

    const redisCachedAnchor = await this.getCachedTaskAnchorFromRedis(cacheKey);
    if (redisCachedAnchor) {
      logger.debug('[llm] using redis-cached task anchor', {
        requestId: params.requestId,
        userId: params.userId,
        topicId: params.topicId,
        topic: expectedTopic,
        lang: params.lang
      });
      return redisCachedAnchor;
    }

    const maxAnchorAttempts = 2;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAnchorAttempts; attempt++) {
      try {
        const parsed = await provider.generateJSON<{
          topic: string;
          coreOperation: string;
          allowedScope: string[];
          forbiddenScope: string[];
        }>(userPrompt, anchorSchema, systemPrompt, {
          timeout: LLM_TASK_TIMEOUT_MS,
          maxRetries: 0,
          userId: params.userId,
          topicId: params.topicId,
          signal: params.signal,
          temperature: 0.2,
          maxTokens: 500
        });

        const parsedTopicRaw = typeof parsed?.topic === 'string' ? parsed.topic.trim() : '';
        const coreOperationRaw = typeof parsed?.coreOperation === 'string' ? parsed.coreOperation.trim() : '';
        const allowedScopeRaw = Array.isArray(parsed?.allowedScope)
          ? parsed.allowedScope.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : [];
        const forbiddenScopeRaw = Array.isArray(parsed?.forbiddenScope)
          ? parsed.forbiddenScope.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          : [];

        const parsedTopic = parsedTopicRaw || expectedTopic;
        const coreOperation = coreOperationRaw.length >= 10
          ? coreOperationRaw
          : fallbackAnchor.coreOperation;
        const allowedScope = allowedScopeRaw.length > 0 ? allowedScopeRaw : fallbackAnchor.allowedScope;
        const forbiddenScope = forbiddenScopeRaw.length > 0 ? forbiddenScopeRaw : fallbackAnchor.forbiddenScope;

        // Never fail on topic mismatch here; force canonical topic to keep generation stable.
        const topic = parsedTopic === expectedTopic ? parsedTopic : expectedTopic;
        if (parsedTopic !== expectedTopic) {
          logger.warn('[llm] anchor topic mismatch, forced expected topic', {
            requestId: params.requestId,
            expectedTopic,
            receivedTopic: parsedTopic,
            userId: params.userId,
            topicId: params.topicId,
            attempt
          });
        }

        const resolvedAnchor: TaskAnchor = {
          topic,
          coreOperation,
          allowedScope,
          forbiddenScope
        };
        this.setCachedTaskAnchor(cacheKey, resolvedAnchor);
        return resolvedAnchor;
      } catch (err) {
        lastErr = err;
        logger.warn('[llm] anchor generation attempt failed', {
          requestId: params.requestId,
          attempt,
          maxAnchorAttempts,
          userId: params.userId,
          topicId: params.topicId,
          error: String((err as any)?.message || err)
        });
      }
    }

    logger.warn('[llm] using fallback anchor after failed anchor attempts', {
      requestId: params.requestId,
      userId: params.userId,
      topicId: params.topicId,
      expectedTopic,
      error: String((lastErr as any)?.message || lastErr || 'unknown')
    });
    this.setCachedTaskAnchor(cacheKey, fallbackAnchor);
    return fallbackAnchor;
  }
  private async generateTaskFromAnchor(params: {
    topicTitle: string;
    theory: string;
    lang: LLMTaskLanguage;
    anchor: {
      topic: string;
      coreOperation: string;
      allowedScope: string[];
      forbiddenScope: string[];
    };
    prevTopics?: string;
    previousTasks?: string;
    allowedIoTypes?: Array<"STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT">;
    difus?: number;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
    semanticRetries?: number;
    requestId?: string;
  }, providerOverride?: LLMProvider): Promise<AiTaskGenerationResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const isEnglish = params.language === "en";
    const difficultyPrompt = getDifficultyPrompt(params.difus ?? 0, isEnglish);
    const jsonSchema = {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: isEnglish ? "Task title" : "Назва завдання"
        },
        topic: {
          type: "string",
          description: isEnglish ? `Task topic (MUST be "${params.anchor.topic}")` : `Тема завдання (ОБОВ'ЯЗКОВО "${params.anchor.topic}")`
        },
        difficulty: {
          type: "number",
          description: isEnglish ? "Difficulty 0-5" : "Складність 0-5"
        },
        theoryMarkdown: {
          type: "string",
          description: isEnglish ? "Theory in Markdown format" : "Теорія у форматі Markdown"
        },
        practicalTask: {
          type: "string",
          description: isEnglish ? "Practical task" : "Практичне завдання"
        },
        ioType: {
          type: "string",
          description: isEnglish ? "IO TYPE (machine-only; DO NOT show in statement). One of: STDIN_STDOUT | NO_INPUT_FIXED_OUTPUT | NO_INPUT_FREE_OUTPUT" : "ТИП ВВОДУ/ВИВОДУ (machine-only; НЕ показувати у statement). Один з: STDIN_STDOUT | NO_INPUT_FIXED_OUTPUT | NO_INPUT_FREE_OUTPUT",
          enum: ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"]
        },
        inputFormat: {
          type: "string",
          description: isEnglish ? "Input format" : "Формат вхідних даних"
        },
        outputFormat: {
          type: "string",
          description: isEnglish ? "Output format" : "Формат вихідних даних"
        },
        constraints: {
          type: "string",
          description: isEnglish ? "Constraints" : "Обмеження"
        },
        examples: {
          type: "array",
          items: {
            type: "object",
            properties: {
              input: {
                type: "string"
              },
              output: {
                type: "string"
              },
              explanation: {
                type: "string"
              }
            },
            required: ["input", "output", "explanation"]
          }
        },
        codeTemplate: {
          type: "string",
          description: isEnglish ? "Code template" : "Шаблон коду"
        }
      },
      required: ["title", "topic", "difficulty", "theoryMarkdown", "practicalTask", "ioType", "inputFormat", "outputFormat", "constraints", "examples", "codeTemplate"]
    };
    const systemPrompt = isEnglish
      ? `You are an experienced programming teacher. Create high-quality tasks with theory and practice. Respond in English in JSON format according to the provided schema.

CRITICAL: The "topic" field in JSON MUST be equal to "${params.anchor.topic}". DO NOT change the anchor.`
      : `Ти досвідчений викладач програмування. Створюй якісні завдання з теорією та практикою. Відповідай українською мовою у форматі JSON згідно з наданою схемою.

КРИТИЧНО: Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.anchor.topic}". НЕ змінюй anchor.`;
    const allowedIoTypes = Array.isArray(params.allowedIoTypes) && params.allowedIoTypes.length
      ? params.allowedIoTypes
      : ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"];
    const stdinAllowed = allowedIoTypes.includes("STDIN_STDOUT");
    const compactPreviousTasks = compactPromptText(params.previousTasks ?? '', LLM_TASK_PREVIOUS_TASKS_CONTEXT_CHARS);
    const compactTheoryContext = compactPromptText(params.theory, LLM_TASK_THEORY_CONTEXT_CHARS);

    let uniquenessBlock = "";
    if (compactPreviousTasks) {
      uniquenessBlock = isEnglish
        ? `\n\nALREADY GENERATED TASKS IN THIS TOPIC (to avoid repetition):\n${compactPreviousTasks}\n\nYour new task MUST be SUBSTANTIALLY DIFFERENT: different plot/data/wording, different examples, and different numbers.`
        : `\n\nВЖЕ ЗГЕНЕРОВАНІ ЗАВДАННЯ У ЦІЙ ТЕМІ (щоб уникнути повторів):\n${compactPreviousTasks}\n\nТвоє нове завдання має бути СУТТЄВО ІНШИМ: інший сюжет/дані/формулювання, інші приклади та інші числа.`;
    }

    const userPromptBaseEn = `
SEMANTIC ANCHOR (IMMUTABLE - DO NOT CHANGE):
- Topic: ${params.anchor.topic}
- Core operation: ${params.anchor.coreOperation}
- Allowed: ${params.anchor.allowedScope.join(', ')}
- Forbidden: ${params.anchor.forbiddenScope.join(', ')}

Programming language: ${langName}
${difficultyPrompt}
`;
    const userPromptBaseUa = `
SEMANTIC ANCHOR (IMMUTABLE - НЕ ЗМІНЮЙ):
- Тема: ${params.anchor.topic}
- Основна операція: ${params.anchor.coreOperation}
- Дозволено: ${params.anchor.allowedScope.join(', ')}
- Заборонено: ${params.anchor.forbiddenScope.join(', ')}

Мова програмування: ${langName}
${difficultyPrompt}
`;

    const instructionsUa = `${stdinAllowed ? '' : `
🚫 IO-ПОЛІТИКА ЦІЄЇ ТЕМИ (НАЙВИЩИЙ ПРІОРИТЕТ) 🚫
ВВІД ЗАБОРОНЕНО. Постав ioType = NO_INPUT_FIXED_OUTPUT (або NO_INPUT_FREE_OUTPUT). Програма НЕ читає stdin: жодних input()/Scanner/BufferedReader/System.in/cin/std::cin/getline. examples[0].input = "". Якщо нижче щось підказує читати ввід — ІГНОРУЙ, ця політика головніша.
`}
⚠️ ПЕРШ ЛІЖ УСЬОГО — ОСНОВНЕ ПРАВИЛО ⚠️
ЗАВДАННЯ ОБОВ'ЯЗКОВО ПОВИННО ВИМАГАТИ ПОВНОЇ ПРОГРАМИ (Програма = код зі STDIN/STDOUT або без вводу).
ЯКЩО ТИ НАПИШЕШ, ЩО СТУДЕНТ ПОВИНЕН РЕАЛІЗУВАТИ ФУНКЦІЮ/МЕТОД/КЛАС (ЗАМІСТЬ ПОВНОЇ ПРОГРАМИ) — ЗАВДАННЯ БУДЕ АВТОМАТИЧНО ВІДХИЛЕНО.
ЖОДНОЇ ЧАСТИНИ ФУНКЦІЙ, ЖОДНИХ UNIT-ТЕСТІВ, ЖОДНИХ КЛАССІВ — ТІЛЬКИ ПОВНА ПРОГРАМА З main().

КРИТИЧНО ВАЖЛИВО:
1. Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.anchor.topic}" (immutable)
2. Практичне завдання (practicalTask) ОБОВ'ЯЗКОВО має містити "${params.anchor.coreOperation}"
3. Будь-який контент поза allowedScope = ПОМИЛКА
4. Будь-який контент з forbiddenScope = ПОМИЛКА
5. ЗАБОРОНЕНО створювати multi-task структури (Завдання 1, Завдання 2, Контрольна робота з кількома завданнями)
6. Одне завдання = одна операція "${params.anchor.coreOperation}"

ПЛАТФОРМА / АВТОПЕРЕВІРКА (обов'язково):
- Завдання має бути перевірюваним автотестом через stdout (та stdin лише якщо дозволено).
- Студент пише рішення в ОДНОМУ файлі (Main.java / main.py / main.cpp).
- ЗАБОРОНЕНО: вимагати реалізувати окрему функцію/метод/клас замість повної програми; завдання має бути розв'язане через stdin/stdout.
- ЗАБОРОНЕНО: просити створювати файли/папки/проєкти, налаштовувати IDE/компілятор, CMake/Makefile, структуру src/include тощо.
- Якщо тема про структуру проєкту — перетвори це на програмне завдання (наприклад: вивести текст/схему структури), але все одно лише через stdout.

КОНКРЕТНІ ПРИКЛАДИ:
✓ ДОБРЕ (повна програма зі stdin/stdout):
  "Напиши програму, яка читає два цілих числа зі stdin та виводить їх суму у stdout."
✗ ПОГАНО (тільки функція — ЗАБОРОНЕНО):
  "Реалізуй функцію sum(a, b), яка повертає суму двох чисел."
✓ ДОБРЕ (без вводу, фіксований вивід):
  "Напиши програму, яка виводить у stdout текст: Привіт, світ!"
✗ ПОГАНО (вимагає unit-тестів — ЗАБОРОНЕНО):
  "Напиши функцію, яка перевіряє, чи число просте."

ЯКІСТЬ УМОВИ (важливо для студентів):
- practicalTask має бути пізнавальним, цікавим і зрозумілим: мінімум 4–6 речень зв'язного тексту (1–2 абзаци), з природним стилем як у класичній умові задачі.
- У перших 1–2 реченнях ОБОВ'ЯЗКОВО поясни простими словами, що саме треба вивести, щоб студент це зрозумів ще ДО секції "Формат вихідних даних".
- Додай короткий реалістичний контекст (міні-сюжет), але без зайвої "води".
- Окремим фінальним реченням у practicalTask додай маркер "Що потрібно вивести: ...", але не можна писати саме "Що потрібно вивести:", а до прикладу: Необхідно вивести n, тощо (без списків).
- Заборонено робити умову «в 1 рядок» типу “Оголосіть змінну ...”. Додай контекст і чіткий критерій перевірки.
- КАТЕГОРИЧНО ЗАБОРОНЕНО оформлювати practicalTask як нумерований чекліст типу "1.", "2.", "3.".
- Якщо треба структуру, роби це через зв'язні речення; не перетворюй умову на список кроків.
- Якщо завдання про змінні/типи/операції — вимагай ВИВЕСТИ результат (print) так, щоб автотест міг перевірити (детермінований stdout).

ДОЗВОЛЕНІ IO-ТИПИ (allowedIoTypes): ${allowedIoTypes.join(' | ')}
- Якщо STDIN_STDOUT НЕ дозволено — ЗАБОРОНЕНО просити введення даних, читати stdin або згадувати input()/Scanner/System.in/std::cin/cin/getline.
- Якщо STDIN_STDOUT дозволено — можна робити задачі зі stdin.

ПРІОРИТЕТ ТОЧНОСТІ УМОВИ:
- У practicalTask явно вкажи: (1) що дано, (2) що потрібно обчислити/визначити, (3) що саме і в якому форматі вивести.
- Для outputFormat не використовуй розмиті слова: "тощо", "і т.д.", "і тд", "або щось подібне", "будь-який" (окрім NO_INPUT_FREE_OUTPUT).
- Якщо можливі кілька фіксованих відповідей (наприклад, день тижня/помилка) — перелічи їх явно.

М'ЯКЕ ПОВТОРЕННЯ МИНУЛИХ ТЕМ:
- Ненав'язливо використай 1 знайомий прийом із попередніх тем, щоб студент не забував матеріал.
- Це має бути природно і НЕ перетворювати завдання на multi-task.
${params.prevTopics && params.prevTopics.trim().length > 0 ? `Попередні теми:\n${params.prevTopics.trim()}` : ''}

Теорія з теми (для контексту):
${compactTheoryContext}
${uniquenessBlock}

ШАБЛОН КОДУ (codeTemplate) - ЗАБОРОНЕНО писати реалізацію:
- Для Java: ТІЛЬКИ порожній клас Main з методом main та TODO-коментарем
- Для Python: ТІЛЬКИ порожня функція main() з if __name__ == "__main__" та TODO-коментарем
- Для C++: ТІЛЬКИ порожній int main() з TODO-коментарем (можна з #include <iostream> та швидким I/O)
- ЗАБОРОНЕНО: писати реалізацію, готовий код

ВХІДНІ ДАНІ (inputFormat):

ТИП ЗАВДАННЯ (ioType) — ОКРЕМО ВІД ТЕКСТУ:
- Ти ОБОВ'ЯЗКОВО маєш заповнити поле ioType, але НЕ згадуй його у practicalTask/inputFormat/outputFormat (це machine-only).
- STDIN_STDOUT: стандартне завдання з stdin і єдиним правильним output для кожного input.
- NO_INPUT_FIXED_OUTPUT: немає вводу; output строго визначений (наприклад, вивести конкретний рядок/число).
- NO_INPUT_FREE_OUTPUT: немає вводу; дозволено вивести будь-який НЕПОРОЖНІЙ результат (перевірка буде лише на "не порожній stdout").

КРИТИЧНО ДЛЯ АВТОТЕСТІВ:
- Якщо ioType = STDIN_STDOUT або NO_INPUT_FIXED_OUTPUT: за заданим input існує ЄДИНИЙ правильний output.
- Якщо ioType = NO_INPUT_FREE_OUTPUT: явно напиши в outputFormat, що можна вивести будь-який НЕПОРОЖНІЙ рядок (без зайвих слів/міток).
- Заборонені будь-які підказки/тексти у виводі типу "Введіть число" або "Відповідь:".

ВИМОГА ПРО ВВІД:
- Якщо ioType = NO_INPUT_FIXED_OUTPUT або NO_INPUT_FREE_OUTPUT: inputFormat ОБОВ'ЯЗКОВО має явно сказати, що вхідних даних немає.
- ${stdinAllowed ? 'STDIN_STDOUT дозволено.' : 'STDIN_STDOUT ЗАБОРОНЕНО — обери NO_INPUT_*.'}

ВИХІДНІ ДАНІ (outputFormat):
- outputFormat — це контракт для автоперевірки. Опиши РІВНО те, що треба вивести, включно з усіма пробілами/двокрапками/переносами рядків, якщо вони важливі.
- Якщо ioType = NO_INPUT_FIXED_OUTPUT: outputFormat МАЄ бути ТОЧНИМ текстом, який програма має вивести в stdout (як готовий expected output), а не описом.
- Якщо очікується кілька рядків, outputFormat ОБОВ'ЯЗКОВО подай багаторядково: кожен рядок на новому рядку (реальні переноси \n), у правильному порядку, без злиття в один рядок.
- КАТЕГОРИЧНО ЗАБОРОНЕНО писати у outputFormat або examples.output мета-фрази на кшталт:
  "Програма скомпілювалася та виконалась без помилок.", "Program compiled and ran without errors", "Success" тощо.
- Мітки/префікси (наприклад "integer: ") ДОЗВОЛЕНІ лише якщо вони є частиною expected output. Якщо використовуєш мітки — вони мають бути:
  (a) явно прописані в outputFormat (дослівно),
  (b) узгоджені з examples.output,
  (c) згадані в practicalTask як вимога "виведіть у такому форматі".

КРИТИЧНО ПРО ДЕТЕРМІНОВАНІСТЬ:
- Заборонено формулювати NO_INPUT_FIXED_OUTPUT задачі так, щоб значення або формат були "як завгодно".
  Якщо немає вводу, ти МАЄШ задати конкретні значення в умові (наприклад: integer=10, float=3.14, ...)
  і вимагати точний формат виводу (наприклад 4 рядки з мітками).
${stdinAllowed
  ? '- Якщо ти хочеш перевіряти оголошення/присвоєння змінних, але не хочеш фіксувати значення — обирай STDIN_STDOUT і читай значення зі stdin.'
  : '- STDIN_STDOUT ЗАБОРОНЕНО на цьому етапі: НЕ читай stdin (жодних input()/Scanner/cin). Навіть для завдань про оголошення/присвоєння змінних — задай конкретні значення прямо в умові (наприклад x=10, y=3.14) і вимагай точний детермінований вивід (NO_INPUT_FIXED_OUTPUT).'}
- NO_INPUT_FREE_OUTPUT використовуй ТІЛЬКИ для завдань, де за задумом приймається будь-який непорожній stdout (наприклад: "виведіть будь-яке привітання").

ЕТАЛОН ЯКОСТІ УМОВИ (це приклад лише СТИЛЮ — НЕ копіюй тему, сюжет чи числа):
"Магазин щодня записує температуру у холодильній вітрині. Сьогодні зранку термометр показував 8 градусів, а до обіду температура піднялася ще на 5. Порахуй, скільки градусів показує термометр зараз. Необхідно вивести одне ціле число — підсумкову температуру."
Чому добре: короткий живий контекст, чітко сказано ЩО рахувати і ЩО САМЕ вивести, рівно один детермінований результат.

САМОПЕРЕВІРКА ПЕРЕД ВІДПОВІДДЮ (обов'язково, інакше завдання погане):
1) Подумки виконай свою програму на КОЖНОМУ прикладі й переконайся, що examples[i].output збігається з реальним виводом СИМВОЛ-У-СИМВОЛ (включно з пробілами/переносами).
2) Умова має спиратися ЛИШЕ на поняття з наданої теорії — нічого, чого студент на цьому етапі ще не вчив.
3) Складність відповідає вказаному рівню: не легше і не важче.
4) Сюжет, числа й формулювання НЕ банальні (заборонені кліше типу "сума двох чисел", "hello world", "знайдіть більше з двох") і відрізняються від типових прикладів.
5) practicalTask читається як жива умова (4–6 зв'язних речень), а не сухий технічний рядок.

Відповідай ТІЛЬКИ JSON, без markdown блоків, без пояснень.
`;
    const instructionsEn = `${stdinAllowed ? '' : `
🚫 IO POLICY FOR THIS STAGE (HIGHEST PRIORITY) 🚫
INPUT IS FORBIDDEN. Set ioType = NO_INPUT_FIXED_OUTPUT (or NO_INPUT_FREE_OUTPUT). The program does NOT read stdin: no input()/Scanner/BufferedReader/System.in/cin/std::cin/getline. examples[0].input = "". If anything below hints at reading input — IGNORE it, this policy wins.
`}
⚠️ MOST CRITICAL RULE — READ THIS FIRST ⚠️
THE TASK MUST REQUIRE WRITING A COMPLETE FULL PROGRAM (Program = code with STDIN/STDOUT or no input with fixed output).
IF YOU WRITE THAT A STUDENT MUST IMPLEMENT A FUNCTION/METHOD/CLASS (INSTEAD OF A FULL PROGRAM) — THE TASK WILL BE AUTOMATICALLY REJECTED.
NO FUNCTION STUBS, NO UNIT TESTS, NO CLASSES — ONLY A COMPLETE RUNNABLE PROGRAM WITH main().

CRITICALLY IMPORTANT:
1. The "topic" field in JSON MUST be equal to "${params.anchor.topic}" (immutable)
2. The practical task (practicalTask) MUST contain "${params.anchor.coreOperation}"
3. Any content outside allowedScope = ERROR
4. Any content from forbiddenScope = ERROR
5. FORBIDDEN to create multi-task structures (Task 1, Task 2, Control work with multiple tasks)
6. One task = one operation "${params.anchor.coreOperation}"

PLATFORM / AUTO-CHECK (mandatory):
- The task must be checkable by an autotest via stdout (and stdin only if allowed).
- The student writes the solution in ONE file (Main.java / main.py / main.cpp).
- FORBIDDEN: ask to implement a standalone function/method/class instead of a full program; the task must be solved via stdin/stdout.
- FORBIDDEN: asking to create files/folders/projects, configure IDE/compiler, CMake/Makefile, src/include structure, etc.
- If the topic is about project structure — turn it into a programming task (e.g., output the text/diagram of the structure), but still only via stdout.

CONCRETE EXAMPLES:
✓ GOOD (full program with stdin/stdout):
  "Write a program that reads two integers from stdin and outputs their sum to stdout."
✗ BAD (function-only - FORBIDDEN):
  "Implement a function sum(a, b) that returns the sum of two numbers."
✓ GOOD (no input, fixed output):
  "Write a program that outputs to stdout: Hello, world!"
✗ BAD (requires unit tests - FORBIDDEN):
  "Write a function that checks if a number is prime."

QUALITY OF STATEMENT (important for students):
- practicalTask must be informative, interesting, and clear: at least 4–6 sentences of connected text (1–2 paragraphs), with a natural style as in a classic problem statement.
- In the first 1–2 sentences, EXPLAIN in simple words what exactly needs to be output, so the student understands this BEFORE the "Output format" section.
- Add a short realistic context (mini-plot), but without unnecessary "filler".
- As a separate final sentence in practicalTask, add a marker "Output required: ...", but do not write "Output required:" literally, for example: "It is necessary to output n, etc." (no lists).
- Forbidden to make the statement "1 line" like "Declare a variable ...". Add context and clear check criteria.
- CATEGORICALLY FORBIDDEN to format practicalTask as a numbered checklist like "1.", "2.", "3.".
- If structure is needed, do it through connected sentences; do not turn the statement into a list of steps.
- If the task is about variables/types/operations — require to OUTPUT (print) the result so the autotest can check it (deterministic stdout).

ALLOWED IO-TYPES (allowedIoTypes): ${allowedIoTypes.join(' | ')}
- If STDIN_STDOUT is NOT allowed — FORBIDDEN to ask for data input, read stdin, or mention input()/Scanner/System.in/std::cin/cin/getline.
- If STDIN_STDOUT is allowed — you can create tasks with stdin.

PRIORITY OF STATEMENT PRECISION:
- In practicalTask, clearly state: (1) what is given, (2) what needs to be calculated/determined, (3) what exactly and in what format to output.
- For outputFormat, do not use vague words: "etc.", "and so on", "or something similar", "any" (except NO_INPUT_FREE_OUTPUT).
- If several fixed answers are possible (e.g., day of the week/error) — list them explicitly.

SOFT REPETITION OF PREVIOUS TOPICS:
- Unobtrusively use 1 familiar technique from previous topics so the student does not forget the material.
- This should be natural and NOT turn the task into a multi-task.
${params.prevTopics && params.prevTopics.trim().length > 0 ? `Previous topics:\n${params.prevTopics.trim()}` : ''}

Topic theory (for context):
${compactTheoryContext}
${uniquenessBlock}

CODE TEMPLATE (codeTemplate) - FORBIDDEN to write the implementation:
- For Java: ONLY an empty Main class with a main method and a TODO comment
- For Python: ONLY an empty main() function with if __name__ == "__main__" and a TODO comment
- For C++: ONLY an empty int main() with a TODO comment (can include #include <iostream> and fast I/O)
- FORBIDDEN: writing the implementation, ready-made code

INPUT DATA (inputFormat):

TASK TYPE (ioType) — SEPARATE FROM TEXT:
- You MUST fill the ioType field, but DO NOT mention it in practicalTask/inputFormat/outputFormat (it is machine-only).
- STDIN_STDOUT: standard task with stdin and a single correct output for each input.
- NO_INPUT_FIXED_OUTPUT: no input; output is strictly determined (e.g., output a specific string/number).
- NO_INPUT_FREE_OUTPUT: no input; allowed to output any NON-EMPTY result (check will only be for "non-empty stdout").

CRITICAL FOR AUTOTESTS:
- If ioType = STDIN_STDOUT or NO_INPUT_FIXED_OUTPUT: for a given input, there exists a SINGLE correct output.
- If ioType = NO_INPUT_FREE_OUTPUT: explicitly write in outputFormat that any NON-EMPTY line can be output (without unnecessary words/labels).
- Any prompts/texts in output like "Enter number" or "Answer:" are forbidden.

REQUIREMENT ABOUT INPUT:
- If ioType = NO_INPUT_FIXED_OUTPUT or NO_INPUT_FREE_OUTPUT: inputFormat MUST explicitly say that there is no input data.
- ${stdinAllowed ? 'STDIN_STDOUT is allowed.' : 'STDIN_STDOUT is FORBIDDEN — choose NO_INPUT_*.'}

OUTPUT DATA (outputFormat):
- outputFormat is a contract for autochecking. Describe EXACTLY what needs to be output, including all spaces/colons/newlines if they are important.
- If ioType = NO_INPUT_FIXED_OUTPUT: outputFormat MUST be the EXACT text that the program should output to stdout (as a ready-made expected output), not a description.
- If multiple lines are expected, outputFormat MUST be presented in multi-line format: each line on a new line (real \n), in the correct order, without merging into one line.
- CATEGORICALLY FORBIDDEN to write in outputFormat or examples.output meta-phrases like:
  "Program compiled and ran without errors", "Success", etc.
- Labels/prefixes (e.g., "integer: ") are ALLOWED only if they are part of the expected output. If you use labels — they must be:
  (a) explicitly written in outputFormat (literally),
  (b) consistent with examples.output,
  (c) mentioned in practicalTask as a requirement "output in this format".

CRITICAL FOR DETERMINISM:
- Forbidden to formulate NO_INPUT_FIXED_OUTPUT tasks so that values or format are "any".
  If there is no input, you MUST specify specific values in the statement (e.g., integer=10, float=3.14, ...)
  and require an exact output format (e.g., 4 lines with labels).
${stdinAllowed
  ? '- If you want to check variable declaration/assignment but don\'t want to fix values — choose STDIN_STDOUT and read values from stdin.'
  : '- STDIN_STDOUT is FORBIDDEN at this stage: do NOT read stdin (no input()/Scanner/cin). Even for variable declaration/assignment tasks — specify concrete values directly in the statement (e.g. x=10, y=3.14) and require an exact deterministic output (NO_INPUT_FIXED_OUTPUT).'}
- Use NO_INPUT_FREE_OUTPUT ONLY for tasks where any non-empty stdout is intended to be accepted (e.g., "output any greeting").

QUALITY EXEMPLAR (style only — do NOT copy this topic, plot or numbers):
"A shop logs the temperature inside its fridge display every day. This morning the thermometer read 8 degrees, and by noon it rose by another 5. Work out what the thermometer shows now. You must output a single integer — the resulting temperature."
Why it's good: short living context, clearly states WHAT to compute and WHAT exactly to output, exactly one deterministic result.

SELF-CHECK BEFORE ANSWERING (mandatory, otherwise the task is bad):
1) Mentally run your program on EVERY example and confirm examples[i].output matches the real output CHARACTER-BY-CHARACTER (including spaces/newlines).
2) The statement must rely ONLY on concepts from the provided theory — nothing the student hasn't learned yet at this stage.
3) Difficulty matches the stated level: not easier, not harder.
4) The plot, numbers and wording are NOT trivial (clichés like "sum of two numbers", "hello world", "max of two" are forbidden) and differ from typical examples.
5) practicalTask reads like a living statement (4–6 connected sentences), not a dry technical line.

Respond ONLY with JSON, without markdown blocks, without explanations.
`;

    const userPrompt = isEnglish
      ? (userPromptBaseEn + instructionsEn).trim()
      : (userPromptBaseUa + instructionsUa).trim();
    const maxRetries = (() => {
      const v = params.semanticRetries;
      if (typeof v !== 'number' || !Number.isFinite(v)) return 2;
      return Math.max(0, Math.min(2, Math.floor(v)));
    })();
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const parsed = await provider.generateJSON<any>(userPrompt, jsonSchema, systemPrompt, {
          timeout: LLM_TASK_TIMEOUT_MS,
          maxRetries: 0,
          userId: params.userId,
          topicId: params.topicId,
          signal: params.signal,
          temperature: 0.15,
          maxTokens: LLM_TASK_MAX_TOKENS
        });
        const validated = AIResponseValidator.validateGenerateTask(parsed, params.anchor.topic);
        const practicalTaskLower = validated.practicalTask.toLowerCase();
        const coreOperationLower = params.anchor.coreOperation.toLowerCase();
        const titleLower = validated.title.toLowerCase();
        const coreOperationWords = coreOperationLower.split(/\s+/).filter(w => w.length > 3);
        const coreOperationMentioned = practicalTaskLower.includes(coreOperationLower) || titleLower.includes(coreOperationLower) || coreOperationWords.length > 0 && coreOperationWords.some(word => practicalTaskLower.includes(word) || titleLower.includes(word));
        if (!coreOperationMentioned) {
          throw new Error(`CORE_OPERATION_MISSING: Practical task or title does not contain core operation "${params.anchor.coreOperation}". Generation aborted.`);
        }
        for (const forbidden of params.anchor.forbiddenScope) {
          const forbiddenLower = forbidden.toLowerCase();
          if (practicalTaskLower.includes(forbiddenLower) || validated.title.toLowerCase().includes(forbiddenLower)) {
            throw new Error(`FORBIDDEN_SCOPE_VIOLATION: Task contains forbidden scope "${forbidden}". Generation aborted.`);
          }
        }
        const multiTaskMarkers = ["завдання 1", "завдання 2", "завдання 3", "контрольна робота:", "## завдання", "підзадача", "задача 1", "задача 2"];
        const taskContentLower = (validated.title + " " + validated.practicalTask).toLowerCase();
        for (const marker of multiTaskMarkers) {
          if (taskContentLower.includes(marker)) {
            throw new Error(`MULTI_TASK_NOT_ALLOWED: Task contains multi-task marker "${marker}". Single task only. Generation aborted.`);
          }
        }
        return validated;
      } catch (err: any) {
        lastError = err;
        if (err.message && (err.message.includes('TOPIC_MISMATCH_HARD_FAIL') || err.message.includes('CORE_OPERATION_MISSING') || err.message.includes('FORBIDDEN_SCOPE_VIOLATION') || err.message.includes('MULTI_TASK_NOT_ALLOWED'))) {
          if (attempt < maxRetries) {
            logger.debug('[llm] semantic retry', { attempt: attempt + 1, maxRetries, error: err.message });
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw err;
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        const msg = String(err?.message || 'Unknown error');
        if (msg.includes('AI_GENERATION_FAILED')) {
          throw err;
        }
        throw new Error(`AI_GENERATION_FAILED: ${msg}`);
      }
    }
    throw new Error(`AI_GENERATION_FAILED: All retries exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  private async generateTaskWithAI_OpenRouter(params: {
    topicTitle: string;
    theory: string;
    lang: LLMTaskLanguage;
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    previousTasks?: string;
    allowedIoTypes?: Array<"STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT">;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
    semanticRetries?: number;
    requestId?: string;
  }, providerOverride?: LLMProvider): Promise<AiTaskGenerationResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const anchor = await this.generateTaskAnchor({
      topicTitle: params.topicTitle,
      lang: params.lang,
      userId: params.userId,
      topicId: params.topicId,
      language: params.language,
      signal: params.signal,
      requestId: params.requestId
    }, provider);
    const result = await this.generateTaskFromAnchor({
      topicTitle: params.topicTitle,
      theory: params.theory,
      lang: params.lang,
      anchor: anchor,
      prevTopics: params.prevTopics,
      previousTasks: params.previousTasks,
      allowedIoTypes: params.allowedIoTypes,
      difus: params.difus,
      userId: params.userId,
      topicId: params.topicId,
      language: params.language,
      signal: params.signal,
      semanticRetries: params.semanticRetries,
      requestId: params.requestId
    }, provider);
    return result;
  }
  async generateTheoryWithAI(params: {
    topicTitle: string;
    lang: LLMTaskLanguage;
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
  }): Promise<AiTheoryResult> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateTheoryWithAI({
        topicTitle: params.topicTitle,
        lang: params.lang,
        taskDescription: params.taskDescription,
        taskType: params.taskType,
        difficulty: params.difficulty,
        responseLanguage: params.responseLanguage,
        userId: params.userId,
        topicId: params.topicId
      }, {
        language: params.language,
        signal: params.signal
      } as any);
      return AIResponseValidator.validateGenerateTheory(raw);
    };

    const tryOpenRouter = async () => {
      return await this.generateTheoryWithAI_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateTheoryWithAI_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateTheoryWithAI_OpenRouter(params: {
    topicTitle: string;
    lang: LLMTaskLanguage;
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    responseLanguage?: string;
    language?: "uk" | "en";
    userId?: number;
    topicId?: number;
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<AiTheoryResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const isEnglish = params.language === "en";
    const responseLanguageInstruction = buildResponseLanguageInstruction(normalizeResponseLanguage(params.responseLanguage), isEnglish);
    const systemPrompt = isEnglish
      ? `You are an experienced programming teacher. Return a clear, concise, beginner-friendly theoretical explanation in Markdown.`
      : `Ти досвідчений викладач програмування. Повертай чітке, компактне й зрозуміле новачку теоретичне пояснення у форматі Markdown.`;
    let userPrompt: string;
    const context = params.taskDescription && params.taskType ? `\n\nКОНТЕКСТ (НЕ ПЕРЕПОВІДАЙ, НЕ ФОРМУЛЮЙ УМОВУ, НЕ ДОДАВАЙ ЗАВДАННЯ):\n${params.taskDescription}` : "";
    if (isEnglish) {
      const enContext = params.taskDescription && params.taskType
        ? `\n\nCONTEXT (DO NOT RESTATE AS A TASK):\n${params.taskDescription}`
        : "";
      userPrompt = `Generate ONLY theoretical explanation for topic "${params.topicTitle}" for ${langName}.${enContext}

REQUIREMENTS (mandatory):
- Do NOT include practical tasks.
- Do NOT write problem statements.
- Do NOT use imperative instruction style ("solve", "compute", "implement", etc.).
- Do NOT add sections like "Practice", "Task", "Exercise", "Problem".
- Use 3–5 meaningful headings, short paragraphs, and one small realistic analogy at most; avoid generic motivational filler.
- Allowed: concept explanations, syntax notes, and short valid code snippets as illustration.
- Code fences must be balanced. Do not put raw JSON, interactive blocks, or Markdown headings inside a code fence.
- Prefer one focused example and explain the key lines briefly instead of repeating the same idea.
- Format: Markdown only.${responseLanguageInstruction}`;
    } else {
      userPrompt = `Згенеруй ТІЛЬКИ теоретичне пояснення теми "${params.topicTitle}" для мови ${langName}.${context}

ВИМОГИ (обов'язково):
- НЕ додавай практичних завдань.
- НЕ формулюй умови задач.
- НЕ використовуй імперативи типу: "виконайте", "обчисліть", "знайдіть", "написати програму", "введіть/прочитайте".
- НЕ додавай секцій "Практика", "Завдання", "Вправа", "Умова".
- Використай 3–5 змістовних заголовків, короткі абзаци й не більше однієї конкретної аналогії; прибери загальні мотиваційні фрази.
- МОЖНА: пояснення понять, синтаксис і короткі валідні приклади коду як ілюстрацію.
- Markdown-фенси коду мають бути збалансовані. Не клади сирий JSON, interactive-блоки або заголовки Markdown усередину code fence.
- Краще один сфокусований приклад із коротким поясненням ключових рядків, ніж повторення тієї самої думки.
- Формат: Markdown. Без вступів на кшталт "Ось теорія".${responseLanguageInstruction}`;
    }
    try {
      const content = await provider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
        signal: params.signal,
        temperature: 0.7,
        maxTokens: 2200
      });
      const validated = AIResponseValidator.validateGenerateTheory({
        theory: content.trim()
      });
      return validated;
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
    }
  }
  async generateQuizWithAI(params: {
    lang: LLMTaskLanguage;
    prevTopics: string;
    count?: number;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
  }): Promise<AiQuizResult> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateQuizWithAI({
        lang: params.lang,
        prevTopics: params.prevTopics,
        count: params.count,
        responseLanguage: params.responseLanguage,
        userId: params.userId,
        topicId: params.topicId
      }, {
        language: params.language,
        signal: params.signal
      } as any);
      return AIResponseValidator.validateGenerateQuiz(raw, params.count || 12);
    };

    const tryOpenRouter = async () => {
      return await this.generateQuizWithAI_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateQuizWithAI_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateQuizWithAI_OpenRouter(params: {
    lang: LLMTaskLanguage;
    prevTopics: string;
    count?: number;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<AiQuizResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const questionCount = params.count || 12;
    const isEnglish = params.language === "en";
    const responseLanguageInstruction = buildResponseLanguageInstruction(normalizeResponseLanguage(params.responseLanguage), isEnglish);
    const systemPrompt = isEnglish
      ? `You are a programming examiner. Produce quiz questions with exactly one correct answer. Return ONLY a JSON array and no extra text.`
      : `Ти екзаменатор з програмування. Створюй тестові питання з правильною відповіддю. Відповідай ТІЛЬКИ JSON-масивом без додаткового тексту.`;
    let userPrompt = isEnglish
      ? `Create a quiz only for ${langName}. Topics: ${params.prevTopics}.
REQUIREMENTS:
- EXACTLY ${questionCount} questions
- Each question has exactly 5 options
- Output format: ONLY valid JSON array
- Each item format: {"q": "question", "options": ["A", "B", "C", "D", "E"], "correct": 0}
- Return ONLY JSON array, no markdown, no explanations.${responseLanguageInstruction}`
      : `Створи тест виключно по мові ${langName}. Теми для питань: ${params.prevTopics}.
ВИМОГИ:
- Кількість питань: РІВНО ${questionCount}
- Кожне питання має рівно 5 варіантів відповіді
- Формат: ТІЛЬКИ ВАЛІДНИЙ JSON масив без жодного додаткового тексту
- Кожне питання має формат: {"q": "питання", "options": ["А", "Б", "В", "Г", "Д"], "correct": 0}
- Відповідай ТІЛЬКИ JSON масивом, без пояснень, без markdown.${responseLanguageInstruction}`;
    let lastError: Error | null = null;
    const maxRetries = 2;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const content = await provider.generateText(userPrompt, systemPrompt, {
          timeout: 30000,
          userId: params.userId,
          topicId: params.topicId,
          signal: params.signal,
          temperature: 0.7,
          maxTokens: 3000
        });
        if (!content) throw new Error('Empty AI response');
        let parsed: any;
        try {
          parsed = JSON.parse(content.trim());
        } catch (firstError) {
          try {
            let cleaned = content.trim();
            const codeBlockStart = cleaned.indexOf('```');
            if (codeBlockStart !== -1) {
              const codeBlockEnd = cleaned.lastIndexOf('```');
              if (codeBlockEnd !== -1 && codeBlockEnd > codeBlockStart) {
                cleaned = cleaned.substring(codeBlockStart + 3, codeBlockEnd);
                cleaned = cleaned.replace(/^(?:json|JSON)\s*/i, '');
                cleaned = cleaned.trim();
              }
            }
            const jsonStart = cleaned.indexOf('[');
            const objStart = cleaned.indexOf('{');
            let startPos = -1;
            let isArray = false;
            if (jsonStart !== -1 && (objStart === -1 || jsonStart < objStart)) {
              startPos = jsonStart;
              isArray = true;
            } else if (objStart !== -1) {
              startPos = objStart;
              isArray = false;
            }
            if (startPos !== -1) {
              let depth = 0;
              let inString = false;
              let escapeNext = false;
              let endPos = startPos;
              for (let i = startPos; i < cleaned.length; i++) {
                const char = cleaned[i];
                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }
                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                if (!inString) {
                  if (isArray && char === '[' || !isArray && char === '{') {
                    depth++;
                  } else if (isArray && char === ']' || !isArray && char === '}') {
                    depth--;
                    if (depth === 0) {
                      endPos = i + 1;
                      break;
                    }
                  }
                }
              }
              if (endPos > startPos) {
                let fixed = cleaned.substring(startPos, endPos).replace(/,(\s*[}\]])/g, '$1').trim();
                if (isArray) {
                  const lastBracket = fixed.lastIndexOf(']');
                  if (lastBracket !== -1) {
                    fixed = fixed.substring(0, lastBracket + 1);
                  }
                } else {
                  const lastBrace = fixed.lastIndexOf('}');
                  if (lastBrace !== -1) {
                    fixed = fixed.substring(0, lastBrace + 1);
                  }
                }
                parsed = JSON.parse(fixed);
              } else {
                throw new Error('Could not find end of JSON');
              }
            } else {
              parsed = tryFixJsonResponse(content);
            }
          } catch (secondError) {
            parsed = tryFixJsonResponse(content);
          }
        }
        if (typeof parsed === 'object' && !Array.isArray(parsed)) {
          const keys = Object.keys(parsed);
          if (keys.length > 0 && Array.isArray(parsed[keys[0]])) {
            parsed = parsed[keys[0]];
          }
        }
        const validated = AIResponseValidator.validateGenerateQuiz(parsed, questionCount);
        return validated;
      } catch (err: any) {
        lastError = err;
        if (attempt < maxRetries) {
          userPrompt += `\n\nВиправ формат. Поверни ТІЛЬКИ JSON масив з ${questionCount} питаннями, кожне з 5 варіантами відповіді. БЕЗ жодного тексту до або після JSON. БЕЗ markdown. БЕЗ пояснень. ТІЛЬКИ чистий JSON масив.`;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
      }
    }
    throw new Error(`AI_GENERATION_FAILED: Quiz generation failed: ${lastError?.message || 'Unknown error'}`);
  }
  async generateTaskCondition(params: {
    topicTitle: string;
    taskTitle?: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: LLMTaskLanguage;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
    signal?: AbortSignal;
  }): Promise<{
    description: string;
  }> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateTaskCondition({
        topicTitle: params.topicTitle,
        taskType: params.taskType,
        difficulty: params.difficulty,
        language: params.language,
        responseLanguage: params.responseLanguage,
        userId: params.userId,
        topicId: params.topicId
      }, {
        language: params.userLanguage,
        signal: params.signal
      } as any);
      return AIResponseValidator.validateGenerateTaskCondition(raw);
    };

    const tryOpenRouter = async () => {
      return await this.generateTaskCondition_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateTaskCondition_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateTaskCondition_OpenRouter(params: {
    topicTitle: string;
    taskTitle?: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: LLMTaskLanguage;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<{
    description: string;
  }> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.language === "JAVA" ? "Java" : params.language === "PYTHON" ? "Python" : "C++";
    const isEnglish = params.userLanguage === "en";
    const difficulty = params.difficulty ?? 3;
    const difficultyPrompt = getDifficultyPrompt(difficulty / 5, isEnglish);
    const taskTypeText = isEnglish
      ? (params.taskType === "CONTROL" ? "CONTROL task to check knowledge on the topic" : "PRACTICE task to work through the material")
      : (params.taskType === "CONTROL" ? "КОНТРОЛЬНЕ завдання для перевірки знань по темі" : "ПРАКТИЧНЕ завдання для відпрацювання матеріалу");
    const responseLanguageInstruction = buildResponseLanguageInstruction(normalizeResponseLanguage(params.responseLanguage), isEnglish);
    const teacherTaskTitle = (params.taskTitle || "").trim();
    const effectiveTitle = teacherTaskTitle || params.topicTitle;
    const systemPrompt = isEnglish
      ? `You are an experienced programming teacher. Create judgeable programming tasks with deterministic I/O. Output must be strictly specified.`
      : `Ти досвідчений викладач програмування. Створюй задачі, які можна перевірити суддею: детермінований ввід/вивід, строгий формат.`;
    const userPrompt = isEnglish ? `Create a detailed task statement for a ${taskTypeText.toLowerCase()} titled "${effectiveTitle}" for ${langName}.

  Topic: "${params.topicTitle}"
  ${teacherTaskTitle ? `Teacher-provided task title: "${teacherTaskTitle}"\nCRITICAL: Use the teacher title as the MAIN theme and do not invent another title.` : ""}

CRITICAL: The task MUST be specifically about the topic "${params.topicTitle}". If the topic is "harmonic mean of array" - the task must be about harmonic mean of array, not about other topics.

CRITICAL FOR AUTO-TESTS (judge):
- The task MUST be solvable via standard input (stdin) and output to stdout.
- For any given input there MUST be exactly one correct output.
- Output MUST NOT contain extra words/labels like "Enter N" / "Answer:".
- Do NOT allow “choose any values”, “print any message”, or other open-ended output.
- No randomness, no current date/time, no external files, no network.

${difficultyPrompt}

REQUIREMENTS:
- The task description MUST be specifically about the topic "${params.topicTitle}"
- Do not create tasks about other topics
- The practical task must directly relate to the topic "${params.topicTitle}"
- The task description must be detailed and comprehensive
- Include a clear problem statement
- Provide STRICT input/output format specifications (stdin/stdout)
- Include at least 3 examples with input and expected output (as raw blocks)
- Explain the required transformation from input to output (briefly, not as code)
- Format: Markdown with headings:
  - "Problem"
  - "Input"
  - "Output"
  - "Examples" (each example has an Input block and an Output block)
- The task should be related to the topic "${params.topicTitle}"

Return ONLY the task description in Markdown format without additional comments.${responseLanguageInstruction}` : `Створи детальну умову ${taskTypeText.toLowerCase()} "${effectiveTitle}" для мови ${langName}.

ТЕМА: "${params.topicTitle}"
${teacherTaskTitle ? `НАЗВА ЗАВДАННЯ (вчитель): "${teacherTaskTitle}"\nКРИТИЧНО: Використай назву вчителя як ОСНОВНУ ідею та не вигадуй іншу назву.` : ""}

КРИТИЧНО ВАЖЛИВО: Завдання МАЄ бути саме про тему "${params.topicTitle}". Якщо тема "середнє гармонічне масиву" - завдання має бути про середнє гармонічне масиву, а не про інші теми.

КРИТИЧНО ДЛЯ АВТОТЕСТІВ (суддя):
- Рішення має працювати через stdin/stdout.
- Для будь-якого input існує рівно один правильний output.
- Заборонено додавати у вивід будь-які слова/мітки типу "Введіть...", "Відповідь:".
- Заборонено формулювання, де учень обирає значення сам ("вкажіть будь-які", "задайте в коді").
- Без випадковості, без поточної дати/часу, без файлів/мережі.

${difficultyPrompt}

ВИМОГИ:
- Завдання МАЄ бути саме про тему "${params.topicTitle}"
- Не створюй завдання про інші теми
- Практичне завдання має безпосередньо стосуватися теми "${params.topicTitle}"
- Умова має бути детальною та повною
- Включи чітке формулювання задачі
- Вкажи СТРОГИЙ формат вводу/виводу (stdin/stdout)
- Додай принаймні 3 приклади з вхідними даними та очікуваним результатом (як «сирий» input/output у code-block)
- Коротко поясни перетворення з input у output (без коду)
- Формат: Markdown з заголовками:
  - "Умова"
  - "Вхідні дані"
  - "Вихідні дані"
  - "Приклади" (кожен приклад має блоки Input та Output)

ВИВІД:
- В output виводь лише потрібні значення (числа/рядки) у вказаному порядку.
- НЕ використовуй мітки на кшталт "Ціле число:", "Рядок:".

Поверни ТІЛЬКИ умову завдання у форматі Markdown без додаткових коментарів.${responseLanguageInstruction}`;
    try {
      const content = await provider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
        signal: params.signal,
        temperature: 0.7,
        maxTokens: 1500,
        language: params.userLanguage || "uk"
      });
      const validated = AIResponseValidator.validateGenerateTaskCondition({
        description: content.trim()
      });
      return validated;
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
    }
  }
  async generateTaskTemplate(params: {
    topicTitle: string;
    taskTitle?: string;
    language: LLMTaskLanguage;
    description?: string;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
    signal?: AbortSignal;
  }): Promise<{
    template: string;
  }> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateTaskTemplate({
        topicTitle: params.topicTitle,
        language: params.language,
        description: params.description,
        responseLanguage: params.responseLanguage,
        userId: params.userId,
        topicId: params.topicId
      }, {
        language: params.userLanguage,
        signal: params.signal
      } as any);

      // Cloudflare returns the template as-is; normalize TODO line for consistency.
      const isEnglish = params.userLanguage === 'en';
      const todoText = isEnglish ? 'implement the solution according to the statement' : 'реалізуйте рішення задачі згідно з умовою';
      const normalized = this.normalizeTemplateTodoComments({
        template: raw.template,
        language: params.language,
        todoText
      });

      return AIResponseValidator.validateGenerateTaskTemplate({ template: normalized });
    };

    const tryOpenRouter = async () => {
      return await this.generateTaskTemplate_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateTaskTemplate_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateTaskTemplate_OpenRouter(params: {
    topicTitle: string;
    taskTitle?: string;
    language: LLMTaskLanguage;
    description?: string;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<{
    template: string;
  }> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.language === "JAVA" ? "Java" : params.language === "PYTHON" ? "Python" : "C++";
    const isEnglish = params.userLanguage === 'en';
    const responseLanguageInstruction = buildResponseLanguageInstruction(normalizeResponseLanguage(params.responseLanguage), isEnglish);
    const todoText = isEnglish ? 'implement the solution according to the statement' : 'реалізуйте рішення задачі згідно з умовою';
    const teacherTaskTitle = (params.taskTitle || '').trim();
    const effectiveTitle = teacherTaskTitle || params.topicTitle;

    const systemPrompt = isEnglish
      ? `You are an experienced programming instructor. Create EMPTY code templates with TODO comments. DO NOT write any implementation or final code. DO NOT use Russian language.`
      : `Ти досвідчений викладач програмування. Створюй ПОРОЖНІ шаблони коду з TODO-коментарями УКРАЇНСЬКОЮ мовою. ЗАБОРОНЕНО писати реалізацію або готовий код. НЕ ВИКОРИСТОВУЙ російську мову.`;

    const userPrompt = isEnglish ? `Create an EMPTY code template for the task "${effectiveTitle}" in ${langName}.

  Topic: "${params.topicTitle}"
  ${teacherTaskTitle ? `Teacher-provided task title: "${teacherTaskTitle}"` : ""}

${params.description ? `Task description:\n${params.description}\n\n` : ''}

CRITICAL - THE TEMPLATE MUST BE EMPTY:

FORBIDDEN:
- Any implementation logic
- Any final solution code
- Any calculations/algorithm steps

ALLOWED:
- Only structure (class/function)
- A single TODO comment with instruction (IN ENGLISH)
- Required imports (only if needed for structure)

REQUIREMENTS:
- Java: ONLY empty class Main with main method and a TODO comment
- Python: ONLY empty main() function with if __name__ == "__main__" and a TODO comment
- C++: ONLY empty int main() with a TODO comment (you may include <iostream> and fast I/O lines)
- No implementation
- No markdown code fences

Correct Java example:
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        // TODO: ${todoText}
    }
}

Correct Python example:
def main():
    # TODO: ${todoText}
    pass

if __name__ == "__main__":
    main()

Correct C++ example:
#include <iostream>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  // TODO: ${todoText}
  return 0;
}

Return ONLY the code, no explanations.${responseLanguageInstruction}` : `Створи порожній шаблон коду для завдання "${effectiveTitle}" на мові ${langName}.

ТЕМА: "${params.topicTitle}"
${teacherTaskTitle ? `НАЗВА ЗАВДАННЯ (вчитель): "${teacherTaskTitle}"` : ""}

${params.description ? `Опис завдання:\n${params.description}\n\n` : ''}

МОВА:
- Усі TODO-коментарі та інструкції в коді мають бути УКРАЇНСЬКОЮ.
- Заборонено використовувати російську мову.

КРИТИЧНО ВАЖЛИВО - ШАБЛОН МАЄ БУТИ ПОРОЖНІМ:

ЗАБОРОНЕНО:
- Писати реалізацію логіки
- Писати готовий код
- Писати відповідь
- Писати обчислення
- Писати алгоритм

ДОЗВОЛЕНО:
- Тільки структура (клас/функція)
- TODO-коментар з інструкцією
- Необхідні імпорти (якщо потрібні для структури)

ВИМОГИ:
- Для Java: ТІЛЬКИ порожній клас Main з методом main та TODO-коментарем
- Для Python: ТІЛЬКИ порожня функція main() з if __name__ == "__main__" та TODO-коментарем
- Для C++: ТІЛЬКИ порожній int main() з TODO-коментарем (можна з #include <iostream> та швидким I/O)
- Без реалізації логіки
- Без markdown блоків

Приклад ПРАВИЛЬНОГО шаблону для Java:
\`\`\`java
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
    // TODO: ${todoText}
    }
}
\`\`\`

Приклад ПРАВИЛЬНОГО шаблону для Python:
\`\`\`python
def main():
    # TODO: ${todoText}
    pass

if __name__ == "__main__":
    main()
\`\`\`

Приклад ПРАВИЛЬНОГО шаблону для C++:
\`\`\`cpp
#include <iostream>

int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);

  // TODO: ${todoText}
  return 0;
}
\`\`\`

Приклад НЕПРАВИЛЬНОГО шаблону (ЗАБОРОНЕНО):
\`\`\`java
public class Main {
    public static void main(String[] args) {
        int[] arr = {1, 2, 3};
        double result = calculate(arr);
        System.out.println(result);
    }
    
    static double calculate(int[] arr) {
        // реалізація
    }
}
\`\`\`

Поверни ТІЛЬКИ код без markdown блоків та пояснень.${responseLanguageInstruction}`;
    try {
      const content = await provider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
        signal: params.signal,
        temperature: 0.3,
        maxTokens: 1000,
        language: params.userLanguage || 'uk'
      });
      let template = content.trim();
      template = template.replace(/^```\w*\n?/gm, '');
      template = template.replace(/```$/gm, '');
      template = this.normalizeTemplateTodoComments({
        template: template.trim(),
        language: params.language,
        todoText
      });
      const validated = AIResponseValidator.validateGenerateTaskTemplate({
        template
      });
      return validated;
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
    }
  }
  async generateTestDataWithAI(params: {
    taskDescription: string;
    taskTitle: string;
    lang: LLMTaskLanguage;
    count: number;
    userId?: number;
    signal?: AbortSignal;
  }): Promise<TestDataExample[]> {
    const pref = preferredProvider();
    const canCf = isCloudflareConfigured();
    const canOr = isOpenRouterConfigured();
    const canLocal = isLocalConfigured();

    const tryCloudflare = async () => {
      const raw = await this.cloudflareProvider.generateTestDataWithAI({
        taskDescription: params.taskDescription,
        taskTitle: params.taskTitle,
        lang: params.lang,
        count: params.count,
        userId: params.userId
      }, {
        signal: params.signal
      });
      return AIResponseValidator.validateGenerateTestData(raw, params.count);
    };

    const tryOpenRouter = async () => {
      return await this.generateTestDataWithAI_OpenRouter(params);
    };

    const tryLocal = async () => {
      return await this.generateTestDataWithAI_OpenRouter(params, this.localProvider);
    };

    if (pref === 'local') {
      if (!canLocal) {
        if (canCf) return await tryCloudflare();
        if (canOr) return await tryOpenRouter();
        throw new Error('AI_GENERATION_FAILED: LOCAL_LLM_URL not configured');
      }
      try {
        return await tryLocal();
      } catch (e: any) {
        if (canCf && (isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryCloudflare();
        }
        if (canOr && isRetryableError(e)) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (pref === 'cloudflare' || (pref === 'auto' && canCf)) {
      if (!canCf && canOr) return await tryOpenRouter();
      try {
        return await tryCloudflare();
      } catch (e: any) {
        if (canOr && (shouldFallbackToOpenRouter(e) || isRetryableError(e) || shouldFallbackToCloudflare(e))) {
          return await tryOpenRouter();
        }
        throw e;
      }
    }

    if (!canOr && canCf) return await tryCloudflare();
    try {
      return await tryOpenRouter();
    } catch (e: any) {
      if (canCf && shouldFallbackToCloudflare(e)) {
        return await tryCloudflare();
      }
      throw e;
    }
  }
  private async generateTestDataWithAI_OpenRouter(params: {
    taskDescription: string;
    taskTitle: string;
    lang: LLMTaskLanguage;
    count: number;
    userId?: number;
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<TestDataExample[]> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const taskDesc = params.taskDescription.slice(0, 2000);
    const taskDescLower = taskDesc.toLowerCase();
    const explicitlyNoInput = /нема(є)?\s+вхідн/i.test(taskDesc) || /без\s+вхідн/i.test(taskDesc) || /no\s+input/i.test(taskDesc) || /does\s+not\s+take\s+input/i.test(taskDesc);
    const needsInput = !explicitlyNoInput && (taskDescLower.includes("читати") || taskDescLower.includes("читайте") || taskDescLower.includes("зчитайте") || taskDescLower.includes("введ") || taskDescLower.includes("input") || taskDescLower.includes("stdin") || taskDescLower.includes("вхідні дані") || taskDescLower.includes("формат вхід") || taskDescLower.includes("вхід:"));
    const desiredCount = needsInput ? params.count : 1;
    const jsonSchema = {
      type: "object",
      properties: {
        tests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              input: {
                type: "string",
                description: "Вхідні дані для тесту"
              },
              output: {
                type: "string",
                description: "Очікуваний вивід програми"
              },
              explanation: {
                type: "string",
                description: "Пояснення тесту (опціонально)"
              }
            },
            required: ["input", "output"]
          },
          minItems: desiredCount,
          maxItems: desiredCount
        }
      },
      required: ["tests"]
    };
    const systemPrompt = needsInput ? `Ти досвідчений викладач програмування. Твоя задача - створити тестові дані для перевірки програм учнів.

ВИМОГИ:
1. Створи РІВНО ${desiredCount} тестових прикладів
2. Кожен тест має мати НЕПОРОЖНІ input та output
    3. Тести мають покривати різні випадки: базові, граничні, складні
4. Input та output мають бути у форматі, який можна прочитати з консолі
5. Для масивів використовуй формат: числа через пробіл (наприклад: "1 2 3 4 5")
6. Всі тести мають бути ВАЛІДНИМИ для завдання
    7. Заборонено створювати дублікати тестів (однакові input/output)
    8. Заборонено використовувати плейсхолдери на кшталт input="1" output="1" якщо це не випливає з умови

ВІДПОВІДАЙ ТІЛЬКИ ВАЛІДНИМ JSON БЕЗ БУДЬ-ЯКИХ ПОЯСНЕНЬ.` : `Ти досвідчений викладач програмування. Твоя задача - створити ОДИН детермінований приклад перевірки.

ВИМОГИ:
1. Створи РІВНО 1 тестовий приклад
2. Завдання НЕ має вхідних даних: input ОБОВ'ЯЗКОВО має бути порожнім рядком ""
3. output має бути НЕПОРОЖНІМ і має ТОЧНО відповідати тому, що вимагає умова (включно з розділовими знаками)
4. Не вигадуй варіативні "вхідні дані". Якщо вводу немає — він завжди порожній.

ВІДПОВІДАЙ ТІЛЬКИ ВАЛІДНИМ JSON БЕЗ БУДЬ-ЯКИХ ПОЯСНЕНЬ.`;
    const userPrompt = `
Завдання: ${params.taskTitle}

Опис завдання:
${taskDesc}

Мова програмування: ${langName}

${needsInput ? `
⚠️ ЗАВДАННЯ ПОТРЕБУЄ ВХІДНИХ ДАНИХ з консолі.
Створи РІВНО ${desiredCount} тестових прикладів з РІЗНИМИ значеннями в input.
` : `
⚠️ ЗАВДАННЯ НЕ ПОТРЕБУЄ ВХІДНИХ ДАНИХ - використовуються тільки захардкоджені значення.
Створи РІВНО 1 тест, де:
- input ОБОВ'ЯЗКОВО дорівнює "" (порожній рядок)
- output — єдиний правильний очікуваний вивід для цього завдання
`}

Створи тестові дані у форматі JSON згідно з цією схемою:
${JSON.stringify(jsonSchema, null, 2)}

ВАЖЛИВО:
- Всі тести мають мати НЕПОРОЖНІ output
- ${needsInput ? 'Input має бути різним для кожного тесту' : 'Input має бути порожнім рядком ""'}
- ${needsInput ? 'Тести мають бути різноманітними (різні випадки)' : 'Не вигадуй "різні випадки" — вводу немає, тому тест один'}
- Відповідай ТІЛЬКИ JSON, без markdown блоків, без пояснень
`.trim();
    try {
      const parsed = await provider.generateJSON<{
        tests: TestDataExample[];
      }>(userPrompt, jsonSchema, systemPrompt, {
        timeout: 30000,
        maxRetries: 1,
        userId: params.userId,
        signal: params.signal,
        temperature: 0.4,
        maxTokens: 2000
      });
      const validated = AIResponseValidator.validateGenerateTestData(parsed, desiredCount);
      return validated;
    } catch (error: any) {
      logger.warn('[llm] test data generation failed', { message: error?.message });
      throw error;
    }
  }
}
let orchestratorInstance: LLMOrchestrator | null = null;
export function getLLMOrchestrator(): LLMOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new LLMOrchestrator();
  }
  return orchestratorInstance;
}
