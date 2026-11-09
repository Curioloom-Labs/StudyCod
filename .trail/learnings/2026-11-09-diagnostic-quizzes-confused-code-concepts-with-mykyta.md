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

When a diagnostic question still fails code completeness, regenerate only the affected question slots with their original topic markers and explicit repair guidance. Course diagnostics render question text and choices without a separate code field, so their normal generation prompt must request conceptual, self-contained questions.

## Tried and ruled out
Classifying `QUIZ_CODE_MISSING` as retryable did not stop the production 503. Logs showed the same quiz validation failure after deployment; the OpenRouter chain for the diagnostic request had one model candidate, so changing retry classification alone did not guarantee a model switch.

Retrying only the whole provider chain is insufficient here: with one configured OpenRouter candidate, it repeats the invalid item. Keep the bounded repair inside quiz batch generation so the same provider receives the affected topic and a precise correction.

## Watch out
Keep strict code styles requiring code in every question. Course diagnostics currently omit `questionStyle`, so their validator must distinguish general programming concepts from a question that refers to a concrete snippet. Do not log raw prompts or generated quiz payloads while diagnosing production failures.

In the code:
`backend/src/services/courseDiagnosticAssessment.ts` must use `questionStyle: "CONCEPTS"` and ask for questions answerable without running a program. `backend/src/services/llm/LLMOrchestrator.ts` owns code completeness validation and bounded slot-level repair. Keep strict code requirements for CODE_READING and DEBUGGING.
