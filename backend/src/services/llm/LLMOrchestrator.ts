import { CloudflareAIProvider } from './CloudflareAIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { LocalLLMProvider } from './LocalLLMProvider';
import type { LLMProvider } from './LLMProvider';
import { validateTaskGenerationResponse, tryFixJsonResponse } from '../../../../shared/utils/taskValidator';
import { AIResponseValidator, AIValidationError } from './AIResponseValidator';
import { logger } from '../../utils/logger';

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

function parseEnvTimeoutMs(envVar: string, fallbackMs: number, minMs: number, maxMs: number): number {
  const raw = String(process.env[envVar] ?? '').trim();
  const n = raw ? Number(raw) : NaN;
  const v = Number.isFinite(n) ? Math.floor(n) : fallbackMs;
  return Math.max(minMs, Math.min(maxMs, v));
}

// Default is intentionally above 30s to reduce 504s from upstream on slower generations.
// NOTE: ensure your reverse proxy (e.g., nginx proxy_read_timeout) is >= this value.
const LLM_TASK_TIMEOUT_MS = parseEnvTimeoutMs('LLM_TASK_TIMEOUT_MS', 45_000, 10_000, 120_000);
function getDifficultyPrompt(difus: number): string {
  if (difus < 0.2) return "Рівень: ПОЧАТКОВИЙ (Дуже легко). Завдання має бути максимально простим, лише на відпрацювання синтаксису. Жодних складних алгоритмів.";
  if (difus < 0.4) return "Рівень: ЛЕГКИЙ. Просте завдання, мінімум умов. Фокус на розумінні теми.";
  if (difus < 0.6) return "Рівень: СЕРЕДНІЙ. Додай 1-2 прості умови або розгалуження. Стандартна складність.";
  if (difus < 0.8) return "Рівень: ВИЩЕ СЕРЕДНЬОГО. Потрібно трохи подумати. Можна додати неочевидний момент в умові.";
  return "Рівень: СКЛАДНИЙ. Завдання на логічне мислення. Вимагає оптимізації або обробки граничних випадків.";
}
function isCloudflareError(error: any): boolean {
  if (!error) return false;
  const message = error.message || String(error);
  return message.includes('AI_GENERATION_FAILED') || message.includes('CloudflareAI') || message.includes('Cloudflare Worker') || message.includes('timeout') || message.includes('CLOUDFLARE_AI_URL not configured') || message.includes('Failed to parse') || message.includes('Empty response');
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
  constructor() {
    this.cloudflareProvider = new CloudflareAIProvider();
    this.openRouterProvider = new OpenRouterProvider();
    this.localProvider = new LocalLLMProvider();
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
      return AIResponseValidator.validateGenerateTask(raw);
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
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<{
    topic: string;
    coreOperation: string;
    allowedScope: string[];
    forbiddenScope: string[];
  }> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const anchorSchema = {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: `Тема завдання (ОБОВ'ЯЗКОВО "${params.topicTitle}")`
        },
        coreOperation: {
          type: "string",
          description: "Одна чітке формулювання того, ЩО саме потрібно зробити"
        },
        allowedScope: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Що дозволено робити, які дії дозволені"
        },
        forbiddenScope: {
          type: "array",
          items: {
            type: "string"
          },
          description: "Що категорично заборонено, які дії НЕ МОЖНА виконувати"
        }
      },
      required: ["topic", "coreOperation", "allowedScope", "forbiddenScope"]
    };
    const systemPrompt = `Ти семантичний архітектор навчальних завдань. Створюй anchor для завдання. Відповідай ТІЛЬКИ JSON.`;
    const userPrompt = `Створи semantic anchor для завдання з теми "${params.topicTitle}" (мова: ${langName}).

КРИТИЧНО ВАЖЛИВО:
- Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.topicTitle}" точно (1:1)
- coreOperation: ОДНА дія, що саме потрібно зробити (не список, не багато дій)
- allowedScope: що дозволено робити в завданні
- forbiddenScope: що категорично заборонено робити (інші теми, інші операції)

Поверни ТІЛЬКИ JSON без пояснень.`;
    const expectedTopic = params.topicTitle.trim();
    const fallbackAnchor = {
      topic: expectedTopic,
      coreOperation: `Розв'язати задачу з теми "${expectedTopic}" та вивести результат у stdout`,
      allowedScope: [expectedTopic, 'базові конструкції мови', 'вивід у stdout'],
      forbiddenScope: ['multi-task структура', 'мета-повідомлення компілятора', 'створення файлів/проєктів']
    };

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
            expectedTopic,
            receivedTopic: parsedTopic,
            userId: params.userId,
            topicId: params.topicId,
            attempt
          });
        }

        return {
          topic,
          coreOperation,
          allowedScope,
          forbiddenScope
        };
      } catch (err) {
        lastErr = err;
        logger.warn('[llm] anchor generation attempt failed', {
          attempt,
          maxAnchorAttempts,
          userId: params.userId,
          topicId: params.topicId,
          error: String((err as any)?.message || err)
        });
      }
    }

    logger.warn('[llm] using fallback anchor after failed anchor attempts', {
      userId: params.userId,
      topicId: params.topicId,
      expectedTopic,
      error: String((lastErr as any)?.message || lastErr || 'unknown')
    });
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
    signal?: AbortSignal;
    semanticRetries?: number;
  }, providerOverride?: LLMProvider): Promise<AiTaskGenerationResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const difficultyPrompt = getDifficultyPrompt(params.difus ?? 0);
    const jsonSchema = {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Назва завдання"
        },
        topic: {
          type: "string",
          description: `Тема завдання (ОБОВ'ЯЗКОВО "${params.anchor.topic}")`
        },
        difficulty: {
          type: "number",
          description: "Складність 0-5"
        },
        theoryMarkdown: {
          type: "string",
          description: "Теорія у форматі Markdown"
        },
        practicalTask: {
          type: "string",
          description: "Практичне завдання"
        },
        ioType: {
          type: "string",
          description: "ТИП ВВОДУ/ВИВОДУ (machine-only; НЕ показувати у statement). Один з: STDIN_STDOUT | NO_INPUT_FIXED_OUTPUT | NO_INPUT_FREE_OUTPUT",
          enum: ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"]
        },
        inputFormat: {
          type: "string",
          description: "Формат вхідних даних"
        },
        outputFormat: {
          type: "string",
          description: "Формат вихідних даних"
        },
        constraints: {
          type: "string",
          description: "Обмеження"
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
          description: "Шаблон коду"
        }
      },
      required: ["title", "topic", "difficulty", "theoryMarkdown", "practicalTask", "ioType", "inputFormat", "outputFormat", "constraints", "examples", "codeTemplate"]
    };
    const systemPrompt = `Ти досвідчений викладач програмування. Створюй якісні завдання з теорією та практикою. Відповідай українською мовою у форматі JSON згідно з наданою схемою.

КРИТИЧНО: Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.anchor.topic}". НЕ змінюй anchor.`;
    const allowedIoTypes = Array.isArray(params.allowedIoTypes) && params.allowedIoTypes.length
      ? params.allowedIoTypes
      : ["STDIN_STDOUT", "NO_INPUT_FIXED_OUTPUT", "NO_INPUT_FREE_OUTPUT"];
    const stdinAllowed = allowedIoTypes.includes("STDIN_STDOUT");
    const uniquenessBlock = params.previousTasks && params.previousTasks.trim().length > 0
      ? `\n\nВЖЕ ЗГЕНЕРОВАНІ ЗАВДАННЯ У ЦІЙ ТЕМІ (щоб уникнути повторів):\n${params.previousTasks.trim()}\n\nТвоє нове завдання має бути СУТТЄВО ІНШИМ: інший сюжет/дані/формулювання, інші приклади та інші числа.`
      : '';

    const userPrompt = `
SEMANTIC ANCHOR (IMMUTABLE - НЕ ЗМІНЮЙ):
- Тема: ${params.anchor.topic}
- Основна операція: ${params.anchor.coreOperation}
- Дозволено: ${params.anchor.allowedScope.join(', ')}
- Заборонено: ${params.anchor.forbiddenScope.join(', ')}

Мова програмування: ${langName}
${difficultyPrompt}

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
- ЗАБОРОНЕНО: просити створювати файли/папки/проєкти, налаштовувати IDE/компілятор, CMake/Makefile, структуру src/include тощо.
- Якщо тема про структуру проєкту — перетвори це на програмне завдання (наприклад: вивести текст/схему структури), але все одно лише через stdout.

ЯКІСТЬ УМОВИ (важливо для студентів):
- practicalTask має бути РОЗГОРНУТИЙ: мінімум 4–6 речень або структуровані маркери (що зробити, які саме дані/значення використати, що саме вивести, як форматувати).
- Заборонено робити умову «в 1 рядок» типу “Оголосіть змінну ...”. Додай контекст і чіткий критерій перевірки.
- Якщо завдання про змінні/типи/операції — вимагай ВИВЕСТИ результат (print) так, щоб автотест міг перевірити (детермінований stdout).

ДОЗВОЛЕНІ IO-ТИПИ (allowedIoTypes): ${allowedIoTypes.join(' | ')}
- Якщо STDIN_STDOUT НЕ дозволено — ЗАБОРОНЕНО просити введення даних, читати stdin або згадувати input()/Scanner/System.in/std::cin/cin/getline.
- Якщо STDIN_STDOUT дозволено — можна робити задачі зі stdin.

ПРІОРИТЕТ ТОЧНОСТІ УМОВИ:
- У practicalTask явно вкажи: (1) що дано, (2) що потрібно обчислити/визначити, (3) що саме і в якому форматі вивести.
- Для outputFormat не використовуй розмиті слова: "тощо", "і т.д.", "або щось подібне", "будь-який" (окрім NO_INPUT_FREE_OUTPUT).
- Якщо можливі кілька фіксованих відповідей (наприклад, день тижня/помилка) — перелічи їх явно.

М'ЯКЕ ПОВТОРЕННЯ МИНУЛИХ ТЕМ:
- Ненав'язливо використай 1 знайомий прийом із попередніх тем, щоб студент не забував матеріал.
- Це має бути природно і НЕ перетворювати завдання на multi-task.
${params.prevTopics && params.prevTopics.trim().length > 0 ? `Попередні теми:\n${params.prevTopics.trim()}` : ''}

Теорія з теми (для контексту):
${params.theory.slice(0, 2000)}
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
- Якщо ти хочеш перевіряти оголошення/присвоєння змінних, але не хочеш фіксувати значення — обирай STDIN_STDOUT і читай значення зі stdin.
- NO_INPUT_FREE_OUTPUT використовуй ТІЛЬКИ для завдань, де за задумом приймається будь-який непорожній stdout (наприклад: "виведіть будь-яке привітання").

Відповідай ТІЛЬКИ JSON, без markdown блоків, без пояснень.
`.trim();
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
          temperature: 0.2,
          maxTokens: 4000
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
    signal?: AbortSignal;
    semanticRetries?: number;
  }, providerOverride?: LLMProvider): Promise<AiTaskGenerationResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const anchor = await this.generateTaskAnchor({
      topicTitle: params.topicTitle,
      lang: params.lang,
      userId: params.userId,
      topicId: params.topicId,
      signal: params.signal
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
      signal: params.signal,
      semanticRetries: params.semanticRetries
    }, provider);
    return result;
  }
  async generateTheoryWithAI(params: {
    topicTitle: string;
    lang: LLMTaskLanguage;
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
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
    userId?: number;
    topicId?: number;
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<AiTheoryResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const systemPrompt = `Ти досвідчений викладач програмування. Відповідай українською мовою у форматі Markdown.`;
    let userPrompt: string;
    const context = params.taskDescription && params.taskType ? `\n\nКОНТЕКСТ (НЕ ПЕРЕПОВІДАЙ, НЕ ФОРМУЛЮЙ УМОВУ, НЕ ДОДАВАЙ ЗАВДАННЯ):\n${params.taskDescription}` : "";
    userPrompt = `Згенеруй ТІЛЬКИ теоретичне пояснення теми "${params.topicTitle}" для мови ${langName}.${context}

ВИМОГИ (обов'язково):
- НЕ додавай практичних завдань.
- НЕ формулюй умови задач.
- НЕ використовуй імперативи типу: "виконайте", "обчисліть", "знайдіть", "написати програму", "введіть/прочитайте".
- НЕ додавай секцій "Практика", "Завдання", "Вправа", "Умова".
- МОЖНА: пояснення понять, синтаксис, короткі приклади коду (як ілюстрація).
- Формат: Markdown. Без вступів на кшталт "Ось теорія".`;
    try {
      const content = await provider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
        signal: params.signal,
        temperature: 0.7,
        maxTokens: 3000
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
    userId?: number;
    topicId?: number;
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<AiQuizResult> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.lang === "JAVA" ? "Java" : "Python";
    const questionCount = params.count || 12;
    const systemPrompt = `Ти екзаменатор з програмування. Створюй тестові питання з правильними відповідями. Відповідай ТІЛЬКИ у форматі JSON масиву без додаткових пояснень, коментарів або тексту до або після JSON.`;
    let userPrompt = `Створи тест виключно по мові ${langName}. Теми для питань: ${params.prevTopics}.
ВИМОГИ:
- Кількість питань: РІВНО ${questionCount}
- Кожне питання має рівно 5 варіантів відповіді (А, Б, В, Г, Д)
- Формат: ТІЛЬКИ ВАЛІДНИЙ JSON масив без жодного додаткового тексту
- Кожне питання має формат: {"q": "питання", "options": ["А", "Б", "В", "Г", "Д"], "correct": 0}
- Відповідай ТІЛЬКИ JSON масивом, без пояснень, без markdown, без code blocks`;
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
                if (char === '"' && !escapeNext) {
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
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
    signal?: AbortSignal;
  }, providerOverride?: LLMProvider): Promise<{
    description: string;
  }> {
    const provider = providerOverride ?? this.openRouterProvider;
    const langName = params.language === "JAVA" ? "Java" : params.language === "PYTHON" ? "Python" : "C++";
    const difficulty = params.difficulty ?? 3;
    const difficultyPrompt = getDifficultyPrompt(difficulty / 5);
    const taskTypeText = params.taskType === "CONTROL" ? "КОНТРОЛЬНЕ завдання для перевірки знань по темі" : "ПРАКТИЧНЕ завдання для відпрацювання матеріалу";
    const isEnglish = params.userLanguage === "en";
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

Return ONLY the task description in Markdown format without additional comments.` : `Створи детальну умову ${taskTypeText.toLowerCase()} "${effectiveTitle}" для мови ${langName}.

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

Поверни ТІЛЬКИ умову завдання у форматі Markdown без додаткових коментарів.`;
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

Return ONLY the code, no explanations.` : `Створи порожній шаблон коду для завдання "${effectiveTitle}" на мові ${langName}.

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

Поверни ТІЛЬКИ код без markdown блоків та пояснень.`;
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