---
title: Portfolio and Assess list queries failed under MySQL
author: Mykyta
date: 2026-11-08
branch: codex/unhide-assess-portfolio-nav
id: l-9d23fa7f
scope: repo
status: active
src: agent
touches:
  - backend/src/routes/assessInterviews.test.ts
  - backend/src/routes/assessInterviews.ts
  - backend/src/services/portfolioEvidenceSources.test.ts
  - backend/src/services/portfolioEvidenceSources.ts
---

## Decided
The Portfolio 500 came from a trailing comma in the dynamically assembled certificate SELECT fragment. Both the certificates-present and fallback SELECT variants ended with a comma, so the generated SQL placed `, FROM contest_participants`. Remove the comma from both fragments and cover both schema branches in regression tests.

The Assess interview 500 came from MySQL rejecting `SELECT DISTINCT` while the ORDER BY referenced `i.scheduled_at`, which was not selected as a raw expression. Remove DISTINCT: the interview joins are one-to-one under the primary/unique keys, so deduplication was unnecessary and removing it preserves ordering and response shape.

## Tried and ruled out
Database readiness and migrations were healthy; the production logs showed SQL syntax/validation errors from these route queries, not missing schema. Unauthenticated 401 checks and health endpoints do not exercise authenticated Portfolio or Assess route queries. The regression tests inspect generated SQL and verify the route contract, while the full backend test suite passed.

## Watch out
A dynamic SQL fragment can be invalid only in an optional-schema branch, so test both the certificate table present and absent cases. For MySQL `SELECT DISTINCT`, ORDER BY expressions may need to appear in the select list; avoid DISTINCT when join constraints already guarantee the needed cardinality. After deploying, authenticated GET paths need a real request or relevant production log evidence to establish end-to-end recovery.

In the code:
- `backend/src/services/portfolioEvidenceSources.ts` builds optional contest certificate SELECT/JOIN fragments.
- `backend/src/services/portfolioEvidenceSources.test.ts` covers certificate table present and absent branches.
- `backend/src/routes/assessInterviews.ts` queries the interview list.
- `backend/src/routes/assessInterviews.test.ts` protects the MySQL-compatible ordering query.
