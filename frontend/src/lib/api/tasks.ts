import { api } from "./client";
import type { Task } from "../../types";

export type CodeFile = { path: string; content: string };
type CodeOrFiles = string | { code?: string; files?: CodeFile[] };
type SubmitBinding = { clientSubmissionId?: string; codeHash?: string };

function toPayload(input: CodeOrFiles): { code?: string; files?: CodeFile[] } {
  if (typeof input === "string") return { code: input };
  return { code: input.code, files: input.files };
}

export type PersonalTaskTestResult = {
  testId: number;
  passed: boolean;
  input?: string;
  expectedOutput?: string;
  actualOutput?: string;
  error?: string | null;
  verdict?: string | null;
  errorKind?: string | null;
};

export type PersonalTaskGrade = {
  id?: number;
  gradingMode?: "TESTS" | "AI";
  total?: number;
  workScore?: number;
  optimizationScore?: number;
  integrityScore?: number;
  aiFeedback?: string;
  comparisonFeedback?: string | null;
  previousGrade?: number | null;
  testsPassed?: number;
  testsTotal?: number;
  score?: number;
  maxScore?: number;
  groupScores?: Array<{
    group: string;
    score: number;
    maxScore: number;
  }>;
  testResults?: PersonalTaskTestResult[];
  hints?: string[];
  createdAt?: string;
};

export type LearningFirstFailure = {
  testPublicIndex: number;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  errorKind: string;
};

export type LearningFeedback = {
  verdict?: string | null;
  firstFailure?: LearningFirstFailure | null;
};

export type SubmitTaskResponse = {
  grade?: PersonalTaskGrade;
  learningFeedback?: LearningFeedback;
  submissionMeta?: {
    submissionId: string;
    clientSubmissionId?: string | null;
    codeHash: string;
  };
  milestone?: any;
  status?: string;
  message?: string;
};
function requireToken(): string {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }
  return token;
}
export async function listTasks(): Promise<Task[]> {
  requireToken();
  const res = await api.get("/tasks");
  const data: any = res.data;
  if (Array.isArray(data)) return data as Task[];
  if (data && Array.isArray(data.tasks)) return data.tasks as Task[];
  throw new Error("Невірна відповідь API для списку завдань. Перевір проксі /api/* у Nginx.");
}
export async function getTask(id: number): Promise<Task> {
  const res = await api.get(`/tasks/${id}`);
  return res.data as Task;
}
export async function generateTask(): Promise<any> {
  requireToken();
  try {
    const res = await api.post("/tasks/generate", {});
    return res.data;
  } catch (error: any) {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      throw new Error("Сесія закінчилась. Будь ласка, увійдіть в систему знову.");
    }
    throw error;
  }
}
export async function resetTopic(topicId: number): Promise<void> {
  await api.post("/tasks/reset-topic", {
    topicId
  });
}
export async function saveDraft(id: number, codeOrFiles: CodeOrFiles): Promise<void> {
  await api.post(`/tasks/${id}/save-draft`, toPayload(codeOrFiles));
}
export async function submitTask(id: number, codeOrFiles: CodeOrFiles, binding?: SubmitBinding): Promise<SubmitTaskResponse> {
  const payload = { ...toPayload(codeOrFiles), ...(binding ?? {}) };
  if (!payload.code && (!Array.isArray(payload.files) || payload.files.length === 0)) {
    throw new Error("Code or files are required");
  }
  const res = await api.post(`/tasks/${id}/submit`, payload);
  return res.data as SubmitTaskResponse;
}
export async function submitTaskWithMode(id: number, codeOrFiles: CodeOrFiles, mode: "TESTS" | "AI", binding?: SubmitBinding): Promise<SubmitTaskResponse> {
  const payload = { ...toPayload(codeOrFiles), mode, ...(binding ?? {}) };
  if (!payload.code && (!Array.isArray(payload.files) || payload.files.length === 0)) {
    throw new Error("Code or files are required");
  }
  const res = await api.post(`/tasks/${id}/submit`, payload);
  return res.data as SubmitTaskResponse;
}
export async function runTask(id: number, codeOrFiles: CodeOrFiles, input?: string): Promise<{
  output: string;
  stderr?: string;
  success?: boolean;
}> {
  const payload = { ...toPayload(codeOrFiles), input };
  const res = await api.post(`/tasks/${id}/run`, payload);
  return res.data as {
    output: string;
    stderr?: string;
  };
}