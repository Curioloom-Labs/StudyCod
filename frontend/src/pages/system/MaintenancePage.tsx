import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Wrench } from "lucide-react";
import { fadeUpItem, easeOutQuint } from "../../lib/motion";

export type MaintenancePayload = {
  title: string;
  message: string;
  until: string | null;
};

function formatMs(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor(total % 86400 / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return { d, h, m, s };
}

function useCountdown(untilIso: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!untilIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [untilIso]);
  return useMemo(() => {
    if (!untilIso) return null;
    const until = new Date(untilIso);
    if (!Number.isFinite(until.getTime())) return null;
    const diff = until.getTime() - now;
    return { until, diffMs: diff, parts: formatMs(diff) };
  }, [untilIso, now]);
}

type ReflexState =
  | { phase: "idle" }
  | { phase: "waiting"; startedAt: number; readyAt: number }
  | { phase: "ready"; readyAt: number }
  | { phase: "result"; reactionMs: number; bestMs: number | null };

function getBestMs(): number | null {
  try {
    const v = localStorage.getItem("studycod.reflex.bestMs");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function setBestMs(ms: number) {
  try { localStorage.setItem("studycod.reflex.bestMs", String(ms)); } catch {}
}

const ReflexGame: React.FC = () => {
  const [state, setState] = useState<ReflexState>({ phase: "idle" });
  const timerRef = useRef<number | null>(null);
  useEffect(() => { return () => { if (timerRef.current) window.clearTimeout(timerRef.current); }; }, []);
  const start = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const startedAt = Date.now();
    const delay = 800 + Math.floor(Math.random() * 2200);
    const readyAt = startedAt + delay;
    setState({ phase: "waiting", startedAt, readyAt });
    timerRef.current = window.setTimeout(() => {
      setState({ phase: "ready", readyAt: Date.now() });
      timerRef.current = null;
    }, delay);
  };
  const click = () => {
    if (state.phase === "idle") return;
    if (state.phase === "waiting") { start(); return; }
    if (state.phase === "ready") {
      const reactionMs = Date.now() - state.readyAt;
      const prevBest = getBestMs();
      const bestMs = prevBest == null ? reactionMs : Math.min(prevBest, reactionMs);
      if (bestMs !== prevBest) setBestMs(bestMs);
      setState({ phase: "result", reactionMs, bestMs });
    }
    if (state.phase === "result") { start(); }
  };
  const ui = (() => {
    if (state.phase === "idle") return { label: "Start", hint: "Натисніть Start, потім клікніть коли блок стане зеленим" };
    if (state.phase === "waiting") return { label: "Wait…", hint: "Не клікайте завчасно — гра перезапуститься" };
    if (state.phase === "ready") return { label: "CLICK!", hint: "Зараз!" };
    return { label: `Your time: ${state.reactionMs} ms`, hint: state.bestMs != null ? `Best: ${state.bestMs} ms` : "" };
  })();
  const boxClass = state.phase === "ready"
    ? "border-accent-success bg-accent-success/10 text-accent-success"
    : state.phase === "waiting"
      ? "border-border bg-bg-code text-text-secondary"
      : "border-border bg-bg-code text-text-primary";
  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-mono text-text-primary">Mini-game: Reflex</div>
          <div className="text-xs text-text-secondary mt-0.5">Коротка гра на реакцію, щоб час пролетів швидше.</div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => start()}>
          {state.phase === "idle" ? "Start" : "Restart"}
        </Button>
      </div>
      <button
        type="button"
        onClick={click}
        className={`w-full border rounded-xl px-4 py-6 text-center font-mono transition-fast ${boxClass}`}
      >
        <div className="text-lg font-bold">{ui.label}</div>
        <div className="mt-2 text-xs opacity-80">{ui.hint}</div>
      </button>
    </div>
  );
};

export const MaintenancePage: React.FC<{
  state: MaintenancePayload;
  onRetry?: () => void;
  onAdminLogin?: () => void;
}> = ({ state, onRetry, onAdminLogin }) => {
  const prefersReducedMotion = useReducedMotion();
  const countdown = useCountdown(state.until);

  return (
    <div className="min-h-[100dvh] bg-bg-base text-text-primary flex items-center justify-center p-3 sm:p-6">
      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: easeOutQuint }}
        className="w-full max-w-2xl"
      >
        {/* Terminal card */}
        <div className="rounded-xl border border-border bg-bg-surface overflow-hidden shadow-[0_24px_64px_-16px_rgba(0,0,0,0.6)]">
          {/* Card header */}
          <div className="flex items-center justify-between border-b border-border bg-bg-code/60 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
              <span className="h-2.5 w-2.5 rounded-full bg-border" />
            </div>
            <div className="flex items-center gap-2">
              {/* Pulsing status dot */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              <span className="text-[10px] font-mono text-text-muted tracking-[0.08em]">503 Service Unavailable</span>
            </div>
            <div className="flex items-center gap-2">
              {onAdminLogin && (
                <button
                  type="button"
                  onClick={onAdminLogin}
                  className="inline-flex h-6 items-center justify-center rounded border border-border/80 bg-bg-hover/50 px-2 text-[10px] font-mono text-text-secondary transition-fast hover:border-primary/50 hover:text-text-primary"
                >
                  Admin
                </button>
              )}
            </div>
          </div>

          <div className="p-6 md:p-8">
            {/* Hero */}
            <motion.div
              variants={prefersReducedMotion ? undefined : fadeUpItem}
              initial={prefersReducedMotion ? undefined : "initial"}
              animate={prefersReducedMotion ? undefined : "animate"}
              className="flex items-start gap-4 mb-6"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
                <Wrench className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="font-mono text-xs text-primary/70">// maintenance</span>
                <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">{state.title}</h1>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">{state.message}</p>
              </div>
            </motion.div>

            <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent mb-6" />

            {/* Countdown */}
            {countdown && state.until && (
              <motion.div
                variants={prefersReducedMotion ? undefined : fadeUpItem}
                initial={prefersReducedMotion ? undefined : "initial"}
                animate={prefersReducedMotion ? undefined : "animate"}
                className="mb-6 rounded-xl border border-border bg-bg-code/60 p-4"
              >
                <div className="text-xs font-mono uppercase tracking-[0.08em] text-text-muted mb-3">До завершення</div>
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { value: countdown.parts.d, label: "days" },
                    { value: String(countdown.parts.h).padStart(2, "0"), label: "hours" },
                    { value: String(countdown.parts.m).padStart(2, "0"), label: "min" },
                    { value: String(countdown.parts.s).padStart(2, "0"), label: "sec" },
                  ].map(({ value, label }) => (
                    <div key={label} className="px-3 py-2 rounded-lg border border-border bg-bg-surface min-w-[56px] text-center">
                      <div className="text-lg font-mono font-bold text-text-primary">{value}</div>
                      <div className="text-[10px] font-mono text-text-secondary">{label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs font-mono text-text-muted">
                  Орієнтовно до: <span className="text-text-primary">{countdown.until.toLocaleString()}</span>
                </div>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onRetry || (() => window.location.reload())}>
                Спробувати знову
              </Button>
            </div>

            <ReflexGame />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default MaintenancePage;
