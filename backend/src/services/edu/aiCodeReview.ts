import { getLLMProvider } from "../llm/provider";
import { logger } from "../../utils/logger";

/**
 * AI inline code-review (Tier 2). Produces line-anchored comments for a student
 * submission, reusing the project's LLM provider (OpenRouter). On-demand, no
 * schema. Distinct from LLMCodeCritic (holistic) — this is line-level.
 */

export type ReviewSeverity = "info" | "suggestion" | "warning" | "error";
export interface ReviewComment {
  line: number | null;
  severity: ReviewSeverity;
  message: string;
}
export interface CodeReviewResult {
  summary: string;
  comments: ReviewComment[];
}

const SEVERITIES: ReviewSeverity[] = ["info", "suggestion", "warning", "error"];
const MAX_COMMENTS = 40;

function langName(language: string): string {
  if (language === "PYTHON") return "Python";
  if (language === "CPP") return "C++";
  return "Java";
}

/** Pure: assemble the user prompt (code + language + optional task context). */
export function buildReviewUserPrompt(code: string, language: string, taskDescription?: string): string {
  const ln = langName(language);
  return [
    `Зроби код-рев'ю наступного рішення мовою ${ln}.`,
    taskDescription ? `Контекст завдання:\n${taskDescription}` : "",
    "Код студента (рядки пронумеровані):",
    "```",
    (code || "").split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n"),
    "```",
    "",
    "Поверни ТІЛЬКИ JSON: { \"summary\": \"стислий підсумок 1-2 речення\", \"comments\": [ { \"line\": номер_рядка_або_null, \"severity\": \"info|suggestion|warning|error\", \"message\": \"конкретна порада\" } ] }.",
    "Прив'язуй коментарі до конкретних рядків. Будь конкретним і конструктивним. Без markdown."
  ].filter(Boolean).join("\n");
}

const REVIEW_SYSTEM_PROMPT =
  "Ти досвідчений, доброзичливий code reviewer. Аналізуєш коректність, баги, стиль, читабельність та оптимізації. Відповідаєш українською, ТІЛЬКИ валідним JSON.";

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: "integer" },
          severity: { type: "string", enum: SEVERITIES },
          message: { type: "string" }
        },
        required: ["severity", "message"]
      }
    }
  },
  required: ["summary", "comments"]
} as const;

/**
 * Pure: coerce a raw LLM response into a safe result. Clamps line numbers to the
 * submission, defaults unknown severities, drops empty messages, caps count, and
 * sorts by line (general comments — null line — last).
 */
export function normalizeReviewResult(raw: any, lineCount: number): CodeReviewResult {
  const summary = String(raw?.summary ?? "").trim().slice(0, 2000);
  const rawComments = Array.isArray(raw?.comments) ? raw.comments : [];
  const comments: ReviewComment[] = [];
  for (const c of rawComments) {
    const message = String(c?.message ?? "").trim();
    if (!message) continue;
    const severity: ReviewSeverity = SEVERITIES.includes(c?.severity) ? c.severity : "suggestion";
    let line: number | null = null;
    const n = Number(c?.line);
    if (Number.isInteger(n) && n >= 1 && (lineCount <= 0 || n <= lineCount)) line = n;
    comments.push({ line, severity, message: message.slice(0, 1000) });
    if (comments.length >= MAX_COMMENTS) break;
  }
  comments.sort((a, b) => (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER));
  return { summary, comments };
}

/**
 * Run an AI review for a submission. Throws "AI_UNAVAILABLE" if the provider
 * fails so the route can signal a retriable error (vs. an empty review).
 */
export async function reviewCode(params: { code: string; language: string; taskDescription?: string }): Promise<CodeReviewResult> {
  const lineCount = (params.code || "").split("\n").length;
  try {
    const provider = getLLMProvider();
    const raw = await provider.generateJSON(
      buildReviewUserPrompt(params.code, params.language, params.taskDescription),
      REVIEW_SCHEMA,
      REVIEW_SYSTEM_PROMPT,
      { timeout: 30000, temperature: 0.3, maxTokens: 1500 }
    );
    return normalizeReviewResult(raw, lineCount);
  } catch (error: any) {
    logger.warn("[edu/aiCodeReview] provider failed", { message: error?.message });
    throw new Error("AI_UNAVAILABLE");
  }
}
