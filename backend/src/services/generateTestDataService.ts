import { getLLMOrchestrator } from "./llm/LLMOrchestrator";
export interface TestDataExample {
  input: string;
  output: string;
  explanation?: string;
}
export async function generateTestDataWithAI(params: {
  taskDescription: string;
  taskTitle: string;
  lang: "JAVA" | "PYTHON";
  count: number;
  userId?: number;
}): Promise<TestDataExample[]> {
  const orchestrator = getLLMOrchestrator();
  return orchestrator.generateTestDataWithAI(params);
}