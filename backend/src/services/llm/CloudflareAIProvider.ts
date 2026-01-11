import fetch from 'node-fetch';
import { LLMProvider, LLMGenerateOptions } from './LLMProvider';
interface CloudflareWorkerRequest {
  mode: string;
  language: "uk" | "en";
  params: {
    prompt: string;
    systemPrompt?: string;
    schema?: object;
    temperature?: number;
    maxTokens?: number;
  };
}
interface CloudflareWorkerResponse {
  content?: string;
  error?: string;
}
interface ExpressServiceResponse {
  success?: boolean;
  data?: any;
  error?: string;
}
export class CloudflareAIProvider implements LLMProvider {
  private async callCloudflareWorker(mode: string, params: CloudflareWorkerRequest['params'], options: LLMGenerateOptions = {}): Promise<CloudflareWorkerResponse> {
    const {
      timeout = 20000,
      maxRetries = 1,
      userId,
      topicId,
      traceId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    } = options;
    const url = process.env.CLOUDFLARE_AI_URL;
    if (!url) {
      throw new Error('AI_GENERATION_FAILED: CLOUDFLARE_AI_URL not configured');
    }
    const language: "uk" | "en" = options.language === "en" ? "en" : "uk";
    const requestPayload: CloudflareWorkerRequest = {
      mode,
      language,
      params: {
        ...params,
        temperature: params.temperature ?? options.temperature,
        maxTokens: params.maxTokens ?? options.maxTokens
      }
    };
    const logContext = {
      traceId,
      userId,
      topicId,
      mode
    };
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        console.log(`[CloudflareAI] Request started`, {
          ...logContext,
          attempt: attempt + 1
        });
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestPayload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`CloudflareAI HTTP ${response.status}: ${errorText}`);
          console.error(`[CloudflareAI] Request failed`, {
            ...logContext,
            status: response.status,
            error: errorText
          });
          if (response.status === 502) {
            const fallbackError = new Error(`AI_GENERATION_FAILED: Cloudflare Worker returned 502 (Bad Gateway). Fallback to OpenRouter.`);
            (fallbackError as any).shouldFallback = true;
            throw fallbackError;
          }
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }
          if (attempt < maxRetries && (response.status >= 500 || response.status === 429)) {
            lastError = error;
            const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
            console.log(`[CloudflareAI] Retrying after ${delay}ms`, {
              ...logContext,
              attempt: attempt + 1
            });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }
        const rawData = await response.json();
        const isArray = Array.isArray(rawData);
        const isObject = rawData && typeof rawData === 'object' && !isArray;
        console.log(`[CloudflareAI] Raw response received`, {
          ...logContext,
          isArray,
          isObject,
          hasSuccess: isObject && 'success' in rawData,
          hasContent: isObject && 'content' in rawData,
          hasData: isObject && 'data' in rawData,
          dataKeys: isArray ? `[array with ${rawData.length} items]` : isObject ? Object.keys(rawData) : null,
          dataPreview: isArray ? JSON.stringify(rawData).substring(0, 200) : isObject ? JSON.stringify(rawData).substring(0, 200) : rawData
        });
        if (isArray && mode === 'generate-test-data') {
          console.log(`[CloudflareAI] Detected array response for generate-test-data`, {
            ...logContext,
            arrayLength: rawData.length
          });
          const content = JSON.stringify(rawData);
          const data: CloudflareWorkerResponse = {
            content
          };
          console.log(`[CloudflareAI] Request succeeded (array format)`, {
            ...logContext,
            contentLength: content.length
          });
          return data;
        }
        if (isObject && !('success' in rawData) && !('content' in rawData)) {
          if ('task_condition' in rawData || 'theory_md' in rawData || 'description' in rawData || 'questions' in rawData || 'quizJson' in rawData) {
            console.log(`[CloudflareAI] Detected old Cloudflare Worker format`, {
              ...logContext,
              dataKeys: Object.keys(rawData)
            });
            let content: string | undefined;
            const legacy: any = rawData as any;
            if (mode === 'generate-task-condition' && legacy.task_condition) {
              content = typeof legacy.task_condition === 'string' ? legacy.task_condition : JSON.stringify(legacy.task_condition);
            } else if (mode === 'generate-task-condition' && legacy.description) {
              content = typeof legacy.description === 'string' ? legacy.description : JSON.stringify(legacy.description);
            } else if (mode === 'generate-theory' && legacy.theory_md) {
              content = typeof legacy.theory_md === 'string' ? legacy.theory_md : JSON.stringify(legacy.theory_md);
            } else if (mode === 'generate-quiz' && legacy.questions) {
              content = typeof legacy.questions === 'string' ? legacy.questions : JSON.stringify(legacy.questions);
            } else if (mode === 'generate-quiz' && legacy.quizJson) {
              content = typeof legacy.quizJson === 'string' ? legacy.quizJson : JSON.stringify(legacy.quizJson);
            } else {
              content = JSON.stringify(rawData);
            }
            if (!content) {
              console.error(`[CloudflareAI] Failed to extract content from old format`, {
                ...logContext,
                mode,
                dataKeys: Object.keys(rawData)
              });
              throw new Error(`AI_GENERATION_FAILED: Empty response from CloudflareAI (mode: ${mode}, old format)`);
            }
            const data: CloudflareWorkerResponse = {
              content
            };
            console.log(`[CloudflareAI] Request succeeded (old format)`, {
              ...logContext,
              contentLength: content.length
            });
            return data;
          }
        }
        if (rawData && typeof rawData === 'object' && 'success' in rawData) {
          const expressResponse = rawData as ExpressServiceResponse;
          console.log(`[CloudflareAI] Detected Express service format`, {
            ...logContext,
            success: expressResponse.success,
            hasData: !!expressResponse.data,
            dataType: expressResponse.data ? typeof expressResponse.data : null,
            dataKeys: expressResponse.data && typeof expressResponse.data === 'object' ? Object.keys(expressResponse.data) : null
          });
          if (!expressResponse.success) {
            const error = new Error(`AI_GENERATION_FAILED: ${expressResponse.error || 'Unknown error'}`);
            console.error(`[CloudflareAI] API error`, {
              ...logContext,
              error: expressResponse.error
            });
            throw error;
          }
          let content: string | undefined;
          if (expressResponse.data) {
            if (mode === 'generate-task-condition' && expressResponse.data.description) {
              content = typeof expressResponse.data.description === 'string' ? expressResponse.data.description : JSON.stringify(expressResponse.data.description);
              console.log(`[CloudflareAI] Extracted description`, {
                ...logContext,
                contentLength: content?.length
              });
            } else if (mode === 'generate-theory' && expressResponse.data.theory) {
              content = typeof expressResponse.data.theory === 'string' ? expressResponse.data.theory : JSON.stringify(expressResponse.data.theory);
            } else if (mode === 'generate-task-template' && expressResponse.data.template) {
              content = typeof expressResponse.data.template === 'string' ? expressResponse.data.template : JSON.stringify(expressResponse.data.template);
            } else if (mode === 'generate-quiz' && expressResponse.data.quizJson) {
              content = typeof expressResponse.data.quizJson === 'string' ? expressResponse.data.quizJson : JSON.stringify(expressResponse.data.quizJson);
            } else if (mode === 'generate-task' || mode === 'generate-test-data') {
              content = JSON.stringify(expressResponse.data);
            } else if (mode === 'generate-text' || mode === 'generate-json') {
              content = typeof expressResponse.data === 'string' ? expressResponse.data : JSON.stringify(expressResponse.data);
            } else {
              console.log(`[CloudflareAI] Mode ${mode} not matched, trying fallback extraction`, {
                ...logContext,
                dataKeys: Object.keys(expressResponse.data)
              });
              if (typeof expressResponse.data === 'string') {
                content = expressResponse.data;
              } else if (expressResponse.data && typeof expressResponse.data === 'object') {
                for (const [key, value] of Object.entries(expressResponse.data)) {
                  if (typeof value === 'string' && value.trim().length > 0) {
                    content = value;
                    console.log(`[CloudflareAI] Found string value in key: ${key}`, {
                      ...logContext
                    });
                    break;
                  }
                }
                if (!content) {
                  content = JSON.stringify(expressResponse.data);
                }
              }
            }
          }
          if (!content) {
            console.error(`[CloudflareAI] Failed to extract content`, {
              ...logContext,
              mode,
              data: expressResponse.data,
              dataType: typeof expressResponse.data,
              dataKeys: expressResponse.data && typeof expressResponse.data === 'object' ? Object.keys(expressResponse.data) : null
            });
            throw new Error(`AI_GENERATION_FAILED: Empty response from CloudflareAI (mode: ${mode})`);
          }
          const data: CloudflareWorkerResponse = {
            content
          };
          console.log(`[CloudflareAI] Request succeeded`, {
            ...logContext,
            contentLength: content.length
          });
          return data;
        }
        const data = rawData as CloudflareWorkerResponse;
        if (data.error) {
          const error = new Error(`AI_GENERATION_FAILED: ${data.error}`);
          console.error(`[CloudflareAI] API error`, {
            ...logContext,
            error: data.error
          });
          throw error;
        }
        console.log(`[CloudflareAI] Request succeeded`, {
          ...logContext
        });
        return data;
      } catch (err: any) {
        lastError = err;
        if (err.shouldFallback) {
          throw err;
        }
        if (err.name === 'AbortError' || err.message?.includes('timeout')) {
          console.error(`[CloudflareAI] Request timeout`, {
            ...logContext,
            attempt: attempt + 1
          });
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
            console.log(`[CloudflareAI] Retrying after ${delay}ms (timeout)`, {
              ...logContext,
              attempt: attempt + 1
            });
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error('AI_GENERATION_FAILED: Request timeout (20s exceeded)');
        }
        if (err.message?.includes('AI_GENERATION_FAILED') && err.message?.includes('HTTP 4')) {
          throw err;
        }
        const isNetworkError = err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND') || err.message?.includes('network') || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND';
        if (isNetworkError && attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 2000);
          console.log(`[CloudflareAI] Retrying after ${delay}ms (network error)`, {
            ...logContext,
            attempt: attempt + 1
          });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        if (err.message?.includes('AI_GENERATION_FAILED')) {
          throw err;
        }
      }
    }
    throw new Error(`AI_GENERATION_FAILED: All retries exhausted. Last error: ${lastError?.message || 'Unknown error'}`);
  }
  async generateText(prompt: string, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<string> {
    const response = await this.callCloudflareWorker('generate-text', {
      prompt,
      systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    }, options);
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return response.content;
  }
  async generateJSON<T = any>(prompt: string, schema: object, systemPrompt?: string, options: LLMGenerateOptions = {}): Promise<T> {
    const response = await this.callCloudflareWorker('generate-json', {
      prompt,
      systemPrompt,
      schema,
      temperature: options.temperature,
      maxTokens: options.maxTokens
    }, options);
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      let jsonContent = response.content.trim();
      if (jsonContent.includes('```')) {
        const jsonMatch = jsonContent.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) jsonContent = jsonMatch[1];
      }
      return JSON.parse(jsonContent) as T;
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse JSON response: ${error.message}`);
    }
  }
  async generateTaskWithAI(params: {
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
    const response = await this.callCloudflareWorker('generate-task', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      return JSON.parse(response.content);
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse response: ${error.message}`);
    }
  }
  async generateTheoryWithAI(params: {
    topicTitle: string;
    lang: "JAVA" | "PYTHON";
    taskDescription?: string;
    taskType?: "PRACTICE" | "CONTROL";
    difficulty?: number;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    theory: string;
  }> {
    const response = await this.callCloudflareWorker('generate-theory', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      theory: response.content.trim()
    };
  }
  async generateQuizWithAI(params: {
    lang: "JAVA" | "PYTHON";
    prevTopics: string;
    count?: number;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    quizJson: string;
  }> {
    const response = await this.callCloudflareWorker('generate-quiz', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      quizJson: response.content
    };
  }
  async generateTaskCondition(params: {
    topicTitle: string;
    taskType: "PRACTICE" | "CONTROL";
    difficulty?: number;
    language: "JAVA" | "PYTHON";
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    description: string;
  }> {
    const response = await this.callCloudflareWorker('generate-task-condition', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    return {
      description: response.content.trim()
    };
  }
  async generateTaskTemplate(params: {
    topicTitle: string;
    language: "JAVA" | "PYTHON";
    description?: string;
    userId?: number;
    topicId?: number;
  }, options?: LLMGenerateOptions): Promise<{
    template: string;
  }> {
    const response = await this.callCloudflareWorker('generate-task-template', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      topicId: params.topicId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    let template = response.content.trim();
    template = template.replace(/^```\w*\n?/gm, '');
    template = template.replace(/```$/gm, '');
    template = template.trim();
    return {
      template
    };
  }
  async generateTestDataWithAI(params: {
    taskDescription: string;
    taskTitle: string;
    lang: "JAVA" | "PYTHON";
    count: number;
    userId?: number;
  }, options?: LLMGenerateOptions): Promise<Array<{
    input: string;
    output: string;
    explanation?: string;
  }>> {
    const response = await this.callCloudflareWorker('generate-test-data', {
      prompt: JSON.stringify(params)
    }, {
      userId: params.userId,
      timeout: 30000,
      language: options?.language ?? "uk"
    });
    if (!response.content) {
      throw new Error('AI_GENERATION_FAILED: Empty response from CloudflareAI');
    }
    try {
      const parsed = JSON.parse(response.content);
      const tests = parsed.tests || parsed || [];
      const validTests = tests.filter((t: any) => t.input && t.output && t.input.trim() !== "" && t.output.trim() !== "");
      if (validTests.length === 0) {
        throw new Error("No valid tests generated");
      }
      return validTests.map((t: any) => ({
        input: String(t.input).trim(),
        output: String(t.output).trim(),
        explanation: t.explanation ? String(t.explanation).trim() : undefined
      }));
    } catch (error: any) {
      throw new Error(`AI_GENERATION_FAILED: Failed to parse test data: ${error.message}`);
    }
  }
}