const fs = require("fs");
const path = require("path");

const root = __dirname;
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(`STATIC CONTRACT FAILED: ${message}`);
};

const auth = read("src/routes/auth.ts");
const studentAuth = read("src/routes/edu/studentAuth.ts");
const classAccess = read("src/services/edu/classAccess.ts");
const privacy = read("src/services/edu/dataPrivacy.ts");
const studentEntity = read("src/entities/Student.ts");
const eraseRoute = read("src/routes/edu/classStudents.ts");
const learningCatalog = read("src/services/learningCatalogService.ts");
const tasks = read("src/routes/tasks.ts");

assert(!/return res\.json\(\{\s*token\b/.test(auth), "auth success responses must not expose an access token field");
assert(!/return res\.json\(\{\s*token\b/.test(studentAuth), "student login must not expose an access token field");
assert(auth.includes("return res.json({ setupToken: pending.token, flow: pending.flow });"), "Google setup flow must retain its one-time setup token contract");
assert(classAccess.includes("withDeleted"), "student restore authorization must be able to resolve a soft-erased student");
assert(privacy.includes("softRemove(student)"), "erase must use a recoverable soft delete");
assert(privacy.includes("studentRepo().restore(student.id)"), "restore must undo the soft delete");
assert(studentEntity.includes('name: "deleted_at"'), "Student must map deleted_at");
assert(eraseRoute.includes('router.post("/students/:studentId/restore"'), "restore endpoint must be present");
assert(eraseRoute.includes('action: "student.data.restore"'), "restore must be audit logged");
assert(learningCatalog.includes("existing.status = \"IN_PROGRESS\";") && learningCatalog.includes("await enrollments.save(existing);"), "existing AVAILABLE enrollments must persist activation");
assert(fs.existsSync(path.join(root, "src/migrations/1752500000000-EnforceClassOrgNotNull.ts")), "org_id hardening migration must remain present");
assert(fs.existsSync(path.join(root, "src/migrations/1752600000000-AddStudentDeletedAt.ts")), "student soft-delete migration must be present");
assert(read("src/routes/edu/classStudents.ts").includes("writeSensitiveStudentRead"), "sensitive student reads must be audited");
assert((learningCatalog.match(/where: \{ id: itemId, isActive: true \}/g) || []).length === 3, "all direct course-item lookups must exclude inactive items");
assert(learningCatalog.includes('.createQueryBuilder("task")') && learningCatalog.includes('task.user_id = :userId') && learningCatalog.includes('task.type IN (:...legacyTypes)'), "legacy progress sync must filter tasks in SQL");
assert(tasks.includes("COURSE_PRACTICE_GENERATION_UNAVAILABLE") && tasks.includes("shouldUseGenericPersonalFallback(params.subtitle)"), "catalog practice must not use the generic AI fallback");

console.log("STATIC CONTRACT PASS: auth, student erase/restore, org hardening, sensitive-read guards, and course progress contracts");
