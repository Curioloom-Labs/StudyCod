# StudyCod — системний аудит платформи курсів

Дата аудиту: 2026-08-13  
Режим: read-only static review + локальні build/unit/contract checks  
Scope: Personal learning, EDU та спільні auth/API/БД/judge/AI-компоненти, лише там, де вони впливають на курсні сценарії.

## 1. Scope guard

Не оцінювалися і не змінювалися:

- семантична якість теорії, формулювання уроків і задач;
- файли `theories/`, `topics/` та навчальний контент;
- зміст curriculum як освітнього матеріалу.

Перевірялися лише системні контракти: доступ, збереження, призначення, прогрес, оцінки, API, рольові межі, інфраструктурні залежності та системний UX.

## 2. Executive summary

Платформа курсів є функціонально широкою й збирається успішно. Основний ризик зараз — не відсутність базових LMS-функцій, а залишкова неузгодженість між кількома authorization/identity шляхами.

Найважливіші результати:

- backend unit suite: **397 passed, 0 failed, 6 skipped** із 403 тестів;
- frontend production build: **успішно**, 3927 модулів transformed;
- інвентаризація: **23 EDU routers, 52 EDU pages, 35 EDU services, 166 route declarations, 93 mutation routes**;
- RBAC для class-level дій уже централізований і enforcing, але org/course routes все ще мають окремий прямий membership helper;
- знайдено P1-ризик подвійного bearer-token storage: token повертається API і зберігається в `localStorage`, хоча вже існує httpOnly cookie;
- live classroom має коректний Redis path, але production correctness залежить від того, чи Redis гарантовано увімкнений і доступний;
- DB contract та judge contract не пройшли через відсутні середовищні залежності, тому частина schema/runtime висновків має статус `unverified`.

P0-вразливостей із доступними доказами не підтверджено. До початку feature expansion рекомендовано закрити P1 authorization/token/live/data-loss ризики.

## 3. Покриття системи

| Контур | Перевірені поверхні | Статус |
|---|---|---|
| Personal learning | catalog, enrollment, roadmap/progress, task/practice APIs, shared auth | перевірено статично та через backend/frontend builds |
| EDU course templates | courses, modules, items, publish, fork/assign, pull updates | перевірено статично; org policy має окремий auth path |
| EDU class learning | lessons, tasks, quizzes, attempts, assignments, student views | перевірено статично та unit tests |
| Gradebook | EduGrade, SummaryGrade, control/manual grading, appeals, reports | перевірено статично та unit tests; DB indexes unverified |
| Enrollment/identity | User, shell Student, User-backed Student, join code, claim, invitations | перевірено; dual model задокументована як frozen |
| Live classroom | LiveKit routes, live state, code/challenge/breakout/copilot | перевірено статично та service tests; multi-replica runtime unverified |
| Shared execution | judge worker integration, rate limits, retry behavior | unit tests pass; nsjail contract blocked |
| System UX | route guards, role routing, lazy chunks, loading/error paths | source/build review; no browser accessibility run |

## 4. Findings

### P1 — S1: bearer tokens залишаються доступними через localStorage

**Status:** open  
**Impact:** XSS або скомпрометований frontend-код може викрасти 30-денний bearer token і використовувати його поза браузером.

**Evidence:**

- backend видає httpOnly cookie через `backend/src/utils/authCookie.ts`;
- backend також повертає `token` у login/student-login response;
- `frontend/src/lib/api/auth.ts`, `frontend/src/lib/api/edu.ts` і `frontend/src/lib/api/client.ts` записують/читають `localStorage["token"]`;
- interceptor продовжує додавати `Authorization: Bearer ...`.

**Assessment:** cookie hardening уже присутній, але security boundary не є cookie-only. Це не теоретичний ризик: обидва канали реально використовуються в поточному коді.

**Recommendation:** окремим implementation change перейти на один auth transport для web-клієнта, бажано cookie-only; видалити token з response та localStorage після сумісного перехідного періоду. Додати regression test, який забороняє повернення/збереження web bearer token.

### P1 — A1: authorization policy розщеплена після часткового RBAC cutover

**Status:** partial  
**Impact:** різні ролі можуть отримувати різну поведінку для однакової операції; platform `SYSTEM_ADMIN` bypass працює для class-level access, але не є узгодженим для org/course operations.

**Evidence:**

- `backend/src/services/edu/classAccess.ts` має централізований `authorizeClassAction` із owner/org-role logic та `SYSTEM_ADMIN` bypass;
- `backend/src/middleware/orgContext.ts` описує guard як enforcing і deny-on-error;
- `backend/src/routes/edu/courses.ts` та `backend/src/routes/edu/orgs.ts` мають власний `requireOrgCapability`, який перевіряє лише `getUserOrgRole()` і `roleCan()`, без `req.userRole === "SYSTEM_ADMIN"`;
- окремі read paths досі використовують owner-only selection, наприклад `agenda.ts` отримує класи через `teacher.id = req.userId`.

**Assessment:** попередній finding “RBAC inert/fail-open” для class-level guard фактично виправлено, але cutover не завершений для всіх ресурсів. Це `partial`, а не `fixed`.

**Recommendation:** зафіксувати єдину policy для global admin і org roles; протягнути один resolver на org/course/agenda paths; додати route-level matrix tests для owner, ORG_ADMIN, TEACHER, ASSISTANT, STUDENT, PARENT і SYSTEM_ADMIN.

### P1 — R1: live classroom correctness залежить від Redis configuration

**Status:** conditional open  
**Impact:** при multi-replica deployment із Redis disabled/unavailable live code, challenge або breakout state живе в process-local Map і може бути різним на різних replica.

**Evidence:**

- `backend/src/services/edu/liveStateStore.ts` має Redis mode і explicit in-memory fallback через `memStores`;
- fallback є коректним для single-node/dev, але не має міжпроцесної синхронізації;
- service tests перевіряють round-trip/TTL/eviction, але не multi-replica behavior;
- production contract environment у цьому запуску не перевірявся.

**Recommendation:** production readiness check має fail closed або блокувати live features, якщо Redis required, а health endpoint має показувати фактичний state backend. Додати integration test із двома process instances і Redis.

### P1 — D1: student erase є незворотним cascade deletion академічних даних

**Status:** intentional but high-risk  
**Impact:** видалення `Student` каскадно видаляє `EduGrade`, `SummaryGrade`, links та інші student-owned records. Помилковий або надто широкий виклик означає втрату grade history.

**Evidence:**

- `backend/src/services/edu/dataPrivacy.ts` прямо викликає `studentRepo().remove(student)`;
- `backend/src/entities/Student.ts`, `EduGrade.ts` і `SummaryGrade.ts` мають `onDelete: "CASCADE"`;
- endpoint `POST /students/:studentId/erase` доступний через `STUDENT_MANAGE` і аудитується, але не має restore/soft-delete механізму.

**Assessment:** це може бути правильним GDPR/FERPA erase operation, але його destructive contract має бути явним. Документ frozen identity model правильно забороняє видаляти Student для міграції, тому erase не можна використовувати як migration shortcut.

**Recommendation:** додати explicit confirmation/idempotency contract, privileged-operation monitoring і перевірку, що endpoint не використовується для звичайного roster management. Для міграцій — тільки in-place link.

## 5. P2 findings

### P2 — A2: global role routing і multi-org context не завершені

**Status:** open  
`frontend/src/App.tsx` визначає teacher/student переважно через `user.userMode` та truthiness `user.studentId`. Це не моделює користувача, який одночасно є student в одному класі та teacher/assistant в іншому. Backend підтримує dual identity і кілька memberships, але frontend не має повноцінного org/role switcher.

### P2 — U1: agenda не враховує org-level teaching staff

**Status:** open  
`backend/src/routes/edu/agenda.ts` для USER principals завантажує класи, де користувач є `teacher`, плюс enrolled student classes. `ORG_ADMIN`/`ASSISTANT` класи, доступні через `classAccess`, не потрапляють до agenda автоматично. Це створює розбіжність між sidebar access і фактичним calendar data.

### P2 — P1: N+1 у student course lesson response

**Status:** open  
`backend/src/routes/edu/students.ts` проходить course lessons/tasks і для кожного task виконує окремий `findOne` для останньої оцінки та `count` спроб. На великих курсах це O(tasks) DB round-trips на один student request.

### P2 — P2: N+1 при завантаженні course tree/update data

**Status:** open  
`backend/src/services/edu/courses.ts`, `courseFork.ts` і `coursePull.ts` завантажують items окремими запитами для кожного module. У gradebook вже є batch-loading, але аналогічний підхід не поширений на course tree.

### P2 — D2: індекси grade hot paths не доведені contract-перевіркою

**Status:** unverified/open  
У сутностях немає явних composite indexes для основних запитів `edu_grades`/`summary_grades`; міграції, знайдені статично, не підтверджують повне покриття шляхів `student_id`, `topic_task_id`, `class_id` і `created_at`. Частина FK може мати implicit DB indexes, але це не замінює перевірку execution plan.

**Blocked evidence:** DB contract не запускався без `DB_CONTRACT_DATABASE_URL`.

### P2 — S2: audit logging покриває переважно mutations/export/denials, не всі sensitive reads

**Status:** partial  
У EDU routes знайдено 18 викликів `writeAudit`; вони покривають важливі mutation flows, export і RBAC denial. Для звичайних успішних переглядів student profile/grades/code немає системно підтвердженого data-access journal. Це потрібно вирішити політикою: які reads справді audit-required, який retention і як не логувати секрети/код у metadata.

### P2 — R2: frontend route guards не замінюють backend authorization

**Status:** accepted design, requires regression coverage  
`teacherOnly`/`studentOnly` у `App.tsx` корисні для UX, але доступ до resource routes контролюється backend. Потрібна повна negative-route матриця, бо 93 mutation endpoints не можуть вважати UI guard достатнім boundary.

## 6. P3 observations

- Frontend lazy loading працює, але build показує великі editor chunks: Monaco chunks до приблизно 1 MB raw, LiveKit client близько 506 kB raw. Це не blocker, але потребує budget і runtime measurement на слабкому пристрої.
- Accessibility у source частково врахована (`aria-label`, focus-visible, keyboard handlers), але немає виконаного browser axe/keyboard pass для Modal, Live Classroom, Monaco і Breakout flows.
- Backend unit coverage сильна для pure services і middleware, але не замінює DB-backed endpoint tests для cross-org, parent/student-data і multi-replica сценаріїв.

## 7. Baseline status попереднього EDU-аудиту

| Baseline item | Статус на 2026-08-13 | Коментар |
|---|---|---|
| W1 dual authorization model | partial | class-level resolver/load-bearing guard є; org/course/agenda paths ще розділені |
| W2 dual identity | fixed as explicit policy | seam frozen у `docs/edu-identity-model.md`; residual complexity accepted |
| W3 no central class resolver | fixed for class-level, partial overall | `classAccess.ts` є, але не всі resource families через нього проходять |
| W4 User.role vs OrgRole overlap | partial/open | class-level SYSTEM_ADMIN bypass і membership RBAC співіснують без єдиного org resolver |
| D1 nullable `org_id` | open | `Class`/`Course` nullable; backfill migrations є, NOT NULL cutover не підтверджено |
| D2 index coverage | unverified/open | DB contract не запущено; потрібні schema/explain checks |
| D3 generated password hashing | fixed | password generation path хешує значення через bcrypt; plain value використовується transiently |
| S1 RBAC shadow/fail-open | fixed for class guard, partial overall | `orgContext.ts` deny-on-error; direct org/course helper remains |
| S2 mutation owner/role gates | partial | багато route checks є, але повна endpoint matrix не має DB-backed proof |
| S3 student JWT storage | open | httpOnly cookie додано, але token body/localStorage залишені |
| S4 upload boundaries | mostly fixed | zip/image validators і path guards присутні; manual upload expansion потребує окремого pass |
| S5 audit logging | partial | mutation/export/deny logging є; successful sensitive reads не систематизовані |
| P1 live state | partial | Redis store є, але in-memory fallback лишається можливим у production misconfiguration |
| P2 grading conversion | unverified | потрібен DB-backed lock/scale test |
| P3 count/N+1 | partial | gradebook batch-fixed; student/course tree N+1 залишився |
| P4 frontend bundles | measured | lazy chunks є; budget/accessibility follow-up потрібні |

## 8. Verification results

| Перевірка | Результат | Примітка |
|---|---|---|
| `backend: npm test` | PASS | build + Node test runner: 403 tests, 397 pass, 0 fail, 6 skipped |
| `frontend: npm run build` | PASS | Vite production build, 3927 modules transformed |
| `backend: npm run test:judge-contract` | BLOCKED | `NSJAIL_PATH does not exist: /usr/bin/nsjail` |
| `backend: npm run test:db-contract` | BLOCKED | `DB_CONTRACT_DATABASE_URL is required` |
| browser E2E/accessibility | NOT RUN | no running app/test environment was provided |
| production/multi-replica live test | NOT RUN | no production-like Redis/LiveKit environment was provided |

## 9. Prioritized implementation backlog

### P1

1. Визначити й реалізувати єдиний web auth transport; прибрати довгоживучі bearer tokens із localStorage.
2. Завершити authorization cutover: один resolver для class/org/course/agenda, із явною політикою SYSTEM_ADMIN.
3. Зафіксувати Redis requirement для live classroom у production health/readiness checks і перевірити двома процесами.
4. Захистити destructive student erase операцію: explicit confirmation, monitoring, idempotency/restore policy.

### P2

1. Додати org/role context у frontend і виправити agenda для org-level teaching staff.
2. Batch-load student lesson grades/attempt counts і course tree items.
3. Виконати DB contract + `EXPLAIN` перевірки grade/course hot paths; додати відсутні indexes лише за результатами вимірювання.
4. Визначити policy та coverage для successful student-data reads у audit log.
5. Додати endpoint-level negative tests для cross-class, cross-org, cross-mode і dual-identity flows.

### P3

1. Встановити bundle budgets для Monaco/LiveKit та перевірити cold-load performance.
2. Провести browser accessibility pass для Modal, Live Classroom, Breakout, gradebook і editor flows.

## 10. Acceptance criteria для повторного аудиту

- усі 93 mutation routes мають зафіксований authorization path і negative test;
- одна policy/resolver покриває class, course, organization, agenda та student-data operations;
- web token не зберігається в localStorage і не повертається в API response без обґрунтованої legacy-потреби;
- live production readiness відмовляє при відсутньому required Redis;
- DB contract проходить на окремій test DB і підтверджує FK/index/execution-plan assumptions;
- erase flow має документований destructive contract і перевірений audit trail;
- frontend role/org context підтримує одночасні memberships без глобального `studentId` shortcut;
- повторні backend/frontend builds і unit/contract suites проходять;
- теоретичний контент і файли `theories/` залишаються поза scope.

## 11. Публічні API та зміни

Цей аудит не змінював API, типи, схему БД, міграції, курси або теоретичний контент. Рекомендації вище є backlog для окремих implementation tasks.

## 12. Remediation status (2026-08-13)

Після read-only аудиту виконано окремий remediation change. Поточні статуси baseline findings:

| Finding | Поточний статус | Доказ |
|---|---|---|
| S1 web JWT storage | partial | frontend більше не читає/пише token у localStorage і не додає Bearer header; legacy token fields у response залишені для compatibility |
| A1 auth policy split | fixed in code | org/course helpers використовують authorizeOrgAction із SYSTEM_ADMIN bypass; agenda враховує org-level teaching staff |
| R1 live state | fixed conditionally | production live endpoints fail closed з LIVE_CLASSROOM_STATE_UNAVAILABLE без готового Redis |
| D1 destructive erase | partial | додано explicit body confirmation: confirm=true; restore/soft-delete не є частиною цього change |
| U1 agenda org staff | fixed in code | org memberships із CLASS_VIEW додаються до viewable class set |
| P1/P2 N+1 | fixed in code | student grades/attempts batch-loaded; course tree/fork/pull relations batch-loaded |
| D2 grade indexes | partial | додано entity indexes і idempotent migration; DB contract/EXPLAIN не запускалися |

Залишилися окремими implementation/verification items: frontend multi-org/dual-role context (A2), успішні sensitive-read audit policy (S2), org_id NOT NULL cutover, DB contract/EXPLAIN, judge contract із nsjail і browser/multi-replica checks.

Після remediation перевірки: backend suite — 405 tests, 399 passed, 0 failed, 6 skipped; frontend production build — PASS, 3927 modules transformed. Теоретичний контент і файли theories/ remediation change не змінював.

## 13. Remediation follow-up (2026-08-13)

- Dual-role/multi-org: `/profile/me` now exposes explicit `eduContexts`; student context is activated only through a server-validated `X-StudyCod-Edu-Student` linked to the current User. The EDU shell provides a staff/student context switcher.
- Sensitive reads: roster, gradebook, student work and manual-submission file reads use `writeSensitiveStudentRead`; audit metadata excludes code, payloads, filenames and file contents.
- Tenant boundary: `EnforceClassOrgNotNull` fails closed on orphan classes before enforcing `classes.org_id NOT NULL`, and restores the class FK with `ON DELETE RESTRICT`.
- Still unverified because the local dependencies are absent: DB contract/EXPLAIN (`DB_CONTRACT_DATABASE_URL`), judge contract (`/usr/bin/nsjail`), and browser/multi-replica checks.
- Recheck: backend suite PASS (405 tests, 399 passed, 0 failed, 6 skipped); frontend build PASS (3928 modules transformed); `git diff --check` PASS. No theory or `theories/` files were modified by remediation.
## 14. Remediation completion check (2026-08-13)

- Auth transport: completed for normal login, contest login, student login, Google completion and email verification responses. Successful sessions are established through the httpOnly cookie; the Google account-setup exchange intentionally keeps a short-lived `setupToken` in memory until setup is completed. Legacy query-token rejection remains in the setup page for compatibility safety.
- Student erase: completed as a reversible soft-delete contract. `confirm=true` is required, `students.deleted_at` is added by migration, grades/links are retained, restore is separately authorized and confirmed, and both actions write audit events.
- Automated checks: `test:static-contract` passes. `test:browser-contract` is available and reports `UNVERIFIED` unless `BROWSER_CONTRACT_BASE_URL` is supplied; with `BROWSER_CONTRACT_REQUIRED=1` it fails closed.
- Verification: backend `npm test` PASS (405 tests, 399 passed, 0 failed, 6 skipped); backend build PASS; frontend build PASS (3928 modules transformed); `git diff --check` is required before handoff.
- Runtime checks remain `unverified`, not fixed by assumption: DB contract needs `DB_CONTRACT_DATABASE_URL` and judge contract needs a real `nsjail` binary. This workspace has neither; no production database or theory files were touched.
