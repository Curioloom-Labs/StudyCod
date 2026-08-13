import { api } from "./client";

export type CatalogRuntime = "JAVA" | "PYTHON" | "CPP";
export type CatalogEnrollmentStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "COMPLETED";

export interface CatalogPrerequisite {
  courseId: number;
  title: string;
  requiredCompletionPercent: number;
  completionPercent: number;
  status: CatalogEnrollmentStatus | null;
}

export interface CatalogVariant {
  id: number;
  runtime: CatalogRuntime;
  runtimeLabel: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  enrollment: {
    id: number;
    status: CatalogEnrollmentStatus;
    completionPercent: number;
    masteryScore: number;
    finalAssessmentPassed: boolean;
    completedAt: string | null;
  } | null;
  gate: { code: string; prerequisites: CatalogPrerequisite[] } | null;
}

export interface CatalogCourse {
  id: number;
  key: string | null;
  title: string;
  description: string | null;
  level: "FOUNDATION" | "SPECIALIZATION" | "ADVANCED";
  isBase: boolean;
  status: "DRAFT" | "PUBLISHED";
  prerequisites: CatalogPrerequisite[];
  variants: CatalogVariant[];
}

export interface LearningCourseItem {
  id: number;
  kind: "THEORY" | "PAGE" | "CODE_TASK" | "WEB_TASK" | "QUIZ" | "MANUAL";
  title: string;
  order: number;
  content: Record<string, unknown>;
  progress: { status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED"; score: number | null; completedAt: string | null };
}

export interface LearningProjectProgress {
  milestoneIds: string[];
  draft: string;
  readme: string;
  status: "DRAFT" | "SUBMITTED";
  submittedAt?: string | null;
}

export interface LearningProjectCheckFile {
  path: string;
  content: string;
}

export interface LearningProject {
  itemId: number;
  enrollmentId: number;
  projectKey: string | null;
  projectSpec: {
    milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
    acceptanceCriteria?: string[];
    estimatedMinutes?: number;
    skills?: string[];
    template?: string;
    checkSpec?: { kind: "flask" | "fastapi" | "computer-vision"; module?: string; probePaths?: string[]; files?: string[] };
  } | null;
  progress: LearningProjectProgress;
  itemStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export interface LearningCourse {
  id: number;
  key: string | null;
  title: string;
  description: string | null;
  level: CatalogCourse["level"];
  isBase: boolean;
  runtime: CatalogRuntime;
  enrollment: {
    id: number;
    status: CatalogEnrollmentStatus;
    completionPercent: number;
    masteryScore: number;
    finalAssessmentPassed: boolean;
  };
  modules: Array<{ id: number; title: string; items: LearningCourseItem[] }>;
}

export async function getLearningCatalog(): Promise<CatalogCourse[]> {
  const response = await api.get("/learning/catalog");
  return response.data?.courses ?? [];
}

export async function enrollInCatalogCourse(courseId: number, variantId: number) {
  const response = await api.post(`/learning/courses/${courseId}/enroll`, { variantId });
  return response.data?.enrollment;
}

export async function getLearningCourse(courseId: number): Promise<LearningCourse> {
  const response = await api.get(`/learning/courses/${courseId}`);
  return response.data?.course;
}

export async function completeCatalogItem(itemId: number, score?: number) {
  const response = await api.post(`/learning/items/${itemId}/complete`, score == null ? {} : { score });
  return response.data?.enrollment;
}

export async function getCatalogProject(itemId: number): Promise<LearningProject> {
  const response = await api.get(`/learning/items/${itemId}/project`);
  return response.data?.project;
}

export async function saveCatalogProject(itemId: number, input: Omit<LearningProjectProgress, "status" | "submittedAt">) {
  const response = await api.put(`/learning/items/${itemId}/project`, input);
  return response.data;
}

export async function submitCatalogProject(itemId: number, input: Omit<LearningProjectProgress, "status" | "submittedAt">) {
  const response = await api.post(`/learning/items/${itemId}/project/submit`, input);
  return response.data;
}

export async function checkCatalogProject(itemId: number, files: LearningProjectCheckFile[]) {
  const response = await api.post(`/learning/items/${itemId}/project/check`, { files });
  return response.data?.check;
}

export async function submitFinalAssessment(enrollmentId: number, score: number) {
  const response = await api.post(`/learning/enrollments/${enrollmentId}/final-assessment`, { score });
  return response.data?.enrollment;
}
