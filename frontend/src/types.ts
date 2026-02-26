export type CourseLanguage = "JAVA" | "PYTHON" | "CPP";
export type UserMode = "PERSONAL" | "EDUCATIONAL";
export type UserRole = "USER" | "TEACHER" | "SYSTEM_ADMIN";
export interface User {
  id: number;
  username: string;
  course: CourseLanguage;
  difus: number;
  avatarUrl: string | null;
  timezone?: string | null;
  userMode?: UserMode;
  role?: UserRole;
  googleId?: string | null;
  studentId?: number;
  classId?: number;
  className?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string;
  marketingEmailsEnabled?: boolean;
  placementDone?: boolean;
  placementLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  placementScore?: number | null;
  placementMasteredUntilTopicIndexJava?: number | null;
  placementMasteredUntilTopicIndexPython?: number | null;
  placementCodingPassed?: boolean;
  placementCodingLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  placementCodingTaskId?: string | null;
  placementCodingScore?: number | null;
  placementCodingDoneAt?: string | null;
}
export interface Topic {
  id: number;
  title: string;
  orderIndex: number;
  isIntro: boolean;
}
export interface Task {
  id: number;
  title: string;
  topicId?: number | null;
  topicTitle?: string | null;
  descriptionMarkdown: string;
  theoryMarkdown?: string;
  practiceText?: string;
  starterCode: string;
  starterFiles?: Array<{ path: string; content: string }>;
  starterEntryFile?: string;
  userCode: string;
  userFiles?: Array<{ path: string; content: string }>;
  userEntryFile?: string;
  finalCode?: string | null;
  status: "OPEN" | "SUBMITTED" | "GRADED";
  lessonInTopic: number;
  repeatAttempt: number;
  kind: "INTRO" | "TOPIC" | "CONTROL";
  createdAt: string;
  language?: CourseLanguage;
}
export interface Grade {
  id: number;
  total: number;
  workScore: number;
  optimizationScore: number;
  integrityScore: number;
  aiFeedback: string | null;
  comparisonFeedback?: string | null;
  previousGrade?: number | null;
  createdAt: string;
  task: Task & {
    topic?: Topic | null;
  };
}