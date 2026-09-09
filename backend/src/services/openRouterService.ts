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


/** Best-effort JSON extraction from an LLM response (strips code fences + surrounding prose). */
function parseJsonLoose(raw: string): unknown {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
}): Promise<{ lesson: unknown }> {
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
    if (!isRecord(lesson) || !Array.isArray(lesson.sections)) {
      throw new Error("model did not return a valid lesson object");
    }
    return { lesson };
  } catch (err: unknown) {
    const message = typeof err === "object" && err !== null && "message" in err && typeof err.message === "string"
      ? err.message
      : "Unknown error";
    throw new Error(`AI_GENERATION_FAILED: Interactive lesson generation failed: ${message}`);
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
