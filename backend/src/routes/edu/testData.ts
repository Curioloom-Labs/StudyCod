import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { TopicTask } from "../../entities/TopicTask";
import { TestData } from "../../entities/TestData";
import { safeAICall, sendAIError } from "../../services/ai/safeAICall";
import { logger } from "../../utils/logger";
import { createRouteLimiter } from "../../middleware/routeRateLimit";
import { authorizeClassAction } from "../../services/edu/classAccess";
import type { Capability } from "../../services/edu/rbac";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);

/**
 * Authorize the caller (USER) against the class that owns a loaded topic-task,
 * via the central org/owner authorizer. Returns true if permitted.
 */
async function canActOnTopicTaskClass(
  req: AuthRequest,
  topicTask: { topic?: { class?: { id?: number } | null } | null } | null,
  capability: Capability
): Promise<boolean> {
  const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";
  const classId = topicTask?.topic?.class?.id;
  if (!classId) return isSystemAdmin;
  if (!req.userId) return false;
  const access = await authorizeClassAction(req.userId, classId, capability, { isSystemAdmin });
  return Boolean(access?.allowed);
}

function parseAIBudgetMs(envKey: string, fallbackMs: number, minMs = 8_000, maxMs = 55_000): number {
  const raw = Number(process.env[envKey]);
  const value = Number.isFinite(raw) ? Math.floor(raw) : fallbackMs;
  return Math.max(minMs, Math.min(maxMs, value));
}

const EDU_TESTDATA_AI_DISABLE_DEADLINE = String(process.env.EDU_TESTDATA_AI_DISABLE_DEADLINE || "").trim() === "1";
const EDU_TESTDATA_AI_BUDGET_MS = parseAIBudgetMs("EDU_TESTDATA_AI_BUDGET_MS", 25_000);

// AI-heavy endpoint: protect against bursts.
const generateTestDataLimiter = createRouteLimiter({ windowMs: 60 * 1000, limit: 5, message: "RATE_LIMIT" });
const TEST_DATA_PAGE_LIMIT_DEFAULT = 50;
const TEST_DATA_PAGE_LIMIT_MAX = 500;
type TestDataSourceValue = "MANUAL" | "AI_GENERATED" | "LIBRARY_IMPORTED";

function queryScalar(raw: unknown): unknown {
  return Array.isArray(raw) ? raw[0] : raw;
}

function normalizeSubtaskValue(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim();
  if (!normalized) return null;
  return normalized.slice(0, 64);
}

function normalizeTestDataSource(raw: unknown): TestDataSourceValue {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (normalized === "AI_GENERATED") return "AI_GENERATED";
  if (normalized === "LIBRARY_IMPORTED") return "LIBRARY_IMPORTED";
  return "MANUAL";
}

function parseTestDataSourceFilter(raw: unknown): TestDataSourceValue | null {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "MANUAL") return "MANUAL";
  if (normalized === "AI_GENERATED") return "AI_GENERATED";
  if (normalized === "LIBRARY_IMPORTED") return "LIBRARY_IMPORTED";
  return null;
}

function normalizeFingerprintText(raw: unknown): string {
  return String(raw ?? "").replace(/\r\n/g, "\n").trim();
}

function buildGeneratedTestFingerprint(input: unknown, expectedOutput: unknown): string {
  return `${normalizeFingerprintText(input)}\u241E${normalizeFingerprintText(expectedOutput)}`;
}

function parseBooleanQuery(raw: unknown): boolean {
  const value = queryScalar(raw);
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parsePreviewChars(raw: unknown, fallback = 600): number {
  const value = queryScalar(raw);
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(120, Math.min(4000, parsed));
}

const subtaskSchema = z.union([z.string().max(64), z.number().int().min(1).max(100000), z.null()]).optional();

// Keep limits aligned with judge-worker request constraints.
const testDataItemSchema = z.object({
  input: z.string().max(64 * 1024),
  expectedOutput: z.string().max(64 * 1024),
  points: z.number().int().min(1).max(1000).optional(),
  isHidden: z.boolean().optional(),
  subtask: subtaskSchema
});

const addTestDataSchema = z.object({
  testData: z.array(testDataItemSchema).min(1).max(5000)
});

const generateSchema = z.object({
  count: z.number().int().min(1).max(50).optional(),
  replaceGenerated: z.boolean().optional()
});

const updateSchema = z
  .object({
    input: z.string().max(64 * 1024).optional(),
    expectedOutput: z.string().max(64 * 1024).optional(),
    points: z.number().int().min(1).max(1000).optional(),
    isHidden: z.boolean().optional(),
    subtask: subtaskSchema
  })
  .strict();

function messageForZodIssue(err: z.ZodError): string {
  // Preserve existing message codes where they exist.
  for (const issue of err.issues) {
    const p = issue.path.join(".");
    if (p.startsWith("testData")) return "INVALID_TEST_DATA";
    if (p === "count") return "INVALID_COUNT";
    if (p === "subtask") return "INVALID_TEST_DATA";
  }
  return "INVALID_INPUT";
}

router.get("/tasks/:taskId/test-data", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const preview = parseBooleanQuery(req.query.preview);
    const previewChars = parsePreviewChars(req.query.previewChars);
    const rawLimit = queryScalar(req.query.limit);
    const rawOffset = queryScalar(req.query.offset);
    const hasLimitParam = rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim().length > 0;
    const hasOffsetParam = rawOffset !== undefined && rawOffset !== null && String(rawOffset).trim().length > 0;
    const hasPagination = hasLimitParam || hasOffsetParam;
    const limit = hasLimitParam
      ? Number.parseInt(String(rawLimit), 10)
      : TEST_DATA_PAGE_LIMIT_DEFAULT;
    const offset = hasOffsetParam
      ? Number.parseInt(String(rawOffset), 10)
      : 0;
    const rawSource = String(queryScalar(req.query.source) ?? "").trim();
    const sourceFilter = parseTestDataSourceFilter(rawSource);
    logger.debug("GET test-data", { requestId: req.requestId, taskId, userId: req.userId, studentId: req.studentId });

    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
    }

    if (hasPagination) {
      if (!Number.isFinite(limit) || limit <= 0) {
        return res.status(400).json({ message: "INVALID_LIMIT" });
      }
      if (!Number.isFinite(offset) || offset < 0) {
        return res.status(400).json({ message: "INVALID_OFFSET" });
      }
    }

    if (rawSource && !sourceFilter) {
      return res.status(400).json({ message: "INVALID_SOURCE_FILTER" });
    }

    const safeLimit = hasPagination ? Math.min(TEST_DATA_PAGE_LIMIT_MAX, Math.max(1, Math.trunc(limit))) : null;
    const safeOffset = hasPagination ? Math.max(0, Math.trunc(offset)) : null;

    // Students must not access raw test data (it leaks judge inputs).
    if (req.userType === "STUDENT" || !!req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_TEST_DATA" });
    }

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
    if (!(await canActOnTopicTaskClass(req, topicTask, "CLASS_VIEW"))) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const whereClauses: string[] = ["topic_task_id = ?"];
    const whereParams: Array<string | number> = [taskId];
    if (sourceFilter) {
      whereClauses.push("source = ?");
      whereParams.push(sourceFilter);
    }
    const whereSql = whereClauses.join(" AND ");

    let total: number | null = null;
    if (hasPagination) {
      const countRows = (await AppDataSource.query(
        `SELECT COUNT(*) AS total FROM test_data WHERE ${whereSql}`,
        whereParams
      )) as Array<{ total: number | string }>;
      total = Number(countRows?.[0]?.total ?? 0);
    }

    const paginationSql = hasPagination ? " LIMIT ? OFFSET ?" : "";

    if (preview) {
      const rows = (await AppDataSource.query(
        `SELECT
           id,
           SUBSTRING(input, 1, ?) AS input,
           SUBSTRING(expected_output, 1, ?) AS expectedOutput,
           points,
           is_hidden AS isHidden,
           source,
           subtask,
           CHAR_LENGTH(input) AS inputFullLength,
           CHAR_LENGTH(expected_output) AS expectedOutputFullLength
         FROM test_data
         WHERE ${whereSql}
         ORDER BY created_at ASC, id ASC${paginationSql}`,
        hasPagination
          ? [previewChars, previewChars, ...whereParams, safeLimit, safeOffset]
          : [previewChars, previewChars, ...whereParams]
      )) as Array<{
        id: number;
        input: string;
        expectedOutput: string;
        points: number;
        isHidden: number | boolean;
        source: string | null;
        subtask: string | null;
        inputFullLength: number;
        expectedOutputFullLength: number;
      }>;

      const mapped = rows.map(row => {
        const input = String(row.input ?? "");
        const expectedOutput = String(row.expectedOutput ?? "");
        const inputFullLength = Number(row.inputFullLength ?? input.length);
        const expectedOutputFullLength = Number(row.expectedOutputFullLength ?? expectedOutput.length);
        return {
          id: Number(row.id),
          input,
          expectedOutput,
          points: Number(row.points ?? 1),
          isHidden: row.isHidden === true || Number(row.isHidden) === 1,
          source: normalizeTestDataSource(row.source),
          subtask: normalizeSubtaskValue(row.subtask),
          isInputTruncated: inputFullLength > input.length,
          inputFullLength,
          isExpectedOutputTruncated: expectedOutputFullLength > expectedOutput.length,
          expectedOutputFullLength
        };
      });

      return res.json({
        testData: mapped,
        ...(hasPagination
          ? {
              pagination: {
                total,
                limit: safeLimit,
                offset: safeOffset,
                hasMore: Number(total ?? 0) > (safeOffset ?? 0) + mapped.length,
                nextOffset:
                  Number(total ?? 0) > (safeOffset ?? 0) + mapped.length
                    ? (safeOffset ?? 0) + mapped.length
                    : null
              }
            }
          : {})
      });
    }

    const rows = (await AppDataSource.query(
      `SELECT
         id,
         input,
         expected_output AS expectedOutput,
         points,
         is_hidden AS isHidden,
         source,
         subtask
       FROM test_data
       WHERE ${whereSql}
       ORDER BY created_at ASC, id ASC${paginationSql}`,
      hasPagination
        ? [...whereParams, safeLimit, safeOffset]
        : [...whereParams]
    )) as Array<{
      id: number;
      input: string;
      expectedOutput: string;
      points: number;
      isHidden: number | boolean;
      source: string | null;
      subtask: string | null;
    }>;

    const mapped = rows.map(td => ({
      id: Number(td.id),
      input: String(td.input ?? ""),
      expectedOutput: String(td.expectedOutput ?? ""),
      points: Number(td.points ?? 1),
      isHidden: td.isHidden === true || Number(td.isHidden) === 1,
      source: normalizeTestDataSource(td.source),
      subtask: normalizeSubtaskValue(td.subtask)
    }));

    res.json({
      testData: mapped,
      ...(hasPagination
        ? {
            pagination: {
              total,
              limit: safeLimit,
              offset: safeOffset,
              hasMore: Number(total ?? 0) > (safeOffset ?? 0) + mapped.length,
              nextOffset:
                Number(total ?? 0) > (safeOffset ?? 0) + mapped.length
                  ? (safeOffset ?? 0) + mapped.length
                  : null
            }
          }
        : {})
    });
  } catch (error: any) {
    logger.error("Error fetching test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.get("/tasks/:taskId/test-data/:testDataId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const testDataId = parseInt(req.params.testDataId, 10);
    if (isNaN(taskId) || isNaN(testDataId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    if (req.userType === "STUDENT" || !!req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_TEST_DATA" });
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

    if (!topicTask) {
      return res.status(404).json({ message: "TASK_NOT_FOUND", taskId });
    }

    if (!(await canActOnTopicTaskClass(req, topicTask, "CLASS_VIEW"))) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const testData = await testDataRepo().findOne({ where: { id: testDataId, topicTask: { id: taskId } } });
    if (!testData) {
      return res.status(404).json({ message: "TEST_DATA_NOT_FOUND" });
    }

    res.json({
      testData: {
        id: testData.id,
        input: testData.input,
        expectedOutput: testData.expectedOutput,
        points: testData.points,
        isHidden: testData.isHidden === true,
        source: normalizeTestDataSource((testData as any).source),
        subtask: normalizeSubtaskValue((testData as any).subtask)
      }
    });
  } catch (error: any) {
    logger.error("Error fetching test data item", { requestId: req.requestId, err: error });
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

    if (!(await canActOnTopicTaskClass(req, topicTask, "CONTENT_AUTHOR"))) {
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
        isHidden: td.isHidden === true,
        source: "MANUAL",
        subtask: normalizeSubtaskValue((td as any).subtask)
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
        isHidden: td.isHidden === true,
        source: normalizeTestDataSource((td as any).source),
        subtask: normalizeSubtaskValue((td as any).subtask)
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

    if (!(await canActOnTopicTaskClass(req, topicTask, "CONTENT_AUTHOR"))) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const parsed = generateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: messageForZodIssue(parsed.error) });
    }
    const testCount = parsed.data.count ?? 5;
    const replaceGenerated = parsed.data.replaceGenerated ?? true;

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
      sendAIError(res, testDataResult.error);
      return;
    }

    const testData = Array.isArray(testDataResult.data) ? testDataResult.data : [];

    let replacedGeneratedCount = 0;
    if (replaceGenerated) {
      const deleteResult = await AppDataSource.query(
        "DELETE FROM test_data WHERE topic_task_id = ? AND source = 'AI_GENERATED'",
        [taskId]
      );
      replacedGeneratedCount = Number((deleteResult as any)?.affectedRows ?? 0);
    }

    const existingRows = (await AppDataSource.query(
      `SELECT input, expected_output AS expectedOutput
       FROM test_data
       WHERE topic_task_id = ?
         AND points = 1
         AND is_hidden = 0
         AND (subtask IS NULL OR subtask = '')`,
      [taskId]
    )) as Array<{ input: string; expectedOutput: string }>;

    const knownFingerprints = new Set<string>(
      existingRows.map(row => buildGeneratedTestFingerprint(row.input, row.expectedOutput))
    );

    const uniqueGenerated: Array<{ input: string; expectedOutput: string }> = [];
    let skippedDuplicates = 0;
    for (const td of testData as Array<{ input: string; output: string }>) {
      const input = String(td?.input ?? "");
      const expectedOutput = String(td?.output ?? "");
      const fingerprint = buildGeneratedTestFingerprint(input, expectedOutput);
      if (knownFingerprints.has(fingerprint)) {
        skippedDuplicates += 1;
        continue;
      }
      knownFingerprints.add(fingerprint);
      uniqueGenerated.push({ input, expectedOutput });
    }

    const createdTests = uniqueGenerated.map((td) =>
      testDataRepo().create({
        topicTask: { id: taskId } as any,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: 1,
        isHidden: false,
        source: "AI_GENERATED",
        subtask: null
      })
    );

    await testDataRepo().save(createdTests);

    res.json({
      count: createdTests.length,
      skippedDuplicates,
      replacedGeneratedCount,
      testData: createdTests.map((td: TestData) => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points,
        isHidden: td.isHidden === true,
        source: normalizeTestDataSource((td as any).source),
        subtask: normalizeSubtaskValue((td as any).subtask)
      }))
    });
  } catch (error: any) {
    logger.error("Error generating test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "TEST_DATA_GENERATION_FAILED" });
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

    if (!(await canActOnTopicTaskClass(req, topicTask, "CONTENT_AUTHOR"))) {
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

    const { input, expectedOutput, points, isHidden, subtask } = parsed.data;

    if (input !== undefined) testData.input = input;
    if (expectedOutput !== undefined) testData.expectedOutput = expectedOutput;
    if (points !== undefined) testData.points = points;
    if (isHidden !== undefined) testData.isHidden = isHidden === true;
    if (subtask !== undefined) (testData as any).subtask = normalizeSubtaskValue(subtask);

    await testDataRepo().save(testData);

    res.json({
      message: "TEST_DATA_UPDATED",
      testData: {
        id: testData.id,
        input: testData.input,
        expectedOutput: testData.expectedOutput,
        points: testData.points,
        isHidden: testData.isHidden === true,
        source: normalizeTestDataSource((testData as any).source),
        subtask: normalizeSubtaskValue((testData as any).subtask)
      }
    });
  } catch (error: any) {
    logger.error("Error updating test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

router.delete("/tasks/:taskId/test-data/generated", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_TASK_ID" });
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

    if (!(await canActOnTopicTaskClass(req, topicTask, "CONTENT_AUTHOR"))) {
      return res.status(403).json({ message: "ACCESS_DENIED" });
    }

    const deleteResult = await AppDataSource.query(
      "DELETE FROM test_data WHERE topic_task_id = ? AND source = 'AI_GENERATED'",
      [taskId]
    );
    const deleted = Number((deleteResult as any)?.affectedRows ?? 0);

    res.json({
      message: "GENERATED_TEST_DATA_DELETED",
      deleted
    });
  } catch (error: any) {
    logger.error("Error deleting generated test data", { requestId: req.requestId, err: error });
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

    if (!(await canActOnTopicTaskClass(req, topicTask, "CONTENT_AUTHOR"))) {
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
