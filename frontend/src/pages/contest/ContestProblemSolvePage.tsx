import React from "react";
import { useTranslation } from "react-i18next";
import {
  hasPendingContestJob,
  resumeContestJob,
  type ContestJobStatus,
  type JudgeProgress,
} from "../../lib/api/contestJobs";
import type {
  ContestCheckResult,
  ContestRunResult,
} from "../../lib/api/contests";
import { contestFirstFailureToPublicTestResults } from "../../lib/contestFeedback";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ChatCircleTextIcon as MessageSquareText,
  BroadcastIcon as Radio,
  TrophyIcon as Trophy,
  XIcon as X,
  ClockIcon as ContestClock,
} from "@phosphor-icons/react";
import {
  checkContestProblem,
  getContestCommunity,
  getContestDetails,
  getContestProblemStatement,
  getContestProblemSubmissions,
  postContestCommunityQuestion,
  recordContestIntegrityEvent,
  runContestProblem,
  type ContestCommunityAnnouncement,
  type ContestCommunityQuestion,
  type ContestProblemListItem,
  type ContestProblemStatement,
  type ContestSubmissionListItem,
  type JudgeLanguage,
} from "../../lib/api/contests";
import {
  JUDGE_ENTRY_FILES,
  enabledJudgeLanguages,
  defaultCompilerForFamily,
  templateForJudgeLanguage,
} from "../../lib/judgeLanguages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Skeleton } from "../../components/ui/Skeleton";
import {
  StudyCodIDEWorkspace,
  type StudyCodIdeCheckResult,
  type StudyCodIdeRunResult,
} from "../../components/ide/StudyCodIDEWorkspace";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { tracePlayground, type TraceResult } from "../../lib/api/playground";
import { getCachedMeUser } from "../../lib/api/profile";
import { isDevPreviewActive, withDevPreview } from "../../lib/devPreview";
import { ContestSafetyGate } from "./ContestSafetyGate";

type ContestMeta = {
  contestId: number | null;
  title: string;
  endsAt: string | null;
  serverTime: string | null;
  syncedAt: number;
  finished: boolean;
  paused: boolean;
};

type ContestAnnouncementEvent = {
  id: number;
  text: string;
  author: string;
  at?: number;
};

function getErrorMessage(error: unknown): string {
  return getErrorMessageFromUnknown(error, "");
}

function examplesFromStatement(
  markdown: string,
): Array<{ testId: number; input: string; expectedOutput: string }> {
  const blocks = Array.from(
    String(markdown ?? "").matchAll(/```(?:[\w+-]*)\n([\s\S]*?)```/g),
  ).map((match) => String(match[1] ?? "").trim());
  const examples: Array<{
    testId: number;
    input: string;
    expectedOutput: string;
  }> = [];
  for (let index = 0; index < blocks.length; index += 2) {
    const input = blocks[index] ?? "";
    const expectedOutput = blocks[index + 1] ?? "";
    if (input || expectedOutput)
      examples.push({ testId: examples.length + 1, input, expectedOutput });
  }
  return examples;
}

function templateForLanguage(
  task: {
    template: string;
    templatesByLanguage: Record<string, string> | null;
    defaultLanguage?: JudgeLanguage;
  },
  lang: JudgeLanguage,
) {
  return templateForJudgeLanguage(lang, {
    templatesByLanguage: task.templatesByLanguage,
    fallback: task.template,
    fallbackLanguage: task.defaultLanguage,
  });
}

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function draftScopeFromUser(user: ReturnType<typeof getCachedMeUser>): string {
  if (user?.studentId != null) return `student:${user.studentId}`;
  if (user?.id != null) return `user:${user.id}`;
  return "anon";
}

function apiHttpBase(): string {
  const raw = String(
    import.meta.env.VITE_API_URL ||
      (typeof window !== "undefined" ? window.location.origin : ""),
  ).trim();
  const base = raw.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
  return `${base}/api`;
}

function normalizeVerdict(v: string | null | undefined): string | null {
  const raw = String(v ?? "").trim();
  return raw || null;
}

const previewContestProblems = (en: boolean): ContestProblemListItem[] => [
  {
    id: 501,
    order: 1,
    label: "A",
    points: 100,
    title: en ? "Quiet permutation" : "Тиха перестановка",
    libraryTaskId: 41,
  },
  {
    id: 502,
    order: 2,
    label: "B",
    points: 150,
    title: en ? "Message queue" : "Черга повідомлень",
    libraryTaskId: 42,
  },
  {
    id: 503,
    order: 3,
    label: "C",
    points: 200,
    title: en ? "Reachable route" : "Доступний маршрут",
    libraryTaskId: 43,
  },
];

const previewContestStatement = (
  problemId: number,
  en: boolean,
): ContestProblemStatement => {
  const problem =
    previewContestProblems(en).find((item) => item.id === problemId) ??
    previewContestProblems(en)[0]!;
  const taskDemo =
    problem.label === "B"
      ? {
          description: en
            ? "Count the positive numbers in the sequence.\n\nInput\n```text\n5\n-1 4 0 8 -3\n```\nOutput\n```text\n2\n```"
            : "Порахуй додатні числа у послідовності.\n\nВхідні дані\n```text\n5\n-1 4 0 8 -3\n```\nВихідні дані\n```text\n2\n```",
          template:
            "values = list(map(int, input().split()))\nprint(sum(value > 0 for value in values))\n",
        }
      : problem.label === "C"
        ? {
            description: en
              ? "Find the sum of the numbers in the sequence.\n\nInput\n```text\n4\n3 7 2 1\n```\nOutput\n```text\n13\n```"
              : "Знайди суму чисел у послідовності.\n\nВхідні дані\n```text\n4\n3 7 2 1\n```\nВихідні дані\n```text\n13\n```",
            template:
              "values = list(map(int, input().split()))\nprint(sum(values))\n",
          }
        : {
            description: en
              ? "Find the smallest value and its position in the sequence.\n\nInput\n```text\n5\n12 7 7 18 9\n```\nOutput\n```text\n2 7\n```"
              : "Знайди найменше значення та його номер у послідовності.\n\nВхідні дані\n```text\n5\n12 7 7 18 9\n```\nВихідні дані\n```text\n2 7\n```",
            template:
              "values = list(map(int, input().split()))\nindex = min(range(len(values)), key=values.__getitem__)\nprint(index + 1, values[index])\n",
          };
  return {
    problem: { id: problemId, order: problem.order, label: problem.label },
    task: {
      id: problem.libraryTaskId ?? 41,
      title: problem.title,
      description: taskDemo.description,
      template: taskDemo.template,
      templatesByLanguage: { python: taskDemo.template },
      defaultLanguage: "python",
      allowedLanguages: ["python"],
      timeLimitMs: 1000,
      memoryLimitMb: 256,
      outputLimitKb: 64,
      checkerSpec: null,
    },
  };
};

const ContestWorkspaceTimer: React.FC<{ endsAt: string; en: boolean }> = ({
  endsAt,
  en,
}) => {
  const [now, setNow] = React.useState(Date.now);
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const ends = new Date(endsAt).getTime();
  if (!Number.isFinite(ends)) return null;
  const seconds = Math.max(0, Math.ceil((ends - now) / 1000));
  const countdown = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  return (
    <div
      className="ide-contest-clock"
      data-urgent={seconds < 300}
      title={`${en ? "Contest ends at" : "Контест завершується о"} ${new Date(endsAt).toLocaleTimeString(en ? "en-US" : "uk-UA")}`}
    >
      <ContestClock className="size-4" />
      <span>{en ? "Time left" : "Залишилось"}</span>
      <time dateTime={`PT${seconds}S`}>
        {seconds === 0 ? (en ? "Finished" : "Завершено") : countdown}
      </time>
    </div>
  );
};

export const ContestProblemSolvePage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const copy = (uk: string, english: string) => (en ? english : uk);
  const navigate = useNavigate();
  const params = useParams<{ id?: string; problemId?: string }>();

  const contestId = React.useMemo(() => {
    const v = Number(params.id);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const problemId = React.useMemo(() => {
    const v = Number(params.problemId);
    return Number.isFinite(v) ? v : null;
  }, [params]);

  const hasToken = true;
  const isPreview = isDevPreviewActive();
  const sessionUser = getCachedMeUser();
  // Live updates (SSE) are on by default; can be disabled explicitly.
  const liveUpdatesEnabled = React.useMemo(() => {
    const raw = String(import.meta.env.VITE_ENABLE_CONTEST_WS ?? "")
      .trim()
      .toLowerCase();
    return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
  }, []);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statement, setStatement] =
    React.useState<ContestProblemStatement | null>(null);
  const [contestMeta, setContestMeta] = React.useState<ContestMeta>({
    contestId: null,
    title: "Contest",
    endsAt: null,
    serverTime: null,
    syncedAt: Date.now(),
    finished: false,
    paused: false,
  });
  const [contestProblems, setContestProblems] = React.useState<
    ContestProblemListItem[]
  >([]);

  const [judgeLanguage, setJudgeLanguage] =
    React.useState<JudgeLanguage>("java");
  const [judgeCompiler, setJudgeCompiler] = React.useState<string>(
    defaultCompilerForFamily("java"),
  );
  // Reset compiler to the family default whenever the language changes.
  React.useEffect(() => {
    setJudgeCompiler(defaultCompilerForFamily(judgeLanguage));
  }, [judgeLanguage]);
  const [code, setCode] = React.useState("");
  const [runInput, setRunInput] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [jobStatus, setJobStatus] = React.useState<ContestJobStatus | null>(
    null,
  );
  const activeProblemKey = `${contestId}:${problemId}`;
  const activeProblemRef = React.useRef(activeProblemKey);
  activeProblemRef.current = activeProblemKey;
  React.useEffect(() => {
    setChecking(false);
    setCheckProgress(null);
    setJobStatus(null);
  }, [activeProblemKey]);
  const [checkProgress, setCheckProgress] =
    React.useState<JudgeProgress | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [runResult, setRunResult] = React.useState<StudyCodIdeRunResult | null>(
    null,
  );
  const [checkResult, setCheckResult] =
    React.useState<StudyCodIdeCheckResult | null>(null);
  const [trace, setTrace] = React.useState<TraceResult | null>(null);
  const [tracing, setTracing] = React.useState(false);

  const [subsLoading, setSubsLoading] = React.useState(false);
  const [submissions, setSubmissions] = React.useState<
    ContestSubmissionListItem[]
  >([]);

  const [wsStatus, setWsStatus] = React.useState<
    "connecting" | "connected" | "offline"
  >("offline");
  const [latestVerdict, setLatestVerdict] = React.useState<string | null>(null);
  const [latestVerdictAt, setLatestVerdictAt] = React.useState(0);

  const [announcements, setAnnouncements] = React.useState<
    ContestCommunityAnnouncement[]
  >([]);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = React.useState<
    number | null
  >(null);
  const [draftSavedAt, setDraftSavedAt] = React.useState<string | null>(null);
  const [organizerDialogOpen, setOrganizerDialogOpen] = React.useState(false);
  const [organizerQuestion, setOrganizerQuestion] = React.useState("");
  const [askingOrganizer, setAskingOrganizer] = React.useState(false);
  const [organizerQuestionSent, setOrganizerQuestionSent] =
    React.useState(false);
  const [organizerQuestions, setOrganizerQuestions] = React.useState<
    ContestCommunityQuestion[]
  >([]);
  const [organizerFeedLoading, setOrganizerFeedLoading] = React.useState(false);
  const [organizerFeedError, setOrganizerFeedError] = React.useState<
    string | null
  >(null);
  const organizerReadKey = `contest:${contestId}:${draftScopeFromUser(sessionUser)}:read-answers`;
  const [readOrganizerState, setReadOrganizerState] = React.useState<{
    key: string;
    answers: Record<string, string>;
  }>({ key: "", answers: {} });
  const readOrganizerAnswers =
    readOrganizerState.key === organizerReadKey
      ? readOrganizerState.answers
      : {};
  React.useEffect(() => {
    try {
      setReadOrganizerState({
        key: organizerReadKey,
        answers:
          safeJsonParse<Record<string, string>>(
            localStorage.getItem(organizerReadKey),
          ) ?? {},
      });
    } catch {
      setReadOrganizerState({ key: organizerReadKey, answers: {} });
    }
    setOrganizerQuestions([]);
  }, [organizerReadKey]);
  const unreadOrganizerAnswers = organizerQuestions.filter(
    (question) =>
      question.answer &&
      readOrganizerAnswers[question.id] !==
        `${question.answeredAt ?? ""}:${question.answer}`,
  );
  React.useEffect(() => {
    if (
      !organizerDialogOpen ||
      readOrganizerState.key !== organizerReadKey ||
      !unreadOrganizerAnswers.length
    )
      return;
    const updated = { ...readOrganizerAnswers };
    for (const question of unreadOrganizerAnswers)
      updated[question.id] = `${question.answeredAt ?? ""}:${question.answer}`;
    setReadOrganizerState({ key: organizerReadKey, answers: updated });
    try {
      localStorage.setItem(organizerReadKey, JSON.stringify(updated));
    } catch {
      /* Keep read state for this session. */
    }
  }, [
    organizerDialogOpen,
    organizerQuestions,
    readOrganizerAnswers,
    organizerReadKey,
    readOrganizerState.key,
  ]);
  const liveSyncInFlightRef = React.useRef(false);
  const liveSyncLastAtRef = React.useRef(0);

  const storageBase = React.useMemo(() => {
    if (!contestId || !problemId) return null;
    return `contest:${contestId}:problem:${problemId}:${draftScopeFromUser(sessionUser)}`;
  }, [contestId, problemId, sessionUser]);

  const loadSubmissions = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!contestId || !problemId || !hasToken) return;
      const silent = !!opts?.silent;
      if (!silent) setSubsLoading(true);
      try {
        if (isDevPreviewActive()) {
          setSubmissions([
            {
              id: 1,
              createdAt: new Date().toISOString(),
              phase: "CONTEST",
              language: "python",
              verdict: "AC",
              score: 100,
              maxScore: 100,
              testsPassed: 3,
              testsTotal: 3,
              compileErrorKind: null,
            },
          ]);
          setLatestVerdict("AC");
          return;
        }
        const res = await getContestProblemSubmissions(
          contestId,
          problemId,
          30,
        );
        const rows = Array.isArray(res.submissions) ? res.submissions : [];
        setSubmissions(rows);
        const topVerdict = normalizeVerdict(rows[0]?.verdict);
        if (topVerdict) {
          setLatestVerdict(topVerdict);
        }
      } catch {
        setSubmissions([]);
      } finally {
        if (!silent) setSubsLoading(false);
      }
    },
    [contestId, problemId, hasToken],
  );

  const syncLiveData = React.useCallback(
    async (force = false) => {
      const now = Date.now();
      if (!force && now - liveSyncLastAtRef.current < 5000) return;
      if (liveSyncInFlightRef.current) return;
      liveSyncInFlightRef.current = true;
      liveSyncLastAtRef.current = now;
      try {
        await loadSubmissions({ silent: true });
      } finally {
        liveSyncInFlightRef.current = false;
      }
    },
    [loadSubmissions],
  );

  const hydrateDraft = React.useCallback(
    (stmt: ContestProblemStatement) => {
      if (!storageBase) return;
      // The real contest editor can use every judge language. The local design
      // preview stays on its own seeded Python example and never submits to the judge.
      const allowed = isDevPreviewActive()
        ? stmt.task.allowedLanguages
        : enabledJudgeLanguages();
      const fallbackLang = stmt.task.defaultLanguage && allowed.includes(stmt.task.defaultLanguage)
        ? stmt.task.defaultLanguage
        : (allowed[0] ?? "java") as JudgeLanguage;

      try {
        const savedLang = localStorage.getItem(
          `${storageBase}:lang`,
        ) as JudgeLanguage | null;
        const nextLang =
          savedLang && allowed.includes(savedLang) ? savedLang : fallbackLang;
        setJudgeLanguage(nextLang);

        const savedCode = localStorage.getItem(
          `${storageBase}:draft:${nextLang}:code`,
        );
        const tpl = templateForLanguage(
          {
            template: stmt.task.template,
            templatesByLanguage: stmt.task.templatesByLanguage,
            defaultLanguage: stmt.task.defaultLanguage,
          },
          nextLang,
        );
        setCode(savedCode != null ? savedCode : tpl);

        const savedInput = localStorage.getItem(`${storageBase}:runInput`);
        setRunInput(
          savedInput ??
            (isDevPreviewActive()
              ? (examplesFromStatement(stmt.task.description)[0]?.input ?? "")
              : ""),
        );
      } catch {
        // ignore
      }
    },
    [storageBase],
  );

  const loadedProblemRef = React.useRef<string | null>(null);
  const statementRequestRef = React.useRef(0);
  const load = React.useCallback(async () => {
    if (!contestId || !problemId) return;

    const requestId = ++statementRequestRef.current;
    const problemKey = `${contestId}:${problemId}`;
    const retainWorkspace = loadedProblemRef.current === problemKey;
    if (!retainWorkspace) {
      setLoading(true);
      setContestProblems([]);
    }
    setError(null);
    try {
      if (isDevPreviewActive()) {
        const stmt = previewContestStatement(problemId, en);
        setContestProblems(previewContestProblems(en));
        setStatement(stmt);
        setContestMeta({
          contestId,
          title: en ? "Algorithm Saturday" : "Алгоритмічна субота",
          endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
          serverTime: new Date().toISOString(),
          syncedAt: Date.now(),
          finished: false,
          paused: false,
        });
        if (!retainWorkspace) hydrateDraft(stmt);
        loadedProblemRef.current = problemKey;
        return;
      }
      const [stmt, contest] = await Promise.all([
        getContestProblemStatement(contestId, problemId),
        getContestDetails(contestId),
      ]);
      if (requestId !== statementRequestRef.current) return;
      setStatement(stmt);
      setContestProblems(
        contest.problems.map((problem) =>
          problem.id === problemId
            ? { ...problem, title: stmt.task.title }
            : problem,
        ),
      );
      setContestMeta({
        contestId,
        title: contest.contest.title,
        endsAt: contest.access.personalEndsAt ?? contest.contest.endsAt,
        serverTime: contest.serverTime,
        syncedAt: Date.now(),
        finished: contest.phase.finished && !contest.access.isPaused,
        paused: Boolean(contest.access.isPaused),
      });
      if (!retainWorkspace) hydrateDraft(stmt);
      loadedProblemRef.current = problemKey;
    } catch (e: unknown) {
      if (requestId !== statementRequestRef.current) return;
      const msg = getErrorMessage(e);
      setError(msg || "Failed to load contest workspace");
      if (!retainWorkspace) setStatement(null);
    } finally {
      if (requestId === statementRequestRef.current) setLoading(false);
    }
  }, [contestId, problemId, hydrateDraft, en]);

  React.useEffect(() => {
    if (!contestId || contestMeta.contestId !== contestId || contestMeta.finished) return;
    let disposed = false;
    let timeoutId: number | undefined;
    const delayUntilRecheck = (endsAt: string | null, serverTime: string | null, paused: boolean) => {
      if (paused) return 5_000;
      const remainingMs = Date.parse(endsAt ?? "") - Date.parse(serverTime ?? "");
      return Number.isFinite(remainingMs)
        ? Math.max(1_000, Math.min(5_000, remainingMs + 1_000))
        : 5_000;
    };
    const refreshPhase = async () => {
      let nextDelay = 5_000;
      try {
        const contest = await getContestDetails(contestId);
        if (disposed) return;
        const endsAt = contest.access.personalEndsAt ?? contest.contest.endsAt;
        const paused = Boolean(contest.access.isPaused);
        const finished = contest.phase.finished && !paused;
        setContestMeta({
          contestId,
          title: contest.contest.title,
          endsAt,
          serverTime: contest.serverTime,
          syncedAt: Date.now(),
          finished,
          paused,
        });
        if (!finished) nextDelay = delayUntilRecheck(endsAt, contest.serverTime, paused);
      } catch {
        // Retry while this contest remains active; a temporary phase-read
        // failure must not expose post-contest assistance early.
      }
      if (!disposed) timeoutId = window.setTimeout(refreshPhase, nextDelay);
    };
    timeoutId = window.setTimeout(
      refreshPhase,
      delayUntilRecheck(contestMeta.endsAt, contestMeta.serverTime, contestMeta.paused),
    );
    return () => {
      disposed = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [contestId, contestMeta.contestId, contestMeta.finished]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  React.useEffect(() => {
    if (!statement || !storageBase) return;
    try {
      localStorage.setItem(`${storageBase}:lang`, judgeLanguage);
      localStorage.setItem(`${storageBase}:draft:${judgeLanguage}:code`, code);
      localStorage.setItem(`${storageBase}:runInput`, runInput);
      setDraftSavedAt(new Date().toISOString());
    } catch {
      setDraftSavedAt(null);
    }
  }, [statement, storageBase, judgeLanguage, code, runInput]);

  const switchLanguage = (nextLanguage: JudgeLanguage) => {
    if (!statement || nextLanguage === judgeLanguage) return;
    const template = templateForLanguage(
      {
        template: statement.task.template,
        templatesByLanguage: statement.task.templatesByLanguage,
        defaultLanguage: statement.task.defaultLanguage,
      },
      nextLanguage,
    );
    let nextCode = template;
    try {
      if (storageBase) {
        localStorage.setItem(`${storageBase}:lang`, judgeLanguage);
        localStorage.setItem(
          `${storageBase}:draft:${judgeLanguage}:code`,
          code,
        );
        nextCode =
          localStorage.getItem(`${storageBase}:draft:${nextLanguage}:code`) ??
          template;
      }
    } catch {
      // Use the language template when browser storage is unavailable.
    }
    setJudgeLanguage(nextLanguage);
    setJudgeCompiler(defaultCompilerForFamily(nextLanguage));
    setCode(nextCode);
    setRunResult(null);
    setCheckResult(null);
  };

  const saveDraft = () => {
    if (!storageBase) return;
    try {
      localStorage.setItem(`${storageBase}:lang`, judgeLanguage);
      localStorage.setItem(`${storageBase}:draft:${judgeLanguage}:code`, code);
      localStorage.setItem(`${storageBase}:runInput`, runInput);
      setDraftSavedAt(new Date().toISOString());
      setError(null);
    } catch {
      setError("Could not save this draft in browser storage.");
    }
  };

  React.useEffect(() => {
    if (isPreview) {
      setWsStatus("offline");
      return;
    }
    if (
      !liveUpdatesEnabled ||
      !contestId ||
      !hasToken ||
      typeof window === "undefined" ||
      typeof EventSource === "undefined"
    ) {
      setWsStatus("offline");
      return;
    }

    let closed = false;
    setWsStatus("connecting");

    const url = `${apiHttpBase()}/contests/${contestId}/events`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("ready", () => {
      if (!closed) setWsStatus("connected");
    });
    es.onopen = () => {
      if (!closed) setWsStatus("connected");
    };
    es.addEventListener("job", (event: MessageEvent) => {
      try {
        window.dispatchEvent(
          new CustomEvent("studycod:contest-job", {
            detail: JSON.parse(event.data),
          }),
        );
      } catch {
        /* malformed event */
      }
    });
    es.addEventListener("scoreboard", () => {
      if (!closed) syncLiveData(false);
    });
    es.addEventListener("announcement", (event) => {
      if (closed) return;
      const payload = safeJsonParse<ContestAnnouncementEvent>(
        String((event as MessageEvent).data ?? ""),
      );
      if (payload && Number.isFinite(Number(payload.id))) {
        setAnnouncements((prev) => {
          if (prev.some((a) => a.id === payload.id)) return prev;
          return [
            {
              id: Number(payload.id),
              text: String(payload.text ?? ""),
              author: String(payload.author ?? "organizer"),
              createdAt: new Date(payload.at ?? Date.now()).toISOString(),
            },
            ...prev,
          ];
        });
      }
    });
    es.onerror = () => {
      // EventSource auto-reconnects; reflect the transient state.
      if (!closed)
        setWsStatus(
          es.readyState === EventSource.CLOSED ? "offline" : "connecting",
        );
    };

    return () => {
      closed = true;
      try {
        es.close();
      } catch {
        // ignore
      }
    };
  }, [isPreview, liveUpdatesEnabled, contestId, hasToken, syncLiveData]);

  React.useEffect(() => {
    if (isPreview) return;
    const id = window.setInterval(
      () => {
        syncLiveData(false);
      },
      wsStatus === "connected" ? 20000 : 5000 + Math.random() * 1000,
    );
    return () => window.clearInterval(id);
  }, [isPreview, wsStatus, syncLiveData]);

  // Keep private answers and announcements available inside the workspace.
  React.useEffect(() => {
    if (isPreview) {
      setAnnouncements([
        {
          id: 1,
          author: "StudyCod",
          text: copy(
            "Зосередься на коректному виборі найменшого елемента.",
            "Focus on choosing the smallest element correctly.",
          ),
          createdAt: new Date().toISOString(),
        },
      ]);
      setOrganizerQuestions((current) =>
        current.length
          ? current
          : [
              {
                id: 1,
                author: copy("Ти", "You"),
                text: copy(
                  "Чи можуть числа повторюватися?",
                  "Can numbers repeat?",
                ),
                createdAt: "2026-10-11T09:00:00Z",
                answeredAt: "2026-10-11T09:05:00Z",
                answer: copy(
                  "Так, числа можуть повторюватися. Обирай найменший елемент серед тих, що залишилися.",
                  "Yes, numbers can repeat. Choose the smallest element among those remaining.",
                ),
                status: "ANSWERED",
              },
            ],
      );
      return;
    }
    if (!contestId || !hasToken) return;
    let cancelled = false;
    const tick = async () => {
      if (organizerDialogOpen) setOrganizerFeedLoading(true);
      try {
        const data = await getContestCommunity(contestId);
        if (!cancelled) {
          setAnnouncements(
            Array.isArray(data.announcements) ? data.announcements : [],
          );
          setOrganizerQuestions(
            Array.isArray(data.questions) ? data.questions : [],
          );
          setOrganizerFeedError(null);
        }
      } catch {
        if (!cancelled)
          setOrganizerFeedError(
            copy(
              "Не вдалося оновити відповіді. Спробуємо ще раз автоматично.",
              "Could not refresh replies. We will retry automatically.",
            ),
          );
      } finally {
        if (!cancelled) setOrganizerFeedLoading(false);
      }
    };
    void tick();
    const id = window.setInterval(tick, 25000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isPreview, contestId, hasToken, en, organizerDialogOpen]);

  // Integrity signals: report tab/focus loss and large pastes to the organizer.
  React.useEffect(() => {
    if (isPreview) return;
    if (!contestId || !hasToken) return;
    const report = (type: "FOCUS_LOST" | "PASTE", detail?: string) => {
      void recordContestIntegrityEvent(contestId, type, detail).catch(() => {});
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        report("FOCUS_LOST");
      }
    };
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData("text") ?? "";
      // Ignore trivial pastes; flag substantial code pastes.
      if (text.trim().length >= 40) report("PASTE", `${text.length} chars`);
    };
    document.addEventListener("visibilitychange", onHidden);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      document.removeEventListener("paste", onPaste);
    };
  }, [isPreview, contestId, hasToken]);

  const applyCheckResult = React.useCallback((res: ContestCheckResult) => {
    setCheckResult({
      verdict: res.verdict,
      testsPassed: res.testsPassed,
      testsTotal: res.testsTotal,
      score: res.score,
      maxScore: res.maxScore,
      compileError: res.compileError,
      groupScores: res.groupScores,
        publicTestResults: contestFirstFailureToPublicTestResults(res.firstFailure),
    });
  }, []);
  React.useEffect(() => {
    if (isPreview) return;
    if (!contestId || !problemId || !hasToken) return;
    let cancelled = false;
    const restore = async (kind: "check" | "run") => {
      if (!hasPendingContestJob(contestId, problemId, kind)) return;
      if (kind === "check") setChecking(true);
      else setRunning(true);
      try {
        const result = await resumeContestJob<
          ContestCheckResult | ContestRunResult
        >(contestId, problemId, kind, (status, progress) => {
          if (!cancelled) {
            setJobStatus(status);
            if (kind === "check") setCheckProgress(progress ?? null);
          }
        });
        if (!cancelled && result) {
          if (kind === "check") applyCheckResult(result as ContestCheckResult);
          else setRunResult(result as ContestRunResult);
          void syncLiveData(true);
        }
      } catch (error) {
        if (!cancelled) setError(getErrorMessage(error));
      } finally {
        if (!cancelled) {
          if (kind === "check") setChecking(false);
          else setRunning(false);
        }
      }
    };
    void restore("check");
    void restore("run");
    return () => {
      cancelled = true;
    };
  }, [
    isPreview,
    contestId,
    problemId,
    hasToken,
    applyCheckResult,
    syncLiveData,
  ]);

  const doRun = async () => {
    if (!contestId || !problemId || !statement) return;
    if (running || checking) return;
    if (!hasToken) {
      setError("Please log in to run code.");
      return;
    }

    setRunResult(null);
    setRunning(true);
    try {
      const res = isPreview
        ? {
            stdout: runInput.trim() ? "2 7" : "2 7",
            stderr: "",
            exitCode: 0,
            success: true,
            verdict: "OK",
            timeMs: 1,
            memoryKb: 128,
          }
        : await runContestProblem(
            {
              contestId,
              problemId,
              language: judgeLanguage,
              compiler: judgeCompiler,
              input: runInput,
              code,
            },
            setJobStatus,
          );
      setRunResult(res);
      setError(null);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || "Run failed");
      setRunResult(null);
    } finally {
      setRunning(false);
    }
  };

  const doTrace = async () => {
    if (!statement || tracing || !code.trim()) return;
    if (isPreview) {
      setError(null);
      return;
    }
    setTracing(true);
    try {
      const result = await tracePlayground({
        language: judgeLanguage,
        code,
        stdin: runInput || undefined,
      });
      setTrace(result);
    } catch (e: unknown) {
      setError(getErrorMessage(e) || "Trace failed");
    } finally {
      setTracing(false);
    }
  };

  const doSubmit = async () => {
    if (!contestId || !problemId || !statement) return;
    if (running || checking) return;
    if (!hasToken) {
      setError("Please log in to submit.");
      return;
    }
    const submittedProblemKey = activeProblemKey;
    const isCurrentProblem = () =>
      activeProblemRef.current === submittedProblemKey;
    setCheckResult(null);
    setCheckProgress(null);
    setJobStatus("queued");
    setChecking(true);
    try {
      // This fixture only runs in the development preview; live progress comes from the judge.
      if (isPreview) {
        setJobStatus("running");
        const previewProgress: JudgeProgress = {
          phase: "compiling",
          testsTotal: 3,
          testsCompleted: 0,
          groupsTotal: 3,
          groupIndex: null,
          group: null,
          groupTest: null,
          groupTestsTotal: null,
        };
        setCheckProgress(previewProgress);
        await new Promise((resolve) => setTimeout(resolve, 700));
        for (let group = 1; group <= 3; group++) {
          if (!isCurrentProblem()) return;
          setCheckProgress({
            ...previewProgress,
            phase: "testing",
            group: String(group),
            groupIndex: group,
            testsCompleted: group - 1,
            groupTest: 1,
            groupTestsTotal: 1,
          });
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }
        if (!isCurrentProblem()) return;
        setCheckProgress({
          ...previewProgress,
          phase: "finishing",
          testsCompleted: 3,
        });
        await new Promise((resolve) => setTimeout(resolve, 300));
        setJobStatus("completed");
      }
      const res: ContestCheckResult = isPreview
        ? {
            submissionId: Date.now(),
            phase: "CONTEST",
            verdict: "AC",
            testsPassed: 3,
            testsTotal: 3,
            score: 100,
            maxScore: 100,
            compileError: null,
            compileErrorKind: null,
            groupScores: [
              { group: "1", score: 30, maxScore: 30 },
              { group: "2", score: 30, maxScore: 30 },
              { group: "3", score: 40, maxScore: 40 },
            ],
          }
        : await checkContestProblem(
            {
              contestId,
              problemId,
              language: judgeLanguage,
              compiler: judgeCompiler,
              code,
            },
            (status, progress) => {
              if (isCurrentProblem()) {
                setJobStatus(status);
                setCheckProgress(progress ?? null);
              }
            },
          );
      if (!isCurrentProblem()) return;
      applyCheckResult(res);
      setError(null);
      setLatestVerdict(normalizeVerdict(res.verdict));
      setLatestVerdictAt(Date.now());
      if (isPreview)
        setSubmissions((current) => [
          {
            id: res.submissionId,
            createdAt: new Date().toISOString(),
            phase: "CONTEST",
            language: judgeLanguage,
            verdict: res.verdict,
            score: res.score,
            maxScore: res.maxScore,
            testsPassed: res.testsPassed,
            testsTotal: res.testsTotal,
            compileErrorKind: res.compileErrorKind,
          },
          ...current,
        ]);
      else syncLiveData(true);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      if (isCurrentProblem()) setError(msg || "Submission failed");
    } finally {
      if (isCurrentProblem()) setChecking(false);
    }
  };

  const askOrganizer = async (question: string) => {
    if (
      !contestId ||
      !problemId ||
      !hasToken ||
      !statement ||
      askingOrganizer ||
      !question.trim()
    )
      return;
    const message = [
      `${copy("Питання щодо задачі", "Question about problem")} ${statement.problem.label}: ${statement.task.title}`,
      "",
      question.trim(),
    ].join("\n");

    setAskingOrganizer(true);
    try {
      if (isPreview) {
        setOrganizerQuestions((current) => [
          {
            id: Date.now(),
            author: copy("Ти", "You"),
            text: message,
            createdAt: new Date().toISOString(),
            answer: null,
            answeredAt: null,
            status: "OPEN",
          },
          ...current,
        ]);
        setOrganizerQuestion("");
        setOrganizerQuestionSent(true);
        return;
      }
      const result = await postContestCommunityQuestion(contestId, message);
      setOrganizerQuestions((current) => [...current, result.question]);
      setOrganizerQuestion("");
      setOrganizerQuestionSent(true);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setOrganizerFeedError(
        msg ||
          copy("Не вдалося надіслати питання.", "Could not send the question."),
      );
    } finally {
      setAskingOrganizer(false);
    }
  };

  if (loading) {
    return (
      <div data-contest-safety-background="" className="p-3 sm:p-4 md:p-6">
        <Card className="p-4">
          <Skeleton className="h-8 w-2/3 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-6" />
          <Skeleton className="h-[70vh] w-full" />
        </Card>
        {!isPreview ? <ContestSafetyGate contestId={contestId} /> : null}
      </div>
    );
  }

  if (error && !statement) {
    return (
      <div data-contest-safety-background="" className="p-3 sm:p-4 md:p-6">
        <Card className="p-4">
          <div
            role="alert"
            aria-live="assertive"
            className="text-sm text-accent-error"
          >
            {error}
          </div>
          <Button
            variant="secondary"
            onClick={() => void load()}
            className="mt-4 h-10 px-4"
          >
            Try again
          </Button>
        </Card>
        {!isPreview ? <ContestSafetyGate contestId={contestId} onUnlocked={() => void load()} /> : null}
      </div>
    );
  }

  if (!statement) return isPreview ? null : <ContestSafetyGate contestId={contestId} onUnlocked={() => void load()} />;

  const entryFile = JUDGE_ENTRY_FILES[judgeLanguage];
  const publicExamples = examplesFromStatement(statement.task.description);
  const orderedContestProblems = [...contestProblems].sort(
    (a, b) => a.order - b.order,
  );
  const openContestProblem = (target: ContestProblemListItem) => {
    navigate(
      withDevPreview(`/contest/contests/${contestId}/problems/${target.id}`),
    );
  };
  const latestAnnouncement = announcements[0] ?? null;
  const showAnnouncement =
    latestAnnouncement && latestAnnouncement.id !== dismissedAnnouncementId;

  return (
    <div data-contest-safety-background="" className="contest-problem-solve ide-contest-page bg-bg-base text-text-primary">
      {!isPreview ? <ContestSafetyGate contestId={contestId} onUnlocked={() => void load()} /> : null}
      {showAnnouncement ? (
        <aside
          className="flex items-start gap-3 rounded-lg border border-border px-4 py-2 sm:items-center"
          aria-live="polite"
        >
          <Radio className="mt-0.5 size-4 shrink-0 text-primary-strong dark:text-[var(--ide-accent)] sm:mt-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-text-secondary">
              {copy("Оголошення організатора", "Organizer announcement")}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-text-primary dark:text-text-primary">
              {latestAnnouncement.text}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDismissedAnnouncementId(latestAnnouncement.id)}
            className="grid size-8 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-bg-hover hover:text-text-primary dark:text-[var(--ide-muted)] dark:hover:bg-white/[.06] dark:hover:text-white"
            aria-label={copy("Закрити оголошення", "Close announcement")}
          >
            <X className="size-4" />
          </button>
        </aside>
      ) : null}

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-3 rounded-xl border border-accent-error/30 bg-accent-error/10 px-3 py-2.5 text-sm text-accent-error"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 rounded-md p-1 hover:bg-white/[.08]"
            aria-label={copy(
              "Закрити повідомлення про помилку",
              "Close error message",
            )}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
      {jobStatus && !checking && (
        <div
          role="status"
          className="px-4 py-2 text-sm text-primary-strong dark:text-emerald-200"
        >
          {jobStatus === "queued"
            ? copy("У черзі", "Queued")
            : jobStatus === "running"
              ? copy("Перевіряється", "Checking")
              : jobStatus === "completed"
                ? copy("Готово", "Done")
                : copy(
                    "Помилка судді — відправку збережено",
                    "Judge error — submission saved",
                  )}
        </div>
      )}
      <StudyCodIDEWorkspace
        enableSemanticLsp={false}
        task={{
          id: `contest-${contestId}-${problemId}`,
          title: statement.task.title,
          description: statement.task.description,
          timeLimitMs: statement.task.timeLimitMs,
          memoryLimitMb: statement.task.memoryLimitMb,
          limitsByLanguage: statement.task.limitsByLanguage,
          statementLanguage: statement.task.statementLanguage,
          section: `${copy("Контест", "Contest")} · ${contestMeta.title}`,
        }}
        theory={null}
        language={judgeLanguage}
        onLanguageChange={switchLanguage}
        compiler={judgeCompiler}
        onCompilerChange={setJudgeCompiler}
        languageOptions={enabledJudgeLanguages()}
        code={code}
        onCodeChange={setCode}
        files={[{ path: entryFile, content: code }]}
        onFilesChange={(nextFiles) =>
          setCode(
            nextFiles.find((file) => file.path === entryFile)?.content ??
              nextFiles[0]?.content ??
              "",
          )
        }
        useFiles={false}
        onEnableFiles={() => undefined}
        entryFile={entryFile}
        stdin={runInput}
        onStdinChange={setRunInput}
        firstExampleInput={publicExamples[0]?.input}
        onUseExampleInput={() => setRunInput(publicExamples[0]?.input ?? "")}
        publicExamples={publicExamples}
        running={running}
        checking={checking}
        checkProgress={checkProgress}
        checkStatus={jobStatus ?? undefined}
        onRun={() => void doRun()}
        onCheck={() => void doSubmit()}
        onSave={saveDraft}
        onReset={() => {
          setCode(
            templateForLanguage(
              {
                template: statement.task.template,
                templatesByLanguage: statement.task.templatesByLanguage,
                defaultLanguage: statement.task.defaultLanguage,
              },
              judgeLanguage,
            ),
          );
          setRunResult(null);
          setCheckResult(null);
        }}
        onBack={() =>
          navigate(withDevPreview(`/contest/contests/${contestId ?? ""}`))
        }
        runResult={runResult}
        checkResult={checkResult}
        attemptsUsed={submissions.length}
        resultCards={
          submissions.length ? (
            <section
              className="ide-submissions"
              aria-label={copy("Останні надсилання", "Recent submissions")}
            >
              <div className="ide-submissions-heading">
                <h3>{copy("Останні надсилання", "Recent submissions")}</h3>
                <span>
                  {submissions.length}
                  {submissions.length === 30 ? "+" : ""}
                </span>
              </div>
              {submissions.slice(0, 4).map((submission) => (
                <div key={submission.id} className="ide-submission-row">
                  <span
                    className="ide-submission-verdict"
                    data-state={
                      String(submission.verdict ?? "").toUpperCase() === "AC"
                        ? "accepted"
                        : submission.verdict
                          ? "failed"
                          : "waiting"
                    }
                  >
                    {submission.verdict || copy("В черзі", "Queued")}
                  </span>
                  <time dateTime={submission.createdAt ?? undefined}>
                    {submission.createdAt
                      ? new Date(submission.createdAt).toLocaleTimeString(
                          en ? "en-US" : "uk-UA",
                          { hour: "2-digit", minute: "2-digit" },
                        )
                      : copy("Щойно", "Just now")}
                  </time>
                  <span className="ide-submission-score">
                    {submission.score ?? 0} / {submission.maxScore ?? 0}
                  </span>
                </div>
              ))}
            </section>
          ) : null
        }
        disableAiAssistance={!contestMeta.finished || contestMeta.paused || contestMeta.contestId !== contestId}
        submitMode
        saveStatus={draftSavedAt ? "saved" : "dirty"}
        lastSavedAt={draftSavedAt}
        trace={trace}
        tracing={tracing}
        onTrace={doTrace}
        problemNavigation={{
          items: orderedContestProblems,
          activeId: problemId ?? statement.problem.id,
          onSelect: (id) => {
            const target = orderedContestProblems.find(
              (problem) => problem.id === id,
            );
            if (target) openContestProblem(target);
          },
          footer: (
            <>
              <button
                type="button"
                onClick={() => {
                  setOrganizerQuestionSent(false);
                  setOrganizerDialogOpen(true);
                }}
                className="ide-icon-btn ide-organizer-rail-button"
                aria-label={
                  unreadOrganizerAnswers.length
                    ? copy(
                        "Питання організатору: є нова відповідь",
                        "Ask organizer: new reply",
                      )
                    : copy("Питання організатору", "Ask organizer")
                }
                title={
                  unreadOrganizerAnswers.length
                    ? copy("Нова відповідь організатора", "New organizer reply")
                    : copy("Питання організатору", "Ask organizer")
                }
              >
                <MessageSquareText />
                {unreadOrganizerAnswers.length ? (
                  <span className="ide-unread-dot" aria-hidden="true" />
                ) : null}
              </button>
              <Link
                to={withDevPreview(`/contest/contests/${contestId}/scoreboard`)}
                className="ide-icon-btn"
                aria-label={copy("Таблиця контесту", "Contest scoreboard")}
                title={copy("Таблиця контесту", "Contest scoreboard")}
              >
                <Trophy />
              </Link>
            </>
          ),
        }}
        toolbarStatus={
          <>
            {!isPreview ? (
              <span
                className="ide-connection inline-flex items-center gap-1.5 text-[11px]"
                title={copy("Стан живих оновлень", "Live update status")}
              >
                <span
                  className={`size-1.5 rounded-full ${wsStatus === "connected" ? "bg-[var(--ide-accent)]" : "bg-[var(--ide-muted)]"}`}
                />
                {wsStatus === "connected"
                  ? copy("На зв’язку", "Connected")
                  : wsStatus === "connecting"
                    ? copy("Синхронізація", "Syncing")
                    : copy("Офлайн", "Offline")}
              </span>
            ) : null}
            {contestMeta.endsAt ? (
              <ContestWorkspaceTimer endsAt={contestMeta.endsAt} en={en} />
            ) : null}
            {latestVerdict ? (
              <span
                className="ide-connection text-[11px] font-semibold"
                title={copy("Останній результат", "Latest result")}
              >
                {latestVerdict}
              </span>
            ) : null}
          </>
        }
      />

      <Modal
        open={organizerDialogOpen}
        onClose={() => setOrganizerDialogOpen(false)}
        title={copy("Питання організатору", "Ask the organizer")}
        description={copy(
          "Постав питання щодо контесту. Відповідь організатора з’явиться тут.",
          "Ask a question about the contest. The organizer’s reply will appear here.",
        )}
        panelClassName="max-w-[620px]!"
      >
        <section
          className="mb-5 space-y-3"
          aria-label={copy(
            "Твої питання та відповіді",
            "Your questions and replies",
          )}
        >
          {organizerFeedLoading ? (
            <p role="status" className="text-xs text-text-muted">
              {copy("Оновлюємо відповіді…", "Refreshing replies…")}
            </p>
          ) : null}
          {organizerFeedError ? (
            <p role="alert" className="text-sm text-accent-error">
              {organizerFeedError}
            </p>
          ) : null}
          {!organizerQuestions.length && !organizerFeedLoading ? (
            <p className="text-sm text-text-muted">
              {copy(
                "Тут зберігатимуться твої питання та відповіді організатора.",
                "Your questions and the organizer’s replies will be saved here.",
              )}
            </p>
          ) : null}
          {[...organizerQuestions]
            .sort((a, b) => b.id - a.id)
            .map((question) => (
              <article
                key={question.id}
                className="rounded-lg border border-border p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3 text-xs text-text-muted">
                  <span>{copy("Твоє питання", "Your question")}</span>
                  <span>
                    {question.answer
                      ? copy("Є відповідь", "Answered")
                      : copy("Очікує відповіді", "Waiting for a reply")}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                  {question.text}
                </p>
                {question.answer ? (
                  <div className="mt-3 border-t border-border pt-3">
                    <h3 className="mb-1 text-xs font-semibold text-primary-strong">
                      {copy("Відповідь організатора", "Organizer reply")}
                    </h3>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-text-primary">
                      {question.answer}
                    </p>
                  </div>
                ) : null}
              </article>
            ))}
        </section>
        {organizerQuestionSent ? (
          <p role="status" className="mb-4 text-sm text-primary-strong">
            {copy(
              "Питання надіслано. Повідомимо, коли організатор відповість.",
              "Question sent. We will let you know when the organizer replies.",
            )}
          </p>
        ) : null}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void askOrganizer(organizerQuestion);
          }}
          className="space-y-4"
        >
          <label
            className="block text-sm font-semibold text-text-primary"
            htmlFor="contest-organizer-question"
          >
            {copy("Твоє питання", "Your question")}
          </label>
          <textarea
            id="contest-organizer-question"
            value={organizerQuestion}
            onChange={(event) => setOrganizerQuestion(event.target.value)}
            rows={5}
            maxLength={4000}
            required
            placeholder={copy(
              "Опиши проблему з умовою, доступом або проведенням контесту…",
              "Describe an issue with the problem, access, or contest…",
            )}
            className="w-full resize-y rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">
              {organizerQuestion.length}/4000
            </span>
            <Button
              type="submit"
              disabled={askingOrganizer || !organizerQuestion.trim()}
            >
              {askingOrganizer
                ? copy("Надсилаємо…", "Sending…")
                : copy("Надіслати питання", "Send question")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
