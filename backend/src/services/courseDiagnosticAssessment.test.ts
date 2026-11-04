import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  assessmentFailureReason,
  assessmentGenerationErrorLogDetails,
} from "./courseDiagnosticAssessment";
import { AIValidationError } from "./llm/AIResponseValidator";
import { TaskContractReviewError } from "./llm/TaskContractReview";

test("diagnostic assessment logs structured validation details without raw model output", () => {
  const schemaError = z.object({ examples: z.array(z.object({ input: z.string() })) }).safeParse({
    examples: [{ input: 42 }],
  }).error!;
  const error = new AIValidationError("generateTask", schemaError, "Response did not match the task schema", {
    secretRawModelOutput: "must never be logged",
  });

  assert.equal(assessmentFailureReason(error), "invalid_provider_response");
  const details = assessmentGenerationErrorLogDetails(error);
  assert.equal(details.validationMode, "generateTask");
  assert.equal(details.validationIssueCount, 1);
  assert.deepEqual(details.validationIssues, [{
    path: "examples.0.input",
    code: "invalid_type",
    message: "Invalid input: expected string, received number",
  }]);
  assert.equal(JSON.stringify(details).includes("must never be logged"), false);
});

test("diagnostic assessment identifies contract-review failures and logs bounded findings", () => {
  const error = new TaskContractReviewError(
    "generateTask",
    "publicExamples",
    ["Example input has more values than the stated format allows."],
    "Should each example begin with N followed by exactly N values?",
  );

  assert.equal(assessmentFailureReason(error), "task_contract_review_failed");
  assert.deepEqual(assessmentGenerationErrorLogDetails(error), {
    validationMode: "generateTask",
    contractInvalidSource: "publicExamples",
    contractIssueCount: 1,
    contractIssues: ["Example input has more values than the stated format allows."],
    clarificationQuestion: "Should each example begin with N followed by exactly N values?",
  });
});
