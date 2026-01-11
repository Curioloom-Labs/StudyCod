import { Router, Response } from "express";
import { body, validationResult } from "express-validator";
import { AppDataSource } from "../data-source";
import { Task, TaskType } from "../entities/Task";
import { Topic } from "../entities/Topic";
import { Grade } from "../entities/Grade";
import { User } from "../entities/User";
import { TestData } from "../entities/TestData";
import { authMiddleware, AuthRequest } from "../middleware/authMiddleware";
import { In } from "typeorm";
import { generateTaskWithAI, generateTheoryWithAI, generateQuizWithAI } from "../services/openRouterService";
import { safeAICall, sendAIError } from "../services/ai/safeAICall";
import { generateAlgorithmicHints } from "../services/ai/failureHints";
import { checkMilestone } from "../utils/milestoneDetector";
import { getStableDifus } from "../utils/adaptiveDifficulty";
import { executeCodeWithInput } from "../services/codeExecutionService";
import { computeTotalFromParts, evaluateCodeWithAI } from "../ai/evaluator";
import { judgeWithSemaphore } from "../services/judgeWorker";
import { JudgeBusyError } from "../services/judgeWorker/Semaphore";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { normalizeMarkdownText } from "../utils/markdownNormalize";
const tasksRouter = Router();
function taskNeedsInput(taskDesc: string): boolean {
  const s = String(taskDesc ?? "");
  if (/Немає\s+вхідних\s+даних/i.test(s)) return false;
  return /\binput\b/i.test(s) || /\bstdin\b/i.test(s) || /вхідн\s*і\s*дан\s*і/i.test(s) || /введенн/i.test(s) || /читат/i.test(s) || /зчитат/i.test(s);
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
  return {
    id: task.id,
    title: task.title,
    descriptionMarkdown: normalizedDescription,
    theoryMarkdown,
    practiceText,
    starterCode: task.template,
    userCode: status === "GRADED" ? task.finalCode || "" : task.draftCode || "",
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
    console.error("GET /tasks error:", error);
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
    const userId = req.userId!;
    const lang = req.lang as "JAVA" | "PYTHON" || "JAVA";
    const user = await userRepo().findOne({
      where: {
        id: userId
      }
    });
    if (!user) return res.status(404).json({
      message: "USER_NOT_FOUND"
    });
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
    const aiTaskResult = await safeAICall('generateTask', {
      topicTitle: topic.title,
      theory: topicTheory,
      lang,
      numInTopic,
      isFirstTask: numInTopic === 1,
      difus,
      userId,
      topicId: topic.id
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
    const needsInput = taskNeedsInput(description);
    const REQUIRED_TEST_COUNT = needsInput ? 12 : 1;
    const userLanguage: "uk" | "en" = req.headers['accept-language']?.includes('en') || req.body?.language === 'en' ? "en" : "uk";
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
      const testDataResult = await safeAICall('generateTestData', {
        taskDescription: description,
        taskTitle: topic.title,
        lang,
        count: REQUIRED_TEST_COUNT,
        userId
      }, {
        expectedCount: REQUIRED_TEST_COUNT,
        language: userLanguage
      });
      if (!testDataResult.success) {
        await taskRepo().remove(saved);
        return sendAIError(res, testDataResult.error);
      }
      testExamples = (testDataResult.data || []).map((ex: any) => ({
        input: String(ex?.input ?? ""),
        output: String(ex?.output ?? "")
      }));
    }
    const POINTS_PER_TEST = needsInput ? 1 : 12;
    const newTestData = testExamples.map(ex => testDataRepo().create({
      input: ex.input || "",
      expectedOutput: ex.output || "",
      points: POINTS_PER_TEST,
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
    console.error("[tasks] POST /generate error:", error);
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
    console.error("[tasks] POST /reset-topic error:", error);
    return res.status(500).json({
      message: "Internal server error"
    });
  }
});
tasksRouter.post("/:id/save-draft", authMiddleware, [body("code").isString()], async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({
    errors: errors.array()
  });
  const id = Number(req.params.id);
  const {
    code
  } = req.body as {
    code: string;
  };
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
  task.draftCode = code;
  await taskRepo().save(task);
  return res.json({
    success: true
  });
});
tasksRouter.post("/:id/submit", authMiddleware, [body("code").isString(), body("mode").optional().isIn(["TESTS", "AI"])], async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({
    errors: errors.array()
  });
  const id = Number(req.params.id);
  const {
    code,
    mode
  } = req.body as {
    code: string;
    mode?: "TESTS" | "AI";
  };
  const submitMode: "TESTS" | "AI" = mode ?? "TESTS";
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
    relations: ["testData"]
  });
  if (!task) return res.status(404).json({
    message: "Task not found"
  });
  if (submitMode === "TESTS" && (!task.testData || task.testData.length === 0)) {
    return res.status(400).json({
      message: "Test data is required for personal tasks. Please regenerate the task."
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
      code,
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
    task.finalCode = code;
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
      codeSnapshot: code,
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
  const testResults: Array<{
    testId: number;
    input: string;
    actualOutput: string;
    passed: boolean;
    verdict?: string | null;
    error?: string | null;
  }> = [];
  const sorted = [...(task.testData || [])].sort((a, b) => a.id - b.id);
  const tests = sorted.map(t => ({
    id: t.id,
    input: t.input || "",
    output: t.expectedOutput || "",
    hidden: false
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
    source: code,
    tests,
    limits: defaultLimitsByLang[judgeLang],
    checker: chooseDefaultCheckerFromExpectedOutputs(sorted.map(t => t.expectedOutput || "")),
    debug: false
  };
  let workerRes: WorkerJudgeResponse | null = null;
  try {
    workerRes = await judgeWithSemaphore(workerReq);
  } catch (e) {
    if (e instanceof JudgeBusyError) {
      return res.status(429).json({
        message: "JUDGE_BUSY"
      });
    }
    const allowFallback = process.env.NODE_ENV !== "production" || process.env.JUDGE_ALLOW_FALLBACK === "1" || process.env.JUDGE_ALLOW_FALLBACK === "true";
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error(`[judge] worker failed (tasks submit). allowFallback=${allowFallback} submission=${workerReq.submission_id} error=${errMsg}`, e);
    if (!allowFallback) {
      return res.status(503).json({
        message: "JUDGE_UNAVAILABLE"
      });
    }
    const {
      compareOutput,
      filterStderr
    } = await import("../services/codeExecutionService");
    const CODE_EXECUTION_TIMEOUT_MS = 8000;
    for (const test of sorted) {
      try {
        const inputValue = test.input || "";
        const result = await executeCodeWithInput(code, task.lang, inputValue, CODE_EXECUTION_TIMEOUT_MS);
        const actual = (result.stdout ?? "").trim();
        const expected = (test.expectedOutput ?? "").trim();
        const passed = !!(result.success && compareOutput(actual, expected));
        if (passed) {
          passedTests++;
          total += test.points;
        }
        const err = filterStderr(result.stderr || "");
        testResults.push({
          testId: test.id,
          input: inputValue,
          actualOutput: actual,
          passed,
          error: err ? err : null
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        testResults.push({
          testId: test.id,
          input: test.input || "",
          actualOutput: "",
          passed: false,
          error: errorMessage
        });
      }
    }
  }
  if (workerRes) {
    if (workerRes.verdict === "CE" && workerRes.compile) {
      const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
      for (const t of sorted) {
        testResults.push({
          testId: t.id,
          input: t.input || "",
          actualOutput: "",
          passed: false,
          verdict: "CE",
          error: compileErr || "Compilation error"
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
        testResults.push({
          testId: t.id,
          input: t.input || "",
          actualOutput: r?.actual ?? "",
          passed,
          verdict: r?.verdict ?? null,
          error: r?.stderr ?? null
        });
      }
    }
  }
  const feedbackLines: string[] = [];
  feedbackLines.push(`Пройдено тестів: ${passedTests}/${(task.testData || []).length}`);
  feedbackLines.push("");
  for (const r of testResults) {
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
      const failuresForHints = testResults.filter(r => !r.passed).slice(0, 3).map(r => ({
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
        code,
        failures: failuresForHints
      });
      if (hints.length) {
        feedbackLines.push("");
        feedbackLines.push("Підказки (щоб пройти тести):");
        for (const h of hints) feedbackLines.push(`- ${h}`);
      }
    } catch {}
  }
  const feedback = feedbackLines.join("\n");
  task.finalCode = code;
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
    codeSnapshot: code,
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
      testResults,
      createdAt: savedGrade.createdAt
    }
  });
});
tasksRouter.post("/:id/run", authMiddleware, [body("code").isString()], async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({
    errors: errors.array()
  });
  const id = Number(req.params.id);
  const {
    code,
    input
  } = req.body as {
    code: string;
    input?: string;
  };
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
  const CODE_RUN_TIMEOUT_MS = 5000;
  try {
    const result = await executeCodeWithInput(code, task.lang, input || "", CODE_RUN_TIMEOUT_MS);
    return res.json({
      output: result.stdout,
      stderr: result.stderr,
      success: result.success
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Execution error";
    return res.status(500).json({
      message: errorMessage
    });
  }
});
export { tasksRouter };
export default tasksRouter;