import React, { useState } from "react";
import { Target, Check, X, ListChecks, Info, Lightbulb, AlertTriangle, Play, Terminal, Loader2 } from "lucide-react";
import { MarkdownView } from "../MarkdownView";
import { Button } from "../ui/Button";
import { tr } from "../../i18n";
import { normalizePlaygroundLanguage, runPlayground, type PlaygroundRunResult } from "../../lib/api/playground";
import type { InteractiveLesson, LessonBlock } from "../../lib/lessonBlocks";

const CALLOUT: Record<string, { cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  info: { cls: "border-primary/30 bg-primary/5", icon: Info },
  tip: { cls: "border-accent-success/30 bg-accent-success/5", icon: Lightbulb },
  warning: { cls: "border-accent-warning/40 bg-accent-warning/10", icon: AlertTriangle }
};

const RunnableBlock: React.FC<{ block: Extract<LessonBlock, { type: "runnable" }> }> = ({ block }) => {
  const [code, setCode] = useState(block.code);
  const [output, setOutput] = useState<PlaygroundRunResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setOutput(await runPlayground({ language: normalizePlaygroundLanguage(block.language), code }));
    } catch {
      setOutput({ stdout: "", stderr: tr("Не вдалося запустити код", "Failed to run code"), exitCode: 1, success: false });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-[var(--ui-card-radius)] border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-surface">
        <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-text-muted flex items-center gap-1.5">
          <Terminal className="w-3.5 h-3.5" /> {block.language} · {tr("пісочниця", "sandbox")}
        </span>
        <Button size="sm" variant="ghost" onClick={run} disabled={running} className="text-xs">
          {running ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
          {tr("Запустити", "Run")}
        </Button>
      </div>
      {block.prompt && <div className="px-3 pt-2.5 text-xs text-text-secondary">{block.prompt}</div>}
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
        rows={Math.min(16, Math.max(4, code.split("\n").length))}
        className="w-full font-mono text-sm bg-bg-code text-text-primary p-3 resize-y outline-none border-0 leading-[1.5]"
      />
      {output && (
        <div className="border-t border-border bg-bg-base p-3 font-mono text-xs space-y-1">
          {output.stdout && <pre className="whitespace-pre-wrap text-text-primary">{output.stdout}</pre>}
          {output.stderr && <pre className="whitespace-pre-wrap text-accent-error">{output.stderr}</pre>}
          {!output.stdout && !output.stderr && <span className="text-text-muted">{tr("(порожній вивід)", "(no output)")}</span>}
        </div>
      )}
    </div>
  );
};

const CheckBlock: React.FC<{ block: Extract<LessonBlock, { type: "check" }> }> = ({ block }) => {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <div className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4">
      <div className="flex items-start gap-2 text-sm font-mono text-text-primary mb-3">
        <ListChecks className="w-4 h-4 shrink-0 text-primary mt-0.5" /> {block.question}
      </div>
      <div className="space-y-2">
        {block.options.map((opt, i) => {
          const isCorrect = i === block.correct;
          const tone = !answered
            ? "border-border hover:border-primary/40"
            : isCorrect
            ? "border-accent-success/50 bg-accent-success/10"
            : i === picked
            ? "border-accent-error/50 bg-accent-error/10"
            : "border-border opacity-60";
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => setPicked(i)}
              className={`w-full text-left flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${tone}`}
            >
              <span className="w-5 h-5 shrink-0 rounded-full border border-border flex items-center justify-center text-[11px] font-mono text-text-muted">
                {answered && isCorrect ? <Check className="w-3 h-3 text-accent-success" /> : answered && i === picked ? <X className="w-3 h-3 text-accent-error" /> : String.fromCharCode(65 + i)}
              </span>
              <span className="text-text-secondary">{opt}</span>
            </button>
          );
        })}
      </div>
      {answered && block.explanation && (
        <div className="mt-3 text-xs text-text-secondary border-l-2 border-primary/40 pl-3">{block.explanation}</div>
      )}
    </div>
  );
};

const BlockRenderer: React.FC<{ block: LessonBlock }> = ({ block }) => {
  switch (block.type) {
    case "prose":
      return (
        <div className="prose prose-invert max-w-none text-text-secondary">
          <MarkdownView content={block.markdown} />
        </div>
      );
    case "callout": {
      const c = CALLOUT[block.variant] ?? CALLOUT.info;
      const Icon = c.icon;
      return (
        <div className={`rounded-[var(--ui-card-radius)] border p-3 flex gap-2.5 ${c.cls}`}>
          <Icon className="w-4 h-4 shrink-0 text-text-secondary mt-0.5" />
          <div className="prose prose-invert max-w-none text-sm text-text-secondary">
            <MarkdownView content={block.markdown} />
          </div>
        </div>
      );
    }
    case "code":
      return (
        <div>
          <MarkdownView content={"```" + (block.language || "text") + "\n" + block.code + "\n```"} />
          {block.caption && <div className="text-xs text-text-muted mt-1 font-mono">{block.caption}</div>}
        </div>
      );
    case "keypoints":
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {it}
            </li>
          ))}
        </ul>
      );
    case "runnable":
      return <RunnableBlock block={block} />;
    case "check":
      return <CheckBlock block={block} />;
    default:
      return null;
  }
};

/** Reader for an {@link InteractiveLesson}: objectives → sections of typed blocks → summary. */
export const LessonBlocksView: React.FC<{ lesson: InteractiveLesson }> = ({ lesson }) => (
  <div className="space-y-8 max-w-3xl">
    {lesson.objectives.length > 0 && (
      <div className="rounded-[var(--ui-card-radius)] border border-primary/25 bg-primary/5 p-4">
        <div className="flex items-center gap-2 text-sm font-mono text-primary leading-none mb-2.5">
          <Target className="w-4 h-4" /> {tr("Чого навчитесь", "What you'll learn")}
        </div>
        <ul className="space-y-1.5">
          {lesson.objectives.map((o, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary" /> {o}
            </li>
          ))}
        </ul>
      </div>
    )}

    {lesson.sections.map((sec, si) => (
      <section key={si} className="space-y-3">
        {sec.heading && <h3 className="text-base font-mono text-text-primary leading-none">{sec.heading}</h3>}
        {sec.blocks.map((b, bi) => (
          <BlockRenderer key={bi} block={b} />
        ))}
      </section>
    ))}

    {lesson.summary.length > 0 && (
      <div className="rounded-[var(--ui-card-radius)] border border-border bg-bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-mono text-text-primary leading-none mb-2.5">
          <ListChecks className="w-4 h-4 text-primary" /> {tr("Підсумок", "Summary")}
        </div>
        <ul className="space-y-1.5">
          {lesson.summary.map((s, i) => (
            <li key={i} className="flex gap-2 text-sm text-text-secondary">
              <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-text-muted" /> {s}
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);
