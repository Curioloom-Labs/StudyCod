export interface LLMGenerateOptions {
  timeout?: number;
  maxRetries?: number;
  userId?: number;
  topicId?: number;
  traceId?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "uk" | "en";
  /** Prefer the next configured model after generated content failed validation. */
  validationRetry?: boolean;
  /**
   * Optional external cancellation signal (e.g. HTTP request deadline).
   * Providers should abort upstream fetches when this signal is aborted.
   */
  signal?: AbortSignal;
  /** Stable ID from the shared StudyCod prompt registry. */
  promptId?: import('../../../../shared/ai/prompts').PromptId;
  /** Prompt package version used for this call. */
  promptVersion?: string;
  /** Mutable per-request budget shared by provider and orchestration retries. */
  retryBudget?: { remaining: number };
  /** Absolute wall-clock deadline shared with nested AI calls. */
  deadlineAt?: number;
  /** Ask OpenRouter for provider-enforced JSON Schema output instead of best-effort JSON mode. */
  strictJsonSchema?: boolean;
}
export interface LLMProvider {
  generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  generateJSON<T = unknown>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T>;
}
