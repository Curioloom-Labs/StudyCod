import React from "react";
import type { JudgeProgress } from "../../../../shared/judgeProgress";
import { useTranslation } from "react-i18next";
import {
  RobotIcon as Bot,
  BracketsCurlyIcon as Braces,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle2,
  CaretDownIcon as ChevronDown,
  CaretRightIcon as ChevronRight,
  ClockIcon as Clock3,
  HardDrivesIcon as HardDrives,
  CopyIcon as Copy,
  DownloadSimpleIcon as Download,
  EraserIcon as Eraser,
  CodeIcon as Code2,
  FileCodeIcon as FileCode2,
  FileTextIcon as FileText,
  GitDiffIcon as GitCompareArrows,
  ClockCounterClockwiseIcon as History,
  LightbulbIcon as Lightbulb,
  CircleNotchIcon as Loader2,
  ArrowsOutIcon as Maximize2,
  ArrowsInIcon as Minimize2,
  PlayIcon as Play,
  PlusIcon as Plus,
  ArrowCounterClockwiseIcon as RotateCcw,
  FloppyDiskIcon as Save,
  TerminalWindowIcon as SquareTerminal,
  TestTubeIcon as TestTube2,
  GearSixIcon as Settings,
  ArrowsLeftRightIcon as SwapPanels,
} from "@phosphor-icons/react";
import "./StudyCodWorkbench.css";
import { CodeEditor, type CodeEditorHandle } from "../CodeEditor";
import { MultiFileEditor } from "../MultiFileEditor";
import { DebugMentorChat } from "../DebugMentorChat";
import { ErrorExplainButton } from "../ErrorExplainButton";
import { MarkdownView } from "../MarkdownView";
import { WebPreviewPane } from "../WebPreviewPane";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import {
  getAssistantFailures,
  getIdeSaveStatusLabel,
  reconcileMobilePaneAfterResult,
} from "./editorFeedback";
import type {
  CodeFile,
  JudgeLanguage,
  LibraryTaskProjectSpec,
  WebTaskFile,
} from "../../lib/api/library";
import {
  IDE_THEORY_COMPLETION_KEY,
  scopedStorageKey,
} from "../../lib/storageScope";
import {
  JUDGE_LANGUAGE_LABELS,
  JUDGE_FILE_EXTENSIONS,
  compilersForFamily,
} from "../../lib/judgeLanguages";

type IdeMode = "theory" | "practice";
type AssistantTab = "task" | "history" | "hints" | "mentor";
type BottomTab = "input" | "terminal" | "tests";
type MobilePaneTab = "condition" | "code" | "result";

export type StudyCodIdeTask = {
  id: number | string;
  title: string;
  description: string;
  timeLimitMs?: number | null;
  memoryLimitMb?: number | null;
  limitsByLanguage?: Partial<
    Record<JudgeLanguage, { timeLimitMs: number; memoryLimitMb: number }>
  >;
  statementLanguage?: "uk" | "en";
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
  groupScores?: Array<{
    group: string;
    score: number;
    maxScore: number;
    status?: "PASSED" | "PARTIAL" | "FAILED" | "SKIPPED";
  }> | null;
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
  enableSemanticLsp?: boolean;
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
  publicExamples?: Array<{
    testId: number;
    input: string;
    expectedOutput: string;
    imageUrls?: string[];
  }>;
  hasUnsavedChanges?: boolean;
  running: boolean;
  checking: boolean;
  checkProgress?: JudgeProgress | null;
  checkStatus?: "queued" | "running" | "completed" | "system_error";
  onRun: () => void;
  onCheck: () => void;
  onSave: () => void;
  onReset: () => void;
  onTheoryComplete?: () => void;
  toolbar?: React.ReactNode;
  problemNavigation?: {
    items: Array<{
      id: number | string;
      label: string;
      title: string;
      points?: number | null;
    }>;
    activeId: number | string;
    onSelect: (id: number | string) => void;
    footer?: React.ReactNode;
  };
  contextToolbar?: React.ReactNode;
  toolbarStatus?: React.ReactNode;
  languageOptions?: JudgeLanguage[];
  disableAiAssistance?: boolean;
  submitMode?: boolean;
  readOnly?: boolean;
  onBack?: () => void;
  onCodeEditorMount?: (editor: CodeEditorHandle) => void;
  disableLanguageChange?: boolean;
  runResult: StudyCodIdeRunResult | null;
  checkResult: StudyCodIdeCheckResult | null;
  resultCards?: React.ReactNode | ((actions: { onReturnToCode: () => void }) => React.ReactNode);
  expandResultsOnFailure?: boolean;
  actionRecovery?: {
    tone: "error" | "warning";
    message: string;
    retryLabel: string;
    onRetry: () => void;
  } | null;
  saveStatus?: "saved" | "dirty" | "saving" | "error";
  lastSavedAt?: string | null;
  lastRunDurationMs?: number | null;
  attemptsUsed?: number | null;
  maxAttempts?: number | null;
  localRecovery?: {
    updatedAt: string;
    code: string;
    files: CodeFile[];
    useFiles: boolean;
    onRecover: () => void;
    onDismiss: () => void;
  } | null;
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

const LAYOUT_KEY = "studycod:ide:layout:v6";
const SIMPLE_MODE_KEY = "studycod:ide:simple-mode:v1";
const HISTORY_KEY = "studycod:ide:history:v1";
const MINI_PROJECT_TIMER_KEY = "studycod:ide:mini-project-start:v1";
const ACTIVE_FILE_KEY = "studycod:ide:active-file:v1";
const STDIN_HISTORY_KEY = "studycod:ide:stdin-history:v1";

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
  right: 520,
  bottom: 240,
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

function formatIdeTimestamp(
  iso: string | null | undefined,
  locale: string,
): string {
  const value = String(iso ?? "").trim();
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function visualizeWhitespace(value: string): string {
  return String(value ?? "")
    .replace(/\r/g, "␍")
    .replace(/\t/g, "→\t")
    .replace(/ /g, "·")
    .replace(/\n/g, "↵\n");
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
  const normalizedTitle = String(title ?? "")
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase();
  if (!firstLine || !normalizedTitle) return source;
  if (firstLine !== normalizedTitle && !normalizedTitle.startsWith(firstLine))
    return source;

  return lines
    .slice(firstContentLine + 1)
    .join("\n")
    .replace(/^\n+/, "");
}

type PracticeCodeEditorProps = {
  enableSemanticLsp?: boolean;
  taskId: number | string;
  value: string;
  language: JudgeLanguage;
  readOnly: boolean;
  fontSize: number;
  wordWrap: boolean;
  isWebTask: boolean;
  focusLine?: number | null;
  onChange: (nextCode: string) => void;
  onEditorMount?: (editor: CodeEditorHandle) => void;
};

// Keep Monaco's draft isolated from the large IDE workspace. The workspace
// contains task markdown, test panels and mentor UI; re-rendering all of that
// for every keystroke makes the editor feel frozen on slower devices.
const PracticeCodeEditor = React.memo<PracticeCodeEditorProps>(
  ({
    taskId,
    value,
    language,
    readOnly,
    fontSize,
    wordWrap,
    isWebTask,
    focusLine = null,
    onChange,
    onEditorMount,
    enableSemanticLsp,
  }) => {
    const [draft, setDraft] = React.useState(value);

    React.useEffect(() => {
      setDraft(value);
    }, [taskId, value]);

    const handleChange = React.useCallback(
      (nextCode: string) => {
        setDraft(nextCode);
        onChange(nextCode);
      },
      [onChange],
    );

    return (
      <CodeEditor
        enableSemanticLsp={enableSemanticLsp}
        height="100%"
        language={isWebTask ? "html" : language}
        value={draft}
        onChange={readOnly ? undefined : handleChange}
        readOnly={readOnly}
        fontSize={fontSize}
        wordWrap={wordWrap}
        minimap={false}
        focusLine={focusLine}
        onEditorMount={onEditorMount}
      />
    );
  },
);

export const StudyCodIDEWorkspace: React.FC<Props> = React.memo((props) => {
  const { i18n } = useTranslation();
  const draftCodeRef = React.useRef(props.code);
  React.useEffect(() => {
    draftCodeRef.current = props.code;
  }, [props.task.id, props.code]);
  const handleCodeChange = React.useCallback(
    (nextCode: string) => {
      draftCodeRef.current = nextCode;
      props.onCodeChange(nextCode);
    },
    [props.onCodeChange],
  );
  const en = i18n.language?.toLowerCase().startsWith("en");
  const tr = (uk: string, en: string) => {
    return i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  };
  const taskTheoryKey = scopedStorageKey(
    IDE_THEORY_COMPLETION_KEY,
    props.task.id,
  );
  const isEmptyTask = String(props.task.id) === "empty";
  const taskBody = React.useMemo(
    () => removeRepeatedTaskTitle(props.task.description, props.task.title),
    [props.task.description, props.task.title],
  );
  const languageOptions =
    props.languageOptions ??
    (Object.keys(JUDGE_LANGUAGE_LABELS) as JudgeLanguage[]);
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
  const failureReviewLayoutRef = React.useRef<{ originalBottom: number; appliedBottom: number } | null>(null);
  const [simpleMode, setSimpleMode] = React.useState(() => {
    try {
      return localStorage.getItem(SIMPLE_MODE_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [assistantTab, setAssistantTab] = React.useState<AssistantTab>("task");
  const [openHintIndex, setOpenHintIndex] = React.useState<number | null>(null);
  const [bottomTab, setBottomTab] = React.useState<BottomTab>("input");
  const [activeFile, setActiveFile] = React.useState(() => {
    try {
      return (
        localStorage.getItem(
          scopedStorageKey(ACTIVE_FILE_KEY, props.task.id),
        ) || props.entryFile
      );
    } catch {
      return props.entryFile;
    }
  });
  const [fileAddRequestToken, setFileAddRequestToken] = React.useState(0);
  const [fontSize, setFontSize] = React.useState(16);
  const [wordWrap, setWordWrap] = React.useState(false);
  const [focusMode, setFocusMode] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [statementOnRight, setStatementOnRight] = React.useState(() => {
    try {
      return localStorage.getItem("studycod:ide:statement-side:v1") === "right";
    } catch {
      return false;
    }
  });
  const settingsRef = React.useRef<HTMLDivElement>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const [bodySize, setBodySize] = React.useState({ width: 1200, height: 680 });
  React.useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setBodySize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
    });
    observer.observe(body);
    return () => observer.disconnect();
  }, [mode]);
  React.useEffect(() => {
    try {
      localStorage.setItem(
        "studycod:ide:statement-side:v1",
        statementOnRight ? "right" : "left",
      );
    } catch {
      /* optional preference */
    }
  }, [statementOnRight]);
  React.useEffect(() => {
    if (!settingsOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node))
        setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSettingsOpen(false);
      settingsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);
  const [mobilePane, setMobilePaneState] =
    React.useState<MobilePaneTab>("condition");
  const [mobileResultUnread, setMobileResultUnread] = React.useState(false);
  const mobilePaneRef = React.useRef<MobilePaneTab>("condition");
  const pendingMobileResultRef = React.useRef<{
    result: StudyCodIdeRunResult | null;
    recovery: Props["actionRecovery"];
    observedBusy: boolean;
  } | null>(null);
  const setMobilePane = React.useCallback((next: MobilePaneTab) => {
    mobilePaneRef.current = next;
    setMobilePaneState(next);
    setFocusMode(false);
    if (next === "condition")
      setLayout((current) => ({ ...current, rightCollapsed: false }));
    if (next === "result")
      setLayout((current) => ({ ...current, bottomCollapsed: false }));
    if (next === "result") setMobileResultUnread(false);
  }, []);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = React.useState(false);
  const [diffOpen, setDiffOpen] = React.useState(false);
  const [copiedLabel, setCopiedLabel] = React.useState<string | null>(null);
  const [stdinHistory, setStdinHistory] = React.useState<string[]>(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(
          scopedStorageKey(STDIN_HISTORY_KEY, props.task.id),
        ) || "[]",
      );
      return Array.isArray(raw)
        ? raw
            .filter((value) => typeof value === "string" && value.trim())
            .slice(0, 6)
        : [];
    } catch {
      return [];
    }
  });
  const [showFailedOnly, setShowFailedOnly] = React.useState(false);
  const [showWhitespace, setShowWhitespace] = React.useState(false);
  const [expandedTestId, setExpandedTestId] = React.useState<number | null>(
    null,
  );
  const [miniProjectTimer, setMiniProjectTimer] = React.useState<{
    taskId: string;
    endsAt: number;
  } | null>(null);
  const [miniProjectRemainingSeconds, setMiniProjectRemainingSeconds] =
    React.useState<number | null>(null);
  const [history, setHistory] = React.useState<
    Array<{ at: string; code: string }>
  >(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(scopedStorageKey(HISTORY_KEY, props.task.id)) ||
          "[]",
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
    try {
      localStorage.setItem(SIMPLE_MODE_KEY, simpleMode ? "1" : "0");
    } catch {
      // Keep the interface usable when storage is unavailable.
    }
  }, [simpleMode]);
  React.useEffect(() => {
    if (
      simpleMode &&
      bottomTab !== "input" &&
      bottomTab !== "terminal" &&
      bottomTab !== "tests"
    ) {
      setBottomTab("tests");
    }
  }, [bottomTab, simpleMode]);
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
    setBottomTab("input");
    setFocusMode(false);
    setShowFailedOnly(false);
    setShowWhitespace(false);
    setExpandedTestId(null);
    try {
      const raw = JSON.parse(
        localStorage.getItem(
          scopedStorageKey(STDIN_HISTORY_KEY, props.task.id),
        ) || "[]",
      );
      setStdinHistory(
        Array.isArray(raw)
          ? raw
              .filter((value) => typeof value === "string" && value.trim())
              .slice(0, 6)
          : [],
      );
    } catch {
      setStdinHistory([]);
    }
    try {
      setActiveFile(
        localStorage.getItem(
          scopedStorageKey(ACTIVE_FILE_KEY, props.task.id),
        ) || props.entryFile,
      );
    } catch {
      setActiveFile(props.entryFile);
    }
  }, [props.entryFile, props.task.id, props.theory, taskTheoryKey]);
  React.useEffect(() => {
    if (props.disableAiAssistance) setAssistantTab("task");
  }, [props.disableAiAssistance]);
  React.useEffect(() => {
    setMobilePane("condition");
    setMobileResultUnread(false);
    pendingMobileResultRef.current = null;
  }, [props.task.id, setMobilePane]);
  React.useEffect(() => {
    const pending = pendingMobileResultRef.current;
    if (!pending) return;
    const busy = props.running || props.checking;
    if (busy) {
      pending.observedBusy = true;
      return;
    }
    const resultChanged =
      props.runResult !== pending.result ||
      props.actionRecovery !== pending.recovery;
    if (!pending.observedBusy && !resultChanged) return;
    pendingMobileResultRef.current = null;
    const nextView = reconcileMobilePaneAfterResult(mobilePaneRef.current);
    if (nextView.pane !== mobilePaneRef.current) setMobilePane(nextView.pane);
    setMobileResultUnread(nextView.unread);
  }, [
    props.actionRecovery,
    props.checking,
    props.runResult,
    props.running,
    setMobilePane,
  ]);
  React.useEffect(() => {
    try {
      localStorage.setItem(
        scopedStorageKey(ACTIVE_FILE_KEY, props.task.id),
        activeFile,
      );
    } catch {
      // ignore
    }
  }, [activeFile, props.task.id]);
  React.useEffect(() => {
    try {
      const raw = JSON.parse(
        localStorage.getItem(scopedStorageKey(HISTORY_KEY, props.task.id)) ||
          "[]",
      );
      const next = Array.isArray(raw)
        ? raw
            .filter((item) => item && typeof item.code === "string")
            .slice(0, 20)
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
    if (!miniProjectTimer || miniProjectTimer.taskId !== String(props.task.id))
      return;

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

  React.useEffect(() => {
    const failedCheck = Boolean(
      props.expandResultsOnFailure &&
      props.checkResult &&
      !verdictIsAccepted(props.checkResult.verdict),
    );
    if (failedCheck && bodySize.width >= 900 && bodySize.height >= 420) {
      const maxBottom = Math.max(100, bodySize.height - 160);
      const preferredBottom = Math.min(maxBottom, Math.max(300, Math.round(bodySize.height * 0.7)));
      let shouldApplyPreferredHeight = false;
      if (!failureReviewLayoutRef.current) {
        failureReviewLayoutRef.current = { originalBottom: layout.bottom, appliedBottom: preferredBottom };
        shouldApplyPreferredHeight = true;
      } else if (failureReviewLayoutRef.current.appliedBottom !== preferredBottom) {
        failureReviewLayoutRef.current.appliedBottom = preferredBottom;
        shouldApplyPreferredHeight = true;
      }
      if (shouldApplyPreferredHeight && layout.bottom < preferredBottom) {
        setLayout((current) => current.bottom < preferredBottom ? { ...current, bottom: preferredBottom } : current);
      }
      return;
    }
    const previousLayout = failureReviewLayoutRef.current;
    if (!previousLayout) return;
    failureReviewLayoutRef.current = null;
    setLayout((current) => current.bottom === previousLayout.originalBottom
      ? current
      : { ...current, bottom: previousLayout.originalBottom });
  }, [bodySize.height, bodySize.width, layout.bottom, props.checkResult?.verdict, props.expandResultsOnFailure]);

  const getResizeBounds = (axis: "right" | "bottom") => {
    const rect = bodyRef.current?.getBoundingClientRect();
    return axis === "right"
      ? {
          min: 280,
          max: Math.max(
            280,
            Math.min(
              (rect?.width ?? bodySize.width) - 368,
              (rect?.width ?? bodySize.width) * 0.7,
            ),
          ),
        }
      : {
          min: 100,
          max: Math.max(100, (rect?.height ?? bodySize.height) - 160),
        };
  };
  const resizeCleanupRef = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => resizeCleanupRef.current?.(), []);
  const beginResize = (axis: "right" | "bottom", event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    resizeCleanupRef.current?.();
    const { min, max } = getResizeBounds(axis);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const value = Math.min(max, Math.max(min, layout[axis]));
    resizeRef.current = {
      axis,
      start: axis === "bottom" ? event.clientY : event.clientX,
      value,
      pointerId: event.pointerId,
      min,
      max,
      last: value,
    };
    const move = (moveEvent: PointerEvent) => {
      const current = resizeRef.current;
      if (!current || moveEvent.pointerId !== current.pointerId) return;
      const delta =
        moveEvent[axis === "bottom" ? "clientY" : "clientX"] - current.start;
      const direction = axis === "bottom" || statementOnRight ? -1 : 1;
      current.last = Math.min(
        max,
        Math.max(min, current.value + delta * direction),
      );
      updateLayout({ [axis]: current.last });
    };
    const stop = () => {
      resizeRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (target.hasPointerCapture(event.pointerId))
        target.releasePointerCapture(event.pointerId);
      resizeCleanupRef.current = null;
    };
    resizeCleanupRef.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  const handleResizeKeyDown = (
    axis: "right" | "bottom",
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    const { min, max } = getResizeBounds(axis);
    const step = event.shiftKey ? 48 : 16;
    const current = Math.min(max, Math.max(min, layout[axis]));
    let next = current;
    if (axis === "right" && event.key === "ArrowRight")
      next += statementOnRight ? -step : step;
    if (axis === "right" && event.key === "ArrowLeft")
      next += statementOnRight ? step : -step;
    if (axis === "bottom" && event.key === "ArrowUp") next += step;
    if (axis === "bottom" && event.key === "ArrowDown") next -= step;
    if (event.key === "Home") next = min;
    if (event.key === "End") next = max;
    if (next === current) return;
    event.preventDefault();
    updateLayout({ [axis]: Math.min(max, Math.max(min, next)) });
  };

  const resultVerdict =
    props.checkResult?.verdict || (props.runResult?.success ? "OK" : null);
  const allTestsPassed = Boolean(
    props.checkResult &&
      verdictIsAccepted(props.checkResult.verdict) &&
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
  }, [
    allTestsPassed,
    props.checkResult?.verdict,
    props.checkResult?.testsPassed,
    props.hints?.length,
  ]);
  React.useEffect(() => {
    if (!diffOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDiffOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [diffOpen]);
  const lineCount = (draftCodeRef.current || "").split("\n").length;
  const fileList = props.useFiles
    ? props.files
    : [{ path: props.entryFile, content: draftCodeRef.current }];

  const [lastRunInput, setLastRunInput] = React.useState<string | null>(null);
  React.useEffect(() => setLastRunInput(null), [props.task.id]);
  const runWithTab = () => {
    if (props.readOnly || props.running || props.checking || isEmptyTask)
      return;
    setLastRunInput(props.stdin);
    rememberStdinHistory();
    updateLayout({ bottomCollapsed: false });
    setFocusMode(false);
    setBottomTab("terminal");
    pendingMobileResultRef.current = {
      result: props.runResult,
      recovery: props.actionRecovery,
      observedBusy: false,
    };
    props.onRun();
  };
  const checkWithTab = () => {
    if (props.readOnly || props.running || props.checking || isEmptyTask)
      return;
    updateLayout({ bottomCollapsed: false });
    setFocusMode(false);
    setBottomTab("tests");
    setMobilePane("result");
    pendingMobileResultRef.current = {
      result: props.runResult,
      recovery: props.actionRecovery,
      observedBusy: false,
    };
    props.onCheck();
  };
  React.useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key !== "Enter" ||
        event.repeat ||
        event.isComposing
      )
        return;
      if (
        settingsOpen ||
        resetConfirmOpen ||
        diffOpen ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) checkWithTab();
      else runWithTab();
    };
    window.addEventListener("keydown", onShortcut, true);
    return () => window.removeEventListener("keydown", onShortcut, true);
  });
  const mobileTabs = [
    { id: "condition" as const, label: tr("Умова", "Task"), Icon: FileText },
    { id: "code" as const, label: tr("Код", "Code"), Icon: Code2 },
    {
      id: "result" as const,
      label: tr("Результат", "Result"),
      Icon: SquareTerminal,
    },
  ];
  const handleMobileTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const index = mobileTabs.findIndex((tab) => tab.id === mobilePane);
    const nextIndex =
      event.key === "ArrowRight"
        ? (index + 1) % mobileTabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + mobileTabs.length) % mobileTabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? mobileTabs.length - 1
              : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = mobileTabs[nextIndex];
    setMobilePane(next.id);
    document.getElementById(`mobile-ide-tab-${next.id}`)?.focus();
  };
  const handlePanelTabKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (
      !(event.target instanceof HTMLElement) ||
      event.target.getAttribute("role") !== "tab"
    )
      return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    );
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1;
    if (next < 0 || !tabs.length) return;
    event.preventDefault();
    tabs[next].click();
    tabs[next].focus();
  };
  const downloadCurrentCode = () => {
    const blob = new Blob([draftCodeRef.current || ""], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      String(props.task.title || "solution")
        .replace(/[^a-z0-9а-яёіїєґ_-]+/gi, "-")
        .replace(/^-+|-+$/g, "") || "solution"
    }.${props.isWebTask ? "html" : JUDGE_FILE_EXTENSIONS[props.language]}`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLabel(label);
      window.setTimeout(
        () => setCopiedLabel((current) => (current === label ? null : current)),
        1200,
      );
    } catch {
      setNotice(tr("Не вдалося скопіювати текст", "Could not copy text"));
    }
  };
  const rememberStdinHistory = () => {
    const value = String(props.stdin ?? "").trim();
    if (!value || props.isWebTask || isEmptyTask) return;
    const next = [
      value,
      ...stdinHistory.filter((item) => item !== value),
    ].slice(0, 6);
    setStdinHistory(next);
    try {
      localStorage.setItem(
        scopedStorageKey(STDIN_HISTORY_KEY, props.task.id),
        JSON.stringify(next),
      );
    } catch {
      // Local history is optional and must not block running code.
    }
  };
  const compilerErrorLine = React.useMemo(() => {
    const source = String(props.checkResult?.compileError ?? "");
    if (!source) return null;
    const match = source.match(/(?:\bline\s+|:\s*)(\d+)(?::|\b)/i);
    const line = match ? Number(match[1]) : NaN;
    return Number.isFinite(line) && line > 0 ? line : null;
  }, [props.checkResult?.compileError]);
  const comparisonCode = history[0]?.code ?? "";
  const comparisonLines = React.useMemo(() => {
    const before = comparisonCode.split("\n");
    const after = (draftCodeRef.current || "").split("\n");
    const rows: Array<{
      kind: "same" | "removed" | "added";
      line: string;
      number: number;
    }> = [];
    const count = Math.max(before.length, after.length);
    for (let index = 0; index < count; index += 1) {
      if (before[index] === after[index])
        rows.push({
          kind: "same",
          line: after[index] ?? "",
          number: index + 1,
        });
      else {
        if (before[index] !== undefined)
          rows.push({
            kind: "removed",
            line: before[index],
            number: index + 1,
          });
        if (after[index] !== undefined)
          rows.push({ kind: "added", line: after[index], number: index + 1 });
      }
    }
    return rows;
  }, [comparisonCode, props.code]);
  const firstFailedPublicTestId =
    props.checkResult?.publicTestResults?.find((test) => !test.passed)
      ?.testId ?? null;
  const publicTestResults = props.checkResult?.publicTestResults ?? [];
  const assistantFailures = getAssistantFailures(props.checkResult?.publicTestResults);
  const visiblePublicTestResults = showFailedOnly
    ? publicTestResults.filter((test) => !test.passed)
    : publicTestResults;
  const firstFailedPublicTest =
    publicTestResults.find((test) => !test.passed) ?? null;
  const expandedPublicTest =
    publicTestResults.find((test) => test.testId === expandedTestId) ?? null;
  const renderHistory = () => {
    return (
      <div className="ide-history">
        <div className="ide-history-content">
          <div className="flex items-center justify-between gap-2">
            <div className="font-semibold text-[var(--ide-text)]">
              {tr("Локальна історія", "Local history")}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-[var(--ide-accent)]">
                <Check className="size-4" />
                {tr("Автозбереження", "Autosave")}
              </div>
              <button
                type="button"
                onClick={() => setDiffOpen(true)}
                disabled={!history.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ide-border)] px-2 py-1 text-[11px] font-semibold text-[var(--ide-text)] hover:bg-white/[.06] disabled:pointer-events-none disabled:opacity-40"
                aria-label={tr(
                  "Порівняти з останнім знімком",
                  "Compare with latest snapshot",
                )}
                title={tr(
                  "Порівняти з останнім знімком",
                  "Compare with latest snapshot",
                )}
              >
                <GitCompareArrows className="size-3.5" />
                {tr("Порівняти", "Compare")}
              </button>
            </div>
          </div>
          <p className="mt-2">
            {tr(
              "Знімки коду зберігаються у цьому браузері й не відправляються на сервер.",
              "Code snapshots stay in this browser and are not sent to the server.",
            )}
          </p>
          {history.length ? (
            <div className="ide-history-list">
              {history.map((entry, index) => (
                <div key={`${entry.at}-${index}`} className="ide-history-entry">
                  <div className="min-w-0">
                    <div className="text-[11px] text-[var(--ide-muted)]">
                      {new Intl.DateTimeFormat(i18n.language || "uk", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(entry.at))}
                    </div>
                    <pre className="mt-1 max-h-8 overflow-hidden whitespace-pre-wrap font-mono text-[11px] text-[var(--ide-text)]">
                      {entry.code}
                    </pre>
                  </div>
                  <button
                    type="button"
                    onClick={() => props.onCodeChange(entry.code)}
                    className="shrink-0 rounded-md border border-[var(--ide-border)] px-2 py-1 text-[11px] font-semibold text-[var(--ide-accent)] hover:bg-white/[.07]"
                  >
                    {tr("Відновити", "Restore")}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[var(--ide-muted)]">
              {tr(
                "Перші версії з’являться після редагування коду.",
                "Snapshots will appear after you edit the code.",
              )}
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderBottom = () => {
    if (bottomTab === "terminal") {
      const example =
        lastRunInput === null
          ? undefined
          : props.publicExamples?.find(
              (item) => item.input.trim() === lastRunInput.trim(),
            );
      if (!props.runResult && !props.running)
        return (
          <div className="ide-runner-empty">
            <span className="ide-runner-empty-icon">
              <SquareTerminal />
            </span>
            <div>
              <h3>{tr("Вивід програми", "Program output")}</h3>
              <p>
                {tr(
                  "Натисни «Запустити», щоб побачити результат для свого вводу.",
                  "Press Run to see the result for your input.",
                )}
              </p>
            </div>
          </div>
        );
      return (
        <div
          className="ide-run-output"
          aria-live="polite"
          aria-busy={props.running}
        >
          <div
            className="ide-output-status"
            data-error={!props.running && !props.runResult?.success}
          >
            {props.running ? (
              <Loader2 className="size-4 animate-spin" />
            ) : props.runResult?.success ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <SquareTerminal className="size-4" />
            )}
            <span>
              {props.running
                ? tr("Програма виконується…", "Running your program…")
                : props.runResult?.success
                  ? tr("Запуск завершено", "Run finished")
                  : tr(
                      "Програма завершилася з помилкою",
                      "The program finished with an error",
                    )}
            </span>
            {!props.running && props.lastRunDurationMs != null ? (
              <small>{props.lastRunDurationMs} ms</small>
            ) : null}
          </div>
          {!props.running ? (
            <>
              <div className="ide-output-grid" data-custom={!example}>
                <div>
                  <div className="ide-output-label">
                    <span>{tr("Твій вивід", "Your output")}</span>
                    <button
                      type="button"
                      className="ide-icon-btn"
                      onClick={() =>
                        void copyText(props.runResult?.stdout || "", "stdout")
                      }
                      disabled={!props.runResult?.stdout}
                      aria-label={tr("Скопіювати вивід", "Copy output")}
                    >
                      {copiedLabel === "stdout" ? <Check /> : <Copy />}
                    </button>
                  </div>
                  <pre>
                    {props.runResult?.stdout ||
                      tr(
                        "Програма нічого не вивела",
                        "The program produced no output",
                      )}
                  </pre>
                </div>
                {example ? (
                  <div>
                    <div className="ide-output-label">
                      {tr(
                        "Очікуваний вивід прикладу",
                        "Expected example output",
                      )}
                    </div>
                    <pre>{example.expectedOutput}</pre>
                  </div>
                ) : null}
              </div>
              {props.runResult?.stderr ? (
                <div className="ide-output-error">
                  <div className="ide-output-label">
                    {tr("Повідомлення програми", "Program messages")}
                  </div>
                  <pre>{props.runResult.stderr}</pre>
                </div>
              ) : null}
              <p className="ide-input-note mt-3">
                {tr(
                  "Це запуск на вибраних даних. Щоб перевірити всі тести, надішли розв’язок.",
                  "This run uses the selected input. Submit your solution to check all tests.",
                )}
              </p>
            </>
          ) : null}
        </div>
      );
    }
    if (props.checking) {
      const progress = props.checkProgress;
      const phase =
        props.checkStatus === "queued"
          ? "queued"
          : (progress?.phase ?? "preparing");
      const testing = phase === "testing" && progress?.groupIndex != null;
      const percent =
        progress && progress.testsTotal > 0
          ? Math.round((progress.testsCompleted / progress.testsTotal) * 100)
          : 0;
      const plainGroup =
        progress?.group === "public" || progress?.group === "hidden";
      const groupName =
        progress?.group?.replace(/^subtask[_ -]?(\d+)$/i, "$1") ??
        String(progress?.groupIndex ?? "");
      const title =
        phase === "queued"
          ? tr("Розв’язок у черзі", "Solution queued")
          : phase === "compiling"
            ? tr("Компілюємо програму", "Compiling your program")
            : phase === "finishing"
              ? tr("Готуємо результат", "Preparing your result")
              : testing
                ? plainGroup
                  ? progress.group === "public"
                    ? tr("Відкриті тести", "Public tests")
                    : tr("Приховані тести", "Hidden tests")
                  : `${tr("Підзадача", "Subtask")} ${groupName}`
                : tr("Готуємо перевірку", "Preparing your check");
      const detail = testing
        ? `${tr("Тест", "Test")} ${progress.groupTest} ${tr("із", "of")} ${progress.groupTestsTotal}`
        : phase === "queued"
          ? tr(
              "Перевірка почнеться, щойно звільниться суддя.",
              "Checking starts when a judge becomes available.",
            )
          : phase === "compiling"
            ? tr(
                "Після компіляції почнеться перевірка тестів.",
                "Tests will start after compilation.",
              )
            : phase === "finishing"
              ? tr(
                  "Зберігаємо оцінку та результати перевірки.",
                  "Saving your score and check results.",
                )
              : tr(
                  "Підготовлюємо програму та тести до запуску.",
                  "Preparing your program and tests to run.",
                );
      return (
        <section
          className="ide-check-progress"
          aria-busy="true"
          aria-label={tr("Перебіг перевірки", "Check progress")}
        >
          <div className="ide-check-progress-heading">
            <span className="ide-check-progress-icon" aria-hidden="true">
              {phase === "queued" ? (
                <Clock3 size={20} />
              ) : (
                <Loader2 size={20} className="animate-spin" />
              )}
            </span>
            <div
              className="ide-check-progress-copy"
              role="status"
              aria-live="polite"
            >
              <h3>{title}</h3>
              <p>{detail}</p>
            </div>
            {testing && (
              <span className="ide-check-progress-position">
                {plainGroup ? tr("Група", "Group") : tr("Підзадача", "Subtask")}{" "}
                {progress.groupIndex} / {progress.groupsTotal}
              </span>
            )}
          </div>
          <div
            className={`ide-check-progress-track ${testing || phase === "finishing" ? "" : "is-pending"}`}
            role="progressbar"
            aria-label={tr("Перевірено тестів", "Tests checked")}
            aria-valuemin={0}
            aria-valuemax={progress?.testsTotal || 100}
            aria-valuenow={
              testing || phase === "finishing"
                ? (progress?.testsCompleted ?? 0)
                : undefined
            }
            aria-valuetext={
              progress
                ? `${progress.testsCompleted} / ${progress.testsTotal}`
                : undefined
            }
          >
            <span
              style={
                testing || phase === "finishing"
                  ? { width: `${percent}%` }
                  : undefined
              }
            />
          </div>
          <div className="ide-check-progress-footer">
            <span>
              {progress && (testing || phase === "finishing")
                ? `${tr("Перевірено тестів", "Tests checked")}: ${progress.testsCompleted} / ${progress.testsTotal}`
                : tr("Перевіряємо розв’язок", "Checking your solution")}
            </span>
            <span>
              {tr("Результат з’явиться тут", "Your result will appear here")}
            </span>
          </div>
        </section>
      );
    }
    return (
      <div className="ide-test-results">
        {props.checkResult || props.runResult ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {props.checkResult ? (
              <span
                className={`rounded-md px-2.5 py-1 font-semibold ${verdictIsAccepted(props.checkResult.verdict) ? "bg-[var(--ide-accent-wash)] text-[var(--ide-accent)]" : "bg-[var(--ide-error-wash)] text-[var(--ide-error)]"}`}
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
        ) : null}
        {props.checkResult?.groupScores?.length ? (
          <div className="mb-3 rounded-xl border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ide-muted)]">
              {tr("Сабтаски", "Subtasks")}
            </div>
            <div className="flex flex-wrap gap-2">
              {props.checkResult.groupScores.slice(0, 24).map((group) => (
                <span
                  key={group.group}
                  className="rounded-lg bg-white/[.06] px-2.5 py-1.5 text-[11px] text-[var(--ide-text)]"
                >
                  {group.group}: {group.score}/{group.maxScore}
                  {group.status === "SKIPPED"
                    ? tr(" (пропущено)", " (skipped)")
                    : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {props.checkResult?.compileError ? (
          <div className="mb-3 rounded-xl border border-accent-error/25 bg-accent-error/5 p-3">
            <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ide-error)]">
              <span>{tr("Помилка компіляції", "Compiler error")}</span>
              <button
                type="button"
                onClick={() =>
                  void copyText(
                    props.checkResult?.compileError || "",
                    "compile-error",
                  )
                }
                className="inline-flex items-center gap-1 rounded-md border border-accent-error/25 px-2 py-1 text-[11px] normal-case tracking-normal text-[var(--ide-error)] hover:bg-[var(--ide-error-wash)]"
                aria-label={tr(
                  "Скопіювати помилку компіляції",
                  "Copy compiler error",
                )}
                title={tr(
                  "Скопіювати помилку компіляції",
                  "Copy compiler error",
                )}
              >
                {copiedLabel === "compile-error" ? (
                  <Check className="size-3" />
                ) : (
                  <Copy className="size-3" />
                )}
                {copiedLabel === "compile-error"
                  ? tr("Скопійовано", "Copied")
                  : tr("Копіювати", "Copy")}
              </button>
            </div>
            <pre className="whitespace-pre-wrap font-mono text-[var(--ide-error)]">
              {props.checkResult.compileError}
            </pre>
          </div>
        ) : null}
        {props.checkResult?.publicTestResults?.length ? (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ide-muted)]">
                {tr("Публічні тести", "Public tests")} ·{" "}
                {publicTestResults.length}
              </span>
              <button
                type="button"
                onClick={() => setShowFailedOnly((value) => !value)}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${showFailedOnly ? "border-accent-error/35 bg-[var(--ide-error-wash)] text-[var(--ide-error)]" : "border-[var(--ide-border)] text-[var(--ide-muted)] hover:bg-white/[.06] hover:text-[var(--ide-text)]"}`}
                aria-pressed={showFailedOnly}
              >
                {showFailedOnly
                  ? tr("Усі тести", "All tests")
                  : tr("Лише невдалі", "Failed only")}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {visiblePublicTestResults.map((test, index) => (
                <div key={test.testId} className="space-y-1">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTestId((current) =>
                        current === test.testId ? null : test.testId,
                      )
                    }
                    className={`w-full rounded-lg border p-2 text-center transition hover:brightness-125 ${test.testId === firstFailedPublicTestId ? "ring-2 ring-accent-error/70 ring-offset-1 ring-offset-[#0b120e]" : ""} ${test.skipped ? "border-accent-warn/30 bg-accent-warn/10 text-accent-warn" : test.passed ? "border-primary/30 bg-[var(--ide-accent-wash)] text-[var(--ide-accent)]" : "border-accent-error/30 bg-[var(--ide-error-wash)] text-[var(--ide-error)]"}`}
                    aria-label={`${tr("Тест", "Test")} #${test.testId}${test.testId === firstFailedPublicTestId ? ` · ${tr("перший невдалий", "first failed")}` : ""}`}
                  >
                    <span className="block font-bold">
                      {test.passed ? "✓" : "×"} {index + 1}
                    </span>
                    <span className="mt-1 block text-[11px] opacity-70">
                      {test.verdict || (test.passed ? "AC" : "WA")}
                    </span>
                  </button>
                  {(() => {
                    const example = props.publicExamples?.find(
                      (item) => item.testId === test.testId,
                    );
                    if (!example) return null;
                    const inputLabel = `public-input:${test.testId}`;
                    const outputLabel = `public-output:${test.testId}`;
                    return (
                      <div className="flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(example.input, inputLabel)
                          }
                          disabled={!example.input}
                          className="rounded border border-[var(--ide-border)] p-1 text-[var(--ide-muted)] hover:bg-white/[.06] hover:text-[var(--ide-text)] disabled:pointer-events-none disabled:opacity-40"
                          aria-label={tr(
                            `Скопіювати input тесту ${index + 1}`,
                            `Copy test ${index + 1} input`,
                          )}
                          title={tr("Скопіювати input", "Copy input")}
                        >
                          {copiedLabel === inputLabel ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void copyText(example.expectedOutput, outputLabel)
                          }
                          disabled={!example.expectedOutput}
                          className="rounded border border-[var(--ide-border)] p-1 text-[var(--ide-muted)] hover:bg-white/[.06] hover:text-[var(--ide-text)] disabled:pointer-events-none disabled:opacity-40"
                          aria-label={tr(
                            `Скопіювати очікуваний output тесту ${index + 1}`,
                            `Copy test ${index + 1} expected output`,
                          )}
                          title={tr(
                            "Скопіювати expected output",
                            "Copy expected output",
                          )}
                        >
                          {copiedLabel === outputLabel ? (
                            <Check className="size-3" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
            {!visiblePublicTestResults.length ? (
              <div className="rounded-lg border border-[var(--ide-border)] bg-white/[.03] px-3 py-2 text-xs text-[var(--ide-muted)]">
                {tr("Невдалих тестів немає.", "There are no failed tests.")}
              </div>
            ) : null}
            {expandedPublicTest ? (
              <div className="mt-3 rounded-xl border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ide-muted)]">
                  <span>
                    {tr("Деталі тесту", "Test details")} #
                    {expandedPublicTest.testId}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExpandedTestId(null)}
                    className="rounded-md px-2 py-1 normal-case tracking-normal hover:bg-white/[.06] hover:text-[var(--ide-text)]"
                  >
                    {tr("Закрити", "Close")}
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <div className="mb-1 text-[11px] text-[var(--ide-muted)]">
                      {tr("Ввід", "Input")}
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-2 font-mono text-[11px] text-[var(--ide-text)]">
                      {expandedPublicTest.input || "—"}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-[var(--ide-muted)]">
                      {tr("Очікуваний вивід", "Expected output")}
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-2 font-mono text-[11px] text-[var(--ide-accent)]">
                      {expandedPublicTest.expectedOutput ||
                        props.publicExamples?.find(
                          (item) => item.testId === expandedPublicTest.testId,
                        )?.expectedOutput ||
                        "—"}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-[var(--ide-muted)]">
                      {tr("Твій вивід", "Actual output")}
                    </div>
                    <pre className="max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-2 font-mono text-[11px] text-[var(--ide-error)]">
                      {expandedPublicTest.actualOutput || "—"}
                    </pre>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="ide-runner-empty ide-runner-empty-compact">
            <span className="ide-runner-empty-icon">
              {allTestsPassed ? <CheckCircle2 /> : <TestTube2 />}
            </span>
            <div>
              <h3>
                {props.checkResult
                  ? allTestsPassed
                    ? tr("Розв’язок прийнято", "Solution accepted")
                    : tr("Результат перевірки", "Check result")
                  : tr("Перевірка на всіх тестах", "Check all tests")}
              </h3>
              <p>
                {props.checkResult
                  ? tr(
                      "Деталі окремих тестів для цієї задачі не публікуються.",
                      "Individual test details are not published for this problem.",
                    )
                  : props.submitMode
                    ? tr(
                        "Надішли розв’язок, щоб отримати оцінку.",
                        "Submit your solution to receive a score.",
                      )
                    : tr(
                        "Натисни «Перевірити», щоб побачити результат.",
                        "Press Check to see the result.",
                      )}
              </p>
            </div>
          </div>
        )}
        {firstFailedPublicTest ? (
          <div className="ide-first-failed-evidence mt-4 rounded-xl border border-accent-error/25 bg-accent-error/[.04] p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[var(--ide-error)]">
                {tr("Перший невдалий тест", "First failed test")} #
                {firstFailedPublicTest.testId}
              </span>
              <button
                type="button"
                onClick={() => setShowWhitespace((value) => !value)}
                aria-pressed={showWhitespace}
                className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${showWhitespace ? "border-accent-warn/35 bg-accent-warn/10 text-[var(--ide-warning)]" : "border-[var(--ide-border)] text-[var(--ide-muted)] hover:bg-white/[.06] hover:text-[var(--ide-text)]"}`}
              >
                {showWhitespace
                  ? tr("Звичайний вигляд", "Normal output")
                  : tr("Показати пробіли", "Show whitespace")}
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[.12em] text-[var(--ide-accent)]">
                  {tr("Очікуваний вивід", "Expected output")}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-3 font-mono text-xs text-[var(--ide-accent)]">
                  {showWhitespace
                    ? visualizeWhitespace(
                        firstFailedPublicTest.expectedOutput ||
                          props.publicExamples?.find(
                            (item) =>
                              item.testId === firstFailedPublicTest.testId,
                          )?.expectedOutput ||
                          "",
                      ) || "—"
                    : firstFailedPublicTest.expectedOutput ||
                      props.publicExamples?.find(
                        (item) => item.testId === firstFailedPublicTest.testId,
                      )?.expectedOutput ||
                      "—"}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[.12em] text-[var(--ide-error)]">
                  {tr("Твій вивід", "Actual output")}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-3 font-mono text-xs text-[var(--ide-error)]">
                  {showWhitespace
                    ? visualizeWhitespace(
                        firstFailedPublicTest.actualOutput || "",
                      ) || "—"
                    : firstFailedPublicTest.actualOutput || "—"}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-[.12em] text-[var(--ide-muted)]">
                  {tr("Ввід", "Input")}
                </div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-[var(--ide-border)] bg-[var(--ide-canvas)] p-3 font-mono text-xs text-[var(--ide-text)]">
                  {firstFailedPublicTest.input || "—"}
                </pre>
                <button
                  type="button"
                  onClick={() =>
                    props.onStdinChange(firstFailedPublicTest.input || "")
                  }
                  disabled={!firstFailedPublicTest.input || props.isWebTask}
                  className="mt-2 rounded-lg border border-[var(--ide-border)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--ide-accent)] hover:bg-white/[.06] disabled:pointer-events-none disabled:opacity-40"
                >
                  {tr("Використати як stdin", "Use as stdin")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {typeof props.resultCards === "function"
          ? props.resultCards({ onReturnToCode: () => setMobilePane("code") })
          : props.resultCards}
      </div>
    );
  };

  if (mode === "theory") {
    return (
      <div className="studycod-workbench ide-theory">
        <header
          className="ide-header"
          data-contest={Boolean(props.problemNavigation)}
        >
          <button
            type="button"
            className="ide-icon-btn"
            onClick={props.onBack}
            aria-label={tr("Назад", "Back")}
          >
            <ChevronRight className="rotate-180" />
          </button>
          <span className="ide-header-title">
            {tr("Теорія перед практикою", "Theory before practice")}
          </span>
        </header>
        <div className="ide-theory-content">
          <div className="ide-task-meta">
            {tr(
              "Крок 1 · Ознайомся з матеріалом",
              "Step 1 · Read the material",
            )}
          </div>
          <h1 className="ide-task-title">{props.task.title}</h1>
          {props.theory ? (
            <article className="ide-task-document">
              <MarkdownView content={props.theory} variant="task" />
            </article>
          ) : (
            <p className="ide-input-note">
              {tr(
                "Для цієї задачі немає окремої теорії. Можна переходити до практики.",
                "This task has no separate theory. You can start practicing.",
              )}
            </p>
          )}
          <div className="ide-theory-next">
            <p className="ide-input-note">
              {tr(
                "Матеріал залишиться доступним поруч з умовою задачі.",
                "This material stays available beside the problem statement.",
              )}
            </p>
            <button
              type="button"
              className="ide-btn ide-btn-primary"
              onClick={markTheoryComplete}
            >
              {tr("Перейти до практики", "Start practicing")}
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const showStatement = !focusMode && !layout.rightCollapsed;
  const showRunner = !focusMode && !layout.bottomCollapsed;
  const statementBounds = getResizeBounds("right");
  const runnerBounds = getResizeBounds("bottom");
  const statementWidth = Math.max(
    statementBounds.min,
    Math.min(layout.right, statementBounds.max),
  );
  const runnerHeight = Math.max(
    runnerBounds.min,
    Math.min(layout.bottom, runnerBounds.max),
  );
  const selectedExample = props.publicExamples?.find(
    (item) => item.input.trim() === props.stdin.trim(),
  );
  const activeMiniProjectRemainingSeconds =
    miniProjectTimer?.taskId === String(props.task.id)
      ? miniProjectRemainingSeconds
      : null;
  const saveStatusLabel = getIdeSaveStatusLabel(
    props.saveStatus,
    props.lastSavedAt,
    {
      saved: tr("Збережено", "Saved"),
      dirty: tr("Є зміни", "Unsaved"),
      saving: tr("Збереження…", "Saving…"),
      error: tr("Помилка збереження", "Save failed"),
    },
    (timestamp) => formatIdeTimestamp(timestamp, i18n.language || "uk"),
  );
  const busy = props.running || props.checking;
  const activeProblemLabel = props.problemNavigation?.items.find(
    (problem) => problem.id === props.problemNavigation?.activeId,
  )?.label;
  const taskHeading =
    activeProblemLabel && !props.task.title.startsWith(`${activeProblemLabel}.`)
      ? `${activeProblemLabel}. ${props.task.title}`
      : props.task.title;
  const runActions = (
    <>
      <button
        type="button"
        className="ide-btn"
        onClick={runWithTab}
        disabled={Boolean(props.readOnly) || busy || isEmptyTask}
        title={tr("Запустити · Ctrl+Enter", "Run · Ctrl+Enter")}
      >
        {props.running ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Play weight="fill" />
        )}
        {props.running ? tr("Запуск…", "Running…") : tr("Запустити", "Run")}
        <kbd>Ctrl ↵</kbd>
      </button>
      <button
        type="button"
        className="ide-btn ide-btn-primary"
        onClick={checkWithTab}
        disabled={Boolean(props.readOnly) || busy || isEmptyTask}
        title={tr("Перевірити · Ctrl+Shift+Enter", "Check · Ctrl+Shift+Enter")}
      >
        {props.checking ? (
          <Loader2 className="animate-spin" />
        ) : (
          <CheckCircle2 weight="bold" />
        )}
        {props.checking
          ? tr("Перевіряємо…", "Checking…")
          : props.submitMode
            ? tr("Надіслати", "Submit")
            : tr("Перевірити", "Check")}
      </button>
    </>
  );
  const contextContent =
    assistantTab === "task" ? (
      <>
        <div className="ide-task-meta">
          {!props.problemNavigation ? (
            <span>{tr("Задача", "Problem")}</span>
          ) : null}
          {props.task.difficulty ? (
            <span className="ide-difficulty">
              {props.task.difficulty === "EASY"
                ? tr("Легка", "Easy")
                : props.task.difficulty === "MEDIUM"
                  ? tr("Середня", "Medium")
                  : props.task.difficulty === "HARD"
                    ? tr("Складна", "Hard")
                    : props.task.difficulty}
            </span>
          ) : null}
          {props.task.tags?.slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          {allTestsPassed ? (
            <span className="ide-difficulty">{tr("Розв’язано", "Solved")}</span>
          ) : null}
        </div>
        <h1 className="ide-task-title">{taskHeading}</h1>
        {!props.isWebTask &&
        (props.task.timeLimitMs ||
          props.task.memoryLimitMb ||
          props.task.limitsByLanguage?.[props.language]) ? (
          <div
            className="ide-task-limits"
            aria-label={tr("Ліміти задачі", "Problem limits")}
          >
            {(props.task.limitsByLanguage?.[props.language]?.timeLimitMs ??
              props.task.timeLimitMs ??
              0) > 0 ? (
              <span>
                <Clock3 aria-hidden="true" />
                {new Intl.NumberFormat(en ? "en" : "uk", {
                  style: "unit",
                  unit: "second",
                  unitDisplay: "long",
                  maximumFractionDigits: 3,
                }).format(
                  (props.task.limitsByLanguage?.[props.language]?.timeLimitMs ??
                    props.task.timeLimitMs ??
                    0) / 1000,
                )}
              </span>
            ) : null}
            {(props.task.limitsByLanguage?.[props.language]?.memoryLimitMb ??
              props.task.memoryLimitMb ??
              0) > 0 ? (
              <span>
                <HardDrives aria-hidden="true" />
                {new Intl.NumberFormat(en ? "en" : "uk", {
                  style: "unit",
                  unit: "megabyte",
                  unitDisplay: "long",
                }).format(
                  props.task.limitsByLanguage?.[props.language]
                    ?.memoryLimitMb ??
                    props.task.memoryLimitMb ??
                    0,
                )}
              </span>
            ) : null}
            {props.task.statementLanguage &&
            props.task.statementLanguage !== (en ? "en" : "uk") ? (
              <small>
                {props.task.statementLanguage === "uk"
                  ? tr("Умова українською", "Statement in Ukrainian")
                  : tr("Умова англійською", "Statement in English")}
              </small>
            ) : null}
          </div>
        ) : null}
        <article className="ide-task-document">
          <MarkdownView content={taskBody} variant="task" />
        </article>
        {props.publicExamples?.some(example => example.imageUrls?.length) ? <section className="mt-4 space-y-3" aria-label={tr("Зображення у відкритих тестах", "Images in public tests")}>
          <h3 className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--ide-muted)]">{tr("Зображення у прикладах", "Example images")}</h3>
          {props.publicExamples.filter(example => example.imageUrls?.length).map((example, index) => <div key={example.testId} className="rounded-xl border border-[var(--ide-border)] bg-[var(--ide-surface)] p-3">
            <div className="mb-2 text-[11px] font-semibold text-[var(--ide-muted)]">{tr(`Приклад ${index + 1}`, `Example ${index + 1}`)}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--ide-muted)]">{tr("Ввід", "Input")}</div><pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">{example.input || "∅"}</pre></div>
              <div><div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--ide-muted)]">{tr("Очікуваний результат", "Expected output")}</div><pre className="max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs">{example.expectedOutput || "∅"}</pre></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{example.imageUrls?.map((url, imageIndex) => <a key={`${url}-${imageIndex}`} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-[var(--ide-border)]"><img src={url} alt={tr(`Зображення прикладу ${index + 1}`, `Example ${index + 1} image`)} loading="lazy" className="max-h-56 max-w-full object-contain" /></a>)}</div>
          </div>)}
        </section> : null}
        {props.task.projectSpec ? (
          <details className="ide-context-details" open>
            <summary>
              {tr("План мініпроєкту", "Mini-project plan")} ·{" "}
              {props.task.projectSpec.estimatedMinutes} {tr("хв", "min")}
            </summary>
            <p>{props.task.projectSpec.skills.join(" · ")}</p>
            <ol className="ide-project-list">
              {props.task.projectSpec.milestones.map((milestone, index) => (
                <li key={milestone.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{milestone.title}</strong>
                    <p>{milestone.description}</p>
                    {milestone.required === false ? (
                      <small>
                        {tr("Додатковий етап", "Optional milestone")}
                      </small>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
            {props.task.projectSpec.inputFormat ? (
              <p>
                <strong>{tr("Ввід", "Input")}: </strong>
                {props.task.projectSpec.inputFormat}
              </p>
            ) : null}
            {props.task.projectSpec.outputFormat ? (
              <p>
                <strong>{tr("Вивід", "Output")}: </strong>
                {props.task.projectSpec.outputFormat}
              </p>
            ) : null}
            {props.task.projectSpec.extensions?.length ? (
              <p>{props.task.projectSpec.extensions.join(" · ")}</p>
            ) : null}
          </details>
        ) : null}
        {props.theory ? (
          <details className="ide-context-details">
            <summary>
              {tr("Теорія до задачі", "Theory for this problem")}
            </summary>
            <div className="ide-task-document mt-4">
              <MarkdownView content={props.theory} variant="task" />
            </div>
          </details>
        ) : null}
      </>
    ) : assistantTab === "history" ? (
      renderHistory()
    ) : assistantTab === "hints" ? (
      <>
        {props.hints?.length ? (
          props.hints.map((hint, index) => (
            <section className="ide-hint" key={index}>
              <button
                type="button"
                onClick={() =>
                  setOpenHintIndex(openHintIndex === index ? null : index)
                }
                aria-expanded={openHintIndex === index}
                aria-controls={`ide-hint-${index}`}
              >
                <Lightbulb className="size-4 text-[var(--ide-accent)]" />
                <span>{tr(`Підказка ${index + 1}`, `Hint ${index + 1}`)}</span>
                <ChevronDown className="size-4" />
              </button>
              {openHintIndex === index ? (
                <p id={`ide-hint-${index}`}>{hint}</p>
              ) : null}
            </section>
          ))
        ) : (
          <div className="ide-empty-context">
            <h3>
              {props.hintsStatus === "UNAVAILABLE"
                ? tr(
                    "Підказки тимчасово недоступні",
                    "Hints are temporarily unavailable",
                  )
                : tr("Спробуй розв’язати самостійно", "Give it a try first")}
            </h3>
            <p>
              {tr(
                "Після першої перевірки тут з’являться підказки до твого рішення.",
                "After your first check, hints for your solution will appear here.",
              )}
            </p>
          </div>
        )}
      </>
    ) : (
      <>
        <p className="ide-input-note mb-4">
          {tr(
            "Ментор допоможе знайти наступний крок через навідні питання.",
            "The mentor helps you find the next step with guiding questions.",
          )}
        </p>
        <DebugMentorChat
          language={props.language}
          code={draftCodeRef.current}
          verdict={resultVerdict}
          stderr={props.runResult?.stderr || props.checkResult?.compileError}
          taskTitle={props.task.title}
          taskText={props.task.description}
          taskId={props.task.id}
          failures={assistantFailures}
        />
        {props.checkResult && !verdictIsAccepted(props.checkResult.verdict) ? (
          <ErrorExplainButton
            language={props.language}
            code={draftCodeRef.current}
            verdict={props.checkResult.verdict}
            stderr={props.checkResult.compileError || props.runResult?.stderr}
            taskTitle={props.task.title}
            taskText={props.task.description}
            failures={assistantFailures}
          />
        ) : null}
      </>
    );
  const inputTools = !props.isWebTask ? (
    <div className="ide-input-tools">
      {props.publicExamples?.length || props.firstExampleInput ? (
        <select
          className="ide-example-select"
          aria-label={tr("Автовставка прикладу", "Autofill an example")}
          title={tr(
            "Вибери приклад для автоматичного заповнення вводу",
            "Choose an example to fill the input automatically",
          )}
          value={selectedExample ? String(selectedExample.testId) : ""}
          onChange={(event) => {
            const example = props.publicExamples?.find(
              (item) => String(item.testId) === event.target.value,
            );
            if (example) props.onStdinChange(example.input);
            else if (event.target.value === "first")
              props.onStdinChange(props.firstExampleInput ?? "");
          }}
        >
          <option value="" disabled>
            {tr("Вставити приклад", "Insert example")}
          </option>
          {props.publicExamples?.length ? (
            props.publicExamples.map((example, index) => (
              <option key={example.testId} value={String(example.testId)}>
                {tr(`Приклад ${index + 1}`, `Example ${index + 1}`)}
              </option>
            ))
          ) : (
            <option value="first">{tr("Приклад 1", "Example 1")}</option>
          )}
        </select>
      ) : null}
      {!simpleMode && stdinHistory.length ? (
        <select
          value=""
          aria-label={tr("Останні вводи", "Recent inputs")}
          className="ide-example-select"
          onChange={(event) => props.onStdinChange(event.target.value)}
        >
          <option value="">{tr("Історія вводу", "Input history")}</option>
          {stdinHistory.map((value, index) => (
            <option key={index} value={value}>
              {value.replace(/\s+/g, " ").slice(0, 40)}
            </option>
          ))}
        </select>
      ) : null}
      <button
        type="button"
        className="ide-icon-btn"
        onClick={() => props.onStdinChange("")}
        disabled={!props.stdin}
        aria-label={tr("Очистити ввід", "Clear input")}
        title={tr("Очистити ввід", "Clear input")}
      >
        <Eraser />
      </button>
    </div>
  ) : null;
  const renderInput = () =>
    props.isWebTask ? (
      <div className="ide-runner-empty">
        <span className="ide-runner-empty-icon">
          <Code2 />
        </span>
        <div>
          <h3>{tr("Перегляд поруч із кодом", "Preview beside your code")}</h3>
          <p>
            {tr(
              "Для вебзадач введення даних не потрібне.",
              "Web tasks do not need standard input.",
            )}
          </p>
        </div>
      </div>
    ) : (
      <div className="ide-input">
        <textarea
          id="ide-run-input"
          name="runInput"
          value={props.stdin}
          onChange={(event) => props.onStdinChange(event.target.value)}
          disabled={isEmptyTask}
          spellCheck={false}
          aria-label={tr("Вхідні дані", "Input")}
          placeholder={tr(
            "Введи дані або вибери приклад справа…",
            "Enter input or choose an example on the right…",
          )}
        />
      </div>
    );

  return (
    <div
      className="studycod-workbench"
      style={
        {
          "--ide-statement-width": `${statementWidth}px`,
          "--ide-runner-height": `${runnerHeight}px`,
        } as React.CSSProperties
      }
    >
      <header
        className="ide-header"
        data-contest={Boolean(props.problemNavigation)}
      >
        {props.onBack ? (
          <button
            type="button"
            className="ide-icon-btn"
            onClick={props.onBack}
            aria-label={tr("Назад до задач", "Back to problems")}
            title={tr("Назад до задач", "Back to problems")}
          >
            <ChevronRight className="rotate-180" />
          </button>
        ) : null}
        <div
          className="ide-header-title"
          title={props.task.section || props.task.title}
        >
          {props.task.section || props.task.title}
        </div>
        {props.problemNavigation ? (
          <div className="ide-header-context">
            {props.toolbarStatus}
            {props.toolbar}
          </div>
        ) : null}
        <div className="ide-actions">
          {props.saveStatus ? (
            <span
              className="ide-save"
              data-state={props.saveStatus}
              title={saveStatusLabel || undefined}
              role="status"
              aria-live="polite"
            >
              {props.saveStatus === "saved"
                ? tr("Збережено", "Saved")
                : saveStatusLabel}
            </span>
          ) : null}
          {activeMiniProjectRemainingSeconds !== null ? (
            <span className="ide-contest-clock">
              <Clock3 className="size-4" />
              {formatMiniProjectCountdown(activeMiniProjectRemainingSeconds)}
            </span>
          ) : null}
          <div ref={settingsRef} className="ide-settings-anchor">
            <button
              type="button"
              className="ide-icon-btn"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
              aria-controls="ide-settings"
              aria-label={tr("Налаштування редактора", "Editor settings")}
              title={tr("Налаштування редактора", "Editor settings")}
            >
              <Settings />
            </button>
            {settingsOpen ? (
              <div
                id="ide-settings"
                className="ide-settings"
                role="group"
                aria-label={tr("Налаштування редактора", "Editor settings")}
              >
                <h2 className="ide-settings-title">
                  {tr("Редактор", "Editor")}
                </h2>
                <div className="ide-setting-row">
                  <span>{tr("Розмір тексту", "Text size")}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="ide-icon-btn"
                      onClick={() =>
                        setFontSize((size) => Math.max(11, size - 1))
                      }
                      aria-label={tr(
                        "Зменшити розмір шрифту",
                        "Decrease font size",
                      )}
                    >
                      A−
                    </button>
                    <span className="tabular-nums">{fontSize}</span>
                    <button
                      type="button"
                      className="ide-icon-btn"
                      onClick={() =>
                        setFontSize((size) => Math.min(22, size + 1))
                      }
                      aria-label={tr(
                        "Збільшити розмір шрифту",
                        "Increase font size",
                      )}
                    >
                      A+
                    </button>
                  </div>
                </div>
                <label className="ide-setting-row">
                  <span>{tr("Переносити довгі рядки", "Wrap long lines")}</span>
                  <input
                    type="checkbox"
                    checked={wordWrap}
                    onChange={(event) => setWordWrap(event.target.checked)}
                  />
                </label>
                <label className="ide-setting-row">
                  <span>{tr("Додаткові інструменти", "Advanced tools")}</span>
                  <input
                    type="checkbox"
                    checked={!simpleMode}
                    onChange={(event) => setSimpleMode(!event.target.checked)}
                  />
                </label>
                <div className="ide-settings-divider" />
                <h2 className="ide-settings-title">
                  {tr("Робоча область", "Workspace")}
                </h2>
                <button
                  type="button"
                  className="ide-settings-action"
                  onClick={() => {
                    setStatementOnRight((current) => !current);
                    setSettingsOpen(false);
                  }}
                >
                  <SwapPanels />
                  {statementOnRight
                    ? tr("Умова ліворуч", "Statement on the left")
                    : tr("Умова праворуч", "Statement on the right")}
                </button>
                <button
                  type="button"
                  className="ide-settings-action"
                  onClick={() => {
                    setFocusMode((current) => !current);
                    setSettingsOpen(false);
                  }}
                >
                  <Maximize2 />
                  {focusMode
                    ? tr("Показати всі панелі", "Show all panels")
                    : tr("Лише редактор", "Focus on code")}
                </button>
                <button
                  type="button"
                  className="ide-settings-action"
                  onClick={() => {
                    updateLayout({
                      right: bodySize.width * 0.42,
                      bottom: 240,
                      rightCollapsed: false,
                      bottomCollapsed: false,
                    });
                    setFocusMode(false);
                    setSettingsOpen(false);
                  }}
                >
                  <RotateCcw />
                  {tr("Відновити розташування", "Reset layout")}
                </button>
                <div className="ide-settings-divider" />
                <button
                  type="button"
                  className="ide-settings-action"
                  onClick={props.onSave}
                  disabled={props.readOnly}
                >
                  <Save />
                  {tr("Зберегти зараз", "Save now")}
                </button>
                <button
                  type="button"
                  className="ide-settings-action"
                  onClick={downloadCurrentCode}
                >
                  <Download />
                  {tr("Завантажити код", "Download code")}
                </button>
                <button
                  type="button"
                  className="ide-settings-action"
                  data-destructive="true"
                  onClick={() => {
                    setResetConfirmOpen(true);
                    setSettingsOpen(false);
                  }}
                  disabled={props.readOnly}
                >
                  <RotateCcw />
                  {tr("Відновити початковий код", "Restore starter code")}
                </button>
                {props.attemptsUsed != null ? (
                  <p className="ide-input-note mt-3">
                    {tr("Надсилання", "Submissions")}: {props.attemptsUsed}
                    {props.maxAttempts ? ` / ${props.maxAttempts}` : ""}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="ide-actions ide-run-actions">{runActions}</div>
        </div>
      </header>
      {!props.problemNavigation &&
      (props.contextToolbar || props.toolbarStatus || props.toolbar) ? (
        <nav
          className="ide-context-bar"
          aria-label={tr("Навігація задачами", "Problem navigation")}
        >
          <div>{props.contextToolbar}</div>
          <div className="ide-context-status">
            {props.toolbarStatus}
            {props.toolbar}
          </div>
        </nav>
      ) : null}
      <div className="ide-workbench-content">
        {props.problemNavigation ? (
          <nav
            className="ide-problem-rail"
            aria-label={tr("Навігація задачами", "Problem navigation")}
          >
            <div
              className="ide-problem-rail-list"
              onKeyDown={(event) => {
                const keys = [
                  "ArrowUp",
                  "ArrowDown",
                  "ArrowLeft",
                  "ArrowRight",
                  "Home",
                  "End",
                ];
                if (!keys.includes(event.key)) return;
                const buttons = Array.from(
                  event.currentTarget.querySelectorAll<HTMLButtonElement>(
                    "button",
                  ),
                );
                const index = buttons.indexOf(
                  event.target as HTMLButtonElement,
                );
                if (index < 0) return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowUp" || event.key === "ArrowLeft"
                            ? -1
                            : 1) +
                          buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
                buttons[next]?.scrollIntoView({
                  block: "nearest",
                  inline: "nearest",
                });
              }}
            >
              {props.problemNavigation.items.map((problem) => (
                <button
                  type="button"
                  key={problem.id}
                  className="ide-problem-tab"
                  aria-current={
                    problem.id === props.problemNavigation?.activeId
                      ? "page"
                      : undefined
                  }
                  aria-label={`${problem.label}. ${problem.title}`}
                  title={`${problem.label}. ${problem.title}${problem.points != null ? ` · ${problem.points} ${tr("балів", "points")}` : ""}`}
                  onClick={() => props.problemNavigation?.onSelect(problem.id)}
                >
                  {problem.label}
                </button>
              ))}
            </div>
            {props.problemNavigation.footer ? (
              <div className="ide-problem-rail-footer">
                {props.problemNavigation.footer}
              </div>
            ) : null}
          </nav>
        ) : null}
        <div className="ide-workbench-main">
          <div
            className="ide-mobile-tabs"
            role="tablist"
            aria-label={tr("Панелі редактора", "Editor panels")}
            onKeyDown={handleMobileTabKeyDown}
          >
            {mobileTabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                id={`mobile-ide-tab-${id}`}
                type="button"
                className="ide-tab"
                role="tab"
                aria-selected={mobilePane === id}
                aria-controls={`mobile-ide-panel-${id}`}
                tabIndex={mobilePane === id ? 0 : -1}
                onClick={() => setMobilePane(id)}
              >
                <Icon />
                <span>{label}</span>
                {id === "result" && mobileResultUnread ? (
                  <span
                    className="ide-tab-count"
                    aria-label={tr("Новий результат", "New result")}
                  >
                    1
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div
            ref={bodyRef}
            className="ide-body"
            data-statement-side={statementOnRight ? "right" : "left"}
            data-mobile-pane={mobilePane}
          >
            {showStatement ? (
              <aside
                id="mobile-ide-panel-condition"
                className="ide-statement"
                data-assistance={!props.disableAiAssistance}
                aria-label={tr("Умова задачі", "Problem statement")}
              >
                <div className="ide-panel-bar">
                  <div
                    className="ide-context-tabs"
                    role="tablist"
                    onKeyDown={handlePanelTabKeyDown}
                    aria-label={tr(
                      "Задача та допомога",
                      "Problem and assistance",
                    )}
                  >
                    <button
                      type="button"
                      className="ide-tab"
                      role="tab"
                      id="ide-context-tab-task"
                      aria-selected={assistantTab === "task"}
                      tabIndex={assistantTab === "task" ? 0 : -1}
                      aria-controls="ide-context-panel"
                      onClick={() => setAssistantTab("task")}
                    >
                      <FileText />
                      {tr("Умова", "Statement")}
                    </button>
                    <button
                      type="button"
                      className="ide-tab"
                      role="tab"
                      id="ide-context-tab-history"
                      aria-selected={assistantTab === "history"}
                      tabIndex={assistantTab === "history" ? 0 : -1}
                      aria-controls="ide-context-panel"
                      onClick={() => setAssistantTab("history")}
                    >
                      <History />
                      {tr("Історія", "History")}
                    </button>
                    {!props.disableAiAssistance ? (
                      <>
                        <button
                          type="button"
                          className="ide-tab"
                          role="tab"
                          id="ide-context-tab-hints"
                          aria-selected={assistantTab === "hints"}
                          tabIndex={assistantTab === "hints" ? 0 : -1}
                          aria-controls="ide-context-panel"
                          onClick={() => setAssistantTab("hints")}
                        >
                          <Lightbulb />
                          {tr("Підказки", "Hints")}
                          {props.hints?.length ? (
                            <span className="ide-tab-count">
                              {props.hints.length}
                            </span>
                          ) : null}
                        </button>
                        <button
                          type="button"
                          className="ide-tab"
                          role="tab"
                          id="ide-context-tab-mentor"
                          aria-selected={assistantTab === "mentor"}
                          tabIndex={assistantTab === "mentor" ? 0 : -1}
                          aria-controls="ide-context-panel"
                          onClick={() => setAssistantTab("mentor")}
                        >
                          <Bot />
                          {tr("Ментор", "Mentor")}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="ide-icon-btn ide-expand-statement ide-desktop-control"
                    onClick={() =>
                      updateLayout({
                        right:
                          statementWidth > bodySize.width * 0.5
                            ? bodySize.width * 0.42
                            : statementBounds.max,
                      })
                    }
                    aria-label={tr(
                      "Розширити або звузити умову",
                      "Expand or narrow the statement",
                    )}
                    title={tr("Розширити умову", "Expand statement")}
                  >
                    <Maximize2 />
                  </button>
                  <button
                    type="button"
                    className="ide-icon-btn ide-desktop-control"
                    onClick={() => updateLayout({ rightCollapsed: true })}
                    aria-label={tr("Згорнути умову", "Collapse statement")}
                    title={tr("Згорнути умову", "Collapse statement")}
                  >
                    <Minimize2 />
                  </button>
                </div>
                <div
                  className="ide-context-content"
                  id="ide-context-panel"
                  role="tabpanel"
                  aria-labelledby={`ide-context-tab-${assistantTab}`}
                >
                  {contextContent}
                </div>
              </aside>
            ) : (
              <button
                type="button"
                className="ide-statement-rail"
                onClick={() => {
                  setFocusMode(false);
                  updateLayout({ rightCollapsed: false });
                }}
                aria-label={tr("Показати умову", "Show statement")}
              >
                <FileText className="size-4" />
                <span>{tr("Умова", "Statement")}</span>
              </button>
            )}
            {showStatement ? (
              <div
                className="ide-resize ide-resize-vertical"
                onPointerDown={(event) => beginResize("right", event)}
                onKeyDown={(event) => handleResizeKeyDown("right", event)}
                onDoubleClick={() =>
                  updateLayout({ right: bodySize.width * 0.42 })
                }
                role="separator"
                tabIndex={0}
                aria-orientation="vertical"
                aria-label={tr(
                  "Змінити ширину умови задачі",
                  "Resize task statement",
                )}
                aria-valuemin={statementBounds.min}
                aria-valuemax={Math.round(statementBounds.max)}
                aria-valuenow={Math.round(statementWidth)}
                title={tr(
                  "Перетягни, щоб змінити ширину. Подвійний клік — відновити.",
                  "Drag to resize. Double-click to reset.",
                )}
              />
            ) : null}
            <section
              id="mobile-ide-panel-code"
              className="ide-solution"
              aria-label={tr("Рішення", "Solution")}
            >
              <div className="ide-panel-bar ide-editor-bar">
                <span className="ide-code-label">
                  <Code2 className="size-4" />
                  {tr("Код", "Code")}
                </span>
                {!props.isWebTask ? (
                  <select
                    className="ide-language-select"
                    value={props.language}
                    onChange={(event) =>
                      props.onLanguageChange(
                        event.target.value as JudgeLanguage,
                      )
                    }
                    disabled={
                      props.disableLanguageChange ||
                      props.readOnly ||
                      busy ||
                      languageOptions.length < 2
                    }
                    aria-label={tr(
                      "Мова програмування",
                      "Programming language",
                    )}
                  >
                    {languageOptions.map((language) => (
                      <option key={language} value={language}>
                        {languageLabel(language)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="ide-code-label">HTML / CSS / JS</span>
                )}
                {!props.isWebTask ? (
                  <label className="ide-compiler-control">
                    <span className="ide-compiler-label">
                      {tr("Компілятор", "Compiler")}
                    </span>
                    <select
                      className="ide-language-select ide-compiler-select"
                      value={props.compiler}
                      onChange={(event) =>
                        props.onCompilerChange(event.target.value)
                      }
                      disabled={
                        props.disableLanguageChange ||
                        props.readOnly ||
                        busy ||
                        compilersForFamily(props.language).length < 2
                      }
                      aria-label={tr("Версія компілятора", "Compiler version")}
                    >
                      {compilersForFamily(props.language).map((compiler) => (
                        <option key={compiler.id} value={compiler.id}>
                          {compiler.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {props.readOnly ? (
                  <span className="ide-input-note">
                    {tr("Лише перегляд", "Read only")}
                  </span>
                ) : null}
                <span className="ml-auto ide-code-label hidden sm:flex">
                  {!props.useFiles
                    ? activeFile
                    : tr(
                        `Файлів: ${fileList.length}`,
                        `Files: ${fileList.length}`,
                      )}
                </span>
                <button
                  type="button"
                  className="ide-icon-btn"
                  onClick={() => setFocusMode((current) => !current)}
                  aria-label={
                    focusMode
                      ? tr("Показати панелі", "Show panels")
                      : tr("Розгорнути редактор", "Expand editor")
                  }
                  title={tr("Розгорнути редактор", "Expand editor")}
                >
                  {focusMode ? <Minimize2 /> : <Maximize2 />}
                </button>
              </div>
              {props.localRecovery ? (
                <div className="ide-recovery" role="status">
                  <span>
                    {tr(
                      "Знайдено незбережену локальну версію",
                      "A local unsaved version was found",
                    )}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="ide-btn"
                      onClick={props.localRecovery.onRecover}
                    >
                      {tr("Відновити", "Recover")}
                    </button>
                    <button
                      type="button"
                      className="ide-btn ide-btn-quiet"
                      onClick={props.localRecovery.onDismiss}
                    >
                      {tr("Ігнорувати", "Dismiss")}
                    </button>
                  </div>
                </div>
              ) : null}
              {props.actionRecovery ? (
                <div
                  className="ide-recovery"
                  data-error={props.actionRecovery.tone === "error"}
                  role="alert"
                >
                  <span>{props.actionRecovery.message}</span>
                  <button
                    type="button"
                    className="ide-btn"
                    onClick={props.actionRecovery.onRetry}
                    disabled={busy}
                  >
                    {props.actionRecovery.retryLabel}
                  </button>
                </div>
              ) : null}
              {props.useFiles || !simpleMode ? (
                <div
                  className="ide-file-tabs"
                  role="tablist"
                  aria-label={tr("Файли рішення", "Solution files")}
                >
                  {fileList.map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      className="ide-file-tab"
                      role="tab"
                      aria-selected={activeFile === file.path}
                      onClick={() => setActiveFile(file.path)}
                    >
                      <FileCode2 className="size-3.5" />
                      {file.path}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="ide-icon-btn"
                    disabled={props.readOnly || props.submitMode}
                    onClick={() => {
                      if (!props.useFiles) props.onEnableFiles();
                      setFileAddRequestToken((value) => value + 1);
                    }}
                    aria-label={tr("Додати файл", "Add file")}
                    title={tr("Додати файл", "Add file")}
                  >
                    <Plus />
                  </button>
                </div>
              ) : null}
              <div className="ide-editor" data-web={Boolean(props.isWebTask)}>
                <div className="ide-code-surface">
                  {isEmptyTask ? (
                    <div className="ide-empty-editor">
                      <h2>
                        {tr(
                          "Завдання ще не готове",
                          "The task is not ready yet",
                        )}
                      </h2>
                      <p>
                        {props.emptyStateMessage ||
                          tr(
                            "Вибери активну задачу, щоб почати писати код.",
                            "Choose an active problem to start coding.",
                          )}
                      </p>
                      {props.emptyStateAction}
                    </div>
                  ) : props.useFiles ? (
                    <MultiFileEditor
                      enableSemanticLsp={props.enableSemanticLsp}
                      language={props.isWebTask ? "html" : props.language}
                      entryFile={props.entryFile}
                      files={props.files}
                      onChange={props.onFilesChange}
                      readOnly={props.readOnly}
                      fontSize={fontSize}
                      wordWrap={wordWrap}
                      minimap={false}
                      activePath={activeFile}
                      onActivePathChange={setActiveFile}
                      hideTabs
                      hasUnsavedChanges={props.hasUnsavedChanges}
                      focusLine={compilerErrorLine}
                      requestAddToken={fileAddRequestToken}
                    />
                  ) : (
                    <PracticeCodeEditor
                      enableSemanticLsp={props.enableSemanticLsp}
                      taskId={props.task.id}
                      language={props.language}
                      value={props.code}
                      readOnly={Boolean(props.readOnly)}
                      fontSize={fontSize}
                      wordWrap={wordWrap}
                      isWebTask={Boolean(props.isWebTask)}
                      focusLine={compilerErrorLine}
                      onChange={handleCodeChange}
                      onEditorMount={props.onCodeEditorMount}
                    />
                  )}
                </div>
                {props.isWebTask && props.webPreviewFiles ? (
                  <div className="ide-code-surface border-l border-[var(--ide-border)]">
                    <WebPreviewPane
                      files={props.webPreviewFiles}
                      title={tr("Перегляд сторінки", "Page preview")}
                    />
                  </div>
                ) : null}
              </div>
              {showRunner ? (
                <>
                  <div
                    className="ide-resize ide-resize-horizontal"
                    onPointerDown={(event) => beginResize("bottom", event)}
                    onKeyDown={(event) => handleResizeKeyDown("bottom", event)}
                    onDoubleClick={() => updateLayout({ bottom: 240 })}
                    role="separator"
                    tabIndex={0}
                    aria-orientation="horizontal"
                    aria-label={tr(
                      "Змінити висоту результатів",
                      "Resize results",
                    )}
                    aria-valuemin={runnerBounds.min}
                    aria-valuemax={Math.round(runnerBounds.max)}
                    aria-valuenow={Math.round(runnerHeight)}
                  />
                  <section
                    className="ide-runner"
                    id="mobile-ide-panel-result"
                    aria-label={tr("Запуск та перевірка", "Run and check")}
                  >
                    <div className="ide-panel-bar ide-runner-bar">
                      <div
                        className="ide-runner-tabs"
                        role="tablist"
                        onKeyDown={handlePanelTabKeyDown}
                        aria-label={tr(
                          "Ввід та результати",
                          "Input and results",
                        )}
                      >
                        <BottomTabButton
                          active={bottomTab === "input"}
                          onClick={() => setBottomTab("input")}
                          icon={<Braces />}
                          label={tr("Ввід", "Input")}
                        />
                        <BottomTabButton
                          active={bottomTab === "terminal"}
                          onClick={() => setBottomTab("terminal")}
                          icon={<SquareTerminal />}
                          label={tr("Вивід", "Output")}
                        />
                        <BottomTabButton
                          active={bottomTab === "tests"}
                          onClick={() => setBottomTab("tests")}
                          icon={<TestTube2 />}
                          label={tr("Тести", "Tests")}
                        />
                      </div>
                      {bottomTab === "input" ? inputTools : null}
                      <button
                        type="button"
                        className="ide-icon-btn ide-desktop-control"
                        onClick={() => updateLayout({ bottomCollapsed: true })}
                        aria-label={tr(
                          "Згорнути результати",
                          "Collapse results",
                        )}
                        title={tr("Згорнути результати", "Collapse results")}
                      >
                        <ChevronDown />
                      </button>
                    </div>
                    <div id="ide-runner-panel" className="ide-runner-body">
                      {bottomTab === "input" ? renderInput() : renderBottom()}
                    </div>
                  </section>
                </>
              ) : (
                <button
                  type="button"
                  className="ide-btn ide-btn-quiet rounded-none"
                  onClick={() => {
                    setFocusMode(false);
                    updateLayout({ bottomCollapsed: false });
                  }}
                  aria-label={tr(
                    "Показати ввід та результати",
                    "Show input and results",
                  )}
                >
                  <ChevronDown className="rotate-180" />
                  {tr("Ввід та результати", "Input and results")}
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
      <div className="ide-mobile-actions">{runActions}</div>
      <footer className="ide-footer">
        <span>{tr(`Рядків: ${lineCount}`, `${lineCount} lines`)}</span>
        <span>UTF-8</span>
        <span>
          {tr("Код зберігається автоматично", "Code saves automatically")}
        </span>
        <span>
          {props.checkResult
            ? allTestsPassed
              ? tr("Розв’язок прийнято", "Solution accepted")
              : tr("Переглянь результат перевірки", "Review the check result")
            : tr("Пиши, запускай, перевіряй", "Write, run, check")}
        </span>
      </footer>
      {diffOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={tr("Порівняння коду", "Code comparison")}
        >
          <div className="flex max-h-[80dvh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-[var(--ide-border)] bg-[var(--ide-surface)]">
            <div className="ide-panel-bar">
              <h2>
                {tr(
                  "Поточний код і останній знімок",
                  "Current code and latest snapshot",
                )}
              </h2>
              <button
                type="button"
                className="ide-btn ml-auto"
                onClick={() => setDiffOpen(false)}
              >
                {tr("Закрити", "Close")}
              </button>
            </div>
            <div className="overflow-auto p-4 font-mono text-xs leading-6">
              {comparisonLines.slice(0, 500).map((row, index) => (
                <div
                  key={index}
                  className={
                    row.kind === "removed"
                      ? "text-[var(--ide-error)]"
                      : row.kind === "added"
                        ? "text-[var(--ide-accent)]"
                        : "text-[var(--ide-muted)]"
                  }
                >
                  <span className="mr-3 inline-block w-4">
                    {row.kind === "removed"
                      ? "−"
                      : row.kind === "added"
                        ? "+"
                        : " "}
                  </span>
                  {row.line || " "}
                </div>
              ))}
              {!comparisonLines.length
                ? tr(
                    "Немає знімка для порівняння.",
                    "No snapshot is available for comparison.",
                  )
                : null}
            </div>
          </div>
        </div>
      ) : null}
      {notice ? (
        <div className="ide-notice" role="status" aria-live="polite">
          {notice}
        </div>
      ) : null}
      <Modal
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title={tr("Відновити початковий код?", "Restore starter code?")}
        description={tr(
          "Поточні незбережені зміни буде втрачено.",
          "Your current unsaved changes will be lost.",
        )}
        showCloseButton={false}
        panelClassName="max-w-md"
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="touch"
            onClick={() => setResetConfirmOpen(false)}
          >
            {tr("Скасувати", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="touch"
            onClick={() => {
              setResetConfirmOpen(false);
              props.onReset();
            }}
          >
            {tr("Відновити код", "Restore code")}
          </Button>
        </div>
      </Modal>
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
    role="tab"
    aria-selected={active}
    tabIndex={active ? 0 : -1}
    aria-controls="ide-runner-panel"
    className="ide-tab"
    onClick={onClick}
  >
    {icon}
    {label}
  </button>
);

export default StudyCodIDEWorkspace;
