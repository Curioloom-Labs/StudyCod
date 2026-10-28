import crypto from "node:crypto";
import { AppDataSource } from "../../data-source";
import type { AwardRow } from "./awardRules";

// Hash the inputs, rather than a cached board: rejudging, annulments, account
// changes and safety extensions all require the organizer to confirm again.
export async function awardSourceVersion(contestId: number, reader: Pick<typeof AppDataSource, "query"> = AppDataSource): Promise<string> {
  const [contest, participants, submissions, problems, annulments, organizers, maxScores] = await Promise.all([
    reader.query(`SELECT id, title, scoring_mode, starts_at, ends_at, safety_alerts_enabled, safety_global_lock_started_at,
      safety_global_extension_seconds FROM contests WHERE id = ?`, [contestId]),
    reader.query(`SELECT id, display_name, user_id, student_id, principal_type, is_disqualified, retain_participation, safety_extension_seconds,
      safety_pause_started_at, safety_pause_until
      FROM contest_participants WHERE contest_id = ? ORDER BY id`, [contestId]),
    reader.query(`SELECT id, participant_id, problem_id, created_at, verdict, score, max_score, execution_status
      FROM contest_submissions WHERE contest_id = ? AND phase = 'CONTEST' ORDER BY id`, [contestId]),
    reader.query("SELECT id, points, library_task_id FROM contest_problems WHERE contest_id = ? ORDER BY id", [contestId]),
    reader.query("SELECT problem_id, participant_id, is_active FROM contest_annulments WHERE contest_id = ? ORDER BY id", [contestId]),
    reader.query("SELECT user_id FROM contest_organizers WHERE contest_id = ? ORDER BY user_id", [contestId]),
    reader.query(`SELECT cp.id, SUM(COALESCE(t.points, 1)) AS maxScore FROM contest_problems cp
      JOIN test_data t ON t.library_task_id = cp.library_task_id WHERE cp.contest_id = ? GROUP BY cp.id ORDER BY cp.id`, [contestId]),
  ]);
  return crypto.createHash("sha256").update(JSON.stringify([contest, participants, submissions, problems, annulments, organizers, maxScores])).digest("hex");
}

type ContestSourceRow = Record<string, unknown> & { contest_id?: number | string };

function projectRowsByContest(
  rows: ContestSourceRow[],
  contestIds: Set<number>,
  excludedFields: Set<string> = new Set(["contest_id"]),
): Map<number, Record<string, unknown>[]> {
  const grouped = new Map<number, Record<string, unknown>[]>();
  for (const row of rows) {
    const contestId = Number(row.contest_id);
    if (!contestIds.has(contestId)) continue;
    const projected = Object.fromEntries(Object.entries(row).filter(([key]) => !excludedFields.has(key)));
    const group = grouped.get(contestId);
    if (group) group.push(projected);
    else grouped.set(contestId, [projected]);
  }
  return grouped;
}

function parseAwardRows(value: unknown): AwardRow[] | null {
  let parsed = value;
  try {
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const valid = parsed.every((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return false;
    const award = row as Record<string, unknown>;
    return Number.isSafeInteger(award.participantId)
      && typeof award.displayName === "string"
      && (award.rank === null || (typeof award.rank === "number" && Number.isFinite(award.rank)))
      && typeof award.totalScore === "number" && Number.isFinite(award.totalScore)
      && typeof award.maxScore === "number" && Number.isFinite(award.maxScore)
      && Number.isSafeInteger(award.submissionCount) && Number(award.submissionCount) >= 0
      && typeof award.isDisqualified === "boolean"
      && typeof award.retainParticipation === "boolean"
      && (award.awardPlace === null || award.awardPlace === 1 || award.awardPlace === 2 || award.awardPlace === 3);
  });
  return valid ? parsed as AwardRow[] : null;
}

/**
 * Reads confirmed awards for multiple contests and returns only snapshots whose
 * underlying standings inputs still match. This keeps Portfolio reads bounded
 * to eight queries instead of re-reading the seven source tables per contest.
 */
export async function readCurrentAwardsByContestIds(
  contestIds: number[],
  reader: Pick<typeof AppDataSource, "query"> = AppDataSource,
): Promise<Map<number, AwardRow[]>> {
  const ids = [...new Set(contestIds.filter(id => Number.isSafeInteger(id) && id > 0))];
  const current = new Map<number, AwardRow[]>();
  if (!ids.length) return current;

  const placeholders = ids.map(() => "?").join(",");
  const params = ids;
  const [contestRows, participantRows, submissionRows, problemRows, annulmentRows, organizerRows, maxScoreRows, awardRows] = await Promise.all([
    reader.query(`SELECT contest_id, id, title, scoring_mode, starts_at, ends_at, safety_alerts_enabled, safety_global_lock_started_at,
      safety_global_extension_seconds FROM contests WHERE id IN (${placeholders})`, params),
    reader.query(`SELECT contest_id, id, display_name, user_id, student_id, principal_type, is_disqualified, retain_participation, safety_extension_seconds,
      safety_pause_started_at, safety_pause_until
      FROM contest_participants WHERE contest_id IN (${placeholders}) ORDER BY contest_id, id`, params),
    reader.query(`SELECT contest_id, id, participant_id, problem_id, created_at, verdict, score, max_score, execution_status
      FROM contest_submissions WHERE contest_id IN (${placeholders}) AND phase = 'CONTEST' ORDER BY contest_id, id`, params),
    reader.query(`SELECT contest_id, id, points, library_task_id FROM contest_problems WHERE contest_id IN (${placeholders}) ORDER BY contest_id, id`, params),
    reader.query(`SELECT contest_id, id, problem_id, participant_id, is_active
      FROM contest_annulments WHERE contest_id IN (${placeholders}) ORDER BY contest_id, id`, params),
    reader.query(`SELECT contest_id, user_id FROM contest_organizers WHERE contest_id IN (${placeholders}) ORDER BY contest_id, user_id`, params),
    reader.query(`SELECT cp.contest_id, cp.id, SUM(COALESCE(t.points, 1)) AS maxScore FROM contest_problems cp
      JOIN test_data t ON t.library_task_id = cp.library_task_id WHERE cp.contest_id IN (${placeholders})
      GROUP BY cp.contest_id, cp.id ORDER BY cp.contest_id, cp.id`, params),
    reader.query(`SELECT contest_id, source_version AS sourceVersion, decisions_json AS decisions
      FROM contest_awards WHERE contest_id IN (${placeholders})`, params),
  ]);

  const requested = new Set(ids);
  const contests = projectRowsByContest(contestRows, requested);
  const participants = projectRowsByContest(participantRows, requested);
  const submissions = projectRowsByContest(submissionRows, requested);
  const problems = projectRowsByContest(problemRows, requested);
  const annulments = projectRowsByContest(annulmentRows, requested, new Set(["contest_id", "id"]));
  const organizers = projectRowsByContest(organizerRows, requested);
  const maxScores = projectRowsByContest(maxScoreRows, requested);
  const snapshots = new Map<number, { sourceVersion: string; decisions: unknown }>();
  for (const row of awardRows as ContestSourceRow[]) {
    const contestId = Number(row.contest_id);
    if (!requested.has(contestId) || snapshots.has(contestId)) continue;
    snapshots.set(contestId, { sourceVersion: String(row.sourceVersion ?? ""), decisions: row.decisions });
  }

  for (const contestId of ids) {
    const saved = snapshots.get(contestId);
    if (!saved) continue;
    const sourceVersion = crypto.createHash("sha256").update(JSON.stringify([
      contests.get(contestId) ?? [],
      participants.get(contestId) ?? [],
      submissions.get(contestId) ?? [],
      problems.get(contestId) ?? [],
      annulments.get(contestId) ?? [],
      organizers.get(contestId) ?? [],
      maxScores.get(contestId) ?? [],
    ])).digest("hex");
    if (saved.sourceVersion !== sourceVersion) continue;
    const rows = parseAwardRows(saved.decisions);
    if (rows) current.set(contestId, rows);
  }
  return current;
}

export async function contestSubmissionCounts(contestId: number): Promise<Map<number, number>> {
  const rows: Array<{ participantId: number; count: number }> = await AppDataSource.query(`
    SELECT s.participant_id AS participantId, COUNT(*) AS count
    FROM contest_submissions s
    WHERE s.contest_id = ? AND s.phase = 'CONTEST'
    GROUP BY s.participant_id`, [contestId]);
  return new Map(rows.map(r => [Number(r.participantId), Number(r.count)]));
}

export async function readConfirmedAwards(contestId: number): Promise<{ sourceVersion: string; confirmedAt: string; rows: AwardRow[] } | null> {
  const rows = await AppDataSource.query(`SELECT source_version AS sourceVersion, confirmed_at AS confirmedAt,
    decisions_json AS decisions FROM contest_awards WHERE contest_id = ?`, [contestId]);
  if (!rows[0]) return null;
  return { sourceVersion: String(rows[0].sourceVersion), confirmedAt: new Date(rows[0].confirmedAt).toISOString(),
    rows: typeof rows[0].decisions === "string" ? JSON.parse(rows[0].decisions) : rows[0].decisions };
}

export async function requireCurrentAwards(contestId: number): Promise<NonNullable<Awaited<ReturnType<typeof readConfirmedAwards>>>> {
  const saved = await readConfirmedAwards(contestId);
  if (!saved) throw new Error("AWARDS_NOT_CONFIRMED");
  if (saved.sourceVersion !== await awardSourceVersion(contestId)) throw new Error("AWARDS_STALE");
  return saved;
}
