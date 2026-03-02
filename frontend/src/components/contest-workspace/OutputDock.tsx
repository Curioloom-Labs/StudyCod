import React from "react";
import type { ContestRunResult, ContestSubmissionListItem } from "../../lib/api/contests";
import { Activity, Clock3, FlaskConical, Radio, TerminalSquare } from "lucide-react";

type ExampleCase = {
  id: string;
  title: string;
  input: string;
};

type OutputDockProps = {
  examples: ExampleCase[];
  onPickExample: (input: string) => void;
  runResult: ContestRunResult | null;
  submissions: ContestSubmissionListItem[];
  wsStatus: "connecting" | "connected" | "offline";
  latestVerdict: string | null;
  attention: boolean;
};

type DockView = "tests" | "run" | "verdicts";

function verdictTone(verdict: string | null | undefined) {
  const v = String(verdict ?? "").toUpperCase();
  if (v.includes("AC") || v.includes("ACCEPT")) return "text-accent-success";
  if (v.includes("WA") || v.includes("WRONG")) return "text-accent-error";
  return "text-text-secondary";
}

export const OutputDock: React.FC<OutputDockProps> = ({ examples, onPickExample, runResult, submissions, wsStatus, latestVerdict, attention }) => {
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

  return (
    <div className={`h-full rounded-2xl border ${attention ? "border-primary/70 shadow-[0_0_0_1px_rgba(0,179,95,0.38),0_0_28px_rgba(0,179,95,0.22)]" : "border-border/70"} bg-[linear-gradient(180deg,rgba(21,24,36,0.96),rgba(14,16,24,0.96))] flex flex-col overflow-hidden`}>
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between gap-2">
        <div className="text-xs text-text-secondary uppercase tracking-widest">Execution Environment</div>
        <div className="flex items-center gap-1.5 text-xs">
          <Radio className={`w-3.5 h-3.5 ${wsStatus === "connected" ? "text-accent-success animate-pulse" : wsStatus === "connecting" ? "text-accent-warn" : "text-text-secondary"}`} />
          <span className={wsStatus === "connected" ? "text-accent-success" : "text-text-secondary"}>
            {wsStatus === "connected" ? "Live" : wsStatus === "connecting" ? "Syncing" : "Polling"}
          </span>
        </div>
      </div>

      <div className="px-2 py-2 border-b border-border/50 flex items-center gap-1">
        {([
          ["tests", "Tests", FlaskConical],
          ["run", "Run", TerminalSquare],
          ["verdicts", "Verdicts", Activity],
        ] as Array<[DockView, string, React.ComponentType<any>]>).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1.5 border transition-fast ${view === id ? "border-secondary/70 bg-secondary/10 text-secondary" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-3">
        {view === "tests" ? (
          <>
            {examples.length === 0 ? <div className="text-xs text-text-secondary">No parsed examples found in statement.</div> : null}
            {examples.map((ex) => (
              <button
                key={ex.id}
                onClick={() => onPickExample(ex.input)}
                className="w-full text-left rounded-xl border border-border bg-bg-base/80 hover:bg-bg-hover transition-fast p-2.5"
              >
                <div className="text-xs text-primary mb-1">{ex.title}</div>
                <pre className="text-[11px] text-text-primary overflow-auto max-h-24">{ex.input || "—"}</pre>
              </button>
            ))}
          </>
        ) : null}

        {view === "run" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-bg-base/70 p-2.5">
              <div className="text-[11px] text-text-secondary mb-1">stdout</div>
              <pre className="text-xs text-text-primary overflow-auto max-h-36">{runResult?.stdout || ""}</pre>
            </div>
            <div className="rounded-xl border border-border bg-bg-base/70 p-2.5">
              <div className="text-[11px] text-text-secondary mb-1">stderr</div>
              <pre className="text-xs text-text-primary overflow-auto max-h-36">{runResult?.stderr || ""}</pre>
            </div>
            <div className="text-xs text-text-secondary flex items-center gap-2">
              <Clock3 className="w-3.5 h-3.5" />
              exit={runResult?.exitCode ?? "—"} · success={String(!!runResult?.success)}
            </div>
          </div>
        ) : null}

        {view === "verdicts" ? (
          <div className="space-y-3">
            <div className={`rounded-xl border border-border bg-bg-base/80 p-2.5 text-sm ${verdictTone(latestVerdict)}`}>
              Latest verdict: <span className="font-semibold">{latestVerdict ?? "—"}</span>
            </div>

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
                  <div className="text-text-secondary">{s.score != null && s.maxScore != null ? `${s.score}/${s.maxScore}` : "—"}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
