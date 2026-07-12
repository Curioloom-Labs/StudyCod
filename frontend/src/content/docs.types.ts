export type DocsSectionId =
  | "welcome"
  | "getting-started"
  | "navigation"
  | "ux-acceptance"
  | "profile-progress-model"
  | "personal"
  | "personal-tasks"
  | "playground"
  | "edu-student"
  | "edu-teacher"
  | "edu-classes"
  | "edu-courses"
  | "edu-topics"
  | "edu-tasks"
  | "edu-controlworks"
  | "edu-quizzes"
  | "edu-gradebook"
  | "edu-thematic"
  | "edu-calendar"
  | "edu-live"
  | "edu-appeals"
  | "edu-import-export"
  | "edu-announcements"
  | "grading"
  | "faq"
  | "troubleshooting"
  | "privacy";

export type DocsAudience = "ALL" | "EDU" | "PERSONAL";

export type DocsSection = {
  id: DocsSectionId;
  title: string;
  audience: DocsAudience;
  tags: string[];
  content: string;
};
