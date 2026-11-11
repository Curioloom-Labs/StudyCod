---
title: Diagnostic task retries must preserve reviewer findings
author: Codex
date: 2026-11-11
branch: codex/diagnostic-exam-experience
scope: repo
status: active
src: agent
touches:
  - backend/src/services/courseDiagnosticAssessment.ts
  - backend/src/services/llm/LLMOrchestrator.ts
  - backend/src/services/llm/ReferenceTestData.ts
---

## Decided
When the hidden-test reviewer asks for clarification about a generated diagnostic task, preserve its question as a statement finding and regenerate the complete practical package within the bounded retry count. For candidate output findings, recognize both `expects 'x'` and `expects output 'x'` so the Python oracle repair path can handle either wording. Ask the reference-test model for pairwise unique candidates explicitly because duplicates and public-example matches are removed before selection. If filtering leaves too few inputs, repair only the candidate inputs and keep the valid reference program unchanged; attach malformed provider objects so retries can identify what failed. Keep diagnostic examples to plain, preferably single-line input data.

Classify concrete `generateTask` validation findings before the broad retryable-provider classification. In particular, empty public-example input/output is a `publicExamples` failure, so the replacement prompt explicitly repairs the examples instead of calling the retry transient provider recovery.

For numeric collection tasks, require one exact serialization for every element. A mixture such as `10` and `10.0` needs an explicit rule; vague "standard format" wording causes example/oracle disagreements.

For decimal-output tasks, precision and rounding alone are not enough. Specify fixed digits, trailing-zero policy, and decimal separator; never imply that input number spelling should be preserved, and include a non-integer example.

## Tried and ruled out
Treating every hidden-test failure as a provider outage misdiagnoses generated content errors. Re-running hidden tests for a task with an ambiguous statement or incorrect public examples is also wasteful; those findings require a replacement task package. Generic reference-program repair instructions for an input-count or uniqueness failure are misleading and can repeat the same shortage; ask for replacement inputs without changing the oracle. Adding `uniqueItems` to the provider JSON schema was ruled out because the selected Google structured-output schema subset does not support that keyword.

## Watch out
`safeAICall` maps a reviewer clarification to `AI_CLARIFICATION_REQUIRED` and stores the actual question in `error.clarification.question`; it does not return the original review issue in `details.validationError`. If diagnostics discard that field, `shouldRegenerateDiagnosticTask` cannot identify the statement failure and the request ends as a 503. Do not regenerate hidden tests to repair public examples or the task statement. Keep candidate-test repairs scoped to the reported input or reference output. Five complete package attempts remain bounded; more retries increase model spend and response time.

The diagnostic provider-retry predicate also recognizes `AIValidationError` as retryable. If it runs before task-validation classification, it hides specific example findings and sends an unhelpful transient-failure prompt; order the predicates so example paths win.

In the code:
`backend/src/services/courseDiagnosticAssessment.ts` maps clarification responses into statement findings for the whole-package retry, classifies public-example validation before provider errors, permits five complete package attempts, and puts an exact decimal-format contract in the compact diagnostic prompt. `backend/src/services/llm/LLMOrchestrator.ts` explicitly requires concrete non-empty public-example outputs. `backend/src/services/llm/ReferenceTestData.ts` classifies output-review wording, preserves malformed responses, and asks for unique candidate inputs. `backend/src/services/llm/TaskContractReview.ts` routes input-count failures to input-only repair and requires one canonical numeric output serialization. Regression coverage is in `backend/src/services/courseDiagnosticAssessment.test.ts`, `backend/src/services/llm/ReferenceTestData.test.ts`, and `backend/src/services/llm/TaskContractReview.test.ts`.
