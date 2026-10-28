import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { ASSESS_RUNTIMES, ALL_JUDGE_LANGUAGES } from "../config/judgeLanguages";
import { assessEntryFile } from "./assessInterviewLanguage";
import { BUILTIN_INTERVIEW_KITS, gradeInterviewQuiz, interviewFiles, interviewKitSchema, publicInterviewKit } from "./assessInterviewKit";
import { canReadInterviewWorkspace, interviewAccess, interviewCalendar, revokeAssessInterviewMemberAccess } from "./assessInterviewAccess";
import { summarizeAssessInterviewExecution } from "./assessInterviewResult";
import type { JudgeResponse, JudgeTestCase } from "./judgeWorker/types";
import { RoomServiceClient } from "livekit-server-sdk";
import { env } from "../env";
import { assessInterviewMediaToken } from "./assessInterviewMedia";

const kit = BUILTIN_INTERVIEW_KITS[1].kit;
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("all shipped kits validate, include three runtimes, and hide answer keys and hidden cases", () => {
  for (const item of BUILTIN_INTERVIEW_KITS) {
    assert.equal(interviewKitSchema.safeParse(item.kit).success, true, item.id);
    const publicKit = publicInterviewKit(item.kit);
    assert.equal(publicKit.testCount, item.kit.tests.length);
    assert.equal(publicKit.examples.length, item.kit.tests.filter(test => !test.hidden).length);
    assert.equal("files" in publicKit, false);
    assert.equal("tests" in publicKit, false);
    assert.doesNotMatch(JSON.stringify(publicKit), /correctIndex|a@@b|"hidden":/);
  }
  assert.deepEqual(new Set(BUILTIN_INTERVIEW_KITS.filter(item => item.kit.kind === "TECHNICAL").map(item => item.kit.runtime)), new Set(["PYTHON", "JAVA", "CPP"]));
});
test("Assessment kits accept every existing Judge family and require its registered entry file", () => {
  assert.deepEqual([...ASSESS_RUNTIMES].map(runtime => runtime.toLowerCase()).sort(), [...ALL_JUDGE_LANGUAGES].sort());
  for (const runtime of ASSESS_RUNTIMES) {
    const entry = assessEntryFile(runtime)!;
    const adapted = { ...kit, runtime, files: [{ path: entry, content: "" }] };
    assert.equal(interviewKitSchema.safeParse(adapted).success, true, runtime);
    assert.equal(interviewKitSchema.safeParse({ ...adapted, files: [{ path: "wrong.txt", content: "" }] }).success, false, runtime);
  }
});
test("draft file validation rejects traversal, aliases, duplicates, and byte-limit violations", () => {
  for (const path of ["../main.py", "/main.py", "a/../main.py", "a//main.py", "a/./main.py", "C:\\main.py"])
    assert.equal(interviewFiles([{ path, content: "" }]), null, path);
  assert.equal(interviewFiles([{ path: "main.py", content: "" }, { path: "main.py", content: "" }]), null);
  assert.equal(interviewFiles([{ path: "main.py", content: "ї".repeat(32769) }]), null);
  assert.equal(interviewFiles(Array.from({ length: 5 }, (_, i) => ({ path: `${i}.py`, content: "a".repeat(65536) }))), null);
  assert.deepEqual(interviewFiles([{ path: "z.py", content: "z" }, { path: "main.py", content: "main" }, { path: "a.py", content: "a" }])?.map(file => file.path), ["a.py", "main.py", "z.py"]);
  assert.deepEqual(interviewFiles([{ path: "main.rs", content: "fn main() {}" }], "RUST")?.map(file => file.path), ["main.rs"]);
  assert.equal(interviewFiles([{ path: "main.py", content: "print(1)" }], "RUST"), null);
});
test("quiz validation rejects duplicate identifiers and invalid answer indexes", () => {
  assert.equal(interviewKitSchema.safeParse({ ...kit, quiz: [kit.quiz[0], kit.quiz[0]] }).success, false);
  assert.equal(interviewKitSchema.safeParse({ ...kit, quiz: [{ ...kit.quiz[0], correctIndex: 4 }] }).success, false);
  assert.deepEqual(gradeInterviewQuiz(kit, { regression: 1, idempotence: 0 }), { correct: 2, total: 2 });
  assert.deepEqual(gradeInterviewQuiz(kit, { regression: 0, idempotence: 0 }), { correct: 1, total: 2 });
  const invalidAnswers: Record<string, number>[] = [{}, { idempotence: 0 }, { idempotence: 0, regression: 1, injected: 0 }, { idempotence: 3, regression: 1 }];
  for (const answers of invalidAnswers) assert.equal(gradeInterviewQuiz(kit, answers), null);
});
const row = { id, candidate_id: 10, company_id: "company", host_user_id: 20, interviewer_ids_json: "[20,30]", consent_status: "ACCEPTED", consent_at: "2026-10-26", status: "LIVE" };
test("interview access is limited to the candidate or an assigned active team member; owners can supervise", async t => {
  let member: string | null = "ENGINEER";
  t.mock.method(AppDataSource, "query", async (sql: string) => sql.includes("FROM growth_interviews") ? [row] : member ? [{ role: member }] : []);
  assert.equal((await interviewAccess(id, 10))?.role, "CANDIDATE");
  assert.equal((await interviewAccess(id, 30))?.canHost, false);
  assert.equal((await interviewAccess(id, 20))?.canHost, true);
  assert.equal(await interviewAccess(id, 40), null);
  member = "OWNER"; assert.equal((await interviewAccess(id, 40))?.canHost, true);
  member = null; assert.equal(await interviewAccess(id, 20), null);
});
test("revoked consent prevents access for both company and candidate", async t => {
  for (const consent_status of ["WITHDRAWN", "DECLINED", "CLOSED"]) {
    t.mock.method(AppDataSource, "query", async () => [{ ...row, consent_status }]);
    assert.equal(await interviewAccess(id, 10), null);
    assert.equal(await interviewAccess(id, 20), null);
    t.mock.restoreAll();
  }
});
test("revoking a company member cancels their hosted session and ejects them from other live sessions", async t => {
  const interviews = [
    { id: "hosted-live", status: "LIVE", room_name: "hosted-room", host_user_id: 20, interviewer_ids_json: "[20,30]" },
    { id: "assigned-live", status: "LIVE", room_name: "shared-room", host_user_id: 40, interviewer_ids_json: "[30,20]" },
    { id: "assigned-upcoming", status: "SCHEDULED", room_name: "upcoming-room", host_user_id: 40, interviewer_ids_json: "[20,50]" },
  ];
  const updates: Array<{ sql: string; parameters?: unknown[] }> = [];
  const closedRooms: string[] = [];
  const removedParticipants: Array<{ room: string; identity: string }> = [];
  const original = { __liveKitEnabled: env.__liveKitEnabled, __liveKitUrl: env.__liveKitUrl, __liveKitApiKey: env.__liveKitApiKey, __liveKitApiSecret: env.__liveKitApiSecret };
  Object.assign(env, { __liveKitEnabled: true, __liveKitUrl: "wss://media.test.invalid", __liveKitApiKey: "test-key", __liveKitApiSecret: "test-only-secret-for-signing-talent-tokens" });
  t.after(() => Object.assign(env, original));
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    if (sql.startsWith("SELECT id,status,room_name,host_user_id,interviewer_ids_json FROM growth_interviews")) {
      assert.deepEqual(parameters, ["company", 20, 20]); return interviews;
    }
    updates.push({ sql, parameters });
    return { affectedRows: 1 };
  });
  t.mock.method(RoomServiceClient.prototype, "deleteRoom", async (room: string) => { closedRooms.push(room); });
  t.mock.method(RoomServiceClient.prototype, "removeParticipant", async (room: string, identity: string) => { removedParticipants.push({ room, identity }); });

  await revokeAssessInterviewMemberAccess("company", 20);

  assert.deepEqual(updates.filter(update => update.sql.includes("JSON_REMOVE")).map(update => update.parameters), [
    ["$[0]", "hosted-live", "company"], ["$[1]", "assigned-live", "company"], ["$[0]", "assigned-upcoming", "company"],
  ]);
  assert.equal(updates.filter(update => update.sql.includes("status='CANCELLED'")).length, 1);
  assert.deepEqual(closedRooms, ["hosted-room"]);
  assert.deepEqual(removedParticipants, [{ room: "shared-room", identity: "talent-user-20" }]);
});
test("a candidate sees preparation but no code until consent and interview start", () => {
  const base = { row, role: "CANDIDATE" as const, userId: 10, canHost: false, consented: false };
  assert.equal(canReadInterviewWorkspace(base), false);
  assert.equal(canReadInterviewWorkspace({ ...base, consented: true, row: { ...row, status: "SCHEDULED" } }), false);
  assert.equal(canReadInterviewWorkspace({ ...base, consented: true }), true);
});
test("calendar uses UTC and escapes untrusted titles without introducing ICS fields", () => {
  const ics = interviewCalendar({ ...row, title: "Role, test;\nATTENDEE:bad", company_name: "Company", scheduled_utc: "2026-10-26T12:00:00.000Z", scheduled_at: "wrong-local-value", duration_minutes: 45, created_at: "2026-10-25T00:00:00Z" }, "https://studycod.space");
  assert.match(ics, /^PRODID:-\/\/StudyCod\/\/Assess Interviews\/\/EN$/m);
  assert.match(ics, /DTSTART:20261026T120000Z/);
  assert.match(ics, /DTEND:20261026T124500Z/);
  assert.match(ics, /SUMMARY:Role\\, test\\;\\nATTENDEE:bad/);
  assert.match(ics, /URL:https:\/\/studycod\.space\/assess\/interviews\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.match(ics, /DESCRIPTION:Company\\nhttps:\/\/studycod\.space\/assess\/interviews\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/);
  assert.doesNotMatch(ics, /\r\nATTENDEE:/);
});
test("code checks expose public outputs only, while explicit runs show their own bounded output", () => {
  const tests: JudgeTestCase[] = [{ id: "public", input: "public", output: "public-output", hidden: false }, { id: "hidden", input: "secret-input", output: "secret-output", hidden: true }];
  const result: JudgeResponse = { submission_id: "test", verdict: "WA", time_ms: 10, memory_kb: 128, tests: tests.map(item => ({ test_id: item.id, verdict: "WA", time_ms: 5, memory_kb: 64, actual: item.output, stderr: "secret-diagnostic" })) };
  const check = summarizeAssessInterviewExecution(result, tests, "CHECK");
  assert.equal(check.publicTests.length, 1);
  assert.doesNotMatch(JSON.stringify(check), /secret-/);
  const run = summarizeAssessInterviewExecution({ ...result, tests: [{ ...result.tests[0], actual: "x".repeat(70000), stderr: "y".repeat(5000) }] }, [tests[0]], "RUN");
  assert.equal(run.runOk, true);
  assert.equal(run.stdout?.length, 65536);
  assert.equal(run.stderr?.length, 4096);
  assert.equal(summarizeAssessInterviewExecution({ ...result, tests: [{ ...result.tests[0], verdict: "RE" }] }, [tests[0]], "RUN").runOk, false);
});
test("media tokens are short lived and restricted to one room without administrative or data-channel access", async t => {
  const original = { __liveKitEnabled: env.__liveKitEnabled, __liveKitUrl: env.__liveKitUrl, __liveKitApiKey: env.__liveKitApiKey, __liveKitApiSecret: env.__liveKitApiSecret };
  Object.assign(env, { __liveKitEnabled: true, __liveKitUrl: "wss://media.test.invalid", __liveKitApiKey: "test-key", __liveKitApiSecret: "test-only-secret-for-signing-talent-tokens" });
  t.after(() => Object.assign(env, original));
  t.mock.method(RoomServiceClient.prototype, "listRooms", async () => []);
  const connection = await assessInterviewMediaToken("talent_assigned_room", 10, "candidate");
  assert.ok(connection);
  const payload = JSON.parse(Buffer.from(connection.token.split(".")[1], "base64url").toString("utf8"));
  assert.equal(payload.sub, "talent-user-10"); assert.equal(payload.exp - payload.nbf, 300);
  assert.equal(payload.video.room, "talent_assigned_room"); assert.equal(payload.video.roomJoin, true);
  assert.equal(payload.video.canPublishData, false); assert.equal(payload.video.roomAdmin, false);
  assert.equal(payload.video.roomCreate, undefined); assert.equal(payload.video.roomList, undefined);
});
