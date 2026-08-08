import React from "react";
import {
  Activity,
  Gauge,
  LayoutDashboard,
  MessageSquareText,
  Trophy,
  UserCircle2,
  FolderCode,
  PanelRightClose,
  PanelRightOpen,
  SquareArrowOutUpRight,
  FoldHorizontal,
  RefreshCw,
  GripVertical,
  Megaphone,
  Bot,
  X,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { EditorPanel } from "./EditorPanel";
import { OutputDock } from "./OutputDock";
import { ProblemTab } from "./ProblemTab";
import { ContestDashboard } from "./ContestDashboard";
import type { ContestWorkspaceProps, WorkspaceTab, WorkspaceTabKind } from "./types";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { DebugMentorChat } from "../DebugMentorChat";

type NavItem = { id: string; icon: LucideIcon; label: string };

const getApiErrorMessage = (error: unknown): string | null => {
  const message = getErrorMessageFromUnknown(error, "");
  return message || null;
};

const RAIL_ITEMS: NavItem[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "contests", icon: Trophy, label: "Contests" },
  { id: "problems", icon: FolderCode, label: "Problems" },
  { id: "submissions", icon: Activity, label: "Submissions" },
  { id: "profile", icon: UserCircle2, label: "Profile" },
];

function toneFromVerdict(verdict: string | null | undefined): "accepted" | "wrong" | "neutral" {
  const v = String(verdict ?? "").toUpperCase();
  if (v.includes("AC") || v.includes("ACCEPT")) return "accepted";
  if (v.includes("WA") || v.includes("WRONG")) return "wrong";
  return "neutral";
}

function tabTemplate(kind: WorkspaceTabKind): WorkspaceTab {
  if (kind === "contest-overview") return { id: "contest-overview", kind, title: "Contest Overview", closable: false };
  if (kind === "problem") return { id: "problem", kind, title: "Problem", closable: false };
  if (kind === "submissions") return { id: "submissions", kind, title: "Submissions", closable: true };
  if (kind === "leaderboard") return { id: "leaderboard", kind, title: "Leaderboard", closable: true };
  return { id: "discussion", kind, title: "Discussion", closable: true };
}

function buildExamplesFromMarkdown(markdown: string): Array<{ id: string; title: string; input: string }> {
  const fences = Array.from(String(markdown).matchAll(/```(?:[\w+-]*)\n([\s\S]*?)```/g)).map((m) => String(m[1] ?? "").trim());
  const out: Array<{ id: string; title: string; input: string }> = [];
  for (let i = 0; i < fences.length; i += 2) {
    const input = fences[i];
    if (!input) continue;
    out.push({ id: `ex-${i / 2 + 1}`, title: `Example #${i / 2 + 1}`, input });
  }
  return out;
}

export const Workspace: React.FC<ContestWorkspaceProps> = ({
  contestTitle,
  contestStartsAt,
  contestEndsAt,
  statement,
  language,
  onLanguageChange,
  compiler,
  onCompilerChange,
  code,
  onCodeChange,
  onRun,
  onSubmit,
  running,
  checking,
  runInput,
  onRunInputChange,
  runResult,
  checkResult,
  submissions,
  scoreboardRows,
  scoreboardLoading,
  onRefreshScoreboard,
  onRefreshSubmissions,
  wsStatus,
  latestVerdict,
  latestVerdictAt,
  currentUserLabel,
  focusMode,
  onFocusModeChange,
  canAskOrganizer,
  onAskOrganizer,
  announcements,
  focusLostCount,
  trace,
  tracing,
  onTrace,
}) => {
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([tabTemplate("contest-overview"), tabTemplate("problem")]);
  const [activeTabId, setActiveTabId] = React.useState<string>("problem");
  const [draggingTab, setDraggingTab] = React.useState<string | null>(null);
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");

  const [dockCollapsed, setDockCollapsed] = React.useState(false);
  const [dockPopOut, setDockPopOut] = React.useState(false);
  const [dockWidth, setDockWidth] = React.useState(370);
  const [dockAttention, setDockAttention] = React.useState(false);
  const [rightPanelTab, setRightPanelTab] = React.useState<"output" | "mentor" | "debugger">("output");
  const [traceStep, setTraceStep] = React.useState(0);
  const [mobileDockOpen, setMobileDockOpen] = React.useState(false);
  const [dismissedAnnId, setDismissedAnnId] = React.useState<number | null>(null);

  const latestAnnouncement = React.useMemo(() => {
    const list = announcements ?? [];
    return list.length ? list[0] : null;
  }, [announcements]);
  const showAnnouncement = latestAnnouncement && latestAnnouncement.id !== dismissedAnnId;

  const [shakeWrong, setShakeWrong] = React.useState(false);
  const [discussionText, setDiscussionText] = React.useState("");
  const [askingOrganizer, setAskingOrganizer] = React.useState(false);
  const [discussionError, setDiscussionError] = React.useState<string | null>(null);
  const [discussionSuccess, setDiscussionSuccess] = React.useState<string | null>(null);
  const [problemBlockOrder, setProblemBlockOrder] = React.useState<Array<"statement" | "editor">>(["statement", "editor"]);
  const [draggingProblemBlock, setDraggingProblemBlock] = React.useState<"statement" | "editor" | null>(null);

  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollMemory = React.useRef<Record<string, number>>({});

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const examples = React.useMemo(() => buildExamplesFromMarkdown(statement.task.description), [statement.task.description]);
  const latestVerdictTone = toneFromVerdict(latestVerdict);
  const solveLoop = React.useMemo(() => {
    const hasRead = String(statement.task.description ?? "").trim().length > 0;
    const hasCode = String(code ?? "").trim().length > 0;
    const hasRun = !!runResult;
    const hasSubmitted = !!checkResult || submissions.length > 0;
    const accepted = [latestVerdict, checkResult?.verdict, submissions[0]?.verdict].some((v) => toneFromVerdict(v) === "accepted");

    const steps = [
      { key: "read", label: "Read", done: hasRead },
      { key: "code", label: "Implement", done: hasCode },
      { key: "run", label: "Run", done: hasRun },
      { key: "submit", label: "Submit", done: hasSubmitted },
      { key: "refine", label: "Refine", done: accepted },
    ];

    const current = Math.min(
      steps.findIndex((s) => !s.done),
      steps.length - 1,
    );

    let nextHint: string;
    if (!hasCode) nextHint = "Write a baseline solution first, then run it on sample input.";
    else if (!hasRun) nextHint = "Run your solution on sample input before your first submit.";
    else if (!hasSubmitted) nextHint = "Submit now to validate against hidden tests and subtasks.";
    else if (accepted) nextHint = "Accepted. Move to the next problem or optimize only if necessary.";
    else nextHint = "Check failed subtasks/verdict details, update logic, and submit again.";

    return { steps, current: current < 0 ? steps.length - 1 : current, nextHint };
  }, [statement.task.description, code, runResult, checkResult, submissions, latestVerdict]);

  React.useEffect(() => {
    setDockAttention(true);
    const t = window.setTimeout(() => setDockAttention(false), 900);
    return () => window.clearTimeout(t);
  }, [latestVerdictAt]);

  React.useEffect(() => {
    const tone = toneFromVerdict(latestVerdict);
    if (tone === "wrong") {
      setShakeWrong(true);
      const t = window.setTimeout(() => setShakeWrong(false), 550);
      return () => window.clearTimeout(t);
    }
  }, [latestVerdict]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = scrollMemory.current[activeTabId] ?? 0;
  }, [activeTabId]);

  React.useEffect(() => {
    if (!isCompactViewport) {
      setMobileDockOpen(false);
    }
  }, [isCompactViewport]);

  const onScrollActive = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    scrollMemory.current[activeTabId] = el.scrollTop;
  }, [activeTabId]);

  const renderRightPanel = () => rightPanelTab === "debugger" ? (
    trace?.steps?.length ? (
      <div className="h-full overflow-auto rounded-xl border border-border bg-bg-base/60 p-3 text-xs text-text-secondary">
        <div className="flex items-center justify-between gap-2"><span className="font-semibold text-text-primary">Step debugger</span><span className="text-primary">{Math.min(traceStep + 1, trace.steps.length)}/{trace.steps.length}</span></div>
        <input type="range" min={0} max={Math.max(0, trace.steps.length - 1)} value={Math.min(traceStep, Math.max(0, trace.steps.length - 1))} onChange={(event) => setTraceStep(Number(event.target.value))} className="mt-3 w-full accent-primary" />
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-2"><div className="text-[10px] uppercase tracking-[.1em] text-text-muted">Current line</div><div className="mt-1 font-mono text-primary">Line {trace.steps[Math.min(traceStep, trace.steps.length - 1)].line}</div></div>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg-code p-2 font-mono text-[11px] text-text-primary">{JSON.stringify(trace.steps[Math.min(traceStep, trace.steps.length - 1)].locals || {}, null, 2)}</pre>
        <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-bg-code p-2 font-mono text-[11px]">{trace.programOutput || trace.stderr || ""}</pre>
      </div>
    ) : (
      <div className="rounded-xl border border-border bg-bg-base/60 p-3 text-xs text-text-secondary"><div className="font-semibold text-text-primary">Step debugger</div><p className="mt-2">Run Trace to inspect variables, current line and program output.</p><button type="button" onClick={onTrace} disabled={tracing || !onTrace} className="mt-3 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">{tracing ? "Tracing…" : "Trace"}</button></div>
    )
  ) : rightPanelTab === "mentor" ? (
    <DebugMentorChat
      language={language}
      code={code}
      verdict={latestVerdict}
      stderr={runResult?.stderr || checkResult?.compileError}
      taskTitle={statement.task.title}
      taskText={statement.task.description}
      className="h-full overflow-auto"
    />
  ) : (
    <OutputDock
      examples={examples}
      onPickExample={onRunInputChange}
      runResult={runResult}
      checkResult={checkResult}
      submissions={submissions}
      wsStatus={wsStatus}
      latestVerdict={latestVerdict}
      attention={dockAttention}
    />
  );

  const openTab = (kind: WorkspaceTabKind) => {
    const existing = tabs.find((t) => t.kind === kind);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const next = tabTemplate(kind);
    setTabs((prev) => [...prev, next]);
    setActiveTabId(next.id);
  };

  const handleRailNavigate = (id: string) => {
    if (id === "dashboard") openTab("contest-overview");
    if (id === "submissions") openTab("submissions");
    if (id === "problems") openTab("problem");
    if (id === "contests") openTab("leaderboard");
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const target = prev.find((t) => t.id === id);
      if (!target || !target.closable) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (!next.length) return prev;
      if (activeTabId === id) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  };

  const moveTab = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setTabs((prev) => {
      const from = prev.findIndex((t) => t.id === fromId);
      const to = prev.findIndex((t) => t.id === toId);
      if (from < 0 || to < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dockWidth;
    const onMove = (e: MouseEvent) => {
      const delta = startX - e.clientX;
      const next = Math.min(520, Math.max(300, startWidth + delta));
      setDockWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const moveProblemBlock = React.useCallback((from: "statement" | "editor", to: "statement" | "editor") => {
    if (from === to) return;
    setProblemBlockOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  }, []);

  const renderTabContent = () => {
    if (activeTab.kind === "contest-overview") {
      return (
        <ContestDashboard
          title={contestTitle}
          startsAt={contestStartsAt}
          endsAt={contestEndsAt}
          rows={scoreboardRows}
          loading={scoreboardLoading}
          onRefresh={onRefreshScoreboard}
          currentUserLabel={currentUserLabel}
        />
      );
    }

    if (activeTab.kind === "problem") {
      const renderProblemBlock = (block: "statement" | "editor") => {
        if (block === "statement") {
          return (
            <ProblemTab
              statement={statement}
              onInjectExampleInput={onRunInputChange}
            />
          );
        }
        return (
          <EditorPanel
            statement={statement}
            language={language}
            onLanguageChange={onLanguageChange}
            compiler={compiler}
            onCompilerChange={onCompilerChange}
            code={code}
            onCodeChange={onCodeChange}
            runInput={runInput}
            onRunInputChange={onRunInputChange}
            onRun={onRun}
            onSubmit={onSubmit}
            running={running}
            checking={checking}
            onToggleFocusMode={() => onFocusModeChange(!focusMode)}
            focusMode={focusMode}
          />
        );
      };

      return (
        <div className={`h-full min-h-0 ${shakeWrong ? "studycod-shake" : ""} ${toneFromVerdict(latestVerdict) === "accepted" ? "studycod-solve-pulse" : ""}`}>
          <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-3">
            {problemBlockOrder.map((block) => (
              <section
                key={block}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingProblemBlock) moveProblemBlock(draggingProblemBlock, block);
                  setDraggingProblemBlock(null);
                }}
                className={`${focusMode ? (block === "statement" ? "lg:col-span-5" : "lg:col-span-7") : "lg:col-span-6"} min-h-0 rounded-2xl border border-border/60 bg-bg-surface/40 overflow-hidden`}
              >
                <div className="h-10 px-3 border-b border-border/60 bg-bg-surface/75 flex items-center justify-between text-[11px] text-text-secondary uppercase tracking-wider">
                  <span>{block === "statement" ? "Problem" : "Editor"}</span>
                  <button
                    type="button"
                    draggable
                    onDragStart={() => setDraggingProblemBlock(block)}
                    onDragEnd={() => setDraggingProblemBlock(null)}
                    aria-label={`Drag to reorder ${block} panel`}
                    className="inline-flex items-center gap-1 text-[10px] text-text-muted cursor-grab"
                  >
                    <GripVertical className="w-3.5 h-3.5" /> drag
                  </button>
                </div>
                <div className="h-[calc(100%-2rem)] min-h-0">{renderProblemBlock(block)}</div>
              </section>
            ))}
          </div>
        </div>
      );
    }

    if (activeTab.kind === "leaderboard") {
      return (
        <ContestDashboard
          title={contestTitle}
          startsAt={contestStartsAt}
          endsAt={contestEndsAt}
          rows={scoreboardRows}
          loading={scoreboardLoading}
          onRefresh={onRefreshScoreboard}
          currentUserLabel={currentUserLabel}
        />
      );
    }

    if (activeTab.kind === "submissions") {
      return (
        <div className="h-full min-h-0 rounded-2xl border border-border/70 bg-bg-surface/85 p-3 overflow-auto">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-sm font-semibold text-text-primary">Submission Stream</div>
            <button onClick={onRefreshSubmissions} className="h-11 px-3 rounded-md border border-border text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-1" aria-label="Refresh submissions stream">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {submissions.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-bg-base/70 p-2.5 text-xs flex items-center justify-between gap-2">
                <div>
                  <div className="text-text-primary font-medium">#{s.id} · {s.language}</div>
                  <div className="text-text-secondary">{s.phase} · tests {s.testsPassed ?? 0}/{s.testsTotal ?? 0}</div>
                  {Array.isArray(s.groupScores) && s.groupScores.length > 0 ? (
                    <div className="text-[11px] text-text-secondary mt-0.5">
                      Subtasks{" "}
                      {(() => {
                        const groupsWithMax = s.groupScores!.filter((g) => Number.isFinite(g.maxScore) && (g.maxScore ?? 0) > 0);
                        if (!groupsWithMax.length) return null;
                        const solved = groupsWithMax.filter((g) => (g.score ?? 0) >= (g.maxScore ?? 0)).length;
                        return `${solved}/${groupsWithMax.length}`;
                      })()}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <div className={toneFromVerdict(s.verdict) === "accepted" ? "text-accent-success" : toneFromVerdict(s.verdict) === "wrong" ? "text-accent-error" : "text-text-secondary"}>{s.verdict ?? "—"}</div>
                  <div className="text-text-secondary">{s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    const submitOrganizerQuestion = async () => {
      const text = discussionText.trim();
      if (!text || !onAskOrganizer || askingOrganizer) return;
      try {
        setAskingOrganizer(true);
        setDiscussionError(null);
        setDiscussionSuccess(null);
        await onAskOrganizer(text);
        setDiscussionText("");
        setDiscussionSuccess("Question sent. Opened support thread.");
      } catch (err: unknown) {
        setDiscussionError(getApiErrorMessage(err) ?? "Failed to send question");
      } finally {
        setAskingOrganizer(false);
      }
    };

    return (
      <div className="h-full rounded-2xl border border-border/70 bg-bg-surface/85 p-4">
        <div className="text-sm text-text-primary font-semibold flex items-center gap-2"><MessageSquareText className="w-4 h-4 text-secondary" /> Discussion</div>
        <div className="mt-2 text-sm text-text-secondary">{canAskOrganizer ? "Ask organizer a question about the task/contest." : "Login required to ask organizer."}</div>
        {discussionError ? <div className="mt-2 text-xs text-accent-error">{discussionError}</div> : null}
        {discussionSuccess ? <div className="mt-2 text-xs text-accent-success">{discussionSuccess}</div> : null}
        <div className="mt-3 max-w-3xl">
          <textarea
            value={discussionText}
            onChange={(e) => setDiscussionText(e.target.value)}
            className="w-full min-h-[120px] rounded-xl bg-bg-base border border-border px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
            placeholder="Write your question to organizer..."
            disabled={!canAskOrganizer || askingOrganizer}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={submitOrganizerQuestion}
              disabled={!canAskOrganizer || askingOrganizer || !discussionText.trim()}
              className="h-11 px-4 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {askingOrganizer ? "Sending..." : "Send to organizer"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-[calc(100dvh-3.25rem)] min-h-[calc(100dvh-4.25rem)] lg:min-h-[680px] w-full px-2 md:px-3 pb-3">
      <div className="h-full rounded-3xl bg-bg-surface border border-border/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.24)] flex flex-col">
        <header className="h-12 border-b border-border/60 bg-bg-surface px-3 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-2 text-xs">
            <span className="px-2 py-1 rounded-md border border-border bg-bg-base text-text-secondary uppercase tracking-[0.07em]">Contest</span>
            <span className="text-text-primary truncate">{contestTitle}</span>
            <span className="text-text-muted hidden md:inline">· {statement.problem.label}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className={`px-2 py-1 rounded-md border border-border bg-bg-base ${wsStatus === "connected" ? "text-accent-success" : wsStatus === "connecting" ? "text-accent-warn" : "text-text-secondary"}`}>
              live: {wsStatus === "connected" ? "on" : wsStatus === "connecting" ? "…" : "off"}
            </span>
            <span className={`px-2 py-1 rounded-md border border-border bg-bg-base ${latestVerdictTone === "accepted" ? "text-accent-success" : latestVerdictTone === "wrong" ? "text-accent-error" : "text-text-secondary"}`}>
              verdict: {latestVerdict ?? "—"}
            </span>
            {typeof focusLostCount === "number" && focusLostCount > 0 ? (
              <span
                className="px-2 py-1 rounded-md border border-accent-warn/50 bg-accent-warn/10 text-accent-warn inline-flex items-center gap-1"
                title="Times you left the contest tab. Organizers may monitor focus changes during a contest."
              >
                <Eye className="w-3.5 h-3.5" /> {focusLostCount}
              </span>
            ) : null}
          </div>
        </header>

        {showAnnouncement && latestAnnouncement ? (
          <div className="px-3 py-2 border-b border-accent-warn/40 bg-accent-warn/10 flex items-start gap-2">
            <Megaphone className="w-4 h-4 text-accent-warn mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 text-xs">
              <div className="text-accent-warn font-semibold">
                {announcements && announcements.length > 1 ? `Announcement (latest of ${announcements.length})` : "Announcement"}
              </div>
              <div className="text-text-primary whitespace-pre-wrap break-words line-clamp-3">{latestAnnouncement.text}</div>
            </div>
            <button
              onClick={() => setDismissedAnnId(latestAnnouncement.id)}
              className="text-text-secondary hover:text-text-primary shrink-0"
              aria-label="Dismiss announcement"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}

        <div className="px-3 py-2 border-b border-border/60 bg-bg-surface/60">
          <div className="flex flex-wrap items-center gap-2">
            {solveLoop.steps.map((step, idx) => {
              const isCurrent = solveLoop.current === idx;
              return (
                <div
                  key={step.key}
                  className={`h-8 px-2.5 rounded-md border text-[11px] inline-flex items-center gap-1.5 ${step.done ? "border-primary/50 bg-primary/10 text-text-primary" : isCurrent ? "border-secondary/60 bg-secondary/10 text-secondary" : "border-border bg-bg-base/70 text-text-secondary"}`}
                >
                  <span className="text-[10px]">{idx + 1}</span>
                  <span>{step.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11px] text-text-secondary">Next: {solveLoop.nextHint}</div>
        </div>

        <div className="lg:hidden px-2 py-2 border-b border-border/60 bg-bg-surface/55 flex items-center gap-2 overflow-x-auto">
          <button onClick={() => openTab("problem")} className={`h-10 px-3 rounded-lg border text-xs whitespace-nowrap ${activeTab.kind === "problem" ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary"}`}>Problem</button>
          <button onClick={() => openTab("contest-overview")} className={`h-10 px-3 rounded-lg border text-xs whitespace-nowrap ${activeTab.kind === "contest-overview" ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary"}`}>Overview</button>
          <button onClick={() => openTab("submissions")} className={`h-10 px-3 rounded-lg border text-xs whitespace-nowrap ${activeTab.kind === "submissions" ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary"}`}>Submissions</button>
          <button onClick={() => openTab("leaderboard")} className={`h-10 px-3 rounded-lg border text-xs whitespace-nowrap ${activeTab.kind === "leaderboard" ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary"}`}>Leaderboard</button>
          <button onClick={() => setMobileDockOpen((v) => !v)} className={`h-10 px-3 rounded-lg border text-xs whitespace-nowrap ${mobileDockOpen ? "border-secondary/60 text-secondary bg-secondary/10" : "border-border text-text-secondary"}`}>{mobileDockOpen ? "Hide output" : "Output"}</button>
        </div>

        <div className="flex-1 min-h-0 flex">
          <aside className="hidden lg:flex w-[64px] border-r border-border/60 bg-bg-surface/70 flex-col items-center py-3 gap-2">
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="group relative">
                <button
                  className="w-11 h-11 rounded-xl border border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary transition-fast flex items-center justify-center"
                  onClick={() => handleRailNavigate(item.id)}
                  aria-label={item.label}
                  title={item.label}
                >
                  <Icon className="w-4 h-4" />
                </button>
                <div className="absolute left-[48px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 transition-fast whitespace-nowrap z-20">
                  {item.label}
                </div>
              </div>
            );
          })}
          </aside>

          <div className="flex-1 min-w-0 min-h-0 flex">
            <section className="flex-1 min-w-0 min-h-0 flex flex-col">
              <div className="h-12 border-b border-border/60 bg-bg-surface/65 px-2 hidden lg:flex items-end gap-1 overflow-auto" role="tablist" aria-label="Workspace tabs">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  draggable
                  role="tab"
                  tabIndex={0}
                  aria-selected={activeTabId === tab.id}
                  aria-controls="workspace-tabpanel"
                  id={`workspace-tab-${tab.id}`}
                  onDragStart={() => setDraggingTab(tab.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingTab) moveTab(draggingTab, tab.id);
                    setDraggingTab(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveTabId(tab.id);
                    }
                  }}
                  className={`h-10 mb-1 rounded-t-xl border border-b-0 px-3 flex items-center gap-2 text-xs cursor-pointer select-none ${activeTabId === tab.id ? "border-border bg-bg-base text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover/70"}`}
                  onClick={() => setActiveTabId(tab.id)}
                >
                  <span>{tab.title}</span>
                  {tab.closable ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(tab.id);
                      }}
                      className="text-text-secondary hover:text-accent-error"
                      title="Close tab"
                      aria-label={`Close ${tab.title} tab`}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
              </div>

              <div
                ref={scrollerRef}
                onScroll={onScrollActive}
                id="workspace-tabpanel"
                role="tabpanel"
                aria-labelledby={activeTab ? `workspace-tab-${activeTab.id}` : undefined}
                className="flex-1 min-h-0 overflow-auto p-2 md:p-3">
                {renderTabContent()}
                {isCompactViewport && mobileDockOpen ? (
                  <div className="mt-3 h-[min(52vh,460px)]">
                    <OutputDock
                      examples={examples}
                      onPickExample={onRunInputChange}
                      runResult={runResult}
                      checkResult={checkResult}
                      submissions={submissions}
                      wsStatus={wsStatus}
                      latestVerdict={latestVerdict}
                      attention={dockAttention}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {!focusMode ? (
              <>
                {!dockCollapsed && !dockPopOut ? <div onMouseDown={startResize} className="w-1.5 cursor-col-resize bg-transparent hover:bg-secondary/30 transition-fast hidden lg:block" /> : null}

                {!dockPopOut ? (
                  <aside style={{ width: dockCollapsed ? 54 : dockWidth }} className="min-h-0 border-l border-border/60 bg-bg-surface/45 relative hidden lg:block">
                    <div className="absolute top-2 right-2 left-2 z-10 flex items-center justify-end gap-1">
                      <button className="h-11 w-11 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center" onClick={() => setDockCollapsed((v) => !v)} title={dockCollapsed ? "Expand dock" : "Collapse dock"} aria-label={dockCollapsed ? "Expand output dock" : "Collapse output dock"}>
                      {dockCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
                      </button>
                      {!dockCollapsed ? (
                        <button className="h-11 w-11 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center" onClick={() => setDockPopOut(true)} title="Pop out dock" aria-label="Open output dock pop out">
                        <SquareArrowOutUpRight className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>

                    <div className={`h-full min-h-0 pt-11 ${dockCollapsed ? "px-1" : "p-2"}`}>
                      {dockCollapsed ? (
                        <button className="w-full h-12 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center" onClick={() => setDockCollapsed(false)} aria-label="Expand output dock">
                          <FoldHorizontal className="w-4 h-4" />
                        </button>
                      ) : (
                        <div className="flex h-full min-h-0 flex-col gap-2">
                          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border bg-bg-base/60 p-1">
                            <button type="button" onClick={() => setRightPanelTab("output")} className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold ${rightPanelTab === "output" ? "bg-bg-hover text-text-primary" : "text-text-secondary hover:text-text-primary"}`}><Activity className="size-3.5" />Output</button>
                            <button type="button" onClick={() => setRightPanelTab("mentor")} className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold ${rightPanelTab === "mentor" ? "bg-primary/10 text-primary" : "text-text-secondary hover:text-text-primary"}`}><Bot className="size-3.5" />AI Mentor</button>
                            <button type="button" onClick={() => { setRightPanelTab("debugger"); onTrace?.(); }} className={`inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold ${rightPanelTab === "debugger" ? "bg-accent-warn/10 text-accent-warn" : "text-text-secondary hover:text-text-primary"}`}><Gauge className="size-3.5" />Debug</button>
                          </div>
                          <div className="min-h-0 flex-1">{renderRightPanel()}</div>
                        </div>
                      )}
                    </div>
                  </aside>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {dockPopOut && !focusMode ? (
        <div className="fixed right-4 top-20 w-[min(92vw,430px)] h-[min(76vh,700px)] z-40 rounded-2xl border border-border bg-bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-xs text-text-secondary uppercase tracking-widest">Output Dock (Pop-out)</div>
            <button className="h-11 w-11 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center" onClick={() => setDockPopOut(false)} aria-label="Close output dock pop out">
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-[calc(100%-2rem)]">
            <OutputDock
              examples={examples}
              onPickExample={onRunInputChange}
              runResult={runResult}
              checkResult={checkResult}
              submissions={submissions}
              wsStatus={wsStatus}
              latestVerdict={latestVerdict}
              attention={dockAttention}
            />
          </div>
        </div>
      ) : null}

      <div className="hidden lg:block absolute bottom-4 left-3 md:left-[76px] right-3 md:right-4 pointer-events-none">
        <div className="rounded-xl border border-border/70 bg-bg-surface/70 px-3 py-2 text-[11px] text-text-secondary flex items-center justify-between gap-3">
          <span>{contestTitle} · {statement.problem.label} · {statement.task.title}</span>
          <span className="text-text-secondary">stdin buffer: {runInput.length} chars · live: {wsStatus}</span>
        </div>
      </div>
    </div>
  );
};
