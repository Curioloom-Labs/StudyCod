import { api } from "./client";
import type { Task } from "../../types";
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
export async function saveDraft(id: number, code: string): Promise<void> {
  await api.post(`/tasks/${id}/save-draft`, {
    code
  });
}
export async function submitTask(id: number, code: string): Promise<any> {
  const res = await api.post(`/tasks/${id}/submit`, {
    code
  });
  return res.data;
}
export async function submitTaskWithMode(id: number, code: string, mode: "TESTS" | "AI"): Promise<any> {
  const res = await api.post(`/tasks/${id}/submit`, {
    code,
    mode
  });
  return res.data;
}
export async function runTask(id: number, code: string, input?: string): Promise<{
  output: string;
  stderr?: string;
  success?: boolean;
}> {
  const res = await api.post(`/tasks/${id}/run`, {
    code,
    input
  });
  return res.data as {
    output: string;
    stderr?: string;
  };
}