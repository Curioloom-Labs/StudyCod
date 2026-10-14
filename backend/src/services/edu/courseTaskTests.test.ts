import test from "node:test";
import assert from "node:assert/strict";
import { courseTestsSchema, courseTestsRevision, courseJudgeGrade } from "./courseTaskTests";
import { TestData } from "../../entities/TestData";
import type { JudgeResponse } from "../judgeWorker/types";

const tests = [
  { id: 1, input: "2", expectedOutput: "4", points: 2, isHidden: false },
  { id: 2, input: "hidden input", expectedOutput: "hidden answer", points: 8, isHidden: true },
] as TestData[];
const response = (verdicts: string[], extra = {}) => ({ verdict: "WA", tests: verdicts.map((verdict, index) => ({
  test_id: index + 1, verdict, actual: index ? "hidden actual" : "4", stderr: index ? "hidden stderr" : "",
})), ...extra }) as JudgeResponse;
test("course test definitions accept zero text and preserve whitespace, but reject empty/coerced/oversized definitions", () => {
  const valid = { input: "0\n", expectedOutput: "0\n", points: 1, isHidden: false };
  assert.deepEqual(courseTestsSchema.parse([valid]), [valid]);
  for (const invalid of [{ ...valid, input: " ", expectedOutput: "\n" }, { ...valid, points: "2" },
    { ...valid, points: 0 }, { ...valid, points: 1.5 }, { ...valid, isHidden: "false" },
    { ...valid, expectedOutput: "x".repeat(65537) }, { ...valid, secret: true }]) assert.equal(courseTestsSchema.safeParse([invalid]).success, false);
  assert.equal(courseTestsSchema.safeParse(Array(51).fill(valid)).success, false);
});
test("course weighted grading uses authored points and stores only public diagnostics", () => {
  const grade = courseJudgeGrade(tests, response(["AC", "WA"]));
  assert.equal(grade.total, 20); assert.equal(grade.score, 2); assert.equal(grade.maxScore, 10);
  assert.equal(grade.isCompleted, false); assert.equal(grade.testsPassed, 1);
  assert.equal(grade.testResults.length, 1); assert.equal(grade.testResults[0].actual, "4");
  assert.equal(JSON.stringify(grade).includes("hidden input"), false);
  assert.equal(JSON.stringify(grade).includes("hidden answer"), false);
  assert.equal(JSON.stringify(grade).includes("hidden actual"), false);
  assert.equal(JSON.stringify(grade).includes("hidden stderr"), false);
});
test("imported subtasks score all or nothing while unassigned cases stay independent", () => {
  const grouped = [...tests.map(item => ({ ...item, subtask: "group" })), { ...tests[0], id: 3, points: 5 }] as TestData[];
  const grade = courseJudgeGrade(grouped, response(["AC", "WA", "AC"]));
  assert.equal(grade.score, 5); assert.equal(grade.maxScore, 15); assert.equal(grade.total, 33);
  assert.equal(courseJudgeGrade(grouped, response(["AC", "AC", "AC"])).total, 100);
});
test("compile failure cannot receive points even when a contradictory response contains passed cases", () => {
  const grade = courseJudgeGrade(tests, response(["AC", "AC"], { verdict: "CE", compile: { stderr: "SyntaxError" } }));
  assert.equal(grade.score, 0); assert.equal(grade.testsPassed, 0); assert.equal(grade.isCompleted, false);
  assert.equal(grade.testResults[0].verdict, "CE"); assert.equal(grade.testResults[0].passed, false);
});
test("an incomplete worker response is an infrastructure error rather than a consumed wrong-answer attempt", () => {
  assert.throws(() => courseJudgeGrade(tests, response(["AC"])), (error: any) => error.statusCode === 503 && error.message === "JUDGE_RESULT_INCOMPLETE");
  assert.equal(courseJudgeGrade(tests, response([], { verdict: "CE" })).total, 0);
});
test("revision covers the authored criteria and limit, independently of database IDs", () => {
  assert.equal(courseTestsRevision(tests, 3), courseTestsRevision(tests.map(item => ({ ...item, id: item.id + 99 })), 3));
  assert.notEqual(courseTestsRevision(tests, 3), courseTestsRevision(tests, 4));
  assert.notEqual(courseTestsRevision(tests, 3), courseTestsRevision([{ ...tests[0], points: 3 }, tests[1]], 3));
});
