---
title: Diagnostic task example counts must match their instructions
author: Codex
date: 2026-11-09
branch: codex/quiz-code-missing-fallback
id: l-20261109-diagnostic-example-count
scope: repo
status: active
src: agent
touches:
  - backend/src/services/llm/LLMOrchestrator.ts
  - backend/src/services/courseDiagnosticAssessment.ts
---

## Decided
Task generation must follow the public-example count requested by the caller, defaulting to three only when no count is specified. The current task-draft schema and validator require exactly three examples, so course diagnostics must request three until that schema and validator are changed together. A system prompt must not contradict the caller's count; otherwise the model may return examples that the caller or validator rejects.

Keep diagnostic practical count fixed at five. Distribute all course topics across those tasks so each combines multiple topics; for 29 topics, the balanced groups are 6/6/6/6/5.

## Tried and ruled out
Treating the repeated 503s as provider outages alone was inaccurate. VDS logs showed successful calls to the selected model followed by invalid generated content: malformed JSON, missing code in a question, empty stdin examples, and public outputs that disagreed with the reference execution. Asking diagnostics for one example while the schema requires three caused the model to receive conflicting requirements and made later examples especially likely to be invalid. Bounded package retries alone did not make repeated generations reliable; align the diagnostic request, system prompt, schema, and validator.

## Watch out
Keep conceptual quiz questions self-contained and code questions accompanied by their snippet. For STDIN_STDOUT practicals, require non-empty public inputs and verify each public output against the reference. If reducing the example count, update the JSON schema, type, renderer, and validator together; do not change only the prompt. A public-example or statement failure requires regenerating the practical package; do not try to repair it by replacing hidden tests. Keep provider/model/key selection explicit in any paid-model acceptance run.

In the code:
The task-generation system prompt is in `backend/src/services/llm/LLMOrchestrator.ts`. Diagnostic topic grouping, the one-example request, and task-package validation are in `backend/src/services/courseDiagnosticAssessment.ts`.
