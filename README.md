# StudyCod

StudyCod is an educational platform for learning programming in which practice plays the central role: write code → run it → pass tests → identify the mistake → fix it → receive an explanation. It was created in response to the widespread problem of formalized learning, where attention is focused on memorizing syntax rather than developing algorithmic and engineering thinking.

Here, learning resembles a real developer workflow, adapted for education: clear requirements, tests, rapid feedback, and transparent assessment.

> This README is the single, complete reference for the project — product vision, system
> architecture, every service, the data model, the API surface, configuration, local setup,
> testing, and deployment. If you only read one document, read this one.

---

## Table of Contents

1. [Project Idea](#project-idea)
2. [What Makes StudyCod Distinctive](#what-makes-studycod-distinctive)
3. [Operating Modes](#operating-modes)
4. [System Architecture](#system-architecture)
5. [Repository Layout](#repository-layout)
6. [Technology Stack](#technology-stack)
7. [Backend](#backend)
   - [Request lifecycle & middleware](#request-lifecycle--middleware)
   - [Routing map](#routing-map)
   - [Services](#services)
   - [Data model](#data-model)
   - [Migrations](#migrations)
8. [The Judge (code execution & sandboxing)](#the-judge-code-execution--sandboxing)
9. [AI Layer](#ai-layer)
10. [EDU Live Classroom (code-aware video lessons)](#edu-live-classroom-code-aware-video-lessons)
11. [Frontend](#frontend)
12. [AI Service & Cloudflare Worker](#ai-service--cloudflare-worker)
13. [Configuration Reference (environment variables)](#configuration-reference-environment-variables)
14. [Local Development Setup](#local-development-setup)
15. [Testing](#testing)
16. [Observability & Operations](#observability--operations)
17. [Deployment](#deployment)
18. [Security Model](#security-model)
19. [Target Audience](#target-audience)
20. [License](#license)

---

## Project Idea

In programming, the most difficult part is not learning language constructs, but learning how to think: decomposing a problem into parts, designing a solution, considering edge cases, and refining the code to correctness and stability.

StudyCod shifts the emphasis from "reading theory" to "doing by hand." The platform helps train:

- problem analysis;
- algorithm construction;
- careful implementation;
- working with errors and tests;
- the habit of improving a solution instead of stopping at the first attempt.

## What Makes StudyCod Distinctive

At the core of the platform are practical problem solving and objective automated evaluation.

- The user works with code in a convenient interface and submits a solution.
- The solution is checked against a set of tests, making the result repeatable and transparent.
- After evaluation, it is clear what works and what does not: exactly where the solution fails.
- Artificial intelligence is used as a learning assistant: it provides explanations and guidance rather than simply giving the answer.
- The platform spans **personal practice, classroom teaching, contests, and live code-aware video lessons** in one product.

## Operating Modes

### Personal Learning

A mode for independent practice at one's own pace:

- task selection;
- repeated attempts and improvements;
- progress tracking;
- returning to difficult topics.

The goal is steady growth through systematic practice and short cycles of "attempt → feedback → correction."

### Educational Mode (EDU)

A mode for an organized learning process in classes or groups:

- structure around topics and lessons (`LESSON` / `CONTROL` work);
- assignment distribution to a group;
- quizzes and assessments with deadlines and time limits;
- a gradebook and clear progress tracking for each student;
- grade appeals workflow between students and teachers;
- a live monitor that shows, in real time, which students are stuck / working / passed / idle.

The goal is to make learning manageable for the instructor and transparent for the student.

### Contest Mode

A competitive engine with problems, participants, submissions, and standings. It supports
multiple scoring strategies (`scoringMode`, IOI by default) and a unified standings view.
Contest-mode users are isolated from the regular learning surface by a dedicated guard.

---

## System Architecture

StudyCod is a monorepo composed of cooperating services. The backend is the hub; the judge
runs as a sandboxed child process; AI calls are brokered through OpenRouter (with an optional
Cloudflare Workers AI fallback); the live classroom uses a self-hosted LiveKit SFU.

```
                         ┌──────────────────────────────────────────────┐
                         │                Frontend (Vite/React 19)        │
                         │  Personal · EDU · Contest · Live classroom UI   │
                         └───────────────┬────────────────────────────────┘
                                         │ HTTPS (REST, /api/*)        WebRTC (media)
                                         ▼                                 │
   ┌───────────────────────────────────────────────────────────┐         │
   │                  Backend (Express 5 + TypeORM)              │         │
   │                                                            │         │
   │  middleware: auth · maintenance · placement · rate limit   │         │
   │  routes: auth, tasks, edu, topics, theory, contests,       │         │
   │          library, playground, admin, support, certificate  │         │
   │  services: judgeWorker, llm, grading, integrity, replay,   │         │
   │            translation, certificates, redis, edu/live...    │         │
   └───┬─────────────┬──────────────┬──────────────┬────────────┘         │
       │             │              │              │                       │
       ▼             ▼              ▼              ▼                       ▼
  ┌─────────┐   ┌─────────┐   ┌───────────┐  ┌──────────┐         ┌───────────────┐
  │  MySQL  │   │  Redis  │   │   Judge    │  │OpenRouter│         │ LiveKit (SFU) │
  │(TypeORM)│   │sessions │   │  (nsjail   │  │   LLMs   │         │  self-hosted  │
  │         │   │ queue   │   │ sandbox)   │  │ + CF AI  │         │               │
  │         │   │ ratelim │   │  child proc│  │ fallback │         │               │
  └─────────┘   └─────────┘   └───────────┘  └──────────┘         └───────────────┘
```

Key architectural choices:

- **Single backend, dual route mount.** Every router is mounted twice — at `/<name>` and at
  `/api/<name>` — so the same API works behind a path-prefixing reverse proxy or directly.
- **Judge as an isolated child process.** Untrusted user code never runs in the API process;
  it is executed by a separate worker entry under an `nsjail` sandbox.
- **Redis is optional but unlocks scale.** With Redis enabled the backend uses a distributed
  execution queue, Redis-backed sessions, and Redis rate-limit stores; without it everything
  falls back to safe in-process behavior (ideal for local dev).
- **Feature gating by env.** AI, translation, live classroom, web tasks, and metrics each
  degrade gracefully (e.g. live classroom returns `503 LIVE_CLASSROOM_DISABLED`) when their
  configuration is absent, instead of breaking the whole process.
- **Graceful, bounded shutdown.** `SIGTERM`/`SIGINT` drain in-flight HTTP, then release Redis,
  with a deadline so a slow request can't block a deploy.

---

## Repository Layout

```
studycod_platform/
├── backend/                Express + TypeORM API (the hub)
│   ├── src/
│   │   ├── index.ts        App bootstrap, middleware wiring, health/metrics, shutdown
│   │   ├── env.ts          Zod-validated environment schema (single source of truth)
│   │   ├── config.ts       Derived runtime config exports
│   │   ├── data-source.ts  TypeORM DataSource + entity/migration registration
│   │   ├── entities/       Database entities (TypeORM)
│   │   ├── migrations/     Schema migrations (+ legacy history bootstrap)
│   │   ├── middleware/     auth, maintenance, placement gate, rate limits, role guard...
│   │   ├── routes/         HTTP routers (auth, tasks, edu/*, topics, contests, admin...)
│   │   ├── services/       Business logic (judgeWorker, llm, grading, integrity, edu/...)
│   │   ├── observability/  Health checks + Prometheus metrics rendering
│   │   ├── ai/             AI evaluator
│   │   └── utils/          Loggers, formula evaluator, grading scale, seeders...
│   └── scripts/            DB migration / bootstrap CLI helpers
├── judge/                  Sandboxed code-execution worker
│   ├── index.ts            Worker entry (also serves --health)
│   ├── engine/             compiler, executor, runner, limits, result types
│   ├── languages/          Per-language config: c, cpp, csharp, java, kotlin, python
│   ├── checkers/           Output comparators: exact, float, whitespace, normalize...
│   └── sandbox/nsjail.cfg  nsjail sandbox profile
├── frontend/               Vite + React 19 SPA
│   └── src/
│       ├── pages/          Grouped: auth, core, edu, contest, library, profile, public
│       ├── components/     CodeEditor, LiveClassMonitor, ClassLiveOverview, editors...
│       ├── lib/api/        Typed API clients per domain
│       ├── locales/        en.ts, uk.ts (i18next)
│       └── App.tsx         Route table
├── ai-service/             Optional standalone AI processing service
│   └── cloudflare-ai-worker/  Cloudflare Workers AI proxy (auth'd by shared secret)
├── shared/                 Code shared across services
├── docker/
│   └── livekit/            docker-compose + config for the live-classroom SFU
├── docs/                   Design docs (e.g. edu-live-classroom-plan.md)
├── theories/ · topics/     Curriculum content
└── README.md               You are here
```

---

## Technology Stack

| Area            | Technology |
|-----------------|------------|
| Backend runtime | Node.js, TypeScript, `tsx` (dev), `tsc` (build) |
| Web framework   | Express 5 |
| ORM / DB        | TypeORM + MySQL 8 (mysql2 driver) |
| Cache / queue   | Redis (sessions, distributed execution queue, rate-limit stores) |
| Auth            | JWT (Bearer), Passport (Google OAuth 2.0), express-session |
| Code execution  | Custom judge + `nsjail` sandbox; C, C++, C#, Java, Kotlin, Python |
| AI              | OpenRouter (primary), Cloudflare Workers AI (optional fallback) |
| Live video      | LiveKit (self-hosted SFU) + `@livekit/components-react` |
| Frontend        | React 19, Vite 7, React Router 7, Tailwind CSS 4, Framer Motion |
| Editor          | Monaco (`@monaco-editor/react`) |
| Charts / math   | Recharts, KaTeX, react-markdown + remark/rehype |
| i18n            | i18next / react-i18next (English + Ukrainian) |
| Validation      | Zod (env + payloads), express-validator |
| Security        | Helmet, CORS allowlist, express-rate-limit, Cloudflare Turnstile (optional) |
| Email           | Nodemailer / Brevo, IMAP ingest (imapflow + mailparser) |
| PDF / assets    | Playwright (certificates), QRCode |

---

## Backend

The backend is an Express 5 application defined in `backend/src/index.ts`. It validates its
entire environment up front through a Zod schema (`backend/src/env.ts`), initializes the
TypeORM data source, runs startup migrations (with legacy-history auto-recovery), optionally
seeds curriculum topics, and then begins listening.

### Request lifecycle & middleware

In order, an inbound request passes through:

1. **Helmet** — strict API-only CSP (`default-src 'none'`, `frame-ancestors 'none'`).
2. **Global rate limit** (production only) — 300 req/min, keyed by IP for anonymous and by
   `IP + signed principal id` for authenticated users (so a whole NATed classroom isn't one
   bucket, and a replayed token can't DoS the victim's bucket). `/health` is skipped.
3. **CORS** — strict origin allowlist resolved once at boot from `CORS_ORIGIN`/`CORS_ORIGINS`;
   credentials enabled; `*` is forbidden in production.
4. **Per-route body limits** — tight `256kb` default; `50mb` only for routes that legitimately
   need it (`/library`, `/admin`, `/topics`, `/contests`). Configurable via `BODY_LIMIT_*`.
5. **Request context** — correlation/metadata middleware.
6. **Maintenance gate** — short-circuits traffic when maintenance mode is on.
7. **Session + Passport** — Redis-backed (or in-memory) sessions; skipped for sessionless
   paths (`/health`, `/ready`, `/metrics`, `/internal/*`).
8. **Route guards** — `authMiddleware`, `forbidContestModeUsers`, `placementGate` are applied
   per router (see below).
9. **Centralized error handler** — normalizes `HttpError`/status, adds `Retry-After` on
   judge-overload `503`s, and never leaks internals in production.

### Routing map

Every router below is mounted at both `/<name>` and `/api/<name>`.

| Mount | Router | Guards | Purpose |
|-------|--------|--------|---------|
| `/auth` | `routes/auth.ts` | — | Login, registration, Google OAuth exchange, JWT issue |
| `/profile` | `routes/profile.ts` | — | User profile, settings |
| `/tasks` | `routes/tasks.ts` | auth · no-contest · placement | Personal practice tasks, run & submit |
| `/grades` | `routes/gradeRoutes.ts` | auth · no-contest · placement | Personal grades |
| `/topics` | `routes/topics.ts` | auth · no-contest · placement | Curriculum topics & progress |
| `/theory` | `routes/theory.ts` | auth · no-contest · placement | Theory blocks (with translation) |
| `/streak` | `routes/streak.ts` | auth · no-contest · placement | Learning streaks |
| `/birthday` | `routes/birthday.ts` | auth · no-contest · placement | Birthday greetings |
| `/edu` | `routes/edu.ts` (+ `routes/edu/*`) | mixed (teacher/student) | Full EDU suite (see below) |
| `/library` | `routes/library.ts` | auth · no-contest | Library task bank (large bodies) |
| `/contests` | `routes/contests.ts` | own guards | Contest engine, submissions, standings |
| `/playground` | `routes/playground.ts` | — | Free-form code snippets |
| `/support` | `routes/support.ts` | — | Support tickets & conversations |
| `/certificate` | `routes/certificate.ts` | — | Certificate generation (Playwright) |
| `/emails` | `routes/emails.ts` | — | Email flows |
| `/admin` | `routes/admin.ts` (+ `adminBroadcast`, `adminLibrary`, `adminMail`, `adminMaintenance`, `adminMaterials`, `adminSupport`) | auth · no-contest | Administration |

**EDU sub-routers** (`backend/src/routes/edu/`): `studentAuth`, `announcements`,
`classStudents`, `students`, `lessons`, `tasks`, `testData`, `grading`, `appeals`,
`insights`, `gradebook`, and `liveClassroom` (the live, code-aware classroom).

**Operational endpoints** (sessionless):

- `GET /health`, `/api/health` — liveness (build SHA, version, env).
- `GET /ready`, `/api/ready` — readiness (DB reachable → `200`, else `503` with per-dep detail).
- `GET /metrics`, `/api/metrics` — Prometheus text (prod requires `METRICS_ENABLED=1`).
- `GET /health/judge` — runs an `nsjail --health` probe (cached, coalesced).
- `GET /internal/load` — judge queue/scheduler metrics (non-prod by default).
- `GET /internal/ai/openrouter` — OpenRouter runtime diagnostics (non-prod by default).

### Services

`backend/src/services/` holds the business logic. Highlights:

- **`judgeWorker/`** — spawns and supervises the judge child process, applies a concurrency
  **semaphore**, and exposes execution metrics. `JudgeBusyError` surfaces overload.
- **`execution/`** — the execution queue, with a **distributed (Redis)** mode for multi-replica
  deployments and a **local (in-process)** mode for single instances; includes claim TTLs,
  retries, and a dead-letter queue.
- **`codeExecutionService.ts`** — high-level run/compare helpers used by tasks and EDU.
- **`llm/` + `openRouterService.ts` + `openRouterClient.ts` + `openRouterKeys.ts`** — the LLM
  provider abstraction: model selection, fallbacks, backup API keys, reasoning toggle, and
  runtime diagnostics. `ai/` and `services/ai/` host higher-level features (failure hints,
  AI-code detection, safe AI call wrappers).
- **`grading/` + `edu/controlWorkGrading.ts`** — automated and control-work grading; grade
  notifications via `edu/gradeNotificationService.ts`.
- **`integrity/` (+ `SubmissionIntegrity` entity)** — academic-integrity signals for proctoring.
- **`replay/`** — solve-session replays (time-travel through a student's code history).
- **`edu/liveMonitor.ts` + `edu/liveClassroom.ts`** — the live class snapshot/heatmap and the
  LiveKit token minting / session lifecycle.
- **`translation/`** — uk→en theory translation (self-hosted/CF worker; public fallback off
  by default to avoid exfiltrating content).
- **`certificates/`** — async certificate queue worker (started at boot).
- **`redis/sharedRedis.ts`** — the single shared Redis client + key-prefix conventions.
- Plus: `generateTestDataService`, `placementAssessmentService`, `plagiarism/`,
  `visualizer/`, `reports/`, `calibration/`, `emailService`, `studycodMailService`.

### Data model

TypeORM entities live in `backend/src/entities/` and are registered in `data-source.ts`.
Grouped by domain:

- **Identity & access:** `User`, `Student`, `Class`.
- **Curriculum:** `Topic`, `TopicNew`, `TopicTask`, `TopicProgress`, `TheoryBlock`,
  `TaskTheory`, `Task`, `TestData`.
- **EDU teaching:** `EduLesson` (LESSON/CONTROL), `EduTask`, `ControlWork`, `LessonAttempt`,
  `EduGrade`, `SummaryGrade`, `Grade`, `ClassAnnouncement`, `EduHintFeedback`,
  `ConceptReviewState`.
- **EDU live:** `EduLiveSession` (a live room bound to a class and optionally a lesson, with a
  unique `roomName`, `LIVE`/`ENDED` status, `startedBy`, `ended_at`).
- **Grade appeals:** `GradeAppeal`, `GradeAppealMessage`.
- **Contests:** `Contest`, `ContestProblem`, `ContestParticipant`, `ContestSubmission`.
- **Library & playground:** `LibraryTask`, `LibraryTaskAttempt`, `LibraryTaskRevision`,
  `PlaygroundSnippet`, `SolveSession`.
- **Integrity:** `SubmissionIntegrity`.
- **Support:** `SupportTicket`, `SupportConversation`, `SupportMessage`, `SupportAttachment`.
- **Operations:** `MaintenanceState`.

### Migrations

Migrations are in `backend/src/migrations/` and run automatically on startup
(`RUN_MIGRATIONS_ON_STARTUP`, default on). The bootstrap logic is resilient to **legacy
schema drift**: if a `CREATE TABLE` fails because the table already exists (locale-independent
detection via MySQL error code/errno/SQLSTATE), it can auto-stamp the migration history
(`AUTO_BOOTSTRAP_MIGRATION_HISTORY_ON_STARTUP`, default on outside production).

CLI helpers:

```bash
npm run db:migrate                      # apply pending migrations
npm run db:bootstrap-migration-history  # stamp legacy schema into migration history (once)
```

---

## The Judge (code execution & sandboxing)

The judge (`judge/`) is a **separate worker process** invoked by the backend's `judgeWorker`
service. Untrusted user code is never executed inside the API process.

- **Entry:** `judge/index.ts`. Invoked with `--health` it returns a JSON health payload (used
  by `/health/judge`); otherwise it reads a `JudgeRequest` and emits a `JudgeResponse` on
  stdout (stdout is reserved strictly for JSON; logs go to stderr).
- **Engine** (`judge/engine/`): `compiler.ts`, `executor.ts`, `runner.ts`, `limits.ts`,
  `result.ts`, plus `stderr.ts`/`userFacingErrors.ts` to turn raw failures into user-friendly
  messages.
- **Languages** (`judge/languages/`): `c`, `cpp`, `csharp`, `java`, `kotlin`, `python`
  (each defines compile/run commands and limits; `types.ts` is the shared contract).
- **Checkers** (`judge/checkers/`): output comparators — `exact`, `float` (tolerance),
  `whitespace`, `normalize`, `nonempty`.
- **Sandbox:** `nsjail` (config at `judge/sandbox/nsjail.cfg`). In production the judge runs in
  **config mode**; per-language chroots are configurable. Resource caps (input size, test
  count, per-test I/O bytes, file count, source bytes) are enforced and surfaced in the health
  payload.

**Load control:** the backend bounds concurrency with `MAX_CONCURRENT_EXECUTIONS`
(per-instance) and `MAX_GLOBAL_CONCURRENT_EXECUTIONS` (cluster-wide, via the distributed
queue), an execution queue with `MAX_EXECUTION_QUEUE_SIZE`, retries, and a dead-letter queue.
Overload returns `503` with a `Retry-After` header.

**Contract tests:**

```bash
npm run test:judge-contract   # backend ↔ judge request/response contract
npm run test:db-contract      # DB contract
```

---

## AI Layer

AI is a **learning enhancer**, not an answer machine. It assists in creating learning
materials and practical assignments, generates varied test data, explains typical mistakes,
suggests a direction of reasoning, and helps a learner understand *why* a solution failed.

- **Provider:** OpenRouter via `services/llm/OpenRouterProvider` and `openRouterService.ts`.
  Supports a primary model plus configurable fallbacks (`OPENROUTER_FALLBACK_MODELS` /
  `OPENROUTER_MODEL_FALLBACKS`), separate text/JSON models, an optional reasoning mode, and a
  pool of **backup API keys** (`OPENROUTER_BACKUP_API_KEYS`) for resilience.
- **Fallback:** an optional **Cloudflare Workers AI** worker (`CLOUDFLARE_AI_URL`), protected
  by a shared secret (`CLOUDFLARE_AI_INTERNAL_SECRET`) so it isn't an open inference proxy.
- **Orchestration tunables:** `LLM_TASK_*` env vars control timeouts, max tokens, theory /
  previous-task context windows, and an anchor cache.
- **Safety:** `services/ai/safeAICall` wraps calls so AI failures never crash a request;
  `services/ai/aiCodeDetector` flags likely AI-generated submissions for integrity.
- **Diagnostics:** `GET /internal/ai/openrouter` exposes provider runtime state (gated in prod
  behind `EXPOSE_INTERNAL_AI_DIAGNOSTICS=1`).

The objective is to improve feedback quality and reduce routine instructor workload while
preserving fairness of evaluation.

---

## EDU Live Classroom (code-aware video lessons)

The standout EDU capability: a **single screen that combines live video + a real-time heatmap
of every student's code state + AI** — something a generic LMS/meeting tool can't do, because
it has no code-execution engine in its core.

**Video stack:** self-hosted **LiveKit** (open-source SFU). The teacher is the room *host*;
students join as *participants*. Roles and tokens are bound to a `Class`/`EduLesson` via the
`EduLiveSession` entity.

**Backend** (`services/edu/liveClassroom.ts`, `routes/edu/liveClassroom.ts`):

- `POST /edu/classes/:classId/live-sessions` — teacher opens/reopens a session (one `LIVE`
  session per class), returns a host token.
- `GET  /edu/classes/:classId/live-sessions/active` — the active session (teacher or class
  student), without a token.
- `POST /edu/live-sessions/:id/join` — mints a token (teacher → host, class student →
  participant).
- `POST /edu/live-sessions/:id/end` — teacher ends the session.
- `GET  /edu/classes/:classId/live-overview` — per-student latest code activity within a 3h
  window (stuck / working / passed / idle, verdict, tests, current task). Teacher/admin only;
  reuses the pure `buildLiveSnapshot` from `services/edu/liveMonitor.ts`.

Tokens are minted with `livekit-server-sdk` and TTL `LIVEKIT_TOKEN_TTL_MINUTES`. The feature
is **gated**: without `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` the routes
return `503 LIVE_CLASSROOM_DISABLED`.

**Frontend:** `pages/edu/LiveClassroomPage.tsx` (lobby + room via
`@livekit/components-react`'s `VideoConference`), `components/ClassLiveOverview.tsx` (the live
heatmap, polling ~5s, shown beside the video for the teacher), client in
`lib/api/liveClassroom.ts`, route `/edu/classes/:classId/live`, with entry buttons in
`ClassDetailsPage` (teacher) and `StudentLessonsPage` (student).

**Run LiveKit locally:**

```bash
cd docker/livekit
docker compose up
```

Then set in `backend/.env` and restart the backend:

```
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret_change_me_at_least_32_characters_long
LIVEKIT_TOKEN_TTL_MINUTES=240
```

The full feature backlog (AI co-host, live challenges, shared cursor, time-travel debugging,
proctoring, class economy/streaks, offline lesson capsules) is curated in
[`docs/edu-live-classroom-plan.md`](docs/edu-live-classroom-plan.md).

---

## Frontend

A Vite + React 19 single-page app (`frontend/`).

- **Routing:** `src/App.tsx` (React Router 7). Pages are grouped under `src/pages/`:
  - `auth/` — login, registration, OAuth.
  - `core/` — Home, Tasks, Grades, IAD, solve replay.
  - `edu/` — teacher & student dashboards, class details, lessons, gradebook, control work,
    appeals, summary grades, topic/lesson authoring, and `LiveClassroomPage`.
  - `contest/` — contests, problem solving, scoreboard.
  - `library/`, `profile/`, `public/`, `system/`.
- **Editor:** Monaco-based `CodeEditor` and `MultiFileEditor`; `WebPreviewPane` for web tasks.
- **EDU live UI:** `LiveClassMonitor` and `ClassLiveOverview` (real-time class state).
- **AI UX:** `DebugMentorChat`, `ErrorExplainButton`, `FailureRecoveryCard`,
  `TaskGenerationOverlay`.
- **API clients:** typed per-domain in `src/lib/api/` (`auth`, `tasks`, `edu`, `contests`,
  `library`, `grades`, `learning`, `playground`, `liveClassroom`, `admin`, `support`,
  `theory`, `profile`) over a shared `client.ts` with retry support.
- **i18n:** i18next, English + Ukrainian (`src/locales/en.ts`, `uk.ts`).
- **Styling:** Tailwind CSS 4, Framer Motion, KaTeX, react-markdown (+ remark-gfm /
  remark-math / rehype-katex), Recharts.

Scripts:

```bash
npm run dev      # Vite dev server (default http://localhost:5173)
npm run build    # production build + sitemap generation
npm run preview  # preview the production build
```

---

## AI Service & Cloudflare Worker

- **`ai-service/`** — an optional standalone Node/Express service for internal AI processing.
  It reuses backend code via module aliases (`entities`, `services`, `utils`, `config`,
  `@shared`) configured in its `package.json` and `tsconfig`.
- **`ai-service/cloudflare-ai-worker/`** — a Cloudflare Worker that proxies Workers AI
  inference. It authenticates callers with an `x-internal-secret` header that must match
  `CLOUDFLARE_AI_INTERNAL_SECRET`; without it the worker would be an open paid-inference proxy.
  This same worker can also serve uk→en translation for theory blocks.

Both are optional — the core platform runs without them.

---

## Configuration Reference (environment variables)

All backend configuration is declared and validated in `backend/src/env.ts`. Create a
`backend/.env`. Below are the most relevant variables; defaults apply when omitted.

### Core / server

| Variable | Default | Notes |
|----------|---------|-------|
| `NODE_ENV` | — | `production` enforces strict checks below |
| `PORT` | `4000` | HTTP port |
| `FRONTEND_URL` | `http://localhost:5173` | |
| `BACKEND_PUBLIC_URL` | `http://localhost:4000` | |
| `CORS_ORIGIN` / `CORS_ORIGINS` | `http://localhost:5173` | Comma-list allowlist; `*` forbidden in prod |
| `TRUST_PROXY` | `1` in prod, `0` otherwise | Express trust-proxy setting |
| `JWT_SECRET` | — | **Required in prod**, ≥ 32 chars |
| `SESSION_SECRET` | — | **Required in prod**, ≥ 32 chars |
| `SESSION_STORE` | `memory` | `redis` to use Redis-backed sessions |

### Database (MySQL)

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Full connection URL (alternative to discrete vars) |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | Discrete config; `DB_PASS` required in prod when no `DATABASE_URL` |
| `DB_POOL_SIZE` / `DB_CONNECT_TIMEOUT_MS` / `DB_ACQUIRE_TIMEOUT_MS` / `DB_POOL_QUEUE_LIMIT` | Pool tuning |
| `RUN_MIGRATIONS_ON_STARTUP` | Default `true` |
| `AUTO_BOOTSTRAP_MIGRATION_HISTORY_ON_STARTUP` | Default on outside prod |
| `SEED_TOPICS_ON_STARTUP` | Default on in dev/test, off in prod |

### Redis

| Variable | Default | Notes |
|----------|---------|-------|
| `REDIS_URL` | `redis://127.0.0.1:6379` | |
| `REDIS_ENABLED` | inferred | Auto-on if `REDIS_URL` set or sessions/queue want Redis |
| `REDIS_KEY_PREFIX` | `studycod:` | |

### Judge / sandbox

| Variable | Notes |
|----------|-------|
| `JUDGE_WORKER_ENTRY` | Path to the judge worker entry |
| `NSJAIL_PATH` | Default `/usr/bin/nsjail` |
| `NSJAIL_CONFIG` | Sandbox config path (enables config mode) |
| `NSJAIL_USE_CONFIG` | Force config mode (prod always config mode) |
| `NSJAIL_CWD` | Default `/work` |
| `NSJAIL_CHROOT` / `_JAVA` / `_CPP` / `_PYTHON` | Per-language chroots |
| `JUDGE_LOCK_PATH` / `JUDGE_LOCK_STALE_MS` | Judge lock |
| `JUDGE_MAX_*` | Input/test/output/file size & count caps |

### Execution queue & rate limits

| Variable | Default | Notes |
|----------|---------|-------|
| `MAX_CONCURRENT_EXECUTIONS` | `12` | Per-instance |
| `MAX_GLOBAL_CONCURRENT_EXECUTIONS` | `0` (= per-instance) | Cluster-wide cap |
| `MAX_EXECUTION_QUEUE_SIZE` | `50` | |
| `EXECUTION_QUEUE_MODE` | inferred | `local` or `distributed` (Redis) |
| `EXECUTION_QUEUE_*` | — | Poll/claim/result TTLs, retries, DLQ size |
| `RATE_LIMIT_SHORT_*` / `RATE_LIMIT_LONG_*` | 5/10s, 20/60s | Per-user submission limits |
| `OVERLOAD_RETRY_AFTER_SECONDS` | `3` | `Retry-After` on overload `503` |
| `BODY_LIMIT_DEFAULT` / `BODY_LIMIT_LARGE` | `256kb` / `50mb` | Per-route body caps |

### AI (OpenRouter / Cloudflare)

| Variable | Notes |
|----------|-------|
| `OPENROUTER_API_KEY` | Primary key |
| `OPENROUTER_BACKUP_API_KEYS` | Comma-list of backup keys |
| `OPENROUTER_MODEL` / `OPENROUTER_TEXT_MODEL` / `OPENROUTER_JSON_MODEL` | Model selection |
| `OPENROUTER_FALLBACK_MODELS` / `OPENROUTER_MODEL_FALLBACKS` | Fallback chain |
| `OPENROUTER_REASONING_ENABLED` | Reasoning mode |
| `OPENROUTER_URL` / `OPENROUTER_REFERER` | Endpoint overrides |
| `LLM_TASK_*` | Timeout, max tokens, context windows, anchor cache |
| `CLOUDFLARE_AI_URL` / `CLOUDFLARE_AI_INTERNAL_SECRET` | CF Workers AI fallback + shared secret |
| `EXPOSE_INTERNAL_AI_DIAGNOSTICS` | Expose `/internal/ai/openrouter` in prod |

### Translation

`TRANSLATE_UK_EN_URL`, `TRANSLATE_UK_EN_TIMEOUT_MS`, `TRANSLATE_UK_EN_MAX_CHUNK_CHARS`,
`TRANSLATE_ALLOW_PUBLIC_FALLBACK` (off by default — public translators would exfiltrate
content).

### Live classroom (LiveKit)

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (all three required to enable),
`LIVEKIT_TOKEN_TTL_MINUTES` (default `240`, clamped 5–720).

### Security / anti-abuse

`TURNSTILE_SECRET_KEY`, `TURNSTILE_VERIFY_URL`, `TURNSTILE_ENFORCE_AUTH`,
`TURNSTILE_ENFORCE_CONTEST_SUBMIT` (Cloudflare Turnstile), `METRICS_ENABLED`.

### Web tasks

`WEB_TASKS_ENABLED`, `WEB_TASK_MAX_FILE_SIZE`, `WEB_TASK_MAX_TOTAL_SIZE`,
`WEB_TASK_PREVIEW_RATE_LIMIT`.

---

## Local Development Setup

### Prerequisites

- Node.js (LTS) and npm
- MySQL 8 (running, with a database created)
- Redis (optional — recommended for sessions/queue testing)
- `nsjail` (for real sandboxed execution; Windows treats binary existence as executable)
- Docker (optional — for the LiveKit live classroom)

### 1. Backend

```bash
cd backend
npm install
# create .env (see Configuration Reference). At minimum for local dev:
#   DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME (or DATABASE_URL)
#   JWT_SECRET, SESSION_SECRET   (any value works outside production)
npm run db:migrate        # apply migrations (also runs on startup by default)
npm run dev               # tsx watch on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev               # Vite on http://localhost:5173
```

### 3. Live classroom (optional)

```bash
cd docker/livekit
docker compose up
# then add LIVEKIT_* to backend/.env and restart the backend
```

### 4. AI service (optional)

```bash
cd ai-service
npm install
npm run dev
```

Health check once the backend is up:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/ready
curl http://localhost:4000/health/judge
```

---

## Testing

Backend tests use Node's built-in test runner against the compiled output:

```bash
cd backend
npm test                  # NODE_ENV=test → build → node --test on dist/**/*.test.js
npm run test:judge-contract
npm run test:db-contract
npm run loadtest          # load test harness
```

Test files live next to their subjects (e.g. `middleware/*.test.ts`,
`services/edu/liveMonitor.test.ts`, `routes/auth.googleExchange.test.ts`). In test mode the
environment forces in-memory sessions, Redis disabled, and the `local` execution queue.

---

## Observability & Operations

- **Logging:** structured logger (`utils/logger`); `morgan('dev')` in non-production.
- **Health/readiness:** `/health` (liveness) and `/ready` (DB-gated readiness for rolling
  deploys — route traffic only on `200`).
- **Metrics:** Prometheus text at `/metrics` (`METRICS_ENABLED=1` in prod). Judge scheduler
  metrics at `/internal/load`.
- **Judge health:** `/health/judge` runs (and caches/coalesces) an `nsjail --health` probe.
- **Resilience:** disconnect errors (EPIPE/ECONNRESET) are ignored rather than crashing the
  process; unhandled rejections are logged and only trigger a drain+restart if they exceed a
  rolling-window threshold (`UNHANDLED_REJECTION_FATAL_THRESHOLD`).
- **Graceful shutdown:** `SIGTERM`/`SIGINT` drain in-flight HTTP (bounded by
  `SHUTDOWN_DRAIN_TIMEOUT_MS`, default 15s) and then release Redis.

## Deployment

A typical production deployment:

1. **Build** backend (`npm run build` → `dist/`) and frontend (`npm run build` → static assets).
2. **Serve** the frontend as static assets behind a CDN/reverse proxy; proxy `/api/*` to the
   backend (both `/<name>` and `/api/<name>` mounts are supported).
3. **MySQL + Redis** provisioned; set `SESSION_STORE=redis` and a Redis URL for multi-replica
   setups (also enables the distributed execution queue).
4. **Judge:** ensure `nsjail` is installed and `JUDGE_WORKER_ENTRY` / `NSJAIL_*` are set;
   verify via `/health/judge`. In production the judge always runs in config mode.
5. **LiveKit:** for live classrooms, run the SFU behind TLS (`wss://`), open the UDP media
   port range, and set `use_external_ip: true` (or configure TURN) for NAT traversal.
6. **Secrets:** strong `JWT_SECRET` and `SESSION_SECRET` (≥ 32 chars), real DB credentials,
   non-`*` `CORS_ORIGIN`. The process fails fast at boot if these prod invariants aren't met.
7. **Scaling:** run N backend replicas with Redis + a global execution cap
   (`MAX_GLOBAL_CONCURRENT_EXECUTIONS`); gate load-balancer traffic on `/ready`.

The GitHub deployment workflow fast-forwards the production checkout at
`/var/www/studycod` while preserving tracked server-local changes through a temporary Git
stash. Those changes are reapplied after the update; a same-file conflict stops the deploy
before PM2 is stopped. Untracked files that are absent from `origin/main` remain on the
server. If an untracked file is newly added by `origin/main`, it is moved to a timestamped
`/root/studycod-deploy-*` recovery directory before the repository version is installed.

## Security Model

- **AuthN:** JWT Bearer tokens + Passport Google OAuth 2.0; signed, http-only session cookies.
- **AuthZ:** per-router guards (`authMiddleware`, `rolesGuard`, `forbidContestModeUsers`,
  `placementGate`) and teacher/student/admin checks inside EDU routes.
- **Transport:** Helmet with a strict API CSP; CORS allowlist with credentials; `*` forbidden
  in production.
- **Abuse control:** global + per-user rate limits (Redis-backed in prod), optional Cloudflare
  Turnstile on auth and contest submit, per-route body-size caps.
- **Untrusted code:** executed only in the `nsjail`-sandboxed judge child process with strict
  resource limits — never in the API process.
- **Academic integrity:** `SubmissionIntegrity` signals + AI-code detection feed the EDU live
  panel and grading.
- **Data minimization for AI:** translation/AI calls don't fall back to public third-party
  hosts unless explicitly opted in; the CF AI worker requires a shared secret.

---

## Target Audience

- **Pupils and students** — to learn not only to write code but to solve problems and think
  algorithmically.
- **Teachers** — to prepare materials faster, provide practice, observe progress in real time,
  and maintain transparent assessment.
- **Educational initiatives** — as a foundation for courses, clubs, distance learning, and
  research in the field of EdTech and AI.

## License

See [LICENSE](LICENSE).
