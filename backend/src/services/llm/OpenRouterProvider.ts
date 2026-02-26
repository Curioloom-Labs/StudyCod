import { logger } from '../../utils/logger';
import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { tryFixJsonResponse } from '../../../../shared/utils/taskValidator';

type KeyHealthState = {
  cooldownUntilMs: number;
  disabledUntilMs: number;
  consecutiveFailures: number;
  lastStatus?: number;
  lastErrorMessage?: string;
};

const keyHealthByKey = new Map<string, KeyHealthState>();
let didWarnSuspiciousKeyPrefix = false;

function nowMs(): number {
  return Date.now();
}

function getKeyHealth(key: string): KeyHealthState {
  const existing = keyHealthByKey.get(key);
  if (existing) return existing;
  const st: KeyHealthState = {
    cooldownUntilMs: 0,
    disabledUntilMs: 0,
    consecutiveFailures: 0
  };
  keyHealthByKey.set(key, st);
  return st;
}

function parseRetryAfterMs(response: Response): number {
  const raw = response.headers.get('retry-after');
  if (!raw) return 0;
  const s = raw.trim();
  if (!s) return 0;
  // numeric = seconds
  if (/^\d+$/.test(s)) {
    const sec = Number.parseInt(s, 10);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    return sec * 1000;
  }
  // date = HTTP date
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return 0;
  const delta = t - nowMs();
  return delta > 0 ? delta : 0;
}

function normalizeAndDeduplicateKeys(primary: string, backups: string[]): string[] {
  const raw = [primary, ...backups].map(s => String(s ?? '').trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function looksLikeOpenRouterKey(key: string): boolean {
  const k = String(key ?? '').trim();
  // OpenRouter keys typically start with sk-or- (including sk-or-v1-)
  return /^sk-or-/.test(k);
}
interface OpenRouterRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  response_format?: {
    type: string;
  };
  temperature?: number;
  max_tokens?: number;
}
interface OpenRouterResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

function isRateLimitLike(message: string): boolean {
  const m = String(message ?? '').toLowerCase();
  return m.includes('rate limit') || m.includes('rate-limited') || m.includes('temporarily rate-limited') || /\b429\b/.test(m);
}
function modelsWithoutSystemSupport(): string[] {
  // Some routed providers (e.g., Google AI Studio) reject system/developer instructions for certain Gemma models.
  // When that happens, we must inline the system/developer instructions into the user message.
  return [
    'google/gemma-3-27b-it',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it',
    'google/gemma-3-12b-it:free',
    'google/gemma-3-12b',
    'google/gemma-3-12b:free'
  ];
}
function modelsWithoutJsonMode(): string[] {
  // These models frequently error on OpenAI-style JSON mode / response_format.
  return [
    'google/gemma-3-27b-it',
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it',
    'google/gemma-3-12b-it:free',
    'google/gemma-3-12b',
    'google/gemma-3-12b:free'
  ];
}
function normalizeModelForSystemCheck(model: string): string {
  return model.toLowerCase().trim();
}
function shouldCombineSystemToUser(model: string): boolean {
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutSystemSupport().some(m => normalized.includes(m.toLowerCase()));
}
function shouldRemoveJsonMode(model: string): boolean {
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutJsonMode().some(m => normalized.includes(m.toLowerCase()));
}
function adaptMessagesForModel(messages: Array<{
  role: string;
  content: string;
}>, model: string): Array<{
  role: string;
  content: string;
}> {
  if (!shouldCombineSystemToUser(model)) {
    return messages;
  }
  const systemMessages: string[] = [];
  const userMessages: string[] = [];
  for (const msg of messages) {
    if (msg.role === 'system' || msg.role === 'developer') {
      systemMessages.push(msg.content);
    } else if (msg.role === 'user') {
      userMessages.push(msg.content);
    }
  }
  if (systemMessages.length === 0) {
    return messages;
  }
  const combinedUserContent = systemMessages.join('\n\n') + (userMessages.length > 0 ? '\n\n' + userMessages.join('\n\n') : '');
  return [{
    role: 'user',
    content: combinedUserContent
  }];
}
export class OpenRouterProvider implements LLMProvider {
  private async callOpenRouter(request: OpenRouterRequest, options: LLMGenerateOptions = {}): Promise<OpenRouterResponse> {
    const {
      timeout = 30000,
      maxRetries = 2,
      userId,
      topicId,
      traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      signal
    } = options;
    const model = request.model || process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const url = process.env.OPENROUTER_URL || 'https://openrouter.ai/api/v1/chat/completions';
    const adaptedMessages = adaptMessagesForModel(request.messages, model);
    const adaptedRequest = {
      ...request,
      messages: adaptedMessages
    };
    if (shouldRemoveJsonMode(model) && adaptedRequest.response_format) {
      delete adaptedRequest.response_format;
    }
    const primary = (process.env.OPENROUTER_API_KEY || '').trim();
    const backups = (process.env.OPENROUTER_BACKUP_API_KEYS || '').split(',').map(s => s.trim()).filter(Boolean);
    const allKeys = normalizeAndDeduplicateKeys(primary, backups);
    if (allKeys.length === 0) {
      throw new Error('AI_GENERATION_FAILED: No OpenRouter API keys configured');
    }

    // Non-blocking hint: if a key doesn't look like OpenRouter key, warn once and still try.
    // This helps catch “User not found” issues caused by accidental wrong tokens in env.
    if (!didWarnSuspiciousKeyPrefix) {
      for (const k of allKeys) {
        if (!looksLikeOpenRouterKey(k)) {
          didWarnSuspiciousKeyPrefix = true;
          logger.warn('OpenRouter API key looks suspicious (unexpected prefix). It may be invalid or from a different provider.', {
            traceId,
            userId,
            topicId
          });
          break;
        }
      }
    }

    let lastError: Error | null = null;

    const errorsSummary: Array<{ keyIndex: number; status?: number; message: string }> = [];
    const keyDisableMs = (() => {
      const raw = String(process.env.OPENROUTER_KEY_DISABLE_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 24 * 60 * 60 * 1000;
    })();
    const defaultRateLimitCooldownMs = (() => {
      const raw = String(process.env.OPENROUTER_RATE_LIMIT_COOLDOWN_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 10_000;
    })();
    const defaultServerErrorCooldownMs = (() => {
      const raw = String(process.env.OPENROUTER_SERVER_ERROR_COOLDOWN_MS || '').trim();
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : 2_000;
    })();

    for (let keyIdx = 0; keyIdx < allKeys.length; keyIdx++) {
      const apiKey = allKeys[keyIdx];
      const keyIndex = keyIdx + 1;
      const keyHealth = getKeyHealth(apiKey);
      const now = nowMs();
      if (keyHealth.disabledUntilMs > now) {
        logger.info('OpenRouter key skipped (disabled)', {
          traceId,
          userId,
          topicId,
          keyIndex,
          keysAvailable: allKeys.length,
          disabledForMs: keyHealth.disabledUntilMs - now,
          model
        });
        continue;
      }
      if (keyHealth.cooldownUntilMs > now) {
        logger.info('OpenRouter key skipped (cooldown)', {
          traceId,
          userId,
          topicId,
          keyIndex,
          keysAvailable: allKeys.length,
          cooldownForMs: keyHealth.cooldownUntilMs - now,
          model
        });
        continue;
      }

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeout);
          const onAbort = () => controller.abort();
          if (signal) {
            if (signal.aborted) controller.abort();
            else signal.addEventListener('abort', onAbort, { once: true });
          }
          const logContext = {
            traceId,
            userId,
            topicId,
            attempt: attempt + 1,
            maxRetries: maxRetries + 1,
            keyIndex,
            keysAvailable: allKeys.length,
            model
          };
          logger.info("OpenRouter request started", logContext);
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://studycod.app',
              'X-Title': 'StudyCod Task Generator'
            },
            body: JSON.stringify({
              ...adaptedRequest,
              model
            }),
            signal: controller.signal
          });
          clearTimeout(timeoutId);
          if (signal) signal.removeEventListener('abort', onAbort);
          if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
            logger.warn("OpenRouter request failed", {
              ...logContext,
              status: response.status,
              error: errorText
            });

            keyHealth.consecutiveFailures += 1;
            keyHealth.lastStatus = response.status;
            keyHealth.lastErrorMessage = String(errorText ?? '');

            errorsSummary.push({
              keyIndex,
              status: response.status,
              message: String(errorText ?? '').slice(0, 400)
            });

            let parsedError: any = null;
            try {
              parsedError = JSON.parse(errorText);
            } catch {
              parsedError = null;
            }
            const errorMessage = parsedError?.error?.message || errorText;
            const isInvalidArgument = response.status === 400 && (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('Developer instruction is not enabled') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled'));
            const isRateLimit = response.status === 429 || isRateLimitLike(errorMessage);
            if (isInvalidArgument) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
            }
            if (response.status === 400) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
            }
            if (response.status === 401 || response.status === 403) {
              // Invalid/unauthorized key – disable it for a while so we stop burning it on every request.
              keyHealth.disabledUntilMs = nowMs() + keyDisableMs;
              lastError = error;
              break;
            }
            if (isRateLimit || response.status >= 500) {
              const retryAfterMs = parseRetryAfterMs(response);
              if (isRateLimit) {
                // Cool down this key; try other keys for this request.
                keyHealth.cooldownUntilMs = nowMs() + (retryAfterMs > 0 ? retryAfterMs : defaultRateLimitCooldownMs);
              } else {
                keyHealth.cooldownUntilMs = nowMs() + defaultServerErrorCooldownMs;
              }
              if (attempt < maxRetries) {
                lastError = error;
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                logger.info("OpenRouter retry", {
                  traceId,
                  userId,
                  topicId,
                  attempt: attempt + 1,
                  status: response.status,
                  delay
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              lastError = error;
              // Rate limited on this key: move on to the next configured key.
              if (isRateLimit) break;
            }
            throw error;
          }
          const data = (await response.json()) as OpenRouterResponse;
          if (data.error) {
            const errorMessage = data.error.message || data.error.type || 'Unknown error';
            const isInvalidArgument = errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('Developer instruction is not enabled') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled');
            const isRateLimit = isRateLimitLike(errorMessage);
            const error = new Error(`OpenRouter API error: ${errorMessage}`);
            logger.warn("OpenRouter API error", {
              ...logContext,
              error: data.error
            });

            keyHealth.consecutiveFailures += 1;
            keyHealth.lastStatus = keyHealth.lastStatus ?? 500;
            keyHealth.lastErrorMessage = errorMessage;
            errorsSummary.push({
              keyIndex,
              status: keyHealth.lastStatus,
              message: String(errorMessage ?? '').slice(0, 400)
            });

            if (isInvalidArgument) {
              throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorMessage}`);
            }
            if (isRateLimit) {
              keyHealth.cooldownUntilMs = nowMs() + defaultRateLimitCooldownMs;
              if (attempt < maxRetries) {
                lastError = error;
                const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
                logger.info("OpenRouter retry (rate limit)", {
                  traceId,
                  userId,
                  topicId,
                  attempt: attempt + 1,
                  delay
                });
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
              }
              // Rate limited on this key: move on to the next configured key.
              lastError = error;
              break;
            }
            if (attempt < maxRetries) {
              lastError = error;
              continue;
            }
            throw error;
          }
          const responseId = data.id || 'unknown';

          // Success: reset health counters.
          keyHealth.consecutiveFailures = 0;
          keyHealth.lastStatus = 200;
          keyHealth.lastErrorMessage = undefined;
          keyHealth.cooldownUntilMs = 0;

          logger.info("OpenRouter request succeeded", {
            ...logContext,
            responseId
          });
          return data;
        } catch (err: any) {
          if (signal && err?.name === 'AbortError' && signal.aborted) {
            // External cancellation (request deadline) – surface as timeout to callers.
            throw new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)');
          }
          lastError = err;
          if (err.name === 'AbortError' || err.message?.includes('timeout')) {
            logger.warn("OpenRouter request timeout", {
              traceId,
              userId,
              topicId,
              attempt: attempt + 1
            });
            const timeoutSeconds = Math.max(1, Math.round(timeout / 1000));
            throw new Error(`AI_GENERATION_FAILED: Request timeout (${timeoutSeconds}s exceeded)`);
          }
          if (err.message?.includes('Invalid request for model')) {
            throw err;
          }
          if (isRateLimitLike(err?.message || '')) {
            // Try the next key (if any) instead of failing fast.
            lastError = err;
            break;
          }
          if (err.message?.includes('AI_GENERATION_FAILED')) {
            throw err;
          }
          if (attempt >= maxRetries) {
            break;
          }
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          logger.info("OpenRouter retry", {
            traceId,
            userId,
            topicId,
            attempt: attempt + 1,
            delay
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    if (lastError?.message?.includes('Invalid request for model')) {
      throw lastError;
    }
    if (lastError?.message?.includes('Rate limit exceeded')) {
      throw lastError;
    }

    if (errorsSummary.length > 0) {
      const countsByStatus = new Map<number, number>();
      for (const e of errorsSummary) {
        const st = typeof e.status === 'number' ? e.status : 0;
        countsByStatus.set(st, (countsByStatus.get(st) ?? 0) + 1);
      }
      const statusSummary = Array.from(countsByStatus.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([st, cnt]) => `${st || 'unknown'}x${cnt}`)
        .join(', ');

      throw new Error(
        `AI_GENERATION_FAILED: All API keys exhausted for model ${model}. ` +
        `Errors: ${statusSummary}. ` +
        `Last error: ${lastError?.message || 'Unknown error'}`
      );
    }

    throw new Error(`AI_GENERATION_FAILED: All API keys exhausted for model ${model}. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  async generateText(prompt: string, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<string> {
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const messages: Array<{
      role: string;
      content: string;
    }> = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    messages.push({
      role: 'user',
      content: prompt
    });
    const request: OpenRouterRequest = {
      model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    };
    const response = await this.callOpenRouter(request, options);
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from LLM');
    }
    return content;
  }
  async generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<T> {
    const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
    const messages: Array<{
      role: string;
      content: string;
    }> = [];
    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      });
    }
    const jsonPrompt = `${prompt}\n\nСхема JSON:\n${JSON.stringify(schema, null, 2)}\n\nВідповідай ТІЛЬКИ валідним JSON без markdown блоків.`;
    messages.push({
      role: 'user',
      content: jsonPrompt
    });
    const request: OpenRouterRequest = {
      model,
      messages,
      response_format: {
        type: 'json_object'
      },
      temperature: options.temperature,
      max_tokens: options.maxTokens
    };
    const response = await this.callOpenRouter(request, options);
    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from LLM');
    }
    try {
      let jsonContent = content.trim();
      if (jsonContent.includes('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) jsonContent = jsonMatch[1];
      }
      return JSON.parse(jsonContent) as T;
    } catch (error: any) {
      try {
        return tryFixJsonResponse(content) as T;
      } catch (fixError: any) {
        throw new Error(`AI_GENERATION_FAILED: Failed to parse JSON response: ${error.message}. ` + `Fix attempt failed: ${fixError?.message || String(fixError)}`);
      }
    }
  }
}