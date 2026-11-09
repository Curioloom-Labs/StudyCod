---
title: Diagnostic quizzes confused code concepts with snippets
author: Mykyta
date: 2026-11-09
branch: codex/quiz-code-missing-fallback
id: l-4a831ae4
scope: repo
status: active
src: agent
touches:
  - backend/src/services/llm/LLMOrchestrator.ts
  - backend/src/services/courseDiagnosticAssessment.ts
---

## Decided
For diagnostic quizzes without a strict CODE_READING or DEBUGGING style, require a snippet only when a question asks about a particular code artifact or its execution result. Generic mentions of code, programs, or output can be conceptual and should not alone invalidate the quiz. Accept a non-empty structured `code` field as snippet content.

## Tried and ruled out
Classifying `QUIZ_CODE_MISSING` as retryable did not stop the production 503. Logs showed the same quiz validation failure after deployment; the OpenRouter chain for the diagnostic request had one model candidate, so changing retry classification alone did not guarantee a model switch.

## Watch out
Keep strict code styles requiring code in every question. Course diagnostics currently omit `questionStyle`, so their validator must distinguish general programming concepts from a question that refers to a concrete snippet. Do not log raw prompts or generated quiz payloads while diagnosing production failures.

In the code:
`backend/src/services/courseDiagnosticAssessment.ts` calls `generateQuizWithAI` without `questionStyle`. `backend/src/services/llm/LLMOrchestrator.ts` owns code completeness validation and quiz retries. OpenRouter retry model rotation only helps when another candidate is configured.
