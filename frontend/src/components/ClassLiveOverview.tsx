import React, { useEffect, useRef, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Circle, Code2, Loader2, Pause, Play, Sparkles, X, type LucideIcon } from "lucide-react";
import { tr } from "../i18n";
import { getClassLiveOverview, getLiveCopilot, type LiveOverview, type LiveCodeStatus, type LiveCopilotBriefing } from "../lib/api/liveClassroom";
import "../pages/edu/eduVisualQuality.css";

type Props = {
  classId: number;
  pollMs?: number;
  className?: string;
  onSelectStudent?: (studentId: number, name: string) => void;
  selectedStudentId?: number | null;
  enableCopilot?: boolean;
  previewData?: LiveOverview;
};

const STATUS_META: Record<LiveCodeStatus, { label: string; icon: LucideIcon }> = {
  stuck: { label: tr("Застряг", "Stuck"), icon: AlertTriangle },
  in_progress: { label: tr("Працює", "Working"), icon: Code2 },
  not_started: { label: tr("Не активний", "Idle"), icon: Circle },
  passed: { label: tr("Склав", "Passed"), icon: CheckCircle2 },
};

function relTime(ms: number | null, now: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return tr(`${s} с тому`, `${s}s ago`);
  const m = Math.round(s / 60);
  if (m < 60) return tr(`${m} хв тому`, `${m}m ago`);
  return tr(`${Math.round(m / 60)} год тому`, `${Math.round(m / 60)}h ago`);
}

/** Live class overview for the teacher's current lesson. */
export const ClassLiveOverview: React.FC<Props> = ({ classId, pollMs = 5000, className, onSelectStudent, selectedStudentId, enableCopilot, previewData }) => {
  const [snap, setSnap] = useState<LiveOverview | null>(previewData ?? null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const timerRef = useRef<number | null>(null);
  const [briefing, setBriefing] = useState<LiveCopilotBriefing | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  const runCopilot = async () => {
    setCopilotLoading(true);
    try {
      const res = await getLiveCopilot(classId);
      setBriefing(res.briefing);
    } catch {
      setBriefing({
        headline: tr("Не вдалося отримати діагноз", "Couldn't get a diagnosis"),
        diagnosis: tr("Спробуйте ще раз за мить.", "Try again in a moment."),
        actions: [],
        source: "rule",
      });
    } finally {
      setCopilotLoading(false);
    }
  };

  useEffect(() => {
    if (previewData) {
      setSnap(previewData);
      setError(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getClassLiveOverview(classId);
        if (!cancelled) {
          setSnap(s);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(tr("Не вдалося оновити огляд класу.", "Could not refresh the class overview."));
      }
    };
    void tick();
    if (live) timerRef.current = window.setInterval(tick, Math.max(2500, pollMs));
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [classId, pollMs, live, previewData]);

  const totals = snap?.totals;
  const now = snap?.generatedAtMs ?? Date.now();

  return (
    <section className={`edu-live-overview ${className ?? ""}`} aria-label={tr("Живий огляд класу", "Live class overview")}>
      <header className="edu-live-overview__header">
        <div className="edu-live-overview__title">
          <span className="edu-live-overview__mark"><Activity className="size-4" aria-hidden="true" /></span>
          <div><h2>{tr("Огляд класу", "Class overview")}</h2><p>{tr("Активність під час уроку", "Activity during this lesson")}</p></div>
        </div>
        <div className="edu-live-overview__actions">
          <span className={`edu-live-overview__refresh ${live ? "is-live" : "is-paused"}`}><i aria-hidden="true" />{live ? tr("Наживо", "Live") : tr("На паузі", "Paused")}</span>
          {enableCopilot && <button type="button" disabled={copilotLoading} className="edu-live-overview__copilot" onClick={() => void runCopilot()}>
            {copilotLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            <span>{copilotLoading ? tr("Готую огляд", "Preparing") : tr("AI-огляд", "AI brief")}</span>
          </button>}
          <button type="button" className="edu-live-overview__pause" aria-pressed={!live} title={live ? tr("Призупинити оновлення", "Pause updates") : tr("Відновити оновлення", "Resume updates")} onClick={() => setLive((value) => !value)}>
            {live ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            <span>{live ? tr("Пауза", "Pause") : tr("Відновити", "Resume")}</span>
          </button>
        </div>
      </header>

      {briefing && <aside className="edu-live-overview__briefing">
        <div className="edu-live-overview__briefing-head">
          <span><Sparkles className="size-4" aria-hidden="true" />{tr("Короткий огляд", "Quick brief")}</span>
          <div><small>{briefing.source === "ai" ? "AI" : tr("Правила", "Rules")}</small><button type="button" aria-label={tr("Закрити огляд", "Close brief")} onClick={() => setBriefing(null)}><X className="size-4" aria-hidden="true" /></button></div>
        </div>
        <strong>{briefing.headline}</strong>
        <p>{briefing.diagnosis}</p>
        {briefing.actions.length > 0 && <ul>{briefing.actions.map((action, index) => <li key={index}><ArrowRight className="size-3.5" aria-hidden="true" />{action}</li>)}</ul>}
      </aside>}

      {error && <div role="alert" className="edu-live-overview__error"><AlertTriangle className="size-4" aria-hidden="true" />{error}</div>}

      {totals ? <section className="edu-live-overview__metrics" aria-label={tr("Стан розв’язання задач", "Problem status")}>
        <div className="edu-live-overview__section-title"><h3>{tr("Стан задач", "Problem status")}</h3><span>{tr("Увесь клас", "Whole class")}</span></div>
        <div className="edu-live-overview__metric-grid">
          {(["stuck", "in_progress", "passed", "not_started"] as LiveCodeStatus[]).map((status) => {
            const StatusIcon = STATUS_META[status].icon;
            return <div key={status} className={`edu-live-overview__metric is-${status}`}>
              <span className="edu-live-overview__metric-icon"><StatusIcon className="size-4" aria-hidden="true" /></span>
              <span className="edu-live-overview__metric-copy"><strong>{totals[status]}</strong><small>{STATUS_META[status].label}</small></span>
            </div>;
          })}
        </div>
      </section> : !error && <div className="edu-live-overview__metric-skeleton" role="status" aria-label={tr("Завантажуємо стан класу", "Loading class status")}><span /><span /><span /><span /></div>}

      <section className="edu-live-overview__students" aria-label={tr("Активність учнів", "Learner activity")}>
        <div className="edu-live-overview__section-title"><h3>{tr("Активність учнів", "Learner activity")}</h3>{snap && <span>{snap.students.length} {tr("учнів", "learners")}</span>}</div>
        {snap?.students.length ? <ul className="edu-live-overview__student-list">
          {snap.students.map((student) => {
            const StatusIcon = STATUS_META[student.status].icon;
            const initials = student.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase();
            return <li key={student.studentId}>
              <button type="button" onClick={onSelectStudent ? () => onSelectStudent(student.studentId, student.name) : undefined} disabled={!onSelectStudent} aria-current={selectedStudentId === student.studentId ? "true" : undefined}>
                <span className="edu-live-overview__student-avatar">{initials || "?"}</span>
                <span className="edu-live-overview__student-copy"><strong>{student.name}</strong><small className={`is-${student.status}`}><StatusIcon className="size-3.5" aria-hidden="true" />{STATUS_META[student.status].label}{student.currentTaskTitle && <><i aria-hidden="true">·</i><span title={student.currentTaskTitle}>{student.currentTaskTitle}</span></>}</small></span>
                <span className="edu-live-overview__student-meta">{student.testsTotal != null && student.testsTotal > 0 && <b>{student.testsPassed ?? 0}/{student.testsTotal}</b>}<small>{relTime(student.lastActivityMs, now)}</small></span>
                {onSelectStudent && <ArrowRight className="edu-live-overview__student-arrow size-4" aria-hidden="true" />}
              </button>
            </li>;
          })}
        </ul> : snap ? <div className="edu-live-overview__empty">
          <span><Activity className="size-5" aria-hidden="true" /></span>
          <strong>{tr("Поки тихо в класі", "It’s quiet in class")}</strong>
          <p>{tr("Коли учні відкриють задачу, їхній стан з’явиться тут.", "Learners’ progress will appear here when they open a problem.")}</p>
        </div> : error ? <div className="edu-live-overview__empty is-error"><span><AlertTriangle className="size-5" aria-hidden="true" /></span><strong>{tr("Не вдалося отримати активність", "Activity is unavailable")}</strong><p>{tr("Спробуйте ще раз за мить.", "Try again in a moment.")}</p></div> : <div className="edu-live-overview__loading" role="status"><span /><span /><span />{tr("Оновлюємо активність класу…", "Loading class activity…")}</div>}
      </section>
    </section>
  );
};

export default ClassLiveOverview;
