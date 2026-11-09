import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  assessmentFailureReason,
  assessmentGenerationErrorLogDetails,
  canFallbackToDiagnosticPublicExamples,
  resolveCourseDiagnosticTestCases,
  selectCourseDiagnosticTestCases,
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

test("diagnostic assessment falls back to reviewed examples when hidden-test generation fails", () => {
  const failedGeneration = {
    success: false,
    error: {
      statusCode: 502,
      message: "AI_GENERATION_FAILED: Invalid response structure",
      error: "TASK_CONTRACT_REVIEW_FAILED[candidateTests]: output 0 does not match required double format 0.0",
      details: {
        validationError: "TASK_CONTRACT_REVIEW_FAILED[candidateTests]: output 0 does not match required double format 0.0",
      },
    },
  } as const;
  const publicExamples = [
    { input: "0.0 1 10", output: "0.0", explanation: "zero boundary" },
    { input: "1000000.0 1000 100", output: "1000000000.0" },
  ];
  const expected = {
    source: "public_examples",
    tests: [
      { input: "0.0 1 10", output: "0.0" },
      { input: "1000000.0 1000 100", output: "1000000000.0" },
    ],
  };

  // Repeat the same production failure shape to simulate flaky oracle output
  // across fresh assessment generations on the VDS.
  for (let run = 0; run < 10; run += 1) {
    assert.deepEqual(resolveCourseDiagnosticTestCases(failedGeneration, publicExamples), expected);
  }
});

test("diagnostic assessment prefers a complete hidden suite over public examples", () => {
  const hiddenTests = [
    { input: "1 2", output: "3" },
    { input: "3 4", output: "7" },
    { input: "5 6", output: "11" },
  ];

  assert.deepEqual(
    selectCourseDiagnosticTestCases(hiddenTests, [{ input: "0 0", output: "0" }]),
    { source: "hidden", tests: hiddenTests },
  );
});

test("diagnostic assessment does not create an empty fallback suite", () => {
  assert.equal(selectCourseDiagnosticTestCases([], [{ input: "", output: "" }]), null);
});

test("diagnostic assessment never masks statement or public-example contract failures", () => {
  assert.equal(canFallbackToDiagnosticPublicExamples("TASK_CONTRACT_REVIEW_FAILED[statement]: missing output rule"), false);
  assert.equal(canFallbackToDiagnosticPublicExamples("TASK_CONTRACT_REVIEW_FAILED[publicExamples]: wrong example output"), false);
  assert.equal(canFallbackToDiagnosticPublicExamples("TASK_CONTRACT_REVIEW_FAILED[candidateTests]: wrong oracle output"), true);
  assert.equal(canFallbackToDiagnosticPublicExamples("AI_GENERATION_FAILED: provider unavailable"), true);
  assert.equal(resolveCourseDiagnosticTestCases({
    success: false,
    error: { error: "TASK_CONTRACT_REVIEW_FAILED[statement]: missing output rule" },
  }, [{ input: "0", output: "0" }]), null);
});
