import { Task } from "../entities/Task";
import { getLLMProvider } from "../services/llm/provider";
import { logger } from "../utils/logger";
interface AiScoreResult {
  work: number;
  optimization: number;
  integrity: number;
  feedback: string;
  fallbackUsed?: boolean;
  comparison?: {
    hasPrevious: boolean;
    previousGrade: number | null;
    changes: Array<{
      category: "work" | "optimization" | "integrity";
      delta: number;
      reason: string;
      codeLine?: number;
    }>;
  };
}
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const GRADE_SCALE_MAX = 100;
export async function evaluateCodeWithAI(params: {
  code: string;
  language: "JAVA" | "PYTHON" | "CPP";
  task: Task;
  previousCode?: string;
  previousGrade?: number;
  previousScores?: {
    work: number;
    optimization: number;
    integrity: number;
  };
}): Promise<AiScoreResult> {
  const provider = getLLMProvider();
  const hasPrevious = !!(params.previousCode && params.previousGrade !== undefined);
  const systemPrompt = hasPrevious ? `Ти — суворий, але справедливий асистент-екзаменатор з програмування.
Оціни наведений код студента для задачі курсу ${params.language} та ПОРІВНЯЙ його з попередньою спробою.
Критерії: work (5), optimization (4), integrity (3). Відповідь ТІЛЬКИ у форматі JSON.` : `Ти — суворий, але справедливий асистент-екзаменатор з програмування.
Оціни наведений код студента для задачі курсу ${params.language}. Критерії: work (5), optimization (4), integrity (3). Відповідь ТІЛЬКИ у форматі JSON.`;
  const userPrompt = hasPrevious ? `
Текст задачі:
${params.task.descriptionMarkdown || params.task.description}

ПОПЕРЕДНЯ СПРОБА:
Оцінка: ${params.previousGrade}
Працездатність: ${params.previousScores?.work ?? 0}/5
Оптимізація: ${params.previousScores?.optimization ?? 0}/4
Доброчесність: ${params.previousScores?.integrity ?? 0}/3

Код попередньої спроби:
\`\`\`
${params.previousCode}
\`\`\`

ПОТОЧНА СПРОБА:
Код студента:
\`\`\`
${params.code}
\`\`\`

ЗАВДАННЯ: Порівняй поточну спробу з попередньою. Вкажи конкретні зміни у форматі JSON.
`.trim() : `
Текст задачі:
${params.task.descriptionMarkdown || params.task.description}

Код студента:
\`\`\`
${params.code}
\`\`\`
`.trim();
  const schema = {
    type: "object",
    properties: {
      work: {
        type: "number",
        minimum: 0,
        maximum: 5
      },
      optimization: {
        type: "number",
        minimum: 0,
        maximum: 4
      },
      integrity: {
        type: "number",
        minimum: 0,
        maximum: 3
      },
      feedback: {
        type: "string"
      },
      ...(hasPrevious ? {
        comparison: {
          type: "object",
          properties: {
            changes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string"
                  },
                  delta: {
                    type: "number"
                  },
                  reason: {
                    type: "string"
                  },
                  codeLine: {
                    type: "number"
                  }
                }
              }
            }
          }
        }
      } : {})
    },
    required: ["work", "optimization", "integrity", "feedback"]
  };
  try {
    const parsed = await provider.generateJSON<any>(userPrompt, schema, systemPrompt, {
      temperature: 0.1
    });
    const work = clamp(Number(parsed.work ?? 0), 0, 5);
    const optimization = clamp(Number(parsed.optimization ?? parsed.opt ?? 0), 0, 4);
    const integrity = clamp(Number(parsed.integrity ?? 0), 0, 3);
    const cleanFeedback = (text: string) => String(text).replace(/```json/gi, "").replace(/```/g, "").trim();
    const result: AiScoreResult = {
      work,
      optimization,
      integrity,
      feedback: cleanFeedback(parsed.feedback ?? "").slice(0, 2000)
    };
    if (hasPrevious && parsed.comparison) {
      result.comparison = {
        hasPrevious: true,
        previousGrade: params.previousGrade ?? null,
        changes: (parsed.comparison.changes || []).map((c: any) => ({
          category: c.category || "work",
          delta: Number(c.delta || 0),
          reason: String(c.reason || ""),
          codeLine: c.codeLine ? Number(c.codeLine) : undefined
        }))
      };
    }
    return result;
  } catch (error: any) {
    logger.warn('[ai-eval] failed', { message: error?.message });
    return {
      // Conservative fallback: avoid artificially inflated grades when AI is unavailable.
      // computeTotalFromParts(1,1,1) -> 25/100, a temporary conservative score until retry.
      work: 1,
      optimization: 1,
      integrity: 1,
      feedback: "Не вдалося підключитись до ШІ. Застосовано тимчасову консервативну оцінку. Спробуйте повторно пізніше.",
      fallbackUsed: true
    };
  }
}
export function computeTotalFromParts(parts: {
  work: number;
  optimization: number;
  integrity: number;
}): number {
  if (parts.work === 0 || parts.integrity === 0) return 1;
  const raw12 = parts.work + parts.optimization + parts.integrity;
  const scaled100 = Math.round(raw12 / 12 * GRADE_SCALE_MAX);
  return clamp(scaled100, 1, GRADE_SCALE_MAX);
}