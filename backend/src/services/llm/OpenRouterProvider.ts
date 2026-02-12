import fetch from 'node-fetch';
import { logger } from '../../utils/logger';
import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
import { tryFixJsonResponse } from '../../../../shared/utils/taskValidator';
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
    const allKeys = [primary, ...backups].filter(Boolean);
    if (allKeys.length === 0) {
      throw new Error('AI_GENERATION_FAILED: No OpenRouter API keys configured');
    }
    let lastError: Error | null = null;
    for (const apiKey of allKeys) {
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
            keyIndex: allKeys.indexOf(apiKey) + 1,
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
            let parsedError: any = null;
            try {
              parsedError = JSON.parse(errorText);
            } catch {
              parsedError = null;
            }
            const errorMessage = parsedError?.error?.message || errorText;
            const isInvalidArgument = response.status === 400 && (errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('Developer instruction is not enabled') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled'));
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
              if (isRateLimit) {
                throw new Error(`AI_GENERATION_FAILED: Rate limit exceeded for model ${model}. ${errorText}`);
              }
            }
            throw error;
          }
          const data = (await response.json()) as OpenRouterResponse;
          if (data.error) {
            const errorMessage = data.error.message || data.error.type || 'Unknown error';
            const isInvalidArgument = errorMessage.includes('INVALID_ARGUMENT') || errorMessage.includes('Developer instruction is not enabled') || errorMessage.includes('JSON mode is not enabled') || errorMessage.includes('not enabled');
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
    throw new Error(`AI_GENERATION_FAILED: All API keys exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
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