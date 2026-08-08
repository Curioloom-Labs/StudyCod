import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Student } from "../../entities/Student";
import { Class } from "../../entities/Class";
import { TopicNew } from "../../entities/TopicNew";
import { TopicTask } from "../../entities/TopicTask";
import { EduGrade } from "../../entities/EduGrade";
import { GradeAppeal, type GradeAppealStatus } from "../../entities/GradeAppeal";
import { EduHintFeedback } from "../../entities/EduHintFeedback";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { isAssignedToStudent } from "../../utils/assignmentVisibility";
import { normalizeAssignedStudentIds, normalizeTargetedAssignmentForStorage } from "../../utils/assignmentVisibility";
import { logger } from "../../utils/logger";
import { resolveHintStrategyVariant, type HintStrategyVariant } from "../../services/edu/hintStrategy";
import { syncTopicTaskAssignmentsWithManager } from "../../services/edu/assignmentTargetsService";
import { authorizeClassAction } from "../../services/edu/classAccess";
import type { Capability } from "../../services/edu/rbac";

type UiLocale = "uk" | "en";
type MasteryStatus = "NOT_STARTED" | "IN_PROGRESS" | "MASTERED";
type RecommendedDifficulty = "EASY" | "MEDIUM" | "HARD";
type CopilotPriority = "high" | "medium" | "low";
type CopilotType = "REMEDIATION" | "PACING" | "FOCUS_SUPPORT" | "ASSESSMENT" | "ENRICHMENT";

interface TopicMasteryInsight {
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

interface StudentTaskRecommendation {
  topicId: number;
  topicTitle: string;
  taskId: number;
  taskTitle: string;
  reason: string;
  priority: number;
  estimatedEffort: "short" | "medium" | "long";
}

interface StudentMasteryPayload {
  locale: UiLocale;
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
  topics: TopicMasteryInsight[];
  nextRecommendations: StudentTaskRecommendation[];
  generatedAt: string;
}

interface CohortTaskInsight {
  taskId: number;
  title: string;
  type: "PRACTICE" | "CONTROL";
  avgScore: number;
  completionRate: number;
  passRate: number;
  attemptedStudents: number;
  commonErrorKinds: Array<{ kind: string; count: number }>;
}

interface CohortTopicInsight {
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

interface CohortAnalyticsPayload {
  locale: UiLocale;
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

interface HintsQualityPayload {
  locale: UiLocale;
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
    variant: HintStrategyVariant;
    count: number;
    positiveRate: number;
  }>;
  generatedAt: string;
}

interface TeacherDigestPayload {
  locale: UiLocale;
  classId: number;
  className: string;
  windowDays: number;
  period: {
    from: string;
    to: string;
  };
  overview: CohortAnalyticsPayload["overview"];
  appeals: {
    total: number;
    active: number;
    resolved: number;
    newInWindow: number;
    overdueActive: number;
    escalatedActive: number;
    avgResolutionHours: number;
  };
  hints: HintsQualityPayload;
  recommendations: ReturnType<typeof buildTeacherCopilotSuggestions>;
  generatedAt: string;
}

interface RiskInterventionPlanPayload {
  locale: UiLocale;
  classId: number;
  className: string;
  dryRun: boolean;
  studentsTargeted: Array<{ studentId: number; studentName: string }>;
  tasksSelected: Array<{ taskId: number; title: string; topicId: number; topicTitle: string }>;
  deadlineAppliedAt: string | null;
  updatedTasks: number;
  generatedAt: string;
}

const router = Router();

const studentRepo = () => AppDataSource.getRepository(Student);
const classRepo = () => AppDataSource.getRepository(Class);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const appealRepo = () => AppDataSource.getRepository(GradeAppeal);
const hintFeedbackRepo = () => AppDataSource.getRepository(EduHintFeedback);

const ACTIVE_APPEAL_STATUSES: GradeAppealStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"];
const APPEAL_SLA_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_SLA_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_APPEAL_SLA_HOURS)))
  : 48;
const APPEAL_ESCALATION_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_ESCALATION_HOURS))
  ? Math.max(APPEAL_SLA_HOURS, Math.floor(Number(process.env.EDU_APPEAL_ESCALATION_HOURS)))
  : 72;
const DIGEST_WINDOW_DAYS = Number.isFinite(Number(process.env.EDU_TEACHER_DIGEST_WINDOW_DAYS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_TEACHER_DIGEST_WINDOW_DAYS)))
  : 7;

function tr(locale: UiLocale, uk: string, en: string): string {
  return locale === "en" ? en : uk;
}

function resolveResponseLocale(req: AuthRequest, fallback: UiLocale = "uk"): UiLocale {
  const queryLocaleRaw = String((req.query as any)?.responseLanguage ?? "").trim().toLowerCase();
  if (queryLocaleRaw.startsWith("en")) return "en";
  if (queryLocaleRaw.startsWith("uk")) return "uk";
  return resolveUiLocaleFromHeaders(req.headers, fallback);
}

function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clampToPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isHintFeedbackTableMissingError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").toUpperCase();
  if (code === "ER_NO_SUCH_TABLE" || code === "42P01") return true;
  const message = String((error as any)?.message ?? "").toLowerCase();
  return message.includes("doesn't exist") || message.includes("no such table") || (message.includes("relation") && message.includes("does not exist"));
}

function normalizeErrorKind(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const normalized = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  return normalized || null;
}

function parseTestResultsSafe(raw: string | null): Array<Record<string, unknown>> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
}

function collectErrorKindsFromGrade(grade: EduGrade): string[] {
  const testResults = parseTestResultsSafe(grade.testResults);
  const out: string[] = [];
  for (const item of testResults) {
    const passed = Boolean(item.passed);
    if (passed) continue;

    const fromErrorKind = normalizeErrorKind(item.errorKind ?? item.error_kind);
    if (fromErrorKind) {
      out.push(fromErrorKind);
      continue;
    }

    const fromVerdict = normalizeErrorKind(item.verdict);
    if (fromVerdict) {
      out.push(fromVerdict);
    }
  }

  if (out.length === 0 && typeof grade.feedback === "string" && grade.feedback.trim()) {
    const feedback = grade.feedback.toLowerCase();
    if (feedback.includes("compile")) out.push("COMPILE_ERROR");
    else if (feedback.includes("time")) out.push("TIME_LIMIT");
    else if (feedback.includes("runtime")) out.push("RUNTIME_ERROR");
  }

  return out;
}

function incrementCount(map: Map<string, number>, key: string, delta = 1): void {
  map.set(key, (map.get(key) || 0) + delta);
}

function topErrorKinds(map: Map<string, number>, limit = 5): Array<{ kind: string; count: number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([kind, count]) => ({ kind, count }));
}

function isGradeCompleted(grade: EduGrade | null): boolean {
  if (!grade) return false;
  if (grade.isCompleted || grade.isManuallyGraded) return true;
  if (grade.testsTotal > 0 && grade.testsPassed >= grade.testsTotal) return true;
  if (typeof grade.total === "number" && Number.isFinite(grade.total) && grade.total >= 70) return true;
  return false;
}

function resolveRecommendedDifficulty(masteryPercent: number): RecommendedDifficulty {
  if (masteryPercent < 40) return "EASY";
  if (masteryPercent < 75) return "MEDIUM";
  return "HARD";
}

function resolveEstimatedEffort(task: TopicTask): "short" | "medium" | "long" {
  if (task.type === "CONTROL") return "long";
  const templateLength = String(task.template ?? "").length;
  if (templateLength > 1500) return "long";
  if (templateLength > 600) return "medium";
  return "short";
}

function isTaskVisibleToStudent(task: TopicTask, studentId: number): boolean {
  if (isAssignedToStudent(task.isAssigned, (task as any).assignedStudentIds, studentId)) {
    return true;
  }

  if (task.type === "CONTROL" && task.controlWork) {
    return isAssignedToStudent(
      task.controlWork.isAssigned,
      (task.controlWork as any).assignedStudentIds,
      studentId
    );
  }

  return false;
}

async function getStudentOrNull(studentId: number): Promise<Student | null> {
  return studentRepo().findOne({
    where: { id: studentId },
    relations: ["class"]
  });
}

async function getLatestGradesByTask(studentId: number, taskIds: number[]): Promise<{
  latestByTaskId: Map<number, EduGrade>;
  attemptsByTaskId: Map<number, number>;
}> {
  if (taskIds.length === 0) {
    return {
      latestByTaskId: new Map<number, EduGrade>(),
      attemptsByTaskId: new Map<number, number>()
    };
  }

  const grades = await gradeRepo()
    .createQueryBuilder("grade")
    .leftJoinAndSelect("grade.topicTask", "topicTask")
    .where("grade.student_id = :studentId", { studentId })
    .andWhere("grade.topic_task_id IN (:...taskIds)", { taskIds })
    .orderBy("grade.created_at", "DESC")
    .getMany();

  const latestByTaskId = new Map<number, EduGrade>();
  const attemptsByTaskId = new Map<number, number>();

  for (const grade of grades) {
    const taskId = grade.topicTask?.id;
    if (!taskId) continue;

    attemptsByTaskId.set(taskId, (attemptsByTaskId.get(taskId) || 0) + 1);
    if (!latestByTaskId.has(taskId)) {
      latestByTaskId.set(taskId, grade);
    }
  }

  return {
    latestByTaskId,
    attemptsByTaskId
  };
}

function formatMasteryStatusLabel(locale: UiLocale, status: MasteryStatus): string {
  if (status === "MASTERED") return tr(locale, "Опрацьовано", "Mastered");
  if (status === "IN_PROGRESS") return tr(locale, "В процесі", "In progress");
  return tr(locale, "Не розпочато", "Not started");
}

async function buildStudentMasteryPayload(student: Student, locale: UiLocale): Promise<StudentMasteryPayload> {
  const classId = student.class.id;
  const classTopics = await topicRepo()
    .createQueryBuilder("topic")
    .leftJoinAndSelect("topic.tasks", "task")
    .leftJoinAndSelect("task.controlWork", "controlWork")
    .where("topic.class_id = :classId", { classId })
    .orderBy("topic.order", "ASC")
    .addOrderBy("task.order", "ASC")
    .addOrderBy("task.id", "ASC")
    .getMany();

  const visibleTasksByTopic = new Map<number, TopicTask[]>();
  const allVisibleTaskIds: number[] = [];

  for (const topic of classTopics) {
    const visible = (topic.tasks || [])
      .filter(task => isTaskVisibleToStudent(task, student.id))
      .sort((a, b) => a.order - b.order || a.id - b.id);

    visibleTasksByTopic.set(topic.id, visible);
    for (const task of visible) {
      allVisibleTaskIds.push(task.id);
    }
  }

  const { latestByTaskId, attemptsByTaskId } = await getLatestGradesByTask(student.id, allVisibleTaskIds);

  const topics: TopicMasteryInsight[] = classTopics.map(topic => {
    const topicTasks = visibleTasksByTopic.get(topic.id) || [];
    const totalTasks = topicTasks.length;

    let attemptedTasks = 0;
    let completedTasks = 0;
    let scoreSum = 0;
    let scoreCount = 0;
    let lastActivityAt: Date | null = null;

    let nextTaskId: number | null = null;
    let nextTaskTitle: string | null = null;

    for (const task of topicTasks) {
      const latestGrade = latestByTaskId.get(task.id) || null;
      const attempts = attemptsByTaskId.get(task.id) || 0;
      const attempted = attempts > 0;

      if (attempted) {
        attemptedTasks += 1;
      }

      if (isGradeCompleted(latestGrade)) {
        completedTasks += 1;
      } else if (nextTaskId === null) {
        nextTaskId = task.id;
        nextTaskTitle = task.title;
      }

      if (latestGrade && typeof latestGrade.total === "number" && Number.isFinite(latestGrade.total)) {
        scoreSum += latestGrade.total;
        scoreCount += 1;
      }

      if (latestGrade?.createdAt) {
        if (!lastActivityAt || latestGrade.createdAt > lastActivityAt) {
          lastActivityAt = latestGrade.createdAt;
        }
      }
    }

    const averageScore = scoreCount > 0 ? roundTo(scoreSum / scoreCount, 2) : 0;
    const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;
    const scoreRatio = averageScore / 100;
    const masteryPercent = clampToPercent((completionRatio * 0.6 + scoreRatio * 0.4) * 100);

    let status: MasteryStatus = "NOT_STARTED";
    if (attemptedTasks > 0) {
      status = "IN_PROGRESS";
    }
    if (totalTasks > 0 && completedTasks === totalTasks && masteryPercent >= 80) {
      status = "MASTERED";
    }

    if (nextTaskId === null && topicTasks.length > 0) {
      const firstTask = topicTasks[0];
      nextTaskId = firstTask.id;
      nextTaskTitle = firstTask.title;
    }

    return {
      topicId: topic.id,
      title: topic.title,
      order: topic.order,
      status,
      masteryPercent,
      averageScore,
      attemptedTasks,
      completedTasks,
      totalTasks,
      recommendedDifficulty: resolveRecommendedDifficulty(masteryPercent),
      nextTaskId,
      nextTaskTitle,
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null
    };
  });

  const masteredTopics = topics.filter(t => t.status === "MASTERED").length;
  const inProgressTopics = topics.filter(t => t.status === "IN_PROGRESS").length;
  const notStartedTopics = topics.filter(t => t.status === "NOT_STARTED").length;
  const averageMasteryPercent = topics.length > 0
    ? roundTo(topics.reduce((sum, topic) => sum + topic.masteryPercent, 0) / topics.length, 2)
    : 0;

  const recommendations: StudentTaskRecommendation[] = [];

  for (const topic of topics) {
    if (!topic.nextTaskId || !topic.nextTaskTitle || topic.totalTasks === 0) continue;

    const priority = topic.status === "IN_PROGRESS" ? 1 : topic.status === "NOT_STARTED" ? 2 : 3;
    const reason = topic.status === "IN_PROGRESS"
      ? tr(locale, "Продовжити тему з незавершеними задачами", "Continue the topic with unfinished tasks")
      : topic.status === "NOT_STARTED"
        ? tr(locale, "Почати наступну тему за планом", "Start the next topic in sequence")
        : tr(locale, "Закріпити тему повторною спробою", "Reinforce this topic with an extra attempt");

    const topicTasks = visibleTasksByTopic.get(topic.topicId) || [];
    const selectedTask = topicTasks.find(task => task.id === topic.nextTaskId) || topicTasks[0] || null;

    if (!selectedTask) continue;

    recommendations.push({
      topicId: topic.topicId,
      topicTitle: topic.title,
      taskId: topic.nextTaskId,
      taskTitle: topic.nextTaskTitle,
      reason,
      priority,
      estimatedEffort: resolveEstimatedEffort(selectedTask)
    });
  }

  recommendations.sort((a, b) => a.priority - b.priority || a.topicId - b.topicId);

  return {
    locale,
    student: {
      id: student.id,
      classId: student.class.id,
      className: student.class.name,
      language: student.class.language
    },
    summary: {
      topicsTotal: topics.length,
      masteredTopics,
      inProgressTopics,
      notStartedTopics,
      averageMasteryPercent
    },
    topics,
    nextRecommendations: recommendations.slice(0, 6),
    generatedAt: new Date().toISOString()
  };
}

/**
 * Authorize a teacher-side class action via the central {@link authorizeClassAction}
 * (org membership + owner grandfather + SYSTEM_ADMIN), then return the class with
 * its students loaded for analytics. `null` => caller should 403/deny.
 */
async function resolveTeacherClassAccess(
  req: AuthRequest,
  classId: number,
  capability: Capability = "CLASS_VIEW"
): Promise<{ cls: Class } | null> {
  if (req.studentId || req.userType === "STUDENT" || !req.userId) {
    return null;
  }

  const access = await authorizeClassAction(req.userId, classId, capability, {
    isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
  });
  if (!access || !access.allowed) {
    return null;
  }

  // Reload with the students relation the analytics builders need (the
  // authorizer only loads `teacher`).
  const cls = await classRepo().findOne({
    where: { id: classId },
    relations: ["teacher", "students"]
  });
  if (!cls) {
    return null;
  }

  return { cls };
}

async function buildCohortAnalytics(cls: Class, locale: UiLocale): Promise<CohortAnalyticsPayload> {
  const students = cls.students || [];
  const studentsCount = students.length;

  const topics = await topicRepo()
    .createQueryBuilder("topic")
    .leftJoinAndSelect("topic.tasks", "task")
    .leftJoinAndSelect("task.controlWork", "controlWork")
    .where("topic.class_id = :classId", { classId: cls.id })
    .orderBy("topic.order", "ASC")
    .addOrderBy("task.order", "ASC")
    .addOrderBy("task.id", "ASC")
    .getMany();

  const trackedTasksByTopic = new Map<number, TopicTask[]>();
  const trackedTaskIds: number[] = [];

  for (const topic of topics) {
    const tracked = (topic.tasks || [])
      .filter(task => task.isAssigned || (task.type === "CONTROL" && Boolean(task.controlWork?.isAssigned)))
      .sort((a, b) => a.order - b.order || a.id - b.id);

    trackedTasksByTopic.set(topic.id, tracked);
    for (const task of tracked) trackedTaskIds.push(task.id);
  }

  let grades: EduGrade[] = [];
  if (trackedTaskIds.length > 0) {
    grades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoinAndSelect("grade.student", "student")
      .leftJoinAndSelect("grade.topicTask", "topicTask")
      .where("student.class_id = :classId", { classId: cls.id })
      .andWhere("grade.topic_task_id IN (:...taskIds)", { taskIds: trackedTaskIds })
      .orderBy("grade.created_at", "DESC")
      .getMany();
  }

  const latestByStudentTask = new Map<string, EduGrade>();
  for (const grade of grades) {
    const studentId = grade.student?.id;
    const taskId = grade.topicTask?.id;
    if (!studentId || !taskId) continue;
    const key = `${studentId}:${taskId}`;
    if (!latestByStudentTask.has(key)) {
      latestByStudentTask.set(key, grade);
    }
  }

  const allLatestGrades = [...latestByStudentTask.values()];

  const globalErrorKinds = new Map<string, number>();
  const studentAggregates = new Map<number, {
    studentName: string;
    attempted: number;
    completed: number;
    weakTasks: number;
    scores: number[];
    assignedCount: number;
  }>();

  const allTrackedTasks = [...trackedTasksByTopic.values()].flat();

  for (const student of students) {
    // Tasks actually assigned/visible to THIS student — the correct denominator
    // for their completion. Using the class-wide tracked count would mark a
    // selectively-assigned student as "at risk" even when they finished all of
    // their own tasks.
    const assignedCount = allTrackedTasks.reduce(
      (n, task) => (isTaskVisibleToStudent(task, student.id) ? n + 1 : n),
      0
    );
    studentAggregates.set(student.id, {
      studentName: `${student.lastName} ${student.firstName}${student.middleName ? ` ${student.middleName}` : ""}`.trim(),
      attempted: 0,
      completed: 0,
      weakTasks: 0,
      scores: [],
      assignedCount
    });
  }

  const topicInsights: CohortTopicInsight[] = topics.map(topic => {
    const topicTasks = trackedTasksByTopic.get(topic.id) || [];
    const topicErrorKinds = new Map<string, number>();
    const weakTasks: CohortTaskInsight[] = [];

    let topicScoreSum = 0;
    let topicScoreCount = 0;
    let topicCompletedCount = 0;
    let topicPassCount = 0;
    let topicAttemptedCount = 0;

    for (const task of topicTasks) {
      const latestForTask: EduGrade[] = [];
      for (const student of students) {
        const latest = latestByStudentTask.get(`${student.id}:${task.id}`);
        if (latest) latestForTask.push(latest);
      }

      let taskScoreSum = 0;
      let taskScoreCount = 0;
      let taskCompleted = 0;
      let taskPass = 0;
      const taskErrors = new Map<string, number>();

      for (const latest of latestForTask) {
        const studentAgg = studentAggregates.get(latest.student.id);
        if (studentAgg) {
          studentAgg.attempted += 1;
        }

        topicAttemptedCount += 1;

        const completed = isGradeCompleted(latest);
        if (completed) {
          taskCompleted += 1;
          topicCompletedCount += 1;
          if (studentAgg) studentAgg.completed += 1;
        }

        const score = typeof latest.total === "number" && Number.isFinite(latest.total) ? latest.total : null;
        if (score !== null) {
          taskScoreSum += score;
          taskScoreCount += 1;
          topicScoreSum += score;
          topicScoreCount += 1;
          if (studentAgg) studentAgg.scores.push(score);

          if (score >= 60) {
            taskPass += 1;
            topicPassCount += 1;
          } else if (studentAgg) {
            studentAgg.weakTasks += 1;
          }
        }

        for (const kind of collectErrorKindsFromGrade(latest)) {
          incrementCount(taskErrors, kind);
          incrementCount(topicErrorKinds, kind);
          incrementCount(globalErrorKinds, kind);
        }
      }

      const attemptedStudents = latestForTask.length;
      const avgScore = taskScoreCount > 0 ? roundTo(taskScoreSum / taskScoreCount, 2) : 0;
      const completionRate = studentsCount > 0 ? roundTo(taskCompleted / studentsCount, 4) : 0;
      const passRate = attemptedStudents > 0 ? roundTo(taskPass / attemptedStudents, 4) : 0;
      const commonErrorKinds = topErrorKinds(taskErrors, 3);

      const taskInsight: CohortTaskInsight = {
        taskId: task.id,
        title: task.title,
        type: task.type,
        avgScore,
        completionRate,
        passRate,
        attemptedStudents,
        commonErrorKinds
      };

      const isWeakTask = avgScore < 60 || passRate < 0.55 || completionRate < 0.6;
      if (isWeakTask) {
        weakTasks.push(taskInsight);
      }
    }

    const tasksTotal = topicTasks.length;
    const denominator = Math.max(1, studentsCount * Math.max(1, tasksTotal));
    const avgScore = topicScoreCount > 0 ? roundTo(topicScoreSum / topicScoreCount, 2) : 0;
    const completionRate = tasksTotal > 0 && studentsCount > 0 ? roundTo(topicCompletedCount / (studentsCount * tasksTotal), 4) : 0;
    const passRate = topicAttemptedCount > 0 ? roundTo(topicPassCount / topicAttemptedCount, 4) : 0;

    return {
      topicId: topic.id,
      title: topic.title,
      order: topic.order,
      tasksTotal,
      avgScore,
      completionRate: Number.isFinite(completionRate) ? completionRate : roundTo(topicCompletedCount / denominator, 4),
      passRate,
      weakTasks: weakTasks.sort((a, b) => a.avgScore - b.avgScore || a.passRate - b.passRate).slice(0, 5),
      commonErrorKinds: topErrorKinds(topicErrorKinds, 5)
    };
  });

  const tasksTracked = trackedTaskIds.length;
  const overallAvgScore = allLatestGrades.length > 0
    ? roundTo(allLatestGrades
      .map(g => (typeof g.total === "number" && Number.isFinite(g.total) ? g.total : null))
      .filter((score): score is number => score !== null)
      .reduce((sum, score) => sum + score, 0) /
      Math.max(1, allLatestGrades
        .map(g => (typeof g.total === "number" && Number.isFinite(g.total) ? g.total : null))
        .filter((score): score is number => score !== null).length), 2)
    : 0;

  const totalAssignments = studentsCount * tasksTracked;
  let completedAssignments = 0;
  let attemptedAssignments = 0;
  let passedAssignments = 0;

  for (const grade of allLatestGrades) {
    attemptedAssignments += 1;
    if (isGradeCompleted(grade)) completedAssignments += 1;
    if (typeof grade.total === "number" && Number.isFinite(grade.total) && grade.total >= 60) {
      passedAssignments += 1;
    }
  }

  const completionRate = totalAssignments > 0 ? roundTo(completedAssignments / totalAssignments, 4) : 0;
  const passRate = attemptedAssignments > 0 ? roundTo(passedAssignments / attemptedAssignments, 4) : 0;

  const riskStudents = [...studentAggregates.entries()]
    .map(([studentId, agg]) => {
      const avgScore = agg.scores.length > 0
        ? roundTo(agg.scores.reduce((sum, score) => sum + score, 0) / agg.scores.length, 2)
        : 0;
      const completionDenominator = agg.assignedCount > 0 ? agg.assignedCount : tasksTracked;
      const completion = completionDenominator > 0 ? roundTo(agg.completed / completionDenominator, 4) : 0;
      return {
        studentId,
        studentName: agg.studentName,
        avgScore,
        completionRate: completion,
        weakTasks: agg.weakTasks
      };
    })
    .filter(item => item.avgScore < 60 || item.completionRate < 0.6 || item.weakTasks >= 2)
    .sort((a, b) => {
      const aRisk = (60 - a.avgScore) + (1 - a.completionRate) * 100 + a.weakTasks * 5;
      const bRisk = (60 - b.avgScore) + (1 - b.completionRate) * 100 + b.weakTasks * 5;
      return bRisk - aRisk;
    })
    .slice(0, 12);

  return {
    locale,
    classId: cls.id,
    className: cls.name,
    studentsCount,
    overview: {
      avgScore: overallAvgScore,
      completionRate,
      passRate,
      riskStudentsCount: riskStudents.length,
      tasksTracked
    },
    riskStudents,
    topics: topicInsights,
    commonErrorKinds: topErrorKinds(globalErrorKinds, 8),
    generatedAt: new Date().toISOString()
  };
}

function buildTeacherCopilotSuggestions(locale: UiLocale, analytics: CohortAnalyticsPayload): Array<{
  id: string;
  type: CopilotType;
  priority: CopilotPriority;
  title: string;
  rationale: string;
  actions: string[];
  relatedTopicId: number | null;
  relatedStudentIds: number[];
}> {
  const suggestions: Array<{
    id: string;
    type: CopilotType;
    priority: CopilotPriority;
    title: string;
    rationale: string;
    actions: string[];
    relatedTopicId: number | null;
    relatedStudentIds: number[];
  }> = [];

  const worstTopicByPass = [...analytics.topics]
    .filter(topic => topic.tasksTotal > 0)
    .sort((a, b) => a.passRate - b.passRate || a.avgScore - b.avgScore)[0] || null;

  if (worstTopicByPass && (worstTopicByPass.passRate < 0.6 || worstTopicByPass.avgScore < 60)) {
    const topError = worstTopicByPass.commonErrorKinds[0]?.kind || "WA";
    suggestions.push({
      id: `topic-remediate-${worstTopicByPass.topicId}`,
      type: "REMEDIATION",
      priority: "high",
      title: tr(locale, `Потребує повтору: ${worstTopicByPass.title}`, `Needs remediation: ${worstTopicByPass.title}`),
      rationale: tr(
        locale,
        `Низькі метрики: pass rate ${Math.round(worstTopicByPass.passRate * 100)}%, середній бал ${Math.round(worstTopicByPass.avgScore)}. Часта помилка: ${topError}.`,
        `Low metrics: pass rate ${Math.round(worstTopicByPass.passRate * 100)}%, average score ${Math.round(worstTopicByPass.avgScore)}. Frequent error: ${topError}.`
      ),
      actions: [
        tr(locale, "Додайте короткий розбір типових помилок на 10–15 хв", "Add a 10–15 min mini-lesson on common mistakes"),
        tr(locale, "Дайте 1 мікро-вправу на закріплення перед повторною спробою", "Assign one micro-practice before retry"),
        tr(locale, "Перевірте розуміння через 1 контрольне запитання", "Verify understanding with one checkpoint question")
      ],
      relatedTopicId: worstTopicByPass.topicId,
      relatedStudentIds: []
    });
  }

  if (analytics.overview.completionRate < 0.7) {
    suggestions.push({
      id: "pacing-completion",
      type: "PACING",
      priority: analytics.overview.completionRate < 0.55 ? "high" : "medium",
      title: tr(locale, "Просідання темпу виконання", "Completion pacing is slipping"),
      rationale: tr(
        locale,
        `Загальний completion rate класу ${Math.round(analytics.overview.completionRate * 100)}%. Це знижує прогноз успішності контрольних.`,
        `Class completion rate is ${Math.round(analytics.overview.completionRate * 100)}%. This reduces control-work readiness.`
      ),
      actions: [
        tr(locale, "Публічно зафіксуйте 2 найближчі дедлайни", "Publish the next two deadlines clearly"),
        tr(locale, "Позначте мінімум задач, потрібний для допуску до контрольної", "Set a minimum task threshold before control work"),
        tr(locale, "Дайте короткий слот " + "Q&A" + " на початку уроку", "Reserve a short Q&A slot at lesson start")
      ],
      relatedTopicId: null,
      relatedStudentIds: []
    });
  }

  if (analytics.riskStudents.length > 0) {
    const topRisk = analytics.riskStudents.slice(0, 5);
    suggestions.push({
      id: "focus-risk-students",
      type: "FOCUS_SUPPORT",
      priority: "high",
      title: tr(locale, "Точкова підтримка для групи ризику", "Targeted support for at-risk students"),
      rationale: tr(
        locale,
        `Учнів у ризику: ${analytics.riskStudents.length}. Перші: ${topRisk.map(s => s.studentName).join(", ")}.`,
        `At-risk students: ${analytics.riskStudents.length}. Top: ${topRisk.map(s => s.studentName).join(", ")}.`
      ),
      actions: [
        tr(locale, "Створіть окремий міні-план на 1 тиждень (2-3 задачі)", "Create a one-week mini-plan (2-3 tasks)"),
        tr(locale, "Дайте персональний фідбек по 1 головній помилці", "Provide personal feedback on one key mistake"),
        tr(locale, "Перевірте прогрес через 48 годин", "Check progress again in 48 hours")
      ],
      relatedTopicId: null,
      relatedStudentIds: topRisk.map(s => s.studentId)
    });
  }

  const dominantError = analytics.commonErrorKinds[0]?.kind || null;
  if (dominantError) {
    suggestions.push({
      id: `assessment-${dominantError}`,
      type: "ASSESSMENT",
      priority: "medium",
      title: tr(locale, "Головний патерн помилок у класі", "Most frequent class error pattern"),
      rationale: tr(
        locale,
        `Найчастіше повторюється помилка ${dominantError}. Винесіть її в окремий мікро-чек перед дедлайном.`,
        `The most frequent error is ${dominantError}. Add a micro-check for it before the next deadline.`
      ),
      actions: [
        tr(locale, "Додайте чеклист перевірки перед submit", "Add a pre-submit checklist"),
        tr(locale, "Покажіть 1 контр-приклад з правильною логікою", "Show one counter-example with correct logic"),
        tr(locale, "Попросіть учнів пояснити виправлення своїми словами", "Ask students to explain the fix in their own words")
      ],
      relatedTopicId: null,
      relatedStudentIds: []
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: "enrichment-default",
      type: "ENRICHMENT",
      priority: "low",
      title: tr(locale, "Клас у стабільній зоні", "Class is in a stable zone"),
      rationale: tr(
        locale,
        "Критичних сигналів не виявлено. Можна підняти планку через складнішу задачу з поясненням рішення.",
        "No critical signals detected. Consider raising the bar with one harder challenge and solution walkthrough."
      ),
      actions: [
        tr(locale, "Додайте 1 challenge-задачу на тему тижня", "Add one weekly challenge task"),
        tr(locale, "Проведіть 5-хвилинний code-review прикладу", "Run a 5-minute sample code review"),
        tr(locale, "Зафіксуйте критерії успіху перед стартом", "Set success criteria before starting")
      ],
      relatedTopicId: null,
      relatedStudentIds: []
    });
  }

  return suggestions.slice(0, 6);
}

router.get("/students/me/mastery-path", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId || req.userType !== "STUDENT") {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const student = await getStudentOrNull(req.studentId);
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const localeFallback: UiLocale = student.uiLanguage === "en" ? "en" : "uk";
    const locale = resolveResponseLocale(req, localeFallback);
    const payload = await buildStudentMasteryPayload(student, locale);

    return res.json(payload);
  } catch (error: any) {
    logger.error("[edu/insights] failed to build mastery path", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/students/me/skill-graph", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId || req.userType !== "STUDENT") {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const student = await getStudentOrNull(req.studentId);
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const localeFallback: UiLocale = student.uiLanguage === "en" ? "en" : "uk";
    const locale = resolveResponseLocale(req, localeFallback);
    const payload = await buildStudentMasteryPayload(student, locale);

    const nodes = payload.topics.map(topic => ({
      id: `topic-${topic.topicId}`,
      topicId: topic.topicId,
      label: topic.title,
      order: topic.order,
      status: topic.status,
      statusLabel: formatMasteryStatusLabel(locale, topic.status),
      masteryPercent: topic.masteryPercent,
      averageScore: topic.averageScore,
      recommendedDifficulty: topic.recommendedDifficulty,
      nextTaskId: topic.nextTaskId,
      nextTaskTitle: topic.nextTaskTitle
    }));

    const sortedNodes = [...nodes].sort((a, b) => a.order - b.order);
    const edges = sortedNodes.slice(1).map((node, index) => ({
      from: sortedNodes[index].id,
      to: node.id,
      relation: "PREREQUISITE" as const
    }));

    const recommendedPath = payload.nextRecommendations.slice(0, 4).map(item => `topic-${item.topicId}`);

    return res.json({
      locale,
      summary: payload.summary,
      nodes,
      edges,
      recommendedPath,
      generatedAt: payload.generatedAt
    });
  } catch (error: any) {
    logger.error("[edu/insights] failed to build skill graph", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/students/me/next-task", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId || req.userType !== "STUDENT") {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const student = await getStudentOrNull(req.studentId);
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const localeFallback: UiLocale = student.uiLanguage === "en" ? "en" : "uk";
    const locale = resolveResponseLocale(req, localeFallback);
    const payload = await buildStudentMasteryPayload(student, locale);

    const best = payload.nextRecommendations[0] || null;

    return res.json({
      locale,
      message: best
        ? tr(locale, "Рекомендація сформована", "Recommendation ready")
        : tr(locale, "Немає призначених задач для рекомендації", "No assigned tasks to recommend"),
      recommendation: best,
      alternatives: payload.nextRecommendations.slice(1, 4),
      generatedAt: payload.generatedAt
    });
  } catch (error: any) {
    logger.error("[edu/insights] failed to build next-task recommendation", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/cohort-analytics", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const analytics = await buildCohortAnalytics(access.cls, locale);
    return res.json(analytics);
  } catch (error: any) {
    logger.error("[edu/insights] failed to build cohort analytics", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/teacher-copilot", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const analytics = await buildCohortAnalytics(access.cls, locale);
    const suggestions = buildTeacherCopilotSuggestions(locale, analytics);

    return res.json({
      locale,
      classId: analytics.classId,
      className: analytics.className,
      generatedBy: "rule-based-copilot-v1",
      summary: {
        avgScore: analytics.overview.avgScore,
        completionRate: analytics.overview.completionRate,
        passRate: analytics.overview.passRate,
        riskStudentsCount: analytics.overview.riskStudentsCount
      },
      suggestions,
      generatedAt: analytics.generatedAt
    });
  } catch (error: any) {
    logger.error("[edu/insights] failed to build teacher copilot", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

async function buildHintsQualityForClass(classId: number, locale: UiLocale, windowDays: number): Promise<HintsQualityPayload> {
  const now = Date.now();
  const from = new Date(now - windowDays * 24 * 60 * 60 * 1000);

  let feedbackRows: EduHintFeedback[] = [];
  try {
    feedbackRows = await hintFeedbackRepo()
      .createQueryBuilder("feedback")
      .leftJoinAndSelect("feedback.student", "student")
      .leftJoinAndSelect("feedback.topicTask", "topicTask")
      .leftJoin("topicTask.topic", "topic")
      .where("topic.class_id = :classId", { classId })
      .andWhere("feedback.created_at >= :from", { from })
      .orderBy("feedback.created_at", "DESC")
      .getMany();
  } catch (error: unknown) {
    if (!isHintFeedbackTableMissingError(error)) {
      throw error;
    }
    logger.warn("[edu/insights] edu_hint_feedback table missing; returning empty hint quality analytics", { classId });
  }

  let positiveCount = 0;
  let negativeCount = 0;

  const reasonMap = new Map<string, { count: number; positive: number }>();
  const variantMap = new Map<HintStrategyVariant, { count: number; positive: number }>([
    ["A", { count: 0, positive: 0 }],
    ["B", { count: 0, positive: 0 }],
  ]);

  for (const row of feedbackRows) {
    const isPositive = row.signal === "UP";
    if (isPositive) positiveCount += 1;
    else negativeCount += 1;

    const reasonCode = String(row.reasonCode || "OTHER");
    const reasonEntry = reasonMap.get(reasonCode) || { count: 0, positive: 0 };
    reasonEntry.count += 1;
    if (isPositive) reasonEntry.positive += 1;
    reasonMap.set(reasonCode, reasonEntry);

    const variant = resolveHintStrategyVariant({
      studentId: row.student?.id ?? 0,
      taskId: row.topicTask?.id ?? 0,
      codeHash: String(row.codeHash || row.id),
    });
    const variantEntry = variantMap.get(variant) || { count: 0, positive: 0 };
    variantEntry.count += 1;
    if (isPositive) variantEntry.positive += 1;
    variantMap.set(variant, variantEntry);
  }

  const totalFeedback = positiveCount + negativeCount;
  const positiveRate = totalFeedback > 0 ? roundTo((positiveCount / totalFeedback) * 100, 2) : 0;
  const helpfulnessScore = totalFeedback > 0
    ? roundTo(((positiveCount - negativeCount) / totalFeedback) * 100, 2)
    : 0;

  const byReason = [...reasonMap.entries()]
    .map(([reasonCode, value]) => ({
      reasonCode,
      count: value.count,
      positiveRate: value.count > 0 ? roundTo((value.positive / value.count) * 100, 2) : 0,
    }))
    .sort((a, b) => b.count - a.count || a.reasonCode.localeCompare(b.reasonCode))
    .slice(0, 8);

  const byVariant = (["A", "B"] as HintStrategyVariant[])
    .map(variant => {
      const value = variantMap.get(variant) || { count: 0, positive: 0 };
      return {
        variant,
        count: value.count,
        positiveRate: value.count > 0 ? roundTo((value.positive / value.count) * 100, 2) : 0,
      };
    });

  return {
    locale,
    classId,
    windowDays,
    totalFeedback,
    positiveCount,
    negativeCount,
    positiveRate,
    helpfulnessScore,
    byReason,
    byVariant,
    generatedAt: new Date().toISOString(),
  };
}

async function buildAppealsDigestForClass(classId: number, windowDays: number): Promise<{
  total: number;
  active: number;
  resolved: number;
  newInWindow: number;
  overdueActive: number;
  escalatedActive: number;
  avgResolutionHours: number;
}> {
  const nowMs = Date.now();
  const fromMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  const appeals = await appealRepo()
    .createQueryBuilder("appeal")
    .where("appeal.class_id = :classId", { classId })
    .getMany();

  let active = 0;
  let resolved = 0;
  let newInWindow = 0;
  let overdueActive = 0;
  let escalatedActive = 0;

  let resolutionHoursSum = 0;
  let resolutionHoursCount = 0;

  for (const appeal of appeals) {
    const createdAtMs = appeal.createdAt instanceof Date ? appeal.createdAt.getTime() : 0;
    if (createdAtMs >= fromMs) {
      newInWindow += 1;
    }

    if (ACTIVE_APPEAL_STATUSES.includes(appeal.status)) {
      active += 1;
      const slaDueAtMs = createdAtMs + APPEAL_SLA_HOURS * 60 * 60 * 1000;
      const escalationAtMs = createdAtMs + APPEAL_ESCALATION_HOURS * 60 * 60 * 1000;
      if (nowMs > slaDueAtMs) overdueActive += 1;
      if (nowMs >= escalationAtMs) escalatedActive += 1;
    } else {
      resolved += 1;
    }

    if (appeal.resolvedAt instanceof Date && appeal.createdAt instanceof Date) {
      const deltaHours = (appeal.resolvedAt.getTime() - appeal.createdAt.getTime()) / (60 * 60 * 1000);
      if (Number.isFinite(deltaHours) && deltaHours >= 0) {
        resolutionHoursSum += deltaHours;
        resolutionHoursCount += 1;
      }
    }
  }

  return {
    total: appeals.length,
    active,
    resolved,
    newInWindow,
    overdueActive,
    escalatedActive,
    avgResolutionHours: resolutionHoursCount > 0 ? roundTo(resolutionHoursSum / resolutionHoursCount, 2) : 0,
  };
}

async function buildRiskInterventionPlan(
  cls: Class,
  locale: UiLocale,
  options?: {
    limitStudents?: number;
    maxTasksPerStudent?: number;
    topicId?: number | null;
    deadlineDays?: number;
  }
): Promise<{
  analytics: CohortAnalyticsPayload;
  studentsTargeted: Array<{ studentId: number; studentName: string }>;
  tasksSelected: Array<{ taskId: number; title: string; topicId: number; topicTitle: string }>;
  deadlineAt: Date | null;
}> {
  const limitStudents = clampInt(options?.limitStudents, 6, 1, 30);
  const maxTasksPerStudent = clampInt(options?.maxTasksPerStudent, 2, 1, 5);
  const deadlineDays = clampInt(options?.deadlineDays, 7, 0, 30);
  const topicFilter = Number.isFinite(Number(options?.topicId)) ? Number(options?.topicId) : null;

  const analytics = await buildCohortAnalytics(cls, locale);
  const studentsTargeted = analytics.riskStudents
    .slice(0, limitStudents)
    .map(item => ({ studentId: item.studentId, studentName: item.studentName }));

  if (studentsTargeted.length === 0) {
    return {
      analytics,
      studentsTargeted: [],
      tasksSelected: [],
      deadlineAt: deadlineDays > 0 ? new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000) : null,
    };
  }

  const topicOrderByRisk = [...analytics.topics]
    .filter(topic => !topicFilter || topic.topicId === topicFilter)
    .sort((a, b) => {
      const scoreA = (60 - a.avgScore) + (0.65 - a.passRate) * 100 + (0.7 - a.completionRate) * 80 + a.weakTasks.length * 5;
      const scoreB = (60 - b.avgScore) + (0.65 - b.passRate) * 100 + (0.7 - b.completionRate) * 80 + b.weakTasks.length * 5;
      return scoreB - scoreA;
    });

  const classTopics = await topicRepo()
    .createQueryBuilder("topic")
    .leftJoinAndSelect("topic.tasks", "task")
    .where("topic.class_id = :classId", { classId: cls.id })
    .orderBy("topic.order", "ASC")
    .addOrderBy("task.order", "ASC")
    .getMany();

  const byTopicId = new Map<number, TopicNew>();
  for (const topic of classTopics) {
    byTopicId.set(topic.id, topic);
  }

  const selectedTasks: Array<{ taskId: number; title: string; topicId: number; topicTitle: string }> = [];
  const seenTaskIds = new Set<number>();

  for (const topicRisk of topicOrderByRisk) {
    const topic = byTopicId.get(topicRisk.topicId);
    if (!topic) continue;

    const weakTaskIds = new Set<number>(topicRisk.weakTasks.map(task => task.taskId));
    const candidates = (topic.tasks || [])
      .filter(task => task.type === "PRACTICE")
      .sort((a, b) => {
        const aWeak = weakTaskIds.has(a.id) ? 1 : 0;
        const bWeak = weakTaskIds.has(b.id) ? 1 : 0;
        return bWeak - aWeak || a.order - b.order || a.id - b.id;
      });

    for (const task of candidates) {
      if (seenTaskIds.has(task.id)) continue;
      seenTaskIds.add(task.id);
      selectedTasks.push({
        taskId: task.id,
        title: task.title,
        topicId: topic.id,
        topicTitle: topic.title,
      });
      if (selectedTasks.length >= maxTasksPerStudent) break;
    }

    if (selectedTasks.length >= maxTasksPerStudent) break;
  }

  const deadlineAt = deadlineDays > 0
    ? new Date(Date.now() + deadlineDays * 24 * 60 * 60 * 1000)
    : null;

  return {
    analytics,
    studentsTargeted,
    tasksSelected: selectedTasks,
    deadlineAt,
  };
}

router.get("/classes/:classId/hints-quality", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const windowDays = clampInt(req.query.days, 14, 1, 90);
    const payload = await buildHintsQualityForClass(classId, locale, windowDays);
    return res.json(payload);
  } catch (error: any) {
    logger.error("[edu/insights] failed to build hints quality", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/teacher-digest", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const windowDays = clampInt(req.query.days, DIGEST_WINDOW_DAYS, 1, 60);
    const from = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const analytics = await buildCohortAnalytics(access.cls, locale);
    const appeals = await buildAppealsDigestForClass(classId, windowDays);
    const hints = await buildHintsQualityForClass(classId, locale, windowDays);
    const recommendations = buildTeacherCopilotSuggestions(locale, analytics).slice(0, 4);

    const payload: TeacherDigestPayload = {
      locale,
      classId: analytics.classId,
      className: analytics.className,
      windowDays,
      period: {
        from: from.toISOString(),
        to: new Date().toISOString(),
      },
      overview: analytics.overview,
      appeals,
      hints,
      recommendations,
      generatedAt: new Date().toISOString(),
    };

    return res.json(payload);
  } catch (error: any) {
    logger.error("[edu/insights] failed to build teacher digest", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/risk-interventions", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const plan = await buildRiskInterventionPlan(access.cls, locale, {
      limitStudents: req.query.limitStudents,
      maxTasksPerStudent: req.query.maxTasksPerStudent,
      topicId: req.query.topicId,
      deadlineDays: req.query.deadlineDays,
    });

    const payload: RiskInterventionPlanPayload = {
      locale,
      classId: access.cls.id,
      className: access.cls.name,
      dryRun: true,
      studentsTargeted: plan.studentsTargeted,
      tasksSelected: plan.tasksSelected,
      deadlineAppliedAt: plan.deadlineAt ? plan.deadlineAt.toISOString() : null,
      updatedTasks: 0,
      generatedAt: new Date().toISOString(),
    };

    return res.json(payload);
  } catch (error: any) {
    logger.error("[edu/insights] failed to plan risk interventions", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/classes/:classId/risk-interventions/apply", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(req.params.classId, 10);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await resolveTeacherClassAccess(req, classId, "CLASS_EDIT");
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const locale = resolveResponseLocale(req, "uk");
    const plan = await buildRiskInterventionPlan(access.cls, locale, {
      limitStudents: (req.body as any)?.limitStudents,
      maxTasksPerStudent: (req.body as any)?.maxTasksPerStudent,
      topicId: (req.body as any)?.topicId,
      deadlineDays: (req.body as any)?.deadlineDays,
    });

    const dryRun = Boolean((req.body as any)?.dryRun);
    if (plan.studentsTargeted.length === 0 || plan.tasksSelected.length === 0 || dryRun) {
      const payload: RiskInterventionPlanPayload = {
        locale,
        classId: access.cls.id,
        className: access.cls.name,
        dryRun,
        studentsTargeted: plan.studentsTargeted,
        tasksSelected: plan.tasksSelected,
        deadlineAppliedAt: plan.deadlineAt ? plan.deadlineAt.toISOString() : null,
        updatedTasks: 0,
        generatedAt: new Date().toISOString(),
      };
      return res.json(payload);
    }

    const allClassStudentIds = (access.cls.students || []).map(student => student.id);
    const targetedStudentIds = plan.studentsTargeted.map(item => item.studentId);
    const taskIds = plan.tasksSelected.map(item => item.taskId);

    await AppDataSource.transaction("READ COMMITTED", async manager => {
      const rows = await manager
        .getRepository(TopicTask)
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.topic", "topic")
        .where("task.id IN (:...taskIds)", { taskIds })
        .andWhere("topic.class_id = :classId", { classId: access.cls.id })
        .getMany();

      for (const task of rows) {
        const existingAssigned = normalizeAssignedStudentIds((task as any).assignedStudentIds);
        const merged = [...new Set([...existingAssigned, ...targetedStudentIds])];
        task.isAssigned = true;
        (task as any).assignedStudentIds = normalizeTargetedAssignmentForStorage(merged, allClassStudentIds);

        if (plan.deadlineAt) {
          if (!task.deadline || task.deadline.getTime() > plan.deadlineAt.getTime()) {
            task.deadline = plan.deadlineAt;
          }
        }
      }

      await manager.getRepository(TopicTask).save(rows);

      for (const task of rows) {
        const normalizedStored = normalizeAssignedStudentIds((task as any).assignedStudentIds);
        const effectiveAssignedStudentIds = normalizedStored.length > 0
          ? normalizedStored
          : allClassStudentIds;

        await syncTopicTaskAssignmentsWithManager(manager, {
          topicTaskId: task.id,
          isAssigned: task.isAssigned,
          assignedStudentIds: effectiveAssignedStudentIds,
        });
      }
    });

    const payload: RiskInterventionPlanPayload = {
      locale,
      classId: access.cls.id,
      className: access.cls.name,
      dryRun: false,
      studentsTargeted: plan.studentsTargeted,
      tasksSelected: plan.tasksSelected,
      deadlineAppliedAt: plan.deadlineAt ? plan.deadlineAt.toISOString() : null,
      updatedTasks: plan.tasksSelected.length,
      generatedAt: new Date().toISOString(),
    };

    return res.json(payload);
  } catch (error: any) {
    logger.error("[edu/insights] failed to apply risk interventions", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
