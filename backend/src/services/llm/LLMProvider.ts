export interface LLMGenerateOptions {
  timeout?: number;
  maxRetries?: number;
  userId?: number;
  topicId?: number;
  traceId?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "uk" | "en";
  /**
   * Optional external cancellation signal (e.g. HTTP request deadline).
   * Providers should abort upstream fetches when this signal is aborted.
   */
  signal?: AbortSignal;
}
export interface LLMProvider {
  generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T>;
}