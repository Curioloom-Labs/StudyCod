---
title: Diagnostic GETs must use the hidden-test repair retry
author: Mykyta
date: 2026-11-09
branch: codex/quiz-code-missing-fallback
id: l-0daa6420
scope: repo
status: active
src: agent
touches:
  - backend/src/services/courseDiagnosticAssessment.ts
  - backend/src/services/ai/safeAICall.ts
  - backend/src/services/llm/TaskContractReview.ts
---

## Decided
The course diagnostic GET must generate hidden tests through safeAICall with a bounded two-attempt budget. safeAICall already treats candidateTests review failures as repairable and passes the issue back as validationFeedback; calling the LLM orchestrator directly turns one rejected candidate suite into a 503 without that repair. Keep this retry at the caller so it does not create a second nested retry loop for other test-generation flows.

## Tried and ruled out
Adding another semantic retry inside generateTestDataWithAI_OpenRouter conflicts with the existing safeAICall retry boundary and its regression test. Provider fallback is not the cause when generated-test and reviewer calls succeed and the reviewer returns a candidateTests issue.

## Watch out
Do not retry statement or public-example findings by regenerating tests; those cannot be repaired at the hidden-test stage. Preserve the generated task examples, required cases, language, and request ID when routing the diagnostic call through safeAICall. Keep the final assessment error tagged as hidden_tests and retain the bounded contract issue in logs.

In the code:
backend/src/services/courseDiagnosticAssessment.ts routes hidden-test generation through safeAICall; backend/src/services/ai/safeAICall.ts owns feedback retries and retry classification; backend/src/services/llm/TaskContractReview.ts distinguishes candidateTests findings and numeric format masks.
