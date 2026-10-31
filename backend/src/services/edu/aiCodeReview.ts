import { getLLMProvider } from "../llm/provider";
import { generatePromptJSON } from "../llm/promptExecution";
import { formatUntrustedData } from "../../../../shared/ai/prompts";
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
  const normalized = String(language || "").trim();
  if (normalized === "PYTHON" || normalized.toLowerCase() === "python") return "Python";
  if (normalized === "CPP" || normalized.toLowerCase() === "cpp") return "C++";
  return normalized || "обраною мовою";
}

/** Pure: assemble the user prompt (code + language + optional task context). */
export function buildReviewUserPrompt(code: string, language: string, taskDescription?: string, uiLanguage: "uk" | "en" = "uk"): string {
  const ln = langName(language);
  const numberedCode = (code || "").split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
  if (uiLanguage === "en") {
    return [
      `Review this ${ln} submission for confirmed correctness issues and useful improvements.`,
      taskDescription ? `Task context:\n${formatUntrustedData("task_statement", taskDescription)}` : "",
      "Student source, with line numbers:",
      formatUntrustedData("student_code", numberedCode),
      'Return ONLY JSON: { "summary": "one or two concise sentences", "comments": [ { "line": integer or null, "severity": "info|suggestion|warning|error", "message": "specific, constructive feedback" } ] }. Use null for a whole-program comment and cite a line only when the issue is present on that line. Do not invent bugs or provide a complete replacement solution.'
    ].filter(Boolean).join("\n");
  }
  return [
    `Зроби код-рев'ю наступного рішення мовою ${ln}.`,
    taskDescription ? `Контекст завдання:\n${formatUntrustedData("task_statement", taskDescription)}` : "",
    "Код студента (рядки пронумеровані):",
    formatUntrustedData("student_code", numberedCode),
    "",
    "Поверни ТІЛЬКИ JSON: { \"summary\": \"стислий підсумок 1-2 речення\", \"comments\": [ { \"line\": номер_рядка_або_null, \"severity\": \"info|suggestion|warning|error\", \"message\": \"конкретна порада\" } ] }.",
    "Прив'язуй коментарі до конкретних рядків. Будь конкретним і конструктивним. Без markdown."
  ].filter(Boolean).join("\n");
}

const REVIEW_SYSTEM_PROMPT =
  "Ти досвідчений, доброзичливий code reviewer. Аналізуєш коректність, баги, стиль, читабельність та оптимізації. Відповідаєш українською, ТІЛЬКИ валідним JSON.";
const REVIEW_SYSTEM_PROMPT_EN =
  "You are a careful, supportive code reviewer. Report only confirmed issues supported by the code or task, use real line references, and return valid JSON only. Match feedback to the learner's level and do not provide a complete replacement solution.";

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    comments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line: { type: ["integer", "null"] },
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
export function normalizeReviewResult(raw: unknown, lineCount: number): CodeReviewResult {
  const value = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const summary = String(value.summary ?? "").trim().slice(0, 2000);
  const rawComments = Array.isArray(value.comments) ? value.comments : [];
  const comments: ReviewComment[] = [];
  for (const c of rawComments) {
    const comment = c && typeof c === "object" && !Array.isArray(c)
      ? c as Record<string, unknown>
      : {};
    const message = String(comment.message ?? "").trim();
    if (!message) continue;
    const severity: ReviewSeverity = SEVERITIES.includes(comment.severity as ReviewSeverity)
      ? comment.severity as ReviewSeverity
      : "suggestion";
    let line: number | null = null;
    const n = Number(comment.line);
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
export async function reviewCode(params: { code: string; language: string; taskDescription?: string; uiLanguage?: "uk" | "en" }): Promise<CodeReviewResult> {
  const lineCount = (params.code || "").split("\n").length;
  const uiLanguage = params.uiLanguage === "en" ? "en" : "uk";
  try {
    const provider = getLLMProvider();
    const raw = await generatePromptJSON(
      provider,
      "edu.code-review",
      buildReviewUserPrompt(params.code, params.language, params.taskDescription, uiLanguage),
      REVIEW_SCHEMA,
      uiLanguage === "en" ? REVIEW_SYSTEM_PROMPT_EN : REVIEW_SYSTEM_PROMPT,
      { timeout: 30000, temperature: 0.3, maxTokens: 1500, language: uiLanguage }
    );
    return normalizeReviewResult(raw, lineCount);
  } catch (error: unknown) {
    logger.warn("[edu/aiCodeReview] provider failed", { message: error instanceof Error ? error.message : String(error) });
    throw new Error("AI_UNAVAILABLE");
  }
}
