import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '../../utils/logger';
import {
  buildPrompt,
  createExecutionContext,
  PROMPT_CATALOG,
  PROMPT_BUNDLE_VERSION,
  consumeRetryBudget,
  isPromptBundleVersion,
  resolvePromptBundleVersion,
  type PromptId,
  type PromptLocale,
  type PromptBundleVersion,
  type AIExecutionContext,
} from '../../../../shared/ai/prompts';
import type { LLMGenerateOptions, LLMProvider } from './LLMProvider';
import { env } from '../../env';

const executionContextStorage = new AsyncLocalStorage<AIExecutionContext>();

export function getCurrentAIExecutionContext(): AIExecutionContext | undefined {
  return executionContextStorage.getStore();
}

export function consumeCurrentAIExecutionRetry(): boolean {
  return consumeRetryBudget(getCurrentAIExecutionContext()?.retryBudget);
}

export function getActivePromptBundleVersion(): PromptBundleVersion {
  return resolvePromptBundleVersion(env.AI_PROMPT_BUNDLE_ENABLED);
}

export function runWithAIExecutionContext<T>(context: AIExecutionContext, operation: () => Promise<T>): Promise<T> {
  return executionContextStorage.run(context, operation);
}

/** Establish one shared budget and deadline for direct orchestrator calls. */
export function runWithPromptExecutionContext<T>(
  id: PromptId,
  options: { signal?: AbortSignal; traceId?: string; deadlineAt?: number; timeoutMs?: number; forceNewContext?: boolean } = {},
  operation: () => Promise<T>,
): Promise<T> {
  if (!options.forceNewContext && getCurrentAIExecutionContext()) return operation();
  const timeoutMs = typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : 120_000;
  return runWithAIExecutionContext(createExecutionContext(id, {
    traceId: options.traceId ?? `trace-${randomUUID()}`,
    deadlineAt: options.deadlineAt ?? Date.now() + timeoutMs,
    // Quiz batches may need code-completeness and duplicate repairs in addition
    // to provider fallback and format repair. Practical task generation also
    // nests anchor, provider fallback, contract, and semantic repairs.
    retryBudget: { remaining: id === 'task.quiz' || id === 'task.generate' ? 16 : 2 },
    signal: options.signal,
    promptVersion: getActivePromptBundleVersion(),
  }), operation);
}

export function waitWithinAIExecutionContext(ms: number, options?: LLMGenerateOptions): Promise<void> {
  const inherited = getCurrentAIExecutionContext();
  const signal = options?.signal ?? inherited?.signal;
  const deadlineAt = options?.deadlineAt ?? inherited?.deadlineAt;
  const remainingMs = typeof deadlineAt === 'number' ? deadlineAt - Date.now() : Number.POSITIVE_INFINITY;
  if (signal?.aborted) return Promise.reject(new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)'));
  if (remainingMs <= 0) return Promise.reject(new Error('AI_GENERATION_FAILED: Request deadline exceeded during retry delay'));
  const waitMs = Math.min(Math.max(0, Math.floor(ms)), remainingMs);

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => {
      if (typeof deadlineAt === 'number' && Date.now() >= deadlineAt) {
        finish(new Error('AI_GENERATION_FAILED: Request deadline exceeded during retry delay'));
      } else {
        finish();
      }
    }, waitMs);
    const onAbort = () => finish(new Error('AI_GENERATION_FAILED: Request aborted (deadline exceeded)'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function localeFromOptions(options?: LLMGenerateOptions): PromptLocale {
  return options?.language === 'en' ? 'en' : 'uk';
}

function withPromptMetadata(id: PromptId, options: LLMGenerateOptions = {}): LLMGenerateOptions {
  const inherited = getCurrentAIExecutionContext();
  const promptSpec = PROMPT_CATALOG[id];
  const promptVersion = (isPromptBundleVersion(options.promptVersion) ? options.promptVersion : undefined)
    ?? inherited?.promptVersion
    ?? getActivePromptBundleVersion();
  const timeoutMs = typeof options.timeout === 'number' && Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : 30_000;
  const retryBudget = options.retryBudget ?? inherited?.retryBudget ?? { remaining: 2 };
  const context = createExecutionContext(id, {
    signal: options.signal ?? inherited?.signal,
    traceId: options.traceId ?? inherited?.traceId ?? `trace-${randomUUID()}`,
    deadlineAt: options.deadlineAt ?? inherited?.deadlineAt ?? Date.now() + timeoutMs,
    retryBudget,
    promptVersion,
  });
  const remainingMs = context.deadlineAt! - Date.now();
  if (remainingMs <= 0) throw new Error('AI_GENERATION_FAILED: Request deadline exceeded before provider call');
  return {
    ...options,
    ...(promptVersion === PROMPT_BUNDLE_VERSION ? {
      temperature: options.temperature ?? promptSpec.generation.temperature,
      maxTokens: options.maxTokens ?? promptSpec.generation.maxTokens,
    } : {}),
    timeout: Math.min(timeoutMs, remainingMs),
    retryBudget: context.retryBudget,
    signal: context.signal,
    traceId: context.traceId,
    deadlineAt: context.deadlineAt,
    promptId: context.promptId,
    promptVersion: context.promptVersion,
  };
}

function recordCall(id: PromptId, locale: PromptLocale, startedAt: number, responseChars: number, initialRetryBudget: number, error?: unknown, options?: LLMGenerateOptions): void {
  logger.info('[ai-prompt] call', {
    promptId: id,
    promptVersion: options?.promptVersion ?? PROMPT_BUNDLE_VERSION,
    locale,
    output: PROMPT_CATALOG[id].output,
    outcome: error ? 'error' : 'success',
    durationMs: Math.max(0, Date.now() - startedAt),
    responseChars,
    retries: Math.max(0, initialRetryBudget - (options?.retryBudget?.remaining ?? initialRetryBudget)),
    errorType: error instanceof Error ? error.name : undefined,
    traceId: options?.traceId,
  });
}

export async function generatePromptText(
  provider: LLMProvider,
  id: PromptId,
  prompt: string,
  systemPrompt: string,
  options: LLMGenerateOptions = {},
): Promise<string> {
  const startedAt = Date.now();
  const locale = localeFromOptions(options);
  const callOptions = withPromptMetadata(id, options);
  const built = buildPrompt(id, prompt, systemPrompt, locale, callOptions.promptVersion as PromptBundleVersion);
  const initialRetryBudget = callOptions.retryBudget?.remaining ?? 2;
  let responseChars = 0;
  let failure: unknown;
  try {
    const response = await provider.generateText(built.prompt, built.systemPrompt, callOptions);
    responseChars = response.length;
    return response;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    recordCall(id, locale, startedAt, responseChars, initialRetryBudget, failure, callOptions);
  }
}

export async function generatePromptJSON<T = unknown>(
  provider: LLMProvider,
  id: PromptId,
  prompt: string,
  schema: object,
  systemPrompt: string,
  options: LLMGenerateOptions = {},
): Promise<T> {
  const startedAt = Date.now();
  const locale = localeFromOptions(options);
  const callOptions = withPromptMetadata(id, options);
  const built = buildPrompt(id, prompt, systemPrompt, locale, callOptions.promptVersion as PromptBundleVersion);
  const initialRetryBudget = callOptions.retryBudget?.remaining ?? 2;
  let responseChars = 0;
  let failure: unknown;
  try {
    const response = await provider.generateJSON<T>(built.prompt, schema, built.systemPrompt, callOptions);
    responseChars = typeof response === 'string' ? response.length : JSON.stringify(response)?.length ?? 0;
    return response;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    recordCall(id, locale, startedAt, responseChars, initialRetryBudget, failure, callOptions);
  }
}
