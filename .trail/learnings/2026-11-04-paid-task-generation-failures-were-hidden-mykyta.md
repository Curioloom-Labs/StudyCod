---
title: Paid task generation failures were hidden by free fallback
author: Mykyta
date: 2026-11-04
branch: codex/ai-prompt-modernization-main
id: l-e327a462
scope: repo
status: active
src: agent
touches:
  - backend/src/services/llm/OpenRouterProvider.ts
  - backend/src/services/courseDiagnosticAssessment.ts
  - backend/src/services/llm/LLMOrchestrator.ts
  - backend/src/services/openRouterClient.ts
---

## Decided
A paid model can generate a response that the task-contract reviewer rejects; that validation failure was then obscured by a fallback to a free route, whose own 429/5xx errors produced the generic 503. Classify contract review failures separately and correlate assessment stages with one trace ID. Keep free model routes out of every candidate list and reject them at the HTTP boundary.

## Tried and ruled out
Reading the final 503 as a provider outage alone was inaccurate: production logs showed a successful paid-model generation followed by content validation failure, then a failed free-model fallback. Logging only the top-level exception loses the actionable first failure.

## Watch out
`TaskContractReviewError` inherits the name `AIValidationError`; inspect its `invalidSource`, `issues` and clarification field. Log bounded findings, never `rawResponse`, prompts or full generated payloads. Filter configured fallbacks and admin candidates as well as automatic routes; clear a free fallback from production configuration too.

In the code:
The candidate chain is built in `backend/src/services/llm/OpenRouterProvider.ts`; diagnostic classification and trace correlation live in `backend/src/services/courseDiagnosticAssessment.ts` and the orchestrator's prompt execution wrappers. The VDS fallback setting was `OPENROUTER_FALLBACK_MODELS=google/gemma-4-26b-a4b-it:free`.
