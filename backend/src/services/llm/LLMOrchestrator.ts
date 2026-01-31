import { CloudflareAIProvider } from './CloudflareAIProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { validateTaskGenerationResponse, tryFixJsonResponse } from '../../../../shared/utils/taskValidator';
import { AIResponseValidator, AIValidationError } from './AIResponseValidator';
export interface AiTaskGenerationResult {
  title: string;
  topic: string;
  difficulty: number;
  theoryMarkdown: string;
  practicalTask: string;
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
  return message.includes('502') || message.includes('Bad Gateway');
}
function isRetryableError(error: any): boolean {
  if (!error) return false;
  const message = error.message || String(error);
  return message.includes('timeout') || message.includes('network') || message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('Failed to parse') || message.includes('Empty response') || message.includes('Invalid JSON');
}
export class LLMOrchestrator {
  private cloudflareProvider: CloudflareAIProvider;
  private openRouterProvider: OpenRouterProvider;
  constructor() {
    this.cloudflareProvider = new CloudflareAIProvider();
    this.openRouterProvider = new OpenRouterProvider();
  }

  private normalizeTemplateTodoComments(params: {
    template: string;
    language: "JAVA" | "PYTHON";
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
    lang: "JAVA" | "PYTHON";
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
  }): Promise<AiTaskGenerationResult> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateTaskWithAI_OpenRouter(params);
    return result;
  }
  private async generateTaskAnchor(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON";
    userId?: number;
    topicId?: number;
  }): Promise<{
    topic: string;
    coreOperation: string;
    allowedScope: string[];
    forbiddenScope: string[];
  }> {
    const langName = params.lang === "JAVA" ? "Java" : "Python";
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
    const parsed = await this.openRouterProvider.generateJSON<{
      topic: string;
      coreOperation: string;
      allowedScope: string[];
      forbiddenScope: string[];
    }>(userPrompt, anchorSchema, systemPrompt, {
      timeout: 30000,
      maxRetries: 0,
      userId: params.userId,
      topicId: params.topicId,
      temperature: 0.2,
      maxTokens: 500
    });
    if (parsed.topic.trim() !== params.topicTitle.trim()) {
      throw new Error(`ANCHOR_TOPIC_MISMATCH: Expected topic "${params.topicTitle}", but anchor contains "${parsed.topic}". Topic must exactly match.`);
    }
    if (parsed.coreOperation.trim().length < 10) {
      throw new Error(`ANCHOR_TOO_VAGUE: coreOperation "${parsed.coreOperation}" is too vague (less than 10 characters). Generation aborted.`);
    }
    return parsed;
  }
  private async generateTaskFromAnchor(params: {
    topicTitle: string;
    theory: string;
    lang: "JAVA" | "PYTHON";
    anchor: {
      topic: string;
      coreOperation: string;
      allowedScope: string[];
      forbiddenScope: string[];
    };
    difus?: number;
    userId?: number;
    topicId?: number;
  }): Promise<AiTaskGenerationResult> {
    const langName = params.lang === "JAVA" ? "Java" : "Python";
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
      required: ["title", "topic", "difficulty", "theoryMarkdown", "practicalTask", "inputFormat", "outputFormat", "constraints", "examples", "codeTemplate"]
    };
    const systemPrompt = `Ти досвідчений викладач програмування. Створюй якісні завдання з теорією та практикою. Відповідай українською мовою у форматі JSON згідно з наданою схемою.

КРИТИЧНО: Поле "topic" в JSON ОБОВ'ЯЗКОВО має дорівнювати "${params.anchor.topic}". НЕ змінюй anchor.`;
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

Теорія з теми (для контексту):
${params.theory.slice(0, 2000)}

ШАБЛОН КОДУ (codeTemplate) - ЗАБОРОНЕНО писати реалізацію:
- Для Java: ТІЛЬКИ порожній клас Main з методом main та TODO-коментарем
- Для Python: ТІЛЬКИ порожня функція main() з if __name__ == "__main__" та TODO-коментарем
- ЗАБОРОНЕНО: писати реалізацію, готовий код

ВХІДНІ ДАНІ (inputFormat):
- Якщо завдання потребує читання з консолі: "Програма читає з консолі: [опис]"
- Якщо НЕ потребує: "Немає вхідних даних. Використовуйте значення, які ви вкажете в коді."

Відповідай ТІЛЬКИ JSON, без markdown блоків, без пояснень.
`.trim();
    const maxRetries = 2;
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const parsed = await this.openRouterProvider.generateJSON<any>(userPrompt, jsonSchema, systemPrompt, {
          timeout: 30000,
          maxRetries: 0,
          userId: params.userId,
          topicId: params.topicId,
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
            console.log(`[LLMOrchestrator] Retrying due to semantic gate failure (attempt ${attempt + 1}/${maxRetries}): ${err.message}`);
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw err;
        }
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        throw new Error(`AI_GENERATION_FAILED: ${err.message || 'Unknown error'}`);
      }
    }
    throw new Error(`AI_GENERATION_FAILED: All retries exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  private async generateTaskWithAI_OpenRouter(params: {
    topicTitle: string;
    theory: string;
    lang: "JAVA" | "PYTHON";
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    userId?: number;
    topicId?: number;
  }): Promise<AiTaskGenerationResult> {
    const anchor = await this.generateTaskAnchor({
      topicTitle: params.topicTitle,
      lang: params.lang,
      userId: params.userId,
      topicId: params.topicId
    });
    const result = await this.generateTaskFromAnchor({
      topicTitle: params.topicTitle,
      theory: params.theory,
      lang: params.lang,
      anchor: anchor,
      difus: params.difus,
      userId: params.userId,
      topicId: params.topicId
    });
    return result;
  }
  async generateTheoryWithAI(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON";
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
  }): Promise<AiTheoryResult> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateTheoryWithAI_OpenRouter(params);
    return result;
  }
  private async generateTheoryWithAI_OpenRouter(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON";
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    userId?: number;
    topicId?: number;
  }): Promise<AiTheoryResult> {
    const langName = params.lang === "JAVA" ? "Java" : "Python";
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
      const content = await this.openRouterProvider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
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
    lang: "JAVA" | "PYTHON";
    prevTopics: string;
    count?: number;
    userId?: number;
    topicId?: number;
    language?: "uk" | "en";
  }): Promise<AiQuizResult> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateQuizWithAI_OpenRouter(params);
    return result;
  }
  private async generateQuizWithAI_OpenRouter(params: {
    lang: "JAVA" | "PYTHON";
    prevTopics: string;
    count?: number;
    userId?: number;
    topicId?: number;
  }): Promise<AiQuizResult> {
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
        const content = await this.openRouterProvider.generateText(userPrompt, systemPrompt, {
          timeout: 30000,
          userId: params.userId,
          topicId: params.topicId,
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
    language: "JAVA" | "PYTHON";
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
  }): Promise<{
    description: string;
  }> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateTaskCondition_OpenRouter(params);
    return result;
  }
  private async generateTaskCondition_OpenRouter(params: {
    topicTitle: string;
    taskTitle?: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: "JAVA" | "PYTHON";
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
  }): Promise<{
    description: string;
  }> {
    const langName = params.language === "JAVA" ? "Java" : "Python";
    const difficulty = params.difficulty ?? 3;
    const difficultyPrompt = getDifficultyPrompt(difficulty / 5);
    const taskTypeText = params.taskType === "CONTROL" ? "КОНТРОЛЬНЕ завдання для перевірки знань по темі" : "ПРАКТИЧНЕ завдання для відпрацювання матеріалу";
    const isEnglish = params.userLanguage === "en";
    const teacherTaskTitle = (params.taskTitle || "").trim();
    const effectiveTitle = teacherTaskTitle || params.topicTitle;
    const systemPrompt = isEnglish ? `You are an experienced programming teacher. Create clear, detailed task descriptions with examples.` : `Ти досвідчений викладач програмування. Створюй чіткі, детальні умови завдань з прикладами.`;
    const userPrompt = isEnglish ? `Create a detailed task description for ${taskTypeText.toLowerCase()} titled "${effectiveTitle}" for ${langName} language.

  Topic: "${params.topicTitle}"
  ${teacherTaskTitle ? `Teacher-provided task title: "${teacherTaskTitle}"\nCRITICAL: Use the teacher title as the MAIN theme and do not invent another title.` : ""}

CRITICAL: The task MUST be specifically about the topic "${params.topicTitle}". If the topic is "harmonic mean of array" - the task must be about harmonic mean of array, not about other topics.

${difficultyPrompt}

REQUIREMENTS:
- The task description MUST be specifically about the topic "${params.topicTitle}"
- Do not create tasks about other topics
- The practical task must directly relate to the topic "${params.topicTitle}"
- The task description must be detailed and comprehensive
- Include a clear problem statement
- Provide input/output format specifications
- Include at least 2-3 examples with input and expected output
- Explain what the program should do step by step
- Format: Markdown with proper headings and code blocks
- The task should be related to the topic "${params.topicTitle}"

Return ONLY the task description in Markdown format without additional comments.` : `Створи детальну умову ${taskTypeText.toLowerCase()} "${effectiveTitle}" для мови ${langName}.

ТЕМА: "${params.topicTitle}"
${teacherTaskTitle ? `НАЗВА ЗАВДАННЯ (вчитель): "${teacherTaskTitle}"\nКРИТИЧНО: Використай назву вчителя як ОСНОВНУ ідею та не вигадуй іншу назву.` : ""}

КРИТИЧНО ВАЖЛИВО: Завдання МАЄ бути саме про тему "${params.topicTitle}". Якщо тема "середнє гармонічне масиву" - завдання має бути про середнє гармонічне масиву, а не про інші теми.

${difficultyPrompt}

ВИМОГИ:
- Завдання МАЄ бути саме про тему "${params.topicTitle}"
- Не створюй завдання про інші теми
- Практичне завдання має безпосередньо стосуватися теми "${params.topicTitle}"
- Умова має бути детальною та повною
- Включи чітке формулювання задачі
- Вкажи формат вводу/виводу
- Додай принаймні 2-3 приклади з вхідними даними та очікуваним результатом
- Поясни, що має робити програма покроково
- Формат: Markdown з правильними заголовками та код-блоками

Поверни ТІЛЬКИ умову завдання у форматі Markdown без додаткових коментарів.`;
    try {
      const content = await this.openRouterProvider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
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
    language: "JAVA" | "PYTHON";
    description?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
  }): Promise<{
    template: string;
  }> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateTaskTemplate_OpenRouter(params);
    return result;
  }
  private async generateTaskTemplate_OpenRouter(params: {
    topicTitle: string;
    taskTitle?: string;
    language: "JAVA" | "PYTHON";
    description?: string;
    userId?: number;
    topicId?: number;
    userLanguage?: "uk" | "en";
  }): Promise<{
    template: string;
  }> {
    const langName = params.language === "JAVA" ? "Java" : "Python";
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
      const content = await this.openRouterProvider.generateText(userPrompt, systemPrompt, {
        timeout: 30000,
        userId: params.userId,
        topicId: params.topicId,
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
    lang: "JAVA" | "PYTHON";
    count: number;
    userId?: number;
  }): Promise<TestDataExample[]> {
    console.log('[LLMOrchestrator] CloudflareAI temporarily disabled, using OpenRouter directly');
    const result = await this.generateTestDataWithAI_OpenRouter(params);
    return result;
  }
  private async generateTestDataWithAI_OpenRouter(params: {
    taskDescription: string;
    taskTitle: string;
    lang: "JAVA" | "PYTHON";
    count: number;
    userId?: number;
  }): Promise<TestDataExample[]> {
    const langName = params.lang === "JAVA" ? "Java" : "Python";
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
      const parsed = await this.openRouterProvider.generateJSON<{
        tests: TestDataExample[];
      }>(userPrompt, jsonSchema, systemPrompt, {
        timeout: 30000,
        maxRetries: 1,
        userId: params.userId,
        temperature: 0.4,
        maxTokens: 2000
      });
      const validated = AIResponseValidator.validateGenerateTestData(parsed, desiredCount);
      return validated;
    } catch (error: any) {
      console.error("Error generating test data with AI:", error);
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