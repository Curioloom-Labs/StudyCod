import { api } from "./client";
import type { GrowthFile } from "./portfolioProjects";
import type { JudgeLanguage } from "../judgeLanguages";

export type AssessRuntime = Uppercase<JudgeLanguage>;

export type AssessKit = {
  title: string; kind: "HR" | "TECHNICAL"; runtime: AssessRuntime; durationMinutes: number;
  agenda: string[]; prompt: string; questions: string[]; files: GrowthFile[];
  tests: Array<{ input: string; output: string; hidden: boolean; group: string }>;
  quiz: Array<{ id: string; text: string; options: string[]; correctIndex: number }>;
  rubric: string[];
};
export type AssessKitItem = { id: string; kit: AssessKit; builtIn: boolean };
export type AssessKitLibrary = { kits: AssessKitItem[]; languages: JudgeLanguage[] };
export type InterviewSummary = { id: string; company_id: string; company_name: string; assessment_id: string; title: string; status: "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED"; scheduled_at: string; duration_minutes: number; candidate_name: string; candidate_id: number; host_name: string; my_role: string; consent_status: string };
export type InterviewNote = { revision: number; privateText: string; scores: Array<number | null>; feedback: string; practice: string; releasedAt?: string | null; allowPublicPortfolio?: boolean };
export type InterviewExecution = { id: string; state: string; kind: "RUN" | "CHECK"; revision: number; result?: Record<string, any> | null; errorCode?: string | null };
export type InterviewMessage = { id: string | number; user_id: number; username: string; message_text: string; created_at: string };
export type AssessInterview = {
  id: string; companyId: string; companyName: string; assessmentId: string; candidateId: number; candidateName: string;
  hostId: number; hostName: string; title: string; status: InterviewSummary["status"]; phase: string; scheduledAt: string;
  durationMinutes: number; startedAt?: string | null; completedAt?: string | null; runtime: AssessRuntime;
  role: "OWNER" | "HR" | "ENGINEER" | "CANDIDATE"; userId: number; canHost: boolean; consented: boolean;
  editorUserId: number; revision: number; sourceVersionId?: string | null; canEdit: boolean; canRun: boolean; files?: GrowthFile[];
  mediaEnabled: boolean; documentationAllowed: boolean; builtInAi: boolean; recording: boolean;
  kit: Omit<AssessKit, "tests" | "files" | "quiz"> & { examples: Array<{ input: string; output: string }>; quiz: Array<{ id: string; text: string; options: string[] }>; testCount: number };
  participants: Array<{ id: number; username: string; role: string }>;
};
export type InterviewDetails = { interview: AssessInterview; ownNote: InterviewNote | null; feedback: Array<{ text: string; practice: string; reviewer: string; publishedAt: string; allowPublicPortfolio?: boolean }>; quizResult: { correct: number; total: number; submittedAt?: string; answers?: Record<string, number> } | null; executions: InterviewExecution[] };

export const getAssessInterviews = async (companyId?: string) => (await api.get("/assess/interviews", { params: { companyId } })).data as { interviews: InterviewSummary[]; mediaEnabled: boolean };
export const getAssessKits = async (companyId: string) => (await api.get("/assess/kits", { params: { companyId } })).data as AssessKitLibrary;
export const saveAssessKit = async (companyId: string, kit: AssessKit) => (await api.post(`/assess/companies/${companyId}/kits`, { kit })).data as { id: string };
export const scheduleAssessInterview = async (companyId: string, payload: { candidateUsername?: string; assessmentId?: string; kitId: string; title: string; scheduledAt: string; durationMinutes: number; interviewerIds: number[]; useSelectedProject: boolean; idempotencyKey: string }) => (await api.post(`/assess/companies/${companyId}/interviews`, payload)).data as { id: string; assessmentId?: string };
export const getAssessInterview = async (id: string) => (await api.get(`/assess/interviews/${id}`)).data as InterviewDetails;
export const getAssessInterviewState = async (id: string, revision: number, chatAfter: string) => (await api.get(`/assess/interviews/${id}/state`, { params: { revision, chatAfter } })).data as { interview: Partial<AssessInterview>; messages: InterviewMessage[]; execution: InterviewExecution | null };
export const respondAssessInterview = async (id: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/assess/interviews/${id}/respond`, { decision, consent: decision === "ACCEPT" })).data;
export const startAssessInterview = async (id: string) => (await api.post(`/assess/interviews/${id}/start`)).data;
export const cancelAssessInterview = async (id: string) => (await api.post(`/assess/interviews/${id}/cancel`)).data;
export const joinAssessInterviewCall = async (id: string) => (await api.post(`/assess/interviews/${id}/join`)).data as { token: string; url: string; identity: string };
export const saveAssessInterviewDraft = async (id: string, files: GrowthFile[], expectedRevision: number) => (await api.put(`/assess/interviews/${id}/draft`, { files, expectedRevision })).data as { revision: number };
export const controlAssessInterview = async (id: string, editorUserId: number, expectedRevision: number) => (await api.post(`/assess/interviews/${id}/control`, { editorUserId, expectedRevision })).data;
export const phaseAssessInterview = async (id: string, phase: string) => (await api.post(`/assess/interviews/${id}/phase`, { phase })).data;
export const sendAssessInterviewMessage = async (id: string, text: string, clientKey: string) => (await api.post(`/assess/interviews/${id}/messages`, { text, clientKey })).data;
export const submitAssessInterviewQuiz = async (id: string, answers: Record<string, number>) => (await api.post(`/assess/interviews/${id}/quiz`, { answers })).data as { result: { correct: number; total: number } };
export const saveAssessInterviewNote = async (id: string, note: InterviewNote) => (await api.put(`/assess/interviews/${id}/notes`, { ...note, expectedRevision: note.revision })).data as { revision: number };
export const releaseAssessInterviewFeedback = async (id: string, expectedRevision: number, allowPublicPortfolio: boolean) => (await api.post(`/assess/interviews/${id}/release-feedback`, { expectedRevision, allowPublicPortfolio })).data;
export const executeAssessInterview = async (id: string, kind: "RUN" | "CHECK", input: string, expectedRevision: number, idempotencyKey: string) => (await api.post(`/assess/interviews/${id}/executions`, { kind, input, expectedRevision, idempotencyKey })).data as { jobId: string; state: string };
export const cancelAssessInterviewExecution = async (id: string, jobId: string) => (await api.post(`/assess/interviews/${id}/executions/${jobId}/cancel`)).data;
export const endAssessInterview = async (id: string, expectedRevision: number) => (await api.post(`/assess/interviews/${id}/end`, { expectedRevision })).data;
export async function downloadAssessInterviewCalendar(id: string) {
  const response = await api.get(`/assess/interviews/${id}/calendar`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data); const link = document.createElement("a"); link.href = url; link.download = "studycod-interview.ics"; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
