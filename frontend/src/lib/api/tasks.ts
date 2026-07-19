import { api } from "./client";
import type { Task } from "../../types";

export type CodeFile = { path: string; content: string };
export type WebTaskFile = { path: "index.html" | "styles.css" | "script.js"; content: string };
export type WebTaskRule = {
  id?: string;
  type: "required_selector" | "forbidden_selector" | "required_text" | "forbidden_text" | "required_script_pattern" | "forbidden_script_pattern";
  message?: string;
  points?: number;
  selector?: string;
  text?: string;
  pattern?: string;
  flags?: string;
};
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
  aiUnavailableFallback?: boolean;
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

export type LearningAttemptSummary = {
  id: number;
  outcome: "SOLVED" | "FAILED" | string;
  failureCategory?: string | null;
  firstFailedTestId?: number | null;
  highestHintLevelShown?: number;
  solvedAfterFailure?: boolean;
};

export type SubmitTaskResponse = {
  grade?: PersonalTaskGrade;
  learningFeedback?: LearningFeedback;
  learningAttempt?: LearningAttemptSummary | null;
  submissionMeta?: {
    submissionId: string;
    clientSubmissionId?: string | null;
    codeHash: string;
  };
  milestone?: unknown;
  status?: string;
  message?: string;
};

export type UiLanguage = "uk" | "en";

export type PersonalControlQuizQuestion = {
  index: number;
  question: string;
  options: Record<string, string>;
};

export type PersonalControlQuizPayload = {
  taskId: number;
  title: string;
  count: number;
  questions: PersonalControlQuizQuestion[];
  submitted?: boolean;
  submittedGrade?: {
    total: number;
    correctAnswers: number;
    totalQuestions: number;
  } | null;
  submittedReview?: PersonalControlQuizSubmitResponse["review"] | null;
};

export type PersonalControlQuizSubmitResponse = {
  message: "QUIZ_SUBMITTED" | string;
  grade?: {
    id?: number;
    total: number;
    correctAnswers: number;
    totalQuestions: number;
  };
  review?: {
    version: number;
    correctAnswers: number;
    totalQuestions: number;
    questions: Array<{
      index: number;
      question: string;
      options: Record<string, string>;
      correct: string;
      student: string | null;
      isCorrect: boolean;
    }>;
  };
  summary?: {
    quizGrade: number | null;
    practiceAvg: number | null;
    practiceAdjusted: number | null;
    finalGrade: number | null;
    passed: boolean;
    passGrade: number;
    maxGrade: number;
  } | null;
};

function requireToken(): string {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("UNAUTHORIZED");
  }
  return token;
}
export async function listTasks(uiLang?: UiLanguage): Promise<Task[]> {
  requireToken();
  const res = await api.get("/tasks", {
    params: uiLang ? { uiLang } : undefined
  });
  const data: unknown = res.data;
  if (Array.isArray(data)) return data as Task[];
  if (data && typeof data === "object" && Array.isArray((data as { tasks?: unknown }).tasks)) {
    return (data as { tasks: Task[] }).tasks;
  }
  throw new Error("Невірна відповідь API для списку завдань. Перевір проксі /api/* у Nginx.");
}
export async function getTask(id: number, uiLang?: UiLanguage): Promise<Task> {
  const res = await api.get(`/tasks/${id}`, {
    params: uiLang ? { uiLang } : undefined
  });
  return res.data as Task;
}
export async function generateTask(language?: UiLanguage, options?: { forceControl?: boolean }): Promise<unknown> {
  requireToken();
  try {
    const res = await api.post("/tasks/generate", {
      ...(language ? { language } : {}),
      ...(options?.forceControl ? { forceControl: true } : {})
    });
    return res.data;
  } catch (error: unknown) {
    const response = error && typeof error === "object" ? Reflect.get(error, "response") : null;
    const status = response && typeof response === "object" ? Reflect.get(response, "status") : null;
    if (status === 401) {
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

export type ExplainErrorFailure = {
  testId?: number;
  input?: string;
  expected?: string;
  actual?: string;
  verdict?: string | null;
  stderr?: string | null;
};

export type ExplainErrorPayload = {
  // Judge language hint (free-form, e.g. "PYTHON", "GO"). Backend treats unknown values generically.
  language: string;
  code: string;
  verdict?: string | null;
  stderr?: string | null;
  taskTitle?: string;
  taskText?: string;
  failures?: ExplainErrorFailure[];
};

export async function explainTaskError(payload: ExplainErrorPayload): Promise<{ explanation: string; source: "ai" | "deterministic" }> {
  const res = await api.post("/tasks/explain-error", payload);
  return res.data as { explanation: string; source: "ai" | "deterministic" };
}

export type DebugChatMessage = { role: "student" | "mentor"; content: string };
export type DebugChatPayload = ExplainErrorPayload & { messages: DebugChatMessage[] };

export async function debugChat(payload: DebugChatPayload): Promise<{ reply: string; source: "ai" | "deterministic" }> {
  const res = await api.post("/tasks/debug-chat", payload);
  return res.data as { reply: string; source: "ai" | "deterministic" };
}

export type ProctoringSignals = {
  finalCodeLength: number;
  totalPastedChars?: number;
  largestPasteChars?: number;
  pasteCount?: number;
  blurCount?: number;
  typedChars?: number;
  solveDurationMs?: number;
  /** Optional task context so the score is persisted for teacher review. */
  taskKind?: "LIBRARY" | "TOPIC" | "CONTEST";
  taskId?: number;
};

export async function scoreProctoring(signals: ProctoringSignals): Promise<{ score: number; level: "clean" | "review" | "suspicious"; flags: string[] }> {
  const res = await api.post("/tasks/proctoring-score", signals);
  return res.data as { score: number; level: "clean" | "review" | "suspicious"; flags: string[] };
}

export type ConceptReviewOutcome = { solved: boolean; attempts?: number; hintsUsed?: number; testsPassedRatio?: number };

export async function recordConceptReview(payload: { conceptKey: string; outcome?: ConceptReviewOutcome; grade?: number }): Promise<{
  conceptKey: string;
  grade: number;
  state: { repetitions: number; easeFactor: number; intervalDays: number; dueAtMs: number; mastered: boolean };
}> {
  const res = await api.post("/tasks/concept-review", payload);
  return res.data;
}

export async function getWebTaskTemplate(id: number): Promise<{ taskId: number; taskMode: "WEB"; files: WebTaskFile[]; rules: WebTaskRule[] }> {
  const res = await api.get(`/tasks/${id}/web-template`);
  return res.data;
}

export async function saveWebTaskDraft(id: number, files: WebTaskFile[]): Promise<{ ok: boolean; updatedAt?: string }> {
  const res = await api.put(`/tasks/${id}/web-draft`, { files });
  return res.data;
}

export async function checkWebTask(id: number, files: WebTaskFile[]): Promise<{
  taskMode: "WEB";
  passed: boolean;
  score: number;
  maxScore: number;
  passedRules: number;
  totalRules: number;
  results: Array<{ id: string; type: WebTaskRule["type"]; passed: boolean; message: string; points: number; earnedPoints: number }>;
}> {
  const res = await api.post(`/tasks/${id}/web-check`, { files });
  return res.data;
}

export async function submitWebTask(id: number, files: WebTaskFile[]): Promise<SubmitTaskResponse> {
  const res = await api.post(`/tasks/${id}/web-submit`, { files });
  return res.data as SubmitTaskResponse;
}

export async function getPersonalControlQuiz(id: number): Promise<PersonalControlQuizPayload> {
  const res = await api.get(`/tasks/${id}/quiz`);
  return res.data as PersonalControlQuizPayload;
}

export async function submitPersonalControlQuiz(id: number, answers: string[]): Promise<PersonalControlQuizSubmitResponse> {
  const res = await api.post(`/tasks/${id}/submit-quiz`, { answers });
  return res.data as PersonalControlQuizSubmitResponse;
}
