import { api } from "./client";

export type AssessCaseReview = { scores: Array<number | null>; comment: string; recommendation: "READY_TO_CONTINUE" | "NEEDS_WORK" | null; allowPortfolioEvidence?: boolean };

export const getAssessCompanies = async () => (await api.get("/assess/companies")).data as {
  companies: Array<Record<string, any>>;
  pendingMemberships: Array<Record<string, any>>;
  candidateCases: Array<Record<string, any>>;
};
export const createAssessCompany = async (name: string) => (await api.post("/assess/companies", { name })).data.company;
export const getAssessCompany = async (companyId: string, filters: { page?: number; search?: string; status?: string; technical?: boolean } = {}) => (await api.get(`/assess/companies/${companyId}`, { params: filters })).data as Record<string, any>;
export const getAssessCompanyIntegrations = async (companyId: string) => (await api.get(`/assess/companies/${companyId}/integrations`)).data as Record<string, any>;
export const createAssessApiKey = async (companyId: string, payload: { name: string; scopes: Array<"assessments:read" | "assessments:write"> }) => (await api.post(`/assess/companies/${companyId}/integrations/api-keys`, payload)).data as { id: string; name: string; keyPrefix: string; scopes: string[]; token: string };
export const revokeAssessApiKey = async (companyId: string, keyId: string) => (await api.delete(`/assess/companies/${companyId}/integrations/api-keys/${keyId}`)).data;
export const createAssessWebhook = async (companyId: string, payload: { name: string; url: string; events: string[] }) => (await api.post(`/assess/companies/${companyId}/integrations/webhooks`, payload)).data as { webhook: Record<string, any>; secret: string };
export const setAssessWebhookEnabled = async (companyId: string, webhookId: string, enabled: boolean) => (await api.patch(`/assess/companies/${companyId}/integrations/webhooks/${webhookId}`, { enabled })).data;
export const inviteAssessCompanyMember = async (companyId: string, username: string, role: "HR" | "ENGINEER") => (await api.post(`/assess/companies/${companyId}/members`, { username, role })).data;
export const updateAssessCompanyMemberRole = async (companyId: string, membershipId: string, role: "HR" | "ENGINEER") => (await api.patch(`/assess/companies/${companyId}/members/${membershipId}`, { role })).data;
export const revokeAssessCompanyMember = async (companyId: string, membershipId: string) => (await api.delete(`/assess/companies/${companyId}/members/${membershipId}`)).data;
export const respondAssessCompanyMembership = async (membershipId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/assess/companies/members/${membershipId}/respond`, { decision })).data;
export const inviteAssessCandidate = async (companyId: string, payload: { candidateUsername?: string; candidateEmail?: string; roleTitle: string; roleProfile?: string; introduction: string; questions: Array<{ id: string; text: string }>; estimatedMinutes?: number; deadlineAt?: string | null; aiPolicy?: "ALLOWED" | "NOT_ALLOWED" | "DISCUSS"; idempotencyKey: string }) => (await api.post(`/assess/companies/${companyId}/assessments`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const getAssessCandidateAssessment = async (assessmentId: string) => (await api.get(`/assess/companies/candidate/assessments/${assessmentId}`)).data.assessment as Record<string, any>;
export const respondAssessCandidateAssessment = async (assessmentId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/respond`, { decision, ...(decision === "ACCEPT" ? { consent: true } : {}) })).data;
export const getAssessCandidatePortfolioOptions = async (assessmentId: string) => (await api.get(`/assess/companies/candidate/assessments/${assessmentId}/portfolio-options`)).data as { versions: Array<Record<string, any>>; works: Array<Record<string, any>> };
export const selectAssessCandidatePortfolio = async (assessmentId: string, projectId: string, versionId: string) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/portfolio`, { projectId, versionId })).data;
export const selectAssessCandidatePortfolioEvidence = async (assessmentId: string, evidence: { type: "PORTFOLIO_WORK"; workId: string } | { type: "NDA_SUMMARY"; title: string; role: string; summary: string; technologies: string[] }) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/portfolio-evidence`, evidence)).data;
export const saveAssessCandidateAnswers = async (assessmentId: string, answers: Array<{ questionId: string; answer: string }>, submit = false) => (await api.put(`/assess/companies/candidate/assessments/${assessmentId}/interview-answers`, { answers, submit })).data;
export const withdrawAssessCandidateAssessment = async (assessmentId: string) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/withdraw`)).data;
export const getAssessCompanyAssessment = async (companyId: string, assessmentId: string) => (await api.get(`/assess/companies/${companyId}/assessments/${assessmentId}`)).data as { assessment: Record<string, any>; role: "OWNER" | "HR" | "ENGINEER" };
export const askAssessFollowup = async (companyId: string, assessmentId: string, reviewerType: "HR" | "TECHNICAL", question: string) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/followups`, { reviewerType, question })).data;
export const respondAssessFollowup = async (assessmentId: string, followupId: string, response: string) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/followups/${followupId}/respond`, { response })).data;
export const submitAssessInterviewReview = async (companyId: string, assessmentId: string, review: AssessCaseReview) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/interview-review`, review)).data;
export const assignAssessTechnicalTask = async (companyId: string, assessmentId: string, payload: { title: string; prompt: string; tests: Array<{ input: string; output: string; group: string; hidden: boolean }>; idempotencyKey: string }) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/technical-task`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const submitAssessTechnicalReview = async (companyId: string, assessmentId: string, review: AssessCaseReview) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/technical-review`, review)).data;
export const saveAssessCompanyDecision = async (companyId: string, assessmentId: string, decision: { outcome: "ADVANCE" | "REJECT" | "HOLD"; rationale: string; releaseToCandidate: boolean }) => (await api.put(`/assess/companies/${companyId}/assessments/${assessmentId}/decision`, decision)).data;
