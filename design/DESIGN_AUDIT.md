# StudyCod design audit and route register

**Direction:** expressive product presentation on public pages; calm task-first workspaces; global navigation at the top; preserve the real StudyCod mark, Fixel, green brand, both themes, and both supported languages.

**Release boundary:** this register describes the local redesign. It is not a production status report. No partial design release is intended. Production deployment is a separate step after the full local preview is reviewed.

## Evidence labels

- **Source** — inspected component, route, or data-state implementation.
- **Preview** — local view opened with a development-only route or fixture.
- **Role** — full scenario exercised with the relevant signed-in role.
- **Before/after** — same route, viewport, language, theme, and data captured in `design/comparisons/`.
- **Code-only** — route or interaction could be inspected in source, but the matching backend/role scenario was not available. Keep this status open until an actual role preview is exercised.

## Route and role inventory

The inventory is derived from `frontend/src/App.tsx` and the nested route trees. Dynamic IDs and query-string state are part of the screens: preserve `courseId`, `courseItemId`, `classId`, `lessonId`, `taskId`, `gradeId`, `contestId`, `problemId`, `shareId`, `tag`, and `slug`, plus search, filter, page, tab, review, auth, and development-preview parameters.

| Screen family | Routes and URL states | Role / context | Required composition and evidence |
|---|---|---|---|
| Public landing | `/` and `/?auth=login`, `/?auth=register`, `/?auth=register&audience=teacher` | Visitor; signed-in return | Short promise, one main action, product demonstration in the first view; six distinct landing sections. Both languages/themes. |
| Public product pages | `/pricing`, `/docs/*`, `/support`, `/blog`, `/blog/tag/:tag`, `/blog/:slug`, `/status` | Visitor or signed-in support user, as guarded by route | Editorial index/detail, searchable documentation, clear support form/history, understandable service status. Preserve guards and deep links. |
| Public identity and legal | `/u/:username`, `/certificate/:certificateId`, `/privacy`, `/terms`, `/cookies`, `/refunds`, `/verify-email`, `/email-preferences` | Visitor; account owner for preferences | Readable profiles, verification and legal text, clear success/error states. |
| Authentication | login/register query modes, `/auth/reset-password`, `/auth/google/complete`, `/auth/google/success`, `/auth/google/error` | Visitor | Short form-first layout, field-local errors, password and callback states. |
| Learner dashboard | `/` after authentication; `/dashboard` legacy route; `?preview=true&persona=student` in development | Personal learner | One continue action, visible next step, progress next to its course route. Initial failure and successful emptiness stay distinct. |
| Learning catalog | `/learning/catalog`, `/learn` legacy redirect, `?preview=true` in development | Personal learner | Search/catalog order, real prerequisites, enrollment status, useful empty/error/retry states. |
| Course route and practice | `/learning/course/:courseId/overview`, `/learning/course/:courseId/path`, `/learning/course/:courseId/practice/:courseItemId`, `/learning/course/:courseId/progress` | Enrolled learner | Sequential modules, clear current step, persistent IDE state, actual result, next action. Preserve course query/deep-link behavior. |
| Task library and solver | `/lab/library`, `/library` legacy redirect, `/lab/library/solve/:taskKey`, `/library/solve/:taskKey`, `?q`, `?difficulty`, `?language`, `?status`, `?page`, `?from` | Learner; task author/moderator for “My materials” | Search and result count above compact task list. Mobile filters open separately. Preview and solve preserve filter state. |
| Sandbox and shared code | `/lab/playground`, `/playground`, `/playground/:shareId`, `/lab/practice`, `/replay/:id` | Learner; share owner for saved code | Shared IDE controls, no condition tab where none exists, accurate load/save/share states. |
| Teacher dashboard and classes | `/edu`, `/edu/classes/:classId`, `/edu/classes/:classId/manage`, `/edu/classes/:classId/live`, `/edu/classes/:classId/appeals` | Teacher; organization admin where allowed | Review queue first; compact class list; class-specific contextual tabs and live/access/error states. |
| Teacher materials and courses | `/edu/courses`, `/edu/courses/:courseId`, `/edu/classes/:classId/topics/new`, `/edu/classes/:classId/lessons/new`, `/edu/topics/:topicId`, `/edu/library`, `/edu/library/solve/:taskKey`, `/edu/control-works/:controlWorkId` | Teacher / content author | Forms grouped by task, local validation, save status, compact searchable materials. Preserve builder semantics and drafts. |
| Teacher grading | `/edu/classes/:classId/gradebook`, `/edu/classes/:classId/summary-grades`, `/edu/classes/:classId/gradebook-config`, `/edu/classes/:classId/attendance`, `/edu/classes/:classId/similarity`, `/edu/lessons/:lessonId/quiz/review`, `/edu/manual-tasks/:taskId/submissions`, `/edu/classes/:classId/appeals` | Teacher; organization admin where allowed | Keep gradebook/results as tables. Review answer → criteria → grade → feedback. Keep filters, row identity, export, and selected-review state. |
| Student and parent EDU | `/edu/lessons`, `/edu/lessons/:lessonId`, `/edu/lessons/:lessonId/quiz`, `/edu/tasks/:taskId`, `/edu/journal`, `/edu/grades/:gradeId`, `/edu/appeals`, `/edu/parent`, `/edu/tutor` | Student; parent | Next work, deadlines, results, and feedback. Never expose teacher tools to the student/parent context. |
| EDU shared/organization | `/edu/calendar`, `/edu/join`, `/edu/organization`, `/edu/docs`, `/edu/profile`, `/invite/:token` | Teacher, student, organization admin, invitee | Role-aware context, compact member lists/forms, schedule and invite states. Preserve redirect and access rules. |
| Contest lobby | `/contest/contests` with `phase`, `q`, `sort`, `difficulty`, `page`, and `saved` | Participant, teacher/organizer, contest-only account | Distinct live/upcoming/finished filters, search, clear status and join/create actions. Use actual contests and permission state. |
| Contest detail and solve | `/contest/contests/:id`, `/contest/contests/:id/problems/:problemId`, `/contest/entry/:id` | Participant or organizer | Status/time/action, task route, announcements; shared IDE for solving; preserve entry/auth constraints. |
| Contest management and events | `/contest/contests/:id/manage` with management tabs; nested manage routes in `ContestSectionNav`; `/contest/certificates/*` | Organizer/teacher | Independent event setup, participant accounts, tasks, submissions, announcements, certificates, and management status. Inspect each tab and permission. |
| Contest scoreboard | `/contest/contests/:id/scoreboard`, `/contests/:id/scoreboard` legacy redirect | Participant; organizer | Title/status/filter and jump-to-self above a semantic table. Keep freeze/release explanation; no podium block ahead of results. |
| Platform administration | `/admin`, admin shell; tabs `overview`, `people`, `classes`, `materials`, `library`, `judge`, `maintenance`, `broadcast`, `mailbox`, `certificates` | System admin | Surface actual issues and required action before secondary metrics. Searchable tables and focused details for every tab. |
| Profile and certificates | `/profile`, `/profile/certificates`, `/iad`, `/difus` legacy redirect | Account owner; educational context if available | Personal details, learning results, certificates, and settings. Context switches retain role and route. |
| System and content tools | `/support/desk`, `/blog/admin`, `/__dev/editor`, `/__dev/collab`, `/playground` share states, maintenance and geo-block states | Support/admin; developer-only tools only in development | Preserve exact access gate. Clear action, status, and error states. Development preview data must never reach production. |
| Not-found and catch-all | `*` inside the route trees | Any role | Explain the unavailable page and offer a valid route without losing locale or authenticated context. |

## Reference set

All 29 one-screen references are in [design/references/redesign-2026-10](references/redesign-2026-10/README.md). It includes the brand board, six public landing sections, twelve desktop screens, and ten mobile screens. The older left-rail boards have been superseded. Generated samples are composition-only; the shipped logo, Fixel, API data, and semantic tokens remain authoritative.

## Local implementation register

| Priority | Finding and source evidence | Intended fix | Current local status |
|---|---|---|---|
| P1 | The deployed workspace design previously placed global navigation in a left rail. The source was `PremiumWorkspaceShell.tsx`, `PremiumModuleShell.tsx`, and their shared shell styles. | Global top navigation at 64/56px; remove rail and its reserved margin; mobile uses the same header menu. | Implemented locally in shared shells. All nested routes still require route and viewport preview. |
| P1 | Learner dashboard repeated the same continue action in a course hero and a second “next stop” section. | One compact course header and one next-step action; progress and upcoming items immediately follow. | Implemented locally in `PersonalCourseDashboard.tsx`; verify with provider success/empty/error/retry states. |
| P1 | Teacher home led with a presentation banner before review work. | Put pending reviews first, then class list; keep create-class action available and use the shared accessible modal. | Implemented locally in `TeacherWorkspacePage.tsx`; backend/role workflow requires preview. |
| P1 | The library used a large promotional heading, animated statistic tiles, two-column task cards, and a side preview that reduced list space. | Compact title, search and result count, compact task rows; mobile filters in a separate disclosure panel; keep preview/detail behavior. | Reworked locally; confirm current URL parameters, author tools, and phone layout. |
| P1 | Mobile IDE visibility depended on a fixed height that did not use the global header height. | Keep the existing condition/code/result state model and mounted Monaco; calculate available height from the 56/64px shell header and safe area. | Adjusted locally. Keyboard-open, 320/390px, result arrival, cursor, undo, language, and input still require manual device/browser verification. |
| P1 | Skip-link, focus, and data-state fixes from the prior pass are useful and remain required. | One main landmark, useful skip target, shared Modal behavior, and distinct load/error/empty/stale states. | Existing implementations retained. Run a route-level audit after the route preview. |
| P2 | Shared EDU pages repeated large, tinted PageHero blocks and embedded metric cards. | Compact title/action header and inline statistics; keep data tables and forms structurally clear. | PageHero updated locally; custom EDU pages still require route review. |
| P2 | Admin had a large overview banner and chunky tab cards. | Compact title, simple contextual tabs, attention-focused overview. | Header/tabs updated locally; each admin tab and data error state still requires review. |
| P2 | Scoreboard used motion and a podium above the table, delaying the results. | Put status, filter, and jump-to-self above the semantic table; remove decorative podium reveal. | Updated locally; verify freeze, hidden, empty, live, and organizer scenarios. |
| P2 | Some touched teacher and task-library copy referred to “old clutter,” “preview,” or backend implementation. | Name a user task in Ukrainian/English and keep technical labels limited to programming concepts. | Updated in touched views; remaining routes require a text sweep. |
| P2 | Repeated list/section transitions and live/counter motion distract from frequent work. | Apply Emil/Jakub/Jhey frequency policy with reduced-motion end states. | Shared motion guidance and IDE/library changes in progress; use the linked HTML motion audit and inspect remaining pages. |

## Verification and comparison ledger

Record one row for each route above after it is opened. “Source” or a successful build alone does not count as a completed visual/role check.

| Route / persona | Width | Theme + language | Data state | Evidence | Status |
|---|---:|---|---|---|---|
| Preview ledger is populated during final local walkthrough. | 320, 390, 768, 1024, 1366, 1920 | Dark/light × uk/en | Loading, success, empty, first error, stale/retry, denied | Before/after screenshot and keyboard/reduced-motion notes | Open until captured |

### Partial local evidence (2026-10-10)

These checks are development previews with isolated fixtures. They are evidence for the rows below only; they do not complete the route audit or release comparison.

| Route / persona | Viewport and appearance | What was verified | Status / remaining evidence |
|---|---|---|---|
| `/learning/catalog?preview=true&persona=personal` | 320×740 and 390×844; dark; English and Ukrainian | Search, level filter, three seeded courses, top navigation and language switch; document width did not exceed the 320px viewport. | Preview only. Need light mode, remaining widths, loading/error/empty states, matched before/after captures. |
| `/learning/course/601/practice/6102?preview=true&persona=personal` | 320×740; dark; Ukrainian | Condition/code/result tabs; Monaco remains mounted; compact stdin disclosure; Run returns `2 7`; Check returns AC 6/6; both primary buttons fit within the viewport. A passing demo submission persists through a full route navigation, updates progress to 50%, and unlocks the next topic. | Preview only. Need 390/768/1024/desktop, keyboard-open, save/undo/cursor persistence, reduced motion, matched capture. |
| `/edu/journal?preview=true&persona=student` | 874px browser viewport; dark; Ukrainian | Student context, grade summary, next lesson, and positive-ID local lesson links. | Preview only. Need other widths/themes/language, empty/error/retry behavior, matched capture. |
| `/edu/parent?preview=true&persona=parent` | 874px browser viewport; dark; Ukrainian | Parent-specific top navigation and local child grades; preview data is returned before API access. | Preview only. Need English/light mode, no-children/error states, actual parent role, matched capture. |
| `/edu/classes/31/gradebook?preview=true&persona=teacher` | 1366×900; dark; Ukrainian | Semantic grade table, sticky student column/header, focused grade editing through shared Modal; Escape closes and restores focus to the edited grade cell. | Preview only. Need saving, filter states, narrow-table behavior, other themes/languages, matched capture. |
| `/edu/classes/31?preview=true&persona=teacher` | 874px browser viewport; dark; Ukrainian | Compact class overview, contextual tabs, and recent lessons. | Preview only. Need class-management and lesson-creation role workflows, other widths/themes/language, matched capture. |
| `/` | 320, 390, 768, 1024, 1366, 1920px; dark/Ukrainian and light/English | Top navigation; product cycle and primary action; six core product sections; example panels are labeled and use no invented counts, percentages, or names. Document width stayed within the viewport at every tested width. | Preview only. Need keyboard/reduced motion and matched before/after captures. |
| `/learning/catalog?preview=true&persona=personal` | 320, 390, 768, 1024, 1366, 1920px; dark/Ukrainian and light/English | Search, level filter, three seeded courses, prerequisites, course switching, top navigation, and locale/theme controls. Document width stayed within the viewport at every tested width. | Preview only. Need loading/error/empty/retry states, keyboard/reduced motion, and matched before/after captures. |
| `/edu?preview=true&persona=admin` | 874×1080; dark/Ukrainian and light/English | Top navigation and horizontal admin sections; explicit local-demo banner; aggregate and service metrics are absent when unavailable; quick actions stay visible; labels switch with locale. | Preview only. Need 320px admin navigation, route checks for all tabs, role access, and matched before/after capture. |
| `/contest/contests?preview=true&persona=contest` | 882×1084; dark; Ukrainian | Demo mode is labeled; live/upcoming/finished filters, search, sort, difficulty, result count, and three local contest cards are visible. | Local fixture preview only. Verify independent filters/deep links, English/light, mobile, and matched before/after capture. |
| `/contest/contests/102?preview=true&persona=contest` | 882×1084; dark; Ukrainian | Contest status, time remaining, join state, task list, and scoreboard path are present; demo account and local fixtures stay on the preview URL. | Local fixture preview only. Need organizer/participant access variants, mobile, English/light, and matched before/after capture. |
| `/contest/contests/102/problems/501?preview=true&persona=contest` | 882×1084; dark; Ukrainian; narrow IDE mode | Condition/code/result tabs; local run returns `2 7`, submit returns AC for three fixture tests; task, cursor/status, and demo URL remain in place. | Local fixture preview only. Need 320/390px keyboard-open and persistence, reduced motion, actual participant role, and matched before/after capture. |
| `/contest/contests/102/scoreboard?preview=true&persona=contest` | 882×1084; dark; Ukrainian | Local fixture table loads without API; demo label replaces the live-update claim; searchable semantic table with rank, participant, problems, total, and penalty. | Local fixture preview only. Need freeze/release/empty cases, narrow table, English/light, and matched before/after capture. |
| `/edu/tasks/111?preview=true&persona=student` | 1366px; dark; Ukrainian | Student task fixture opens the shared IDE with condition, code, task status, and results; exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Need student role session, mobile keyboard, and matched before/after capture. |
| `/edu/topics/101?preview=true&persona=teacher` | 1366px; dark; Ukrainian | Topic route opens the seeded teacher workspace; exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Need authoring/save workflow, mobile, other theme/language, and matched before/after capture. |
| `/edu/classes/31/live?preview=true&persona=teacher` | 1366px; dark; Ukrainian | Live-class route opens seeded lesson controls; exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Need live role workflow and connection states, mobile, other theme/language, and matched before/after capture. |
| `/edu/parent?preview=true&persona=parent` | 1366px; dark; Ukrainian | Parent dashboard loads under parent context and has exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Need 320/390px, English/light, no-child/error states, and matched before/after capture. |
| `/edu/classes/31/gradebook?preview=true&persona=teacher` | 1366px; dark; Ukrainian | Gradebook route loads the seeded table and has exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Existing keyboard/focus evidence above; need mobile and matched before/after capture. |
| `/?app=admin&preview=true&persona=admin` | 1366px; dark; Ukrainian | Admin overview loads with explicit local-demo data and exactly one main landmark; no horizontal document overflow. | Local fixture preview only. Need nested admin tabs, mobile, role access, and matched before/after capture. |
| `/profile/certificates` | 320px; dark; Ukrainian | Context tabs remain a single horizontal row, certificate details use neutral surfaces, and UI language follows the app locale. | Local preview only. Need 390px, light/English, empty/error states, and matched before/after capture. |
| Shared mobile navigation | 320px and 390px; dark; Ukrainian; EDU and standalone shells | Global navigation stays at the top, no fixed bottom navigation or left rail remains, account/language controls stay in the viewport, and the menu closes on Escape with focus returned to its trigger. | Preview interaction checked. Need light/English, remaining widths, keyboard-only sweep, and matched before/after capture. |

No matched screenshots are currently stored in `design/comparisons/`; those acceptance items remain open. Preview fixtures and route checks above are not claims of authenticated production-role coverage.

### Technical verification (2026-10-10)

- `npm run typecheck` — passed.
- `npm test -- --run` — 4 test files and 12 tests passed, including persisted learning-preview progress and all six learning data states.
- `npm run build` — passed; the production lazy-boundary check found no Monaco preload and stayed within the initial-JavaScript and Monaco chunk budgets.
- `git diff --check` — passed.
- Browser route smoke — `/edu/tasks/111`, `/edu/parent`, `/edu/topics/101`, `/edu/classes/31/live`, `/edu/classes/31/gradebook`, and the admin preview each rendered one main landmark without horizontal document overflow at 1366px.
- A production build does not replace the open visual audit items above. Role-only routes, all six widths across all screen families, and matched before/after captures remain open.

## Acceptance criteria

- Global navigation is at the top in every shell. No persistent rail, reserved rail width, or bottom global nav remains.
- All routes, query states, role-only routes, nested tabs, and dynamic IDs in the inventory are opened or explicitly marked **code-only** with the reason.
- At all six target widths, the page stays within the viewport except for intentional table/code scrolling. Check 200% zoom, keyboard-only use, both themes/languages, and reduced motion.
- Learner cycle: dashboard → lesson → IDE → run → result → next step. EDU cycle: class → task → student response → review → gradebook. Contest cycle: entry → task → submit → scoreboard.
- Test data states separately. Never show “empty” when the request failed; preserve usable stale data and retry feedback after refresh failures.
- Confirm one main landmark, skip-link focus, Escape, focus restoration, status text, 44×44 mobile targets, and text contrast of at least 4.5:1 (3:1 for large text).
- Capture matched before/after screenshots for public, learning, library, IDE, teacher, student, gradebook, contest, scoreboard, admin, and mobile families.
- Run behavior tests, typecheck, full production build, and the existing production lazy-boundary assertion before presenting the complete preview.
- Only after review of that complete preview may a single coordinated change be pushed and production deployment monitored. Verify the live artifact against its source commit and inspect the resulting production screens; a green deploy status is not visual acceptance.
