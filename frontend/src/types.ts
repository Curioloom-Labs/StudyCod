export type CourseLanguage = "JAVA" | "PYTHON" | "CPP";
export type UserMode = "PERSONAL" | "EDUCATIONAL" | "CONTEST";
export type UserRole = "USER" | "TEACHER" | "SUPPORT" | "SYSTEM_ADMIN";

export interface PublicProfilePrivacy {
  showContestStats: boolean;
  showSolvedHistory: boolean;
  showLanguageBreakdown: boolean;
}

export interface User {
  id: number;
  username: string;
  course: CourseLanguage;
  difus: number;
  difusByLang?: Record<CourseLanguage, number>;
  avatarUrl: string | null;
  contestHandles?: {
    codeforces?: string | null;
    atcoder?: string | null;
    leetcode?: string | null;
    codechef?: string | null;
  };
  contestHandlesByCourse?: {
    codeforces?: Partial<Record<CourseLanguage, string | null>>;
    atcoder?: Partial<Record<CourseLanguage, string | null>>;
    leetcode?: Partial<Record<CourseLanguage, string | null>>;
    codechef?: Partial<Record<CourseLanguage, string | null>>;
  };
  publicProfilePrivacy?: PublicProfilePrivacy;
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

export interface PublicProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  lang: CourseLanguage;
  difus: number;
  joinedAt: string;
  contestHandles: {
    codeforces: string | null;
    atcoder: string | null;
    leetcode: string | null;
    codechef: string | null;
  };
  privacy?: PublicProfilePrivacy;
  stats: {
    solvedTotal: number;
    solvedByLang: Record<CourseLanguage, number>;
    badgesUnlocked: number[];
    contestsJoined: number | null;
    contestSubmissionsTotal: number | null;
    contestAcceptedLike: number | null;
  };
  recentSolved: Array<{
    id: number;
    title: string;
    /** Normalised client timestamp; sourced from lastCheckedAt by the API client. */
    createdAt: string;
    problemCode: string | null;
    slug: string | null;
    lang: CourseLanguage;
    lastScore: number | null;
    lastTestsPassed: number | null;
    lastTestsTotal: number | null;
    lastCheckedAt: string | null;
  }>;
}

export interface DifusRule {
  minGrade: number;
  maxGrade: number;
  delta: number;
  reasonKey: "very_low_score" | "low_score" | "good_score" | "excellent_score";
}

export type IadRule = DifusRule;

export interface DifusEvent {
  id?: number;
  gradeId: number;
  taskId: number;
  taskTitle: string;
  topicIndex: number;
  grade: number;
  delta: number;
  appliedDelta?: number;
  potentialDelta?: number;
  reasonKey: "very_low_score" | "low_score" | "good_score" | "excellent_score";
  direction: "up" | "down" | "flat";
  applied: boolean;
  createdAt: string;
}

export type IadEvent = DifusEvent;

export interface DifusDetails {
  lang: CourseLanguage;
  currentIad?: number;
  currentDifus: number;
  currentTopicIndex?: number;
  currentTopicCeiling?: number;
  modelVersion?: number;
  reform?: {
    message: string;
    topicCeilings: number[];
  };
  iadByLang?: Record<CourseLanguage, number>;
  difusByLang: Record<CourseLanguage, number>;
  limits: {
    min: number;
    max: number;
  };
  limitState?: "none" | "min" | "max";
  lastAppliedGradeId: number | null;
  updatedAt: string | null;
  rules: DifusRule[];
  recentEvents: DifusEvent[];
  summary: {
    totalEvents: number;
    positiveEvents: number;
    negativeEvents: number;
    pendingEvents?: number;
  };
}

export type IadDetails = DifusDetails;
export interface Topic {
  id: number;
  title: string;
  orderIndex: number;
  isIntro: boolean;
}
export interface Task {
  id: number;
  title: string;
  subtitle?: string;
  topicId?: number | null;
  topicTitle?: string | null;
  topicIndex?: number | null;
  descriptionMarkdown: string;
  theoryMarkdown?: string;
  practiceText?: string;
  starterCode: string;
  taskMode?: "CODE" | "WEB";
  projectSpec?: {
    version: 1;
    kind: "MINI_PROJECT";
    estimatedMinutes: number;
    skills: string[];
    milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
    extensions?: string[];
  } | null;
  webTemplateFiles?: Array<{ path: "index.html" | "styles.css" | "script.js"; content: string }>;
  webValidationRules?: Array<{
    id?: string;
    type: "required_selector" | "forbidden_selector" | "required_text" | "forbidden_text" | "required_script_pattern" | "forbidden_script_pattern";
    message?: string;
    points?: number;
    selector?: string;
    text?: string;
    pattern?: string;
    flags?: string;
  }>;
  starterFiles?: Array<{ path: string; content: string }>;
  starterEntryFile?: string;
  userCode: string;
  userFiles?: Array<{ path: string; content: string }>;
  userEntryFile?: string;
  finalCode?: string | null;
  lastGradeTotal?: number | null;
  lastGradeFeedback?: string | null;
  lastGradeHints?: string[];
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
  aiUnavailableFallback?: boolean;
  previousGrade?: number | null;
  createdAt: string;
  task: Task & {
    topic?: Topic | null;
  };
}
