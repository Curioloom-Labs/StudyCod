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

function classifyAIProviderStatus(errorMessage: string): number {
  const msg = (errorMessage || '').toLowerCase();
  // Prefer not to return 502 from app code: many reverse proxies intercept 502 and hide body.
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
}): Promise<{
  success: true;
  data: T;
} | {
  success: false;
  error: AIError;
}> {
  try {
    validateInputParams(mode, params);
    const orchestrator = getLLMOrchestrator();
    const language: "uk" | "en" = options?.language === "en" ? "en" : "uk";
    let result: any;
    try {
      switch (mode) {
        case 'generateTask':
          result = await orchestrator.generateTaskWithAI({
            ...params,
            language
          });
          result = AIResponseValidator.validateGenerateTask(result);
          break;
        case 'generateTheory':
          result = await orchestrator.generateTheoryWithAI({
            ...params,
            language
          });
          result = AIResponseValidator.validateGenerateTheory(result);
          break;
        case 'generateQuiz':
          result = await orchestrator.generateQuizWithAI({
            ...params,
            language
          });
          const expectedCount = options?.expectedCount || params.count || 12;
          result = AIResponseValidator.validateGenerateQuiz(result, expectedCount);
          break;
        case 'generateTaskCondition':
          result = await orchestrator.generateTaskCondition({
            ...params,
            userLanguage: language
          });
          result = AIResponseValidator.validateGenerateTaskCondition(result);
          break;
        case 'generateTaskTemplate':
          result = await orchestrator.generateTaskTemplate({
            ...params,
            userLanguage: language
          });
          result = AIResponseValidator.validateGenerateTaskTemplate(result);
          break;
        case 'generateTestData':
          result = await orchestrator.generateTestDataWithAI({
            ...params,
            language
          });
          const expectedTestCount = options?.expectedCount || params.count || 12;
          result = AIResponseValidator.validateGenerateTestData(result, expectedTestCount);
          break;
        default:
          throw new Error(`Unknown AI mode: ${mode}`);
      }
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
              validationError: error.message
            }
          }
        };
      }
      const errorMessage = error.message || String(error);
      console.error(`[safeAICall] AI provider error for ${mode}:`, errorMessage);
      return {
        success: false,
        error: {
          statusCode: classifyAIProviderStatus(errorMessage),
          message: 'AI_GENERATION_FAILED: AI provider error',
          error: errorMessage,
          details: {
            mode
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
            mode
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
            mode
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
          mode
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