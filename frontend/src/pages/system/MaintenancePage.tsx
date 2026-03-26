import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
export type MaintenancePayload = {
  title: string;
  message: string;
  until: string | null;
};
function formatMs(ms: number): {
  d: number;
  h: number;
  m: number;
  s: number;
} {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor(total % 86400 / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return {
    d,
    h,
    m,
    s
  };
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
    return {
      until,
      diffMs: diff,
      parts: formatMs(diff)
    };
  }, [untilIso, now]);
}
type ReflexState = {
  phase: "idle";
} | {
  phase: "waiting";
  startedAt: number;
  readyAt: number;
} | {
  phase: "ready";
  readyAt: number;
} | {
  phase: "result";
  reactionMs: number;
  bestMs: number | null;
};
function getBestMs(): number | null {
  try {
    const v = localStorage.getItem("studycod.reflex.bestMs");
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}
function setBestMs(ms: number) {
  try {
    localStorage.setItem("studycod.reflex.bestMs", String(ms));
  } catch {}
}
const ReflexGame: React.FC = () => {
  const [state, setState] = useState<ReflexState>({
    phase: "idle"
  });
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);
  const start = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const startedAt = Date.now();
    const delay = 800 + Math.floor(Math.random() * 2200);
    const readyAt = startedAt + delay;
    setState({
      phase: "waiting",
      startedAt,
      readyAt
    });
    timerRef.current = window.setTimeout(() => {
      setState({
        phase: "ready",
        readyAt: Date.now()
      });
      timerRef.current = null;
    }, delay);
  };
  const click = () => {
    if (state.phase === "idle") return;
    if (state.phase === "waiting") {
      start();
      return;
    }
    if (state.phase === "ready") {
      const reactionMs = Date.now() - state.readyAt;
      const prevBest = getBestMs();
      const bestMs = prevBest == null ? reactionMs : Math.min(prevBest, reactionMs);
      if (bestMs !== prevBest) setBestMs(bestMs);
      setState({
        phase: "result",
        reactionMs,
        bestMs
      });
    }
    if (state.phase === "result") {
      start();
    }
  };
  const ui = (() => {
    if (state.phase === "idle") return {
      label: "Start",
      hint: "Натисніть Start, потім клікніть коли блок стане зеленим"
    };
    if (state.phase === "waiting") return {
      label: "Wait…",
      hint: "Не клікайте завчасно — гра перезапуститься"
    };
    if (state.phase === "ready") return {
      label: "CLICK!",
      hint: "Зараз!"
    };
    return {
      label: `Your time: ${state.reactionMs} ms`,
      hint: state.bestMs != null ? `Best: ${state.bestMs} ms` : ""
    };
  })();
  const boxClass = state.phase === "ready" ? "border-emerald-400 bg-emerald-400/10 text-emerald-300" : state.phase === "waiting" ? "border-border bg-bg-code text-text-secondary" : "border-border bg-bg-code text-text-primary";
  return <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-mono text-text-primary">Mini-game: Reflex</div>
          <div className="text-xs text-text-secondary mt-1">Коротка гра на реакцію, щоб час пролетів швидше.</div>
        </div>
        <Button variant="secondary" onClick={() => state.phase === "idle" ? start() : start()}>
          {state.phase === "idle" ? "Start" : "Restart"}
        </Button>
      </div>

      <button type="button" onClick={click} className={`mt-3 w-full border rounded-xl px-4 py-6 text-center font-mono transition-fast ${boxClass}`}>
        <div className="text-lg font-bold">{ui.label}</div>
        <div className="mt-2 text-xs opacity-80">{ui.hint}</div>
      </button>
    </div>;
};
export const MaintenancePage: React.FC<{
  state: MaintenancePayload;
  onRetry?: () => void;
  onAdminLogin?: () => void;
}> = ({
  state,
  onRetry,
  onAdminLogin
}) => {
  const countdown = useCountdown(state.until);
  return <div className="min-h-[100dvh] bg-bg-base text-text-primary flex items-center justify-center p-6">
      <Card className="w-full max-w-3xl p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">StudyCod</div>
            <h1 className="mt-2 text-3xl md:text-4xl font-mono font-bold text-text-primary">{state.title}</h1>
            <p className="mt-3 text-text-secondary leading-relaxed">{state.message}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="px-3 py-1 border border-border bg-bg-code text-xs font-mono text-text-secondary">
              503 Service Unavailable
            </div>
            {onAdminLogin && <Button variant="secondary" onClick={onAdminLogin}>
                Вхід адміністратора
              </Button>}
            <Button variant="ghost" onClick={onRetry || (() => window.location.reload())}>
              Спробувати знову
            </Button>
          </div>
        </div>

        {countdown && state.until && <div className="mt-6 border border-border bg-bg-code rounded-xl p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xs font-mono text-text-secondary uppercase tracking-wider">До завершення</div>
                <div className="text-sm text-text-secondary mt-1">
                  Орієнтовно до: <span className="text-text-primary font-mono">{countdown.until.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <div className="px-3 py-2 border border-border rounded-lg bg-bg-surface">
                  <div className="text-lg font-bold">{countdown.parts.d}</div>
                  <div className="text-[10px] text-text-secondary">days</div>
                </div>
                <div className="px-3 py-2 border border-border rounded-lg bg-bg-surface">
                  <div className="text-lg font-bold">{String(countdown.parts.h).padStart(2, "0")}</div>
                  <div className="text-[10px] text-text-secondary">hours</div>
                </div>
                <div className="px-3 py-2 border border-border rounded-lg bg-bg-surface">
                  <div className="text-lg font-bold">{String(countdown.parts.m).padStart(2, "0")}</div>
                  <div className="text-[10px] text-text-secondary">min</div>
                </div>
                <div className="px-3 py-2 border border-border rounded-lg bg-bg-surface">
                  <div className="text-lg font-bold">{String(countdown.parts.s).padStart(2, "0")}</div>
                  <div className="text-[10px] text-text-secondary">sec</div>
                </div>
              </div>
            </div>
          </div>}

        <ReflexGame />
      </Card>
    </div>;
};
export default MaintenancePage;