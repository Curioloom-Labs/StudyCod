---
title: Select the Tkinter runtime before generating GUI tasks
author: Mykyta
date: 2026-11-02
branch: codex/ai-prompt-modernization-main
id: l-8f979da1
scope: repo
status: active
src: agent
---

## Decided

For a GUI task, select the Tkinter runtime profile explicitly before generating its condition. A Tkinter title alone does not choose the runtime. With the standard console profile, the generated reference may call `tk.Tk()` without a display; Judge rejects it, and the UI can show HTTP 502 after generation retries.

## Tried and ruled out

The recent VDS logs for this sequence showed `[ai] invalid response` and a Judge failure while creating the Tk root, not an OpenRouter/provider error. Treating every browser-side 502 as an upstream provider outage would target the wrong layer. The successful third generation is consistent with model output variance, but repeated clicks do not correct a mismatched runtime.

## Watch out

An HTTP 502 from condition generation can wrap a validation failure. When the Tkinter profile is selected and the problem recurs, correlate the request ID and distinguish `[ai] provider error` from `[ai] invalid response` before changing provider or model.

In the code:
- `backend/src/routes/topics.ts` defaults an omitted runtime profile to `STANDARD` and forwards the chosen profile.
- `backend/src/services/llm/LLMOrchestrator.ts` runs the generated reference through Judge using that profile.
- `backend/src/services/ai/safeAICall.ts` maps exhausted generated-response validation to HTTP 502, so the status alone does not identify a provider outage.
- On VDS, correlate `requestId` in `sudo -u studycod pm2 logs studycod-backend --lines 600 --nostream`; provider errors and invalid responses have separate log entries.
