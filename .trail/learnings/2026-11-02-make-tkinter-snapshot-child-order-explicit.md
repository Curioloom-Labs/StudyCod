---
title: Make Tkinter snapshot child order explicit
author: Codex
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
scope: repo
status: active
src: agent
---

## Decided

Define Tkinter snapshot ordering in the learner-facing task contract. The harness preserves each parent's `winfo_children()` creation order in the `widgets` and `children` arrays, so generation, repair, and review must agree on that observable order.

## Tried and ruled out

Passing the Tkinter runtime profile fixes console-only assumptions but does not make an incomplete GUI snapshot deterministic. Fixed window geometry, click targets, and focus still leave expected widget arrays ambiguous when their order is unstated.

## Watch out

Tkinter contract review can correctly reject examples when the visible statement does not determine the exact widget tree. Task repair needs to add the ordering rule while preserving the intended UI; weakening review would leave outputs dependent on implementation details.

In the code:
- `backend/src/services/llm/LLMOrchestrator.ts` asks Ukrainian and English task generation and repair prompts to define the ordered widget tree and all snapshot-visible values.
- `backend/src/services/llm/TaskContractReview.ts` documents the harness's creation-order behavior and reviews candidate snapshots against it.
- `backend/src/services/edu/pythonTaskRuntime.ts` serializes direct Tk children in `winfo_children()` order.
