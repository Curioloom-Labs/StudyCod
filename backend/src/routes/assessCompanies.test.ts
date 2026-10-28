import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { assessCompaniesRouter } from "./assessCompanies";

async function readDossier(companyId = "company-1", assessmentId = "case-1") {
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId/assessments/:assessmentId" && entry.route.methods.get) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };
  await layer.route.stack.at(-1).handle({ userId: 120, userType: "USER", userMode: "PERSONAL", requestId: "request-1", ip: "127.0.0.1", params: { companyId, assessmentId } }, response);
  return { status, body };
}

async function readCompanySummary() {
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId" && entry.route.methods.get) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };
  await layer.route.stack.at(-1).handle({ userId: 120, userType: "USER", userMode: "PERSONAL", requestId: "request-1", ip: "127.0.0.1", params: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }, response);
  return { status, body };
}

async function manageCompanyMember(method: "patch" | "delete", body: Record<string, unknown> = {}) {
  const path = "/:companyId/members/:membershipId";
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer);
  let status = 200;
  let result: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { result = value; return response; } };
  await layer.route.stack.at(-1).handle({
    userId: 120, userType: "USER", userMode: "PERSONAL", requestId: "request-1", ip: "127.0.0.1",
    params: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }, body,
  }, response);
  return { status, result };
}

function captureAudit(t: any) {
  const events: Array<Record<string, any>> = [];
  t.mock.method(AppDataSource, "getRepository", (() => ({
    create: (event: Record<string, any>) => event,
    save: async (event: Record<string, any>) => { events.push(event); return event; },
  })) as any);
  return events;
}

async function createTechnicalTask(options: {
  companyId?: string;
  body?: Record<string, unknown>;
}) {
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId/assessments/:assessmentId/technical-task" && entry.route.methods.post) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };
  const req = {
    userId: 120, userType: "USER", userMode: "PERSONAL",
    params: { companyId: options.companyId ?? "company-1", assessmentId: "case-1" },
    body: options.body ?? {
      title: "Normalize account records", prompt: "Normalize incoming records and preserve the first valid account.",
      tests: [
        { input: "ADD Ada 1\n", output: "OK\n", group: "public", hidden: false },
        { input: "ADD Ada 1\nADD ADA 2\n", output: "EXISTS\n", group: "hidden-regression", hidden: true },
      ],
      idempotencyKey: "task-key-0001",
      files: [{ path: "attacker.py", content: "client supplied code must be ignored" }],
    },
  };
  await layer.route.stack.at(-1).handle(req, response);
  return { status, body };
}

async function submitTechnicalReview(body: Record<string, unknown>) {
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId/assessments/:assessmentId/technical-review" && entry.route.methods.post) as any;
  assert.ok(layer);
  let status = 200;
  let result: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { result = value; return response; } };
  await layer.route.stack.at(-1).handle({ userId: 120, userType: "USER", userMode: "PERSONAL", params: { companyId: "company-1", assessmentId: "case-1" }, body }, response);
  return { status, result };
}

const row = {
  id: "case-1", company_id: "company-1", candidate_id: 501, candidate_username: "candidate", status: "TASK_SUBMITTED",
  project_id: "project-1", version_id: "version-1", technical_assessment_id: "task-1", task_status: "PASSED",
  task_draft: JSON.stringify({ files: [{ path: "main.py", content: "print('submitted')" }], examples: [{ input: "private-example", output: "private-output" }], explanation: "Candidate explanation" }),
  files_json: JSON.stringify([{ path: "main.py", content: "print('original')" }]),
  questions_json: "[]", answers_json: JSON.stringify([{ questionId: "q1", answer: "Private interview answer" }]),
  result_json: JSON.stringify({ passed: true, testsPassed: 2, testsTotal: 2, hiddenTests: [{ input: "hidden-test-secret" }] }),
};

test("EDU principals cannot read the Assess company workspace", async t => {
  let databaseReads = 0;
  t.mock.method(AppDataSource, "query", async () => { databaseReads++; return []; });
  const layer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/" && entry.route.methods.get) as any;
  assert.ok(layer);
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };

  await layer.route.stack.at(-1).handle({ userId: 120, userType: "USER", userMode: "EDUCATIONAL" }, response);

  assert.equal(status, 403);
  assert.equal(body.code, "PERSONAL_USER_REQUIRED");
  assert.equal(databaseReads, 0);
});

test("the engineering dossier reads submitted files from the stored draft envelope and projects only allowed evidence", async t => {
  const auditEvents = captureAudit(t);
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM growth_company_members")) {
      assert.deepEqual(parameters, ["company-1", 120]);
      return [{ role: "ENGINEER" }];
    }
    assert.deepEqual(parameters, ["case-1", "company-1"]);
    return [row];
  });
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.assessment.task.files, [{ path: "main.py", content: "print('submitted')" }]);
  assert.deepEqual(result.body.assessment.task.result, { passed: true, testsPassed: 2, testsTotal: 2 });
  assert.equal(result.body.assessment.answers, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /hidden-test-secret|private-example|Private interview answer/);
  assert.equal(auditEvents.length, 1);
  assert.deepEqual(auditEvents[0], {
    actorType: "USER", actorId: 120, action: "assess.candidate-result.read", targetType: "candidate_assessment", targetId: 501,
    orgId: null, metadata: { assessmentId: "case-1", companyId: "company-1", role: "ENGINEER", status: "TASK_SUBMITTED" }, requestId: "request-1", ip: "127.0.0.1",
  });
  assert.doesNotMatch(JSON.stringify(auditEvents[0]), /submitted|Private|hidden|print\(/);
});

test("an active working copy and completed check stay private until the candidate submits", async t => {
  captureAudit(t);
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_company_members") ? [{ role: "ENGINEER" }] : [{ ...row, status: "TASK_ASSIGNED", task_status: "ACTIVE" }]);
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.equal(result.body.assessment.task.files, undefined);
  assert.equal(result.body.assessment.task.result, null);
  assert.equal(result.body.assessment.portfolio.files[0].content, "print('original')");
});

test("withdrawal removes source and submitted code from the company dossier", async t => {
  captureAudit(t);
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_company_members") ? [{ role: "ENGINEER" }] : [{ ...row, status: "WITHDRAWN" }]);
  const result = await readDossier();
  assert.equal(result.status, 200);
  assert.equal(result.body.assessment.portfolio, undefined);
  assert.equal(result.body.assessment.task, undefined);
  assert.doesNotMatch(JSON.stringify(result.body), /print\('submitted'\)|print\('original'\)/);
});

test("a user without active company membership cannot fetch candidate material", async t => {
  const auditEvents = captureAudit(t);
  let reads = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => { reads++; assert.match(sql, /FROM growth_company_members/); return []; });
  const result = await readDossier();
  assert.equal(result.status, 404);
  assert.equal(reads, 1);
  assert.equal(auditEvents.length, 0);
});

test("an active member of one company cannot read another company's candidate result", async t => {
  const auditEvents = captureAudit(t);
  const memberships = [{ company_id: "company-1", user_id: 120, role: "HR", status: "ACTIVE" }];
  let membershipLookup: unknown[] | undefined;
  let resultReads = 0;
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM growth_company_members")) {
      membershipLookup = parameters;
      return memberships.filter(member => member.company_id === parameters?.[0] && member.user_id === parameters?.[1] && member.status === "ACTIVE");
    }
    resultReads++;
    assert.fail("an unscoped candidate-result query must not run without membership in the requested company");
  });
  const result = await readDossier("company-2", "foreign-case");
  assert.equal(result.status, 404);
  assert.deepEqual(membershipLookup, ["company-2", 120]);
  assert.equal(resultReads, 0);
  assert.equal(auditEvents.length, 0);
});

test("opening a company assessment list records only its scope, role and result count", async t => {
  const auditEvents = captureAudit(t);
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "HR" }];
    if (sql.startsWith("SELECT id,name,created_at,updated_at FROM growth_companies")) return [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Example" }];
    if (sql.includes("FROM growth_company_members m JOIN users u")) return [{ id: "member-1", user_id: 120, username: "hr", role: "HR", status: "ACTIVE" }];
    if (sql.includes("FROM growth_company_assessments a JOIN users u")) return [{ id: "case-1", candidate_id: 501, candidate_username: "candidate", status: "TASK_SUBMITTED" }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  const result = await readCompanySummary();
  assert.equal(result.status, 200);
  assert.equal(auditEvents.length, 1);
  assert.deepEqual(auditEvents[0], {
    actorType: "USER", actorId: 120, action: "assess.company-assessments.list.read", targetType: "company_assessment_list", targetId: null,
    orgId: null, metadata: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", role: "HR", resultCount: 1 }, requestId: "request-1", ip: "127.0.0.1",
  });
  assert.doesNotMatch(JSON.stringify(auditEvents[0]), /candidate|case-1/);
});

test("HR members cannot create an Assess technical Judge task", async t => {
  let reads = 0;
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    reads++;
    assert.match(sql, /FROM growth_company_members/);
    assert.deepEqual(parameters, ["company-1", 120]);
    return [{ role: "HR" }];
  });
  const result = await createTechnicalTask({});
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { code: "ENGINEER_ACCESS_REQUIRED", message: "ENGINEER_ACCESS_REQUIRED" });
  assert.equal(reads, 1);
});

test("only the company owner can change a team member role", async t => {
  let memberReads = 0;
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "HR" }];
    memberReads++;
    writes++;
    assert.fail(`non-owners cannot inspect or change member roles: ${sql}`);
  });
  const result = await manageCompanyMember("patch", { role: "ENGINEER" });
  assert.equal(result.status, 403);
  assert.deepEqual(result.result, { code: "COMPANY_OWNER_REQUIRED", message: "COMPANY_OWNER_REQUIRED" });
  assert.equal(memberReads, 0);
  assert.equal(writes, 0);
});

test("the company owner can change HR or engineer responsibilities with a scoped update and audit event", async t => {
  const auditEvents = captureAudit(t);
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "OWNER" }];
    if (sql.startsWith("SELECT id,user_id,role,status FROM growth_company_members")) return [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: 222, role: "HR", status: "ACTIVE" }];
    if (sql.startsWith("UPDATE growth_company_members SET role=")) return { affectedRows: 1 };
    assert.fail(`Unexpected query: ${sql}`);
  });
  const result = await manageCompanyMember("patch", { role: "ENGINEER" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.result, { membership: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", role: "ENGINEER", status: "ACTIVE" } });
  const update = calls.find(call => call.sql.startsWith("UPDATE growth_company_members SET role="));
  assert.deepEqual(update?.parameters, ["ENGINEER", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 222, "HR", "ACTIVE"]);
  assert.deepEqual(auditEvents.map(({ action, targetType, metadata }) => ({ action, targetType, metadata })), [{
    action: "assess.company-member.role-changed", targetType: "company_member",
    metadata: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", memberUserId: 222, previousRole: "HR", role: "ENGINEER" },
  }]);
});

test("company owners cannot change or revoke the owner membership", async t => {
  captureAudit(t);
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "OWNER" }];
    if (sql.startsWith("SELECT id,user_id,role,status FROM growth_company_members")) return [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: 120, role: "OWNER", status: "ACTIVE" }];
    writes++;
    assert.fail(`The owner membership must remain immutable: ${sql}`);
  });
  const changed = await manageCompanyMember("patch", { role: "HR" });
  const revoked = await manageCompanyMember("delete");
  assert.equal(changed.status, 409);
  assert.equal(revoked.status, 409);
  assert.equal(writes, 0);
});

test("revoking a member soft-disables access and records the prior team role", async t => {
  const auditEvents = captureAudit(t);
  const updates: Array<{ sql: string; parameters?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "OWNER" }];
    if (sql.startsWith("SELECT id,user_id,role,status FROM growth_company_members")) return [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: 222, role: "ENGINEER", status: "ACTIVE" }];
    if (sql.startsWith("UPDATE growth_company_members SET status='REVOKED'")) { updates.push({ sql, parameters }); return { affectedRows: 1 }; }
    if (sql.startsWith("SELECT id,status,room_name,host_user_id,interviewer_ids_json FROM growth_interviews")) return [];
    assert.fail(`Unexpected query: ${sql}`);
  });
  const result = await manageCompanyMember("delete");
  assert.equal(result.status, 200);
  assert.deepEqual(result.result, { membership: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "REVOKED" } });
  assert.deepEqual(updates[0]?.parameters, ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 222, "ENGINEER", "ACTIVE"]);
  assert.match(updates[0]?.sql ?? "", /WHERE id=\? AND company_id=\? AND user_id=\? AND role=\? AND status=\?/);
  assert.deepEqual(auditEvents.map(({ action, metadata }) => ({ action, metadata })), [{
    action: "assess.company-member.access-revoked",
    metadata: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", memberUserId: 222, previousRole: "ENGINEER", previousStatus: "ACTIVE" },
  }]);
});

test("owners can re-invite a declined or revoked member using the preserved membership row", async t => {
  const auditEvents = captureAudit(t);
  const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
  const inviteLayer = assessCompaniesRouter.stack.find((entry: any) => entry.route?.path === "/:companyId/members" && entry.route.methods.post) as any;
  let status = 200;
  let body: any;
  const response = { status(value: number) { status = value; return response; }, json(value: unknown) { body = value; return response; } };
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    calls.push({ sql, parameters });
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "OWNER" }];
    if (sql.startsWith("SELECT id,username FROM users")) return [{ id: 222, username: "engineer" }];
    if (sql.startsWith("SELECT id,status FROM growth_company_members")) return [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", status: "REVOKED" }];
    if (sql.startsWith("UPDATE growth_company_members SET role=")) return { affectedRows: 1 };
    if (sql.startsWith("SELECT username FROM users")) return [{ username: "owner" }];
    if (sql.startsWith("INSERT INTO notifications")) return { affectedRows: 1 };
    assert.fail(`Unexpected query: ${sql}`);
  });
  await inviteLayer.route.stack.at(-1).handle({
    userId: 120, userType: "USER", userMode: "PERSONAL", requestId: "request-1", ip: "127.0.0.1",
    params: { companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, body: { username: "engineer", role: "HR" },
  }, response);
  assert.equal(status, 201);
  assert.deepEqual(body.membership, { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "engineer", role: "HR", status: "PENDING" });
  const reopen = calls.find(call => call.sql.startsWith("UPDATE growth_company_members SET role="));
  assert.deepEqual(reopen?.parameters, ["HR", 120, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 222, "REVOKED"]);
  assert.equal(calls.some(call => call.sql.startsWith("INSERT INTO growth_company_members")), false);
  assert.equal(auditEvents[0]?.action, "assess.company-member.reinvited");
});

test("an engineer cannot assign a technical task to an assessment outside the selected company", async t => {
  let runnerCreated = false;
  let assessmentLookup = 0;
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM growth_company_members")) return [{ role: "ENGINEER" }];
    assessmentLookup++;
    assert.match(sql, /WHERE a\.id=\? AND a\.company_id=\? LIMIT 1/);
    assert.deepEqual(parameters, ["case-1", "company-foreign"]);
    return [];
  });
  t.mock.method(AppDataSource, "createQueryRunner", () => { runnerCreated = true; throw new Error("foreign assessment must not enter a write transaction"); });
  const result = await createTechnicalTask({ companyId: "company-foreign" });
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { code: "CANDIDATE_PORTFOLIO_REQUIRED", message: "CANDIDATE_PORTFOLIO_REQUIRED" });
  assert.equal(assessmentLookup, 1);
  assert.equal(runnerCreated, false);
});

test("an engineer assigns a task against the candidate's selected version and keeps hidden tests private", async t => {
  const queryRunnerCalls: Array<{ sql: string; parameters?: unknown[] }> = [];
  let directQueryCalls = 0;
  const sourceFiles = [{ path: "main.py", content: "candidate's selected version" }];
  const selectedCase = {
    id: "case-1", candidate_id: 501, status: "PORTFOLIO_SELECTED", project_id: "project-1", version_id: "version-7",
    technical_assessment_id: null, task_hash: null, task_idempotency_key: null, family_key: "contacts", runtime: "PYTHON",
    blueprint_revision: "2026-10-v1", artifact_id: "artifact-7", files_json: JSON.stringify(sourceFiles), examples_json: "[]",
  };
  const freshCase = { status: "PORTFOLIO_SELECTED", technical_assessment_id: null, task_hash: null, task_idempotency_key: null };
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    directQueryCalls++;
    if (sql.includes("FROM growth_company_members")) {
      assert.deepEqual(parameters, ["company-1", 120]);
      return [{ role: "ENGINEER" }];
    }
    if (sql.includes("FROM growth_company_assessments a JOIN growth_projects p")) {
      assert.match(sql, /JOIN growth_project_versions v ON v\.id=a\.version_id AND v\.project_id=p\.id/);
      assert.match(sql, /JOIN growth_project_artifacts art ON art\.id=v\.artifact_id/);
      assert.deepEqual(parameters, ["case-1", "company-1"]);
      return [selectedCase];
    }
    if (sql.includes("SELECT username FROM users")) return [{ username: "engineer" }];
    if (sql.includes("INSERT INTO notifications")) return { affectedRows: 1 };
    assert.fail(`Unexpected direct database query: ${sql}`);
  });
  const runner = {
    async connect() {}, async startTransaction() {},
    async query(sql: string, parameters?: unknown[]) {
      queryRunnerCalls.push({ sql, parameters });
      if (sql.includes("SELECT status,technical_assessment_id,task_hash,task_idempotency_key")) return [freshCase];
      return [];
    },
    async commitTransaction() {}, async rollbackTransaction() {}, async release() {},
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);

  const result = await createTechnicalTask({});
  assert.equal(result.status, 201);
  assert.deepEqual(result.body, { assessmentId: result.body.assessmentId, status: "TASK_ASSIGNED", runtime: "PYTHON", tests: 2 });
  assert.match(result.body.assessmentId, /^[0-9a-f-]{36}$/i);
  assert.equal(directQueryCalls, 4);

  const attemptInsert = queryRunnerCalls.find(call => call.sql.includes("INSERT INTO growth_project_assessments"));
  assert.ok(attemptInsert);
  assert.deepEqual(attemptInsert.parameters?.slice(1, 4), ["project-1", 501, "version-7"]);
  assert.equal(attemptInsert.parameters?.[8], "case-1");
  const card = JSON.parse(String(attemptInsert.parameters?.[6]));
  assert.deepEqual(card.examples, [{ input: "ADD Ada 1\n", output: "OK\n" }]);
  assert.deepEqual(card.tests.map((item: any) => item.hidden), [false, true]);
  const pinnedDraft = JSON.parse(String(attemptInsert.parameters?.[7]));
  assert.deepEqual(pinnedDraft.files, sourceFiles);
  assert.deepEqual(pinnedDraft.examples, []);
  assert.doesNotMatch(JSON.stringify(pinnedDraft), /client supplied code/);

  const assessmentUpdate = queryRunnerCalls.find(call => call.sql.includes("UPDATE growth_company_assessments SET task_title"));
  assert.ok(assessmentUpdate);
  assert.deepEqual(assessmentUpdate.parameters?.slice(-2), ["case-1", "company-1"]);
  const storedTests = JSON.parse(String(assessmentUpdate.parameters?.[3]));
  assert.deepEqual(storedTests.map((item: any) => item.hidden), [false, true]);
  assert.ok(queryRunnerCalls.some(call => call.sql.includes("WHERE id=? AND company_id=? FOR UPDATE") && JSON.stringify(call.parameters) === JSON.stringify(["case-1", "company-1"])));
});

test("an engineer explicitly grants only the reviewed summary for Portfolio sharing", async t => {
  const savedReviews: Array<Record<string, unknown>> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.includes("FROM growth_company_members")) return [{ role: "ENGINEER" }];
    if (sql.includes("FROM growth_company_assessments a")) {
      assert.match(sql, /WHERE a\.id=\? AND a\.company_id=\? LIMIT 1/);
      assert.deepEqual(parameters, ["case-1", "company-1"]);
      return [{ status: "TASK_SUBMITTED", attempt_status: "PASSED" }];
    }
    if (sql.includes("SELECT username FROM users")) return [{ username: "engineer" }];
    if (sql.startsWith("UPDATE growth_company_assessments SET technical_review_json")) {
      savedReviews.push(JSON.parse(String(parameters?.[0])) as Record<string, unknown>);
      assert.deepEqual(parameters?.slice(1), ["case-1", "company-1"]);
      return { affectedRows: 1 };
    }
    if (sql.includes("SELECT candidate_id FROM growth_company_assessments")) return [{ candidate_id: 501 }];
    if (sql.includes("INSERT INTO notifications")) return { affectedRows: 1 };
    assert.fail(`Unexpected review query: ${sql}`);
  });
  const result = await submitTechnicalReview({ scores: [2, 2, 3], comment: "Reviewed test result.", recommendation: "READY_TO_CONTINUE", allowPortfolioEvidence: true });
  assert.equal(result.status, 200);
  assert.equal(result.result.review.allowPortfolioEvidence, true);
  assert.equal(savedReviews[0]?.allowPortfolioEvidence, true);
});
