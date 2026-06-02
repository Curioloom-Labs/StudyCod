import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { logger } from '../../utils/logger';
interface CloudflareWorkerRequest {
  mode: string;
  language: "uk" | "en";
  params: {
    prompt: string;
    systemPrompt?: string;
    schema?: object;
    temperature?: number;
    maxTokens?: number;
  };
}
interface CloudflareWorkerResponse {
  content?: string;
  error?: string;
}
interface ExpressServiceResponse {
  success?: boolean;
  data?: any;
  error?: string;
}
export class CloudflareAIProvider implements LLMProvider {
  private buildTaskConditionPrompt(params: {
    topicTitle: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: "JAVA" | "PYTHON" | "CPP";
    responseLanguage?: string;
  }, lang: "uk" | "en"): { prompt: string; systemPrompt: string } {
    const langName = params.language === "JAVA" ? "Java" : params.language === "PYTHON" ? "Python" : "C++";
    const isEnglish = lang === "en";
    const taskTypeText = params.taskType === "CONTROL" ? (isEnglish ? "control" : "контрольне") : (isEnglish ? "practice" : "практичне");
    const systemPrompt = isEnglish
      ? "You create judgeable programming tasks with deterministic stdin/stdout. Output must be strictly specified."
      : "Ти створюєш задачі для судді: детермінований stdin/stdout, строгий формат виводу без зайвих слів.";
    const responseLanguage = typeof params.responseLanguage === "string" ? params.responseLanguage.trim().slice(0, 64) : "";
    const responseLanguageInstruction = responseLanguage
      ? (isEnglish
        ? `\n\nIMPORTANT RESPONSE LANGUAGE: Write explanatory text in ${responseLanguage}.`
        : `\n\nВАЖЛИВО: Пиши пояснювальний текст мовою \"${responseLanguage}\".`)
      : "";

    const prompt = isEnglish
      ? `Write a detailed ${taskTypeText} programming task about topic "${params.topicTitle}" for ${langName}.

CRITICAL FOR AUTO-TESTS:
- Use stdin/stdout.
- For any input there is exactly one correct output.
- Output must NOT contain prompts/labels.
- No randomness, time/date, files, or network.

FORMAT (Markdown headings required):
## Problem
## Input
## Output
## Examples (at least 3; each example contains raw Input/Output blocks)

Return ONLY the Markdown statement.${responseLanguageInstruction}`
      : `Створи детальну умову ${taskTypeText} задачі по темі "${params.topicTitle}" для мови ${langName}.

КРИТИЧНО ДЛЯ АВТОТЕСТІВ:
- stdin/stdout.
- Для будь-якого input існує рівно один правильний output.
- У виводі НЕМАЄ зайвих слів/міток ("Введіть", "Відповідь:" тощо).
- Без випадковості, часу/дати, файлів або мережі.

ФОРМАТ (обов'язково Markdown-заголовки):
## Умова
## Вхідні дані
## Вихідні дані
## Приклади (мінімум 3; кожен приклад має «Input» і «Output» у code-block)

Поверни ТІЛЬКИ Markdown-текст умови.${responseLanguageInstruction}`;

    return { prompt, systemPrompt };
  }

  private buildTestDataPrompt(params: {
    taskDescription: string;
    taskTitle: string;
    lang: "JAVA" | "PYTHON" | "CPP";
    count: number;
  }): { prompt: string; systemPrompt: string; schema: object } {
    const langName = params.lang === "JAVA" ? "Java" : params.lang === "PYTHON" ? "Python" : "C++";
    const taskDesc = String(params.taskDescription || "").slice(0, 2500);

    const schema = {
      type: "object",
      properties: {
        tests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              input: { type: "string" },
              output: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["input", "output"]
          },
          minItems: params.count,
          maxItems: params.count
        }
      },
      required: ["tests"]
    } as const;

    const systemPrompt = `Ти генеруєш тестові дані для перевірки розв'язків. Відповідай ТІЛЬКИ JSON-об'єктом за схемою. Заборонено markdown.`;
    const prompt = `Згенеруй РІВНО ${params.count} тестів для задачі.

Заголовок: ${params.taskTitle}
Мова: ${langName}

Опис задачі:
${taskDesc}

ВИМОГИ:
- Кожен тест має мати НЕПОРОЖНІ output.
- input має бути у форматі stdin (як у прикладах умови).
- Заборонено дублікати input/output.
- Без плейсхолдерів типу input="1" output="1" якщо це не випливає з умови.

СХЕМА JSON:
${JSON.stringify(schema, null, 2)}

Поверни лише JSON.`;

    return { prompt, systemPrompt, schema };
  }

  private async callCloudflareWorker(mode: string, params: CloudflareWorkerRequest['params'], options: LLMGenerateOptions = {}): Promise<CloudflareWorkerResponse> {
    const {
      timeout = 20000,
      maxRetries = 1,
      userId,
      topicId,
      traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      signal
    } = options;
    const url = process.env.CLOUDFLARE_AI_URL;
    if (!url) {
      throw new Error('AI_GENERATION_FAILED: CLOUDFLARE_AI_URL not configured');
    }
    const language: "uk" | "en" = options.language === "en" ? "en" : "uk";
    const requestPayload: CloudflareWorkerRequest = {
      mode,
      language,
      params: {
        ...params,
        temperature: params.temperature ?? options.temperature,
        maxTokens: params.maxTokens ?? options.maxTokens
      }
    };
    const logContext = {
      traceId,
      userId,
      topicId,
      mode
    };
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const onAbort = () => controller.abort();
        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }
        logger.debug('[cf-ai] request', { ...logContext, attempt: attempt + 1 });
        const internalSecret = String(process.env.CLOUDFLARE_AI_INTERNAL_SECRET ?? '').trim();
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Authenticate to the worker so it can reject anonymous traffic.
            ...(internalSecret ? { 'x-internal-secret': internalSecret } : {})
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onAbort);
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`CloudflareAI HTTP ${response.status}: ${errorText}`);
          logger.warn('[cf-ai] http error', {
            ...logContext,
            attempt: attempt + 1,
            status: response.status,
            error: String(errorText).slice(0, 2000)
          });
          if (response.status === 502) {
            const fallbackError = new Error(`AI_GENERATION_FAILED: Cloudflare Worker returned 502 (Bad Gateway). Fallback to OpenRouter.`);
            (fallbackError as any).shouldFallback = true;
            throw fallbackError;
          }
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }
          if (attempt < maxRetries && (response.status >= 500 || response.status === 429)) {
            lastError = error;
            const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
            logger.debug('[cf-ai] retry', { ...logContext, attempt: attempt + 1, delayMs: delay, status: response.status });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
        const rawData = await response.json();
        const isArray = Array.isArray(rawData);
        const isObject = rawData && typeof rawData === 'object' && !isArray;
        logger.debug('[cf-ai] response', {
          ...logContext,
          attempt: attempt + 1,
          shape: isArray ? `array:${rawData.length}` : isObject ? 'object' : typeof rawData
        });
        if (isArray && mode === 'generate-test-data') {
          const content = JSON.stringify(rawData);
          const data: CloudflareWorkerResponse = {
            content
          };
          return data;
        }
        if (isObject && !('success' in rawData) && !('content' in rawData)) {
          if ('task_condition' in rawData || 'theory_md' in rawData || 'description' in rawData || 'questions' in rawData || 'quizJson' in rawData) {
            let content: string | undefined;
            const legacy: any = rawData as any;
            if (mode === 'generate-task-condition' && legacy.task_condition) {
              content = typeof legacy.task_condition === 'string' ? legacy.task_condition : JSON.stringify(legacy.task_condition);
            } else if (mode === 'generate-task-condition' && legacy.description) {
              content = typeof legacy.description === 'string' ? legacy.description : JSON.stringify(legacy.description);
            } else if (mode === 'generate-theory' && legacy.theory_md) {
              content = typeof legacy.theory_md === 'string' ? legacy.theory_md : JSON.stringify(legacy.theory_md);
            } else if (mode === 'generate-quiz' && legacy.questions) {
              content = typeof legacy.questions === 'string' ? legacy.questions : JSON.stringify(legacy.questions);
            } else if (mode === 'generate-quiz' && legacy.quizJson) {
              content = typeof legacy.quizJson === 'string' ? legacy.quizJson : JSON.stringify(legacy.quizJson);
            } else {
              content = JSON.stringify(rawData);
            }
            if (!content) {
              logger.error('[cf-ai] extract failed (legacy)', { ...logContext, mode, keys: Object.keys(rawData) });
              throw new Error(`AI_GENERATION_FAILED: Empty response from CloudflareAI (mode: ${mode}, old format)`);
            }
            const data: CloudflareWorkerResponse = {
              content
            };
            return data;
          }
        }
        if (rawData && typeof rawData === 'object' && 'success' in rawData) {
          const expressResponse = rawData as ExpressServiceResponse;
          if (!expressResponse.success) {
            logger.warn('[cf-ai] api error', { ...logContext, error: expressResponse.error || 'unknown' });
            throw new Error(`AI_GENERATION_FAILED: ${expressResponse.error || 'Unknown error'}`);
          }

          const d = expressResponse.data;
          let content: string | undefined;

          if (d != null) {
            const obj = d as any;
            if (mode === 'generate-task-condition' && obj?.description != null) {
              content = typeof obj.description === 'string' ? obj.description : JSON.stringify(obj.description);
            } else if (mode === 'generate-theory' && obj?.theory != null) {
              content = typeof obj.theory === 'string' ? obj.theory : JSON.stringify(obj.theory);
            } else if (mode === 'generate-task-template' && obj?.template != null) {
              content = typeof obj.template === 'string' ? obj.template : JSON.stringify(obj.template);
            } else if (mode === 'generate-quiz' && obj?.quizJson != null) {
              content = typeof obj.quizJson === 'string' ? obj.quizJson : JSON.stringify(obj.quizJson);
            } else if (mode === 'generate-task' || mode === 'generate-test-data') {
              content = JSON.stringify(d);
            } else if (mode === 'generate-text' || mode === 'generate-json') {
              content = typeof d === 'string' ? d : JSON.stringify(d);
            } else if (typeof d === 'string') {
              content = d;
            } else if (d && typeof d === 'object') {
              for (const value of Object.values(d)) {
                if (typeof value === 'string' && value.trim().length > 0) {
                  content = value;
                  break;
                }
              }
            }
          }

          if (!content) {
            logger.error('[cf-ai] extract failed', {
              ...logContext,
              mode,
              dataType: d == null ? null : typeof d,
              keys: d && typeof d === 'object' ? Object.keys(d) : null
            });
            throw new Error(`AI_GENERATION_FAILED: Empty response from CloudflareAI (mode: ${mode})`);
          }

          return { content };
        }

        if (rawData && typeof rawData === 'object') {
          const data = rawData as CloudflareWorkerResponse;
          if (data.error) {
            logger.warn('[cf-ai] api error', { ...logContext, error: data.error });
            throw new Error(`AI_GENERATION_FAILED: ${data.error}`);
          }
          if (!data.content) {
            logger.error('[cf-ai] empty content', { ...logContext, mode });
            throw new Error(`AI_GENERATION_FAILED: Empty response from CloudflareAI (mode: ${mode})`);
          }
          return data;
        }

        if (typeof rawData === 'string' && rawData.trim().length > 0) {
          return { content: rawData };
        }

        logger.error('[cf-ai] unexpected response', { ...logContext, mode, type: typeof rawData });
        throw new Error(`AI_GENERATION_FAILED: Unexpected response from CloudflareAI (mode: ${mode})`);
      } catch (err: any) {
        if (signal && err?.name === 'AbortError' && signal.aborted) {
          throw new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)');
        }
        lastError = err;
        if (err.shouldFallback) {
          throw err;
        }
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          logger.warn('[cf-ai] timeout', { ...logContext, attempt: attempt + 1 });
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
            logger.debug('[cf-ai] retry', { ...logContext, attempt: attempt + 1, delayMs: delay, reason: 'timeout' });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error('AI_GENERATION_FAILED: Request timeout (20s exceeded)');
        }
        if (err.message?.includes('AI_GENERATION_FAILED') && err.message?.includes('HTTP 4')) {
          throw err;
        }
        const isNetworkError = err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND') || err.message?.includes('network') || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
          logger.debug('[cf-ai] retry', { ...logContext, attempt: attempt + 1, delayMs: delay, reason: 'network' });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (err.message?.includes('AI_GENERATION_FAILED')) {
          throw err;
        }
      }
    }
    throw new Error(`AI_GENERATION_FAILED: All retries exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  async generateText(prompt: string, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<string> {
    const response = await this.callCloudflareWorker('generate-text', {
      prompt,
      systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    }, options);
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return response.content;
  }
  async generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<T> {
    const response = await this.callCloudflareWorker('generate-json', {
      prompt,
      systemPrompt,
      schema,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    }, options);
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      let jsonContent = response.content.trim();
      if (jsonContent.includes('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) jsonContent = jsonMatch[1];
      }
      return JSON.parse(jsonContent) as T;
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse JSON response: ${error.message}`);
    }
  }
  async generateTaskWithAI(params: {
    topicTitle: string;
    theory: string;
    lang: "JAVA" | "PYTHON" | "CPP";
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    previousTasks?: string;
    allowedIoTypes?: Array<"STDIN_STDOUT" | "NO_INPUT_FIXED_OUTPUT" | "NO_INPUT_FREE_OUTPUT">;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<any> {
    const taskTimeoutMs = (() => {
      const raw = String(process.env.LLM_TASK_TIMEOUT_MS ?? '').trim();
      const n = raw ? Number(raw) : NaN;
      const v = Number.isFinite(n) ? Math.floor(n) : 45_000;
      return Math.max(10_000, Math.min(120_000, v));
    })();
    const response = await this.callCloudflareWorker('generate-task', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: options?.timeout ?? taskTimeoutMs,
      signal: options?.signal,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      return JSON.parse(response.content);
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse response: ${error.message}`);
    }
  }
  async generateTheoryWithAI(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON" | "CPP";
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    theory: string;
  }> {
    const response = await this.callCloudflareWorker('generate-theory', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      theory: response.content.trim()
    };
  }
  async generateQuizWithAI(params: {
    lang: "JAVA" | "PYTHON" | "CPP";
    prevTopics: string;
    count?: number;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    quizJson: string;
  }> {
    const response = await this.callCloudflareWorker('generate-quiz', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      quizJson: response.content
    };
  }
  async generateTaskCondition(params: {
    topicTitle: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: "JAVA" | "PYTHON" | "CPP";
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    description: string;
  }> {
    const lang: "uk" | "en" = options?.language === "en" ? "en" : "uk";
    const built = this.buildTaskConditionPrompt({
      topicTitle: params.topicTitle,
      taskType: params.taskType,
      difficulty: params.difficulty,
      language: params.language,
      responseLanguage: params.responseLanguage
    }, lang);
    const response = await this.callCloudflareWorker('generate-task-condition', {
      prompt: built.prompt,
      systemPrompt: built.systemPrompt
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      description: response.content.trim()
    };
  }
  async generateTaskTemplate(params: {
    topicTitle: string;
    language: "JAVA" | "PYTHON" | "CPP";
    description?: string;
    responseLanguage?: string;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    template: string;
  }> {
    const response = await this.callCloudflareWorker('generate-task-template', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    let template = response.content.trim();
    template = template.replace(/^```\w*\n?/gm, '');
    template = template.replace(/```$/gm, '');
    template = template.trim();
    return {
      template
    };
  }
  async generateTestDataWithAI(params: {
    taskDescription: string;
    taskTitle: string;
    lang: "JAVA" | "PYTHON" | "CPP";
    count: number;
    userId?: number;
  }, options?: LLMGenerateOptions): Promise<Array<{
    input: string;
    output: string;
    explanation?: string;
  }>> {
    const built = this.buildTestDataPrompt({
      taskDescription: params.taskDescription,
      taskTitle: params.taskTitle,
      lang: params.lang,
      count: params.count
    });
    const response = await this.callCloudflareWorker('generate-test-data', {
      prompt: built.prompt,
      systemPrompt: built.systemPrompt,
      schema: built.schema
    }, {
      userId: params.userId,
      timeout: options?.timeout ?? 30000,
      language: options?.language ?? "uk",
      signal: options?.signal
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      const parsed = typeof response.content === 'string' ? JSON.parse(response.content) : response.content;
      const tests = (parsed as any)?.tests || parsed || [];
      const taskDescLower = String(params.taskDescription ?? "").toLowerCase();
      const explicitlyNoInput = /нема(є)?\s+вхідн/i.test(taskDescLower) || /без\s+вхідн/i.test(taskDescLower) || /відсутн/i.test(taskDescLower) || /no\s+input/i.test(taskDescLower) || /does\s+not\s+take\s+input/i.test(taskDescLower);
      const allowEmptyInput = explicitlyNoInput || params.count <= 1;

      const validTests = (Array.isArray(tests) ? tests : []).filter((t: any) => {
        const input = typeof t?.input === "string" ? t.input : String(t?.input ?? "");
        const output = typeof t?.output === "string" ? t.output : String(t?.output ?? "");
        if (!output || output.trim() === "") return false;
        if (!allowEmptyInput && (!input || input.trim() === "")) return false;
        return true;
      });
      if (validTests.length === 0) {
        throw new Error("No valid tests generated");
      }
      return validTests.map((t: any) => ({
        input: String(t.input ?? "").trim(),
        output: String(t.output).trim(),
        explanation: t.explanation ? String(t.explanation).trim() : undefined
      }));
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse test data: ${error.message}`);
    }
  }
}