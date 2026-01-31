import { getAIClient } from './AIClient';
import { AiTaskGenerationResult, AiTheoryResult, AiQuizResult } from '../llm/LLMOrchestrator';
export async function generateTaskWithAI(params: {
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
}): Promise<AiTaskGenerationResult> {
  const client = getAIClient();
  return client.generateTask(params);
}
export async function generateTheoryWithAI(params: {
  topicTitle: string;
  lang: "JAVA" | "PYTHON";
  taskDescription?: string;
  taskType?: "PRACTICE" | "CONTROL";
  difficulty?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiTheoryResult> {
  const client = getAIClient();
  return client.generateTheory(params);
}
export async function generateQuizWithAI(params: {
  lang: "JAVA" | "PYTHON";
  prevTopics: string;
  count?: number;
  userId?: number;
  topicId?: number;
}): Promise<AiQuizResult> {
  const client = getAIClient();
  return client.generateQuiz(params);
}
export async function generateTaskCondition(params: {
  topicTitle: string;
  taskTitle?: string;
  taskType: "PRACTICE" | "CONTROL";
  difficulty?: number;
  language: "JAVA" | "PYTHON";
  userId?: number;
  topicId?: number;
}): Promise<{
  description: string;
}> {
  const client = getAIClient();
  return client.generateTaskCondition(params);
}
export async function generateTaskTemplate(params: {
  topicTitle: string;
  taskTitle?: string;
  language: "JAVA" | "PYTHON";
  description?: string;
  userId?: number;
  topicId?: number;
}): Promise<{
  template: string;
}> {
  const client = getAIClient();
  return client.generateTaskTemplate(params);
}
export type { AiTaskGenerationResult, AiTheoryResult, AiQuizResult };