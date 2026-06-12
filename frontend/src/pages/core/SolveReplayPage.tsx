import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, History, Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { getSolveReplay, type SolveReplaySession } from "../../lib/api/learning";

export const SolveReplayPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const [session, setSession] = useState<SolveReplaySession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getSolveReplay(id)
      .then((s) => { setSession(s); setIdx(0); })
      .catch(() => setError(tr("Не вдалося завантажити запис.", "Couldn't load the replay.")));
  }, [id]);

  useEffect(() => {
    if (!playing || !session) return;
    timerRef.current = window.setInterval(() => {
      setIdx((i) => {
        if (i >= session.snapshots.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 700);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [playing, session]);

  const shell = (body: React.ReactNode) => (
    <div className="w-full bg-bg-base px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        <div>
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3">
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-mono font-medium uppercase tracking-[0.04em] text-primary">
            <History className="w-3.5 h-3.5" />
            {tr("Реплей", "Replay")}
          </div>
          <h1 className="mt-3 text-2xl md:text-3xl font-mono font-semibold text-text-primary">{tr("Запис розв'язання", "Solve replay")}</h1>
          {session && (
            <p className="mt-1 text-sm font-mono text-text-secondary">
              {session.language ?? ""} · {tr("тривалість", "duration")} {Math.round(session.durationMs / 1000)}{tr("с", "s")}
              {session.finalVerdict ? ` · ${session.finalVerdict}` : ""}
            </p>
          )}
        </div>
        {body}
      </div>
    </div>
  );

  if (!Number.isFinite(id)) return shell(<div className="text-sm text-text-secondary">{tr("Невірний запис.", "Invalid replay.")}</div>);
  if (error) return shell(<div className="text-sm text-accent-error">{error}</div>);
  if (!session) return shell(
    <div className="space-y-6">
      <Skeleton className="h-[120px] w-full rounded-lg" />
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  );

  const total = session.snapshots.length;
  const snap = total ? session.snapshots[Math.min(idx, total - 1)] : null;
  const progressSec = snap ? Math.round(snap.tMs / 1000) : 0;
  const pct = total > 1 ? Math.round((idx / (total - 1)) * 100) : 0;

  return shell(
    <>
      {/* Controls */}
      <div className="border border-border bg-bg-surface p-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="primary" onClick={() => setPlaying((p) => !p)} disabled={total <= 1}>
            {playing ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
            {playing ? tr("Пауза", "Pause") : tr("Грати", "Play")}
          </Button>
          <Button variant="ghost" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0} title={tr("Назад", "Prev")}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button variant="ghost" onClick={() => setIdx((i) => Math.min(total - 1, i + 1))} disabled={idx >= total - 1} title={tr("Вперед", "Next")}>
            <SkipForward className="w-4 h-4" />
          </Button>
          <span className="ml-auto text-xs font-mono text-text-secondary whitespace-nowrap">
            {tr("Крок", "Step")} {total ? idx + 1 : 0}/{total} · {progressSec}{tr("с", "s")}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={Math.min(idx, Math.max(0, total - 1))}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
          className="w-full mt-4 accent-primary"
        />
        <div className="mt-2 h-1 bg-bg-code rounded-full overflow-hidden">
          <span className="block h-full bg-primary transition-fast" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Code at this snapshot */}
      <div className="border border-border bg-bg-surface">
        <div className="px-5 py-3 border-b border-border text-xs font-mono font-medium uppercase tracking-[0.04em] text-text-secondary">
          {tr("Код на цьому кроці", "Code at this step")}
        </div>
        <pre className="text-sm font-mono leading-relaxed overflow-auto max-h-[60vh] bg-bg-base p-5 whitespace-pre-wrap break-words text-text-primary">
          {snap?.code ?? tr("(порожньо)", "(empty)")}
        </pre>
      </div>
    </>
  );
};

export default SolveReplayPage;
