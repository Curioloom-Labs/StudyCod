/**
 * ICPC-style live scoreboard ranking.
 *
 * Pure + deterministic: given the raw submissions for a contest, it computes
 * each participant's solved count and penalty, then ranks them. The HTTP route
 * gathers the submissions; the React board polls and animates the result.
 *
 * ICPC rules implemented:
 *  - A problem is "solved" at the time of its FIRST accepted (AC) submission.
 *  - Penalty for a solved problem = minutes(start -> first AC)
 *                                   + (wrong tries before AC) * penaltyPerWrong.
 *  - Wrong tries AFTER the first AC do not count.
 *  - Rank by solved desc, then total penalty asc, then earliest last-AC.
 */
export interface ScoreboardSubmission {
  participantId: number;
  problemId: number;
  verdict: string | null;
  createdAtMs: number;
}

export interface ProblemCell {
  solved: boolean;
  tries: number;        // submissions counted up to & including the AC (or all if unsolved)
  penaltyMinutes: number;
  firstAcMs: number | null;
}

export interface ScoreboardRow {
  rank: number;
  participantId: number;
  solved: number;
  penalty: number;
  lastAcMs: number | null;
  problems: Record<number, ProblemCell>;
}

export interface ScoreboardResult {
  rows: ScoreboardRow[];
  generatedAtMs: number;
}

function isAc(verdict: string | null): boolean {
  return String(verdict ?? "").trim().toUpperCase() === "AC";
}

export function computeScoreboard(
  submissions: ScoreboardSubmission[],
  options: { startMs: number; penaltyPerWrong?: number; nowMs?: number }
): ScoreboardResult {
  const startMs = options.startMs;
  const penaltyPerWrong = Number.isFinite(options.penaltyPerWrong as number) ? Number(options.penaltyPerWrong) : 20;
  const nowMs = options.nowMs ?? Date.now();

  // Group by participant -> problem, in chronological order.
  const sorted = [...submissions].sort((a, b) => a.createdAtMs - b.createdAtMs);
  const byParticipant = new Map<number, Map<number, ScoreboardSubmission[]>>();
  for (const s of sorted) {
    if (!byParticipant.has(s.participantId)) byParticipant.set(s.participantId, new Map());
    const byProblem = byParticipant.get(s.participantId)!;
    if (!byProblem.has(s.problemId)) byProblem.set(s.problemId, []);
    byProblem.get(s.problemId)!.push(s);
  }

  const rows: ScoreboardRow[] = [];
  for (const [participantId, byProblem] of byParticipant.entries()) {
    let solved = 0;
    let penalty = 0;
    let lastAcMs: number | null = null;
    const problems: Record<number, ProblemCell> = {};

    for (const [problemId, subs] of byProblem.entries()) {
      let wrongBeforeAc = 0;
      let firstAcMs: number | null = null;
      let triesCounted = 0;
      for (const sub of subs) {
        triesCounted += 1;
        if (isAc(sub.verdict)) {
          firstAcMs = sub.createdAtMs;
          break;
        }
        wrongBeforeAc += 1;
      }
      const cell: ProblemCell = {
        solved: firstAcMs !== null,
        tries: firstAcMs !== null ? triesCounted : subs.length,
        penaltyMinutes: 0,
        firstAcMs,
      };
      if (firstAcMs !== null) {
        const timeMin = Math.max(0, Math.floor((firstAcMs - startMs) / 60_000));
        cell.penaltyMinutes = timeMin + wrongBeforeAc * penaltyPerWrong;
        solved += 1;
        penalty += cell.penaltyMinutes;
        if (lastAcMs === null || firstAcMs > lastAcMs) lastAcMs = firstAcMs;
      }
      problems[problemId] = cell;
    }

    rows.push({ rank: 0, participantId, solved, penalty, lastAcMs, problems });
  }

  rows.sort((a, b) => {
    if (a.solved !== b.solved) return b.solved - a.solved;
    if (a.penalty !== b.penalty) return a.penalty - b.penalty;
    return (a.lastAcMs ?? Infinity) - (b.lastAcMs ?? Infinity);
  });
  rows.forEach((r, i) => { r.rank = i + 1; });

  return { rows, generatedAtMs: nowMs };
}
