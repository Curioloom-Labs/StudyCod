import type { JudgeResponse, JudgeTestCase } from "./judgeWorker/types";

export function summarizeGrowthProjectCheck(result: JudgeResponse, tests: JudgeTestCase[]) {
  const resultById = new Map(result.tests.map(item => [String(item.test_id), item]));
  const requiredTests = tests.filter(test => !String(test.id).startsWith("own-"));
  const passedCount = requiredTests.filter(test => resultById.get(String(test.id))?.verdict === "AC").length;
  const ownTests = tests.filter(test => String(test.id).startsWith("own-"));
  const ownExampleOutputs = ownTests.map(test => {
    const tested = resultById.get(String(test.id));
    const actual = tested?.actual;
    return { input: test.input ?? "", output: actual ?? "", passed: tested?.verdict === "AC" && actual === (test.output ?? "") };
  });
  const ownExamplesPassed = ownExampleOutputs.length === ownTests.length && ownExampleOutputs.every(example => example.passed);
  return {
    verdict: result.verdict,
    passed: result.compile?.ok !== false && passedCount === requiredTests.length && ownExamplesPassed && result.tests.length === tests.length,
    testsPassed: passedCount,
    testsTotal: requiredTests.length,
    compileOk: result.compile?.ok !== false,
    timeMs: result.time_ms,
    memoryKb: result.memory_kb,
    publicTests: result.tests
      .map(item => ({ item, source: tests.find(source => String(source.id) === String(item.test_id)) }))
      .filter(({ source }) => !source?.hidden && !String(source?.id).startsWith("own-"))
      .map(({ item, source }) => ({ id: String(item.test_id), passed: item.verdict === "AC", verdict: item.verdict, input: source?.input ?? "", output: item.actual ?? source?.output ?? "" })),
    ownExampleOutputs,
  };
}
