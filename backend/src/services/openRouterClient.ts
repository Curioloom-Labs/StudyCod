import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
export interface OpenRouterRequest {
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
export interface OpenRouterResponse {
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
export interface OpenRouterCallOptions {
  timeout?: number;
  maxRetries?: number;
  userId?: number;
  topicId?: number;
  traceId?: string;
}
function modelsWithoutSystemSupport(): string[] {
  return ['google/gemma-3-27b-it', 'google/gemma-3-27b-it:free'];
}
function modelsWithoutJsonMode(): string[] {
  return ['google/gemma-3-27b-it', 'google/gemma-3-27b-it:free'];
}
function normalizeModelForSystemCheck(model: string): string {
  return model.toLowerCase().trim();
}
function isGemmaModel(model: string): boolean {
  return normalizeModelForSystemCheck(model).includes('gemma');
}
function shouldCombineSystemToUser(model: string): boolean {
  // Robust production guard:
  // some Gemma routes reject instruction channels; inline instructions into user message.
  if (isGemmaModel(model)) return true;
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutSystemSupport().some(m => normalized.includes(m.toLowerCase()));
}
function shouldRemoveJsonMode(model: string): boolean {
  // Robust production guard: Gemma routes may reject OpenAI JSON mode.
  if (isGemmaModel(model)) return true;
  const normalized = normalizeModelForSystemCheck(model);
  return modelsWithoutJsonMode().some(m => normalized.includes(m.toLowerCase()));
}
function supportedRolesForModel(model: string): Set<string> {
  const supportsSystem = !shouldCombineSystemToUser(model);
  const roles = new Set<string>(['user', 'assistant']);
  if (supportsSystem) roles.add('system');
  return roles;
}
function adaptMessagesForModel(messages: Array<{
  role: string;
  content: string;
}>, model: string): Array<{
  role: string;
  content: string;
}> {
  const combineSystemToUser = shouldCombineSystemToUser(model);
  const allowedRoles = supportedRolesForModel(model);

  const normalized = messages;

  if (combineSystemToUser) {
    const systemMessages: string[] = [];
    const passthrough: Array<{ role: string; content: string }> = [];
    for (const msg of normalized) {
      if (msg.role === 'system') {
        systemMessages.push(msg.content);
        continue;
      }
      passthrough.push(msg);
    }

    if (systemMessages.length > 0) {
      const prefix = systemMessages.join('\n\n');
      const firstUserIndex = passthrough.findIndex(m => m.role === 'user');
      if (firstUserIndex >= 0) {
        passthrough[firstUserIndex] = {
          role: 'user',
          content: `${prefix}\n\n${passthrough[firstUserIndex].content}`
        };
      } else {
        passthrough.unshift({ role: 'user', content: prefix });
      }
    }

    return passthrough.filter(msg => allowedRoles.has(msg.role));
  }

  return normalized.filter(msg => allowedRoles.has(msg.role));
}
function normalizeMessagesForOutgoingPayload(messages: Array<{
  role: string;
  content: string;
}>, model: string): Array<{
  role: string;
  content: string;
}> {
  // Last-mile hardening: normalize again right before HTTP send.
  const adapted = adaptMessagesForModel(messages, model);

  return adapted.filter(msg => msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant');
}
export async function callOpenRouter(request: OpenRouterRequest, options: OpenRouterCallOptions = {}): Promise<OpenRouterResponse> {
  const {
    timeout = 30000,
    maxRetries = 2,
    userId,
    topicId,
    traceId = `trace-${randomUUID()}`
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
  const allKeys = [primary, ...backups].filter(Boolean);
  if (allKeys.length === 0) {
    throw new Error('AI_GENERATION_FAILED: No OpenRouter API keys configured');
  }
  const retryBaseDelayMs = (() => {
    const raw = String(process.env.OPENROUTER_RETRY_BASE_DELAY_MS || '').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 4_000;
  })();
  const retryMaxDelayMs = (() => {
    const raw = String(process.env.OPENROUTER_RETRY_MAX_DELAY_MS || '').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 30_000;
  })();
  const getRetryDelayMs = (attempt: number): number => {
    const exp = retryBaseDelayMs * Math.pow(2, attempt);
    return Math.min(exp, retryMaxDelayMs);
  };
  let lastError: Error | null = null;
  for (const apiKey of allKeys) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        const logContext = {
          traceId,
          userId,
          topicId,
          attempt: attempt + 1,
          maxRetries: maxRetries + 1,
          keyIndex: allKeys.indexOf(apiKey) + 1,
          model
        };
        logger.info("OpenRouter request started", logContext);
        const finalMessages = normalizeMessagesForOutgoingPayload(adaptedRequest.messages, model);
        const outgoingRoles = finalMessages.map(m => m.role);
        logger.warn(`Outgoing AI request roles: ${JSON.stringify(outgoingRoles)}`, {
          traceId,
          userId,
          topicId,
          model,
          roles: outgoingRoles
        });

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
            messages: finalMessages,
            model
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
          logger.warn("OpenRouter request failed", {
            ...logContext,
            status: response.status,
            error: errorText
          });
          let parsedError: any = null;
          try {
            parsedError = JSON.parse(errorText);
          } catch {
            parsedError = null;
          }
          const errorMessage = parsedError?.error?.message || errorText;
          const isInvalidArgument = response.status === 400 && (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled'));
          const isRateLimit = response.status === 429 || errorMessage.includes('rate limit') || errorMessage.includes('rate-limited') || errorMessage.toLowerCase().includes('temporarily rate-limited');
          if (isInvalidArgument) {
            throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
          }
          if (response.status === 400) {
            throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorText}`);
          }
          if (response.status === 401 || response.status === 403) {
            lastError = error;
            break;
          }
          if (isRateLimit || response.status >= 500) {
            if (attempt < maxRetries) {
              lastError = error;
              const delay = getRetryDelayMs(attempt);
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
            if (isRateLimit) {
              throw new Error(`AI_GENERATION_FAILED: Rate limit exceeded for model ${model}. ${errorText}`);
            }
          }
          throw error;
        }
        const data = (await response.json()) as OpenRouterResponse;
        if (data.error) {
          const errorMessage = data.error.message || data.error.type || 'Unknown error';
          const isInvalidArgument = errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled');
          const isRateLimit = errorMessage.includes('rate limit') || errorMessage.includes('rate-limited') || errorMessage.includes('429') || errorMessage.toLowerCase().includes('temporarily rate-limited');
          const error = new Error(`OpenRouter API error: ${errorMessage}`);
          logger.warn("OpenRouter API error", {
            ...logContext,
            error: data.error
          });
          if (isInvalidArgument) {
            throw new Error(`AI_GENERATION_FAILED: Invalid request for model ${model}. ${errorMessage}`);
          }
          if (isRateLimit) {
            if (attempt < maxRetries) {
              lastError = error;
              const delay = getRetryDelayMs(attempt);
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
            throw new Error(`AI_GENERATION_FAILED: Rate limit exceeded for model ${model}. ${errorMessage}`);
          }
          if (attempt < maxRetries) {
            lastError = error;
            continue;
          }
          throw error;
        }
        const responseId = data.id || 'unknown';
        logger.info("OpenRouter request succeeded", {
          ...logContext,
          responseId
        });
        return data;
      } catch (err: any) {
        lastError = err;
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          logger.warn("OpenRouter request timeout", {
            traceId,
            userId,
            topicId,
            attempt: attempt + 1
          });
          throw new Error('AI_GENERATION_FAILED: Request timeout (30s exceeded)');
        }
        if (err.message?.includes('Invalid request for model')) {
          throw err;
        }
        if (err.message?.includes('Rate limit exceeded')) {
          throw err;
        }
        if (err.message?.includes('AI_GENERATION_FAILED')) {
          throw err;
        }
        if (attempt >= maxRetries) {
          break;
        }
        const delay = getRetryDelayMs(attempt);
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
  throw new Error(`AI_GENERATION_FAILED: All API keys exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
}
