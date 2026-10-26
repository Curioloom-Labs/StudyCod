import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Clock3, Flag, Play, Trophy } from "lucide-react";
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

function openChallengeTask(taskId: number) {
  const url = new URL(`/edu/tasks/${taskId}`, window.location.origin);
  url.searchParams.set("returnTo", `${window.location.pathname}${window.location.search}`);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

const RANKS = ["01", "02", "03"];

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
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState(false);
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

  const loadTasks = useCallback(async (canUpdate: () => boolean = () => true) => {
    if (!isTeacher) return;
    setTasksLoading(true);
    try {
      const list = await listClassPracticeTasks(classId);
      if (!canUpdate()) return;
      setTasks(list);
      setTaskId((current) => current === "" || list.some((task) => task.id === current) ? current : "");
      setTasksError(false);
    } catch {
      if (canUpdate()) setTasksError(true);
    } finally {
      if (canUpdate()) setTasksLoading(false);
    }
  }, [isTeacher, classId]);

  // Teacher: load the task list for the launcher once.
  useEffect(() => {
    if (!isTeacher) return;
    let cancelled = false;
    void loadTasks(() => !cancelled);
    return () => { cancelled = true; };
  }, [isTeacher, loadTasks]);

  const handleStart = useCallback(async () => {
    if (taskId === "") return;
    setBusy(true);
    setError(null);
    try {
      const ch = await startLiveChallenge(classId, Number(taskId), durationSec);
      setChallenge(ch);
      setEntries([]);
      setError(null);
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
      setError(tr("Не вдалося завершити практику. Спробуйте ще раз.", "Could not end the challenge. Please try again."));
    } finally {
      setBusy(false);
    }
  }, [classId]);

  // No active challenge: teacher sees the launcher; students see no empty panel.
  if (!challenge) {
    if (!isTeacher) return null;
    return (
      <section className="edu-live-challenge edu-live-challenge--setup" aria-label={tr("Швидка практика", "Quick practice")}>
        <div className="edu-live-challenge__identity"><span><Flag className="size-4" /></span><div><strong>{tr("Швидка практика", "Quick practice")}</strong><small>{tr("Коротка задача для всього класу", "A short task for the class")}</small></div></div>
        <label><span>{tr("Задача", "Problem")}</span><select id="live-challenge-task" name="challengeTask" aria-label={tr("Задача челенджу", "Challenge task")} value={taskId} onChange={(e) => setTaskId(e.target.value === "" ? "" : Number(e.target.value))}>
          <option value="">{tasksLoading ? tr("Завантажуємо задачі…", "Loading problems…") : tasksError ? tr("Не вдалося завантажити задачі", "Could not load problems") : tasks.length ? tr("Оберіть задачу…", "Choose a problem…") : tr("Задачі поки недоступні", "No problems available")}</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </select></label>
        <label className="edu-live-challenge__duration"><span>{tr("Час", "Time")}</span><select id="live-challenge-duration" name="challengeDuration" aria-label={tr("Тривалість челенджу", "Challenge duration")} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))}>
          {DURATION_OPTIONS.map((duration) => <option key={duration} value={duration}>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, "0")}</option>)}
        </select></label>
        <button type="button" disabled={busy || taskId === ""} onClick={() => void handleStart()} className="edu-live-challenge__launch"><Play className="size-4" />{busy ? tr("Запускаємо…", "Starting…") : tr("Запустити", "Start")}</button>
        {tasksError && <span role="status" className="edu-live-challenge__error">{tr("Не вдалося завантажити задачі класу.", "Could not load class problems.")} <button type="button" onClick={() => void loadTasks()}>{tasksLoading ? tr("Завантажуємо…", "Loading…") : tr("Повторити", "Retry")}</button></span>}
        {error && <span role="alert" className="edu-live-challenge__error">{error}</span>}
      </section>
    );
  }

  const remaining = Math.max(0, Math.round((challenge.endsAtMs - nowMs) / 1000));
  const expired = remaining <= 0;

  return (
    <section className="edu-live-challenge edu-live-challenge--active" aria-live="polite" aria-label={tr("Активна швидка практика", "Active quick practice")}>
      <div className="edu-live-challenge__identity"><span><Trophy className="size-4" /></span><div><small>{tr("Завдання для класу", "Class challenge")}</small><strong title={challenge.taskTitle}>{challenge.taskTitle}</strong></div></div>
      <div className={`edu-live-challenge__timer ${expired ? "is-expired" : ""}`}><Clock3 className="size-4" /><span>{expired ? tr("Час вийшов", "Time is up") : fmtClock(remaining)}</span></div>
      <div className="edu-live-challenge__results">
        <span className="edu-live-challenge__results-label">{entries.length ? tr("Вже розв’язали", "Solved so far") : tr("Перші результати з’являться тут", "Results will appear here")}</span>
        {entries.length > 0 && <ol className="edu-live-challenge__leaders">{entries.slice(0, 3).map((entry, index) => <li key={entry.studentId}><span className="edu-live-challenge__rank">{RANKS[index] ?? String(index + 1).padStart(2, "0")}</span><span className="edu-live-challenge__leader-name">{entry.name}</span><small>{entry.solveSeconds}s</small></li>)}{entries.length > 3 && <li className="edu-live-challenge__more">+{entries.length - 3}</li>}</ol>}
      </div>
      {isTeacher ? <button type="button" disabled={busy} onClick={() => void handleEnd()} className="edu-live-challenge__end">{busy ? tr("Завершуємо…", "Ending…") : tr("Завершити", "End")}</button> : <button type="button" disabled={expired} onClick={() => openChallengeTask(challenge.taskId)} className="edu-live-challenge__solve">{expired ? tr("Час вийшов", "Time is up") : tr("Розв’язати", "Solve")}<ArrowRight className="size-4" /></button>}
      {error && <span role="alert" className="edu-live-challenge__error">{error}</span>}
    </section>
  );
};

export default LiveChallengePanel;
