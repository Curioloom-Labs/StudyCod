import assert from "node:assert/strict";
import { test } from "node:test";
import { getLLMOrchestrator } from "../llm/LLMOrchestrator";
import { buildTaskConditionFailureMessage, safeAICall } from "./safeAICall";

test("task-condition errors expose a concise actionable validation finding in the UI locale", () => {
  const finding = "TASK_CONTRACT_REVIEW_FAILED[statement]: Ambiguous rounding rule.\nLong provider details.";
  assert.match(buildTaskConditionFailureMessage(finding, "uk"), /Перевірка умови знайшла проблему: Ambiguous rounding rule\./);
  assert.match(buildTaskConditionFailureMessage(finding, "en"), /Task consistency check failed: Ambiguous rounding rule\./);
  assert.match(buildTaskConditionFailureMessage("Invalid JSON response", "uk"), /не пройшла перевірку узгодженості/);
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
