const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { DataSource } = require("typeorm");

if (process.env.DB_CONTRACT_BOOTSTRAP_SCHEMA !== "1") {
  console.error("DB CONTRACT BOOTSTRAP REFUSED: set DB_CONTRACT_BOOTSTRAP_SCHEMA=1 for an isolated contract database");
  process.exit(1);
}

const databaseUrl = String(process.env.DB_CONTRACT_DATABASE_URL || "").trim();
if (!databaseUrl) {
  console.error("DB CONTRACT BOOTSTRAP REFUSED: DB_CONTRACT_DATABASE_URL is required");
  process.exit(1);
}
let contractDatabaseName = "";
try {
  const parsedDatabaseUrl = new URL(databaseUrl);
  contractDatabaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, "")).toLowerCase();
  if (parsedDatabaseUrl.protocol !== "mysql:" || !contractDatabaseName.includes("contract")) {
    throw new Error("expected a MySQL schema with 'contract' in its name");
  }
} catch {
  console.error("DB CONTRACT BOOTSTRAP REFUSED: URL must target an explicitly named disposable MySQL contract schema");
  process.exit(1);
}

// This runner is only for a disposable contract database. Force the non-prod
// env profile before importing the app data source so a developer's local
// production .env cannot change the bootstrap semantics.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = databaseUrl;
const { AppDataSource } = require("./dist/backend/src/data-source");

const GROWTH_MIGRATION_START = 1792800000000;
const COURSE_DIAGNOSTIC_MIGRATION = 1793100000000;
const PORTFOLIO_MIGRATION_START = 1793200000000;
const SYNCHRONIZED_CORE_MIGRATION_END = GROWTH_MIGRATION_START - 1;
const CORE_MIGRATIONS_NOT_REPRESENTED_BY_ENTITIES = new Set([1760200500000, 1791928000000]);

function getMigrationTimestamp(file) {
  const match = path.basename(String(file)).match(/^(\d+)-/);
  return match ? Number(match[1]) : Number.NaN;
}

function getMigrationName(file) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/class (\w+\d+)\s*\{/i);
  if (!match || !/\d{13}$/.test(match[1])) {
    throw new Error(`DB CONTRACT BOOTSTRAP FAILED: migration class name or TypeORM timestamp is missing: ${String(file)}`);
  }
  return match[1];
}

function getMigrationHistoryTimestamp(file) {
  const name = getMigrationName(file);
  return Number(name.match(/(\d{13})$/)[1]);
}

function assertMigrationFileList(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0 || migrations.some(file => typeof file !== "string")) {
    throw new Error("DB CONTRACT BOOTSTRAP FAILED: expected an explicit list of compiled migration files");
  }
  for (const migration of migrations) {
    if (!Number.isFinite(getMigrationTimestamp(migration))) {
      throw new Error(`DB CONTRACT BOOTSTRAP FAILED: migration has no sortable timestamp: ${String(migration)}`);
    }
  }
}

async function recordSynchronizedCoreMigrationHistory(dataSource, migrations) {
  // The entity sync above is the current Personal/EDU/Learn baseline. Record
  // its pre-Growth migration history instead of replaying old schema changes
  // against tables that synchronization has already created at their final shape.
  for (const migration of migrations) {
    await dataSource.query(
      "INSERT INTO migrations (timestamp,name) VALUES (?,?)",
      [getMigrationHistoryTimestamp(migration), getMigrationName(migration)],
    );
  }
}

function createContractDataSource(options, migrations) {
  return new DataSource({ ...options, synchronize: false, migrations });
}

async function selectOne(dataSource, query, parameters, label) {
  const rows = await dataSource.query(query, parameters);
  assert.equal(rows.length, 1, `${label} must remain present after migration`);
  return rows[0];
}

async function seedLegacyRows(dataSource) {
  const suffix = crypto.randomBytes(8).toString("hex");
  const personalUsername = `contract-personal-${suffix}`;
  const candidateUsername = `contract-candidate-${suffix}`;
  const eduUsername = `contract-edu-${suffix}`;

  await dataSource.query(
    "INSERT INTO users (username,password,user_mode,role,birth_day,birth_month) VALUES (?,?, 'PERSONAL','USER',12,3)",
    [personalUsername, "contract-fixture-password"],
  );
  await dataSource.query(
    "INSERT INTO users (username,password,user_mode,role) VALUES (?,?,'PERSONAL','USER')",
    [candidateUsername, "contract-fixture-password"],
  );
  await dataSource.query(
    "INSERT INTO users (username,password,user_mode,role) VALUES (?,?,'EDUCATIONAL','USER')",
    [eduUsername, "contract-fixture-password"],
  );

  const personal = await selectOne(dataSource, "SELECT id FROM users WHERE username=?", [personalUsername], "Personal user");
  const candidate = await selectOne(dataSource, "SELECT id FROM users WHERE username=?", [candidateUsername], "candidate user");
  const eduUser = await selectOne(dataSource, "SELECT id FROM users WHERE username=?", [eduUsername], "EDU user");

  await dataSource.query(
    "INSERT INTO grades (user_id,total,ai_feedback) VALUES (?,91,'legacy Personal grade fixture')",
    [personal.id],
  );
  const grade = await selectOne(
    dataSource,
    "SELECT id FROM grades WHERE user_id=? AND ai_feedback=? ORDER BY id DESC LIMIT 1",
    [personal.id, "legacy Personal grade fixture"],
    "Personal grade",
  );

  const orgSlug = `contract-${suffix}`;
  await dataSource.query(
    "INSERT INTO organizations (name,institution_type,slug) VALUES (?,'SCHOOL',?)",
    [`Preservation fixture ${suffix}`, orgSlug],
  );
  const organization = await selectOne(dataSource, "SELECT id FROM organizations WHERE slug=?", [orgSlug], "EDU organization");
  await dataSource.query(
    "INSERT INTO memberships (user_id,org_id,role) VALUES (?,?,'ORG_ADMIN')",
    [eduUser.id, organization.id],
  );
  const className = `Preservation class ${suffix}`;
  await dataSource.query(
    "INSERT INTO classes (teacher_id,org_id,name) VALUES (?,?,?)",
    [eduUser.id, organization.id, className],
  );
  const eduClass = await selectOne(dataSource, "SELECT id FROM classes WHERE name=?", [className], "EDU class");
  const generatedStudentUsername = `contract-student-${suffix}`;
  const studentEmail = `student-${suffix}@example.test`;
  await dataSource.query(
    `INSERT INTO students (class_id,first_name,last_name,email,generated_username,generated_password,user_id)
     VALUES (?,?,?,?,?,? ,NULL)`,
    [eduClass.id, "Legacy", "Learner", studentEmail, generatedStudentUsername, "fixture-student-password"],
  );
  const eduStudent = await selectOne(dataSource, "SELECT id FROM students WHERE generated_username=?", [generatedStudentUsername], "EDU student");
  const eduGradeFeedback = "Legacy EDU feedback.";
  const eduSubmittedCode = "print(1)";
  const eduTestResults = JSON.stringify([{ passed: true, points: 100 }]);
  await dataSource.query(
    `INSERT INTO edu_grades
      (student_id,total,submitted_code,feedback,is_manually_graded,tests_passed,tests_total,type,is_completed,test_results)
     VALUES (?,?,?, ?,0,4,4,'PRACTICE',1,?)`,
    [eduStudent.id, 100, eduSubmittedCode, eduGradeFeedback, eduTestResults],
  );
  const eduGrade = await selectOne(
    dataSource,
    "SELECT id FROM edu_grades WHERE student_id=? AND feedback=? ORDER BY id DESC LIMIT 1",
    [eduStudent.id, eduGradeFeedback],
    "EDU grade",
  );

  const projectId = crypto.randomUUID();
  const artifactId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const publicationId = crypto.randomUUID();
  const companyId = crypto.randomUUID();
  const assessmentId = crypto.randomUUID();
  const interviewId = crypto.randomUUID();
  const projectDraft = JSON.stringify({ files: [{ path: "Main.java", content: "class Main {}" }] });
  const artifactFiles = JSON.stringify([{ path: "Main.java", content: "class Main {}" }]);
  const artifactExamples = JSON.stringify([]);
  const artifactHash = crypto.createHash("sha256").update(artifactFiles).digest("hex");
  const judgeTests = JSON.stringify([{ input: "1", output: "1" }]);
  const judgeResult = JSON.stringify({ verdict: "AC", testsPassed: 1, testsTotal: 1 });
  const publicId = `legacy-public-${suffix}`;
  const companyName = `Legacy company ${suffix}`;
  const assessmentQuestions = JSON.stringify([{ id: "legacy-q1", prompt: "Explain the design." }]);
  const assessmentAnswers = JSON.stringify({ "legacy-q1": "I would separate the parser from the evaluator." });
  const assessmentReview = JSON.stringify({ decision: "REVIEW_REQUIRED", note: "Legacy reviewer notes." });
  const interviewDraft = JSON.stringify({ code: "class Main {}", revision: 3 });
  const kitSnapshot = JSON.stringify({ title: "Legacy interview kit", questions: [] });

  await dataSource.query(
    `INSERT INTO growth_projects (id,owner_id,family_key,runtime,blueprint_revision,draft_json,source_json)
     VALUES (?,?, 'preservation-fixture','JAVA','contract-v1',?,?)`,
    [projectId, personal.id, projectDraft, JSON.stringify({ kind: "USER_AUTHORED" })],
  );
  await dataSource.query(
    `INSERT INTO growth_project_artifacts (id,owner_id,content_hash,files_json,examples_json,total_bytes)
     VALUES (?,?,?,?,?,?)`,
    [artifactId, personal.id, artifactHash, artifactFiles, artifactExamples, Buffer.byteLength(artifactFiles)],
  );
  await dataSource.query(
    `INSERT INTO growth_project_jobs
      (id,project_id,owner_id,context_key,artifact_id,blueprint_revision,tests_hash,tests_json,idempotency_key,state,result_json,completed_at)
     VALUES (?,?,?,?,?,?,?,?,?,'COMPLETED',?,UTC_TIMESTAMP(3))`,
    [
      jobId,
      projectId,
      personal.id,
      "preservation-contract",
      artifactId,
      "contract-v1",
      crypto.createHash("sha256").update(judgeTests).digest("hex"),
      judgeTests,
      `legacy-job-${suffix}`,
      judgeResult,
    ],
  );
  await dataSource.query(
    `INSERT INTO growth_project_versions
      (id,project_id,owner_id,stage_key,sequence_no,artifact_id,check_job_id,blueprint_revision,idempotency_key,explanation)
     VALUES (?,?,?,'V1',1,?,?,?, ?,?)`,
    [versionId, projectId, personal.id, artifactId, jobId, "contract-v1", `legacy-version-${suffix}`, "Preserved project version."],
  );
  await dataSource.query(
    `INSERT INTO growth_project_publications
      (id,project_id,owner_id,version_id,channel,public_id,title,description,evidence_json)
     VALUES (?,?,?,?,'PUBLIC',?,?,?,?)`,
    [publicationId, projectId, personal.id, versionId, publicId, "Legacy public work", "Original public description.", JSON.stringify([])],
  );
  await dataSource.query(
    "INSERT INTO growth_companies (id,owner_id,name) VALUES (?,?,?)",
    [companyId, personal.id, companyName],
  );
  await dataSource.query(
    "INSERT INTO growth_company_members (id,company_id,user_id,role,status,invited_by) VALUES (?,?,?,'OWNER','ACTIVE',?)",
    [crypto.randomUUID(), companyId, personal.id, personal.id],
  );
  await dataSource.query(
    `INSERT INTO growth_company_assessments
      (id,company_id,created_by,candidate_id,idempotency_key,role_title,introduction,questions_json,answers_json,hr_review_json,project_id,version_id,status,consent_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'ACCEPTED',UTC_TIMESTAMP(3))`,
    [assessmentId, companyId, personal.id, candidate.id, `legacy-${suffix}`, "Junior Java", "Legacy assessment", assessmentQuestions, assessmentAnswers, assessmentReview, projectId, versionId],
  );
  await dataSource.query(
    `INSERT INTO growth_interviews
      (id,company_id,assessment_id,host_user_id,interviewer_ids_json,title,scheduled_at,duration_minutes,status,phase,started_at,
       runtime,kit_snapshot,kit_hash,source_version_id,draft_json,editor_user_id,room_name,idempotency_key,request_hash)
     VALUES (?,?,?,?,?,?,UTC_TIMESTAMP(3),60,'LIVE','INTRO',UTC_TIMESTAMP(3),'JAVA',?,?,?,?,?,?,?,?)`,
    [
      interviewId,
      companyId,
      assessmentId,
      personal.id,
      JSON.stringify([personal.id]),
      "Legacy interview",
      kitSnapshot,
      crypto.createHash("sha256").update(kitSnapshot).digest("hex"),
      versionId,
      interviewDraft,
      candidate.id,
      `contract-room-${suffix}`,
      `interview-${suffix}`,
      crypto.createHash("sha256").update(interviewDraft).digest("hex"),
    ],
  );

  return {
    personalUsername,
    candidateUsername,
    eduUsername,
    personalId: Number(personal.id),
    candidateId: Number(candidate.id),
    eduUserId: Number(eduUser.id),
    organizationId: Number(organization.id),
    classId: Number(eduClass.id),
    className,
    eduStudentId: Number(eduStudent.id),
    generatedStudentUsername,
    eduGradeId: Number(eduGrade.id),
    eduGradeFeedback,
    eduSubmittedCode,
    eduTestResults,
    gradeId: Number(grade.id),
    projectId,
    projectDraft,
    artifactId,
    artifactFiles,
    artifactExamples,
    artifactHash,
    jobId,
    judgeTests,
    judgeResult,
    versionId,
    publicationId,
    publicId,
    companyId,
    companyName,
    assessmentId,
    assessmentQuestions,
    assessmentAnswers,
    assessmentReview,
    interviewId,
    interviewDraft,
  };
}

async function verifyLegacyRows(dataSource, fixture) {
  const personal = await selectOne(
    dataSource,
    "SELECT username,user_mode,role,birth_day,birth_month,birth_year FROM users WHERE id=?",
    [fixture.personalId],
    "Personal user",
  );
  assert.deepEqual(
    [personal.username, personal.user_mode, personal.role, Number(personal.birth_day), Number(personal.birth_month), personal.birth_year],
    [fixture.personalUsername, "PERSONAL", "USER", 12, 3, null],
    "adding the private age field must preserve existing Personal identity and birthday fields",
  );

  const candidate = await selectOne(
    dataSource,
    "SELECT username,user_mode,role FROM users WHERE id=?",
    [fixture.candidateId],
    "candidate user",
  );
  assert.deepEqual([candidate.username, candidate.user_mode, candidate.role], [fixture.candidateUsername, "PERSONAL", "USER"]);

  const grade = await selectOne(
    dataSource,
    "SELECT user_id,total,ai_feedback,verification_method,judge_verdict,tests_passed,tests_total FROM grades WHERE id=?",
    [fixture.gradeId],
    "Personal grade",
  );
  assert.deepEqual(
    [Number(grade.user_id), Number(grade.total), grade.ai_feedback, grade.verification_method, grade.judge_verdict, grade.tests_passed, grade.tests_total],
    [fixture.personalId, 91, "legacy Personal grade fixture", null, null, null, null],
    "new Judge provenance fields must not fabricate facts for an existing grade",
  );

  const org = await selectOne(
    dataSource,
    `SELECT o.id,o.name,m.user_id,m.role,u.user_mode,u.role AS global_role
     FROM organizations o JOIN memberships m ON m.org_id=o.id JOIN users u ON u.id=m.user_id
     WHERE o.id=? AND m.user_id=?`,
    [fixture.organizationId, fixture.eduUserId],
    "EDU organization and membership",
  );
  assert.deepEqual([Number(org.id), Number(org.user_id), org.role, org.user_mode, org.global_role], [fixture.organizationId, fixture.eduUserId, "ORG_ADMIN", "EDUCATIONAL", "USER"]);

  const eduStudent = await selectOne(
    dataSource,
    `SELECT c.id AS class_id,c.name,s.id AS student_id,s.generated_username,s.first_name,s.last_name,s.email,s.user_id,s.deleted_at
     FROM classes c JOIN students s ON s.class_id=c.id WHERE c.id=? AND s.id=?`,
    [fixture.classId, fixture.eduStudentId],
    "EDU class and student",
  );
  assert.deepEqual(
    [Number(eduStudent.class_id), eduStudent.name, Number(eduStudent.student_id), eduStudent.generated_username, eduStudent.first_name, eduStudent.last_name, eduStudent.email, eduStudent.user_id, eduStudent.deleted_at],
    [fixture.classId, fixture.className, fixture.eduStudentId, fixture.generatedStudentUsername, "Legacy", "Learner", `student-${fixture.generatedStudentUsername.slice("contract-student-".length)}@example.test`, null, null],
  );

  const eduGrade = await selectOne(
    dataSource,
    "SELECT student_id,total,submitted_code,feedback,is_manually_graded,tests_passed,tests_total,type,is_completed,test_results FROM edu_grades WHERE id=?",
    [fixture.eduGradeId],
    "EDU grade",
  );
  assert.deepEqual(
    [Number(eduGrade.student_id), Number(eduGrade.total), eduGrade.submitted_code, eduGrade.feedback, Number(eduGrade.is_manually_graded), Number(eduGrade.tests_passed), Number(eduGrade.tests_total), eduGrade.type, Number(eduGrade.is_completed), eduGrade.test_results],
    [fixture.eduStudentId, 100, fixture.eduSubmittedCode, fixture.eduGradeFeedback, 0, 4, 4, "PRACTICE", 1, fixture.eduTestResults],
  );

  const project = await selectOne(
    dataSource,
    "SELECT owner_id,family_key,runtime,blueprint_revision,draft_json FROM growth_projects WHERE id=?",
    [fixture.projectId],
    "legacy Project work",
  );
  assert.deepEqual(
    [Number(project.owner_id), project.family_key, project.runtime, project.blueprint_revision, project.draft_json],
    [fixture.personalId, "preservation-fixture", "JAVA", "contract-v1", fixture.projectDraft],
  );

  const artifact = await selectOne(
    dataSource,
    "SELECT owner_id,content_hash,files_json,examples_json,total_bytes FROM growth_project_artifacts WHERE id=?",
    [fixture.artifactId],
    "legacy Project artifact",
  );
  assert.deepEqual(
    [Number(artifact.owner_id), artifact.content_hash, artifact.files_json, artifact.examples_json, Number(artifact.total_bytes)],
    [fixture.personalId, fixture.artifactHash, fixture.artifactFiles, fixture.artifactExamples, Buffer.byteLength(fixture.artifactFiles)],
  );

  const judgeJob = await selectOne(
    dataSource,
    "SELECT project_id,owner_id,artifact_id,tests_json,state,result_json FROM growth_project_jobs WHERE id=?",
    [fixture.jobId],
    "legacy Project Judge result",
  );
  assert.deepEqual(
    [judgeJob.project_id, Number(judgeJob.owner_id), judgeJob.artifact_id, judgeJob.tests_json, judgeJob.state, judgeJob.result_json],
    [fixture.projectId, fixture.personalId, fixture.artifactId, fixture.judgeTests, "COMPLETED", fixture.judgeResult],
  );

  const version = await selectOne(
    dataSource,
    "SELECT project_id,owner_id,stage_key,sequence_no,artifact_id,check_job_id,explanation FROM growth_project_versions WHERE id=?",
    [fixture.versionId],
    "legacy Project version",
  );
  assert.deepEqual(
    [version.project_id, Number(version.owner_id), version.stage_key, Number(version.sequence_no), version.artifact_id, version.check_job_id, version.explanation],
    [fixture.projectId, fixture.personalId, "V1", 1, fixture.artifactId, fixture.jobId, "Preserved project version."],
  );

  const publication = await selectOne(
    dataSource,
    "SELECT project_id,owner_id,version_id,public_id,title,description,evidence_json,revoked FROM growth_project_publications WHERE id=?",
    [fixture.publicationId],
    "legacy public Project link",
  );
  assert.deepEqual(
    [publication.project_id, Number(publication.owner_id), publication.version_id, publication.public_id, publication.title, publication.description, publication.evidence_json, Number(publication.revoked)],
    [fixture.projectId, fixture.personalId, fixture.versionId, fixture.publicId, "Legacy public work", "Original public description.", JSON.stringify([]), 0],
  );

  const queueGuard = await selectOne(dataSource, "SELECT id,lock_version FROM growth_project_queue_guard WHERE id=1", [], "legacy Project queue guard");
  assert.deepEqual([Number(queueGuard.id), Number(queueGuard.lock_version)], [1, 0]);

  const company = await selectOne(
    dataSource,
    `SELECT c.owner_id,c.name,m.user_id,m.role,m.status
     FROM growth_companies c JOIN growth_company_members m ON m.company_id=c.id
     WHERE c.id=? AND m.user_id=?`,
    [fixture.companyId, fixture.personalId],
    "legacy company and membership",
  );
  assert.deepEqual(
    [Number(company.owner_id), company.name, Number(company.user_id), company.role, company.status],
    [fixture.personalId, fixture.companyName, fixture.personalId, "OWNER", "ACTIVE"],
  );

  const assessment = await selectOne(
    dataSource,
    "SELECT company_id,candidate_id,role_title,introduction,questions_json,answers_json,hr_review_json,project_id,version_id,status,consent_at FROM growth_company_assessments WHERE id=?",
    [fixture.assessmentId],
    "legacy Talents assessment",
  );
  assert.deepEqual(
    [assessment.company_id, Number(assessment.candidate_id), assessment.role_title, assessment.introduction, assessment.questions_json, assessment.answers_json, assessment.hr_review_json, assessment.project_id, assessment.version_id, assessment.status],
    [fixture.companyId, fixture.candidateId, "Junior Java", "Legacy assessment", fixture.assessmentQuestions, fixture.assessmentAnswers, fixture.assessmentReview, fixture.projectId, fixture.versionId, "ACCEPTED"],
  );
  assert.ok(assessment.consent_at, "candidate consent timestamp must survive migration");

  const interview = await selectOne(
    dataSource,
    "SELECT assessment_id,host_user_id,title,status,phase,started_at,runtime,source_version_id,draft_json,editor_user_id FROM growth_interviews WHERE id=?",
    [fixture.interviewId],
    "legacy Talents interview",
  );
  assert.deepEqual(
    [interview.assessment_id, Number(interview.host_user_id), interview.title, interview.status, interview.phase, Boolean(interview.started_at), interview.runtime, interview.source_version_id, interview.draft_json, Number(interview.editor_user_id)],
    [fixture.assessmentId, fixture.personalId, "Legacy interview", "LIVE", "INTRO", true, "JAVA", fixture.versionId, fixture.interviewDraft, fixture.candidateId],
  );
}

async function main() {
  AppDataSource.setOptions({ synchronize: false });
  await AppDataSource.initialize();
  const synchronizedOptions = AppDataSource.options;
  try {
    const tableCounts = await AppDataSource.query(
      "SELECT COUNT(*) AS table_count FROM information_schema.tables WHERE table_schema=DATABASE()",
    );
    if (Number(tableCounts[0]?.table_count ?? -1) !== 0) {
      throw new Error("refusing to bootstrap a nonempty database; use a fresh disposable contract schema");
    }
    await AppDataSource.synchronize();

    // These fields are declared by the current entities, but are introduced by
    // tracked additive migrations. Remove them from this empty disposable schema
    // so migration replay starts at the pre-migration boundary.
    await AppDataSource.query(`ALTER TABLE grades
      DROP COLUMN verification_method,
      DROP COLUMN judge_verdict,
      DROP COLUMN tests_passed,
      DROP COLUMN tests_total`);
    await AppDataSource.query("ALTER TABLE users DROP COLUMN birth_year");
  } finally {
    await AppDataSource.destroy();
  }

  const allMigrations = synchronizedOptions.migrations;
  assertMigrationFileList(allMigrations);
  const synchronizedCoreMigrations = allMigrations.filter(file => {
    const timestamp = getMigrationTimestamp(file);
    return timestamp <= SYNCHRONIZED_CORE_MIGRATION_END && !CORE_MIGRATIONS_NOT_REPRESENTED_BY_ENTITIES.has(timestamp);
  });
  const legacyMigrations = allMigrations.filter(file => {
    const timestamp = getMigrationTimestamp(file);
    return CORE_MIGRATIONS_NOT_REPRESENTED_BY_ENTITIES.has(timestamp) ||
      (timestamp >= GROWTH_MIGRATION_START && timestamp <= COURSE_DIAGNOSTIC_MIGRATION);
  });
  const portfolioMigrations = allMigrations.filter(file => getMigrationTimestamp(file) >= PORTFOLIO_MIGRATION_START);
  const legacyMigrationTimestamps = legacyMigrations.map(getMigrationTimestamp).sort((a, b) => a - b);
  if (legacyMigrationTimestamps.join(",") !== [1760200500000, 1791928000000, 1792800000000, 1792900000000, 1793000000000, COURSE_DIAGNOSTIC_MIGRATION].join(",")) {
    throw new Error("DB CONTRACT BOOTSTRAP FAILED: expected Learn/EDU indexes, Project, Talents, and course-diagnostic migrations");
  }
  if (allMigrations.some(file => {
    const timestamp = getMigrationTimestamp(file);
    return (timestamp > SYNCHRONIZED_CORE_MIGRATION_END && timestamp < GROWTH_MIGRATION_START) ||
      (timestamp > COURSE_DIAGNOSTIC_MIGRATION && timestamp < PORTFOLIO_MIGRATION_START);
  })) {
    throw new Error("DB CONTRACT BOOTSTRAP FAILED: migration timestamp exists outside the explicit core, Growth, and Portfolio phases");
  }
  if (portfolioMigrations.length === 0) {
    throw new Error("DB CONTRACT BOOTSTRAP FAILED: no Portfolio migrations were found");
  }

  const legacyDataSource = createContractDataSource(synchronizedOptions, legacyMigrations);
  let fixture;
  let legacyApplied = [];
  try {
    await legacyDataSource.initialize();
    const pendingBeforeLegacy = await legacyDataSource.showMigrations();
    legacyApplied = await legacyDataSource.runMigrations({ transaction: "all" });
    if (!pendingBeforeLegacy) {
      throw new Error("DB CONTRACT BOOTSTRAP FAILED: the disposable database already has legacy migration history");
    }
    if (legacyApplied.length !== legacyMigrations.length) {
      throw new Error(`DB CONTRACT BOOTSTRAP FAILED: applied ${legacyApplied.length}/${legacyMigrations.length} legacy migrations`);
    }
    await recordSynchronizedCoreMigrationHistory(legacyDataSource, synchronizedCoreMigrations);
    fixture = await seedLegacyRows(legacyDataSource);
  } finally {
    if (legacyDataSource.isInitialized) await legacyDataSource.destroy();
  }

  const fullDataSource = createContractDataSource(synchronizedOptions, portfolioMigrations);
  try {
    await fullDataSource.initialize();
    const pendingBeforePortfolio = await fullDataSource.showMigrations();
    const portfolioApplied = await fullDataSource.runMigrations({ transaction: "all" });
    const expectedPortfolioMigrations = portfolioMigrations.length;
    if (!pendingBeforePortfolio || portfolioApplied.length !== expectedPortfolioMigrations) {
      throw new Error(`DB CONTRACT BOOTSTRAP FAILED: applied ${portfolioApplied.length}/${expectedPortfolioMigrations} post-legacy migrations`);
    }
    await verifyLegacyRows(fullDataSource, fixture);
    console.log(
      `DB CONTRACT BOOTSTRAP PASS: synchronized current Personal/EDU/Learn schema and recorded ${synchronizedCoreMigrations.length} baseline migration markers, ` +
      `ran ${legacyApplied.length} Learn/EDU index, Growth/Talents, and course-diagnostic migrations, seeded Personal/EDU/Project/Talents fixtures, ` +
      `then applied ${portfolioApplied.length} Portfolio migrations (pending before Portfolio run: ${pendingBeforePortfolio}) and verified row preservation`,
    );
  } finally {
    if (fullDataSource.isInitialized) await fullDataSource.destroy();
  }
}

main().catch(error => {
  console.error(`DB CONTRACT BOOTSTRAP FAILED: ${error?.message || String(error)}`);
  process.exit(1);
});
