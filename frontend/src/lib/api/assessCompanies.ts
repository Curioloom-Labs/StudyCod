import { api } from "./client";

export type AssessCaseReview = { scores: number[]; comment: string; recommendation: "READY_TO_CONTINUE" | "NEEDS_WORK"; allowPortfolioEvidence?: boolean };

export const getAssessCompanies = async () => (await api.get("/assess/companies")).data as {
  companies: Array<Record<string, any>>;
  pendingMemberships: Array<Record<string, any>>;
  candidateCases: Array<Record<string, any>>;
};
export const createAssessCompany = async (name: string) => (await api.post("/assess/companies", { name })).data.company;
export const getAssessCompany = async (companyId: string) => (await api.get(`/assess/companies/${companyId}`)).data as Record<string, any>;
export const inviteAssessCompanyMember = async (companyId: string, username: string, role: "HR" | "ENGINEER") => (await api.post(`/assess/companies/${companyId}/members`, { username, role })).data;
export const updateAssessCompanyMemberRole = async (companyId: string, membershipId: string, role: "HR" | "ENGINEER") => (await api.patch(`/assess/companies/${companyId}/members/${membershipId}`, { role })).data;
export const revokeAssessCompanyMember = async (companyId: string, membershipId: string) => (await api.delete(`/assess/companies/${companyId}/members/${membershipId}`)).data;
export const respondAssessCompanyMembership = async (membershipId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/assess/companies/members/${membershipId}/respond`, { decision })).data;
export const inviteAssessCandidate = async (companyId: string, payload: { candidateUsername: string; roleTitle: string; introduction: string; questions: Array<{ id: string; text: string }>; idempotencyKey: string }) => (await api.post(`/assess/companies/${companyId}/assessments`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const getAssessCandidateAssessment = async (assessmentId: string) => (await api.get(`/assess/companies/candidate/assessments/${assessmentId}`)).data.assessment as Record<string, any>;
export const respondAssessCandidateAssessment = async (assessmentId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/respond`, { decision, ...(decision === "ACCEPT" ? { consent: true } : {}) })).data;
export const getAssessCandidatePortfolioOptions = async (assessmentId: string) => (await api.get(`/assess/companies/candidate/assessments/${assessmentId}/portfolio-options`)).data.versions as Array<Record<string, any>>;
export const selectAssessCandidatePortfolio = async (assessmentId: string, projectId: string, versionId: string) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/portfolio`, { projectId, versionId })).data;
export const saveAssessCandidateAnswers = async (assessmentId: string, answers: Array<{ questionId: string; answer: string }>) => (await api.put(`/assess/companies/candidate/assessments/${assessmentId}/interview-answers`, { answers })).data;
export const withdrawAssessCandidateAssessment = async (assessmentId: string) => (await api.post(`/assess/companies/candidate/assessments/${assessmentId}/withdraw`)).data;
export const getAssessCompanyAssessment = async (companyId: string, assessmentId: string) => (await api.get(`/assess/companies/${companyId}/assessments/${assessmentId}`)).data as { assessment: Record<string, any>; role: "OWNER" | "HR" | "ENGINEER" };
export const submitAssessInterviewReview = async (companyId: string, assessmentId: string, review: AssessCaseReview) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/interview-review`, review)).data;
export const assignAssessTechnicalTask = async (companyId: string, assessmentId: string, payload: { title: string; prompt: string; tests: Array<{ input: string; output: string; group: string; hidden: boolean }>; idempotencyKey: string }) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/technical-task`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const submitAssessTechnicalReview = async (companyId: string, assessmentId: string, review: AssessCaseReview) => (await api.post(`/assess/companies/${companyId}/assessments/${assessmentId}/technical-review`, review)).data;
