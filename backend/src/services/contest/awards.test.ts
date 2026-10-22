import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { awardSourceVersion, requireCurrentAwards, contestSubmissionCounts } from "./awards";

test("generation requires confirmation and rejects changes from rejudging or disqualification", async t => {
  let score = 100;
  let disqualified = 0;
  let saved: unknown[] = [];
  t.mock.method(AppDataSource, "query", async (sql: string) => {
    if (sql.includes("FROM contest_awards")) return saved;
    if (sql.includes("FROM contest_submissions")) return [{ id: 1, score }];
    if (sql.includes("FROM contest_participants")) return [{ id: 1, is_disqualified: disqualified }];
    return [];
  });
  await assert.rejects(requireCurrentAwards(7), /AWARDS_NOT_CONFIRMED/);
  const version = await awardSourceVersion(7);
  saved = [{ sourceVersion: version, confirmedAt: "2026-10-22T12:00:00Z", decisions: "[]" }];
  assert.equal((await requireCurrentAwards(7)).sourceVersion, version);
  score = 60;
  await assert.rejects(requireCurrentAwards(7), /AWARDS_STALE/);
  score = 100; disqualified = 1;
  await assert.rejects(requireCurrentAwards(7), /AWARDS_STALE/);
});

test("attendance counts official submissions regardless of score or verdict and never counts upsolve", async t => {
  t.mock.method(AppDataSource, "query", async (sql: string, params: unknown[]) => {
    assert.match(sql, /phase = 'CONTEST'/);
    assert.doesNotMatch(sql, /verdict|execution_status|score/);
    assert.deepEqual(params, [9]);
    return [{ participantId: "12", count: "2" }];
  });
  assert.deepEqual([...await contestSubmissionCounts(9)], [[12, 2]]);
});
