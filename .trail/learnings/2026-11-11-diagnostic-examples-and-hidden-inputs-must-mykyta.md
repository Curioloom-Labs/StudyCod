---
title: Diagnostic examples and hidden inputs must match their contracts
author: Mykyta
date: 2026-11-11
branch: codex/diagnostic-exam-experience
id: l-c5d0e167
scope: repo
status: active
src: agent
touches:
  - backend/src/services/courseDiagnosticAssessment.test.ts
  - backend/src/services/courseDiagnosticAssessment.ts
  - backend/src/services/llm/CloudflareAIProvider.ts
  - backend/src/services/llm/LLMOrchestrator.test.ts
  - backend/src/services/llm/LLMOrchestrator.ts
  - backend/src/services/llm/LLMProvider.ts
  - backend/src/services/llm/OpenRouterProvider.test.ts
  - backend/src/services/llm/OpenRouterProvider.ts
  - backend/src/services/llm/ReferenceTestData.test.ts
  - backend/src/services/llm/ReferenceTestData.ts
---

## Decided
For diagnostic programming packages, require an explicit, candidate-by-candidate parse against the complete learner-facing input contract: exact line/token/record counts, numeric bounds, lengths, allowed characters, and output format. This is necessary because VDS validation found letter-only identifiers containing digits and counted inputs whose first-line count did not match the supplied records. A generic instruction to use valid input is not enough. Keep independent task/test review and retry invalid content without weakening the statement.

## Tried and ruled out
Relying only on non-empty strings, uniqueness, and numeric bounds missed malformed counted records and invalid character classes. Broad boundary-coverage advice did not prevent those candidates because it describes coverage goals, not whether each concrete input parses.

## Watch out
Review and retry do not mean the package passed. Count a generation only after all topics, question quality, three public examples, 15 hidden cases per task, and all five IDE Test submissions are checked. Reviewers can also produce verbose or confused explanations; preserve concrete findings and verify outputs against the task and oracle.

In the code:
`backend/src/services/llm/LLMOrchestrator.ts` spells out the public-example checks. `backend/src/services/llm/ReferenceTestData.ts` spells out hidden-input grammar/cardinality checks. `backend/src/services/courseDiagnosticAssessment.ts` keeps bounded full-package retries and the Judge submission path.
