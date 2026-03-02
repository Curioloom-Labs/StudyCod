import React from "react";
import { MarkdownView } from "../MarkdownView";
import type { ContestProblemStatement } from "../../lib/api/contests";
import { NotebookPen, Sparkles } from "lucide-react";

type StatementSegment = "description" | "io" | "constraints" | "examples" | "notes";

type ProblemTabProps = {
  statement: ContestProblemStatement;
  onInjectExampleInput: (input: string) => void;
  notes: string;
  onNotesChange: (next: string) => void;
  streak: number;
};

type ExamplePair = {
  id: string;
  input: string;
  output: string;
};

function splitByHeadings(markdown: string): Record<StatementSegment, string> {
  const src = String(markdown || "");
  const lines = src.split(/\r?\n/);
  const sections: Record<StatementSegment, string[]> = {
    description: [],
    io: [],
    constraints: [],
    examples: [],
    notes: [],
  };

  let current: StatementSegment = "description";
  for (const line of lines) {
    const low = line.toLowerCase();
    if (/^#{1,4}\s+/.test(line)) {
      if (/input|output|вхід|вихід/.test(low)) current = "io";
      else if (/constraint|обмеження/.test(low)) current = "constraints";
      else if (/example|приклад/.test(low)) current = "examples";
      else if (/note|примітка/.test(low)) current = "notes";
      else current = "description";
    }
    sections[current].push(line);
  }

  return {
    description: sections.description.join("\n").trim(),
    io: sections.io.join("\n").trim(),
    constraints: sections.constraints.join("\n").trim(),
    examples: sections.examples.join("\n").trim(),
    notes: sections.notes.join("\n").trim(),
  };
}

function extractExamples(markdown: string): ExamplePair[] {
  const fences = Array.from(String(markdown).matchAll(/```(?:[\w+-]*)\n([\s\S]*?)```/g)).map((m) => String(m[1] ?? "").trim());
  const pairs: ExamplePair[] = [];
  for (let i = 0; i < fences.length; i += 2) {
    const input = fences[i] ?? "";
    const output = fences[i + 1] ?? "";
    if (!input && !output) continue;
    pairs.push({ id: `ex-${i / 2 + 1}`, input, output });
  }
  return pairs;
}

export const ProblemTab: React.FC<ProblemTabProps> = ({ statement, onInjectExampleInput, notes, onNotesChange, streak }) => {
  const [segment, setSegment] = React.useState<StatementSegment>("description");

  const split = React.useMemo(() => splitByHeadings(statement.task.description), [statement.task.description]);
  const examples = React.useMemo(() => extractExamples(split.examples || statement.task.description), [split.examples, statement.task.description]);

  const segmentTitle = React.useMemo(() => {
    if (segment === "description") return "Description";
    if (segment === "io") return "Input / Output";
    if (segment === "constraints") return "Constraints";
    if (segment === "examples") return "Examples";
    return "Notes";
  }, [segment]);

  const segmentBody = split[segment] || statement.task.description;

  return (
    <div className="h-full min-h-0 grid grid-cols-12 gap-3">
      <div className="col-span-8 min-h-0 rounded-2xl border border-border/70 bg-bg-surface/80 shadow-[0_12px_30px_rgba(0,0,0,0.24)] flex flex-col overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-border/60 flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["description", "Description"],
              ["io", "Input / Output"],
              ["constraints", "Constraints"],
              ["examples", "Examples"],
              ["notes", "Notes"],
            ] as Array<[StatementSegment, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSegment(key)}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-fast ${segment === key ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-xs text-text-secondary">Segment: {segmentTitle}</div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
          {segment === "examples" && examples.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {examples.map((ex, idx) => (
                <button
                  key={ex.id}
                  onClick={() => onInjectExampleInput(ex.input)}
                  className="text-left rounded-xl border border-border bg-bg-base/70 hover:bg-bg-hover/70 transition-fast p-3"
                  title="Click to send input to run panel"
                >
                  <div className="text-xs text-primary mb-2">Example #{idx + 1} (click to use input)</div>
                  <div className="text-[11px] text-text-secondary mb-1">Input</div>
                  <pre className="text-xs text-text-primary overflow-auto max-h-28">{ex.input || "—"}</pre>
                  <div className="text-[11px] text-text-secondary mt-2 mb-1">Output</div>
                  <pre className="text-xs text-text-primary overflow-auto max-h-28">{ex.output || "—"}</pre>
                </button>
              ))}
            </div>
          ) : (
            <MarkdownView content={segmentBody || statement.task.description} />
          )}
        </div>
      </div>

      <div className="col-span-4 min-h-0 flex flex-col gap-3">
        <div className="rounded-2xl border border-border/70 bg-bg-surface/85 p-3 shadow-[0_8px_26px_rgba(0,0,0,0.25)]">
          <div className="flex items-center gap-2 text-text-primary">
            <Sparkles className="w-4 h-4 text-primary" />
            <div className="text-sm font-semibold">Progress Streak</div>
          </div>
          <div className="mt-2 flex items-end gap-1.5">
            {Array.from({ length: 7 }).map((_, idx) => {
              const active = idx < Math.min(7, streak);
              return (
                <div
                  key={idx}
                  className={`w-4 rounded-md ${active ? "bg-primary/80 shadow-[0_0_16px_rgba(0,179,95,0.35)]" : "bg-border/80"}`}
                  style={{ height: active ? 32 : 20 }}
                />
              );
            })}
          </div>
          <div className="text-xs text-text-secondary mt-2">Current streak: {streak}</div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-bg-surface/85 p-3 shadow-[0_8px_26px_rgba(0,0,0,0.25)] flex-1 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 text-text-primary">
            <NotebookPen className="w-4 h-4 text-secondary" />
            <div className="text-sm font-semibold">Personal Notes</div>
          </div>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            className="mt-2 flex-1 min-h-[120px] rounded-xl bg-bg-base border border-border px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
            placeholder="Store your insights, corner cases, and strategy notes..."
          />
        </div>
      </div>
    </div>
  );
};
