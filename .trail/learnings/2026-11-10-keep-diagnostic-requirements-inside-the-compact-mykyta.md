---
title: Keep diagnostic requirements inside the compact prompt
author: Mykyta
date: 2026-11-10
branch: codex/quiz-code-missing-fallback
id: l-8f6f13b5
scope: repo
status: active
src: agent
touches:
  - backend/src/services/courseDiagnosticAssessment.test.ts
  - backend/src/services/courseDiagnosticAssessment.ts
  - backend/src/services/llm/AIResponseValidator.ts
  - backend/src/services/llm/LLMOrchestrator.test.ts
  - backend/src/services/llm/LLMOrchestrator.ts
---

## Decided
Put mandatory diagnostic requirements before lesson context because orchestration compacts from the start. Keep assigned topics as compact ID/title summaries so all topics fit. Treat indexed validation errors such as `Example 3: Task generation validation failed: ...` as task-generation failures and retry the whole bounded package.

Require an explicit reference to a particular code artifact before quiz snippet repair; generic program concepts are self-contained.

## Tried and ruled out
The 503 came from generated-content validation after successful model calls. Compaction dropped requirements placed after long topic context; indexed example errors bypassed the retry classifier. A broad code/program heuristic also rejected conceptual questions.

## Watch out
Keep exactly five practical tasks, each mixing topics, with three distinct non-empty examples. Read saved assessments back during acceptance runs, and pin paid-model runs to one model and key.

In the code:
`backend/src/services/courseDiagnosticAssessment.ts` builds compact task context and recognizes indexed errors. `backend/src/services/llm/LLMOrchestrator.ts` limits snippet repair. VDS acceptance verified ten stored generations on the selected Gemma 4 model and first API key.
