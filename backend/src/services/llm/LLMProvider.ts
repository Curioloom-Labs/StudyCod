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
}
export interface LLMProvider {
  generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  generateJSON<T = unknown>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T>;
}
