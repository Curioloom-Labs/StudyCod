import React, { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { getClassLiveOverview, getLiveCopilot, type LiveOverview, type LiveCodeStatus, type LiveCopilotBriefing } from "../lib/api/liveClassroom";

type Props = {
  classId: number;
  pollMs?: number;
  className?: string;
  onSelectStudent?: (studentId: number, name: string) => void;
  selectedStudentId?: number | null;
  enableCopilot?: boolean;
};

const STATUS_META: Record<LiveCodeStatus, { glyph: string; label: string; dot: string }> = {
  stuck: { glyph: "⚠️", label: tr("Застряг", "Stuck"), dot: "bg-secondary" },
  in_progress: { glyph: "⏳", label: tr("Працює", "Working"), dot: "bg-primary" },
  not_started: { glyph: "⚪", label: tr("Не активний", "Idle"), dot: "bg-text-muted" },
  passed: { glyph: "✅", label: tr("Склав", "Passed"), dot: "bg-accent-success" },
};

function relTime(ms: number | null, now: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return tr(`${s} с тому`, `${s}s ago`);
  const m = Math.round(s / 60);
  if (m < 60) return tr(`${m} хв тому`, `${m}m ago`);
  return tr(`${Math.round(m / 60)} год тому`, `${Math.round(m / 60)}h ago`);
}

/**
 * Class-wide live code heatmap for the teacher's live lesson. Polls the
 * class-wide overview so a teacher can see, while talking on video, who is
 * stuck / working / passed / idle across whatever task each student is on —
 * the "code-aware" half of the live classroom.
 */
export const ClassLiveOverview: React.FC<Props> = ({ classId, pollMs = 5000, className, onSelectStudent, selectedStudentId, enableCopilot }) => {
  const [snap, setSnap] = useState<LiveOverview | null>(null);
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
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getClassLiveOverview(classId);
        if (!cancelled) {
          setSnap(s);
          setError(null);
        }
      } catch {
        if (!cancelled) setError(tr("Не вдалося оновити.", "Failed to refresh."));
      }
    };
    void tick();
    if (live) {
      timerRef.current = window.setInterval(tick, Math.max(2500, pollMs));
    }
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [classId, pollMs, live]);

  const totals = snap?.totals;
  const now = snap?.generatedAtMs ?? Date.now();

  return (
    <div className={`flex h-full flex-col rounded-lg border border-border bg-bg-base/60 ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-[11px] font-mono text-primary">{tr("🔴 Жива панель класу", "🔴 Live class panel")}</div>
        <div className="flex items-center gap-2">
          {enableCopilot && (
            <button
              type="button"
              disabled={copilotLoading}
              className="text-[10px] font-mono text-accent-warning hover:text-text-primary disabled:opacity-50"
              onClick={() => void runCopilot()}
            >
              {copilotLoading ? tr("Думаю…", "Thinking…") : tr("🧠 AI-діагноз", "🧠 AI brief")}
            </button>
          )}
          <button
            type="button"
            className="text-[10px] font-mono text-text-secondary hover:text-text-primary"
            onClick={() => setLive((v) => !v)}
          >
            {live ? tr("Пауза", "Pause") : tr("Відновити", "Resume")}
          </button>
        </div>
      </div>

      {briefing && (
        <div className="border-b border-border bg-primary/10 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="text-[11px] font-mono text-primary">
              🧠 {briefing.headline}
              <span className="ml-1 text-text-muted">{briefing.source === "ai" ? "· AI" : "· rule"}</span>
            </div>
            <button
              type="button"
              className="text-[10px] font-mono text-text-muted hover:text-text-primary"
              onClick={() => setBriefing(null)}
            >
              ✕
            </button>
          </div>
          <p className="mt-1 text-[11px] font-mono text-text-secondary">{briefing.diagnosis}</p>
          {briefing.actions.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {briefing.actions.map((a, i) => (
                <li key={i} className="text-[11px] font-mono text-text-primary">→ {a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <div role="alert" className="px-3 py-2 text-xs font-mono text-secondary">{error}</div>}

      {totals && (
        <div className="grid grid-cols-2 gap-1.5 px-3 py-2 border-b border-border">
          {(["stuck", "in_progress", "passed", "not_started"] as LiveCodeStatus[]).map((st) => (
            <div key={st} className="text-[11px] font-mono text-text-primary rounded-md bg-bg-hover/50 px-2 py-1">
              {STATUS_META[st].glyph} {STATUS_META[st].label}: <span className="text-primary">{totals[st]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-border/60">
        {(snap?.students ?? []).map((s) => (
          <button
            key={s.studentId}
            type="button"
            onClick={onSelectStudent ? () => onSelectStudent(s.studentId, s.name) : undefined}
            disabled={!onSelectStudent}
            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs font-mono ${
              onSelectStudent ? "hover:bg-bg-hover/60 cursor-pointer" : "cursor-default"
            } ${selectedStudentId === s.studentId ? "bg-bg-hover/70" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2 text-text-primary">
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[s.status].dot}`} title={STATUS_META[s.status].label} />
              <span className="truncate">{s.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 text-text-secondary">
              {s.currentTaskTitle && <span className="max-w-[7rem] truncate text-text-muted" title={s.currentTaskTitle}>{s.currentTaskTitle}</span>}
              {s.testsTotal != null && s.testsTotal > 0 && (
                <span>{s.testsPassed ?? 0}/{s.testsTotal}</span>
              )}
              <span className="whitespace-nowrap">{relTime(s.lastActivityMs, now)}</span>
            </span>
          </button>
        ))}
        {snap && snap.students.length === 0 && (
          <div className="px-3 py-3 text-xs font-mono text-text-secondary">{tr("Немає активності в класі.", "No class activity yet.")}</div>
        )}
        {!snap && !error && (
          <div className="px-3 py-3 text-xs font-mono text-text-secondary">{tr("Завантаження…", "Loading…")}</div>
        )}
      </div>
    </div>
  );
};

export default ClassLiveOverview;
