---
title: Preserve Tkinter focus requests in the headless Judge
author: Codex
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
scope: repo
status: active
src: agent
---

## Decided

In StudyCod's Xvfb Tkinter runner, map an application's explicit `focus_set()` request to `focus_force()` so the chosen widget receives the injected keyboard events without a window manager. Keep the app responsible for choosing which widget should have focus.

## Tried and ruled out

On the production Judge, the same Entry task and `type` event produced an empty value when the sample program called `Entry.focus_set()` before `mainloop()`. Calling `focus_force()` before the loop or after the window mapped produced the typed text. The headless display lacks a window manager to activate the top-level, so ordinary Tk focus requests did not take effect there.

## Watch out

Do not auto-focus an arbitrary widget when an app made no focus request; that would hide a real task-solution error. Preserve the explicit target selected by the program, and tell the reference generator to use `focus_force()` for reliable virtual-display behavior.

In the code:
- `backend/src/services/edu/pythonTaskRuntime.ts` adapts `focus_set()` only inside the virtual Tkinter runner.
- `backend/src/services/edu/pythonTaskRuntime.test.ts` protects that runner contract.
- `backend/src/services/llm/ReferenceTestData.ts` asks reference programs to force the stated initial focus.
- `shared/ai/prompts/index.ts` bumps the prompt/cache version when these generation instructions change.
