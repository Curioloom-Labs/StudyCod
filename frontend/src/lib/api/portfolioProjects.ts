import { api } from "./client";

const PORTFOLIO_PROJECT_API = "/portfolio/projects";

export type GrowthRuntime = "PYTHON" | "JAVA" | "CPP";
export type GrowthStage = "V1" | "V2" | "V3";
export type GrowthFile = { path: string; content: string };
export type GrowthExample = { input: string; output: string };
export type GrowthDraft = { files: GrowthFile[]; examples: GrowthExample[]; explanation?: string };

export const getGrowthCatalog = async () => (await api.get(`${PORTFOLIO_PROJECT_API}/catalog`)).data;
export const getGrowthProjects = async () => (await api.get(PORTFOLIO_PROJECT_API)).data.projects as Array<Record<string, any>>;
export const getLegacyGrowthProjects = async () => (await api.get(`${PORTFOLIO_PROJECT_API}/legacy`)).data.projects as Array<Record<string, any>>;
export const importLegacyGrowthProject = async (kind: string, sourceId: number) => (await api.post(`${PORTFOLIO_PROJECT_API}/import`, { kind, sourceId })).data as { id: string; existing: boolean };
export const createGrowthProject = async (family: string, runtime: GrowthRuntime) => (await api.post(PORTFOLIO_PROJECT_API, { family, runtime })).data;
export const getGrowthProject = async (id: string) => (await api.get(`${PORTFOLIO_PROJECT_API}/${id}`)).data.project as Record<string, any>;
export const setGrowthProjectArchived = async (id: string, archived: boolean) => (await api.patch(`${PORTFOLIO_PROJECT_API}/${id}/archive`, { archived })).data as { archived: boolean };
export const saveGrowthDraft = async (id: string, draft: GrowthDraft, expectedRevision: number, assessmentId?: string) =>
  (await api.put(`${PORTFOLIO_PROJECT_API}/${id}/draft`, { draft, expectedRevision, assessmentId })).data as { revision: number };
export const runGrowthCheck = async (id: string, stageKey: GrowthStage, draftRevision: number, assessmentId?: string, key: string = crypto.randomUUID()) =>
  (await api.post(`${PORTFOLIO_PROJECT_API}/${id}/executions`, { stageKey, assessmentId, draftRevision, idempotencyKey: key }, { headers: { "Idempotency-Key": key } })).data;
export const getGrowthJob = async (jobId: string) => (await api.get(`${PORTFOLIO_PROJECT_API}/executions/${jobId}`)).data.job as Record<string, any>;
export const getGrowthExecutionPage = async (projectId: string, beforeCreatedAt: string, beforeId: string) =>
  (await api.get(`${PORTFOLIO_PROJECT_API}/${projectId}/executions`, { params: { beforeCreatedAt, beforeId, limit: 20 } })).data as { executions: Array<Record<string, any>>; hasMore: boolean; nextCursor: { beforeCreatedAt: string; beforeId: string } | null };
export const cancelGrowthJob = async (projectId: string, jobId: string) => (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/executions/${jobId}/cancel`)).data as { state: string };
export const submitGrowthVersion = async (id: string, jobId: string, expectedRevision: number, explanation: string, key: string = crypto.randomUUID()) =>
  (await api.post(`${PORTFOLIO_PROJECT_API}/${id}/versions`, { jobId, expectedRevision, explanation, idempotencyKey: key }, { headers: { "Idempotency-Key": key } })).data;
export const getGrowthVersion = async (projectId: string, versionId: string) => (await api.get(`${PORTFOLIO_PROJECT_API}/${projectId}/versions/${versionId}`)).data.version as Record<string, any>;
export const getGrowthVersionPage = async (projectId: string, beforeCreatedAt: string, beforeId: string) =>
  (await api.get(`${PORTFOLIO_PROJECT_API}/${projectId}/versions`, { params: { beforeCreatedAt, beforeId, limit: 20 } })).data as { versions: Array<Record<string, any>>; hasMore: boolean; nextCursor: { beforeCreatedAt: string; beforeId: string } | null };
export const restoreGrowthVersion = async (projectId: string, versionId: string, expectedRevision: number) => (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/versions/${versionId}/restore`, { expectedRevision })).data as { draft: GrowthDraft; revision: number; currentStage: GrowthStage };
export const startGrowthAssessment = async (projectId: string, kind: "DEFENSE" | "TRANSFER", key: string = crypto.randomUUID()) => (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/assessments`, { kind, idempotencyKey: key }, { headers: { "Idempotency-Key": key } })).data.assessment;
export const cancelGrowthAssessment = async (projectId: string, assessmentId: string) => (await api.delete(`${PORTFOLIO_PROJECT_API}/${projectId}/assessments/${assessmentId}`)).data as { cancelled: boolean };
export const finishGrowthAssessment = async (projectId: string, assessmentId: string, explanation: string) => (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/assessments/${assessmentId}/finish`, { explanation })).data.assessment;
export const createGrowthPublication = async (projectId: string, payload: Record<string, unknown>, key: string = crypto.randomUUID()) =>
  (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/publications`, { ...payload, idempotencyKey: key }, { headers: { "Idempotency-Key": key } })).data.publication;
export const replaceGrowthPublicationVersion = async (projectId: string, publicationId: string, payload: { versionId: string; assessmentIds: string[]; demoIndex?: number }) =>
  (await api.put(`${PORTFOLIO_PROJECT_API}/${projectId}/publications/${publicationId}/version`, payload)).data as { versionId: string; evidence: string[]; demo: { input: string; output: string } | null };
export const getPublicGrowthPortfolio = async (publicId: string) => (await api.get(`/project-portfolio/share/${publicId}`)).data.publication as Record<string, any>;
export const getPublicGrowthProfile = async (username: string) => (await api.get("/project-portfolio/profile/" + encodeURIComponent(username))).data as { projects: Array<Record<string, any>> };
export const setGrowthPublicationReviews = async (projectId: string, publicationId: string, visible: boolean) => (await api.put(`${PORTFOLIO_PROJECT_API}/${projectId}/publications/${publicationId}/reviews`, { visible })).data;
export const revokeGrowthPublication = async (projectId: string, publicationId: string) => (await api.delete(`${PORTFOLIO_PROJECT_API}/${projectId}/publications/${publicationId}`)).data;
export const rotateGrowthPublicationLink = async (projectId: string, publicationId: string) => (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/publications/${publicationId}/rotate-link`)).data as { publicId: string; url: string };
export const requestGrowthReview = async (projectId: string, versionId: string, reviewerUsername?: string, assessmentIds: string[] = []) =>
  (await api.post(`${PORTFOLIO_PROJECT_API}/${projectId}/reviews`, { versionId, reviewerUsername: reviewerUsername || undefined, assessmentIds })).data.review;
export const getGrowthReviewInbox = async () => (await api.get(`${PORTFOLIO_PROJECT_API}/reviews/inbox`)).data.reviews as Array<Record<string, any>>;
export const getGrowthReview = async (reviewId: string) => (await api.get(`${PORTFOLIO_PROJECT_API}/reviews/${reviewId}`)).data.review as Record<string, any>;
export const respondGrowthReview = async (reviewId: string, decision: "ACCEPT" | "DECLINE") => (await api.post(`${PORTFOLIO_PROJECT_API}/reviews/${reviewId}/respond`, { decision })).data;
export const submitGrowthReview = async (reviewId: string, payload: { scores: number[]; comment: string; recommendation: "READY_TO_PUBLISH" | "NEEDS_WORK"; reviewerNamePublic: boolean }) => (await api.post(`${PORTFOLIO_PROJECT_API}/reviews/${reviewId}/submit`, payload)).data;
export const setGrowthReviewPublic = async (reviewId: string, visible: boolean) => (await api.post(`${PORTFOLIO_PROJECT_API}/reviews/${reviewId}/public-visibility`, { visible })).data;
export const getGrowthAdminReviewRequests = async () => (await api.get(`${PORTFOLIO_PROJECT_API}/admin/review-requests`)).data.requests as Array<Record<string, any>>;
export const getGrowthActiveReviewers = async () => (await api.get(`${PORTFOLIO_PROJECT_API}/admin/reviewers`)).data.reviewers as Array<Record<string, any>>;
export const grantGrowthReviewer = async (username: string) => (await api.post(`${PORTFOLIO_PROJECT_API}/admin/reviewer-grants`, { username })).data;
export const revokeGrowthReviewer = async (userId: number) => (await api.delete(`${PORTFOLIO_PROJECT_API}/admin/reviewer-grants/${userId}`)).data;
export const assignGrowthReview = async (reviewId: string, reviewerId: number) => (await api.post(`${PORTFOLIO_PROJECT_API}/admin/reviews/${reviewId}/assign`, { reviewerId })).data;
