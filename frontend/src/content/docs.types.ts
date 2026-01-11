export type DocsSectionId = "welcome" | "getting-started" | "navigation" | "edu-student" | "edu-teacher" | "edu-topics" | "edu-tasks" | "edu-controlworks" | "edu-quizzes" | "edu-gradebook" | "edu-thematic" | "edu-import-export" | "edu-announcements" | "personal" | "personal-tasks" | "grading" | "faq" | "troubleshooting" | "privacy";
export type DocsAudience = "ALL" | "EDU" | "PERSONAL";
export type DocsSection = {
  id: DocsSectionId;
  title: string;
  audience: DocsAudience;
  tags: string[];
  content: string;
};