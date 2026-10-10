import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trophy, Search, Snowflake, Crown, Locate, Medal, Download, FileSpreadsheet } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { tr } from "../../i18n";
import { Button } from "../../components/ui/Button";
import { PageEyebrow } from "../../components/ui/PageEyebrow";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  getContestScoreboard,
  getContestDetails,
  type ContestStandings,
  type ScoreboardRow,
} from "../../lib/api/contests";
import { staggerContainer, fadeUpItem, easeOutQuint } from "../../lib/motion";
import { getCachedMeUser } from "../../lib/api/profile";
import { ContestSectionNav } from "./ContestSectionNav";

function currentUserLabel(): string | null {
  const user = getCachedMeUser();
  for (const c of [user?.username, user?.firstName, user?.email, user?.id != null ? String(user.id) : null]) {
    if (typeof c === "string" && c.trim()) return c.trim().toLowerCase();
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

function spreadsheetText(value: string): string {
  // Keep participant-controlled text from being interpreted as a formula by spreadsheet apps.
  return /^[\t\r ]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number): string {
  const text = spreadsheetText(String(value));
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const ScoreboardPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams<{ id?: string }>();
  const contestId = Number(params.id);
  const prefersReducedMotion = useReducedMotion();

  const [board, setBoard] = useState<ContestStandings | null>(null);
  const [title, setTitle] = useState<string>("");
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const exportMenuRef = useRef<HTMLDetailsElement | null>(null);

  const timerRef = useRef<number | null>(null);
  const prevRankRef = useRef<Record<number, number>>({});
  const meRowRef = useRef<HTMLTableRowElement | null>(null);
  const meLabel = useMemo(() => currentUserLabel(), []);

  useEffect(() => {
    if (!Number.isFinite(contestId)) return;
    let cancelled = false;

    getContestDetails(contestId)
      .then((d) => {
        if (cancelled) return;
        setTitle(d.contest.title);
        setCanManage(Boolean(d.access.canManage));
      })
      .catch(() => {});

    let lastFetchAt = 0;
    let fetchInFlight = false;
    const tick = async () => {
      if (fetchInFlight || Date.now() - lastFetchAt < 5000) return;
      fetchInFlight = true; lastFetchAt = Date.now();
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
      } finally { fetchInFlight = false; }
    };
    void tick();

    // Live push via SSE: refetch immediately when the board changes. Polling
    // stays as a fallback (slower while connected).
    let es: EventSource | null = null;
    if (live && typeof EventSource !== "undefined") {
      try {
        const raw = String(import.meta.env.VITE_API_URL || window.location.origin).trim();
        const base = raw.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
        const url = `${base}/api/contests/${contestId}/events`;
        es = new EventSource(url, { withCredentials: true });
        es.addEventListener("scoreboard", () => { void tick(); });
      } catch {
        es = null;
      }
    }

    if (live) timerRef.current = window.setInterval(tick, es ? 20000 : 5000 + Math.random() * 1000);
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
    if (rank === 2) return "border-border bg-bg-hover text-text-secondary";
    if (rank === 3) return "border-amber-600/60 bg-amber-600/10 text-amber-400";
    return "border-border bg-bg-base text-text-secondary";
  };

  const problemMax = (problemId: number) => problems.find((p) => p.id === problemId)?.maxScore ?? 0;

  const exportHeaders = [
    tr("Місце", "Rank"),
    tr("Учасник", "Participant"),
    ...problems.map((p) => `${tr("Задача", "Problem")} ${p.label}`),
    mode === "ICPC" ? tr("Розв'язано", "Solved") : tr("Сума балів", "Total score"),
    tr("Штраф", "Penalty"),
  ];

  const exportRows = filteredRows.map((row) => [
    row.rank,
    spreadsheetText(row.displayName),
    ...problems.map((problem) => {
      const cell = row.problems.find((item) => item.problemId === problem.id);
      if (!cell) return mode === "ICPC" ? "—" : 0;
      if (mode !== "ICPC") return cell.pending ? `${cell.score ?? 0} (${tr("очікує", "pending")})` : (cell.score ?? 0);
      const attempts = cell.attempts ?? 0;
      if (cell.solved) return `${tr("Розв'язано", "Solved")}${attempts > 1 ? ` (${attempts})` : ""}${cell.pending ? "?" : ""}`;
      if (cell.pending) return `${tr("Очікує", "Pending")}${attempts ? ` (${attempts})` : ""}`;
      return attempts ? `−${attempts}` : "—";
    }),
    mode === "ICPC" ? (row.solved ?? 0) : row.totalScore,
    row.penalty ?? 0,
  ]);

  const closeExportMenu = () => {
    if (exportMenuRef.current) exportMenuRef.current.open = false;
  };

  const downloadCsv = () => {
    const csv = [exportHeaders, ...exportRows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    downloadBlob(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }), `contest-${contestId}-results.csv`);
    setExportError(null);
    closeExportMenu();
  };

  const downloadXlsx = async () => {
    try {
      const XLSX = await import("@e965/xlsx");
      const worksheet = XLSX.utils.aoa_to_sheet([exportHeaders.map(spreadsheetText), ...exportRows]);
      worksheet["!cols"] = [
        { wch: 9 },
        { wch: 30 },
        ...problems.map(() => ({ wch: 18 })),
        { wch: 14 },
        { wch: 12 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, tr("Результати", "Results"));
      const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      downloadBlob(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `contest-${contestId}-results.xlsx`);
      setExportError(null);
      closeExportMenu();
    } catch {
      setExportError(tr("Не вдалося створити XLSX-файл. Спробуй експортувати CSV.", "Could not create the XLSX file. Try exporting CSV."));
    }
  };

  return (
    <div className="w-full bg-bg-base px-3 py-4 sm:px-6 md:py-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Hero */}
        <motion.div
          initial={prefersReducedMotion ? undefined : { opacity: 0, y: 10 }}
          animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: easeOutQuint }}
          className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-bg-surface/80 p-4 shadow-[0_18px_55px_-45px_rgba(0,0,0,.75)] sm:flex-row sm:items-start sm:justify-between sm:p-5"
        >
          <div>
            <Button variant="ghost" onClick={() => navigate(`/contest/contests/${Number.isFinite(contestId) ? contestId : ""}`)} className="mb-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
            <PageEyebrow label="standings" />
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.035em] text-text-primary md:text-3xl">
              {title || tr("Таблиця результатів", "Contest standings")}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/10 text-[11px] font-mono font-medium uppercase tracking-[0.06em] text-primary">
                <Trophy className="w-3 h-3" />
                {mode === "ICPC" ? tr("ICPC · бали + штраф", "ICPC · solved + penalty") : tr("IOI · сума балів", "IOI · points")}
              </span>
              <p className="text-sm text-text-secondary">
                {board?.hidden ? tr("Таблицю приховано відповідно до налаштувань контесту.", "The scoreboard is hidden by contest settings.") : tr("Таблиця оновлюється автоматично.", "Standings update automatically.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {board?.freeze?.frozen ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-accent-warn border border-accent-warn/50 bg-accent-warn/10 px-2 py-1 rounded-lg">
                <Snowflake className="w-3.5 h-3.5" /> {tr("Заморожено", "Frozen")}
              </span>
            ) : null}
            {live && !board?.hidden && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent-error">
                <span className="relative inline-flex h-2 w-2">
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-error" />
                </span>
                LIVE
              </span>
            )}
            {!board?.hidden && <Button variant="secondary" onClick={() => setLive((v) => !v)}>
              {live ? tr("Пауза", "Pause") : tr("Наживо", "Go live")}
            </Button>}
          </div>
        </motion.div>

        {Number.isFinite(contestId) ? <ContestSectionNav contestId={contestId} active="standings" canManage={canManage} /> : null}

        {!Number.isFinite(contestId) ? (
          <div className="text-sm text-text-secondary">{tr("Невірний контест.", "Invalid contest.")}</div>
        ) : (
          <>
            {error && <div role="alert" className="text-xs font-mono text-accent-error">{error}</div>}
            {!board && !error && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-xl" />
                  ))}
                </div>
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-[320px] w-full rounded-lg" />
              </div>
            )}

            {board?.hidden && <div role="status" className="rounded-2xl border border-border bg-bg-surface p-8 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Trophy className="size-6" aria-hidden="true" /></div>
              <h2 className="mt-4 text-lg font-semibold text-text-primary">{board.hiddenReason === "ORGANIZERS_ONLY" ? tr("Таблиця доступна організаторам", "Scoreboard is available to organizers") : tr("Результати будуть після фінішу", "Results will be available after the finish")}</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{board.hiddenReason === "ORGANIZERS_ONLY" ? tr("Організатор обрав не показувати поточні результати учасникам.", "The organizer chose to keep current results private.") : board.releaseAt ? `${tr("Таблицю буде відкрито", "The scoreboard opens")}: ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(board.releaseAt))}.` : tr("Організатору потрібно задати час завершення, щоб відкрити таблицю автоматично.", "The organizer needs to set an end time to reveal the scoreboard automatically.")}</p>
            </div>}

            {/* Podium */}
            {board && !board.hidden && podium.length > 0 ? (
              <motion.div
                variants={prefersReducedMotion ? undefined : staggerContainer}
                initial={prefersReducedMotion ? undefined : "initial"}
                animate={prefersReducedMotion ? undefined : "animate"}
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                {podium.map((r, i) => {
                  const PodiumIcon = i === 0 ? Crown : i === 1 ? Trophy : Medal;
                  const iconCls = i === 0 ? "text-yellow-400" : i === 1 ? "text-slate-400" : "text-amber-500";
                  return (
                    <motion.div
                      key={r.participantId}
                      variants={prefersReducedMotion ? undefined : fadeUpItem}
                      className={`rounded-2xl border p-4 transition-fast hover:-translate-y-0.5 ${rankBadgeTone(i + 1)} ${isMe(r) ? "ring-1 ring-secondary" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${i === 0 ? "bg-yellow-400/15" : i === 1 ? "bg-slate-400/15" : "bg-amber-500/15"}`}>
                          <PodiumIcon className={`w-4 h-4 ${iconCls}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-text-primary">{r.displayName}</div>
                          <div className="text-xs text-text-muted">{tr("місце", "place")} #{i + 1}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm font-medium tabular-nums text-text-secondary">
                        {mode === "ICPC"
                          ? `${r.solved ?? 0} ${tr("розв.", "solved")} · ${tr("штраф", "pen")} ${r.penalty ?? 0}`
                          : `${r.totalScore} ${tr("балів", "pts")}`}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : null}

            {/* Controls */}
            {board && !board.hidden && (board.rows ?? []).length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tr("Пошук учасника…", "Search participant…")}
                    aria-label={tr("Пошук учасника", "Search participant")}
                  className="h-11 w-full rounded-xl border border-border bg-bg-surface pl-10 pr-3 text-sm text-text-primary outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                  />
                </div>
                {meLabel && (board.rows ?? []).some(isMe) ? (
                  <Button variant="secondary" onClick={jumpToMe}>
                    <Locate className="w-4 h-4 mr-2" />
                    {tr("До мене", "Jump to me")}
                  </Button>
                ) : null}
                <details ref={exportMenuRef} className="relative">
                  <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 text-sm font-medium text-text-primary transition-fast hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary [&::-webkit-details-marker]:hidden">
                    <Download className="h-4 w-4" />
                    {tr("Експорт", "Export")}
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 min-w-56 rounded-xl border border-border bg-bg-surface p-2 shadow-xl">
                    <p className="px-2 py-1 text-xs text-text-muted">{tr(`Учасників: ${filteredRows.length}`, `Participants: ${filteredRows.length}`)}</p>
                    <button type="button" onClick={downloadCsv} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-hover">
                      <Download className="h-4 w-4 text-text-muted" /> CSV
                    </button>
                    <button type="button" onClick={() => void downloadXlsx()} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-text-primary hover:bg-bg-hover">
                      <FileSpreadsheet className="h-4 w-4 text-text-muted" /> Excel (.xlsx)
                    </button>
                  </div>
                </details>
                {typeof board.disqualifiedCount === "number" && board.disqualifiedCount > 0 ? (
                  <span className="text-[11px] font-mono text-text-secondary">
                    {tr(`Дискваліфіковано: ${board.disqualifiedCount}`, `Disqualified: ${board.disqualifiedCount}`)}
                  </span>
                ) : null}
              </div>
            ) : null}
            {exportError ? <p role="alert" className="text-sm text-accent-error">{exportError}</p> : null}

            {board && !board.hidden && board.rows.length === 0 && (
              <div className="rounded-2xl border border-border/70 bg-bg-surface/80 px-6 py-12 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><Trophy className="size-6" aria-hidden="true" /></div>
                <h2 className="mt-4 text-lg font-semibold text-text-primary">{tr("У таблиці поки порожньо", "The standings are empty for now")}</h2>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{tr("Результати учасників з’являться тут після перших офіційних подач.", "Participant results will appear here after the first official submissions.")}</p>
              </div>
            )}

            {board && !board.hidden && board.rows.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-border/80 bg-bg-surface shadow-[0_18px_55px_-42px_rgba(0,0,0,.7)]">
                <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#111a14] text-xs font-bold uppercase tracking-[.08em] text-[#aebdb2]">
                      <th scope="col" className="sticky left-0 z-20 border-b border-border/80 bg-[#111a14] px-4 py-4 text-left">#</th>
                      <th scope="col" className="border-b border-border/80 px-4 py-4 text-left">{tr("Учасник", "Participant")}</th>
                      {problems.map((p) => (
                        <th scope="col" key={p.id} className="border-b border-border/80 px-4 py-4 text-center" title={p.maxScore ? `max ${p.maxScore}` : undefined}>
                          {p.label}
                        </th>
                      ))}
                      <th scope="col" className="border-b border-border/80 px-4 py-4 text-center">{mode === "ICPC" ? tr("Розв.", "Solved") : "Σ"}</th>
                      <th scope="col" className="border-b border-border/80 px-4 py-4 text-center">{tr("Штраф", "Pen.")}</th>
                    </tr>
                    {/* Per-problem solve stats */}
                    <tr className="bg-[#0d1510] text-[11px] text-text-muted">
                      <th scope="col" className="sticky left-0 z-20 border-b border-border/80 bg-[#0d1510] px-4 py-2" />
                      <th scope="col" className="border-b border-border/80 px-4 py-2 text-left font-medium">{tr("розв./спроб", "solved/att")}</th>
                      {problems.map((p) => {
                        const s = solveStats[p.id] ?? { solved: 0, attempted: 0 };
                        return (
                          <th scope="col" key={p.id} className="border-b border-border/80 px-4 py-2 text-center font-medium tabular-nums">
                            {s.solved}<span className="text-text-muted/70"> / </span>{s.attempted}
                          </th>
                        );
                      })}
                      <th scope="col" className="border-b border-border/80 px-4 py-2" />
                      <th scope="col" className="border-b border-border/80 px-4 py-2" />
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
                      className={`group transition-colors hover:bg-bg-hover ${me ? "bg-secondary/[.12]" : "odd:bg-bg-base/50 even:bg-bg-surface"}`}
                        >
                          <td className={`sticky left-0 z-10 border-b border-border/70 px-4 py-3 ${me ? "bg-[#153321]" : "bg-bg-surface group-odd:bg-bg-base"}`}>
                            <span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg border px-2 text-xs font-extrabold tabular-nums ${rankBadgeTone(r.rank)}`}>
                              {r.rank}
                            </span>
                            {moved && <span aria-label={moved === "↑" ? tr("Піднявся в рейтингу", "Moved up") : tr("Опустився в рейтингу", "Moved down")} className={`ml-2 text-xs font-bold ${moved === "↑" ? "text-accent-success" : "text-accent-error"}`}>{moved}</span>}
                          </td>
                          <td className="max-w-[360px] border-b border-border/70 px-4 py-3 text-text-primary">
                            {me ? <Crown aria-hidden="true" className="mr-2 inline size-4 text-secondary align-[-2px]" /> : null}
                            <span className="inline-block max-w-[280px] truncate align-bottom font-semibold">{r.displayName}</span>
                            {me ? <span className="ml-2 rounded-md bg-secondary/15 px-2 py-1 text-[10px] font-bold text-secondary">{tr("ви", "you")}</span> : null}
                          </td>
                          {problems.map((p) => {
                            const cell = r.problems.find((x) => x.problemId === p.id);
                            if (!cell) return <td key={p.id} className="px-3 py-2.5 border-b border-border text-center text-text-muted">·</td>;
                            const firstBlood = Boolean(cell.isFirstBlood);
                            const pending = Boolean(cell.pending);
                            if (mode === "ICPC") {
                              const attempted = (cell.attempts ?? 0) > 0;
                              return (
                                <td key={p.id} className={`border-b border-border/70 px-4 py-3 text-center font-semibold tabular-nums ${pending ? "bg-accent-warn/10" : firstBlood ? "bg-yellow-400/10" : ""}`} title={pending ? tr("Очікує (заморожено)", "Pending (frozen)") : cell.penaltyMinutes ? `${cell.penaltyMinutes} min` : undefined}>
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
                              <td key={p.id} className={`border-b border-border/70 px-4 py-3 text-center font-semibold tabular-nums ${pending ? "bg-accent-warn/10" : firstBlood ? "bg-yellow-400/10" : ""} ${ioiTone(cell.score ?? 0, problemMax(p.id))}`} title={pending ? tr("Очікує (заморожено)", "Pending (frozen)") : undefined}>
                                {firstBlood ? "⚡" : ""}{hasSub ? (cell.score ?? 0) : "—"}{pending ? <span className="text-accent-warn">?</span> : null}
                              </td>
                            );
                          })}
                          <td className="border-b border-border/70 px-4 py-3 text-center font-bold tabular-nums text-text-primary">
                            {mode === "ICPC" ? (r.solved ?? 0) : r.totalScore}
                          </td>
                          <td className="border-b border-border/70 px-4 py-3 text-center tabular-nums text-text-secondary">{r.penalty ?? 0}</td>
                        </tr>
                      );
                    })}
                    {filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={problems.length + 4} className="border-b border-border px-4 py-10 text-center text-text-secondary">
                          {query.trim()
                            ? tr("Нічого не знайдено.", "No matches.")
                            : tr("У таблиці поки немає учасників.", "No participants are on the table yet.")}
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
