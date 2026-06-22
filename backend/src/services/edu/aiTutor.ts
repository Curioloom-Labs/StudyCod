import { getLLMProvider } from "../llm/provider";
import { neutralizePromptInjection } from "../ai/safeAICall";
import { logger } from "../../utils/logger";

/**
 * Personal AI tutor (Tier 2). Student-facing Q&A grounded in the student's own
 * recent work. Stateless (no schema), reuses the project's LLM provider.
 */

export interface TutorAnswer {
  answer: string;
  tips: string[];
}

export interface TutorHistoryItem {
  taskTitle: string;
  total: number | null;
}

/** Pure: compact context from the student's recent grades. */
export function buildTutorContext(items: TutorHistoryItem[]): string {
  if (!items.length) return "Поки немає історії виконаних завдань.";
  const lines = items.slice(0, 12).map(it => `- ${it.taskTitle}: ${it.total == null ? "без оцінки" : `${it.total}/100`}`);
  return `Нещодавні роботи учня:\n${lines.join("\n")}`;
}

/** Pure: assemble the tutor prompt from a (sanitized) question + context. */
export function buildTutorPrompt(question: string, context: string): string {
  return [
    "Ти персональний AI-тьютор з програмування для школяра.",
    context,
    "",
    `Питання учня: ${question}`,
    "",
    "Поясни просто й заохочуй самостійність — наводь на думку, НЕ давай готового повного розв'язання.",
    "Поверни ТІЛЬКИ JSON: { \"answer\": \"пояснення\", \"tips\": [\"коротка наступна дія\", \"...\"] }."
  ].join("\n");
}

/** Pure: coerce a raw LLM response into a safe tutor answer. */
export function normalizeTutorAnswer(raw: any): TutorAnswer {
  const answer = String(raw?.answer ?? "").trim().slice(0, 4000);
  const tips = Array.isArray(raw?.tips)
    ? raw.tips.map((t: any) => String(t ?? "").trim()).filter((t: string) => t.length > 0).slice(0, 6)
    : [];
  return { answer, tips };
}

const TUTOR_SYSTEM_PROMPT =
  "Ти доброзичливий, терплячий AI-тьютор з програмування. Відповідаєш українською, ТІЛЬКИ валідним JSON. Заохочуєш самостійне мислення.";

const TUTOR_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    tips: { type: "array", items: { type: "string" } }
  },
  required: ["answer", "tips"]
} as const;

/** Run the tutor. Throws "AI_UNAVAILABLE" if the provider fails. */
export async function askTutor(params: { question: string; context: string }): Promise<TutorAnswer> {
  const safeQuestion = neutralizePromptInjection(params.question || "").slice(0, 2000);
  try {
    const provider = getLLMProvider();
    const raw = await provider.generateJSON(
      buildTutorPrompt(safeQuestion, params.context),
      TUTOR_SCHEMA,
      TUTOR_SYSTEM_PROMPT,
      { timeout: 30000, temperature: 0.4, maxTokens: 1200 }
    );
    return normalizeTutorAnswer(raw);
  } catch (error: any) {
    logger.warn("[edu/aiTutor] provider failed", { message: error?.message });
    throw new Error("AI_UNAVAILABLE");
  }
}
