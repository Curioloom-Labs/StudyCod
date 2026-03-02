import React from "react";
import {
  Activity,
  LayoutDashboard,
  MessageSquareText,
  Trophy,
  UserCircle2,
  FolderCode,
  Sigma,
  PanelRightClose,
  PanelRightOpen,
  SquareArrowOutUpRight,
  FoldHorizontal,
  RefreshCw,
  GripVertical,
} from "lucide-react";
import { EditorPanel } from "./EditorPanel";
import { OutputDock } from "./OutputDock";
import { ProblemTab } from "./ProblemTab";
import { ContestDashboard } from "./ContestDashboard";
import type { ContestWorkspaceProps, WorkspaceTab, WorkspaceTabKind } from "./types";

type NavItem = { id: string; icon: React.ComponentType<any>; label: string };

const RAIL_ITEMS: NavItem[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "contests", icon: Trophy, label: "Contests" },
  { id: "problems", icon: FolderCode, label: "Problems" },
  { id: "practice", icon: Sigma, label: "Practice" },
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
  notes,
  onNotesChange,
  focusMode,
  onFocusModeChange,
}) => {
  const [tabs, setTabs] = React.useState<WorkspaceTab[]>([tabTemplate("contest-overview"), tabTemplate("problem")]);
  const [activeTabId, setActiveTabId] = React.useState<string>("problem");
  const [draggingTab, setDraggingTab] = React.useState<string | null>(null);

  const [dockCollapsed, setDockCollapsed] = React.useState(false);
  const [dockPopOut, setDockPopOut] = React.useState(false);
  const [dockWidth, setDockWidth] = React.useState(390);
  const [dockAttention, setDockAttention] = React.useState(false);

  const [streak, setStreak] = React.useState(0);
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

  React.useEffect(() => {
    setDockAttention(true);
    const t = window.setTimeout(() => setDockAttention(false), 900);
    return () => window.clearTimeout(t);
  }, [latestVerdictAt]);

  React.useEffect(() => {
    const tone = toneFromVerdict(latestVerdict);
    if (tone === "accepted") {
      setStreak((s) => s + 1);
      return;
    }
    if (tone === "wrong") {
      setStreak(0);
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

  const onScrollActive = React.useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    scrollMemory.current[activeTabId] = el.scrollTop;
  }, [activeTabId]);

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
      const next = Math.min(560, Math.max(300, startWidth + delta));
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
              notes={notes}
              onNotesChange={onNotesChange}
              streak={streak}
            />
          );
        }
        return (
          <EditorPanel
            statement={statement}
            language={language}
            onLanguageChange={onLanguageChange}
            code={code}
            onCodeChange={onCodeChange}
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
          <div className={`h-full min-h-0 grid ${focusMode ? "grid-cols-12" : "grid-cols-12"} gap-3`}>
            {problemBlockOrder.map((block) => (
              <section
                key={block}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggingProblemBlock) moveProblemBlock(draggingProblemBlock, block);
                  setDraggingProblemBlock(null);
                }}
                className={`${focusMode ? (block === "statement" ? "col-span-5" : "col-span-7") : "col-span-6"} min-h-0 rounded-2xl border border-border/60 bg-bg-surface/40 overflow-hidden`}
              >
                <div className="h-8 px-2 border-b border-border/60 bg-bg-surface/70 flex items-center justify-between text-[11px] text-text-secondary uppercase tracking-wider">
                  <span>{block === "statement" ? "Problem" : "Editor"}</span>
                  <span
                    draggable
                    onDragStart={() => setDraggingProblemBlock(block)}
                    onDragEnd={() => setDraggingProblemBlock(null)}
                    className="inline-flex items-center gap-1 text-[10px] text-text-muted cursor-grab"
                  >
                    <GripVertical className="w-3.5 h-3.5" /> drag
                  </span>
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
            <button onClick={onRefreshSubmissions} className="px-2 py-1 rounded-md border border-border text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-fast flex items-center gap-1">
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
      } catch (err: any) {
        const msg = err?.response?.data?.message || err?.message || "Failed to send question";
        setDiscussionError(String(msg));
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
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {askingOrganizer ? "Sending..." : "Send to organizer"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative h-[calc(100dvh-3rem)] min-h-[760px] w-full px-3 pb-3">
      <div className="h-full rounded-3xl bg-[linear-gradient(150deg,#0c0f17_0%,#0f111a_46%,#0b0d14_100%)] border border-border/60 overflow-hidden shadow-[0_24px_70px_rgba(0,0,0,0.48)] flex">
        <aside className="w-[58px] border-r border-border/60 bg-bg-surface/70 flex flex-col items-center py-3 gap-2">
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="group relative">
                <button
                  className="w-10 h-10 rounded-xl border border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary transition-fast flex items-center justify-center"
                  onClick={() => {
                    if (item.id === "dashboard") openTab("contest-overview");
                    if (item.id === "submissions") openTab("submissions");
                    if (item.id === "problems") openTab("problem");
                    if (item.id === "contests") openTab("leaderboard");
                    if (item.id === "practice") openTab("discussion");
                  }}
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
            <div className="h-11 border-b border-border/60 bg-bg-surface/65 px-2 flex items-end gap-1 overflow-auto">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => setDraggingTab(tab.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (draggingTab) moveTab(draggingTab, tab.id);
                    setDraggingTab(null);
                  }}
                  className={`h-9 mb-1 rounded-t-xl border border-b-0 px-3 flex items-center gap-2 text-xs cursor-pointer select-none ${activeTabId === tab.id ? "border-border bg-bg-base text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover/70"}`}
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
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div ref={scrollerRef} onScroll={onScrollActive} className="flex-1 min-h-0 overflow-auto p-3">
              {renderTabContent()}
            </div>
          </section>

          {!focusMode ? (
            <>
              {!dockCollapsed && !dockPopOut ? <div onMouseDown={startResize} className="w-1.5 cursor-col-resize bg-transparent hover:bg-secondary/30 transition-fast" /> : null}

              {!dockPopOut ? (
                <aside style={{ width: dockCollapsed ? 46 : dockWidth }} className="min-h-0 border-l border-border/60 bg-bg-surface/45 relative">
                  <div className="absolute top-2 right-2 left-2 z-10 flex items-center justify-end gap-1">
                    <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockCollapsed((v) => !v)} title={dockCollapsed ? "Expand dock" : "Collapse dock"}>
                      {dockCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
                    </button>
                    {!dockCollapsed ? (
                      <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockPopOut(true)} title="Pop out dock">
                        <SquareArrowOutUpRight className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div className={`h-full min-h-0 pt-10 ${dockCollapsed ? "px-1" : "p-2"}`}>
                    {dockCollapsed ? (
                      <button className="w-full h-12 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center" onClick={() => setDockCollapsed(false)}>
                        <FoldHorizontal className="w-4 h-4" />
                      </button>
                    ) : (
                      <OutputDock
                        examples={examples}
                        onPickExample={onRunInputChange}
                        runResult={runResult}
                        submissions={submissions}
                        wsStatus={wsStatus}
                        latestVerdict={latestVerdict}
                        attention={dockAttention}
                      />
                    )}
                  </div>
                </aside>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {dockPopOut && !focusMode ? (
        <div className="fixed right-4 top-20 w-[430px] h-[72vh] z-40 rounded-2xl border border-border bg-bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-2">
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="text-xs text-text-secondary uppercase tracking-widest">Output Dock (Pop-out)</div>
            <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockPopOut(false)}>
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-[calc(100%-2rem)]">
            <OutputDock
              examples={examples}
              onPickExample={onRunInputChange}
              runResult={runResult}
              submissions={submissions}
              wsStatus={wsStatus}
              latestVerdict={latestVerdict}
              attention={dockAttention}
            />
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-4 left-[76px] right-4 pointer-events-none">
        <div className="rounded-xl border border-border/70 bg-bg-surface/70 px-3 py-2 text-[11px] text-text-secondary flex items-center justify-between gap-3">
          <span>{contestTitle} · {statement.problem.label} · {statement.task.title}</span>
          <span className="text-text-secondary">stdin buffer: {runInput.length} chars · ws: {wsStatus}</span>
        </div>
      </div>
    </div>
  );
};
