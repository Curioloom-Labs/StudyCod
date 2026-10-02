import React from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  FileCode2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCw,
  Search,
  Trophy,
  UsersRound,
  KeyRound,
} from "lucide-react";
import {
  checkContestProblem,
  getContestDetails,
  getContestMyProgress,
  getContestProblemStatement,
  getContestProblemSubmissions,
  getContestScoreboard,
  joinContest,
  joinContestByCode,
  listContests,
  runContestProblem,
  type ContestDetails,
  type ContestListItem,
  type ContestListQuery,
  type ContestMyProgressProblem,
  type ContestProblemStatement,
  type ContestStandings,
  type JudgeLanguage,
} from "../../lib/api/contests";
import { enabledJudgeLanguages } from "../../lib/judgeLanguages";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
import { ContestSetupDialog } from "./ContestSetupDialog";
import { CONTEST_BANNER_THEMES, contestTheme } from "./contestBranding";

const isPreview = () =>
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "true";
const date = (value: string | null | undefined) => {
  if (!value) return "Без дати";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("uk-UA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
};
const phaseFor = (item: { startsAt: string | null; endsAt: string | null }) => {
  const now = Date.now();
  if (item.startsAt && new Date(item.startsAt).getTime() > now)
    return "soon" as const;
  if (item.endsAt && new Date(item.endsAt).getTime() < now)
    return "ended" as const;
  return "live" as const;
};
const phaseCopy = { live: "Триває", soon: "Незабаром", ended: "Завершено" };
const phaseStyle = {
  live: "bg-[#ddf8e9] text-[#147345] dark:bg-[#00ff88]/12 dark:text-[#72edb0]",
  soon: "bg-[#fff0d7] text-[#a75c00] dark:bg-[#ff8c00]/12 dark:text-[#ffb760]",
  ended: "bg-[#e9eeeb] text-[#5d6d62] dark:bg-white/[.07] dark:text-[#a9b6ad]",
};

function calendarEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function calendarTimestamp(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function downloadContestCalendar(contest: ContestDetails["contest"]): void {
  if (!contest.startsAt) return;
  const start = calendarTimestamp(contest.startsAt);
  const end = calendarTimestamp(contest.endsAt || new Date(new Date(contest.startsAt).getTime() + 60 * 60_000).toISOString());
  const description = calendarEscape(contest.description || "StudyCod contest");
  const title = calendarEscape(contest.title);
  const content = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyCod//Contests//UK",
    "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:studycod-contest-${contest.id}@studycod.org`,
    `DTSTAMP:${calendarTimestamp(new Date().toISOString())}`, `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${title}`, `DESCRIPTION:${description}`, `URL:${window.location.origin}/contest/contests/${contest.id}`,
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${title} почнеться завтра`, "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${title} почнеться за 15 хвилин`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `studycod-contest-${contest.id}.ics`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return days > 0
    ? `${days} д ${String(hours).padStart(2, "0")} год ${String(minutes).padStart(2, "0")} хв`
    : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

const previewContests: ContestListItem[] = [
  {
    id: 102,
    title: "Алгоритмічна субота",
    description: "П'ять задач на уважність, структури даних і здоровий темп.",
    tags: ["алгоритми", "масиви"],
    difficulty: "MEDIUM",
    participantsCount: 38,
    visibility: "PUBLIC",
    startsAt: new Date(Date.now() - 42 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 78 * 60_000).toISOString(),
    isPublished: true,
    allowUpsolve: true,
    createdAt: null,
    createdBy: { id: 1, username: "study-team" },
    classId: null,
    canAccessContent: true,
    joinRequired: false,
  },
  {
    id: 103,
    title: "Python: колекції",
    description:
      "Короткий контест для тих, хто хоче перевірити базу без зайвого шуму.",
    tags: ["python", "колекції"],
    difficulty: "EASY",
    participantsCount: 12,
    visibility: "PUBLIC",
    startsAt: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 26 * 60 * 60_000).toISOString(),
    isPublished: true,
    allowUpsolve: true,
    createdAt: null,
    createdBy: { id: 2, username: "olena" },
    classId: null,
    canAccessContent: false,
    joinRequired: true,
  },
  {
    id: 98,
    title: "Розминка: рядки",
    description: "Архівна добірка з поясненнями після кожної спроби.",
    tags: ["рядки"],
    difficulty: "EASY",
    participantsCount: 64,
    visibility: "PUBLIC",
    startsAt: null,
    endsAt: new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
    isPublished: true,
    allowUpsolve: true,
    createdAt: null,
    createdBy: { id: 3, username: "marko" },
    classId: null,
    canAccessContent: true,
    joinRequired: false,
  },
];

const previewDetails = (id: number): ContestDetails => ({
  contest: {
    id,
    title: id === 103 ? "Python: колекції" : "Алгоритмічна субота",
    description:
      "Змагання без зайвого пафосу: спочатку розберися з умовою, потім напиши чисте рішення. Після фінішу доступний upsolve.",
    tags: ["алгоритми"],
    difficulty: "MEDIUM",
    visibility: "PUBLIC",
    startsAt:
      id === 103
        ? new Date(Date.now() + 24 * 60 * 60_000).toISOString()
        : new Date(Date.now() - 42 * 60_000).toISOString(),
    endsAt:
      id === 103
        ? new Date(Date.now() + 26 * 60 * 60_000).toISOString()
        : new Date(Date.now() + 78 * 60_000).toISOString(),
    isPublished: true,
    allowUpsolve: true,
    scoringMode: "IOI",
    createdBy: { id: 1, username: "study-team" },
    classId: null,
  },
  access: { canAccessContent: true, isJoined: true, joinRequired: false },
  problems: [
    {
      id: 501,
      order: 1,
      label: "A",
      points: 100,
      title: "Тиха перестановка",
      libraryTaskId: 41,
    },
    {
      id: 502,
      order: 2,
      label: "B",
      points: 150,
      title: "Черга повідомлень",
      libraryTaskId: 42,
    },
    {
      id: 503,
      order: 3,
      label: "C",
      points: 200,
      title: "Доступний маршрут",
      libraryTaskId: 43,
    },
  ],
  participantsCount: 38,
  serverTime: new Date().toISOString(),
  phase: { started: id !== 103, finished: false },
});

const previewStandings: ContestStandings = {
  contestId: 102,
  scoringMode: "IOI",
  problems: [
    { id: 501, order: 1, label: "A", maxScore: 100 },
    { id: 502, order: 2, label: "B", maxScore: 150 },
    { id: 503, order: 3, label: "C", maxScore: 200 },
  ],
  rows: [
    {
      rank: 1,
      participantId: 31,
      displayName: "Іра М.",
      totalScore: 350,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 150, bestAt: null },
        { problemId: 503, score: 100, bestAt: null },
      ],
    },
    {
      rank: 2,
      participantId: 32,
      displayName: "Данило Р.",
      totalScore: 300,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 100, bestAt: null },
        { problemId: 503, score: 100, bestAt: null },
      ],
    },
    {
      rank: 3,
      participantId: 33,
      displayName: "Софія Л.",
      totalScore: 250,
      lastImprovementAt: null,
      problems: [
        { problemId: 501, score: 100, bestAt: null },
        { problemId: 502, score: 150, bestAt: null },
        { problemId: 503, score: 0, bestAt: null },
      ],
    },
  ],
};

function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  const styles =
    tone === "error"
      ? "border-[#ff6b9d]/30 bg-[#ff6b9d]/[.08] text-[#be3863] dark:text-[#ff9abd]"
      : tone === "success"
        ? "border-[#00ff88]/25 bg-[#00ff88]/[.08] text-[#147345] dark:text-[#72edb0]"
        : "border-[#17251c]/10 bg-[#f0f4f0] text-[#617167] dark:border-white/[.08] dark:bg-white/[.045] dark:text-[#afbbb2]";
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-medium ${styles}`}
    >
      {children}
    </div>
  );
}

function Shell({
  eyebrow,
  title,
  aside,
  children,
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-[#16834d] dark:text-[#72edb0]">
            {eyebrow}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-[#142017] dark:text-[#f1f5f1] sm:text-5xl">
            {title}
          </h1>
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export const ContestLobbyPage: React.FC<{ canCreate?: boolean; canJoinPrivateByCode?: boolean; favoriteScope?: string }> = ({
  canCreate = true,
  canJoinPrivateByCode = true,
  favoriteScope = "guest",
}) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = React.useState<ContestListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "live" | "soon" | "ended">(() => {
    const value = searchParams.get("phase");
    return value === "live" || value === "soon" || value === "ended" ? value : "all";
  });
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [sort, setSort] = React.useState<NonNullable<ContestListQuery["sort"]>>(() => {
    const value = searchParams.get("sort");
    return value === "soonest" || value === "title" ? value : "newest";
  });
  const [difficulty, setDifficulty] = React.useState<NonNullable<ContestListQuery["difficulty"]> | "all">(() => {
    const value = searchParams.get("difficulty");
    return value === "EASY" || value === "MEDIUM" || value === "HARD" ? value : "all";
  });
  const [showSaved, setShowSaved] = React.useState(() => searchParams.get("saved") === "1");
  const favoriteStorageKey = `studycod:contest-favorites:${favoriteScope}`;
  const [favoriteIds, setFavoriteIds] = React.useState<number[]>(() => {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(favoriteStorageKey) || "[]");
      return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0) : [];
    } catch {
      return [];
    }
  });
  const [page, setPage] = React.useState(() => Math.max(1, Number(searchParams.get("page")) || 1));
  const [total, setTotal] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [joinBusy, setJoinBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    try { window.localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteIds)); } catch { /* storage may be unavailable */ }
  }, [favoriteIds, favoriteStorageKey]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams);
    ["phase", "q", "sort", "difficulty", "page", "saved"].forEach((key) => params.delete(key));
    if (filter !== "all") params.set("phase", filter);
    if (search.trim()) params.set("q", search.trim());
    if (sort !== "newest") params.set("sort", sort);
    if (difficulty !== "all") params.set("difficulty", difficulty);
    if (showSaved) params.set("saved", "1");
    if (page > 1) params.set("page", String(page));
    if (params.toString() !== searchParams.toString()) setSearchParams(params, { replace: true });
  }, [difficulty, filter, page, search, searchParams, setSearchParams, showSaved, sort]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listContests({ page, pageSize: 12, search: debouncedSearch, phase: filter, sort, ...(difficulty !== "all" ? { difficulty } : {}), ...(showSaved ? { ids: favoriteIds.join(",") } : {}) });
      setItems(response.contests ?? []);
      setTotal(response.total ?? response.contests?.length ?? 0);
      setTotalPages(response.totalPages ?? 1);
      if (page > (response.totalPages ?? 1)) setPage(response.totalPages ?? 1);
    } catch (caught) {
      if (isPreview()) {
        const q = debouncedSearch.toLowerCase();
        const fallback = previewContests
          .filter((item) => filter === "all" || phaseFor(item) === filter)
          .filter((item) => difficulty === "all" || item.difficulty === difficulty)
          .filter((item) => !showSaved || favoriteIds.includes(item.id))
          .filter((item) => !q || `${item.title} ${item.description ?? ""}`.toLowerCase().includes(q));
        setItems(fallback);
        setTotal(fallback.length);
        setTotalPages(1);
        setMessage("Демо-режим: показано сценарій контестів.");
      } else
        setError(
          getErrorMessageFromUnknown(
            caught,
            "Не вдалося завантажити контести.",
          ),
        );
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, difficulty, favoriteIds, filter, page, showSaved, sort]);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const filtered = items;
  const toggleFavorite = (contestId: number) => {
    setFavoriteIds((current) => current.includes(contestId) ? current.filter((id) => id !== contestId) : [...current, contestId]);
  };

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim()) return;
    setJoinBusy(true);
    setError(null);
    try {
      const result = await joinContestByCode(code.trim());
      navigate(`/contest/contests/${result.contestId}`);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, "Не вдалося приєднатися за кодом."),
      );
    } finally {
      setJoinBusy(false);
    }
  };
  return (
    <Shell
      eyebrow="StudyCod Contest"
      title="Змагання, де видно хід думки"
      aside={
        <div className="flex flex-wrap gap-2">
          {canJoinPrivateByCode && <button type="button"
            onClick={() => setJoinOpen(true)}
            className="rounded-xl border border-[#1a2a1e]/12 px-4 py-2.5 text-sm font-bold text-[#243329] transition hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]"
          >
            <LockKeyhole className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Ввести код
          </button>}
          {canCreate && <button type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-[#153321] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(20,67,40,.2)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:bg-[#00d978] dark:text-[#062211]"
          >
            <Plus className="mr-2 inline h-4 w-4" aria-hidden="true" />
            Новий контест
          </button>}
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "live", "soon", "ended"] as const).map((item) => (
          <button type="button"
            key={item}
            onClick={() => { setFilter(item); setPage(1); }}
            aria-pressed={filter === item}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === item ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#112016]" : "text-[#617167] hover:bg-[#edf2ed] dark:text-[#a9b7ad] dark:hover:bg-white/[.06]"}`}
          >
            {item === "all" ? "Усі" : phaseCopy[item]}
          </button>
        ))}
        <button type="button" onClick={() => { setShowSaved((value) => !value); setPage(1); }} aria-pressed={showSaved} className={`rounded-full px-4 py-2 text-sm font-bold transition ${showSaved ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#112016]" : "text-[#617167] hover:bg-[#edf2ed] dark:text-[#a9b7ad] dark:hover:bg-white/[.06]"}`}>
          Збережені{favoriteIds.length ? ` · ${favoriteIds.length}` : ""}
        </button>
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">Пошук контестів</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7e8d82]" aria-hidden="true" />
          <input
            type="search"
            name="contest-search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Назва або опис…"
            className="w-full rounded-xl border border-[#1a2a1e]/10 bg-white py-2.5 pl-9 pr-3 text-sm text-[#1e2d22] outline-none transition placeholder:text-[#94a097] focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#edf3ef]"
          />
        </label>
        <label className="sr-only" htmlFor="contest-sort">Сортування контестів</label>
        <select
          id="contest-sort"
          name="contest-sort"
          value={sort}
          onChange={(event) => { setSort(event.target.value as NonNullable<ContestListQuery["sort"]>); setPage(1); }}
          className="rounded-xl border border-[#1a2a1e]/10 bg-white px-3 py-2.5 text-sm font-semibold text-[#344338] outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#dce7df]"
        >
          <option value="newest">Найновіші</option>
          <option value="soonest">Найближчий старт</option>
          <option value="title">За назвою</option>
        </select>
        <label className="sr-only" htmlFor="contest-difficulty">Рівень складності</label>
        <select id="contest-difficulty" name="contest-difficulty" value={difficulty} onChange={(event) => { setDifficulty(event.target.value as typeof difficulty); setPage(1); }} className="rounded-xl border border-[#1a2a1e]/10 bg-white px-3 py-2.5 text-sm font-semibold text-[#344338] outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#111b14] dark:text-[#dce7df]">
          <option value="all">Будь-який рівень</option>
          <option value="EASY">Початковий</option>
          <option value="MEDIUM">Середній</option>
          <option value="HARD">Складний</option>
        </select>
        <span className="text-xs font-semibold tabular-nums text-[#718075] dark:text-[#a9b7ad]">{total} контестів</span>
        <button type="button"
          onClick={() => void refresh()}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[#65756a] hover:bg-[#edf2ed] dark:text-[#a9b7ad] dark:hover:bg-white/[.06]"
          aria-label="Оновити контести"
        >
          <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {message && (
        <div className="mb-5" aria-live="polite">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-5" role="alert" aria-live="polite">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((key) => (
            <div
              key={key}
              className="h-[270px] animate-pulse rounded-[24px] bg-[#e8eeea] dark:bg-white/[.05]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-[#1a2a1e]/15 px-6 py-20 text-center dark:border-white/10">
          <Trophy className="mx-auto mb-4 h-8 w-8 text-[#ff9b2e]" />
          <h2 className="text-xl font-bold">{showSaved ? "Ще немає збережених контестів" : search || difficulty !== "all" ? "Нічого не знайшлося" : "Тут поки тихо"}</h2>
          <p className="mx-auto mt-2 max-w-md text-base leading-7 text-[#68786e] dark:text-[#a6b4aa]">
            {showSaved ? "Познач контест закладкою — і він з’явиться тут." : search || difficulty !== "all" ? "Спробуй змінити запит або фільтри." : "Створи перший контест або зайди за кодом від викладача."}
          </p>
        </div>
      ) : (
        <>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const state = phaseFor(item);
            return (
              <article
                key={item.id}
                className="group relative flex min-h-[350px] flex-col overflow-hidden rounded-[24px] border border-[#1a2a1e]/10 bg-white shadow-[0_16px_45px_rgba(28,44,32,.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(28,44,32,.11)] dark:border-white/[.09] dark:bg-[#111b14] dark:shadow-none"
              >
                <div className="relative h-[112px] shrink-0 overflow-hidden bg-[#183a28]">
                  {item.bannerImageUrl ? <img src={item.bannerImageUrl} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover object-center transition duration-500 group-hover:scale-[1.03]" /> : <div className="absolute inset-0" style={{ background: CONTEST_BANNER_THEMES[contestTheme(item.bannerTheme)].background }} />}
                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#08160d]/55 via-[#08160d]/15 to-transparent" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`max-w-[45%] truncate rounded-full px-3 py-1.5 text-xs font-bold ${phaseStyle[state]}`}>
                      {item.isPublished ? phaseCopy[state] : "Чернетка"}
                    </span>
                    <span className="min-w-0 truncate rounded-full bg-[#f1f5f1] px-3 py-1.5 text-xs font-semibold text-[#627168] dark:bg-white/[.06] dark:text-[#b5c1b8]">
                      {item.visibility === "PRIVATE_CODE" ? "За кодом" : item.visibility === "CLASS" ? "Для класу" : "Відкритий"}
                    </span>
                    <button type="button" onClick={() => toggleFavorite(item.id)} aria-label={favoriteIds.includes(item.id) ? `Прибрати ${item.title} зі збережених` : `Зберегти ${item.title}`} aria-pressed={favoriteIds.includes(item.id)} className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-[#748277] transition hover:bg-[#edf3ed] hover:text-[#17834d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#a9b7ad] dark:hover:bg-white/[.08] dark:hover:text-[#72edb0]">
                      <Bookmark className={`size-4 ${favoriteIds.includes(item.id) ? "fill-current text-[#16834d] dark:text-[#72edb0]" : ""}`} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-4 flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[#1a2a1e]/10 bg-[#edf4ee] text-2xl dark:border-white/10 dark:bg-white/[.07]">
                      {item.iconImageUrl ? <img src={item.iconImageUrl} alt="" className="size-full object-cover" /> : item.icon || "🏆"}
                    </span>
                    <h2 className="line-clamp-2 min-w-0 font-[family-name:var(--font-display)] text-xl font-bold leading-tight tracking-[-.035em] text-[#162219] dark:text-[#f0f5f1]">
                      {item.title}
                    </h2>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#68786e] dark:text-[#aab8ae]">
                    {item.description || "Умови й задачі вже чекають на старті."}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {item.difficulty && <span className="rounded-full bg-[#edf4ee] px-2.5 py-1 text-[11px] font-bold text-[#3b5944] dark:bg-white/[.07] dark:text-[#b8c8bc]">{{ EASY: "Початковий", MEDIUM: "Середній", HARD: "Складний" }[item.difficulty]}</span>}
                    {item.participantAccessMode === "ISSUED_ACCOUNTS" && <span className="inline-flex items-center gap-1 rounded-full bg-[#fff2dc] px-2.5 py-1 text-[11px] font-bold text-[#8a5100] dark:bg-[#ffb547]/10 dark:text-[#ffcc83]"><KeyRound aria-hidden="true" className="size-3" />Тимчасовий доступ</span>}
                    {item.scoreboardVisibility === "AFTER_END" && <span className="rounded-full bg-[#f1f0ff] px-2.5 py-1 text-[11px] font-bold text-[#594d9c] dark:bg-[#9c8cff]/10 dark:text-[#c5baff]">Таблиця після фінішу</span>}
                    {(item.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="max-w-full truncate rounded-full bg-[#f1f5f1] px-2.5 py-1 text-[11px] font-semibold text-[#627168] dark:bg-white/[.05] dark:text-[#aebbb2]">{tag}</span>)}
                  </div>

                  <div className="mt-auto flex min-w-0 items-center gap-4 border-t border-[#19291d]/8 pt-4 dark:border-white/[.08]">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-[#64746a] dark:text-[#a6b4aa]">
                      <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{state === "ended" ? "Фінішував" : date(state === "soon" ? item.startsAt : item.endsAt)}</span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-[#718075] dark:text-[#a6b4aa]">
                      <UsersRound className="size-3.5" aria-hidden="true" /> {item.participantsCount}
                    </span>
                    <button type="button"
                      onClick={() => navigate(`/contest/contests/${item.id}`)}
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eff4ef] text-[#183422] transition group-hover:bg-[#153321] group-hover:text-white dark:bg-white/[.07] dark:text-[#e7f0e9] dark:group-hover:bg-[#00d978] dark:group-hover:text-[#062211]"
                      aria-label={`Відкрити ${item.title}`}
                    >
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {totalPages > 1 && <nav className="mt-7 flex items-center justify-center gap-3" aria-label="Сторінки контестів">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-[#1a2a1e]/10 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-white/10">Назад</button>
          <span className="min-w-24 text-center text-sm font-semibold tabular-nums text-[#617167] dark:text-[#a9b7ad]">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl border border-[#1a2a1e]/10 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-white/10">Далі</button>
        </nav>}
        </>
      )}
      {joinOpen && (
        <div data-material="contest-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/50 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJoinOpen(false); }}>
          <form onSubmit={submitCode} role="dialog" aria-modal="true" aria-labelledby="contest-join-title" className="w-full max-w-[440px] rounded-[26px] border border-white/55 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">Доступ</p><h2 id="contest-join-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">Приєднатися до контесту</h2></div>
              <button type="button" onClick={() => { setJoinOpen(false); setError(null); }} aria-label="Закрити вікно" className="grid size-9 shrink-0 place-items-center rounded-xl text-[#68786e] transition hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:hover:bg-white/[.06]"><span aria-hidden="true" className="text-xl">×</span></button>
            </div>
            <label htmlFor="contest-access-code" className="block text-sm font-bold">Код доступу
              <input id="contest-access-code" name="code" autoComplete="off" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 w-full rounded-xl border border-[#18271c]/14 bg-white px-4 py-3 font-mono text-base uppercase tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:bg-[#0d1510]" placeholder="Наприклад, CLASS-24…" />
            </label>
            {error && <p role="alert" aria-live="polite" className="mt-3 rounded-xl bg-[#fff1ef] px-3 py-2 text-sm font-semibold text-[#a93232] dark:bg-[#451d1a] dark:text-[#ffb0a6]">{error}</p>}
            <button type="submit" disabled={joinBusy || !code.trim()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 text-sm font-bold text-[#072514] transition hover:bg-[#00ff88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] disabled:cursor-wait disabled:opacity-60">
              {joinBusy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="size-4" />}{joinBusy ? "Приєднання…" : "Приєднатися"}
            </button>
          </form>
        </div>
      )}
      {createOpen && <ContestSetupDialog scope={favoriteScope} onClose={() => setCreateOpen(false)} onCreated={(createdId, openAccounts) => navigate(openAccounts ? `/contest/contests/${createdId}?setup=accounts` : `/contest/contests/${createdId}`)} />}
    </Shell>
  );
};

export const ContestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const contestId = Number(id);
  const requestedTab = searchParams.get("tab");
  const sectionSearch = searchParams.toString();
  const hasLegacySection = ["problems", "standings", "community", "accounts", "participants", "certificates", "management"].includes(requestedTab ?? "");
  const [data, setData] = React.useState<ContestDetails | null>(null);
  const [standings, setStandings] = React.useState<ContestStandings | null>(
    null,
  );
  const [myProgress, setMyProgress] = React.useState<ContestMyProgressProblem[]>([]);
  const [myParticipantId, setMyParticipantId] = React.useState<number | null>(null);
  const [clockNow, setClockNow] = React.useState(Date.now());
  const [loading, setLoading] = React.useState(true);
  const [joining, setJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!hasLegacySection || !Number.isFinite(contestId) || contestId <= 0) return;
    const query = new URLSearchParams(sectionSearch);
    if (requestedTab === "standings") {
      query.delete("tab");
      const search = query.toString();
      navigate(`/contest/contests/${contestId}/scoreboard${search ? `?${search}` : ""}`, { replace: true });
      return;
    }
    navigate(`/contest/contests/${contestId}/manage?${query.toString()}`, { replace: true });
  }, [contestId, hasLegacySection, navigate, requestedTab, sectionSearch]);
  React.useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const load = React.useCallback(async () => {
    if (!Number.isFinite(contestId)) return;
    setLoading(true);
    setError(null);
    try {
      const [details, score] = await Promise.all([
        getContestDetails(contestId),
        getContestScoreboard(contestId).catch(() => null),
      ]);
      const progress = details.access.canManage && !details.access.isJoined
        ? null
        : await getContestMyProgress(contestId).catch(() => null);
      setData(details);
      setStandings(score);
      setMyProgress(progress?.problems ?? []);
      setMyParticipantId(progress?.participantId ?? null);
    } catch (caught) {
      if (isPreview()) {
        setData(previewDetails(contestId));
        setStandings(previewStandings);
        setMyProgress([]);
        setMyParticipantId(null);
      } else
        setError(
          getErrorMessageFromUnknown(caught, "Не вдалося відкрити контест."),
        );
    } finally {
      setLoading(false);
    }
  }, [contestId]);
  React.useEffect(() => {
    if (!hasLegacySection) void load();
  }, [hasLegacySection, load]);
  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      await joinContest(contestId);
      await load();
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, "Не вдалося приєднатися."));
    } finally {
      setJoining(false);
    }
  };
  if (loading)
    return (
      <Shell eyebrow="Contest" title="Відкриваємо контест">
        <div className="h-[480px] animate-pulse rounded-[30px] bg-[#e8eeea] dark:bg-white/[.05]" />
      </Shell>
    );
  if (!data)
    return (
      <Shell eyebrow="Contest" title="Контест недоступний">
        <Notice tone="error">{error || "Такого контесту не знайдено."}</Notice>
        <button type="button"
          onClick={() => navigate("/contest/contests")}
          className="mt-5 font-bold text-[#16834d]"
        >
          До списку контестів
        </button>
      </Shell>
    );
  const state = phaseFor(data.contest);
  const joined = data.access.isJoined;
  const access = data.access.canAccessContent;
  const clockOffset = Date.parse(data.serverTime) - Date.now();
  const startMs = data.contest.startsAt ? Date.parse(data.contest.startsAt) : null;
  const startsIn = startMs == null ? null : startMs - (clockNow + clockOffset);
  const endMs = data.contest.endsAt ? Date.parse(data.contest.endsAt) : null;
  const endsIn = endMs == null ? null : endMs - (clockNow + clockOffset);
  const progressByProblem = new Map(myProgress.map((item) => [item.problemId, item]));
  const hasCompletedContest = state === "ended";
  const officialStanding = standings?.rows.find((row) => row.participantId === myParticipantId);
  const canManage = Boolean(data.access.canManage);
  const shouldSetUpAccounts = canManage && searchParams.get("setup") === "accounts";
  return (
    <Shell
      eyebrow={
        state === "live"
          ? "Зараз у грі"
          : state === "soon"
            ? "Наступний старт"
            : "Архів контесту"
      }
      title={data.contest.title}
      aside={<div className="flex flex-wrap gap-2">
        {(access || canManage) && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/scoreboard`)} className="inline-flex items-center gap-2 rounded-xl border border-[#1a2a1e]/10 px-3 py-2 text-sm font-bold text-[#65756a] hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:text-[#aab8ad] dark:hover:bg-white/[.06]">
          <Trophy className="h-4 w-4" aria-hidden="true" /> Таблиця
        </button>}
        {canManage && data.contest.participantAccessMode === "ISSUED_ACCOUNTS" && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=accounts`)} className="inline-flex items-center gap-2 rounded-xl border border-[#1a2a1e]/10 px-3 py-2 text-sm font-bold text-[#65756a] hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:border-white/10 dark:text-[#aab8ad] dark:hover:bg-white/[.06]">
          <KeyRound className="h-4 w-4" aria-hidden="true" /> Акаунти
        </button>}
        {canManage && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=management`)} className="inline-flex items-center gap-2 rounded-xl bg-[#153321] px-3 py-2 text-sm font-bold text-white hover:bg-[#214a31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:bg-[#00d978] dark:text-[#062211]">
          <FileCode2 className="h-4 w-4" aria-hidden="true" /> Налаштувати
        </button>}
        <button type="button" onClick={() => navigate("/contest/contests")} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#65756a] hover:bg-[#edf2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:text-[#aab8ad] dark:hover:bg-white/[.06]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Усі контести
        </button>
      </div>}
    >
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <section className="relative isolate overflow-hidden rounded-[30px] border border-white/[.08] px-6 py-7 text-white shadow-[0_28px_70px_-48px_rgba(0,0,0,.8)] sm:px-9 sm:py-9" style={{ background: data.contest.bannerImageUrl ? "#0b1b12" : CONTEST_BANNER_THEMES[contestTheme(data.contest.bannerTheme)].background }}>
        {data.contest.bannerImageUrl ? <img src={data.contest.bannerImageUrl} alt="" aria-hidden="true" width={1600} height={600} className="absolute inset-0 -z-20 size-full object-cover object-center" /> : null}
        <div aria-hidden="true" className={`absolute inset-0 -z-10 ${data.contest.bannerImageUrl ? "bg-gradient-to-r from-[#07150c]/95 via-[#0a1b11]/85 to-[#0a1b11]/55" : "bg-[#07150c]/25"}`} />
        <div aria-hidden="true" className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full blur-3xl" style={{ background: CONTEST_BANNER_THEMES[contestTheme(data.contest.bannerTheme)].glow }} />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          <div>
            <div className="mb-4 flex items-center gap-3"><span className="grid size-14 place-items-center rounded-2xl bg-white/[.12] text-3xl shadow-inner" aria-hidden="true">{data.contest.iconImageUrl ? <img src={data.contest.iconImageUrl} alt="" className="size-10 rounded-xl border border-white/25 object-cover" /> : data.contest.icon || "🏆"}</span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/65">StudyCod Contests</p>{data.contest.participantAccessMode === "ISSUED_ACCOUNTS" && <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90"><KeyRound className="size-3.5" aria-hidden="true" />Тимчасові акаунти</span>}</div></div>
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold text-[#baf9d4]">
                {phaseCopy[state]}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                {data.contest.scoringMode || "IOI"} scoring
              </span>
              {data.contest.difficulty && <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">{{ EASY: "Початковий", MEDIUM: "Середній", HARD: "Складний" }[data.contest.difficulty]}</span>}
              {data.access.isPaused && <span className="rounded-full bg-[#ffb547]/15 px-3 py-1.5 text-xs font-bold text-[#ffd18a]">На паузі</span>}
            </div>
            {data.contest.tags.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{data.contest.tags.map((tag) => <span key={tag} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-[#c6d7cc]">{tag}</span>)}</div>}
            {startsIn != null && startsIn > 0 ? <div className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] px-4 py-3">
              <Clock3 className="h-5 w-5 text-[#8cf0b7]" aria-hidden="true" />
              <span><span className="block text-[10px] font-bold uppercase tracking-[.13em] text-[#a9c4b2]">Старт через</span><span className="mt-0.5 block font-mono text-xl font-extrabold tabular-nums">{formatCountdown(startsIn)}</span></span>
            </div> : endsIn != null && endsIn > 0 ? <div className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] px-4 py-3">
              <Clock3 className="h-5 w-5 text-[#8cf0b7]" aria-hidden="true" />
              <span><span className="block text-[10px] font-bold uppercase tracking-[.13em] text-[#a9c4b2]">До фінішу</span><span className="mt-0.5 block font-mono text-xl font-extrabold tabular-nums">{formatCountdown(endsIn)}</span></span>
            </div> : null}
            <p className="max-w-2xl text-base leading-7 text-[#c6d7cc]">
              {data.contest.description ||
                "Задачі зібрані в один короткий, чесний маршрут."}
            </p>
            {!access && data.access.accountRequired ? (
              <div className="mt-7 inline-flex max-w-lg items-start gap-3 rounded-2xl border border-white/15 bg-white/[.09] px-4 py-3 text-sm leading-6 text-[#e1f0e6]"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#aef0c9]" /><span><span className="block font-bold text-white">Потрібен виданий акаунт</span>Для участі звернись до організатора. Він надасть окремий логін і пароль.</span></div>
            ) : !access ? (
              <button type="button"
                disabled={joining}
                onClick={() => void join()}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-5 py-3 text-sm font-bold text-[#062211] transition hover:bg-[#00ff88] disabled:opacity-60"
              >
                {joining ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UsersRound className="h-4 w-4" />
                )}
                Приєднатися
              </button>
            ) : joined ? (
              <div className="mt-7 flex items-center gap-2 text-sm font-bold text-[#aef0c9]">
                <Check className="h-4 w-4" />
                Ти зареєстрований на контест
              </div>
            ) : canManage ? (
              <div className="mt-7 flex items-center gap-2 text-sm font-bold text-[#aef0c9]"><Check className="h-4 w-4" />Ти організатор цього контесту</div>
            ) : (
              <button type="button" disabled={joining} onClick={() => void join()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-5 py-3 text-sm font-bold text-[#062211] transition hover:bg-[#00ff88] disabled:opacity-60">
                {joining ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                Зареєструватися
              </button>
            )}
            {data.contest.startsAt && <button type="button" onClick={() => downloadContestCalendar(data.contest)} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-[#d6e8dc] transition hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d978]">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> Додати в календар
            </button>}
            {officialStanding && <p className="mt-4 text-sm font-semibold text-[#a9cbb5]">Твоє місце: <span className="font-extrabold text-white">#{officialStanding.rank}</span> · {officialStanding.totalScore} балів</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 self-end sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[.11] bg-[#06150d]/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">
                Фініш
              </p>
              <p className="mt-2 text-sm font-bold">
                {date(data.contest.endsAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.11] bg-[#06150d]/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">
                Задачі
              </p>
              <p className="mt-2 text-2xl font-bold tracking-[-.04em]">
                {data.problems.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.11] bg-[#06150d]/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">Учасники</p>
              <p className="mt-2 text-2xl font-bold tracking-[-.04em] tabular-nums">{data.participantsCount}</p>
            </div>
          </div>
        </div>
      </section>
      {shouldSetUpAccounts && <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-[#00c875]/25 bg-[#eaf8ef] p-4 dark:bg-[#00d978]/[.07] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#d8f2e2] text-[#16834d] dark:bg-[#00d978]/15 dark:text-[#72edb0]"><KeyRound className="size-5" aria-hidden="true" /></span>
          <div><p className="font-bold text-[#183422] dark:text-[#e5eee7]">Чернетку контесту створено</p><p className="mt-1 text-sm leading-6 text-[#52675a] dark:text-[#aebdb2]">Додай список учасників, щоб згенерувати для них окремі акаунти. До цього розділу можна повернутися будь-коли.</p></div>
        </div>
        <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=accounts`)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-2.5 text-sm font-bold text-[#062211] transition hover:bg-[#00ff88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16834d]">
          <UsersRound className="size-4" aria-hidden="true" /> Додати учасників
        </button>
      </section>}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.32fr_.68fr]">
        <section className="rounded-[28px] border border-[#19291d]/10 bg-white p-5 shadow-[0_18px_50px_-44px_rgba(16,41,24,.65)] dark:border-white/[.09] dark:bg-[#111b14] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                Задачі
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                Твій маршрут
              </h2>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#f0f5f0] px-3 py-2 text-sm font-bold tabular-nums text-[#526257] dark:bg-white/[.06] dark:text-[#c2d0c6]"><FileCode2 className="h-4 w-4 text-[#16834d] dark:text-[#72edb0]" aria-hidden="true" />{data.problems.length}</span>
          </div>
          <div className="space-y-2.5">
            {data.problems.map((problem) => {
              const progress = progressByProblem.get(problem.id);
              const score = progress?.bestContestScore ?? 0;
              const maxScore = progress?.maxScore ?? problem.points ?? 100;
              const scorePercent = progress && maxScore > 0 ? Math.max(0, Math.min(100, (score / maxScore) * 100)) : 0;
              const solved = Boolean(progress && scorePercent >= 100);
              return <button type="button"
                key={problem.id}
                disabled={!access}
                onClick={() =>
                  navigate(
                    `/contest/contests/${contestId}/problems/${problem.id}`,
                  )
                }
                className="group flex w-full items-center gap-3 rounded-2xl border border-[#17271c]/[.08] bg-[#f8faf8] px-3 py-3.5 text-left transition duration-200 hover:-translate-y-px hover:border-[#16834d]/25 hover:bg-[#f1f7f2] hover:shadow-[0_12px_26px_-22px_rgba(15,64,34,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] disabled:cursor-not-allowed disabled:opacity-55 dark:border-white/[.08] dark:bg-white/[.025] dark:hover:border-[#00d978]/25 dark:hover:bg-white/[.05]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#16834d]/10 bg-[#e8f5ec] font-[family-name:var(--font-display)] text-base font-black text-[#147b47] shadow-sm dark:border-[#00d978]/15 dark:bg-[#00d978]/10 dark:text-[#72edb0]">
                  {problem.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-bold leading-5 text-[#1a271e] dark:text-[#edf3ef]">
                    {problem.title}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#637368] dark:text-[#aab8ae]">
                    {progress ? <><span className="tabular-nums">Найкращий результат: <strong className="font-bold text-[#263b2d] dark:text-[#e4eee7]">{score}{progress.maxScore != null ? ` / ${progress.maxScore}` : ""}</strong></span>{maxScore > 0 && <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-[#dfe8e1] dark:bg-white/10"><span className="block h-full rounded-full bg-[#00b963]" style={{ width: `${scorePercent}%` }} /></span>}</> : <span>До {problem.points ?? 100} балів</span>}
                  </span>
                </span>
                {hasCompletedContest && data.contest.allowUpsolve ? <span className="shrink-0 rounded-lg border border-[#ffb454]/20 bg-[#fff4df] px-2.5 py-1.5 text-xs font-bold text-[#895000] dark:bg-[#ffb454]/10 dark:text-[#ffca7e]">Дорішати</span> : solved ? <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-[#e7f7ed] px-2.5 py-1.5 text-xs font-bold text-[#147b47] sm:inline-flex dark:bg-[#00d978]/10 dark:text-[#72edb0]"><Check className="size-3.5" aria-hidden="true" />Готово</span> : <span className="hidden shrink-0 rounded-lg bg-[#edf1ed] px-2.5 py-1.5 text-xs font-bold text-[#657368] sm:inline-flex dark:bg-white/[.06] dark:text-[#aab8ae]">Відкрити</span>}
                <ChevronRight className="size-5 shrink-0 text-[#9aa79e] transition-transform group-hover:translate-x-0.5 group-hover:text-[#16834d] dark:group-hover:text-[#72edb0]" aria-hidden="true" />
              </button>;
            })}
            {data.problems.length === 0 && <p className="rounded-xl border border-dashed border-[#17271c]/15 px-4 py-6 text-center text-sm text-[#708075] dark:border-white/10 dark:text-[#a5b3a8]">Задачі ще не додано.</p>}
          </div>
        </section>
        <section className="rounded-[28px] border border-[#19291d]/10 bg-[#fafbf9] p-5 dark:border-white/[.09] dark:bg-[#101913] sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                Таблиця
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                Топ зараз
              </h2>
            </div>
            <Crown className="h-5 w-5 text-[#ff9b2e]" />
          </div>
          {standings?.hidden ? (
            <p className="mt-5 rounded-xl bg-[#f1f5f1] px-3 py-3 text-sm leading-6 text-[#708075] dark:bg-white/[.05] dark:text-[#a5b3a8]">{standings.hiddenReason === "ORGANIZERS_ONLY" ? "Таблиця доступна організаторам." : standings.releaseAt ? `Таблиця відкриється після фінішу: ${date(standings.releaseAt)}.` : "Таблиця відкриється після завершення контесту."}</p>
          ) : data.access.accountRequired ? (
            <p className="mt-5 rounded-xl bg-[#f1f5f1] px-3 py-3 text-sm leading-6 text-[#708075] dark:bg-white/[.05] dark:text-[#a5b3a8]">Для перегляду таблиці ввійди в акаунт, виданий організатором для цього контесту.</p>
          ) : standings?.rows.length ? (
            <div className="mt-5 space-y-2">
              {standings.rows.slice(0, 5).map((row) => (
                <div
                  key={row.participantId}
                  className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 ${row.rank === 1 ? "border-[#e8b84c]/25 bg-[#fff8e8] dark:border-[#ffd66e]/15 dark:bg-[#ffd66e]/[.06]" : "border-[#17271c]/[.07] bg-white dark:border-white/[.06] dark:bg-white/[.025]"}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums ${row.rank === 1 ? "bg-[#f3d98e]/50 text-[#805600] dark:bg-[#ffd66e]/10 dark:text-[#ffd66e]" : "bg-[#eef2ee] text-[#718075] dark:bg-white/[.06] dark:text-[#aab8ae]"}`}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#24352a] dark:text-[#e5eee7]">
                    {row.displayName}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-[#16834d] dark:text-[#72edb0]">
                    {row.totalScore}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-[#708075] dark:text-[#a5b3a8]">
              Рейтинг з'явиться після перших посилань.
            </p>
          )}
          {(access || canManage) && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/scoreboard`)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#edf4ee] px-4 py-2.5 text-sm font-bold text-[#183422] transition hover:bg-[#e2eee4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00c875] dark:bg-white/[.07] dark:text-[#e7f0e9] dark:hover:bg-white/[.1]">
            Повна таблиця <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>}
        </section>
      </div>
    </Shell>
  );
};

const previewStatement: ContestProblemStatement = {
  problem: { id: 501, order: 1, label: "A" },
  task: {
    id: 41,
    title: "Тиха перестановка",
    description:
      "Дано послідовність цілих чисел. Виведіть її у зворотному порядку.\n\nУ першому рядку задано n, у другому — n чисел. Виведіть числа через пробіл.",
    template:
      "n = int(input())\nnums = list(map(int, input().split()))\n# your solution\n",
    templatesByLanguage: null,
    allowedLanguages: ["python", "java", "cpp"],
    timeLimitMs: 1000,
    memoryLimitMb: 64,
    outputLimitKb: 64,
    checkerSpec: null,
  },
};

export const ContestProblemPage: React.FC = () => {
  const { id, problemId } = useParams<{ id: string; problemId: string }>();
  const navigate = useNavigate();
  const contestId = Number(id);
  const numericProblemId = Number(problemId);
  const [statement, setStatement] =
    React.useState<ContestProblemStatement | null>(null);
  const [code, setCode] = React.useState("");
  const [input, setInput] = React.useState("");
  const [language, setLanguage] = React.useState<JudgeLanguage>("python");
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [, setResult] = React.useState<{
    kind: "run" | "check";
    text: string;
    good: boolean;
  } | null>(null);
  const [ideRunResult, setIdeRunResult] = React.useState<StudyCodIdeRunResult | null>(null);
  const [ideCheckResult, setIdeCheckResult] = React.useState<StudyCodIdeCheckResult | null>(null);
  const [submissions, setSubmissions] = React.useState<
    Array<{
      id: number;
      verdict: string | null;
      score: number | null;
      createdAt: string | null;
    }>
  >([]);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    if (!Number.isFinite(contestId) || !Number.isFinite(numericProblemId))
      return;
    setLoading(true);
    setError(null);
    try {
      const [data, history] = await Promise.all([
        getContestProblemStatement(contestId, numericProblemId),
        getContestProblemSubmissions(contestId, numericProblemId).catch(
          () => null,
        ),
      ]);
      setStatement(data);
      const languages = data.task.allowedLanguages.length
        ? data.task.allowedLanguages
        : enabledJudgeLanguages();
      const next = languages.includes("python") ? "python" : languages[0];
      setLanguage(next);
      const templates = data.task.templatesByLanguage;
      setCode((templates?.[next] || data.task.template || "").trimStart());
      setSubmissions(history?.submissions ?? []);
    } catch (caught) {
      if (isPreview()) {
        setStatement(previewStatement);
        setCode(previewStatement.task.template);
        setSubmissions([
          {
            id: 1,
            verdict: "AC",
            score: 100,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else
        setError(
          getErrorMessageFromUnknown(caught, "Не вдалося відкрити задачу."),
        );
    } finally {
      setLoading(false);
    }
  }, [contestId, numericProblemId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  const switchLanguage = (next: JudgeLanguage) => {
    setLanguage(next);
    if (statement)
      setCode(
        (
          statement.task.templatesByLanguage?.[next] ||
          statement.task.template ||
          ""
        ).trimStart(),
      );
  };
  const run = async () => {
    if (!statement) return;
    setRunning(true);
    setResult(null);
    try {
      const response = await runContestProblem({
        contestId,
        problemId: numericProblemId,
        language,
        code,
        input,
      });
      setIdeRunResult(response);
      setResult({
        kind: "run",
        good: response.success,
        text:
          response.stdout ||
          response.stderr ||
          `${response.verdict || "Готово"} · ${response.timeMs ?? 0} ms`,
      });
    } catch (caught) {
      setResult({
        kind: "run",
        good: false,
        text: getErrorMessageFromUnknown(caught, "Запуск не вдався."),
      });
    } finally {
      setRunning(false);
    }
  };
  const check = async () => {
    if (!statement) return;
    setChecking(true);
    setResult(null);
    try {
      const response = await checkContestProblem({
        contestId,
        problemId: numericProblemId,
        language,
        code,
      });
      setIdeCheckResult({
        verdict: response.verdict,
        testsPassed: response.testsPassed,
        testsTotal: response.testsTotal,
        score: response.score,
        maxScore: response.maxScore,
        compileError: response.compileError,
        publicTestResults: response.firstFailure ? [{
          testId: response.firstFailure.index,
          input: response.firstFailure.input,
          expectedOutput: response.firstFailure.expected,
          actualOutput: response.firstFailure.actual,
          passed: false,
          verdict: response.firstFailure.verdict,
          stderr: response.firstFailure.stderr,
        }] : [],
      });
      setResult({
        kind: "check",
        good: response.verdict === "AC",
        text: `${response.verdict || "Готово"} · ${response.testsPassed}/${response.testsTotal} тестів · ${response.score}/${response.maxScore}`,
      });
      const history = await getContestProblemSubmissions(
        contestId,
        numericProblemId,
      ).catch(() => null);
      setSubmissions(history?.submissions ?? submissions);
    } catch (caught) {
      setResult({
        kind: "check",
        good: false,
        text: getErrorMessageFromUnknown(caught, "Перевірка не вдалася."),
      });
    } finally {
      setChecking(false);
    }
  };
  if (loading)
    return (
      <Shell eyebrow="Задача" title="Готуємо умову">
        <div className="h-[560px] animate-pulse rounded-[30px] bg-[#e8eeea] dark:bg-white/[.05]" />
      </Shell>
    );
  if (!statement)
    return (
      <Shell eyebrow="Задача" title="Не вдалося відкрити">
        <Notice tone="error">{error || "Задача недоступна."}</Notice>
      </Shell>
    );
  const contestEntryFile = language === "java" ? "Main.java" : language === "python" ? "main.py" : "main.cpp";
  return <StudyCodIDEWorkspace
    task={{ id: statement.task.id, title: statement.task.title, description: statement.task.description, section: `Contest · ${statement.problem.label}` }}
    theory={null}
    language={language}
    onLanguageChange={switchLanguage}
    compiler={language}
    onCompilerChange={() => undefined}
    code={code}
    onCodeChange={setCode}
    files={[{ path: contestEntryFile, content: code }]}
    onFilesChange={(next) => setCode(next[0]?.content || "")}
    useFiles={false}
    onEnableFiles={() => undefined}
    entryFile={contestEntryFile}
    stdin={input}
    onStdinChange={setInput}
    firstExampleInput={undefined}
    onUseExampleInput={() => undefined}
    running={running}
    checking={checking}
    onRun={() => void run()}
    onCheck={() => void check()}
    onSave={() => undefined}
    onReset={() => setCode(statement.task.templatesByLanguage?.[language] || statement.task.template || "")}
    onBack={() => navigate(`/contest/contests/${contestId}`)}
    disableAiAssistance
    runResult={ideRunResult}
    checkResult={ideCheckResult}
  />;
  /* Legacy contest canvas retained below for reference; the shared IDE is the live renderer.
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button type="button"
          onClick={() => navigate(`/contest/contests/${contestId}`)}
          className="inline-flex items-center gap-2 text-sm font-bold text-[#64756a] hover:text-[#1b3324] dark:text-[#abb9af] dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          До задач
        </button>
        <span className="rounded-full bg-[#fff0d7] px-3 py-1.5 text-xs font-bold text-[#a75c00] dark:bg-[#ff8c00]/12 dark:text-[#ffb760]">
          {statement.task.timeLimitMs ?? 1000} ms ·{" "}
          {statement.task.memoryLimitMb ?? 64} MB
        </span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,.76fr)_minmax(480px,1.24fr)]">
        <section className="rounded-[26px] border border-[#19291d]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111b14] xl:min-h-[calc(100dvh-145px)]">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8f7ed] font-[family-name:var(--font-display)] text-lg font-bold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
              {statement.problem.label}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                Задача {statement.problem.order}
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] text-[#17241b] dark:text-[#f0f5f1]">
                {statement.task.title}
              </h1>
            </div>
          </div>
          <div className="mt-7 whitespace-pre-wrap text-[15px] leading-7 text-[#44554a] dark:text-[#c2cec5]">
            {statement.task.description}
          </div>
          <div className="mt-9 border-t border-[#19291d]/10 pt-5 dark:border-white/[.08]">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#708075]" />
              <h2 className="font-bold">Останні посилання</h2>
            </div>
            {submissions.length ? (
              <div className="space-y-2">
                {submissions.slice(0, 5).map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between rounded-xl bg-[#f3f6f3] px-3 py-2.5 text-sm dark:bg-white/[.045]"
                  >
                    <span className="font-semibold text-[#596a5f] dark:text-[#b5c2b8]">
                      {submission.createdAt
                        ? date(submission.createdAt)
                        : "Щойно"}
                    </span>
                    <span
                      className={
                        submission.verdict === "AC"
                          ? "font-extrabold text-[#16834d] dark:text-[#72edb0]"
                          : "font-extrabold text-[#c65072] dark:text-[#ff9abd]"
                      }
                    >
                      {submission.verdict || "—"}{" "}
                      {submission.score != null ? `· ${submission.score}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-[#718075] dark:text-[#a4b2a7]">
                Тут з'явиться історія після першого запуску на перевірку.
              </p>
            )}
          </div>
        </section>
        <section className="overflow-hidden rounded-[26px] border border-[#19291d]/10 bg-[#17211a] shadow-[0_18px_45px_rgba(13,27,18,.14)] dark:border-white/[.1]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#1d2a20] px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#edf5ef]">
              <Code2 className="h-4 w-4 text-[#72edb0]" />
              Рішення
            </div>
            <select
              value={language}
              onChange={(event) =>
                switchLanguage(event.target.value as JudgeLanguage)
              }
              className="rounded-lg border border-white/10 bg-[#101811] px-3 py-2 text-sm font-bold text-[#eaf2ec] outline-none"
            >
              {languages.map((item) => (
                <option key={item} value={item}>
                  {JUDGE_LANGUAGE_LABELS[item] || item}
                </option>
              ))}
            </select>
          </div>
          <textarea
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="h-[min(51dvh,620px)] w-full resize-none bg-[#17211a] p-5 font-mono text-[14px] leading-6 text-[#e6efe8] outline-none placeholder:text-[#819084]"
            placeholder="Напиши рішення тут…"
          />
          <div className="border-t border-white/10 bg-[#1a261d] p-4">
            <label className="block text-xs font-bold uppercase tracking-[.13em] text-[#a9b9ad]">
              Власний ввід
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="mt-2 h-20 w-full resize-none rounded-xl border border-white/10 bg-[#111a13] p-3 font-mono text-sm text-[#e8f0e9] outline-none focus:border-[#00ff88]/40"
                placeholder="Необов'язково: дані для Run"
              />
            </label>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <button type="button"
                disabled={running}
                onClick={() => void run()}
                className="inline-flex items-center gap-2 rounded-xl bg-white/[.08] px-4 py-2.5 text-sm font-bold text-[#e9f3eb] hover:bg-white/[.13] disabled:opacity-55"
              >
                {running ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Запустити
              </button>
              <button type="button"
                disabled={checking}
                onClick={() => void check()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#00d978] px-4 py-2.5 text-sm font-bold text-[#062211] hover:bg-[#00ff88] disabled:opacity-55"
              >
                {checking ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                На перевірку
              </button>
            </div>
            {result && (
              <div
                className={`mt-3 rounded-xl border px-3 py-3 font-mono text-sm ${result.good ? "border-[#00ff88]/25 bg-[#00ff88]/[.09] text-[#9effc9]" : "border-[#ff6b9d]/25 bg-[#ff6b9d]/[.08] text-[#ffb1c8]"}`}
              >
                <span className="mr-2 font-sans text-xs font-bold uppercase tracking-[.12em]">
                  {result.kind === "run" ? "Run" : "Judge"}
                </span>
                {result.text}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
  */
};
