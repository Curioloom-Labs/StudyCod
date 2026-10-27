import { api } from "./client";
import { isDevPreviewActive } from "../devPreview";
import {
  completeLearningPreviewItem,
  enrollLearningPreviewCourse,
  getLearningPreviewCatalog,
  getLearningPreviewCourse,
  getLearningPreviewDiagnostic,
  getLearningPreviewMe,
  getLearningPreviewSyllabus,
  runLearningPreviewDiagnostic,
  retryLearningPreviewDiagnostic,
  setCurrentLearningPreviewCourse,
  submitLearningPreviewDiagnostic,
} from "../learningPreview";

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

export interface CatalogQuizQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface CatalogQuiz {
  itemId: number;
  title: string;
  passingScore: number;
  questions: CatalogQuizQuestion[];
  progress: LearningCourseItem["progress"];
}

export interface CatalogQuizResult {
  score: number;
  correctCount: number;
  total: number;
  passed: boolean;
  passingScore: number;
  review: Array<{ questionId: string; question: string; options: string[]; selectedIndex: number; correctIndex: number }>;
  progress: LearningCourseItem["progress"];
  enrollment: { id: number; status: CatalogEnrollmentStatus; completionPercent: number; masteryScore: number };
}

export interface CourseDiagnosticResult {
  score: number;
  knowledgeScore: number;
  practicalScore: number;
  correctCount: number;
  totalQuestions: number;
  testsPassed: number;
  testsTotal: number;
  passed: boolean;
  answers: Array<{ questionId: string; selectedIndex: number }>;
  topicResults: Array<{ topicId: number; topicTitle: string; correctCount: number; totalQuestions: number; score: number; theoryCredited: boolean; practiceCredited: boolean }>;
  review: Array<{ questionId: string; question: string; options: string[]; selectedIndex: number; correctIndex: number; topicTitle: string }>;
  submittedAt: string;
}

export interface CourseDiagnosticAssessment {
  id: number;
  enrollmentId: number;
  attemptNumber: number;
  courseTitle: string;
  status: "READY" | "SUBMITTED";
  passing: { totalScore: number; knowledgeScore: number; practicalScore: number };
  questions: Array<{ id: string; question: string; options: string[]; topicId: number; topicTitle: string }>;
  practical: {
    title: string;
    statement: string;
    inputFormat: string;
    outputFormat: string;
    constraints: string;
    examples: Array<{ input: string; output: string; explanation?: string }>;
    codeTemplate: string;
    runtime: CatalogRuntime;
    entryFile: string;
  };
  result: CourseDiagnosticResult | null;
}

export interface CourseDiagnosticRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface LearningProjectProgress {
  milestoneIds: string[];
  draft: string;
  files?: LearningProjectCheckFile[];
  lastCheck?: { score: number; verdict: string; testsPassed: number; testsTotal: number; checkedAt: string; filesHash?: string } | null;
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
  runtime: CatalogRuntime;
  starterCode: string;
  starterFiles?: LearningProjectCheckFile[];
  entryFile: string;
  projectSpec: {
    milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
    acceptanceCriteria?: string[];
    inputFormat?: string;
    outputFormat?: string;
    estimatedMinutes?: number;
    skills?: string[];
    template?: string;
    entryFile?: string;
    files?: string[];
    assessment?: { version: number; mode: "EXACT_IO" | "WEB_BEHAVIOR" | "STATIC_REVIEW"; requiredEvidence: Array<{ id: string; label: string; description: string }>; checkBeforeSubmit: boolean };
    checkSpec?: { kind: "flask" | "fastapi" | "computer-vision"; module?: string; probePaths?: string[]; files?: string[] };
  } | null;
  progress: LearningProjectProgress;
  itemStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
}

export interface CatalogProjectTestResult {
  test_id?: number | string;
  input?: string;
  expected?: string;
  actual?: string;
  verdict?: string;
  message?: string;
  stderr?: string;
}

export interface CatalogProjectCheckResult {
  verdict?: string;
  passed?: boolean;
  testsPassed?: number;
  testsTotal?: number;
  score?: number;
  maxScore?: number;
  tests?: CatalogProjectTestResult[];
  progress?: Partial<LearningProjectProgress>;
  itemStatus?: LearningProject["itemStatus"];
}

export interface CatalogProjectRunResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  success?: boolean;
  timeMs?: number;
  memoryKb?: number;
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
    variantId: number;
    status: CatalogEnrollmentStatus;
    completionPercent: number;
    masteryScore: number;
    finalAssessmentPassed: boolean;
  };
  nextAction: {
    itemId: number;
    title: string;
    kind: LearningCourseItem["kind"];
    status: "NOT_STARTED" | "IN_PROGRESS";
  } | null;
  modules: Array<{ id: number; title: string; items: LearningCourseItem[] }>;
}

export interface CatalogCourseSyllabus {
  id: number;
  title: string;
  description: string | null;
  level: CatalogCourse["level"];
  isBase: boolean;
  variants: Array<{ runtime: CatalogRuntime; runtimeLabel: string; title: string }>;
  modules: Array<{ id: number; title: string; items: Array<{ kind: LearningCourseItem["kind"]; title: string }> }>;
}

export interface LearningEnrollmentSummary {
    enrollmentId: number;
    courseId: number;
    courseKey: string | null;
    title: string;
    description: string | null;
    runtime: CatalogRuntime;
    runtimeLabel: string;
    level: CatalogCourse["level"];
    status: CatalogEnrollmentStatus;
    completionPercent: number;
    finalAssessmentPassed: boolean;
    completedAt: string | null;
    gate: CatalogVariant["gate"];
}

export interface LearningMe {
  currentEnrollmentId: number | null;
  current: LearningEnrollmentSummary | null;
  enrollments: LearningEnrollmentSummary[];
}

export async function getLearningMe(): Promise<LearningMe> {
  if (isDevPreviewActive()) return getLearningPreviewMe();
  const response = await api.get("/learning/me");
  return response.data;
}

export async function setCurrentCourse(enrollmentId: number) {
  if (isDevPreviewActive()) {
    setCurrentLearningPreviewCourse(enrollmentId);
    return getLearningPreviewMe().current;
  }
  const response = await api.put("/learning/me/current-course", { enrollmentId });
  return response.data?.enrollment;
}

export async function getLearningCatalog(): Promise<CatalogCourse[]> {
  if (isDevPreviewActive()) return getLearningPreviewCatalog();
  const response = await api.get("/learning/catalog");
  return response.data?.courses ?? [];
}

export async function enrollInCatalogCourse(courseId: number, variantId: number) {
  if (isDevPreviewActive()) {
    enrollLearningPreviewCourse(courseId);
    return getLearningPreviewMe().current;
  }
  const response = await api.post(`/learning/courses/${courseId}/enroll`, { variantId });
  return response.data?.enrollment;
}

export async function getLearningCourse(courseId: number): Promise<LearningCourse> {
  if (isDevPreviewActive()) return getLearningPreviewCourse(courseId);
  const response = await api.get(`/learning/courses/${courseId}`);
  return response.data?.course;
}

export async function getCatalogCourseSyllabus(courseId: number): Promise<CatalogCourseSyllabus> {
  if (isDevPreviewActive()) return getLearningPreviewSyllabus(courseId);
  const response = await api.get(`/learning/courses/${courseId}/syllabus`);
  return response.data?.syllabus;
}

export async function completeCatalogItem(itemId: number, score?: number) {
  if (isDevPreviewActive()) {
    completeLearningPreviewItem(itemId);
    window.dispatchEvent(new Event("studycod:course-progress-changed"));
    return getLearningPreviewMe().current;
  }
  const response = await api.post(`/learning/items/${itemId}/complete`, score == null ? {} : { score });
  return response.data?.enrollment;
}

export async function getCatalogQuiz(itemId: number): Promise<CatalogQuiz> {
  const response = await api.get(`/learning/items/${itemId}/quiz`);
  return response.data?.quiz;
}

export async function submitCatalogQuiz(itemId: number, answers: Array<{ questionId: string; selectedIndex: number }>): Promise<CatalogQuizResult> {
  const response = await api.post(`/learning/items/${itemId}/quiz/submit`, { answers });
  return response.data?.result;
}

export async function getCourseDiagnostic(enrollmentId: number): Promise<CourseDiagnosticAssessment> {
  if (isDevPreviewActive()) return getLearningPreviewDiagnostic(enrollmentId);
  const response = await api.get(`/learning/enrollments/${enrollmentId}/diagnostic`);
  return response.data?.assessment;
}

export async function retryCourseDiagnostic(enrollmentId: number): Promise<CourseDiagnosticAssessment> {
  if (isDevPreviewActive()) return retryLearningPreviewDiagnostic(enrollmentId);
  const response = await api.post(`/learning/enrollments/${enrollmentId}/diagnostic/retry`);
  return response.data?.assessment;
}

export async function runCourseDiagnostic(enrollmentId: number, code: string, input: string): Promise<CourseDiagnosticRunResult> {
  if (isDevPreviewActive()) return runLearningPreviewDiagnostic(enrollmentId, code, input);
  const response = await api.post(`/learning/enrollments/${enrollmentId}/diagnostic/run`, { code, input });
  return response.data?.result;
}

export async function submitCourseDiagnostic(enrollmentId: number, answers: Array<{ questionId: string; selectedIndex: number }>, code: string): Promise<CourseDiagnosticResult> {
  if (isDevPreviewActive()) return submitLearningPreviewDiagnostic(enrollmentId, answers, code);
  const response = await api.post(`/learning/enrollments/${enrollmentId}/diagnostic/submit`, { answers, code });
  return response.data?.result;
}

export async function getCatalogProject(itemId: number): Promise<LearningProject> {
  const response = await api.get(`/learning/items/${itemId}/project`);
  return response.data?.project;
}

export async function saveCatalogProject(itemId: number, input: Omit<LearningProjectProgress, "status" | "submittedAt" | "lastCheck">) {
  const response = await api.put(`/learning/items/${itemId}/project`, input);
  return response.data;
}

export async function submitCatalogProject(itemId: number, input: Omit<LearningProjectProgress, "status" | "submittedAt" | "lastCheck">) {
  const response = await api.post(`/learning/items/${itemId}/project/submit`, input);
  return response.data;
}

export async function checkCatalogProject(itemId: number, files: LearningProjectCheckFile[]): Promise<CatalogProjectCheckResult | null> {
  const response = await api.post(`/learning/items/${itemId}/project/check`, { files });
  return response.data?.check as CatalogProjectCheckResult | null;
}

export async function runCatalogProject(itemId: number, files: LearningProjectCheckFile[], stdin: string): Promise<CatalogProjectRunResult | null> {
  const response = await api.post(`/learning/items/${itemId}/project/run`, { files, stdin });
  return response.data?.result as CatalogProjectRunResult | null;
}
