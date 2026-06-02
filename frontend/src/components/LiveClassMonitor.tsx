import React, { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { getLiveMonitor, type LiveSnapshot, type LiveStatus } from "../lib/api/edu";

type Props = {
  classId: number;
  taskId: number;
  pollMs?: number;
  className?: string;
};

const STATUS_META: Record<LiveStatus, { glyph: string; label: string }> = {
  stuck: { glyph: "⚠️", label: tr("Застряг", "Stuck") },
  in_progress: { glyph: "⏳", label: tr("Працює", "Working") },
  not_started: { glyph: "⚪", label: tr("Не почав", "Not started") },
  passed: { glyph: "✅", label: tr("Склав", "Passed") },
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
 * Live class monitor for a topic-task. Polls the backend snapshot every few
 * seconds so a teacher can see, in real time, who is stuck / working / passed /
 * not started during a control work. Read-only.
 */
export const LiveClassMonitor: React.FC<Props> = ({ classId, taskId, pollMs = 4000, className }) => {
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await getLiveMonitor(classId, taskId);
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
      timerRef.current = window.setInterval(tick, Math.max(2000, pollMs));
    }
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [classId, taskId, pollMs, live]);

  const totals = snap?.totals;
  const now = snap?.generatedAtMs ?? Date.now();

  return (
    <div className={`rounded-lg border border-border bg-bg-base/60 ${className ?? ""}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-[10px] font-mono text-primary">{tr("🔴 Жива панель класу", "🔴 Live class monitor")}</div>
        <button
          type="button"
          className="text-[10px] font-mono text-text-secondary hover:text-text-primary"
          onClick={() => setLive((v) => !v)}
        >
          {live ? tr("Пауза", "Pause") : tr("Відновити", "Resume")}
        </button>
      </div>

      {error && <div className="px-3 py-2 text-xs font-mono text-secondary">{error}</div>}

      {totals && (
        <div className="flex flex-wrap gap-2 px-3 py-2 border-b border-border">
          {(["stuck", "in_progress", "not_started", "passed"] as LiveStatus[]).map((st) => (
            <div key={st} className="text-xs font-mono text-text-primary rounded-md bg-bg-hover/50 px-2 py-1">
              {STATUS_META[st].glyph} {STATUS_META[st].label}: <span className="text-primary">{totals[st]}</span>
            </div>
          ))}
        </div>
      )}

      <div className="max-h-72 overflow-y-auto divide-y divide-border/60">
        {(snap?.students ?? []).map((s) => (
          <div key={s.studentId} className="flex items-center justify-between px-3 py-1.5 text-xs font-mono">
            <span className="flex items-center gap-2 text-text-primary">
              <span title={STATUS_META[s.status].label}>{STATUS_META[s.status].glyph}</span>
              <span>{s.name}</span>
            </span>
            <span className="flex items-center gap-3 text-text-secondary">
              {s.testsTotal != null && s.testsTotal > 0 && (
                <span>{s.testsPassed ?? 0}/{s.testsTotal}</span>
              )}
              {s.lastVerdict && <span>{s.lastVerdict}</span>}
              <span>{relTime(s.lastActivityMs, now)}</span>
            </span>
          </div>
        ))}
        {snap && snap.students.length === 0 && (
          <div className="px-3 py-3 text-xs font-mono text-text-secondary">{tr("Немає учнів у класі.", "No students in this class.")}</div>
        )}
        {!snap && !error && (
          <div className="px-3 py-3 text-xs font-mono text-text-secondary">{tr("Завантаження…", "Loading…")}</div>
        )}
      </div>
    </div>
  );
};

export default LiveClassMonitor;
