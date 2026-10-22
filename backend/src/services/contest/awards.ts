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
