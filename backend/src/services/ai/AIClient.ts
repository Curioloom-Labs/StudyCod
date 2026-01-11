import fetch from 'node-fetch';
export type AIMode = 'generateTask' | 'generateTheory' | 'generateQuiz' | 'generateTaskCondition' | 'generateTaskTemplate' | 'generateTestData';
export interface AIRequest {
  mode: AIMode;
  params: any;
}
export interface AIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}
export class AIClient {
  private baseUrl: string;
  private timeout: number;
  constructor() {
    this.baseUrl = process.env.AI_SERVICE_URL || 'http://localhost:3001';
    this.timeout = parseInt(process.env.AI_SERVICE_TIMEOUT || '30000', 10);
  }
  private async request<T>(mode: AIMode, params: any): Promise<T> {
    const url = `${this.baseUrl}/api/v1/${mode}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          mode,
          params
        }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`AI Service HTTP ${response.status}: ${errorText}`);
      }
      const result = (await response.json()) as AIResponse<T>;
      if (!result.success) {
        throw new Error(result.error || 'AI Service returned error');
      }
      if (!result.data) {
        throw new Error('AI Service returned empty data');
      }
      return result.data;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('AI_GENERATION_FAILED: Request timeout');
      }
      throw new Error(`AI_GENERATION_FAILED: ${error.message || 'Unknown error'}`);
    }
  }
  async generateTask(params: {
    topicTitle: string;
    theory: string;
    lang: "JAVA" | "PYTHON";
    numInTopic: number;
    isFirstTask: boolean;
    difus?: number;
    isControl?: boolean;
    prevTopics?: string;
    userId?: number;
    topicId?: number;
  }): Promise<any> {
    return this.request('generateTask', params);
  }
  async generateTheory(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON";
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    userId?: number;
    topicId?: number;
  }): Promise<{
    theory: string;
  }> {
    return this.request('generateTheory', params);
  }
  async generateQuiz(params: {
    lang: "JAVA" | "PYTHON";
    prevTopics: string;
    count?: number;
    userId?: number;
    topicId?: number;
  }): Promise<{
    quizJson: string;
  }> {
    return this.request('generateQuiz', params);
  }
  async generateTaskCondition(params: {
    topicTitle: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: "JAVA" | "PYTHON";
    userId?: number;
    topicId?: number;
  }): Promise<{
    description: string;
  }> {
    return this.request('generateTaskCondition', params);
  }
  async generateTaskTemplate(params: {
    topicTitle: string;
    language: "JAVA" | "PYTHON";
    description?: string;
    userId?: number;
    topicId?: number;
  }): Promise<{
    template: string;
  }> {
    return this.request('generateTaskTemplate', params);
  }
  async generateTestData(params: {
    taskDescription: string;
    taskTitle: string;
    lang: "JAVA" | "PYTHON";
    count: number;
    userId?: number;
  }): Promise<Array<{
    input: string;
    output: string;
    explanation?: string;
  }>> {
    return this.request('generateTestData', params);
  }
}
let aiClientInstance: AIClient | null = null;
export function getAIClient(): AIClient {
  if (!aiClientInstance) {
    aiClientInstance = new AIClient();
  }
  return aiClientInstance;
}