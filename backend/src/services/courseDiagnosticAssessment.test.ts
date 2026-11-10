import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  assessmentFailureReason,
  assessmentGenerationErrorLogDetails,
  buildDiagnosticPracticalTaskContext,
  generateDiagnosticQuestionsWithCoverageRetry,
  generateDiagnosticTaskPackageWithRetry,
  groupDiagnosticTopicsForPracticals,
  hasExactDiagnosticQuestionCoverage,
  isDiagnosticPracticalInputContractValid,
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

test("course diagnostics create five balanced practical tasks covering all topics", () => {
  const topics = Array.from({ length: 29 }, (_, index) => ({
    id: index + 1,
    moduleId: Math.floor(index / 4) + 1,
    moduleTitle: `Module ${Math.floor(index / 4) + 1}`,
    title: `Topic ${index + 1}`,
    context: `Context ${index + 1}`,
    itemIds: [index + 1],
  }));

  const groups = groupDiagnosticTopicsForPracticals(topics);
  assert.equal(groups.length, 5);
  assert.deepEqual(groups.map((group) => group.length), [6, 6, 6, 6, 5]);
  assert.deepEqual(groups.flat().map((topic) => topic.id), topics.map((topic) => topic.id));
  assert.ok(groups.every((group) => group.length > 1));
  assert.ok(groups.some((group) => new Set(group.map((topic) => topic.moduleId)).size > 1));
});

test("diagnostic practical context preserves mixed-topic and example requirements within the compact prompt limit", () => {
  const topics = Array.from({ length: 6 }, (_, index) => ({
    id: index + 1,
    moduleId: Math.floor(index / 2) + 1,
    moduleTitle: "Module " + (Math.floor(index / 2) + 1),
    title: "Topic " + (index + 1),
    context: "Topic " + (index + 1) + "\nsource-" + index + "\nA focused lesson summary for the assigned topic.",
    itemIds: [index + 1],
  }));

  for (const locale of ["uk", "en"] as const) {
    const context = buildDiagnosticPracticalTaskContext("Java Core", topics, "test-variation", locale);
    assert.ok(context.length <= 1_200, "diagnostic requirements and all six topics must fit the compacted theory context");
    assert.ok(context.startsWith(locale === "en" ? "COURSE DIAGNOSTIC:" : "ДІАГНОСТИКА КУРСУ:"));
    assert.ok(context.indexOf("Topic 1") > context.indexOf("Assigned course topics:"));
    for (const topic of topics) {
      assert.ok(context.includes("[topic:" + topic.id + "] " + topic.title));
    }
    assert.ok(context.includes("test-variation"));
    assert.match(context, locale === "en" ? /at least two assigned topics/ : /щонайменше дві призначені теми/);
    assert.match(context, locale === "en" ? /exactly three distinct non-empty input\/output examples/ : /рівно три різні приклади/);
  }
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
    makeQuestion("Which rule describes a valid assignment statement?", 9),
    makeQuestion("Which rule describes assigning a value to a variable?"),
    makeQuestion("Which rule describes reading a value from input?"),
    makeQuestion("Which rule describes returning a value from a function?"),
    makeQuestion("Which rule describes creating a list of values?"),
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
  const repairedQuestion = question(22);
  let calls = 0;

  const generated = await generateDiagnosticQuestionsWithCoverageRetry(
    assignments,
    async (requestedAssignments, feedback) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(requestedAssignments.length, 4);
        assert.equal(feedback, undefined);
        return invalidCoverage;
      }
      assert.match(String(feedback), /topic 11: expected 2, received 3/);
      assert.match(String(feedback), /topic 22: expected 2, received 1/);
      assert.deepEqual(requestedAssignments.map(({ id }) => id), [22]);
      return [repairedQuestion];
    },
    (raw) => raw as ReturnType<typeof question>[],
  );

  assert.equal(calls, 2);
  assert.equal(hasExactDiagnosticQuestionCoverage(generated, assignments), true);
});

test("diagnostic quiz batches retry after malformed candidates leave a partial batch", async () => {
  const assignments = [
    { id: 11, title: "A" },
    { id: 11, title: "A" },
    { id: 22, title: "B" },
    { id: 22, title: "B" },
  ] as any;
  const question = (topicId: number, index: number) => ({
    q: `[topic:${topicId}] Which programming rule for topic ${topicId} applies in scenario ${index}?`,
    options: ["one", "two", "three", "four"],
    correct: 0,
  });
  const partial = [question(11, 1), question(11, 2), question(22, 1)];
  const missingQuestion = question(22, 2);
  let calls = 0;

  const generated = await generateDiagnosticQuestionsWithCoverageRetry(
    assignments,
    async (requestedAssignments, feedback) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(requestedAssignments.length, 4);
        assert.equal(feedback, undefined);
        return partial;
      }
      assert.match(String(feedback), /topic 22: expected 2, received 1/);
      assert.deepEqual(requestedAssignments.map(({ id }) => id), [22]);
      return [missingQuestion];
    },
    (raw, repairAssignments, startIndex) => normalizeQuestions(
      raw,
      repairAssignments as any,
      repairAssignments.length,
      startIndex,
      true,
    ),
  );

  assert.equal(calls, 2);
  assert.equal(generated.length, 4);
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

test("diagnostic assessment fails closed when the required hidden suite is unavailable", () => {
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
  // Repeat the same provider failure shape to confirm public examples never
  // get silently counted as hidden tests.
  for (let run = 0; run < 10; run += 1) {
    assert.equal(resolveCourseDiagnosticTestCases(failedGeneration, publicExamples), null);
  }
});

test("diagnostic assessment prefers a complete hidden suite over public examples", () => {
  const publicExamples = [{ input: "0 0", output: "0" }, { input: "1 1", output: "2" }, { input: "2 2", output: "4" }];
  const hiddenTests = Array.from({ length: 15 }, (_, index) => ({ input: `${index + 3} ${index + 4}`, output: String(index * 2 + 7) }));

  assert.deepEqual(
    selectCourseDiagnosticTestCases(hiddenTests, publicExamples),
    { source: "hidden", tests: hiddenTests },
  );
  assert.equal(selectCourseDiagnosticTestCases(hiddenTests.slice(0, 14), publicExamples), null);
  assert.equal(selectCourseDiagnosticTestCases([...hiddenTests.slice(0, 14), publicExamples[0]], publicExamples), null);
});

test("diagnostic assessment does not create an empty fallback suite", () => {
  assert.equal(selectCourseDiagnosticTestCases([], [{ input: "", output: "" }]), null);
  assert.equal(selectCourseDiagnosticTestCases([], [{ input: "", output: "non-empty" }]), null);
});

test("diagnostic practical tasks require stdin mode and a usable input example", () => {
  const examples = [{ input: "5", output: "6" }, { input: "7", output: "8" }, { input: "9", output: "10" }];
  assert.equal(isDiagnosticPracticalInputContractValid("STDIN_STDOUT", examples), true);
  assert.equal(isDiagnosticPracticalInputContractValid("NO_INPUT_FIXED_OUTPUT", examples), false);
  assert.equal(isDiagnosticPracticalInputContractValid("STDIN_STDOUT", [{ input: "", output: "6" }]), false);
  assert.equal(isDiagnosticPracticalInputContractValid("STDIN_STDOUT", [{ input: "5", output: "6" }]), false);
  assert.equal(isDiagnosticPracticalInputContractValid("STDIN_STDOUT", [{ input: "5", output: "6" }, { input: "5", output: "6" }, { input: "9", output: "10" }]), false);
});

test("diagnostic questions reject vague, duplicate, and duplicated-option candidates", () => {
  const topic = [{ id: 8, title: "Conditions" }] as any;
  const valid = { q: "Which branch runs when the condition evaluates to false?", options: ["else", "for", "class", "import"], correct: 0 };
  const vague = { ...valid, q: "Why is programming often compared to a conversation?" };
  const duplicateOptions = { ...valid, options: ["else", "for", "for", "import"] };
  const result = normalizeQuestions([vague, duplicateOptions, valid, { ...valid }], topic, 2, 0, true);
  assert.equal(result.length, 1);
});

test("diagnostic assessment does not create hidden tests after provider failure", () => {
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
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("Example 3: Task generation validation failed: every STDIN_STDOUT example must have non-empty input"), {
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
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("AI_GENERATION_FAILED: Provider generation failed"), {
    assessmentStage: "practical_task",
    statusCode: 503,
  })), true);
  assert.equal(shouldRegenerateDiagnosticTask(Object.assign(new Error("AI_GENERATION_FAILED: Provider generation failed"), {
    assessmentStage: "questions",
    statusCode: 503,
  })), false);
  assert.equal(shouldRegenerateDiagnosticTask(new Error("provider unavailable")), false);
});

test("a task with an empty indexed public-example input retries the whole package", async () => {
  const invalidExample = Object.assign(new Error("Example 3: Task generation validation failed: every STDIN_STDOUT example must have non-empty input"), {
    name: "AIValidationError",
    mode: "generateTask",
  });
  const attempts: number[] = [];
  const replacement = { practicalTask: "A corrected task with three non-empty examples." };

  const result = await generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw invalidExample;
    assert.equal(previousError, invalidExample);
    return replacement;
  });

  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result, replacement);
});

test("a transient provider failure retries only the practical-task package", async () => {
  const attempts: number[] = [];
  const providerUnavailable = Object.assign(new Error("AI_GENERATION_FAILED: Provider generation failed"), {
    assessmentStage: "practical_task",
    statusCode: 503,
  });
  const validReplacement = { practicalTask: "A complete replacement task with a valid input/output contract." };

  const result = await generateDiagnosticTaskPackageWithRetry(async (attempt, previousError) => {
    attempts.push(attempt);
    if (attempt === 1) throw providerUnavailable;
    assert.equal(previousError, providerUnavailable);
    return validReplacement;
  });

  assert.deepEqual(attempts, [1, 2]);
  assert.equal(result, validReplacement);
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
