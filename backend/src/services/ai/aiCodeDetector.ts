import { z } from "zod";
import { callOpenRouter } from "../openRouterClient";

export type AIDetectorLikelihood = "unlikely" | "possible" | "likely";

export interface AICodeDetectionResult {
  likelihood: AIDetectorLikelihood;
  score: number; // 0..1
  reasons: string[];
  caveats: string[];
  suggestedChecks: string[];
  model: string;
  cached: boolean;
}

const detectionSchema = z.object({
  likelihood: z.enum(["unlikely", "possible", "likely"]),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()).max(10),
  caveats: z.array(z.string()).max(10),
  suggestedChecks: z.array(z.string()).max(10)
});

type CacheEntry = {
  expiresAt: number;
  value: Omit<AICodeDetectionResult, "cached">;
};

const cacheByGradeId = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 15 * 60_000;

function nowMs(): number {
  return Date.now();
}

function clampText(input: unknown, maxLen: number): string {
  const s = String(input ?? "");
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

export async function detectAICode(params: {
  gradeId: number;
  language: "JAVA" | "PYTHON";
  taskTitle: string;
  taskDescription: string;
  template: string;
  submittedCode: string;
  requestId?: string;
  userId?: number;
  topicTaskId?: number;
}): Promise<AICodeDetectionResult> {
  const cached = cacheByGradeId.get(params.gradeId);
  if (cached && cached.expiresAt > nowMs()) {
    return {
      ...cached.value,
      cached: true
    };
  }

  const model = (process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini").trim() || "openai/gpt-4o-mini";

  const system = `Ти інструмент для вчителя: оціни ймовірність того, що код учня написаний з суттєвою допомогою AI (ChatGPT/LLM), а не самостійно.\n\nВАЖЛИВО: прості задачі часто дають дуже схожі рішення у всіх. Не карай за "очевидність". Якщо завдання просте або шаблон коду сильно задає структуру — знижуй впевненість.\n\nВідповідай ТІЛЬКИ JSON без пояснень.`;

  const taskTitle = clampText(params.taskTitle, 200);
  const taskDescription = clampText(params.taskDescription, 3000);
  const template = clampText(params.template, 3000);
  const code = clampText(params.submittedCode, 6000);

  const user = `Мова: ${params.language}\n\nНазва задачі: ${taskTitle}\n\nУмова (скорочено):\n${taskDescription}\n\nШаблон (скорочено):\n${template}\n\nКод учня (скорочено):\n${code}\n\nПоверни JSON цього формату:\n{\n  "likelihood": "unlikely"|"possible"|"likely",\n  "score": number (0..1),\n  "reasons": string[] (короткі маркери),\n  "caveats": string[] (чому це може бути хибно-позитивно),\n  "suggestedChecks": string[] (що вчителю перевірити, напр. усне пояснення, історія комітів тощо)\n}\n\nПравила:\n- Якщо впевненість низька — став score <= 0.4 та likelihood="unlikely" або "possible".\n- Для простих задач або коли шаблон задає багато — не став "likely" без дуже сильних ознак.\n- Не вигадуй факти (наприклад, не кажи, що є бібліотеки, якщо їх нема).`;

  const resp = await callOpenRouter({
    model,
    messages: [{
      role: "system",
      content: system
    }, {
      role: "user",
      content: user
    }],
    response_format: {
      type: "json_object"
    },
    temperature: 0.1,
    max_tokens: 450
  }, {
    timeout: 25_000,
    maxRetries: 1,
    userId: params.userId,
    topicId: params.topicTaskId,
    traceId: params.requestId
  });

  const content = resp.choices?.[0]?.message?.content || "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error(`AI_DETECT_FAILED: Invalid JSON from model: ${content.slice(0, 200)}`);
  }

  const validated = detectionSchema.parse(parsed);

  const value: Omit<AICodeDetectionResult, "cached"> = {
    ...validated,
    model
  };

  cacheByGradeId.set(params.gradeId, {
    expiresAt: nowMs() + CACHE_TTL_MS,
    value
  });

  return {
    ...value,
    cached: false
  };
}
