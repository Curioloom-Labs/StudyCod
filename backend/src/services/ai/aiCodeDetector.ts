import { createHash } from 'crypto';
import { z } from "zod";
import { getLLMProvider } from "../llm/provider";
import { redisKey, runWithRedis } from "../redis/sharedRedis";
import { env } from "../../env";
import { generatePromptJSON } from "../llm/promptExecution";
import { PROMPT_SCHEMA_VERSION } from "../../../../shared/ai/prompts";
import { getActivePromptBundleVersion } from "../llm/promptExecution";

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

const cacheByGradeId = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60_000;
const CACHE_TTL_SECONDS = Math.max(1, Math.ceil(CACHE_TTL_MS / 1000));

function nowMs(): number {
  return Date.now();
}

function clampText(input: unknown, maxLen: number): string {
  const s = String(input ?? "");
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return cleaned.length > maxLen ? cleaned.slice(0, maxLen) : cleaned;
}

function detectorCacheFingerprint(params: {
  gradeId: number;
  language: string;
  taskTitle: string;
  taskDescription: string;
  template: string;
  submittedCode: string;
}, model: string, promptVersion: string): string {
  const modelConfig = [
    env.LLM_PROVIDER,
    env.OPENROUTER_MODEL,
    env.OPENROUTER_TEXT_MODEL,
    env.OPENROUTER_JSON_MODEL,
    env.OPENROUTER_FALLBACK_MODELS,
    env.OPENROUTER_MODEL_FALLBACKS,
  ].map(value => String(value ?? '').trim()).join('|');
  const input = JSON.stringify({
    gradeId: params.gradeId,
    language: params.language,
    taskTitle: clampText(params.taskTitle, 200),
    taskDescription: clampText(params.taskDescription, 3000),
    template: clampText(params.template, 3000),
    submittedCode: clampText(params.submittedCode, 6000),
    model,
    modelConfig,
    promptVersion,
    schemaVersion: PROMPT_SCHEMA_VERSION,
  });
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

function detectorRedisKey(gradeId: number, fingerprint: string, promptVersion: string): string {
  return redisKey("ai-detector", promptVersion, PROMPT_SCHEMA_VERSION, "grade", gradeId, fingerprint);
}

function detectorCacheKey(gradeId: number, fingerprint: string, promptVersion: string): string {
  return `${promptVersion}:${PROMPT_SCHEMA_VERSION}:${gradeId}:${fingerprint}`;
}

function isCachedValue(value: unknown): value is Omit<AICodeDetectionResult, "cached"> {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const likelihood = v.likelihood;
  const score = v.score;
  return (likelihood === "unlikely" || likelihood === "possible" || likelihood === "likely")
    && typeof score === "number"
    && Number.isFinite(score);
}

export async function detectAICode(params: {
  gradeId: number;
  language: string;
  taskTitle: string;
  taskDescription: string;
  template: string;
  submittedCode: string;
  requestId?: string;
  userId?: number;
  topicTaskId?: number;
}): Promise<AICodeDetectionResult> {
  const model = (env.OPENROUTER_MODEL || "openai/gpt-4o-mini").trim() || "openai/gpt-4o-mini";
  const promptVersion = getActivePromptBundleVersion();
  const fingerprint = detectorCacheFingerprint(params, model, promptVersion);
  const cacheKey = detectorCacheKey(params.gradeId, fingerprint, promptVersion);
  const cached = cacheByGradeId.get(cacheKey);
  if (cached && cached.expiresAt > nowMs()) {
    return {
      ...cached.value,
      cached: true
    };
  }

  const cachedFromRedisRaw = await runWithRedis("ai detector cache get", async redis => {
    return await redis.get(detectorRedisKey(params.gradeId, fingerprint, promptVersion));
  });

  if (typeof cachedFromRedisRaw === "string" && cachedFromRedisRaw.trim()) {
    try {
      const parsed = JSON.parse(cachedFromRedisRaw);
      if (isCachedValue(parsed)) {
        const value = parsed as Omit<AICodeDetectionResult, "cached">;
        cacheByGradeId.set(cacheKey, {
          expiresAt: nowMs() + CACHE_TTL_MS,
          value,
        });
        return {
          ...value,
          cached: true,
        };
      }
    } catch {
      // ignore malformed cache payloads
    }
  }

  const system = `Ти — інструмент для попередньої перевірки коду вчителем. Код сам собою не доводить, хто його написав: визначай лише обмежені сигнали, пояснюй альтернативні причини схожості та явно вказуй невизначеність. Результат є орієнтиром для подальшої перевірки, не доказом порушення і не підставою автоматично карати учня.\n\nВАЖЛИВО: прості задачі часто дають дуже схожі рішення у всіх. Не карай за "очевидність". Якщо завдання просте або шаблон коду сильно задає структуру — знижуй впевненість.\n\nВідповідай ТІЛЬКИ JSON без пояснень.`;

  const taskTitle = clampText(params.taskTitle, 200);
  const taskDescription = clampText(params.taskDescription, 3000);
  const template = clampText(params.template, 3000);
  const code = clampText(params.submittedCode, 6000);

  const user = `Мова: ${params.language}\n\nНазва задачі: ${taskTitle}\n\nУмова (скорочено):\n${taskDescription}\n\nШаблон (скорочено):\n${template}\n\nКод учня (скорочено):\n${code}\n\nПоверни JSON цього формату:\n{\n  "likelihood": "unlikely"|"possible"|"likely",\n  "score": number (0..1),\n  "reasons": string[] (короткі маркери),\n  "caveats": string[] (чому це може бути хибно-позитивно),\n  "suggestedChecks": string[] (що вчителю перевірити, напр. усне пояснення, історія комітів тощо)\n}\n\nПравила:\n- Якщо впевненість низька — став score <= 0.4 та likelihood="unlikely" або "possible".\n- Для простих задач або коли шаблон задає багато — не став "likely" без дуже сильних ознак.\n- Не вигадуй факти (наприклад, не кажи, що є бібліотеки, якщо їх нема).`;

  const provider = getLLMProvider();
  const jsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["likelihood", "score", "reasons", "caveats", "suggestedChecks"],
    properties: {
      likelihood: { type: "string", enum: ["unlikely", "possible", "likely"] },
      score: { type: "number", minimum: 0, maximum: 1 },
      reasons: { type: "array", items: { type: "string" }, maxItems: 10 },
      caveats: { type: "array", items: { type: "string" }, maxItems: 10 },
      suggestedChecks: { type: "array", items: { type: "string" }, maxItems: 10 }
    }
  };

  const parsed: unknown = await generatePromptJSON(provider, "integrity.code-detection", user, jsonSchema, system, {
    timeout: 25_000,
    maxRetries: 1,
    userId: params.userId,
    topicId: params.topicTaskId,
    traceId: params.requestId,
    language: "uk",
    temperature: 0.1,
    maxTokens: 450
  });

  const validated = detectionSchema.parse(parsed);

  const value: Omit<AICodeDetectionResult, "cached"> = {
    ...validated,
    model
  };

  cacheByGradeId.set(cacheKey, {
    expiresAt: nowMs() + CACHE_TTL_MS,
    value
  });

  await runWithRedis("ai detector cache set", async redis => {
    await redis.set(detectorRedisKey(params.gradeId, fingerprint, promptVersion), JSON.stringify(value), {
      EX: CACHE_TTL_SECONDS,
    });
    return true;
  });

  return {
    ...value,
    cached: false
  };
}
