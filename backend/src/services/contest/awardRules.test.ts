import test from "node:test";
import assert from "node:assert/strict";
import { applyAwardDecisions, eligibleForCertificate, proposeAwards, type AwardRow } from "./awardRules";

const row = (id: number, overrides: Partial<AwardRow> = {}): AwardRow => ({ participantId: id, displayName: `Participant ${id}`,
  rank: id, totalScore: 100, maxScore: 300, submissionCount: 1, isDisqualified: false, retainParticipation: false, awardPlace: null, ...overrides });

test("automatic proposal follows authoritative ranking and excludes absence and both disqualification modes", () => {
  const rows = [row(1, { submissionCount: 0 }), row(2, { isDisqualified: true }), row(3, { isDisqualified: true, retainParticipation: true }), row(4), row(5), row(6), row(7)];
  assert.deepEqual(proposeAwards(rows).map(r => r.awardPlace), [null, null, null, 1, 2, 3, null]);
  assert.ok(rows.every(r => r.awardPlace === null), "proposal does not change saved decisions");
});

test("retained disqualification only permits a participation certificate; no submissions means no certificate", () => {
  assert.equal(eligibleForCertificate(row(1, { isDisqualified: true })), false);
  assert.equal(eligibleForCertificate(row(1, { isDisqualified: true, retainParticipation: true })), true);
  assert.equal(eligibleForCertificate(row(1, { submissionCount: 0, isDisqualified: true, retainParticipation: true })), false);
  assert.equal(eligibleForCertificate(row(1, { totalScore: 0 })), true, "a failed submission still establishes participation");
});

test("manual allocation supports shared places and rejects missing, duplicate, foreign and ineligible participants", () => {
  const roster = [row(1), row(2), row(3, { submissionCount: 0 }), row(4, { isDisqualified: true, retainParticipation: true })];
  const valid = roster.map(r => ({ participantId: r.participantId, awardPlace: r.participantId <= 2 ? 1 as const : null }));
  assert.deepEqual(applyAwardDecisions(roster, valid).map(r => r.awardPlace), [1, 1, null, null]);
  assert.throws(() => applyAwardDecisions(roster, valid.slice(1)), /INVALID_AWARD_PARTICIPANTS/);
  assert.throws(() => applyAwardDecisions(roster, [valid[0], valid[0], valid[2], valid[3]]), /INVALID_AWARD_PARTICIPANTS/);
  assert.throws(() => applyAwardDecisions(roster, [...valid.slice(0, 3), { participantId: 999, awardPlace: null }]), /INVALID_AWARD_PARTICIPANTS/);
  assert.throws(() => applyAwardDecisions(roster, valid.map(d => ({ ...d, awardPlace: 1 }))), /INELIGIBLE_AWARD_PARTICIPANT/);
  assert.throws(() => applyAwardDecisions([roster[3]], [{ participantId: 4, awardPlace: 3 }]), /INELIGIBLE_AWARD_PARTICIPANT/);
});
