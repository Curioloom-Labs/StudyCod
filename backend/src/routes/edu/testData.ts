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
import { env } from "../../env";
import { allocateSubtaskTestCounts, parseTaskSubtasks } from "../../services/edu/taskSubtasks";
import { resolveTestDataIoType } from "../../services/llm/TaskContractReview";
import { randomUUID } from "crypto";
import { createExecutionContext } from "../../../../shared/ai/prompts";
import { getActivePromptBundleVersion, runWithAIExecutionContext } from "../../services/llm/promptExecution";
import { normalizePythonTaskAssets, parseTkinterEvents } from "../../services/edu/pythonTaskRuntime";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);
export const eduTestDataGenerationDependencies = { safeAICall };

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
  const raw = Number((env as unknown as Record<string, unknown>)[envKey]);
  const value = Number.isFinite(raw) ? Math.floor(raw) : fallbackMs;
  return Math.max(minMs, Math.min(maxMs, value));
}

const EDU_TESTDATA_AI_DISABLE_DEADLINE = String(env.EDU_TESTDATA_AI_DISABLE_DEADLINE || "").trim() === "1";
const EDU_TESTDATA_AI_BUDGET_MS = parseAIBudgetMs("EDU_TESTDATA_AI_BUDGET_MS", 55_000);

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

function normalizeSubtaskScoringMode(raw: unknown): "ABSOLUTE" | "PARTIAL" {
  return String(raw ?? "").trim().toUpperCase() === "PARTIAL" ? "PARTIAL" : "ABSOLUTE";
}

function normalizeSubtaskWeightPercent(raw: unknown): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

async function synchronizeSubtaskScoringModes(taskId: number, tests: TestData[]): Promise<void> {
  const settingsBySubtask = new Map<string, { mode: "ABSOLUTE" | "PARTIAL"; weight: number | null }>();
  for (const test of tests) {
    const subtask = normalizeSubtaskValue(test.subtask);
    if (!subtask) continue;
    const current = settingsBySubtask.get(subtask);
    const weight = normalizeSubtaskWeightPercent(test.subtaskWeightPercent);
    settingsBySubtask.set(subtask, {
      mode: normalizeSubtaskScoringMode(test.subtaskScoringMode),
      weight: weight ?? current?.weight ?? null,
    });
  }
  for (const [subtask, settings] of settingsBySubtask) {
    const groupTests = await testDataRepo().find({ where: { topicTask: { id: taskId }, subtask } });
    const weight = settings.weight ?? groupTests.map(test => normalizeSubtaskWeightPercent(test.subtaskWeightPercent)).find(value => value !== null) ?? null;
    groupTests.forEach(test => {
      test.subtaskScoringMode = settings.mode;
      if (weight !== null) test.subtaskWeightPercent = weight;
    });
    await testDataRepo().save(groupTests);
  }
}

function normalizeTestDataSource(raw: unknown): TestDataSourceValue {
  const normalized = String(raw ?? "").trim().toUpperCase();
  if (normalized === "AI_GENERATED") return "AI_GENERATED";
  if (normalized === "LIBRARY_IMPORTED") return "LIBRARY_IMPORTED";
  return "MANUAL";
}

function normalizeTestImageUrls(raw: unknown): string[] {
  let value = raw;
  if (typeof value === "string") {
    try { value = JSON.parse(value) as unknown; } catch { return []; }
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string" && /^\/api\/edu\/statement-images\/[A-Za-z0-9._-]+$/.test(url))
    .slice(0, 8);
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
const testImageUrlsSchema = z.array(z.string().max(512).regex(/^\/api\/edu\/statement-images\/[A-Za-z0-9._-]+$/)).max(8).optional();

// Keep limits aligned with judge-worker request constraints.
const testDataItemSchema = z.object({
  input: z.string().max(64 * 1024),
  expectedOutput: z.string().max(64 * 1024),
  points: z.number().int().min(1).max(1000).optional(),
  isHidden: z.boolean().optional(),
  subtask: subtaskSchema,
  subtaskScoringMode: z.enum(["ABSOLUTE", "PARTIAL"]).optional(),
  subtaskWeightPercent: z.number().int().min(1).max(100).nullable().optional(),
  imageUrls: testImageUrlsSchema,
  assets: z.array(z.object({ path: z.string().min(1).max(180), dataBase64: z.string().min(4).max(1_400_000) }).strict()).max(8).optional(),
}).superRefine((test, context) => {
  if (!test.assets?.length) return;
  try { normalizePythonTaskAssets(test.assets); }
  catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "INVALID_ASSETS", path: ["assets"] }); }
});

const addTestDataSchema = z.object({
  testData: z.array(testDataItemSchema).min(1).max(5000)
}).superRefine((body, context) => {
  const encodedBytes = body.testData.reduce((sum, test) => sum + (test.assets ?? []).reduce((assetSum, asset) => assetSum + asset.dataBase64.length, 0), 0);
  if (encodedBytes > 12_000_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "ASSETS_TOO_LARGE", path: ["testData"] });
});

const generateSchema = z.object({
  count: z.number().int().min(1).max(50).optional(),
  replaceGenerated: z.boolean().optional(),
  requiredCases: z.array(z.string().max(240)).max(24).optional(),
  points: z.number().int().min(1).max(1000).optional(),
  isHidden: z.boolean().optional(),
  subtask: subtaskSchema,
  subtaskScoringMode: z.enum(["ABSOLUTE", "PARTIAL"]).optional(),
  subtaskWeightPercent: z.number().int().min(1).max(100).nullable().optional(),
  groupByTaskSubtasks: z.boolean().optional(),
});

const updateSchema = z
  .object({
    input: z.string().max(64 * 1024).optional(),
    expectedOutput: z.string().max(64 * 1024).optional(),
    points: z.number().int().min(1).max(1000).optional(),
    isHidden: z.boolean().optional(),
    subtask: subtaskSchema,
    subtaskScoringMode: z.enum(["ABSOLUTE", "PARTIAL"]).optional(),
    subtaskWeightPercent: z.number().int().min(1).max(100).nullable().optional(),
    imageUrls: testImageUrlsSchema,
    assets: z.array(z.object({ path: z.string().min(1).max(180), dataBase64: z.string().min(4).max(1_400_000) }).strict()).max(8).optional(),
  })
  .strict().superRefine((update, context) => {
    if (!update.assets?.length) return;
    try { normalizePythonTaskAssets(update.assets); }
    catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "INVALID_ASSETS", path: ["assets"] }); }
  });

function parseStoredAssets(raw: unknown): Array<{ path: string; dataBase64: string }> {
  if (Array.isArray(raw)) {
    try { return normalizePythonTaskAssets(raw); } catch { return []; }
  }
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizePythonTaskAssets(parsed) : [];
  } catch { return []; }
}

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
           subtask_scoring_mode AS subtaskScoringMode,
           subtask_weight_percent AS subtaskWeightPercent,
           image_urls AS imageUrls,
           assets,
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
        subtaskScoringMode: string | null;
        subtaskWeightPercent: number | null;
        imageUrls: string[] | string | null;
        assets: string | null;
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
          subtaskScoringMode: normalizeSubtaskScoringMode(row.subtaskScoringMode),
          subtaskWeightPercent: normalizeSubtaskWeightPercent(row.subtaskWeightPercent),
          imageUrls: normalizeTestImageUrls(row.imageUrls),
          assetPaths: parseStoredAssets(row.assets).map(asset => asset.path),
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
         subtask,
         subtask_scoring_mode AS subtaskScoringMode,
         subtask_weight_percent AS subtaskWeightPercent,
         image_urls AS imageUrls,
         assets
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
      subtaskScoringMode: string | null;
      subtaskWeightPercent: number | null;
      imageUrls: string[] | string | null;
      assets: string | null;
    }>;

    const mapped = rows.map(td => ({
      id: Number(td.id),
      input: String(td.input ?? ""),
      expectedOutput: String(td.expectedOutput ?? ""),
      points: Number(td.points ?? 1),
      isHidden: td.isHidden === true || Number(td.isHidden) === 1,
      source: normalizeTestDataSource(td.source),
      subtask: normalizeSubtaskValue(td.subtask),
      subtaskScoringMode: normalizeSubtaskScoringMode(td.subtaskScoringMode),
      subtaskWeightPercent: normalizeSubtaskWeightPercent(td.subtaskWeightPercent),
      imageUrls: normalizeTestImageUrls(td.imageUrls),
      assetPaths: parseStoredAssets(td.assets).map(asset => asset.path)
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
  } catch (error: unknown) {
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
        source: normalizeTestDataSource(testData.source),
        subtask: normalizeSubtaskValue(testData.subtask),
        subtaskScoringMode: normalizeSubtaskScoringMode(testData.subtaskScoringMode),
        subtaskWeightPercent: normalizeSubtaskWeightPercent(testData.subtaskWeightPercent),
        imageUrls: normalizeTestImageUrls(testData.imageUrls),
        assets: testData.assets ?? []
      }
    });
  } catch (error: unknown) {
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
    if (topicTask.pythonRuntimeProfile === "STANDARD" && testData.some(test => test.assets?.length)) {
      return res.status(400).json({ message: "IMAGE_FIXTURES_REQUIRE_PYTHON_LIBRARIES" });
    }
    if (topicTask.pythonRuntimeProfile === "TKINTER") {
      try { testData.forEach(test => parseTkinterEvents(test.input)); }
      catch (error) { const record = error as { statusCode?: number; message?: string }; return res.status(record.statusCode || 400).json({ message: record.message || "INVALID_TKINTER_EVENTS" }); }
    }

    const createdTests = testData.map(td =>
      testDataRepo().create({
        topicTask: { id: taskId },
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points || 1,
        isHidden: td.isHidden === true,
        kind: td.isHidden === true ? "JUDGE" : "SAMPLE",
        source: "MANUAL",
        subtask: normalizeSubtaskValue(td.subtask),
        subtaskScoringMode: normalizeSubtaskScoringMode(td.subtaskScoringMode),
        subtaskWeightPercent: normalizeSubtaskWeightPercent(td.subtaskWeightPercent),
        imageUrls: normalizeTestImageUrls(td.imageUrls),
        assets: td.assets?.length ? normalizePythonTaskAssets(td.assets) : null
      })
    );

    await testDataRepo().save(createdTests);
    await synchronizeSubtaskScoringModes(taskId, createdTests);

    res.status(201).json({
      message: "TEST_DATA_ADDED",
      testData: createdTests.map(td => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points,
        isHidden: td.isHidden === true,
        source: normalizeTestDataSource(td.source),
        subtask: normalizeSubtaskValue(td.subtask),
        subtaskScoringMode: normalizeSubtaskScoringMode(td.subtaskScoringMode),
        subtaskWeightPercent: normalizeSubtaskWeightPercent(td.subtaskWeightPercent),
        imageUrls: normalizeTestImageUrls(td.imageUrls),
        assetPaths: td.assets?.map(asset => asset.path) ?? []
      }))
    });
  } catch (error: unknown) {
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
    if (topicTask.pythonRuntimeProfile === "TKINTER") {
      return res.status(409).json({ message: "TKINTER_TESTS_MUST_BE_CONFIGURED_MANUALLY" });
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
    const testPoints = parsed.data.points ?? 1;
    const testIsHidden = parsed.data.isHidden ?? false;
    const testSubtask = normalizeSubtaskValue(parsed.data.subtask);
    const testSubtaskScoringMode = normalizeSubtaskScoringMode(parsed.data.subtaskScoringMode);

    const safeTaskDescription =
      String(topicTask.description || "").trim() ||
      String(topicTask.template || "").trim() ||
      `Завдання: ${topicTask.title}`;

    const english = String(req.headers["x-ui-language"] ?? req.headers["accept-language"] ?? "").toLowerCase().startsWith("en");
    const buildGenerationPlan = (description: string) => {
      let taskUsesInput = false;
      try { taskUsesInput = resolveTestDataIoType(description) === "STDIN_STDOUT"; } catch { /* The contract validator returns the actionable error below. */ }
      const automaticSubtasks = !testSubtask && parsed.data.groupByTaskSubtasks !== false && taskUsesInput
        ? parseTaskSubtasks(description)
        : [];
      const automaticSubtaskCounts = automaticSubtasks.length
        ? allocateSubtaskTestCounts(testCount, automaticSubtasks)
        : null;
      const subtaskPlan = automaticSubtaskCounts
        ? automaticSubtasks.flatMap((subtask, index) => Array.from({ length: automaticSubtaskCounts[index] }, () => subtask))
        : [];
      const subtaskCoverage = automaticSubtasks.map((subtask, index) =>
        `${subtask.name} (${subtask.weightPercent}%, ${automaticSubtaskCounts?.[index] ?? 0} consecutive tests): ${subtask.description}`
      );
      const groupOrderInstruction = automaticSubtasks.length
        ? `${english ? "SUBTASK ORDER: Return each subtask's cases consecutively in the exact order listed below. Each group must contain exactly the stated number of cases; do not add labels to stdin/stdout." : "ПОРЯДОК ПІДЗАДАЧ: поверни тести кожної підзадачі підряд у наведеному порядку. Кожна група має містити рівно вказану кількість тестів; не додавай назви до stdin/stdout."}`
        : null;
      return {
        automaticSubtasks,
        automaticSubtaskCounts,
        subtaskPlan,
        tooFewTests: automaticSubtasks.length > 0 && !automaticSubtaskCounts,
        requiredCases: [
          ...(groupOrderInstruction ? [groupOrderInstruction] : []),
          ...subtaskCoverage,
          ...(parsed.data.requiredCases ?? []).slice(0, Math.max(0, 24 - (groupOrderInstruction ? 1 : 0) - subtaskCoverage.length)),
        ],
      };
    };
    const subtaskCountError = (count: number) => res.status(422).json({
      code: "EDU_SUBTASK_TEST_COUNT_TOO_LOW",
      message: english
        ? `Generate at least ${count} tests so every subtask gets coverage, or turn off subtask grouping.`
        : `Згенеруй щонайменше ${count} тестів, щоб покрити кожну підзадачу, або вимкни групування тестів за підзадачами.`,
    });
    let generationPlan = buildGenerationPlan(safeTaskDescription);
    if (generationPlan.tooFewTests) return subtaskCountError(generationPlan.automaticSubtasks.length);

    const authoredTests = await AppDataSource.query(
      "SELECT input, expected_output AS output FROM test_data WHERE topic_task_id = ? AND source <> 'AI_GENERATED' ORDER BY id LIMIT 40",
      [taskId],
    ) as Array<{ input: string; output: string }>;
    const runTestGeneration = (description: string, requiredCases: string[]) => eduTestDataGenerationDependencies.safeAICall(
      "generateTestData",
      {
        taskDescription: description,
        taskTitle: topicTask.title,
        lang: topicTask.topic.language,
        count: testCount,
        allowEmptyOutput: true,
        referenceExamplesAreAuthoritative: true,
        pythonRuntimeProfile: topicTask.pythonRuntimeProfile || "STANDARD",
        publicExamples: authoredTests.map(test => ({ input: String(test.input), output: String(test.output) })),
        requiredCases,
        userId: req.userId
      },
      {
        expectedCount: testCount,
        requestId: req.requestId,
        maxAttempts: 2,
        ...(EDU_TESTDATA_AI_DISABLE_DEADLINE ? {} : { totalTimeoutMs: EDU_TESTDATA_AI_BUDGET_MS })
      }
    );
    const aiStartedAt = Date.now();
    let activeDescription = safeTaskDescription;
    let conditionRepaired = false;
    let repairFailure: string | null = null;
    let testDataResult = await runWithAIExecutionContext(createExecutionContext('task.generated-tests', {
      traceId: req.requestId || `trace-${randomUUID()}`,
      deadlineAt: Date.now() + (EDU_TESTDATA_AI_DISABLE_DEADLINE ? 120_000 : EDU_TESTDATA_AI_BUDGET_MS),
      retryBudget: { remaining: 2 },
      promptVersion: getActivePromptBundleVersion(),
    }), async () => {
      let result = await runTestGeneration(activeDescription, generationPlan.requiredCases);
      const finding = result.success ? "" : String(result.error.details?.validationError ?? result.error.error ?? "");
      const brokenContract = /TASK_CONTRACT_REVIEW_FAILED\[(statement|publicExamples)\]/.test(finding);
      if (!brokenContract || !String(topicTask.description ?? "").trim()) return result;

      const issue = finding
        .replace(/^TASK_CONTRACT_REVIEW_FAILED\[(?:statement|publicExamples)\]:\s*/i, "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 600)
        .trim();
      const repair = await eduTestDataGenerationDependencies.safeAICall("generateTaskCondition", {
        topicTitle: topicTask.topic.title,
        taskTitle: topicTask.title,
        taskType: topicTask.type === "CONTROL" ? "CONTROL" : "PRACTICE",
        language: topicTask.topic.language,
        responseLanguage: english ? "en" : "uk",
        existingDescription: activeDescription,
        validationFeedback: issue,
        includeSubtasks: parseTaskSubtasks(activeDescription).length > 0,
        pythonRuntimeProfile: topicTask.pythonRuntimeProfile || "STANDARD",
        userId: req.userId,
        topicId: topicTask.topic.id,
      }, {
        language: english ? "en" : "uk",
        requestId: req.requestId,
        maxAttempts: 2,
        ...(EDU_TESTDATA_AI_DISABLE_DEADLINE ? {} : { totalTimeoutMs: EDU_TESTDATA_AI_BUDGET_MS }),
      });
      if (!repair.success || typeof repair.data?.description !== "string" || !repair.data.description.trim()) {
        repairFailure = repair.success ? "AI returned an empty repaired condition." : repair.error.error || repair.error.message;
        return result;
      }

      const repairedDescription = repair.data.description.trim();
      const repairedPlan = buildGenerationPlan(repairedDescription);
      if (repairedPlan.tooFewTests) {
        generationPlan = repairedPlan;
        repairFailure = "The repaired condition has more subtasks than the selected test count can cover.";
        return result;
      }
      activeDescription = repairedDescription;
      generationPlan = repairedPlan;
      result = await runTestGeneration(activeDescription, generationPlan.requiredCases);
      if (result.success) conditionRepaired = true;
      else repairFailure = String(result.error.details?.validationError ?? result.error.error ?? result.error.message);
      return result;
    });
    const aiElapsedMs = Date.now() - aiStartedAt;
    logger.info("[edu.test-data] generate AI completed", {
      requestId: req.requestId,
      taskId,
      userId: req.userId,
      success: testDataResult.success,
      elapsedMs: aiElapsedMs,
      budgetMs: EDU_TESTDATA_AI_DISABLE_DEADLINE ? null : EDU_TESTDATA_AI_BUDGET_MS,
      requestedCount: testCount,
      conditionRepaired,
    });

    if (generationPlan.tooFewTests) return subtaskCountError(generationPlan.automaticSubtasks.length);
    if (repairFailure) {
      return res.status(422).json({
        code: "EDU_TASK_CONDITION_REPAIR_FAILED",
        message: english
          ? "The examples conflict with the task rules. Automatic repair could not be verified, so no tests were saved. Please regenerate the condition or correct its examples."
          : "Приклади суперечать правилам задачі. Автоматичне виправлення не пройшло перевірку, тому тести не збережено. Перегенеруй умову або виправ приклади.",
      });
    }

    if (!testDataResult.success) {
      const error = testDataResult.error;
      const finding = String(error.details?.validationError ?? error.error ?? "");
      if (/TASK_CONTRACT_REVIEW_FAILED\[(statement|publicExamples)\]/.test(finding)) {
        const issue = finding
          .replace(/^TASK_CONTRACT_REVIEW_FAILED\[(?:statement|publicExamples)\]:\s*/i, "")
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .replace(/\s+/g, " ")
          .slice(0, 300)
          .trim();
        return res.status(422).json({
          code: conditionRepaired ? "EDU_TASK_CONDITION_REPAIR_UNVERIFIED" : "EDU_TASK_CONTRACT_INVALID",
          message: english
            ? `${conditionRepaired ? "The condition was repaired, but the second validation still found a conflict" : "AI could not safely repair the conflicting condition"}${issue ? `: ${issue}` : "."} No tests were saved.`
            : `${conditionRepaired ? "Умову виправлено, але повторна перевірка ще знайшла суперечність" : "ШІ не зміг безпечно виправити суперечність в умові"}${issue ? `: ${issue}` : "."} Тести не збережено.`,
        });
      }
      if (/Invalid response structure/.test(error.message)) {
        return res.status(503).json({
          code: "EDU_TEST_GENERATION_FAILED",
          message: english
            ? "AI could not prepare valid tests after retrying. Please try generating them again."
            : "AI не зміг підготувати коректні тести після повторної спроби. Спробуй згенерувати їх ще раз.",
        });
      }
      sendAIError(res, testDataResult.error);
      return;
    }

    const testData = Array.isArray(testDataResult.data) ? testDataResult.data : [];

    if (conditionRepaired) {
      const updateResult = await topicTaskRepo().update(
        { id: taskId, description: topicTask.description },
        { description: activeDescription },
      );
      if (updateResult.affected !== 1) {
        return res.status(409).json({
          code: "EDU_TASK_CHANGED_DURING_REPAIR",
          message: english
            ? "The task changed while AI was repairing it. No generated tests were saved; reload the task and try again."
            : "Поки ШІ виправляв умову, задачу змінили. Тести не збережено; онови задачу й повтори дію.",
        });
      }
      topicTask.description = activeDescription;
    }

    let replacedGeneratedCount = 0;
    if (replaceGenerated) {
      const deleteResult = await AppDataSource.query(
        "DELETE FROM test_data WHERE topic_task_id = ? AND source = 'AI_GENERATED'",
        [taskId]
      );
      replacedGeneratedCount = Number((deleteResult as { affectedRows?: number })?.affectedRows ?? 0);
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

    const uniqueGenerated: Array<{ input: string; expectedOutput: string; subtask: string | null; subtaskWeightPercent: number | null }> = [];
    let skippedDuplicates = 0;
    for (const [index, td] of (testData as Array<{ input: string; output: string }>).entries()) {
      const input = String(td?.input ?? "");
      const expectedOutput = String(td?.output ?? "");
      const fingerprint = buildGeneratedTestFingerprint(input, expectedOutput);
      if (knownFingerprints.has(fingerprint)) {
        skippedDuplicates += 1;
        continue;
      }
      knownFingerprints.add(fingerprint);
      const assignedSubtask = generationPlan.automaticSubtasks.length
        ? generationPlan.subtaskPlan[index]
        : null;
      uniqueGenerated.push({
        input,
        expectedOutput,
        subtask: assignedSubtask?.name ?? testSubtask,
        subtaskWeightPercent: assignedSubtask?.weightPercent ?? normalizeSubtaskWeightPercent(parsed.data.subtaskWeightPercent),
      });
    }

    const createdTests = uniqueGenerated.map((td) =>
      testDataRepo().create({
        topicTask: { id: taskId },
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: testPoints,
        isHidden: testIsHidden,
        source: "AI_GENERATED",
        subtask: td.subtask,
        subtaskScoringMode: testSubtaskScoringMode,
        subtaskWeightPercent: td.subtaskWeightPercent,
      })
    );

    await testDataRepo().save(createdTests);
    await synchronizeSubtaskScoringModes(taskId, createdTests);

    res.json({
      count: createdTests.length,
      skippedDuplicates,
      replacedGeneratedCount,
      conditionRepaired,
      ...(conditionRepaired ? { description: activeDescription } : {}),
      testData: createdTests.map((td: TestData) => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points,
        isHidden: td.isHidden === true,
        source: normalizeTestDataSource(td.source),
        subtask: normalizeSubtaskValue(td.subtask),
        subtaskScoringMode: normalizeSubtaskScoringMode(td.subtaskScoringMode),
        subtaskWeightPercent: normalizeSubtaskWeightPercent(td.subtaskWeightPercent),
        imageUrls: normalizeTestImageUrls(td.imageUrls)
      }))
    });
  } catch (error: unknown) {
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

    const { input, expectedOutput, points, isHidden, subtask, subtaskScoringMode, subtaskWeightPercent, imageUrls, assets } = parsed.data;

    if (topicTask.pythonRuntimeProfile === "TKINTER" && input !== undefined) {
      try { parseTkinterEvents(input); }
      catch (error) { const record = error as { statusCode?: number; message?: string }; return res.status(record.statusCode || 400).json({ message: record.message || "INVALID_TKINTER_EVENTS" }); }
    }

    if (input !== undefined) testData.input = input;
    if (expectedOutput !== undefined) testData.expectedOutput = expectedOutput;
    if (points !== undefined) testData.points = points;
    if (isHidden !== undefined) testData.isHidden = isHidden === true;
    if (subtask !== undefined) testData.subtask = normalizeSubtaskValue(subtask);
    if (subtaskScoringMode !== undefined) testData.subtaskScoringMode = subtaskScoringMode;
    if (subtaskWeightPercent !== undefined) testData.subtaskWeightPercent = normalizeSubtaskWeightPercent(subtaskWeightPercent);
    if (imageUrls !== undefined) testData.imageUrls = normalizeTestImageUrls(imageUrls);
    if (assets !== undefined) {
      if (assets.length && topicTask.pythonRuntimeProfile === "STANDARD") return res.status(400).json({ message: "IMAGE_FIXTURES_REQUIRE_PYTHON_LIBRARIES" });
      testData.assets = assets.length ? normalizePythonTaskAssets(assets) : null;
    }

    await testDataRepo().save(testData);
    if (subtaskScoringMode !== undefined || subtaskWeightPercent !== undefined) {
      await synchronizeSubtaskScoringModes(taskId, [testData]);
    }

    res.json({
      message: "TEST_DATA_UPDATED",
      testData: {
        id: testData.id,
        input: testData.input,
        expectedOutput: testData.expectedOutput,
        points: testData.points,
        isHidden: testData.isHidden === true,
        source: normalizeTestDataSource(testData.source),
        subtask: normalizeSubtaskValue(testData.subtask),
        subtaskScoringMode: normalizeSubtaskScoringMode(testData.subtaskScoringMode),
        subtaskWeightPercent: normalizeSubtaskWeightPercent(testData.subtaskWeightPercent),
        imageUrls: normalizeTestImageUrls(testData.imageUrls),
        assets: testData.assets ?? []
      }
    });
  } catch (error: unknown) {
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
    const deleted = Number((deleteResult as { affectedRows?: number })?.affectedRows ?? 0);

    res.json({
      message: "GENERATED_TEST_DATA_DELETED",
      deleted
    });
  } catch (error: unknown) {
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
  } catch (error: unknown) {
    logger.error("Error deleting test data", { requestId: req.requestId, err: error });
    res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
