import React from "react";
import { useTranslation } from "react-i18next";
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
  getContestLearningReview,
  getContestMyProgress,
  getContestProblemStatement,
  getContestProblemSubmissions,
  getContestScoreboard,
  joinContest,
  joinContestByCode,
  listContests,
  runContestProblem,
  type ContestDetails,
  type ContestLearningReview,
  type ContestListItem,
  type ContestListQuery,
  type ContestMyProgressProblem,
  type ContestProblemStatement,
  type ContestStandings,
  type JudgeLanguage,
} from "../../lib/api/contests";
import { enabledJudgeLanguages, templateForJudgeLanguage } from "../../lib/judgeLanguages";
import { contestFirstFailureToPublicTestResults } from "../../lib/contestFeedback";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
import { ContestSetupDialog } from "./ContestSetupDialog";
import { CONTEST_BANNER_THEMES, contestTheme } from "./contestBranding";
import { withDevPreview } from "../../lib/devPreview";
import { previewStandings } from "./contestPreviewData";
import { tr } from "../../i18n";
import "./ContestSectionNav.css";

const isPreview = () =>
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "true";
const date = (value: string | null | undefined) => {
  if (!value) return tr("Без дати", "No date");
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat(tr("uk-UA", "en-US"), {
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
const phaseCopy = (phase: "live" | "soon" | "ended") => phase === "live"
  ? tr("Триває", "Live")
  : phase === "soon" ? tr("Незабаром", "Coming soon") : tr("Завершено", "Ended");
const phaseStyle = {
  live: "bg-[var(--surface-primary)] text-text-muted dark:bg-primary/12 dark:text-primary-soft",
  soon: "bg-bg-hover text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn",
  ended: "bg-bg-hover text-text-muted dark:bg-white/[.07] dark:text-text-secondary",
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
    "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${title} ${tr("почнеться завтра", "starts tomorrow")}`, "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", `DESCRIPTION:${title} ${tr("почнеться за 15 хвилин", "starts in 15 minutes")}`, "END:VALARM",
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
    ? `${days}${tr(" д ", "d ")}${String(hours).padStart(2, "0")}${tr(" год ", "h ")}${String(minutes).padStart(2, "0")}${tr(" хв", "m")}`
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

function Notice({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "error" | "success";
}) {
  const styles =
    tone === "error"
      ? "border-accent-error/30 bg-accent-error/[.08] text-accent-error dark:text-accent-error"
      : tone === "success"
        ? "border-primary/25 bg-primary/[.08] text-text-muted dark:text-primary-soft"
        : "border-border/10 bg-bg-hover text-text-muted dark:border-white/[.08] dark:bg-white/[.045] dark:text-text-secondary";
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
  surface = "lobby",
}: {
  eyebrow: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  surface?: "lobby" | "detail";
}) {
  return (
    <div className={`contest-surface contest-surface--${surface} mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-6 lg:px-10 lg:py-12`}>
      <header className="contest-surface__heading mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="contest-surface__title-block">
          <p className="mb-3 text-xs font-bold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">
            {eyebrow}
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] text-text-primary dark:text-text-primary sm:text-5xl">
            {title}
          </h1>
        </div>
        {aside}
      </header>
      {children}
    </div>
  );
}

export const ContestLobbyPage: React.FC<{ canCreate?: boolean; canJoinPrivateByCode?: boolean; favoriteScope?: string }> = ({
  canCreate = true,
  canJoinPrivateByCode = true,
  favoriteScope = "guest",
}) => {
  useTranslation();
  const routerNavigate = useNavigate();
  const navigate = React.useCallback((path: string, options?: { replace?: boolean }) => routerNavigate(withDevPreview(path), options), [routerNavigate]);
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
        setMessage(tr("Демо-режим: показано сценарій контестів.", "Preview mode: showing sample contests."));
        return;
      }
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
        setMessage(tr("Демо-режим: показано сценарій контестів.", "Preview mode: showing sample contests."));
      } else
        setError(
          getErrorMessageFromUnknown(
            caught,
            tr("Не вдалося завантажити контести.", "Could not load contests."),
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
      navigate(withDevPreview(`/contest/contests/${isPreview() ? 102 : result.contestId}`));
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, tr("Не вдалося приєднатися за кодом.", "Could not join with this code.")),
      );
    } finally {
      setJoinBusy(false);
    }
  };
  return (
    <Shell
      eyebrow="StudyCod Contest"
      title={tr("Змагання, де видно хід думки", "Contests where you can show your thinking")}
      aside={
        <div className="flex flex-wrap gap-2">
          {canJoinPrivateByCode && <button type="button"
            onClick={() => setJoinOpen(true)}
            className="rounded-xl border border-border/12 px-4 py-2.5 text-sm font-bold text-text-primary transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:text-text-primary dark:hover:bg-white/[.06]"
          >
            <LockKeyhole className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {tr("Ввести код", "Enter code")}
          </button>}
          {canCreate && <button type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-[0_12px_28px_rgba(20,67,40,.2)] transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-primary dark:text-primary-foreground"
          >
            <Plus className="mr-2 inline h-4 w-4" aria-hidden="true" />
            {tr("Новий контест", "New contest")}
          </button>}
        </div>
      }
    >
      <div className="contest-lobby-filters mb-6 flex flex-wrap items-center gap-2">
        {(["all", "live", "soon", "ended"] as const).map((item) => (
          <button type="button"
            key={item}
            onClick={() => { setFilter(item); setPage(1); }}
            aria-pressed={filter === item}
            className={`contest-lobby-filter-chip rounded-full px-4 py-2 text-sm font-bold transition ${filter === item ? "bg-bg-base text-text-primary dark:bg-bg-hover dark:text-text-primary" : "text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.06]"}`}
          >
            {item === "all" ? tr("Усі", "All") : phaseCopy(item)}
          </button>
        ))}
        <button type="button" onClick={() => { setShowSaved((value) => !value); setPage(1); }} aria-pressed={showSaved} className={`contest-lobby-filter-chip rounded-full px-4 py-2 text-sm font-bold transition ${showSaved ? "bg-bg-base text-text-primary dark:bg-bg-hover dark:text-text-primary" : "text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.06]"}`}>
          {tr("Збережені", "Saved")}{favoriteIds.length ? ` · ${favoriteIds.length}` : ""}
        </button>
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <span className="sr-only">{tr("Пошук контестів", "Search contests")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            type="search"
            name="contest-search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={tr("Назва або опис…", "Title or description…")}
            className="contest-lobby-input w-full rounded-xl border border-border/10 bg-white py-2.5 pl-9 pr-3 text-sm text-text-primary outline-none transition placeholder:text-text-secondary focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-primary"
          />
        </label>
        <label className="sr-only" htmlFor="contest-sort">{tr("Сортування контестів", "Sort contests")}</label>
        <select
          id="contest-sort"
          name="contest-sort"
          value={sort}
          onChange={(event) => { setSort(event.target.value as NonNullable<ContestListQuery["sort"]>); setPage(1); }}
          className="contest-lobby-input rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-primary"
        >
          <option value="newest">{tr("Найновіші", "Newest")}</option>
          <option value="soonest">{tr("Найближчий старт", "Soonest start")}</option>
          <option value="title">{tr("За назвою", "By title")}</option>
        </select>
        <label className="sr-only" htmlFor="contest-difficulty">{tr("Рівень складності", "Difficulty")}</label>
        <select id="contest-difficulty" name="contest-difficulty" value={difficulty} onChange={(event) => { setDifficulty(event.target.value as typeof difficulty); setPage(1); }} className="contest-lobby-input rounded-xl border border-border/10 bg-white px-3 py-2.5 text-sm font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-surface dark:text-text-primary">
          <option value="all">{tr("Будь-який рівень", "Any level")}</option>
          <option value="EASY">{tr("Початковий", "Beginner")}</option>
          <option value="MEDIUM">{tr("Середній", "Intermediate")}</option>
          <option value="HARD">{tr("Складний", "Advanced")}</option>
        </select>
        <span className="contest-lobby-count text-xs font-semibold tabular-nums text-text-muted dark:text-text-secondary">{tr(`Контестів: ${total}`, `Contests: ${total}`)}</span>
        <button type="button"
          onClick={() => void refresh()}
          className="contest-lobby-refresh ml-auto flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.06]"
          aria-label={tr("Оновити контести", "Refresh contests")}
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
        <div className="contest-list-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((key) => (
            <div
              key={key}
              className="min-h-[350px] animate-pulse rounded-[24px] bg-bg-hover dark:bg-white/[.05]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-border/15 px-6 py-20 text-center dark:border-white/10">
          <Trophy className="mx-auto mb-4 h-8 w-8 text-accent-warn" />
          <h2 className="text-xl font-bold">{showSaved ? tr("Ще немає збережених контестів", "No saved contests yet") : search || difficulty !== "all" ? tr("Нічого не знайшлося", "No results found") : tr("Тут поки тихо", "Nothing here yet")}</h2>
          <p className="mx-auto mt-2 max-w-md text-base leading-7 text-text-muted dark:text-text-secondary">
            {showSaved ? tr("Познач контест закладкою — і він з’явиться тут.", "Bookmark a contest to save it here.") : search || difficulty !== "all" ? tr("Спробуй змінити запит або фільтри.", "Try changing your search or filters.") : tr("Створи перший контест або зайди за кодом від викладача.", "Create the first contest or join with a code from your teacher.")}
          </p>
        </div>
      ) : (
        <>
        <div className="contest-list-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const state = phaseFor(item);
            return (
              <article
                key={item.id}
                className="contest-list-card group relative flex min-h-[300px] flex-col overflow-hidden rounded-[24px] border border-border/10 bg-white shadow-[0_16px_45px_rgba(28,44,32,.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(28,44,32,.11)] dark:border-white/[.09] dark:bg-bg-surface dark:shadow-none"
                data-contest-phase={item.isPublished ? state : "draft"}
              >
                <div className={`contest-list-card__art${item.bannerImageUrl ? " contest-list-card__art--image" : ""}`} style={{ background: CONTEST_BANNER_THEMES[contestTheme(item.bannerTheme)].background }}>
                  {item.bannerImageUrl ? <img src={item.bannerImageUrl} alt="" aria-hidden="true" className="contest-list-card__image transition duration-500 group-hover:scale-[1.03]" /> : null}
                  <div className="contest-list-card__art-overlay" aria-hidden="true" />
                  <div className="contest-list-card__art-copy" aria-hidden="true">
                    <span className="contest-list-card__art-series">STUDYCOD <i /> CONTESTS</span>
                    <span className="contest-list-card__art-symbol">{item.iconImageUrl ? <img src={item.iconImageUrl} alt="" /> : item.icon || "🏆"}</span>
                    <span className="contest-list-card__art-index">{String(item.id).padStart(3, "0")}</span>
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col p-5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className={`max-w-[45%] truncate rounded-full px-3 py-1.5 text-xs font-bold ${phaseStyle[state]}`}>
                      {item.isPublished ? phaseCopy(state) : tr("Чернетка", "Draft")}
                    </span>
                    <span className="min-w-0 truncate rounded-full bg-bg-hover px-3 py-1.5 text-xs font-semibold text-text-muted dark:bg-white/[.06] dark:text-text-secondary">
                      {item.visibility === "PRIVATE_CODE" ? tr("За кодом", "Code access") : item.visibility === "CLASS" ? tr("Для класу", "For class") : item.visibility === "TEMPORARY_ACCOUNTS" ? tr("Тимчасовий доступ", "Temporary access") : tr("Відкритий", "Public")}
                    </span>
                    <button type="button" onClick={() => toggleFavorite(item.id)} aria-label={favoriteIds.includes(item.id) ? tr(`Прибрати ${item.title} зі збережених`, `Remove ${item.title} from saved`) : tr(`Зберегти ${item.title}`, `Save ${item.title}`)} aria-pressed={favoriteIds.includes(item.id)} className="ml-auto grid size-9 shrink-0 place-items-center rounded-full text-text-muted transition hover:bg-bg-hover hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary dark:hover:bg-white/[.08] dark:hover:text-primary-soft">
                      <Bookmark className={`size-4 ${favoriteIds.includes(item.id) ? "fill-current text-primary-strong dark:text-primary-soft" : ""}`} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-4 flex min-w-0 items-center gap-3">
                    <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-border/10 bg-bg-hover text-2xl dark:border-white/10 dark:bg-white/[.07]">
                      {item.iconImageUrl ? <img src={item.iconImageUrl} alt="" className="size-full object-cover" /> : item.icon || "🏆"}
                    </span>
                    <h2 className="line-clamp-2 min-w-0 font-[family-name:var(--font-display)] text-xl font-bold leading-tight tracking-[-.035em] text-text-primary dark:text-text-primary">
                      {item.title}
                    </h2>
                  </div>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                    {item.description || tr("Умови й задачі вже чекають на старті.", "The problem statements and tasks are ready when you are.")}
                  </p>

                  <div className="mt-4 mb-4 flex flex-wrap items-center gap-1.5">
                    {item.difficulty && <span className="rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-bold text-text-primary dark:bg-white/[.07] dark:text-text-secondary">{{ EASY: tr("Початковий", "Beginner"), MEDIUM: tr("Середній", "Intermediate"), HARD: tr("Складний", "Advanced") }[item.difficulty]}</span>}
                    {item.participantAccessMode === "ISSUED_ACCOUNTS" && <span className="inline-flex items-center gap-1 rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-bold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn"><KeyRound aria-hidden="true" className="size-3" />{tr("Тимчасовий доступ", "Temporary access")}</span>}
                    {item.scoreboardVisibility === "AFTER_END" && <span className="rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-bold text-[#594d9c] dark:bg-[#9c8cff]/10 dark:text-[#c5baff]">{tr("Таблиця після фінішу", "Scoreboard after the contest")}</span>}
                    {(item.tags ?? []).slice(0, 2).map((tag) => <span key={tag} className="max-w-full truncate rounded-full bg-bg-hover px-2.5 py-1 text-[11px] font-semibold text-text-muted dark:bg-white/[.05] dark:text-text-secondary">{tag}</span>)}
                  </div>

                  <div className="mt-auto flex min-w-0 items-center gap-4 border-t border-border/8 pt-4 dark:border-white/[.08]">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-muted dark:text-text-secondary">
                      <Clock3 aria-hidden="true" className="size-4 shrink-0" />
                      <span className="truncate">{state === "ended" ? tr("Фінішував", "Ended") : date(state === "soon" ? item.startsAt : item.endsAt)}</span>
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold tabular-nums text-text-muted dark:text-text-secondary">
                      <UsersRound className="size-3.5" aria-hidden="true" /> {item.participantsCount}
                    </span>
                    <button type="button"
                      onClick={() => navigate(`/contest/contests/${item.id}`)}
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-hover text-text-primary transition group-hover:bg-primary group-hover:text-primary-foreground dark:bg-white/[.07] dark:text-text-primary dark:group-hover:bg-primary dark:group-hover:text-primary-foreground"
                      aria-label={tr(`Відкрити ${item.title}`, `Open ${item.title}`)}
                    >
                      <ArrowRight className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {totalPages > 1 && <nav className="mt-7 flex items-center justify-center gap-3" aria-label={tr("Сторінки контестів", "Contest pages")}>
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-xl border border-border/10 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-white/10">{tr("Назад", "Previous")}</button>
          <span className="min-w-24 text-center text-sm font-semibold tabular-nums text-text-muted dark:text-text-secondary">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="rounded-xl border border-border/10 px-4 py-2 text-sm font-bold disabled:opacity-40 dark:border-white/10">{tr("Далі", "Next")}</button>
        </nav>}
        </>
      )}
      {joinOpen && (
        <div data-material="contest-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-bg-code/50 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setJoinOpen(false); }}>
          <form onSubmit={submitCode} role="dialog" aria-modal="true" aria-labelledby="contest-join-title" className="w-full max-w-[440px] rounded-[26px] border border-white/55 bg-bg-surface p-6 shadow-2xl dark:border-white/10 dark:bg-bg-base">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong">{tr("Доступ", "Access")}</p><h2 id="contest-join-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">{tr("Приєднатися до контесту", "Join a contest")}</h2></div>
              <button type="button" onClick={() => { setJoinOpen(false); setError(null); }} aria-label={tr("Закрити вікно", "Close dialog")} className="grid size-9 shrink-0 place-items-center rounded-xl text-text-muted transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:hover:bg-white/[.06]"><span aria-hidden="true" className="text-xl">×</span></button>
            </div>
            <label htmlFor="contest-access-code" className="block text-sm font-bold">{tr("Код доступу", "Access code")}
              <input id="contest-access-code" name="code" autoComplete="off" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} className="mt-2 w-full rounded-xl border border-border/14 bg-white px-4 py-3 font-mono text-base uppercase tracking-wider outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:bg-bg-base" placeholder={tr("Наприклад, CLASS-24…", "For example, CLASS-24…")} />
            </label>
            {error && <p role="alert" aria-live="polite" className="mt-3 rounded-xl bg-bg-hover px-3 py-2 text-sm font-semibold text-accent-error dark:bg-[var(--surface-error)] dark:text-accent-error">{error}</p>}
            <button type="submit" disabled={joinBusy || !code.trim()} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-[#072514] transition hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60">
              {joinBusy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <LockKeyhole aria-hidden="true" className="size-4" />}{joinBusy ? tr("Приєднання…", "Joining…") : tr("Приєднатися", "Join")}
            </button>
          </form>
        </div>
      )}
      {createOpen && <ContestSetupDialog scope={favoriteScope} onClose={() => setCreateOpen(false)} onCreated={(createdId, openAccounts) => navigate(openAccounts ? `/contest/contests/${createdId}?setup=accounts` : `/contest/contests/${createdId}`)} />}
    </Shell>
  );
};

export const ContestDetailPage: React.FC = () => {
  useTranslation();
  const { id } = useParams<{ id: string }>();
  const routerNavigate = useNavigate();
  const navigate = React.useCallback((path: string, options?: { replace?: boolean }) => routerNavigate(withDevPreview(path), options), [routerNavigate]);
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
  const [learningReview, setLearningReview] = React.useState<ContestLearningReview | null>(null);
  const [learningReviewLoading, setLearningReviewLoading] = React.useState(false);
  const [learningReviewError, setLearningReviewError] = React.useState<string | null>(null);
  const [clockNow, setClockNow] = React.useState(Date.now());
  const [clockOffset, setClockOffset] = React.useState(0);
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
      if (isPreview()) {
        const preview = previewDetails(contestId);
        setData(preview);
        setClockOffset(Date.parse(preview.serverTime) - Date.now());
        setStandings(previewStandings);
        setMyProgress([]);
        setMyParticipantId(1);
        return;
      }
      const [details, score] = await Promise.all([
        getContestDetails(contestId),
        getContestScoreboard(contestId).catch(() => null),
      ]);
      const progress = details.access.canManage && !details.access.isJoined
        ? null
        : await getContestMyProgress(contestId).catch(() => null);
      setData(details);
      const serverTimeMs = Date.parse(details.serverTime);
      setClockOffset(Number.isFinite(serverTimeMs) ? serverTimeMs - Date.now() : 0);
      setStandings(score);
      setMyProgress(progress?.problems ?? []);
      setMyParticipantId(progress?.participantId ?? null);
    } catch (caught) {
      if (isPreview()) {
        const preview = previewDetails(contestId);
        setData(preview);
        setClockOffset(Date.parse(preview.serverTime) - Date.now());
        setStandings(previewStandings);
        setMyProgress([]);
        setMyParticipantId(null);
      } else
        setError(
          getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити контест.", "Could not open the contest.")),
        );
    } finally {
      setLoading(false);
    }
  }, [contestId]);
  React.useEffect(() => {
    if (!hasLegacySection) void load();
  }, [hasLegacySection, load]);
  const contestEndMs = Date.parse(String(data?.contest.endsAt ?? ""));
  const reviewAvailable = Boolean(data?.phase.finished || (Number.isFinite(contestEndMs) && contestEndMs <= clockNow + clockOffset));
  const loadLearningReview = React.useCallback(async () => {
    if (!reviewAvailable || !data?.access.isJoined || !data.access.canAccessContent) {
      setLearningReview(null);
      setLearningReviewError(null);
      return;
    }
    setLearningReviewLoading(true);
    setLearningReviewError(null);
    try {
      setLearningReview(await getContestLearningReview(contestId));
    } catch (caught) {
      setLearningReview(null);
      setLearningReviewError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити післязмагальний розбір.", "Could not load the post-contest review.")));
    } finally {
      setLearningReviewLoading(false);
    }
  }, [contestId, reviewAvailable, data?.access.isJoined, data?.access.canAccessContent]);
  React.useEffect(() => {
    void loadLearningReview();
  }, [loadLearningReview]);
  React.useEffect(() => {
    if (!data || data.access.canManage || !data.contest.startsAt) return;

    const startsAtMs = Date.parse(data.contest.startsAt);
    if (!Number.isFinite(startsAtMs)) return;
    const hiddenProblemsRemain = () =>
      data.problems.some((problem) => problem.title === "(hidden until start)");
    if (!hiddenProblemsRemain()) return;

    let retryTimer: number | undefined;
    let refreshInFlight = false;
    let cancelled = false;
    const refreshProblems = async () => {
      if (cancelled || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const latest = await getContestDetails(contestId);
        if (!cancelled) setData(latest);
      } catch {
        // Keep the hidden state and retry while the contest is live.
      } finally {
        refreshInFlight = false;
      }
    };
    const startDelay = Math.max(0, startsAtMs - (Date.now() + clockOffset));
    const startTimer = window.setTimeout(() => {
      void refreshProblems();
      retryTimer = window.setInterval(() => {
        if (!hiddenProblemsRemain()) return;
        void refreshProblems();
      }, 5000);
    }, startDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      if (retryTimer != null) window.clearInterval(retryTimer);
    };
  }, [clockOffset, contestId, data]);
  const join = async () => {
    setJoining(true);
    setError(null);
    try {
      if (isPreview()) {
        setData((current) => current ? { ...current, access: { ...current.access, canAccessContent: true, isJoined: true, joinRequired: false } } : current);
        return;
      }
      await joinContest(contestId);
      await load();
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося приєднатися.", "Could not join the contest.")));
    } finally {
      setJoining(false);
    }
  };
  if (loading)
    return (
      <Shell surface="detail" eyebrow="Contest" title={tr("Відкриваємо контест", "Opening contest")}>
        <div className="h-[480px] animate-pulse rounded-[30px] bg-bg-hover dark:bg-white/[.05]" />
      </Shell>
    );
  if (!data)
    return (
      <Shell surface="detail" eyebrow="Contest" title={tr("Контест недоступний", "Contest unavailable")}>
        <Notice tone="error">{error || tr("Такого контесту не знайдено.", "Contest not found.")}</Notice>
        <button type="button"
          onClick={() => navigate("/contest/contests")}
          className="mt-5 font-bold text-primary-strong"
        >
          {tr("До списку контестів", "Back to contests")}
        </button>
      </Shell>
    );
  const state = phaseFor(data.contest);
  const joined = data.access.isJoined;
  const access = data.access.canAccessContent;
  const canManage = Boolean(data.access.canManage);
  const startMs = data.contest.startsAt ? Date.parse(data.contest.startsAt) : null;
  const startsIn = startMs == null ? null : startMs - (clockNow + clockOffset);
  const canOpenProblems = access && (canManage || startsIn == null || startsIn <= 0);
  const endMs = data.contest.endsAt ? Date.parse(data.contest.endsAt) : null;
  const endsIn = endMs == null ? null : endMs - (clockNow + clockOffset);
  const progressByProblem = new Map(myProgress.map((item) => [item.problemId, item]));
  const hasCompletedContest = state === "ended";
  const officialStanding = standings?.rows.find((row) => row.participantId === myParticipantId);
  const shouldSetUpAccounts = canManage && searchParams.get("setup") === "accounts";
  return (
    <Shell
      surface="detail"
      eyebrow={
        state === "live"
          ? tr("Зараз у грі", "Live now")
          : state === "soon"
            ? tr("Наступний старт", "Upcoming")
            : tr("Архів контесту", "Contest archive")
      }
      title={data.contest.title}
      aside={<div className="flex flex-wrap gap-2">
        {(access || canManage) && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/scoreboard`)} className="inline-flex items-center gap-2 rounded-xl border border-border/10 px-3 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:text-text-secondary dark:hover:bg-white/[.06]">
          <Trophy className="h-4 w-4" aria-hidden="true" /> {tr("Таблиця", "Scoreboard")}
        </button>}
        {canManage && data.contest.participantAccessMode === "ISSUED_ACCOUNTS" && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=accounts`)} className="inline-flex items-center gap-2 rounded-xl border border-border/10 px-3 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-white/10 dark:text-text-secondary dark:hover:bg-white/[.06]">
          <KeyRound className="h-4 w-4" aria-hidden="true" /> {tr("Акаунти", "Accounts")}
        </button>}
        {canManage && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=management`)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground hover:bg-bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-primary dark:text-primary-foreground">
          <FileCode2 className="h-4 w-4" aria-hidden="true" /> {tr("Налаштувати", "Manage")}
        </button>}
        <button type="button" onClick={() => navigate("/contest/contests")} className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-text-muted hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-text-secondary dark:hover:bg-white/[.06]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {tr("Усі контести", "All contests")}
        </button>
      </div>}
    >
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <section className="contest-banner-surface relative isolate overflow-hidden rounded-[30px] border border-white/[.08] px-6 py-7 text-white shadow-[0_28px_70px_-48px_rgba(0,0,0,.8)] sm:px-9 sm:py-9" style={{ background: data.contest.bannerImageUrl ? "#0b1b12" : CONTEST_BANNER_THEMES[contestTheme(data.contest.bannerTheme)].background }}>
        {data.contest.bannerImageUrl ? <img src={data.contest.bannerImageUrl} alt="" aria-hidden="true" width={1600} height={600} className="absolute inset-0 -z-20 size-full object-cover object-center" /> : null}
        <div aria-hidden="true" className={`absolute inset-0 -z-10 ${data.contest.bannerImageUrl ? "bg-gradient-to-r from-[#07150c]/95 via-[#0a1b11]/85 to-[#0a1b11]/55" : "bg-bg-code/25"}`} />
        <div aria-hidden="true" className="absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full blur-3xl" style={{ background: CONTEST_BANNER_THEMES[contestTheme(data.contest.bannerTheme)].glow }} />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
          <div>
            <div className="mb-4 flex items-center gap-3"><span className="grid size-14 place-items-center rounded-2xl bg-white/[.12] text-3xl shadow-inner" aria-hidden="true">{data.contest.iconImageUrl ? <img src={data.contest.iconImageUrl} alt="" className="size-10 rounded-xl border border-white/25 object-cover" /> : data.contest.icon || "🏆"}</span><div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/65">StudyCod Contests</p>{data.contest.participantAccessMode === "ISSUED_ACCOUNTS" && <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-white/90"><KeyRound className="size-3.5" aria-hidden="true" />{tr("Тимчасові акаунти", "Temporary accounts")}</span>}</div></div>
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold text-text-primary">
                {phaseCopy(state)}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                {data.contest.scoringMode || "IOI"} scoring
              </span>
              {data.contest.difficulty && <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">{{ EASY: tr("Початковий", "Beginner"), MEDIUM: tr("Середній", "Intermediate"), HARD: tr("Складний", "Advanced") }[data.contest.difficulty]}</span>}
              {data.access.isPaused && <span className="rounded-full bg-accent-warn/15 px-3 py-1.5 text-xs font-bold text-accent-warn">{tr("На паузі", "Paused")}</span>}
            </div>
            {data.contest.tags.length > 0 && <div className="mb-4 flex flex-wrap gap-2">{data.contest.tags.map((tag) => <span key={tag} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-semibold text-text-primary">{tag}</span>)}</div>}
            {startsIn != null && startsIn > 0 ? <div className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] px-4 py-3">
              <Clock3 className="h-5 w-5 text-primary-strong" aria-hidden="true" />
              <span><span className="block text-[10px] font-bold uppercase tracking-[.13em] text-text-secondary">{tr("Старт через", "Starts in")}</span><span className="mt-0.5 block font-mono text-xl font-extrabold tabular-nums">{formatCountdown(startsIn)}</span></span>
            </div> : endsIn != null && endsIn > 0 ? <div className="mb-5 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.08] px-4 py-3">
              <Clock3 className="h-5 w-5 text-primary-strong" aria-hidden="true" />
              <span><span className="block text-[10px] font-bold uppercase tracking-[.13em] text-text-secondary">{tr("До фінішу", "Time remaining")}</span><span className="mt-0.5 block font-mono text-xl font-extrabold tabular-nums">{formatCountdown(endsIn)}</span></span>
            </div> : null}
            <p className="max-w-2xl text-base leading-7 text-text-primary">
              {data.contest.description ||
                tr("Задачі зібрані в один короткий, чесний маршрут.", "A focused set of problems in one clear route.")}
            </p>
            {!access && data.access.accountRequired ? (
              <div className="mt-7 inline-flex max-w-lg items-start gap-3 rounded-2xl border border-white/15 bg-white/[.09] px-4 py-3 text-sm leading-6 text-text-primary"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary-strong" /><span><span className="block font-bold text-text-primary">{tr("Потрібен виданий акаунт", "An issued account is required")}</span>{tr("Для участі звернись до організатора. Він надасть окремий логін і пароль.", "Contact the organizer to receive a separate username and password.")}</span></div>
            ) : !access ? (
              <button type="button"
                disabled={joining}
                onClick={() => void join()}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary disabled:opacity-60"
              >
                {joining ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UsersRound className="h-4 w-4" />
                )}
                {tr("Приєднатися", "Join")}
              </button>
            ) : joined ? (
              <div className="mt-7 flex items-center gap-2 text-sm font-bold text-primary-strong">
                <Check className="h-4 w-4" />
                {tr("Ти зареєстрований на контест", "You are registered for this contest")}
              </div>
            ) : canManage ? (
              <div className="mt-7 flex items-center gap-2 text-sm font-bold text-primary-strong"><Check className="h-4 w-4" />{tr("Ти організатор цього контесту", "You are the organizer of this contest")}</div>
            ) : (
              <button type="button" disabled={joining} onClick={() => void join()} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary disabled:opacity-60">
                {joining ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UsersRound className="h-4 w-4" />}
                {tr("Зареєструватися", "Register")}
              </button>
            )}
            {data.contest.startsAt && <button type="button" onClick={() => downloadContestCalendar(data.contest)} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-bold text-text-primary transition hover:bg-white/[.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <CalendarDays className="h-4 w-4" aria-hidden="true" /> {tr("Додати в календар", "Add to calendar")}
            </button>}
            {officialStanding && <p className="mt-4 text-sm font-semibold text-text-secondary">{tr("Твоє місце:", "Your rank:")} <span className="font-extrabold text-text-primary">#{officialStanding.rank}</span> · {officialStanding.totalScore} {tr("балів", "points")}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3 self-end sm:grid-cols-3">
            <div className="rounded-2xl border border-white/[.11] bg-bg-code/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">
                {tr("Фініш", "Ends")}
              </p>
              <p className="mt-2 text-sm font-bold">
                {date(data.contest.endsAt)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.11] bg-bg-code/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">
                {tr("Задачі", "Problems")}
              </p>
              <p className="mt-2 text-2xl font-bold tracking-[-.04em]">
                {data.problems.length}
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.11] bg-bg-code/45 p-4 shadow-lg backdrop-blur-md">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-white/70">{tr("Учасники", "Participants")}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-.04em] tabular-nums">{data.participantsCount}</p>
            </div>
          </div>
        </div>
      </section>
      {shouldSetUpAccounts && <section className="mt-5 flex flex-col gap-4 rounded-2xl border border-primary/25 bg-bg-hover p-4 dark:bg-primary/[.07] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-primary)] text-primary-strong dark:bg-primary/15 dark:text-primary-soft"><KeyRound className="size-5" aria-hidden="true" /></span>
          <div><p className="font-bold text-text-primary dark:text-text-primary">{tr("Чернетку контесту створено", "Contest draft created")}</p><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Додай список учасників, щоб згенерувати для них окремі акаунти. До цього розділу можна повернутися будь-коли.", "Add a participant list to generate separate accounts for them. You can return to this section at any time.")}</p></div>
        </div>
        <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/manage?tab=accounts`)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-strong">
          <UsersRound className="size-4" aria-hidden="true" /> {tr("Додати учасників", "Add participants")}
        </button>
      </section>}
      <div className="contest-detail-grid mt-6 grid gap-6 xl:grid-cols-[1.32fr_.68fr]">
        <section className="contest-detail-card contest-detail-card--problems rounded-[28px] border border-border/10 bg-white p-5 shadow-[0_18px_50px_-44px_rgba(16,41,24,.65)] dark:border-white/[.09] dark:bg-bg-surface sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                {tr("Задачі", "Problems")}
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                {tr("Твій маршрут", "Your route")}
              </h2>
            </div>
            <span className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-bg-hover px-3 py-2 text-sm font-bold tabular-nums text-text-muted dark:bg-white/[.06] dark:text-text-secondary"><FileCode2 className="h-4 w-4 text-primary-strong dark:text-primary-soft" aria-hidden="true" />{data.problems.length}</span>
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
                disabled={!canOpenProblems}
                onClick={() =>
                  navigate(
                    `/contest/contests/${contestId}/problems/${problem.id}`,
                  )
                }
                className="group flex w-full items-center gap-3 rounded-2xl border border-border/[.08] bg-bg-hover px-3 py-3.5 text-left transition duration-200 hover:-translate-y-px hover:border-primary-strong/25 hover:bg-bg-hover hover:shadow-[0_12px_26px_-22px_rgba(15,64,34,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:border-border/[.08] disabled:hover:bg-bg-hover disabled:hover:shadow-none dark:border-white/[.08] dark:bg-white/[.025] dark:hover:border-primary/25 dark:hover:bg-white/[.05] dark:disabled:hover:border-white/[.08] dark:disabled:hover:bg-white/[.025]"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary-strong/10 bg-bg-hover font-[family-name:var(--font-display)] text-base font-black text-primary-strong shadow-sm dark:border-primary/15 dark:bg-primary/10 dark:text-primary-soft">
                  {problem.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block break-words font-bold leading-5 text-text-primary dark:text-text-primary">
                    {problem.title === "(hidden until start)" ? tr("(приховано до початку)", "(hidden until start)") : problem.title}
                  </span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-text-muted dark:text-text-secondary">
                    {progress ? <><span className="tabular-nums">{tr("Найкращий результат:", "Best score:")} <strong className="font-bold text-text-primary dark:text-text-primary">{score}{progress.maxScore != null ? ` / ${progress.maxScore}` : ""}</strong></span>{maxScore > 0 && <span aria-hidden="true" className="h-1.5 w-16 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><span className="block h-full rounded-full bg-primary" style={{ width: `${scorePercent}%` }} /></span>}</> : <span>{tr("До", "Up to")} {problem.points ?? 100} {tr("балів", "points")}</span>}
                  </span>
                </span>
                {canOpenProblems ? <>{hasCompletedContest && data.contest.allowUpsolve ? <span className="shrink-0 rounded-lg border border-accent-warn/20 bg-bg-hover px-2.5 py-1.5 text-xs font-bold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn">{tr("Дорішати", "Upsolve")}</span> : solved ? <span className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-bg-hover px-2.5 py-1.5 text-xs font-bold text-primary-strong sm:inline-flex dark:bg-primary/10 dark:text-primary-soft"><Check className="size-3.5" aria-hidden="true" />{tr("Готово", "Done")}</span> : <span className="hidden shrink-0 rounded-lg bg-bg-hover px-2.5 py-1.5 text-xs font-bold text-text-muted sm:inline-flex dark:bg-white/[.06] dark:text-text-secondary">{tr("Відкрити", "Open")}</span>}<ChevronRight className="size-5 shrink-0 text-text-secondary transition-transform group-hover:translate-x-0.5 group-hover:text-primary-strong dark:group-hover:text-primary-soft" aria-hidden="true" /></> : null}
              </button>;
            })}
            {data.problems.length === 0 && <p className="rounded-xl border border-dashed border-border/15 px-4 py-6 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Задачі ще не додано.", "No problems have been added yet.")}</p>}
          </div>
        </section>
        <section className="contest-detail-card contest-detail-card--standings rounded-[28px] border border-border/10 bg-bg-hover p-5 dark:border-white/[.09] dark:bg-bg-code sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                {tr("Таблиця", "Scoreboard")}
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                {tr("Топ зараз", "Top participants")}
              </h2>
            </div>
            <Crown className="h-5 w-5 text-accent-warn" />
          </div>
          {standings?.hidden ? (
            <p className="mt-5 rounded-xl bg-bg-hover px-3 py-3 text-sm leading-6 text-text-muted dark:bg-white/[.05] dark:text-text-secondary">{standings.hiddenReason === "ORGANIZERS_ONLY" ? tr("Таблиця доступна організаторам.", "The scoreboard is available to organizers.") : standings.releaseAt ? tr(`Таблиця відкриється після фінішу: ${date(standings.releaseAt)}.`, `The scoreboard will open after the contest ends: ${date(standings.releaseAt)}.`) : tr("Таблиця відкриється після завершення контесту.", "The scoreboard will open after the contest ends.")}</p>
          ) : data.access.accountRequired ? (
            <p className="mt-5 rounded-xl bg-bg-hover px-3 py-3 text-sm leading-6 text-text-muted dark:bg-white/[.05] dark:text-text-secondary">{tr("Для перегляду таблиці ввійди в акаунт, виданий організатором для цього контесту.", "Sign in with the account issued by the organizer to view the scoreboard.")}</p>
          ) : standings?.rows.length ? (
            <div className="mt-5 space-y-2">
              {standings.rows.slice(0, 5).map((row) => (
                <div
                  key={row.participantId}
                  className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2.5 ${row.rank === 1 ? "border-accent-warn/25 bg-bg-hover dark:border-accent-warn/15 dark:bg-accent-warn/[.06]" : "border-border/[.07] bg-white dark:border-white/[.06] dark:bg-white/[.025]"}`}
                >
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-lg text-xs font-extrabold tabular-nums ${row.rank === 1 ? "bg-accent-warn/50 text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn" : "bg-bg-hover text-text-muted dark:bg-white/[.06] dark:text-text-secondary"}`}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary dark:text-text-primary">
                    {row.displayName}
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-primary-strong dark:text-primary-soft">
                    {row.totalScore}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-sm leading-6 text-text-muted dark:text-text-secondary">
              {tr("Рейтинг з'явиться після перших відправлень.", "The standings will appear after the first submissions.")}
            </p>
          )}
          {(access || canManage) && <button type="button" onClick={() => navigate(`/contest/contests/${contestId}/scoreboard`)} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-bg-hover px-4 py-2.5 text-sm font-bold text-text-primary transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:bg-white/[.07] dark:text-text-primary dark:hover:bg-white/[.1]">
            {tr("Повна таблиця", "Full scoreboard")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>}
        </section>
      </div>
      {reviewAvailable && joined && access ? <section className="mt-6 rounded-[28px] border border-primary/20 bg-primary/5 p-5 sm:p-6" aria-labelledby="contest-learning-review-title" data-contest-learning-review="true">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Навчальний підсумок", "Learning review")}</p>
            <h2 id="contest-learning-review-title" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em] text-text-primary dark:text-text-primary">{tr("Розбір після туру", "Post-contest review")}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Результати Judge згруповані за темами у згенерованих задачах. Повернися до теми, щоб закріпити слабкі місця новою практикою.", "Judge results are grouped by topic across your generated problems. Revisit a topic to strengthen weak spots with fresh practice.")}</p>
          </div>
          <button type="button" onClick={() => void loadLearningReview()} disabled={learningReviewLoading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/15 bg-bg-surface px-3 py-2 text-sm font-bold text-text-primary transition hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/[.04] dark:text-text-primary dark:hover:bg-white/[.08]">
            <RotateCw className={`size-4 ${learningReviewLoading ? "animate-spin" : ""}`} aria-hidden="true" />{tr("Оновити", "Refresh")}
          </button>
        </div>
        {learningReviewLoading ? <div role="status" className="mt-4 text-sm text-text-muted dark:text-text-secondary">{tr("Готуємо розбір…", "Preparing review…")}</div>
          : learningReviewError ? <div role="alert" className="mt-4 text-sm text-accent-error">{learningReviewError}</div>
            : learningReview?.topics.length ? <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {learningReview.topics.map((topic) => <div key={topic.topicKey} className="rounded-2xl border border-border/10 bg-bg-surface px-4 py-3 dark:border-white/[.07]">
                  <div className="font-bold text-text-primary dark:text-text-primary">{topic.topicKey}</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{tr(`Розв’язано задач: ${topic.solvedProblems}/${topic.problemCount} · невдалих спроб: ${topic.failures}`, `Solved: ${topic.solvedProblems}/${topic.problemCount} · unsuccessful attempts: ${topic.failures}`)}</div>
                  {topic.problems.map((problem) => <div key={`${topic.topicKey}:${problem.label}`} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/10 pt-2 text-xs dark:border-white/[.07]">
                    <span className="min-w-0 truncate font-medium text-text-secondary dark:text-text-secondary">{problem.label}. {problem.title}</span>
                    <span className="shrink-0 tabular-nums text-text-muted dark:text-text-secondary">{tr("Найкращий бал:", "Best score:")} {problem.bestScore} · {tr("спроб:", "attempts:")} {problem.attempts}</span>
                  </div>)}
                </div>)}
              </div>
              {learningReview.recommendation ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-bg-surface p-4 dark:bg-white/[.04]">
                <p className="m-0 text-sm leading-6 text-text-secondary dark:text-text-secondary">{tr(`Повтори тему ${learningReview.recommendation.topicKey} на новій згенерованій задачі.`, `Review ${learningReview.recommendation.topicKey} with a fresh generated problem.`)}</p>
                {learningReview.recommendation.courseId && learningReview.recommendation.courseItemId ? <button type="button" onClick={() => navigate(`/learning/course/${learningReview.recommendation!.courseId}/practice/${learningReview.recommendation!.courseItemId}`)} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">{tr("Почати нову практику", "Start fresh practice")} <ArrowRight className="size-4" aria-hidden="true" /></button> : null}
              </div> : <p className="mb-0 mt-4 text-sm text-text-muted dark:text-text-secondary">{tr("У цьому турі не було невдалих спроб. Спробуй змішаний набір, щоб перевірити перенесення навичок.", "There were no unsuccessful attempts in this round. Try a mixed set to check skill transfer.")}</p>}
            </>
              : <p className="mb-0 mt-4 text-sm text-text-muted dark:text-text-secondary">{tr("У цьому турі немає задач, згенерованих олімпіадним курсом.", "This round has no problems generated by an Olympiad course.")}</p>}
      </section> : null}
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
    defaultLanguage: "python",
    allowedLanguages: ["python", "java", "cpp"],
    timeLimitMs: 1000,
    memoryLimitMb: 64,
    outputLimitKb: 64,
    checkerSpec: null,
  },
};

export const ContestProblemPage: React.FC = () => {
  useTranslation();
  const { id, problemId } = useParams<{ id: string; problemId: string }>();
  const routerNavigate = useNavigate();
  const navigate = React.useCallback((path: string, options?: { replace?: boolean }) => routerNavigate(withDevPreview(path), options), [routerNavigate]);
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
      if (isPreview()) {
        setStatement(previewStatement);
        setLanguage("python");
        setCode(templateForJudgeLanguage("python", {}));
        setSubmissions([{ id: 1, verdict: "AC", score: 100, createdAt: new Date().toISOString() }]);
        return;
      }
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
      setCode(templateForJudgeLanguage(next, {
        templatesByLanguage: templates,
        fallback: data.task.template,
        fallbackLanguage: data.task.defaultLanguage,
      }).trimStart());
      setSubmissions(history?.submissions ?? []);
    } catch (caught) {
      if (isPreview()) {
        setStatement(previewStatement);
        setCode(templateForJudgeLanguage("python", {}));
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
          getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити задачу.", "Could not open the problem.")),
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
      setCode(templateForJudgeLanguage(next, {
        templatesByLanguage: statement.task.templatesByLanguage,
        fallback: statement.task.template,
        fallbackLanguage: statement.task.defaultLanguage,
      }).trimStart());
  };
  const run = async () => {
    if (!statement) return;
    setRunning(true);
    setResult(null);
    try {
      const response = isPreview() ? {
        success: true,
        verdict: "OK",
        stdout: input.trim() || "2 3 5",
        stderr: "",
        exitCode: 0,
        timeMs: 1,
        memoryKb: 128,
      } : await runContestProblem({
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
          `${response.verdict || tr("Готово", "Done")} · ${response.timeMs ?? 0} ms`,
      });
    } catch (caught) {
      setResult({
        kind: "run",
        good: false,
        text: getErrorMessageFromUnknown(caught, tr("Запуск не вдався.", "Run failed.")),
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
      const response = isPreview() ? {
        verdict: "AC",
        testsPassed: 3,
        testsTotal: 3,
        score: 100,
        maxScore: 100,
        compileError: null,
        firstFailure: null,
      } : await checkContestProblem({
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
        publicTestResults: contestFirstFailureToPublicTestResults(response.firstFailure),
      });
      setResult({
        kind: "check",
        good: response.verdict === "AC",
        text: `${response.verdict || tr("Готово", "Done")} · ${response.testsPassed}/${response.testsTotal} ${tr("тестів", "tests")} · ${response.score}/${response.maxScore}`,
      });
      if (isPreview()) setSubmissions((current) => [{ id: Date.now(), verdict: "AC", score: 100, createdAt: new Date().toISOString() }, ...current]);
      else {
        const history = await getContestProblemSubmissions(contestId, numericProblemId).catch(() => null);
        setSubmissions(history?.submissions ?? submissions);
      }
    } catch (caught) {
      setResult({
        kind: "check",
        good: false,
        text: getErrorMessageFromUnknown(caught, tr("Перевірка не вдалася.", "Submission failed.")),
      });
    } finally {
      setChecking(false);
    }
  };
  if (loading)
    return (
      <Shell eyebrow={tr("Задача", "Problem")} title={tr("Готуємо умову", "Loading problem")}>
        <div className="h-[560px] animate-pulse rounded-[30px] bg-bg-hover dark:bg-white/[.05]" />
      </Shell>
    );
  if (!statement)
    return (
      <Shell eyebrow={tr("Задача", "Problem")} title={tr("Не вдалося відкрити", "Could not open problem")}>
        <Notice tone="error">{error || tr("Задача недоступна.", "Problem unavailable.")}</Notice>
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
    onReset={() => setCode(templateForJudgeLanguage(language, {
      templatesByLanguage: statement.task.templatesByLanguage,
      fallback: statement.task.template,
      fallbackLanguage: statement.task.defaultLanguage,
    }))}
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
          className="inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-text-primary dark:text-text-secondary dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
           {tr("До задач", "Back to tasks")}
        </button>
        <span className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-bold text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn">
          {statement.task.timeLimitMs ?? 1000} ms ·{" "}
          {statement.task.memoryLimitMb ?? 64} MB
        </span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(360px,.76fr)_minmax(480px,1.24fr)]">
        <section className="rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface xl:min-h-[calc(100dvh-145px)]">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bg-hover font-[family-name:var(--font-display)] text-lg font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
              {statement.problem.label}
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                Задача {statement.problem.order}
              </p>
              <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] text-text-primary dark:text-text-primary">
                {statement.task.title}
              </h1>
            </div>
          </div>
          <div className="mt-7 whitespace-pre-wrap text-[15px] leading-7 text-text-primary dark:text-text-secondary">
            {statement.task.description}
          </div>
          <div className="mt-9 border-t border-border/10 pt-5 dark:border-white/[.08]">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-text-muted" />
               <h2 className="font-bold">{tr("Останні посилання", "Recent submissions")}</h2>
            </div>
            {submissions.length ? (
              <div className="space-y-2">
                {submissions.slice(0, 5).map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between rounded-xl bg-bg-hover px-3 py-2.5 text-sm dark:bg-white/[.045]"
                  >
                    <span className="font-semibold text-text-muted dark:text-text-secondary">
                      {submission.createdAt
                        ? date(submission.createdAt)
                        : "Щойно"}
                    </span>
                    <span
                      className={
                        submission.verdict === "AC"
                          ? "font-extrabold text-primary-strong dark:text-primary-soft"
                          : "font-extrabold text-accent-error dark:text-accent-error"
                      }
                    >
                      {submission.verdict || "—"}{" "}
                      {submission.score != null ? `· ${submission.score}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-text-muted dark:text-text-secondary">
                 {tr("Тут з'явиться історія після першого запуску на перевірку.", "Your submission history will appear here after your first run.")}
              </p>
            )}
          </div>
        </section>
        <section className="overflow-hidden rounded-[26px] border border-border/10 bg-bg-base shadow-[0_18px_45px_rgba(13,27,18,.14)] dark:border-white/[.1]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-bg-surface px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Code2 className="h-4 w-4 text-primary-soft" />
               {tr("Рішення", "Solution")}
            </div>
            <select
              value={language}
              onChange={(event) =>
                switchLanguage(event.target.value as JudgeLanguage)
              }
              className="rounded-lg border border-white/10 bg-bg-code px-3 py-2 text-sm font-bold text-text-primary outline-none"
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
            className="h-[min(51dvh,620px)] w-full resize-none bg-bg-base p-5 font-mono text-[14px] leading-6 text-text-primary outline-none placeholder:text-text-muted"
            placeholder={tr("Напиши рішення тут…", "Write your solution here…")}
          />
          <div className="border-t border-white/10 bg-bg-base p-4">
            <label className="block text-xs font-bold uppercase tracking-[.13em] text-text-secondary">
               {tr("Власний ввід", "Custom input")}
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                className="mt-2 h-20 w-full resize-none rounded-xl border border-white/10 bg-bg-code p-3 font-mono text-sm text-text-primary outline-none focus:border-primary/40"
                placeholder={tr("Необов'язково: дані для Run", "Optional input for Run")}
              />
            </label>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <button type="button"
                disabled={running}
                onClick={() => void run()}
                className="inline-flex items-center gap-2 rounded-xl bg-white/[.08] px-4 py-2.5 text-sm font-bold text-text-primary hover:bg-white/[.13] disabled:opacity-55"
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
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary disabled:opacity-55"
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
                className={`mt-3 rounded-xl border px-3 py-3 font-mono text-sm ${result.good ? "border-primary/25 bg-primary/[.09] text-primary-strong" : "border-accent-error/25 bg-accent-error/[.08] text-accent-error"}`}
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
