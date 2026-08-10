import { api } from "./client";
import type { ClassGradingSystem, GradeScaleMode } from "../gradingSystems";

type EduUserPayload = {
  id: number;
  username: string;
  course: "JAVA" | "PYTHON" | "CPP";
  difus: number;
  avatarUrl: string | null;
  userMode?: "PERSONAL" | "EDUCATIONAL" | "CONTEST";
  role?: "USER" | "TEACHER" | "SUPPORT" | "SYSTEM_ADMIN";
  studentId?: number;
  classId?: number;
  className?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
};

type QuizItem = {
  question: string;
  options: Record<string, string>;
  correct: string;
};

export type CodeFile = { path: string; content: string };
export type WebTaskFile = { path: "index.html" | "styles.css" | "script.js"; content: string };
export type WebTaskRule = {
  id?: string;
  type: "required_selector" | "forbidden_selector" | "required_text" | "forbidden_text" | "required_script_pattern" | "forbidden_script_pattern";
  message?: string;
  points?: number;
  selector?: string;
  text?: string;
  pattern?: string;
  flags?: string;
};
export type SubmissionBinding = { clientSubmissionId?: string; codeHash?: string };
export type SubmissionMeta = {
  submissionId: string;
  clientSubmissionId?: string | null;
  codeHash: string;
};
export interface StudentLoginResponse {
  token: string;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
    username: string;
    classId: number;
    className: string;
    language: "JAVA" | "PYTHON" | "CPP";
  };
}
export async function studentLogin(username: string, password: string, turnstileToken?: string): Promise<StudentLoginResponse> {
  const res = await api.post("/edu/student-login", {
    username,
    password,
    ...(turnstileToken ? { turnstileToken } : {}),
  });
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("userType", "STUDENT");
  }
  return res.data;
}
export interface Class {
  id: number;
  name: string;
  language: "JAVA" | "PYTHON" | "CPP";
  gradingSystem: ClassGradingSystem;
  gradeScaleMode?: GradeScaleMode;
  studentsCount: number;
  createdAt: string;
}
export interface Student {
  id: number;
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  generatedUsername: string;
  createdAt: string;
}
export interface StudentCredentials {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  username: string;
  password: string;
}
export interface Lesson {
  id: number;
  type: "TOPIC" | "CONTROL" | "LESSON";
  title: string;
  parentTopicId?: number;
  parentTopicTitle?: string;
  controlWorks?: Array<{
    id: number;
    title: string;
    timeLimitMinutes?: number | null;
    deadline?: string | null;
    deadlineTimezone?: string | null;
    tasksCount: number;
    hasTheory?: boolean;
    hasPractice?: boolean;
    quizJson?: string | null;
    studentGrade?: number | null;
    studentStatus?: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  }>;
  hasTheory?: boolean;
  theory?: string;
  timeLimitMinutes?: number;
  controlHasTheory?: boolean;
  controlHasPractice?: boolean;
  quizJson?: string | null;
  tasksCount: number;
  createdAt: string;
  quizSubmitted?: boolean;
  quizGrade?: number | null;
  quizReview?: {
    version: number;
    correctAnswers: number;
    totalQuestions: number;
    questions: Array<{
      index: number;
      question: string;
      options: Record<string, string>;
      correct: string;
      student: string | null;
      isCorrect: boolean;
    }>;
  } | null;
  reportOnly?: boolean;
  reportReason?: "COMPLETED" | "DEADLINE_EXPIRED" | null;
  controlReport?: {
    finalGrade: number | null;
    theoryGrade: number | null;
    practiceGrade: number | null;
    formulaSnapshot: string | null;
  } | null;
  studentControlProgress?: {
    totalTasks: number;
    completedTasks: number;
    currentTaskOrder: number | null;
    currentTaskId: number | null;
    completedTaskIds: number[];
    unlockedTaskIds: number[];
    reviewAvailable: boolean;
  };
  deadline?: string | null;
  deadlineTimezone?: string | null;
  tasks?: Array<{
    id: number;
    title: string;
    description?: string;
    template?: string;
    taskMode?: "CODE" | "WEB" | "MANUAL";
    projectSpec?: {
      version: 1;
      kind: "MINI_PROJECT";
      estimatedMinutes: number;
      skills: string[];
      milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
      extensions?: string[];
    } | null;
    webTemplateFiles?: WebTaskFile[] | null;
    webValidationRules?: WebTaskRule[] | null;
    deadline?: string | null;
    deadlineTimezone?: string | null;
    maxAttempts?: number;
    isClosed?: boolean;
    testDataCount?: number;
    attemptsUsed?: number;
    source?: "course" | "legacy";
    progressCompleted?: boolean;
    hasGrade?: boolean;
    grade?: {
      id: number;
      total: number;
      testsPassed: number;
      testsTotal: number;
      isCompleted?: boolean;
      testResults?: Array<{
        passed: boolean;
        testId?: number;
        verdict?: string | null;
        errorKind?: string | null;
        // legacy / optional detailed fields
        input?: string;
        expected?: string;
        actual?: string;
        stderr?: string;
        error?: string;
        error_kind?: string | null;
      }> | null;
    };
  }>;
}
export interface Task {
  id: number;
  title: string;
  description: string;
  template: string;
  testDataCount: number;
  createdAt: string;
}
export interface TaskWithGrade {
  id: number;
  title: string;
  description: string;
  template: string;
  taskMode?: "CODE" | "WEB" | "MANUAL";
  projectSpec?: {
    version: 1;
    kind: "MINI_PROJECT";
    estimatedMinutes: number;
    skills: string[];
    milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
    extensions?: string[];
  } | null;
  webTemplateFiles?: WebTaskFile[] | null;
  webValidationRules?: WebTaskRule[] | null;
  language: "JAVA" | "PYTHON" | "CPP";
  testDataCount: number;
  savedCode?: string;
  maxAttempts?: number;
  deadline?: string | null;
  deadlineTimezone?: string | null;
  isClosed?: boolean;
  attemptsUsed?: number;
  lesson: {
    id: number;
    title: string;
    type: "TOPIC" | "CONTROL" | "LESSON";
    deadlineTimezone?: string | null;
    hasTheory: boolean;
    theory?: string;
    timeLimitMinutes?: number;
    quizJson?: string;
    controlHasTheory?: boolean;
    controlHasPractice?: boolean;
    quizSubmitted?: boolean;
    quizGrade?: number | null;
  };
  hasGrade: boolean;
  grade?: {
    id: number;
    total: number;
    testsPassed: number;
    testsTotal: number;
    feedback?: string;
    isManuallyGraded?: boolean;
    isCompleted?: boolean;
    createdAt?: string;
    submittedCode?: string;
    submittedEntryFile?: string;
    submittedFiles?: CodeFile[];
    score?: number | null;
    maxScore?: number | null;
    groupScores?: Array<{
      group: string;
      score: number;
      maxScore: number;
    }> | null;
    testResults?: Array<{
      passed: boolean;
      testId?: number;
      verdict?: string | null;
      errorKind?: string | null;
      // legacy / optional detailed fields
      input?: string;
      expected?: string;
      actual?: string;
      stderr?: string;
      error?: string;
      error_kind?: string | null;
    }> | null;
    submissionMeta?: SubmissionMeta;
  };
}
export interface Grade {
  id: number;
  total: number;
  testsPassed: number;
  testsTotal: number;
  feedback?: string;
  isManuallyGraded: boolean;
  createdAt: string;
  task: {
    id: number;
    title: string;
    lesson: {
      id: number;
      title: string;
      type: "LESSON" | "CONTROL";
      theory?: string | null;
    } | null;
  } | null;
  topicTask?: {
    id: number;
    title: string;
    topicId?: number | null;
    topicTitle?: string | null;
    controlWorkId?: number | null;
    controlWorkTitle?: string | null;
  } | null;
  submittedCode?: string | null;
  testResults?: Array<{
    passed: boolean;
    testId?: number;
    verdict?: string | null;
    errorKind?: string | null;
    // legacy / optional detailed fields
    input?: string;
    expected?: string;
    actual?: string;
    stderr?: string;
  }> | null;
}
export interface TestResult {
  testId?: number;
  passed: boolean;
  verdict?: string | null;
  errorKind?: string | null;
  // legacy / optional detailed fields (students no longer receive IO)
  input?: string;
  expected?: string;
  actual?: string;
  stderr?: string;
}

export interface LearningFirstFailure {
  testPublicIndex: number;
  testId?: number;
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  errorKind: string;
}

export interface LearningFailureAnalysis {
  summary: string;
  likelyRootCause: string;
  nextSteps: string[];
  confidence: "low" | "medium" | "high";
}

export interface LearningFeedback {
  verdict?: string | null;
  firstFailure?: LearningFirstFailure | null;
  analysis?: LearningFailureAnalysis | null;
}

export interface LearningAttemptSummary {
  id: number;
  outcome: "failed" | "solved";
  failureCategory?: string | null;
  firstFailedTestId?: number | null;
  highestHintLevelShown?: number;
  solvedAfterFailure?: boolean;
}
export async function registerTeacher(username: string, email: string, password: string, language: "JAVA" | "PYTHON" | "CPP", turnstileToken?: string): Promise<{
  token?: string;
  user?: EduUserPayload;
  requiresEmailVerification?: boolean;
}> {
  const res = await api.post("/edu/register-teacher", {
    username,
    email,
    password,
    language,
    ...(turnstileToken ? { turnstileToken } : {}),
  });
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data;
}
export async function createClass(name: string, language: "JAVA" | "PYTHON" | "CPP", gradingSystem?: ClassGradingSystem, gradeScaleMode?: GradeScaleMode): Promise<Class> {
  const res = await api.post("/edu/classes", {
    name,
    language,
    gradingSystem,
    gradeScaleMode
  });
  return res.data.class;
}
export async function getClasses(): Promise<Class[]> {
  const res = await api.get("/edu/classes");
  return res.data.classes;
}

export type AgendaBucket = "overdue" | "today" | "soon" | "later";
export interface AgendaItemDto {
  kind: "TASK" | "CONTROL";
  id: number;
  title: string;
  deadline: string;
  deadlineMs: number;
  bucket: AgendaBucket;
  classId: number;
  className: string;
  lessonId?: number;
  topicId?: number;
}
export interface AgendaResponse {
  items: AgendaItemDto[];
  summary: Record<AgendaBucket, number>;
}
export async function getAgenda(): Promise<AgendaResponse> {
  const res = await api.get("/edu/agenda");
  return res.data;
}

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export interface AttendanceRecordDto {
  studentId: number;
  status: AttendanceStatus;
}
export interface AttendanceResponse {
  date: string;
  records: AttendanceRecordDto[];
  summary: { present: number; absent: number; late: number; excused: number; total: number };
}
export async function getAttendance(classId: number, date: string): Promise<AttendanceResponse> {
  const res = await api.get(`/edu/classes/${classId}/attendance`, { params: { date } });
  return res.data;
}
export async function setAttendance(classId: number, date: string, entries: AttendanceRecordDto[], lessonId?: number): Promise<AttendanceResponse> {
  const res = await api.post(`/edu/classes/${classId}/attendance`, { date, entries, lessonId });
  return res.data;
}

export interface SimilarityPairDto {
  a: { id: number; name: string };
  b: { id: number; name: string };
  similarity: number;
}
export interface SimilarityGroupDto {
  taskId: number;
  taskTitle: string;
  pairs: SimilarityPairDto[];
}
export interface SimilarityResponse {
  minSimilarity: number;
  groups: SimilarityGroupDto[];
}
export async function getClassSimilarity(classId: number): Promise<SimilarityResponse> {
  const res = await api.get(`/edu/classes/${classId}/similarity`);
  return res.data;
}
export interface SimilarityCompareDto {
  taskTitle: string;
  a: { studentId: number; name: string; code: string };
  b: { studentId: number; name: string; code: string };
  shared: { aShared: boolean[]; bShared: boolean[] };
}
export async function compareSimilarity(classId: number, taskId: number, a: number, b: number): Promise<SimilarityCompareDto> {
  const res = await api.get(`/edu/classes/${classId}/similarity/compare`, { params: { taskId, a, b } });
  return res.data;
}
export interface ClassDetails {
  id: number;
  name: string;
  language: "JAVA" | "PYTHON" | "CPP";
  organizationId?: number | null;
  gradingSystem: ClassGradingSystem;
  gradeScaleMode?: GradeScaleMode;
  createdAt: string;
  updatedAt: string;
}
export async function getClass(classId: number): Promise<ClassDetails> {
  const res = await api.get(`/edu/classes/${classId}`);
  return res.data.class;
}
export async function updateClassGradingSystem(classId: number, gradingSystem: ClassGradingSystem, gradeScaleMode?: GradeScaleMode): Promise<ClassDetails> {
  const res = await api.put(`/edu/classes/${classId}/grading-system`, {
    gradingSystem,
    gradeScaleMode
  });
  return res.data.class;
}
export interface AddStudentsRequest {
  students: Array<{
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
  }>;
}
export async function addStudents(classId: number, students: AddStudentsRequest["students"]): Promise<{
  count: number;
  credentials: StudentCredentials[];
}> {
  const res = await api.post(`/edu/classes/${classId}/students`, {
    students
  });
  return res.data;
}
export async function getStudents(classId: number): Promise<Student[]> {
  const res = await api.get(`/edu/classes/${classId}/students`);
  return res.data.students;
}
export async function exportStudents(classId: number, withPasswords?: boolean): Promise<Blob> {
  const res = await api.post(`/edu/classes/${classId}/students/export`, {
    withPasswords: Boolean(withPasswords)
  }, {
    responseType: "blob"
  });
  return res.data;
}
export async function importStudents(classId: number, csvData: string): Promise<{
  count: number;
  credentials: StudentCredentials[];
}> {
  const res = await api.post(`/edu/classes/${classId}/students/import`, {
    csvData
  });
  return res.data;
}
export async function regeneratePassword(studentId: number): Promise<{
  username: string;
  password: string;
}> {
  const res = await api.post(`/edu/students/${studentId}/regenerate-password`);
  return res.data;
}
export interface CreateLessonRequest {
  type: "LESSON" | "CONTROL";
  title: string;
  theory?: string;
  hasTheory: boolean;
  timeLimitMinutes?: number;
  controlHasTheory?: boolean;
  controlHasPractice?: boolean;
}
export async function createLesson(classId: number, lesson: CreateLessonRequest): Promise<Lesson> {
  const res = await api.post(`/edu/classes/${classId}/lessons`, lesson);
  return res.data.lesson;
}
export async function getLessons(classId: number): Promise<Lesson[]> {
  const res = await api.get(`/edu/classes/${classId}/lessons`);
  return res.data.lessons;
}
export interface ControlWork {
  id: number;
  title: string | null;
  formula: string | null;
  topicId: number;
}
export async function updateControlWorkFormula(controlWorkId: number, formula: string | null): Promise<{
  message: string;
  controlWorkId: number;
}> {
  const res = await api.put(`/edu/control-works/${controlWorkId}/formula`, {
    formula
  });
  return res.data;
}
export async function getStudentLessons(): Promise<Lesson[]> {
  const res = await api.get(`/edu/students/me/lessons`);
  return res.data.lessons;
}
export interface Topic {
  id: number;
  title: string;
  description?: string | null;
  order: number;
  language: "JAVA" | "PYTHON" | "CPP";
  tasks?: unknown[];
  controlWorks?: unknown[];
}
export async function getTopics(classId?: number, language?: "JAVA" | "PYTHON" | "CPP"): Promise<Topic[]> {
  const params = new URLSearchParams();
  if (classId) params.append("classId", classId.toString());
  if (language) params.append("language", language);
  const res = await api.get(`/topics?${params.toString()}`);
  return res.data.topics || [];
}
export async function getLesson(lessonId: number, type?: "TOPIC" | "CONTROL" | "LESSON"): Promise<Lesson & {
  tasks: Task[];
}> {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  const res = await api.get(`/edu/lessons/${lessonId}${qs}`);
  return res.data.lesson;
}
export async function generateTheory(lessonId: number, topicTitle: string): Promise<{
  theory: string;
}> {
  const res = await api.post(`/edu/lessons/${lessonId}/generate-theory`, {
    topicTitle
  });
  return res.data;
}
export async function generateTheoryPreview(topicTitle: string, language: "JAVA" | "PYTHON" | "CPP"): Promise<{
  theory: string;
}> {
  const res = await api.post(`/edu/generate-theory`, {
    topicTitle,
    language
  });
  return res.data;
}
export async function generateInteractiveLesson(topicTitle: string, language: "JAVA" | "PYTHON" | "CPP"): Promise<{
  lesson: unknown;
}> {
  const res = await api.post(`/edu/generate-interactive-lesson`, { topicTitle, language });
  return res.data;
}
export async function generateQuiz(lessonId: number, count?: number, topicTitle?: string): Promise<{
  count: number;
  quiz: QuizItem[];
  quizJson: string;
}> {
  const res = await api.post(`/edu/lessons/${lessonId}/generate-quiz`, {
    count,
    topicTitle
  });
  return res.data;
}
export async function saveQuiz(lessonId: number, quiz: QuizItem[]): Promise<void> {
  await api.put(`/edu/lessons/${lessonId}/quiz`, {
    quiz
  });
}
export interface CreateTaskRequest {
  title: string;
  description: string;
  template: string;
  taskMode?: "CODE" | "WEB" | "MANUAL";
  webTemplateFiles?: WebTaskFile[];
  webValidationRules?: WebTaskRule[];
  projectSpec?: {
    version: 1;
    kind: "MINI_PROJECT";
    estimatedMinutes: number;
    skills: string[];
    milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
    extensions?: string[];
  } | null;
}

export async function uploadStatementImage(file: File): Promise<{ url: string; markdown: string }> {
  const form = new FormData();
  form.append("image", file);
  const res = await api.post("/edu/statement-images", form, {
    headers: {
      "Content-Type": "multipart/form-data"
    }
  });
  return res.data;
}

export async function createTask(lessonId: number, task: CreateTaskRequest): Promise<Task> {
  const res = await api.post(`/edu/lessons/${lessonId}/tasks`, task);
  return res.data.task;
}
export async function getTask(taskId: number): Promise<TaskWithGrade> {
  const res = await api.get(`/edu/tasks/${taskId}`);
  return res.data.task;
}
export async function runCode(taskId: number, code: string, input?: string): Promise<{
  output: string;
  stderr?: string;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/run`, { code, input });
  return res.data;
}
export async function runCodeFiles(taskId: number, files: CodeFile[], input?: string): Promise<{ output: string; stderr?: string }>
{
  const res = await api.post(`/edu/tasks/${taskId}/run`, { files, input });
  return res.data;
}
export async function getWebTaskTemplate(taskId: number): Promise<{ taskId: number; taskMode: "WEB"; files: WebTaskFile[]; rules: WebTaskRule[] }> {
  const res = await api.get(`/edu/tasks/${taskId}/web-template`);
  return res.data;
}
export async function saveWebTaskDraft(taskId: number, files: WebTaskFile[]): Promise<{ ok: boolean; updatedAt?: string }> {
  const res = await api.put(`/edu/tasks/${taskId}/web-draft`, { files });
  return res.data;
}
export async function checkWebTask(taskId: number, files: WebTaskFile[]): Promise<{
  taskMode: "WEB";
  passed: boolean;
  score: number;
  maxScore: number;
  passedRules: number;
  totalRules: number;
  results: Array<{ id: string; type: WebTaskRule["type"]; passed: boolean; message: string; points: number; earnedPoints: number }>;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/web-check`, { files });
  return res.data;
}
export async function submitWebTask(taskId: number, files: WebTaskFile[]): Promise<{
  grade: {
    id: number;
    total: number | null;
    testsPassed: number;
    testsTotal: number;
    isManuallyGraded: boolean;
  };
  testResults?: TestResult[];
  scoring?: {
    score: number;
    maxScore: number;
  };
  taskMode?: "WEB";
}> {
  const res = await api.post(`/edu/tasks/${taskId}/web-submit`, { files });
  return res.data;
}
export interface SubmitCodeResponse {
  message?: string;
  grade: {
    id: number;
    total: number | null;
    testsPassed: number;
    testsTotal: number;
    isManuallyGraded: boolean;
  };
  testResults?: TestResult[];
  hints?: string[];
  requiresManualReview?: boolean;
  scoring?: {
    score: number;
    maxScore: number;
    groupScores?: Array<{
      group: string;
      score: number;
      maxScore: number;
    }> | null;
  };
  learningFeedback?: LearningFeedback;
  learningAttempt?: LearningAttemptSummary | null;
  submissionMeta?: SubmissionMeta;
}
export async function submitCode(taskId: number, code: string, binding?: SubmissionBinding): Promise<SubmitCodeResponse> {
  const res = await api.post(`/edu/tasks/${taskId}/submit`, {
    code,
    ...(binding ?? {})
  });
  return res.data;
}

export async function submitCodeFiles(taskId: number, files: CodeFile[], binding?: SubmissionBinding): Promise<SubmitCodeResponse> {
  const res = await api.post(`/edu/tasks/${taskId}/submit`, { files, ...(binding ?? {}) });
  return res.data;
}
export interface CompleteTaskResponse {
  message?: string;
  grade: {
    id: number;
    total: number | null;
    testsPassed: number;
    testsTotal: number;
    isManuallyGraded: boolean;
    isCompleted: boolean;
  };
  testResults?: TestResult[];
  hints?: string[];
  requiresManualReview?: boolean;
  scoring?: {
    score: number;
    maxScore: number;
    groupScores?: Array<{
      group: string;
      score: number;
      maxScore: number;
    }> | null;
  };
  learningFeedback?: LearningFeedback;
  learningAttempt?: LearningAttemptSummary | null;
  submissionMeta?: SubmissionMeta;
}
export async function completeTask(taskId: number, code: string, binding?: SubmissionBinding): Promise<CompleteTaskResponse> {
  const res = await api.post(`/edu/tasks/${taskId}/complete`, {
    code,
    ...(binding ?? {})
  });
  return res.data;
}

export async function completeTaskFiles(taskId: number, files: CodeFile[], binding?: SubmissionBinding): Promise<CompleteTaskResponse> {
  const res = await api.post(`/edu/tasks/${taskId}/complete`, { files, ...(binding ?? {}) });
  return res.data;
}

export type HintFeedbackSignal = "up" | "down";
export type HintFeedbackReasonCode = "HELPFUL" | "NOT_SPECIFIC" | "INCORRECT" | "TOO_HARD" | "TOO_VERBOSE" | "OTHER";

export async function submitHintFeedback(taskId: number, payload: {
  submissionId?: string;
  codeHash: string;
  strategyVariant?: "A" | "B";
  verdict?: string | null;
  signal: HintFeedbackSignal;
  reasonCode?: HintFeedbackReasonCode;
  reasonText?: string;
  hintsShown?: number;
  hintsTotal?: number;
}): Promise<{
  message: string;
  stored: boolean;
  id?: number | null;
  strategyVariant?: "A" | "B";
}> {
  const res = await api.post(`/edu/tasks/${taskId}/hints-feedback`, payload);
  return res.data;
}

export async function generateTestData(taskId: number, count: number, options?: {
  replaceGenerated?: boolean;
}): Promise<{
  count: number;
  skippedDuplicates?: number;
  replacedGeneratedCount?: number;
  testData: Array<{
    id: number;
    input: string;
    expectedOutput: string;
    points: number;
    isHidden?: boolean;
    source?: "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED";
    subtask?: string | null;
  }>;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/test-data/generate`, {
    count,
    ...(typeof options?.replaceGenerated === "boolean" ? { replaceGenerated: options.replaceGenerated } : {})
  });
  return res.data;
}
export interface TestDataItem {
  input: string;
  expectedOutput: string;
  points: number;
  isHidden?: boolean;
  subtask?: string | null;
}
export async function addTestData(taskId: number, testData: TestDataItem[]): Promise<{
  count: number;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/test-data`, {
    testData
  });
  return res.data;
}
export interface TestData {
  id: number;
  input: string;
  expectedOutput?: string;
  points: number;
  isHidden?: boolean;
  source?: "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED";
  subtask?: string | null;
  isInputTruncated?: boolean;
  inputFullLength?: number;
  isExpectedOutputTruncated?: boolean;
  expectedOutputFullLength?: number;
}
export interface TestDataPagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}
export interface GetTestDataOptions {
  preview?: boolean;
  previewChars?: number;
  limit?: number;
  offset?: number;
  source?: "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED" | "ALL";
}
export async function getTestData(taskId: number, options?: GetTestDataOptions): Promise<{
  testData: TestData[];
  pagination?: TestDataPagination;
}> {
  const params = new URLSearchParams();
  if (options?.preview) {
    params.set("preview", "1");
  }
  if (typeof options?.previewChars === "number" && Number.isFinite(options.previewChars)) {
    params.set("previewChars", String(Math.trunc(options.previewChars)));
  }
  if (typeof options?.limit === "number" && Number.isFinite(options.limit)) {
    params.set("limit", String(Math.trunc(options.limit)));
  }
  if (typeof options?.offset === "number" && Number.isFinite(options.offset)) {
    params.set("offset", String(Math.trunc(options.offset)));
  }
  if (typeof options?.source === "string" && options.source !== "ALL") {
    params.set("source", options.source);
  }
  const query = params.toString();
  const res = await api.get(`/edu/tasks/${taskId}/test-data${query ? `?${query}` : ""}`);
  return res.data;
}
export async function deleteGeneratedTestData(taskId: number): Promise<{
  message: string;
  deleted: number;
}> {
  const res = await api.delete(`/edu/tasks/${taskId}/test-data/generated`);
  return res.data;
}
export async function getTestDataItem(taskId: number, testDataId: number): Promise<{
  testData: TestData;
}> {
  const res = await api.get(`/edu/tasks/${taskId}/test-data/${testDataId}`);
  return res.data;
}
export async function updateTestData(taskId: number, testDataId: number, update: {
  input?: string;
  expectedOutput?: string;
  points?: number;
  isHidden?: boolean;
  subtask?: string | null;
}): Promise<{
  message: string;
  testData: TestData;
}> {
  const res = await api.put(`/edu/tasks/${taskId}/test-data/${testDataId}`, update);
  return res.data;
}
export async function deleteTestData(taskId: number, testDataId: number): Promise<{
  message: string;
}> {
  const res = await api.delete(`/edu/tasks/${taskId}/test-data/${testDataId}`);
  return res.data;
}
export interface UpdateTaskDetailsRequest {
  maxAttempts?: number;
  deadline?: string | null;
  isClosed?: boolean;
}
export async function updateTaskDetails(taskId: number, update: UpdateTaskDetailsRequest): Promise<{
  message: string;
  task: {
    id: number;
    maxAttempts: number;
    deadline: string | null;
    isClosed: boolean;
  };
}> {
  const res = await api.put(`/edu/tasks/${taskId}`, update);
  return res.data;
}
export interface CreateManualGradeRequest {
  total: number;
  feedback?: string;
}
export async function createManualGrade(taskId: number, studentId: number, grade: CreateManualGradeRequest): Promise<{
  message: string;
  grade: {
    id: number;
    total: number;
    feedback?: string;
    isManuallyGraded: boolean;
  };
}> {
  const res = await api.post(`/edu/tasks/${taskId}/grades/${studentId}`, grade);
  return res.data;
}
export async function deleteTaskGrade(taskId: number, studentId: number): Promise<{
  message: string;
  deleted: number;
}> {
  const res = await api.delete(`/edu/tasks/${taskId}/grades/${studentId}`);
  return res.data;
}
export async function getMyStudentInfo(): Promise<{
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
    class: {
      id: number;
      name: string;
      language: "JAVA" | "PYTHON" | "CPP";
      gradingSystem?: ClassGradingSystem;
      gradeScaleMode?: GradeScaleMode;
    };
  };
}> {
  const res = await api.get("/edu/students/me");
  return res.data;
}
export type SummaryGrade = {
  id: number;
  name: string;
  subject: string;
  grade: number;
  assessmentType?: "PRACTICE" | "INTERMEDIATE" | "CONTROL" | "SEMESTER";
  controlWorkId?: number | null;
  controlWorkTitle?: string | null;
  topicId?: number | null;
  topicTitle?: string | null;
  semester?: number | null;
  createdAt: string;
};
export interface StudentGradesResponse {
  grades: Grade[];
  summaryGrades: SummaryGrade[];
  gradingSystem?: ClassGradingSystem;
  gradeScaleMode?: GradeScaleMode;
}
export async function getStudentGrades(studentId: number): Promise<StudentGradesResponse> {
  const res = await api.get(`/edu/students/${studentId}/grades`);
  return res.data;
}

export type GradeAppealTargetType = "EDU_GRADE" | "SUMMARY_GRADE";
export type GradeAppealStatus =
  | "SUBMITTED"
  | "IN_REVIEW"
  | "NEEDS_INFO"
  | "RESOLVED_ACCEPTED"
  | "RESOLVED_PARTIAL"
  | "RESOLVED_REJECTED"
  | "CANCELLED";
export type GradeAppealReasonCode =
  | "CHECK_TEST_RESULTS"
  | "CHECK_FEEDBACK"
  | "CHECK_CALCULATION"
  | "CHECK_THEMATIC"
  | "OTHER";

export interface GradeAppealItem {
  id: number;
  status: GradeAppealStatus;
  targetType: GradeAppealTargetType;
  targetId: number | null;
  targetTitle: string;
  classId: number | null;
  className: string | null;
  studentId: number | null;
  studentName: string;
  reasonCode: GradeAppealReasonCode;
  reasonText: string;
  desiredOutcome: string | null;
  resolutionText: string | null;
  previousGrade: number | null;
  newGrade: number | null;
  gradeChanged: boolean;
  startedReviewAt: string | null;
  resolvedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  slaDueAt?: string | null;
  slaRemainingSeconds?: number | null;
  slaState?: "ON_TRACK" | "AT_RISK" | "OVERDUE" | "CLOSED";
  escalationLevel?: "NONE" | "WARNING" | "ESCALATED";
  isEscalated?: boolean;
  canStudentReply: boolean;
  canStudentCancel: boolean;
  canTeacherReply: boolean;
  canTeacherResolve: boolean;
}

export interface GradeAppealMessageItem {
  id: number;
  senderType: "STUDENT" | "TEACHER" | "SYSTEM";
  senderName: string;
  senderUserId: number | null;
  senderStudentId: number | null;
  text: string;
  createdAt: string | null;
}

export async function createGradeAppeal(payload: {
  targetType: GradeAppealTargetType;
  targetId: number;
  reasonCode: GradeAppealReasonCode;
  reasonText: string;
  desiredOutcome?: string;
}): Promise<{
  message: string;
  appeal: GradeAppealItem;
}> {
  const res = await api.post("/edu/appeals", payload);
  return res.data;
}

export async function getMyGradeAppeals(): Promise<GradeAppealItem[]> {
  const res = await api.get("/edu/appeals/mine");
  return res.data.appeals || [];
}

export async function getMyGradeAppeal(appealId: number): Promise<{
  appeal: GradeAppealItem;
  messages: GradeAppealMessageItem[];
}> {
  const res = await api.get(`/edu/appeals/${appealId}`);
  return {
    appeal: res.data.appeal,
    messages: res.data.messages || []
  };
}

export async function postMyGradeAppealMessage(appealId: number, text: string): Promise<{
  message: string;
  item: GradeAppealMessageItem;
}> {
  const res = await api.post(`/edu/appeals/${appealId}/messages`, { text });
  return res.data;
}

export async function cancelMyGradeAppeal(appealId: number, reason?: string): Promise<{
  message: string;
  appeal: GradeAppealItem;
}> {
  const res = await api.patch(`/edu/appeals/${appealId}/cancel`, {
    reason: reason?.trim() || undefined
  });
  return res.data;
}

export async function getClassGradeAppeals(classId: number, status?: GradeAppealStatus[]): Promise<GradeAppealItem[]> {
  const params = new URLSearchParams();
  if (Array.isArray(status) && status.length > 0) {
    params.set("status", status.join(","));
  }
  const query = params.toString();
  const res = await api.get(`/edu/classes/${classId}/appeals${query ? `?${query}` : ""}`);
  return res.data.appeals || [];
}

export async function getClassGradeAppeal(classId: number, appealId: number): Promise<{
  appeal: GradeAppealItem;
  messages: GradeAppealMessageItem[];
}> {
  const res = await api.get(`/edu/classes/${classId}/appeals/${appealId}`);
  return {
    appeal: res.data.appeal,
    messages: res.data.messages || []
  };
}

export async function updateClassGradeAppealStatus(classId: number, appealId: number, payload: {
  status: "IN_REVIEW" | "NEEDS_INFO";
  message?: string;
}): Promise<{
  message: string;
  appeal: GradeAppealItem;
}> {
  const res = await api.patch(`/edu/classes/${classId}/appeals/${appealId}/status`, payload);
  return res.data;
}

export async function postClassGradeAppealMessage(classId: number, appealId: number, text: string): Promise<{
  message: string;
  item: GradeAppealMessageItem;
}> {
  const res = await api.post(`/edu/classes/${classId}/appeals/${appealId}/messages`, { text });
  return res.data;
}

export async function resolveClassGradeAppeal(classId: number, appealId: number, payload: {
  outcome: "RESOLVED_ACCEPTED" | "RESOLVED_PARTIAL" | "RESOLVED_REJECTED";
  resolutionText: string;
  applyGradeChange?: boolean;
  newGrade?: number;
  message?: string;
}): Promise<{
  message: string;
  appeal: GradeAppealItem;
}> {
  const res = await api.post(`/edu/classes/${classId}/appeals/${appealId}/resolve`, payload);
  return res.data;
}

export interface TaskGrade {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
  };
  grade: {
    id: number;
    total: number;
    testsPassed: number;
    testsTotal: number;
    feedback?: string;
    isManuallyGraded: boolean;
    createdAt: string;
  } | null;
}
export async function getTaskGrades(taskId: number): Promise<TaskGrade[]> {
  const res = await api.get(`/edu/tasks/${taskId}/grades`);
  return res.data.students;
}
export async function getStudentCode(gradeId: number): Promise<{
  code: string;
  grade: {
    id: number;
    total: number;
    feedback?: string;
    testsPassed: number;
    testsTotal: number;
    isManuallyGraded: boolean;
  };
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
  };
  task: {
    id: number;
    title: string;
  };
}> {
  const res = await api.get(`/edu/grades/${gradeId}/code`);
  return res.data;
}
export interface UpdateGradeRequest {
  total?: number;
  feedback?: string;
}
export async function updateGrade(gradeId: number, update: UpdateGradeRequest): Promise<{
  message: string;
  grade: {
    id: number;
    total: number;
    feedback?: string;
    isManuallyGraded: boolean;
  };
}> {
  const res = await api.put(`/edu/grades/${gradeId}`, update);
  return res.data;
}

export interface RubricCriterion {
  id: string;
  label: string;
  maxPoints: number;
}
export async function getTaskRubric(taskId: number): Promise<{ rubric: RubricCriterion[] }> {
  const res = await api.get(`/edu/tasks/${taskId}/rubric`);
  return res.data;
}
export async function setTaskRubric(taskId: number, rubric: RubricCriterion[]): Promise<{ rubric: RubricCriterion[] }> {
  const res = await api.put(`/edu/tasks/${taskId}/rubric`, { rubric });
  return res.data;
}
export async function gradeByRubric(gradeId: number, scores: Record<string, number>, feedback?: string): Promise<{ message: string; grade: { id: number; total: number; feedback?: string } }> {
  const res = await api.post(`/edu/grades/${gradeId}/rubric`, { scores, feedback });
  return res.data;
}

export type ReviewSeverity = "info" | "suggestion" | "warning" | "error";
export interface ReviewComment {
  line: number | null;
  severity: ReviewSeverity;
  message: string;
}
export interface CodeReviewResult {
  summary: string;
  comments: ReviewComment[];
}
export async function aiReviewGrade(gradeId: number): Promise<{ review: CodeReviewResult }> {
  const res = await api.post(`/edu/grades/${gradeId}/ai-review`);
  return res.data;
}

export interface TutorAnswerDto {
  answer: string;
  tips: string[];
}
export async function askAiTutor(question: string): Promise<{ tutor: TutorAnswerDto }> {
  const res = await api.post(`/edu/tutor`, { question });
  return res.data;
}

export interface PendingReview {
  gradeId: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string;
    email: string;
  };
  task: {
    id: number;
    title: string;
    rubric?: RubricCriterion[];
    lesson?: {
      id: number;
      title: string;
      type: "LESSON" | "CONTROL";
    };
    topic?: {
      id: number;
      title: string;
    };
    type?: "PRACTICE" | "CONTROL";
  } | null;
  submittedCode: string | null;
  submittedAt: string;
  system: "old" | "new";
}
export async function getPendingReviews(): Promise<{
  pendingReviews: PendingReview[];
}> {
  const res = await api.get("/edu/tasks/pending-review");
  return res.data;
}
export interface ClassAnnouncementDto {
  id: number;
  title: string | null;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: number;
    name: string;
  };
}
export async function getClassAnnouncements(classId: number): Promise<{
  announcements: ClassAnnouncementDto[];
}> {
  const res = await api.get(`/edu/classes/${classId}/announcements`);
  return res.data;
}
export async function createClassAnnouncement(classId: number, payload: {
  title?: string | null;
  content: string;
  pinned?: boolean;
}): Promise<{
  message: string;
  id: number;
}> {
  const res = await api.post(`/edu/classes/${classId}/announcements`, payload);
  return res.data;
}
export async function updateClassAnnouncement(classId: number, id: number, payload: {
  title?: string | null;
  content?: string;
  pinned?: boolean;
}): Promise<{
  message: string;
}> {
  const res = await api.put(`/edu/classes/${classId}/announcements/${id}`, payload);
  return res.data;
}
export async function deleteClassAnnouncement(classId: number, id: number): Promise<{
  message: string;
}> {
  const res = await api.delete(`/edu/classes/${classId}/announcements/${id}`);
  return res.data;
}
export async function getMyAnnouncements(): Promise<{
  class: {
    id: number;
    name: string;
  };
  announcements: ClassAnnouncementDto[];
}> {
  const res = await api.get(`/edu/students/me/announcements`);
  return res.data;
}
export interface CreateSummaryGradeRequest {
  name: string;
  topicId: number;
  studentGrades?: Array<{
    studentId: number;
    grade: number;
  }>;
}
export async function createSummaryGrade(classId: number, request: CreateSummaryGradeRequest): Promise<{
  count: number;
}> {
  const res = await api.post(`/edu/classes/${classId}/summary-grades`, request);
  return res.data;
}
export interface SummaryGradeGroup {
  name: string;
  grades: Array<{
    id: number;
    studentId: number;
    studentName: string;
    grade: number;
    createdAt: string;
  }>;
}
export async function getSummaryGrades(classId: number): Promise<SummaryGradeGroup[]> {
  const res = await api.get(`/edu/classes/${classId}/summary-grades`);
  return res.data.summaryGrades;
}
export async function updateSummaryGrade(classId: number, summaryGradeId: number, grade: number): Promise<void> {
  await api.put(`/edu/classes/${classId}/summary-grades/${summaryGradeId}`, {
    grade
  });
}
export async function deleteSummaryGrade(classId: number, summaryGradeId: number): Promise<void> {
  await api.delete(`/edu/classes/${classId}/summary-grades/${summaryGradeId}`);
}
export async function deleteThematicForTopic(classId: number, topicId: number): Promise<{
  message: string;
  deleted: number;
}> {
  const res = await api.delete(`/edu/classes/${classId}/topics/${topicId}/thematic`);
  return res.data;
}

// --- Thematic formula & semester configuration ---
export interface ThematicConfigTopic {
  topicId: number;
  title: string;
  thematicFormula: string | null;
  semester: number | null;
}
export interface ThematicConfig {
  classFormula: string | null;
  topics: ThematicConfigTopic[];
}
export async function getThematicConfig(classId: number): Promise<ThematicConfig> {
  const res = await api.get(`/edu/classes/${classId}/thematic-config`);
  return res.data;
}
export async function updateClassThematicFormula(classId: number, formula: string | null): Promise<{ classFormula: string | null }> {
  const res = await api.put(`/edu/classes/${classId}/thematic-formula`, { formula });
  return res.data;
}
export async function updateTopicThematicFormula(classId: number, topicId: number, formula: string | null): Promise<{ topicId: number; thematicFormula: string | null }> {
  const res = await api.put(`/edu/classes/${classId}/topics/${topicId}/thematic-formula`, { formula });
  return res.data;
}
export async function updateTopicSemester(classId: number, topicId: number, semester: number | null): Promise<{ topicId: number; semester: number | null }> {
  const res = await api.put(`/edu/classes/${classId}/topics/${topicId}/semester`, { semester });
  return res.data;
}
export interface SemesterGradeRow {
  gradeId: number;
  studentId: number | null;
  semester: number | null;
  grade: number;
}
export async function getSemesterGrades(classId: number): Promise<SemesterGradeRow[]> {
  const res = await api.get(`/edu/classes/${classId}/semester-grades`);
  return res.data.semesterGrades;
}
export async function recomputeSemesterGrades(classId: number): Promise<{ count: number; semesters: number[] }> {
  const res = await api.post(`/edu/classes/${classId}/semester-grades/recompute`, {});
  return res.data;
}
export async function updateSemesterGrade(classId: number, gradeId: number, grade: number): Promise<{ gradeId: number; grade: number }> {
  const res = await api.put(`/edu/classes/${classId}/semester-grades/${gradeId}`, { grade });
  return res.data;
}
export interface GradebookStudent {
  studentId: number;
  studentName: string;
  grades: Array<{
    taskId: number;
    taskTitle: string;
    lessonId: number;
    lessonTitle: string;
    lessonType?: string;
    grade: number | null;
    gradeId: number | null;
    createdAt: string | null;
    isControlWork?: boolean;
    isSummaryGrade?: boolean;
    isSemesterGrade?: boolean;
  }>;
}
export interface GradebookLesson {
  id: number;
  title: string;
  type: string;
  parentId?: number;
  parentTitle?: string;
  tasks: Array<{
    id: number;
    title: string;
    type?: string;
  }>;
}
export interface GradebookResponse {
  students: GradebookStudent[];
  lessons: GradebookLesson[];
  gradingSystem: ClassGradingSystem;
  gradeScaleMode?: GradeScaleMode;
}
export async function getClassGradebook(classId: number): Promise<GradebookResponse> {
  const res = await api.get(`/edu/classes/${classId}/gradebook`);
  return res.data;
}
export interface ControlWorkDetails {
  controlWork: {
    id: number;
    title: string;
    hasTheory: boolean;
    hasPractice: boolean;
  };
  summaryGrade: {
    id: number;
    grade: number;
    theoryGrade: number | null;
    createdAt: string;
  } | null;
  practiceTasks: Array<{
    taskId: number;
    taskTitle: string;
    grade: number | null;
    testsPassed: number;
    testsTotal: number;
    feedback: string | null;
    createdAt: string | null;
  }>;
  averagePracticeGrade: number;
  calculatedGrade: number | null;
}
export async function getControlWorkDetails(controlWorkId: number, studentId: number): Promise<ControlWorkDetails> {
  const res = await api.get(`/edu/control-works/${controlWorkId}/students/${studentId}/details`);
  return res.data;
}
export interface TopicTaskStudentWork {
  task: {
    id: number;
    title: string;
    type: "PRACTICE" | "CONTROL";
    topicId: number;
    topicTitle: string;
  };
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  };
  submissions: Array<{
    id: number;
    total: number | null;
    testsPassed: number;
    testsTotal: number;
    feedback: string | null;
    isManuallyGraded: boolean;
    isCompleted: boolean;
    submittedCode: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
  submissionsTotal: number;
  hasMore: boolean;
  nextCursor: number | null;
}

export interface GetTopicTaskStudentWorkOptions {
  limit?: number;
  beforeId?: number;
}

export async function getTopicTaskStudentWork(taskId: number, studentId: number, options?: GetTopicTaskStudentWorkOptions): Promise<TopicTaskStudentWork> {
  const params = new URLSearchParams();
  if (options?.limit && Number.isFinite(options.limit)) {
    params.set("limit", String(Math.trunc(options.limit)));
  }
  if (options?.beforeId && Number.isFinite(options.beforeId)) {
    params.set("beforeId", String(Math.trunc(options.beforeId)));
  }
  const qs = params.toString();
  const res = await api.get(`/edu/topic-tasks/${taskId}/students/${studentId}/work${qs ? `?${qs}` : ""}`);
  return res.data;
}

export type AIDetectorLikelihood = "unlikely" | "possible" | "likely";

export interface TopicTaskAIDetectionResponse {
  message?: string;
  task: {
    id: number;
    title: string;
    topicId?: number;
    topicTitle?: string;
  };
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  };
  gradeId?: number;
  createdAt?: string | null;
  detection: null | {
    likelihood: AIDetectorLikelihood;
    score: number;
    reasons: string[];
    caveats: string[];
    suggestedChecks: string[];
    model: string;
    cached: boolean;
  };
}

export async function getTopicTaskAIDetection(taskId: number, studentId: number): Promise<TopicTaskAIDetectionResponse> {
  const res = await api.get(`/edu/topic-tasks/${taskId}/students/${studentId}/ai-detect`);
  return res.data;
}

export type LiveStatus = "not_started" | "in_progress" | "stuck" | "passed";
export interface LiveStudentStatus {
  studentId: number;
  name: string;
  status: LiveStatus;
  lastVerdict: string | null;
  testsPassed: number | null;
  testsTotal: number | null;
  lastActivityMs: number | null;
}
export interface LiveSnapshot {
  totals: Record<LiveStatus, number>;
  students: LiveStudentStatus[];
  generatedAtMs: number;
}

export async function getLiveMonitor(classId: number, taskId: number): Promise<LiveSnapshot> {
  const res = await api.get(`/edu/classes/${classId}/topic-tasks/${taskId}/live`);
  return res.data as LiveSnapshot;
}
export interface ControlWorkStudentWork {
  controlWork: {
    id: number;
    title: string | null;
    hasTheory: boolean;
    hasPractice: boolean;
  };
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName?: string | null;
  };
  summaryGrade: {
    id: number;
    grade: number;
    theoryGrade: number | null;
    createdAt: string | null;
  } | null;
  quizReview: {
    version: number;
    correctAnswers: number;
    totalQuestions: number;
    questions: Array<{
      index: number;
      question: string;
      options: Record<string, string>;
      correct: string;
      student: string | null;
      isCorrect: boolean;
    }>;
  } | null;
  practiceTasks: Array<{
    taskId: number;
    taskTitle: string;
    grade: number | null;
    gradeId: number | null;
    testsPassed: number;
    testsTotal: number;
    feedback: string | null;
    isManuallyGraded: boolean;
    submittedCode: string | null;
    testResults: string | null;
    createdAt: string | null;
  }>;
}
export async function getControlWorkStudentWork(controlWorkId: number, studentId: number): Promise<ControlWorkStudentWork> {
  const res = await api.get(`/edu/control-works/${controlWorkId}/students/${studentId}/work`);
  return res.data;
}
export async function unassignTask(taskId: number): Promise<void> {
  await api.post(`/topics/tasks/${taskId}/unassign`);
}
export async function unassignControlWork(controlWorkId: number): Promise<void> {
  await api.post(`/topics/control-works/${controlWorkId}/unassign`);
}
export async function updateControlWorkGrade(controlWorkId: number, studentId: number, grade: number): Promise<{
  message: string;
  summaryGrade: {
    id: number;
    grade: number;
  };
}> {
  const res = await api.put(`/edu/control-works/${controlWorkId}/students/${studentId}/grade`, {
    grade
  });
  return res.data;
}
export async function submitQuizAnswers(taskOrLessonId: number, answers: Record<number, string>, isLessonId?: boolean): Promise<{
  message: string;
  grade: {
    id: number;
    theoryGrade: number;
    correctAnswers: number;
    totalQuestions: number;
  };
  review?: {
    version: number;
    correctAnswers: number;
    totalQuestions: number;
    questions: Array<{
      index: number;
      question: string;
      options: Record<string, string>;
      correct: string;
      student: string | null;
      isCorrect: boolean;
    }>;
  };
}> {
  const endpoint = isLessonId ? `/edu/lessons/${taskOrLessonId}/submit-quiz` : `/edu/tasks/${taskOrLessonId}/submit-quiz`;
  const res = await api.post(endpoint, {
    answers
  });
  return res.data;
}
export async function startLessonAttempt(lessonId: number): Promise<{
  attemptId: number;
  startedAt: string;
  timeLimitMinutes: number;
  remainingSeconds: number;
}> {
  const res = await api.post(`/edu/lessons/${lessonId}/start-attempt`);
  return res.data;
}
export async function getLessonAttemptStatus(lessonId: number): Promise<{
  hasActiveAttempt: boolean;
  remainingSeconds: number;
  startedAt?: string;
  timeLimitMinutes?: number;
  status?: string;
  finishedAt?: string;
}> {
  const res = await api.get(`/edu/lessons/${lessonId}/attempt-status`);
  return res.data;
}
export async function getControlWorkStatus(lessonId: number): Promise<{
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  startedAt?: string;
  timeLimitMinutes?: number;
  finishedAt?: string;
}> {
  const res = await api.get(`/edu/lessons/${lessonId}/control-work-status`);
  return res.data;
}

export type MasteryStatus = "NOT_STARTED" | "IN_PROGRESS" | "MASTERED";
export type RecommendedDifficulty = "EASY" | "MEDIUM" | "HARD";

export interface StudentMasteryTopic {
  topicId: number;
  title: string;
  order: number;
  status: MasteryStatus;
  masteryPercent: number;
  averageScore: number;
  attemptedTasks: number;
  completedTasks: number;
  totalTasks: number;
  recommendedDifficulty: RecommendedDifficulty;
  nextTaskId: number | null;
  nextTaskTitle: string | null;
  lastActivityAt: string | null;
}

export interface StudentTaskRecommendation {
  topicId: number;
  topicTitle: string;
  taskId: number;
  taskTitle: string;
  reason: string;
  priority: number;
  estimatedEffort: "short" | "medium" | "long";
}

export interface StudentMasteryPathResponse {
  locale: "uk" | "en";
  student: {
    id: number;
    classId: number;
    className: string;
    language: "JAVA" | "PYTHON" | "CPP";
  };
  summary: {
    topicsTotal: number;
    masteredTopics: number;
    inProgressTopics: number;
    notStartedTopics: number;
    averageMasteryPercent: number;
  };
  topics: StudentMasteryTopic[];
  nextRecommendations: StudentTaskRecommendation[];
  generatedAt: string;
}

export interface StudentSkillGraphNode {
  id: string;
  topicId: number;
  label: string;
  order: number;
  status: MasteryStatus;
  statusLabel: string;
  masteryPercent: number;
  averageScore: number;
  recommendedDifficulty: RecommendedDifficulty;
  nextTaskId: number | null;
  nextTaskTitle: string | null;
}

export interface StudentSkillGraphResponse {
  locale: "uk" | "en";
  summary: StudentMasteryPathResponse["summary"];
  nodes: StudentSkillGraphNode[];
  edges: Array<{
    from: string;
    to: string;
    relation: "PREREQUISITE";
  }>;
  recommendedPath: string[];
  generatedAt: string;
}

export interface StudentNextTaskResponse {
  locale: "uk" | "en";
  message: string;
  recommendation: StudentTaskRecommendation | null;
  alternatives: StudentTaskRecommendation[];
  generatedAt: string;
}

export interface CohortTaskInsight {
  taskId: number;
  title: string;
  type: "PRACTICE" | "CONTROL";
  avgScore: number;
  completionRate: number;
  passRate: number;
  attemptedStudents: number;
  commonErrorKinds: Array<{ kind: string; count: number }>;
}

export interface CohortTopicInsight {
  topicId: number;
  title: string;
  order: number;
  tasksTotal: number;
  avgScore: number;
  completionRate: number;
  passRate: number;
  weakTasks: CohortTaskInsight[];
  commonErrorKinds: Array<{ kind: string; count: number }>;
}

export interface CohortAnalyticsResponse {
  locale: "uk" | "en";
  classId: number;
  className: string;
  studentsCount: number;
  overview: {
    avgScore: number;
    completionRate: number;
    passRate: number;
    riskStudentsCount: number;
    tasksTracked: number;
  };
  riskStudents: Array<{
    studentId: number;
    studentName: string;
    avgScore: number;
    completionRate: number;
    weakTasks: number;
  }>;
  topics: CohortTopicInsight[];
  commonErrorKinds: Array<{ kind: string; count: number }>;
  generatedAt: string;
}

export interface TeacherCopilotSuggestion {
  id: string;
  type: "REMEDIATION" | "PACING" | "FOCUS_SUPPORT" | "ASSESSMENT" | "ENRICHMENT";
  priority: "high" | "medium" | "low";
  title: string;
  rationale: string;
  actions: string[];
  relatedTopicId: number | null;
  relatedStudentIds: number[];
}

export interface TeacherCopilotResponse {
  locale: "uk" | "en";
  classId: number;
  className: string;
  generatedBy: string;
  summary: {
    avgScore: number;
    completionRate: number;
    passRate: number;
    riskStudentsCount: number;
  };
  suggestions: TeacherCopilotSuggestion[];
  generatedAt: string;
}

export interface HintsQualityResponse {
  locale: "uk" | "en";
  classId: number;
  windowDays: number;
  totalFeedback: number;
  positiveCount: number;
  negativeCount: number;
  positiveRate: number;
  helpfulnessScore: number;
  byReason: Array<{
    reasonCode: string;
    count: number;
    positiveRate: number;
  }>;
  byVariant: Array<{
    variant: "A" | "B";
    count: number;
    positiveRate: number;
  }>;
  generatedAt: string;
}

export interface TeacherDigestResponse {
  locale: "uk" | "en";
  classId: number;
  className: string;
  windowDays: number;
  period: {
    from: string;
    to: string;
  };
  overview: CohortAnalyticsResponse["overview"];
  appeals: {
    total: number;
    active: number;
    resolved: number;
    newInWindow: number;
    overdueActive: number;
    escalatedActive: number;
    avgResolutionHours: number;
  };
  hints: HintsQualityResponse;
  recommendations: TeacherCopilotSuggestion[];
  generatedAt: string;
}

export interface RiskInterventionPlanResponse {
  locale: "uk" | "en";
  classId: number;
  className: string;
  dryRun: boolean;
  studentsTargeted: Array<{
    studentId: number;
    studentName: string;
  }>;
  tasksSelected: Array<{
    taskId: number;
    title: string;
    topicId: number;
    topicTitle: string;
  }>;
  deadlineAppliedAt: string | null;
  updatedTasks: number;
  generatedAt: string;
}

export type TeacherOSAlertSeverity = "critical" | "warning" | "info";

export interface TeacherOSAlert {
  id: string;
  severity: TeacherOSAlertSeverity;
  title: string;
  description: string;
  metric?: string;
}

export interface TeacherOSSnapshotQuery {
  responseLanguage?: "uk" | "en";
  days?: number;
  limitStudents?: number;
  maxTasksPerStudent?: number;
  topicId?: number;
  deadlineDays?: number;
}

export interface TeacherOSSnapshotResponse {
  locale: "uk" | "en";
  classId: number;
  className: string;
  generatedAt: string;
  analytics: CohortAnalyticsResponse | null;
  copilot: TeacherCopilotResponse | null;
  hints: HintsQualityResponse | null;
  digest: TeacherDigestResponse | null;
  riskPlan: RiskInterventionPlanResponse | null;
  activeAppeals: GradeAppealItem[];
  alerts: TeacherOSAlert[];
}

function withResponseLanguage(lang?: "uk" | "en"): string {
  if (!lang) return "";
  const params = new URLSearchParams();
  params.set("responseLanguage", lang);
  return `?${params.toString()}`;
}

export async function getStudentMasteryPath(responseLanguage?: "uk" | "en"): Promise<StudentMasteryPathResponse> {
  const res = await api.get(`/edu/students/me/mastery-path${withResponseLanguage(responseLanguage)}`);
  return res.data;
}

export async function getStudentSkillGraph(responseLanguage?: "uk" | "en"): Promise<StudentSkillGraphResponse> {
  const res = await api.get(`/edu/students/me/skill-graph${withResponseLanguage(responseLanguage)}`);
  return res.data;
}

export async function getStudentNextTaskRecommendation(responseLanguage?: "uk" | "en"): Promise<StudentNextTaskResponse> {
  const res = await api.get(`/edu/students/me/next-task${withResponseLanguage(responseLanguage)}`);
  return res.data;
}

export async function getClassCohortAnalytics(classId: number, responseLanguage?: "uk" | "en"): Promise<CohortAnalyticsResponse> {
  const res = await api.get(`/edu/classes/${classId}/cohort-analytics${withResponseLanguage(responseLanguage)}`);
  return res.data;
}

export async function getTeacherCopilotRecommendations(classId: number, responseLanguage?: "uk" | "en"): Promise<TeacherCopilotResponse> {
  const res = await api.get(`/edu/classes/${classId}/teacher-copilot${withResponseLanguage(responseLanguage)}`);
  return res.data;
}

function withInsightsQuery(params: {
  responseLanguage?: "uk" | "en";
  days?: number;
  limitStudents?: number;
  maxTasksPerStudent?: number;
  topicId?: number;
  deadlineDays?: number;
}): string {
  const query = new URLSearchParams();
  if (params.responseLanguage) query.set("responseLanguage", params.responseLanguage);
  if (typeof params.days === "number" && Number.isFinite(params.days)) query.set("days", String(Math.trunc(params.days)));
  if (typeof params.limitStudents === "number" && Number.isFinite(params.limitStudents)) query.set("limitStudents", String(Math.trunc(params.limitStudents)));
  if (typeof params.maxTasksPerStudent === "number" && Number.isFinite(params.maxTasksPerStudent)) query.set("maxTasksPerStudent", String(Math.trunc(params.maxTasksPerStudent)));
  if (typeof params.topicId === "number" && Number.isFinite(params.topicId)) query.set("topicId", String(Math.trunc(params.topicId)));
  if (typeof params.deadlineDays === "number" && Number.isFinite(params.deadlineDays)) query.set("deadlineDays", String(Math.trunc(params.deadlineDays)));
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export async function getClassHintsQuality(classId: number, params?: {
  responseLanguage?: "uk" | "en";
  days?: number;
}): Promise<HintsQualityResponse> {
  const res = await api.get(`/edu/classes/${classId}/hints-quality${withInsightsQuery({
    responseLanguage: params?.responseLanguage,
    days: params?.days,
  })}`);
  return res.data;
}

export async function getTeacherDigest(classId: number, params?: {
  responseLanguage?: "uk" | "en";
  days?: number;
}): Promise<TeacherDigestResponse> {
  const res = await api.get(`/edu/classes/${classId}/teacher-digest${withInsightsQuery({
    responseLanguage: params?.responseLanguage,
    days: params?.days,
  })}`);
  return res.data;
}

export async function getRiskInterventionPlan(classId: number, params?: {
  responseLanguage?: "uk" | "en";
  limitStudents?: number;
  maxTasksPerStudent?: number;
  topicId?: number;
  deadlineDays?: number;
}): Promise<RiskInterventionPlanResponse> {
  const res = await api.get(`/edu/classes/${classId}/risk-interventions${withInsightsQuery({
    responseLanguage: params?.responseLanguage,
    limitStudents: params?.limitStudents,
    maxTasksPerStudent: params?.maxTasksPerStudent,
    topicId: params?.topicId,
    deadlineDays: params?.deadlineDays,
  })}`);
  return res.data;
}

export async function applyRiskInterventionPlan(classId: number, payload?: {
  dryRun?: boolean;
  limitStudents?: number;
  maxTasksPerStudent?: number;
  topicId?: number;
  deadlineDays?: number;
}): Promise<RiskInterventionPlanResponse> {
  const res = await api.post(`/edu/classes/${classId}/risk-interventions/apply`, payload || {});
  return res.data;
}

export async function getTeacherOSSnapshot(classId: number, params?: TeacherOSSnapshotQuery): Promise<TeacherOSSnapshotResponse> {
  const language = params?.responseLanguage;
  const activeAppealStatuses: GradeAppealStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"];

  const [
    analyticsResult,
    copilotResult,
    hintsResult,
    digestResult,
    riskPlanResult,
    activeAppealsResult,
  ] = await Promise.allSettled([
    getClassCohortAnalytics(classId, language),
    getTeacherCopilotRecommendations(classId, language),
    getClassHintsQuality(classId, {
      responseLanguage: language,
      days: params?.days,
    }),
    getTeacherDigest(classId, {
      responseLanguage: language,
      days: params?.days,
    }),
    getRiskInterventionPlan(classId, {
      responseLanguage: language,
      limitStudents: params?.limitStudents,
      maxTasksPerStudent: params?.maxTasksPerStudent,
      topicId: params?.topicId,
      deadlineDays: params?.deadlineDays,
    }),
    getClassGradeAppeals(classId, activeAppealStatuses),
  ]);

  const analytics = analyticsResult.status === "fulfilled" ? analyticsResult.value : null;
  const copilot = copilotResult.status === "fulfilled" ? copilotResult.value : null;
  const hints = hintsResult.status === "fulfilled" ? hintsResult.value : null;
  const digest = digestResult.status === "fulfilled" ? digestResult.value : null;
  const riskPlan = riskPlanResult.status === "fulfilled" ? riskPlanResult.value : null;
  const activeAppeals = activeAppealsResult.status === "fulfilled" ? activeAppealsResult.value : [];

  const locale: "uk" | "en" =
    language ||
    digest?.locale ||
    analytics?.locale ||
    copilot?.locale ||
    hints?.locale ||
    riskPlan?.locale ||
    "uk";

  const className =
    digest?.className ||
    analytics?.className ||
    copilot?.className ||
    riskPlan?.className ||
    "";

  const tr = (uk: string, en: string) => (locale === "en" ? en : uk);
  const alerts: TeacherOSAlert[] = [];

  if (digest) {
    if (digest.appeals.escalatedActive > 0) {
      alerts.push({
        id: "appeals-escalated",
        severity: "critical",
        title: tr("Ескальовані апеляції", "Escalated appeals"),
        description: tr("Потрібна термінова реакція викладача", "Needs immediate teacher attention"),
        metric: String(digest.appeals.escalatedActive),
      });
    }

    if (digest.appeals.overdueActive > 0) {
      alerts.push({
        id: "appeals-overdue",
        severity: "critical",
        title: tr("Прострочені апеляції", "Overdue appeals"),
        description: tr("SLA порушено — опрацюйте в першу чергу", "SLA breached — process first"),
        metric: String(digest.appeals.overdueActive),
      });
    }
  }

  if (analytics && analytics.overview.riskStudentsCount > 0) {
    alerts.push({
      id: "risk-students",
      severity: analytics.overview.riskStudentsCount >= 5 ? "critical" : "warning",
      title: tr("Група ризику", "At-risk group"),
      description: tr("Учні потребують цільової підтримки", "Students need targeted support"),
      metric: `${analytics.overview.riskStudentsCount}`,
    });
  }

  if (hints && hints.totalFeedback > 0 && hints.helpfulnessScore < 0) {
    alerts.push({
      id: "hints-quality",
      severity: "warning",
      title: tr("Погіршилась якість підказок", "Hints quality dropped"),
      description: tr("Негативний баланс реакцій учнів", "Negative student feedback balance"),
      metric: `${Math.round(hints.helpfulnessScore)}`,
    });
  }

  if (riskPlan && riskPlan.studentsTargeted.length > 0 && riskPlan.tasksSelected.length > 0) {
    alerts.push({
      id: "risk-plan-ready",
      severity: "info",
      title: tr("План втручання готовий", "Intervention plan is ready"),
      description: tr("Можна застосувати план одним кліком", "Plan can be applied in one click"),
      metric: `${riskPlan.studentsTargeted.length}/${riskPlan.tasksSelected.length}`,
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      id: "all-clear",
      severity: "info",
      title: tr("Критичних сигналів немає", "No critical signals"),
      description: tr("Система стабільна, можна рухатись за планом", "System is stable, follow the current plan"),
    });
  }

  const severityRank: Record<TeacherOSAlertSeverity, number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };
  alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    locale,
    classId,
    className,
    generatedAt: new Date().toISOString(),
    analytics,
    copilot,
    hints,
    digest,
    riskPlan,
    activeAppeals,
    alerts,
  };
}
