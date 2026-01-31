export type CourseLanguage = "JAVA" | "PYTHON";
export type UserMode = "PERSONAL" | "EDUCATIONAL";
export type UserRole = "USER" | "TEACHER" | "SYSTEM_ADMIN";
export interface User {
  id: number;
  username: string;
  course: CourseLanguage;
  difus: number;
  avatarUrl: string | null;
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
  placementDone?: boolean;
  placementLevel?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | null;
  placementScore?: number | null;
  placementMasteredUntilTopicIndexJava?: number | null;
  placementMasteredUntilTopicIndexPython?: number | null;
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
  descriptionMarkdown: string;
  theoryMarkdown?: string;
  practiceText?: string;
  starterCode: string;
  userCode: string;
  finalCode?: string | null;
  status: "OPEN" | "SUBMITTED" | "GRADED";
  lessonInTopic: number;
  repeatAttempt: number;
  kind: "INTRO" | "TOPIC" | "CONTROL";
  createdAt: string;
  language?: "JAVA" | "PYTHON";
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