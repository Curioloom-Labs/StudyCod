import { api } from "./client";

export type PlaygroundLanguage = "JAVA" | "PYTHON" | "CPP";

export type PlaygroundRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
};

export async function runPlayground(payload: { language: PlaygroundLanguage; code: string; stdin?: string }): Promise<PlaygroundRunResult> {
  const res = await api.post("/playground/run", payload);
  return res.data as PlaygroundRunResult;
}

export type TraceStep = { line: number; locals: Record<string, unknown> };
export type TraceResult = {
  ok: boolean;
  steps: TraceStep[];
  truncated: boolean;
  programOutput: string;
  stderr: string;
};

export async function tracePlayground(payload: { code: string; stdin?: string; maxSteps?: number }): Promise<TraceResult> {
  const res = await api.post("/playground/trace", { ...payload, language: "PYTHON" });
  return res.data as TraceResult;
}

export async function savePlaygroundSnippet(payload: { language: PlaygroundLanguage; code: string; stdin?: string; title?: string }): Promise<{ shareId: string }> {
  const res = await api.post("/playground/snippets", payload);
  return res.data as { shareId: string };
}

export type PlaygroundSnippet = {
  shareId: string;
  language: PlaygroundLanguage;
  code: string;
  stdin: string;
  title: string | null;
  createdAt: string;
};

export async function getPlaygroundSnippet(shareId: string): Promise<PlaygroundSnippet> {
  const res = await api.get(`/playground/snippets/${encodeURIComponent(shareId)}`);
  return res.data as PlaygroundSnippet;
}
