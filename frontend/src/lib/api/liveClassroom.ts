import { api } from "./client";

export type LiveRole = "host" | "participant";

export interface LiveSession {
  id: number;
  classId: number | null;
  lessonId: number | null;
  title: string | null;
  status: string;
  roomName: string;
  createdAt: string | null;
  endedAt: string | null;
}

export interface LiveJoinInfo {
  session: LiveSession;
  token: string;
  url: string;
  identity: string;
  room: string;
  role: LiveRole;
}

export interface ActiveLiveSessionResponse {
  session: LiveSession | null;
  enabled: boolean;
}

export async function getActiveLiveSession(classId: number): Promise<ActiveLiveSessionResponse> {
  const res = await api.get(`/edu/classes/${classId}/live-sessions/active`);
  return res.data;
}

export async function startLiveSession(classId: number, lessonId?: number): Promise<LiveJoinInfo> {
  const res = await api.post(`/edu/classes/${classId}/live-sessions`, lessonId ? { lessonId } : {});
  return res.data;
}

export async function joinLiveSession(sessionId: number): Promise<LiveJoinInfo> {
  const res = await api.post(`/edu/live-sessions/${sessionId}/join`);
  return res.data;
}

export async function endLiveSession(sessionId: number): Promise<{ session: LiveSession }> {
  const res = await api.post(`/edu/live-sessions/${sessionId}/end`);
  return res.data;
}

export type LiveCodeStatus = "not_started" | "in_progress" | "stuck" | "passed";

export interface LiveOverviewStudent {
  studentId: number;
  name: string;
  status: LiveCodeStatus;
  lastVerdict: string | null;
  testsPassed: number | null;
  testsTotal: number | null;
  lastActivityMs: number | null;
  currentTaskTitle: string | null;
}

export interface LiveOverview {
  totals: Record<LiveCodeStatus, number>;
  students: LiveOverviewStudent[];
  generatedAtMs: number;
}

export async function getClassLiveOverview(classId: number): Promise<LiveOverview> {
  const res = await api.get(`/edu/classes/${classId}/live-overview`);
  return res.data;
}

export interface LiveCodeSnapshot {
  code: string;
  taskId: number;
  taskTitle: string | null;
  updatedAtMs: number;
}

/**
 * Student-side: publish the current editor content. The backend keeps it only
 * while a live lesson is running for the class, so callers can fire-and-forget.
 */
export async function publishLiveCode(taskId: number, code: string, taskTitle?: string | null): Promise<void> {
  await api.post(`/edu/tasks/${taskId}/live-code`, { code, taskTitle: taskTitle ?? null });
}

export async function getStudentLiveCode(classId: number, studentId: number): Promise<LiveCodeSnapshot | null> {
  const res = await api.get(`/edu/classes/${classId}/students/${studentId}/live-code`);
  return res.data?.snapshot ?? null;
}

export interface ChallengeTask {
  id: number;
  title: string;
  lessonTitle: string | null;
}

export interface LiveChallenge {
  id: string;
  taskId: number;
  taskTitle: string;
  startedAtMs: number;
  durationSec: number;
  endsAtMs: number;
  remainingSeconds: number;
}

export interface ChallengeLeaderboardEntry {
  studentId: number;
  name: string;
  passedAtMs: number;
  solveSeconds: number;
}

export interface ChallengeLeaderboard {
  challenge: LiveChallenge | null;
  entries: ChallengeLeaderboardEntry[];
  generatedAtMs: number;
}

export async function listClassPracticeTasks(classId: number): Promise<ChallengeTask[]> {
  const res = await api.get(`/edu/classes/${classId}/practice-tasks`);
  return res.data?.tasks ?? [];
}

export async function startLiveChallenge(classId: number, taskId: number, durationSec: number): Promise<LiveChallenge> {
  const res = await api.post(`/edu/classes/${classId}/live-challenges`, { taskId, durationSec });
  return res.data.challenge;
}

export async function getActiveLiveChallenge(classId: number): Promise<LiveChallenge | null> {
  const res = await api.get(`/edu/classes/${classId}/live-challenges/active`);
  return res.data?.challenge ?? null;
}

export async function getChallengeLeaderboard(classId: number): Promise<ChallengeLeaderboard> {
  const res = await api.get(`/edu/classes/${classId}/live-challenges/leaderboard`);
  return res.data;
}

export async function endLiveChallenge(classId: number): Promise<void> {
  await api.post(`/edu/classes/${classId}/live-challenges/end`);
}

export interface LiveCopilotBriefing {
  headline: string;
  diagnosis: string;
  actions: string[];
  source: "ai" | "rule";
}

export interface LiveCopilotResponse {
  briefing: LiveCopilotBriefing;
  totals: Record<LiveCodeStatus, number>;
  generatedAtMs: number;
}

export async function getLiveCopilot(classId: number): Promise<LiveCopilotResponse> {
  const res = await api.post(`/edu/classes/${classId}/live-copilot`);
  return res.data;
}

// ---- Lesson materials -----------------------------------------------------

export interface LessonBrief {
  id: number;
  title: string;
  type: string;
}

export interface SessionMaterials {
  lessonId: number | null;
  title: string | null;
  theory: string | null;
  hasTheory: boolean;
  tasks: Array<{ id: number; title: string }>;
}

export async function getClassLessonsList(classId: number): Promise<LessonBrief[]> {
  const res = await api.get(`/edu/classes/${classId}/lessons-list`);
  return res.data?.lessons ?? [];
}

export async function setSessionLesson(sessionId: number, lessonId: number | null): Promise<LiveSession> {
  const res = await api.put(`/edu/live-sessions/${sessionId}/lesson`, { lessonId });
  return res.data.session;
}

export async function getSessionMaterials(sessionId: number): Promise<SessionMaterials> {
  const res = await api.get(`/edu/live-sessions/${sessionId}/materials`);
  return res.data;
}

// ---- Breakout rooms -------------------------------------------------------

export interface BreakoutGroupDto {
  index: number;
  students: Array<{ id: number; name: string }>;
}

export interface BreakoutStateDto {
  active: boolean;
  groups: BreakoutGroupDto[];
  myGroupIndex: number | null;
}

export interface BreakoutTokenDto {
  active?: boolean;
  groupIndex?: number;
  token?: string;
  url?: string;
  room?: string;
}

export async function openBreakouts(classId: number, count: number): Promise<{ groups: BreakoutGroupDto[] }> {
  const res = await api.post(`/edu/classes/${classId}/breakouts`, { count });
  return res.data;
}

export async function getBreakouts(classId: number): Promise<BreakoutStateDto> {
  const res = await api.get(`/edu/classes/${classId}/breakouts`);
  return res.data;
}

export async function getMyBreakoutToken(classId: number): Promise<BreakoutTokenDto> {
  const res = await api.get(`/edu/classes/${classId}/breakouts/my-token`);
  return res.data;
}

export async function getTeacherBreakoutToken(classId: number, index: number): Promise<BreakoutTokenDto> {
  const res = await api.post(`/edu/classes/${classId}/breakouts/token/${index}`);
  return res.data;
}

export async function closeBreakouts(classId: number): Promise<void> {
  await api.post(`/edu/classes/${classId}/breakouts/close`);
}
