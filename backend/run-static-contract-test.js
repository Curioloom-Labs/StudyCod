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
const studentProvision = read("src/services/edu/studentProvisionBatch.ts");
const studentRoster = read("src/services/edu/studentRoster.ts");
const learningCatalog = read("src/services/learningCatalogService.ts");
const tasks = read("src/routes/tasks.ts");
const authMiddleware = read("src/middleware/authMiddleware.ts");
const courseTasks = read("src/routes/edu/courseTasks.ts");
const safeAICall = read("src/services/ai/safeAICall.ts");
const lessonQuiz = read("src/routes/edu/lessonQuiz.ts");
const portfolio = read("src/routes/portfolio.ts");
  const portfolioSkills = read("src/data/portfolioSkills.ts");
  const portfolioWorkSkillsMigration = read("src/migrations/1793600000000-AddPortfolioWorkSkills.ts");
const portfolioEvidenceSources = read("src/services/portfolioEvidenceSources.ts");
const portfolioSourcedEvidenceMigration = read("src/migrations/1793700000000-CreatePortfolioSourcedEvidence.ts");
const portfolioProfileTechnologiesMigration = read("src/migrations/1793800000000-AddPortfolioProfileTechnologies.ts");
const portfolioAvatarVisibilityMigration = read("src/migrations/1793900000000-AddPortfolioAvatarVisibility.ts");
const portfolioEvidenceOrderMigration = read("src/migrations/1794000000000-AddPortfolioEvidenceOrder.ts");
const portfolioEvidencePackSkillsMigration = read("src/migrations/1794300000000-AddPortfolioEvidencePackSkills.ts");
const dbContractBootstrap = read("run-db-contract-bootstrap.js");
const dbContractRunner = read("run-db-contract-test.js");
const portfolioDashboard = read("../frontend/src/pages/portfolio/PortfolioDashboardPage.tsx");
const portfolioEvidencePackPage = read("../frontend/src/pages/portfolio/EvidencePackPage.tsx");
const portfolioApi = read("../frontend/src/lib/api/portfolio.ts");
const portfolioPublicPage = read("../frontend/src/pages/portfolio/PublicPortfolioPage.tsx");
const portfolioProjectPage = read("../frontend/src/pages/portfolio/PortfolioProjectsPage.tsx");
const premiumWorkspaceShell = read("../frontend/src/components/layout/PremiumWorkspaceShell.tsx");
const appRoutes = read("../frontend/src/App.tsx");
const server = read("src/index.ts");
const portfolioProjectsApi = read("../frontend/src/lib/api/portfolioProjects.ts");
const portfolioProjects = read("src/routes/portfolioProjects.ts");
const assessCompanies = read("src/routes/assessCompanies.ts");
const assessCompaniesApi = read("../frontend/src/lib/api/assessCompanies.ts");
const assessDashboard = read("../frontend/src/pages/assess/AssessDashboard.tsx");
const assessInterviews = read("src/routes/assessInterviews.ts");
const assessInterviewKit = read("src/services/assessInterviewKit.ts");
const assessInterviewLanguage = read("src/services/assessInterviewLanguage.ts");
const growthProjectQueue = read("src/services/growthProjectQueue.ts");
const assessInterviewAccess = read("src/services/assessInterviewAccess.ts");
const assessInterviewSession = read("src/services/assessInterviewSession.ts");
const assessInterviewHub = read("../frontend/src/pages/assess/AssessInterviewsHub.tsx");
const assessInterviewRoom = read("../frontend/src/pages/assess/AssessInterviewRoom.tsx");
const assessInterviewExpiryMigration = read("src/migrations/1794200000000-AddAssessInterviewExpiryIndex.ts");
const inventoryReports = [
  ["legacy", read("../docs/portfolio-assess-data-inventory-readonly.sql")],
  ["Portfolio", read("../docs/portfolio-assess-portfolio-data-inventory-readonly.sql")],
];

assert(!/return res\.json\(\{\s*token\b/.test(auth), "auth success responses must not expose an access token field");
assert(!/return res\.json\(\{\s*token\b/.test(studentAuth), "student login must not expose an access token field");
assert(authMiddleware.includes('getRepository(Student).findOne({') && authMiddleware.includes('if (!activeStudent?.class) return "not-found";'), "student JWTs must resolve an active Student row before authenticating");
assert(auth.includes("return res.json({ setupToken: pending.token, flow: pending.flow });"), "Google setup flow must retain its one-time setup token contract");
assert(classAccess.includes("withDeleted"), "student restore authorization must be able to resolve a soft-erased student");
assert(privacy.includes("if (student.deletedAt) return false;") && privacy.includes("deletedAt: new Date()") && privacy.includes('credentialVersion: () => "credential_version + 1"'), "erase must archive the student and invalidate existing credentials");
assert(privacy.includes("if (!student.deletedAt) return false;") && privacy.includes("deletedAt: null"), "restore must reactivate a previously archived student");
assert(studentEntity.includes('name: "deleted_at"'), "Student must map deleted_at");
assert(eraseRoute.includes('router.post("/students/:studentId/restore"'), "restore endpoint must be present");
assert(eraseRoute.includes('action: "student.data.restore"'), "restore must be audit logged");
assert(learningCatalog.includes("existing.status = \"IN_PROGRESS\";") && learningCatalog.includes("await enrollments.save(existing);"), "existing AVAILABLE enrollments must persist activation");
assert(fs.existsSync(path.join(root, "src/migrations/1752500000000-EnforceClassOrgNotNull.ts")), "org_id hardening migration must remain present");
assert(fs.existsSync(path.join(root, "src/migrations/1752600000000-AddStudentDeletedAt.ts")), "student soft-delete migration must be present");
assert(read("src/routes/edu/classStudents.ts").includes("writeSensitiveStudentRead"), "sensitive student reads must be audited");
assert(studentProvision.includes("email: z.string().trim().toLowerCase().max(255).email().optional().or(z.literal(\"\"))"), "manual student provisioning must allow a names-only roster");
assert(studentProvision.includes("email: input.email || null"), "names-only student accounts must keep the user email nullable");
assert(studentRoster.includes('new Error("INVALID_STUDENT_IMPORT")') && studentRoster.includes("if (!rows.length || rows.length > 200 || errors.length) invalid(errors);"), "CSV student imports must reject malformed or empty batches with invalid line details");
assert((learningCatalog.match(/where: \{ id: itemId, isActive: true \}/g) || []).length >= 4, "all direct course-item lookups must exclude inactive items");
assert(learningCatalog.includes('.createQueryBuilder("task")') && learningCatalog.includes('task.user_id = :userId') && learningCatalog.includes('task.type IN (:...legacyTypes)'), "legacy progress sync must filter tasks in SQL");
assert(tasks.includes("COURSE_PRACTICE_GENERATION_UNAVAILABLE") && tasks.includes("shouldUseGenericPersonalFallback(params.subtitle)"), "catalog practice must not use the generic AI fallback");
assert(courseTasks.includes('setLock("pessimistic_write")') && courseTasks.includes('MAX_ATTEMPTS_REACHED'), "materialized EDU submissions must serialize the attempt-limit check");
assert(courseTasks.includes('if (!grade.isCompleted) return res.status(409).json({ message: "TASK_NOT_PASSED" });'), "materialized EDU completion must not promote a failed grade");
assert(learningCatalog.includes('source === "direct"') && learningCatalog.includes('COURSE_ITEM_REQUIRES_SUBMISSION'), "direct course completion must not bypass interactive submissions");
assert(tasks.includes('completeCourseItem(params.userId, itemId, params.score, "practice")'), "passed catalog practice must retain its internal progress-sync path");
assert(safeAICall.includes("Provider messages/details can contain URLs") && !safeAICall.includes("error: error.error"), "AI provider internals must not be returned to clients");
assert(lessonQuiz.includes("isQuizAttemptDuplicateError") && lessonQuiz.includes('QUIZ_ALREADY_SUBMITTED'), "quiz duplicate submissions must return the stable conflict contract");
assert(portfolio.includes("g.verification_method='ONLINE_JUDGE'") && portfolio.includes("g.judge_verdict='AC'") && portfolio.includes("g.tests_passed=g.tests_total"), "Skill Evidence must derive from complete accepted Judge records");
assert(portfolio.includes('portfolioRouter.post("/evidence/sourced"') && portfolio.includes("findPortfolioSourcedEvidenceSource(ownerId"), "non-Judge Skill Evidence must be validated against owner-controlled source records");
assert(portfolioEvidenceSources.includes('"LEARNING_ACTIVITY"') && portfolioEvidenceSources.includes('"LEARNING_COURSE"') && portfolioEvidenceSources.includes('"PROJECT_PUBLICATION"') && portfolioEvidenceSources.includes('"ASSESSMENT_FEEDBACK"') && portfolioEvidenceSources.includes('"ASSESSMENT_TASK_RESULT"') && portfolioEvidenceSources.includes('"COMPETITION_RESULT"'), "Skill Evidence must cover Learn activities/courses, project, reviewed/released Assess, and public competition sources");
assert(portfolioEvidenceSources.includes("u.user_mode='PERSONAL'") && portfolioEvidenceSources.includes("n.released_at IS NOT NULL") && portfolioEvidenceSources.includes("allowPublicPortfolio") && portfolioEvidenceSources.includes("allowPortfolioEvidence") && portfolioEvidenceSources.includes("c.visibility='PUBLIC'"), "sourced evidence must exclude EDU, unreleased or unapproved assessment sharing, and private contest results");
assert(portfolioSourcedEvidenceMigration.includes("CREATE TABLE portfolio_sourced_evidence") && portfolioSourcedEvidenceMigration.includes("Rollback blocked"), "sourced Skill Evidence must use additive storage with guarded rollback");
assert(portfolioProfileTechnologiesMigration.includes("ADD COLUMN technologies_json TEXT NULL") && portfolioProfileTechnologiesMigration.includes("Rollback blocked"), "owner-curated profile technologies must be additive and protected during rollback");
assert(portfolioAvatarVisibilityMigration.includes("ADD COLUMN share_avatar TINYINT(1) NOT NULL DEFAULT 0") && portfolioAvatarVisibilityMigration.includes("Rollback blocked"), "sharing an account photo must remain opt-in and guarded during rollback");
assert(portfolio.includes('portfolioRouter.put("/evidence/order"') && portfolio.includes('"portfolio_evidence", orderedGradeIds') && portfolio.includes('"portfolio_sourced_evidence", orderedSourcedIds') && portfolio.includes("SET sort_order=CASE id"), "Portfolio owners must be able to order both Judge and source-linked evidence");
assert(portfolioDashboard.includes("reorderPortfolioEvidence(items.map(item => item.id))") && portfolioDashboard.includes("Move evidence for ${item.sourceTitle} up"), "Portfolio evidence order must be editable with accessible controls");
assert(portfolioApi.includes('api.put("/portfolio/evidence/order"') && portfolioEvidenceOrderMigration.includes("ADD COLUMN sort_order INT NOT NULL DEFAULT 0") && portfolioEvidenceOrderMigration.includes("Rollback blocked"), "Portfolio evidence order must be persisted additively and protected during rollback");
assert(portfolio.includes('portfolioRouter.get("/preview"') && portfolio.includes('res.setHeader("Cache-Control", "no-store, private")') && portfolio.includes("publicPortfolioView(user.username"), "authenticated Portfolio previews must be uncached and limited to the signed-in owner's public selections");
assert(portfolioDashboard.includes('to="/portfolio/preview"') && appRoutes.includes('path="/portfolio/preview"') && appRoutes.includes("<PublicPortfolioPage preview />") && portfolioApi.includes('api.get("/portfolio/preview")') && portfolioPublicPage.includes("Only you can see this"), "private Portfolio owners must be able to preview the public layout without publishing it");
assert(
  /user\.userMode === "PERSONAL" \? \[\{ id: "portfolio" as const/.test(premiumWorkspaceShell) &&
    /user\.userMode === "PERSONAL" \? \[\{ id: "assess" as const/.test(premiumWorkspaceShell),
  "Portfolio and Assess navigation entries must remain restricted to Personal accounts so EDU navigation stays independent",
);
assert(portfolioProjectPage.includes("const failure = [catalogResult, projectsResult]") && portfolioProjectPage.includes("setLegacyError") && portfolioProjectPage.includes('en ? "Retry" : "Спробувати ще"'), "optional legacy-source discovery failures must stay scoped and retryable without disabling the Portfolio workbench");
  assert(portfolio.includes("skill_ids_json") && portfolio.includes("validSkillSelection(work)") && portfolioSkills.includes('categoryId: "algorithms"') && portfolioSkills.includes('categoryId: "backend"'), "Portfolio work and Skill Evidence must use the shared categorized skill taxonomy");
  assert(portfolioWorkSkillsMigration.includes("ADD COLUMN skill_ids_json") && portfolioWorkSkillsMigration.includes("Rollback blocked"), "Portfolio work skill tags must be additive and protected during rollback");
assert(portfolio.includes('createHash("sha256").update(token).digest("hex")') && portfolio.includes('res.setHeader("Cache-Control", "no-store, private")'), "Evidence Pack capabilities must be stored as hashes and avoid response caching");
assert(portfolio.includes("skill_ids_json AS skillIdsJson") && portfolio.includes("competencies: PORTFOLIO_SKILLS.filter") && portfolioEvidencePackSkillsMigration.includes("ADD skill_ids_json TEXT NULL") && portfolioEvidencePackSkillsMigration.includes("Rollback blocked"), "Evidence Pack competencies must be owner-selected, viewer-scoped, and reversibly persisted");
assert(portfolioDashboard.includes('copy("Вибрати компетенції", "Select competencies")') && portfolioDashboard.includes("metadata-based suggestions") && portfolioDashboard.includes("!packPreviewOpen") && portfolioEvidencePackPage.includes('copy("Компетенції", "Competencies")'), "Evidence Packs must support explicit competency selection, explainable suggestions, and a pre-share recipient preview");
assert(server.includes('app.use("/api/assess/companies"') && server.includes('app.use("/api/assess", authMiddleware'), "StudyCod Assess must have canonical API mounts");
assert(server.includes('app.use("/project-companies", authMiddleware, forbidContestModeUsers, assessCompaniesRouter)') && server.includes('app.use("/api/project-companies", authMiddleware, forbidContestModeUsers, assessCompaniesRouter)'), "legacy company API mounts must remain aliases to the Assess company router");
assert(server.includes('app.use("/talent", authMiddleware, forbidContestModeUsers, assessInterviewsRouter)') && server.includes('app.use("/api/talent", authMiddleware, forbidContestModeUsers, assessInterviewsRouter)'), "legacy Talent API mounts must remain aliases to the Assess interview router");
assert(server.includes('app.use("/api/projects", authMiddleware, forbidContestModeUsers, portfolioProjectsRouter)') && server.includes('app.use("/api/portfolio/projects", authMiddleware, forbidContestModeUsers, portfolioProjectsRouter)'), "legacy and canonical project API mounts must share the Portfolio workbench");
assert(server.includes('app.use("/api/project-portfolio", portfolioProjectPublicRouter)') && appRoutes.includes('path="/portfolio/:publicId"'), "legacy public project publications must remain reachable at their saved URL and API");
assert(portfolio.includes('publicPortfolioRouter.get("/u/:username"') && portfolio.includes('ageStatusFromRow(profile) !== "ADULT"') && portfolio.includes('publicPortfolioRouter.get("/p/:token"') && portfolio.includes('ageStatusFromRow(grant) !== "ADULT"'), "public Portfolio profiles and Evidence Packs must fail closed for unknown or underage owners");
assert(portfolioProjects.includes('portfolioProjectPublicRouter.get("/profile/:username"') && portfolioProjects.includes('!users[0] || !isAdultPortfolioOwner(users[0])') && portfolioProjects.includes('if (!row || !isAdultPortfolioOwner(row)) return null;'), "legacy Project profile and publication URLs must block unknown or underage authors before returning their work");
assert(assessCompanies.includes('createRouteLimiter({ windowMs: 60_000, limit: 90, namespace: "assess-companies" })') && assessCompanies.includes("assessCompaniesRouter.use(assessCompaniesLimiter)"), "Assess company endpoints must share an authenticated request limit");
assert(assessCompanies.includes('assessCompaniesRouter.patch("/:companyId/members/:membershipId"') && assessCompanies.includes('assessCompaniesRouter.delete("/:companyId/members/:membershipId"') && assessCompanies.includes('if (role !== "OWNER") return sendError(res, 403, "COMPANY_OWNER_REQUIRED")'), "only Assess workspace owners may change teammate roles or revoke access");
assert(assessCompanies.includes("status='REVOKED'") && assessCompanies.includes("['DECLINED', 'REVOKED']") && assessCompanies.includes("assess.company-member.access-revoked"), "Assess team changes must preserve membership rows, support re-invitation, and audit revocation");
assert(assessCompanies.includes("revokeAssessInterviewMemberAccess(req.params.companyId, member.user_id)") && assessInterviewAccess.includes("JSON_REMOVE(interviewer_ids_json,?)") && assessInterviewAccess.includes("closeAssessInterviewMediaRoom(interview.room_name)") && assessInterviewAccess.includes("removeAssessInterviewParticipant(interview.room_name, userId)"), "revoking an Assess member must cancel their hosted session and remove them from live interview rooms");
assert(assessCompaniesApi.includes("updateAssessCompanyMemberRole") && assessCompaniesApi.includes("revokeAssessCompanyMember") && assessDashboard.includes("Save role") && assessDashboard.includes("Revoke access"), "Assess team management must be available from the workspace UI");
assert(assessInterviews.includes('createRouteLimiter({ windowMs: 60_000, limit: 180, namespace: "assess-interviews" })') && assessInterviews.includes("assessInterviewsRouter.use(authRequired, assessInterviewsLimiter,"), "Assess interview endpoints must be rate limited after authentication with room for live polling");
assert(assessInterviewKit.includes("z.enum(ASSESS_RUNTIMES)") && assessInterviews.includes("filterEnabledJudgeLanguages(ALL_JUDGE_LANGUAGES)") && assessInterviews.includes('"JUDGE_LANGUAGE_DISABLED"'), "Assess kits must offer the configured existing Judge language families and reject disabled ones");
assert(assessInterviewLanguage.includes("getLanguage(language).entryFile") && growthProjectQueue.includes("growthJobJudgeTarget(job.runtime, Boolean(job.interview_id))") && growthProjectQueue.includes("entry: target.entryFile"), "Assess execution must use each Judge family's registered entry file through the shared project queue");
assert(assessInterviewHub.includes('"Programming language"') && assessInterviewRoom.includes('import("../../components/CodeEditor")') && assessInterviewRoom.includes("<InterviewCodeEditor"), "Assess builders must select Judge languages and candidate sessions must reuse StudyCod's shared code editor");
assert(assessInterviewAccess.includes("AS duration_expired") && assessInterviews.includes("finalizeExpiredAssessInterview(String(access.row.id))"), "Assess interview routes must finalize sessions whose server-recorded duration elapsed");
assert(assessInterviewSession.includes("TIMESTAMPADD(MINUTE,i.duration_minutes,i.started_at)<=UTC_TIMESTAMP(3)") && assessInterviewSession.includes("final_artifact_id=?") && assessInterviewSession.includes("startAssessInterviewExpiryWorker"), "Assess duration expiry must atomically freeze the candidate draft and run from a bounded background sweep");
assert((assessInterviews.match(/TIMESTAMPADD\(MINUTE,duration_minutes,started_at\)>UTC_TIMESTAMP\(3\)/g) ?? []).length >= 6, "Assess live draft, control, phase, chat, quiz, and Judge writes must be bounded by server time");
assert(server.includes("startAssessInterviewExpiryWorker();"), "Assess duration enforcement worker must start after successful database startup");
assert(assessInterviewExpiryMigration.includes("ix_growth_interviews_expiry (status,started_at)"), "Assess duration sweeps must use the status/start-time index");
assert(portfolioProjects.includes('createRouteLimiter({ windowMs: 60_000, limit: 120, namespace: "portfolio-projects" })') && portfolioProjects.includes("portfolioProjectsRouter.use(portfolioProjectsLimiter)"), "Portfolio workbench APIs must share an authenticated request limit across compatibility mounts");
assert(server.includes('app.use("/portfolio/projects", authMiddleware, forbidContestModeUsers, portfolioProjectsRouter)') && server.includes('app.use("/api/portfolio/projects", authMiddleware, forbidContestModeUsers, portfolioProjectsRouter)'), "Portfolio project workbench must expose canonical authenticated API mounts");
assert(server.includes('app.use("/api/projects", authMiddleware, forbidContestModeUsers, portfolioProjectsRouter)') && portfolioProjectsApi.includes('const PORTFOLIO_PROJECT_API = "/portfolio/projects"'), "legacy project API compatibility must remain while the Portfolio client uses its canonical API");
assert(portfolioProjects.includes('`/portfolio/projects/reviews?review=${id}`') && portfolioProjects.includes('"/portfolio/projects/admin/reviews"') && !portfolioProjects.includes('"/projects/admin/reviews"'), "new project-review notifications must target Portfolio routes");
assert(assessCompanies.includes('`/assess?case=${id}`') && assessCompanies.includes('`/portfolio/projects?project=${row.project_id}`') && !assessCompanies.includes('"/companies"'), "new assessment notifications and candidate task links must target Assess and Portfolio routes");
assert(assessInterviews.includes('`/assess/interviews/${id}`') && !assessInterviews.includes('`/companies/interviews/${id}`'), "new interview notifications must target the canonical Assess interview route");
assert(assessInterviewAccess.includes('${origin}/assess/interviews/${row.id}') && !assessInterviewAccess.includes('${origin}/companies/interviews/${row.id}'), "new interview calendar invitations must target the canonical Assess interview route");
assert(assessInterviewAccess.includes('PRODID:-//StudyCod//Assess Interviews//EN') && !assessInterviewAccess.includes('PRODID:-//StudyCod//Talent Interviews//UK'), "interview calendar metadata must use the current Assess product identity");
assert(server.includes("portfolio-public\\/p\\/") && server.includes("project-portfolio\\/share\\/"), "share capability paths must be excluded from development request logs");

const inventorySqlBody = sql => sql.replace(/^[ \t]*--.*$/gm, "");
for (const [name, sql] of inventoryReports) {
  const executableSql = inventorySqlBody(sql);
  assert(/^\s*START TRANSACTION READ ONLY;/im.test(executableSql) && /^\s*ROLLBACK;/im.test(executableSql), `${name} data inventory must use a read-only transaction`);
  assert(!/^\s*(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE|TRUNCATE|CALL)\b/im.test(executableSql), `${name} data inventory must not mutate database state`);
}
const legacyDataInventory = inventoryReports[0][1];
const portfolioDataInventory = inventoryReports[1][1];
for (const table of ["growth_projects", "growth_project_queue_guard", "growth_project_publications", "growth_company_assessments", "growth_interviews"]) {
  assert(legacyDataInventory.includes(`'${table}'`), `legacy data inventory must check ${table}`);
}
assert(legacyDataInventory.includes("UNION ALL SELECT 'growth_project_queue_guard'"), "legacy data inventory must report the queue-guard row count");
assert(legacyDataInventory.includes("UNION ALL SELECT 'growth_interview_jobs', COUNT(*) FROM growth_project_jobs WHERE interview_id IS NOT NULL"), "legacy data inventory must report interview execution rows deleted by the interview rollback");
assert(legacyDataInventory.includes("FROM notifications") && legacyDataInventory.includes("SUM(related_path IS NOT NULL)") && legacyDataInventory.includes("GROUP BY type"), "legacy data inventory must count every shared notification type and populated related path before rollback review");
assert(legacyDataInventory.includes("table_name = 'portfolio_evidence_packs'") && legacyDataInventory.includes("column_name = 'skill_ids_json'"), "Portfolio inventory preflight must confirm the Evidence Pack competency column before running the companion report");
for (const table of ["portfolio_profiles", "portfolio_works", "portfolio_evidence", "portfolio_evidence_packs", "portfolio_sourced_evidence"]) {
  assert(portfolioDataInventory.includes(`FROM ${table}`), `Portfolio data inventory must count ${table}`);
}
assert(portfolioDataInventory.includes("verification_method") && portfolioDataInventory.includes("complete_judge_acceptances"), "Portfolio data inventory must report persisted Personal Judge verification facts");
assert(portfolioDataInventory.includes("selected_competency_references") && portfolioDataInventory.includes("packs_with_nonempty_skill_ids_json"), "Portfolio data inventory must report selected Evidence Pack competencies and the migration rollback guard count");
assert(legacyDataInventory.includes("JSON_VALID(ci.content)"), "legacy data inventory must safely skip malformed course-item JSON before extracting projectSpec");
const bootstrapGradeColumns = dbContractBootstrap.indexOf("ALTER TABLE grades");
const bootstrapBirthYear = dbContractBootstrap.indexOf("ALTER TABLE users DROP COLUMN birth_year");
const bootstrapMigrationRun = dbContractBootstrap.indexOf("runMigrations(");
const contractSchemaGuard = dbContractBootstrap.indexOf('contractDatabaseName.includes("contract")');
const emptySchemaGuard = dbContractBootstrap.indexOf("if (Number(tableCounts[0]?.table_count ?? -1) !== 0)");
const bootstrapSynchronize = dbContractBootstrap.indexOf("await AppDataSource.synchronize()");
assert(
  contractSchemaGuard >= 0 && emptySchemaGuard >= 0 && bootstrapSynchronize > emptySchemaGuard &&
    bootstrapGradeColumns > bootstrapSynchronize && bootstrapBirthYear > bootstrapGradeColumns && bootstrapMigrationRun > bootstrapBirthYear,
  "the MySQL bootstrap must refuse non-contract/nonempty schemas and remove entity-synchronized migration-owned columns before migration replay",
);
const legacyMigrationRun = dbContractBootstrap.indexOf("legacyDataSource.runMigrations(");
const seedLegacyFixture = dbContractBootstrap.indexOf("fixture = await seedLegacyRows(legacyDataSource)");
const portfolioMigrationRun = dbContractBootstrap.indexOf("fullDataSource.runMigrations(");
const verifyLegacyFixture = dbContractBootstrap.indexOf("await verifyLegacyRows(fullDataSource, fixture)");
const baselineMigrationHistory = dbContractBootstrap.indexOf("await recordSynchronizedCoreMigrationHistory(legacyDataSource, synchronizedCoreMigrations)");
assert(
  legacyMigrationRun >= 0 && seedLegacyFixture > legacyMigrationRun && portfolioMigrationRun > seedLegacyFixture && verifyLegacyFixture > portfolioMigrationRun,
  "the disposable MySQL contract must seed legacy Personal, EDU, Project, and Talents rows between the legacy and Portfolio migration phases",
);
assert(
  baselineMigrationHistory > legacyMigrationRun && dbContractBootstrap.includes("createContractDataSource(synchronizedOptions, portfolioMigrations)") &&
    !dbContractBootstrap.includes("createContractDataSource(synchronizedOptions, allMigrations)") &&
    dbContractBootstrap.includes("const COURSE_DIAGNOSTIC_MIGRATION = 1793100000000") &&
    dbContractBootstrap.includes("const CORE_MIGRATIONS_NOT_REPRESENTED_BY_ENTITIES = new Set([1760200500000, 1791928000000])"),
  "the MySQL rehearsal must use synchronized Personal/EDU/Learn tables as baseline, run required Learn/EDU indexes plus explicit Growth, Assess, course-diagnostic, and Portfolio migrations, and retain complete migration history",
);
assert(
  dbContractBootstrap.includes("function getMigrationHistoryTimestamp(file)") &&
    dbContractBootstrap.includes("getMigrationHistoryTimestamp(migration), getMigrationName(migration)"),
  "synchronized baseline history must use TypeORM migration class timestamps, including registry aliases whose filename timestamp differs",
);
assert(
  dbContractRunner.includes('NODE_ENV: "test"') && dbContractRunner.includes('RUN_DB_CONTRACT_TEST: "1"'),
  "the isolated MySQL schema contract must run under the test profile even when a local .env sets production",
);
const requiredEduFixtureContracts = [
  "INSERT INTO organizations",
  "INSERT INTO memberships",
  "INSERT INTO classes",
  "INSERT INTO students",
  "INSERT INTO edu_grades",
  '"EDU organization and membership"',
  '"EDU class and student"',
  '"EDU grade"',
];
assert(
  requiredEduFixtureContracts.every(fragment => dbContractBootstrap.includes(fragment)),
  "the disposable MySQL contract must preserve and verify EDU organization, class, student, and grade records",
);

console.log("STATIC CONTRACT PASS: auth, student provisioning/import, erase/restore, org hardening, course progress, safe AI errors, Portfolio evidence and share capabilities, Assess APIs/links, additive MySQL migration preservation, and read-only data inventory contracts");
