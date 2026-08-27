import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  FileCode2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCw,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  checkContestProblem,
  createContest,
  getContestDetails,
  getContestProblemStatement,
  getContestProblemSubmissions,
  getContestScoreboard,
  joinContest,
  joinContestByCode,
  listContests,
  runContestProblem,
  type ContestDetails,
  type ContestListItem,
  type ContestProblemStatement,
  type ContestStandings,
  type JudgeLanguage,
} from "../../lib/api/contests";
import { enabledJudgeLanguages } from "../../lib/judgeLanguages";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";

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

const previewContests: ContestListItem[] = [
  {
    id: 102,
    title: "Алгоритмічна субота",
    description: "П'ять задач на уважність, структури даних і здоровий темп.",
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

export const ContestLobbyPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = React.useState<ContestListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | "live" | "soon" | "ended">(
    "all",
  );
  const [joinOpen, setJoinOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [joinBusy, setJoinBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listContests();
      setItems(response.contests ?? []);
    } catch (caught) {
      if (isPreview()) {
        setItems(previewContests);
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
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  const filtered = items.filter(
    (item) => filter === "all" || phaseFor(item) === filter,
  );

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
  const submitCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (title.trim().length < 3) {
      setError("Назва має містити щонайменше 3 символи.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await createContest({
        title: title.trim(),
        description: description.trim() || undefined,
        visibility: "PUBLIC",
        isPublished: false,
        allowUpsolve: true,
      });
      navigate(`/contest/contests/${result.id}`);
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(
          caught,
          "Не вдалося створити чернетку контесту.",
        ),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <Shell
      eyebrow="StudyCod Contest"
      title="Змагання, де видно хід думки"
      aside={
        <div className="flex flex-wrap gap-2">
          <button type="button"
            onClick={() => setJoinOpen(true)}
            className="rounded-xl border border-[#1a2a1e]/12 px-4 py-2.5 text-sm font-bold text-[#243329] transition hover:bg-[#edf2ed] dark:border-white/10 dark:text-[#dce7df] dark:hover:bg-white/[.06]"
          >
            <LockKeyhole className="mr-2 inline h-4 w-4" />
            Ввести код
          </button>
          <button type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-[#153321] px-4 py-2.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(20,67,40,.2)] transition hover:-translate-y-0.5 dark:bg-[#00d978] dark:text-[#062211]"
          >
            <Plus className="mr-2 inline h-4 w-4" />
            Новий контест
          </button>
        </div>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(["all", "live", "soon", "ended"] as const).map((item) => (
          <button type="button"
            key={item}
            onClick={() => setFilter(item)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${filter === item ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#112016]" : "text-[#617167] hover:bg-[#edf2ed] dark:text-[#a9b7ad] dark:hover:bg-white/[.06]"}`}
          >
            {item === "all" ? "Усі" : phaseCopy[item]}
          </button>
        ))}
        <button type="button"
          onClick={() => void refresh()}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-[#65756a] hover:bg-[#edf2ed] dark:text-[#a9b7ad] dark:hover:bg-white/[.06]"
          aria-label="Оновити"
        >
          <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {message && (
        <div className="mb-5">
          <Notice tone="success">{message}</Notice>
        </div>
      )}
      {error && (
        <div className="mb-5">
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
          <h2 className="text-xl font-bold">Тут поки тихо</h2>
          <p className="mx-auto mt-2 max-w-md text-base leading-7 text-[#68786e] dark:text-[#a6b4aa]">
            Створи перший контест або зайди за кодом від викладача.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const state = phaseFor(item);
            return (
              <article
                key={item.id}
                className="group relative flex min-h-[275px] flex-col overflow-hidden rounded-[24px] border border-[#1a2a1e]/10 bg-white p-6 shadow-[0_16px_45px_rgba(28,44,32,.05)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_rgba(28,44,32,.11)] dark:border-white/[.09] dark:bg-[#111b14] dark:shadow-none"
              >
                <div className="absolute right-0 top-0 h-28 w-28 rounded-bl-full bg-[#00ff88]/[.08] transition group-hover:scale-110" />
                <div className="relative flex items-start justify-between gap-4">
                  <span
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${phaseStyle[state]}`}
                  >
                    {phaseCopy[state]}
                  </span>
                  <span className="text-xs font-semibold text-[#718075] dark:text-[#9bad9f]">
                    {item.visibility === "PRIVATE_CODE"
                      ? "За кодом"
                      : item.visibility === "CLASS"
                        ? "Для класу"
                        : "Відкритий"}
                  </span>
                </div>
                <h2 className="relative mt-8 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-[-.035em] text-[#162219] dark:text-[#f0f5f1]">
                  {item.title}
                </h2>
                <p className="relative mt-3 line-clamp-2 text-[15px] leading-6 text-[#68786e] dark:text-[#aab8ae]">
                  {item.description || "Умови й задачі вже чекають на старті."}
                </p>
                <div className="relative mt-auto flex items-center justify-between border-t border-[#19291d]/8 pt-5 dark:border-white/[.08]">
                  <span className="flex items-center gap-2 text-sm font-medium text-[#64746a] dark:text-[#a6b4aa]">
                    <Clock3 className="h-4 w-4" />
                    {state === "ended"
                      ? "Фінішував"
                      : date(state === "soon" ? item.startsAt : item.endsAt)}
                  </span>
                  <button type="button"
                    onClick={() => navigate(`/contest/contests/${item.id}`)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eff4ef] text-[#183422] transition group-hover:bg-[#153321] group-hover:text-white dark:bg-white/[.07] dark:text-[#e7f0e9] dark:group-hover:bg-[#00d978] dark:group-hover:text-[#062211]"
                    aria-label={`Відкрити ${item.title}`}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {(joinOpen || createOpen) && (
        <div data-material="contest-dialog-scrim" className="fixed inset-0 z-[80] grid place-items-center bg-[#071009]/45 px-4 backdrop-blur-sm" role="presentation">
          <form
            onSubmit={joinOpen ? submitCode : submitCreate}
            role="dialog"
            aria-modal="true"
            aria-label={joinOpen ? "Приєднатися до контесту" : "Почати новий контест"}
            tabIndex={-1}
            className="w-full max-w-[460px] rounded-[26px] border border-white/55 bg-[#fbfcfa] p-6 shadow-2xl dark:border-white/10 dark:bg-[#142018]"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#16834d]">
                  {joinOpen ? "Доступ" : "Чернетка"}
                </p>
                <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                  {joinOpen
                    ? "Приєднатися до контесту"
                    : "Почати новий контест"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setJoinOpen(false);
                  setCreateOpen(false);
                }}
                className="rounded-lg px-2 py-1 text-lg text-[#68786e]"
              >
                ×
              </button>
            </div>
            {joinOpen ? (
              <label className="block text-sm font-bold">
                Код доступу
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#18271c]/14 bg-white px-4 py-3 text-base outline-none ring-[#00ff88]/30 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]"
                  placeholder="Наприклад, CLASS-24"
                />
              </label>
            ) : (
              <>
                <label className="block text-sm font-bold">
                  Назва
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-[#18271c]/14 bg-white px-4 py-3 text-base outline-none ring-[#00ff88]/30 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]"
                    placeholder="Наприклад, Осінній спринт"
                  />
                </label>
                <label className="mt-4 block text-sm font-bold">
                  Що буде всередині
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="mt-2 min-h-24 w-full resize-none rounded-xl border border-[#18271c]/14 bg-white px-4 py-3 text-base outline-none ring-[#00ff88]/30 focus:ring-4 dark:border-white/10 dark:bg-[#0d1510]"
                    placeholder="Короткий опис для учасників"
                  />
                </label>
              </>
            )}
            <button type="submit"
              disabled={joinBusy || creating}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#00d978] px-4 py-3.5 text-sm font-bold text-[#072514] transition hover:bg-[#00ff88] disabled:opacity-60"
            >
              {(joinBusy || creating) && (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              )}
              {joinOpen ? "Приєднатися" : "Створити чернетку"}
            </button>
          </form>
        </div>
      )}
    </Shell>
  );
};

export const ContestDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const contestId = Number(id);
  const [data, setData] = React.useState<ContestDetails | null>(null);
  const [standings, setStandings] = React.useState<ContestStandings | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [joining, setJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    if (!Number.isFinite(contestId)) return;
    setLoading(true);
    setError(null);
    try {
      const [details, score] = await Promise.all([
        getContestDetails(contestId),
        getContestScoreboard(contestId).catch(() => null),
      ]);
      setData(details);
      setStandings(score);
    } catch (caught) {
      if (isPreview()) {
        setData(previewDetails(contestId));
        setStandings(previewStandings);
      } else
        setError(
          getErrorMessageFromUnknown(caught, "Не вдалося відкрити контест."),
        );
    } finally {
      setLoading(false);
    }
  }, [contestId]);
  React.useEffect(() => {
    void load();
  }, [load]);
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
      aside={
        <button type="button"
          onClick={() => navigate("/contest/contests")}
          className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-[#65756a] hover:bg-[#edf2ed] dark:text-[#aab8ad] dark:hover:bg-white/[.06]"
        >
          <ArrowLeft className="h-4 w-4" />
          Усі контести
        </button>
      }
    >
      {error && (
        <div className="mb-5">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <section className="relative overflow-hidden rounded-[30px] bg-[#153321] px-6 py-7 text-white sm:px-9 sm:py-9">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#00ff88]/15 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <div className="mb-6 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold text-[#baf9d4]">
                {phaseCopy[state]}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/80">
                {data.contest.scoringMode || "IOI"} scoring
              </span>
            </div>
            <p className="max-w-2xl text-base leading-7 text-[#c6d7cc]">
              {data.contest.description ||
                "Задачі зібрані в один короткий, чесний маршрут."}
            </p>
            {!access ? (
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
            ) : (
              <div className="mt-7 flex items-center gap-2 text-sm font-bold text-[#aef0c9]">
                <Check className="h-4 w-4" />
                {joined ? "Ти вже у списку учасників" : "Матеріали доступні"}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            <div className="rounded-2xl bg-white/[.09] p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[#9db7a6]">
                Фініш
              </p>
              <p className="mt-2 text-sm font-bold">
                {date(data.contest.endsAt)}
              </p>
            </div>
            <div className="rounded-2xl bg-white/[.09] p-4">
              <p className="text-xs font-bold uppercase tracking-[.12em] text-[#9db7a6]">
                Задачі
              </p>
              <p className="mt-2 text-2xl font-bold tracking-[-.04em]">
                {data.problems.length}
              </p>
            </div>
          </div>
        </div>
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.32fr_.68fr]">
        <section className="rounded-[28px] border border-[#19291d]/10 bg-white p-5 dark:border-white/[.09] dark:bg-[#111b14] sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#ff8c00]">
                Задачі
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
                Твій список старту
              </h2>
            </div>
            <FileCode2 className="h-5 w-5 text-[#6a7b70]" />
          </div>
          <div className="space-y-2">
            {data.problems.map((problem) => (
              <button type="button"
                key={problem.id}
                disabled={!access}
                onClick={() =>
                  navigate(
                    `/contest/contests/${contestId}/problems/${problem.id}`,
                  )
                }
                className="group flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition hover:bg-[#f1f5f1] disabled:cursor-not-allowed disabled:opacity-55 dark:hover:bg-white/[.055]"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ebf5ee] text-sm font-extrabold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                  {problem.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-[#1a271e] dark:text-[#edf3ef]">
                    {problem.title}
                  </span>
                  <span className="mt-0.5 block text-sm text-[#708075] dark:text-[#9faea3]">
                    {problem.points ?? 100} балів
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 text-[#9aa79e] transition group-hover:translate-x-1" />
              </button>
            ))}
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
          {standings?.rows.length ? (
            <div className="mt-5 space-y-1">
              {standings.rows.slice(0, 5).map((row) => (
                <div
                  key={row.participantId}
                  className="flex items-center gap-3 rounded-xl px-2 py-2.5"
                >
                  <span
                    className={`w-5 text-sm font-bold ${row.rank === 1 ? "text-[#d47b00]" : "text-[#849287]"}`}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {row.displayName}
                  </span>
                  <span className="text-sm font-extrabold text-[#16834d] dark:text-[#72edb0]">
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
