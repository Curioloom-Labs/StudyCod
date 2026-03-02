import React from "react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { CodeEditor } from "../CodeEditor";
import { Play, Rocket, ScanSearch } from "lucide-react";
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

export const EditorPanel: React.FC<EditorPanelProps> = ({
  statement,
  language,
  onLanguageChange,
  code,
  onCodeChange,
  running,
  checking,
  onRun,
  onSubmit,
  onToggleFocusMode,
  focusMode,
}) => {
  const allowedLangs = (statement.task.allowedLanguages || []).filter(Boolean);
  const difficulty = difficultyFromLimits(statement);

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
    <div className="h-full min-h-0 rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_top,#1a1f2f_0%,#121521_34%,#0f1118_100%)] shadow-[0_8px_36px_rgba(0,0,0,0.38)] flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-border/70 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-text-secondary">{statement.problem.label}. Mission</div>
          <div className="text-lg text-text-primary font-semibold truncate">{statement.task.title}</div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="px-2 py-0.5 rounded-md bg-bg-base/80 border border-border/70">TL: {statement.task.timeLimitMs ?? "—"} ms</span>
            <span className="px-2 py-0.5 rounded-md bg-bg-base/80 border border-border/70">ML: {statement.task.memoryLimitMb ?? "—"} MB</span>
            <Badge color={difficulty === "HARD" ? "warn" : difficulty === "MEDIUM" ? "info" : "success"}>{difficulty}</Badge>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as JudgeLanguage)}
            className="px-3 py-2 rounded-xl bg-bg-base border border-border text-text-primary text-sm"
          >
            {(allowedLangs.length ? allowedLangs : ["java"]).map((lang) => (
              <option key={lang} value={lang}>
                {FRIENDLY_LANG[lang] ?? lang}
              </option>
            ))}
          </select>

          <Button variant="secondary" onClick={onToggleFocusMode} title="Toggle Focus Mode">
            <ScanSearch className="w-4 h-4 mr-2" />
            {focusMode ? "Exit Focus" : "Focus"}
          </Button>

          <Button variant="secondary" onClick={onRun} disabled={running || checking}>
            <Play className="w-4 h-4 mr-2" />
            {running ? "Running..." : "Run (Ctrl+Enter)"}
          </Button>

          <Button onClick={onSubmit} disabled={checking || running}>
            <Rocket className="w-4 h-4 mr-2" />
            {checking ? "Submitting..." : "Submit (Ctrl+Shift+Enter)"}
          </Button>
        </div>
      </div>

      <div className="px-4 py-2 text-[11px] text-text-secondary border-b border-border/50 bg-bg-base/35">
        StudyCod hotkeys active • Ctrl+Enter run • Ctrl+Shift+Enter submit • Autosave enabled per problem/language
      </div>

      <div className="flex-1 min-h-0">
        <CodeEditor language={language} value={code} onChange={onCodeChange} />
      </div>
    </div>
  );
};
