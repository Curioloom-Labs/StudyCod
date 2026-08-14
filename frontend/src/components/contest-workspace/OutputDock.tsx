import React from "react";
import type { ContestCheckResult, ContestRunResult, ContestSubmissionListItem } from "../../lib/api/contests";
import { Activity, Clock3, FlaskConical, Radio, TerminalSquare, type LucideIcon } from "lucide-react";

type ExampleCase = {
  id: string;
  title: string;
  input: string;
};

type OutputDockProps = {
  examples: ExampleCase[];
  onPickExample: (input: string) => void;
  runResult: ContestRunResult | null;
  checkResult: ContestCheckResult | null;
  submissions: ContestSubmissionListItem[];
  wsStatus: "connecting" | "connected" | "offline";
  latestVerdict: string | null;
  attention: boolean;
};

type DockView = "tests" | "run" | "verdicts";

function verdictKind(verdict: string | null | undefined): "accepted" | "wrong" | "neutral" {
  const v = String(verdict ?? "").toUpperCase();
  if (v.includes("AC") || v.includes("ACCEPT")) return "accepted";
  if (v.includes("WA") || v.includes("WRONG")) return "wrong";
  return "neutral";
}

function verdictTone(verdict: string | null | undefined) {
  const kind = verdictKind(verdict);
  if (kind === "accepted") return "text-accent-success";
  if (kind === "wrong") return "text-accent-error";
  return "text-text-secondary";
}

export const OutputDock: React.FC<OutputDockProps> = ({ examples, onPickExample, runResult, checkResult, submissions, wsStatus, latestVerdict, attention }) => {
  const [view, setView] = React.useState<DockView>("tests");

  const chartData = React.useMemo(() => {
    return [...submissions]
      .slice(0, 12)
      .reverse()
      .map((s, idx) => ({
        index: idx + 1,
        score: Number(s.score ?? 0),
        tests: Number(s.testsPassed ?? 0),
      }));
  }, [submissions]);

  const sparkline = React.useMemo(() => {
    if (!chartData.length) return "";
    const width = 220;
    const height = 92;
    const maxY = Math.max(1, ...chartData.map(d => d.score));
    const stepX = chartData.length > 1 ? width / (chartData.length - 1) : 0;
    return chartData
      .map((d, i) => {
        const x = i * stepX;
        const y = height - d.score / maxY * height;
        return `${x},${y}`;
      })
      .join(" ");
  }, [chartData]);

  const latestSubmission = submissions[0] ?? null;
  const effectiveLatestVerdict = React.useMemo(() => {
    const source = checkResult?.verdict ?? latestVerdict ?? latestSubmission?.verdict ?? null;
    const normalized = String(source ?? "").trim();
    return normalized || null;
  }, [checkResult?.verdict, latestVerdict, latestSubmission?.verdict]);

  const latestScoreLabel = React.useMemo(() => {
    if (checkResult && Number.isFinite(checkResult.score) && Number.isFinite(checkResult.maxScore)) {
      return `${checkResult.score}/${checkResult.maxScore}`;
    }
    if (latestSubmission && latestSubmission.score != null && latestSubmission.maxScore != null) {
      return `${latestSubmission.score}/${latestSubmission.maxScore}`;
    }
    return "—";
  }, [checkResult, latestSubmission]);

  const nextAction = React.useMemo(() => {
    if (wsStatus === "offline") {
      return "Connection looks offline. You can keep coding and running locally; refresh verdicts when back online.";
    }
    if (!runResult && !checkResult && submissions.length === 0) {
      return "Start with Run on sample input, then Submit after stdout matches the expected output.";
    }
    if (runResult && !checkResult && submissions.length === 0) {
      return "Run looks complete. Submit now to validate against hidden tests and subtasks.";
    }

    const kind = verdictKind(effectiveLatestVerdict);
    if (kind === "accepted") {
      return "Accepted. Review score trend or move to the next problem when ready.";
    }
    if (kind === "wrong") {
      return "Check failed verdict details and subtasks, fix logic, and submit again.";
    }
    return "Review the latest verdict details and continue iterating toward a stable submission.";
  }, [wsStatus, runResult, checkResult, submissions.length, effectiveLatestVerdict]);

  return (
    <div className={`h-full rounded-2xl border ${attention ? "border-primary/60 shadow-[0_0_0_1px_rgba(0,179,95,0.2)]" : "border-border/70"} bg-bg-surface flex flex-col overflow-hidden`}>
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between gap-2 bg-bg-surface">
        <div className="text-xs text-text-secondary uppercase tracking-widest">Execution Output</div>
        <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border bg-bg-base/70">
          <Radio className={`w-3.5 h-3.5 ${wsStatus === "connected" ? "text-accent-success animate-pulse" : wsStatus === "connecting" ? "text-accent-warn" : "text-text-secondary"}`} />
          <span className={wsStatus === "connected" ? "text-accent-success" : "text-text-secondary"}>
            {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Syncing" : "Polling"}
          </span>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border/60 grid grid-cols-2 gap-2 bg-bg-base/35">
        <div className="rounded-lg border border-border bg-bg-base/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.07em] text-text-secondary">Latest verdict</div>
          <div className={`text-sm font-semibold mt-0.5 ${verdictTone(effectiveLatestVerdict)}`}>{effectiveLatestVerdict ?? "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-bg-base/70 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-[0.07em] text-text-secondary">Last score</div>
          <div className="text-sm font-semibold mt-0.5 text-text-primary">{latestScoreLabel}</div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-border/60 bg-bg-base/30">
        <div className="rounded-lg border border-border bg-bg-base/70 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.07em] text-text-secondary mb-1">Next action</div>
          <div className="text-xs text-text-primary leading-relaxed">{nextAction}</div>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-border/50 flex items-center gap-1">
        {([
          ["tests", "Tests", FlaskConical],
          ["run", "Run", TerminalSquare],
          ["verdicts", "Verdicts", Activity],
        ] as Array<[DockView, string, LucideIcon]>).map(([id, label, Icon]) => (
          <button type="button"
            key={id}
            onClick={() => setView(id)}
            aria-pressed={view === id}
            className={`h-9 px-2.5 rounded-lg text-xs flex items-center gap-1.5 border transition-fast ${view === id ? "border-secondary/70 bg-secondary/10 text-secondary" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {view === "tests" ? (
          <>
            {examples.length === 0 ? <div className="rounded-lg border border-border bg-bg-base/70 p-2.5 text-xs text-text-secondary">No parsed examples found in this statement section yet.</div> : null}
            {examples.map((ex) => (
              <button type="button"
                key={ex.id}
                onClick={() => onPickExample(ex.input)}
                className="w-full text-left rounded-xl border border-border bg-bg-base/80 hover:bg-bg-hover transition-fast p-2.5"
                aria-label={`Use ${ex.title} input`}
              >
                <div className="text-xs text-primary mb-1">{ex.title}</div>
                <pre className="text-[11px] text-text-primary overflow-auto max-h-24">{ex.input || "—"}</pre>
              </button>
            ))}
          </>
        ) : null}

        {view === "run" ? (
          <div className="space-y-3">
            {!runResult ? <div className="rounded-lg border border-border bg-bg-base/70 p-2.5 text-xs text-text-secondary">Run your code to inspect stdout, stderr, and exit code before submitting.</div> : null}
            {runResult ? (
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className={`px-2 py-1 rounded-md border border-border bg-bg-base/70 ${runResult.success ? "text-accent-success" : "text-accent-error"}`}>
                  {runResult.verdict ? runResult.verdict : runResult.success ? "OK" : "ERROR"}
                </span>
                <span className="px-2 py-1 rounded-md border border-border bg-bg-base/70 text-text-secondary inline-flex items-center gap-1">
                  <Clock3 className="w-3 h-3" />{runResult.timeMs != null ? `${runResult.timeMs} ms` : "—"}
                </span>
                <span className="px-2 py-1 rounded-md border border-border bg-bg-base/70 text-text-secondary">
                  {runResult.memoryKb != null ? `${Math.round(runResult.memoryKb / 1024)} MB` : "—"}
                </span>
                <span className="px-2 py-1 rounded-md border border-border bg-bg-base/70 text-text-secondary">exit {runResult.exitCode ?? "—"}</span>
              </div>
            ) : null}
            <div className="rounded-xl border border-border bg-bg-base/70 p-2.5">
              <div className="text-[11px] text-text-secondary mb-1">stdout</div>
              <pre className="text-xs text-text-primary overflow-auto max-h-36 whitespace-pre-wrap break-words">{runResult?.stdout || ""}</pre>
            </div>
            <div className="rounded-xl border border-border bg-bg-base/70 p-2.5">
              <div className="text-[11px] text-text-secondary mb-1">stderr</div>
              <pre className="text-xs text-accent-error/90 overflow-auto max-h-36 whitespace-pre-wrap break-words">{runResult?.stderr || ""}</pre>
            </div>
          </div>
        ) : null}

        {view === "verdicts" ? (
          <div className="space-y-3">
            <div className={`rounded-xl border border-border bg-bg-base/80 p-2.5 text-sm ${verdictTone(effectiveLatestVerdict)}`}>
              Latest verdict: <span className="font-semibold">{effectiveLatestVerdict ?? "—"}</span>
            </div>

            {checkResult ? (
              <div className="rounded-xl border border-border bg-bg-base/70 p-2.5 text-xs text-text-secondary">
                <div className="text-[11px] uppercase tracking-[0.06em] mb-1">Latest check snapshot</div>
                <div className="text-text-primary">Tests: {checkResult.testsPassed}/{checkResult.testsTotal} · Score: {checkResult.score}/{checkResult.maxScore}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {checkResult.maxTimeMs != null ? <span>max time: <span className="text-text-primary">{checkResult.maxTimeMs} ms</span></span> : null}
                  {checkResult.maxMemoryKb != null ? <span>max mem: <span className="text-text-primary">{Math.round(checkResult.maxMemoryKb / 1024)} MB</span></span> : null}
                </div>
                {checkResult.compileError ? <div className="mt-1 text-accent-error">Compile error: {checkResult.compileErrorKind || "UNKNOWN"}</div> : null}
              </div>
            ) : null}

            {Array.isArray(checkResult?.tests) && checkResult!.tests!.length > 0 ? (
              <div className="rounded-xl border border-border bg-bg-base/70 p-2.5">
                <div className="text-[11px] text-text-secondary mb-2">Per-test results ({checkResult!.tests!.length})</div>
                <div className="flex flex-wrap gap-1">
                  {checkResult!.tests!.map((t) => {
                    const ok = String(t.verdict ?? "").toUpperCase() === "AC";
                    const tone = ok
                      ? "bg-accent-success/15 text-accent-success border-accent-success/40"
                      : t.verdict
                        ? "bg-accent-error/15 text-accent-error border-accent-error/40"
                        : "bg-bg-base text-text-secondary border-border";
                    const title = `#${t.index} · ${t.group}${t.hidden ? " · hidden" : ""} · ${t.verdict ?? "—"}${t.timeMs != null ? ` · ${t.timeMs}ms` : ""}`;
                    return (
                      <span
                        key={t.index}
                        title={title}
                        className={`w-6 h-6 rounded border text-[10px] font-mono flex items-center justify-center ${tone}`}
                      >
                        {t.index}
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {checkResult?.firstFailure ? (
              <div className="rounded-xl border border-accent-error/40 bg-accent-error/5 p-2.5">
                <div className="text-[11px] text-accent-error mb-1.5">
                  First failing test: #{checkResult.firstFailure.index} · {checkResult.firstFailure.verdict ?? "—"}
                  {checkResult.firstFailure.hidden ? " · hidden" : ""}
                </div>
                {checkResult.firstFailure.hidden ? (
                  <div className="text-[11px] text-text-secondary">This is a hidden test, so its data is not shown. Reproduce the failure with your own edge cases.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.06em] text-text-secondary mb-0.5">Input</div>
                      <pre className="text-[11px] text-text-primary overflow-auto max-h-24 whitespace-pre-wrap break-words rounded bg-bg-base/70 border border-border p-1.5">{checkResult.firstFailure.input || "—"}</pre>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-accent-success mb-0.5">Expected</div>
                        <pre className="text-[11px] text-text-primary overflow-auto max-h-24 whitespace-pre-wrap break-words rounded bg-bg-base/70 border border-border p-1.5">{checkResult.firstFailure.expected || "—"}</pre>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-accent-error mb-0.5">Your output</div>
                        <pre className="text-[11px] text-text-primary overflow-auto max-h-24 whitespace-pre-wrap break-words rounded bg-bg-base/70 border border-border p-1.5">{checkResult.firstFailure.actual || "—"}</pre>
                      </div>
                    </div>
                    {checkResult.firstFailure.stderr ? (
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.06em] text-text-secondary mb-0.5">stderr</div>
                        <pre className="text-[11px] text-accent-error/90 overflow-auto max-h-20 whitespace-pre-wrap break-words rounded bg-bg-base/70 border border-border p-1.5">{checkResult.firstFailure.stderr}</pre>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}

            {(() => {
              const latest = submissions[0];
              const groupScores = latest?.groupScores ?? null;
              if (!Array.isArray(groupScores) || groupScores.length === 0) return null;
              const groupsWithMax = groupScores.filter((g) => Number.isFinite(g.maxScore) && (g.maxScore ?? 0) > 0);
              const solved = groupsWithMax.filter((g) => (g.score ?? 0) >= (g.maxScore ?? 0)).length;
              const total = groupsWithMax.length;
              if (!total) return null;
              return (
                <div className="rounded-xl border border-border bg-bg-base/60 p-2.5">
                  <div className="text-[11px] text-text-secondary mb-2">Subtasks</div>
                  <div className="text-xs text-text-primary mb-2">Solved: {solved}/{total}</div>
                  <div className="space-y-1">
                    {groupScores.slice(0, 12).map((g) => {
                      const ok = (g.score ?? 0) >= (g.maxScore ?? 0);
                      const max = Number.isFinite(g.maxScore) ? g.maxScore : 0;
                      const sc = Number.isFinite(g.score) ? g.score : 0;
                      return (
                        <div key={g.group} className="text-[11px] flex items-center justify-between gap-2">
                          <span className={ok ? "text-accent-success" : "text-text-secondary"}>{g.group || "—"}</span>
                          <span className="text-text-secondary">{sc}/{max}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="rounded-xl border border-border bg-bg-base/60 p-2.5 h-44">
              <div className="text-[11px] text-text-secondary mb-2">Performance analytics (score trend)</div>
              <div className="h-[calc(100%-1.2rem)] rounded-lg border border-border/60 bg-bg-base/70 p-2">
                {chartData.length === 0 ? (
                  <div className="h-full w-full flex items-center justify-center text-[11px] text-text-secondary">No submissions yet</div>
                ) : (
                  <svg viewBox="0 0 220 92" className="w-full h-full">
                    <polyline
                      fill="none"
                      stroke="#6ba8ff"
                      strokeWidth="2"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={sparkline}
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {submissions.slice(0, 12).map((s) => (
                <div key={s.id} className="rounded-lg border border-border bg-bg-base/60 p-2 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`font-semibold ${verdictTone(s.verdict)}`}>{s.verdict ?? "—"}</div>
                    <div className="text-text-secondary">#{s.id} · {s.language}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-text-secondary">{s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : "—"}</div>
                    {Array.isArray(s.groupScores) && s.groupScores.length > 0 ? (
                      <div className="text-[11px] text-text-secondary mt-1">
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
                </div>
              ))}
              {!submissions.length && !checkResult ? (
                <div className="rounded-lg border border-border bg-bg-base/70 p-2.5 text-xs text-text-secondary">
                  No submissions yet. Submit your solution to populate verdict history.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
