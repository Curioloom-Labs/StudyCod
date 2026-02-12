import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { AppDataSource } from "../data-source";
import { Task, TaskType } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { Grade } from "../entities/Grade";
import { User } from "../entities/User";
import { TestData } from "../entities/TestData";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { submissionRateLimitMiddleware } from "../middleware/submissionRateLimit";
import { In } from "typeorm";
import { generateTaskWithAI, generateTheoryWithAI, generateQuizWithAI } from "../services/openRouterService";
import { safeAICall, sendAIError } from "../services/ai/safeAICall";
import { generateAlgorithmicHints } from "../services/ai/failureHints";
import { checkMilestone } from "../utils/milestoneDetector";
import { getStableDifus } from "../utils/adaptiveDifficulty";
import { executeCodeWithInput } from "../services/codeExecutionService";
import { computeTotalFromParts, evaluateCodeWithAI } from "../ai/evaluator";
import { judgeWithSemaphore } from "../services/judgeWorker";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { normalizeMarkdownText } from "../utils/markdownNormalize";
import { inferNeedsInput } from "../utils/inferNeedsInput";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";
import { concatForAI, decodeMultiFileSubmissionV1, encodeMultiFileSubmissionV1, pickEntryContent } from "../utils/multiFileSubmission";
const tasksRouter = Router();

type ApiCodeFile = { path: string; content: string };
function normalizeApiFiles(raw: unknown): ApiCodeFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiCodeFile[] = [];
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const p = typeof (f as any).path === "string" ? (f as any).path.trim() : "";
    const c = typeof (f as any).content === "string" ? (f as any).content : "";
    if (!p) continue;
    // Keep it simple (no folders) – matches judge validation.
    if (p.includes("/") || p.includes("\\") || p.includes("..") || p.startsWith(".")) continue;
    out.push({ path: p, content: c });
  }
  const byPath = new Map<string, ApiCodeFile>();
  for (const f of out) byPath.set(f.path, f);
  return [...byPath.values()];
}
function taskNeedsInput(taskDesc: string): boolean {
  // Kept for backwards compatibility inside this file.
  return inferNeedsInput({
    taskDescription: taskDesc,
    aiInputFormat: null
  });
}
function tryExtractFixedAdditionSumNoInput(taskText: string): number | null {
  const s = String(taskText ?? "");
  if (taskNeedsInput(s)) return null;
  if (/\b(сума\s*:|sum\s*:|формат\s+виводу|output\s+format)\b/i.test(s)) return null;
  if (/\b(добуток|product|multiply)\b/i.test(s)) return null;
  const m = s.match(/(^|[^\d])(\d{1,9})\s*\+\s*(\d{1,9})([^\d]|$)/);
  if (!m) return null;
  if (!/(вивед|output|print)/i.test(s)) return null;
  const a = Number(m[2]);
  const b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + b;
}
function computeDeterministicNoInputExpectedOutput(taskText: string): string | null {
  const s = String(taskText ?? "");
  if (taskNeedsInput(s)) return null;
  if (/\b(сума\s*:|sum\s*:|формат\s+виводу|output\s+format)\b/i.test(s)) return null;
  const add = tryExtractFixedAdditionSumNoInput(s);
  if (add !== null) return String(add);
  const aMatch = s.match(/\ba\b[^\d\n]{0,80}(\d{1,9})/i);
  const bMatch = s.match(/\bb\b[^\d\n]{0,80}(\d{1,9})/i);
  if (aMatch && bMatch) {
    const a = Number(aMatch[1]);
    const b = Number(bMatch[1]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (/\b(добуток|product|multiply)\b/i.test(s)) return String(a * b);
      if (/\b(різниц|difference|subtract)\b/i.test(s)) return String(a - b);
      if (/\b(сума|sum|add)\b/i.test(s)) return String(a + b);
    }
  }
  return null;
}
function isIntroPythonFixedSumTask(taskDesc: string, title: string): boolean {
  const t = String(title ?? "").trim();
  const s = String(taskDesc ?? "");
  if (!/Вступ\s+до\s+Python\s+та\s+інтерпретатора/i.test(t)) return false;
  if (taskNeedsInput(s)) return false;
  return /\ba\b[^\n]{0,80}(?:значенн\w*\s*)?5/i.test(s) && /\bb\b[^\n]{0,80}(?:значенн\w*\s*)?3/i.test(s) && /сум/i.test(s) && /вивед/i.test(s);
}
function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some(s => {
    const v = String(s ?? "");
    return /(^|\s)[-+]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?(\s|$)/.test(v) || /(^|\s)[-+]?\d+(?:[eE][-+]?\d+)(\s|$)/.test(v);
  });
  return hasFloatLike ? {
    type: "float",
    epsilon: 1e-6
  } : {
    type: "whitespace"
  };
}

function sanitizeTestResultsForStudent(results: any): Array<{ testId: number; passed: boolean; verdict?: string | null; errorKind?: string | null; error?: string | null }> {
  if (!Array.isArray(results)) return [];
  return results
    .map((r: any) => ({
      testId: Number(r?.testId ?? r?.test_id ?? 0),
      passed: !!r?.passed,
      verdict: r?.verdict ?? null,
      errorKind: r?.errorKind ?? r?.error_kind ?? null,
      error: r?.error ?? null
    }))
    .filter(r => Number.isFinite(r.testId) && r.testId > 0);
}
const taskRepo = () => AppDataSource.getRepository(Task);
const topicRepo = () => AppDataSource.getRepository(Topic);
const gradeRepo = () => AppDataSource.getRepository(Grade);
const userRepo = () => AppDataSource.getRepository(User);
const testDataRepo = () => AppDataSource.getRepository(TestData);
type TaskStatus = "OPEN" | "SUBMITTED" | "GRADED";
function stripPracticeLikeSectionsFromTheory(rawTheory: string): string {
  const t = normalizeMarkdownText(rawTheory).trim();
  if (!t) return "";
  const headerRe = /^#{2,3}\s*(Практика|Practice|Завдання|Вправа|Task|Exercise)\b.*$/im;
  const m = headerRe.exec(t);
  if (m && typeof m.index === "number" && m.index >= 0) {
    return t.slice(0, m.index).trim();
  }
  const forbiddenWord = /(\bПрактика\b|\bЗавдання\b)/i;
  const idx = t.search(forbiddenWord);
  if (idx >= 0) return t.slice(0, idx).trim();
  return t;
}
function stripPracticeHeader(rawPractice: string): string {
  const s = normalizeMarkdownText(rawPractice).trim();
  if (!s) return "";
  return s.replace(/^###\s*(Практика|Practice)\b\s*/i, "").replace(/^###\s*(Практичне\s+завдання|Practical\s+task)\b\s*/i, "").trim();
}
function getTopicTheoryMarkdown(task: Task): string {
  const fromBlock = (task.topic as any)?.theoryBlock?.content;
  const theory = stripPracticeLikeSectionsFromTheory(String(fromBlock ?? ""));
  if (theory) return theory;
  const legacy = stripPracticeLikeSectionsFromTheory(String((task.topic as any)?.theoryMarkdown ?? ""));
  if (legacy) return legacy;
  return "## Теорія\n\n_Теорія для цієї теми ще не додана. Повідом викладачу або відкрий довідку._";
}
function computeTaskStatus(task: Task, hasGrade: boolean): TaskStatus {
  if (hasGrade || !!task.completed) return "GRADED";
  if (task.finalCode) return "SUBMITTED";
  return "OPEN";
}
function mapTaskToDto(task: Task, gradeTaskIds?: Set<number>) {
  const hasGrade = gradeTaskIds ? gradeTaskIds.has(task.id) : !!task.completed;
  const status: TaskStatus = computeTaskStatus(task, hasGrade);
  const rawPractice = (task.descriptionMarkdown || task.description || "").toString();
  const theoryMarkdown = getTopicTheoryMarkdown(task) || "";
  const practiceText = stripPracticeHeader(rawPractice);
  const normalizedDescription = `${theoryMarkdown}\n\n### Практика\n\n${practiceText || "_Практичне завдання ще не додано._"}`.trim();

  const starterDecoded = decodeMultiFileSubmissionV1(task.template);
  const starterFiles = starterDecoded?.files ?? null;
  const starterEntry = starterDecoded?.entry ?? null;
  const starterCode = starterDecoded ? pickEntryContent(starterDecoded) : task.template;

  const codeRaw = status === "GRADED" ? task.finalCode || "" : task.draftCode || "";
  const userDecoded = decodeMultiFileSubmissionV1(codeRaw);
  const userFiles = userDecoded?.files ?? null;
  const userEntry = userDecoded?.entry ?? null;
  const userCode = userDecoded ? pickEntryContent(userDecoded) : codeRaw;

  return {
    id: task.id,
    title: task.title,
    descriptionMarkdown: normalizedDescription,
    theoryMarkdown,
    practiceText,
    starterCode,
    starterFiles: starterFiles ?? undefined,
    starterEntryFile: starterEntry ?? undefined,
    userCode,
    userFiles: userFiles ?? undefined,
    userEntryFile: userEntry ?? undefined,
    finalCode: task.finalCode || null,
    status,
    lessonInTopic: task.numInTopic ?? 1,
    repeatAttempt: 0,
    kind: task.type,
    createdAt: task.createdAt,
    language: task.lang
  };
}
tasksRouter.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const tasks = await taskRepo().find({
      where: {
        user: {
          id: req.userId
        },
        ...(req.lang && {
          lang: req.lang as "JAVA" | "PYTHON"
        })
      },
      order: {
        createdAt: "DESC"
      },
      relations: ["user", "topic", "topic.theoryBlock"]
    });
    const ids = tasks.map(t => t.id);
    const gradeTaskIds = new Set<number>();
    if (ids.length > 0) {
      const grades = await gradeRepo().find({
        where: {
          user: {
            id: req.userId
          },
          task: {
            id: In(ids)
          }
        },
        relations: ["task"]
      });
      for (const g of grades) {
        const tid = (g as any)?.task?.id;
        if (typeof tid === "number") gradeTaskIds.add(tid);
      }
    }
    return res.json(tasks.map(t => mapTaskToDto(t, gradeTaskIds)));
  } catch (error) {
    logger.error("[tasks] GET /tasks error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.get("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({
      message: "Invalid id"
    });
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id,
        user: {
          id: req.userId
        }
      },
      relations: ["user", "topic", "topic.theoryBlock", "testData"]
    });
    if (!task) return res.status(404).json({
      message: "Task not found"
    });
    const grade = await gradeRepo().findOne({
      where: {
        user: {
          id: req.userId
        },
        task: {
          id: task.id
        }
      }
    });
    const gradeTaskIds = new Set<number>();
    if (grade) gradeTaskIds.add(task.id);
    return res.json(mapTaskToDto(task, gradeTaskIds));
  } catch {
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.post("/generate", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const requestStartedAt = Date.now();
    // nginx default proxy_read_timeout is often 60s; keep some buffer.
    const REQUEST_BUDGET_MS = 55_000;
    const userId = req.userId!;
    const lang = req.lang as "JAVA" | "PYTHON" || "JAVA";
    const userLanguage: "uk" | "en" = req.headers['accept-language']?.includes('en') || req.body?.language === 'en' ? "en" : "uk";
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) return res.status(404).json({
      message: "USER_NOT_FOUND"
    });

    const masteredUntilTopicIndex = (() => {
      const raw = lang === "JAVA" ? (user as any).placementMasteredUntilTopicIndexJava : (user as any).placementMasteredUntilTopicIndexPython;
      const v = raw === null || raw === undefined ? -1 : Number(raw);
      if (!Number.isFinite(v)) return -1;
      return Math.max(-1, Math.floor(v));
    })();
    const tasks = await taskRepo().find({
      where: {
        user: {
          id: userId
        },
        lang
      },
      relations: ["user", "topic"]
    });
    for (const t of tasks) {
      if (t.completed) continue;
      const g = await gradeRepo().findOne({
        where: {
          user: {
            id: userId
          },
          task: {
            id: t.id
          }
        }
      });
      if (!g) {
        return res.status(400).json({
          status: "blocked",
          message: "COMPLETE_PREVIOUS_TASK",
          taskId: t.id
        });
      }
    }
    const topics = await topicRepo().find({
      where: {
        lang
      },
      order: {
        topicIndex: "ASC"
      },
      relations: ["theoryBlock"]
    });
    if (!topics.length) return res.status(404).json({
      status: "error",
      message: "NO_TOPICS"
    });
    const REQUIRED_TASKS_FOR_INTRO_TOPIC = 1;
    const REQUIRED_TASKS_FOR_REGULAR_TOPIC = 3;
    let topic: Topic | null = null;
    for (const t of topics) {
      if (t.topicIndex <= masteredUntilTopicIndex) continue;
      const count = await taskRepo().count({
        where: {
          user: {
            id: userId
          },
          topic: {
            id: t.id
          }
        }
      });
      const required = t.topicIndex === 0 ? REQUIRED_TASKS_FOR_INTRO_TOPIC : REQUIRED_TASKS_FOR_REGULAR_TOPIC;
      if (count < required) {
        topic = t;
        break;
      }
    }
    if (!topic) return res.status(400).json({
      status: "blocked",
      message: "ALL_TOPICS_COMPLETED"
    });
    const difus = await getStableDifus(userId, lang, topic.topicIndex, userRepo, gradeRepo);
    const numInTopic = (await taskRepo().count({
      where: {
        user: {
          id: userId
        },
        topic: {
          id: topic.id
        }
      }
    })) + 1;
    let description = "";
    let template = lang === "PYTHON" ? "# write code here\n" : ["public class Main {", "  public static void main(String[] args) {", "  }", "}"].join("\n");
    const topicTheory = stripPracticeLikeSectionsFromTheory(String((topic as any).theoryBlock?.content ?? (topic as any).theoryMarkdown ?? ""));

    const remainingBeforeTask = REQUEST_BUDGET_MS - (Date.now() - requestStartedAt);
    // Keep some budget for test-data generation + DB writes.
    const taskBudgetMs = Math.max(12_000, Math.min(35_000, remainingBeforeTask - 15_000));

    const aiTaskResult = await safeAICall('generateTask', {
      topicTitle: topic.title,
      theory: topicTheory,
      lang,
      numInTopic,
      isFirstTask: numInTopic === 1,
      difus,
      userId,
      topicId: topic.id,
      semanticRetries: 0
    }, {
      language: userLanguage,
      requestId: req.requestId,
      maxAttempts: 1,
      totalTimeoutMs: taskBudgetMs
    });
    if (!aiTaskResult.success) {
      return sendAIError(res, aiTaskResult.error);
    }
    const aiTask = aiTaskResult.data;
    description = String(aiTask.practicalTask ?? "").trim();
    template = aiTask.codeTemplate;
    const task = taskRepo().create({
      user: {
        id: userId
      },
      topic,
      title: topic.title,
      subtitle: "",
      description,
      descriptionMarkdown: description,
      template,
      draftCode: "",
      finalCode: "",
      completed: 0,
      lang,
      difus,
      numInTopic,
      topicIndex: topic.topicIndex,
      type: "TOPIC" as TaskType
    });
    const saved = await taskRepo().save(task);
    const needsInput = inferNeedsInput({
      taskDescription: description,
      aiInputFormat: (aiTask as any)?.inputFormat
    });
    const REQUIRED_TEST_COUNT = needsInput ? 12 : 1;
    let testExamples: Array<{
      input: string;
      output: string;
    }> = [];
    const deterministicIntro = lang === "PYTHON" && isIntroPythonFixedSumTask(description, topic.title);
    if (deterministicIntro) {
      testExamples = [{
        input: "",
        output: "8"
      }];
    } else {
      const expected = computeDeterministicNoInputExpectedOutput(description);
      if (expected !== null) testExamples = [{
        input: "",
        output: expected
      }];
    }
    if (testExamples.length === 0) {
      const taskDescriptionForTests = [
        description,
        (aiTask as any)?.inputFormat ? `\n\nФормат вхідних даних:\n${String((aiTask as any).inputFormat).trim()}` : ""
      ].join("").trim();

      const remainingBeforeTests = REQUEST_BUDGET_MS - (Date.now() - requestStartedAt);
      const testsBudgetMs = Math.max(8_000, Math.min(18_000, remainingBeforeTests - 2000));

      const testDataResult = await safeAICall('generateTestData', {
        taskDescription: taskDescriptionForTests || description,
        taskTitle: topic.title,
        lang,
        count: REQUIRED_TEST_COUNT,
        userId
      }, {
        expectedCount: REQUIRED_TEST_COUNT,
        language: userLanguage,
        requestId: req.requestId,
        maxAttempts: 1,
        totalTimeoutMs: testsBudgetMs
      });
      if (!testDataResult.success) {
        // If upstream AI is rate-limited/unavailable, fall back to examples produced by the task generation itself.
        // This avoids failing the whole task generation flow under provider pressure.
        const status = Number(testDataResult.error?.statusCode ?? 0);
        const canFallback = status === 429 || status === 503 || status === 504;
        if (!canFallback) {
          await taskRepo().remove(saved);
          return sendAIError(res, testDataResult.error);
        }

        const examples = Array.isArray((aiTask as any)?.examples) ? (aiTask as any).examples : [];
        const fallbackExamples = examples
          .map((ex: any) => ({
            input: String(ex?.input ?? ""),
            output: String(ex?.output ?? "")
          }))
          .filter((ex: { output: string }) => typeof ex.output === "string" && ex.output.trim().length > 0);

        if (fallbackExamples.length === 0) {
          // Should not happen because generateTask validator requires examples, but keep a safe fallback.
          await taskRepo().remove(saved);
          return sendAIError(res, testDataResult.error);
        }

        logger.warn("[tasks] generateTestData rate-limited; using task examples as fallback tests", {
          requestId: req.requestId,
          userId,
          topicId: topic.id,
          lang,
          status,
          retryAfterMs: testDataResult.error?.details?.retryAfterMs
        });

        testExamples = fallbackExamples.slice(0, Math.max(1, Math.min(REQUIRED_TEST_COUNT, fallbackExamples.length)));
      } else {
        testExamples = (testDataResult.data || []).map((ex: any) => ({
          input: String(ex?.input ?? ""),
          output: String(ex?.output ?? "")
        }));
      }
    }
    // Keep max grade scale (12) stable even if we had to fall back to fewer tests.
    const pointsByIndex: number[] = (() => {
      const n = Math.max(1, testExamples.length);
      const totalPoints = needsInput ? 12 : 12;
      if (n === 1) return [totalPoints];
      const base = Math.floor(totalPoints / n);
      const rem = totalPoints % n;
      const arr = new Array(n).fill(base);
      for (let i = 0; i < rem; i++) arr[i] = arr[i] + 1;
      return arr;
    })();

    const newTestData = testExamples.map((ex, idx) => testDataRepo().create({
      input: ex.input || "",
      expectedOutput: ex.output || "",
      points: pointsByIndex[idx] ?? 1,
      personalTask: {
        id: saved.id
      }
    }));
    await testDataRepo().save(newTestData);
    return res.json({
      status: "ok",
      task: mapTaskToDto(saved)
    });
  } catch (error: any) {
    logger.error("[tasks] POST /generate error", { requestId: req.requestId, userId: req.userId, error });
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        error: error.error
      });
    }
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.post("/reset-topic", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      topicId
    } = req.body;
    if (!topicId || typeof topicId !== "number") {
      return res.status(400).json({
        message: "topicId is required and must be a number"
      });
    }
    const tasks = await taskRepo().find({
      where: {
        user: {
          id: userId
        },
        topic: {
          id: topicId
        }
      }
    });
    for (const task of tasks) {
      await gradeRepo().delete({
        user: {
          id: userId
        },
        task: {
          id: task.id
        }
      });
    }
    await taskRepo().delete({
      user: {
        id: userId
      },
      topic: {
        id: topicId
      }
    });
    return res.json({
      message: "Topic reset successfully"
    });
  } catch (error: any) {
    logger.error("[tasks] POST /reset-topic error", { requestId: req.requestId, userId: req.userId, error });
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.post(
  "/:id/save-draft",
  authMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({
    errors: errors.array()
  });
  const id = Number(req.params.id);
  const { code, files } = req.body as { code?: string; files?: unknown };
  if (!req.userId) {
    return res.status(401).json({
      message: "UNAUTHORIZED"
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    }
  });
  if (!task) {
    return res.status(404).json({
      message: "Task not found"
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const persisted = normalizedFiles.length
    ? encodeMultiFileSubmissionV1({ entry: task.lang === "PYTHON" ? "main.py" : "Main.java", files: normalizedFiles })
    : String(code ?? "");

  task.draftCode = persisted;
  await taskRepo().save(task);
  return res.json({
    success: true
  });
}
);
tasksRouter.post(
  "/:id/submit",
  authMiddleware,
  submissionRateLimitMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body("mode").optional().isIn(["TESTS", "AI"]),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError(400, "VALIDATION_ERROR", {
      code: "VALIDATION_ERROR",
      expose: true
    });
  }
  const id = Number(req.params.id);
  const {
    code,
    files,
    mode
  } = req.body as {
    code?: string;
    files?: unknown;
    mode?: "TESTS" | "AI";
  };
  const submitMode: "TESTS" | "AI" = mode ?? "TESTS";
  if (!req.userId) {
    throw new HttpError(401, "UNAUTHORIZED", {
      code: "UNAUTHORIZED",
      expose: true
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    },
    relations: ["testData"]
  });
  if (!task) {
    throw new HttpError(404, "Task not found", {
      code: "TASK_NOT_FOUND",
      expose: true
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const entryFile = task.lang === "PYTHON" ? "main.py" : "Main.java";
  const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(code) : null;
  const effectiveFiles = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
  const isMultiFile = effectiveFiles.length > 0;
  const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : String(code ?? "");
  const persistedSubmission = isMultiFile ? encodeMultiFileSubmissionV1({ entry: entryFile, files: effectiveFiles }) : String(code ?? "");

  // For AI grading, concatenate all files for better context.
  const aiCodeText = isMultiFile ? concatForAI({ version: 1, entry: entryFile, files: effectiveFiles }) : sourceText;
  if (submitMode === "TESTS" && (!task.testData || task.testData.length === 0)) {
    throw new HttpError(400, "Test data is required for personal tasks. Please regenerate the task.", {
      code: "TEST_DATA_REQUIRED",
      expose: true
    });
  }
  const MIN_GRADE = 1;
  const MAX_GRADE = 12;
  const TASK_COMPLETED_FLAG = 1;
  if (submitMode === "AI") {
    const previous = await gradeRepo().findOne({
      where: {
        user: {
          id: req.userId
        },
        task: {
          id: task.id
        }
      },
      order: {
        createdAt: "DESC"
      },
      relations: ["task"]
    });
    const ai = await evaluateCodeWithAI({
      code: aiCodeText,
      language: task.lang,
      task,
      previousCode: previous?.codeSnapshot ?? undefined,
      previousGrade: previous?.total ?? undefined,
      previousScores: previous ? {
        work: Number(previous.workScore ?? 0),
        optimization: Number(previous.optimizationScore ?? 0),
        integrity: Number(previous.integrityScore ?? 0)
      } : undefined
    });
    const total = computeTotalFromParts({
      work: ai.work,
      optimization: ai.optimization,
      integrity: ai.integrity
    });
    const comparisonFeedback = ai.comparison?.changes?.length ? ai.comparison.changes.map(c => {
      const category = c.category === "work" ? "Працездатність" : c.category === "optimization" ? "Оптимізація" : "Доброчесність";
      const sign = c.delta >= 0 ? "+" : "";
      const line = c.codeLine ? ` (рядок ${c.codeLine})` : "";
      return `${category}: ${sign}${c.delta}${line} — ${c.reason}`;
    }).join("\n") : null;
    task.finalCode = persistedSubmission;
    task.completed = TASK_COMPLETED_FLAG;
    await taskRepo().save(task);
    const grade = gradeRepo().create({
      user: {
        id: req.userId
      },
      task: {
        id: task.id
      },
      total: Math.min(MAX_GRADE, Math.max(MIN_GRADE, total)),
      workScore: ai.work,
      optimizationScore: ai.optimization,
      integrityScore: ai.integrity,
      aiFeedback: ai.feedback,
      codeSnapshot: persistedSubmission,
      previousGradeId: previous?.id ?? null,
      comparisonFeedback: comparisonFeedback ?? null
    });
    const savedGradeResult = await gradeRepo().save(grade);
    const savedGrade = Array.isArray(savedGradeResult) ? savedGradeResult[0] : savedGradeResult;
    return res.json({
      grade: {
        id: savedGrade.id,
        gradingMode: "AI" as const,
        total: savedGrade.total,
        workScore: savedGrade.workScore ?? 0,
        optimizationScore: savedGrade.optimizationScore ?? 0,
        integrityScore: savedGrade.integrityScore ?? 0,
        aiFeedback: savedGrade.aiFeedback,
        comparisonFeedback: savedGrade.comparisonFeedback ?? null,
        previousGrade: previous?.total ?? null,
        createdAt: savedGrade.createdAt
      }
    });
  }
  let total = 0;
  let passedTests = 0;
  let hintsForUser: string[] = [];
  const testResultsDetailed: Array<{
    testId: number;
    input: string;
    expectedOutput?: string;
    actualOutput: string;
    passed: boolean;
    verdict?: string | null;
    error?: string | null;
    errorKind?: string | null;
  }> = [];
  const sorted = [...(task.testData || [])].sort((a, b) => a.id - b.id);
  const tests = sorted.map(t => ({
    id: t.id,
    input: t.input || "",
    output: t.expectedOutput || "",
    hidden: false,
    group: "public",
    weight: t.points || 1
  }));
  const judgeLang = task.lang === "JAVA" ? "java" : task.lang === "PYTHON" ? "python" : "cpp";
  const defaultLimitsByLang = {
    java: {
      time_limit_ms: 1200,
      memory_limit_mb: 256,
      output_limit_kb: 64
    },
    python: {
      time_limit_ms: 900,
      memory_limit_mb: 128,
      output_limit_kb: 64
    },
    cpp: {
      time_limit_ms: 800,
      memory_limit_mb: 256,
      output_limit_kb: 64
    }
  } as const;
  const workerReq: WorkerJudgeRequest = {
    submission_id: `personal_${req.userId}_${task.id}_${Date.now()}`,
    language: judgeLang,
    source: sourceText,
    ...(isMultiFile ? { files: effectiveFiles, entry: entryFile } : {}),
    tests,
    limits: defaultLimitsByLang[judgeLang],
    checker: chooseDefaultCheckerFromExpectedOutputs(sorted.map(t => t.expectedOutput || "")),
    debug: false,
    rerun_failed_once: true
  };
  let workerRes: WorkerJudgeResponse | null = null;
  workerRes = await judgeWithSemaphore(workerReq);
  if (workerRes) {
    if (workerRes.verdict === "CE" && workerRes.compile) {
      const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      for (const t of sorted) {
        testResultsDetailed.push({
          testId: t.id,
          input: t.input || "",
          expectedOutput: (t.expectedOutput ?? "").toString(),
          actualOutput: "",
          passed: false,
          verdict: "CE",
          error: compileErr || "Compilation error",
          errorKind: workerRes.compile.error_kind ?? null
        });
      }
    } else {
      const resultsById = new Map<string, (typeof workerRes.tests)[number]>();
      for (const r of workerRes.tests) {
        resultsById.set(String(r.test_id), r);
      }
      for (const t of sorted) {
        const r = resultsById.get(String(t.id));
        const passed = r?.verdict === "AC";
        if (passed) {
          passedTests++;
          total += t.points;
        }
        testResultsDetailed.push({
          testId: t.id,
          input: t.input || "",
          expectedOutput: (r?.expected ?? t.expectedOutput ?? "").toString(),
          actualOutput: r?.actual ?? "",
          passed,
          verdict: r?.verdict ?? null,
          error: r?.stderr ?? null,
          errorKind: (r as any)?.error_kind ?? null
        });
      }
      if (typeof workerRes.score === "number" && typeof workerRes.max_score === "number") {
        total = workerRes.score;
      }
    }
  }
  const feedbackLines: string[] = [];
  feedbackLines.push(`Пройдено тестів: ${passedTests}/${(task.testData || []).length}`);
  feedbackLines.push("");
  for (const r of testResultsDetailed) {
    if (r.passed) {
      feedbackLines.push(`✓ Тест ${r.testId}: пройдено`);
    } else if (r.error) {
      feedbackLines.push(`✗ Тест ${r.testId}: помилка — ${r.error}`);
    } else {
      feedbackLines.push(`✗ Тест ${r.testId}: не пройдено`);
    }
  }
  if (passedTests < (task.testData || []).length) {
    try {
      const expectedById = new Map<number, string>();
      for (const t of sorted) expectedById.set(t.id, (t.expectedOutput || "").toString());
      const failuresForHints = testResultsDetailed.filter(r => !r.passed).slice(0, 3).map(r => ({
        testId: r.testId,
        input: r.input || "",
        expected: expectedById.get(r.testId) ?? "",
        actual: r.actualOutput || "",
        verdict: r.verdict ?? undefined,
        stderr: r.error ?? null
      }));
      const hints = await generateAlgorithmicHints({
        taskTitle: task.title,
        taskText: task.descriptionMarkdown || task.description,
        language: task.lang,
        code: aiCodeText,
        failures: failuresForHints,
        maxHints: 4
      });
      if (hints.length) {
        hintsForUser = hints;
        feedbackLines.push("");
        feedbackLines.push("Підказки (щоб пройти тести):");
        for (const h of hints) feedbackLines.push(`- ${h}`);
      }
    } catch {}
  }
  const feedback = feedbackLines.join("\n");

  const maxScore = sorted.reduce((sum, t) => sum + (t.points || 1), 0);
  const scoringScore = typeof workerRes?.score === "number" ? workerRes.score : total;
  const scoringMaxScore = typeof workerRes?.max_score === "number" ? workerRes.max_score : maxScore;
  const scoringGroupScores = Array.isArray(workerRes?.group_scores) ? workerRes.group_scores.map(gs => ({
    group: String((gs as any).group ?? ""),
    score: Number((gs as any).score ?? 0),
    maxScore: Number((gs as any).max_score ?? 0)
  })) : [{
    group: "public",
    score: scoringScore,
    maxScore: scoringMaxScore
  }];

  task.finalCode = persistedSubmission;
  task.completed = TASK_COMPLETED_FLAG;
  await taskRepo().save(task);
  const grade = gradeRepo().create({
    user: {
      id: req.userId
    },
    task: {
      id: task.id
    },
    total: Math.min(MAX_GRADE, Math.max(MIN_GRADE, total)),
    workScore: 0,
    optimizationScore: 0,
    integrityScore: 0,
    aiFeedback: feedback,
    codeSnapshot: persistedSubmission,
    comparisonFeedback: null,
    previousGradeId: null
  });
  const savedGradeResult = await gradeRepo().save(grade);
  const savedGrade = Array.isArray(savedGradeResult) ? savedGradeResult[0] : savedGradeResult;
  return res.json({
    grade: {
      id: savedGrade.id,
      gradingMode: "TESTS" as const,
      total: savedGrade.total,
      aiFeedback: savedGrade.aiFeedback,
      testsPassed: passedTests,
      testsTotal: (task.testData || []).length,
      score: scoringScore,
      maxScore: scoringMaxScore,
      groupScores: scoringGroupScores,
      testResults: sanitizeTestResultsForStudent(testResultsDetailed),
      hints: hintsForUser,
      createdAt: savedGrade.createdAt
    }
  });
}
);
tasksRouter.post(
  "/:id/run",
  authMiddleware,
  submissionRateLimitMiddleware,
  [
    body("code").optional().isString(),
    body("files").optional().isArray(),
    body("input").optional().isString(),
    body().custom(v => {
      const hasCode = typeof (v as any)?.code === "string" && (v as any).code.length > 0;
      const hasFiles = Array.isArray((v as any)?.files) && (v as any).files.length > 0;
      if (!hasCode && !hasFiles) throw new Error("code or files required");
      return true;
    })
  ],
  async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new HttpError(400, "VALIDATION_ERROR", {
      code: "VALIDATION_ERROR",
      expose: true
    });
  }
  const id = Number(req.params.id);
  const {
    code,
    files,
    input
  } = req.body as {
    code?: string;
    files?: unknown;
    input?: string;
  };
  if (!req.userId) {
    throw new HttpError(401, "UNAUTHORIZED", {
      code: "UNAUTHORIZED",
      expose: true
    });
  }
  const task = await taskRepo().findOne({
    where: {
      id,
      user: {
        id: req.userId
      }
    }
  });
  if (!task) {
    throw new HttpError(404, "Task not found", {
      code: "TASK_NOT_FOUND",
      expose: true
    });
  }

  const normalizedFiles = normalizeApiFiles(files);
  const entryFile = task.lang === "PYTHON" ? "main.py" : "Main.java";
  const decodedFromCode = normalizedFiles.length === 0 ? decodeMultiFileSubmissionV1(code) : null;
  const effectiveFiles = normalizedFiles.length ? normalizedFiles : decodedFromCode?.files ?? [];
  const isMultiFile = effectiveFiles.length > 0;
  const sourceText = isMultiFile ? (effectiveFiles.find(f => f.path === entryFile)?.content ?? "") : String(code ?? "");

  const CODE_RUN_TIMEOUT_MS = 5000;
  if (isMultiFile) {
    const judgeLang = task.lang === "JAVA" ? "java" : "python";
    const workerReq: WorkerJudgeRequest = {
      submission_id: `personal_run_${req.userId}_${task.id}_${Date.now()}`,
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
      limits: {
        time_limit_ms: CODE_RUN_TIMEOUT_MS,
        memory_limit_mb: judgeLang === "python" ? 128 : 256,
        output_limit_kb: 256
      },
      checker: { type: "exact" },
      debug: true,
      run_all: true,
      rerun_failed_once: false
    };
    const workerRes = await judgeWithSemaphore(workerReq);
    if (workerRes.verdict === "CE" && workerRes.compile) {
      const combined = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      return res.json({ output: "", stderr: combined || "Compilation error", success: false });
    }
    const t0 = workerRes.tests?.[0] as any;
    const stdout = String(t0?.actual ?? "");
    const stderr = String(t0?.stderr ?? "");
    return res.json({ output: stdout, stderr, success: true });
  }

  const result = await executeCodeWithInput(sourceText, task.lang, input || "", CODE_RUN_TIMEOUT_MS);
  return res.json({ output: result.stdout, stderr: result.stderr, success: result.success });
}
);
export { tasksRouter };
export default tasksRouter;