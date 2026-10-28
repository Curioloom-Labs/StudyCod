import { api } from "./client";

export type PortfolioProfile = {
  displayName: string;
  headline: string;
  specialization: string;
  technologies: string[];
  summary: string;
  githubUrl: string | null;
  websiteUrl: string | null;
  shareAvatar: boolean;
  visibility: "PRIVATE" | "PUBLIC";
  updatedAt?: string;
};

export type PortfolioWork = {
  id: string;
  title: string;
  problem: string;
  solution: string;
  role: string;
  technologies: string[];
  skillIds: string[];
  repositoryUrl: string | null;
  demoUrl: string | null;
  sourcePublicationId: string | null;
  sourcePublicId: string | null;
  visibility: "PRIVATE" | "PUBLIC";
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PortfolioPublication = {
  id: string;
  publicId: string;
  title: string;
  description: string;
  runtime: string;
  stage: string;
};

export type PortfolioSkill = { id: string; categoryId: string; categoryUk: string; categoryEn: string; labelUk: string; labelEn: string };
export type PortfolioEvidenceSourceType = "ONLINE_JUDGE" | "LEARNING_ACTIVITY" | "LEARNING_COURSE" | "PROJECT_PUBLICATION" | "ASSESSMENT_FEEDBACK" | "ASSESSMENT_TASK_RESULT" | "COMPETITION_RESULT";
export type PortfolioEvidenceSource = {
  sourceType: PortfolioEvidenceSourceType;
  sourceKey: string;
  title: string;
  sourceLabel: string;
  detail: string;
  gradeId?: number;
  taskTitle?: string;
  language?: "JAVA" | "PYTHON" | "CPP";
  testsPassed?: number;
  testsTotal?: number;
  submittedAt?: string;
  verifiedAt: string;
  acceptedProblems?: number;
};
export type PortfolioEvidence = {
  id: string;
  sourceGradeId?: number;
  sourceType: PortfolioEvidenceSourceType;
  sourceKey?: string;
  sourceTitle: string;
  sourceLabel: string;
  sourceDetail: string;
  description: string;
  skillIds: string[];
  visibility: "PRIVATE" | "PUBLIC";
  sortOrder?: number;
  taskTitle?: string;
  language?: "JAVA" | "PYTHON" | "CPP";
  verificationMethod?: "ONLINE_JUDGE";
  judgeVerdict?: "AC";
  testsPassed?: number;
  testsTotal?: number;
  submittedAt?: string;
  verifiedAt?: string;
};
export type PortfolioEvidenceInput = {
  sourceType: PortfolioEvidenceSourceType;
  sourceKey: string;
  description: string;
  skillIds: string[];
  visibility: "PRIVATE" | "PUBLIC";
};
export type PortfolioEvidencePack = {
  id: string;
  title: string;
  specialization: string;
  includeProfile: boolean;
  workCount: number;
  evidenceCount: number;
  skillIds: string[];
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
};

export type PortfolioWorkInput = Omit<PortfolioWork, "id" | "sourcePublicId" | "sortOrder" | "createdAt" | "updatedAt"> & {
  sourcePublicationId?: string | null;
};

export type PortfolioDashboard = {
  username: string;
  avatarUrl: string | null;
  birthDate?: string | null;
  publicSharingAgeStatus?: "UNKNOWN" | "UNDER_18" | "ADULT";
  profile: PortfolioProfile;
  works: PortfolioWork[];
  availablePublications: PortfolioPublication[];
  evidence: PortfolioEvidence[];
  evidenceSources: PortfolioEvidenceSource[];
  sourcedEvidenceSources: PortfolioEvidenceSource[];
  evidencePacks: PortfolioEvidencePack[];
  skills: PortfolioSkill[];
};

export type PortfolioPublicView = {
  profile: Pick<PortfolioProfile, "headline" | "specialization" | "technologies" | "summary" | "githubUrl" | "websiteUrl"> & {
    username: string; displayName: string; avatarUrl: string | null;
  };
  works: Array<Pick<PortfolioWork, "id" | "title" | "problem" | "solution" | "role" | "technologies" | "skillIds" | "repositoryUrl" | "demoUrl"> & {
    sourcePublicId: string | null;
  }>;
  evidence: Array<Omit<PortfolioEvidence, "sourceGradeId" | "visibility" | "sourceKey">>;
  skills: PortfolioSkill[];
};

export async function getPortfolioDashboard(): Promise<PortfolioDashboard> {
  return (await api.get("/portfolio/me")).data as PortfolioDashboard;
}

export async function savePortfolioProfile(profile: PortfolioProfile): Promise<PortfolioProfile> {
  return (await api.put("/portfolio/me", profile)).data.profile as PortfolioProfile;
}

export async function savePortfolioBirthDate(birthDate: string): Promise<Pick<PortfolioDashboard, "birthDate" | "publicSharingAgeStatus">> {
  return (await api.put("/portfolio/me/birth-date", { birthDate })).data;
}

export async function removePortfolioBirthYear(): Promise<Pick<PortfolioDashboard, "birthDate" | "publicSharingAgeStatus">> {
  return (await api.delete("/portfolio/me/birth-date")).data;
}

export async function createPortfolioWork(work: PortfolioWorkInput): Promise<{ id: string }> {
  return (await api.post("/portfolio/works", work)).data as { id: string };
}

export async function updatePortfolioWork(id: string, work: PortfolioWorkInput): Promise<void> {
  await api.patch(`/portfolio/works/${encodeURIComponent(id)}`, work);
}

export async function archivePortfolioWork(id: string): Promise<void> {
  await api.delete(`/portfolio/works/${encodeURIComponent(id)}`);
}

export async function reorderPortfolioWorks(ids: string[]): Promise<void> {
  await api.put("/portfolio/works/order", { ids });
}

export async function reorderPortfolioEvidence(ids: string[]): Promise<void> {
  await api.put("/portfolio/evidence/order", { ids });
}

export async function createPortfolioEvidence(input: PortfolioEvidenceInput): Promise<{ id: string }> {
  if (input.sourceType === "ONLINE_JUDGE") {
    return (await api.post("/portfolio/evidence", { ...input, sourceGradeId: Number(input.sourceKey) })).data as { id: string };
  }
  return (await api.post("/portfolio/evidence/sourced", input)).data as { id: string };
}

export async function updatePortfolioEvidence(id: string, input: Pick<PortfolioEvidenceInput, "description" | "skillIds" | "visibility">): Promise<void> {
  await api.patch(`/portfolio/evidence/${encodeURIComponent(id)}`, input);
}

export async function archivePortfolioEvidence(id: string): Promise<void> {
  await api.delete(`/portfolio/evidence/${encodeURIComponent(id)}`);
}

export async function createPortfolioEvidencePack(input: {
  title: string;
  specialization: string;
  includeProfile: boolean;
  workIds: string[];
  evidenceIds: string[];
  skillIds: string[];
  expiresInDays: number;
}): Promise<{ id: string; token: string; expiresAt: string }> {
  return (await api.post("/portfolio/evidence-packs", input)).data as { id: string; token: string; expiresAt: string };
}

export async function revokePortfolioEvidencePack(id: string): Promise<void> {
  await api.delete(`/portfolio/evidence-packs/${encodeURIComponent(id)}`);
}

export async function getPublicPortfolio(username: string): Promise<PortfolioPublicView> {
  return (await api.get(`/portfolio-public/u/${encodeURIComponent(username)}`)).data;
}

export async function getPortfolioPreview(): Promise<PortfolioPublicView> {
  return (await api.get("/portfolio/preview")).data as PortfolioPublicView;
}

export async function getPublicEvidencePack(token: string): Promise<{
  title: string;
  specialization: string;
  skillIds: string[];
  competencies: PortfolioSkill[];
  expiresAt: string;
  profile: PortfolioPublicView["profile"] | null;
  works: PortfolioPublicView["works"];
  evidence: Array<Omit<PortfolioEvidence, "sourceGradeId" | "visibility" | "sourceKey">>;
  skills: PortfolioSkill[];
}> {
  return (await api.get(`/portfolio-public/p/${encodeURIComponent(token)}`)).data;
}
