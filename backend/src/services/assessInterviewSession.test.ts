import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../data-source";
import { RoomServiceClient } from "livekit-server-sdk";
import { expireOverdueAssessInterviews, finalizeExpiredAssessInterview } from "./assessInterviewSession";

test("an expired live interview freezes the latest draft as a candidate-owned artifact", async t => {
  t.mock.method(RoomServiceClient.prototype, "deleteRoom", async () => {});
  const savedFiles = [{ path: "main.py", content: "print('latest saved work')" }];
  const row = {
    status: "LIVE", duration_expired: 1, candidate_id: 10, runtime: "PYTHON", room_name: "assess-room-1",
    draft_json: JSON.stringify({ files: savedFiles }),
  };
  const trace: string[] = [];
  let artifactFiles = "";
  let artifactOwner = 0;
  const runner = {
    connect: async () => { trace.push("connect"); },
    startTransaction: async () => { trace.push("begin"); },
    commitTransaction: async () => { trace.push("commit"); },
    rollbackTransaction: async () => { trace.push("rollback"); },
    release: async () => { trace.push("release"); },
    query: async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes("FROM growth_interviews i") && sql.includes("FOR UPDATE")) return [row];
      if (sql.includes("INSERT IGNORE INTO growth_project_artifacts")) {
        artifactOwner = Number(parameters[1]);
        artifactFiles = String(parameters[3]);
        return { affectedRows: 1 };
      }
      if (sql.startsWith("SELECT id FROM growth_project_artifacts")) return [{ id: "final-artifact" }];
      if (sql.includes("SET status='COMPLETED'")) {
        assert.deepEqual(parameters, ["final-artifact", "interview-1"]);
        return { affectedRows: 1 };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);

  const result = await finalizeExpiredAssessInterview("interview-1");
  assert.deepEqual(result, { status: "COMPLETED", finalized: true });
  assert.equal(artifactOwner, 10);
  assert.deepEqual(JSON.parse(artifactFiles), savedFiles);
  assert.deepEqual(trace, ["connect", "begin", "commit", "release"]);
});

test("the expiry transaction leaves an unexpired or non-live interview unchanged", async t => {
  const trace: string[] = [];
  const runner = {
    connect: async () => {}, startTransaction: async () => {},
    commitTransaction: async () => { trace.push("commit"); }, rollbackTransaction: async () => { trace.push("rollback"); }, release: async () => {},
    query: async (sql: string) => {
      assert.match(sql, /TIMESTAMPADD\(MINUTE,i\.duration_minutes,i\.started_at\)<=UTC_TIMESTAMP\(3\)/);
      return [{ status: "LIVE", duration_expired: 0 }];
    },
  };
  t.mock.method(AppDataSource, "createQueryRunner", () => runner as any);
  assert.deepEqual(await finalizeExpiredAssessInterview("interview-1"), { status: "LIVE", finalized: false });
  assert.deepEqual(trace, ["commit"]);
});

test("the worker discovers only overdue live sessions using a bounded batch", async t => {
  let query = "";
  t.mock.method(AppDataSource, "query", async (sql: string) => { query = sql; return []; });
  assert.equal(await expireOverdueAssessInterviews(4), 0);
  assert.match(query, /status='LIVE'/);
  assert.match(query, /TIMESTAMPADD\(MINUTE,duration_minutes,started_at\)<=UTC_TIMESTAMP\(3\)/);
  assert.match(query, /LIMIT 4$/);
  assert.equal(await expireOverdueAssessInterviews(0), 0);
  assert.match(query, /LIMIT 1$/);
});
