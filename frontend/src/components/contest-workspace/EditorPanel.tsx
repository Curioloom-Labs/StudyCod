import React from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CodeEditor } from "../CodeEditor";
import { Play, Rocket, ScanSearch, Minus, Plus, WrapText, RotateCcw, Copy, Check } from "lucide-react";
import type { ContestProblemStatement, JudgeLanguage } from "../../lib/api/contests";

const FRIENDLY_LANG: Record<JudgeLanguage, string> = {
  java: "Java",
  python: "Python",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  kotlin: "Kotlin",
};

type EditorPanelProps = {
  statement: ContestProblemStatement;
  language: JudgeLanguage;
  onLanguageChange: (next: JudgeLanguage) => void;
  code: string;
  onCodeChange: (next: string) => void;
  runInput: string;
  onRunInputChange: (next: string) => void;
  running: boolean;
  checking: boolean;
  onRun: () => void;
  onSubmit: () => void;
  onToggleFocusMode: () => void;
  focusMode: boolean;
};

function difficultyFromLimits(statement: ContestProblemStatement): "EASY" | "MEDIUM" | "HARD" {
  const t = Number(statement.task.timeLimitMs ?? 0);
  const m = Number(statement.task.memoryLimitMb ?? 0);
  if (t > 2000 || m <= 128) return "HARD";
  if (t > 1000 || m <= 256) return "MEDIUM";
  return "EASY";
}

function templateForLanguage(statement: ContestProblemStatement, lang: JudgeLanguage): string {
  const by = statement.task.templatesByLanguage || null;
  const t = by && typeof by[lang] === "string" ? String(by[lang] ?? "") : "";
  return t.trim() ? t : statement.task.template;
}

const FONT_MIN = 11;
const FONT_MAX = 22;
const FONT_STORAGE_KEY = "contest:editor:fontSize";
const WRAP_STORAGE_KEY = "contest:editor:wordWrap";

export const EditorPanel: React.FC<EditorPanelProps> = ({
  statement,
  language,
  onLanguageChange,
  code,
  onCodeChange,
  runInput,
  onRunInputChange,
  running,
  checking,
  onRun,
  onSubmit,
  onToggleFocusMode,
  focusMode,
}) => {
  const allowedLangs = (statement.task.allowedLanguages || []).filter(Boolean);
  const difficulty = difficultyFromLimits(statement);

  const [fontSize, setFontSize] = React.useState<number>(() => {
    try {
      const n = Number(localStorage.getItem(FONT_STORAGE_KEY));
      return Number.isFinite(n) && n >= FONT_MIN && n <= FONT_MAX ? n : 14;
    } catch {
      return 14;
    }
  });
  const [wordWrap, setWordWrap] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem(WRAP_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    try {
      localStorage.setItem(FONT_STORAGE_KEY, String(fontSize));
      localStorage.setItem(WRAP_STORAGE_KEY, wordWrap ? "1" : "0");
    } catch {
      // ignore
    }
  }, [fontSize, wordWrap]);

  const adjustFont = (delta: number) => setFontSize((prev) => Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta)));

  const resetToTemplate = () => {
    if (typeof window !== "undefined" && !window.confirm("Reset your code to the starter template? Unsaved changes will be lost.")) return;
    onCodeChange(templateForLanguage(statement, language));
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code ?? "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  };

  const lineCount = React.useMemo(() => (code ? code.split("\n").length : 0), [code]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        onRun();
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key === "Enter") {
        event.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onRun, onSubmit]);

  return (
    <div className="h-full min-h-0 rounded-2xl border border-border/70 bg-bg-surface shadow-[0_6px_18px_rgba(0,0,0,0.2)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/70 flex flex-wrap items-center justify-between gap-3 bg-bg-surface">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.08em] text-text-secondary">{statement.problem.label} · Solve workspace</div>
          <div className="text-lg text-text-primary font-semibold truncate">{statement.task.title}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="px-2 py-1 rounded-md bg-bg-base border border-border/70">TL: {statement.task.timeLimitMs ?? "—"} ms</span>
            <span className="px-2 py-1 rounded-md bg-bg-base border border-border/70">ML: {statement.task.memoryLimitMb ?? "—"} MB</span>
            <Badge color={difficulty === "HARD" ? "warn" : difficulty === "MEDIUM" ? "info" : "success"}>{difficulty}</Badge>
          </div>
        </div>

        <div className="flex w-full lg:w-auto items-center flex-wrap gap-2 justify-start lg:justify-end">
          <label htmlFor="contest-editor-language" className="sr-only">Language</label>
          <select
            id="contest-editor-language"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as JudgeLanguage)}
            aria-label="Select solution language"
            className="h-11 w-full sm:w-auto px-3 rounded-xl bg-bg-base border border-border text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-secondary/50"
          >
            {(allowedLangs.length ? allowedLangs : (["java"] satisfies JudgeLanguage[])).map((lang) => (
              <option key={lang} value={lang}>
                {FRIENDLY_LANG[lang] ?? lang}
              </option>
            ))}
          </select>

          <div className="inline-flex items-center rounded-xl border border-border bg-bg-base overflow-hidden" role="group" aria-label="Editor font size">
            <button type="button" onClick={() => adjustFont(-1)} disabled={fontSize <= FONT_MIN} className="h-11 w-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40" aria-label="Decrease font size" title="Decrease font size">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-1.5 text-[11px] text-text-secondary tabular-nums w-7 text-center" aria-live="polite">{fontSize}</span>
            <button type="button" onClick={() => adjustFont(1)} disabled={fontSize >= FONT_MAX} className="h-11 w-9 flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40" aria-label="Increase font size" title="Increase font size">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setWordWrap((v) => !v)}
            className={`h-11 w-11 rounded-xl border flex items-center justify-center transition-fast ${wordWrap ? "border-secondary/60 bg-secondary/10 text-secondary" : "border-border bg-bg-base text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
            aria-pressed={wordWrap}
            title="Toggle word wrap"
            aria-label="Toggle word wrap"
          >
            <WrapText className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={copyCode}
            className="h-11 w-11 rounded-xl border border-border bg-bg-base text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center transition-fast"
            title="Copy code"
            aria-label="Copy code"
          >
            {copied ? <Check className="w-4 h-4 text-accent-success" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={resetToTemplate}
            className="h-11 w-11 rounded-xl border border-border bg-bg-base text-text-secondary hover:text-accent-error hover:bg-bg-hover flex items-center justify-center transition-fast"
            title="Reset to starter template"
            aria-label="Reset to starter template"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <Button
            variant="ghost"
            onClick={onToggleFocusMode}
            className="h-11 px-4"
            title="Toggle Focus Mode"
            aria-label={focusMode ? "Exit focus mode" : "Enable focus mode"}
          >
            <ScanSearch className="w-4 h-4 mr-2" />
            {focusMode ? "Exit Focus" : "Focus"}
          </Button>

          <Button variant="secondary" onClick={onRun} disabled={running || checking} className="h-11 px-4" aria-label="Run code">
            <Play className="w-4 h-4 mr-2" />
            {running ? "Running..." : "Run (Ctrl+Enter)"}
          </Button>

          <Button onClick={onSubmit} disabled={checking || running} className="h-11 px-4" aria-label="Submit solution">
            <Rocket className="w-4 h-4 mr-2" />
            {checking ? "Submitting..." : "Submit (Ctrl+Shift+Enter)"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 text-[11px] text-text-secondary border-b border-border/60 bg-bg-base/60 flex items-center justify-between gap-3">
        <span>
          Hotkeys: <span className="text-text-primary">Ctrl+Enter</span> run · <span className="text-text-primary">Ctrl+Shift+Enter</span> submit · Drafts auto-save by problem and language
        </span>
        <span className="hidden sm:inline tabular-nums text-text-muted">{lineCount} lines · {(code ?? "").length} chars</span>
      </div>

      <div className="flex-1 min-h-0">
        <CodeEditor language={language} value={code} onChange={onCodeChange} fontSize={fontSize} wordWrap={wordWrap} />
      </div>

      <div className="border-t border-border/60 bg-bg-base/55 px-4 py-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-[11px] uppercase tracking-wider text-text-secondary">Run input (stdin)</div>
          <div className="hidden sm:block text-[11px] text-text-muted">Use examples from the problem panel for quick checks</div>
        </div>
        <textarea
          value={runInput}
          onChange={(e) => onRunInputChange(e.target.value)}
          aria-label="Custom run input"
            className="w-full min-h-[120px] sm:min-h-[108px] max-h-[220px] resize-y rounded-xl bg-bg-base border border-border px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-secondary/50"
          placeholder="Paste input to validate edge cases before submit..."
        />
      </div>
    </div>
  );
};
