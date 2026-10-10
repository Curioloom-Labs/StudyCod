import React from "react";
import { hasPendingContestJob, resumeContestJob, type ContestJobStatus } from "../../lib/api/contestJobs";
import type { ContestCheckResult, ContestRunResult } from "../../lib/api/contests";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MessageSquareText, Radio, Trophy, X } from "lucide-react";
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
  type ContestProblemStatement,
  type ContestSubmissionListItem,
  type JudgeLanguage,
} from "../../lib/api/contests";
import { JUDGE_ENTRY_FILES, enabledJudgeLanguages, defaultCompilerForFamily, templateForJudgeLanguage } from "../../lib/judgeLanguages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { Skeleton } from "../../components/ui/Skeleton";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { tracePlayground, type TraceResult } from "../../lib/api/playground";
import { getCachedMeUser } from "../../lib/api/profile";
import { isDevPreviewActive, withDevPreview } from "../../lib/devPreview";

type TurnstileRenderOptions = {
  sitekey: string;
  theme?: "light" | "dark" | "auto";
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => TurnstileWidgetId;
  reset: (widgetId?: TurnstileWidgetId) => void;
  remove?: (widgetId?: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type ContestMeta = {
  title: string;
  endsAt: string | null;
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

function examplesFromStatement(markdown: string): Array<{ testId: number; input: string; expectedOutput: string }> {
  const blocks = Array.from(String(markdown ?? "").matchAll(/```(?:[\w+-]*)\n([\s\S]*?)```/g))
    .map((match) => String(match[1] ?? "").trim());
  const examples: Array<{ testId: number; input: string; expectedOutput: string }> = [];
  for (let index = 0; index < blocks.length; index += 2) {
    const input = blocks[index] ?? "";
    const expectedOutput = blocks[index + 1] ?? "";
    if (input || expectedOutput) examples.push({ testId: examples.length + 1, input, expectedOutput });
  }
  return examples;
}

function templateForLanguage(task: { template: string; templatesByLanguage: Record<string, string> | null; defaultLanguage?: JudgeLanguage }, lang: JudgeLanguage) {
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
  const raw = String(import.meta.env.VITE_API_URL || (typeof window !== "undefined" ? window.location.origin : "")).trim();
  const base = raw.replace(/\/+$/, "").replace(/\/api\/?$/i, "");
  return `${base}/api`;
}

function normalizeVerdict(v: string | null | undefined): string | null {
  const raw = String(v ?? "").trim();
  return raw || null;
}

const previewContestStatement = (problemId: number): ContestProblemStatement => ({
  problem: { id: problemId, order: 1, label: "A" },
  task: {
    id: 41,
    title: "Тиха перестановка",
    description: "Знайди найменше значення та його номер у послідовності.\n\nВхідні дані\n```text\n5\n12 7 7 18 9\n```\nВихідні дані\n```text\n2 7\n```",
    template: "values = list(map(int, input().split()))\nindex = min(range(len(values)), key=values.__getitem__)\nprint(index + 1, values[index])\n",
    templatesByLanguage: { python: "values = list(map(int, input().split()))\nindex = min(range(len(values)), key=values.__getitem__)\nprint(index + 1, values[index])\n" },
    defaultLanguage: "python",
    allowedLanguages: ["python"],
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    outputLimitKb: 64,
    checkerSpec: null,
  },
});

export const ContestProblemSolvePage: React.FC = () => {
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
  const turnstileSiteKey = React.useMemo(() => String(import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim(), []);
  // Live updates (SSE) are on by default; can be disabled explicitly.
  const liveUpdatesEnabled = React.useMemo(() => {
    const raw = String(import.meta.env.VITE_ENABLE_CONTEST_WS ?? "").trim().toLowerCase();
    return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
  }, []);
  const turnstileEnabled = React.useMemo(() => {
    const raw = String(import.meta.env.VITE_ENABLE_CONTEST_SUBMIT_TURNSTILE ?? "").trim().toLowerCase();
    const enabled = raw === "1" || raw === "true" || raw === "yes" || raw === "on";
    return enabled && turnstileSiteKey.length > 0;
  }, [turnstileSiteKey]);
  const turnstileContainerRef = React.useRef<HTMLDivElement | null>(null);
  const turnstileWidgetIdRef = React.useRef<TurnstileWidgetId | null>(null);
  const [turnstileScriptReady, setTurnstileScriptReady] = React.useState(false);
  const [turnstileLoadFailed, setTurnstileLoadFailed] = React.useState(false);
  const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statement, setStatement] = React.useState<ContestProblemStatement | null>(null);
  const [contestMeta, setContestMeta] = React.useState<ContestMeta>({ title: "Contest", endsAt: null });

  const [judgeLanguage, setJudgeLanguage] = React.useState<JudgeLanguage>("java");
  const [judgeCompiler, setJudgeCompiler] = React.useState<string>(defaultCompilerForFamily("java"));
  // Reset compiler to the family default whenever the language changes.
  React.useEffect(() => { setJudgeCompiler(defaultCompilerForFamily(judgeLanguage)); }, [judgeLanguage]);
  const [code, setCode] = React.useState("");
  const [runInput, setRunInput] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [jobStatus, setJobStatus] = React.useState<ContestJobStatus | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [runResult, setRunResult] = React.useState<StudyCodIdeRunResult | null>(null);
  const [checkResult, setCheckResult] = React.useState<StudyCodIdeCheckResult | null>(null);
  const [trace, setTrace] = React.useState<TraceResult | null>(null);
  const [tracing, setTracing] = React.useState(false);

  const [subsLoading, setSubsLoading] = React.useState(false);
  const [submissions, setSubmissions] = React.useState<ContestSubmissionListItem[]>([]);

  const [wsStatus, setWsStatus] = React.useState<"connecting" | "connected" | "offline">("offline");
  const [latestVerdict, setLatestVerdict] = React.useState<string | null>(null);
  const [latestVerdictAt, setLatestVerdictAt] = React.useState(0);

  const [announcements, setAnnouncements] = React.useState<ContestCommunityAnnouncement[]>([]);
  const [dismissedAnnouncementId, setDismissedAnnouncementId] = React.useState<number | null>(null);
  const [draftSavedAt, setDraftSavedAt] = React.useState<string | null>(null);
  const [organizerDialogOpen, setOrganizerDialogOpen] = React.useState(false);
  const [organizerQuestion, setOrganizerQuestion] = React.useState("");
  const [askingOrganizer, setAskingOrganizer] = React.useState(false);
  const [organizerQuestionSent, setOrganizerQuestionSent] = React.useState(false);
  const liveSyncInFlightRef = React.useRef(false);
  const liveSyncLastAtRef = React.useRef(0);

  const storageBase = React.useMemo(() => {
    if (!contestId || !problemId) return null;
    return `contest:${contestId}:problem:${problemId}:${draftScopeFromUser(sessionUser)}`;
  }, [contestId, problemId, sessionUser]);

  const loadSubmissions = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!contestId || !problemId || !hasToken) return;
    const silent = !!opts?.silent;
    if (!silent) setSubsLoading(true);
    try {
      if (isDevPreviewActive()) {
        setSubmissions([{ id: 1, createdAt: new Date().toISOString(), phase: "CONTEST", language: "python", verdict: "AC", score: 100, maxScore: 100, testsPassed: 3, testsTotal: 3, compileErrorKind: null }]);
        setLatestVerdict("AC");
        return;
      }
      const res = await getContestProblemSubmissions(contestId, problemId, 30);
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
  }, [contestId, problemId, hasToken]);

  const syncLiveData = React.useCallback(async (force = false) => {
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
  }, [loadSubmissions]);

  const hydrateDraft = React.useCallback(
    (stmt: ContestProblemStatement) => {
      if (!storageBase) return;
      // The real contest editor can use every judge language. The local design
      // preview stays on its own seeded Python example and never submits to the judge.
      const allowed = isDevPreviewActive() ? stmt.task.allowedLanguages : enabledJudgeLanguages();
      const fallbackLang = (allowed[0] ?? "java") as JudgeLanguage;

      try {
        const savedLang = localStorage.getItem(`${storageBase}:lang`) as JudgeLanguage | null;
        const nextLang = savedLang && allowed.includes(savedLang) ? savedLang : fallbackLang;
        setJudgeLanguage(nextLang);

        const savedCode = localStorage.getItem(`${storageBase}:draft:${nextLang}:code`);
      const tpl = templateForLanguage({ template: stmt.task.template, templatesByLanguage: stmt.task.templatesByLanguage, defaultLanguage: stmt.task.defaultLanguage }, nextLang);
        setCode(savedCode != null ? savedCode : tpl);

        const savedInput = localStorage.getItem(`${storageBase}:runInput`);
        setRunInput(savedInput ?? (isDevPreviewActive() ? "5\n12 7 7 18 9" : ""));

      } catch {
        // ignore
      }
    },
    [storageBase]
  );

  const load = React.useCallback(async () => {
    if (!contestId || !problemId) return;

    setLoading(true);
    setError(null);
    try {
      if (isDevPreviewActive()) {
        const stmt = previewContestStatement(problemId);
        setStatement(stmt);
        setContestMeta({ title: "Алгоритмічна субота", endsAt: new Date(Date.now() + 60 * 60_000).toISOString() });
        hydrateDraft(stmt);
        return;
      }
      const [stmt, contest] = await Promise.all([getContestProblemStatement(contestId, problemId), getContestDetails(contestId)]);
      setStatement(stmt);
      setContestMeta({
        title: contest.contest.title,
        endsAt: contest.contest.endsAt,
      });
      hydrateDraft(stmt);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || "Failed to load contest workspace");
      setStatement(null);
    } finally {
      setLoading(false);
    }
  }, [contestId, problemId, hydrateDraft]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  React.useEffect(() => {
    if (!turnstileEnabled) return;
    if (isPreview) return;

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (window.turnstile) {
      setTurnstileLoadFailed(false);
      setTurnstileScriptReady(true);
      return;
    }
    if (existing) {
      const onLoad = () => setTurnstileScriptReady(true);
      const onError = () => {
        setTurnstileLoadFailed(true);
        setError("Human verification widget failed to load. Submission will continue via server-side check.");
      };
      existing.addEventListener("load", onLoad);
      existing.addEventListener("error", onError);
      return () => {
        existing.removeEventListener("load", onLoad);
        existing.removeEventListener("error", onError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      setTurnstileLoadFailed(false);
      setTurnstileScriptReady(true);
    };
    script.onerror = () => {
      setTurnstileLoadFailed(true);
      setError("Failed to load human verification widget. Submission will continue via server-side check.");
    };
    document.head.appendChild(script);

    return () => {
      // Keep shared script in document for other pages.
    };
  }, [isPreview, turnstileEnabled]);

  React.useEffect(() => {
    if (!turnstileEnabled || !turnstileScriptReady) return;
    if (isPreview) return;
    const container = turnstileContainerRef.current;
    if (!container || !window.turnstile) return;

    if (turnstileWidgetIdRef.current == null) {
      try {
        const widgetId = window.turnstile.render(container, {
          sitekey: turnstileSiteKey,
          theme: "auto",
          callback: (value) => setTurnstileToken(String(value ?? "") || null),
          "expired-callback": () => setTurnstileToken(null),
          "error-callback": () => setTurnstileToken(null),
        });
        turnstileWidgetIdRef.current = widgetId;
      } catch {
        setTurnstileLoadFailed(true);
        setError("Human verification widget failed to initialize. Submission will continue via server-side check.");
      }
    }

    return () => {
      if (!window.turnstile) return;
      if (turnstileWidgetIdRef.current != null && typeof window.turnstile.remove === "function") {
        window.turnstile.remove(turnstileWidgetIdRef.current);
      }
      turnstileWidgetIdRef.current = null;
      setTurnstileToken(null);
    };
  }, [isPreview, turnstileEnabled, turnstileScriptReady, turnstileSiteKey]);

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
      { template: statement.task.template, templatesByLanguage: statement.task.templatesByLanguage, defaultLanguage: statement.task.defaultLanguage },
      nextLanguage,
    );
    let nextCode = template;
    try {
      if (storageBase) {
        localStorage.setItem(`${storageBase}:lang`, judgeLanguage);
        localStorage.setItem(`${storageBase}:draft:${judgeLanguage}:code`, code);
        nextCode = localStorage.getItem(`${storageBase}:draft:${nextLanguage}:code`) ?? template;
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
    if (isPreview) { setWsStatus("offline"); return; }
    if (!liveUpdatesEnabled || !contestId || !hasToken || typeof window === "undefined" || typeof EventSource === "undefined") {
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
      try { window.dispatchEvent(new CustomEvent("studycod:contest-job", { detail: JSON.parse(event.data) })); } catch { /* malformed event */ }
    });
    es.addEventListener("scoreboard", () => {
      if (!closed) syncLiveData(false);
    });
    es.addEventListener("announcement", (event) => {
      if (closed) return;
      const payload = safeJsonParse<ContestAnnouncementEvent>(String((event as MessageEvent).data ?? ""));
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
      if (!closed) setWsStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
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
    const id = window.setInterval(() => {
      syncLiveData(false);
    }, wsStatus === "connected" ? 20000 : 5000 + Math.random() * 1000);
    return () => window.clearInterval(id);
  }, [isPreview, wsStatus, syncLiveData]);

  // Poll organizer announcements so participants see them without leaving the workspace.
  React.useEffect(() => {
    if (isPreview) { setAnnouncements([{ id: 1, author: "StudyCod", text: "Зосередься на коректному виборі найменшого елемента." , createdAt: new Date().toISOString() }]); return; }
    if (!contestId || !hasToken) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const data = await getContestCommunity(contestId);
        if (!cancelled) setAnnouncements(Array.isArray(data.announcements) ? data.announcements : []);
      } catch {
        // ignore (access/network)
      }
    };
    void tick();
    const id = window.setInterval(tick, 25000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isPreview, contestId, hasToken]);

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
      const firstPublicFailure = res.firstFailure && !res.firstFailure.hidden ? res.firstFailure : null;
      setCheckResult({
        verdict: res.verdict,
        testsPassed: res.testsPassed,
        testsTotal: res.testsTotal,
        score: res.score,
        maxScore: res.maxScore,
        compileError: res.compileError,
        groupScores: res.groupScores,
        publicTestResults: firstPublicFailure ? [{
          testId: firstPublicFailure.index,
          input: firstPublicFailure.input,
          expectedOutput: firstPublicFailure.expected,
          actualOutput: firstPublicFailure.actual,
          passed: false,
          verdict: firstPublicFailure.verdict,
          stderr: firstPublicFailure.stderr,
        }] : [],
      });
  }, []);
  React.useEffect(() => {
    if (isPreview) return;
    if (!contestId || !problemId || !hasToken) return;
    let cancelled = false;
    const restore = async (kind: "check" | "run") => {
      if (!hasPendingContestJob(contestId, problemId, kind)) return;
      if (kind === "check") setChecking(true); else setRunning(true);
      try {
        const result = await resumeContestJob<ContestCheckResult | ContestRunResult>(contestId, problemId, kind,
          status => { if (!cancelled) setJobStatus(status); });
        if (!cancelled && result) {
          if (kind === "check") applyCheckResult(result as ContestCheckResult);
          else setRunResult(result as ContestRunResult);
          void syncLiveData(true);
        }
      } catch (error) { if (!cancelled) setError(getErrorMessage(error)); }
      finally { if (!cancelled) { if (kind === "check") setChecking(false); else setRunning(false); } }
    };
    void restore("check"); void restore("run");
    return () => { cancelled = true; };
  }, [isPreview, contestId, problemId, hasToken, applyCheckResult, syncLiveData]);

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
      const res = isPreview ? {
        stdout: runInput.trim() ? "2 7" : "2 7",
        stderr: "",
        exitCode: 0,
        success: true,
        verdict: "OK",
        timeMs: 1,
        memoryKb: 128,
      } : await runContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        compiler: judgeCompiler,
        input: runInput,
        code,
      }, setJobStatus);
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
    if (isPreview) { setError(null); return; }
    setTracing(true);
    try {
      const result = await tracePlayground({ language: judgeLanguage, code, stdin: runInput || undefined });
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
    const tokenForSubmit = turnstileToken ?? undefined;

    setCheckResult(null);
    setChecking(true);
    try {
      const res: ContestCheckResult = isPreview ? {
        submissionId: Date.now(), phase: "CONTEST", verdict: "AC", testsPassed: 3, testsTotal: 3,
        score: 100, maxScore: 100, compileError: null, compileErrorKind: null,
        groupScores: [{ group: "Основні тести", score: 100, maxScore: 100 }],
      } : await checkContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        compiler: judgeCompiler,
        code,
        turnstileToken: tokenForSubmit,
      }, setJobStatus);
      applyCheckResult(res);
      setError(null);
      setLatestVerdict(normalizeVerdict(res.verdict));
      setLatestVerdictAt(Date.now());
      if (isPreview) setSubmissions((current) => [{ id: res.submissionId, createdAt: new Date().toISOString(), phase: "CONTEST", language: judgeLanguage, verdict: res.verdict, score: res.score, maxScore: res.maxScore, testsPassed: res.testsPassed, testsTotal: res.testsTotal, compileErrorKind: res.compileErrorKind }, ...current]);
      else syncLiveData(true);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      if (msg === "TURNSTILE_REQUIRED") {
        setError("Human verification is required by server. Complete verification and submit again.");
      } else if (msg === "TURNSTILE_FAILED") {
        setError("Human verification failed. Try again, and disable ad blockers/privacy shields for this page.");
      } else {
        setError(msg || "Submission failed");
      }
    } finally {
      if (turnstileEnabled && window.turnstile && turnstileWidgetIdRef.current != null) {
        window.turnstile.reset(turnstileWidgetIdRef.current);
      }
      if (turnstileEnabled) setTurnstileToken(null);
      setChecking(false);
    }
  };

  const askOrganizer = async (question: string) => {
    if (!contestId || !problemId || !hasToken || !statement || askingOrganizer || !question.trim()) return;
    const message = [
      `Питання щодо задачі ${statement.problem.label}: ${statement.task.title}`,
      "",
      question.trim(),
    ].join("\n");

    setAskingOrganizer(true);
    try {
      if (isPreview) {
        setAnnouncements((current) => [{ id: Date.now(), author: "Оксана · демо", text: question.trim(), createdAt: new Date().toISOString() }, ...current]);
        setOrganizerDialogOpen(false);
        setOrganizerQuestion("");
        setOrganizerQuestionSent(true);
        return;
      }
      await postContestCommunityQuestion(contestId, message);
      setOrganizerDialogOpen(false);
      setOrganizerQuestion("");
      setOrganizerQuestionSent(true);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || "Failed to create support conversation");
    } finally {
      setAskingOrganizer(false);
    }
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <Card className="p-4">
          <Skeleton className="h-8 w-2/3 mb-3" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6 mb-6" />
          <Skeleton className="h-[70vh] w-full" />
        </Card>
      </div>
    );
  }

  if (error && !statement) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <Card className="p-4">
          <div role="alert" aria-live="assertive" className="text-sm text-accent-error">{error}</div>
          <Button variant="secondary" onClick={() => void load()} className="mt-4 h-10 px-4">
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  if (!statement) return null;

  const entryFile = JUDGE_ENTRY_FILES[judgeLanguage];
  const publicExamples = examplesFromStatement(statement.task.description);
  const latestAnnouncement = announcements[0] ?? null;
  const showAnnouncement = latestAnnouncement && latestAnnouncement.id !== dismissedAnnouncementId;

  return (
    <div className="contest-problem-solve min-h-full space-y-2 bg-bg-base p-2 text-text-primary pb-[calc(0.5rem+env(safe-area-inset-bottom))] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:space-y-3 sm:p-4">
      {showAnnouncement ? (
        <aside className="flex items-start gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 sm:items-center dark:bg-[#0d1b13]" aria-live="polite">
          <Radio className="mt-0.5 size-4 shrink-0 text-primary-strong dark:text-primary-soft sm:mt-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">Оголошення організатора</div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-text-primary dark:text-[#dce8df]">{latestAnnouncement.text}</p>
          </div>
          <button type="button" onClick={() => setDismissedAnnouncementId(latestAnnouncement.id)} className="grid size-8 shrink-0 place-items-center rounded-lg text-text-muted transition hover:bg-bg-hover hover:text-text-primary dark:text-[#82968a] dark:hover:bg-white/[.06] dark:hover:text-white" aria-label="Закрити оголошення">
            <X className="size-4" />
          </button>
        </aside>
      ) : null}

      {turnstileEnabled && !isPreview ? (
        <Card className="flex flex-wrap items-center gap-3 border-border/80 p-3 dark:border-white/10 dark:bg-[#0d1510]">
            <div className="min-w-0 flex-1 text-xs text-text-muted dark:text-[#a7b5aa]">
              {turnstileLoadFailed
                ? "Human verification widget is unavailable in browser. Submit still works if server does not require verification."
                : "Human verification is required before submission."}
            </div>
            <div ref={turnstileContainerRef} />
        </Card>
      ) : null}

      {error ? (
        <div role="alert" aria-live="assertive" className="flex items-start gap-3 rounded-xl border border-[#ff6b9d]/30 bg-[#ff6b9d]/10 px-3 py-2.5 text-sm text-[#ffb2c9]">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 rounded-md p-1 hover:bg-white/[.08]" aria-label="Закрити повідомлення про помилку"><X className="size-4" /></button>
        </div>
      ) : null}
      {organizerQuestionSent ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-primary/25 bg-primary/[.08] px-3 py-2.5 text-sm text-primary-strong dark:text-[#9cf2c2]">
          Питання надіслано організатору. Відповідь з’явиться у вкладці «Ком’юніті».
        </div>
      ) : null}

      {jobStatus && <div role="status" className="px-4 py-2 text-sm text-primary-strong dark:text-emerald-200">
        {jobStatus === "queued" ? "У черзі" : jobStatus === "running" ? "Перевіряється" : jobStatus === "completed" ? "Готово" : "Помилка судді — відправку збережено"}
      </div>}
      <StudyCodIDEWorkspace
        enableSemanticLsp={false}
        task={{
          id: `contest-${contestId}-${problemId}`,
          title: statement.task.title,
          description: statement.task.description,
          section: `Контест · ${contestMeta.title} · ${statement.problem.label}`,
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
        onFilesChange={(nextFiles) => setCode(nextFiles.find((file) => file.path === entryFile)?.content ?? nextFiles[0]?.content ?? "")}
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
        onRun={() => void doRun()}
        onCheck={() => void doSubmit()}
        onSave={saveDraft}
        onReset={() => {
          setCode(templateForLanguage({ template: statement.task.template, templatesByLanguage: statement.task.templatesByLanguage, defaultLanguage: statement.task.defaultLanguage }, judgeLanguage));
          setRunResult(null);
          setCheckResult(null);
        }}
        onBack={() => navigate(withDevPreview(`/contest/contests/${contestId ?? ""}`))}
        runResult={runResult}
        checkResult={checkResult}
        attemptsUsed={submissions.length}
        resultCards={submissions.length ? (
          <section className="mt-3 rounded-xl border border-white/10 bg-white/[.025] p-3" aria-label="Останні надсилання">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">Останні надсилання</h3>
              <span className="text-[10px] text-[#82968a]">{submissions.length}{submissions.length === 30 ? "+" : ""}</span>
            </div>
            <div className="space-y-1.5">
              {submissions.slice(0, 4).map((submission) => (
                <div key={submission.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-black/15 px-2.5 py-2 text-[11px]">
                  <div className="min-w-0">
                    <span className={`font-bold ${String(submission.verdict ?? "").toUpperCase() === "AC" ? "text-primary-soft" : "text-[#ffca7e]"}`}>{submission.verdict || "В черзі"}</span>
                    <span className="ml-2 text-[#82968a]">{submission.createdAt ? new Date(submission.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Щойно"}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-[#c8d6cc]">{submission.score ?? 0}/{submission.maxScore ?? 0}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        disableAiAssistance
        submitMode
        saveStatus={draftSavedAt ? "saved" : "dirty"}
        lastSavedAt={draftSavedAt}
        trace={trace}
        tracing={tracing}
        onTrace={doTrace}
        toolbarStatus={(
          <>
            <span className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold text-[#a7b5aa]" title={wsStatus === "connected" ? "Оновлення підключено" : "Перепідключення відбувається автоматично"}>
              <span className={`size-1.5 rounded-full ${wsStatus === "connected" ? "bg-primary" : wsStatus === "connecting" ? "bg-[#ffb454]" : "bg-[#82968a]"}`} />
              {wsStatus === "connected" ? "НА ЗВ’ЯЗКУ" : wsStatus === "connecting" ? "СИНХРОНІЗАЦІЯ" : "ОФЛАЙН"}
            </span>
            {contestMeta.endsAt ? <span className="hidden h-8 items-center rounded-lg border border-white/10 px-2 text-[10px] font-semibold text-[#a7b5aa] xl:inline-flex" title="Час завершення контесту">До {new Date(contestMeta.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span> : null}
            {latestVerdict ? <span className="inline-flex h-8 max-w-28 items-center truncate rounded-lg border border-white/10 px-2 text-[10px] font-bold text-[#c8d6cc]" title={latestVerdictAt ? `Оновлено ${new Date(latestVerdictAt).toLocaleTimeString()}` : "Останній результат"}>{latestVerdict}</span> : null}
            {subsLoading ? <span className="hidden text-[10px] text-[#82968a] xl:inline">Синхронізація…</span> : null}
          </>
        )}
        toolbar={(
          <>
            <Link to={`/contest/contests/${contestId}/scoreboard`} className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-white/10 text-[#c8d6cc] transition hover:border-[#ffb454]/30 hover:bg-[#ffb454]/10 hover:text-[#ffca7e]" aria-label="Таблиця контесту" title="Таблиця контесту">
              <Trophy className="size-3.5" />
            </Link>
            {hasToken ? <button type="button" onClick={() => { setOrganizerQuestionSent(false); setOrganizerDialogOpen(true); }} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-[#c8d6cc] transition hover:bg-white/[.06]" title="Поставити питання організатору"><MessageSquareText className="size-3.5" /><span>Організатор</span></button> : null}
          </>
        )}
      />

      <Modal open={organizerDialogOpen} onClose={() => setOrganizerDialogOpen(false)} title="Питання організатору" description="Питання побачить організатор цього контесту. Відповідь буде у вкладці «Ком’юніті»." panelClassName="max-w-[620px]">
        <form onSubmit={(event) => { event.preventDefault(); void askOrganizer(organizerQuestion); }} className="space-y-4">
          <label className="block text-sm font-semibold text-text-primary" htmlFor="contest-organizer-question">Твоє питання</label>
          <textarea id="contest-organizer-question" value={organizerQuestion} onChange={(event) => setOrganizerQuestion(event.target.value)} rows={5} maxLength={4000} required placeholder="Опиши проблему з умовою, доступом або проведенням контесту…" className="w-full resize-y rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm leading-6 text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary/50 focus:ring-2 focus:ring-primary/15" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-muted">{organizerQuestion.length}/4000</span>
            <Button type="submit" disabled={askingOrganizer || !organizerQuestion.trim()}>{askingOrganizer ? "Надсилаємо…" : "Надіслати питання"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
