import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  checkContestProblem,
  getContestCommunity,
  getContestDetails,
  getContestProblemStatement,
  getContestProblemSubmissions,
  getContestScoreboard,
  recordContestIntegrityEvent,
  runContestProblem,
  type ContestCommunityAnnouncement,
  type ContestCheckResult,
  type ContestProblemStatement,
  type ContestRunResult,
  type ContestSubmissionListItem,
  type JudgeLanguage,
  type ScoreboardRow,
} from "../../lib/api/contests";
import { enabledJudgeLanguages, defaultCompilerForFamily } from "../../lib/judgeLanguages";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { Workspace } from "../../components/contest-workspace/Workspace";
import { createSupportChatConversation } from "../../lib/api/support";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { tracePlayground, type TraceResult } from "../../lib/api/playground";

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
  startsAt: string | null;
  endsAt: string | null;
};

type JwtPayload = {
  userId?: number;
  studentId?: number;
  type?: string;
  username?: string;
  name?: string;
  email?: string;
  sub?: string;
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

function templateForLanguage(task: { template: string; templatesByLanguage: Record<string, string> | null }, lang: JudgeLanguage) {
  const by = task.templatesByLanguage || null;
  const t = by && typeof by[lang] === "string" ? String(by[lang] ?? "") : "";
  return t.trim() ? t : task.template;
}

function safeJsonParse<T>(raw: string | null): T | null {
  try {
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token: string | null): JwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const json = atob(b64 + pad);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function draftScopeFromToken(token: string | null): string {
  const p = decodeJwtPayload(token);
  if (typeof p?.userId === "number") return `user:${p.userId}`;
  if (typeof p?.studentId === "number") return `student:${p.studentId}`;
  if (typeof p?.type === "string" && p.type.trim()) return `type:${String(p.type).trim().toUpperCase()}`;
  return "anon";
}

function userLabelFromToken(token: string | null): string | null {
  const p = decodeJwtPayload(token);
  const candidates = [p?.username, p?.name, p?.email, p?.sub];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
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

  const hasToken = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);

  const token = React.useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("token");
    } catch {
      return null;
    }
  }, []);
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
  const shouldEnforceTurnstileClient = React.useMemo(() => {
    if (!turnstileEnabled) return false;
    if (turnstileLoadFailed) return false;
    return turnstileScriptReady || (typeof window !== "undefined" && Boolean(window.turnstile));
  }, [turnstileEnabled, turnstileLoadFailed, turnstileScriptReady]);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [statement, setStatement] = React.useState<ContestProblemStatement | null>(null);
  const [contestMeta, setContestMeta] = React.useState<ContestMeta>({ title: "Contest", startsAt: null, endsAt: null });

  const [judgeLanguage, setJudgeLanguage] = React.useState<JudgeLanguage>("java");
  const [judgeCompiler, setJudgeCompiler] = React.useState<string>(defaultCompilerForFamily("java"));
  // Reset compiler to the family default whenever the language changes.
  React.useEffect(() => { setJudgeCompiler(defaultCompilerForFamily(judgeLanguage)); }, [judgeLanguage]);
  const [code, setCode] = React.useState("");
  const [runInput, setRunInput] = React.useState("");
  const [running, setRunning] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [runResult, setRunResult] = React.useState<ContestRunResult | null>(null);
  const [checkResult, setCheckResult] = React.useState<ContestCheckResult | null>(null);
  const [trace, setTrace] = React.useState<TraceResult | null>(null);
  const [tracing, setTracing] = React.useState(false);

  const [subsLoading, setSubsLoading] = React.useState(false);
  const [submissions, setSubmissions] = React.useState<ContestSubmissionListItem[]>([]);
  const [scoreboardLoading, setScoreboardLoading] = React.useState(false);
  const [scoreboardRows, setScoreboardRows] = React.useState<ScoreboardRow[]>([]);

  const [wsStatus, setWsStatus] = React.useState<"connecting" | "connected" | "offline">("offline");
  const [latestVerdict, setLatestVerdict] = React.useState<string | null>(null);
  const [latestVerdictAt, setLatestVerdictAt] = React.useState(0);

  const [focusMode, setFocusMode] = React.useState(false);
  const [announcements, setAnnouncements] = React.useState<ContestCommunityAnnouncement[]>([]);
  const [focusLostCount, setFocusLostCount] = React.useState(0);
  const liveSyncInFlightRef = React.useRef(false);
  const liveSyncLastAtRef = React.useRef(0);

  const storageBase = React.useMemo(() => {
    if (!contestId || !problemId) return null;
    return `contest:${contestId}:problem:${problemId}:${draftScopeFromToken(token)}`;
  }, [contestId, problemId, token]);

  const currentUserLabel = React.useMemo(() => userLabelFromToken(token), [token]);

  const loadSubmissions = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!contestId || !problemId || !hasToken) return;
    const silent = !!opts?.silent;
    if (!silent) setSubsLoading(true);
    try {
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

  const loadScoreboard = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (!contestId) return;
    const silent = !!opts?.silent;
    if (!silent) setScoreboardLoading(true);
    try {
      const res = await getContestScoreboard(contestId);
      setScoreboardRows(Array.isArray(res.rows) ? res.rows : []);
    } catch {
      setScoreboardRows([]);
    } finally {
      if (!silent) setScoreboardLoading(false);
    }
  }, [contestId]);

  const syncLiveData = React.useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - liveSyncLastAtRef.current < 1500) return;
    if (liveSyncInFlightRef.current) return;
    liveSyncInFlightRef.current = true;
    liveSyncLastAtRef.current = now;
    try {
      await Promise.all([loadSubmissions({ silent: true }), loadScoreboard({ silent: true })]);
    } finally {
      liveSyncInFlightRef.current = false;
    }
  }, [loadSubmissions, loadScoreboard]);

  const hydrateDraft = React.useCallback(
    (stmt: ContestProblemStatement) => {
      if (!storageBase) return;
      // Every problem accepts every supported language — no per-problem restriction.
      const allowed = enabledJudgeLanguages();
      const fallbackLang = (allowed[0] ?? "java") as JudgeLanguage;

      try {
        const savedLang = localStorage.getItem(`${storageBase}:lang`) as JudgeLanguage | null;
        const nextLang = savedLang && allowed.includes(savedLang) ? savedLang : fallbackLang;
        setJudgeLanguage(nextLang);

        const savedCode = localStorage.getItem(`${storageBase}:draft:${nextLang}:code`);
        const tpl = templateForLanguage({ template: stmt.task.template, templatesByLanguage: stmt.task.templatesByLanguage }, nextLang);
        setCode(savedCode != null ? savedCode : tpl);

        const savedInput = localStorage.getItem(`${storageBase}:runInput`);
        setRunInput(savedInput ?? "");

        const savedFocus = localStorage.getItem(`${storageBase}:focus`) === "1";
        setFocusMode(savedFocus);
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
      const [stmt, contest] = await Promise.all([getContestProblemStatement(contestId, problemId), getContestDetails(contestId)]);
      setStatement(stmt);
      setContestMeta({
        title: contest.contest.title,
        startsAt: contest.contest.startsAt,
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
    loadScoreboard();
  }, [loadSubmissions, loadScoreboard]);

  React.useEffect(() => {
    if (!turnstileEnabled) return;

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
  }, [turnstileEnabled]);

  React.useEffect(() => {
    if (!turnstileEnabled || !turnstileScriptReady) return;
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
  }, [turnstileEnabled, turnstileScriptReady, turnstileSiteKey]);

  React.useEffect(() => {
    if (!statement || !storageBase) return;
    try {
      localStorage.setItem(`${storageBase}:lang`, judgeLanguage);
      localStorage.setItem(`${storageBase}:draft:${judgeLanguage}:code`, code);
      localStorage.setItem(`${storageBase}:runInput`, runInput);
      localStorage.setItem(`${storageBase}:focus`, focusMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [statement, storageBase, judgeLanguage, code, runInput, focusMode]);

  React.useEffect(() => {
    if (!statement || !storageBase) return;
    try {
      const saved = localStorage.getItem(`${storageBase}:draft:${judgeLanguage}:code`);
      if (saved != null) {
        setCode(saved);
        return;
      }
      const tpl = templateForLanguage({ template: statement.task.template, templatesByLanguage: statement.task.templatesByLanguage }, judgeLanguage);
      setCode(tpl);
    } catch {
      const tpl = templateForLanguage({ template: statement.task.template, templatesByLanguage: statement.task.templatesByLanguage }, judgeLanguage);
      setCode(tpl);
    }
  }, [judgeLanguage, statement, storageBase]);

  React.useEffect(() => {
    if (!liveUpdatesEnabled || !contestId || !hasToken || typeof window === "undefined" || typeof EventSource === "undefined") {
      setWsStatus("offline");
      return;
    }

    let closed = false;
    setWsStatus("connecting");

    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${apiHttpBase()}/contests/${contestId}/events${tokenParam}`;
    const es = new EventSource(url);

    es.addEventListener("ready", () => {
      if (!closed) setWsStatus("connected");
    });
    es.onopen = () => {
      if (!closed) setWsStatus("connected");
    };
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
  }, [liveUpdatesEnabled, contestId, hasToken, token, syncLiveData]);

  React.useEffect(() => {
    const id = window.setInterval(() => {
      syncLiveData(false);
    }, wsStatus === "connected" ? 20000 : 9000);
    return () => window.clearInterval(id);
  }, [wsStatus, syncLiveData]);

  // Poll organizer announcements so participants see them without leaving the workspace.
  React.useEffect(() => {
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
  }, [contestId, hasToken]);

  // Integrity signals: report tab/focus loss and large pastes to the organizer.
  React.useEffect(() => {
    if (!contestId || !hasToken) return;
    const report = (type: "FOCUS_LOST" | "PASTE", detail?: string) => {
      void recordContestIntegrityEvent(contestId, type, detail).catch(() => {});
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") {
        setFocusLostCount((n) => n + 1);
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
  }, [contestId, hasToken]);

  const doRun = async () => {
    if (!contestId || !problemId || !statement) return;
    if (!hasToken) {
      setError("Please log in to run code.");
      return;
    }

    setRunning(true);
    try {
      const res = await runContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        compiler: judgeCompiler,
        input: runInput,
        code,
      });
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
    if (!hasToken) {
      setError("Please log in to submit.");
      return;
    }
    const tokenForSubmit = turnstileToken ?? undefined;

    setChecking(true);
    try {
      const res = await checkContestProblem({
        contestId,
        problemId,
        language: judgeLanguage,
        compiler: judgeCompiler,
        code,
        turnstileToken: tokenForSubmit,
      });
      setCheckResult(res);
      setError(null);
      setLatestVerdict(normalizeVerdict(res.verdict));
      setLatestVerdictAt(Date.now());
      syncLiveData(true);
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
    if (!contestId || !problemId || !hasToken || !statement) return;
    const problemTitle = statement.task.title || "Unknown";
    const body = [
      `Contest: #${contestId} (${contestMeta.title || "Unknown"})`,
      `Problem: #${problemId} (${problemTitle})`,
      "",
      "Question:",
      question.trim()
    ].join("\n");

    try {
      const res = await createSupportChatConversation({
        subject: `Contest #${contestId} · Problem #${problemId}`,
        message: body
      });
      navigate(`/support?conversationId=${res.conversation.id}`);
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      setError(msg || "Failed to create support conversation");
      throw e;
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
        <Card className="p-4 text-sm text-accent-error">{error}</Card>
      </div>
    );
  }

  if (!statement) return null;

  return (
    <div className="p-2 sm:p-3 space-y-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1 border-b border-border/50 pb-2">
        <Button variant="ghost" onClick={() => navigate(`/contests/${contestId ?? ""}`)} className="w-full sm:w-auto">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to contest
        </Button>

        <div className="text-xs font-mono text-text-secondary w-full sm:w-auto flex items-center gap-3">
          {error ? <span className="text-accent-error">{error}</span> : null}
          {subsLoading ? <span className="text-text-muted">Syncing submissions...</span> : null}
        </div>
      </div>

      {turnstileEnabled ? (
        <div className="px-1">
          <Card className="p-3 border-border/70">
            <div className="text-xs text-text-secondary mb-2">
              {turnstileLoadFailed
                ? "Human verification widget is unavailable in browser. Submit still works if server does not require verification."
                : "Human verification is required before submission."}
            </div>
            <div ref={turnstileContainerRef} />
          </Card>
        </div>
      ) : null}

      <Workspace
        contestTitle={contestMeta.title}
        contestStartsAt={contestMeta.startsAt}
        contestEndsAt={contestMeta.endsAt}
        statement={statement}
        language={judgeLanguage}
        onLanguageChange={setJudgeLanguage}
        compiler={judgeCompiler}
        onCompilerChange={setJudgeCompiler}
        code={code}
        onCodeChange={setCode}
        onRun={doRun}
        onSubmit={doSubmit}
        running={running}
        checking={checking}
        runInput={runInput}
        onRunInputChange={setRunInput}
        runResult={runResult}
        checkResult={checkResult}
        submissions={submissions}
        scoreboardRows={scoreboardRows}
        scoreboardLoading={scoreboardLoading}
        onRefreshScoreboard={loadScoreboard}
        onRefreshSubmissions={loadSubmissions}
        wsStatus={wsStatus}
        latestVerdict={latestVerdict}
        latestVerdictAt={latestVerdictAt}
        currentUserLabel={currentUserLabel}
        focusMode={focusMode}
        onFocusModeChange={setFocusMode}
        canAskOrganizer={hasToken}
        onAskOrganizer={askOrganizer}
        announcements={announcements}
        focusLostCount={focusLostCount}
        trace={trace}
        tracing={tracing}
        onTrace={doTrace}
      />
    </div>
  );
};
