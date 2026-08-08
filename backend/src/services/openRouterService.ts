import { getLLMOrchestrator } from './llm/LLMOrchestrator';
import { getLLMProvider } from './llm/provider';
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
/* function getDifficultyPrompt(difus: number): string {
  if (difus < 0.2) return "Рівень: ПОЧАТКОВИЙ (Дуже легко). Завдання має бути максимально простим, лише на відпрацювання синтаксису. Жодних складних алгоритмів.";
  if (difus < 0.4) return "Рівень: ЛЕГКИЙ. Просте завдання, мінімум умов. Фокус на розумінні теми.";
  if (difus < 0.6) return "Рівень: СЕРЕДНІЙ. Додай 1-2 прості умови або розгалуження. Стандартна складність.";
  if (difus < 0.8) return "Рівень: ВИЩЕ СЕРЕДНЬОГО. Потрібно трохи подумати. Можна додати неочевидний момент в умові.";
  return "Рівень: СКЛАДНИЙ. Завдання на логічне мислення. Вимагає оптимізації або обробки граничних випадків.";
} */
export async function generateTaskWithAI(params: {
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
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateTaskWithAI(params);
}
export async function generateTaskCondition(params: {
  topicTitle: string;
  taskTitle?: string;
  taskType: "PRACTICE" | "CONTROL";
  difficulty?: number;
  language: "JAVA" | "PYTHON";
  userId?: number;
  topicId?: number;
}): Promise<{
  description: string;
}> {
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateTaskCondition(params);
}
/* Legacy provider implementation retained only in history; orchestration is the live path.
async function generateTaskCondition_OLD(params: {
  topicTitle: string;
  taskType: "PRACTICE" | "CONTROL";
  difficulty?: number;
  language: "JAVA" | "PYTHON";
  userId?: number;
  topicId?: number;
}): Promise<{
  description: string;
}> {
  const provider = getLLMProvider();
  const langName = params.language === "JAVA" ? "Java" : "Python";
  const difficulty = params.difficulty ?? 3;
  const difficultyPrompt = getDifficultyPrompt(difficulty / 5);
  const taskTypeText = params.taskType === "CONTROL" ? "КОНТРОЛЬНЕ завдання для перевірки знань по темі" : "ПРАКТИЧНЕ завдання для відпрацювання матеріалу";
  const systemPrompt = `Ти досвідчений викладач програмування. Створюй чіткі, лаконічні умови завдань без зайвої "води".`;
  const userPrompt = `Створи умову ${taskTypeText} "${params.topicTitle}" для мови ${langName}.

${difficultyPrompt}

ВИМОГИ:
- Умова має бути чіткою та конкретною
- Без зайвих пояснень та "води"
- Прив'язана до теми "${params.topicTitle}"
- Формат: Markdown

Поверни ТІЛЬКИ умову завдання без додаткових коментарів.`;
  try {
    const content = await provider.generateText(userPrompt, systemPrompt, {
      timeout: 30000,
      userId: params.userId,
      topicId: params.topicId,
      temperature: 0.7,
      maxTokens: 1500
    });
    return {
      description: content.trim()
    };
  } catch (error: any) {
    throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
  }
}
*/
export async function generateTaskTemplate(params: {
  topicTitle: string;
  taskTitle?: string;
  language: "JAVA" | "PYTHON";
  description?: string;
  userId?: number;
  topicId?: number;
}): Promise<{
  template: string;
}> {
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateTaskTemplate(params);
}
/*
async function generateTaskTemplate_OLD(params: {
  topicTitle: string;
  language: "JAVA" | "PYTHON";
  description?: string;
  userId?: number;
  topicId?: number;
}): Promise<{
  template: string;
}> {
  const provider = getLLMProvider();
  const langName = params.language === "JAVA" ? "Java" : "Python";
  const systemPrompt = `Ти досвідчений викладач програмування. Створюй шаблони коду з TODO-коментарями для студентів.`;
  let userPrompt = `Створи шаблон коду (пустишку) для мови ${langName} по темі "${params.topicTitle}".`;
  if (params.description) {
    userPrompt += `\n\nУмова завдання:\n${params.description}`;
  }
  userPrompt += `\n\nВИМОГИ:
- Шаблон має містити TODO-коментарі з інструкціями
- Необхідні імпорти/imports
- Порожню функцію або main метод
- БЕЗ реалізації логіки
- Формат коду має відповідати стандартам ${langName}

Приклад для Java:
\`\`\`java
import java.util.*;

public class Main {
    public static void main(String[] args) {
        // TODO: реалізуйте рішення задачі
    }
}
\`\`\`

Поверни ТІЛЬКИ код без markdown блоків та пояснень.`;
  try {
    const content = await provider.generateText(userPrompt, systemPrompt, {
      timeout: 30000,
      userId: params.userId,
      topicId: params.topicId,
      temperature: 0.3,
      maxTokens: 1000
    });
    let template = content.trim();
    template = template.replace(/^```\w*\n?/gm, '');
    template = template.replace(/```$/gm, '');
    template = template.trim();
    return {
      template
    };
  } catch (error: any) {
    throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
  }
}
*/
export async function generateTheoryWithAI(params: {
  topicTitle: string;
  lang: "JAVA" | "PYTHON";
  taskDescription?: string;
  taskType?: "PRACTICE" | "CONTROL";
  difficulty?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiTheoryResult> {
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateTheoryWithAI(params);
}
/*
async function generateTheoryWithAI_OLD(params: {
  topicTitle: string;
  lang: "JAVA" | "PYTHON";
  taskDescription?: string;
  taskType?: "PRACTICE" | "CONTROL";
  difficulty?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiTheoryResult> {
  const provider = getLLMProvider();
  const langName = params.lang === "JAVA" ? "Java" : "Python";
  const systemPrompt = `Ти досвідчений викладач програмування. Створюй якісні уроки з детальними поясненнями та прикладами коду. Відповідай українською мовою у форматі Markdown.`;
  let userPrompt: string;
  if (params.taskDescription && params.taskType) {
    const difficultyDesc = params.difficulty ? params.difficulty === 1 ? "легкого рівня" : params.difficulty === 2 ? "простого рівня" : params.difficulty === 3 ? "середнього рівня" : params.difficulty === 4 ? "складного рівня" : "дуже складного рівня" : "середнього рівня";
    const taskTypeDesc = params.taskType === "CONTROL" ? "контрольного завдання" : "практичного завдання";
    userPrompt = `Напиши детальну теорію для ${taskTypeDesc} ${difficultyDesc} по темі "${params.topicTitle}" для мови ${langName}.

Умова завдання:
${params.taskDescription}

Теорія має містити:
1. Вступ до теми та необхідних концепцій для виконання завдання
2. Детальні пояснення ключових моментів з прикладами коду
3. Пояснення підходів до розв'язання подібних задач
4. Важливі моменти та типові помилки
5. Практичні приклади, що допоможуть зрозуміти завдання

Формат: Markdown з код-блоками для прикладів. Теорія має бути конкретною та допомагати учню виконати саме це завдання.`;
  } else {
    userPrompt = `Напиши детальний урок по темі: "${params.topicTitle}" для мови ${langName}.
Урок має містити:
1. Вступ до теми
2. Детальні пояснення з прикладами коду
3. Практичні приклади
4. Важливі моменти та застереження

Формат: Markdown з код-блоками для прикладів.`;
  }
  try {
    const content = await provider.generateText(userPrompt, systemPrompt, {
      timeout: 30000,
      userId: params.userId,
      topicId: params.topicId,
      temperature: 0.7,
      maxTokens: 3000
    });
    if (!content || !content.trim()) throw new Error('Empty AI response');
    return {
      theory: content.trim()
    };
  } catch (err: any) {
    throw new Error(`AI_GENERATION_FAILED: Theory generation failed: ${err.message || 'Unknown error'}`);
  }
}
*/

/** Best-effort JSON extraction from an LLM response (strips code fences + surrounding prose). */
function parseJsonLoose(raw: string): any {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Generate an interactive lesson as the typed-block JSON the LessonBlocks editor/reader use.
 * Returns the raw parsed object; the frontend normalizes/validates it (normalizeInteractiveLesson).
 */
export async function generateInteractiveLessonWithAI(params: {
  topicTitle: string;
  lang: "JAVA" | "PYTHON" | "CPP";
  userId?: number;
  topicId?: number;
}): Promise<{ lesson: any }> {
  const provider = getLLMProvider();
  const langName = params.lang === "JAVA" ? "Java" : params.lang === "CPP" ? "C++" : "Python";
  const runnableLang = params.lang === "JAVA" ? "JAVA" : params.lang === "CPP" ? "CPP" : "PYTHON";
  const codeLang = params.lang.toLowerCase();

  const systemPrompt = `Ти — досвідчений викладач програмування. Створюєш ІНТЕРАКТИВНИЙ урок як СТРОГИЙ JSON за схемою. Відповідай ВИКЛЮЧНО валідним JSON-об'єктом — без markdown-огортки, без тексту до/після.

Схема:
{
  "objectives": ["ціль", ...],
  "sections": [
    { "heading": "Заголовок розділу", "blocks": [
      {"type":"prose","markdown":"пояснення (Markdown)"},
      {"type":"callout","variant":"info","markdown":"важлива примітка"},
      {"type":"code","language":"${codeLang}","code":"приклад","caption":"необов."},
      {"type":"keypoints","items":["теза", ...]},
      {"type":"runnable","language":"${runnableLang}","code":"робочий код для запуску","prompt":"необов."},
      {"type":"check","question":"питання","options":["A","B","C"],"correct":0,"explanation":"чому"}
    ]}
  ],
  "summary": ["підсумок", ...]
}

Вимоги:
- 2-4 objectives; 3-5 sections; у кожному 2-5 blocks, чергуй типи.
- ОБОВ'ЯЗКОВО ≥1 "runnable" (повний робочий код мовою ${langName}, що компілюється і друкує результат) і ≥1 "check".
- variant у callout: лише info | tip | warning. "correct" — 0-based індекс у "options".
- Увесь код — мовою ${langName}. Пояснення — українською. Поверни ЛИШЕ JSON.`;

  const userPrompt = `Створи інтерактивний урок по темі: "${params.topicTitle}" для мови ${langName}.`;

  try {
    const content = await provider.generateText(userPrompt, systemPrompt, {
      timeout: 60000,
      userId: params.userId,
      topicId: params.topicId,
      temperature: 0.6,
      maxTokens: 4000
    });
    const lesson = parseJsonLoose(content);
    if (!lesson || typeof lesson !== "object" || !Array.isArray(lesson.sections)) {
      throw new Error("model did not return a valid lesson object");
    }
    return { lesson };
  } catch (err: any) {
    throw new Error(`AI_GENERATION_FAILED: Interactive lesson generation failed: ${err.message || "Unknown error"}`);
  }
}

export async function generateQuizWithAI(params: {
  lang: "JAVA" | "PYTHON";
  prevTopics: string;
  count?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiQuizResult> {
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateQuizWithAI(params);
}
/*
async function generateQuizWithAI_OLD(params: {
  lang: "JAVA" | "PYTHON";
  prevTopics: string;
  count?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiQuizResult> {
  const provider = getLLMProvider();
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
              cleaned = cleaned.replace(/^(?:json|JSON)\s*\/i, '');
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
      if (!Array.isArray(parsed)) throw new Error('Response must be an array');
      if (parsed.length !== questionCount) throw new Error(`Expected ${questionCount} questions, got ${parsed.length}`);
      parsed.forEach((q: any, idx: number) => {
        if (typeof q.q !== 'string' || !q.q.trim()) throw new Error(`Question ${idx + 1}: missing or invalid 'q' field`);
        if (!Array.isArray(q.options) || q.options.length !== 5) throw new Error(`Question ${idx + 1}: must have exactly 5 options`);
        if (typeof q.correct !== 'number' || q.correct < 0 || q.correct > 4) throw new Error(`Question ${idx + 1}: 'correct' must be 0-4`);
      });
      return {
        quizJson: JSON.stringify(parsed)
      };
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
*/
