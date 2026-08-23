import React from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
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
  Plus,
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
import { SelectMenu } from "../ui/SelectMenu";
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
  groupScores?: Array<{ group: string; score: number; maxScore: number; status?: "PASSED" | "PARTIAL" | "FAILED" | "SKIPPED" }> | null;
  compileError?: string | null;
  publicTestResults?: Array<{
    testId: number;
    input?: string;
    expectedOutput?: string;
    actualOutput?: string;
    passed: boolean;
    skipped?: boolean;
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
  hintsStatus?: "AI" | "FALLBACK" | "UNAVAILABLE" | "NOT_REQUESTED" | null;
  trace?: StudyCodIdeTrace | null;
  tracing?: boolean;
  onTrace?: () => void;
  emptyStateMessage?: string | null;
  emptyStateAction?: React.ReactNode;
  webPreviewFiles?: WebTaskFile[];
  isWebTask?: boolean;
};

const LAYOUT_KEY = "studycod:ide:layout:v4";
const HISTORY_KEY = "studycod:ide:history:v1";
const MINI_PROJECT_TIMER_KEY = "studycod:ide:mini-project-start:v1";

const rubberband = (overshoot: number, dimension: number, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

type LayoutState = {
  left: number;
  right: number;
  bottom: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  bottomCollapsed: boolean;
};

const DEFAULT_LAYOUT: LayoutState = {
  left: 224,
  right: 390,
  bottom: 300,
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

function formatMiniProjectCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function removeRepeatedTaskTitle(description: string, title: string): string {
  const source = String(description ?? "");
  const lines = source.split("\n");
  const firstContentLine = lines.findIndex((line) => line.trim().length > 0);
  if (firstContentLine < 0) return source;

  const firstLine = lines[firstContentLine]
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase();
  const normalizedTitle = String(title ?? "").replace(/[*_`]/g, "").trim().toLowerCase();
  if (!firstLine || !normalizedTitle) return source;
  if (firstLine !== normalizedTitle && !normalizedTitle.startsWith(firstLine)) return source;

  return lines.slice(firstContentLine + 1).join("\n").replace(/^\n+/, "");
}

type PracticeCodeEditorProps = {
  taskId: number | string;
  value: string;
  language: JudgeLanguage;
  readOnly: boolean;
  fontSize: number;
  wordWrap: boolean;
  isWebTask: boolean;
  onChange: (nextCode: string) => void;
};

// Keep Monaco's draft isolated from the large IDE workspace. The workspace
// contains task markdown, test panels and mentor UI; re-rendering all of that
// for every keystroke makes the editor feel frozen on slower devices.
const PracticeCodeEditor = React.memo<PracticeCodeEditorProps>(({ taskId, value, language, readOnly, fontSize, wordWrap, isWebTask, onChange }) => {
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => {
    setDraft(value);
  }, [taskId, value]);

  const handleChange = React.useCallback((nextCode: string) => {
    setDraft(nextCode);
    onChange(nextCode);
  }, [onChange]);

  return <CodeEditor
    height="100%"
    language={isWebTask ? "html" : language}
    value={draft}
    onChange={readOnly ? undefined : handleChange}
    readOnly={readOnly}
    fontSize={fontSize}
    wordWrap={wordWrap}
  />;
});

export const StudyCodIDEWorkspace: React.FC<Props> = React.memo((props) => {
  const { i18n } = useTranslation();
  const draftCodeRef = React.useRef(props.code);
  React.useEffect(() => {
    draftCodeRef.current = props.code;
  }, [props.task.id, props.code]);
  const handleCodeChange = React.useCallback((nextCode: string) => {
    draftCodeRef.current = nextCode;
    props.onCodeChange(nextCode);
  }, [props.onCodeChange]);
  const tr = (uk: string, en: string) => {
    return i18n.language?.toLowerCase().startsWith("en")
      ? en
      : uk;
  };
  const taskTheoryKey = scopedStorageKey(IDE_THEORY_COMPLETION_KEY, props.task.id);
  const isEmptyTask = String(props.task.id) === "empty";
  const taskBody = React.useMemo(
    () => removeRepeatedTaskTitle(props.task.description, props.task.title),
    [props.task.description, props.task.title],
  );
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
  const [fileAddRequestToken, setFileAddRequestToken] = React.useState(0);
  const [fontSize, setFontSize] = React.useState(14);
  const [wordWrap, setWordWrap] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState(false);
  const [mobileContextOpen, setMobileContextOpen] = React.useState(true);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [traceStep, setTraceStep] = React.useState(0);
  const [miniProjectTimer, setMiniProjectTimer] = React.useState<{
    taskId: string;
    endsAt: number;
  } | null>(null);
  const [miniProjectRemainingSeconds, setMiniProjectRemainingSeconds] = React.useState<number | null>(null);
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
    pointerId: number;
    min: number;
    max: number;
    last: number;
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
    const draftCode = draftCodeRef.current;
    if (!draftCode.trim() || draftCode === lastHistoryCode.current) return;
    const timer = window.setTimeout(() => {
      const next = [
        { at: new Date().toISOString(), code: draftCodeRef.current },
        ...history,
      ].slice(0, 20);
      lastHistoryCode.current = draftCodeRef.current;
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
  React.useEffect(() => {
    const estimatedMinutes = Number(props.task.projectSpec?.estimatedMinutes);
    const taskId = String(props.task.id);
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes <= 0) {
      setMiniProjectTimer(null);
      setMiniProjectRemainingSeconds(null);
      return;
    }

    const storageKey = scopedStorageKey(MINI_PROJECT_TIMER_KEY, props.task.id);
    let startedAt = 0;
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved > 0) startedAt = saved;
      if (!startedAt) {
        startedAt = Date.now();
        localStorage.setItem(storageKey, String(startedAt));
      }
    } catch {
      startedAt = Date.now();
    }

    setMiniProjectTimer({
      taskId,
      endsAt: startedAt + estimatedMinutes * 60 * 1000,
    });
  }, [props.task.id, props.task.projectSpec?.estimatedMinutes]);
  React.useEffect(() => {
    if (!miniProjectTimer || miniProjectTimer.taskId !== String(props.task.id)) return;

    const updateRemaining = () => {
      setMiniProjectRemainingSeconds(
        Math.max(0, Math.ceil((miniProjectTimer.endsAt - Date.now()) / 1000)),
      );
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [miniProjectTimer, props.task.id]);

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
    if (event.button !== 0) return;
    event.preventDefault();
    const min = axis === "bottom" ? 150 : 170;
    const max = axis === "bottom" ? 620 : 520;
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      axis,
      start: axis === "bottom" ? event.clientY : event.clientX,
      value: layout[axis],
      pointerId: event.pointerId,
      min,
      max,
      last: layout[axis],
    };
    const move = (moveEvent: PointerEvent) => {
      const current = resizeRef.current;
      if (!current || moveEvent.pointerId !== current.pointerId) return;
      const delta =
        moveEvent[axis === "bottom" ? "clientY" : "clientX"] - current.start;
      const direction = axis === "right" || axis === "bottom" ? -1 : 1;
      const raw = current.value + delta * direction;
      const dimension = current.max - current.min;
      const overshoot = raw < current.min
        ? -rubberband(current.min - raw, dimension)
        : raw > current.max
          ? rubberband(raw - current.max, dimension)
          : 0;
      const next = Math.min(current.max + 64, Math.max(current.min - 64, raw + overshoot));
      current.last = next;
      updateLayout({ [axis]: next });
    };
    const stop = () => {
      const current = resizeRef.current;
      if (current) {
        updateLayout({ [current.axis]: Math.min(current.max, Math.max(current.min, current.last)) });
      }
      resizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  const handleResizeKeyDown = (
    axis: "left" | "right" | "bottom",
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const min = axis === "bottom" ? 150 : 170;
    const max = axis === "bottom" ? 620 : 520;
    const step = event.shiftKey ? 48 : 16;
    let delta = 0;
    if (axis === "left" && event.key === "ArrowRight") delta = step;
    if (axis === "left" && event.key === "ArrowLeft") delta = -step;
    if (axis === "right" && event.key === "ArrowLeft") delta = step;
    if (axis === "right" && event.key === "ArrowRight") delta = -step;
    if (axis === "bottom" && event.key === "ArrowUp") delta = step;
    if (axis === "bottom" && event.key === "ArrowDown") delta = -step;
    if (event.key === "Home") delta = min - layout[axis];
    if (event.key === "End") delta = max - layout[axis];
    if (!delta) return;
    event.preventDefault();
    updateLayout({ [axis]: Math.min(max, Math.max(min, layout[axis] + delta)) });
  };

  const resultVerdict =
    props.checkResult?.verdict || (props.runResult?.success ? "OK" : null);
  const allTestsPassed = Boolean(
    props.checkResult &&
    props.checkResult.testsTotal > 0 &&
    props.checkResult.testsPassed >= props.checkResult.testsTotal,
  );
  React.useEffect(() => {
    if (props.hints?.length && (!props.checkResult || !allTestsPassed)) {
      setAssistantTab("hints");
      setOpenHintIndex((current) =>
        current !== null && current < props.hints!.length ? current : 0,
      );
    }
  }, [allTestsPassed, props.checkResult?.verdict, props.checkResult?.testsPassed, props.hints?.length]);
  const lineCount = (draftCodeRef.current || "").split("\n").length;
  const fileList = props.useFiles
    ? props.files
    : [{ path: props.entryFile, content: draftCodeRef.current }];

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
        {props.checkResult?.groupScores?.length ? (
          <div className="mb-3 rounded-xl border border-white/10 bg-black/15 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[#82968a]">
              {tr("Сабтаски", "Subtasks")}
            </div>
            <div className="flex flex-wrap gap-2">
              {props.checkResult.groupScores.slice(0, 24).map((group) => (
                <span key={group.group} className="rounded-lg bg-white/[.06] px-2.5 py-1.5 text-[11px] text-[#c8d6cc]">
                  {group.group}: {group.score}/{group.maxScore}{group.status === "SKIPPED" ? " (пропущено)" : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}
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
                className={`rounded-lg border p-2 text-center transition hover:brightness-125 ${test.skipped ? "border-[#f0c674]/30 bg-[#f0c674]/10 text-[#f0c674]" : test.passed ? "border-[#00d978]/30 bg-[#00d978]/10 text-[#72edb0]" : "border-[#ff6b9d]/30 bg-[#ff6b9d]/10 text-[#ff9aba]"}`}
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
          <div className="flex min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#294333] bg-[#0c1510] px-5 py-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid size-10 place-items-center rounded-xl border border-[#00d978]/20 bg-[#00d978]/10 text-[#72edb0]">
                <TestTube2 className="size-4" />
              </span>
              <p className="mt-3 text-sm font-semibold text-[#dce8df]">
                {tr("Результати з’являться після запуску", "Results will appear after you run the code")}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-[#82968a]">
                {tr(
                  "Запусти код для швидкого перегляду або натисни Test для повної перевірки.",
                  "Run the code for a quick preview or press Test for a full check.",
                )}
              </p>
            </div>
          </div>
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
  const activeMiniProjectRemainingSeconds =
    miniProjectTimer?.taskId === String(props.task.id)
      ? miniProjectRemainingSeconds
      : null;
  const miniProjectTimerExpired = activeMiniProjectRemainingSeconds === 0;

  return (
    <div className="flex h-[calc(100dvh-1rem)] min-h-[520px] flex-col overflow-hidden rounded-[24px] border border-[#203428] bg-[#0b110d] font-[family-name:var(--font-sans)] text-[#e8f1ea] shadow-[0_24px_70px_-56px_rgba(0,217,120,.35)] sm:h-[min(1100px,calc(100dvh-2rem))] sm:min-h-[640px] sm:rounded-[30px] lg:min-h-[780px]">
      <header className="flex min-h-[72px] flex-wrap items-center gap-2 border-b border-[#203428] bg-[#111b14] px-4 py-3 sm:px-5">
        {props.onBack ? (
          <button
            type="button"
            onClick={props.onBack}
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#294333] bg-[#0d1710] text-[#a7b5aa] transition hover:border-[#00d978]/50 hover:bg-[#00d978]/10 hover:text-white"
            title={tr("Назад", "Back")}
          >
            <ChevronRight className="size-4 rotate-180" />
          </button>
        ) : null}
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#00d978]/25 bg-[#00d978]/10 text-[#72edb0]">
            <FolderCode className="size-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-bold tracking-[-.02em] text-[#edf5ee] sm:text-sm">
              {props.task.title}
            </div>
            <div className="mt-1 flex items-center gap-2 truncate text-[10px] font-semibold uppercase tracking-[.13em] text-[#82968a]">
              <span>{props.task.section || tr("Практична задача", "Practice task")}</span>
              <span className="size-1 rounded-full bg-[#00d978]/70" />
              <span className="text-[#72edb0]">{languageLabel(props.language)}</span>
            </div>
          </div>
        </div>
        {props.toolbar ? <div className="flex items-center gap-1.5 rounded-xl border border-white/[.07] bg-black/10 p-1">{props.toolbar}</div> : null}
        {activeMiniProjectRemainingSeconds !== null ? (
          <div
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold tabular-nums ${miniProjectTimerExpired ? "border-[#ff6b9d]/45 bg-[#ff6b9d]/10 text-[#ff9aba]" : activeMiniProjectRemainingSeconds <= 300 ? "border-[#ffb454]/45 bg-[#ffb454]/10 text-[#ffca7e]" : "border-white/10 bg-white/[.04] text-[#c8d6cc]"}`}
            title={tr("Залишок часу мініпроєкту", "Mini-project time remaining")}
            aria-live="polite"
          >
            <Clock3 className="size-3.5" />
            {miniProjectTimerExpired
              ? tr("Час вийшов", "Time is up")
              : formatMiniProjectCountdown(activeMiniProjectRemainingSeconds)}
          </div>
        ) : null}
        {!props.isWebTask && languageOptions.length > 1 && !props.disableLanguageChange && (
          <SelectMenu
            value={props.language}
            options={languageOptions.map((language) => ({ value: language, label: languageLabel(language as JudgeLanguage) }))}
            disabled={props.disableLanguageChange}
            onChange={(value) => props.onLanguageChange(value as JudgeLanguage)}
            ariaLabel={tr("Мова виконання", "Execution language")}
            menuMinWidth={180}
            className="!h-9 max-w-24 rounded-lg border-white/10 bg-white/[.06] px-2 text-xs text-white sm:max-w-32"
          />
        )}
        {!props.isWebTask && compilersForFamily(props.language).length > 1 && (
          <SelectMenu
            value={props.compiler}
            options={compilersForFamily(props.language).map((compiler) => ({ value: compiler.id, label: compiler.label }))}
            onChange={props.onCompilerChange}
            ariaLabel={tr("Версія компілятора", "Compiler version")}
            menuMinWidth={220}
            className="hidden !h-9 max-w-40 rounded-lg border-white/10 bg-white/[.06] px-2 text-xs text-white md:inline-flex"
          />
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

      <section className="shrink-0 border-b border-[#203428] bg-[#0f1812] lg:hidden">
        <button
          type="button"
          onClick={() => setMobileContextOpen((open) => !open)}
          aria-expanded={mobileContextOpen}
          aria-controls="mobile-ide-context"
          className="flex min-h-11 w-full items-center gap-2 px-3 text-left"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#00d978]/10 text-[#72edb0]"><FileText className="size-3.5" /></span>
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#dce8df]">
            {tr("Умова задачі та підказки", "Task context and hints")}
          </span>
          <ChevronDown className={`size-4 shrink-0 text-[#82968a] transition-transform ${mobileContextOpen ? "rotate-180" : ""}`} />
        </button>
        {mobileContextOpen ? (
          <div id="mobile-ide-context" className="max-h-64 overflow-y-auto border-t border-[#203428] px-3 py-3">
            <div className="rounded-xl border border-[#203428] bg-[#111b14] p-3">
              <MarkdownView content={taskBody} variant="task" />
            </div>
            {props.hints?.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">{tr("Підказки", "Hints")}</p>
                {props.hints.map((hint, index) => {
                  const open = openHintIndex === index;
                  return (
                    <div key={`mobile-hint-${index}`} className="overflow-hidden rounded-xl border border-white/10 bg-white/[.03]">
                      <button
                        type="button"
                        onClick={() => setOpenHintIndex(open ? null : index)}
                        aria-expanded={open}
                        className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-[11px] font-semibold text-[#c8d6cc]"
                      >
                        <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-[#00d978]/10 text-[#72edb0]">{index + 1}</span>
                        <span className="flex-1">{tr(`Підказка ${index + 1}`, `Hint ${index + 1}`)}</span>
                        <ChevronDown className={`size-3.5 text-[#82968a] transition-transform ${open ? "rotate-180" : ""}`} />
                      </button>
                      {open ? <p className="border-t border-white/10 px-3 py-2 text-[11px] leading-5 text-[#b9c9bd]">{hint}</p> : null}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="flex h-full min-h-0 flex-1">
        {showLeft ? (
          <aside
            style={{ width: layout.left }}
            className="hidden shrink-0 flex-col border-r border-[#203428] bg-[#0f1812] lg:flex"
          >
            <div className="flex h-12 items-center justify-between border-b border-[#203428] px-3">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-[.16em] text-[#82968a]">
                  {tr("Робоча область", "Workspace")}
                </span>
                <span className="mt-0.5 block text-[10px] text-[#5f7767]">{fileList.length} {tr("файл", "file")}</span>
              </div>
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
                  className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left text-xs transition ${activeFile === file.path ? "border-[#00d978]/25 bg-[#00d978]/10 font-semibold text-[#72edb0]" : "border-transparent text-[#a7b5aa] hover:border-[#294333] hover:bg-white/[.04] hover:text-white"}`}
                >
                  <FileCode2 className="size-3.5" />
                  {file.path}
                </button>
              ))}
                <button
                  type="button"
                  onClick={() => {
                    if (!props.useFiles) {
                      props.onEnableFiles();
                      return;
                    }
                    setFileAddRequestToken((value) => value + 1);
                  }}
                  className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-[#294333] px-2.5 py-2.5 text-xs text-[#82968a] transition hover:border-[#72edb0]/50 hover:bg-[#00d978]/[.04] hover:text-[#72edb0]"
                >
                  {props.useFiles ? <Plus className="size-3.5" /> : <Braces className="size-3.5" />}
                  {tr("Додати файл", "Add file")}
                </button>
            </div>
            <div className="border-t border-[#203428] p-3 text-[10px] text-[#718075]">
              {fileList.length} {tr("файл(ів) підключено", "file(s) connected")}
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
            onKeyDown={(event) => handleResizeKeyDown("left", event)}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={tr("Змінити ширину файлової панелі", "Resize file panel")}
            aria-valuemin={170}
            aria-valuemax={520}
            aria-valuenow={Math.round(layout.left)}
            className="hidden w-1 shrink-0 cursor-col-resize touch-none bg-transparent hover:bg-[#00d978]/40 focus-visible:bg-[#00d978]/60 focus-visible:outline-none lg:block"
          />
        ) : null}

        <main className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
          <div className="grid shrink-0 grid-cols-[1fr_auto] items-center gap-x-2 gap-y-2 border-b border-[#203428] bg-[#0d1610] px-3 py-2.5">
            <div className="col-start-1 row-start-1 flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[.15em] text-[#82968a]">
                {tr("Ввід для запуску", "Run input")}
              </span>
              <span className="rounded-md border border-[#294333] bg-[#111f15] px-1.5 py-0.5 font-mono text-[9px] text-[#6f8877]">stdin</span>
            </div>
            <textarea
              value={props.stdin}
              onChange={(event) => props.onStdinChange(event.target.value)}
              disabled={props.isWebTask || isEmptyTask}
              rows={2}
              spellCheck={false}
              placeholder={
                props.isWebTask
                  ? tr("WEB без stdin", "WEB has no stdin")
                  : tr("Власний input для Run", "Custom input for Run")
              }
              className="col-span-2 row-start-2 min-h-16 max-h-36 min-w-0 w-full resize-y overflow-auto rounded-xl border border-[#294333] bg-[#101b13] px-3 py-2.5 font-mono text-[12px] leading-5 text-[#dce7df] outline-none placeholder:text-[#718075] transition focus:border-[#00d978]/60 focus:bg-[#122117] disabled:opacity-50"
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
          <div className="flex min-h-11 items-center gap-2 overflow-x-auto border-b border-[#203428] bg-[#111a14] px-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#294333] bg-[#0d1610] px-2.5 py-1.5 text-[10px] text-[#c8d6cc]">
              <FileCode2 className="size-3.5 text-[#72edb0]" />
              <span>{activeFile}</span>
              <span className="text-[#557061]">·</span>
              <span className="text-[#82968a]">{tr("Редактор", "Editor")}</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.max(11, size - 1))}
                className="grid size-7 place-items-center rounded-lg text-xs text-[#82968a] transition hover:bg-white/[.07] hover:text-white"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => setFontSize((size) => Math.min(22, size + 1))}
                className="grid size-7 place-items-center rounded-lg text-xs text-[#82968a] transition hover:bg-white/[.07] hover:text-white"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => setWordWrap((value) => !value)}
                className={`grid size-7 place-items-center rounded-lg text-xs transition ${wordWrap ? "bg-[#00d978]/10 text-[#72edb0]" : "text-[#82968a] hover:bg-white/[.07] hover:text-white"}`}
                title="Word wrap"
              >
                ↪
              </button>
              <button
                type="button"
                onClick={props.onReset}
                className="grid size-7 place-items-center rounded-lg text-[#82968a] transition hover:bg-white/[.07] hover:text-white"
                title={tr("Скинути шаблон", "Reset template")}
              >
                <RotateCcw className="size-3.5" />
              </button>
            </div>
          </div>
          <div
            className={`h-full min-h-[220px] flex-1 overflow-hidden lg:min-h-[360px] ${props.isWebTask ? "grid lg:grid-cols-2" : ""}`}
          >
            <div className="h-full min-h-0 min-w-0 overflow-hidden">
              {isEmptyTask ? (
                <div className="flex h-full min-h-[220px] items-center justify-center bg-[#0b110d] px-6 py-12 text-center">
                  <div className="max-w-sm">
                    <div className="mx-auto grid size-12 place-items-center rounded-2xl border border-[#00d978]/20 bg-[#00d978]/10 text-[#72edb0]">
                      <FolderCode className="size-5" />
                    </div>
                    <h2 className="mt-4 text-base font-bold text-[#edf5ee]">
                      {tr("Завдання ще не готове", "The task is not ready yet")}
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-[#8fa196]">
                      {tr("Відкрий активний вузол у маршруті — тут з’явиться редактор, щойно завдання завантажиться.", "Open an active node in the route. The editor will appear here when the task is ready.")}
                    </p>
                    {props.emptyStateMessage ? (
                      <p className="mt-3 whitespace-pre-wrap rounded-xl border border-[#ffb86b]/20 bg-[#ffb86b]/[.08] px-3 py-2 text-left text-xs leading-5 text-[#ffd5a6]">
                        {props.emptyStateMessage}
                      </p>
                    ) : null}
                    {props.emptyStateAction ? <div className="mt-5">{props.emptyStateAction}</div> : null}
                  </div>
                </div>
              ) : props.useFiles ? (
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
                  requestAddToken={fileAddRequestToken}
                />
              ) : (
                <PracticeCodeEditor
                  taskId={props.task.id}
                  language={props.language}
                  value={props.code}
                  readOnly={Boolean(props.readOnly)}
                  fontSize={fontSize}
                  wordWrap={wordWrap}
                  isWebTask={Boolean(props.isWebTask)}
                  onChange={handleCodeChange}
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
            onKeyDown={(event) => handleResizeKeyDown("right", event)}
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={tr("Змінити ширину панелі помічника", "Resize assistant panel")}
            aria-valuemin={170}
            aria-valuemax={520}
            aria-valuenow={Math.round(layout.right)}
            className="hidden w-1 shrink-0 cursor-col-resize touch-none bg-transparent hover:bg-[#00d978]/40 focus-visible:bg-[#00d978]/60 focus-visible:outline-none lg:block"
          />
        ) : null}
        {showRight ? (
          <aside
            style={{ width: layout.right }}
            className="hidden shrink-0 flex-col border-l border-[#203428] bg-[#0f1812] lg:flex"
          >
            <div className="flex min-h-14 items-center gap-1 border-b border-[#203428] bg-[#111b14] px-2.5">
              <button
                type="button"
                onClick={() => setAssistantTab("task")}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition ${assistantTab === "task" ? "border-[#00d978]/25 bg-[#00d978]/10 text-[#edf5ee]" : "border-transparent text-[#82968a] hover:border-[#294333] hover:bg-white/[.04] hover:text-[#c8d6cc]"}`}
              >
                <FileText className="size-3.5" />
                {tr("Завдання", "Task")}
              </button>
              <button
                type="button"
                onClick={() => setAssistantTab("hints")}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition ${assistantTab === "hints" ? "border-[#00d978]/25 bg-[#00d978]/10 text-[#72edb0]" : "border-transparent text-[#82968a] hover:border-[#294333] hover:bg-white/[.04] hover:text-[#c8d6cc]"}`}
              >
                <Lightbulb className="size-3.5" />
                {tr("Підказки", "Hints")}
                {props.hints?.length ? ` (${props.hints.length})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setAssistantTab("mentor")}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition ${assistantTab === "mentor" ? "border-[#6ca8ff]/25 bg-[#6ca8ff]/10 text-[#9bc5ff]" : "border-transparent text-[#82968a] hover:border-[#294333] hover:bg-white/[.04] hover:text-[#c8d6cc]"}`}
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
            <div className="min-h-0 flex-1 overflow-auto p-3.5">
              {assistantTab === "task" ? (
                <div className="space-y-3.5">
                  <div className="rounded-2xl border border-[#294333] bg-[#111d15] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#72edb0]">
                        <span className="grid size-7 place-items-center rounded-lg bg-[#00d978]/10"><FileText className="size-3.5" /></span>
                        {tr("Умова", "Brief")}
                      </div>
                      {props.task.difficulty ? (
                        <span className="rounded-md border border-[#294333] bg-[#0d1710] px-2 py-1 text-[10px] font-semibold text-[#a7b5aa]">
                          {props.task.difficulty}
                        </span>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-[17px] font-bold leading-6 tracking-[-.025em] text-[#f0f7f1]">
                      {props.task.title}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#294333] bg-[#0d1710] px-2 py-1.5 text-[10px] font-semibold text-[#a7b5aa]">
                        <Code2 className="size-3 text-[#72edb0]" /> {languageLabel(props.language)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#294333] bg-[#0d1710] px-2 py-1.5 text-[10px] font-semibold text-[#a7b5aa]">
                        <TestTube2 className="size-3 text-[#72edb0]" /> {tr("Практика", "Practice")}
                      </span>
                      {props.task.tags?.slice(0, 2).map((tag) => (
                        <span key={tag} className="rounded-lg border border-[#294333] bg-[#0d1710] px-2 py-1.5 text-[10px] text-[#82968a]">{tag}</span>
                      ))}
                    </div>
                  </div>
                  {props.task.projectSpec ? (
                    <div className="overflow-hidden rounded-2xl border border-[#ffb454]/20 bg-[#19190f]">
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
                        {props.task.projectSpec.inputFormat || props.task.projectSpec.outputFormat ? (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {props.task.projectSpec.inputFormat ? (
                              <div className="rounded-xl border border-[#294333] bg-[#0d1710] p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">{tr("Вхідні дані", "Input")}</p>
                                <p className="mt-1.5 text-[11px] leading-5 text-[#b9c9bd]">{props.task.projectSpec.inputFormat}</p>
                              </div>
                            ) : null}
                            {props.task.projectSpec.outputFormat ? (
                              <div className="rounded-xl border border-[#294333] bg-[#0d1710] p-3">
                                <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#82968a]">{tr("Вихідні дані", "Output")}</p>
                                <p className="mt-1.5 text-[11px] leading-5 text-[#b9c9bd]">{props.task.projectSpec.outputFormat}</p>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
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
                  <div className="rounded-2xl border border-[#203428] bg-[#0c1510] p-4">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#82968a]">
                      <span className="h-px w-5 bg-[#00d978]/60" />
                      {tr("Що потрібно зробити", "What to build")}
                    </div>
                    <MarkdownView content={taskBody} variant="task" />
                  </div>
                  {props.theory ? (
                    <details className="group rounded-2xl border border-[#294333] bg-[#111b14] p-3.5">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[#c8d6cc] marker:hidden">
                        <span className="grid size-7 place-items-center rounded-lg bg-[#00d978]/10 text-[#72edb0]"><BookOpen className="size-3.5" /></span>
                        <span className="flex-1">{tr("Відкрити теорію", "Open theory")}</span>
                        <ChevronDown className="size-4 text-[#82968a] transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-3 border-t border-[#203428] pt-3 text-xs leading-6 text-[#b9c9bd]">
                        <MarkdownView content={props.theory} variant="task" />
                      </div>
                    </details>
                  ) : null}
                  <div className="rounded-2xl border border-[#203428] bg-[#111b14] p-3.5 text-xs text-[#a7b5aa]">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="font-semibold text-[#edf5ee]">{tr("Стан задачі", "Task status")}</div>
                      <span className={`rounded-md px-2 py-1 text-[10px] font-bold ${allTestsPassed ? "bg-[#00d978]/10 text-[#72edb0]" : "bg-white/[.06] text-[#82968a]"}`}>
                        {allTestsPassed ? tr("Готово", "Ready") : tr("У роботі", "In progress")}
                      </span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-5 place-items-center rounded-full bg-[#00d978]/10"><CheckCircle2 className="size-3 text-[#72edb0]" /></span>
                        <span>{tr("Теорія переглянута", "Theory reviewed")}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {draftCodeRef.current.trim() ? (
                          <span className="grid size-5 place-items-center rounded-full bg-[#00d978]/10"><CheckCircle2 className="size-3 text-[#72edb0]" /></span>
                        ) : (
                          <span className="size-5 rounded-full border border-[#294333]" />
                        )}
                        <span>{tr("Є рішення", "Solution started")}</span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        {allTestsPassed ? (
                          <span className="grid size-5 place-items-center rounded-full bg-[#00d978]/10"><CheckCircle2 className="size-3 text-[#72edb0]" /></span>
                        ) : (
                          <span className="size-5 rounded-full border border-[#294333]" />
                        )}
                        <span>{tr("Усі тести проходять", "All tests passing")}</span>
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
                            {tr("Виконуй підказки по черзі", "Follow the hints in order")}
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
                      {props.hintsStatus === "UNAVAILABLE" ? (
                        <p className="mb-2 rounded-lg bg-[#ffb454]/10 px-2 py-1 text-[10px] font-semibold text-[#ffca7e]">
                          {tr("Підказки тимчасово недоступні — повтори перевірку.", "Hints are temporarily unavailable — try checking again.")}
                        </p>
                      ) : null}
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
                    code={draftCodeRef.current}
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
                      code={draftCodeRef.current}
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
          onKeyDown={(event) => handleResizeKeyDown("bottom", event)}
          role="separator"
          tabIndex={0}
          aria-orientation="horizontal"
          aria-label={tr("Змінити висоту нижньої панелі", "Resize bottom panel")}
          aria-valuemin={150}
          aria-valuemax={620}
          aria-valuenow={Math.round(layout.bottom)}
          className="h-1 shrink-0 cursor-row-resize touch-none bg-transparent hover:bg-[#00d978]/40 focus-visible:bg-[#00d978]/60 focus-visible:outline-none"
        />
      ) : null}
      {showBottom ? (
        <section
          style={{ "--ide-bottom-height": `${layout.bottom}px` } as React.CSSProperties}
          className="h-[var(--ide-bottom-height)] max-lg:h-60 shrink-0 border-t border-[#203428] bg-[#0f1812]"
        >
          <div className="flex h-11 items-center gap-1 overflow-x-auto border-b border-[#203428] bg-[#111b14] px-2">
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
              className="ml-auto grid size-7 shrink-0 place-items-center rounded-lg text-[#82968a] hover:bg-white/[.06]"
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
          className="flex h-9 shrink-0 items-center justify-center border-t border-[#203428] text-[#82968a] hover:text-white"
        >
          <ChevronDown className="size-4 rotate-180" />
        </button>
      )}
      {notice ? (
        <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-[#00d978]/30 bg-[#132018] px-4 py-2 text-xs font-semibold text-[#72edb0] shadow-2xl">
          {notice}
        </div>
      ) : null}
      <footer className="hidden h-8 items-center gap-4 border-t border-[#203428] bg-[#09100b] px-3 text-[10px] text-[#718075] sm:flex">
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
});
StudyCodIDEWorkspace.displayName = "StudyCodIDEWorkspace";

const BottomTabButton: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition ${active ? "border-[#00d978]/25 bg-[#00d978]/10 text-[#72edb0]" : "border-transparent text-[#82968a] hover:border-[#294333] hover:bg-white/[.04] hover:text-[#c8d6cc]"}`}
  >
    {icon}
    {label}
  </button>
);

export default StudyCodIDEWorkspace;
