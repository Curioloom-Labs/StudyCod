import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { TopicTask } from "../../entities/TopicTask";
import { TestData } from "../../entities/TestData";
import { safeAICall } from "../../services/ai/safeAICall";
import { logger } from "../../utils/logger";
import { createRouteLimiter } from "../../middleware/routeRateLimit";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);

function parseAIBudgetMs(envKey: string, fallbackMs: number, minMs = 8_000, maxMs = 55_000): number {
  const raw = Number(process.env[envKey]);
  const value = Number.isFinite(raw) ? Math.floor(raw) : fallbackMs;
  return Math.max(minMs, Math.min(maxMs, value));
}

const EDU_TESTDATA_AI_DISABLE_DEADLINE = String(process.env.EDU_TESTDATA_AI_DISABLE_DEADLINE || "").trim() === "1";
const EDU_TESTDATA_AI_BUDGET_MS = parseAIBudgetMs("EDU_TESTDATA_AI_BUDGET_MS", 25_000);

// AI-heavy endpoint: protect against bursts.
const generateTestDataLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 5, message: "RATE_LIMIT" });

// Keep limits aligned with judge-worker request constraints.
const testDataItemSchema = z.object({
  input: z.string().max(64 * 1024),
  expectedOutput: z.string().max(64 * 1024),
  points: z.number().int().min(1).max(1000).optional(),
  isHidden: z.boolean().optional()
});

const addTestDataSchema = z.object({
  testData: z.array(testDataItemSchema).min(1).max(5000)
});

const generateSchema = z.object({
  count: z.number().int().min(1).max(50).optional()
});

const updateSchema = z
  .object({
    input: z.string().max(64 * 1024).optional(),
    expectedOutput: z.string().max(64 * 1024).optional(),
    points: z.number().int().min(1).max(1000).optional(),
    isHidden: z.boolean().optional()
  })
  .strict();

function messageForZodIssue(err: z.ZodError): string {
  // Preserve existing message codes where they exist.
  for (const issue of err.issues) {
    const p = issue.path.join(".");
    if (p.startsWith("testData")) return "INVALID_TEST_DATA";
    if (p === "count") return "INVALID_COUNT";
  }
  return "INVALID_INPUT";
}

router.get("/tasks/:taskId/test-data", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    logger.debug("GET test-data", { requestId: req.requestId, taskId, userId: req.userId, studentId: req.studentId });

    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    // Students must not access raw test data (it leaks judge inputs).
    if (req.userType === "STUDENT" || !!req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_TEST_DATA" });
    }

    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask) {
      return res.status(404).json({ message: "TASK_NOT_FOUND", taskId });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }
    if (topicTask.topic.class?.teacher?.id !== req.userId && !isSystemAdmin) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const testData = await testDataRepo().find({
      where: { topicTask: { id: taskId } },
      order: { createdAt: "ASC" }
    });

    const list = testData;
    const includeExpectedOutput = true;

    res.json({
      testData: list.map(td => ({
        id: td.id,
        input: td.input,
        ...(includeExpectedOutput ? { expectedOutput: td.expectedOutput } : {}),
        points: td.points,
        ...(includeExpectedOutput ? { isHidden: td.isHidden === true } : {})
      }))
    });
  } catch (error: any) {
    logger.error("Error fetching test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/test-data", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_ADD_TEST_DATA" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic?.class?.teacher) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    if (topicTask.topic.class.teacher.id !== req.userId && !isSystemAdmin) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsed = addTestDataSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: messageForZodIssue(parsed.error) });
    }
    const { testData } = parsed.data;

    const createdTests = testData.map(td =>
      testDataRepo().create({
        topicTask: { id: taskId } as any,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points || 1,
        isHidden: td.isHidden === true
      })
    );

    await testDataRepo().save(createdTests);

    res.status(201).json({
      message: "TEST_DATA_ADDED",
      testData: createdTests.map(td => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points,
        isHidden: td.isHidden === true
      }))
    });
  } catch (error: any) {
    logger.error("Error adding test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/tasks/:taskId/test-data/generate", authRequired, generateTestDataLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_GENERATE_TEST_DATA" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic?.class?.teacher) {
      return res.status(404).json({ message: "TASK_NOT_FOUND", taskId });
    }

    if (topicTask.topic.class.teacher.id !== req.userId && !isSystemAdmin) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: messageForZodIssue(parsed.error) });
    }
    const testCount = parsed.data.count ?? 5;

    const safeTaskDescription =
      String(topicTask.description || "").trim() ||
      String(topicTask.template || "").trim() ||
      `Завдання: ${topicTask.title}`;

    const aiStartedAt = Date.now();
    const testDataResult = await safeAICall(
      "generateTestData",
      {
        taskDescription: safeTaskDescription,
        taskTitle: topicTask.title,
        lang: topicTask.topic.class.language,
        count: testCount,
        userId: req.userId
      },
      {
        expectedCount: testCount,
        requestId: req.requestId,
        maxAttempts: 1,
        ...(EDU_TESTDATA_AI_DISABLE_DEADLINE ? {} : { totalTimeoutMs: EDU_TESTDATA_AI_BUDGET_MS })
      }
    );
    const aiElapsedMs = Date.now() - aiStartedAt;
    logger.info("[edu.test-data] generate AI completed", {
      requestId: req.requestId,
      taskId,
      userId: req.userId,
      success: testDataResult.success,
      elapsedMs: aiElapsedMs,
      budgetMs: EDU_TESTDATA_AI_DISABLE_DEADLINE ? null : EDU_TESTDATA_AI_BUDGET_MS,
      requestedCount: testCount
    });

    if (!testDataResult.success) {
      return res.status(testDataResult.error?.statusCode || 500).json({
        message: testDataResult.error?.message || "TEST_DATA_GENERATION_FAILED",
        error: testDataResult.error?.error,
        details: testDataResult.error?.details
      });
    }

    const testData = testDataResult.data;

    const createdTests = testData.map((td: { input: string; output: string }) =>
      testDataRepo().create({
        topicTask: { id: taskId } as any,
        input: td.input || "",
        expectedOutput: td.output || "",
        points: 1,
        isHidden: false
      })
    );

    await testDataRepo().save(createdTests);

    res.json({
      count: createdTests.length,
      testData: createdTests.map((td: TestData) => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points,
        isHidden: td.isHidden === true
      }))
    });
  } catch (error: any) {
    logger.error("Error generating test data", { requestId: req.requestId, err: error });
    res.status(500).json({
      message: "TEST_DATA_GENERATION_FAILED",
      error: error?.message,
      name: error?.name,
      code: error?.code
    });
  }
});

router.put("/tasks/:taskId/test-data/:testDataId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const testDataId = parseInt(req.params.testDataId, 10);
    if (isNaN(taskId) || isNaN(testDataId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic?.class?.teacher) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || (user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN")) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_UPDATE_TEST_DATA" });
    }

    if (topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const testData = await testDataRepo().findOne({ where: { id: testDataId, topicTask: { id: taskId } } });
    if (!testData) {
      return res.status(404).json({ message: "TEST_DATA_NOT_FOUND" });
    }

    const parsed = updateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: messageForZodIssue(parsed.error) });
    }

    const { input, expectedOutput, points, isHidden } = parsed.data;

    if (input !== undefined) testData.input = input;
    if (expectedOutput !== undefined) testData.expectedOutput = expectedOutput;
    if (points !== undefined) testData.points = points;
    if (isHidden !== undefined) testData.isHidden = isHidden === true;

    await testDataRepo().save(testData);

    res.json({
      message: "TEST_DATA_UPDATED",
      testData: {
        id: testData.id,
        input: testData.input,
        expectedOutput: testData.expectedOutput,
        points: testData.points,
        isHidden: testData.isHidden === true
      }
    });
  } catch (error: any) {
    logger.error("Error updating test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/tasks/:taskId/test-data/:testDataId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const testDataId = parseInt(req.params.testDataId, 10);
    if (isNaN(taskId) || isNaN(testDataId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const topicTask = await topicTaskRepo()
      .createQueryBuilder("topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topicTask.id = :taskId", { taskId })
      .getOne();

    if (!topicTask || !topicTask.topic?.class?.teacher) {
      return res.status(404).json({ message: "TASK_NOT_FOUND" });
    }

    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || (user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN")) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_DELETE_TEST_DATA" });
    }

    if (topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const testData = await testDataRepo().findOne({ where: { id: testDataId, topicTask: { id: taskId } } });
    if (!testData) {
      return res.status(404).json({ message: "TEST_DATA_NOT_FOUND" });
    }

    await testDataRepo().remove(testData);

    res.json({ message: "TEST_DATA_DELETED" });
  } catch (error: any) {
    logger.error("Error deleting test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
