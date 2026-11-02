---
title: Tkinter test review must receive the GUI runtime contract
author: Codex
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
scope: repo
status: active
src: agent
---

## Decided

Carry the Tkinter runtime profile through both test generation and independent review. A Tkinter test input is a JSON UI-event sequence, and its expected output is the JSON widget snapshot produced by the virtual-display Judge. Keep the console IO type only where the existing test-count and response validation APIs require it.

## Tried and ruled out

Production logs for task 72 showed the contract reviewer judging valid Tkinter examples under the console IO contract. Its false public-example finding triggered an automatic condition repair; that repair succeeded, but test regeneration then exhausted the shared deadline. Repeated clicks could not fix either mismatch.

## Watch out

The UI's generic condition-repair message hid the second request's timeout as HTTP 422. Preserve whether a failure came from contract verification or a transient provider/deadline failure, and return the latter as a retryable error. Correlate VDS request IDs in the `studycod` PM2 context before attributing an HTTP status to a provider outage.

In the code:
- `backend/src/services/llm/LLMOrchestrator.ts` builds provider-specific Tkinter test prompts and passes the profile to review.
- `backend/src/services/llm/CloudflareAIProvider.ts` keeps the fallback prompt aligned with the event/snapshot contract.
- `backend/src/services/llm/TaskContractReview.ts` selects the Tkinter review rules.
- `backend/src/routes/edu/testData.ts` separates retryable AI failures from task-contract failures.
