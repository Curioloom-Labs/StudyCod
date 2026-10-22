import test from "node:test";
import assert from "node:assert/strict";
import type { Response } from "express";
import { AppDataSource } from "../data-source";
import { Contest } from "../entities/Contest";
import { ContestParticipant } from "../entities/ContestParticipant";
import { ContestProblem } from "../entities/ContestProblem";
import type { AuthRequest } from "../middleware/authMiddleware";
import contestsRouter from "./contests";

async function call(method: string, path: string, body: unknown = {}, identity: object = { userId: 1, userType: "USER", userRole: "SYSTEM_ADMIN" }) {
  const layer = contestsRouter.stack.find((entry: any) => entry.route?.path === path && entry.route.methods[method]) as any;
  assert.ok(layer, `Missing ${method} ${path}`);
  let status = 200;
  let result: any;
  const res = { status(code: number) { status = code; return res; }, json(value: unknown) { result = value; return res; }, set() { return res; } };
  const req = { ...identity, params: { id: "7", participantId: "12" }, body, headers: {} } as unknown as AuthRequest;
  await layer.route.stack.at(-1).handle(req, res as unknown as Response);
  return { status, body: result };
}

test("organizer award flow uses live ICPC results, attendance, annulments and both disqualification modes", async t => {
  const contest = Object.assign(new Contest(), { id: 7, title: "Fixture", scoringMode: "ICPC", createdBy: { id: 1 },
    visibility: "PUBLIC", startsAt: new Date("2026-10-01T10:00:00Z"), endsAt: new Date("2026-10-01T12:00:00Z"), safetyAlertsEnabled: false });
  const people = [11, 12, 13, 14].map(id => Object.assign(new ContestParticipant(), {
    id, displayName: `Participant ${id}`, principalType: "USER", user: { id }, isDisqualified: false, retainParticipation: false,
    joinedAt: new Date("2026-10-01T09:00:00Z"), safetyExtensionSeconds: 0,
  }));
  const submissions = [
    { id: 1, participantId: 11, problemId: 90, verdict: "AC", score: 10, createdAt: "2026-10-01T10:01:00Z" },
    { id: 2, participantId: 12, problemId: 90, verdict: "WA", score: 90, createdAt: "2026-10-01T10:02:00Z" },
    { id: 3, participantId: 14, problemId: 90, verdict: "WA", score: 0, createdAt: "2026-10-01T10:03:00Z" },
  ];
  let annulments: object[] = [];
  let saved: any = null;
  let pending = 0;
  const revocations: unknown[][] = [];
  const query = async (sql: string, params: unknown[] = []): Promise<any> => {
    if (sql.includes("INSERT INTO contest_awards")) { saved = { sourceVersion: params[1], decisions: params[2], confirmedAt: "2026-10-22T12:00:00Z" }; return {}; }
    if (sql.includes("UPDATE certificates")) { revocations.push(params); return {}; }
    if (sql.includes("FROM contest_awards")) return saved ? [saved] : [];
    if (sql.includes("COUNT(*) AS count") && sql.includes("GROUP BY")) return [11, 12, 14].map(participantId => ({ participantId, count: 1 }));
    if (sql.includes("COUNT(*) AS count")) return [{ count: pending }];
    if (sql.includes("FROM contest_submissions")) return structuredClone(submissions);
    if (sql.includes("FROM contest_participants")) return people.map(p => ({ id: p.id, isDisqualified: p.isDisqualified, retainParticipation: p.retainParticipation }));
    if (sql.includes("FROM contest_annulments")) return structuredClone(annulments);
    if (sql.includes("FROM contest_problems")) return [{ id: 90, points: 100 }];
    if (sql.includes("FROM contests")) return [{ id: 7, endsAt: contest.endsAt }];
    return [];
  };
  t.mock.method(AppDataSource, "query", query);
  t.mock.method(AppDataSource, "transaction", (async (work: any) => work({ query })) as typeof AppDataSource.transaction);
  t.mock.method(AppDataSource, "getRepository", ((entity: unknown) => {
    if (entity === Contest) return { findOne: async () => contest };
    if (entity === ContestProblem) return { find: async () => [{ id: 90, order: 0, label: "A", points: 100, libraryTask: { id: 1 } }] };
    if (entity === ContestParticipant) return { find: async () => people, findOne: async (options: any) => people.find(p => p.id === options.where.id), save: async (p: ContestParticipant) => p };
    throw new Error("Unexpected repository");
  }) as typeof AppDataSource.getRepository);

  const preview = await call("get", "/:id/admin/awards");
  assert.equal(preview.status, 200);
  assert.equal(preview.body.canConfirm, true);
  assert.equal(preview.body.confirmed, false);
  assert.equal(preview.body.suggested.find((r: any) => r.participantId === 11).awardPlace, 1, "ICPC AC outranks a higher partial IOI score");
  assert.equal(preview.body.rows.find((r: any) => r.participantId === 13).submissionCount, 0);
  assert.equal(preview.body.suggested.find((r: any) => r.participantId === 13).awardPlace, null);

  const decisionBody = { sourceVersion: preview.body.sourceVersion, decisions: preview.body.suggested.map((r: any) => ({ participantId: r.participantId, awardPlace: r.awardPlace })) };
  assert.equal((await call("put", "/:id/admin/awards", decisionBody)).status, 200);
  assert.equal((await call("get", "/:id/admin/awards")).body.confirmed, true);
  assert.equal((await call("get", "/:id/admin/awards", {}, { userType: "STUDENT" })).status, 403);
  pending = 1;
  assert.equal((await call("put", "/:id/admin/awards", decisionBody)).status, 409);
  pending = 0;

  assert.equal((await call("patch", "/:id/admin/participants/:participantId/disqualify", { disqualified: true })).status, 400, "the organizer must choose a disqualification mode");
  assert.equal((await call("patch", "/:id/admin/participants/:participantId/disqualify", { disqualified: true, retainParticipation: true })).status, 200);
  let changed = await call("get", "/:id/admin/awards");
  assert.equal(changed.body.stale, true);
  const retained = changed.body.rows.find((r: any) => r.participantId === 12);
  assert.equal(retained.totalScore, 0);
  assert.notEqual(retained.rank, null, "retained participants remain on the standings");
  assert.equal((await call("put", "/:id/admin/awards", decisionBody)).status, 409, "old browser drafts cannot overwrite changed results");

  assert.equal((await call("patch", "/:id/admin/participants/:participantId/disqualify", { disqualified: true, retainParticipation: false })).status, 200);
  changed = await call("get", "/:id/admin/awards");
  assert.equal(changed.body.rows.find((r: any) => r.participantId === 12).rank, null);
  assert.ok(revocations.some(p => p[0] === 7 && p[1] === 12));

  annulments = [{ problemId: 90, participantId: 11, isActive: 1 }];
  const annulled = await call("get", "/:id/admin/awards");
  assert.equal(annulled.body.rows.find((r: any) => r.participantId === 11).totalScore, 0);
  contest.endsAt = new Date(Date.now() + 3600_000);
  assert.equal((await call("get", "/:id/admin/awards")).body.canConfirm, false);
});
