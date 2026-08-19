# EDU identity model — the Student/User seam (FROZEN)

> Status: **frozen** as of 2026-06-30. EDU runs a deliberate *dual* identity model. This is a settled decision, not a migration-in-progress. Read this before touching student auth, the `Student` entity, or anything that branches on `req.studentId` vs `req.userId`.

## TL;DR
- There are **two kinds of principal**: a real `User` account, and a class-scoped `Student` profile.
- A `Student` may be **shell** (`user_id IS NULL`, own generated credentials) or **User-backed** (`user_id` → a `User`).
- **Grades and submissions reference `student_id`, never `user_id`.** The `Student` row is the durable identity for academic records.
- **Do NOT mass-delete shell students.** `edu_grades.student_id → students` is `ON DELETE CASCADE` — deleting a student destroys their grade history. (As of 2026-06-30 prod: 124/125 students are shell, 29 of them carry grades.)

## The two principals

| | `User` | `Student` |
|---|---|---|
| Table | `users` | `students` |
| Scope | platform-wide account | one class (`class_id`) |
| Login | `POST /auth/login` (+ Google OAuth) | `POST /edu/student-login` |
| JWT | `{ userId, type: "USER", role, userMode }` | `{ studentId, type: "STUDENT", classId, jti }` |
| Password | `users.password` (bcrypt) | `students.generated_password` (bcrypt) |
| Modes | PERSONAL / EDUCATIONAL / CONTEST | n/a (always EDU) |

`students.user_id` is a **nullable** FK to `users` (`ON DELETE SET NULL`). It is the bridge between the two.

## Request contract (`AuthRequest`, `middleware/authMiddleware.ts`)
`authMiddleware` decodes either JWT and sets exactly one principal:
- **USER**: `req.userId` set, `req.userType === "USER"`, `req.userRole`/`req.userMode` populated, `req.studentId` undefined.
- **STUDENT**: `req.studentId` set, `req.userType === "STUDENT"`, `req.userRole === null`, `req.userMode === "EDUCATIONAL"`, `req.userId` undefined.
- `req.principalId` is the canonical id (= userId for USER, = studentId for STUDENT).

**Rule for handlers:** branch on `req.studentId` (the student-side path) vs `req.userId` (the teacher/admin/User-backed-student path). Teacher-side authorization always goes through the class authorizer (`services/edu/classAccess.ts`); it only handles USER principals. Students never carry org capabilities.

## Organization onboarding

Public EDU signup is reserved for the first administrator of an educational institution. The
flow collects the institution name/type first, then the administrator's name, optional middle
name, username, email, and password. Email verification happens before the organization is
materialized; verification creates the organization and its `ORG_ADMIN` membership atomically.

Teachers and students are created from inside the institution workspace. Teaching staff are
scoped to the classes they own; only `ORG_ADMIN` has organization-wide class visibility.

## How a Student becomes User-backed
Three forward paths create or link a `User` to a `Student` (none delete data):
1. **Individual teacher-add** → `services/edu/studentProvision.ts#provisionStudent`. Creates a `User` + User-backed `Student` + a `STUDENT` membership in the class's org. Falls back to a **shell** student if a clean account can't be made (email already a User, or no free username) so teacher-add never regresses. Generated credentials work on *both* `/auth/login` and `/edu/student-login`.
2. **Self-enrolment via join code** → `services/edu/joinCode.ts#enrollViaJoinCode`. An authenticated `User` enters a class join code and gets a User-backed roster `Student` + `STUDENT` membership.
3. **Claim** → `POST /edu/students/claim` (`services/edu/studentLink.ts#claimStudentProfile`). An authenticated `User` adopts an existing **shell** student by its generated username/password, setting `user_id`. This is the escape hatch that lets any legacy shell student become User-backed later, in place, with grades preserved.

> Org membership note: `provisionStudent` only creates the `STUDENT` membership when `cls.organizationId != null`. Since the Phase-1 org backfill (`migrations/1750900000000-BackfillClassOrg.ts`), every class has an org, so memberships are now created reliably.

## Where shell students still come from (by design)
**Bulk CSV import** (`routes/edu/classStudents.ts` → `POST /classes/:classId/students/import`) creates **shell** students directly. This is intentional: the importer supports teacher-specified usernames/passwords per row, which a generated-credential `User` account can't honor. Bulk-imported students stay shell and are **claimable later** (path 3 above).

So the forward rule is:
- **individual add / join code → User-backed**
- **bulk import → shell (claimable)**

The shell population therefore only grows via bulk import, and every shell row has a non-destructive path to becoming User-backed.

## Why frozen (not unified)
The original plan (`docs/edu-lms-plan.md`) treated shell students as disposable ("delete/recreate during migration"). That was safe when written but is **no longer true**: the platform now holds real grade history keyed on `student_id`, and the FK cascade means deleting students deletes grades. A mass Student→User migration that deletes/recreates students would lose academic records; an in-place link migration of all shells is a large, risky change for little immediate gain. So the seam is **frozen**: keep the dual model, preserve all data, let new individual students be User-backed, and link legacy shells on demand via *claim*.

## Invariants to preserve
1. **Never delete a `Student` row to "migrate" identity** — it cascades to grades. Link in place (`user_id`) instead.
2. **Academic records key on `student_id`** — do not re-point grades/submissions to `user_id`.
3. **Both login paths must keep working** — `provisionStudent` deliberately keeps `generated_username`/`generated_password` so `/edu/student-login` works for User-backed students too.
4. **Teacher-side authz uses `classAccess`** (USER principals only); students are gated by enrolment/ownership of their own data, never by org capabilities.

## If full unification is ever revisited
Do it as an **in-place link** (create a `User` per shell, set `students.user_id`, keep grades on `student_id`) — never delete/recreate. Handle username collisions (shell `generated_username` vs existing `users.username`) and email collisions (fall back to leaving the row shell). Gate it on a real product driver; today freezing is the correct call.
