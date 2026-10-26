import { api } from "./client";
import type { GrowthFile, GrowthRuntime } from "./growthProjects";

export type TalentKit = {
  title: string; kind: "HR" | "TECHNICAL"; runtime: GrowthRuntime; durationMinutes: number;
  agenda: string[]; prompt: string; questions: string[]; files: GrowthFile[];
  tests: Array<{ input: string; output: string; hidden: boolean; group: string }>;
  quiz: Array<{ id: string; text: string; options: string[]; correctIndex: number }>;
  rubric: string[];
};
export type TalentKitItem = { id: string; kit: TalentKit; builtIn: boolean };
export type InterviewSummary = { id: string; company_id: string; company_name: string; assessment_id: string; title: string; status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED"; scheduled_at: string; duration_minutes: number; candidate_name: string; candidate_id: number; host_name: string; my_role: string; consent_status: string };
export type InterviewNote = { revision: number; privateText: string; scores: Array<number | null>; feedback: string; practice: string; releasedAt?: string | null };
export type InterviewExecution = { id: string; state: string; kind: "RUN" | "CHECK"; revision: number; result?: Record<string, any> | null; errorCode?: string | null };
export type InterviewMessage = { id: string | number; user_id: number; username: string; message_text: string; created_at: string };
export type TalentInterview = {
  id: string; companyId: string; companyName: string; assessmentId: string; candidateId: number; candidateName: string;
  hostId: number; hostName: string; title: string; status: InterviewSummary["status"]; phase: string; scheduledAt: string;
  durationMinutes: number; startedAt?: string | null; completedAt?: string | null; runtime: GrowthRuntime;
  role: "OWNER" | "HR" | "ENGINEER" | "CANDIDATE"; userId: number; canHost: boolean; consented: boolean;
  editorUserId: number; revision: number; sourceVersionId?: string | null; canEdit: boolean; canRun: boolean; files?: GrowthFile[];
  mediaEnabled: boolean; documentationAllowed: boolean; builtInAi: boolean; recording: boolean;
  kit: Omit<TalentKit, "tests" | "files" | "quiz"> & { examples: Array<{ input: string; output: string }>; quiz: Array<{ id: string; text: string; options: string[] }>; testCount: number };
  participants: Array<{ id: number; username: string; role: string }>;
};
export type InterviewDetails = { interview: TalentInterview; ownNote: InterviewNote | null; feedback: Array<{ text: string; practice: string; reviewer: string; publishedAt: string }>; quizResult: { correct: number; total: number; submittedAt?: string; answers?: Record<string, number> } | null; executions: InterviewExecution[] };

export const getTalentInterviews = async (companyId?: string) => (await api.get("/talent/interviews", { params: { companyId } })).data as { interviews: InterviewSummary[]; mediaEnabled: boolean };
export const getTalentKits = async (companyId: string) => (await api.get("/talent/kits", { params: { companyId } })).data.kits as TalentKitItem[];
export const saveTalentKit = async (companyId: string, kit: TalentKit) => (await api.post(`/talent/companies/${companyId}/kits`, { kit })).data as { id: string };
export const scheduleTalentInterview = async (companyId: string, payload: { candidateUsername?: string; assessmentId?: string; kitId: string; title: string; scheduledAt: string; durationMinutes: number; interviewerIds: number[]; useSelectedProject: boolean; idempotencyKey: string }) => (await api.post(`/talent/companies/${companyId}/interviews`, payload)).data as { id: string; assessmentId?: string };
export const getTalentInterview = async (id: string) => (await api.get(`/talent/interviews/${id}`)).data as InterviewDetails;
export const getTalentInterviewState = async (id: string, revision: number, chatAfter: string) => (await api.get(`/talent/interviews/${id}/state`, { params: { revision, chatAfter } })).data as { interview: Partial<TalentInterview>; messages: InterviewMessage[]; execution: InterviewExecution | null };
export const respondTalentInterview = async (id: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/talent/interviews/${id}/respond`, { decision, consent: decision === "ACCEPT" })).data;
export const startTalentInterview = async (id: string) => (await api.post(`/talent/interviews/${id}/start`)).data;
export const cancelTalentInterview = async (id: string) => (await api.post(`/talent/interviews/${id}/cancel`)).data;
export const joinTalentInterviewCall = async (id: string) => (await api.post(`/talent/interviews/${id}/join`)).data as { token: string; url: string; identity: string };
export const saveTalentInterviewDraft = async (id: string, files: GrowthFile[], expectedRevision: number) => (await api.put(`/talent/interviews/${id}/draft`, { files, expectedRevision })).data as { revision: number };
export const controlTalentInterview = async (id: string, editorUserId: number, expectedRevision: number) => (await api.post(`/talent/interviews/${id}/control`, { editorUserId, expectedRevision })).data;
export const phaseTalentInterview = async (id: string, phase: string) => (await api.post(`/talent/interviews/${id}/phase`, { phase })).data;
export const sendTalentInterviewMessage = async (id: string, text: string, clientKey: string) => (await api.post(`/talent/interviews/${id}/messages`, { text, clientKey })).data;
export const submitTalentInterviewQuiz = async (id: string, answers: Record<string, number>) => (await api.post(`/talent/interviews/${id}/quiz`, { answers })).data as { result: { correct: number; total: number } };
export const saveTalentInterviewNote = async (id: string, note: InterviewNote) => (await api.put(`/talent/interviews/${id}/notes`, { ...note, expectedRevision: note.revision })).data as { revision: number };
export const releaseTalentInterviewFeedback = async (id: string, expectedRevision: number) => (await api.post(`/talent/interviews/${id}/release-feedback`, { expectedRevision })).data;
export const executeTalentInterview = async (id: string, kind: "RUN" | "CHECK", input: string, expectedRevision: number, idempotencyKey: string) => (await api.post(`/talent/interviews/${id}/executions`, { kind, input, expectedRevision, idempotencyKey })).data as { jobId: string; state: string };
export const cancelTalentInterviewExecution = async (id: string, jobId: string) => (await api.post(`/talent/interviews/${id}/executions/${jobId}/cancel`)).data;
export const endTalentInterview = async (id: string, expectedRevision: number) => (await api.post(`/talent/interviews/${id}/end`, { expectedRevision })).data;
export async function downloadTalentInterviewCalendar(id: string) {
  const response = await api.get(`/talent/interviews/${id}/calendar`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = "studycod-interview.ics"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
