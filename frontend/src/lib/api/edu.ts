import { api } from "./client";

export type CodeFile = { path: string; content: string };
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
export async function studentLogin(username: string, password: string): Promise<StudentLoginResponse> {
  const res = await api.post("/edu/student-login", {
    username,
    password
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
  deadline?: string | null;
  tasks?: Array<{
    id: number;
    title: string;
    description?: string;
    template?: string;
    deadline?: string | null;
    maxAttempts?: number;
    isClosed?: boolean;
    testDataCount?: number;
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
  language: "JAVA" | "PYTHON" | "CPP";
  testDataCount: number;
  savedCode?: string;
  maxAttempts?: number;
  deadline?: string | null;
  isClosed?: boolean;
  attemptsUsed?: number;
  lesson: {
    id: number;
    title: string;
    type: "TOPIC" | "CONTROL" | "LESSON";
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
  inputPreview: string;
  expectedPreview: string;
  actualPreview: string;
  errorKind: string;
}

export interface LearningFeedback {
  verdict?: string | null;
  firstFailure?: LearningFirstFailure | null;
}
export async function registerTeacher(username: string, email: string, password: string, language: "JAVA" | "PYTHON" | "CPP"): Promise<{
  token?: string;
  user?: any;
  requiresEmailVerification?: boolean;
}> {
  const res = await api.post("/edu/register-teacher", {
    username,
    email,
    password,
    language
  });
  if (res.data.token) {
    localStorage.setItem("token", res.data.token);
  }
  return res.data;
}
export async function createClass(name: string, language: "JAVA" | "PYTHON" | "CPP"): Promise<Class> {
  const res = await api.post("/edu/classes", {
    name,
    language
  });
  return res.data.class;
}
export async function getClasses(): Promise<Class[]> {
  const res = await api.get("/edu/classes");
  return res.data.classes;
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
  const query = withPasswords ? "?withPasswords=1" : "";
  const res = await api.get(`/edu/classes/${classId}/students/export${query}`, {
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
  tasks?: any[];
  controlWorks?: any[];
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
export async function generateQuiz(lessonId: number, count?: number, topicTitle?: string): Promise<{
  count: number;
  quiz: any[];
  quizJson: string;
}> {
  const res = await api.post(`/edu/lessons/${lessonId}/generate-quiz`, {
    count,
    topicTitle
  });
  return res.data;
}
export async function saveQuiz(lessonId: number, quiz: any[]): Promise<void> {
  await api.put(`/edu/lessons/${lessonId}/quiz`, {
    quiz
  });
}
export interface CreateTaskRequest {
  title: string;
  description: string;
  template: string;
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
export async function submitCode(taskId: number, code: string, binding?: SubmissionBinding): Promise<{
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
  submissionMeta?: SubmissionMeta;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/submit`, {
    code,
    ...(binding ?? {})
  });
  return res.data;
}

export async function submitCodeFiles(taskId: number, files: CodeFile[], binding?: SubmissionBinding): Promise<any> {
  const res = await api.post(`/edu/tasks/${taskId}/submit`, { files, ...(binding ?? {}) });
  return res.data;
}
export async function completeTask(taskId: number, code: string, binding?: SubmissionBinding): Promise<{
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
  submissionMeta?: SubmissionMeta;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/complete`, {
    code,
    ...(binding ?? {})
  });
  return res.data;
}

export async function completeTaskFiles(taskId: number, files: CodeFile[], binding?: SubmissionBinding): Promise<any> {
  const res = await api.post(`/edu/tasks/${taskId}/complete`, { files, ...(binding ?? {}) });
  return res.data;
}
export async function generateTestData(taskId: number, count: number): Promise<{
  count: number;
  testData: Array<{
    id: number;
    input: string;
    expectedOutput: string;
    points: number;
    isHidden?: boolean;
  }>;
}> {
  const res = await api.post(`/edu/tasks/${taskId}/test-data/generate`, {
    count
  });
  return res.data;
}
export interface TestDataItem {
  input: string;
  expectedOutput: string;
  points: number;
  isHidden?: boolean;
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
}
export async function getTestData(taskId: number): Promise<{
  testData: TestData[];
}> {
  const res = await api.get(`/edu/tasks/${taskId}/test-data`);
  return res.data;
}
export async function updateTestData(taskId: number, testDataId: number, update: {
  input?: string;
  expectedOutput?: string;
  points?: number;
  isHidden?: boolean;
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
  assessmentType?: "PRACTICE" | "INTERMEDIATE" | "CONTROL";
  controlWorkId?: number | null;
  controlWorkTitle?: string | null;
  topicId?: number | null;
  topicTitle?: string | null;
  createdAt: string;
};
export interface StudentGradesResponse {
  grades: Grade[];
  summaryGrades: SummaryGrade[];
}
export async function getStudentGrades(studentId: number): Promise<StudentGradesResponse> {
  const res = await api.get(`/edu/students/${studentId}/grades`);
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
    testResults: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  }>;
}
export async function getTopicTaskStudentWork(taskId: number, studentId: number): Promise<TopicTaskStudentWork> {
  const res = await api.get(`/edu/topic-tasks/${taskId}/students/${studentId}/work`);
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