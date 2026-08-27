import React, { useCallback, useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import {
  listClassPracticeTasks,
  startLiveChallenge,
  getActiveLiveChallenge,
  getChallengeLeaderboard,
  endLiveChallenge,
  type ChallengeTask,
  type LiveChallenge,
  type ChallengeLeaderboardEntry,
} from "../lib/api/liveClassroom";

type Props = {
  classId: number;
  isTeacher: boolean;
};

const DURATION_OPTIONS = [60, 90, 120, 180, 300];

function fmtClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Live challenge strip for the live lesson. The teacher fires a timed mini-task;
 * students get a countdown + a "Solve" button (opens the task in a new tab so
 * they stay in the room), and everyone sees the leaderboard fill up as passes
 * land — turning the lecture into a quick game and showing the teacher who got it.
 */
export const LiveChallengePanel: React.FC<Props> = ({ classId, isTeacher }) => {
  const [challenge, setChallenge] = useState<LiveChallenge | null>(null);
  const [entries, setEntries] = useState<ChallengeLeaderboardEntry[]>([]);
  const [nowMs, setNowMs] = useState(Date.now());

  // Teacher launcher state
  const [tasks, setTasks] = useState<ChallengeTask[]>([]);
  const [taskId, setTaskId] = useState<number | "">("");
  const [durationSec, setDurationSec] = useState(90);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<number | null>(null);

  // 1s ticker for the countdown.
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Poll active challenge + leaderboard.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const board = await getChallengeLeaderboard(classId);
        if (cancelled) return;
        setChallenge(board.challenge);
        setEntries(board.entries);
      } catch {
        try {
          const ch = await getActiveLiveChallenge(classId);
          if (!cancelled) setChallenge(ch);
        } catch {
          /* ignore transient */
        }
      }
    };
    void tick();
    pollRef.current = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [classId]);

  // Teacher: load the task list for the launcher once.
  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listClassPracticeTasks(classId);
        if (!cancelled) setTasks(list);
      } catch {
        /* picker stays empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTeacher, classId]);

  const handleStart = useCallback(async () => {
    if (taskId === "") return;
    setBusy(true);
    setError(null);
    try {
      const ch = await startLiveChallenge(classId, Number(taskId), durationSec);
      setChallenge(ch);
      setEntries([]);
    } catch {
      setError(tr("Не вдалося запустити челендж.", "Failed to start challenge."));
    } finally {
      setBusy(false);
    }
  }, [classId, taskId, durationSec]);

  const handleEnd = useCallback(async () => {
    setBusy(true);
    try {
      await endLiveChallenge(classId);
      setChallenge(null);
      setEntries([]);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }, [classId]);

  // No active challenge: teacher sees a compact launcher; students see nothing.
  if (!challenge) {
    if (!isTeacher) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-base/40 px-4 py-2 text-xs font-mono">
        <span className="text-primary">🏁 {tr("Челендж", "Challenge")}</span>
        <select
          id="live-challenge-task"
          name="challengeTask"
          aria-label={tr("Задача челенджу", "Challenge task")}
          value={taskId}
          onChange={(e) => setTaskId(e.target.value === "" ? "" : Number(e.target.value))}
          className="max-w-[16rem] rounded border border-border bg-bg-code px-2 py-1 text-text-primary focus:border-primary focus:outline-none"
        >
          <option value="">{tr("Оберіть задачу…", "Pick a task…")}</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <select
          id="live-challenge-duration"
          name="challengeDuration"
          aria-label={tr("Тривалість челенджу", "Challenge duration")}
          value={durationSec}
          onChange={(e) => setDurationSec(Number(e.target.value))}
          className="rounded border border-border bg-bg-code px-2 py-1 text-text-primary focus:border-primary focus:outline-none"
        >
          {DURATION_OPTIONS.map((d) => (
            <option key={d} value={d}>{d}s</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || taskId === ""}
          onClick={() => void handleStart()}
          className="rounded-md bg-primary/20 px-3 py-1 text-primary hover:bg-primary/30 disabled:opacity-50"
        >
          {tr("Запустити", "Launch")}
        </button>
        {error && <span className="text-secondary">{error}</span>}
      </div>
    );
  }

  const remaining = Math.max(0, Math.round((challenge.endsAtMs - nowMs) / 1000));
  const expired = remaining <= 0;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-bg-base/40 px-4 py-2 text-xs font-mono">
      <span className="flex items-center gap-2">
        <span className="text-primary">🏁 {challenge.taskTitle}</span>
        <span className={expired ? "text-secondary" : "text-text-primary"}>
          ⏱ {expired ? tr("час вийшов", "time up") : fmtClock(remaining)}
        </span>
      </span>

      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-text-secondary">
        {entries.length === 0 ? (
          <span className="text-text-muted">{tr("Ще ніхто не склав…", "Nobody solved yet…")}</span>
        ) : (
          entries.slice(0, 3).map((e, i) => (
            <span key={e.studentId} className="rounded bg-bg-hover/50 px-2 py-0.5 text-text-primary">
              {MEDALS[i] ?? "•"} {e.name} <span className="text-text-muted">{e.solveSeconds}s</span>
            </span>
          ))
        )}
        {entries.length > 3 && <span className="text-text-muted">+{entries.length - 3}</span>}
        {entries.length > 0 && (
          <span className="text-accent-success">{tr(`${entries.length} склали`, `${entries.length} solved`)}</span>
        )}
      </span>

      {isTeacher ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleEnd()}
          className="rounded-md bg-secondary/15 px-3 py-1 text-secondary hover:bg-secondary/25 disabled:opacity-50"
        >
          {tr("Завершити", "End")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => window.open(`/edu/tasks/${challenge.taskId}`, "_blank", "noopener")}
          className="rounded-md bg-primary/20 px-3 py-1 text-primary hover:bg-primary/30"
        >
          {tr("Розвʼязати →", "Solve →")}
        </button>
      )}
    </div>
  );
};

export default LiveChallengePanel;
