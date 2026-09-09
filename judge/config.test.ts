import assert from "node:assert/strict";
import test from "node:test";
import {
  isProductionEnvironment,
  readJudgeRequestLimits,
  readMaxOutputLimitKb,
  readPositiveIntEnv
} from "./config";

function withEnv(name: string, value: string | undefined, fn: () => void): void {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test("positive integer config uses fallback for invalid values", () => {
  withEnv("JUDGE_CONFIG_TEST_VALUE", "-1", () => {
    assert.equal(readPositiveIntEnv("JUDGE_CONFIG_TEST_VALUE", 42), 42);
  });
  withEnv("JUDGE_CONFIG_TEST_VALUE", "128", () => {
    assert.equal(readPositiveIntEnv("JUDGE_CONFIG_TEST_VALUE", 42), 128);
  });
});

test("judge request limits are read from the environment", () => {
  withEnv("JUDGE_MAX_TESTS", "17", () => {
    assert.equal(readJudgeRequestLimits().maxTests, 17);
  });
});

test("output limit is capped to protect worker memory", () => {
  withEnv("JUDGE_MAX_OUTPUT_LIMIT_KB", "999999", () => {
    assert.equal(readMaxOutputLimitKb(), 256 * 1024);
  });
});

test("production detection is normalized", () => {
  withEnv("NODE_ENV", " production ", () => {
    assert.equal(isProductionEnvironment(), true);
  });
});
