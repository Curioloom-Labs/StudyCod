import React from "react";
import {
  Bot,
  Braces,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileCode2,
  FileText,
  FolderCode,
  Gauge,
  History,
  Lightbulb,
  LockKeyhole,
  Loader2,
  Maximize2,
  Minimize2,
  Rocket,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  SquareTerminal,
  TestTube2,
} from "lucide-react";
import { CodeEditor } from "../CodeEditor";
import { MultiFileEditor } from "../MultiFileEditor";
import { DebugMentorChat } from "../DebugMentorChat";
import { ErrorExplainButton } from "../ErrorExplainButton";
import { MarkdownView } from "../MarkdownView";
import { WebPreviewPane } from "../WebPreviewPane";
import type {
  CodeFile,
  JudgeLanguage,
  LibraryTaskProjectSpec,
  WebTaskFile,
} from "../../lib/api/library";
import { IDE_THEORY_COMPLETION_KEY, scopedStorageKey } from "../../lib/storageScope";
import {
  JUDGE_LANGUAGE_LABELS,
  compilersForFamily,
} from "../../lib/judgeLanguages";

type IdeMode = "theory" | "practice" | "debug";
type AssistantTab = "task" | "hints" | "mentor";
type BottomTab = "terminal" | "tests" | "debugger" | "console" | "history";

export type StudyCodIdeTask = {
  id: number | string;
  title: string;
  description: string;
  section?: string | null;
  difficulty?: string | null;
  tags?: string[] | null;
  taskMode?: "CODE" | "WEB";
  projectSpec?: LibraryTaskProjectSpec | null;
};

export type StudyCodIdeRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  timeMs?: number | null;
  memoryKb?: number | null;
};

export type StudyCodIdeCheckResult = {
  verdict: string | null;
  testsPassed: number;
  testsTotal: number;
  score?: number;
  maxScore?: number;
  compileError?: string | null;
  publicTestResults?: Array<{
    testId: number;
    input?: string;
    expectedOutput?: string;
    actualOutput?: string;
    passed: boolean;
    verdict?: string | null;
    error?: string | null;
    stderr?: string | null;
  }>;
};

export type StudyCodIdeTrace = {
  steps: Array<{
    line: number;
    event?: string;
    locals: Record<string, unknown>;
    stack?: Array<{
      func: string;
      line: number;
      locals: Record<string, unknown>;
    }>;
  }>;
  programOutput?: string;
  stderr?: string;
  truncated?: boolean;
};

type Props = {
  task: StudyCodIdeTask;
  theory: string | null;
  language: JudgeLanguage;
  onLanguageChange: (next: JudgeLanguage) => void;
  compiler: string;
  onCompilerChange: (next: string) => void;
  code: string;
  onCodeChange: (next: string) => void;
  files: CodeFile[];
  onFilesChange: (next: CodeFile[]) => void;
  useFiles: boolean;
  onEnableFiles: () => void;
  entryFile: string;
  stdin: string;
  onStdinChange: (next: string) => void;
  firstExampleInput?: string;
  onUseExampleInput: () => void;
  running: boolean;
  checking: boolean;
  onRun: () => void;
  onCheck: () => void;
  onSave: () => void;
  onReset: () => void;
  onTheoryComplete?: () => void;
  toolbar?: React.ReactNode;
  languageOptions?: JudgeLanguage[];
  readOnly?: boolean;
  onBack?: () => void;
  disableLanguageChange?: boolean;
  runResult: StudyCodIdeRunResult | null;
  checkResult: StudyCodIdeCheckResult | null;
  resultCards?: React.ReactNode;
  hints?: string[];
  trace?: StudyCodIdeTrace | null;
  tracing?: boolean;
  onTrace?: () => void;
  webPreviewFiles?: WebTaskFile[];
  isWebTask?: boolean;
};

const LAYOUT_KEY = "studycod:ide:layout:v3";
const HISTORY_KEY = "studycod:ide:history:v1";

type LayoutState = {
  left: number;
  right: number;
  bottom: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
};

const DEFAULT_LAYOUT: LayoutState = {
  left: 220,
  right: 320,
  bottom: 360,
  leftCollapsed: false,
  rightCollapsed: false,
  bottomCollapsed: false,
};

function readLayout(): LayoutState {
  if (typeof window === "undefined") return DEFAULT_LAYOUT;
  try {
    const raw = JSON.parse(
      localStorage.getItem(LAYOUT_KEY) || "null",
    ) as Partial<LayoutState> | null;
    return { ...DEFAULT_LAYOUT, ...(raw || {}) };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function writeLayout(layout: LayoutState) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Private browsing or a full storage quota should not break the IDE.
  }
}

function verdictIsAccepted(verdict?: string | null) {
  return String(verdict ?? "").toUpperCase() === "AC";
}

function languageLabel(language: JudgeLanguage) {
  return JUDGE_LANGUAGE_LABELS[language] || language;
}

export const StudyCodIDEWorkspace: React.FC<Props> = (props) => {
  const tr = (uk: string, en: string) => {
    if (typeof document === "undefined") return uk;
    return document.documentElement.lang?.toLowerCase().startsWith("en")
      ? en
      : uk;
  };
  const taskTheoryKey = scopedStorageKey(IDE_THEORY_COMPLETION_KEY, props.task.id);
  const languageOptions = props.languageOptions ?? (Object.keys(JUDGE_LANGUAGE_LABELS) as JudgeLanguage[]);
  const [mode, setMode] = React.useState<IdeMode>(() => {
    if (!props.theory) return "practice";
    try {
      return localStorage.getItem(taskTheoryKey) === "1"
        ? "practice"
        : "theory";
    } catch {
      return "theory";
    }
  });
  const [layout, setLayout] = React.useState<LayoutState>(readLayout);
  const [assistantTab, setAssistantTab] = React.useState<AssistantTab>("task");
  const [openHintIndex, setOpenHintIndex] = React.useState<number | null>(null);
  const [bottomTab, setBottomTab] = React.useState<BottomTab>("tests");
  const [activeFile, setActiveFile] = React.useState(props.entryFile);
  const [fontSize, setFontSize] = React.useState(14);
  const [wordWrap, setWordWrap] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [traceStep, setTraceStep] = React.useState(0);
  const [history, setHistory] = React.useState<
    Array<{ at: string; code: string }>
  >(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(scopedStorageKey(HISTORY_KEY, props.task.id)) || "[]",
      );
      return Array.isArray(raw)
        ? raw
            .filter((item) => item && typeof item.code === "string")
            .slice(0, 20)
        : [];
    } catch {
      return [];
    }
  });
  const resizeRef = React.useRef<{
    axis: "left" | "right" | "bottom";
    start: number;
    value: number;
  } | null>(null);
  const lastHistoryCode = React.useRef(props.code);

  React.useEffect(() => writeLayout(layout), [layout]);
  React.useEffect(() => {
    let nextMode: IdeMode = props.theory ? "theory" : "practice";
    if (props.theory) {
      try {
        if (localStorage.getItem(taskTheoryKey) === "1") nextMode = "practice";
      } catch {
        // Keep the theory gate when storage is unavailable.
      }
    }
    setMode(nextMode);
    setAssistantTab("task");
    setOpenHintIndex(null);
    setBottomTab("tests");
    setFocusMode(false);
    setTraceStep(0);
  }, [props.task.id, props.theory, taskTheoryKey]);
  React.useEffect(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(scopedStorageKey(HISTORY_KEY, props.task.id)) || "[]",
      );
      const next = Array.isArray(raw)
        ? raw.filter((item) => item && typeof item.code === "string").slice(0, 20)
        : [];
      setHistory(next);
    } catch {
      setHistory([]);
    }
    lastHistoryCode.current = props.code;
  }, [props.task.id]);
  React.useEffect(() => {
    if (!props.code.trim() || props.code === lastHistoryCode.current) return;
    const timer = window.setTimeout(() => {
      const next = [
        { at: new Date().toISOString(), code: props.code },
        ...history,
      ].slice(0, 20);
      lastHistoryCode.current = props.code;
      setHistory(next);
      try {
        localStorage.setItem(
          scopedStorageKey(HISTORY_KEY, props.task.id),
          JSON.stringify(next),
        );
      } catch {
        /* ignore */
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [history, props.code, props.task.id]);
  React.useEffect(() => {
    if (props.files.some((file) => file.path === activeFile)) return;
    setActiveFile(props.entryFile);
  }, [activeFile, props.entryFile, props.files]);

  const markTheoryComplete = () => {
    try {
      localStorage.setItem(taskTheoryKey, "1");
    } catch {
      /* ignore */
    }
    setMode("practice");
    props.onTheoryComplete?.();
  };

  const updateLayout = (patch: Partial<LayoutState>) =>
    setLayout((current) => ({ ...current, ...patch }));

  const beginResize = (
    axis: "left" | "right" | "bottom",
    event: React.PointerEvent,
  ) => {
    event.preventDefault();
    resizeRef.current = {
      axis,
      start: axis === "bottom" ? event.clientY : event.clientX,
      value: layout[axis],
    };
    const move = (moveEvent: PointerEvent) => {
      const current = resizeRef.current;
      if (!current) return;
      const delta =
        moveEvent[axis === "bottom" ? "clientY" : "clientX"] - current.start;
      const direction = axis === "right" || axis === "bottom" ? -1 : 1;
      const min = axis === "bottom" ? 150 : 170;
      const max = axis === "bottom" ? 620 : 520;
      updateLayout({
        [axis]: Math.min(max, Math.max(min, current.value + delta * direction)),
      });
    };
    const stop = () => {
      resizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  const resultVerdict =
    props.checkResult?.verdict || (props.runResult?.success ? "OK" : null);
  const allTestsPassed = Boolean(
    props.checkResult &&
    props.checkResult.testsTotal > 0 &&
    props.checkResult.testsPassed >= props.checkResult.testsTotal,
  );
  React.useEffect(() => {
    if (props.hints?.length && props.checkResult && !allTestsPassed) {
      setAssistantTab("hints");
      setOpenHintIndex((current) =>
        current !== null && current < props.hints!.length ? current : 0,
      );
    }
  }, [allTestsPassed, props.checkResult?.verdict, props.checkResult?.testsPassed, props.hints?.length]);
  const lineCount = (props.code || "").split("\n").length;
  const fileList = props.useFiles
    ? props.files
    : [{ path: props.entryFile, content: props.code }];

  const runWithTab = () => {
    if (props.readOnly) return;
    setBottomTab("terminal");
    props.onRun();
  };
  const checkWithTab = () => {
    if (props.readOnly) return;
    setBottomTab("tests");
    props.onCheck();
  };
  const renderBottom = () => {
    if (bottomTab === "debugger") {
      const step =
        props.trace?.steps?.[
          Math.min(
            traceStep,
            Math.max(0, (props.trace?.steps?.length ?? 1) - 1),
          )
        ];
      if (props.trace && step) {
        const stack = step.stack?.length
          ? step.stack
          : [{ func: "<module>", line: step.line, locals: step.locals }];
        return (
          <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-auto p-4 text-xs text-[#b9c9bd] lg:grid-cols-[1.2fr_.8fr]">
            <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold text-white">
                  {tr("Покрокове виконання", "Step execution")}
                </div>
                <span className="text-[#72edb0]">
                  {tr("Крок", "Step")} {traceStep + 1}/
                  {props.trace.steps.length}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(0, props.trace.steps.length - 1)}
                value={Math.min(
                  traceStep,
                  Math.max(0, props.trace.steps.length - 1),
                )}
                onChange={(event) => setTraceStep(Number(event.target.value))}
                className="w-full accent-[#00d978]"
              />
              <div className="mt-3 rounded-lg border border-[#00d978]/20 bg-[#00d978]/[.06] p-3">
                <div className="text-[10px] uppercase tracking-[.12em] text-[#82968a]">
                  {tr("Поточний рядок", "Current line")}
                </div>
                <div className="mt-1 font-mono text-[#72edb0]">
                  Line {step.line} · {step.event || "line"}
                </div>
              </div>
              <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 font-mono text-[11px] text-[#c8d6cc]">
                {props.trace.programOutput || ""}
              </pre>
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                <div className="mb-2 flex items-center gap-2 font-semibold text-white">
                  <Gauge className="size-4 text-[#72edb0]" />
                  Variables
                </div>
                <pre className="max-h-44 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-[#c8d6cc]">
                  {JSON.stringify(step.locals || {}, null, 2)}
                </pre>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                <div className="mb-2 font-semibold text-white">Call stack</div>
                {stack.map((frame, index) => (
                  <div
                    key={`${frame.func}-${index}`}
                    className="flex items-center justify-between border-b border-white/5 py-1.5 text-[11px]"
                  >
                    <span className="text-[#c8d6cc]">{frame.func}</span>
                    <span className="text-[#82968a]">L{frame.line}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      }
      return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-auto p-4 text-xs text-[#b9c9bd] md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="mb-2 flex items-center gap-2 font-semibold text-white">
              <Gauge className="size-4 text-[#72edb0]" />
              Variables
            </div>
            <p>
              {props.onTrace
                ? tr(
                    "Натисни Trace, щоб запустити покрокове виконання.",
                    "Press Trace to start step execution.",
                  )
                : tr(
                    "Для цього контексту debug trace ще не підключений.",
                    "Debug trace is not connected for this context yet.",
                  )}
            </p>
            {props.onTrace ? (
              <button
                type="button"
                onClick={props.onTrace}
                disabled={props.tracing}
                className="mt-3 rounded-lg bg-[#00d978] px-3 py-2 text-[11px] font-bold text-[#062211] disabled:opacity-50"
              >
                {props.tracing ? tr("Трасуємо…", "Tracing…") : "Trace"}
              </button>
            ) : null}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="mb-2 font-semibold text-white">Call stack</div>
            <p>
              {tr(
                "Покроковий trace підключиться до debug runner для цієї задачі.",
                "Step trace will connect to the debug runner for this task.",
              )}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="mb-2 font-semibold text-white">Watch</div>
            <p>
              {tr(
                "Додай вирази для спостереження у наступному кроці.",
                "Add expressions to watch in the next step.",
              )}
            </p>
          </div>
        </div>
      );
    }
    if (bottomTab === "history") {
      return (
        <div className="h-full overflow-auto p-4 text-xs text-[#b9c9bd]">
          <div className="rounded-xl border border-white/10 bg-white/[.03] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold text-white">
                {tr("Локальна історія", "Local history")}
              </div>
              <div className="flex items-center gap-1 text-[#72edb0]">
                <Check className="size-4" />
                Autosave
              </div>
            </div>
            <p className="mt-2">
              {tr(
                "Знімки коду зберігаються у цьому браузері й не відправляються на сервер.",
                "Code snapshots stay in this browser and are not sent to the server.",
              )}
            </p>
            {history.length ? (
              <div className="mt-3 space-y-2">
                {history.map((entry, index) => (
                  <div
                    key={`${entry.at}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-2"
                  >
                    <div className="min-w-0">
                      <div className="text-[10px] text-[#82968a]">
                        {new Date(entry.at).toLocaleString()}
                      </div>
                      <pre className="mt-1 max-h-8 overflow-hidden whitespace-pre-wrap font-mono text-[10px] text-[#c8d6cc]">
                        {entry.code}
                      </pre>
                    </div>
                    <button
                      type="button"
                      onClick={() => props.onCodeChange(entry.code)}
                      className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] font-semibold text-[#72edb0] hover:bg-white/[.07]"
                    >
                      {tr("Відновити", "Restore")}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[#82968a]">
                {tr(
                  "Перші версії з’являться після редагування коду.",
                  "Snapshots will appear after you edit the code.",
                )}
              </p>
            )}
          </div>
        </div>
      );
    }
    if (bottomTab === "console") {
      return (
        <pre className="h-full overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-6 text-[#c8d6cc]">
          {props.runResult?.stdout ||
            props.runResult?.stderr ||
            tr(
              "Консоль порожня. Натисни Run, щоб побачити stdout і stderr.",
              "Console is empty. Press Run to inspect stdout and stderr.",
            )}
        </pre>
      );
    }
    if (bottomTab === "terminal") {
      return (
        <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-auto p-4 md:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[.14em] text-[#82968a]">
              stdout
            </div>
            <pre className="min-h-24 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 text-[#dce7df]">
              {props.runResult?.stdout || "—"}
            </pre>
          </div>
          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[.14em] text-[#82968a]">
              stderr
            </div>
            <pre className="min-h-24 whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-mono text-xs leading-5 text-[#ff9aba]">
              {props.runResult?.stderr || "—"}
            </pre>
          </div>
        </div>
      );
    }
    if (props.checking) {
      return (
        <div
          className="flex h-full min-h-0 items-center justify-center overflow-auto p-4"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="w-full max-w-xl rounded-2xl border border-[#00d978]/30 bg-[linear-gradient(145deg,rgba(0,217,120,.11),rgba(255,255,255,.025))] p-5 shadow-[0_18px_42px_-30px_rgba(0,217,120,.8)]">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#00d978]/15 text-[#72edb0]">
                <Loader2 className="size-5 animate-spin" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">
                    {tr("Система тестує твоє рішення", "The system is testing your solution")}
                  </h3>
                  <span className="rounded-full bg-[#00d978]/10 px-2 py-0.5 text-[10px] font-bold text-[#72edb0]">
                    judge
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-5 text-[#a7b5aa]">
                  {tr(
                    "Компілюємо код і проганяємо публічні та приховані тести. Результати з’являться тут одразу після завершення перевірки.",
                    "Compiling the code and running public and hidden tests. Results will appear here as soon as the check finishes.",
                  )}
                </p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[.09]">
              <div className="h-full w-2/5 animate-pulse rounded-full bg-[#00d978]" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-semibold text-[#82968a]">
              {[tr("Компіляція", "Compile"), tr("Публічні кейси", "Public cases"), tr("Приховані кейси", "Hidden cases")].map((label) => (
                <div key={label} className="flex items-center gap-1.5 rounded-lg bg-black/15 px-2.5 py-2">
                  <span className="size-1.5 animate-pulse rounded-full bg-[#72edb0]" />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="h-full overflow-auto p-4 text-xs text-[#c8d6cc]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {props.checkResult ? (
            <span
              className={`rounded-full px-2.5 py-1 font-bold ${verdictIsAccepted(props.checkResult.verdict) ? "bg-[#00ff88]/10 text-[#72edb0]" : "bg-[#ff6b9d]/10 text-[#ff9aba]"}`}
            >
              {props.checkResult.verdict || "—"}
            </span>
          ) : null}
          {props.checkResult ? (
            <span>
              {tr("Тести", "Tests")}: {props.checkResult.testsPassed}/
              {props.checkResult.testsTotal}
            </span>
          ) : null}
          {props.runResult ? (
            <span>
              {tr("Код завершення", "Exit code")}: {props.runResult.exitCode}
            </span>
          ) : null}
        </div>
        {props.checkResult?.compileError ? (
          <pre className="mb-3 whitespace-pre-wrap rounded-xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/5 p-3 font-mono text-[#ff9aba]">
            {props.checkResult.compileError}
          </pre>
        ) : null}
        {props.checkResult?.publicTestResults?.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {props.checkResult.publicTestResults.map((test, index) => (
              <button
                key={test.testId}
                type="button"
                onClick={() =>
                  setNotice(`${tr("Тест", "Test")} #${test.testId}`)
                }
                className={`rounded-lg border p-2 text-center transition hover:brightness-125 ${test.passed ? "border-[#00d978]/30 bg-[#00d978]/10 text-[#72edb0]" : "border-[#ff6b9d]/30 bg-[#ff6b9d]/10 text-[#ff9aba]"}`}
              >
                <span className="block font-bold">
                  {test.passed ? "✓" : "×"} {index + 1}
                </span>
                <span className="mt-1 block text-[10px] opacity-70">
                  {test.verdict || (test.passed ? "AC" : "WA")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p>
            {tr(
              "Запусти або перевір код — результати з’являться тут.",
              "Run or test your code to see results here.",
            )}
          </p>
        )}
        {props.checkResult?.publicTestResults?.some((test) => !test.passed) ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[.12em] text-[#82968a]">
                Actual output
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-mono">
                {props.checkResult.publicTestResults.find(
                  (test) => !test.passed,
                )?.actualOutput || "—"}
              </pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-[.12em] text-[#82968a]">
                Input
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/20 p-3 font-mono">
                {props.checkResult.publicTestResults.find(
                  (test) => !test.passed,
                )?.input || "—"}
              </pre>
            </div>
          </div>
        ) : null}
        {props.resultCards}
      </div>
    );
  };

  if (mode === "theory") {
    return (
      <div className="min-h-[760px] rounded-[28px] border border-[#152219]/10 bg-white shadow-[0_22px_55px_-44px_rgba(17,43,25,.55)] dark:border-white/10 dark:bg-[#121b15]">
        <div className="flex items-center justify-between border-b border-[#152219]/10 px-5 py-4 dark:border-white/10">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[.16em] text-[#e87d00]">
              {tr("Теорія перед практикою", "Theory before practice")}
            </div>
            <h1 className="mt-1 text-2xl font-bold text-[#142017] dark:text-[#edf3ef]">
              {props.task.title}
            </h1>
          </div>
          <span className="rounded-full bg-[#00d978]/10 px-3 py-1 text-xs font-semibold text-[#147b47] dark:text-[#72edb0]">
            1 / 2
          </span>
        </div>
        <div className="mx-auto max-w-4xl px-5 py-8 md:px-12 md:py-12">
          <div className="mb-8 flex items-center gap-3 text-sm text-[#617066] dark:text-[#a7b5aa]">
            <span className="grid size-8 place-items-center rounded-full bg-[#00d978] font-bold text-[#062211]">
              1
            </span>
            <span className="h-px flex-1 bg-[#00d978]/30" />
            <span className="grid size-8 place-items-center rounded-full border border-[#617066]/30">
              2
            </span>
            <span>{tr("Практика в IDE", "Practice in IDE")}</span>
          </div>
          {props.theory ? (
            <article className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownView content={props.theory} />
            </article>
          ) : (
            <div className="rounded-2xl bg-[#00d978]/10 p-5 text-sm text-[#526157] dark:text-[#c1cdc4]">
              {tr(
                "Для цієї задачі немає окремого теоретичного блоку. Переходь до практики.",
                "This task has no separate theory block. Continue to practice.",
              )}
            </div>
          )}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#718075]">
              {tr(
                "Теорію можна відкрити знову у вкладці Завдання.",
                "You can reopen theory from the Task tab.",
              )}
            </span>
            <button
              type="button"
              onClick={markTheoryComplete}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#00d978] px-5 text-sm font-bold text-[#062211] transition hover:bg-[#25e88d]"
            >
              <Code2 className="size-4" />
              {tr("Перейти до практики", "Go to practice")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showLeft = !focusMode && !layout.leftCollapsed;
  const showRight = !focusMode && !layout.rightCollapsed;
  const showBottom = !focusMode && !layout.bottomCollapsed;

  return (
    <div className="flex h-[min(1100px,calc(100dvh-2rem))] min-h-[780px] flex-col overflow-hidden rounded-[30px] border border-white/[.1] bg-[#0d130f] font-[family-name:var(--font-sans)] text-[#e8f1ea] shadow-[0_28px_80px_-44px_rgba(15,35,21,.9)]">
      <header className="flex min-h-[72px] flex-wrap items-center gap-2 border-b border-white/[.08] bg-[#101913] px-4 py-3 sm:px-5">
        {props.onBack ? (
          <button
            type="button"
            onClick={props.onBack}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[.025] text-[#a7b5aa] transition hover:bg-white/[.07] hover:text-white"
            title={tr("Назад", "Back")}
          >
            <ChevronRight className="size-4 rotate-180" />
          </button>
        ) : null}
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <FolderCode className="size-4 shrink-0 text-[#72edb0]" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold tracking-[-.02em] text-[#edf5ee]">
              {props.task.title}
            </div>
            <div className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[.13em] text-[#82968a]">
              {props.task.section || tr("Практична задача", "Practice task")}
            </div>
          </div>
        </div>
        {props.toolbar ? <div className="flex items-center gap-1.5 rounded-xl border border-white/[.07] bg-black/10 p-1">{props.toolbar}</div> : null}
        {!props.isWebTask && languageOptions.length > 1 && (
          <select
            value={props.language}
            disabled={props.disableLanguageChange}
            onChange={(event) =>
              props.onLanguageChange(event.target.value as JudgeLanguage)
            }
            className="h-9 max-w-32 rounded-lg border border-white/10 bg-white/[.06] px-2 text-xs font-semibold text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value={props.language} className="text-black">
              {languageLabel(props.language)}
            </option>
            {languageOptions
              .filter((language) => language !== props.language)
              .map((language) => (
                <option key={language} value={language} className="text-black">
                  {languageLabel(language as JudgeLanguage)}
                </option>
              ))}
          </select>
        )}
        {!props.isWebTask && compilersForFamily(props.language).length > 1 && (
          <select
            value={props.compiler}
            onChange={(event) => props.onCompilerChange(event.target.value)}
            className="hidden h-9 max-w-40 rounded-lg border border-white/10 bg-white/[.06] px-2 text-xs text-white outline-none md:block"
          >
            {compilersForFamily(props.language).map((compiler) => (
              <option
                key={compiler.id}
                value={compiler.id}
                className="text-black"
              >
                {compiler.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={props.onSave}
          disabled={props.readOnly}
          className="hidden h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-[#c8d6cc] hover:bg-white/[.06] disabled:opacity-40 sm:inline-flex"
        >
          <Save className="size-3.5" />
          {tr("Зберегти", "Save")}
        </button>
        <button
          type="button"
          onClick={runWithTab}
          disabled={props.readOnly || props.running || props.checking}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/[.08] px-3 text-xs font-semibold text-white hover:bg-white/[.14] disabled:opacity-50"
        >
          <Play className="size-3.5" />
          {props.running ? "…" : tr("Run", "Run")}
        </button>
        <button
          type="button"
          onClick={checkWithTab}
          disabled={props.readOnly || props.running || props.checking}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#00d978] px-3 text-xs font-bold text-[#062211] hover:bg-[#25e88d] disabled:opacity-50"
        >
          {props.checking ? <Loader2 className="size-3.5 animate-spin" /> : <TestTube2 className="size-3.5" />}
          {props.checking ? tr("Тестуємо…", "Testing…") : tr("Test", "Test")}
        </button>
        <button
          type="button"
          onClick={() => setFocusMode((current) => !current)}
          className="grid size-9 place-items-center rounded-lg border border-white/10 text-[#a7b5aa] hover:bg-white/[.06]"
          title={tr("Режим фокусу", "Focus mode")}
        >
          <Maximize2 className="size-3.5" />
        </button>
      </header>

      <div className="flex h-full min-h-0 flex-1">
        {showLeft ? (
          <aside
            style={{ width: layout.left }}
            className="hidden shrink-0 flex-col border-r border-white/10 bg-[#111912] lg:flex"
          >
            <div className="flex h-11 items-center justify-between border-b border-white/10 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#82968a]">
                {tr("Файли", "Files")}
              </span>
              <button
                type="button"
                onClick={() => updateLayout({ leftCollapsed: true })}
                className="text-[#82968a] hover:text-white"
                title={tr("Згорнути", "Collapse")}
              >
                <Minimize2 className="size-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {fileList.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => setActiveFile(file.path)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${activeFile === file.path ? "bg-[#00d978]/10 text-[#72edb0]" : "text-[#a7b5aa] hover:bg-white/[.05] hover:text-white"}`}
                >
                  <FileCode2 className="size-3.5" />
                  {file.path}
                </button>
              ))}
              {!props.useFiles && (
                <button
                  type="button"
                  onClick={props.onEnableFiles}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-dashed border-white/15 px-2.5 py-2 text-xs text-[#82968a] hover:border-[#72edb0]/40 hover:text-[#72edb0]"
                >
                  <Braces className="size-3.5" />
                  {tr("Додати файл", "Add file")}
                </button>
              )}
            </div>
            <div className="border-t border-white/10 p-2 text-[10px] text-[#718075]">
              {fileList.length} {tr("файл(ів)", "file(s)")}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => updateLayout({ leftCollapsed: false })}
            className="hidden w-10 shrink-0 place-items-center border-r border-white/10 text-[#82968a] hover:text-white lg:grid"
            title={tr("Показати файли", "Show files")}
          >
            <ChevronRight className="size-4" />
          </button>
        )}
        {showLeft ? (
          <div
            onPointerDown={(event) => beginResize("left", event)}
            className="hidden w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[#00d978]/40 lg:block"
          />
        ) : null}

        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 border-b border-white/10 bg-[#0f1511] px-3 py-2.5">
            <span className="col-start-1 row-start-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#82968a]">
              stdin
            </span>
            <textarea
              value={props.stdin}
              onChange={(event) => props.onStdinChange(event.target.value)}
              disabled={props.isWebTask}
              rows={4}
              spellCheck={false}
              placeholder={
                props.isWebTask
                  ? tr("WEB без stdin", "WEB has no stdin")
                  : tr("Власний input для Run", "Custom input for Run")
              }
              className="col-span-2 row-start-2 min-h-24 max-h-56 min-w-0 w-full resize-y overflow-auto rounded-md border border-white/10 bg-black/20 px-2.5 py-2 font-mono text-[12px] leading-5 text-[#dce7df] outline-none placeholder:text-[#718075] focus:border-[#00d978]/50 disabled:opacity-50"
            />
            {props.firstExampleInput ? (
              <button
                type="button"
                onClick={props.onUseExampleInput}
                className="col-start-2 row-start-1 shrink-0 text-[10px] font-semibold text-[#72edb0] hover:text-white"
              >
                {tr("Приклад", "Example")}
              </button>
            ) : null}
          </div>
          <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-b border-white/10 bg-[#101710] px-3">
            <div className="flex items-center gap-1.5 text-[10px] text-[#82968a]">
              <span>{activeFile}</span>
              <ChevronRight className="size-3" />
              <span className="text-[#c8d6cc]">{tr("Редактор", "Editor")}</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.max(11, size - 1))}
                className="grid size-7 place-items-center rounded text-xs text-[#82968a] hover:bg-white/[.07]"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.min(22, size + 1))}
                className="grid size-7 place-items-center rounded text-xs text-[#82968a] hover:bg-white/[.07]"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setWordWrap((value) => !value)}
                className={`grid size-7 place-items-center rounded text-xs ${wordWrap ? "bg-[#00d978]/10 text-[#72edb0]" : "text-[#82968a]"}`}
                title="Word wrap"
              >
                ↪
              </button>
              <button
                type="button"
                onClick={props.onReset}
                className="grid size-7 place-items-center rounded text-[#82968a] hover:bg-white/[.07]"
                title={tr("Скинути шаблон", "Reset template")}
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          </div>
          <div
            className={`h-full min-h-[360px] flex-1 overflow-hidden ${props.isWebTask ? "grid lg:grid-cols-2" : ""}`}
          >
            <div className="h-full min-h-0 min-w-0 overflow-hidden">
              {props.useFiles ? (
                <MultiFileEditor
                  language={props.isWebTask ? "html" : props.language}
                  entryFile={props.entryFile}
                  files={props.files}
                  onChange={props.onFilesChange}
                  readOnly={props.readOnly}
                  fontSize={fontSize}
                  wordWrap={wordWrap}
                  activePath={activeFile}
                  onActivePathChange={setActiveFile}
                  hideTabsOnDesktop
                />
              ) : (
                <CodeEditor
                  height="100%"
                  language={props.isWebTask ? "html" : props.language}
                  value={props.code}
                  onChange={props.readOnly ? undefined : props.onCodeChange}
                  readOnly={props.readOnly}
                  fontSize={fontSize}
                  wordWrap={wordWrap}
                />
              )}
            </div>
            {props.isWebTask && props.webPreviewFiles ? (
              <div className="min-h-0 overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0">
                <WebPreviewPane
                  files={props.webPreviewFiles}
                  title={tr("Живий результат", "Live result")}
                />
              </div>
            ) : null}
          </div>
        </main>

        {showRight ? (
          <div
            onPointerDown={(event) => beginResize("right", event)}
            className="hidden w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[#00d978]/40 lg:block"
          />
        ) : null}
        {showRight ? (
          <aside
            style={{ width: layout.right }}
            className="hidden shrink-0 flex-col border-l border-white/10 bg-[#111912] lg:flex"
          >
            <div className="flex min-h-12 items-center gap-1 border-b border-white/10 bg-[#101913] px-2.5">
              <button
                type="button"
                onClick={() => setAssistantTab("task")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition ${assistantTab === "task" ? "bg-white/[.09] text-white shadow-sm" : "text-[#82968a] hover:bg-white/[.05] hover:text-[#c8d6cc]"}`}
              >
                <FileText className="size-3.5" />
                {tr("Завдання", "Task")}
              </button>
              <button
                type="button"
                onClick={() => setAssistantTab("hints")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition ${assistantTab === "hints" ? "bg-[#00d978]/10 text-[#72edb0] shadow-sm" : "text-[#82968a] hover:bg-white/[.05] hover:text-[#c8d6cc]"}`}
              >
                <Lightbulb className="size-3.5" />
                {tr("Підказки", "Hints")}
                {props.hints?.length ? ` (${props.hints.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setAssistantTab("mentor")}
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition ${assistantTab === "mentor" ? "bg-[#00d978]/10 text-[#72edb0] shadow-sm" : "text-[#82968a] hover:bg-white/[.05] hover:text-[#c8d6cc]"}`}
              >
                <Bot className="size-3.5" />
                {tr("Ментор", "Mentor")}
              </button>
              <button
                type="button"
                onClick={() => updateLayout({ rightCollapsed: true })}
                className="ml-auto text-[#82968a] hover:text-white"
                title={tr("Згорнути", "Collapse")}
              >
                <Minimize2 className="size-3.5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {assistantTab === "task" ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#e8f1ea]">
                    <FileText className="size-4 text-[#72edb0]" />
                    {props.task.title}
                  </div>
                  {props.task.projectSpec ? (
                    <div className="overflow-hidden rounded-2xl border border-[#ffb454]/20 bg-[linear-gradient(145deg,rgba(255,180,84,.1),rgba(0,217,120,.035))]">
                      <div className="flex items-start gap-3 border-b border-white/[.08] p-3.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ffb454]/15 text-[#ffca7e]">
                          <Rocket className="size-4.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold text-[#edf5ee]">
                              {tr("Мініпроєкт", "Mini-project")}
                            </p>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/[.08] px-2 py-0.5 text-[10px] font-semibold text-[#b9c9bd]">
                              <Clock3 className="size-3" />
                              {props.task.projectSpec.estimatedMinutes} {tr("хв", "min")}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-[#a7b5aa]">
                            {tr("Збери маленький продукт і покажи, що навичка працює в реальному сценарії.", "Build a small product and prove the skill in a real scenario.")}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-3 p-3.5">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">
                            {tr("Навички", "Skills")}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {props.task.projectSpec.skills.map((skill) => (
                              <span key={skill} className="rounded-lg bg-[#00d978]/10 px-2 py-1 text-[10px] font-semibold text-[#72edb0]">
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">
                            {tr("Етапи", "Milestones")}
                          </p>
                          <div className="mt-2 space-y-2">
                            {props.task.projectSpec.milestones.map((milestone, index) => (
                              <div key={milestone.id} className="flex gap-2.5">
                                <span className="grid size-5 shrink-0 place-items-center rounded-full border border-white/[.14] text-[10px] font-bold text-[#a7b5aa]">
                                  {index + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11px] font-semibold text-[#d6e3d9]">
                                    {milestone.title}
                                    {milestone.required === false ? <span className="ml-1.5 text-[10px] font-normal text-[#82968a]">{tr("додатково", "optional")}</span> : null}
                                  </p>
                                  <p className="mt-0.5 text-[10px] leading-5 text-[#8fa696]">{milestone.description}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        {props.task.projectSpec.extensions?.length ? (
                          <div className="rounded-xl bg-black/15 px-3 py-2 text-[10px] leading-5 text-[#8fa696]">
                            <span className="font-bold text-[#b9c9bd]">{tr("Для наступного рівня:", "For the next level:")}</span>{" "}
                            {props.task.projectSpec.extensions.join(" · ")}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <div className="prose prose-sm max-w-none text-xs leading-6 dark:prose-invert">
                    <MarkdownView content={props.task.description} />
                  </div>
                  {props.theory ? (
                    <details className="rounded-xl border border-white/10 bg-white/[.03] p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-[#c8d6cc]">
                        {tr("Відкрити теорію", "Open theory")}
                      </summary>
                      <div className="mt-3 text-xs leading-6 text-[#b9c9bd]">
                        <MarkdownView content={props.theory} />
                      </div>
                    </details>
                  ) : null}
                  <div className="rounded-xl border border-white/10 bg-white/[.03] p-3 text-xs text-[#a7b5aa]">
                    <div className="mb-2 font-semibold text-white">
                      {tr("Прогрес", "Progress")}
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-3.5 text-[#72edb0]" />
                        {tr("Теорія", "Theory")}
                      </div>
                      <div className="flex items-center gap-2">
                        {props.code.trim() ? (
                          <CheckCircle2 className="size-3.5 text-[#72edb0]" />
                        ) : (
                          <span className="size-3.5 rounded-full border border-white/20" />
                        )}
                        {tr("Перше рішення", "First solution")}
                      </div>
                      <div className="flex items-center gap-2">
                        {allTestsPassed ? (
                          <CheckCircle2 className="size-3.5 text-[#72edb0]" />
                        ) : (
                          <span className="size-3.5 rounded-full border border-white/20" />
                        )}
                        {tr("Усі тести", "All tests")}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              {assistantTab === "hints" ? (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-[#ffb454]/20 bg-[linear-gradient(145deg,rgba(255,180,84,.11),rgba(0,217,120,.045))] p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#ffb454]/15 text-[#ffca7e]">
                        <Lightbulb className="size-4.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-[#edf5ee]">
                            {tr("Рухайся крок за кроком", "Take it one step at a time")}
                          </p>
                          {props.hints?.length ? (
                            <span className="rounded-full bg-white/[.08] px-2 py-0.5 text-[10px] font-bold text-[#b9c9bd]">
                              {props.hints.length} {tr("рівні", "levels")}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-[11px] leading-5 text-[#a7b5aa]">
                          {tr(
                            "Почни з першої підказки. Наступна відкриває трохи більше деталей, але не готове рішення.",
                            "Start with the first hint. Each next level adds detail without giving away the solution.",
                          )}
                        </p>
                      </div>
                    </div>
                    {props.hints?.length ? (
                      <div className="mt-4 flex gap-1.5" aria-label={tr("Прогрес підказок", "Hint progress")}>
                        {props.hints.map((_, index) => (
                          <span
                            key={`hint-progress-${index}`}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${openHintIndex !== null && index <= openHintIndex ? "bg-[#00d978]" : "bg-white/[.12]"}`}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {(props.hints || []).map((hint, index) => {
                    const isOpen = openHintIndex === index;
                    const isLast = index === (props.hints?.length || 1) - 1;
                    return (
                      <div
                        key={`${index}-${hint}`}
                        className={`overflow-hidden rounded-2xl border transition ${isOpen ? "border-[#00d978]/35 bg-[#102017] shadow-[0_12px_28px_-22px_rgba(0,217,120,.8)]" : "border-white/[.09] bg-white/[.025] hover:border-white/[.16]"}`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenHintIndex(isOpen ? null : index)}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                          aria-expanded={isOpen}
                          aria-controls={`ide-hint-${index}`}
                        >
                          <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-xs font-extrabold ${isOpen ? "bg-[#00d978] text-[#062211]" : "bg-white/[.08] text-[#a7b5aa]"}`}>
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[11px] font-bold ${isOpen ? "text-[#72edb0]" : "text-[#c8d6cc]"}`}>
                              {tr(`Підказка ${index + 1}`, `Hint ${index + 1}`)}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[#82968a]">
                              {index === 0
                                ? tr("Напрямок", "Direction")
                                : isLast
                                  ? tr("Останній крок", "Final step")
                                  : tr("Трохи більше деталей", "More detail")}
                            </span>
                          </span>
                          <ChevronDown className={`size-4 shrink-0 text-[#82968a] transition-transform ${isOpen ? "rotate-180 text-[#72edb0]" : ""}`} />
                        </button>
                        {isOpen ? (
                          <div id={`ide-hint-${index}`} className="border-t border-white/[.08] px-3.5 pb-3.5 pt-3">
                            <div className="flex gap-2.5">
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffb454]" />
                              <p className="text-xs leading-6 text-[#d4e1d7]">{hint}</p>
                            </div>
                            <p className="mt-3 rounded-xl bg-black/15 px-3 py-2 text-[10px] leading-5 text-[#8fa696]">
                              <LockKeyhole className="mr-1.5 inline size-3" />
                              {tr("Спробуй застосувати це самостійно перед наступною підказкою.", "Try applying this yourself before opening the next hint.")}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {!props.hints?.length ? (
                    <div className="rounded-2xl border border-dashed border-white/[.14] bg-white/[.02] px-4 py-8 text-center">
                      <span className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#00d978]/10 text-[#72edb0]">
                        <Sparkles className="size-5" />
                      </span>
                      <p className="mt-3 text-sm font-bold text-[#c8d6cc]">
                        {tr("Підказки ще готуються", "Hints are not ready yet")}
                      </p>
                      <p className="mx-auto mt-1.5 max-w-[220px] text-[11px] leading-5 text-[#82968a]">
                        {tr(
                          "Зроби першу спробу — після перевірки тут з’явиться наступний крок.",
                          "Make a first attempt. After checking, your next step will appear here.",
                        )}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {assistantTab === "mentor" ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-[#00d978]/20 bg-[#00d978]/[.06] p-3 text-xs text-[#b9c9bd]">
                    <Sparkles className="mr-2 inline size-4 text-[#72edb0]" />
                    {tr(
                      "Ментор ставить навідні питання й не показує готове рішення одразу.",
                      "The mentor asks guiding questions instead of revealing the full solution immediately.",
                    )}
                  </div>
                  <DebugMentorChat
                    language={props.language}
                    code={props.code}
                    verdict={resultVerdict}
                    stderr={
                      props.runResult?.stderr || props.checkResult?.compileError
                    }
                    taskTitle={props.task.title}
                    taskText={props.task.description}
                    className="!border-white/10"
                  />
                  {props.checkResult &&
                  !verdictIsAccepted(props.checkResult.verdict) ? (
                    <ErrorExplainButton
                      language={props.language}
                      code={props.code}
                      verdict={props.checkResult.verdict}
                      stderr={
                        props.checkResult.compileError ||
                        props.runResult?.stderr
                      }
                      taskTitle={props.task.title}
                      taskText={props.task.description}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            onClick={() => updateLayout({ rightCollapsed: false })}
            className="hidden w-10 shrink-0 place-items-center border-l border-white/10 text-[#82968a] hover:text-white lg:grid"
            title={tr("Показати помічника", "Show assistant")}
          >
            <ChevronRight className="size-4 rotate-180" />
          </button>
        )}
      </div>

      {showBottom ? (
        <div
          onPointerDown={(event) => beginResize("bottom", event)}
          className="h-1 shrink-0 cursor-row-resize bg-transparent hover:bg-[#00d978]/40"
        />
      ) : null}
      {showBottom ? (
        <section
          style={{ height: layout.bottom }}
          className="shrink-0 border-t border-white/10 bg-[#111912]"
        >
          <div className="flex h-10 items-center gap-1 border-b border-white/10 px-2">
            <BottomTabButton
              active={bottomTab === "terminal"}
              onClick={() => setBottomTab("terminal")}
              icon={<SquareTerminal className="size-3.5" />}
              label="Terminal"
            />
            <BottomTabButton
              active={bottomTab === "tests"}
              onClick={() => setBottomTab("tests")}
              icon={<TestTube2 className="size-3.5" />}
              label={tr("Результати тестів", "Tests")}
            />
            <BottomTabButton
              active={bottomTab === "debugger"}
              onClick={() => {
                setMode("debug");
                setBottomTab("debugger");
                props.onTrace?.();
              }}
              icon={<Gauge className="size-3.5" />}
              label={props.tracing ? "Tracing…" : "Debugger"}
            />
            <BottomTabButton
              active={bottomTab === "console"}
              onClick={() => setBottomTab("console")}
              icon={<Code2 className="size-3.5" />}
              label="Console"
            />
            <BottomTabButton
              active={bottomTab === "history"}
              onClick={() => setBottomTab("history")}
              icon={<History className="size-3.5" />}
              label={tr("Історія", "History")}
            />
            <button
              type="button"
              onClick={() => updateLayout({ bottomCollapsed: true })}
              className="ml-auto grid size-7 place-items-center rounded text-[#82968a] hover:bg-white/[.06]"
              title={tr("Згорнути", "Collapse")}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
          <div className="min-h-0" style={{ height: "calc(100% - 2.5rem)" }}>
            {renderBottom()}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => updateLayout({ bottomCollapsed: false })}
          className="flex h-9 shrink-0 items-center justify-center border-t border-white/10 text-[#82968a] hover:text-white"
        >
          <ChevronDown className="size-4 rotate-180" />
        </button>
      )}
      {notice ? (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#00d978]/30 bg-[#132018] px-4 py-2 text-xs font-semibold text-[#72edb0] shadow-2xl">
          {notice}
        </div>
      ) : null}
      <footer className="hidden h-7 items-center gap-4 border-t border-white/10 bg-[#0b100c] px-3 text-[10px] text-[#718075] sm:flex">
        <span>Ln {lineCount}, Col 1</span>
        <span>{props.language}</span>
        <span>UTF-8</span>
        <span>Spaces: 2</span>
        <span className="ml-auto flex items-center gap-1 text-[#72edb0]">
          {props.checking ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
          {props.checking
            ? tr("Система тестує", "Testing")
            : props.checkResult
              ? allTestsPassed
                ? "Accepted"
                : "Needs attention"
              : "Autosave"}
        </span>
      </footer>
    </div>
  );
};

const BottomTabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold ${active ? "bg-white/[.08] text-white" : "text-[#82968a] hover:bg-white/[.05] hover:text-[#c8d6cc]"}`}
  >
    {icon}
    {label}
  </button>
);

export default StudyCodIDEWorkspace;
