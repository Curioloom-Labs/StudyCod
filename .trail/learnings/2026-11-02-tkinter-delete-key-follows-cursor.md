---
title: Review Tkinter Delete keys at the actual cursor position
author: Codex
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
scope: repo
status: active
src: agent
---

## Decided

When reviewing Tkinter snapshots, interpret Entry editing from the real insertion cursor. Typing advances the cursor after inserted text; BackSpace removes before it; Delete removes at it and is a no-op at end-of-text.

## Tried and ruled out

After preserving focus in the headless Judge, a live generated test suite produced valid snapshots, but the independent reviewer still rejected a Delete-at-end case by claiming Delete must remove a character. The second retry did not resolve the reviewer contradiction; its output disagreed with Tk's actual cursor behavior.

## Watch out

Do not assume a supported key event changes the widget value. Compare the candidate snapshot with actual Tk behavior and only reject when the specified cursor state and event produce a definite mismatch.

In the code:
- `backend/src/services/llm/TaskContractReview.ts` defines cursor-aware Entry review.
- `backend/src/services/llm/ReferenceTestData.ts` tells the reference generator to use cursor-determined key events.
- `shared/ai/prompts/index.ts` bumps the bundle version so stale prompt/cache results are not reused.
