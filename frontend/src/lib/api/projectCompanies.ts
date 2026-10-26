import { api } from "./client";

export type CompanyCaseReview = { scores: number[]; comment: string; recommendation: "READY_TO_CONTINUE" | "NEEDS_WORK" };

export const getProjectCompanies = async () => (await api.get("/project-companies")).data as {
  companies: Array<Record<string, any>>;
  pendingMemberships: Array<Record<string, any>>;
  candidateCases: Array<Record<string, any>>;
};
export const createProjectCompany = async (name: string) => (await api.post("/project-companies", { name })).data.company;
export const getProjectCompany = async (companyId: string) => (await api.get(`/project-companies/${companyId}`)).data as Record<string, any>;
export const inviteCompanyMember = async (companyId: string, username: string, role: "HR" | "ENGINEER") => (await api.post(`/project-companies/${companyId}/members`, { username, role })).data;
export const respondCompanyMembership = async (membershipId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/project-companies/members/${membershipId}/respond`, { decision })).data;
export const inviteCompanyCandidate = async (companyId: string, payload: { candidateUsername: string; roleTitle: string; introduction: string; questions: Array<{ id: string; text: string }>; idempotencyKey: string }) => (await api.post(`/project-companies/${companyId}/assessments`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const getCandidateCompanyAssessment = async (assessmentId: string) => (await api.get(`/project-companies/candidate/assessments/${assessmentId}`)).data.assessment as Record<string, any>;
export const respondCandidateCompanyAssessment = async (assessmentId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`/project-companies/candidate/assessments/${assessmentId}/respond`, { decision, ...(decision === "ACCEPT" ? { consent: true } : {}) })).data;
export const getCandidateCompanyPortfolioOptions = async (assessmentId: string) => (await api.get(`/project-companies/candidate/assessments/${assessmentId}/portfolio-options`)).data.versions as Array<Record<string, any>>;
export const selectCandidateCompanyPortfolio = async (assessmentId: string, projectId: string, versionId: string) => (await api.post(`/project-companies/candidate/assessments/${assessmentId}/portfolio`, { projectId, versionId })).data;
export const saveCandidateCompanyAnswers = async (assessmentId: string, answers: Array<{ questionId: string; answer: string }>) => (await api.put(`/project-companies/candidate/assessments/${assessmentId}/interview-answers`, { answers })).data;
export const withdrawCandidateCompanyAssessment = async (assessmentId: string) => (await api.post(`/project-companies/candidate/assessments/${assessmentId}/withdraw`)).data;
export const getCompanyAssessment = async (companyId: string, assessmentId: string) => (await api.get(`/project-companies/${companyId}/assessments/${assessmentId}`)).data as { assessment: Record<string, any>; role: "OWNER" | "HR" | "ENGINEER" };
export const submitCompanyInterviewReview = async (companyId: string, assessmentId: string, review: CompanyCaseReview) => (await api.post(`/project-companies/${companyId}/assessments/${assessmentId}/interview-review`, review)).data;
export const assignCompanyTechnicalTask = async (companyId: string, assessmentId: string, payload: { title: string; prompt: string; tests: Array<{ input: string; output: string; group: string; hidden: boolean }>; idempotencyKey: string }) => (await api.post(`/project-companies/${companyId}/assessments/${assessmentId}/technical-task`, payload, { headers: { "Idempotency-Key": payload.idempotencyKey } })).data;
export const submitCompanyTechnicalReview = async (companyId: string, assessmentId: string, review: CompanyCaseReview) => (await api.post(`/project-companies/${companyId}/assessments/${assessmentId}/technical-review`, review)).data;
