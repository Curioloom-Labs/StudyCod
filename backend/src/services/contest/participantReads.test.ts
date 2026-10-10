import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { ContestParticipant } from "../../entities/ContestParticipant";
import { readUserContestParticipant, userContestParticipantId, userOwnsContestParticipant } from "./participantReads";

test("membership is always freshly checked and scoped by both contest and User", async t => {
  const calls: unknown[][] = [];let rows = [{ id: 9 }];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => { calls.push([sql, parameters]);return rows; });
  assert.equal(await userContestParticipantId(20, 7), 9);
  rows = [];assert.equal(await userContestParticipantId(20, 7), null);
  assert.equal(calls.length, 2);assert.deepEqual(calls[0][1], [20, 7]);
  assert.match(String(calls[0][0]), /contest_id=\? AND user_id=\?/);
});
test("job ownership requires participant, contest and User together", async t => {
  const calls: unknown[][] = [];
  t.mock.method(AppDataSource, "query", async (sql: string, parameters?: unknown[]) => {
    calls.push([sql, parameters]);return parameters?.[2] === 7 ? [{ id: 9 }] : [];
  });
  assert.equal(await userOwnsContestParticipant(9, 20, 7), true);
  assert.equal(await userOwnsContestParticipant(9, 20, 8), false);
  assert.deepEqual(calls[0][1], [9, 20, 7]);assert.match(String(calls[0][0]), /id=\? AND contest_id=\? AND user_id=\?/);
});
test("invalid identifiers do not reach SQL", async t => {
  const query = t.mock.method(AppDataSource, "query", async () => { throw new Error("Unexpected SQL"); });
  assert.equal(await userContestParticipantId(NaN, 7), null);
  assert.equal(await userOwnsContestParticipant(9, 20, -1), false);
  assert.equal(await readUserContestParticipant(20, 0), null);assert.equal(query.mock.callCount(), 0);
});
test("existing participant metadata keeps disqualification and notification fields", async t => {
  const joinedAt = new Date("2026-10-09T12:00:00Z");
  t.mock.method(AppDataSource, "query", async () => [{ id: 9, principalType: "USER", displayName: "Test",
    isDisqualified: 1, notificationEmail: "fixture@example.invalid", notificationFullName: "Test", joinedAt }]);
  t.mock.method(AppDataSource, "getRepository", (() => ({
    create: (data: object) => Object.assign(new ContestParticipant(), data),
  })) as unknown as typeof AppDataSource.getRepository);
  const participant = await readUserContestParticipant(20, 7);
  assert.equal(participant?.id, 9);assert.equal(participant?.isDisqualified, true);
  assert.equal(participant?.notificationFullName, "Test");assert.equal(participant?.joinedAt, joinedAt);
});
