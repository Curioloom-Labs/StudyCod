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

export const courseTestSchema = z.object({
  input: z.string().max(65536), expectedOutput: z.string().max(65536),
  points: z.number().int().min(1).max(1000).default(1), isHidden: z.boolean().default(false),
  imageUrls: z.array(z.string().max(512).regex(/^\/api\/edu\/statement-images\/[A-Za-z0-9._-]+$/)).max(8).optional(),
  subtask: z.string().trim().max(64).nullable().optional(),
}).strict().refine(test => Boolean(test.input.trim() || test.expectedOutput.trim()), "EMPTY_TEST");
export const courseTestsSchema = z.array(courseTestSchema).max(50);
export type CourseTestInput = z.infer<typeof courseTestSchema>;
export function courseTestsRevision(tests: Array<Partial<TestData>>, maxAttempts: number) {
  return createHash("sha256").update(JSON.stringify({ maxAttempts, tests: tests.map(test => ({
    input: test.input ?? "", expectedOutput: test.expectedOutput ?? "", points: test.points || 1,
    isHidden: test.isHidden === true, imageUrls: Array.isArray(test.imageUrls) ? test.imageUrls : [], subtask: test.subtask || null,
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
  return { task: { id: task.id, title: task.title, lessonId: task.lesson.id },
    testData: tests.map(test => ({ input: test.input, expectedOutput: test.expectedOutput, points: test.points, isHidden: test.isHidden, imageUrls: Array.isArray(test.imageUrls) ? test.imageUrls : [], subtask: test.subtask || null })),
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
        ...test, task: current, source: "MANUAL", kind: test.isHidden ? "JUDGE" : "SAMPLE",
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
  const hasSubtasks = tests.some(test => Boolean(test.subtask));
  const groups = new Map<string, TestData[]>();
  tests.forEach(test => { const group = hasSubtasks ? test.subtask || `unassigned_${test.id}` : test.isHidden ? "hidden" : "public"; groups.set(group, [...(groups.get(group) || []), test]); });
  const groupScores = [...groups].map(([group, items]) => {
    const maxScore = items.reduce((sum, test) => sum + (test.points || 1), 0);
    const passed = items.filter(test => !compileFailed && byId.get(String(test.id))?.verdict === "AC");
    return { group, maxScore, score: hasSubtasks ? passed.length === items.length ? maxScore : 0 : passed.reduce((sum, test) => sum + (test.points || 1), 0) };
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
