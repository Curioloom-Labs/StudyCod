import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, Search, Snowflake, Crown, Locate } from "lucide-react";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import {
  getContestScoreboard,
  getContestDetails,
  type ContestStandings,
  type ScoreboardRow,
} from "../../lib/api/contests";

type JwtPayload = { username?: string; name?: string; email?: string; sub?: string };

function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

function currentUserLabel(): string | null {
  try {
    const p = decodeJwtPayload(localStorage.getItem("token"));
    for (const c of [p?.username, p?.name, p?.email, p?.sub]) {
      if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

function ioiTone(score: number, max: number): string {
  if (max <= 0) return score > 0 ? "text-accent-success" : "text-text-muted";
  const frac = score / max;
  if (frac >= 1) return "text-accent-success font-semibold";
  if (frac > 0) return "text-accent-warn";
  return "text-text-muted";
}

export const ScoreboardPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const contestId = Number(params.id);

  const [board, setBoard] = useState<ContestStandings | null>(null);
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState("");

  const timerRef = useRef<number | null>(null);
  const prevRankRef = useRef<Record<number, number>>({});
  const meRowRef = useRef<HTMLTableRowElement | null>(null);
  const meLabel = useMemo(() => currentUserLabel(), []);

  useEffect(() => {
    if (!Number.isFinite(contestId)) return;
    let cancelled = false;

    getContestDetails(contestId)
      .then((d) => { if (!cancelled) setTitle(d.contest.title); })
      .catch(() => {});

    const tick = async () => {
      try {
        const b = await getContestScoreboard(contestId);
        if (cancelled) return;
        const prev: Record<number, number> = {};
        for (const r of b.rows) prev[r.participantId] = prevRankRef.current[r.participantId] ?? r.rank;
        prevRankRef.current = Object.fromEntries(b.rows.map((r) => [r.participantId, r.rank]));
        (b as ContestStandings & { __prevRanks?: Record<number, number> }).__prevRanks = prev;
        setBoard(b);
        setError(null);
      } catch {
        if (!cancelled) setError(tr("Не вдалося оновити таблицю.", "Failed to refresh."));
      }
    };
    void tick();

    // Live push via SSE: refetch immediately when the board changes. Polling
    // stays as a fallback (slower while connected).
    let es: EventSource | null = null;
    if (live && typeof EventSource !== "undefined") {
      try {
        let apiToken = "";
        try { apiToken = localStorage.getItem("token") ?? ""; } catch { /* ignore */ }
        const raw = String(import.meta.env.VITE_API_URL || window.location.origin).trim();
        const base = raw.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
        const url = `${base}/api/contests/${contestId}/events${apiToken ? `?token=${encodeURIComponent(apiToken)}` : ""}`;
        es = new EventSource(url);
        es.addEventListener("scoreboard", () => { void tick(); });
      } catch {
        es = null;
      }
    }

    if (live) timerRef.current = window.setInterval(tick, es ? 20000 : 7000);
    return () => {
      cancelled = true;
      if (timerRef.current) window.clearInterval(timerRef.current);
      try { es?.close(); } catch { /* ignore */ }
    };
  }, [contestId, live]);

  const mode = board?.scoringMode ?? "IOI";
  const problems = board?.problems ?? [];
  const prevRanks: Record<number, number> = (board as (ContestStandings & { __prevRanks?: Record<number, number> }) | null)?.__prevRanks ?? {};

  const isMe = (r: ScoreboardRow) => Boolean(meLabel && r.displayName.toLowerCase() === meLabel);

  const filteredRows = useMemo(() => {
    const rows = board?.rows ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.displayName.toLowerCase().includes(q));
  }, [board, query]);

  // Per-problem solve stats (over the full, unfiltered board).
  const solveStats = useMemo(() => {
    const rows = board?.rows ?? [];
    const stats: Record<number, { solved: number; attempted: number }> = {};
    for (const p of problems) stats[p.id] = { solved: 0, attempted: 0 };
    for (const r of rows) {
      for (const cell of r.problems) {
        const s = stats[cell.problemId];
        if (!s) continue;
        const attempted = (cell.attempts ?? 0) > 0 || Boolean(cell.bestAt) || (cell.score ?? 0) > 0;
        const solved = mode === "ICPC" ? Boolean(cell.solved) : (cell.score ?? 0) > 0;
        if (attempted) s.attempted += 1;
        if (solved) s.solved += 1;
      }
    }
    return stats;
  }, [board, problems, mode]);

  const podium = useMemo(() => (board?.rows ?? []).slice(0, 3), [board]);

  const jumpToMe = () => meRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });

  const rankBadgeTone = (rank: number): string => {
    if (rank === 1) return "border-yellow-400/60 bg-yellow-400/10 text-yellow-300";
    if (rank === 2) return "border-slate-300/60 bg-slate-300/10 text-slate-200";
    if (rank === 3) return "border-amber-600/60 bg-amber-600/10 text-amber-400";
    return "border-border bg-bg-base text-text-secondary";
  };

  const problemMax = (problemId: number) => problems.find((p) => p.id === problemId)?.maxScore ?? 0;

  return (
    <div className="w-full bg-bg-base px-4 py-6 md:px-8 md:py-8">
      <div className="max-w-6xl w-full mx-auto space-y-6">
        {/* Hero */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Button variant="ghost" onClick={() => navigate(`/contests/${Number.isFinite(contestId) ? contestId : ""}`)} className="mb-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
            <div className="inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-mono font-medium uppercase tracking-[0.04em] text-primary">
              <Trophy className="w-3.5 h-3.5" />
              {mode === "ICPC" ? tr("ICPC · бали + штраф", "ICPC · solved + penalty") : tr("IOI · сума балів", "IOI · points")}
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-mono font-semibold text-text-primary">
              {title || tr("Скорборд", "Scoreboard")}
            </h1>
            <p className="mt-1 text-sm font-mono text-text-secondary">
              {tr("Оновлюється наживо кожні 7 секунд.", "Updates live every 7 seconds.")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {board?.freeze?.frozen ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-accent-warn border border-accent-warn/50 bg-accent-warn/10 px-2 py-1 rounded">
                <Snowflake className="w-3.5 h-3.5" /> {tr("Заморожено", "Frozen")}
              </span>
            ) : null}
            {live && <span className="text-[11px] font-mono text-accent-error animate-pulse">● LIVE</span>}
            <Button variant="secondary" onClick={() => setLive((v) => !v)}>
              {live ? tr("Пауза", "Pause") : tr("Наживо", "Go live")}
            </Button>
          </div>
        </div>

        {!Number.isFinite(contestId) ? (
          <div className="text-sm text-text-secondary">{tr("Невірний контест.", "Invalid contest.")}</div>
        ) : (
          <>
            {error && <div className="text-xs font-mono text-accent-error">{error}</div>}
            {!board && !error && <div className="text-sm text-text-secondary">{tr("Завантаження…", "Loading…")}</div>}

            {/* Podium */}
            {board && podium.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {podium.map((r, i) => (
                  <div
                    key={r.participantId}
                    className={`rounded-xl border p-3 ${rankBadgeTone(i + 1)} ${isMe(r) ? "ring-1 ring-secondary" : ""}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{["🥇", "🥈", "🥉"][i]}</span>
                      <span className="font-mono text-sm text-text-primary truncate">{r.displayName}</span>
                    </div>
                    <div className="mt-1 text-xs font-mono text-text-secondary">
                      {mode === "ICPC"
                        ? `${r.solved ?? 0} ${tr("розв.", "solved")} · ${tr("штраф", "pen")} ${r.penalty ?? 0}`
                        : `${r.totalScore} ${tr("балів", "pts")}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Controls */}
            {board && (board.rows ?? []).length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tr("Пошук учасника…", "Search participant…")}
                    aria-label={tr("Пошук учасника", "Search participant")}
                    className="w-full h-10 pl-9 pr-3 rounded-lg bg-bg-surface border border-border text-sm font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                  />
                </div>
                {meLabel && (board.rows ?? []).some(isMe) ? (
                  <Button variant="secondary" onClick={jumpToMe}>
                    <Locate className="w-4 h-4 mr-2" />
                    {tr("До мене", "Jump to me")}
                  </Button>
                ) : null}
                {typeof board.disqualifiedCount === "number" && board.disqualifiedCount > 0 ? (
                  <span className="text-[11px] font-mono text-text-secondary">
                    {tr(`Дискваліфіковано: ${board.disqualifiedCount}`, `Disqualified: ${board.disqualifiedCount}`)}
                  </span>
                ) : null}
              </div>
            ) : null}

            {board && (
              <div className="border border-border bg-bg-surface overflow-x-auto max-h-[70vh] overflow-y-auto rounded-lg">
                <table className="w-full text-sm font-mono border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10">
                    <tr className="text-text-secondary text-xs uppercase tracking-[0.04em] bg-bg-base">
                      <th className="px-4 py-3 text-left border-b border-border sticky left-0 bg-bg-base z-10">#</th>
                      <th className="px-4 py-3 text-left border-b border-border">{tr("Учасник", "Participant")}</th>
                      {problems.map((p) => (
                        <th key={p.id} className="px-3 py-3 text-center border-b border-border" title={p.maxScore ? `max ${p.maxScore}` : undefined}>
                          {p.label}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-center border-b border-border">{mode === "ICPC" ? tr("Розв.", "Solved") : "Σ"}</th>
                      <th className="px-4 py-3 text-center border-b border-border">{tr("Штраф", "Pen.")}</th>
                    </tr>
                    {/* Per-problem solve stats */}
                    <tr className="text-[10px] text-text-muted bg-bg-base/70">
                      <th className="px-4 py-1 border-b border-border sticky left-0 bg-bg-base/70" />
                      <th className="px-4 py-1 border-b border-border text-left font-normal">{tr("розв./спроб", "solved/att")}</th>
                      {problems.map((p) => {
                        const s = solveStats[p.id] ?? { solved: 0, attempted: 0 };
                        return (
                          <th key={p.id} className="px-3 py-1 border-b border-border text-center font-normal">
                            {s.solved}/{s.attempted}
                          </th>
                        );
                      })}
                      <th className="px-4 py-1 border-b border-border" />
                      <th className="px-4 py-1 border-b border-border" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((r) => {
                      const prev = prevRanks[r.participantId];
                      const moved = prev != null && prev !== r.rank ? (prev > r.rank ? "↑" : "↓") : "";
                      const me = isMe(r);
                      return (
                        <tr
                          key={r.participantId}
                          ref={me ? meRowRef : undefined}
                          className={`${me ? "bg-secondary/10" : "odd:bg-bg-base/40 even:bg-bg-surface"} hover:bg-bg-hover transition-fast`}
                        >
                          <td className={`px-4 py-2.5 border-b border-border ${me ? "bg-secondary/10" : "bg-inherit"} sticky left-0`}>
                            <span className={`inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded border text-xs font-bold ${rankBadgeTone(r.rank)}`}>
                              {r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : r.rank}
                            </span>
                            <span className={`ml-1 ${moved === "↑" ? "text-accent-success" : "text-accent-error"}`}>{moved}</span>
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-text-primary">
                            {me ? <Crown className="inline w-3.5 h-3.5 text-secondary mr-1 -mt-0.5" /> : null}
                            {r.displayName}
                            {me ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-secondary/20 text-secondary">{tr("ви", "you")}</span> : null}
                          </td>
                          {problems.map((p) => {
                            const cell = r.problems.find((x) => x.problemId === p.id);
                            if (!cell) return <td key={p.id} className="px-3 py-2.5 border-b border-border text-center text-text-muted">·</td>;
                            const firstBlood = Boolean(cell.isFirstBlood);
                            const pending = Boolean(cell.pending);
                            if (mode === "ICPC") {
                              const attempted = (cell.attempts ?? 0) > 0;
                              return (
                                <td key={p.id} className={`px-3 py-2.5 border-b border-border text-center ${pending ? "bg-accent-warn/10" : firstBlood ? "bg-yellow-400/10" : ""}`} title={pending ? tr("Очікує (заморожено)", "Pending (frozen)") : cell.penaltyMinutes ? `${cell.penaltyMinutes} min` : undefined}>
                                  {cell.solved ? (
                                    <span className="text-accent-success">
                                      {firstBlood ? "⚡" : "✓"}{(cell.attempts ?? 1) > 1 ? `(${cell.attempts})` : ""}
                                      {pending ? <span className="text-accent-warn">?</span> : null}
                                    </span>
                                  ) : pending ? (
                                    <span className="text-accent-warn">?{attempted ? cell.attempts : ""}</span>
                                  ) : attempted ? (
                                    <span className="text-accent-error">−{cell.attempts}</span>
                                  ) : (
                                    <span className="text-text-muted">·</span>
                                  )}
                                </td>
                              );
                            }
                            const hasSub = Boolean(cell.bestAt) || (cell.score ?? 0) > 0;
                            return (
                              <td key={p.id} className={`px-3 py-2.5 border-b border-border text-center ${pending ? "bg-accent-warn/10" : firstBlood ? "bg-yellow-400/10" : ""} ${ioiTone(cell.score ?? 0, problemMax(p.id))}`} title={pending ? tr("Очікує (заморожено)", "Pending (frozen)") : undefined}>
                                {firstBlood ? "⚡" : ""}{hasSub ? (cell.score ?? 0) : "—"}{pending ? <span className="text-accent-warn">?</span> : null}
                              </td>
                            );
                          })}
                          <td className="px-4 py-2.5 border-b border-border text-center text-text-primary font-bold">
                            {mode === "ICPC" ? (r.solved ?? 0) : r.totalScore}
                          </td>
                          <td className="px-4 py-2.5 border-b border-border text-center text-text-secondary">{r.penalty ?? 0}</td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={problems.length + 4} className="px-4 py-6 text-center text-text-secondary border-b border-border">
                          {query.trim()
                            ? tr("Нічого не знайдено.", "No matches.")
                            : tr("Ще немає сабмішнів.", "No submissions yet.")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ScoreboardPage;
