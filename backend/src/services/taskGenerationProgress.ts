import { getLiveState, setLiveState } from "./edu/liveStateStore";

export type TaskGenerationProgressPhase =
  | "requesting"
  | "context"
  | "condition"
  | "tests"
  | "saving"
  | "ready"
  | "error";

export type TaskGenerationProgress = {
  status: "running" | "ready" | "error";
  phase: TaskGenerationProgressPhase;
  progress: number;
  message: string;
  updatedAt: string;
};

function progressKey(userId: number, generationId: string): string {
  return `${userId}:${generationId}`;
}

export async function setTaskGenerationProgress(params: {
  userId: number;
  generationId?: string | null;
  status?: TaskGenerationProgress["status"];
  phase: TaskGenerationProgressPhase;
  progress: number;
  message: string;
}): Promise<void> {
  const generationId = String(params.generationId ?? "").trim();
  if (!generationId) return;

  const value: TaskGenerationProgress = {
    status: params.status ?? (params.phase === "ready" ? "ready" : params.phase === "error" ? "error" : "running"),
    phase: params.phase,
    progress: Math.max(0, Math.min(100, Math.round(params.progress))),
    message: String(params.message ?? "").trim(),
    updatedAt: new Date().toISOString(),
  };

  await setLiveState("task-generation", progressKey(params.userId, generationId), value, 180, {
    maxEntries: 500,
  });
}

export async function getTaskGenerationProgress(params: {
  userId: number;
  generationId: string;
}): Promise<TaskGenerationProgress | null> {
  return getLiveState<TaskGenerationProgress>(
    "task-generation",
    progressKey(params.userId, String(params.generationId ?? "").trim()),
  );
}
