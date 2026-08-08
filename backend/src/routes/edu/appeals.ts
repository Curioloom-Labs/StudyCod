import { Router, Response } from "express";
import { z } from "zod";
import { In } from "typeorm";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { authorizeClassForReq } from "../../middleware/orgContext";
import type { Capability } from "../../services/edu/rbac";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { Class } from "../../entities/Class";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import {
  GradeAppeal,
  GRADE_APPEAL_REASON_CODES,
  GRADE_APPEAL_STATUSES,
  GRADE_APPEAL_TARGET_TYPES,
  type GradeAppealStatus,
} from "../../entities/GradeAppeal";
import { GradeAppealMessage } from "../../entities/GradeAppealMessage";
import {
  markControlWorkAttemptCompletedIfReadyWithManager,
  saveControlSummaryGradeForNewSystemWithManager,
} from "../../services/edu/controlWorkGrading";
import { logger } from "../../utils/logger";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
const appealRepo = () => AppDataSource.getRepository(GradeAppeal);
const appealMessageRepo = () => AppDataSource.getRepository(GradeAppealMessage);

const APPEAL_WINDOW_DAYS = Number.isFinite(Number(process.env.EDU_APPEAL_WINDOW_DAYS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_APPEAL_WINDOW_DAYS)))
  : 7;
const APPEAL_WINDOW_MS = APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

const MAX_ACTIVE_APPEALS_PER_STUDENT = Number.isFinite(Number(process.env.EDU_MAX_ACTIVE_APPEALS_PER_STUDENT))
  ? Math.max(1, Math.floor(Number(process.env.EDU_MAX_ACTIVE_APPEALS_PER_STUDENT)))
  : 5;

const ACTIVE_APPEAL_STATUSES: GradeAppealStatus[] = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO"];

const APPEAL_SLA_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_SLA_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_APPEAL_SLA_HOURS)))
  : 48;

const APPEAL_SLA_WARNING_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_SLA_WARNING_HOURS))
  ? Math.max(1, Math.floor(Number(process.env.EDU_APPEAL_SLA_WARNING_HOURS)))
  : 8;

const APPEAL_ESCALATION_HOURS = Number.isFinite(Number(process.env.EDU_APPEAL_ESCALATION_HOURS))
  ? Math.max(APPEAL_SLA_HOURS, Math.floor(Number(process.env.EDU_APPEAL_ESCALATION_HOURS)))
  : 72;

const createAppealBodySchema = z.object({
  targetType: z.enum(GRADE_APPEAL_TARGET_TYPES),
  targetId: z.number().int().positive(),
  reasonCode: z.enum(GRADE_APPEAL_REASON_CODES),
  reasonText: z.string().trim().min(10).max(5000),
  desiredOutcome: z.string().trim().max(2000).optional(),
});

const postAppealMessageSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

const cancelAppealSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

const updateAppealStatusSchema = z.object({
  status: z.enum(["IN_REVIEW", "NEEDS_INFO"]),
  message: z.string().trim().max(5000).optional(),
});

const resolveAppealSchema = z.object({
  outcome: z.enum(["RESOLVED_ACCEPTED", "RESOLVED_PARTIAL", "RESOLVED_REJECTED"]),
  resolutionText: z.string().trim().min(1).max(5000),
  applyGradeChange: z.boolean().optional(),
  newGrade: z.number().finite().min(0).max(100).optional(),
  message: z.string().trim().max(5000).optional(),
});

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toIso(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function fullStudentName(student: Student | null | undefined): string {
  if (!student) return "";
  return `${student.lastName} ${student.firstName} ${student.middleName || ""}`.trim();
}

function resolveAppealTargetId(appeal: GradeAppeal): number | null {
  if (appeal.targetType === "EDU_GRADE") return appeal.eduGrade?.id ?? null;
  return appeal.summaryGrade?.id ?? null;
}

function resolveAppealTargetTitle(appeal: GradeAppeal): string {
  if (appeal.targetType === "EDU_GRADE") {
    if (appeal.eduGrade?.topicTask?.title) return appeal.eduGrade.topicTask.title;
    if (appeal.eduGrade?.task?.title) return appeal.eduGrade.task.title;
    return `Grade #${appeal.eduGrade?.id ?? "?"}`;
  }

  const summary = appeal.summaryGrade;
  if (!summary) return `Summary #${appeal.id}`;
  if (summary.controlWork?.title) return summary.controlWork.title;
  if (summary.topic?.title) return `${summary.topic.title} • ${summary.name}`;
  if (summary.name) return summary.name;
  return `Summary #${summary.id}`;
}

function computeAppealSlaMeta(appeal: GradeAppeal): {
  slaDueAt: string | null;
  slaRemainingSeconds: number | null;
  slaState: "ON_TRACK" | "AT_RISK" | "OVERDUE" | "CLOSED";
  escalationLevel: "NONE" | "WARNING" | "ESCALATED";
  isEscalated: boolean;
} {
  const isActive = ACTIVE_APPEAL_STATUSES.includes(appeal.status);
  if (!isActive || !(appeal.createdAt instanceof Date)) {
    return {
      slaDueAt: null,
      slaRemainingSeconds: null,
      slaState: "CLOSED",
      escalationLevel: "NONE",
      isEscalated: false,
    };
  }

  const createdAtMs = appeal.createdAt.getTime();
  const nowMs = Date.now();
  const slaDueAtMs = createdAtMs + APPEAL_SLA_HOURS * 60 * 60 * 1000;
  const escalationAtMs = createdAtMs + APPEAL_ESCALATION_HOURS * 60 * 60 * 1000;
  const warningMs = APPEAL_SLA_WARNING_HOURS * 60 * 60 * 1000;
  const remainingMs = slaDueAtMs - nowMs;

  const slaState: "ON_TRACK" | "AT_RISK" | "OVERDUE" = remainingMs <= 0
    ? "OVERDUE"
    : remainingMs <= warningMs
      ? "AT_RISK"
      : "ON_TRACK";

  const escalationLevel: "NONE" | "WARNING" | "ESCALATED" = nowMs >= escalationAtMs
    ? "ESCALATED"
    : slaState === "OVERDUE"
      ? "WARNING"
      : "NONE";

  return {
    slaDueAt: new Date(slaDueAtMs).toISOString(),
    slaRemainingSeconds: Math.floor(remainingMs / 1000),
    slaState,
    escalationLevel,
    isEscalated: escalationLevel === "ESCALATED",
  };
}

function serializeAppeal(appeal: GradeAppeal) {
  const status = appeal.status;
  const isActive = ACTIVE_APPEAL_STATUSES.includes(status);
  const slaMeta = computeAppealSlaMeta(appeal);

  return {
    id: appeal.id,
    status,
    targetType: appeal.targetType,
    targetId: resolveAppealTargetId(appeal),
    targetTitle: resolveAppealTargetTitle(appeal),
    classId: appeal.class?.id ?? null,
    className: appeal.class?.name ?? null,
    studentId: appeal.student?.id ?? null,
    studentName: fullStudentName(appeal.student),
    reasonCode: appeal.reasonCode,
    reasonText: appeal.reasonText,
    desiredOutcome: appeal.desiredOutcome,
    resolutionText: appeal.resolutionText,
    previousGrade: appeal.previousGrade,
    newGrade: appeal.newGrade,
    gradeChanged: Boolean(appeal.gradeChanged),
    startedReviewAt: toIso(appeal.startedReviewAt),
    resolvedAt: toIso(appeal.resolvedAt),
    lastMessageAt: toIso(appeal.lastMessageAt),
    createdAt: toIso(appeal.createdAt),
    updatedAt: toIso(appeal.updatedAt),
    slaDueAt: slaMeta.slaDueAt,
    slaRemainingSeconds: slaMeta.slaRemainingSeconds,
    slaState: slaMeta.slaState,
    escalationLevel: slaMeta.escalationLevel,
    isEscalated: slaMeta.isEscalated,
    canStudentReply: isActive,
    canStudentCancel: status === "SUBMITTED" || status === "NEEDS_INFO",
    canTeacherReply: isActive,
    canTeacherResolve: isActive,
  };
}

function serializeAppealMessage(message: GradeAppealMessage) {
  const senderName = message.senderType === "STUDENT"
    ? fullStudentName(message.senderStudent)
    : message.senderType === "TEACHER"
      ? (message.senderUser?.username || "Teacher")
      : "System";

  return {
    id: message.id,
    senderType: message.senderType,
    senderName,
    senderUserId: message.senderUser?.id ?? null,
    senderStudentId: message.senderStudent?.id ?? null,
    text: message.text,
    createdAt: toIso(message.createdAt),
  };
}

async function getTeacherAccessForClass(
  req: AuthRequest,
  classId: number,
  capability: Capability = "GRADE_EDIT"
): Promise<{ user: User; cls: Class } | null> {
  if (req.userType === "STUDENT" || req.studentId || !req.userId) return null;

  const access = await authorizeClassForReq(req, classId, capability);
  if (!access || !access.allowed) return null;

  const user = await userRepo().findOne({ where: { id: req.userId } });
  if (!user) return null;

  return { user, cls: access.cls };
}

async function loadAppealWithDetails(appealId: number): Promise<GradeAppeal | null> {
  return appealRepo()
    .createQueryBuilder("appeal")
    .leftJoinAndSelect("appeal.student", "student")
    .leftJoinAndSelect("appeal.class", "class")
    .leftJoinAndSelect("appeal.teacherUser", "teacherUser")
    .leftJoinAndSelect("appeal.resolvedByUser", "resolvedByUser")
    .leftJoinAndSelect("appeal.eduGrade", "eduGrade")
    .leftJoinAndSelect("eduGrade.topicTask", "eduGradeTopicTask")
    .leftJoinAndSelect("eduGrade.task", "eduTask")
    .leftJoinAndSelect("appeal.summaryGrade", "summaryGrade")
    .leftJoinAndSelect("summaryGrade.controlWork", "summaryControlWork")
    .leftJoinAndSelect("summaryGrade.topic", "summaryTopic")
    .where("appeal.id = :appealId", { appealId })
    .getOne();
}

async function loadAppealMessages(appealId: number): Promise<GradeAppealMessage[]> {
  return appealMessageRepo()
    .createQueryBuilder("message")
    .leftJoinAndSelect("message.senderUser", "senderUser")
    .leftJoinAndSelect("message.senderStudent", "senderStudent")
    .where("message.appeal_id = :appealId", { appealId })
    .orderBy("message.created_at", "ASC")
    .getMany();
}

router.post("/appeals", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_CREATE_APPEALS" });
    }

    const parsedBody = createAppealBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class", "class.teacher"],
    });
    if (!student || !student.class || !student.class.teacher) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const { targetType, targetId, reasonCode, reasonText, desiredOutcome } = parsedBody.data;

    let eduGrade: EduGrade | null = null;
    let summaryGrade: SummaryGrade | null = null;
    let previousGrade: number | null = null;
    let gradeTimestamp: Date | null = null;

    if (targetType === "EDU_GRADE") {
      eduGrade = await gradeRepo()
        .createQueryBuilder("grade")
        .leftJoinAndSelect("grade.student", "student")
        .leftJoinAndSelect("student.class", "class")
        .leftJoinAndSelect("class.teacher", "teacher")
        .leftJoinAndSelect("grade.topicTask", "topicTask")
        .leftJoinAndSelect("grade.task", "task")
        .where("grade.id = :targetId", { targetId })
        .getOne();

      if (!eduGrade) {
        return res.status(404).json({ message: "GRADE_NOT_FOUND" });
      }
      if (eduGrade.student.id !== student.id) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
      if (eduGrade.total === null || !Number.isFinite(Number(eduGrade.total))) {
        return res.status(409).json({ message: "GRADE_NOT_AVAILABLE_FOR_APPEAL" });
      }
      previousGrade = clampGradeToInt(eduGrade.total);
      gradeTimestamp = eduGrade.updatedAt || eduGrade.createdAt;
    } else {
      summaryGrade = await summaryGradeRepo()
        .createQueryBuilder("summary")
        .leftJoinAndSelect("summary.student", "student")
        .leftJoinAndSelect("summary.class", "class")
        .leftJoinAndSelect("class.teacher", "teacher")
        .leftJoinAndSelect("summary.controlWork", "controlWork")
        .leftJoinAndSelect("summary.topic", "topic")
        .where("summary.id = :targetId", { targetId })
        .getOne();

      if (!summaryGrade) {
        return res.status(404).json({ message: "SUMMARY_GRADE_NOT_FOUND" });
      }
      if (summaryGrade.student.id !== student.id) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
      if (!Number.isFinite(Number(summaryGrade.grade))) {
        return res.status(409).json({ message: "GRADE_NOT_AVAILABLE_FOR_APPEAL" });
      }
      previousGrade = clampGradeToInt(summaryGrade.grade);
      gradeTimestamp = summaryGrade.createdAt;
    }

    if (!gradeTimestamp || Date.now() - gradeTimestamp.getTime() > APPEAL_WINDOW_MS) {
      return res.status(409).json({ message: "APPEAL_WINDOW_EXPIRED", appealWindowDays: APPEAL_WINDOW_DAYS });
    }

    const activeAppealsCount = await appealRepo().count({
      where: {
        student: { id: student.id } as any,
        status: In(ACTIVE_APPEAL_STATUSES as any),
      } as any,
    });

    if (activeAppealsCount >= MAX_ACTIVE_APPEALS_PER_STUDENT) {
      return res.status(429).json({
        message: "ACTIVE_APPEALS_LIMIT_REACHED",
        maxActiveAppeals: MAX_ACTIVE_APPEALS_PER_STUDENT,
      });
    }

    const existingActiveAppeal = await appealRepo()
      .createQueryBuilder("appeal")
      .where("appeal.student_id = :studentId", { studentId: student.id })
      .andWhere("appeal.target_type = :targetType", { targetType })
      .andWhere(targetType === "EDU_GRADE" ? "appeal.edu_grade_id = :targetId" : "appeal.summary_grade_id = :targetId", { targetId })
      .andWhere("appeal.status IN (:...activeStatuses)", { activeStatuses: ACTIVE_APPEAL_STATUSES })
      .getOne();

    if (existingActiveAppeal) {
      return res.status(409).json({
        message: "ACTIVE_APPEAL_ALREADY_EXISTS",
        appealId: existingActiveAppeal.id,
      });
    }

    const now = new Date();
    const appeal = appealRepo().create({
      student,
      class: student.class,
      teacherUser: student.class.teacher,
      eduGrade,
      summaryGrade,
      resolvedByUser: null,
      targetType,
      status: "SUBMITTED",
      reasonCode,
      reasonText,
      desiredOutcome: desiredOutcome || null,
      resolutionText: null,
      previousGrade,
      newGrade: null,
      gradeChanged: false,
      startedReviewAt: null,
      resolvedAt: null,
      lastMessageAt: now,
    });

    await appealRepo().save(appeal);

    const firstMessage = appealMessageRepo().create({
      appeal,
      senderType: "STUDENT",
      senderUser: null,
      senderStudent: student,
      text: reasonText,
    });
    await appealMessageRepo().save(firstMessage);

    const fullAppeal = await loadAppealWithDetails(appeal.id);

    return res.status(201).json({
      message: "APPEAL_CREATED",
      appeal: fullAppeal ? serializeAppeal(fullAppeal) : serializeAppeal(appeal),
    });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to create appeal", { requestId: req.requestId, studentId: req.studentId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/appeals/mine", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_VIEW_APPEALS" });
    }

    const appeals = await appealRepo()
      .createQueryBuilder("appeal")
      .leftJoinAndSelect("appeal.class", "class")
      .leftJoinAndSelect("appeal.student", "student")
      .leftJoinAndSelect("appeal.eduGrade", "eduGrade")
      .leftJoinAndSelect("eduGrade.topicTask", "eduGradeTopicTask")
      .leftJoinAndSelect("eduGrade.task", "eduTask")
      .leftJoinAndSelect("appeal.summaryGrade", "summaryGrade")
      .leftJoinAndSelect("summaryGrade.controlWork", "summaryControlWork")
      .leftJoinAndSelect("summaryGrade.topic", "summaryTopic")
      .where("appeal.student_id = :studentId", { studentId: req.studentId })
      .orderBy("appeal.last_message_at", "DESC")
      .addOrderBy("appeal.created_at", "DESC")
      .getMany();

    return res.json({ appeals: appeals.map(serializeAppeal) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to list student appeals", { requestId: req.requestId, studentId: req.studentId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/appeals/:appealId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }

    if (req.studentId) {
      if (appeal.student?.id !== req.studentId) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    } else {
      if (!req.userId) return res.status(401).json({ message: "UNAUTHORIZED" });
      const access = await getTeacherAccessForClass(req, appeal.class?.id ?? 0, "CLASS_VIEW");
      if (!access) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    }

    const messages = await loadAppealMessages(appealId);
    return res.json({ appeal: serializeAppeal(appeal), messages: messages.map(serializeAppealMessage) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to get appeal detail", { requestId: req.requestId, studentId: req.studentId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/appeals/:appealId/messages", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_POST_APPEAL_MESSAGES" });
    }

    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const parsedBody = postAppealMessageSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }
    if (appeal.student?.id !== req.studentId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    if (!ACTIVE_APPEAL_STATUSES.includes(appeal.status)) {
      return res.status(409).json({ message: "APPEAL_CLOSED" });
    }

    const student = await studentRepo().findOne({ where: { id: req.studentId } });
    if (!student) {
      return res.status(404).json({ message: "STUDENT_NOT_FOUND" });
    }

    const message = appealMessageRepo().create({
      appeal,
      senderType: "STUDENT",
      senderUser: null,
      senderStudent: student,
      text: parsedBody.data.text,
    });
    await appealMessageRepo().save(message);

    appeal.lastMessageAt = message.createdAt;
    await appealRepo().save(appeal);

    return res.status(201).json({ message: "APPEAL_MESSAGE_POSTED", item: serializeAppealMessage(message) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to post student appeal message", { requestId: req.requestId, studentId: req.studentId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.patch("/appeals/:appealId/cancel", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_CANCEL_APPEALS" });
    }

    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const parsedBody = cancelAppealSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }
    if (appeal.student?.id !== req.studentId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }
    if (appeal.status !== "SUBMITTED" && appeal.status !== "NEEDS_INFO") {
      return res.status(409).json({ message: "APPEAL_CANNOT_BE_CANCELLED" });
    }

    const now = new Date();
    appeal.status = "CANCELLED";
    appeal.resolvedAt = now;
    appeal.lastMessageAt = now;
    await appealRepo().save(appeal);

    const reason = String(parsedBody.data.reason || "").trim();
    const text = reason
      ? `Appeal cancelled by student. Reason: ${reason}`
      : "Appeal cancelled by student.";

    const systemMessage = appealMessageRepo().create({
      appeal,
      senderType: "SYSTEM",
      senderUser: null,
      senderStudent: null,
      text,
    });
    await appealMessageRepo().save(systemMessage);

    return res.json({ message: "APPEAL_CANCELLED", appeal: serializeAppeal(appeal) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to cancel appeal", { requestId: req.requestId, studentId: req.studentId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/appeals", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(String(req.params.classId), 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }

    const access = await getTeacherAccessForClass(req, classId, "CLASS_VIEW");
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const statusRaw = String(req.query.status ?? "").trim();
    const statusFilter = statusRaw
      .split(",")
      .map(v => v.trim())
      .filter(v => (GRADE_APPEAL_STATUSES as readonly string[]).includes(v));

    const qb = appealRepo()
      .createQueryBuilder("appeal")
      .leftJoinAndSelect("appeal.student", "student")
      .leftJoinAndSelect("appeal.class", "class")
      .leftJoinAndSelect("appeal.eduGrade", "eduGrade")
      .leftJoinAndSelect("eduGrade.topicTask", "eduGradeTopicTask")
      .leftJoinAndSelect("eduGrade.task", "eduTask")
      .leftJoinAndSelect("appeal.summaryGrade", "summaryGrade")
      .leftJoinAndSelect("summaryGrade.controlWork", "summaryControlWork")
      .leftJoinAndSelect("summaryGrade.topic", "summaryTopic")
      .where("appeal.class_id = :classId", { classId })
      .orderBy("appeal.last_message_at", "DESC")
      .addOrderBy("appeal.created_at", "DESC");

    if (statusFilter.length > 0) {
      qb.andWhere("appeal.status IN (:...statusFilter)", { statusFilter });
    }

    const appeals = await qb.getMany();

    return res.json({ appeals: appeals.map(serializeAppeal) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to list class appeals", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/classes/:classId/appeals/:appealId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(String(req.params.classId), 10);
    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const access = await getTeacherAccessForClass(req, classId, "CLASS_VIEW");
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal || appeal.class?.id !== classId) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }

    const messages = await loadAppealMessages(appealId);
    return res.json({ appeal: serializeAppeal(appeal), messages: messages.map(serializeAppealMessage) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to get class appeal detail", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.patch("/classes/:classId/appeals/:appealId/status", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(String(req.params.classId), 10);
    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const access = await getTeacherAccessForClass(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsedBody = updateAppealStatusSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal || appeal.class?.id !== classId) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }
    if (!ACTIVE_APPEAL_STATUSES.includes(appeal.status)) {
      return res.status(409).json({ message: "APPEAL_CLOSED" });
    }

    const now = new Date();
    appeal.status = parsedBody.data.status;
    if (parsedBody.data.status === "IN_REVIEW" && !appeal.startedReviewAt) {
      appeal.startedReviewAt = now;
    }
    appeal.lastMessageAt = now;
    await appealRepo().save(appeal);

    if (parsedBody.data.message) {
      const teacher = await userRepo().findOne({ where: { id: access.user.id } });
      const teacherMsg = appealMessageRepo().create({
        appeal,
        senderType: "TEACHER",
        senderUser: teacher || null,
        senderStudent: null,
        text: parsedBody.data.message,
      });
      await appealMessageRepo().save(teacherMsg);
      appeal.lastMessageAt = teacherMsg.createdAt;
      await appealRepo().save(appeal);
    }

    return res.json({ message: "APPEAL_STATUS_UPDATED", appeal: serializeAppeal(appeal) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to update appeal status", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/classes/:classId/appeals/:appealId/messages", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(String(req.params.classId), 10);
    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const access = await getTeacherAccessForClass(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsedBody = postAppealMessageSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const appeal = await loadAppealWithDetails(appealId);
    if (!appeal || appeal.class?.id !== classId) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }
    if (!ACTIVE_APPEAL_STATUSES.includes(appeal.status)) {
      return res.status(409).json({ message: "APPEAL_CLOSED" });
    }

    const teacher = await userRepo().findOne({ where: { id: access.user.id } });
    const message = appealMessageRepo().create({
      appeal,
      senderType: "TEACHER",
      senderUser: teacher || null,
      senderStudent: null,
      text: parsedBody.data.text,
    });
    await appealMessageRepo().save(message);

    appeal.lastMessageAt = message.createdAt;
    await appealRepo().save(appeal);

    return res.status(201).json({ message: "APPEAL_MESSAGE_POSTED", item: serializeAppealMessage(message) });
  } catch (error: any) {
    logger.error("[edu/appeals] failed to post teacher appeal message", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/classes/:classId/appeals/:appealId/resolve", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = Number.parseInt(String(req.params.classId), 10);
    const appealId = Number.parseInt(String(req.params.appealId), 10);
    if (!Number.isFinite(classId) || classId <= 0) {
      return res.status(400).json({ message: "INVALID_CLASS_ID" });
    }
    if (!Number.isFinite(appealId) || appealId <= 0) {
      return res.status(400).json({ message: "INVALID_APPEAL_ID" });
    }

    const access = await getTeacherAccessForClass(req, classId);
    if (!access) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsedBody = resolveAppealSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) {
      return res.status(400).json({ message: "INVALID_INPUT", errors: parsedBody.error.issues });
    }

    const { outcome, resolutionText, applyGradeChange, newGrade, message } = parsedBody.data;
    const wantsGradeChange = Boolean(applyGradeChange) || newGrade !== undefined;

    if (wantsGradeChange && !Number.isFinite(Number(newGrade))) {
      return res.status(400).json({ message: "NEW_GRADE_REQUIRED" });
    }

    if (wantsGradeChange && outcome === "RESOLVED_REJECTED") {
      return res.status(400).json({ message: "GRADE_CHANGE_NOT_ALLOWED_FOR_REJECTED" });
    }

    await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const lockedAppeal = await manager
        .getRepository(GradeAppeal)
        .createQueryBuilder("appeal")
        .setLock("pessimistic_write")
        .leftJoinAndSelect("appeal.student", "student")
        .leftJoinAndSelect("appeal.class", "class")
        .leftJoinAndSelect("appeal.eduGrade", "eduGrade")
        .leftJoinAndSelect("eduGrade.topicTask", "eduGradeTopicTask")
        .leftJoinAndSelect("eduGradeTopicTask.controlWork", "eduGradeControlWork")
        .leftJoinAndSelect("appeal.summaryGrade", "summaryGrade")
        .where("appeal.id = :appealId", { appealId })
        .getOne();

      if (!lockedAppeal || lockedAppeal.class?.id !== classId) {
        throw new Error("APPEAL_NOT_FOUND");
      }
      if (!ACTIVE_APPEAL_STATUSES.includes(lockedAppeal.status)) {
        throw new Error("APPEAL_CLOSED");
      }

      let gradeChanged = false;
      const normalizedNewGrade = wantsGradeChange ? clampGradeToInt(newGrade) : null;

      if (wantsGradeChange && normalizedNewGrade !== null) {
        if (lockedAppeal.targetType === "EDU_GRADE") {
          if (!lockedAppeal.eduGrade) {
            throw new Error("GRADE_NOT_FOUND");
          }

          lockedAppeal.eduGrade.total = normalizedNewGrade;
          lockedAppeal.eduGrade.isManuallyGraded = true;
          await manager.getRepository(EduGrade).save(lockedAppeal.eduGrade);
          gradeChanged = true;

          const controlWorkId = lockedAppeal.eduGrade.topicTask?.type === "CONTROL"
            ? lockedAppeal.eduGrade.topicTask.controlWork?.id ?? null
            : null;
          if (controlWorkId && lockedAppeal.student?.id) {
            await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, lockedAppeal.student.id, null);
            await markControlWorkAttemptCompletedIfReadyWithManager(manager, controlWorkId, lockedAppeal.student.id);
          }
        } else {
          if (!lockedAppeal.summaryGrade) {
            throw new Error("SUMMARY_GRADE_NOT_FOUND");
          }
          lockedAppeal.summaryGrade.grade = normalizedNewGrade;
          await manager.getRepository(SummaryGrade).save(lockedAppeal.summaryGrade);
          gradeChanged = true;
        }
      }

      const now = new Date();
      lockedAppeal.status = outcome;
      if (!lockedAppeal.startedReviewAt) {
        lockedAppeal.startedReviewAt = now;
      }
      lockedAppeal.resolutionText = resolutionText;
      lockedAppeal.resolvedAt = now;
      lockedAppeal.resolvedByUser = access.user;
      lockedAppeal.gradeChanged = gradeChanged;
      lockedAppeal.newGrade = gradeChanged ? normalizedNewGrade : null;
      lockedAppeal.lastMessageAt = now;
      await manager.getRepository(GradeAppeal).save(lockedAppeal);

      const teacherMessageRepo = manager.getRepository(GradeAppealMessage);
      const systemSummary = gradeChanged
        ? `Appeal resolved (${outcome}). Grade updated from ${lockedAppeal.previousGrade ?? "-"} to ${normalizedNewGrade ?? "-"}.`
        : `Appeal resolved (${outcome}).`;

      const systemMessage = teacherMessageRepo.create({
        appeal: lockedAppeal,
        senderType: "SYSTEM",
        senderUser: null,
        senderStudent: null,
        text: systemSummary,
      });
      await teacherMessageRepo.save(systemMessage);

      if (message) {
        const teacherMessage = teacherMessageRepo.create({
          appeal: lockedAppeal,
          senderType: "TEACHER",
          senderUser: access.user,
          senderStudent: null,
          text: message,
        });
        await teacherMessageRepo.save(teacherMessage);
        lockedAppeal.lastMessageAt = teacherMessage.createdAt;
      } else {
        lockedAppeal.lastMessageAt = systemMessage.createdAt;
      }

      await manager.getRepository(GradeAppeal).save(lockedAppeal);
    });

    const updatedAppeal = await loadAppealWithDetails(appealId);
    if (!updatedAppeal) {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }

    return res.json({ message: "APPEAL_RESOLVED", appeal: serializeAppeal(updatedAppeal) });
  } catch (error: any) {
    if (error instanceof Error && error.message === "APPEAL_NOT_FOUND") {
      return res.status(404).json({ message: "APPEAL_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "APPEAL_CLOSED") {
      return res.status(409).json({ message: "APPEAL_CLOSED" });
    }
    if (error instanceof Error && error.message === "GRADE_NOT_FOUND") {
      return res.status(404).json({ message: "GRADE_NOT_FOUND" });
    }
    if (error instanceof Error && error.message === "SUMMARY_GRADE_NOT_FOUND") {
      return res.status(404).json({ message: "SUMMARY_GRADE_NOT_FOUND" });
    }

    logger.error("[edu/appeals] failed to resolve appeal", { requestId: req.requestId, userId: req.userId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
