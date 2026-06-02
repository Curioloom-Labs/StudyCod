import { api } from "./client";

// --- Skill tree ---
export type SkillNodeStatus = "locked" | "available" | "in_progress" | "mastered";
export interface SkillNode {
  id: number;
  title: string;
  order: number;
  status: SkillNodeStatus;
  masteryPct: number;
  prerequisites: number[];
  isNext: boolean;
}
export interface SkillTree {
  nodes: SkillNode[];
  edges: Array<{ from: number; to: number }>;
  nextNodeId: number | null;
}
export async function getMySkillTree(): Promise<SkillTree> {
  const res = await api.get("/edu/my/skill-tree");
  return res.data as SkillTree;
}

// --- Daily challenge ---
export interface DailyChallenge {
  available: boolean;
  date?: string;
  task?: { id: number; title: string; difficulty: string | null; problemCode: string | null; slug: string | null; section: string | null };
}
export async function getDailyChallenge(lang?: string): Promise<DailyChallenge> {
  const res = await api.get("/library/daily-challenge", { params: lang ? { lang } : undefined });
  return res.data as DailyChallenge;
}

// --- Concepts due (spaced repetition) ---
export interface ConceptDue {
  conceptKey: string;
  state: { repetitions: number; easeFactor: number; intervalDays: number; dueAtMs: number; mastered: boolean };
}
export async function getConceptsDue(): Promise<{ now: number; total: number; due: ConceptDue[] }> {
  const res = await api.get("/tasks/concepts/due");
  return res.data as { now: number; total: number; due: ConceptDue[] };
}

// --- Progress report PDF ---
export async function downloadProgressReport(): Promise<Blob> {
  const res = await api.get("/edu/my/progress-report.pdf", { responseType: "blob" });
  return res.data as Blob;
}

// --- Contest scoreboard ---
export interface ScoreboardProblemCell {
  solved: boolean;
  tries: number;
  penaltyMinutes: number;
  firstAcMs: number | null;
}
export interface ScoreboardRow {
  rank: number;
  participantId: number;
  solved: number;
  penalty: number;
  lastAcMs: number | null;
  problems: Record<number, ScoreboardProblemCell>;
}
export interface Scoreboard {
  rows: ScoreboardRow[];
  generatedAtMs: number;
  startMs: number;
  endsAtMs: number | null;
  participants: Record<number, string>;
  problems: Record<number, string>;
}
export async function getContestScoreboard(contestId: number): Promise<Scoreboard> {
  const res = await api.get(`/contests/${contestId}/scoreboard`);
  return res.data as Scoreboard;
}

// --- Solve replay ---
export type ReplaySnapshot = { tMs: number; code: string };
export interface SolveReplaySession {
  id: number;
  taskKind: string;
  taskId: number | null;
  language: string | null;
  durationMs: number;
  finalVerdict: string | null;
  createdAt: string;
  snapshots: ReplaySnapshot[];
}
export async function getSolveReplay(id: number): Promise<SolveReplaySession> {
  const res = await api.get(`/tasks/solve-replay/${id}`);
  return res.data as SolveReplaySession;
}
export async function saveSolveReplay(payload: {
  snapshots: ReplaySnapshot[];
  taskKind?: "LIBRARY" | "TOPIC" | "CONTEST" | "PLAYGROUND";
  taskId?: number;
  language?: string;
  durationMs?: number;
  finalVerdict?: string;
}): Promise<{ id: number; snapshotCount: number }> {
  const res = await api.post("/tasks/solve-replay", payload);
  return res.data as { id: number; snapshotCount: number };
}
