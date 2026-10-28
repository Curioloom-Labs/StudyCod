import test from "node:test";
import assert from "node:assert/strict";
import { AppDataSource } from "../../data-source";
import { awardSourceVersion, readCurrentAwardsByContestIds, requireCurrentAwards, contestSubmissionCounts } from "./awards";

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

test("batched current awards omit stale, missing, and malformed snapshots", async () => {
  const sourceRows = new Map<number, Record<string, Record<string, unknown>[]>>();
  const snapshots: Array<{ contest_id: number; sourceVersion: string; decisions: unknown }> = [];
  const batchQueries: string[] = [];
  for (const contestId of [5, 6, 7, 8]) {
    sourceRows.set(contestId, {
      contests: [{ id: contestId, title: `Contest ${contestId}`, scoring_mode: "ICPC", starts_at: "2026-10-01 10:00:00", ends_at: "2026-10-01 11:00:00", safety_alerts_enabled: 0, safety_global_lock_started_at: null, safety_global_extension_seconds: 0 }],
      participants: [{ id: contestId * 10, display_name: "Ada", user_id: 22, student_id: null, principal_type: "USER", is_disqualified: 0, retain_participation: 0, safety_extension_seconds: 0, safety_pause_started_at: null, safety_pause_until: null }],
      submissions: [{ id: contestId * 100, participant_id: contestId * 10, problem_id: contestId * 1000, created_at: "2026-10-01 10:30:00", verdict: "AC", score: 100, max_score: 100, execution_status: "completed" }],
      problems: [{ id: contestId * 1000, points: 100, library_task_id: contestId * 10000 }],
      annulments: [{ problem_id: contestId * 1000, participant_id: 0, is_active: 0 }],
      organizers: [{ user_id: 23 }],
      maxScores: [{ id: contestId * 1000, maxScore: 100 }],
    });
  }

  const reader = {
    query: async (sql: string, values: unknown[] = []): Promise<any> => {
      const isBatch = sql.includes(" IN (");
      if (isBatch) batchQueries.push(sql);
      const ids = values.map(Number);
      if (sql.includes("FROM contest_awards")) return snapshots.filter(row => ids.includes(row.contest_id));
      const key = sql.includes("SUM(COALESCE(t.points, 1))") ? "maxScores"
        : sql.includes("FROM contest_participants") ? "participants"
          : sql.includes("FROM contest_submissions") ? "submissions"
            : sql.includes("FROM contest_annulments") ? "annulments"
              : sql.includes("FROM contest_organizers") ? "organizers"
                : sql.includes("FROM contest_problems") ? "problems" : "contests";
      return ids.flatMap(contestId => (sourceRows.get(contestId)?.[key] ?? []).map(row => {
        if (!isBatch) return row;
        if (key === "annulments") return { contest_id: contestId, id: 1, ...row };
        return { contest_id: contestId, ...row };
      }));
    },
  };

  const currentDecision = (contestId: number) => ({
    participantId: contestId * 10,
    displayName: "Ada",
    rank: 1,
    totalScore: 100,
    maxScore: 100,
    submissionCount: 1,
    isDisqualified: false,
    retainParticipation: false,
    awardPlace: 1 as const,
  });
  snapshots.push({ contest_id: 5, sourceVersion: await awardSourceVersion(5, reader), decisions: [currentDecision(5)] });
  snapshots.push({ contest_id: 6, sourceVersion: "stale-source-version", decisions: [currentDecision(6)] });
  snapshots.push({ contest_id: 8, sourceVersion: await awardSourceVersion(8, reader), decisions: "not-json" });

  const result = await readCurrentAwardsByContestIds([5, 6, 7, 8, 5, -1, 1.5], reader);
  assert.deepEqual([...result.keys()], [5]);
  assert.equal(result.get(5)?.[0].awardPlace, 1);
  assert.equal(batchQueries.length, 8);
  assert.ok(batchQueries.every(sql => sql.includes(" IN (?,?,?,?)")));
});
