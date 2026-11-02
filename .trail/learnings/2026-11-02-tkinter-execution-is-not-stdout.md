---
title: Keep Tkinter execution evidence separate from stdout
author: Codex
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
scope: repo
status: active
src: agent
---

## Decided

Tkinter test review must treat the executed reference as a GUI program and its Judge output as a widget snapshot. Console stdout may be empty by design because the harness serializes the UI snapshot separately.

## Tried and ruled out

Passing the Tkinter runtime profile to generation and review was not sufficient: the reviewer prompt had a later generic executed-reference rule that still required stdin/stdout behavior. Production review then rejected correct UI event outputs as empty candidate output.

## Watch out

When editing shared contract-review instructions, keep runtime-specific rules authoritative in later sections too. For TKINTER, validate UI events and observed JSON snapshots; apply stdin/stdout checks only to console IO.

Bump the shared prompt bundle version when this contract changes so prompt-versioned caches cannot reuse results from the old instructions.

In the code:
- `backend/src/services/llm/TaskContractReview.ts` scopes executed-reference checks by IO type.
- `backend/src/services/llm/TaskContractReview.test.ts` asserts that Tkinter review doesn't infer empty output from silent stdout.
- `shared/ai/prompts/index.ts` versions the changed prompt contract.
