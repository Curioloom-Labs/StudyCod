import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { assessInterviewsRouter } from "./assessInterviews";
import { portfolioProjectsRouter } from "./portfolioProjects";
import { RoomServiceClient } from "livekit-server-sdk";
import { BUILTIN_INTERVIEW_KITS } from "../services/assessInterviewKit";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const kit = BUILTIN_INTERVIEW_KITS[1].kit;
const row = { id, runtime: "PYTHON", room_name: "talent_test", company_id: "company", assessment_id: "case", candidate_id: 10, candidate_username: "candidate", host_user_id: 20, interviewer_ids_json: "[20,30]", editor_user_id: 10, consent_status: "ACCEPTED", consent_at: "2026-10-26", status: "LIVE", draft_revision: 2, draft_json: JSON.stringify({ files: [{ path: "main.py", content: "print('saved')" }] }), kit_snapshot: JSON.stringify(kit), kit_hash: "pinned-kit" };
async function request(path: string, method: string, userId = 10, body: unknown = {}) {
  const layer = assessInterviewsRouter.stack.find((item: any) => item.route?.path === path && item.route.methods[method]) as any;
  assert.ok(layer, path);
  let status = 200; let result: any;
  const response = { status(code: number) { status = code; return response; }, json(data: unknown) { result = data; return response; } };
  await layer.route.stack.at(-1).handle({ userId, userMode: "PERSONAL", userType: "USER", params: { interviewId: id }, query: {}, body }, response);
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

test("EDU principals are rejected before Assess interview routes run", () => {
  const guard = assessInterviewsRouter.stack.find((item: any) =>
    !item.route && String(item.handle).includes("PERSONAL_USER_REQUIRED")) as any;
  assert.ok(guard, "the interview router must keep its Personal-mode guard");
  let status = 200;
  let result: any;
  let continued = false;
  const response = { status(code: number) { status = code; return response; }, json(data: unknown) { result = data; return response; } };

  guard.handle({ userId: 20, userMode: "EDUCATIONAL", userType: "USER" }, response, () => { continued = true; });

  assert.equal(status, 403);
  assert.equal(result.code, "PERSONAL_USER_REQUIRED");
  assert.equal(continued, false);
});

test("candidate detail has no private notes, hidden tests, starter files or quiz keys before consent", async t => {
  const reads: string[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    reads.push(sql);
    if (sql.includes("FROM growth_interviews")) return [{ ...row, consent_status: "INVITED", consent_at: null, status: "SCHEDULED" }];
    if (sql.includes("released_at IS NOT NULL")) return [];
    if (sql.includes("FROM growth_company_members")) return [{ id: 20, username: "host", role: "HR" }, { id: 99, username: "unassigned", role: "ENGINEER" }];
    throw new Error(`Unexpected private query: ${sql}`);
  });
  const { status, result } = await request("/interviews/:interviewId", "get");
  assert.equal(status, 200);
  assert.equal(result.ownNote, null);
  assert.equal(result.interview.files, undefined);
  assert.deepEqual(result.executions, []);
  assert.equal(result.interview.participants.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /correctIndex|a@@b|print\('saved'\)|unassigned/);
  assert.equal(reads.some(sql => sql.includes("private_text") || sql.includes("growth_interview_quizzes")), false);
});
test("each interviewer reads only their own note; candidate gets only explicitly shared feedback", async t => {
  const auditEvents = captureAudit(t);
  let caller = 20;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: any[]) => {
    if (sql.includes("FROM growth_interviews")) return [row];
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "HR" }];
    if (sql.includes("private_text")) { assert.deepEqual(params, [id, caller]); return [{ revision: 1, private_text: "only-own-note", scores_json: "[null,1,2,3]", feedback_text: "draft feedback", practice_text: "draft practice" }]; }
    if (sql.includes("released_at IS NOT NULL")) return [{ username: "engineer", released_json: JSON.stringify({ text: "Shared feedback", practice: "Try regression cases" }) }];
    return [];
  });
  const staff = await request("/interviews/:interviewId", "get", caller);
  assert.equal(staff.result.ownNote.privateText, "only-own-note");
  caller = 10;
  const candidate = await request("/interviews/:interviewId", "get", caller);
  assert.equal(candidate.result.ownNote, null);
  assert.equal(candidate.result.feedback[0].text, "Shared feedback");
  assert.doesNotMatch(JSON.stringify(candidate.result), /only-own-note|draft feedback|scores/);
  assert.equal(auditEvents.length, 1);
  assert.deepEqual(auditEvents[0], {
    actorType: "USER", actorId: 20, action: "assess.candidate-result.read", targetType: "candidate_assessment", targetId: 10,
    orgId: null, metadata: { assessmentId: "case", companyId: "company", interviewId: id, role: "HR", status: "LIVE", consentStatus: "ACCEPTED" }, requestId: null, ip: null,
  });
  assert.doesNotMatch(JSON.stringify(auditEvents[0]), /only-own-note|draft feedback|print\('saved'\)/);
});
test("only the current editor may save and stale revision writes fail without overwriting", async t => {
  let writes = 0;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: any[]) => {
    if (sql.includes("FROM growth_interviews")) return [row];
    if (sql.includes("FROM growth_company_members")) return [{ role: "ENGINEER" }];
    assert.match(sql, /status='LIVE' AND editor_user_id=\? AND draft_revision=\?/);
    assert.equal(params?.[params.length - 1], 1); writes++; return { affectedRows: 0 };
  });
  assert.equal((await request("/interviews/:interviewId/draft", "put", 30, { files: kit.files, expectedRevision: 1 })).status, 403);
  const stale = await request("/interviews/:interviewId/draft", "put", 10, { files: kit.files, expectedRevision: 1 });
  assert.equal(stale.status, 409); assert.equal(stale.result.code, "DRAFT_REVISION_CONFLICT"); assert.equal(writes, 1);
});
test("quiz retry uses the same immutable answer snapshot, including reordered JSON keys", async t => {
  let stored: Record<string, any> | null = null;
  t.mock.method(AppDataSource, "query", async (sql: string, params?: any[]) => {
    if (sql.startsWith("INSERT IGNORE INTO growth_interview_quizzes")) { stored ??= { answers_json: params?.[3], result_json: params?.[4] }; return { affectedRows: 1 }; }
    if (sql.includes("FROM growth_interviews")) return [row];
    if (sql.includes("FROM growth_interview_quizzes")) return stored ? [stored] : [];
    throw new Error(sql);
  });
  const first = await request("/interviews/:interviewId/quiz", "post", 10, { answers: { idempotence: 0, regression: 1 } });
  assert.deepEqual(first.result.result, { correct: 2, total: 2 });
  assert.equal((await request("/interviews/:interviewId/quiz", "post", 10, { answers: { regression: 1, idempotence: 0 } })).status, 200);
  const changed = await request("/interviews/:interviewId/quiz", "post", 10, { answers: { regression: 0, idempotence: 0 } });
  assert.equal(changed.status, 409); assert.equal(changed.result.code, "QUIZ_ALREADY_SUBMITTED");
});
test("candidate cannot submit private notes or release interviewer feedback", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => { assert.match(sql, /FROM growth_interviews/); return [row]; });
  assert.equal((await request("/interviews/:interviewId/notes", "put")).status, 403);
  assert.equal((await request("/interviews/:interviewId/release-feedback", "post")).status, 403);
});
test("only interviewers can grant or revoke the candidate's public Portfolio citation", async t => {
  let released: Record<string, unknown> | null = null;
  const mutations: Array<Record<string, unknown>> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, params?: any[]) => {
    if (sql.includes("FROM growth_interviews i JOIN growth_company_assessments")) return [{ ...row, status: "COMPLETED" }];
    if (sql.includes("SELECT role FROM growth_company_members")) return [{ role: "HR" }];
    if (sql.startsWith("SELECT revision,feedback_text,practice_text,released_json")) return [{ revision: 2, feedback_text: "Clear explanation of the implementation and tradeoffs.", practice_text: "Add another regression case.", released_json: released ? JSON.stringify(released) : null }];
    if (sql.startsWith("UPDATE growth_interview_notes SET released_json=?")) {
      const feedback = JSON.parse(String(params?.[0])) as Record<string, unknown>;
      mutations.push({ sql, feedback, params }); released = feedback; return { affectedRows: 1 };
    }
    if (sql.includes("SELECT username FROM users")) return [{ username: "interviewer" }];
    if (sql.includes("INSERT INTO notifications")) return { affectedRows: 1 };
    throw new Error(`Unexpected feedback-release query: ${sql}`);
  });
  const first = await request("/interviews/:interviewId/release-feedback", "post", 20, { expectedRevision: 2, allowPublicPortfolio: true });
  assert.equal(first.status, 200);
  assert.equal(first.result.feedback.allowPublicPortfolio, true);
  assert.equal(mutations[0].sql, "UPDATE growth_interview_notes SET released_json=?,released_at=UTC_TIMESTAMP(3) WHERE interview_id=? AND user_id=? AND revision=? AND released_at IS NULL");
  const revoked = await request("/interviews/:interviewId/release-feedback", "post", 20, { expectedRevision: 2, allowPublicPortfolio: false });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.result.feedback.allowPublicPortfolio, false);
  assert.match(String(mutations[1].sql), /released_at IS NOT NULL/);
});
test("HR can create a company-scoped interview test kit", async t => {
  const companyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const statements: Array<{ sql: string; params?: unknown[] }> = [];
  t.mock.method(AppDataSource, "query", async (sql: string, params?: unknown[]) => {
    statements.push({ sql, params });
    if (sql.includes("SELECT role FROM growth_company_members")) {
      assert.deepEqual(params, [companyId, 20]);
      return [{ role: "HR" }];
    }
    if (sql.includes("INSERT IGNORE INTO growth_interview_kits")) {
      assert.equal(params?.[1], companyId);
      assert.equal(params?.[2], 20);
      assert.equal(params?.[3], kit.title);
      assert.deepEqual(JSON.parse(String(params?.[4])), kit);
      assert.match(String(params?.[5]), /^[0-9a-f]{64}$/);
      return { affectedRows: 1 };
    }
    if (sql.includes("SELECT id FROM growth_interview_kits WHERE company_id=? AND content_hash=?")) return [{ id: "saved-hr-kit" }];
    throw new Error(`Unexpected kit query: ${sql}`);
  });
  const layer = assessInterviewsRouter.stack.find((item: any) => item.route?.path === "/companies/:companyId/kits" && item.route.methods.post) as any;
  assert.ok(layer);
  let status = 200; let result: any;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { result = value; return response; } };
  await layer.route.stack.at(-1).handle({ userId: 20, userMode: "PERSONAL", userType: "USER", params: { companyId }, body: { kit } }, response);
  assert.equal(status, 201);
  assert.deepEqual(result, { id: "saved-hr-kit" });
  assert.equal(statements.length, 3);
});
test("the legacy project job endpoint cannot bypass interview consent and return an interview result", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    assert.match(sql, /project_id IS NOT NULL/);
    return [];
  });
  const layer = portfolioProjectsRouter.stack.find((item: any) => item.route?.path === "/executions/:jobId" && item.route.methods.get) as any;
  let status = 200, payload: any;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { payload = value; return res; } };
  await layer.route.stack.at(-1).handle({ userId: 20, userType: "USER", userMode: "PERSONAL", params: { jobId: id } }, res);
  assert.equal(status, 404); assert.equal(payload.error ?? payload.message ?? payload.code, "JOB_NOT_FOUND");
});
test("host cannot start before explicit candidate consent", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_interviews") ? [{ ...row, status: "SCHEDULED", consent_status: "INVITED", consent_at: null }] : [{ role: "HR" }]);
  const result = await request("/interviews/:interviewId/start", "post", 20);
  assert.equal(result.status, 409); assert.equal(result.result.code, "CANDIDATE_CONSENT_REQUIRED");
});
test("reading an overdue live interview finalizes and freezes its saved draft", async t => {
  t.mock.method(RoomServiceClient.prototype, "deleteRoom", async () => {});
  const expired = { ...row, duration_expired: 1 };
  let artifactSnapshot = "";
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_interviews") ? [expired] : []);
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, rollbackTransaction: async () => {}, release: async () => {}, commitTransaction: async () => {},
    query: async (sql: string, parameters: any[] = []) => {
      if (sql.includes("FROM growth_interviews i") && sql.includes("FOR UPDATE")) return [expired];
      if (sql.includes("INSERT IGNORE INTO growth_project_artifacts")) { artifactSnapshot = parameters[3]; return { affectedRows: 1 }; }
      if (sql.startsWith("SELECT id FROM growth_project_artifacts")) return [{ id: "expired-artifact" }];
      if (sql.includes("SET status='COMPLETED'")) { assert.deepEqual(parameters, ["expired-artifact", id]); return { affectedRows: 1 }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request("/interviews/:interviewId", "get", 10);
  assert.equal(result.status, 200);
  assert.equal(result.result.interview.status, "COMPLETED");
  assert.deepEqual(JSON.parse(artifactSnapshot), [{ path: "main.py", content: "print('saved')" }]);
});
test("interview execution is accepted by the existing durable queue with pinned code, runtime, tests and revision", async t => {
  const trace: string[] = []; let inserted: any[] = [];
  t.mock.method(AppDataSource, "query", async () => [row]);
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, rollbackTransaction: async () => { trace.push("rollback"); }, release: async () => {}, commitTransaction: async () => { trace.push("commit"); },
    query: async (sql: string, params: any[] = []) => {
      assert.equal((sql.match(/\?/g) ?? []).length, params.length, sql); trace.push(sql);
      if (sql.includes("FROM growth_interviews")) return [{ ...row, runtime: "PYTHON" }];
      if (sql.includes("SELECT id FROM growth_project_artifacts")) return [{ id: "artifact-1" }];
      if (sql.startsWith("INSERT INTO growth_project_jobs")) { inserted = params; assert.match(sql, /project_id,interview_id/); assert.match(sql, /VALUES\(\?,NULL/); }
      return [];
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request("/interviews/:interviewId/executions", "post", 10, { kind: "CHECK", expectedRevision: 2, idempotencyKey: "check-request-1" });
  assert.equal(result.status, 202); assert.equal(result.result.state, "QUEUED");
  assert.ok(trace.some(sql => sql.includes("growth_project_queue_guard") && sql.includes("FOR UPDATE")));
  assert.equal(inserted[1], id); assert.equal(inserted[4], "artifact-1"); assert.equal(inserted[8], "check-request-1");
  assert.equal(inserted[9], "PYTHON"); // Runtime is pinned by the stored session, not the request body.
  assert.equal(inserted[10], "CHECK"); assert.equal(inserted[11], 2);
  assert.equal(JSON.parse(inserted[7]).length, kit.tests.length);
  assert.ok(trace.includes("commit")); assert.ok(!trace.includes("rollback"));
});
test("Judge executions are rejected at the server-side duration boundary", async t => {
  const trace: string[] = [];
  t.mock.method(AppDataSource, "query", async () => [row]);
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, rollbackTransaction: async () => { trace.push("rollback"); }, release: async () => {}, commitTransaction: async () => { trace.push("commit"); },
    query: async (sql: string) => {
      trace.push(sql);
      if (sql.includes("FROM growth_interviews")) return [{ ...row, duration_active: 0 }];
      return [];
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request("/interviews/:interviewId/executions", "post", 10, { kind: "CHECK", expectedRevision: 2, idempotencyKey: "expired-check-1" });
  assert.equal(result.status, 409);
  assert.equal(result.result.code, "INTERVIEW_TIME_LIMIT_REACHED");
  assert.ok(trace.some(sql => sql.includes("TIMESTAMPADD(MINUTE,duration_minutes,started_at)>UTC_TIMESTAMP(3)")));
  assert.equal(trace.some(sql => sql.startsWith("INSERT INTO growth_project_jobs")), false);
  assert.ok(trace.includes("rollback"));
});
test("finishing an interview freezes the saved revision into an artifact owned by the candidate", async t => {
  t.mock.method(RoomServiceClient.prototype, "deleteRoom", async () => {});
  let completed = false, snapshot = "";
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_interviews") ? [row] : [{ role: "HR" }]);
  const runner = {
    connect: async () => {}, startTransaction: async () => {}, rollbackTransaction: async () => {}, release: async () => {}, commitTransaction: async () => {},
    query: async (sql: string, params: any[] = []) => {
      assert.equal((sql.match(/\?/g) ?? []).length, params.length);
      if (sql.includes("FROM growth_interviews")) return [row];
      if (sql.includes("INSERT IGNORE INTO growth_project_artifacts")) { assert.equal(params[1], 10); snapshot = params[3]; }
      if (sql.includes("SELECT id FROM growth_project_artifacts")) return [{ id: "final-artifact" }];
      if (sql.includes("SET status='COMPLETED'")) { completed = true; assert.deepEqual(params, ["final-artifact", id]); }
      return [];
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  const result = await request("/interviews/:interviewId/end", "post", 20, { expectedRevision: 2 });
  assert.equal(result.status, 200); assert.equal(completed, true);
  assert.deepEqual(JSON.parse(snapshot), [{ path: "main.py", content: "print('saved')" }]);
});
