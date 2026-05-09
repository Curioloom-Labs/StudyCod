import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { EduGrade } from "../../entities/EduGrade";
import { GradeAppeal, type GradeAppealStatus } from "../../entities/GradeAppeal";
import { EduHintFeedback } from "../../entities/EduHintFeedback";
import { TopicTask } from "../../entities/TopicTask";
import { emailService } from "../emailService";
import { logger } from "../../utils/logger";

const ACTIVE_APPEAL_STATUSES: GradeAppealStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"];

const DEFAULT_WINDOW_DAYS = Number.isFinite(Number(process.env.EDU_TEACHER_DIGEST_WINDOW_DAYS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_TEACHER_DIGEST_WINDOW_DAYS)))
  : 7;

const DEFAULT_SLA_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_SLA_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_APPEAL_SLA_HOURS)))
  : 48;

const DEFAULT_ESCALATION_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_ESCALATION_HOURS))
  ? Math.max(DEFAULT_SLA_HOURS, Math.floor(Number(process.env.EDU_APPEAL_ESCALATION_HOURS)))
  : 72;

const classRepo = () => AppDataSource.getRepository(Class);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const appealRepo = () => AppDataSource.getRepository(GradeAppeal);
const hintFeedbackRepo = () => AppDataSource.getRepository(EduHintFeedback);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);

function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function roundTo(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function escapeHtml(input: unknown): string {
  const s = String(input ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isHintFeedbackTableMissingError(error: unknown): boolean {
  const code = String((error as any)?.code ?? "").toUpperCase();
  if (code === "ER_NO_SUCH_TABLE" || code === "42P01") return true;
  const message = String((error as any)?.message ?? "").toLowerCase();
  return message.includes("doesn't exist") || message.includes("no such table") || (message.includes("relation") && message.includes("does not exist"));
}

function isGradeCompleted(grade: EduGrade | null): boolean {
  if (!grade) return false;
  if (grade.isCompleted || grade.isManuallyGraded) return true;
  if (grade.testsTotal > 0 && grade.testsPassed >= grade.testsTotal) return true;
  if (typeof grade.total === "number" && Number.isFinite(grade.total) && grade.total >= 70) return true;
  return false;
}

function getIsoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function ensureDate(date: Date): Date {
  if (date instanceof Date && !Number.isNaN(date.getTime())) return date;
  return new Date();
}

type DigestSnapshot = {
  classId: number;
  className: string;
  teacherUserId: number;
  teacherEmail: string;
  studentsCount: number;
  tasksTracked: number;
  avgScore: number;
  completionRate: number;
  passRate: number;
  riskStudents: Array<{ studentId: number; studentName: string; avgScore: number; completionRate: number; weakSignals: number }>;
  appeals: {
    total: number;
    active: number;
    resolved: number;
    newInWindow: number;
    overdueActive: number;
    escalatedActive: number;
    avgResolutionHours: number;
  };
  hints: {
    totalFeedback: number;
    positiveCount: number;
    negativeCount: number;
    positiveRate: number;
    helpfulnessScore: number;
  };
  recommendations: string[];
};

function buildRecommendations(snapshot: DigestSnapshot): string[] {
  const out: string[] = [];

  if (snapshot.completionRate < 0.7) {
    out.push("Потрібно підсилити темп виконання: зафіксувати короткі дедлайни та мінімум задач до контрольної.");
  }

  if (snapshot.avgScore < 65) {
    out.push("Середній бал просідає: додайте 10–15 хв розбору типових помилок на найближчому уроці.");
  }

  if (snapshot.riskStudents.length > 0) {
    out.push(`Є ${snapshot.riskStudents.length} учн. у групі ризику: сформуйте персональний міні-план (2–3 задачі) на тиждень.`);
  }

  if (snapshot.appeals.overdueActive > 0 || snapshot.appeals.escalatedActive > 0) {
    out.push("Є прострочені/ескаловані апеляції: пріоритезуйте їхній розгляд до наступного дайджесту.");
  }

  if (snapshot.hints.totalFeedback > 0 && snapshot.hints.positiveRate < 60) {
    out.push("Якість підказок нижча за ціль: перевірте формулювання задач та додайте контр-приклади.");
  }

  if (out.length === 0) {
    out.push("Клас у стабільній зоні: можна додати 1 challenge-задачу для зростання темпу.");
  }

  return out.slice(0, 4);
}

async function buildDigestSnapshotForClass(params: {
  cls: Class;
  now: Date;
  windowDays: number;
  slaHours: number;
  escalationHours: number;
}): Promise<DigestSnapshot> {
  const { cls, now, windowDays, slaHours, escalationHours } = params;
  const from = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const students = Array.isArray(cls.students) ? cls.students : [];
  const studentsCount = students.length;

  const trackedTasks = await topicTaskRepo()
    .createQueryBuilder("task")
    .leftJoin("task.topic", "topic")
    .leftJoin("task.controlWork", "controlWork")
    .where("topic.class_id = :classId", { classId: cls.id })
    .andWhere("(task.is_assigned = 1 OR (task.type = 'CONTROL' AND controlWork.is_assigned = 1))")
    .select(["task.id"])
    .getMany();

  const taskIds = trackedTasks
    .map(task => Number(task.id))
    .filter(id => Number.isFinite(id) && id > 0);

  const latestByStudentTask = new Map<string, EduGrade>();
  const studentAgg = new Map<number, {
    studentName: string;
    completed: number;
    attempted: number;
    weakSignals: number;
    scores: number[];
  }>();

  for (const student of students) {
    studentAgg.set(student.id, {
      studentName: `${student.lastName} ${student.firstName}${student.middleName ? ` ${student.middleName}` : ""}`.trim(),
      completed: 0,
      attempted: 0,
      weakSignals: 0,
      scores: [],
    });
  }

  if (taskIds.length > 0) {
    const grades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoinAndSelect("grade.student", "student")
      .leftJoinAndSelect("grade.topicTask", "topicTask")
      .where("student.class_id = :classId", { classId: cls.id })
      .andWhere("grade.topic_task_id IN (:...taskIds)", { taskIds })
      .orderBy("grade.created_at", "DESC")
      .getMany();

    for (const grade of grades) {
      const studentId = grade.student?.id;
      const taskId = grade.topicTask?.id;
      if (!studentId || !taskId) continue;

      const key = `${studentId}:${taskId}`;
      if (latestByStudentTask.has(key)) continue;
      latestByStudentTask.set(key, grade);
    }
  }

  let scoreSum = 0;
  let scoreCount = 0;
  let completedAssignments = 0;
  let passedAssignments = 0;

  for (const grade of latestByStudentTask.values()) {
    const agg = studentAgg.get(grade.student.id);
    if (agg) {
      agg.attempted += 1;
    }

    if (isGradeCompleted(grade)) {
      completedAssignments += 1;
      if (agg) agg.completed += 1;
    }

    if (typeof grade.total === "number" && Number.isFinite(grade.total)) {
      scoreSum += grade.total;
      scoreCount += 1;
      if (agg) agg.scores.push(grade.total);

      if (grade.total >= 60) {
        passedAssignments += 1;
      } else if (agg) {
        agg.weakSignals += 1;
      }
    }
  }

  const assignmentsTotal = studentsCount * taskIds.length;
  const attemptedAssignments = latestByStudentTask.size;

  const avgScore = scoreCount > 0 ? roundTo(scoreSum / scoreCount, 2) : 0;
  const completionRate = assignmentsTotal > 0 ? roundTo(completedAssignments / assignmentsTotal, 4) : 0;
  const passRate = attemptedAssignments > 0 ? roundTo(passedAssignments / attemptedAssignments, 4) : 0;

  const riskStudents = [...studentAgg.entries()]
    .map(([studentId, agg]) => {
      const avg = agg.scores.length > 0 ? roundTo(agg.scores.reduce((sum, score) => sum + score, 0) / agg.scores.length, 2) : 0;
      const completion = taskIds.length > 0 ? roundTo(agg.completed / taskIds.length, 4) : 0;
      return {
        studentId,
        studentName: agg.studentName,
        avgScore: avg,
        completionRate: completion,
        weakSignals: agg.weakSignals,
      };
    })
    .filter(item => item.avgScore < 60 || item.completionRate < 0.6 || item.weakSignals >= 2)
    .sort((a, b) => {
      const riskA = (60 - a.avgScore) + (1 - a.completionRate) * 100 + a.weakSignals * 5;
      const riskB = (60 - b.avgScore) + (1 - b.completionRate) * 100 + b.weakSignals * 5;
      return riskB - riskA;
    })
    .slice(0, 8);

  const appeals = await appealRepo()
    .createQueryBuilder("appeal")
    .where("appeal.class_id = :classId", { classId: cls.id })
    .getMany();

  let activeAppeals = 0;
  let resolvedAppeals = 0;
  let newInWindow = 0;
  let overdueActive = 0;
  let escalatedActive = 0;
  let resolutionHoursSum = 0;
  let resolutionHoursCount = 0;

  for (const appeal of appeals) {
    const createdAtMs = appeal.createdAt instanceof Date ? appeal.createdAt.getTime() : 0;
    if (createdAtMs >= from.getTime()) {
      newInWindow += 1;
    }

    if (ACTIVE_APPEAL_STATUSES.includes(appeal.status)) {
      activeAppeals += 1;
      const dueAtMs = createdAtMs + slaHours * 60 * 60 * 1000;
      const escalateAtMs = createdAtMs + escalationHours * 60 * 60 * 1000;
      if (now.getTime() > dueAtMs) overdueActive += 1;
      if (now.getTime() >= escalateAtMs) escalatedActive += 1;
    } else {
      resolvedAppeals += 1;
    }

    if (appeal.createdAt instanceof Date && appeal.resolvedAt instanceof Date) {
      const deltaHours = (appeal.resolvedAt.getTime() - appeal.createdAt.getTime()) / (60 * 60 * 1000);
      if (Number.isFinite(deltaHours) && deltaHours >= 0) {
        resolutionHoursSum += deltaHours;
        resolutionHoursCount += 1;
      }
    }
  }

  let totalFeedback = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  try {
    const feedbackRows = await hintFeedbackRepo()
      .createQueryBuilder("feedback")
      .leftJoin("feedback.topicTask", "topicTask")
      .leftJoin("topicTask.topic", "topic")
      .where("topic.class_id = :classId", { classId: cls.id })
      .andWhere("feedback.created_at >= :from", { from })
      .getMany();

    totalFeedback = feedbackRows.length;
    for (const row of feedbackRows) {
      if (row.signal === "UP") positiveCount += 1;
      else negativeCount += 1;
    }
  } catch (error: unknown) {
    if (!isHintFeedbackTableMissingError(error)) {
      throw error;
    }
  }

  const positiveRate = totalFeedback > 0 ? roundTo((positiveCount / totalFeedback) * 100, 2) : 0;
  const helpfulnessScore = totalFeedback > 0
    ? roundTo(((positiveCount - negativeCount) / totalFeedback) * 100, 2)
    : 0;

  const snapshot: DigestSnapshot = {
    classId: cls.id,
    className: cls.name,
    teacherUserId: cls.teacher.id,
    teacherEmail: String(cls.teacher.email || "").trim(),
    studentsCount,
    tasksTracked: taskIds.length,
    avgScore,
    completionRate,
    passRate,
    riskStudents,
    appeals: {
      total: appeals.length,
      active: activeAppeals,
      resolved: resolvedAppeals,
      newInWindow,
      overdueActive,
      escalatedActive,
      avgResolutionHours: resolutionHoursCount > 0 ? roundTo(resolutionHoursSum / resolutionHoursCount, 2) : 0,
    },
    hints: {
      totalFeedback,
      positiveCount,
      negativeCount,
      positiveRate,
      helpfulnessScore,
    },
    recommendations: [],
  };

  snapshot.recommendations = buildRecommendations(snapshot);
  return snapshot;
}

function buildDigestEmailHtml(snapshot: DigestSnapshot, weekKey: string, windowDays: number): string {
  const completionPct = Math.round(snapshot.completionRate * 100);
  const passPct = Math.round(snapshot.passRate * 100);

  const riskHtml = snapshot.riskStudents.length > 0
    ? `<ul style="margin:8px 0 0 16px;padding:0;">
      ${snapshot.riskStudents.slice(0, 5).map(item => `<li style="margin:0 0 6px 0;">${escapeHtml(item.studentName)} — avg ${item.avgScore}, completion ${Math.round(item.completionRate * 100)}%</li>`).join("")}
    </ul>`
    : `<p style="margin:8px 0 0 0;">Групу ризику не виявлено.</p>`;

  const recommendationsHtml = `<ul style="margin:8px 0 0 16px;padding:0;">
    ${snapshot.recommendations.map(item => `<li style="margin:0 0 6px 0;">${escapeHtml(item)}</li>`).join("")}
  </ul>`;

  return `
    <p style="margin:0 0 12px 0;">Щотижневий дайджест класу <b>${escapeHtml(snapshot.className)}</b> (${escapeHtml(weekKey)}, window ${windowDays}d).</p>

    <h3 style="margin:16px 0 8px 0;font-size:15px;">Навчальні метрики</h3>
    <ul style="margin:8px 0 0 16px;padding:0;">
      <li>Учнів: <b>${snapshot.studentsCount}</b></li>
      <li>Відслідковуваних задач: <b>${snapshot.tasksTracked}</b></li>
      <li>Середній бал: <b>${snapshot.avgScore}</b></li>
      <li>Completion rate: <b>${completionPct}%</b></li>
      <li>Pass rate: <b>${passPct}%</b></li>
    </ul>

    <h3 style="margin:16px 0 8px 0;font-size:15px;">Апеляції</h3>
    <ul style="margin:8px 0 0 16px;padding:0;">
      <li>Всього: <b>${snapshot.appeals.total}</b>, активні: <b>${snapshot.appeals.active}</b>, завершені: <b>${snapshot.appeals.resolved}</b></li>
      <li>Нові за вікно: <b>${snapshot.appeals.newInWindow}</b></li>
      <li>Прострочені SLA: <b>${snapshot.appeals.overdueActive}</b>, ескаловані: <b>${snapshot.appeals.escalatedActive}</b></li>
      <li>Середній час розв'язання: <b>${snapshot.appeals.avgResolutionHours}h</b></li>
    </ul>

    <h3 style="margin:16px 0 8px 0;font-size:15px;">Якість підказок</h3>
    <ul style="margin:8px 0 0 16px;padding:0;">
      <li>Фідбеків: <b>${snapshot.hints.totalFeedback}</b></li>
      <li>Позитивних: <b>${snapshot.hints.positiveCount}</b>, негативних: <b>${snapshot.hints.negativeCount}</b></li>
      <li>Positive rate: <b>${snapshot.hints.positiveRate}%</b>, helpfulness score: <b>${snapshot.hints.helpfulnessScore}</b></li>
    </ul>

    <h3 style="margin:16px 0 8px 0;font-size:15px;">Учні у фокусі</h3>
    ${riskHtml}

    <h3 style="margin:16px 0 8px 0;font-size:15px;">Рекомендовані дії</h3>
    ${recommendationsHtml}
  `;
}

function buildDigestEmailText(snapshot: DigestSnapshot, weekKey: string, windowDays: number): string {
  const completionPct = Math.round(snapshot.completionRate * 100);
  const passPct = Math.round(snapshot.passRate * 100);
  const risk = snapshot.riskStudents.slice(0, 5).map(item => `- ${item.studentName}: avg ${item.avgScore}, completion ${Math.round(item.completionRate * 100)}%`).join("\n") || "- none";
  const recommendations = snapshot.recommendations.map(item => `- ${item}`).join("\n");

  return [
    `Щотижневий дайджест класу: ${snapshot.className}`,
    `Week: ${weekKey} (window ${windowDays}d)`,
    "",
    `Учнів: ${snapshot.studentsCount}`,
    `Відслідковуваних задач: ${snapshot.tasksTracked}`,
    `Середній бал: ${snapshot.avgScore}`,
    `Completion rate: ${completionPct}%`,
    `Pass rate: ${passPct}%`,
    "",
    `Апеляції: total=${snapshot.appeals.total}, active=${snapshot.appeals.active}, resolved=${snapshot.appeals.resolved}, new=${snapshot.appeals.newInWindow}, overdue=${snapshot.appeals.overdueActive}, escalated=${snapshot.appeals.escalatedActive}`,
    `Avg resolution: ${snapshot.appeals.avgResolutionHours}h`,
    "",
    `Hints: feedback=${snapshot.hints.totalFeedback}, up=${snapshot.hints.positiveCount}, down=${snapshot.hints.negativeCount}, positiveRate=${snapshot.hints.positiveRate}%, helpfulness=${snapshot.hints.helpfulnessScore}`,
    "",
    "Учні у фокусі:",
    risk,
    "",
    "Рекомендовані дії:",
    recommendations,
  ].join("\n");
}

async function reserveWeeklyDelivery(params: {
  classId: number;
  teacherUserId: number;
  weekKey: string;
  windowDays: number;
}): Promise<number | null> {
  try {
    const result: any = await AppDataSource.query(
      "INSERT INTO `teacher_digest_deliveries` (`class_id`, `teacher_user_id`, `week_key`, `window_days`, `status`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, 'RESERVED', NOW(6), NOW(6))",
      [params.classId, params.teacherUserId, params.weekKey, params.windowDays]
    );

    const insertId = Number(result?.insertId ?? 0);
    return Number.isFinite(insertId) && insertId > 0 ? insertId : null;
  } catch (error: any) {
    const code = String(error?.code ?? "").toUpperCase();
    const errno = Number(error?.errno ?? 0);
    if (code === "ER_DUP_ENTRY" || errno === 1062) {
      return null;
    }
    throw error;
  }
}

async function markDeliverySent(deliveryId: number, payload: DigestSnapshot): Promise<void> {
  await AppDataSource.query(
    "UPDATE `teacher_digest_deliveries` SET `status` = 'SENT', `payload_json` = ?, `last_error` = NULL, `sent_at` = NOW(6), `updated_at` = NOW(6) WHERE `id` = ?",
    [JSON.stringify(payload), deliveryId]
  );
}

async function releaseDeliveryOnFailure(deliveryId: number, errorMessage: string): Promise<void> {
  await AppDataSource.query(
    "UPDATE `teacher_digest_deliveries` SET `last_error` = ?, `updated_at` = NOW(6) WHERE `id` = ?",
    [errorMessage.slice(0, 8000), deliveryId]
  );

  await AppDataSource.query(
    "DELETE FROM `teacher_digest_deliveries` WHERE `id` = ? AND `status` = 'RESERVED'",
    [deliveryId]
  );
}

export type SendTeacherWeeklyDigestsResult = {
  date: string;
  weekKey: string;
  windowDays: number;
  classesScanned: number;
  candidates: number;
  reserved: number;
  sent: number;
  skippedAlreadySent: number;
  failed: number;
  dryRun: boolean;
};

export async function sendWeeklyTeacherDigestsForDate(
  date: Date,
  opts?: {
    dryRun?: boolean;
    limitClasses?: number;
    windowDays?: number;
    slaHours?: number;
    escalationHours?: number;
  }
): Promise<SendTeacherWeeklyDigestsResult> {
  const now = ensureDate(date);
  const dryRun = Boolean(opts?.dryRun);
  const limitClasses = clampInt(opts?.limitClasses, 0, 0, 10_000);
  const windowDays = clampInt(opts?.windowDays, DEFAULT_WINDOW_DAYS, 1, 60);
  const slaHours = clampInt(opts?.slaHours, DEFAULT_SLA_HOURS, 1, 240);
  const escalationHours = clampInt(opts?.escalationHours, DEFAULT_ESCALATION_HOURS, slaHours, 720);

  const weekKey = getIsoWeekKey(now);

  let query = classRepo()
    .createQueryBuilder("class")
    .leftJoinAndSelect("class.teacher", "teacher")
    .leftJoinAndSelect("class.students", "students")
    .where("teacher.email_verified = 1")
    .andWhere("teacher.email IS NOT NULL")
    .andWhere("teacher.email <> ''")
    .andWhere("teacher.marketing_emails_enabled = 1")
    .orderBy("class.id", "ASC");

  if (limitClasses > 0) {
    query = query.limit(limitClasses);
  }

  const classes = await query.getMany();

  let candidates = 0;
  let reserved = 0;
  let sent = 0;
  let skippedAlreadySent = 0;
  let failed = 0;

  for (const cls of classes) {
    const teacherEmail = String(cls.teacher?.email || "").trim();
    if (!teacherEmail) continue;

    const snapshot = await buildDigestSnapshotForClass({
      cls,
      now,
      windowDays,
      slaHours,
      escalationHours,
    });

    const meaningful = snapshot.studentsCount > 0 || snapshot.tasksTracked > 0 || snapshot.appeals.total > 0 || snapshot.hints.totalFeedback > 0;
    if (!meaningful) {
      continue;
    }

    candidates += 1;

    if (dryRun) {
      continue;
    }

    const deliveryId = await reserveWeeklyDelivery({
      classId: snapshot.classId,
      teacherUserId: snapshot.teacherUserId,
      weekKey,
      windowDays,
    });

    if (!deliveryId) {
      skippedAlreadySent += 1;
      continue;
    }

    reserved += 1;

    try {
      const subject = `Weekly teacher digest / Щотижневий дайджест • ${snapshot.className}`;
      const contentHtml = buildDigestEmailHtml(snapshot, weekKey, windowDays);
      const text = buildDigestEmailText(snapshot, weekKey, windowDays);

      await emailService.sendNotificationEmail({
        to: snapshot.teacherEmail,
        subject,
        title: "Щотижневий дайджест викладача",
        contentHtml,
        text,
      });

      await markDeliverySent(deliveryId, snapshot);
      sent += 1;
    } catch (error: any) {
      failed += 1;
      const message = String(error?.message || error || "unknown digest send failure");
      logger.error("[teacher-digest] failed to send weekly digest", {
        classId: snapshot.classId,
        className: snapshot.className,
        teacherUserId: snapshot.teacherUserId,
        weekKey,
        message,
      });

      try {
        await releaseDeliveryOnFailure(deliveryId, message);
      } catch (releaseError: any) {
        logger.error("[teacher-digest] failed to release reserved digest slot", {
          classId: snapshot.classId,
          deliveryId,
          message: String(releaseError?.message || releaseError || "unknown release failure"),
        });
      }
    }
  }

  return {
    date: now.toISOString(),
    weekKey,
    windowDays,
    classesScanned: classes.length,
    candidates,
    reserved,
    sent,
    skippedAlreadySent,
    failed,
    dryRun,
  };
}
