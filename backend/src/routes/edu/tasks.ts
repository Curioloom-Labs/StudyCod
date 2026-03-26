import { Router, Response } from "express";
import { z } from "zod";
import { createHash } from "crypto";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { TopicTask } from "../../entities/TopicTask";
import { TestData } from "../../entities/TestData";
import { EduGrade } from "../../entities/EduGrade";
import { TaskTheory } from "../../entities/TaskTheory";
import { executeCodeWithInput, compareOutput, filterStderr } from "../../services/codeExecutionService";
import { generateAlgorithmicHints } from "../../services/ai/failureHints";
import { judgeWithSemaphore } from "../../services/judgeWorker";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../../services/judgeWorker/types";
import { JudgeBusyError } from "../../services/judgeWorker/Semaphore";
import { ControlWork } from "../../entities/ControlWork";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { AssessmentType } from "../../types/AssessmentType";
import { markControlWorkAttemptCompletedIfReadyWithManager, saveControlSummaryGradeForNewSystemWithManager } from "../../services/edu/controlWorkGrading";
import { logger } from "../../utils/logger";
import { HttpError } from "../../utils/httpError";
import { createRouteLimiter } from "../../middleware/routeRateLimit";
import { submissionRateLimitMiddleware } from "../../middleware/submissionRateLimit";
import { concatForAI, decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, pickEntryContent } from "../../utils/multiFileSubmission";
import { TopicNew } from "../../entities/TopicNew";
import { IsNull } from "typeorm";
import { buildLearningFirstFailure } from "../../services/learning/firstFailure";
import { env } from "../../env";
import {
  normalizeWebTaskFiles,
  normalizeWebValidationProfile,
  normalizeWebValidationRules,
  validateWebTaskSubmission,
  type WebTaskValidationProfile,
  type WebTaskValidationRule,
} from "../../services/webTaskValidationService";
import { encodeWebTaskPayload } from "../../utils/webTaskPayload";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const taskTheoryRepo = () => AppDataSource.getRepository(TaskTheory);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);

// Route-level rate limits (enabled in production by default).
// These endpoints can be CPU/IO intensive (judge + AI hints), so keep them protected.
const runLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 25, message: "RATE_LIMIT" });
const submitLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 10, message: "RATE_LIMIT" });
const completeLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 10, message: "RATE_LIMIT" });

const webDraftStore = new Map<string, { files: ReturnType<typeof normalizeWebTaskFiles>; updatedAt: number }>();

function webDraftKey(studentId: number, taskId: number): string {
  return `${studentId}:${taskId}`;
}

function normalizeWebRules(raw: unknown): WebTaskValidationRule[] {
  return normalizeWebValidationRules(raw);
}

function normalizeWebProfile(raw: unknown): WebTaskValidationProfile {
  return normalizeWebValidationProfile(raw ?? "FREE_WEB");
}

function assertWebFilesWithinLimits(files: ReturnType<typeof normalizeWebTaskFiles>) {
  const maxFileSize = Number((env as any).__webTaskMaxFileSize ?? 200_000);
  const maxTotalSize = Number((env as any).__webTaskMaxTotalSize ?? 500_000);
  let total = 0;
  for (const f of files) {
    const size = Buffer.byteLength(String(f.content ?? ""), "utf8");
    if (size > maxFileSize) {
      throw new HttpError(400, "WEB_FILE_TOO_LARGE", { expose: true });
    }
    total += size;
  }
  if (total > maxTotalSize) {
    throw new HttpError(400, "WEB_FILES_TOTAL_TOO_LARGE", { expose: true });
  }
}

type ApiCodeFile = { path: string; content: string };

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function normalizeClientSubmissionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return trimmed.slice(0, 128);
  return trimmed;
}

function normalizeApiFiles(raw: unknown): ApiCodeFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiCodeFile[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const p = typeof (f as any).path === "string" ? (f as any).path.trim() : "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    if (p.includes("/") || p.includes("\\") || p.includes("..") || p.startsWith(".")) continue;
    out.push({ path: p, content: c });
  }
  const byPath = new Map<string, ApiCodeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}

function judgeLanguageFromEduLanguage(lang: string): "java" | "python" | "cpp" {
  return lang === "JAVA" ? "java" : lang === "PYTHON" ? "python" : "cpp";
}

function entryFileForJudgeLanguage(lang: "java" | "python" | "cpp"): string {
  switch (lang) {
    case "java":
      return "Main.java";
    case "python":
      return "main.py";
    case "cpp":
      return "main.cpp";
  }
}

const runBodySchema = z
  .object({
    code: z.string().min(1).max(200_000).optional(),
    files: z
      .array(z.object({ path: z.string().min(1).max(120), content: z.string().max(200_000) }))
      .max(64)
      .optional(),
    input: z.string().max(64 * 1024).optional(),
  })
  .refine(v => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
    message: "code or files required",
  });

const submitBodySchema = z
  .object({
    code: z.string().min(1).max(200_000).optional(),
    files: z
      .array(z.object({ path: z.string().min(1).max(120), content: z.string().max(200_000) }))
      .max(64)
      .optional(),
    clientSubmissionId: z.string().min(1).max(128).optional(),
    codeHash: z.string().min(8).max(128).optional(),
  })
  .refine(v => (typeof v.code === "string" && v.code.length > 0) || (Array.isArray(v.files) && v.files.length > 0), {
    message: "code or files required",
  });

function validationMessageFromZod(err: z.ZodError): string {
  // Preserve existing API message codes used by the frontend.
  for (const issue of err.issues) {
    const path = issue.path.join(".");
    if (path === "code") {
      if (issue.code === "too_small") return "CODE_REQUIRED";
      if (issue.code === "too_big") return "CODE_TOO_LARGE";
    }
    if (path === "input") {
      if (issue.code === "too_big") return "INPUT_TOO_LARGE";
    }
  }
  return "INVALID_INPUT";
}

function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some(s => {
    const v = String(s ?? "");
    return /(^|\s)[-+]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?(\s|$)/.test(v) || /(^|\s)[-+]?\d+(?:[eE][-+]?\d+)(\s|$)/.test(v);
  });

  return hasFloatLike
    ? {
        type: "float",
        epsilon: 1e-6
      }
    : {
        type: "whitespace"
      };
}

function sanitizeTestResultsForStudent(results: any): Array<{ testId: number; passed: boolean; verdict?: string | null; errorKind?: string | null }> {
  if (!Array.isArray(results)) return [];
  return results
    .map((r: any) => ({
      testId: Number(r?.testId ?? r?.test_id ?? 0),
      passed: !!r?.passed,
      verdict: r?.verdict ?? null,
      errorKind: r?.errorKind ?? r?.error_kind ?? null
    }))
    .filter(r => Number.isFinite(r.testId) && r.testId > 0);
}

async function assertControlTaskUnlockedForStudent(studentId: number, topicTask: TopicTask): Promise<void> {
  if (topicTask.type !== "CONTROL" || !topicTask.controlWork?.id) return;

  const controlWorkId = topicTask.controlWork.id;

  if (topicTask.controlWork.hasTheory) {
    const summaryWithTheory = await AppDataSource
      .createQueryBuilder(SummaryGrade, "sg")
      .where("sg.student_id = :studentId", { studentId })
      .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId })
      .andWhere("sg.theory_grade IS NOT NULL")
      .getOne();

    if (!summaryWithTheory) {
      throw new HttpError(403, "CONTROL_QUIZ_REQUIRED", { expose: true });
    }
  }

  const orderedControlTasks = await topicTaskRepo()
    .createQueryBuilder("task")
    .where("task.control_work_id = :controlWorkId", { controlWorkId })
    .andWhere("task.type = :controlType", { controlType: "CONTROL" })
    .orderBy("task.order", "ASC")
    .addOrderBy("task.id", "ASC")
    .getMany();

  const currentIndex = orderedControlTasks.findIndex(t => t.id === topicTask.id);
  if (currentIndex === -1) {
    throw new HttpError(403, "CONTROL_TASK_NOT_IN_WORK", { expose: true });
  }

  if (currentIndex === 0) return;

  const prevTaskIds = orderedControlTasks.slice(0, currentIndex).map(t => t.id);
  if (!prevTaskIds.length) return;

  const completedPrev = await gradeRepo()
    .createQueryBuilder("g")
    .select("DISTINCT g.topic_task_id", "topic_task_id")
    .where("g.student_id = :studentId", { studentId })
    .andWhere("g.topic_task_id IN (:...taskIds)", { taskIds: prevTaskIds })
    .andWhere("g.total IS NOT NULL")
    .getRawMany();

  if (completedPrev.length < prevTaskIds.length) {
    throw new HttpError(403, "CONTROL_PREVIOUS_TASKS_REQUIRED", { expose: true });
  }
}

router.get("/tasks/:taskId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      throw new HttpError(400, "Invalid taskId");
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.theoryBlock", "topicTheoryBlock")
      .leftJoinAndSelect("topicTask.controlWork", "controlWork")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    // Access control
    if (req.studentId) {
      const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
      if (!student || !student.class || student.class.id !== topicTask.topic.class?.id) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }

      await assertControlTaskUnlockedForStudent(req.studentId, topicTask);
    } else if (req.userId) {
      const user = await userRepo().findOne({ where: { id: req.userId } });
      if (!user || (user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN")) {
        return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_TASKS" });
      }
      if (topicTask.topic.class && topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    }

    let grade: any = null;
    let attemptsUsed: number | null = null;

    if (req.studentId) {
      const grades = await gradeRepo()
        .createQueryBuilder("grade")
        .where("grade.student_id = :studentId", { studentId: req.studentId })
        .andWhere("grade.topic_task_id = :taskId", { taskId })
        .orderBy("grade.created_at", "DESC")
        .getMany();

      attemptsUsed = grades.length;
      if (grades.length > 0) {
        const latestGrade = grades[0];

        let parsedTestResults = null;
        let parsedGroupScores = null;

        if (latestGrade.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            logger.warn("Failed to parse testResults JSON", { requestId: req.requestId, err: e });
          }
        }

        if ((latestGrade as any).groupScores) {
          try {
            parsedGroupScores = JSON.parse((latestGrade as any).groupScores);
          } catch (e) {
            logger.warn("Failed to parse groupScores JSON", { requestId: req.requestId, err: e });
          }
        }

        const decoded = decodeMultiFileSubmissionV1(latestGrade.submittedCode);
        grade = {
          id: latestGrade.id,
          total: latestGrade.total,
          testsPassed: latestGrade.testsPassed,
          testsTotal: latestGrade.testsTotal,
          isManuallyGraded: latestGrade.isManuallyGraded === true,
          isCompleted: latestGrade.isCompleted === true,
          submittedCode: decoded ? pickEntryContent(decoded) : latestGrade.submittedCode,
          submittedEntryFile: decoded?.entry,
          submittedFiles: decoded?.files,
          // OJ-style: do not expose per-test I/O to students.
          testResults: sanitizeTestResultsForStudent(parsedTestResults),
          score: (latestGrade as any).score ?? null,
          maxScore: (latestGrade as any).maxScore ?? null,
          groupScores: parsedGroupScores,
          submissionMeta: {
            submissionId: String(latestGrade.id),
            clientSubmissionId: null,
            codeHash: sha256Hex(String(latestGrade.submittedCode ?? ""))
          }
        };
      }
    }

    const testDataCount = await testDataRepo().count({ where: { topicTask: { id: taskId } } });

    let lessonType: "TOPIC" | "CONTROL" = "TOPIC";
    let lessonId = topicTask.topic.id;
    let lessonTitle = topicTask.topic.title;
    let hasTheory = false;
    let theory: string | null = null;
    let timeLimitMinutes: number | null = null;

    if (topicTask.type === "CONTROL" && topicTask.controlWork) {
      const controlWork = topicTask.controlWork;
      lessonType = "CONTROL";
      lessonId = controlWork.id;
      lessonTitle = controlWork.title || `Контрольна робота #${controlWork.id}`;
      hasTheory = controlWork.hasTheory || false;
      timeLimitMinutes = controlWork.timeLimitMinutes || null;
    }

    const taskTheory = await taskTheoryRepo()
      .createQueryBuilder("theory")
      .where("theory.topic_task_id = :taskId", { taskId })
      .getOne();

    const debugTheoryRequested = ["1", "true", "yes"].includes(String((req.query as any)?.debugTheory ?? "").toLowerCase());

    // Load global (admin) materials for the same language+order.
    // Student tasks are class-scoped (topic.class != null) but the source-of-truth materials are global (topic.class == null).
    // We use global materials as a fallback and also as the default when they are newer than stale class snapshots.
    const globalRepo = AppDataSource.getRepository(TopicNew);
    const classTopic = (topicTask as any)?.topic as any;
    const classLang = classTopic?.language;
    const classOrder = classTopic?.order;
    const classTitleNorm = String(classTopic?.title ?? "").trim().toLowerCase();

    let globalMatchStrategy: "language+order" | "language+title" | null = null;

    let globalTopic = await globalRepo.findOne({
      where: {
        language: classLang,
        order: classOrder,
        class: IsNull() as any
      } as any,
      relations: ["theoryBlock"] as any
    });

    if (globalTopic) globalMatchStrategy = "language+order";

    if (!globalTopic && classTitleNorm) {
      // Fallback: match by title (in case class topics were reordered).
      const globals = await globalRepo.find({
        where: {
          language: classLang,
          class: IsNull() as any
        } as any,
        relations: ["theoryBlock"] as any
      });
      globalTopic = globals.find(t => String((t as any)?.title ?? "").trim().toLowerCase() === classTitleNorm) as any;
      if (globalTopic) globalMatchStrategy = "language+title";
    }

    const classTheoryBlock = (topicTask as any)?.topic?.theoryBlock as any;
    const classTheory = typeof classTheoryBlock?.content === "string" ? String(classTheoryBlock.content) : "";
    const classTheoryUpdatedAt = classTheoryBlock?.updatedAt instanceof Date ? classTheoryBlock.updatedAt : (classTheoryBlock?.updatedAt ? new Date(classTheoryBlock.updatedAt) : null);

    const globalTheoryBlock = (globalTopic as any)?.theoryBlock as any;
    const globalTheory = typeof globalTheoryBlock?.content === "string" ? String(globalTheoryBlock.content) : "";
    const globalTheoryUpdatedAt = globalTheoryBlock?.updatedAt instanceof Date ? globalTheoryBlock.updatedAt : (globalTheoryBlock?.updatedAt ? new Date(globalTheoryBlock.updatedAt) : null);
    const taskTheoryUpdatedAt = taskTheory?.updatedAt instanceof Date ? taskTheory.updatedAt : (taskTheory?.updatedAt ? new Date(taskTheory.updatedAt) : null);

    const taskTheoryContent = taskTheory && typeof (taskTheory as any).content === "string" ? String((taskTheory as any).content) : "";

    type TheoryPickSource = "classTopic" | "globalTopic" | "taskSnapshot" | "none";
    const pickFromMaterials = (): { content: string; updatedAt: Date | null; source: TheoryPickSource } => {
      const classOk = classTheory.trim().length > 0;
      const globalOk = globalTheory.trim().length > 0;
      if (!classOk && !globalOk) return { content: "", updatedAt: null, source: "none" };
      if (classOk && !globalOk) return { content: classTheory, updatedAt: classTheoryUpdatedAt, source: "classTopic" };
      if (!classOk && globalOk) return { content: globalTheory, updatedAt: globalTheoryUpdatedAt, source: "globalTopic" };

      // Both exist: prefer the newer one; if timestamps missing, prefer class (as explicit override).
      if (classTheoryUpdatedAt && globalTheoryUpdatedAt) {
        return classTheoryUpdatedAt >= globalTheoryUpdatedAt
          ? { content: classTheory, updatedAt: classTheoryUpdatedAt, source: "classTopic" }
          : { content: globalTheory, updatedAt: globalTheoryUpdatedAt, source: "globalTopic" };
      }
      if (classTheoryUpdatedAt && !globalTheoryUpdatedAt) return { content: classTheory, updatedAt: classTheoryUpdatedAt, source: "classTopic" };
      if (!classTheoryUpdatedAt && globalTheoryUpdatedAt) return { content: globalTheory, updatedAt: globalTheoryUpdatedAt, source: "globalTopic" };
      return { content: classTheory, updatedAt: classTheoryUpdatedAt, source: "classTopic" };
    };

    const materialsPick = pickFromMaterials();
    const snapshotPick = { content: taskTheoryContent, updatedAt: taskTheoryUpdatedAt, source: "taskSnapshot" as TheoryPickSource };

    const finalPick = (() => {
      if (materialsPick.content.trim().length > 0) {
        if (!snapshotPick.content.trim()) return materialsPick;
        if (materialsPick.updatedAt && snapshotPick.updatedAt && materialsPick.updatedAt > snapshotPick.updatedAt) return materialsPick;
        return snapshotPick;
      }
      if (snapshotPick.content.trim().length > 0) return snapshotPick;
      return { content: "", updatedAt: null as Date | null, source: "none" as TheoryPickSource };
    })();

    if (finalPick.source !== "none") {
      hasTheory = true;
      theory = finalPick.content;
    }

    const includeTheoryDebug = await (async () => {
      if (!debugTheoryRequested) return false;
      if (!req.userId) return false;
      const u = await userRepo().findOne({ where: { id: req.userId } });
      return u?.role === "SYSTEM_ADMIN";
    })();

    if (includeTheoryDebug) res.setHeader("Cache-Control", "no-store");

    res.json({
      task: {
        id: topicTask.id,
        title: topicTask.title,
        description: topicTask.description,
        template: topicTask.template,
        taskMode: (topicTask as any).taskMode ?? "CODE",
        webTemplateFiles: (topicTask as any).webTemplateFiles ?? null,
        webValidationRules: (topicTask as any).webValidationRules ?? null,
        maxAttempts: topicTask.maxAttempts,
        attemptsUsed: attemptsUsed ?? undefined,
        deadline: topicTask.deadline ? topicTask.deadline.toISOString() : null,
        isClosed: topicTask.isClosed,
        isAssigned: topicTask.isAssigned || false,
        type: topicTask.type,
        order: topicTask.order,
        testDataCount,
        grade,
        language: topicTask.topic.class?.language || "JAVA",
        lesson: {
          id: lessonId,
          title: lessonTitle,
          type: lessonType,
          hasTheory,
          theory: theory || undefined,
          ...(includeTheoryDebug
            ? {
                theoryDebug: {
                  pickedSource: finalPick.source,
                  pickedUpdatedAt: finalPick.updatedAt ? finalPick.updatedAt.toISOString() : null,
                  globalMatchStrategy,
                  classTopic: {
                    id: typeof classTopic?.id === "number" ? classTopic.id : null,
                    language: classLang ?? null,
                    order: typeof classOrder === "number" ? classOrder : null,
                    title: typeof classTopic?.title === "string" ? classTopic.title : null
                  },
                  globalTopic: {
                    id: typeof (globalTopic as any)?.id === "number" ? (globalTopic as any).id : null,
                    title: typeof (globalTopic as any)?.title === "string" ? (globalTopic as any).title : null
                  },
                  classTheoryBlock: {
                    id: typeof classTheoryBlock?.id === "number" ? classTheoryBlock.id : null,
                    updatedAt: classTheoryUpdatedAt ? classTheoryUpdatedAt.toISOString() : null,
                    length: classTheory.length
                  },
                  globalTheoryBlock: {
                    id: typeof globalTheoryBlock?.id === "number" ? globalTheoryBlock.id : null,
                    updatedAt: globalTheoryUpdatedAt ? globalTheoryUpdatedAt.toISOString() : null,
                    length: globalTheory.length
                  },
                  taskTheorySnapshot: {
                    id: typeof (taskTheory as any)?.id === "number" ? (taskTheory as any).id : null,
                    updatedAt: taskTheoryUpdatedAt ? taskTheoryUpdatedAt.toISOString() : null,
                    length: taskTheoryContent.length
                  },
                  serverTime: new Date().toISOString()
                }
              }
            : {}),
          timeLimitMinutes: timeLimitMinutes || undefined
        }
      }
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("Error getting task", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/tasks/:taskId/web-template", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }

    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (String((topicTask as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    if (req.userType === "STUDENT" && req.studentId) {
      const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
      if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
        return res.status(403).json({ message: "ACCESS_DENIED" });
      }
    }

    const files = normalizeWebTaskFiles((topicTask as any).webTemplateFiles ?? []);
    const rules = normalizeWebRules((topicTask as any).webValidationRules ?? []);
    return res.json({
      taskId: topicTask.id,
      taskMode: "WEB",
      files,
      rules,
      profile: normalizeWebProfile((topicTask as any).webValidationProfile ?? "FREE_WEB"),
    });
  } catch (error: any) {
    logger.error("Error getting web task template", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.put("/tasks/:taskId/web-draft", authRequired, submissionRateLimitMiddleware, runLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
    if (String((topicTask as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await assertControlTaskUnlockedForStudent(req.studentId, topicTask);

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertWebFilesWithinLimits(files);

    webDraftStore.set(webDraftKey(req.studentId, taskId), {
      files,
      updatedAt: Date.now(),
    });

    return res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("Error saving web draft", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/web-check", authRequired, submissionRateLimitMiddleware, runLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
    if (String((topicTask as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertWebFilesWithinLimits(files);

    const rules = normalizeWebRules((topicTask as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((topicTask as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (topicTask as any).webTemplateFiles ?? [] });
    return res.json({
      taskMode: "WEB",
      ...check,
    });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("Error checking web task", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/web-submit", authRequired, submissionRateLimitMiddleware, submitLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (!(env as any).__webTasksEnabled) {
      return res.status(404).json({ message: "WEB_TASKS_DISABLED" });
    }
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("topicTask.controlWork", "controlWork")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }
    if (String((topicTask as any).taskMode ?? "CODE") !== "WEB") {
      return res.status(400).json({ message: "TASK_IS_NOT_WEB" });
    }

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (topicTask.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (topicTask.deadline && new Date() > new Date(topicTask.deadline)) {
      return res.status(403).json({ message: "DEADLINE_PASSED" });
    }

    const existingGradesCount = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.topic_task_id = :taskId", { taskId })
      .andWhere("grade.student_id = :studentId", { studentId: req.studentId })
      .getCount();

    if (existingGradesCount >= topicTask.maxAttempts) {
      return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    }

    const files = normalizeWebTaskFiles((req.body as any)?.files ?? []);
    assertWebFilesWithinLimits(files);
    const rules = normalizeWebRules((topicTask as any).webValidationRules ?? []);
    const profile = normalizeWebProfile((topicTask as any).webValidationProfile ?? "FREE_WEB");
    const check = validateWebTaskSubmission({ files, rules, profile, referenceFiles: (topicTask as any).webTemplateFiles ?? [] });

    const maxScore = check.maxScore > 0 ? check.maxScore : Math.max(1, check.totalRules);
    const score = check.maxScore > 0 ? check.score : check.passedRules;
    const ratio = maxScore > 0 ? score / maxScore : 0;
    const totalGrade = Math.max(0, Math.min(100, Math.round(ratio * 100)));

    const submittedCode = encodeWebTaskPayload({
      mode: "WEB",
      version: 1,
      files,
    });

    const feedback = check.passed
      ? "All web validation rules passed."
      : check.results.filter(r => !r.passed).map(r => `- ${r.message}`).join("\n");

    const testResults = check.results.map((r, idx) => ({
      testId: idx + 1,
      passed: r.passed,
      verdict: r.passed ? "AC" : "WA",
      errorKind: r.passed ? null : "web_rule",
    }));

    const savedGrade = await AppDataSource.transaction("SERIALIZABLE", async manager => {
      await manager
        .createQueryBuilder(Student, "student")
        .setLock("pessimistic_write")
        .where("student.id = :studentId", { studentId: req.studentId })
        .getOne();

      const gradeRepoM = manager.getRepository(EduGrade);
      const countM = await gradeRepoM
        .createQueryBuilder("grade")
        .where("grade.topic_task_id = :taskId", { taskId })
        .andWhere("grade.student_id = :studentId", { studentId: req.studentId })
        .getCount();

      if (countM >= topicTask.maxAttempts) {
        throw new Error("MAX_ATTEMPTS_REACHED");
      }

      const grade = gradeRepoM.create({
        student: { id: req.studentId } as any,
        topicTask: { id: taskId } as any,
        total: totalGrade,
        testsPassed: check.passedRules,
        testsTotal: check.totalRules,
        submittedCode,
        isManuallyGraded: false,
        feedback,
        testResults: JSON.stringify(testResults),
        score,
        maxScore,
        groupScores: null,
      });

      const saved = await gradeRepoM.save(grade);

      if (topicTask.controlWork?.id) {
        await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork.id, req.studentId!, null);
        await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork.id, req.studentId!);
      }

      return saved;
    });

    return res.json({
      grade: {
        id: savedGrade.id,
        total: savedGrade.total,
        testsPassed: savedGrade.testsPassed,
        testsTotal: savedGrade.testsTotal,
        isManuallyGraded: savedGrade.isManuallyGraded,
      },
      testResults,
      scoring: {
        score,
        maxScore,
      },
      taskMode: "WEB",
    });
  } catch (error: any) {
    if (error?.message === "MAX_ATTEMPTS_REACHED") {
      return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    }
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    logger.error("Error submitting web task", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/run", authRequired, submissionRateLimitMiddleware, runLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({ message: "INVALID_TASK_ID" });

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const validated = runBodySchema.safeParse(req.body ?? {});
    if (!validated.success) {
      return res.status(400).json({ message: validationMessageFromZod(validated.error) });
    }
    const input = validated.data.input;

    const judgeLang = judgeLanguageFromEduLanguage(topicTask.topic.class.language);
    const normalizedFiles = normalizeApiFiles((validated.data as any).files);
    const providedCode = typeof (validated.data as any).code === "string" ? (validated.data as any).code : "";
    const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
    const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
    let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
    const isMultiFile = effectiveFiles.length > 0;
    if (isMultiFile && !effectiveFiles.some(f => f.path === entryFile)) {
      effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
    }
    const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : providedCode;

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await assertControlTaskUnlockedForStudent(studentId, topicTask);

    // For single-file we can run locally; for multi-file route through judge worker.
    if (!isMultiFile) {
      const result = await executeCodeWithInput(sourceText, topicTask.topic.class.language, input || "", 5000);
      return res.json({ output: result.stdout, stderr: result.stderr, success: result.success });
    }

    const workerReq: WorkerJudgeRequest = {
      submission_id: `edu_run_${studentId}_${taskId}_${Date.now()}`,
      language: judgeLang,
      source: sourceText,
      files: effectiveFiles,
      entry: entryFile,
      tests: [
        {
          id: "custom",
          input: input || "",
          output: "",
          hidden: false,
          group: "custom",
          weight: 1
        }
      ],
      limits: { time_limit_ms: 5000, memory_limit_mb: 256, output_limit_kb: 64 },
      debug: false,
      rerun_failed_once: false,
      run_all: true
    };

    const workerRes = await judgeWithSemaphore(workerReq);
    if (workerRes.verdict === "CE") {
      const err = [workerRes.compile?.stderr, workerRes.compile?.stdout].filter(Boolean).join("\n").trim();
      return res.json({ output: "", stderr: err || "Compilation error", success: false });
    }
    const r = workerRes.tests[0];
    return res.json({ output: r?.actual ?? "", stderr: r?.stderr ?? "", success: workerRes.verdict === "AC" });
  } catch (error: any) {
    if (error instanceof HttpError) {
      return res.status(error.statusCode).json({ error: error.message, status: error.statusCode });
    }
    logger.error("Error running code", { requestId: req.requestId, err: error });
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", status: 500 });
  }
});

router.post("/tasks/:taskId/submit", authRequired, submissionRateLimitMiddleware, submitLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({ message: "INVALID_TASK_ID" });

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("topicTask.controlWork", "controlWork")
      .leftJoinAndSelect("topicTask.testData", "testData")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await assertControlTaskUnlockedForStudent(studentId, topicTask);

    if (topicTask.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (topicTask.deadline && new Date() > new Date(topicTask.deadline)) {
      return res.status(403).json({ message: "DEADLINE_PASSED" });
    }

    const latestExisting = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.topic_task_id = :taskId", { taskId })
      .andWhere("grade.student_id = :studentId", { studentId })
      .orderBy("grade.created_at", "DESC")
      .getOne();

    if (latestExisting && latestExisting.isManuallyGraded) {
      return res.status(409).json({ message: "TASK_MANUALLY_GRADED_LOCKED" });
    }
    if (latestExisting && latestExisting.isCompleted) {
      return res.status(409).json({ message: "TASK_ALREADY_COMPLETED" });
    }

    const existingGradesCount = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.topic_task_id = :taskId", { taskId })
      .andWhere("grade.student_id = :studentId", { studentId })
      .getCount();

    if (existingGradesCount >= topicTask.maxAttempts) {
      return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    }

    const validatedBody = submitBodySchema.safeParse(req.body ?? {});
    if (!validatedBody.success) {
      return res.status(400).json({ message: validationMessageFromZod(validatedBody.error) });
    }

    const eduLang = topicTask.topic.class.language;
    const judgeLang = judgeLanguageFromEduLanguage(eduLang);
    const normalizedFiles = normalizeApiFiles((validatedBody.data as any).files);
    const providedCode = typeof (validatedBody.data as any).code === "string" ? (validatedBody.data as any).code : "";
    const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
    const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
    let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
    const isMultiFile = effectiveFiles.length > 0;
    if (isMultiFile && !effectiveFiles.some(f => f.path === entryFile)) {
      effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
    }
    const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : providedCode;
    const persistedSubmitted = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;
    const normalizedClientSubmissionId = normalizeClientSubmissionId((validatedBody.data as any).clientSubmissionId);
    const serverCodeHash = sha256Hex(persistedSubmitted);
    const codeForHints = isMultiFile ? concatForAI({ version: 1, entry: entryFile, files: effectiveFiles }) : sourceText;

    const tests = [...(topicTask.testData || [])].sort((a, b) => a.id - b.id);
    if (tests.length === 0) {
      return res.status(400).json({ message: "NO_TESTS_DEFINED_FOR_THIS_TASK" });
    }

    let passed = 0;
    let passedScore = 0;
    let maxScore = 0;
    let hintsForUser: string[] = [];
    const learningFeedbackCandidates: Array<{
      passed: boolean;
      isPublic: boolean;
      input?: string;
      expected?: string;
      actual?: string;
      error_kind?: string | null;
    }> = [];

    const testResultsDetailed: Array<{
      testId: number;
      input: string;
      actual: string;
      stderr?: string | null;
      passed: boolean;
      verdict?: string | null;
      errorKind?: string | null;
    }> = [];

    // `judgeLang` computed above.
    const defaultLimitsByLang = {
      java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
      python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
      cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 }
    } as const;

    maxScore = tests.reduce((sum, t) => sum + (t.points || 1), 0);

    const workerReq: WorkerJudgeRequest = {
      submission_id: `edu_${studentId}_${taskId}_${Date.now()}`,
      language: judgeLang,
      source: sourceText,
      ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
      tests: tests.map(t => ({
        id: t.id,
        input: t.input || "",
        output: t.expectedOutput || "",
        hidden: t.isHidden === true,
        group: t.isHidden === true ? "hidden" : "public",
        weight: t.points || 1
      })),
      limits: defaultLimitsByLang[judgeLang],
      checker: chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || "")),
      debug: false,
      rerun_failed_once: true,
      run_all: true
    };

    let workerRes: WorkerJudgeResponse | null = null;
    let scoringGroupScores: Array<{ group: string; score: number; maxScore: number }> | null = null;

    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("judge worker failed (edu submit)", {
        requestId: req.requestId,
        submission: workerReq.submission_id,
        error: errMsg
      });
      throw new HttpError(503, "Judge unavailable", {
        code: "JUDGE_UNAVAILABLE",
        expose: true,
        cause: e
      });
    }

    if (workerRes) {
      if (workerRes.verdict === "CE" && workerRes.compile) {
        const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        for (const t of tests) {
          learningFeedbackCandidates.push({
            passed: false,
            isPublic: t.isHidden !== true,
            input: t.input || "",
            expected: String(t.expectedOutput ?? ""),
            actual: "",
            error_kind: workerRes.compile.error_kind ?? null
          });
          if (t.isHidden) continue;
          testResultsDetailed.push({
            testId: t.id,
            input: t.input || "",
            actual: "",
            stderr: compileErr || "Compilation error",
            passed: false,
            verdict: "CE",
            errorKind: workerRes.compile.error_kind ?? null
          });
        }
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const isPassed = r?.verdict === "AC";
          if (isPassed) {
            passed++;
            passedScore += t.points || 1;
          }
          learningFeedbackCandidates.push({
            passed: !!isPassed,
            isPublic: t.isHidden !== true,
            input: t.input || "",
            expected: String(t.expectedOutput ?? ""),
            actual: r?.actual ?? "",
            error_kind: (r as any)?.error_kind ?? null
          });
          if (t.isHidden) continue;
          testResultsDetailed.push({
            testId: t.id,
            input: t.input || "",
            actual: r?.actual ?? "",
            stderr: r?.stderr ?? null,
            passed: isPassed,
            verdict: r?.verdict ?? null,
            errorKind: (r as any)?.error_kind ?? null
          });
        }
      }
    }

    if (workerRes && typeof workerRes.score === "number" && typeof workerRes.max_score === "number") {
      passedScore = workerRes.score;
      maxScore = workerRes.max_score;
    }

    if (workerRes && Array.isArray((workerRes as any).group_scores)) {
      scoringGroupScores = (workerRes as any).group_scores.map((gs: any) => ({
        group: String(gs?.group ?? ""),
        score: Number(gs?.score ?? 0),
        maxScore: Number(gs?.max_score ?? 0)
      }));
    }

    let feedback: string | null = null;

    if (passed < tests.length) {
      try {
        const expectedById = new Map<number, string>();
        for (const t of tests) expectedById.set(t.id, (t.expectedOutput || "").toString());

        const failuresForHints = testResultsDetailed
          .filter(r => !r.passed)
          .slice(0, 3)
          .map(r => ({
            testId: r.testId,
            input: r.input || "",
            expected: expectedById.get(r.testId) ?? "",
            actual: r.actual || "",
            verdict: r.verdict ?? undefined,
            stderr: r.stderr ?? null
          }));

        const langForHints =
          topicTask.topic.class.language === "JAVA"
            ? "JAVA"
            : topicTask.topic.class.language === "CPP"
              ? "CPP"
              : "PYTHON";

        const hints = await generateAlgorithmicHints({
          taskTitle: topicTask.title,
          taskText: topicTask.description,
          language: langForHints,
          code: codeForHints,
          failures: failuresForHints,
          maxHints: 4
        });

        if (hints.length) {
          hintsForUser = hints;
          feedback = hints.map(h => `- ${h}`).join("\n");
        }
      } catch {
        // ignore hint failures
      }
    }

    const ratio = maxScore > 0 ? passedScore / maxScore : 0;
    const score = Math.round(ratio * 100);
    const totalGrade = Math.max(0, Math.min(100, score));

    const savedGrade = await AppDataSource.transaction("SERIALIZABLE", async manager => {
      // Lock the student row to serialize submissions from the same student.
      await manager
        .createQueryBuilder(Student, "student")
        .setLock("pessimistic_write")
        .where("student.id = :studentId", { studentId })
        .getOne();

      const gradeRepoM = manager.getRepository(EduGrade);

      const latestExistingM = await gradeRepoM
        .createQueryBuilder("grade")
        .where("grade.topic_task_id = :taskId", { taskId })
        .andWhere("grade.student_id = :studentId", { studentId })
        .orderBy("grade.created_at", "DESC")
        .getOne();

      if (latestExistingM && latestExistingM.isManuallyGraded) {
        throw new Error("TASK_MANUALLY_GRADED_LOCKED");
      }
      if (latestExistingM && latestExistingM.isCompleted) {
        throw new Error("TASK_ALREADY_COMPLETED");
      }

      const existingGradesCountM = await gradeRepoM
        .createQueryBuilder("grade")
        .where("grade.topic_task_id = :taskId", { taskId })
        .andWhere("grade.student_id = :studentId", { studentId })
        .getCount();

      if (existingGradesCountM >= topicTask.maxAttempts) {
        throw new Error("MAX_ATTEMPTS_REACHED");
      }

      const grade = gradeRepoM.create({
        student: { id: studentId } as any,
        topicTask: { id: taskId } as any,
        total: totalGrade,
        testsPassed: passed,
        testsTotal: tests.length,
        submittedCode: persistedSubmitted,
        isManuallyGraded: false,
        feedback,
        testResults: JSON.stringify(testResultsDetailed),
        score: typeof passedScore === "number" ? passedScore : null,
        maxScore: typeof maxScore === "number" ? maxScore : null,
        groupScores: scoringGroupScores ? JSON.stringify(scoringGroupScores) : null
      });

      const saved = await gradeRepoM.save(grade);

      if (topicTask.controlWork?.id) {
        await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork.id, studentId, null);
        await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork.id, studentId);
      }

      return saved;
    });

    const learningFirstFailure = buildLearningFirstFailure({
      verdict: workerRes?.verdict ?? null,
      tests: learningFeedbackCandidates
    });

    res.json({
      grade: savedGrade,
      submissionMeta: {
        submissionId: String(savedGrade.id),
        clientSubmissionId: normalizedClientSubmissionId,
        codeHash: serverCodeHash
      },
      testResults: sanitizeTestResultsForStudent(testResultsDetailed),
      hints: hintsForUser,
      scoring: {
        score: passedScore,
        maxScore,
        groupScores: scoringGroupScores
      },
      learningFeedback: {
        verdict: workerRes?.verdict ?? null,
        firstFailure: learningFirstFailure
      }
    });
  } catch (error: any) {
    if (error?.message === "TASK_MANUALLY_GRADED_LOCKED") {
      return res.status(409).json({ message: "TASK_MANUALLY_GRADED_LOCKED" });
    }
    if (error?.message === "TASK_ALREADY_COMPLETED") {
      return res.status(409).json({ message: "TASK_ALREADY_COMPLETED" });
    }
    if (error?.message === "MAX_ATTEMPTS_REACHED") {
      return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    }
    logger.error("Error submitting task", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/complete", authRequired, submissionRateLimitMiddleware, completeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS_CAN_ACCESS" });
    }

    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({ message: "INVALID_TASK_ID" });

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("topicTask.controlWork", "controlWork")
      .leftJoinAndSelect("topicTask.testData", "testData")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    if (topicTask.isClosed) return res.status(403).json({ message: "TASK_IS_CLOSED" });
    if (topicTask.deadline && new Date() > new Date(topicTask.deadline)) {
      return res.status(403).json({ message: "DEADLINE_PASSED" });
    }

    const latestExisting = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.topic_task_id = :taskId", { taskId })
      .andWhere("grade.student_id = :studentId", { studentId })
      .orderBy("grade.created_at", "DESC")
      .getOne();

    if (latestExisting && latestExisting.isManuallyGraded) {
      return res.status(409).json({ message: "TASK_MANUALLY_GRADED_LOCKED" });
    }

    if (latestExisting && latestExisting.isCompleted) {
      return res.status(409).json({ message: "TASK_ALREADY_COMPLETED" });
    }

    const existingGradesCount = await gradeRepo()
      .createQueryBuilder("grade")
      .where("grade.topic_task_id = :taskId", { taskId })
      .andWhere("grade.student_id = :studentId", { studentId })
      .getCount();

    if (existingGradesCount >= topicTask.maxAttempts) {
      // Completing should not consume another attempt.
      if (!latestExisting) {
        return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
      }

      const saved = await AppDataSource.transaction("SERIALIZABLE", async manager => {
        await manager
          .createQueryBuilder(Student, "student")
          .setLock("pessimistic_write")
          .where("student.id = :studentId", { studentId })
          .getOne();

        const gradeRepoM = manager.getRepository(EduGrade);

        const latestExistingM = await gradeRepoM
          .createQueryBuilder("grade")
          .where("grade.topic_task_id = :taskId", { taskId })
          .andWhere("grade.student_id = :studentId", { studentId })
          .orderBy("grade.created_at", "DESC")
          .getOne();

        if (latestExistingM && latestExistingM.isManuallyGraded) {
          throw new Error("TASK_MANUALLY_GRADED_LOCKED");
        }
        if (latestExistingM && latestExistingM.isCompleted) {
          throw new Error("TASK_ALREADY_COMPLETED");
        }

        const countM = await gradeRepoM
          .createQueryBuilder("grade")
          .where("grade.topic_task_id = :taskId", { taskId })
          .andWhere("grade.student_id = :studentId", { studentId })
          .getCount();

        if (countM < topicTask.maxAttempts) {
          // Attempts became available concurrently; let the request proceed through the normal (judge) path.
          throw new Error("ATTEMPTS_AVAILABLE");
        }

        if (!latestExistingM) {
          throw new Error("MAX_ATTEMPTS_REACHED");
        }

        latestExistingM.isCompleted = true;
        const savedExisting = await gradeRepoM.save(latestExistingM);

        if (topicTask.controlWork?.id) {
          await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork.id, studentId);
        }

        return savedExisting;
      }).catch((e: any) => {
        if (e?.message === "ATTEMPTS_AVAILABLE") return null;
        throw e;
      });

      if (!saved) {
        // Fall through to normal flow below (we'll judge and save a new completed attempt).
      } else {
        let parsedTestResults: any[] = [];
        if (saved.testResults) {
          try {
            const parsed = JSON.parse(saved.testResults);
            if (Array.isArray(parsed)) parsedTestResults = parsed;
          } catch {
            // ignore
          }
        }

        let parsedGroupScores: any[] | null = null;
        if ((saved as any).groupScores) {
          try {
            const parsed = JSON.parse((saved as any).groupScores);
            if (Array.isArray(parsed)) parsedGroupScores = parsed;
          } catch {
            // ignore
          }
        }

        return res.json({
          requiresManualReview: false,
          grade: {
            id: saved.id,
            total: saved.total,
            testsPassed: saved.testsPassed,
            testsTotal: saved.testsTotal,
            isManuallyGraded: saved.isManuallyGraded === true,
            isCompleted: true
          },
          submissionMeta: {
            submissionId: String(saved.id),
            clientSubmissionId: null,
            codeHash: sha256Hex(String(saved.submittedCode ?? ""))
          },
          testResults: sanitizeTestResultsForStudent(parsedTestResults),
          hints: [],
          scoring:
            typeof (saved as any).score === "number" && typeof (saved as any).maxScore === "number"
              ? {
                  score: (saved as any).score,
                  maxScore: (saved as any).maxScore,
                  groupScores: parsedGroupScores
                }
              : undefined
        });
      }
    }

    const validatedBody = submitBodySchema.safeParse(req.body ?? {});
    if (!validatedBody.success) {
      return res.status(400).json({ message: validationMessageFromZod(validatedBody.error) });
    }

    const eduLang = topicTask.topic.class.language;
    const judgeLang = judgeLanguageFromEduLanguage(eduLang);
    const normalizedFiles = normalizeApiFiles((validatedBody.data as any).files);
    const providedCode = typeof (validatedBody.data as any).code === "string" ? (validatedBody.data as any).code : "";
    const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(providedCode) : null;
    const entryFile = decodedFromCode?.entry || entryFileForJudgeLanguage(judgeLang);
    let effectiveFiles: ApiCodeFile[] = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
    const isMultiFile = effectiveFiles.length > 0;
    if (isMultiFile && !effectiveFiles.some(f => f.path === entryFile)) {
      effectiveFiles = [...effectiveFiles, { path: entryFile, content: providedCode }];
    }
    const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : providedCode;
    const persistedSubmitted = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : sourceText;
    const normalizedClientSubmissionId = normalizeClientSubmissionId((validatedBody.data as any).clientSubmissionId);
    const serverCodeHash = sha256Hex(persistedSubmitted);
    const codeForHints = isMultiFile ? concatForAI({ version: 1, entry: entryFile, files: effectiveFiles }) : sourceText;

    const tests = [...(topicTask.testData || [])].sort((a, b) => a.id - b.id);
    if (tests.length === 0) {
      return res.status(400).json({ message: "NO_TESTS_DEFINED_FOR_THIS_TASK" });
    }

    let passed = 0;
    let passedScore = 0;
    let maxScore = 0;
    let hintsForUser: string[] = [];
    const learningFeedbackCandidates: Array<{
      passed: boolean;
      isPublic: boolean;
      input?: string;
      expected?: string;
      actual?: string;
      error_kind?: string | null;
    }> = [];

    const testResultsDetailed: Array<{
      testId: number;
      input: string;
      actual: string;
      stderr?: string | null;
      passed: boolean;
      verdict?: string | null;
      errorKind?: string | null;
    }> = [];

    // `judgeLang` computed above.
    const defaultLimitsByLang = {
      java: { time_limit_ms: 1200, memory_limit_mb: 256, output_limit_kb: 64 },
      python: { time_limit_ms: 900, memory_limit_mb: 128, output_limit_kb: 64 },
      cpp: { time_limit_ms: 800, memory_limit_mb: 256, output_limit_kb: 64 }
    } as const;

    maxScore = tests.reduce((sum, t) => sum + (t.points || 1), 0);

    const workerReq: WorkerJudgeRequest = {
      submission_id: `edu_complete_${studentId}_${taskId}_${Date.now()}`,
      language: judgeLang,
      source: sourceText,
      ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
      tests: tests.map(t => ({
        id: t.id,
        input: t.input || "",
        output: t.expectedOutput || "",
        hidden: t.isHidden === true,
        group: t.isHidden === true ? "hidden" : "public",
        weight: t.points || 1
      })),
      limits: defaultLimitsByLang[judgeLang],
      checker: chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || "")),
      debug: false,
      rerun_failed_once: true,
      run_all: true
    };

    let workerRes: WorkerJudgeResponse | null = null;
    let scoringGroupScores: Array<{ group: string; score: number; maxScore: number }> | null = null;

    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e: any) {
      if (e instanceof HttpError) throw e;
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("judge worker failed (edu complete)", {
        requestId: req.requestId,
        submission: workerReq.submission_id,
        error: errMsg
      });
      throw new HttpError(503, "Judge unavailable", {
        code: "JUDGE_UNAVAILABLE",
        expose: true,
        cause: e
      });
    }

    if (workerRes) {
      if (workerRes.verdict === "CE" && workerRes.compile) {
        const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        for (const t of tests) {
          learningFeedbackCandidates.push({
            passed: false,
            isPublic: t.isHidden !== true,
            input: t.input || "",
            expected: String(t.expectedOutput ?? ""),
            actual: "",
            error_kind: workerRes.compile.error_kind ?? null
          });
          if (t.isHidden) continue;
          testResultsDetailed.push({
            testId: t.id,
            input: t.input || "",
            actual: "",
            stderr: compileErr || "Compilation error",
            passed: false,
            verdict: "CE",
            errorKind: workerRes.compile.error_kind ?? null
          });
        }
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const isPassed = r?.verdict === "AC";
          if (isPassed) {
            passed++;
            passedScore += t.points || 1;
          }
          learningFeedbackCandidates.push({
            passed: !!isPassed,
            isPublic: t.isHidden !== true,
            input: t.input || "",
            expected: String(t.expectedOutput ?? ""),
            actual: r?.actual ?? "",
            error_kind: (r as any)?.error_kind ?? null
          });
          if (t.isHidden) continue;
          testResultsDetailed.push({
            testId: t.id,
            input: t.input || "",
            actual: r?.actual ?? "",
            stderr: r?.stderr ?? null,
            passed: isPassed,
            verdict: r?.verdict ?? null,
            errorKind: (r as any)?.error_kind ?? null
          });
        }
      }
    }

    if (workerRes && typeof workerRes.score === "number" && typeof workerRes.max_score === "number") {
      passedScore = workerRes.score;
      maxScore = workerRes.max_score;
    }

    if (workerRes && Array.isArray((workerRes as any).group_scores)) {
      scoringGroupScores = (workerRes as any).group_scores.map((gs: any) => ({
        group: String(gs?.group ?? ""),
        score: Number(gs?.score ?? 0),
        maxScore: Number(gs?.max_score ?? 0)
      }));
    }

    let feedback: string | null = null;

    if (passed < tests.length) {
      try {
        const expectedById = new Map<number, string>();
        for (const t of tests) expectedById.set(t.id, (t.expectedOutput || "").toString());

        const failuresForHints = testResultsDetailed
          .filter(r => !r.passed)
          .slice(0, 3)
          .map(r => ({
            testId: r.testId,
            input: r.input || "",
            expected: expectedById.get(r.testId) ?? "",
            actual: r.actual || "",
            verdict: r.verdict ?? undefined,
            stderr: r.stderr ?? null
          }));

        const langForHints =
          topicTask.topic.class.language === "JAVA"
            ? "JAVA"
            : topicTask.topic.class.language === "CPP"
              ? "CPP"
              : "PYTHON";

        const hints = await generateAlgorithmicHints({
          taskTitle: topicTask.title,
          taskText: topicTask.description,
          language: langForHints,
          code: codeForHints,
          failures: failuresForHints,
          maxHints: 4
        });

        if (hints.length) {
          hintsForUser = hints;
          feedback = hints.map(h => `- ${h}`).join("\n");
        }
      } catch {
        // ignore hint failures
      }
    }

    const ratio = maxScore > 0 ? passedScore / maxScore : 0;
    const score = Math.round(ratio * 100);
    const totalGrade = Math.max(0, Math.min(100, score));

    const savedOrExisting = await AppDataSource.transaction("SERIALIZABLE", async manager => {
      await manager
        .createQueryBuilder(Student, "student")
        .setLock("pessimistic_write")
        .where("student.id = :studentId", { studentId })
        .getOne();

      const gradeRepoM = manager.getRepository(EduGrade);

      const latestExistingM = await gradeRepoM
        .createQueryBuilder("grade")
        .where("grade.topic_task_id = :taskId", { taskId })
        .andWhere("grade.student_id = :studentId", { studentId })
        .orderBy("grade.created_at", "DESC")
        .getOne();

      if (latestExistingM && latestExistingM.isManuallyGraded) {
        throw new Error("TASK_MANUALLY_GRADED_LOCKED");
      }
      if (latestExistingM && latestExistingM.isCompleted) {
        throw new Error("TASK_ALREADY_COMPLETED");
      }

      const countM = await gradeRepoM
        .createQueryBuilder("grade")
        .where("grade.topic_task_id = :taskId", { taskId })
        .andWhere("grade.student_id = :studentId", { studentId })
        .getCount();

      if (countM >= topicTask.maxAttempts) {
        if (!latestExistingM) {
          throw new Error("MAX_ATTEMPTS_REACHED");
        }
        latestExistingM.isCompleted = true;
        const savedExisting = await gradeRepoM.save(latestExistingM);

        if (topicTask.controlWork?.id) {
          await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork.id, studentId);
        }
        return { kind: "existing" as const, grade: savedExisting };
      }

      const grade = gradeRepoM.create({
        student: { id: studentId } as any,
        topicTask: { id: taskId } as any,
        total: totalGrade,
        testsPassed: passed,
        testsTotal: tests.length,
        submittedCode: persistedSubmitted,
        isManuallyGraded: false,
        isCompleted: true,
        feedback,
        testResults: JSON.stringify(testResultsDetailed),
        score: typeof passedScore === "number" ? passedScore : null,
        maxScore: typeof maxScore === "number" ? maxScore : null,
        groupScores: scoringGroupScores ? JSON.stringify(scoringGroupScores) : null
      });

      const savedNew = await gradeRepoM.save(grade);

      if (topicTask.controlWork?.id) {
        await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork.id, studentId, null);
        await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork.id, studentId);
      }

      return { kind: "new" as const, grade: savedNew };
    });

    if (savedOrExisting.kind === "existing") {
      const saved = savedOrExisting.grade;

      let parsedTestResults: any[] = [];
      if (saved.testResults) {
        try {
          const parsed = JSON.parse(saved.testResults);
          if (Array.isArray(parsed)) parsedTestResults = parsed;
        } catch {
          // ignore
        }
      }

      let parsedGroupScores: any[] | null = null;
      if ((saved as any).groupScores) {
        try {
          const parsed = JSON.parse((saved as any).groupScores);
          if (Array.isArray(parsed)) parsedGroupScores = parsed;
        } catch {
          // ignore
        }
      }

      return res.json({
        requiresManualReview: false,
        grade: {
          id: saved.id,
          total: saved.total,
          testsPassed: saved.testsPassed,
          testsTotal: saved.testsTotal,
          isManuallyGraded: saved.isManuallyGraded === true,
          isCompleted: true
        },
        submissionMeta: {
          submissionId: String(saved.id),
          clientSubmissionId: null,
          codeHash: sha256Hex(String(saved.submittedCode ?? ""))
        },
        testResults: sanitizeTestResultsForStudent(parsedTestResults),
        hints: [],
        scoring:
          typeof (saved as any).score === "number" && typeof (saved as any).maxScore === "number"
            ? {
                score: (saved as any).score,
                maxScore: (saved as any).maxScore,
                groupScores: parsedGroupScores
              }
            : undefined,
        learningFeedback: {
          verdict: null,
          firstFailure: null
        }
      });
    }

    const saved = savedOrExisting.grade;

    const learningFirstFailure = buildLearningFirstFailure({
      verdict: workerRes?.verdict ?? null,
      tests: learningFeedbackCandidates
    });

    return res.json({
      requiresManualReview: false,
      grade: {
        id: saved.id,
        total: saved.total,
        testsPassed: saved.testsPassed,
        testsTotal: saved.testsTotal,
        isManuallyGraded: saved.isManuallyGraded,
        isCompleted: true
      },
      submissionMeta: {
        submissionId: String(saved.id),
        clientSubmissionId: normalizedClientSubmissionId,
        codeHash: serverCodeHash
      },
      testResults: sanitizeTestResultsForStudent(testResultsDetailed),
      hints: hintsForUser,
      scoring: {
        score: passedScore,
        maxScore,
        groupScores: scoringGroupScores
      },
      learningFeedback: {
        verdict: workerRes?.verdict ?? null,
        firstFailure: learningFirstFailure
      }
    });
  } catch (error: any) {
    if (error?.message === "TASK_MANUALLY_GRADED_LOCKED") {
      return res.status(409).json({ message: "TASK_MANUALLY_GRADED_LOCKED" });
    }
    if (error?.message === "TASK_ALREADY_COMPLETED") {
      return res.status(409).json({ message: "TASK_ALREADY_COMPLETED" });
    }
    if (error?.message === "MAX_ATTEMPTS_REACHED") {
      return res.status(403).json({ message: "MAX_ATTEMPTS_REACHED" });
    }
    logger.error("Error completing task", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/topics/tasks/:taskId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UNASSIGN_TASKS" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    const task = await topicTaskRepo()
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("task.id = :taskId", { taskId })
      .getOne();

    if (!task) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (task.topic.class && task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await AppDataSource.transaction(async manager => {
      const taskRepoM = manager.getRepository(TopicTask);
      const gradeRepoM = manager.getRepository(EduGrade);
      task.isAssigned = false;
      task.deadline = null;
      await taskRepoM.save(task);
      await gradeRepoM
        .createQueryBuilder()
        .delete()
        .from(EduGrade)
        .where("topic_task_id = :taskId", { taskId: task.id })
        .execute();
    });

    res.json({ message: "TASK_UNASSIGNED_AND_CLEARED" });
  } catch (error: any) {
    logger.error("Error unassigning task", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/topics/control-works/:controlWorkId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UNASSIGN_CONTROL_WORKS" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({ message: "INVALID_CONTROL_WORK_ID" });
    }

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("controlWork.id = :controlWorkId", { controlWorkId })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({ message: "CONTROL_WORK_NOT_FOUND" });
    }

    if (controlWork.topic.class && controlWork.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    await AppDataSource.transaction(async manager => {
      const cwRepoM = manager.getRepository(ControlWork);
      const taskRepoM = manager.getRepository(TopicTask);
      const gradeRepoM = manager.getRepository(EduGrade);
      const summaryRepoM = manager.getRepository(SummaryGrade);
      const attemptRepoM = manager.getRepository(LessonAttempt);

      controlWork.isAssigned = false;
      controlWork.deadline = null;
      await cwRepoM.save(controlWork);

      const controlTasks = await taskRepoM
        .createQueryBuilder("task")
        .where("task.control_work_id = :controlWorkId", { controlWorkId })
        .andWhere("task.type = :controlType", { controlType: "CONTROL" })
        .getMany();

      for (const t of controlTasks) {
        t.isAssigned = false;
        t.deadline = null;
        await taskRepoM.save(t);
      }

      const controlTaskIds = controlTasks.map(t => t.id);
      if (controlTaskIds.length > 0) {
        await gradeRepoM
          .createQueryBuilder()
          .delete()
          .from(EduGrade)
          .where("topic_task_id IN (:...ids)", { ids: controlTaskIds })
          .execute();
      }

      await summaryRepoM
        .createQueryBuilder()
        .delete()
        .from(SummaryGrade)
        .where("control_work_id = :controlWorkId", { controlWorkId })
        .andWhere("assessment_type = :type", { type: AssessmentType.CONTROL })
        .execute();

      await attemptRepoM
        .createQueryBuilder()
        .delete()
        .from(LessonAttempt)
        .where("control_work_id = :controlWorkId", { controlWorkId })
        .execute();
    });

    res.json({ message: "CONTROL_WORK_UNASSIGNED_AND_CLEARED" });
  } catch (error: any) {
    logger.error("Error unassigning control work", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
