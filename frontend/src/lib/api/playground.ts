import { api } from "./client";
import type { JudgeLanguage } from "../judgeLanguages";

// The playground runs any judge language. Legacy snippets stored uppercase JAVA/PYTHON/CPP;
// normalize those to the lowercase family ids on load.
export type PlaygroundLanguage = JudgeLanguage;

export function normalizePlaygroundLanguage(raw: unknown): PlaygroundLanguage {
  const s = String(raw ?? "").trim().toLowerCase();
  return (s || "python") as PlaygroundLanguage;
}

export type PlaygroundRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  timeMs?: number | null;
  memoryKb?: number | null;
};

export async function runPlayground(payload: { language: PlaygroundLanguage; compiler?: string; code: string; stdin?: string }): Promise<PlaygroundRunResult> {
  const res = await api.post("/playground/run", payload);
  return res.data as PlaygroundRunResult;
}

export type TraceFrame = { func: string; line: number; locals: Record<string, unknown> };
export type HeapObject = {
  kind: "list" | "tuple" | "set" | "dict" | "object";
  type?: string;
  items?: unknown[];
  entries?: [string, unknown][];
  attrs?: [string, unknown][];
  repr?: string;
};
export type TraceStep = {
  line: number;
  event?: "call" | "line" | "return";
  stack?: TraceFrame[];
  stdoutLen?: number;
  locals: Record<string, unknown>;
  heap?: Record<string, HeapObject>;
};
export type TraceResult = {
  ok: boolean;
  steps: TraceStep[];
  truncated: boolean;
  programOutput: string;
  stderr: string;
};

export async function tracePlayground(payload: { language: PlaygroundLanguage; code: string; stdin?: string; maxSteps?: number }): Promise<TraceResult> {
  const res = await api.post("/playground/trace", payload);
  return res.data as TraceResult;
}

let _vizLangsCache: string[] | null = null;
export async function getVisualizerLanguages(): Promise<string[]> {
  if (_vizLangsCache) return _vizLangsCache;
  try {
    const res = await api.get("/playground/visualizer-languages");
    const langs = Array.isArray(res.data?.languages) ? (res.data.languages as string[]) : [];
    _vizLangsCache = langs;
    return langs;
  } catch {
    return ["python"];
  }
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

export type PlaygroundSnippetSummary = {
  shareId: string;
  language: string;
  title: string | null;
  createdAt: string;
};

export async function getMyPlaygroundSnippets(): Promise<PlaygroundSnippetSummary[]> {
  try {
    const res = await api.get("/playground/snippets");
    return Array.isArray(res.data?.snippets) ? (res.data.snippets as PlaygroundSnippetSummary[]) : [];
  } catch {
    return [];
  }
}

export async function getPlaygroundSnippet(shareId: string): Promise<PlaygroundSnippet> {
  const res = await api.get(`/playground/snippets/${encodeURIComponent(shareId)}`);
  const data = res.data as PlaygroundSnippet;
  return { ...data, language: normalizePlaygroundLanguage((data as any).language) };
}
