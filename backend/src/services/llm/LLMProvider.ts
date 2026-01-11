export interface LLMGenerateOptions {
  timeout?: number;
  maxRetries?: number;
  userId?: number;
  topicId?: number;
  traceId?: string;
  temperature?: number;
  maxTokens?: number;
  language?: "uk" | "en";
}
export interface LLMProvider {
  generateText(prompt: string, systemPrompt?: string, options?: LLMGenerateOptions): Promise<string>;
  generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options?: LLMGenerateOptions): Promise<T>;
}