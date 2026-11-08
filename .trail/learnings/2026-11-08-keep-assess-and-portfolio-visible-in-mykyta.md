---
title: Keep Assess and Portfolio visible in personal navigation
author: Mykyta
date: 2026-11-08
id: l-c3ce0528
scope: repo
status: active
src: agent
touches:
  - frontend/src/components/layout/PremiumWorkspaceShell.tsx
  - frontend/src/App.tsx
---

## Decided
Show Portfolio and Assess in primary navigation for PERSONAL users because the explicit false constant had hidden both entries even though the modules were meant to ship. The routes and APIs already existed, so this was a discoverability bug rather than an access-control gap.

## Tried and ruled out
Keeping the false switch would leave the features accessible only through guessed or saved URLs, so it does not meet the release requirement. Route or backend changes are unnecessary because their route registrations and API handlers are already present.

## Watch out
Backend readiness and unauthenticated API probes cannot reveal a frontend link hidden at build time, so verify the deployed frontend artifact whenever changing feature visibility.

In the code:
- `frontend/src/components/layout/PremiumWorkspaceShell.tsx` now always adds both entries for PERSONAL users.
- `frontend/src/App.tsx` already registers the `/portfolio` and `/assess` routes.
