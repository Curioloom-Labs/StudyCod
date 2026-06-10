import React, { useEffect, useRef, useState } from "react";
import { tr } from "../i18n";
import { getStudentLiveCode, type LiveCodeSnapshot } from "../lib/api/liveClassroom";

type Props = {
  classId: number;
  studentId: number;
  studentName: string;
  onBack: () => void;
  pollMs?: number;
};

function relTime(ms: number | null, now: number): string {
  if (!ms) return "—";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return tr(`${s} с тому`, `${s}s ago`);
  const m = Math.round(s / 60);
  return tr(`${m} хв тому`, `${m}m ago`);
}

/**
 * Read-only live stream of one student's editor, behind clicking a student in
 * the live class panel. Polls the ephemeral snapshot the student publishes
 * while editing. Shows an explicit "no live code" state when the student isn't
 * currently typing (or a lesson isn't live).
 */
export const StudentCodeStream: React.FC<Props> = ({ classId, studentId, studentName, onBack, pollMs = 3000 }) => {
  const [snap, setSnap] = useState<LiveCodeSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setSnap(null);
    const tick = async () => {
      try {
        const s = await getStudentLiveCode(classId, studentId);
        if (!cancelled) {
          setSnap(s);
          setError(null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setError(tr("Не вдалося отримати код.", "Failed to fetch code."));
          setLoaded(true);
        }
      }
    };
    void tick();
    timerRef.current = window.setInterval(tick, Math.max(1500, pollMs));
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [classId, studentId, pollMs]);

  const now = Date.now();

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-bg-base/60">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="text-[11px] font-mono text-text-secondary hover:text-text-primary"
          >
            ← {tr("Назад", "Back")}
          </button>
          <span className="truncate text-[11px] font-mono text-primary" title={studentName}>{studentName}</span>
        </div>
        {snap && <span className="shrink-0 text-[10px] font-mono text-text-muted">{relTime(snap.updatedAtMs, now)}</span>}
      </div>

      {snap?.taskTitle && (
        <div className="border-b border-border px-3 py-1 text-[10px] font-mono text-text-secondary truncate" title={snap.taskTitle}>
          {snap.taskTitle}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-bg-code">
        {snap?.code ? (
          <pre className="whitespace-pre p-3 text-[11px] leading-relaxed font-mono text-text-primary">{snap.code}</pre>
        ) : (
          <div className="px-3 py-4 text-xs font-mono text-text-secondary">
            {error
              ? error
              : !loaded
              ? tr("Завантаження…", "Loading…")
              : tr("Учень зараз не друкує код.", "The student isn't typing right now.")}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentCodeStream;
