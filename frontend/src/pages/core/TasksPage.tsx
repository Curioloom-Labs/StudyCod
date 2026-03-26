import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listTasks, generateTask, saveDraft, submitTask, resetTopic, runTask, getWebTaskTemplate, saveWebTaskDraft, checkWebTask, submitWebTask, getPersonalControlQuiz, submitPersonalControlQuiz, type WebTaskFile, type PersonalControlQuizPayload, type PersonalControlQuizSubmitResponse } from "../../lib/api/tasks";
import { recordSuccessfulStudySession } from "../../lib/uiMode";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { CodeEditor } from "../../components/CodeEditor";
import { MultiFileEditor, type CodeFile } from "../../components/MultiFileEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { WebPreviewPane } from "../../components/WebPreviewPane";
import type { Task, User } from "../../types";
import { Play, CheckCircle2, ChevronLeft, ChevronRight, Plus, Save, PlayCircle, LayoutDashboard, FolderCode, TerminalSquare, Activity, PanelRightClose, PanelRightOpen, SquareArrowOutUpRight, FoldHorizontal, NotebookPen, ListTodo, GripVertical, Sparkles, type LucideIcon } from "lucide-react";
import { tr } from "../../i18n";
import { useTheoryModal } from "../../components/theory/TheoryModalProvider";
import { TaskGenerationOverlay, type TaskGenerationPhase } from "../../components/TaskGenerationOverlay";
import { useWorkspaceViewport } from "../../components/interface/WorkspaceViewport";
import { buildResumeState, loadResumeState, saveResumeState } from "../../lib/resumeState";
import { FailureRecoveryCard, type FailureRecoveryData } from "../../components/FailureRecoveryCard";
import { extractFirstExampleInput, normalizeStdinBeforeRun } from "../../utils/inputTextNormalization";
interface Props {
  user: User;
}

const textEncoder = new TextEncoder();

async function sha256HexBrowser(input: string): Promise<string> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(input));
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // fall through to lightweight fallback hash
  }
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `fnv-${(h >>> 0).toString(16)}`;
}

function createClientSubmissionId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

type BlockState = null | {
  mode: "low" | "weak";
  topicId: number;
  topicTitle: string;
  average: number;
  message: string;
};
type UIState = "idle" | "evaluating" | "success" | "error" | "logic-warning";
type LessonStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
type PracticeSegment = "task" | "io" | "constraints" | "examples" | "notes";
type CenterTab = "mission" | "hints" | "notes" | "activity";
type MissionBlock = "statement" | "editor";
type WorkspaceColumn = "tasks" | "center" | "console";
type WorkspaceArea = "mission" | "tasks" | "output" | "live";
type QuizReviewQuestion = NonNullable<PersonalControlQuizSubmitResponse["review"]>["questions"][number];
type TaskApiErrorLike = {
  message?: unknown;
  response?: {
    status?: unknown;
    data?: unknown;
    headers?: Record<string, unknown>;
  };
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

const isCodeFile = (value: unknown): value is CodeFile => {
  if (!value || typeof value !== "object") return false;
  const path = Reflect.get(value, "path");
  const content = Reflect.get(value, "content");
  return typeof path === "string" && typeof content === "string";
};

const toCodeFiles = (value: unknown): CodeFile[] => {
  if (!Array.isArray(value)) return [];
  return value.filter(isCodeFile);
};

const normalizeFiles = (value: CodeFile[]): CodeFile[] => {
  const byPath = new Map<string, string>();
  for (const f of value || []) {
    const p = String(f?.path ?? "").trim();
    if (!p) continue;
    byPath.set(p, String(f?.content ?? ""));
  }
  return Array.from(byPath.entries())
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
};

const toApiErrorLike = (value: unknown): TaskApiErrorLike | null => {
  if (!value || typeof value !== "object") return null;
  return value;
};

const parseTasksLayout = (raw: string): {
  columnOrder?: unknown;
  dockWidth?: unknown;
  dockCollapsed?: unknown;
  showTaskHistory?: unknown;
  missionBlockOrder?: unknown;
} | null => {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  return {
    columnOrder: Reflect.get(parsed, "columnOrder"),
    dockWidth: Reflect.get(parsed, "dockWidth"),
    dockCollapsed: Reflect.get(parsed, "dockCollapsed"),
    showTaskHistory: Reflect.get(parsed, "showTaskHistory"),
    missionBlockOrder: Reflect.get(parsed, "missionBlockOrder")
  };
};

const TASKS_LAYOUT_STORAGE_KEY = "studycod.tasks.layout.v1";

function isValidColumnOrder(value: unknown): value is Record<WorkspaceColumn, number> {
  if (!value || typeof value !== "object") return false;
  const t = Number(Reflect.get(value, "tasks"));
  const c = Number(Reflect.get(value, "center"));
  const o = Number(Reflect.get(value, "console"));
  const set = new Set([t, c, o]);
  return Number.isFinite(t) && Number.isFinite(c) && Number.isFinite(o) && set.size === 3;
}

function isValidMissionBlockOrder(value: unknown): value is MissionBlock[] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const set = new Set(value);
  return set.has("statement") && set.has("editor");
}

function splitPracticeByHeadings(markdown: string): Record<PracticeSegment, string> {
  const src = String(markdown || "");
  const lines = src.split(/\r?\n/);
  const sections: Record<PracticeSegment, string[]> = {
    task: [],
    io: [],
    constraints: [],
    examples: [],
    notes: []
  };

  let current: PracticeSegment = "task";
  for (const line of lines) {
    const low = line.toLowerCase();
    if (/^#{1,4}\s+/.test(line)) {
      if (/input|output|вхід|вихід/.test(low)) current = "io";
      else if (/constraint|обмеження/.test(low)) current = "constraints";
      else if (/example|приклад/.test(low)) current = "examples";
      else if (/note|примітка/.test(low)) current = "notes";
      else current = "task";
    }
    sections[current].push(line);
  }

  return {
    task: sections.task.join("\n").trim(),
    io: sections.io.join("\n").trim(),
    constraints: sections.constraints.join("\n").trim(),
    examples: sections.examples.join("\n").trim(),
    notes: sections.notes.join("\n").trim()
  };
}


function likelyPurePracticeMarkdown(content: string): boolean {
  const low = String(content || "").toLowerCase();
  const markers = [
    "input",
    "output",
    "constraints",
    "example",
    "вхід",
    "вихід",
    "обмеження",
    "приклад",
    "stdin",
    "stdout"
  ];
  const hits = markers.reduce((acc, marker) => acc + (low.includes(marker) ? 1 : 0), 0);
  return hits >= 2;
}
export const TasksPage: React.FC<Props> = ({
  user
}) => {
  const {
    i18n
  } = useTranslation();
  const uiLanguage = i18n.language === "en" ? "en" : "uk";
  const locale = i18n.language === "uk" ? "uk-UA" : "en-US";
  const { element: viewportEl } = useWorkspaceViewport();
  const {
    openTheory,
    isOpen: isTheoryOpen
  } = useTheoryModal();
  const safeServerMessage = (value: unknown) => {
    return typeof value === "string" ? value : String(value ?? "");
  };
  const formatApiError = (err: unknown) => {
    const apiErr = toApiErrorLike(err);
    const status = typeof apiErr?.response?.status === "number" ? apiErr.response.status : null;
    const data = apiErr?.response?.data;
    const dataObj = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    const dataText = typeof data === "string" ? data.trim() : "";
    const looksLikeHtml = dataText.length > 0 && /^\s*<html[\s>]/i.test(dataText);

    const retryAfterHeader = apiErr?.response?.headers?.["retry-after"];
    const retryAfterSecondsFromHeader = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    const retryAfterMsFromBody = Number((dataObj?.details as any)?.retryAfterMs ?? NaN);
    const retryAfterSeconds = Number.isFinite(retryAfterSecondsFromHeader) ? retryAfterSecondsFromHeader : Number.isFinite(retryAfterMsFromBody) ? Math.ceil(retryAfterMsFromBody / 1000) : null;

    if (status === 429) {
      const wait = retryAfterSeconds && retryAfterSeconds > 0 ? tr(`Спробуйте ще раз через ${retryAfterSeconds} с.`, `Try again in ${retryAfterSeconds}s.`) : tr("Спробуйте ще раз трохи пізніше.", "Please try again a bit later.");
      const isAi429 = !!(dataObj?.details as any)?.mode;
      const isGlobalRateLimit = String(dataObj?.message ?? "") === "RATE_LIMIT";
      if (isGlobalRateLimit) {
        return tr("Занадто багато запитів до сервера. ", "Too many requests to the server. ") + wait;
      }
      if (isAi429) {
        return tr("Занадто багато запитів (обмеження AI). ", "Too many requests (AI rate limit). ") + wait;
      }
      return tr("Занадто багато запитів. ", "Too many requests. ") + wait;
    }

    if (status === 504) {
      return tr(
        "Сервер перевищив час очікування (504). Зазвичай це таймаут між Nginx і backend під час генерації AI. Спробуйте ще раз через кілька секунд.",
        "Server timed out (504). This is usually an Nginx-to-backend timeout during AI generation. Please try again in a few seconds."
      );
    }

    // Prefer server-provided message; Axios' default message is usually unhelpful.
    const serverMsg = safeServerMessage(dataObj?.message ?? dataObj?.error ?? "").trim();
    if (serverMsg.toUpperCase().includes("AI_GENERATION_FAILED")) {
      return tr("AI тимчасово недоступний. Спробуйте ще раз трохи пізніше.", "AI is temporarily unavailable. Please try again a bit later.");
    }
    if (looksLikeHtml && status && status >= 500) {
      return tr(
        "Сервер тимчасово недоступний або перевищив таймаут. Спробуйте ще раз трохи пізніше.",
        "Server is temporarily unavailable or timed out. Please try again a bit later."
      );
    }
    const axiosMsg = safeServerMessage(apiErr?.message ?? "").trim();
    const cleanedAxiosMsg = /^request failed with status code\s+\d+$/i.test(axiosMsg) ? "" : axiosMsg;
    const msg = serverMsg || cleanedAxiosMsg || safeServerMessage(data ?? "");
    const statusText = status ? `HTTP ${status}` : "";
    if (msg && statusText) return `${statusText}: ${msg}`;
    return msg || statusText || tr("Невідома помилка", "Unknown error");
  };

  const errorKindLabel = (kind?: string | null): string | null => {
    if (!kind) return null;
    switch (kind) {
      case "compile":
        return tr("Компіляція", "Compilation");
      case "syntax":
        return tr("Синтаксис", "Syntax");
      case "type":
        return tr("Типи", "Types");
      case "name":
        return tr("Назва", "Name");
      case "index":
        return tr("Індекс", "Index");
      case "key":
        return tr("Ключ", "Key");
      case "value":
        return tr("Значення", "Value");
      case "zero_division":
        return tr("Ділення на нуль", "Division by zero");
      case "null":
        return tr("Null", "Null");
      case "oom":
        return tr("Пам’ять", "Memory");
      case "timeout":
        return tr("Час", "Time");
      case "runtime":
        return tr("Виконання", "Runtime");
      default:
        return kind;
    }
  };
  const splitLegacyDescription = (content: string): {
    theory: string | null;
    practice: string | null;
  } => {
    const trimmed = (content || "").trim();
    if (!trimmed) return {
      theory: null,
      practice: null
    };
    const practiceSeparator = /^###\s*(Практика|Practice)\b/im;
    const m = practiceSeparator.exec(trimmed);
    if (!m || typeof m.index !== "number") {
      if (likelyPurePracticeMarkdown(trimmed)) {
        return {
          theory: null,
          practice: trimmed
        };
      }
      return {
        theory: trimmed,
        practice: null
      };
    }
    const theory = trimmed.slice(0, m.index).trim();
    const after = trimmed.slice(m.index).trim();
    const practice = after.replace(/^###\s*(Практика|Practice)\b\s*/i, "").trim();
    return {
      theory: theory || null,
      practice: practice || null
    };
  };
  const getTheoryMarkdown = (t: Task | null): string => {
    if (!t) return "";
    const direct = (t.theoryMarkdown || "").trim();
    if (direct) return direct;
    const legacyTheory = splitLegacyDescription(t.descriptionMarkdown || "").theory || "";
    if (legacyTheory.trim()) return legacyTheory;

    // Safety net: for the first task in a topic flow we should always start from
    // the theory step. If backend theory is temporarily missing, show a clear
    // placeholder instead of skipping straight to practice.
    const isFirstInTopic = Number(t.lessonInTopic) === 1;
    if (isFirstInTopic && t.kind === "TOPIC") {
      return tr(
        "## Теорія\n\n_Теорія для цієї теми зараз недоступна. Спробуй оновити сторінку або звернись до викладача/адміністратора._",
        "## Theory\n\n_Theory for this topic is currently unavailable. Try refreshing the page or contact your teacher/administrator._"
      );
    }

    return "";
  };
  const getPracticeText = (t: Task | null): string => {
    if (!t) return "";
    const direct = (t.practiceText || "").trim();
    if (direct) return direct;
    return splitLegacyDescription(t.descriptionMarkdown || "").practice || "";
  };
  const computeHasTheory = (t: Task | null) => {
    return getTheoryMarkdown(t).trim().length > 0;
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [active, setActive] = useState<Task | null>(null);
  const [code, setCode] = useState("");
  const [useFiles, setUseFiles] = useState(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [mfAddToken, setMfAddToken] = useState(0);
  const [consoleOutput, setConsoleOutput] = useState("");
  const [stdin, setStdin] = useState("");
  const [loading, setLoading] = useState(false);
  const [generationPhase, setGenerationPhase] = useState<TaskGenerationPhase | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [personalQuiz, setPersonalQuiz] = useState<PersonalControlQuizPayload | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, string>>({});
  const [quizReview, setQuizReview] = useState<QuizReviewQuestion[] | null>(null);
  const [quizSummary, setQuizSummary] = useState<PersonalControlQuizSubmitResponse["summary"] | null>(null);
  const [generateCooldownUntilMs, setGenerateCooldownUntilMs] = useState<number>(0);
  const [clockMs, setClockMs] = useState<number>(() => Date.now());
  const [editorOpen, setEditorOpen] = useState<boolean>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("studycod_tasks_editor_open") : null;
    if (saved === "1") return true;
    if (saved === "0") return false;
    return (user.userMode ?? "PERSONAL") !== "PERSONAL";
  });
  const [blockState, setBlockState] = useState<BlockState>(null);
  const [aiResult, setAiResult] = useState<{
    gradingMode?: "TESTS" | "AI";
    total: number;
    workScore: number;
    optimizationScore: number;
    integrityScore: number;
    aiFeedback: string;
    aiUnavailableFallback?: boolean;
    comparisonFeedback?: string | null;
    previousGrade?: number | null;
    testsPassed?: number;
    testsTotal?: number;
    hints?: string[];
    testResults?: Array<{
      testId: number;
      input?: string;
      expectedOutput?: string;
      actualOutput?: string;
      passed: boolean;
      error?: string | null;
      verdict?: string | null;
      errorKind?: string | null;
    }>;
    learningFeedback?: {
      verdict?: string | null;
      firstFailure?: FailureRecoveryData | null;
    };
    submissionMeta?: {
      submissionId: string;
      clientSubmissionId?: string | null;
      codeHash: string;
    };
  } | null>(null);

  const latestSubmitRequestSeq = useRef(0);
  const latestSubmissionBindingRef = useRef<{
    submissionId?: string;
    codeHash: string;
  } | null>(null);

  const [revealedHints, setRevealedHints] = useState(0);
  const [theoryAcknowledged, setTheoryAcknowledged] = useState(false);
  const [showTaskHistory, setShowTaskHistory] = useState(true);
  const [uiState, setUIState] = useState<UIState>("idle");
  const [milestone, setMilestone] = useState<{
    type: string;
    message: string;
    previousAverage?: number;
    currentAverage?: number;
  } | null>(null);
  const [activeCenterTab, setActiveCenterTab] = useState<CenterTab>("mission");
  const [activeSegment, setActiveSegment] = useState<PracticeSegment>("task");
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [personalNotes, setPersonalNotes] = useState("");
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [dockPopOut, setDockPopOut] = useState(false);
  const [dockWidth, setDockWidth] = useState(400);
  const [columnOrder, setColumnOrder] = useState<Record<WorkspaceColumn, number>>({ tasks: 1, center: 2, console: 3 });
  const [draggingColumn, setDraggingColumn] = useState<WorkspaceColumn | null>(null);
  const [missionBlockOrder, setMissionBlockOrder] = useState<MissionBlock[]>(["statement", "editor"]);
  const [draggingMissionBlock, setDraggingMissionBlock] = useState<MissionBlock | null>(null);
  const tasksColumnRef = useRef<HTMLDivElement | null>(null);
  const centerColumnRef = useRef<HTMLDivElement | null>(null);
  const consoleColumnRef = useRef<HTMLDivElement | null>(null);
  const quizScrollRef = useRef<HTMLDivElement | null>(null);
  const lessonStatus: LessonStatus = (() => {
    if (tasks.length === 0) return "NOT_STARTED";
    const hasUnfinished = tasks.some(t => t.status !== "GRADED");
    return hasUnfinished ? "IN_PROGRESS" : "COMPLETED";
  })();
  const canGenerateNew = lessonStatus === "COMPLETED";
  const canGenerateFirst = lessonStatus === "NOT_STARTED";
  const canGenerate = canGenerateFirst || canGenerateNew;
  const cooldownSecondsLeft = Math.max(0, Math.ceil((generateCooldownUntilMs - clockMs) / 1000));

  const entryFile = user.course === "JAVA" ? "Main.java" : user.course === "PYTHON" ? "main.py" : "main.cpp";
  const isWebTask = active?.taskMode === "WEB";
  const isPersonalControlQuizByTask = useCallback((task: Task | null | undefined): boolean => {
    return Boolean(task && task.kind === "CONTROL" && String(task.subtitle ?? "").includes("|QUIZ|"));
  }, []);
  const isPersonalControlPracticeByTask = useCallback((task: Task | null | undefined): boolean => {
    return Boolean(task && task.kind === "CONTROL" && String(task.subtitle ?? "").includes("|PRACTICE|"));
  }, []);
  const isPersonalControlQuizTask = isPersonalControlQuizByTask(active);

  const getControlBatchKey = useCallback((task: Task | null | undefined): string | null => {
    if (!task || task.kind !== "CONTROL") return null;
    const subtitle = String(task.subtitle ?? "").trim();
    if (!subtitle.startsWith("PCW:")) return null;
    const key = subtitle.split("|")[0] || "";
    return key.startsWith("PCW:") ? key : null;
  }, []);

  const controlBatchTitleFromKey = useCallback((key: string): string => {
    const parts = String(key).split(":");
    const range = parts[2] || "?";
    return tr(`Контрольна (${range})`, `Control (${range})`);
  }, []);

  const getQuizDraftStorageKey = useCallback((taskId: number): string => {
    return `studycod.quiz.answers.${user.id}.${taskId}`;
  }, [user.id]);

  const loadQuizDraftAnswers = useCallback((taskId: number, quiz: PersonalControlQuizPayload): Record<number, string> => {
    try {
      const raw = localStorage.getItem(getQuizDraftStorageKey(taskId));
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return {};
      const allowed = new Map<number, Set<string>>();
      for (const q of quiz.questions || []) {
        allowed.set(q.index, new Set(Object.keys(q.options || {})));
      }
      const restored: Record<number, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        const idx = Number(k);
        const label = String(v ?? "").trim();
        if (!Number.isFinite(idx) || !label) continue;
        const opts = allowed.get(idx);
        if (!opts || !opts.has(label)) continue;
        restored[idx] = label;
      }
      return restored;
    } catch {
      return {};
    }
  }, [getQuizDraftStorageKey]);

  const persistQuizDraftAnswers = useCallback((taskId: number, answers: Record<number, string>): void => {
    try {
      localStorage.setItem(getQuizDraftStorageKey(taskId), JSON.stringify(answers));
    } catch {
      // ignore storage errors
    }
  }, [getQuizDraftStorageKey]);

  const clearQuizDraftAnswers = useCallback((taskId: number): void => {
    try {
      localStorage.removeItem(getQuizDraftStorageKey(taskId));
    } catch {
      // ignore storage errors
    }
  }, [getQuizDraftStorageKey]);

  const focusFirstUnansweredQuizQuestion = useCallback((quizData?: PersonalControlQuizPayload | null, answersData?: Record<number, string>) => {
    const quiz = quizData ?? null;
    if (!quiz || !Array.isArray(quiz.questions) || quiz.questions.length === 0) return;
    const answers = answersData ?? {};
    const firstUnanswered = [...quiz.questions]
      .sort((a, b) => a.index - b.index)
      .find((q) => !String(answers[q.index] ?? "").trim());
    if (!firstUnanswered) return;
    const el = document.getElementById(`quiz-q-${firstUnanswered.index}`) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    try {
      el.focus({ preventScroll: true });
    } catch {
      // no-op
    }
  }, []);

  const handleQuizWheelCapture = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!isPersonalControlQuizTask) return;
    const el = quizScrollRef.current;
    if (!el) return;
    const deltaY = Number(event.deltaY || 0);
    if (!deltaY) return;

    const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    const canScrollUp = el.scrollTop > 0;
    if ((deltaY > 0 && canScrollDown) || (deltaY < 0 && canScrollUp)) {
      event.preventDefault();
      event.stopPropagation();
      el.scrollTop += deltaY;
    }
  }, [isPersonalControlQuizTask]);

  const handleSaveQuizAnswers = useCallback((silent = false) => {
    if (!active || !isPersonalControlQuizTask || !personalQuiz) return;
    persistQuizDraftAnswers(active.id, quizAnswers);
    if (!silent) {
      const answered = Object.values(quizAnswers).filter((v) => String(v ?? "").trim().length > 0).length;
      setConsoleOutput(
        tr(
          `Відповіді збережено: ${answered}/${personalQuiz.questions.length}`,
          `Answers saved: ${answered}/${personalQuiz.questions.length}`
        )
      );
      setUIState("idle");
    }
  }, [active?.id, isPersonalControlQuizTask, personalQuiz, quizAnswers, persistQuizDraftAnswers]);
  const toWebTaskFiles = useCallback((): WebTaskFile[] => {
    const source = useFiles ? files : [{ path: "index.html", content: code } as CodeFile];
    const byPath = new Map<string, string>();
    for (const f of source || []) {
      byPath.set(String(f.path ?? "").trim(), String(f.content ?? ""));
    }
    const defaults = Array.isArray(active?.webTemplateFiles) ? active.webTemplateFiles : [];
    for (const d of defaults) {
      const p = String(d.path ?? "").trim();
      if (!byPath.has(p)) byPath.set(p, String(d.content ?? ""));
    }
    return [
      { path: "index.html", content: byPath.get("index.html") ?? "" },
      { path: "styles.css", content: byPath.get("styles.css") ?? "" },
      { path: "script.js", content: byPath.get("script.js") ?? "" }
    ];
  }, [active?.webTemplateFiles, useFiles, files, code]);
  const entryContentFromFiles = (fs: CodeFile[]): string => {
    const hit = fs.find(f => f.path === entryFile);
    return hit?.content ?? "";
  };

  const deriveEditorFromTask = (t: Task): { useFiles: boolean; files: CodeFile[]; code: string } => {
    if (t.taskMode === "WEB") {
      const wf = Array.isArray(t.webTemplateFiles) ? t.webTemplateFiles.map(f => ({ path: String(f.path), content: String(f.content ?? "") })) : [];
      const normalized = normalizeFiles(wf as CodeFile[]);
      const initial = normalized.length ? normalized : [
        { path: "index.html", content: "" },
        { path: "styles.css", content: "" },
        { path: "script.js", content: "" }
      ];
      return {
        useFiles: true,
        files: initial,
        code: initial.find(f => f.path === "index.html")?.content ?? ""
      };
    }
    const f = toCodeFiles(Array.isArray(t.userFiles) && t.userFiles.length ? t.userFiles : Array.isArray(t.starterFiles) && t.starterFiles.length ? t.starterFiles : []);
    const codeSingle = t.status === "GRADED" && t.finalCode ? t.finalCode : t.userCode && t.userCode.trim() ? t.userCode : t.starterCode;
    const resolvedUseFiles = f.length > 0;
    const resolvedCode = resolvedUseFiles ? entryContentFromFiles(f) : codeSingle;
    return { useFiles: resolvedUseFiles, files: f, code: resolvedCode };
  };

  const currentCodeText = useFiles ? entryContentFromFiles(files) : code;
  const segmentedPractice = useMemo(() => splitPracticeByHeadings(getPracticeText(active)), [active?.id, active?.practiceText, active?.descriptionMarkdown]);
  const fullPracticeText = useMemo(() => getPracticeText(active), [active?.id, active?.practiceText, active?.descriptionMarkdown]);
  const firstExampleInput = useMemo(() => {
    const fromExamples = extractFirstExampleInput(segmentedPractice.examples || "");
    if (fromExamples) return fromExamples;
    return extractFirstExampleInput(fullPracticeText);
  }, [segmentedPractice.examples, fullPracticeText]);
  const nonContestHints = useMemo(() => {
    const direct = Array.isArray(aiResult?.hints) ? aiResult!.hints!.filter(Boolean) : [];
    if (direct.length > 0) return direct;

    const hints: string[] = [];
    if (active?.kind === "CONTROL") {
      hints.push(tr("Почни з найпростішого випадку й перевір типи даних.", "Start from the simplest case and verify your data types."));
    }
    if (active?.status !== "GRADED") {
      hints.push(tr("Спершу напиши мінімальне робоче рішення, потім оптимізуй.", "Write a minimal working solution first, then optimize."));
    }
    hints.push(tr("Прогони на крайових випадках: 0, 1, мін/макс межі, порожній ввід.", "Test edge cases: 0, 1, min/max bounds, and empty input."));
    hints.push(tr("Звір формат виводу: зайві пробіли/переноси часто ламають тести.", "Verify output format: extra spaces/newlines often break tests."));
    return hints;
  }, [aiResult?.hints, active?.id, active?.kind, active?.status]);

  const activeId = active?.id ?? null;
  const resumeStep = useMemo(() => {
    if (!active) return undefined;
    const hasTheory = computeHasTheory(active);
    if (hasTheory && !theoryAcknowledged) return "theory";
    return "solve";
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown, theoryAcknowledged]);

  const saveResume = useCallback(
    (scrollTop?: number) => {
      if (activeId == null) return;
      saveResumeState(
        buildResumeState({
          userId: user.id,
          kind: "personal_task",
          taskId: activeId,
          step: resumeStep,
          scrollTop,
          draftKey: `personal_task_${activeId}`
        })
      );
    },
    [user.id, activeId, resumeStep]
  );

  const restoredForTaskRef = useRef<number | null>(null);

  useEffect(() => {
    if (!viewportEl) return;
    if (!active) return;
    if (restoredForTaskRef.current === active.id) return;
    const state = loadResumeState(user.id);
    if (state?.kind !== "personal_task" || state.taskId !== active.id) return;
    if (typeof state.scrollTop !== "number") return;

    restoredForTaskRef.current = active.id;
    requestAnimationFrame(() => {
      try {
        viewportEl.scrollTop = state.scrollTop ?? 0;
      } catch {
        // ignore
      }
    });
  }, [viewportEl, user.id, activeId]);

  useEffect(() => {
    if (!viewportEl) return;
    if (!active) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        saveResume(viewportEl.scrollTop);
      });
    };

    viewportEl.addEventListener("scroll", onScroll, { passive: true });
    // save once on attach (captures active + step even if user doesn't scroll)
    saveResume(viewportEl.scrollTop);
    return () => {
      viewportEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      saveResume(viewportEl.scrollTop);
    };
  }, [viewportEl, activeId, saveResume]);

  useEffect(() => {
    // Save when cognitive step changes even if scroll doesn't.
    saveResume(viewportEl?.scrollTop);
  }, [activeId, resumeStep]);

  useEffect(() => {
    if (!activeId) {
      setPersonalNotes("");
      return;
    }
    try {
      setPersonalNotes(localStorage.getItem(`studycod.personal.notes.${activeId}`) ?? "");
    } catch {
      setPersonalNotes("");
    }
  }, [activeId]);

  useEffect(() => {
    setActiveSegment("task");
  }, [active?.id]);

  useEffect(() => {
    if (!activeId) return;
    try {
      localStorage.setItem(`studycod.personal.notes.${activeId}`, personalNotes);
    } catch {
      // ignore
    }
  }, [activeId, personalNotes]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TASKS_LAYOUT_STORAGE_KEY);
      if (!raw) return;
      const parsed = parseTasksLayout(raw);
      if (!parsed) return;

      if (isValidColumnOrder(parsed.columnOrder)) {
        setColumnOrder(parsed.columnOrder);
      }

      const width = Number(parsed.dockWidth);
      if (Number.isFinite(width)) {
        setDockWidth(Math.min(560, Math.max(300, width)));
      }

      if (typeof parsed.dockCollapsed === "boolean") {
        setDockCollapsed(parsed.dockCollapsed);
      }

      if (typeof parsed.showTaskHistory === "boolean") {
        setShowTaskHistory(parsed.showTaskHistory);
      }

      if (isValidMissionBlockOrder(parsed.missionBlockOrder)) {
        setMissionBlockOrder(parsed.missionBlockOrder);
      }
    } catch {
      // ignore malformed saved layout
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        TASKS_LAYOUT_STORAGE_KEY,
        JSON.stringify({
          columnOrder,
          dockWidth,
          dockCollapsed,
          showTaskHistory,
          missionBlockOrder
        })
      );
    } catch {
      // ignore storage errors
    }
  }, [columnOrder, dockWidth, dockCollapsed, showTaskHistory, missionBlockOrder]);

  const startDockResize = (event: React.MouseEvent<HTMLDivElement>, edge: "left" | "right") => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dockWidth;
    const onMove = (e: MouseEvent) => {
      const delta = edge === "left" ? startX - e.clientX : e.clientX - startX;
      const next = Math.min(560, Math.max(300, startWidth + delta));
      setDockWidth(next);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const moveMissionBlock = useCallback((from: MissionBlock, to: MissionBlock) => {
    if (from === to) return;
    setMissionBlockOrder((prev) => {
      const fromIdx = prev.indexOf(from);
      const toIdx = prev.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [item] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, item);
      return copy;
    });
  }, []);

  const swapColumns = useCallback((from: WorkspaceColumn, to: WorkspaceColumn) => {
    if (from === to) return;
    setColumnOrder((prev) => {
      const next = { ...prev };
      const fromOrder = prev[from];
      next[from] = prev[to];
      next[to] = fromOrder;
      return next;
    });
  }, []);

  const handleColumnDrop = useCallback((target: WorkspaceColumn) => {
    if (!draggingColumn) return;
    swapColumns(draggingColumn, target);
    setDraggingColumn(null);
  }, [draggingColumn, swapColumns]);

  const consoleResizeEdge: "left" | "right" = columnOrder.console > columnOrder.center ? "left" : "right";
  const consoleResizerOrder = consoleResizeEdge === "left" ? columnOrder.console - 0.1 : columnOrder.console + 0.1;

  useEffect(() => {
    if (cooldownSecondsLeft <= 0) return;
    const id = setInterval(() => setClockMs(Date.now()), 500);
    return () => clearInterval(id);
  }, [cooldownSecondsLeft]);

  const getRetryAfterSeconds = (err: unknown): number | null => {
    const apiErr = toApiErrorLike(err);
    const header = apiErr?.response?.headers?.["retry-after"];
    const sHeader = header ? Number(header) : NaN;
    if (Number.isFinite(sHeader) && sHeader > 0) return Math.ceil(sHeader);
    const responseData = asRecord(apiErr?.response?.data);
    const details = asRecord(responseData?.details);
    const msBody = Number(details?.retryAfterMs ?? NaN);
    if (Number.isFinite(msBody) && msBody > 0) return Math.ceil(msBody / 1000);
    return null;
  };
  const blockedReason = (() => {
    if (lessonStatus !== "IN_PROGRESS") return null;
    const unfinished = tasks.find(t => t.status !== "GRADED");
    if (!unfinished) return tr("Є незавершене завдання", "There is an unfinished task");
    const label = unfinished.status === "SUBMITTED" ? tr("на перевірці", "submitted") : tr("відкрите", "open");
    return tr(`Заверши поточне завдання (${label}), щоб згенерувати нове.`, `Finish the current task (${label}) to generate a new one.`);
  })();

  const sidebarTasks = useMemo(() => {
    type SidebarTaskItem = {
      id: string;
      openTask: Task;
      renderTitle: string;
      stageLabel: string | null;
      createdAt: string;
      status: Task["status"];
      batchKey: string | null;
      isGroupedControl: boolean;
    };

    const grouped = new Map<string, Task[]>();
    for (const t of tasks) {
      const batchKey = getControlBatchKey(t);
      if (!batchKey) continue;
      if (!grouped.has(batchKey)) grouped.set(batchKey, []);
      grouped.get(batchKey)!.push(t);
    }

    const out: SidebarTaskItem[] = [];
    const seenBatch = new Set<string>();
    for (const t of tasks) {
      const batchKey = getControlBatchKey(t);
      if (!batchKey) {
        out.push({
          id: `task:${t.id}`,
          openTask: t,
          renderTitle: t.title,
          stageLabel: null,
          createdAt: t.createdAt,
          status: t.status,
          batchKey: null,
          isGroupedControl: false
        });
        continue;
      }

      if (seenBatch.has(batchKey)) continue;
      seenBatch.add(batchKey);

      const items = grouped.get(batchKey) || [];
      const pending = items.find((x) => x.status !== "GRADED");
      const representative = pending || items[0] || t;
      const repSubtitle = String(representative.subtitle ?? "");
      const stageLabel = (() => {
        if (repSubtitle.includes("|QUIZ|")) return tr("Етап: тест", "Stage: quiz");
        const m = repSubtitle.match(/\|PRACTICE\|(\d+)/);
        if (m) {
          const n = Number(m[1]);
          const safeN = Number.isFinite(n) ? Math.max(1, Math.min(3, Math.floor(n))) : 1;
          return tr(`Етап: практика ${safeN}/3`, `Stage: practice ${safeN}/3`);
        }
        if (items.length > 0 && items.every((x) => x.status === "GRADED")) {
          return tr("Етап: завершено", "Stage: completed");
        }
        return null;
      })();
      out.push({
        id: `batch:${batchKey}`,
        openTask: representative,
        renderTitle: controlBatchTitleFromKey(batchKey),
        stageLabel,
        createdAt: representative.createdAt,
        status: representative.status,
        batchKey,
        isGroupedControl: true
      });
    }

    return out;
  }, [tasks, getControlBatchKey, controlBatchTitleFromKey]);

  const sidebarSections = useMemo(() => {
    const byTopic = new Map<string, { title: string; items: typeof sidebarTasks }>();

    for (const item of sidebarTasks) {
      const rawTopicTitle = String(item.openTask.topicTitle ?? "").trim();
      const topicTitle = rawTopicTitle || tr("Без теми", "No topic");
      const topicId = Number(item.openTask.topicId ?? 0);
      const topicKey = Number.isFinite(topicId) && topicId > 0 ? `topic:${topicId}` : `topic-title:${topicTitle.toLowerCase()}`;

      if (!byTopic.has(topicKey)) {
        byTopic.set(topicKey, { title: topicTitle, items: [] as typeof sidebarTasks });
      }
      byTopic.get(topicKey)!.items.push(item);
    }

    const sections = Array.from(byTopic.entries()).map(([key, section]) => {
      const sortedItems = [...section.items].sort((a, b) => {
        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      });
      return { key, title: section.title, items: sortedItems };
    });

    return sections.sort((a, b) => {
      const ta = a.items.length ? new Date(a.items[0].createdAt).getTime() : 0;
      const tb = b.items.length ? new Date(b.items[0].createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [sidebarTasks, i18n.language]);

  const isSidebarItemActive = useCallback((item: { openTask: Task; batchKey: string | null }) => {
    if (!active) return false;
    if (!item.batchKey) return active.id === item.openTask.id;
    return getControlBatchKey(active) === item.batchKey;
  }, [active, getControlBatchKey]);

  const openSidebarTask = useCallback((task: Task) => {
    setActive(task);
    const next = deriveEditorFromTask(task);
    setUseFiles(next.useFiles);
    setFiles(next.files);
    setCode(next.code);
    setAiResult(null);
    setConsoleOutput("");
    setUIState("idle");
    const hasTheory = computeHasTheory(task);
    setTheoryAcknowledged(!hasTheory);
  }, [deriveEditorFromTask]);

  useEffect(() => {
    try {
      localStorage.setItem("studycod_tasks_editor_open", editorOpen ? "1" : "0");
    } catch {}
  }, [editorOpen]);
  const reloadTasks = useCallback(async (selectLast = false) => {
    const data = await listTasks(uiLanguage);
    const filtered = data.filter(t => true);
    setTasks(filtered);
    const currentActiveId = active?.id;
    const currentAiResult = aiResult;
    if (selectLast && filtered.length) {
      const latest = filtered[0];
      setActive(latest);
      const next = deriveEditorFromTask(latest);
      setUseFiles(next.useFiles);
      setFiles(next.files);
      setCode(next.code);
      setAiResult(null);
      setRevealedHints(0);
      setConsoleOutput("");
      const hasTheory = computeHasTheory(latest);
      setTheoryAcknowledged(!hasTheory);
    } else if (active) {
      const updated = filtered.find(t => t.id === active.id);
      if (updated) {
        setActive(updated);
        if (!currentAiResult || currentAiResult.total >= 50) {
          const next = deriveEditorFromTask(updated);
          setUseFiles(next.useFiles);
          setFiles(next.files);
          setCode(next.code);
        }
      } else {
        setActive(null);
        setCode("");
        setUseFiles(false);
        setFiles([]);
        setAiResult(null);
        setRevealedHints(0);
      }
    }
  }, [active?.id, aiResult?.total, uiLanguage]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = await listTasks(uiLanguage);
        if (mounted) {
          const filtered = data.filter(t => true);
          setTasks(filtered);
          if (filtered.length > 0 && !active) {
            const firstTask = filtered[0];
            setActive(firstTask);
            const next = deriveEditorFromTask(firstTask);
            setUseFiles(next.useFiles);
            setFiles(next.files);
            setCode(next.code);
            const hasTheory = computeHasTheory(firstTask);
            setTheoryAcknowledged(!hasTheory);
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        const text = formatApiError(err);
        setConsoleOutput(`${tr("Помилка завантаження завдань:", "Failed to load tasks:")} ${text}\n` + tr("Якщо бачиш HTML замість JSON — перевір Nginx проксі для /api/* і чи працює backend.", "If you see HTML instead of JSON — check Nginx proxy for /api/* and that the backend is running."));
        setUIState("error");
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [uiLanguage]);
  useEffect(() => {
    if (tasks.length > 0 && !active) {
      const openTaskId = sessionStorage.getItem("openTaskId");
      let taskToOpen = tasks[0];

      const resume = loadResumeState(user.id);
      const preferredId = (() => {
        if (openTaskId) {
          const v = parseInt(openTaskId, 10);
          return Number.isFinite(v) ? v : null;
        }
        if (resume?.kind === "personal_task" && typeof resume.taskId === "number") {
          return resume.taskId;
        }
        return null;
      })();

      if (preferredId != null) {
        const foundTask = tasks.find(t => t.id === preferredId);
        if (foundTask) taskToOpen = foundTask;
      }
      if (openTaskId) sessionStorage.removeItem("openTaskId");

      setActive(taskToOpen);
      const next = deriveEditorFromTask(taskToOpen);
      setUseFiles(next.useFiles);
      setFiles(next.files);
      setCode(next.code);
      const hasTheory = computeHasTheory(taskToOpen);
      setTheoryAcknowledged(!hasTheory);
    }
  }, [tasks.length, active]);
  useEffect(() => {
    if (active) {
      const hasTheory = computeHasTheory(active);
      setTheoryAcknowledged(!hasTheory);
    } else {
      setTheoryAcknowledged(false);
    }
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown]);
  useEffect(() => {
    if (!active) return;
    const theory = getTheoryMarkdown(active);
    if (!theory) return;
    if (theoryAcknowledged) return;
    if (isTheoryOpen) return;
    openTheory({
      title: tr("Теорія", "Theory"),
      markdown: theory,
      acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
      onAcknowledge: () => setTheoryAcknowledged(true)
    });
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown, theoryAcknowledged, isTheoryOpen, openTheory]);
  useEffect(() => {
    if (!active || !theoryAcknowledged || currentCodeText.trim() === "") return;
    const isEditable = active.status !== "GRADED" || aiResult && aiResult.total < 6;
    if (!isEditable) return;
    const interval = setInterval(() => {
      if (active && currentCodeText.trim() !== "" && (active.status !== "GRADED" || aiResult && aiResult.total < 6)) {
        if (active.taskMode === "WEB") {
          saveWebTaskDraft(active.id, toWebTaskFiles()).catch(() => undefined);
        } else {
          const payload = useFiles ? { files } : currentCodeText;
          saveDraft(active.id, payload).catch(() => undefined);
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [active, currentCodeText, theoryAcknowledged, aiResult, useFiles, files, toWebTaskFiles]);

  useEffect(() => {
    if (!active || active.taskMode !== "WEB") return;
    getWebTaskTemplate(active.id)
      .then((tpl) => {
        const normalized = normalizeFiles((tpl.files || []) as unknown as CodeFile[]);
        if (normalized.length) {
          setUseFiles(true);
          setFiles(normalized);
          setCode(normalized.find(f => f.path === "index.html")?.content ?? "");
        }
      })
      .catch(() => {
        // keep local/default files
      });
  }, [active?.id, active?.taskMode]);

  useEffect(() => {
    if (!active || !isPersonalControlQuizTask) {
      setPersonalQuiz(null);
      setQuizAnswers({});
      setQuizReview(null);
      setQuizSummary(null);
      setQuizLoading(false);
      setQuizSubmitting(false);
      return;
    }

    let cancelled = false;
    setQuizLoading(true);
    setQuizReview(null);
    setQuizSummary(null);
    getPersonalControlQuiz(active.id)
      .then((data) => {
        if (cancelled) return;
        setPersonalQuiz(data);
        const restored = loadQuizDraftAnswers(active.id, data);
        setQuizAnswers(restored);
        requestAnimationFrame(() => focusFirstUnansweredQuizQuestion(data, restored));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiErr = toApiErrorLike(err);
        const status = Number(apiErr?.response?.status ?? 0);
        const text = formatApiError(err);
        setConsoleOutput(`${tr("Помилка завантаження тесту:", "Quiz load error:")} ${text}`);
        setUIState(status === 429 ? "logic-warning" : "error");
      })
      .finally(() => {
        if (!cancelled) setQuizLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [active?.id, isPersonalControlQuizTask, loadQuizDraftAnswers]);

  useEffect(() => {
    if (!active || !isPersonalControlQuizTask || !personalQuiz) return;
    if (quizReview) return;
    persistQuizDraftAnswers(active.id, quizAnswers);
  }, [active?.id, isPersonalControlQuizTask, personalQuiz, quizAnswers, quizReview, persistQuizDraftAnswers]);
  const handleGenerate = async () => {
    let closeDelayMs = 0;
    if (cooldownSecondsLeft > 0) {
      setConsoleOutput(tr(`Зачекай ${cooldownSecondsLeft} с і спробуй ще раз.`, `Wait ${cooldownSecondsLeft}s and try again.`));
      setUIState("logic-warning");
      return;
    }
    if (!canGenerate) {
      setConsoleOutput(blockedReason ?? tr("Спочатку заверши поточне завдання.", "Finish the current task first."));
      setUIState("logic-warning");
      return;
    }
    setLoading(true);
    setGenerationPhase("requesting");
    setAiResult(null);
    setConsoleOutput("");
    setUIState("idle");
    try {
      setGenerationPhase("generating");
      const res = await generateTask(uiLanguage);
      const payload = asRecord(res);
      const status = String(payload?.status ?? "");
      if (status === "ok" && payload?.task && typeof payload.task === "object") {
        const newTask = payload.task as Task;
        setGenerationPhase("syncing");
        const newTasks = await listTasks(uiLanguage);
        setTasks(newTasks);
        setGenerationPhase("opening");
        setActive(newTask);
        setCode(newTask.starterCode);
        setAiResult(null);
        setConsoleOutput("");
        const hasTheory = computeHasTheory(newTask);
        setTheoryAcknowledged(!hasTheory);
        setGenerationPhase("finishing");
        if (hasTheory) {
          const theory = getTheoryMarkdown(newTask);
          if (theory) {
            openTheory({
              title: tr("Теорія", "Theory"),
              markdown: theory,
              acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
              onAcknowledge: () => setTheoryAcknowledged(true)
            });
          }
        }
      } else if (status === "blocked" || status === "warn") {
        setBlockState({
          mode: status === "blocked" ? "low" : "weak",
          topicId: Number(payload?.topicId ?? 0),
          topicTitle: String(payload?.topicTitle ?? tr("(невідома тема)", "(unknown topic)")),
          average: Number(payload?.average ?? 0),
          message: String(payload?.message ?? "")
        });
        setUIState(status === "blocked" ? "logic-warning" : "logic-warning");
      }
    } catch (error: unknown) {
      const apiErr = toApiErrorLike(error);
      const errorResponse = asRecord(apiErr?.response?.data);
      if (apiErr?.response?.status === 401 || apiErr?.message === "UNAUTHORIZED" || String(apiErr?.message || "").toUpperCase().includes("UNAUTHORIZED")) {
        setGenerationPhase("error");
        closeDelayMs = 800;
        setConsoleOutput(`${tr("Помилка:", "Error:")} ${tr("Сесія недійсна або ви не увійшли.", "Session is invalid or you are not signed in.")}\n${tr("Будь ласка, увійдіть в систему.", "Please sign in.")}`);
        setUIState("error");
        return;
      }
      if (apiErr?.response?.status === 429) {
        setGenerationPhase("error");
        closeDelayMs = 800;
        const retryAfterSeconds = getRetryAfterSeconds(error) ?? 10;
        setGenerateCooldownUntilMs(Date.now() + Math.max(1, retryAfterSeconds) * 1000);
        const text = formatApiError(error);
        setConsoleOutput(`${tr("Помилка генерації завдання:", "Task generation error:")} ${text}`);
        setUIState("logic-warning");
        return;
      }
      if (String(errorResponse?.status ?? "") === "blocked") {
        const er = errorResponse ?? {};
        setBlockState({
          mode: "low",
          topicId: Number(er.topicId ?? er.taskId ?? 0),
          topicTitle: String(er.topicTitle ?? tr("(невідома тема)", "(unknown topic)")),
          average: Number(er.average ?? 0),
          message: String(er.message ?? "")
        });
        setUIState("logic-warning");
        return;
      }
      setGenerationPhase("error");
      closeDelayMs = 800;
      const text = formatApiError(error);
      setConsoleOutput(`${tr("Помилка генерації завдання:", "Task generation error:")} ${text}`);
      setUIState("error");
    } finally {
      if (closeDelayMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, closeDelayMs));
      }
      setGenerationPhase(null);
      setLoading(false);
    }
  };
  const handleSubmit = async () => {
    if (!active) return;
    if (isPersonalControlQuizTask) {
      if (!personalQuiz || quizLoading) {
        setConsoleOutput(tr("Тест ще завантажується. Зачекай декілька секунд.", "Quiz is still loading. Please wait a few seconds."));
        setUIState("logic-warning");
        return;
      }
      const orderedAnswers = personalQuiz.questions
        .sort((a, b) => a.index - b.index)
        .map((q) => String(quizAnswers[q.index] ?? "").trim());
      if (orderedAnswers.some((a) => !a)) {
        setConsoleOutput(tr("Дай відповідь на всі питання перед відправкою.", "Answer all questions before submitting."));
        setUIState("logic-warning");
        focusFirstUnansweredQuizQuestion(personalQuiz, quizAnswers);
        return;
      }

      setQuizSubmitting(true);
      setConsoleOutput(tr("Відправка тесту...", "Submitting quiz..."));
      try {
        const resp = await submitPersonalControlQuiz(active.id, orderedAnswers);
        const grade = resp.grade;
        const total = typeof grade?.total === "number" ? grade.total : 0;
        const result = {
          gradingMode: "TESTS" as const,
          total,
          workScore: 0,
          optimizationScore: 0,
          integrityScore: 0,
          aiFeedback: tr(
            `Тест завершено: ${grade?.correctAnswers ?? 0}/${grade?.totalQuestions ?? 0}. Оцінка: ${total}`,
            `Quiz completed: ${grade?.correctAnswers ?? 0}/${grade?.totalQuestions ?? 0}. Grade: ${total}`
          ),
          comparisonFeedback: null,
          previousGrade: null,
          testsPassed: grade?.correctAnswers,
          testsTotal: grade?.totalQuestions,
          score: grade?.correctAnswers,
          maxScore: grade?.totalQuestions,
          groupScores: undefined,
          hints: undefined,
          testResults: undefined,
          learningFeedback: undefined,
          submissionMeta: undefined,
        };
        setAiResult(result);
        setQuizReview(resp.review?.questions ?? null);
        setQuizSummary(resp.summary ?? null);
        clearQuizDraftAnswers(active.id);
        let autoGeneratedPracticeId: number | null = null;
        let autoGenerateHint = "";
        try {
          const gen = await generateTask(uiLanguage);
          const payload = asRecord(gen);
          if (String(payload?.status ?? "") === "ok" && payload?.task && typeof payload.task === "object") {
            autoGeneratedPracticeId = Number((payload.task as Record<string, unknown>).id ?? 0) || null;
          }
        } catch (genErr: unknown) {
          const apiErr = toApiErrorLike(genErr);
          if (Number(apiErr?.response?.status ?? 0) === 429) {
            autoGenerateHint = tr(" Наступна практика стане доступною через декілька секунд (cooldown).", " Next practice will be available in a few seconds (cooldown).");
          } else {
            autoGenerateHint = tr(" Не вдалося автоматично згенерувати практику — натисни «Згенерувати».", " Could not auto-generate practice — click Generate.");
          }
        }

        setConsoleOutput(result.aiFeedback + autoGenerateHint);
        setUIState(total >= 75 ? "success" : total >= 50 ? "idle" : "error");

        const updatedTasks = await listTasks(uiLanguage);
        setTasks(updatedTasks.filter(t => true));
        if (autoGeneratedPracticeId) {
          const nextPractice = updatedTasks.find(t => t.id === autoGeneratedPracticeId);
          if (nextPractice) {
            setActive(nextPractice);
            const next = deriveEditorFromTask(nextPractice);
            setUseFiles(next.useFiles);
            setFiles(next.files);
            setCode(next.code);
            const hasTheory = computeHasTheory(nextPractice);
            setTheoryAcknowledged(!hasTheory);
          }
        } else {
          const updated = updatedTasks.find(t => t.id === active.id);
          if (updated) setActive(updated);
        }
      } catch (err: unknown) {
        const text = formatApiError(err);
        setConsoleOutput(`${tr("Помилка відправлення тесту:", "Quiz submit error:")} ${text}`);
        setUIState("error");
      } finally {
        setQuizSubmitting(false);
      }
      return;
    }

    const submitSeq = ++latestSubmitRequestSeq.current;
    setSubmitting(true);
    setAiResult(null);
    setRevealedHints(0);
    setUIState("evaluating");
    setConsoleOutput(tr("Оцінювання...", "Evaluating..."));
    try {
      if (active.taskMode === "WEB") {
        const checked = await checkWebTask(active.id, toWebTaskFiles());
        const submitted = await submitWebTask(active.id, toWebTaskFiles());
        if (submitSeq !== latestSubmitRequestSeq.current) {
          return;
        }
        const gradeTotal = typeof submitted.grade?.total === "number"
          ? Number(submitted.grade.total)
          : checked.maxScore > 0
            ? Math.round((checked.score / checked.maxScore) * 12)
            : 0;
        const result = {
          gradingMode: "TESTS" as const,
          total: gradeTotal,
          workScore: 0,
          optimizationScore: 0,
          integrityScore: 0,
          aiFeedback: tr(`WEB перевірка: ${checked.passedRules}/${checked.totalRules}.`, `WEB check: ${checked.passedRules}/${checked.totalRules}.`),
          comparisonFeedback: null,
          previousGrade: null,
          testsPassed: checked.passedRules,
          testsTotal: checked.totalRules,
          score: checked.score,
          maxScore: checked.maxScore,
          groupScores: undefined,
          hints: undefined,
          testResults: checked.results.map((r, idx) => ({
            testId: idx + 1,
            passed: r.passed,
            verdict: r.passed ? "AC" : "WA",
            error: r.passed ? null : r.message,
            errorKind: null
          })),
          learningFeedback: undefined,
          submissionMeta: submitted.submissionMeta
        };
        setConsoleOutput(tr(`WEB перевірка завершена: ${checked.passedRules}/${checked.totalRules}. Оцінка: ${gradeTotal}`, `WEB check completed: ${checked.passedRules}/${checked.totalRules}. Grade: ${gradeTotal}`));
        setAiResult(result);
        setRevealedHints(0);
        setUIState(gradeTotal >= 75 ? "success" : gradeTotal >= 50 ? "idle" : "error");
        const updatedTasks = await listTasks(uiLanguage);
        setTasks(updatedTasks.filter(t => true));
        const updated = updatedTasks.find(t => t.id === active.id);
        if (updated) setActive(updated);
        return;
      }
      const payload = useFiles ? { files } : code;
      const clientSubmissionId = createClientSubmissionId();
      const codeHash = await sha256HexBrowser(useFiles ? JSON.stringify(files) : String(code ?? ""));
      latestSubmissionBindingRef.current = { codeHash, submissionId: undefined };
      const res = await submitTask(active.id, payload, { clientSubmissionId, codeHash });
      if (submitSeq !== latestSubmitRequestSeq.current) {
        return;
      }
      let result: {
        gradingMode?: "TESTS" | "AI";
        total: number;
        workScore: number;
        optimizationScore: number;
        integrityScore: number;
        aiFeedback: string;
        aiUnavailableFallback?: boolean;
        comparisonFeedback: string | null;
        previousGrade: number | null;
        testsPassed?: number;
        testsTotal?: number;
        score?: number;
        maxScore?: number;
        groupScores?: Array<{
          group: string;
          score: number;
          maxScore: number;
        }>;
        hints?: string[];
        testResults?: Array<{
          testId: number;
          input?: string;
          expectedOutput?: string;
          actualOutput?: string;
          passed: boolean;
          error?: string | null;
          verdict?: string | null;
          errorKind?: string | null;
        }>;
        learningFeedback?: {
          verdict?: string | null;
          firstFailure?: FailureRecoveryData | null;
        };
        submissionMeta?: {
          submissionId: string;
          clientSubmissionId?: string | null;
          codeHash: string;
        };
      } | null = null;
      if (res.grade) {
        const grade = res.grade;
        const responseSubmissionMeta = res.submissionMeta;
        if (responseSubmissionMeta?.submissionId && responseSubmissionMeta?.codeHash) {
          latestSubmissionBindingRef.current = {
            submissionId: String(responseSubmissionMeta.submissionId),
            codeHash: String(responseSubmissionMeta.codeHash)
          };
        }
        result = {
          gradingMode: grade.gradingMode,
          total: Number(grade.total ?? 0),
          workScore: Number(grade.workScore ?? 0),
          optimizationScore: Number(grade.optimizationScore ?? 0),
          integrityScore: Number(grade.integrityScore ?? 0),
          aiFeedback: grade.aiFeedback ?? "",
          aiUnavailableFallback: Boolean(grade.aiUnavailableFallback),
          comparisonFeedback: grade.comparisonFeedback ?? null,
          previousGrade: grade.previousGrade ?? null,
          testsPassed: grade.testsPassed ?? undefined,
          testsTotal: grade.testsTotal ?? undefined,
          score: typeof grade.score === "number" ? Number(grade.score) : undefined,
          maxScore: typeof grade.maxScore === "number" ? Number(grade.maxScore) : undefined,
          groupScores: Array.isArray(grade.groupScores) ? grade.groupScores : undefined,
          hints: Array.isArray(grade.hints) ? grade.hints : undefined,
          testResults: grade.testResults ?? undefined,
          learningFeedback: res.learningFeedback,
          submissionMeta: responseSubmissionMeta
        };
        const outputText = result.gradingMode === "TESTS" ? tr(`Перевірка завершена: ${result.testsPassed ?? 0}/${result.testsTotal ?? 0}. Оцінка: ${result.total}`, `Check completed: ${result.testsPassed ?? 0}/${result.testsTotal ?? 0}. Grade: ${result.total}`) : tr(`Перевірка завершена. Оцінка: ${result.total}`, `Check completed. Grade: ${result.total}`);
        setConsoleOutput(outputText);
        setAiResult(result);
        setRevealedHints(0);
        setUIState(result.total >= 75 ? "success" : result.total >= 50 ? "idle" : "error");

        // Count as a successful study session when the user reaches a passing grade.
        if (result.total >= 50) {
          recordSuccessfulStudySession({
            kind: "personal_task_submit",
            taskId: active.id
          });
        }
        if (res.milestone && typeof res.milestone === "object") {
          const m = res.milestone as { type?: unknown; message?: unknown; previousAverage?: unknown; currentAverage?: unknown };
          if (typeof m.type === "string" && typeof m.message === "string") {
            setMilestone({
              type: m.type,
              message: m.message,
              previousAverage: typeof m.previousAverage === "number" ? m.previousAverage : undefined,
              currentAverage: typeof m.currentAverage === "number" ? m.currentAverage : undefined
            });
          }
        }
      }
      const updatedTasks = await listTasks(uiLanguage);
      let effectiveTasks = updatedTasks.filter(t => true);

      const activeSubtitle = String(active?.subtitle ?? "");
      const activeBatchPrefix = activeSubtitle.startsWith("PCW:") ? (activeSubtitle.split("|")[0] || "") : "";
      const shouldAutoGenerateNextPractice = isPersonalControlPracticeByTask(active) && !!activeBatchPrefix;
      if (shouldAutoGenerateNextPractice) {
        const batchTasks = effectiveTasks.filter(t => t.kind === "CONTROL" && String(t.subtitle ?? "").startsWith(activeBatchPrefix));
        const batchPractice = batchTasks.filter(t => String(t.subtitle ?? "").includes("|PRACTICE|"));
        const hasPendingPractice = batchPractice.some(t => t.status !== "GRADED");

        if (!hasPendingPractice && batchPractice.length < 3) {
          try {
            const gen = await generateTask(uiLanguage);
            const payload = asRecord(gen);
            if (String(payload?.status ?? "") === "ok" && payload?.task && typeof payload.task === "object") {
              const refreshed = await listTasks(uiLanguage);
              effectiveTasks = refreshed.filter(t => true);
            }
          } catch {
            // no-op: user can always click Generate manually
          }
        }
      }

      setTasks(effectiveTasks);
      if (active) {
        const updated = effectiveTasks.find(t => t.id === active.id);
        if (updated) {
          setActive(updated);
        }
      }
    } catch (err: unknown) {
      console.error("Submit error:", err);
      const apiErr = toApiErrorLike(err);
      const responseObj = asRecord(apiErr?.response?.data);
      const raw = safeServerMessage(responseObj?.message ?? apiErr?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка відправлення:", "Submit error:")}${raw ? ` ${raw}` : ""}`);
      setUIState("error");
    } finally {
      if (submitSeq === latestSubmitRequestSeq.current) {
        setSubmitting(false);
      }
    }
  };

  const handleFixErrorRetryTopic = async () => {
    // Match GradesPage “Перепройти тему”: reset the whole topic, then navigate/reload tasks.
    const topicIdRaw = active?.topicId ?? null;
    const topicId = typeof topicIdRaw === "number" ? topicIdRaw : typeof topicIdRaw === "string" ? Number(topicIdRaw) : null;
    if (!topicId || !Number.isFinite(topicId)) {
      // Fallback to old behavior when topic info is unavailable.
      setAiResult(null);
      setConsoleOutput("");
      setUIState("idle");
      return;
    }
    try {
      setSubmitting(true);
      setUIState("evaluating");
      setConsoleOutput(tr("Перезапуск теми...", "Retrying topic..."));
      await resetTopic(topicId);
      setAiResult(null);
      setRevealedHints(0);
      setConsoleOutput("");
      setUIState("idle");
      setEditorOpen(true);
      await reloadTasks(true);
    } catch (err) {
      console.error("Failed to reset topic from Fix error:", err);
      setConsoleOutput(tr("Не вдалося перепройти тему. Спробуйте ще раз.", "Failed to retry the topic. Please try again."));
      setUIState("error");
    } finally {
      setSubmitting(false);
    }
  };
  const canEdit = active && theoryAcknowledged && (active.status !== "GRADED" || aiResult && aiResult.total < 6);

  const requestCreateFile = () => {
    if (!active) return;
    if (!canEdit) {
      setConsoleOutput(tr("Завдання зараз недоступне для редагування.", "Task is read-only right now."));
      setUIState("logic-warning");
      return;
    }

    if (!editorOpen) setEditorOpen(true);

    if (!useFiles) {
      setUseFiles(true);
      setFiles([{ path: entryFile, content: code }]);
    }

    // Trigger opening the "Add file" modal inside MultiFileEditor.
    setMfAddToken(v => v + 1);
  };
  const handleSaveDraft = async () => {
    if (!active || (!isWebTask && !currentCodeText.trim())) return;
    try {
      if (active.taskMode === "WEB") {
        await saveWebTaskDraft(active.id, toWebTaskFiles());
      } else {
        const payload = useFiles ? { files } : currentCodeText;
        await saveDraft(active.id, payload);
      }
      setConsoleOutput(tr("Чернетку збережено", "Draft saved"));
    } catch (err: unknown) {
      const apiErr = toApiErrorLike(err);
      const responseObj = asRecord(apiErr?.response?.data);
      const raw = safeServerMessage(responseObj?.message ?? apiErr?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка збереження:", "Save error:")}${raw ? ` ${raw}` : ""}`);
    }
  };
  const handleRun = async () => {
    if (!active || (!isWebTask && !currentCodeText.trim())) return;
    if (isPersonalControlQuizTask) {
      setConsoleOutput(tr("Для тесту натисни «Перевірити» після вибору всіх відповідей.", "For quiz tasks, click Check after choosing all answers."));
      setUIState("idle");
      return;
    }
    if (active.taskMode === "WEB") {
      setConsoleOutput(tr("Превʼю оновлено в блоці редактора.", "Preview refreshed in the editor panel."));
      setUIState("idle");
      return;
    }
    setUIState("evaluating");
    setConsoleOutput(tr("Запуск...", "Running..."));
    try {
      const payload = useFiles ? { files } : currentCodeText;
      const runInput = normalizeStdinBeforeRun(stdin || "");
      const res = await runTask(active.id, payload, runInput);
      setConsoleOutput(res.output || res.stderr || tr("Вивід відсутній", "No output"));
      setUIState("idle");
    } catch (err: unknown) {
      const apiErr = toApiErrorLike(err);
      const responseObj = asRecord(apiErr?.response?.data);
      const raw = safeServerMessage(responseObj?.message ?? apiErr?.message ?? String(err));
      setConsoleOutput(`${tr("Помилка запуску:", "Run error:")}${raw ? ` ${raw}` : ""}`);
      setUIState("error");
    }
  };
  const focusWorkspaceArea = (area: "mission" | "tasks" | "output" | "live") => {
    if (area === "tasks") {
      setShowTaskHistory(true);
      tasksColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      return;
    }
    if (area === "output") {
      setDockPopOut(false);
      setDockCollapsed(false);
      consoleColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      return;
    }
    setActiveCenterTab(area === "live" ? "activity" : "mission");
    centerColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };

  const isRailItemActive = (id: "mission" | "tasks" | "output" | "live") => {
    if (id === "tasks") return showTaskHistory;
    if (id === "output") return !dockCollapsed || dockPopOut;
    if (id === "live") return activeCenterTab === "activity";
    return activeCenterTab === "mission";
  };

  const canQuickGenerate = canGenerate && !loading && cooldownSecondsLeft <= 0;
  const canQuickSave = Boolean(active && (isPersonalControlQuizTask ? true : currentCodeText.trim()));
  const canQuickRun = Boolean(active && theoryAcknowledged && currentCodeText.trim());
  const canQuickCheck = Boolean(canEdit && !submitting && theoryAcknowledged && currentCodeText.trim());
  const hasTheoryForActive = computeHasTheory(active);

  const runFromRail = () => {
    if (!editorOpen) {
      setEditorOpen(true);
      return;
    }
    handleRun();
  };

  const checkFromRail = () => {
    if (!editorOpen) {
      setEditorOpen(true);
      return;
    }
    handleSubmit();
  };

  const saveFromRail = () => {
    if (isPersonalControlQuizTask) {
      handleSaveQuizAnswers();
      return;
    }
    if (!editorOpen) {
      setEditorOpen(true);
      return;
    }
    handleSaveDraft();
  };
  const railItems: Array<{ id: WorkspaceArea; label: string; Icon: LucideIcon }> = [
    { id: "mission", label: tr("Місія", "Mission"), Icon: LayoutDashboard },
    { id: "tasks", label: tr("Задачі", "Tasks"), Icon: FolderCode },
    { id: "output", label: tr("Вивід", "Output"), Icon: TerminalSquare },
    { id: "live", label: tr("Активність", "Activity"), Icon: Activity }
  ];
  const centerTabItems: Array<[CenterTab, string, LucideIcon]> = [
    ["mission", tr("Місія", "Mission"), FolderCode],
    ["hints", tr("Хінти", "Hints"), Sparkles],
    ["notes", tr("Нотатки", "Notes"), NotebookPen],
    ["activity", tr("Активність", "Activity"), ListTodo]
  ];
  const practiceTabItems: Array<[PracticeSegment, string]> = [
    ["task", tr("Завдання", "Task")],
    ["io", tr("Ввід/Вивід", "Input/Output")],
    ["constraints", tr("Обмеження", "Constraints")],
    ["examples", tr("Приклади", "Examples")],
    ["notes", tr("Нотатки", "Notes")]
  ];

    return <div className={`relative w-full px-3 pb-3 ${isPersonalControlQuizTask ? "min-h-[calc(100dvh-3rem)]" : "h-[calc(100dvh-3rem)] min-h-[760px]"}`}>
      <div className={`${isPersonalControlQuizTask ? "min-h-[calc(100dvh-3rem)] overflow-visible" : "h-full overflow-hidden"} rounded-3xl bg-[linear-gradient(150deg,#0c0f17_0%,#0f111a_46%,#0b0d14_100%)] border border-border/60 shadow-[0_24px_70px_rgba(0,0,0,0.48)] flex`}>
        <aside className="w-[58px] border-r border-border/60 bg-bg-surface/70 flex flex-col items-center py-3 gap-2">
          {railItems.map(item => (
            <div key={item.id} className="group relative">
              <button
                onClick={() => focusWorkspaceArea(item.id)}
                title={item.label}
                aria-label={item.label}
                className={`w-10 h-10 rounded-xl border transition-fast flex items-center justify-center ${isRailItemActive(item.id) ? "border-primary/50 bg-primary/10 text-primary" : "border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary"}`}
              >
                <item.Icon className="w-4 h-4" />
              </button>
              <div className="absolute left-[48px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 transition-fast whitespace-nowrap z-20">
                {item.label}
              </div>
            </div>
          ))}

          <div className="w-8 h-px bg-border/80 my-1" />

          {[
            {
              id: "generate",
              label: tr("Згенерувати", "Generate"),
              Icon: Plus,
              onClick: handleGenerate,
              enabled: canQuickGenerate,
              hint: !canGenerate
                ? blockedReason ?? tr("Спочатку заверши поточне завдання", "Finish the current task first")
                : cooldownSecondsLeft > 0
                  ? tr(`Доступно через ${cooldownSecondsLeft} с`, `Available in ${cooldownSecondsLeft}s`)
                  : undefined
            },
            {
              id: "save",
              label: tr("Зберегти", "Save"),
              Icon: Save,
              onClick: saveFromRail,
              enabled: canQuickSave
            },
            {
              id: "run",
              label: tr("Запустити", "Run"),
              Icon: PlayCircle,
              onClick: runFromRail,
              enabled: canQuickRun
            },
            {
              id: "check",
              label: tr("Перевірити", "Check"),
              Icon: CheckCircle2,
              onClick: checkFromRail,
              enabled: canQuickCheck
            },
            {
              id: "theory",
              label: tr("Теорія", "Theory"),
              Icon: NotebookPen,
              onClick: () => {
                if (!active || !hasTheoryForActive) return;
                setTheoryAcknowledged(false);
                const theory = getTheoryMarkdown(active);
                if (!theory) return;
                openTheory({
                  title: tr("Теорія", "Theory"),
                  markdown: theory,
                  acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
                  onAcknowledge: () => setTheoryAcknowledged(true)
                });
              },
              enabled: Boolean(active && hasTheoryForActive)
            }
          ].map(action => (
            <div key={action.id} className="group relative">
              <button
                onClick={action.onClick}
                disabled={!action.enabled}
                title={action.hint || action.label}
                aria-label={action.label}
                className={`w-10 h-10 rounded-xl border transition-fast flex items-center justify-center ${action.enabled ? "border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary" : "border-transparent text-text-muted/40 cursor-not-allowed"}`}
              >
                <action.Icon className="w-4 h-4" />
              </button>
              <div className="absolute left-[48px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 transition-fast whitespace-nowrap z-20">
                {action.label}
              </div>
            </div>
          ))}
        </aside>

        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="h-10 border-b border-border/60 bg-bg-surface/60 px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2 py-1 rounded-lg border border-border bg-bg-base text-text-primary">{tr("Personal Workspace", "Personal Workspace")}</span>
              <span className="px-2 py-1 rounded-lg border border-border text-text-secondary">{tr("IDE режим", "IDE mode")}</span>
              <span className="px-2 py-1 rounded-lg border border-border text-text-secondary">{tr("Mission control", "Mission control")}</span>
            </div>
            <div className="text-[11px] text-text-secondary">
              {tr("Стан уроку", "Lesson state")}: <span className="text-text-primary">{lessonStatus}</span>
            </div>
          </div>

          <div className="flex-1 min-h-0">
            <div className="flex-1 min-h-0 flex flex-col bg-bg-base">

      <TaskGenerationOverlay open={loading} phase={generationPhase} />

      {}
      <div className="flex-1 min-h-0 flex overflow-x-hidden">
        {}
        <div
          ref={tasksColumnRef}
          style={{ order: columnOrder.tasks }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleColumnDrop("tasks")}
          className={`bg-bg-surface border-r border-border transition-slow ease-in-out flex flex-col ${showTaskHistory ? "w-[280px]" : "w-12"}`}
        >
          <div className="flex items-center justify-between p-3 border-b border-border">
            {showTaskHistory && <h2 className="text-sm font-mono text-text-primary">{tr("Завдання", "Tasks")}</h2>}
            <div className="flex items-center gap-1 ml-auto">
              <span
                draggable
                onDragStart={() => setDraggingColumn("tasks")}
                onDragEnd={() => setDraggingColumn(null)}
                className="w-6 h-6 border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast cursor-grab"
                title={tr("Перетягни колонку", "Drag column")}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <button onClick={() => setShowTaskHistory(!showTaskHistory)} className="w-6 h-6 border border-border flex items-center justify-center hover:bg-bg-hover transition-fast">
              {showTaskHistory ? <ChevronLeft className="w-3 h-3 text-text-secondary" /> : <ChevronRight className="w-3 h-3 text-text-secondary" />}
              </button>
            </div>
          </div>
          {showTaskHistory && <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {sidebarTasks.length === 0 && <div className="space-y-3">
                    <div className="text-xs text-text-muted font-mono text-center py-4">
                      {tr("Немає завдань", "No tasks")}
                    </div>
                    <Button variant="primary" onClick={handleGenerate} disabled={loading || !canGenerate || cooldownSecondsLeft > 0} className="w-full text-sm px-4 py-2 flex items-center justify-center gap-2" title={!canGenerate ? blockedReason ?? undefined : cooldownSecondsLeft > 0 ? tr(`Зачекай ${cooldownSecondsLeft} с`, `Wait ${cooldownSecondsLeft}s`) : undefined}>
                      <Plus className="w-4 h-4" />
                      {tr("Згенерувати завдання", "Generate task")}
                    </Button>
                    {cooldownSecondsLeft > 0 && <div className="mt-2 text-[10px] font-mono text-text-muted text-center">
                        {tr(`Доступно через ${cooldownSecondsLeft} с`, `Available in ${cooldownSecondsLeft}s`)}
                      </div>}
                    {lessonStatus !== "NOT_STARTED" && <div className="text-[10px] font-mono text-text-muted text-center">
                        {tr(`Статус уроку: ${lessonStatus}`, `Lesson status: ${lessonStatus}`)}
                      </div>}
                  </div>}
                {sidebarTasks.length > 0 && sidebarSections.map(section => (
                  <div key={section.key} className="space-y-1.5">
                    <div className="px-1 pb-1 pt-2 text-[10px] font-mono uppercase tracking-wider text-text-muted border-b border-border/60">
                      {section.title}
                    </div>
                    {section.items.map(item => <div key={item.id} className={`p-3 cursor-pointer border transition-fast bg-bg-surface ${isSidebarItemActive(item) ? "border-primary bg-bg-hover" : "border-border hover:border-primary/50"}`} onClick={() => {
                        openSidebarTask(item.openTask);
                      }}>
                        {item.isGroupedControl ? <div className="mb-1 inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono text-primary">
                            {tr("Control work", "Control work")}
                          </div> : isPersonalControlQuizByTask(item.openTask) ? <div className="mb-1 inline-flex items-center rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono text-primary">
                            {tr("Quiz step", "Quiz step")}
                          </div> : null}
                        <div className="flex justify-between items-start mb-1">
                          <div className="text-xs font-mono text-text-primary truncate flex-1">
                            {item.renderTitle}
                          </div>
                          <Badge color={item.status === "GRADED" ? "success" : item.status === "SUBMITTED" ? "info" : "warn"}>
                            {item.status === "GRADED" ? "✓" : item.status === "SUBMITTED" ? "…" : "○"}
                          </Badge>
                        </div>
                        {item.stageLabel ? <div className="text-[10px] font-mono text-text-secondary mb-1">
                            {item.stageLabel}
                          </div> : null}
                        <div className="text-[10px] font-mono text-text-muted">
                          {new Date(item.createdAt).toLocaleDateString(locale)}
                        </div>
                      </div>)}
                  </div>
                ))}
              </div>
              {}
              {active && <div className="p-3 border-t border-border">
                  <Button variant="primary" onClick={handleGenerate} disabled={loading || !canGenerateNew || cooldownSecondsLeft > 0} className="w-full text-sm px-4 py-2 flex items-center justify-center gap-2" title={!canGenerateNew ? blockedReason ?? tr("Заборонено: урок ще не завершено", "Disabled: lesson is not completed") : cooldownSecondsLeft > 0 ? tr(`Зачекай ${cooldownSecondsLeft} с`, `Wait ${cooldownSecondsLeft}s`) : undefined}>
                    <Plus className="w-4 h-4" />
                    {tr("Згенерувати нове", "Generate new")}
                  </Button>
                  <div className="mt-2 text-[10px] font-mono text-text-muted text-center">
                    {tr(`Статус уроку: ${lessonStatus}`, `Lesson status: ${lessonStatus}`)}
                    {blockedReason ? <div className="mt-1">{blockedReason}</div> : null}
                    {cooldownSecondsLeft > 0 ? <div className="mt-1">{tr(`Доступно через ${cooldownSecondsLeft} с`, `Available in ${cooldownSecondsLeft}s`)}</div> : null}
                  </div>
                </div>}
            </div>}
      </div>

        {}
        <div
          ref={centerColumnRef}
          style={{ order: columnOrder.center }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleColumnDrop("center")}
          className={`flex-1 min-h-0 flex flex-col ${isPersonalControlQuizTask ? "overflow-visible" : "overflow-hidden"}`}
        >
          <div className="h-11 border-b border-border/60 bg-bg-surface/65 px-2 flex items-end justify-between gap-2 overflow-auto">
            <div className="flex items-end gap-1 overflow-auto">
            {centerTabItems.map(([id, label, Icon]) => (
              <button
                key={id}
                onClick={() => setActiveCenterTab(id)}
                className={`h-9 mb-1 rounded-t-xl border border-b-0 px-3 flex items-center gap-2 text-xs ${activeCenterTab === id ? "border-border bg-bg-base text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-hover/70"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            </div>
            <span
              draggable
              onDragStart={() => setDraggingColumn("center")}
              onDragEnd={() => setDraggingColumn(null)}
              className="mb-1 w-7 h-7 rounded-md border border-border flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast cursor-grab flex-shrink-0"
              title={tr("Перетягни колонку", "Drag column")}
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          </div>

        {activeCenterTab === "mission" ? (active ? <>
              {}
              <div className="border-b border-border bg-bg-surface p-4 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                <div>
                    <h1 className="text-lg font-mono text-text-primary mb-1">{active.title}</h1>
                    <div className="text-xs font-mono text-text-muted">
                      {active.kind === "CONTROL" ? tr("Контроль знань", "Knowledge check") : tr("Тема", "Topic")}{" "}
                      · {tr("Difus:", "Difficulty:")} {user.difus}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(() => {
                  const hasTheory = computeHasTheory(active);
                  if (!hasTheory) return null;
                  return <Button variant="ghost" onClick={() => {
                    setTheoryAcknowledged(false);
                    const theory = getTheoryMarkdown(active);
                    if (theory) {
                      openTheory({
                        title: tr("Теорія", "Theory"),
                        markdown: theory,
                        acknowledgeLabel: tr("Я прочитав(ла) теорію", "I have read the theory"),
                        onAcknowledge: () => setTheoryAcknowledged(true)
                      });
                    }
                  }} className="text-sm px-3 py-2">
                          {tr("Теорія", "Theory")}
                        </Button>;
                })()}

                    {!aiResult ? <>
                        {isPersonalControlQuizTask ? <>
                            <Button variant="secondary" onClick={() => {
                        handleSaveQuizAnswers();
                      }} disabled={quizSubmitting || quizLoading || !theoryAcknowledged || !personalQuiz} className="text-sm px-4 py-2">
                              <Save className="w-4 h-4 mr-2" />
                              {tr("Зберегти відповіді", "Save answers")}
                            </Button>
                            <Button variant="primary" onClick={() => {
                        handleSubmit();
                      }} disabled={!canEdit || quizSubmitting || quizLoading || !theoryAcknowledged || !personalQuiz || Object.keys(quizAnswers).length < (personalQuiz?.questions.length ?? 0)} className="text-sm px-6 py-2">
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              {quizSubmitting ? tr("Відправка...", "Submitting...") : tr("Перевірити тест", "Submit quiz")}
                            </Button>
                          </> : <>
                        {!canEdit ? null : <Button variant="ghost" onClick={() => {
                    requestCreateFile();
                  }} className="text-sm px-3 py-2" title={tr("Створити додатковий файл (multi-file)", "Create an additional file (multi-file)")}>
                          <Plus className="w-4 h-4 mr-2" /> {tr("Створити файл", "Create file")}
                        </Button>}
                        <Button variant="secondary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleSaveDraft();
                  }} disabled={!active || !currentCodeText.trim() || !theoryAcknowledged} className="text-sm px-4 py-2">
                          <Save className="w-4 h-4 mr-2" /> {tr("Зберегти", "Save")}
                        </Button>
                        <Button variant="secondary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleRun();
                  }} disabled={!active || !currentCodeText.trim() || !theoryAcknowledged} className="text-sm px-4 py-2">
                          <PlayCircle className="w-4 h-4 mr-2" /> {tr("Запустити", "Run")}
                        </Button>
                        <Button variant="primary" onClick={() => {
                    if (!editorOpen) {
                      setEditorOpen(true);
                      return;
                    }
                    handleSubmit();
                  }} disabled={!canEdit || submitting || !theoryAcknowledged || !currentCodeText.trim()} className="text-sm px-6 py-2">
                          <CheckCircle2 className="w-4 h-4 mr-2" />{" "}
                          {tr("Перевірити", "Check")}
                        </Button>
                      </>}
                      </> : aiResult.total < 6 ? <>
                        <Button variant="secondary" onClick={handleSaveDraft} disabled={!active || !currentCodeText.trim()} className="text-sm px-4 py-2">
                          <Save className="w-4 h-4 mr-2" /> {tr("Зберегти", "Save")}
                        </Button>
                        <Button variant="primary" onClick={handleFixErrorRetryTopic} disabled={submitting} className="text-sm px-6 py-2">
                          {tr("Виправити помилку", "Fix the error")}
                        </Button>
                      </> : null}
                  </div>
                </div>

                </div>

              <div
                ref={quizScrollRef}
                onWheelCapture={handleQuizWheelCapture}
                className={`flex-1 min-h-0 bg-bg-base p-3 ${isPersonalControlQuizTask ? "overflow-y-scroll overscroll-y-contain [scrollbar-gutter:stable]" : "overflow-hidden"}`}
              >
                {isPersonalControlQuizTask ? (
                  <section className="min-h-full rounded-2xl border border-border/70 bg-bg-surface/80 flex flex-col">
                    <div className="h-8 px-3 border-b border-border/60 bg-bg-surface/70 flex items-center justify-between text-[11px] text-text-secondary uppercase tracking-wider">
                      <span>{tr("Тестовий етап", "Quiz stage")}</span>
                      <span className="text-text-muted normal-case tracking-normal">
                        {personalQuiz ? `${Object.values(quizAnswers).filter((v) => String(v ?? "").trim().length > 0).length}/${personalQuiz.questions.length}` : "0/0"}
                      </span>
                    </div>

                    <div className="p-3 pb-10">
                      {quizLoading ? (
                        <div className="text-xs font-mono text-text-secondary">{tr("Завантаження тесту...", "Loading quiz...")}</div>
                      ) : !personalQuiz ? (
                        <div className="text-xs font-mono text-text-secondary">{tr("Не вдалося завантажити тест. Спробуй оновити сторінку.", "Failed to load quiz. Try refreshing the page.")}</div>
                      ) : (
                        <div className="space-y-3">
                          {personalQuiz.questions.map((q) => {
                            const selected = quizAnswers[q.index] ?? "";
                            const review = quizReview?.find((r) => r.index === q.index) ?? null;
                            return <Card id={`quiz-q-${q.index}`} tabIndex={-1} key={`quiz-full-${q.index}`} className={`p-3 border ${review ? (review.isCorrect ? "border-accent-success/60" : "border-accent-error/60") : "border-border"}`}>
                                <div className="text-sm text-text-primary mb-2">{q.index + 1}. {q.question}</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {Object.entries(q.options || {}).map(([label, text]) => {
                                    const isSelected = selected === label;
                                    const isCorrect = review ? review.correct === label : false;
                                    const isWrongSelected = review ? review.student === label && !review.isCorrect : false;
                                    const tone = review
                                      ? (isCorrect ? "border-accent-success/70 bg-accent-success/10 text-text-primary" : isWrongSelected ? "border-accent-error/70 bg-accent-error/10 text-text-primary" : isSelected ? "border-primary/50 bg-primary/10 text-text-primary" : "border-border text-text-secondary")
                                      : (isSelected ? "border-primary/60 bg-primary/10 text-text-primary" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover");
                                    return <button key={`quiz-full-${q.index}-${label}`} onClick={() => {
                                      setQuizAnswers((prev) => ({ ...prev, [q.index]: label }));
                                    }} disabled={quizSubmitting || !!quizReview} className={`px-3 py-2 rounded-md border text-left text-xs transition-fast ${tone}`}>
                                        <span className="font-mono mr-2">{label}</span>{text}
                                      </button>;
                                  })}
                                </div>
                              </Card>;
                          })}

                          {quizSummary ? <Card className="p-3 border border-border bg-bg-surface/80">
                            <div className="text-xs text-text-secondary">
                              {tr("Підсумок контрольної", "Control summary")}: {tr("фінальна", "final")} {quizSummary.finalGrade ?? "—"}/{quizSummary.maxGrade}
                            </div>
                          </Card> : null}
                        </div>
                      )}
                    </div>
                  </section>
                ) : (
                <div className="h-full min-h-0 grid grid-cols-12 gap-3">
                {missionBlockOrder.map((block) => (
                  <section
                    key={block}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (draggingMissionBlock) moveMissionBlock(draggingMissionBlock, block);
                      setDraggingMissionBlock(null);
                    }}
                    className="col-span-6 min-h-0 h-full rounded-2xl border border-border/70 bg-bg-surface/80 overflow-hidden flex flex-col"
                  >
                    <div className="h-8 px-3 border-b border-border/60 bg-bg-surface/70 flex items-center justify-between text-[11px] text-text-secondary uppercase tracking-wider">
                      <span>{block === "statement" ? tr("Блок задачі", "Task block") : tr("Блок редактора", "Editor block")}</span>
                      <span
                        draggable
                        onDragStart={() => setDraggingMissionBlock(block)}
                        onDragEnd={() => setDraggingMissionBlock(null)}
                        className="inline-flex items-center gap-1 cursor-grab text-text-muted"
                      >
                        <GripVertical className="w-3.5 h-3.5" /> {tr("перетягни", "drag")}
                      </span>
                    </div>

                    {block === "statement" ? (
                      <div className="flex-1 min-h-0 border-t-0 border-border bg-bg-code overflow-hidden flex flex-col">
                        <div className="p-3 border-b border-border flex-shrink-0">
                          <div className="text-xs font-mono text-text-secondary">
                            {tr("Практичне завдання", "Practical task")}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1 flex-wrap">
                              {practiceTabItems.map(([id, label]) => (
                                <button
                                  key={id}
                                  onClick={() => setActiveSegment(id)}
                                  className={`px-2 py-1 rounded-md text-[10px] border ${activeSegment === id ? "border-primary/60 text-primary bg-primary/10" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setStatementModalOpen(true)}>
                              <SquareArrowOutUpRight className="w-3.5 h-3.5 mr-1" />
                              {tr("Повна умова", "Full statement")}
                            </Button>
                          </div>
                        </div>
                        <div className="flex-1 overflow-y-auto overscroll-y-contain p-3">
                          <div className="text-sm text-text-primary">
                            {(() => {
                              const hasTheory = computeHasTheory(active);
                              const fallbackPractice = getPracticeText(active);
                              const practice = segmentedPractice[activeSegment] || fallbackPractice;
                              if (hasTheory && !theoryAcknowledged) {
                                return <div className="text-xs font-mono text-text-secondary">
                                  {tr("Спочатку прочитай теорію у модальному вікні.", "Read the theory in the modal first.")}
                                </div>;
                              }
                              if (isPersonalControlQuizTask) {
                                if (quizLoading) {
                                  return <div className="text-xs font-mono text-text-secondary">{tr("Завантаження тесту...", "Loading quiz...")}</div>;
                                }
                                if (!personalQuiz) {
                                  return <div className="text-xs font-mono text-text-secondary">{tr("Не вдалося завантажити тест. Спробуй оновити сторінку.", "Failed to load quiz. Try refreshing the page.")}</div>;
                                }
                                return <div className="space-y-3">
                                  {personalQuiz.questions.map((q) => {
                                    const selected = quizAnswers[q.index] ?? "";
                                    const review = quizReview?.find((r) => r.index === q.index) ?? null;
                                    return <Card id={`quiz-q-${q.index}`} tabIndex={-1} key={`quiz-${q.index}`} className={`p-3 border ${review ? (review.isCorrect ? "border-accent-success/60" : "border-accent-error/60") : "border-border"}`}>
                                      <div className="text-sm text-text-primary mb-2">{q.index + 1}. {q.question}</div>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {Object.entries(q.options || {}).map(([label, text]) => {
                                          const isSelected = selected === label;
                                          const isCorrect = review ? review.correct === label : false;
                                          const isWrongSelected = review ? review.student === label && !review.isCorrect : false;
                                          const tone = review
                                            ? (isCorrect ? "border-accent-success/70 bg-accent-success/10 text-text-primary" : isWrongSelected ? "border-accent-error/70 bg-accent-error/10 text-text-primary" : isSelected ? "border-primary/50 bg-primary/10 text-text-primary" : "border-border text-text-secondary")
                                            : (isSelected ? "border-primary/60 bg-primary/10 text-text-primary" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover");
                                          return <button key={`${q.index}-${label}`} onClick={() => {
                                            setQuizAnswers((prev) => ({ ...prev, [q.index]: label }));
                                          }} disabled={quizSubmitting || !!quizReview} className={`px-3 py-2 rounded-md border text-left text-xs transition-fast ${tone}`}>
                                            <span className="font-mono mr-2">{label}</span>{text}
                                          </button>;
                                        })}
                                      </div>
                                    </Card>;
                                  })}

                                  {quizSummary ? <Card className="p-3 border border-border bg-bg-surface/80">
                                    <div className="text-xs text-text-secondary">
                                      {tr("Підсумок контрольної", "Control summary")}: {tr("фінальна", "final")} {quizSummary.finalGrade ?? "—"}/{quizSummary.maxGrade}
                                    </div>
                                  </Card> : null}
                                </div>;
                              }

                              return practice ? <div className="prose prose-invert max-w-none text-text-primary">
                                <MarkdownView content={practice} />
                              </div> : <div className="text-xs font-mono text-text-secondary">
                                {tr("Практика знаходиться у редакторі коду нижче (дивись TODO у шаблоні).", "Practice is in the code editor below (see TODO in the template).")}
                              </div>;
                            })()}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 bg-bg-code border-t border-border">
                        {isPersonalControlQuizTask ? (
                          <div className="h-full min-h-0 flex flex-col">
                            <div className="p-4 border-t border-border bg-bg-surface flex items-center justify-between">
                              <div className="text-sm font-mono text-text-secondary">
                                {tr("Для тестового етапу редактор коду не потрібен.", "Code editor is not used for the quiz step.")}
                              </div>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                              <div className="text-xs font-mono text-text-secondary">
                                {tr("Обери відповіді в блоці задачі та натисни «Перевірити тест».", "Choose answers in the task block and click “Submit quiz”.")}
                              </div>
                            </div>
                          </div>
                        ) : editorOpen ? (
                          isWebTask ? <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0">
                              <div className="border-r border-border min-h-0">
                                <MultiFileEditor language="html" entryFile="index.html" files={files.length ? files : [{
                            path: "index.html",
                            content: code
                          }, {
                            path: "styles.css",
                            content: ""
                          }, {
                            path: "script.js",
                            content: ""
                          }]} onChange={(next) => {
                            const normalized = normalizeFiles(next);
                            setUseFiles(true);
                            setFiles(normalized);
                            setCode(normalized.find(f => f.path === "index.html")?.content ?? "");
                          }} readOnly={!canEdit} requestAddToken={mfAddToken} />
                              </div>
                              <div className="min-h-0">
                                <WebPreviewPane files={toWebTaskFiles()} title={tr("Превʼю", "Preview")} />
                              </div>
                            </div> : useFiles ? <MultiFileEditor language={user.course} entryFile={entryFile} files={files.length ? files : [{
                            path: entryFile,
                            content: code
                          }]} onChange={setFiles} readOnly={!canEdit} requestAddToken={mfAddToken} /> : <div className="h-full min-h-0 flex flex-col">
                            <div className="p-2 border-b border-border flex items-center justify-end gap-2">
                              {!canEdit ? null : <Button variant="ghost" size="sm" onClick={() => {
                                requestCreateFile();
                              }}>
                                <Plus className="w-4 h-4 mr-1" />
                                {tr("Додати файл", "Add file")}
                              </Button>}
                            </div>
                            <div className="flex-1 min-h-0">
                              <CodeEditor language={user.course} value={code} onChange={canEdit ? setCode : undefined} readOnly={!canEdit} />
                            </div>
                          </div>
                        ) : (
                          <div className="h-full min-h-0 flex flex-col">
                            <div className="p-4 border-t border-border bg-bg-surface flex items-center justify-between">
                              <div className="text-sm font-mono text-text-secondary">
                                {tr("Редактор приховано.", "Editor is hidden.")}
                              </div>
                              <Button variant="primary" onClick={() => setEditorOpen(true)}>
                                {tr("Відкрити редактор", "Open editor")}
                              </Button>
                            </div>
                            <div className="flex-1 min-h-0 overflow-y-auto p-4">
                              <div className="text-sm text-text-primary">
                                <div className="text-xs font-mono text-text-secondary">
                                  {tr("Відкрий редактор для роботи з кодом.", "Open the editor to work with code.")}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                ))}
                </div>
                )}
              </div>
            </> : <div className="flex-1 flex flex-col items-center justify-center text-text-muted font-mono text-sm gap-4">
              <div>
                {tasks.length === 0 ? tr("Немає завдань", "No tasks") : tr("Виберіть завдання зі списку", "Select a task from the list")}
              </div>
              {tasks.length === 0 && <Button variant="primary" onClick={handleGenerate} disabled={loading || !!active} className="text-sm px-6 py-2 flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  {tr("Згенерувати завдання", "Generate task")}
                </Button>}
            </div>) : activeCenterTab === "hints" ? <div className="flex-1 min-h-0 p-4 bg-bg-base overflow-auto">
              <div className="max-w-5xl rounded-2xl border border-border bg-bg-surface/85 p-4">
                <div className="text-sm text-text-primary font-semibold mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> {tr("Підказки", "Hints")}
                </div>
                <div className="text-xs text-text-secondary mb-3">
                  {Array.isArray(aiResult?.hints) && aiResult.hints.length > 0
                    ? tr("Підказки з останньої перевірки.", "Hints from your latest check.")
                    : tr("Підказки для розв’язання задачі.", "Hints for solving the task.")}
                </div>

                <div className="space-y-2">
                  {nonContestHints.map((h, idx) => (
                    <div key={`${idx}-${h.slice(0, 16)}`} className="rounded-xl border border-border bg-bg-code/70 px-3 py-2 text-xs text-text-primary">
                      <span className="text-primary mr-2">#{idx + 1}</span>{h}
                    </div>
                  ))}
                </div>
              </div>
            </div> : activeCenterTab === "notes" ? <div className="flex-1 min-h-0 p-4 bg-bg-base overflow-auto">
              <div className="max-w-4xl rounded-2xl border border-border bg-bg-surface/85 p-4">
                <div className="text-sm text-text-primary font-semibold mb-2">{tr("Персональні нотатки", "Personal notes")}</div>
                <div className="text-xs text-text-secondary mb-3">{tr("Нотатки зберігаються локально для кожної задачі.", "Notes are saved locally per task.")}</div>
                <textarea
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  className="w-full min-h-[360px] rounded-xl bg-bg-code border border-border px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-secondary"
                  placeholder={tr("Записуй ідеї, крайові випадки, підводні камені...", "Write down ideas, edge cases, and pitfalls...")}
                />
              </div>
            </div> : <div className="flex-1 min-h-0 p-4 bg-bg-base overflow-auto">
              <div className="max-w-5xl rounded-2xl border border-border bg-bg-surface/85 p-4">
                <div className="text-sm text-text-primary font-semibold mb-3">{tr("Activity Stream", "Activity Stream")}</div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-bg-code/70 p-3">
                    <div className="text-xs text-text-secondary mb-2">{tr("Останні задачі", "Recent tasks")}</div>
                    <div className="space-y-2">
                      {tasks.slice(0, 8).map((t) => <div key={t.id} className="text-xs flex items-center justify-between gap-2 border border-border rounded-lg px-2 py-1.5">
                          <span className="text-text-primary truncate">{t.title}</span>
                          <span className="text-text-secondary">{t.status}</span>
                        </div>)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-bg-code/70 p-3">
                    <div className="text-xs text-text-secondary mb-2">{tr("Поточний стан", "Current status")}</div>
                    <div className="text-xs text-text-primary space-y-1">
                      <div>{tr("Активна задача", "Active task")}: {active?.title ?? "—"}</div>
                      <div>{tr("Статус UI", "UI status")}: {uiState}</div>
                      <div>{tr("Сабміт", "Submit")}: {submitting ? tr("в процесі", "in progress") : tr("очікування", "idle")}</div>
                      <div>{tr("Режим редактора", "Editor mode")}: {useFiles ? "multi-file" : "single-file"}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>}
        </div>

        {!dockCollapsed && !dockPopOut ? (
          <div
            style={{ order: consoleResizerOrder }}
            onMouseDown={(e) => startDockResize(e, consoleResizeEdge)}
            className="w-1.5 cursor-col-resize bg-transparent hover:bg-secondary/30 transition-fast"
          />
        ) : null}

        {!dockPopOut ? <div
          ref={consoleColumnRef}
          style={{ width: dockCollapsed ? 46 : dockWidth, order: columnOrder.console }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => handleColumnDrop("console")}
          className="border-l border-border bg-bg-surface flex flex-col flex-shrink-0 relative"
        >
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="text-sm font-mono text-text-primary flex items-center gap-2">
                    <Play className="w-4 h-4" /> {tr("Консоль", "Console")}
            </div>
            <div className="flex items-center gap-1">
              <span
                draggable
                onDragStart={() => setDraggingColumn("console")}
                onDragEnd={() => setDraggingColumn(null)}
                className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-grab"
                title={tr("Перетягни колонку", "Drag column")}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </span>
              <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockCollapsed(v => !v)} title={dockCollapsed ? tr("Розгорнути", "Expand") : tr("Згорнути", "Collapse")}>
                {dockCollapsed ? <PanelRightOpen className="w-3.5 h-3.5" /> : <PanelRightClose className="w-3.5 h-3.5" />}
              </button>
              {!dockCollapsed ? <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockPopOut(true)} title={tr("В окреме вікно", "Pop out")}>
                  <SquareArrowOutUpRight className="w-3.5 h-3.5" />
                </button> : null}
              {aiResult && <Badge color={aiResult.total >= 85 ? "success" : aiResult.total >= 65 ? "warn" : aiResult.total >= 40 ? "warn" : "error"}>
                {aiResult.total ?? "—"}
                    </Badge>}
            </div>
                </div>
          {!dockCollapsed ? <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <div className="border border-border bg-bg-code p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-[10px] font-mono text-text-secondary">
                  {tr("Вхідні дані (stdin)", "Input (stdin)")}
                </div>
                <button
                  type="button"
                  className="text-[10px] font-mono px-2 py-1 border border-border rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!firstExampleInput}
                  onClick={() => {
                    if (!firstExampleInput) {
                      setConsoleOutput(tr("У прикладах не знайдено Input для автозаповнення stdin.", "No Input example found for auto-fill stdin."));
                      setUIState("logic-warning");
                      return;
                    }
                    setStdin(firstExampleInput);
                    setUIState("idle");
                  }}
                  title={tr("Перенести перший приклад Input в stdin", "Move first Input example to stdin")}
                >
                  {tr("Із прикладу", "From example")}
                </button>
              </div>
              <textarea value={stdin} onChange={e => setStdin(e.target.value)} placeholder={tr("Введіть дані для програми...", "Enter input for your program...")} className="w-full h-20 bg-transparent border border-border p-2 font-mono text-xs text-text-primary resize-none focus:outline-none focus:border-primary" spellCheck={false} />
            </div>
            <div className="font-mono text-xs text-text-primary whitespace-pre-wrap">
                  {consoleOutput || tr("Натисни «Перевірити», щоб отримати оцінку.", "Press “Check” to get a grade.")}
            </div>
                  {aiResult && <div className="mt-4 pt-4 border-t border-border space-y-2">
                {(() => {
                  const latest = latestSubmissionBindingRef.current;
                  const resultMeta = aiResult.submissionMeta;
                  const isLatest = !!latest && !!resultMeta && latest.codeHash === resultMeta.codeHash && (!latest.submissionId || latest.submissionId === resultMeta.submissionId);
                  const verdict = aiResult.learningFeedback?.verdict ?? null;
                  const firstFailure = aiResult.learningFeedback?.firstFailure ?? null;
                  const showFallback = isLatest && (verdict === "WA" || verdict === "PRESENTATION_ERROR" || verdict === "PARTIAL") && !firstFailure;
                  if (!showFallback) return null;
                  return <div className="p-2 border border-border bg-bg-code text-xs font-mono text-text-secondary">
                      {tr("Перший збій стався на прихованому тесті — показ прев’ю недоступний. Перевірте крайові випадки та формат виводу.", "The first failure occurred on a hidden test, so preview is unavailable. Re-check edge cases and output formatting.")}
                    </div>;
                })()}
                {aiResult.gradingMode !== "TESTS" && aiResult.total !== null && aiResult.total !== undefined && <>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Оцінка:", "Grade:")} <span className={`font-semibold ${aiResult.total >= 85 ? "text-accent-success" : aiResult.total >= 65 ? "text-accent-warn" : aiResult.total >= 40 ? "text-yellow-500" : "text-accent-error"}`}>{aiResult.total}</span>
                      {aiResult.previousGrade !== null && aiResult.previousGrade !== undefined && <span className="text-text-muted ml-2">
                          ({tr(`було ${aiResult.previousGrade}`, `was ${aiResult.previousGrade}`)})
                        </span>}
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Працездатність:", "Correctness:")}{" "}
                      <span className="text-text-primary">{aiResult.workScore ?? 0}</span> / 5
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Оптимізація:", "Optimization:")}{" "}
                      <span className="text-text-primary">{aiResult.optimizationScore ?? 0}</span> / 4
                    </div>
                    <div className="text-xs font-mono text-text-secondary">
                      {tr("Доброчесність:", "Integrity:")}{" "}
                      <span className="text-text-primary">{aiResult.integrityScore ?? 0}</span> / 3
                      </div>
                    {aiResult.aiUnavailableFallback && <div className="mt-2 text-[11px] font-mono text-accent-warn border border-accent-warn/30 bg-accent-warn/10 px-2 py-1">
                        {tr("ШІ тимчасово недоступний — застосовано консервативну тимчасову оцінку.", "AI was temporarily unavailable — a conservative temporary grade was applied.")}
                      </div>}
                  </>}
                {aiResult.gradingMode === "TESTS" && <div className="text-xs font-mono text-text-secondary">
                    {tr("Тести:", "Tests:")}{" "}
                    <span className="text-text-primary">
                      {aiResult.testsPassed ?? 0}/{aiResult.testsTotal ?? 0}
                    </span>{" "}
                    · {tr("Оцінка:", "Grade:")}{" "}
                    <span className="text-text-primary">{aiResult.total ?? 0}</span>
                    {(() => {
                      const passed = aiResult.testsPassed;
                      const total = aiResult.testsTotal;
                      if (typeof passed !== "number" || typeof total !== "number" || total <= 0) return null;
                      const pct = Math.max(0, Math.min(100, Math.round(passed / total * 100)));
                      return <div className="mt-2">
                          <div className="h-2 w-full bg-border rounded overflow-hidden">
                            <div className="h-2 bg-primary" style={{
                              width: `${pct}%`
                            }} />
                          </div>
                          <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center justify-between">
                            <span>{tr("Тести:", "Tests:")} <span className="text-text-secondary">{passed}/{total}</span></span>
                            <span>{pct}%</span>
                          </div>
                        </div>;
                    })()}
                  </div>}
                {aiResult.comparisonFeedback && <div className="mt-3 p-2 border border-primary/30 bg-bg-code">
                    <div className="text-xs font-mono text-primary mb-1">
                      {tr("Порівняння з попередньою спробою:", "Comparison with previous attempt:")}
                    </div>
                    <div className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                      {aiResult.comparisonFeedback}
                      </div>
                      </div>}
                      {aiResult.gradingMode === "TESTS" && Array.isArray(aiResult.testResults) && aiResult.testResults.length > 0 && <div className="mt-3 space-y-3">
                          <div className="p-2 border border-border bg-bg-code">
                            <div className="text-[10px] font-mono text-text-secondary mb-2">
                              {tr("Результати тестів", "Test results")}
                            </div>
                            <div className="space-y-1">
                              {aiResult.testResults.map((r, idx) => {
                                const label = errorKindLabel(r.errorKind);
                                return <div key={`${r.testId}-${idx}`} className="flex items-start gap-2 text-xs font-mono">
                                      <span className={r.passed ? "text-accent-success" : "text-accent-error"}>
                                        {r.passed ? "✓" : "✗"}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="text-text-primary">{tr("Тест", "Test")} {idx + 1}</span>
                                          {!r.passed && r.verdict && <span className="text-[10px] text-text-muted">{r.verdict}</span>}
                                          {!r.passed && label && <span className="text-[10px] px-1.5 py-0.5 border border-border bg-bg-surface text-text-secondary">{label}</span>}
                                        </div>
                                        {!r.passed && r.error && <div className="text-text-secondary whitespace-pre-wrap break-words">
                                            {String(r.error).slice(0, 600)}
                                          </div>}
                                      </div>
                                    </div>;
                              })}
                            </div>
                          </div>

                          {Array.isArray(aiResult.hints) && aiResult.hints.length > 0 && <div className="p-2 border border-primary/30 bg-bg-code">
                              <div className="text-[10px] font-mono text-primary mb-2">
                                {tr("Підказки (крок за кроком)", "Hints (step-by-step)")}
                              </div>
                              <div className="space-y-2">
                                {aiResult.hints.slice(0, revealedHints).map((h, i) => <div key={i} className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                                      {i + 1}. {h}
                                    </div>)}
                                <div className="flex gap-2">
                                  {revealedHints < aiResult.hints.length && <Button variant="ghost" onClick={() => setRevealedHints(v => Math.min(aiResult.hints?.length ?? 0, v + 1))} className="text-xs">
                                      {tr("Показати підказку", "Show hint")}
                                    </Button>}
                                  {revealedHints < aiResult.hints.length && aiResult.hints.length > 1 && <Button variant="ghost" onClick={() => setRevealedHints(aiResult.hints?.length ?? 0)} className="text-xs">
                                      {tr("Показати всі", "Show all")}
                                    </Button>}
                                  {revealedHints > 0 && <Button variant="ghost" onClick={() => setRevealedHints(0)} className="text-xs">
                                      {tr("Сховати", "Hide")}
                                    </Button>}
                                </div>
                              </div>
                            </div>}

                          {aiResult.aiFeedback && <details className="border border-border bg-bg-code p-2">
                              <summary className="cursor-pointer text-[10px] font-mono text-text-secondary">
                                {tr("Повний текст (debug)", "Full text (debug)")}
                              </summary>
                              <div className="mt-2 text-xs font-mono text-text-secondary whitespace-pre-wrap">
                                {aiResult.aiFeedback}
                              </div>
                            </details>}
                        </div>}

                      {aiResult.gradingMode !== "TESTS" && aiResult.aiFeedback && <div className="text-xs font-mono text-text-secondary mt-3 whitespace-pre-wrap">
                          {aiResult.aiFeedback}
                        </div>}

                      {(() => {
                    const latest = latestSubmissionBindingRef.current;
                    const resultMeta = aiResult.submissionMeta;
                    const isLatest = !!latest && !!resultMeta && latest.codeHash === resultMeta.codeHash && (!latest.submissionId || latest.submissionId === resultMeta.submissionId);
                    return <FailureRecoveryCard
                          verdict={isLatest ? aiResult.learningFeedback?.verdict : null}
                          firstFailure={isLatest ? aiResult.learningFeedback?.firstFailure : null}
                        />;
                  })()}
                    </div>}
            {}
            {uiState === "evaluating" && <div className="mt-4 text-xs font-mono text-secondary animate-pulse">
                {tr("Оцінювання...", "Evaluating...")}
              </div>}
            {uiState === "success" && <div className="mt-4 text-xs font-mono text-accent-success">
                {tr("✓ Успішно", "✓ Success")}
              </div>}
            {uiState === "error" && <div className="mt-4 text-xs font-mono text-accent-error">
                {tr("✗ Помилка", "✗ Error")}
                </div>}
            {uiState === "logic-warning" && <div className="mt-4 text-xs font-mono text-accent-logic-warning">
                {tr("⚠ Попередження", "⚠ Warning")}
            </div>}
          </div> : <div className="flex-1 min-h-0 p-1 flex items-start justify-center">
              <button className="w-full h-12 rounded-xl border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover flex items-center justify-center mt-2" onClick={() => setDockCollapsed(false)}>
                <FoldHorizontal className="w-4 h-4" />
              </button>
            </div>}
        </div> : null}
      </div>

      {dockPopOut ? <div className="fixed right-4 top-20 w-[430px] h-[72vh] z-40 rounded-2xl border border-border bg-bg-surface shadow-[0_20px_60px_rgba(0,0,0,0.55)] p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-text-secondary uppercase tracking-widest">{tr("Консоль (вікно)", "Console (pop-out)")}</div>
            <button className="p-1 rounded border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover" onClick={() => setDockPopOut(false)}>
              <PanelRightOpen className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="h-[calc(100%-2rem)] overflow-auto border border-border rounded-xl bg-bg-code p-3 text-xs font-mono text-text-primary whitespace-pre-wrap">
            {consoleOutput || tr("Натисни «Перевірити», щоб отримати оцінку.", "Press “Check” to get a grade.")}
          </div>
        </div> : null}

      <Modal
        open={statementModalOpen}
        onClose={() => setStatementModalOpen(false)}
        title={tr("Повна умова задачі", "Full task statement")}
        description={tr("Повний текст умови задачі.", "Full task statement text.")}
      >
        {fullPracticeText.trim() ? (
          <div className="prose prose-invert max-w-none text-text-primary">
            <MarkdownView content={fullPracticeText} />
          </div>
        ) : (
          <div className="text-sm text-text-secondary">
            {tr("Умова для цієї задачі поки недоступна.", "Statement is not available for this task yet.")}
          </div>
        )}
      </Modal>

      {}
      <Modal open={!!blockState} title={blockState?.mode === "low" ? tr("Тему потрібно пройти повторно", "You need to retry this topic") : tr("Бажано повторити тему", "It’s recommended to review this topic")} description={blockState ? (() => {
      const hasAvg = Number.isFinite(blockState.average);
      const avgLineUk = hasAvg ? `\nСередній бал: ${blockState.average.toFixed(2)}` : "";
      const avgLineEn = hasAvg ? `\nAverage grade: ${blockState.average.toFixed(2)}` : "";
      return tr(`Тема: ${blockState.topicTitle}${avgLineUk}\n\nЩоб рухатись далі, необхідно перепройти тему.`, `Topic: ${blockState.topicTitle}${avgLineEn}\n\nTo continue, you need to retry the topic.`);
    })() : undefined} onClose={() => {
      setBlockState(null);
      setUIState("idle");
    }}>
        {blockState && <div className="flex justify-end mt-2">
            <Button variant="primary" onClick={async () => {
          try {
            await resetTopic(blockState.topicId);
            setBlockState(null);
            setUIState("idle");
            await reloadTasks(true);
          } catch (err) {
            console.error(err);
            setUIState("error");
          }
        }}>
              {tr("Перепройти тему", "Retry topic")}
            </Button>
          </div>}
      </Modal>

      {}
      <Modal open={!!milestone} title={tr("🎯 Ти покращився!", "🎯 You improved!")} description={milestone?.message} onClose={async () => {
      if (milestone) {
        try {
          const base = import.meta.env.VITE_API_URL || window.location.origin;
          await fetch(`${base}/profile/milestone-shown`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${localStorage.getItem("token")}`,
              "Content-Type": "application/json"
            }
          });
        } catch (err) {}
      }
      setMilestone(null);
    }}>
        {milestone && <div className="flex justify-end gap-2 mt-2">
            <Button variant="primary" onClick={async () => {
          try {
            const base = import.meta.env.VITE_API_URL || window.location.origin;
            await fetch(`${base}/profile/milestone-shown`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`,
                "Content-Type": "application/json"
              }
            });
          } catch (err) {}
          setMilestone(null);
        }}>
              {tr("Продовжити", "Continue")}
            </Button>
          </div>}
      </Modal>
            </div>
          </div>
        </div>
      </div>
    </div>;
};