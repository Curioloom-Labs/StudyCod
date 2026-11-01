import assert from "node:assert/strict";
import { test } from "node:test";
import { getLLMOrchestrator } from "../llm/LLMOrchestrator";
import { TaskContractReviewError } from "../llm/TaskContractReview";
import { consumeCurrentAIExecutionRetry } from "../llm/promptExecution";
import * as referenceExecution from "../executeReferenceTests";
import { buildTaskConditionFailureMessage, safeAICall } from "./safeAICall";

test("task-condition errors expose a concise actionable validation finding in the UI locale", () => {
  const finding = "TASK_CONTRACT_REVIEW_FAILED[statement]: Ambiguous rounding rule.\nLong provider details.";
  assert.match(buildTaskConditionFailureMessage(finding, "uk"), /Перевірка умови знайшла проблему: Ambiguous rounding rule\./);
  assert.match(buildTaskConditionFailureMessage(finding, "en"), /Task consistency check failed: Ambiguous rounding rule\./);
  assert.match(buildTaskConditionFailureMessage("Invalid JSON response", "uk"), /не пройшла перевірку узгодженості/);
  assert.match(buildTaskConditionFailureMessage("AI_RETRY_BUDGET_EXHAUSTED: Shared retry budget exhausted before Tkinter reference repair", "uk"), /Не вдалося повністю перевірити умову/);
});

test("safeAICall returns an actionable clarification instead of retrying it as a generation failure", async (t) => {
  let attempts = 0;
  t.mock.method(getLLMOrchestrator(), "generateTaskCondition", async () => {
    attempts += 1;
    throw new TaskContractReviewError("generateTask", "statement", ["Comparison boundary is ambiguous."], "Should the sum be greater than or equal to 10*n?");
  });

  const result = await safeAICall("generateTaskCondition", {
    topicTitle: "Arrays",
    taskType: "PRACTICE",
    language: "PYTHON",
  }, { language: "en", maxAttempts: 3 });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.statusCode, 422);
    assert.deepEqual(result.error.clarification, { question: "Should the sum be greater than or equal to 10*n?" });
  }
  assert.equal(attempts, 1, "a teacher decision must be requested before another repair attempt");
});

test("safeAICall preserves the last task validation error when inner layers exhausted the shared retry budget", async (t) => {
  let attempts = 0;
  t.mock.method(getLLMOrchestrator(), "generateTaskCondition", async () => {
    attempts += 1;
    consumeCurrentAIExecutionRetry();
    consumeCurrentAIExecutionRetry();
    throw new TaskContractReviewError("generateTask", "statement", ["Example click at (200, 150) does not target a specified widget."]);
  });

  const result = await safeAICall("generateTaskCondition", {
    topicTitle: "Tkinter",
    taskTitle: "Intro to Tkinter",
    taskType: "PRACTICE",
    language: "PYTHON",
    pythonRuntimeProfile: "TKINTER",
  }, { maxAttempts: 3 });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.statusCode, 502);
    assert.match(result.error.message, /Перевірка умови знайшла проблему/);
    assert.match(result.error.error ?? "", /does not target a specified widget/);
    assert.notEqual(result.error.error, "No result");
  }
  assert.equal(attempts, 1, "do not schedule an outer retry after inner calls consumed the shared budget");
});

test("safeAICall forwards the Tkinter profile to the oracle generator and Judge executor", async (t) => {
  const generatedInput = '{"events":[]}';
  const generatedOutput = '{"geometry":"400x300","title":"tk","widgets":[]}';
  let oracleParams: any = null;
  t.mock.method(referenceExecution, "executeReferenceTests", async (...args: any[]) => {
    assert.equal(args[1], "PYTHON");
    assert.deepEqual(args[2], [generatedInput]);
    assert.equal(args[5]?.pythonRuntimeProfile, "TKINTER");
    return [generatedOutput];
  });
  t.mock.method(getLLMOrchestrator(), "generateTestDataWithAI", async (params: any) => {
    oracleParams = params;
    assert.equal(params.pythonRuntimeProfile, "TKINTER");
    assert.equal(typeof params.executeReference, "function");
    assert.deepEqual(await params.executeReference("import tkinter as tk", [generatedInput], []), [generatedOutput]);
    return [{ input: generatedInput, output: generatedOutput }];
  });

  const result = await safeAICall("generateTestData", {
    taskDescription: "Create a Tkinter window. Input is a JSON object with an events array.",
    taskTitle: "Intro to Tkinter",
    lang: "PYTHON",
    ioType: "STDIN_STDOUT",
    count: 1,
    pythonRuntimeProfile: "TKINTER",
  }, { expectedCount: 1, language: "uk", maxAttempts: 1 });

  assert.equal(result.success, true);
  assert.equal(oracleParams.pythonRuntimeProfile, "TKINTER");
});

test("safeAICall never reports its own exhausted retry budget as an AI provider outage", async (t) => {
  let attempts = 0;
  t.mock.method(getLLMOrchestrator(), "generateTaskCondition", async () => {
    attempts += 1;
    consumeCurrentAIExecutionRetry();
    consumeCurrentAIExecutionRetry();
    throw new Error("AI_RETRY_BUDGET_EXHAUSTED: Shared retry budget exhausted before Tkinter reference repair");
  });

  const result = await safeAICall("generateTaskCondition", {
    topicTitle: "Tkinter",
    taskTitle: "Intro to Tkinter",
    taskType: "PRACTICE",
    language: "PYTHON",
    pythonRuntimeProfile: "TKINTER",
  }, { maxAttempts: 3 });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.error.statusCode, 502);
    assert.match(result.error.message, /Не вдалося повністю перевірити умову/);
    assert.match(String(result.error.details?.validationError), /AI_RETRY_BUDGET_EXHAUSTED/);
  }
  assert.equal(attempts, 1, "an exhausted shared budget must not trigger a provider retry");
});

for (const scenario of [
  {
    status: 402,
    detail: "This request requires more credits, or fewer max_tokens.",
  },
  {
    status: 401,
    detail: "User not found. Invalid API key.",
  },
  {
    status: 403,
    detail: "Forbidden: API key is not authorized.",
  },
]) {
  test(`safeAICall does not repeat exhausted provider keys after HTTP ${scenario.status}`, async (t) => {
    let attempts = 0;
    t.mock.method(getLLMOrchestrator(), "generateTaskWithAI", async () => {
      attempts += 1;
      throw new Error(
        `AI_GENERATION_FAILED: All API keys exhausted for model test-model. Errors: ${scenario.status}x6. Last error: OpenRouter HTTP ${scenario.status}: ${scenario.detail}`,
      );
    });

    const result = await safeAICall("generateTask", {
      topicTitle: "Practice 2/3: Maximum subarray",
      theory: "Lesson theory",
      lang: "PYTHON",
      numInTopic: 2,
      isFirstTask: false,
      allowedIoTypes: ["STDIN_STDOUT"],
    }, { maxAttempts: 4 });

    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.statusCode, scenario.status);
    assert.equal(attempts, 1, "credential and credit failures are not transient generation failures");
  });
}
