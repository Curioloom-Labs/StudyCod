import assert from "node:assert/strict";
import test from "node:test";
import {
  GROWTH_PROJECT_FAMILIES,
  GROWTH_PROJECT_RUNTIME_INFO,
  growthJudgeTests,
  growthProjectFiles,
  validateGrowthProjectCatalog,
  growthTestsThroughStage,
  type GrowthProjectRuntime,
  type GrowthProjectStageKey,
} from "./growthProjects";

test("growth project catalogue has complete localized families and assessment cards", () => {
  assert.deepEqual(validateGrowthProjectCatalog(), []);
});

test("later versions retain every earlier stage test with collision-free IDs", () => {
  for (const family of GROWTH_PROJECT_FAMILIES) {
    for (const stage of ["V1", "V2", "V3"] as const) {
      const actual = growthTestsThroughStage(family, stage, true);
      const order = ["V1", "V2", "V3"] as const;
      const through = order.slice(0, order.indexOf(stage) + 1);
      const expectedCount = through.reduce((count, key) => count + family.stages[key].tests.length, 0);
      assert.equal(actual.length, expectedCount, `${family.key}/${stage} contains prior stage regressions`);
      assert.equal(new Set(actual.map(item => item.id)).size, actual.length, `${family.key}/${stage} test IDs are unique`);
      for (const key of through) {
        assert.ok(actual.some(item => String(item.id).startsWith(key.toLowerCase() + "-")), `${family.key}/${stage} includes ${key}`);
      }
    }
  }
});

test("all nine runtime tracks have a starter entry point and runnable test contracts at every stage", () => {
  const runtimes: GrowthProjectRuntime[] = ["PYTHON", "JAVA", "CPP"];
  const stages: GrowthProjectStageKey[] = ["V1", "V2", "V3"];
  for (const family of GROWTH_PROJECT_FAMILIES) {
    for (const runtime of runtimes) {
      for (const stage of stages) {
        const files = growthProjectFiles(family, runtime, stage);
        assert.ok(files.some(file => file.path === GROWTH_PROJECT_RUNTIME_INFO[runtime].entryFile), `${family.key}/${runtime}/${stage} entry file`);
        const tests = growthJudgeTests(family.stages[stage].tests, true);
        assert.ok(tests.some(item => item.hidden === false), `${family.key}/${runtime}/${stage} public test`);
        assert.ok(tests.some(item => item.hidden === true), `${family.key}/${runtime}/${stage} hidden regression test`);
        assert.equal(new Set(tests.map(item => item.id)).size, tests.length, `${family.key}/${runtime}/${stage} unique test ids`);
      }
    }
  }
});

test("catalog validator rejects missing hidden tests and incomplete transfer coverage", () => {
  const family = structuredClone(GROWTH_PROJECT_FAMILIES[0]);
  family.stages.V1.tests = family.stages.V1.tests.filter(testCase => !testCase.hidden);
  family.transferCards.pop();
  const errors = validateGrowthProjectCatalog([family]);
  assert.ok(errors.some(error => error.includes("both public and hidden tests")));
  assert.ok(errors.some(error => error.includes("expected 3 transfer cards")));
});
