import { getLLMProvider } from "../llm/provider";
import { formatUntrustedData } from "../../../../shared/ai/prompts";
import { generatePromptJSON } from "../llm/promptExecution";
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
  const entries = items.slice(0, 12).map(it => ({
    taskTitle: String(it.taskTitle ?? '').slice(0, 200),
    total: it.total == null ? null : Math.max(0, Math.min(100, Number(it.total))),
  }));
  return `Нещодавні роботи учня:\n${formatUntrustedData("recent_work", entries)}`;
}

/** Pure: assemble the tutor prompt from a (sanitized) question + context. */
export function buildTutorPrompt(question: string, context: string, language: "uk" | "en" = "uk"): string {
  return language === "en"
    ? [
      "You are a personal programming tutor for a school learner.",
      formatUntrustedData("learning_context", context),
      "",
      formatUntrustedData("student_question", question),
      "",
      "Explain simply and support independent thinking. Name a needed method or concept directly when asked; give a short teaching example if useful, without providing the complete task solution.",
      'Return ONLY JSON: { "answer": "explanation", "tips": ["one next action", "..."] }.'
    ].join("\n")
    : [
      "Ти персональний AI-тьютор з програмування для школяра.",
      formatUntrustedData("learning_context", context),
      "",
      formatUntrustedData("student_question", question),
      "",
      "Поясни просто й заохочуй самостійність. На пряме запитання назви потрібний метод або поняття й за потреби наведи короткий навчальний приклад, але не давай повного розв'язання задачі.",
      "Поверни ТІЛЬКИ JSON: { \"answer\": \"пояснення\", \"tips\": [\"коротка наступна дія\", \"...\"] }."
    ].join("\n");
}

/** Pure: coerce a raw LLM response into a safe tutor answer. */
export function normalizeTutorAnswer(raw: unknown): TutorAnswer {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const answer = String(value.answer ?? "").trim().slice(0, 4000);
  const tips = Array.isArray(value.tips)
    ? value.tips.map((t: unknown) => String(t ?? "").trim()).filter((t: string) => t.length > 0).slice(0, 6)
    : [];
  return { answer, tips };
}

const TUTOR_SYSTEM_PROMPT =
  "Ти доброзичливий, терплячий AI-тьютор з програмування. Відповідаєш українською, ТІЛЬКИ валідним JSON. Заохочуєш самостійне мислення.";
const TUTOR_SYSTEM_PROMPT_EN =
  "You are a kind, patient programming tutor. Answer in clear English and return only valid JSON. Encourage independent reasoning and give one useful next step.";

const TUTOR_SCHEMA = {
  type: "object",
  properties: {
    answer: { type: "string" },
    tips: { type: "array", items: { type: "string" } }
  },
  required: ["answer", "tips"]
} as const;

/** Run the tutor. Throws "AI_UNAVAILABLE" if the provider fails. */
export async function askTutor(params: { question: string; context: string; language?: "uk" | "en" }): Promise<TutorAnswer> {
  const language = params.language === "en" ? "en" : "uk";
  const safeQuestion = String(params.question || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 2000);
  try {
    const provider = getLLMProvider();
    const raw = await generatePromptJSON(
      provider,
      "edu.tutor",
      buildTutorPrompt(safeQuestion, params.context, language),
      TUTOR_SCHEMA,
      language === "en" ? TUTOR_SYSTEM_PROMPT_EN : TUTOR_SYSTEM_PROMPT,
      { timeout: 30000, temperature: 0.4, maxTokens: 1200, language }
    );
    return normalizeTutorAnswer(raw);
  } catch (error: unknown) {
    logger.warn("[edu/aiTutor] provider failed", { message: error instanceof Error ? error.message : String(error) });
    throw new Error("AI_UNAVAILABLE");
  }
}
