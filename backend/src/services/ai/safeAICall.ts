import { Response } from 'express';
import { getLLMOrchestrator } from '../llm/LLMOrchestrator';
import { AIResponseValidator, AIValidationError } from '../llm/AIResponseValidator';
import type { AiTaskGenerationResult, AiTheoryResult, AiQuizResult, TestDataExample } from '../llm/LLMOrchestrator';
export type AIMode = 'generateTask' | 'generateTheory' | 'generateQuiz' | 'generateTaskCondition' | 'generateTaskTemplate' | 'generateTestData';
export interface AIError {
  statusCode: number;
  message: string;
  error?: string;
  details?: any;
}

type CircuitState = {
  openUntil: number;
  failures: number;
  firstFailureAt: number;
};

const circuitByMode = new Map<AIMode, CircuitState>();
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_OPEN_MS = 30_000;
const CIRCUIT_FAILURES_TO_OPEN = 5;

function getNowMs(): number {
  return Date.now();
}

function isCircuitOpen(mode: AIMode): boolean {
  const st = circuitByMode.get(mode);
  if (!st) return false;
  return st.openUntil > getNowMs();
}

function recordCircuitSuccess(mode: AIMode): void {
  circuitByMode.delete(mode);
}

function recordCircuitFailure(mode: AIMode): void {
  const now = getNowMs();
  const st = circuitByMode.get(mode);
  if (!st) {
    circuitByMode.set(mode, {
      openUntil: 0,
      failures: 1,
      firstFailureAt: now
    });
    return;
  }
  const windowExpired = now - st.firstFailureAt > CIRCUIT_WINDOW_MS;
  if (windowExpired) {
    st.failures = 1;
    st.firstFailureAt = now;
    st.openUntil = 0;
    circuitByMode.set(mode, st);
    return;
  }
  st.failures += 1;
  if (st.failures >= CIRCUIT_FAILURES_TO_OPEN) {
    st.openUntil = now + CIRCUIT_OPEN_MS;
  }
  circuitByMode.set(mode, st);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeText(input: unknown, maxLen: number): string {
  const s = String(input ?? '');
  const cleaned = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const trimmed = cleaned.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen);
}

function sanitizeParams(mode: AIMode, params: any): any {
  const p = params && typeof params === 'object' ? {
    ...params
  } : {};

  if ('topicTitle' in p) p.topicTitle = sanitizeText(p.topicTitle, 200);
  if ('theory' in p) p.theory = sanitizeText(p.theory, 12_000);
  if ('prevTopics' in p) p.prevTopics = sanitizeText(p.prevTopics, 2000);
  if ('taskDescription' in p) p.taskDescription = sanitizeText(p.taskDescription, 8000);
  if ('taskTitle' in p) p.taskTitle = sanitizeText(p.taskTitle, 200);
  if ('description' in p) p.description = sanitizeText(p.description, 8000);

  if (mode === 'generateTask') {
    p.numInTopic = typeof p.numInTopic === 'number' ? Math.max(1, Math.floor(p.numInTopic)) : p.numInTopic;
    if (typeof p.difus === 'number') p.difus = Math.max(0, Math.min(1, p.difus));
  }
  if (mode === 'generateQuiz') {
    if (typeof p.count === 'number') p.count = Math.max(1, Math.min(50, Math.floor(p.count)));
  }
  if (mode === 'generateTestData') {
    if (typeof p.count === 'number') p.count = Math.max(1, Math.min(50, Math.floor(p.count)));
  }
  if (mode === 'generateTaskCondition') {
    if (typeof p.difficulty === 'number') p.difficulty = Math.max(1, Math.min(5, Math.floor(p.difficulty)));
  }
  return p;
}

function classifyAIProviderStatus(errorMessage: string): number {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('rate limit') || msg.includes('429')) return 429;
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('30s exceeded')) return 504;
  if (msg.includes('no openrouter api keys') || msg.includes('all api keys exhausted') || msg.includes('api key')) return 503;
  if (msg.includes('invalid request') || msg.includes('400')) return 400;
  return 503;
}
function validateInputParams(mode: AIMode, params: any): void {
  switch (mode) {
    case 'generateTask':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (!params.theory || typeof params.theory !== 'string' || !params.theory.trim()) {
        throw new Error('theory is required and must be a non-empty string');
      }
      if (!params.lang || !['JAVA', 'PYTHON'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON"');
      }
      if (typeof params.numInTopic !== 'number' || params.numInTopic < 1) {
        throw new Error('numInTopic is required and must be a positive number');
      }
      if (typeof params.isFirstTask !== 'boolean') {
        throw new Error('isFirstTask is required and must be a boolean');
      }
      break;
    case 'generateTheory':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (!params.lang || !['JAVA', 'PYTHON'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON"');
      }
      break;
    case 'generateQuiz':
      if (!params.lang || !['JAVA', 'PYTHON'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON"');
      }
      if (!params.prevTopics || typeof params.prevTopics !== 'string' || !params.prevTopics.trim()) {
        throw new Error('prevTopics is required and must be a non-empty string');
      }
      if (params.count !== undefined && (typeof params.count !== 'number' || params.count < 1)) {
        throw new Error('count must be a positive number if provided');
      }
      break;
    case 'generateTaskCondition':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (!params.taskType || !['PRACTICE', 'CONTROL'].includes(params.taskType)) {
        throw new Error('taskType is required and must be "PRACTICE" or "CONTROL"');
      }
      if (!params.language || !['JAVA', 'PYTHON'].includes(params.language)) {
        throw new Error('language is required and must be "JAVA" or "PYTHON"');
      }
      if (params.difficulty !== undefined && (typeof params.difficulty !== 'number' || params.difficulty < 1 || params.difficulty > 5)) {
        throw new Error('difficulty must be a number between 1 and 5 if provided');
      }
      break;
    case 'generateTaskTemplate':
      if (!params.topicTitle || typeof params.topicTitle !== 'string' || !params.topicTitle.trim()) {
        throw new Error('topicTitle is required and must be a non-empty string');
      }
      if (!params.language || !['JAVA', 'PYTHON'].includes(params.language)) {
        throw new Error('language is required and must be "JAVA" or "PYTHON"');
      }
      break;
    case 'generateTestData':
      if (!params.taskDescription || typeof params.taskDescription !== 'string' || !params.taskDescription.trim()) {
        throw new Error('taskDescription is required and must be a non-empty string');
      }
      if (!params.taskTitle || typeof params.taskTitle !== 'string' || !params.taskTitle.trim()) {
        throw new Error('taskTitle is required and must be a non-empty string');
      }
      if (!params.lang || !['JAVA', 'PYTHON'].includes(params.lang)) {
        throw new Error('lang is required and must be "JAVA" or "PYTHON"');
      }
      if (typeof params.count !== 'number' || params.count < 1) {
        throw new Error('count is required and must be a positive number');
      }
      break;
    default:
      throw new Error(`Unknown AI mode: ${mode}`);
  }
}
function validateResultBeforeSave(mode: AIMode, result: any): void {
  switch (mode) {
    case 'generateTask':
      if (!result.title || !result.practicalTask || !result.codeTemplate) {
        throw new Error('Generated task is missing required fields');
      }
      if (!result.examples || !Array.isArray(result.examples) || result.examples.length === 0) {
        throw new Error('Generated task must have at least one example');
      }
      break;
    case 'generateTheory':
      if (!result.theory || typeof result.theory !== 'string' || !result.theory.trim()) {
        throw new Error('Generated theory is empty or invalid');
      }
      break;
    case 'generateQuiz':
      if (!result.quizJson) {
        throw new Error('Generated quiz is missing quizJson');
      }
      let quiz: any;
      try {
        quiz = JSON.parse(result.quizJson);
      } catch (e) {
        throw new Error('Generated quiz JSON is invalid');
      }
      if (!Array.isArray(quiz) || quiz.length === 0) {
        throw new Error('Generated quiz is empty');
      }
      break;
    case 'generateTaskCondition':
      if (!result.description || typeof result.description !== 'string' || !result.description.trim()) {
        throw new Error('Generated task condition is empty or invalid');
      }
      break;
    case 'generateTaskTemplate':
      if (!result.template || typeof result.template !== 'string' || !result.template.trim()) {
        throw new Error('Generated task template is empty or invalid');
      }
      break;
    case 'generateTestData':
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error('Generated test data is empty');
      }
      for (const test of result) {
        if (typeof test?.input !== 'string') {
          throw new Error('Generated test data contains invalid entries: input must be a string');
        }
        if (typeof test?.output !== 'string' || !test.output.trim()) {
          throw new Error('Generated test data contains invalid entries: output must be a non-empty string');
        }
      }
      break;
  }
}
export async function safeAICall<T = any>(mode: AIMode, params: any, options?: {
  expectedCount?: number;
  logRawResponse?: boolean;
  language?: "uk" | "en";
  requestId?: string;
}): Promise<{
  success: true;
  data: T;
} | {
  success: false;
  error: AIError;
}> {
  try {
    const sanitizedParams = sanitizeParams(mode, params);
    validateInputParams(mode, sanitizedParams);

    if (isCircuitOpen(mode)) {
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: Temporarily unavailable (circuit open)',
          error: 'Circuit breaker is open due to recent AI provider failures',
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }

    const orchestrator = getLLMOrchestrator();
    const language: "uk" | "en" = options?.language === "en" ? "en" : "uk";
    let result: any;
    const startedAt = getNowMs();
    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        switch (mode) {
          case 'generateTask':
            result = await orchestrator.generateTaskWithAI({
              ...sanitizedParams,
              language
            });
            result = AIResponseValidator.validateGenerateTask(result);
            break;
          case 'generateTheory':
            result = await orchestrator.generateTheoryWithAI({
              ...sanitizedParams,
              language
            });
            result = AIResponseValidator.validateGenerateTheory(result);
            break;
          case 'generateQuiz':
            result = await orchestrator.generateQuizWithAI({
              ...sanitizedParams,
              language
            });
            const expectedCount = options?.expectedCount || sanitizedParams.count || 12;
            result = AIResponseValidator.validateGenerateQuiz(result, expectedCount);
            break;
          case 'generateTaskCondition':
            result = await orchestrator.generateTaskCondition({
              ...sanitizedParams,
              userLanguage: language
            });
            result = AIResponseValidator.validateGenerateTaskCondition(result);
            break;
          case 'generateTaskTemplate':
            result = await orchestrator.generateTaskTemplate({
              ...sanitizedParams,
              userLanguage: language
            });
            result = AIResponseValidator.validateGenerateTaskTemplate(result);
            break;
          case 'generateTestData':
            result = await orchestrator.generateTestDataWithAI({
              ...sanitizedParams,
              language
            });
            const expectedTestCount = options?.expectedCount || sanitizedParams.count || 12;
            result = AIResponseValidator.validateGenerateTestData(result, expectedTestCount);
            break;
          default:
            throw new Error(`Unknown AI mode: ${mode}`);
        }
        recordCircuitSuccess(mode);
        break;
      } catch (error: any) {
        if (error instanceof AIValidationError) {
          console.error(`[safeAICall] Validation failed for ${mode}:`, error.message);
          if (options?.logRawResponse && error.rawResponse) {
            console.error(`[safeAICall] Raw AI response:`, error.rawResponse);
          }
          return {
            success: false,
            error: {
              statusCode: 400,
              message: 'AI_GENERATION_FAILED: Invalid response structure',
              error: error.message,
              details: {
                mode,
                requestId: options?.requestId || null,
                validationError: error.message
              }
            }
          };
        }

        const errorMessage = error?.message || String(error);
        const statusCode = classifyAIProviderStatus(errorMessage);
        const retryable = statusCode === 429 || statusCode === 503 || statusCode === 504;
        const canRetry = attempt < maxAttempts && retryable;

        console.error(`[safeAICall] AI provider error for ${mode} (attempt ${attempt}/${maxAttempts}):`, errorMessage);
        recordCircuitFailure(mode);

        if (canRetry) {
          const backoff = Math.min(2500, 250 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 150);
          await sleep(backoff);
          continue;
        }

        return {
          success: false,
          error: {
            statusCode,
            message: 'AI_GENERATION_FAILED: AI provider error',
            error: errorMessage,
            details: {
              mode,
              requestId: options?.requestId || null,
              attempt,
              elapsedMs: getNowMs() - startedAt
            }
          }
        };
      }
    }

    if (result === undefined) {
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: AI provider error',
          error: 'No result',
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }

    if (result && typeof result === 'object' && 'error' in result && result.error) {
      console.error(`[safeAICall] AI returned error for ${mode}:`, result.error);
      return {
        success: false,
        error: {
          statusCode: 503,
          message: 'AI_GENERATION_FAILED: AI returned error',
          error: String(result.error),
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }
    try {
      validateResultBeforeSave(mode, result);
    } catch (validationError: any) {
      console.error(`[safeAICall] Pre-save validation failed for ${mode}:`, validationError.message);
      return {
        success: false,
        error: {
          statusCode: 400,
          message: 'AI_GENERATION_FAILED: Generated data is invalid',
          error: validationError.message,
          details: {
            mode,
            requestId: options?.requestId || null
          }
        }
      };
    }
    return {
      success: true,
      data: result as T
    };
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    console.error(`[safeAICall] Unexpected error for ${mode}:`, errorMessage);
    let statusCode = 400;
    if (errorMessage.includes('AI_GENERATION_FAILED') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
      statusCode = classifyAIProviderStatus(errorMessage);
    }
    return {
      success: false,
      error: {
        statusCode,
        message: errorMessage.includes('required') || errorMessage.includes('must be') ? `Invalid input: ${errorMessage}` : 'AI_GENERATION_FAILED: Unexpected error',
        error: errorMessage,
        details: {
          mode,
          requestId: options?.requestId || null
        }
      }
    };
  }
}
export function sendAIError(res: Response, error: AIError): void {
  res.status(error.statusCode).json({
    message: error.message,
    error: error.error,
    ...(error.details && {
      details: error.details
    })
  });
}