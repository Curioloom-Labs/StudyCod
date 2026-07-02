# StudyCod EDU — Audit Report (2026-06-29)

> Scope: EDU mode only. Personal/Contest are out of scope except where shared code (`User`, auth, judge, AI) is touched. Companion to `docs/edu-lms-plan.md` (the agreed transformation plan). This report audits the *current* state of that plan's execution and prioritizes what's next.

## 0. Executive summary

EDU is **not greenfield** — it is a large, already-functional LMS (~18k LOC across 24 backend sub-routers in `backend/src/routes/edu/`, 35 frontend pages in `frontend/src/pages/edu/`, 22 EDU service test files). The Phase 0/1 SaaS foundation from the plan is **substantially built**: `Organization`, `Membership`, `OrgRole`, a capability matrix (`services/edu/rbac.ts`), org-context middleware, course templates with fork/pull, a quiz engine, weighted gradebook, attendance, appeals, live classroom, and an AI tutor all exist.

The dominant risk is **not missing features — it is architectural incoherence from an in-flight migration.** Two authorization models, two identity models (`Student` vs `User`), and two grading models coexist. The new layers are built but **not load-bearing** (RBAC runs in shadow+fail-open mode; legacy ownership checks are what actually enforce access). This is the right migration strategy, but it has stalled in the "both exist" state, which is the most dangerous place to stop.

**Top priority is not building Phase 2/3 features — it is finishing the cutover of Phase 1 so the new model is the only model.**

---

## 1. Architecture audit

### Strengths
- **Clean module boundary.** EDU is genuinely isolated: org logic lives only under `/edu` (`backend/src/index.ts:780`), Personal/Contest routes are gated by `forbidContestModeUsers`/`placementGate` and never touch `Organization`/`Membership`. The plan's hard constraint (don't break Personal/Contest) is being honored structurally.
- **Router decomposition.** `routes/edu.ts` mounts 24 focused sub-routers (`studentAuth`, `gradebook`, `courses`, `liveClassroom`, `tutor`, …). Good cohesion.
- **Pure, testable RBAC core.** `services/edu/rbac.ts` is a data-free capability matrix with tests — exactly the right shape.
- **Real migrations.** `synchronize: false` + 33 migrations. Schema is managed, not auto-derived.
- **Frontend is lazy-loaded per page** and unified under one `/edu` shell with a command palette (⌘K) — the IA consolidation (Track A) from memory landed.

### Weaknesses (ranked)

**W1 — Dual authorization model, new one inert (critical).**
`requireCapability` (`middleware/orgContext.ts`) is applied to *some* routes (e.g. `PUT /classes/:id/grading-system`, `POST /classes/:id/lessons`) but:
- It runs in **shadow mode by default** (`EDU_RBAC_ENFORCE` unset → `__eduRbacEnforce=false`, `env.ts:248`), so a denial only writes an audit row and **still calls `next()`**.
- It is **fail-open** — any error in the check allows the request.
- It **skips students entirely** (`if (req.userType !== "USER") return next()`).
- Many routes don't use it at all and rely on legacy ownership (`class.teacher.id !== user.id`, e.g. `routes/edu.ts:809`, `:905`) plus `user.userMode !== "EDUCATIONAL"` string checks.

Net effect: the **legacy ownership check is the real gate**; the org RBAC layer is advisory. Consequences:
  - `ORG_ADMIN` and `ASSISTANT` roles **don't actually work** for any class they don't personally own — the legacy `teacher.id === user.id` filter 404s them. The capability matrix grants permissions the code then denies.
  - Authorization logic is duplicated and inconsistent across 24 routers (some check `userType`, some `userMode`, some `studentId`, some capability).

**W2 — Dual identity model mid-migration.** `Student` is a standalone entity with its own `generatedUsername`/`generatedPassword` AND an optional `user_id` link (`Student.ts`). The plan calls for unifying students under `User` (join-code path exists on `Class.joinCode`), but legacy shell-students still exist. Two auth paths (`studentAuth` JWT vs `User` JWT), two notions of "who is the student." This is the Track B work explicitly deferred in memory — but it's the root of much of the per-route branching (`req.studentId` vs `req.userId`).

**W3 — Authorization not centralized.** There is no single "can user X act on class Y" resolver. Ownership, org membership, and userMode are re-checked ad hoc in each handler. This is where a real bug will eventually slip in.

**W4 — `User.role` (`TEACHER`/`SYSTEM_ADMIN`) vs `OrgRole` overlap.** Two role systems. `userMode === "EDUCATIONAL"` is used as a coarse gate; `OrgRole` is the intended fine gate. They aren't reconciled, so "is this person a teacher" has two answers.

### Maintainability / debt
- Heavy use of `(task as any).taskMode` casts in `routes/edu.ts` (e.g. `:732-734`) — entity typing not trusted; suggests schema/entity drift.
- `routes/edu.ts` still holds ~940 lines of handlers despite the sub-router split (class CRUD, control-work formula, statement-image upload). Finish moving these into sub-routers.

---

## 2. UX audit

(Reviewed via routing/IA in `App.tsx:1700-1740` and page inventory.)

- **IA is coherent** post-consolidation: one shell, role-aware nav (School/Members/Courses/Calendar/Tutor for teachers; Lessons/Journal/Appeals for students), command palette, prefetch on hover. This is good and competitive.
- **Issue U1 — role routing is implicit.** Teacher vs student is decided by `user.studentId` truthiness scattered through `App.tsx` (`:1702`, `:1739`). With the identity unification (W2), a single `User` who is a student in one class and a teacher in another has no clean representation. The IA assumes one global role per person.
- **Issue U2 — no org/role switcher in UI.** `Membership` supports multiple orgs per user but the shell picks `memberships[0]` server-side when there's one org and gives up otherwise (`orgContext.ts`). Multi-org users have no way to choose context.
- **Issue U3 — desktop-first is acceptable** per the master prompt (web-only, no mobile required); `MobileHeader.tsx` exists but is not a priority.
- **Accessibility** not yet audited in depth — flagged for a dedicated pass (keyboard traps in the live classroom / code editor are the likely hot spots).

---

## 3. Database audit

- **Normalization is sound.** Proper FKs with explicit `onDelete` (`CASCADE` for ownership, `SET NULL` for soft links like `Class.organization`, `Student.user`). `Membership` has a unique `(user, org)` constraint. `Organization.slug` unique-indexed.
- **D1 — `org_id` nullable everywhere (`Class`, `Course`).** Correct *during* backfill, but it means every query must defensively handle null org. Once Phase 1 cutover completes, these should become `NOT NULL` with a backfill migration. Right now "no org" and "org pending" are indistinguishable.
- **D2 — index coverage unverified.** Hot query paths — `EduGrade` by `student.class_id`, `SummaryGrade` by `class_id`, memberships by `user_id` — need composite indexes confirmed. The grading-system conversion (`routes/edu.ts:566-630`) does full-class grade scans under a `SERIALIZABLE` transaction; without indexes this locks hard at scale.
- **D3 — `Student.generatedPassword` stored.** Need to confirm it's hashed at rest (separate `plainPassword` transient field exists, which is reassuring, but verify the column is a hash). Legacy shell-account artifact; goes away with W2.
- Entity/column naming is consistent (snake_case columns, camelCase props). Good.

---

## 4. Security audit

> Note: `SECURITY-AUDIT.md` at repo root describes holes that were **already fixed** — do not re-flag those. Findings below are current.

- **S1 — RBAC fail-open + shadow (critical, ties to W1).** Until `EDU_RBAC_ENFORCE=true` in production *and* the fail-open `catch → next()` is removed, the capability layer provides **zero** enforcement. It is monitoring, not security. The legacy ownership checks are the only real boundary; any route that has `requireCapability` but *not* a legacy owner check is currently unguarded for cross-org access.
- **S2 — verify every EDU mutation has a real owner/role gate.** Because RBAC is inert, each handler's manual check is the boundary. Needs a route-by-route sweep confirming no mutation relies solely on `requireCapability`.
- **S3 — student JWT storage.** `studentAuth.ts` signs JWTs (with `jti` revocation — good) but returns them in the body (no `httpOnly` cookie seen), implying localStorage on the client → XSS-exfiltratable. Acceptable if it matches the existing Personal-mode pattern, but worth a conscious decision.
- **S4 — file uploads.** Statement-image upload (`routes/edu.ts:240`) is well-handled: mime allowlist, size cap, random filename, path-traversal guard on read (`:288-294`). Good. Apply the same rigor to the planned manual-assignment file uploads.
- **S5 — audit logging exists** (`services/audit/auditLog.ts`, used by RBAC shadow). The data-access journal hook from the compliance plan (p.10) is partially in place. Confirm student-data *reads* (not just denials) are logged.
- **AI prompt-injection:** tutor/code-review go through `safeAICall`; needs a dedicated review of whether student-controlled code/text reaches system prompts unescaped.

---

## 5. Performance audit

- **P1 — Live Classroom in-memory state (from plan Phase 0).** Memory confirms Redis-backed `liveState` was a Phase 0 goal; `liveStateStore.ts` exists. Verify all of `liveCode`/`liveChallenge`/`liveBreakout`/`liveCopilot` actually use it — any remaining in-process Map breaks multi-replica and is a 1000-concurrent-user blocker.
- **P2 — grading conversion under SERIALIZABLE** (`routes/edu.ts:551`) loads all class grades + summaries into memory and re-saves. Fine per-class, but it's a coarse lock; ensure it's not on a hot path and indexes back it (D2).
- **P3 — relation over-fetching.** `GET /classes` loads `relations: ["students"]` just to count them (`routes/edu.ts:426,438`) — should be a `COUNT` subquery. Pattern likely repeats; audit for N+1 and count-via-load.
- **P4 — frontend** already does per-page lazy loading + hover prefetch. Good baseline. Bundle size of the code editor / live classroom path should be measured (Monaco + LiveKit are heavy).

---

## 6. Prioritized roadmap

Ordered by risk reduction, not feature count. **Do not start P2-feature work until R1–R2 land** — building on an inert auth layer compounds the incoherence.

### R1 — Make authorization load-bearing (highest priority)
1. Centralize into one resolver: `canActOnClass(principal, classId, capability)` that checks org membership → role → capability, replacing scattered `teacher.id === user.id` checks.
2. Turn RBAC **enforce on** and remove fail-open (`catch` should 403/500, not `next()`), after a route-by-route sweep + tests so no teacher is locked out.
3. Make `ORG_ADMIN`/`ASSISTANT` actually able to reach classes they don't own (the whole point of the org model).
*Exit: one auth path, enforced, tested; legacy ownership check deleted or subsumed.*

### R2 — Finish or formally re-defer the identity unification (W2)
Decide explicitly: complete Student→User unification now, or freeze it cleanly. The half-state is the source of most per-route branching. If deferring, document the seam so R1 doesn't have to handle two principal types forever.

### R3 — Schema hardening
Backfill `org_id`, flip `Class.org_id`/`Course.org_id` to `NOT NULL`; add/confirm composite indexes for grade and membership hot paths (D2); confirm `Student.generatedPassword` is hashed (D3).

### R4 — Multi-org UX (U1/U2)
Org/role switcher in the shell; stop assuming one global role per person.

### R5 — Performance verification
Confirm Live Classroom is fully Redis-backed (P1); replace count-via-load (P3); measure editor/live bundle (P4).

### R6 — Then Phase 2 feature depth (per `edu-lms-plan.md`)
Content pages, manual-assignment file upload, generalized gradebook UX, i18n extraction, AI/Live polish — built on the now-coherent foundation.

---

## 7. What is explicitly NOT a problem
- Feature breadth — it's already broad and competitive.
- Module isolation from Personal/Contest — correctly enforced.
- Test discipline in services — real, risk-based coverage exists.
- The migration *strategy* — incremental, working-at-each-phase. The only issue is that it stalled mid-cutover; finish it.
