import React from "react";
import { MarkdownView } from "../MarkdownView";
import type { ContestProblemStatement } from "../../lib/api/contests";

type StatementSegment = "description" | "io" | "constraints" | "examples" | "notes";

type ProblemTabProps = {
  statement: ContestProblemStatement;
  onInjectExampleInput: (input: string) => void;
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

export const ProblemTab: React.FC<ProblemTabProps> = ({ statement, onInjectExampleInput }) => {
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
    <div className="h-full min-h-0">
      <div className="h-full min-h-0 rounded-2xl border border-border/70 bg-bg-surface shadow-[0_6px_18px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-border/60 flex items-center justify-between gap-3 bg-bg-surface">
          <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Problem statement sections">
            {([
              ["description", "Description"],
              ["io", "Input / Output"],
              ["constraints", "Constraints"],
              ["examples", "Examples"],
              ["notes", "Notes"],
            ] as Array<[StatementSegment, string]>).map(([key, label]) => (
              <button type="button"
                key={key}
                onClick={() => setSegment(key)}
                role="tab"
                aria-pressed={segment === key}
                aria-selected={segment === key}
                className={`h-10 px-3 rounded-lg text-xs border transition-fast ${segment === key ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-xs text-text-secondary">Now reading: <span className="text-text-primary">{segmentTitle}</span></div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto px-4 py-4 space-y-4">
          {segment === "examples" && examples.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {examples.map((ex, idx) => (
                <button type="button"
                  key={ex.id}
                  onClick={() => onInjectExampleInput(ex.input)}
                  className="text-left rounded-xl border border-border bg-bg-base/80 hover:bg-bg-hover/70 transition-fast p-3"
                  title="Copy example input to run panel"
                  aria-label={`Use example ${idx + 1} input`}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="text-xs text-primary">Example #{idx + 1}</div>
                    <div className="text-[11px] text-text-muted">Tap to send input →</div>
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-text-secondary mb-1">Input</div>
                  <pre className="text-xs text-text-primary overflow-auto max-h-28">{ex.input || "—"}</pre>
                  <div className="text-[11px] uppercase tracking-[0.06em] text-text-secondary mt-2 mb-1">Output</div>
                  <pre className="text-xs text-text-primary overflow-auto max-h-28">{ex.output || "—"}</pre>
                </button>
              ))}
            </div>
          ) : segment === "examples" ? (
            <div className="rounded-xl border border-border bg-bg-base/70 p-4 text-sm text-text-secondary">
              No fenced examples were detected in the statement. You can still run custom input from the editor panel.
            </div>
          ) : !segmentBody ? (
            <div className="rounded-xl border border-border bg-bg-base/70 p-4 text-sm text-text-secondary">
              This section is currently empty in the problem statement.
            </div>
          ) : (
            <div className="max-w-[75ch]">
              <MarkdownView content={segmentBody || statement.task.description} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
