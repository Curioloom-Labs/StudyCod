import { createHash } from "crypto";
import { type EntityManager } from "typeorm";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { EduTask } from "../../entities/EduTask";
import { EduLesson } from "../../entities/EduLesson";
import { EduGrade } from "../../entities/EduGrade";
import { TestData } from "../../entities/TestData";
import { LessonAttempt } from "../../entities/LessonAttempt";
import type { JudgeResponse } from "../judgeWorker/types";
import { normalizePythonTaskAssets } from "./pythonTaskRuntime";

const pythonAssetSchema = z.object({
  path: z.string().min(1).max(180),
  dataBase64: z.string().min(4).max(1_400_000),
}).strict();

export const courseTestSchema = z.object({
  input: z.string().max(65536), expectedOutput: z.string().max(65536),
  points: z.number().int().min(1).max(1000).default(1), isHidden: z.boolean().default(false),
  imageUrls: z.array(z.string().max(512).regex(/^\/api\/edu\/statement-images\/[A-Za-z0-9._-]+$/)).max(8).optional(),
  subtask: z.string().trim().max(64).nullable().optional(),
  subtaskScoringMode: z.enum(["ABSOLUTE", "PARTIAL"]).optional(),
  subtaskWeightPercent: z.number().int().min(1).max(100).nullable().optional(),
  assets: z.array(pythonAssetSchema).max(8).optional(),
}).strict().refine(test => Boolean(test.input.trim() || test.expectedOutput.trim() || test.assets?.length), "EMPTY_TEST")
  .superRefine((test, context) => {
    if (!test.assets?.length) return;
    try { normalizePythonTaskAssets(test.assets); }
    catch (error) { context.addIssue({ code: z.ZodIssueCode.custom, message: error instanceof Error ? error.message : "INVALID_ASSETS", path: ["assets"] }); }
  });
export const courseTestsSchema = z.array(courseTestSchema).max(50).superRefine((tests, context) => {
  const encodedBytes = tests.reduce((sum, test) => sum + (test.assets ?? []).reduce((assetSum, asset) => assetSum + asset.dataBase64.length, 0), 0);
  if (encodedBytes > 12_000_000) context.addIssue({ code: z.ZodIssueCode.custom, message: "ASSETS_TOO_LARGE" });
});
export type CourseTestInput = z.infer<typeof courseTestSchema>;
export function courseTestsRevision(tests: Array<Partial<TestData>>, maxAttempts: number) {
  return createHash("sha256").update(JSON.stringify({ maxAttempts, tests: tests.map(test => ({
    input: test.input ?? "", expectedOutput: test.expectedOutput ?? "", points: test.points || 1,
    isHidden: test.isHidden === true, imageUrls: Array.isArray(test.imageUrls) ? test.imageUrls : [], subtask: test.subtask || null,
    subtaskScoringMode: test.subtaskScoringMode || "ABSOLUTE", subtaskWeightPercent: test.subtaskWeightPercent ?? null,
    assets: test.assets ?? [],
  })) })).digest("hex");
}
export async function courseTaskTestCounts(taskIds: number[]) {
  if (!taskIds.length) return new Map<number, number>();
  const rows = await AppDataSource.getRepository(TestData).createQueryBuilder("test")
    .select("test.task_id", "taskId").addSelect("COUNT(*)", "count")
    .where("test.task_id IN (:...taskIds)", { taskIds }).groupBy("test.task_id").getRawMany();
  return new Map<number, number>(rows.map(row => [Number(row.taskId), Number(row.count)]));
}
async function hasStarted(task: EduTask, manager: EntityManager) {
  if (await manager.getRepository(EduGrade).createQueryBuilder("grade").where("grade.task_id = :id", { id: task.id }).getCount()) return true;
  return task.lesson.type === "CONTROL" && Boolean(await manager.getRepository(LessonAttempt).createQueryBuilder("attempt")
    .where("attempt.lesson_id = :id", { id: task.lesson.id }).getCount());
}
export async function courseTaskTestConfig(task: EduTask, manager = AppDataSource.manager) {
  const tests = await manager.getRepository(TestData).find({ where: { task: { id: task.id } }, order: { id: "ASC" } });
  return { task: { id: task.id, title: task.title, lessonId: task.lesson.id, pythonRuntimeProfile: task.pythonRuntimeProfile || "STANDARD" },
    testData: tests.map(test => ({ input: test.input, expectedOutput: test.expectedOutput, points: test.points, isHidden: test.isHidden, imageUrls: Array.isArray(test.imageUrls) ? test.imageUrls : [], subtask: test.subtask || null, subtaskScoringMode: test.subtaskScoringMode || "ABSOLUTE", subtaskWeightPercent: test.subtaskWeightPercent ?? null, assets: test.assets ?? [] })),
    maxAttempts: task.maxAttempts, revision: courseTestsRevision(tests, task.maxAttempts), gradingLocked: await hasStarted(task, manager) };
}
export async function replaceCourseTaskTests(task: EduTask, tests: CourseTestInput[], maxAttempts: number, expectedRevision: string) {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    // Starts and submissions lock student -> lesson -> task. An editor never acquires a student lock.
    await manager.getRepository(EduLesson).findOne({ where: { id: task.lesson.id }, lock: { mode: "pessimistic_write" } });
    const current = await manager.getRepository(EduTask).findOne({ where: { id: task.id }, lock: { mode: "pessimistic_write" } });
    if (!current) throw Object.assign(new Error("TASK_NOT_FOUND"), { statusCode: 404 });
    current.lesson = task.lesson;
    const config = await courseTaskTestConfig(current, manager);
    if (config.revision !== expectedRevision) throw Object.assign(new Error("TESTS_CHANGED"), { statusCode: 409 });
    const sameTests = courseTestsRevision(config.testData, current.maxAttempts) === courseTestsRevision(tests, current.maxAttempts);
    if (!sameTests && config.gradingLocked) throw Object.assign(new Error("ASSESSMENT_HAS_STARTED"), { statusCode: 409 });
    // A teacher may grant extra attempts after reviewing work, while its test definition stays frozen.
    const usage = await manager.getRepository(EduGrade).createQueryBuilder("grade").select("COUNT(*)", "count")
      .where("grade.task_id = :id", { id: task.id }).groupBy("grade.student_id").getRawMany();
    if (usage.some(row => Number(row.count) > maxAttempts)) throw Object.assign(new Error("ATTEMPT_LIMIT_TOO_LOW"), { statusCode: 409 });
    if (!sameTests) {
      await manager.getRepository(TestData).delete({ task: { id: current.id } });
      if (tests.length) await manager.getRepository(TestData).save(tests.map(test => manager.getRepository(TestData).create({
        ...test, subtaskScoringMode: test.subtaskScoringMode || "ABSOLUTE",
        assets: test.assets?.length ? normalizePythonTaskAssets(test.assets) : null,
        task: current, source: "MANUAL", kind: test.isHidden ? "JUDGE" : "SAMPLE",
      })));
    }
    current.maxAttempts = maxAttempts;
    await manager.getRepository(EduTask).save(current);
    return courseTaskTestConfig(current, manager);
  });
}
/** Only public cases carry input/output; hidden contents never enter stored student results or hints. */
export function courseJudgeGrade(tests: TestData[], response: JudgeResponse) {
  const byId = new Map((response.tests || []).map(test => [String(test.test_id), test]));
  const compileFailed = response.verdict === "CE";
  if (!compileFailed && tests.some(test => !byId.has(String(test.id)))) throw Object.assign(new Error("JUDGE_RESULT_INCOMPLETE"), { statusCode: 503 });
  const all = tests.map(test => ({ testId: test.id, passed: !compileFailed && byId.get(String(test.id))?.verdict === "AC",
    verdict: compileFailed ? "CE" : byId.get(String(test.id))!.verdict, hidden: test.isHidden === true }));
  const hasSubtasks = tests.some(test => String(test.subtask ?? "").trim().length > 0);
  const groups = new Map<string, TestData[]>();
  tests.forEach(test => { const group = hasSubtasks ? String(test.subtask ?? "").trim() || `unassigned_${test.id}` : test.isHidden ? "hidden" : "public"; groups.set(group, [...(groups.get(group) || []), test]); });
  const groupScores = [...groups].map(([group, items]) => {
    const rawMaxScore = items.reduce((sum, test) => sum + (test.points || 1), 0);
    const passed = items.filter(test => !compileFailed && byId.get(String(test.id))?.verdict === "AC");
    const isNamedSubtask = items.some(test => Boolean(String(test.subtask ?? "").trim()));
    const isPartial = items.some(test => test.subtaskScoringMode === "PARTIAL");
    const weightPercent = isNamedSubtask ? items.find(test => Number.isInteger(test.subtaskWeightPercent)
      && Number(test.subtaskWeightPercent) >= 1 && Number(test.subtaskWeightPercent) <= 100)?.subtaskWeightPercent : undefined;
    if (weightPercent !== undefined && weightPercent !== null) {
      const maxScore = weightPercent * 100;
      return { group, maxScore, score: isNamedSubtask && !isPartial
        ? passed.length === items.length ? maxScore : 0
        : Math.round(maxScore * passed.reduce((sum, test) => sum + (test.points || 1), 0) / rawMaxScore) };
    }
    const maxScore = rawMaxScore;
    return { group, maxScore, score: isNamedSubtask && !isPartial ? passed.length === items.length ? maxScore : 0 : passed.reduce((sum, test) => sum + (test.points || 1), 0) };
  });
  const maxScore = groupScores.reduce((sum, item) => sum + item.maxScore, 0);
  const score = groupScores.reduce((sum, item) => sum + item.score, 0);
  const publicResults = tests.filter(test => !test.isHidden).map(test => { const result = byId.get(String(test.id)); return {
    testId: test.id, input: test.input, expected: test.expectedOutput, actual: result?.actual || "",
    passed: !compileFailed && result?.verdict === "AC", verdict: compileFailed ? "CE" : result!.verdict,
    ...(compileFailed ? { stderr: response.compile?.stderr || response.compile?.message || "Compilation error" } : result?.stderr ? { stderr: result.stderr } : {}),
  }; });
  return { total: maxScore > 0 ? Math.round(score / maxScore * 100) : 0, score, maxScore, groupScores,
    testsPassed: all.filter(item => item.passed).length, testsTotal: tests.length,
    isCompleted: tests.length > 0 && all.every(item => item.passed), testResults: publicResults };
}
