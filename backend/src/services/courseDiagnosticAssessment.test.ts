import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  assessmentFailureReason,
  assessmentGenerationErrorLogDetails,
  canFallbackToDiagnosticPublicExamples,
  generateDiagnosticQuestionsWithCoverageRetry,
  generateDiagnosticTaskPackageWithRetry,
  hasExactDiagnosticQuestionCoverage,
  mapWithConcurrency,
  normalizeQuestions,
  resolveCourseDiagnosticTestCases,
  selectCourseDiagnosticTestCases,
  shouldRegenerateDiagnosticTask,
} from "./courseDiagnosticAssessment";
import { AIValidationError } from "./llm/AIResponseValidator";
import { TaskContractReviewError } from "./llm/TaskContractReview";

test("diagnostic generation waits for active workers and stops scheduling after a failure", async () => {
  const failureState = { failed: false };
  const scheduled: number[] = [];
  let activeWorkerFinished = false;
  const failing = mapWithConcurrency([0, 1, 2], 1, async (item) => {
    scheduled.push(item);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    throw new Error("diagnostic worker failed");
  }, failureState);
  const sibling = mapWithConcurrency([0, 1, 2], 1, async (item) => {
    scheduled.push(item + 10);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    activeWorkerFinished = true;
    return item;
  }, failureState);

  const [failureResult, siblingResult] = await Promise.allSettled([failing, sibling]);
  assert.equal(failureResult.status, "rejected");
  assert.match(String(failureResult.reason), /diagnostic worker failed/);
  assert.equal(siblingResult.status, "fulfilled");
  assert.deepEqual(scheduled, [0, 10]);
  assert.equal(activeWorkerFinished, true);
});

test("diagnostic quiz fallback assignment stays aligned when invalid candidates are skipped", () => {
  const assignments = [
    { id: 11, title: "A" },
    { id: 11, title: "A" },
    { id: 22, title: "B" },
    { id: 22, title: "B" },
  ] as any;
  const makeQuestion = (question: string, correct = 0) => ({
    q: question,
    options: ["one", "two", "three", "four"],
    correct,
  });
  const normalized = normalizeQuestions([
    makeQuestion("Invalid candidate", 9),
    makeQuestion("Question one"),
    makeQuestion("Question two"),
    makeQuestion("Question three"),
    makeQuestion("Question four"),
  ], assignments, 4, 0);

  assert.deepEqual(normalized.map((question) => question.topicId), [11, 11, 22, 22]);
  assert.equal(hasExactDiagnosticQuestionCoverage(normalized, assignments), true);
});

test("diagnostic quiz batches regenerate once when topic tags produce uneven coverage", async () => {
  const assignments = [{ id: 11 }, { id: 11 }, { id: 22 }, { id: 22 }];
  const question = (topicId: number) => ({
    id: `q-${topicId}`,
    question: `Question for ${topicId}`,
    options: ["one", "two", "three", "four"],
    correct: 0,
    topicId,
    topicTitle: `Topic ${topicId}`,
  });
  const invalidCoverage = [question(11), question(11), question(11), question(22)];
  const validCoverage = [question(11), question(11), question(22), question(22)];
  let calls = 0;

  const generated = await generateDiagnosticQuestionsWithCoverageRetry(
    assignments,
    async (feedback) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(feedback, undefined);
        return invalidCoverage;
      }
      assert.match(String(feedback), /topic 11: expected 2, received 3/);
      assert.match(String(feedback), /topic 22: expected 2, received 1/);
      return validCoverage;
    },
    (raw) => raw as ReturnType<typeof question>[],
  );

  assert.equal(calls, 2);
  assert.equal(hasExactDiagnosticQuestionCoverage(generated, assignments), true);
});

test("diagnostic quiz batches fail closed after a coverage repair is still uneven", async () => {
  const assignments = [{ id: 11 }, { id: 11 }, { id: 22 }, { id: 22 }];
  const invalid = [
    { id: "a", question: "a", options: [], correct: 0, topicId: 11, topicTitle: "A" },
    { id: "b", question: "b", options: [], correct: 0, topicId: 11, topicTitle: "A" },
    { id: "c", question: "c", options: [], correct: 0, topicId: 11, topicTitle: "A" },
    { id: "d", question: "d", options: [], correct: 0, topicId: 22, topicTitle: "B" },
  ];
  await assert.rejects(
    () => generateDiagnosticQuestionsWithCoverageRetry(assignments, async () => invalid, (raw) => raw as any),
    /ASSESSMENT_QUESTIONS_INVALID/,
  );
});

test("diagnostic assessment logs structured validation details without raw model output", () => {
  const schemaError = z.object({ examples: z.array(z.object({ input: z.string() })) }).safeParse({
    examples: [{ input: 42 }],
  }).error!;
  const error = new AIValidationError("generateTask", schemaError, "Response did not match the task schema", {
    secretRawModelOutput: "must never be logged",
  });

  assert.equal(assessmentFailureReason(error), "invalid_provider_response");
  assert.equal(assessmentFailureReason(new Error("CORE_OPERATION_MISSING: task generation aborted.")), "task_semantic_validation_failed");
  assert.equal(assessmentFailureReason(new Error("Generation aborted.")), "provider_generation_failed");
  assert.equal(assessmentFailureReason(new Error("Request aborted (deadline exceeded)")), "provider_timeout");
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

test("diagnostic assessment regenerates the whole task for statement or public-example failures", () => {
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("missing decimal precision"), {
    invalidSource: "statement",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("incorrect sample output"), {
    invalidSource: "publicExamples",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("invalid hidden oracle output"), {
    invalidSource: "candidateTests",
  })), false);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: decision task is too shallow; create richer behaviour with enough valid cases for meaningful tests"), {
    name: "AIValidationError",
    mode: "generateTask",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: decision task is too shallow"), {
    name: "AIValidationError",
    mode: "generateTestData",
  })), false);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: missing input format"), {
    name: "AIValidationError",
    mode: "generateTask",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: practicalTask reveals an implementation technique"), {
    name: "AIValidationError",
    mode: "generateTask",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: practicalTask requires empty output"), {
    name: "AIValidationError",
    mode: "generateTask",
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Task generation validation failed: practicalTask must be a natural narrative"), {
    name: "AIValidationError",
    mode: "generateTestData",
  })), false);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("CORE_OPERATION_MISSING: Practical task omitted the required operation. Generation aborted.")), true);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("TOPIC_MISMATCH_HARD_FAIL: task covers another topic.")), true);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("FORBIDDEN_SCOPE_VIOLATION: task contains forbidden scope.")), true);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("MULTI_TASK_NOT_ALLOWED: task has more than one exercise.")), true);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("provider unavailable")), false);
});

test("a task rejected for omitting its core operation is regenerated as a replacement package", async () => {
  const attempts: number[] = [];
  const missingCoreOperation = new Error("CORE_OPERATION_MISSING: Practical task omitted the required operation. Generation aborted.");
  const replacement = { practicalTask: "Implement the required operation with a validated input/output contract." };
  const result = await generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw missingCoreOperation;
    assert.equal(previousError, missingCoreOperation);
    return replacement;
  });
  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result, replacement);
});

test("a rejected decimal-output task is regenerated once with a replacement package", async () => {
  const attempts: number[] = [];
  const rejectedTask = Object.assign(new Error("TIME output has no decimal precision"), {
    invalidSource: "statement",
  });
  const validReplacement = {
    outputFormat: "Print TIME rounded to exactly two decimal places.",
    examples: [{ input: "1 2", output: "0.50" }],
    tests: [{ input: "2 4", output: "0.50" }],
  };

  const result = await generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw rejectedTask;
    assert.equal(previousError, rejectedTask);
    return validReplacement;
  });

  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result, validReplacement);
});

test("a shallow decision task is regenerated once with a richer replacement package", async () => {
  const attempts: number[] = [];
  const shallowDecision = Object.assign(new Error("Task generation validation failed: decision task is too shallow; create richer behaviour with enough valid cases for meaningful tests"), {
    name: "AIValidationError",
    mode: "generateTask",
  });
  const validReplacement = {
    statement: "Select a fee based on the requested service and customer tier.",
    tests: [
      { input: "standard silver", output: "5" },
      { input: "express silver", output: "8" },
      { input: "standard gold", output: "2" },
      { input: "express gold", output: "4" },
    ],
  };

  const result = await generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw shallowDecision;
    assert.equal(previousError, shallowDecision);
    return validReplacement;
  });

  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result, validReplacement);
});

test("whole-task regeneration allows three bounded retries and stops on unrelated failures", async () => {
  const attempts: number[] = [];
  const invalidStatement = Object.assign(new Error("missing decimal precision"), { invalidSource: "statement" });
  const stillInvalid = Object.assign(new Error("replacement still missing precision"), { invalidSource: "statement" });
  const thirdInvalid = Object.assign(new Error("third replacement still missing precision"), { invalidSource: "statement" });
  const fourthInvalid = Object.assign(new Error("fourth replacement still missing precision"), { invalidSource: "statement" });
  await assert.rejects(generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw invalidStatement;
    if (attempt === 2) {
      assert.equal(previousError, invalidStatement);
      throw stillInvalid;
    }
    if (attempt === 3) {
      assert.equal(previousError, stillInvalid);
      throw thirdInvalid;
    }
    assert.equal(previousError, thirdInvalid);
    throw fourthInvalid;
  }), /fourth replacement still missing precision/);
  assert.deepEqual(attempts, [1, 2, 3, 4]);

  attempts.length = 0;
  const providerUnavailable = new Error("provider unavailable");
  await assert.rejects(generateDiagnosticTaskPackageWithRetry(async (attempt) => {
    attempts.push(attempt);
    if (attempt === 1) throw invalidStatement;
    throw providerUnavailable;
  }), /provider unavailable/);
  assert.deepEqual(attempts, [1, 2]);

  attempts.length = 0;
  const invalidCandidateTests = Object.assign(new Error("hidden candidate output mismatch"), { invalidSource: "candidateTests" });
  await assert.rejects(generateDiagnosticTaskPackageWithRetry(async (attempt) => {
    attempts.push(attempt);
    throw invalidCandidateTests;
  }), /hidden candidate output mismatch/);
  assert.deepEqual(attempts, [1]);
});
