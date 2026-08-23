import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, History, Play, Pause, SkipBack, SkipForward, Clock3, Terminal } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { Skeleton } from "../../components/ui/Skeleton";
import { getSolveReplay, type SolveReplaySession } from "../../lib/api/learning";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";

const CountUp: React.FC<{ value: number; decimals?: number; suffix?: string; className?: string }> = ({ value, decimals = 0, suffix = "", className }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = value.toFixed(decimals) + suffix;
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals) + suffix;
      },
    });
    return () => controls.stop();
  }, [value, decimals, suffix, reduce]);
  return <span ref={ref} className={className}>{value.toFixed(decimals) + suffix}</span>;
};

export const SolveReplayPage: React.FC = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
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
    <div className="h-full flex flex-col bg-bg-base overflow-y-auto">
      <div className="px-4 md:px-8 pt-8 pb-6 max-w-5xl mx-auto w-full">
        <motion.div variants={staggerContainer} initial="initial" animate="animate">
          <motion.div variants={fadeUpItem}>
            <Button variant="ghost" onClick={() => navigate(-1)} className="mb-3 -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
          </motion.div>
          <motion.div variants={fadeUpItem} className="flex items-center gap-2 font-mono text-xs text-primary/70">
            <History className="w-3.5 h-3.5" />
            <span>// replay</span>
          </motion.div>
          <motion.h1 variants={fadeUpItem} className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
            {tr("Запис розв'язання", "Solve replay")}
          </motion.h1>
          <motion.p variants={fadeUpItem} className="mt-1.5 text-sm text-text-secondary">
            {tr("Покрокове відтворення твого процесу написання коду.", "Step-by-step playback of your coding process.")}
          </motion.p>

          {session && (
            <motion.div variants={fadeUpItem} className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Кроків", "Steps")}</div>
                <div className="mt-1 text-3xl font-mono font-semibold text-text-primary">
                  <CountUp value={session.snapshots.length} />
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Тривалість", "Duration")}</div>
                <div className="mt-1 flex items-center gap-1.5 text-3xl font-mono font-semibold text-primary">
                  <Clock3 className="w-5 h-5" />
                  <CountUp value={Math.round(session.durationMs / 1000)} suffix={tr("с", "s")} />
                </div>
              </div>
              {session.language ? (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Мова", "Language")}</div>
                  <div className="mt-1 text-3xl font-mono font-semibold text-text-primary">{session.language}</div>
                </div>
              ) : null}
              {session.finalVerdict ? (
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Вердикт", "Verdict")}</div>
                  <div className="mt-1 text-3xl font-mono font-semibold text-text-primary">{session.finalVerdict}</div>
                </div>
              ) : null}
            </motion.div>
          )}
        </motion.div>

        <div className="mt-6 h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />
      </div>

      <div className="px-4 md:px-8 pb-12 max-w-5xl mx-auto w-full space-y-6">
        {body}
      </div>
    </div>
  );

  if (!Number.isFinite(id)) return shell(<div className="rounded-xl border border-dashed border-border bg-bg-surface px-4 py-10 text-center text-sm text-text-secondary">{tr("Невірний запис.", "Invalid replay.")}</div>);
  if (error) return shell(<div className="rounded-xl border border-accent-error/40 bg-bg-surface px-4 py-6 text-sm text-accent-error">{error}</div>);
  if (!session) return shell(
    <div className="space-y-6">
      <Skeleton className="h-[120px] w-full rounded-xl" />
      <Skeleton className="h-[320px] w-full rounded-xl" />
    </div>
  );

  const total = session.snapshots.length;
  const snap = total ? session.snapshots[Math.min(idx, total - 1)] : null;
  const progressSec = snap ? Math.round(snap.tMs / 1000) : 0;
  const pct = total > 1 ? Math.round((idx / (total - 1)) * 100) : 0;

  return shell(
    <>
      {/* Terminal-style player frame */}
      <div className="rounded-xl border border-border bg-bg-code overflow-hidden shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-bg-surface/60">
          <span className="h-2.5 w-2.5 rounded-full bg-text-muted/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-text-muted/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-text-muted/40" />
          <div className="ml-2 flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
            <Terminal className="w-3.5 h-3.5" />
            {tr("плеєр відтворення", "replay player")}
          </div>
          <span className="ml-auto text-[11px] font-mono text-text-secondary whitespace-nowrap">
            {tr("Крок", "Step")} {total ? idx + 1 : 0}/{total} · {progressSec}{tr("с", "s")}
          </span>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-2 flex-wrap">
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
            <span className="ml-auto text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted whitespace-nowrap">
              {pct}%
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
          <div className="mt-2 h-1.5 rounded-full bg-bg-hover overflow-hidden">
            <motion.div
              className="h-full rounded-full origin-left bg-primary"
              animate={{ scaleX: pct / 100 }}
              initial={false}
              transition={reduce ? { duration: 0.16, ease: "linear" } : { duration: 0.4, ease: easeOutQuint }}
              style={{ width: "100%", transformOrigin: "left" }}
            />
          </div>
        </div>
      </div>

      {/* Code at this snapshot — terminal frame */}
      <div className="rounded-xl border border-border bg-bg-code overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-bg-surface/60">
          <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">
            {tr("Код на цьому кроці", "Code at this step")}
          </div>
          <div className="text-[11px] font-mono text-text-secondary">{progressSec}{tr("с", "s")}</div>
        </div>
        <pre className="text-sm font-mono leading-relaxed overflow-auto max-h-[60vh] bg-bg-code p-5 whitespace-pre-wrap break-words text-text-primary">
          {snap?.code ?? tr("(порожньо)", "(empty)")}
        </pre>
      </div>
    </>
  );
};

export default SolveReplayPage;
