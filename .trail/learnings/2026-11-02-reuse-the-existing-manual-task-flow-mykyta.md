---
title: Reuse the existing manual task flow for classwork
author: Mykyta
date: 2026-11-02
branch: studycod-full-platform-redesign
id: l-2b3dd624
scope: repo
status: active
src: agent
touches:
  - ai-service/cloudflare-ai-worker/src/index.ts
  - ai-service/cloudflare-ai-worker/tests/worker.test.ts
  - ai-service/src/index.ts
  - backend/src/ai/evaluator.ts
  - backend/src/env.ts
  - backend/src/middleware/authContestRuntime.test.ts
  - backend/src/middleware/authMiddleware.ts
  - backend/src/routes/auth.ts
  - backend/src/routes/contests.ts
  - backend/src/routes/edu.ts
---

## Decided
Use the existing MANUAL EduTask flow for classwork. It already supports text or file submissions, teacher scoring, feedback, and EduGrade, so a second classwork model would duplicate grading.

## Tried and ruled out
A new classwork entity or schema migration is unnecessary for work attached to an existing lesson; the manual submission and review pages already cover the student and teacher sides.

## Watch out
Lesson task creation must preserve MANUAL explicitly because the shared web-task normalizer maps non-WEB input to CODE. Manual tasks from lesson pages must always open the manual submission route, including lessons not sourced from courses.

In the code:
- backend/src/routes/edu.ts accepts MANUAL for lesson task creation and explicitly persists it.
- frontend/src/pages/edu/LessonStudioPage.tsx offers classwork as the default format and routes MANUAL tasks to student submission.
