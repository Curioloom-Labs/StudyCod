import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
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
import { useUIMode } from "../../components/interface/UIModeProvider";
import { buildResumeState, loadResumeState, saveResumeState } from "../../lib/resumeState";
import { FailureRecoveryCard, type FailureRecoveryData } from "../../components/FailureRecoveryCard";
import { extractFirstExampleInput, normalizeStdinBeforeRun } from "../../utils/inputTextNormalization";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeRunResult } from "../../components/ide/StudyCodIDEWorkspace";
interface Props {
  user: User;
}

const PERSONAL_TASK_PREVIEW_FIXTURES: Task[] = [
  {
    id: 91001,
    title: "Розумний розклад автобусів",
    subtitle: "Алгоритми · масиви та мінімум",
    topicId: 901,
    topicTitle: "Колекції та пошук",
    topicIndex: 4,
    descriptionMarkdown: "",
    theoryMarkdown: "## Як знайти мінімум\n\nПройди масив лише один раз і зберігай індекс найменшого очікування. Не потрібно сортувати весь список — достатньо лінійного проходу.\n\n## Що робити з однаковим часом\n\nОновлюй відповідь лише тоді, коли нове значення строго менше. Тоді при однаковому часі залишиться перший автобус — саме він має менший номер.",
    practiceText: "## Завдання\n\nНа зупинку прибувають автобуси через `t₁, t₂, …, tₙ` хвилин. Знайди номер автобуса, який прибуде першим. Якщо час однаковий — обери автобус із меншим номером.\n\n## Вхідні дані\n\nУ першому рядку число `n` (`1 ≤ n ≤ 100 000`). У другому — `n` цілих чисел від `0` до `10⁹`.\n\n## Вихідні дані\n\nВиведи номер автобуса та час очікування.\n\n## Приклад\n\n**Ввід**\n```text\n5\n12 7 7 18 9\n```\n\n**Вивід**\n```text\n2 7\n```",
    starterCode: "n = int(input())\ntimes = list(map(int, input().split()))\n\n# Знайди найшвидший автобус\nbest_index = 0\n\nprint(best_index + 1, times[best_index])\n",
    userCode: "n = int(input())\ntimes = list(map(int, input().split()))\n\nbest_index = 0\nfor i in range(1, n):\n    if times[i] < times[best_index]:\n        best_index = i\n\nprint(best_index + 1, times[best_index])\n",
    status: "OPEN",
    lessonInTopic: 2,
    repeatAttempt: 0,
    kind: "TOPIC",
    createdAt: "2026-07-13T09:30:00.000Z",
    language: "PYTHON"
  },
  {
    id: 91000,
    title: "Сума парних елементів",
    subtitle: "Розминка · цикли",
    topicId: 900,
    topicTitle: "Основи Python",
    topicIndex: 3,
    descriptionMarkdown: "",
    practiceText: "## Завдання\n\nЗнайди суму всіх парних чисел у послідовності.",
    theoryMarkdown: "",
    starterCode: "numbers = list(map(int, input().split()))\nprint(0)\n",
    userCode: "numbers = list(map(int, input().split()))\nprint(sum(x for x in numbers if x % 2 == 0))\n",
    finalCode: "numbers = list(map(int, input().split()))\nprint(sum(x for x in numbers if x % 2 == 0))\n",
    status: "GRADED",
    lessonInTopic: 4,
    repeatAttempt: 0,
    kind: "TOPIC",
    createdAt: "2026-07-12T14:15:00.000Z",
    language: "PYTHON"
  }
];

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

function getPersonalCurriculumBlock(topicIndex: number | null | undefined, title: string): string {
  const normalizedTitle = String(title || "").toLowerCase();
  if (normalizedTitle.includes("вступ") || normalizedTitle.includes("intro")) return tr("Вступ", "Intro");
  const idx = Number(topicIndex);
  if (!Number.isFinite(idx)) return tr("Окремі теми", "Standalone topics");
  if (idx <= 2) return tr("Вступ", "Intro");
  if (idx <= 5) return tr("База мови", "Language basics");
  if (idx <= 9) return tr("Керування потоком", "Control flow");
  if (idx <= 13) return tr("Дані та колекції", "Data and collections");
  if (idx <= 17) return tr("Функції та структура", "Functions and structure");
  return tr("Практичні модулі", "Practice modules");
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

const isPlacementRequiredError = (error: unknown): boolean => {
  const apiErr = toApiErrorLike(error);
  const data = asRecord(apiErr?.response?.data);
  return apiErr?.response?.status === 403 && String(data?.message ?? "").toUpperCase() === "PLACEMENT_REQUIRED";
};

const requestPlacementOpen = (): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("studycod:open-placement"));
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
      else if (/constraint|РѕР±РјРµР¶РµРЅРЅСЏ/.test(low)) current = "constraints";
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

function splitTheoryIntoChapters(markdown: string, fallbackTitle: string): Array<{ title: string; markdown: string }> {
  const lines = String(markdown || "").split(/\r?\n/);
  const chapters: Array<{ title: string; lines: string[] }> = [];
  let current = { title: fallbackTitle, lines: [] as string[] };
  for (const line of lines) {
    const match = line.match(/^#{1,2}\s+(.+)$/);
    if (match) {
      if (current.lines.some((item) => item.trim())) chapters.push(current);
      current = { title: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some((item) => item.trim()) || chapters.length === 0) chapters.push(current);
  return chapters.map((chapter, index) => ({
    title: chapter.title || `${fallbackTitle} ${index + 1}`,
    markdown: chapter.lines.join("\n").trim()
  }));
}
export const TasksPage: React.FC<Props> = ({
  user
}) => {
  const {
    i18n
  } = useTranslation();
  const uiLanguage = typeof i18n.language === "string" && i18n.language.startsWith("en") ? "en" : "uk";
  const locale = typeof i18n.language === "string" && i18n.language.startsWith("uk") ? "uk-UA" : "en-US";
  const isAurora = useUIMode().mode === "aurora";
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");
  const { element: viewportEl } = useWorkspaceViewport();
  const {
    openTheory,
    isOpen: isTheoryOpen
  } = useTheoryModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPreviewMode = import.meta.env.DEV && searchParams.get("preview") === "true";
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
  const [consoleClipboardState, setConsoleClipboardState] = useState<"idle" | "copied" | "failed">("idle");
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
    score?: number;
    maxScore?: number;
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
    learningAttempt?: {
      id: number;
      outcome: string;
      failureCategory?: string | null;
      firstFailedTestId?: number | null;
      highestHintLevelShown?: number;
      solvedAfterFailure?: boolean;
    } | null;
    submissionMeta?: {
      submissionId: string;
      clientSubmissionId?: string | null;
      codeHash: string;
    };
  } | null>(null);

  const latestSubmitRequestSeq = useRef(0);
  const generateRequestRef = useRef(false);
  const latestSubmissionBindingRef = useRef<{
    submissionId?: string;
    codeHash: string;
  } | null>(null);

  const [revealedHints, setRevealedHints] = useState(0);
  const [theoryAcknowledged, setTheoryAcknowledged] = useState(false);
  const [theoryPanelOpen, setTheoryPanelOpen] = useState(false);
  const [activeTheoryChapter, setActiveTheoryChapter] = useState(0);
  const [showTaskHistory, setShowTaskHistory] = useState(true);
  const [uiState, setUIState] = useState<UIState>("idle");
  const [milestone, setMilestone] = useState<{
    id?: string | number;
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

  const requestedTaskIdFromUrl = useMemo(() => {
    const raw = searchParams.get("task");
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.floor(parsed);
  }, [searchParams]);

  const syncTaskSelectionToUrl = useCallback((taskId: number | null) => {
    const nextSearch = new URLSearchParams(searchParams);
    if (taskId && taskId > 0) {
      nextSearch.set("task", String(taskId));
    } else {
      nextSearch.delete("task");
    }

    if (nextSearch.toString() === searchParams.toString()) return;
    setSearchParams(nextSearch, {
      replace: true
    });
  }, [searchParams, setSearchParams]);

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
  const entryContentFromFiles = useCallback((fs: CodeFile[]): string => {
    const hit = fs.find(f => f.path === entryFile);
    return hit?.content ?? "";
  }, [entryFile]);

  const deriveEditorFromTask = useCallback((t: Task): { useFiles: boolean; files: CodeFile[]; code: string } => {
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
  }, [entryContentFromFiles]);

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
    setActiveTheoryChapter(0);
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
    const byTopic = new Map<string, {
      title: string;
      items: typeof sidebarTasks;
      topicId: number | null;
      topicIndex: number | null;
    }>();

    for (const item of sidebarTasks) {
      const rawTopicTitle = String(item.openTask.topicTitle ?? "").trim();
      const topicTitle = rawTopicTitle || tr("Без теми", "No topic");
      const topicId = Number(item.openTask.topicId ?? 0);
      const topicIndexRaw = Number(item.openTask.topicIndex ?? NaN);
      const topicIndex = Number.isFinite(topicIndexRaw) ? Math.floor(topicIndexRaw) : null;
      const topicKey = Number.isFinite(topicId) && topicId > 0 ? `topic:${topicId}` : `topic-title:${topicTitle.toLowerCase()}`;

      if (!byTopic.has(topicKey)) {
        byTopic.set(topicKey, {
          title: topicTitle,
          items: [] as typeof sidebarTasks,
          topicId: Number.isFinite(topicId) && topicId > 0 ? topicId : null,
          topicIndex,
        });
      } else if (topicIndex !== null) {
        const current = byTopic.get(topicKey)!;
        const prev = current.topicIndex;
        current.topicIndex = prev === null ? topicIndex : Math.min(prev, topicIndex);
      }
      byTopic.get(topicKey)!.items.push(item);
    }

    const sections = Array.from(byTopic.entries()).map(([key, section]) => {
      const sortedItems = [...section.items].sort((a, b) => {
        const aLesson = Number(a.openTask.lessonInTopic ?? 0);
        const bLesson = Number(b.openTask.lessonInTopic ?? 0);
        const hasLessons = Number.isFinite(aLesson) && Number.isFinite(bLesson) && aLesson > 0 && bLesson > 0;

        if (section.topicId !== null && hasLessons && aLesson !== bLesson) {
          return aLesson - bLesson;
        }

        const ta = new Date(a.createdAt).getTime();
        const tb = new Date(b.createdAt).getTime();
        return tb - ta;
      });
      return {
        key,
        title: section.title,
        blockTitle: getPersonalCurriculumBlock(section.topicIndex, section.title),
        items: sortedItems,
        topicId: section.topicId,
        topicIndex: section.topicIndex,
      };
    });

    return sections.sort((a, b) => {
      const aIsTopic = a.topicId !== null;
      const bIsTopic = b.topicId !== null;
      if (aIsTopic && bIsTopic) {
        const ai = Number.isFinite(Number(a.topicIndex)) ? Number(a.topicIndex) : Number.MAX_SAFE_INTEGER;
        const bi = Number.isFinite(Number(b.topicIndex)) ? Number(b.topicIndex) : Number.MAX_SAFE_INTEGER;
        if (ai !== bi) return ai - bi;
        return a.title.localeCompare(b.title, i18n.language || "uk");
      }
      if (aIsTopic !== bIsTopic) return aIsTopic ? -1 : 1;

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
    syncTaskSelectionToUrl(task.id);
    if (isCompactViewport) {
      setShowTaskHistory(false);
    }
    window.requestAnimationFrame(() => {
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
    });
  }, [deriveEditorFromTask, isCompactViewport, syncTaskSelectionToUrl]);

  useEffect(() => {
    if (!requestedTaskIdFromUrl) return;
    if (!tasks.length) return;
    if (active?.id === requestedTaskIdFromUrl) return;

    const requested = tasks.find((task) => task.id === requestedTaskIdFromUrl);
    if (!requested) return;

    setActive(requested);
    const next = deriveEditorFromTask(requested);
    setUseFiles(next.useFiles);
    setFiles(next.files);
    setCode(next.code);
    setAiResult(null);
    setConsoleOutput("");
    setUIState("idle");
    const hasTheory = computeHasTheory(requested);
    setTheoryAcknowledged(!hasTheory);
  }, [requestedTaskIdFromUrl, tasks, active?.id, deriveEditorFromTask]);

  useEffect(() => {
    if (requestedTaskIdFromUrl && active?.id !== requestedTaskIdFromUrl) {
      const requestedExists = tasks.some((task) => task.id === requestedTaskIdFromUrl);
      if (requestedExists) return;
    }
    syncTaskSelectionToUrl(active?.id ?? null);
  }, [active?.id, requestedTaskIdFromUrl, syncTaskSelectionToUrl, tasks]);

  const sidebarStatusMeta = useCallback((status: Task["status"]) => {
    switch (status) {
      case "GRADED":
        return {
          label: tr("Готово", "Done"),
          dotClass: "bg-accent-success",
          pillClass: "border-accent-success/50 bg-accent-success/10 text-accent-success"
        };
      case "SUBMITTED":
        return {
          label: tr("На перевірці", "Review"),
          dotClass: "bg-secondary",
          pillClass: "border-secondary/50 bg-secondary/10 text-secondary"
        };
      default:
        return {
          label: tr("В роботі", "In progress"),
          dotClass: "bg-accent-warn",
          pillClass: "border-accent-warn/50 bg-accent-warn/10 text-accent-warn"
        };
    }
  }, []);

  const sidebarStats = useMemo(() => {
    const total = sidebarTasks.length;
    const completed = sidebarTasks.filter((item) => item.status === "GRADED").length;
    const reviewing = sidebarTasks.filter((item) => item.status === "SUBMITTED").length;
    const inProgress = Math.max(0, total - completed - reviewing);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      total,
      completed,
      reviewing,
      inProgress,
      progress
    };
  }, [sidebarTasks]);

  const canGenerateFromSidebar = sidebarStats.total === 0 ? canGenerate : canGenerateNew;
  const generateSidebarLabel = sidebarStats.total === 0
    ? tr("Згенерувати завдання", "Generate task")
    : tr("Згенерувати нове", "Generate new");
  const generateSidebarHint = !canGenerateFromSidebar
    ? blockedReason ?? tr("Заверши поточне завдання, щоб згенерувати нове.", "Finish the current task before generating a new one.")
    : cooldownSecondsLeft > 0
      ? tr(`Зачекай ${cooldownSecondsLeft} с`, `Wait ${cooldownSecondsLeft}s`)
      : undefined;
  const sidebarFooterHint = blockedReason
    ? blockedReason
    : canGenerateFromSidebar
      ? tr("Готово до генерації нового завдання.", "Ready to generate a new task.")
      : tr("Заверши поточне завдання, щоб відкрити генерацію.", "Finish the current task to unlock generation.");

  const sidebarStatusProgressByTask = useCallback((status: Task["status"]): number => {
    if (status === "GRADED") return 100;
    if (status === "SUBMITTED") return 74;
    return 34;
  }, []);

  const lessonStatusMeta = useMemo(() => {
    if (lessonStatus === "COMPLETED") {
      return {
        label: tr("Урок завершено", "Lesson completed"),
        hint: tr("Можна переходити до нового завдання.", "You can move to a new task."),
        pillClass: "border-accent-success/50 bg-accent-success/10 text-accent-success"
      };
    }
    if (lessonStatus === "IN_PROGRESS") {
      return {
        label: tr("Урок в процесі", "Lesson in progress"),
        hint: tr("Закрий поточні задачі для переходу далі.", "Finish current tasks to move forward."),
        pillClass: "border-accent-warning/50 bg-accent-warning/10 text-accent-warning"
      };
    }
    return {
      label: tr("Урок не розпочато", "Lesson not started"),
      hint: tr("Стартуй із першої задачі.", "Start with the first task."),
      pillClass: "border-border/70 bg-bg-base/60 text-text-secondary"
    };
  }, [lessonStatus]);

  useEffect(() => {
    try {
      localStorage.setItem("studycod_tasks_editor_open", editorOpen ? "1" : "0");
    } catch {}
  }, [editorOpen]);
  const reloadTasks = useCallback(async (selectLast = false) => {
    const data = isPreviewMode ? PERSONAL_TASK_PREVIEW_FIXTURES : await listTasks(uiLanguage);
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
  }, [active?.id, aiResult?.total, uiLanguage, isPreviewMode]);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const data = isPreviewMode ? PERSONAL_TASK_PREVIEW_FIXTURES : await listTasks(uiLanguage);
        if (mounted) {
          const filtered = data.filter(t => true);
          setTasks(filtered);
          if (filtered.length > 0 && !active) {
            const requested = requestedTaskIdFromUrl
              ? filtered.find((task) => task.id === requestedTaskIdFromUrl)
              : null;
            const firstTask = requested ?? filtered[0];
            setActive(firstTask);
            const next = deriveEditorFromTask(firstTask);
            setUseFiles(next.useFiles);
            setFiles(next.files);
            setCode(next.code);
            setTheoryAcknowledged(isPreviewMode || !computeHasTheory(firstTask));
            if (isPreviewMode) {
              setStdin("5\n12 7 7 18 9");
              setPersonalNotes(tr("Перевірити випадок, коли два автобуси мають однаковий час.", "Check the case where two buses have the same arrival time."));
              setConsoleOutput(tr("Preview готовий: зміни код і натисни «Запустити» або «Перевірити».", "Preview is ready: edit the code and click Run or Check."));
            }
          }
        }
      } catch (err: unknown) {
        if (!mounted) return;
        if (isPlacementRequiredError(err)) {
          requestPlacementOpen();
          setConsoleOutput(tr("Перед першою персональною практикою потрібно пройти коротку оцінку рівня. Вона відкрилась поверх сторінки.", "Before your first personal practice, please complete the short placement assessment. It opened above this page."));
          setUIState("logic-warning");
          return;
        }
        const text = formatApiError(err);
        setConsoleOutput(`${tr("Помилка завантаження завдань:", "Failed to load tasks:")} ${text}\n` + tr("Якщо бачиш HTML замість JSON — перевір Nginx проксі для /api/* і чи працює backend.", "If you see HTML instead of JSON — check Nginx proxy for /api/* and that the backend is running."));
        setUIState("error");
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [deriveEditorFromTask, requestedTaskIdFromUrl, uiLanguage, isPreviewMode]);
  useEffect(() => {
    if (tasks.length > 0 && !active) {
      const openTaskId = sessionStorage.getItem("openTaskId");
      let taskToOpen = tasks[0];

      const resume = loadResumeState(user.id);
      const preferredId = (() => {
        if (requestedTaskIdFromUrl) {
          return requestedTaskIdFromUrl;
        }
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
  }, [tasks.length, active, requestedTaskIdFromUrl]);
  useEffect(() => {
    if (active) {
      const hasTheory = computeHasTheory(active);
      setTheoryAcknowledged(isPreviewMode || !hasTheory);
    } else {
      setTheoryAcknowledged(false);
    }
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown, isPreviewMode]);
  useEffect(() => {
    if (!active) return;
    const theory = getTheoryMarkdown(active);
    if (!theory) return;
    if (theoryAcknowledged) return;
    setTheoryPanelOpen(true);
  }, [active?.id, active?.theoryMarkdown, active?.descriptionMarkdown, theoryAcknowledged]);
  useEffect(() => {
    if (isPreviewMode) return;
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
        if (data.submitted) {
          const grade = data.submittedGrade;
          const review = data.submittedReview;
          setQuizReview(review?.questions ?? null);
          setAiResult({
            gradingMode: "TESTS",
            total: Number(grade?.total ?? 0),
            workScore: 0,
            optimizationScore: 0,
            integrityScore: 0,
            aiFeedback: tr(
              `Тест уже здано: ${grade?.correctAnswers ?? 0}/${grade?.totalQuestions ?? data.questions.length}. Повторна відправка заблокована.`,
              `This quiz was already submitted: ${grade?.correctAnswers ?? 0}/${grade?.totalQuestions ?? data.questions.length}. Resubmission is locked.`
            ),
            testsPassed: grade?.correctAnswers,
            testsTotal: grade?.totalQuestions ?? data.questions.length,
          });
          setConsoleOutput(tr("Тест уже перевірено. Переглянь пояснення до відповідей нижче.", "Quiz already checked. Review the answer explanations below."));
          setUIState("success");
          clearQuizDraftAnswers(active.id);
        }
        const restored = loadQuizDraftAnswers(active.id, data);
        setQuizAnswers(data.submitted ? {} : restored);
        if (!data.submitted) requestAnimationFrame(() => focusFirstUnansweredQuizQuestion(data, restored));
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
  const handleGenerate = async (options?: { forceControl?: boolean }) => {
    const wantsControl = Boolean(options?.forceControl);
    if (generateRequestRef.current) {
      setConsoleOutput(tr("Генерація вже триває — дочекайся результату.", "Generation is already running — wait for the result."));
      setUIState("logic-warning");
      return;
    }
    if (isPreviewMode) {
      setConsoleOutput(tr("У preview показано готовий навчальний сценарій. Генерація нового завдання доступна після входу.", "Preview shows a complete learning scenario. New task generation is available after signing in."));
      setUIState("idle");
      return;
    }
    let closeDelayMs = 0;
    if (cooldownSecondsLeft > 0) {
      setConsoleOutput(tr(`Зачекай ${cooldownSecondsLeft} с і спробуй ще раз.`, `Wait ${cooldownSecondsLeft}s and try again.`));
      setUIState("logic-warning");
      return;
    }
    if (wantsControl && sidebarStats.completed <= 0) {
      setConsoleOutput(tr("Самоконтроль відкриється після першої завершеної теми.", "Self-check unlocks after the first completed topic."));
      setUIState("logic-warning");
      return;
    }
    if (wantsControl ? !canGenerateNew : !canGenerate) {
      setConsoleOutput(blockedReason ?? tr("Спочатку заверши поточне завдання.", "Finish the current task first."));
      setUIState("logic-warning");
      return;
    }
    generateRequestRef.current = true;
    setLoading(true);
    setGenerationPhase("requesting");
    setAiResult(null);
    setConsoleOutput("");
    setUIState("idle");
    try {
      setGenerationPhase("generating");
      const res = await generateTask(uiLanguage, wantsControl ? { forceControl: true } : undefined);
      const payload = asRecord(res);
      const status = String(payload?.status ?? "");
      if (status === "ok" && payload?.task && typeof payload.task === "object") {
        const generatedTask = payload.task as Task;
        const generatedTaskId = Number((generatedTask as { id?: unknown }).id ?? 0);
        setGenerationPhase("syncing");
        // The generation endpoint already returns the complete task DTO. Avoid
        // a second list request here; it made the workspace feel stalled after
        // the AI response had already arrived.
        const newTasks = [...tasks.filter((task) => task.id !== generatedTask.id), generatedTask];
        setTasks(newTasks);

        const openedTask = Number.isFinite(generatedTaskId) && generatedTaskId > 0
          ? newTasks.find((t) => t.id === generatedTaskId) ?? generatedTask
          : generatedTask;

        setGenerationPhase("opening");
        setActive(openedTask);
        const nextEditorState = deriveEditorFromTask(openedTask);
        setUseFiles(nextEditorState.useFiles);
        setFiles(nextEditorState.files);
        setCode(nextEditorState.code);
        setAiResult(null);
        setConsoleOutput("");
        const hasTheory = computeHasTheory(openedTask);
        setTheoryAcknowledged(!hasTheory);
        setGenerationPhase("finishing");
        if (hasTheory) {
          const theory = getTheoryMarkdown(openedTask);
          if (theory) setTheoryPanelOpen(true);
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
      if (isPlacementRequiredError(error)) {
        setGenerationPhase("error");
        closeDelayMs = 500;
        requestPlacementOpen();
        setConsoleOutput(tr("Щоб згенерувати перше персональне завдання, спочатку пройди коротку оцінку рівня. Це потрібно, щоб StudyCod підібрав правильну складність.", "To generate your first personal task, complete the short placement assessment first. StudyCod uses it to choose the right difficulty."));
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
      generateRequestRef.current = false;
    }
  };
  const handleSubmit = async () => {
    if (!active) return;
    if (isPreviewMode && !isPersonalControlQuizTask) {
      setSubmitting(true);
      setUIState("evaluating");
      setConsoleOutput(tr("Перевіряємо 6 тестів…", "Checking 6 tests…"));
      window.setTimeout(() => {
        setAiResult({
          gradingMode: "TESTS",
          total: 12,
          workScore: 8,
          optimizationScore: 2,
          integrityScore: 2,
          aiFeedback: tr("Рішення правильне й працює за O(n). Умова з однаковим часом також оброблена коректно.", "The solution is correct and runs in O(n). Equal arrival times are handled correctly as well."),
          testsPassed: 6,
          testsTotal: 6,
          hints: []
        });
        setConsoleOutput(tr("Усі тести пройдено · 6/6\nЧас: 42 ms · Пам’ять: 18.4 MB", "All tests passed · 6/6\nTime: 42 ms · Memory: 18.4 MB"));
        setUIState("success");
        setSubmitting(false);
      }, 550);
      return;
    }
    if (isPersonalControlQuizTask) {
      if (!personalQuiz || quizLoading) {
        setConsoleOutput(tr("Тест ще завантажується. Зачекай декілька секунд.", "Quiz is still loading. Please wait a few seconds."));
        setUIState("logic-warning");
        return;
      }
      if (personalQuiz.submitted || quizReview) {
        setConsoleOutput(tr("Цей тест уже здано. Повторна відправка недоступна.", "This quiz has already been submitted. Resubmission is unavailable."));
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
          } else if (isPlacementRequiredError(genErr)) {
            requestPlacementOpen();
            autoGenerateHint = tr(" Для наступної практики потрібно завершити оцінку рівня.", " Complete the placement assessment to unlock the next practice.");
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
        const apiErr = toApiErrorLike(err);
        if (Number(apiErr?.response?.status ?? 0) === 409 || String(asRecord(apiErr?.response?.data)?.message ?? "") === "QUIZ_ALREADY_SUBMITTED") {
          setQuizReview((current) => current ?? []);
          setConsoleOutput(tr("Тест уже здано. Онови сторінку, щоб переглянути результат.", "This quiz was already submitted. Refresh to review the result."));
          setUIState("success");
          return;
        }
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
        learningAttempt?: {
          id: number;
          outcome: string;
          failureCategory?: string | null;
          firstFailedTestId?: number | null;
          highestHintLevelShown?: number;
          solvedAfterFailure?: boolean;
        } | null;
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
          learningAttempt: res.learningAttempt,
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
          const m = res.milestone as { id?: unknown; type?: unknown; message?: unknown; previousAverage?: unknown; currentAverage?: unknown };
          if (typeof m.type === "string" && typeof m.message === "string") {
            setMilestone({
              id: typeof m.id === "string" || typeof m.id === "number" ? m.id : m.type,
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
          } catch (genErr: unknown) {
            if (isPlacementRequiredError(genErr)) {
              requestPlacementOpen();
              setConsoleOutput(tr("Для наступної персональної практики потрібно завершити коротку оцінку рівня.", "Complete the short placement assessment to unlock the next personal practice."));
              setUIState("logic-warning");
            }
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
    if (isPreviewMode) {
      setConsoleOutput(tr("Чернетку локально збережено для preview.", "Draft saved locally for preview."));
      setUIState("success");
      return;
    }
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
    if (isPreviewMode) {
      setUIState("evaluating");
      setConsoleOutput(tr("Запуск…", "Running…"));
      window.setTimeout(() => {
        setConsoleOutput("2 7\n\nProcess finished with exit code 0 · 38 ms");
        setUIState("idle");
      }, 350);
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
      if (isCompactViewport) {
        setDockCollapsed(true);
        setDockPopOut(false);
      }
      setShowTaskHistory(true);
      tasksColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      return;
    }
    if (area === "output") {
      if (isCompactViewport) {
        setShowTaskHistory(false);
      }
      setDockPopOut(false);
      setDockCollapsed(false);
      consoleColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      return;
    }
    if (isCompactViewport) {
      setShowTaskHistory(false);
      setDockCollapsed(true);
      setDockPopOut(false);
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

  useEffect(() => {
    if (!isCompactViewport) return;
    setDockPopOut(false);
    setDockCollapsed(true);
    setShowTaskHistory(false);
  }, [isCompactViewport]);

  const canQuickGenerate = canGenerate && !loading && cooldownSecondsLeft <= 0;
  const canQuickSave = Boolean(active && (isPersonalControlQuizTask ? true : currentCodeText.trim()));
  const canQuickRun = Boolean(active && theoryAcknowledged && currentCodeText.trim());
  const canQuickCheck = Boolean(canEdit && !submitting && theoryAcknowledged && currentCodeText.trim());
  const hasTheoryForActive = computeHasTheory(active);
  const activeTaskStatusMeta = active ? sidebarStatusMeta(active.status) : null;
  const activeLessonInTopic = Number(active?.lessonInTopic ?? NaN);
  const hasActiveLessonInTopic = Number.isFinite(activeLessonInTopic) && activeLessonInTopic > 0;
  const activeTaskModeLabel = active?.taskMode === "WEB"
    ? tr("WEB-проєкт", "WEB project")
    : tr("Code задача", "Code task");

  const consoleStateMeta = useMemo(() => {
    if (uiState === "evaluating") {
      return {
        label: submitting
          ? tr("Йде перевірка", "Checking")
          : loading
            ? tr("Генерація", "Generating")
            : quizLoading || quizSubmitting
              ? tr("Тест обробляється", "Quiz processing")
              : tr("Виконується", "Running"),
        toneClass: "border-primary/45 bg-primary/10 text-primary"
      };
    }
    if (uiState === "error") {
      return {
        label: tr("Потребує уваги", "Needs attention"),
        toneClass: "border-accent-error/45 bg-accent-error/10 text-accent-error"
      };
    }
    if (uiState === "logic-warning") {
      return {
        label: tr("Потрібна дія", "Action required"),
        toneClass: "border-accent-logic-warning/45 bg-accent-logic-warning/10 text-accent-logic-warning"
      };
    }
    if (uiState === "success") {
      return {
        label: tr("Оновлено", "Updated"),
        toneClass: "border-accent-success/45 bg-accent-success/10 text-accent-success"
      };
    }
    return {
      label: tr("Готово", "Ready"),
      toneClass: "border-border/70 bg-bg-base/70 text-text-secondary"
    };
  }, [uiState, submitting, loading, quizLoading, quizSubmitting]);

  const activeSectionProgress = useMemo(() => {
    const section = sidebarSections.find((candidate) => candidate.items.some((item) => isSidebarItemActive(item)));
    if (!section) return null;
    const total = section.items.length;
    const completed = section.items.filter((item) => item.status === "GRADED").length;
    const reviewing = section.items.filter((item) => item.status === "SUBMITTED").length;
    const inProgress = Math.max(0, total - completed - reviewing);
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    return {
      sectionTitle: section.title,
      total,
      completed,
      reviewing,
      inProgress,
      progress
    };
  }, [sidebarSections, isSidebarItemActive]);

  if (!theoryPanelOpen && !isPersonalControlQuizTask) {
    const ideLanguage = (active?.language || user.course) as import("../../lib/judgeLanguages").JudgeLanguage;
    const ideEntryFile = active?.userEntryFile || active?.starterEntryFile || entryFile;
    const ideCheckResult: StudyCodIdeCheckResult | null = aiResult ? {
      verdict: Number(aiResult.testsPassed || 0) >= Number(aiResult.testsTotal || 0) ? "AC" : "WA",
      testsPassed: Number(aiResult.testsPassed || 0), testsTotal: Number(aiResult.testsTotal || 0),
      score: Number(aiResult.total || 0), maxScore: 12,
    } : null;
    const ideRunResult: StudyCodIdeRunResult | null = consoleOutput.trim() ? {
      stdout: uiState === "error" ? "" : consoleOutput, stderr: uiState === "error" ? consoleOutput : "",
      exitCode: uiState === "error" ? 1 : 0, success: uiState !== "error",
    } : null;
    return <StudyCodIDEWorkspace
      task={active ? { id: active.id, title: active.title, description: getPracticeText(active), section: active.topicTitle, taskMode: active.taskMode } : { id: "empty", title: tr("Обери завдання", "Choose a task"), description: tr("Вибери завдання з маршруту, щоб почати роботу.", "Choose a task from the route to start working."), section: tr("Особиста практика", "Personal practice") }}
      theory={active && hasTheoryForActive ? getTheoryMarkdown(active) : null}
      language={ideLanguage}
      onLanguageChange={() => undefined}
      compiler={user.course}
      onCompilerChange={() => undefined}
      code={code}
      onCodeChange={setCode}
      files={files.length ? files : [{ path: ideEntryFile, content: code }]}
      onFilesChange={setFiles}
      useFiles={useFiles}
      onEnableFiles={() => { setUseFiles(true); setFiles(files.length ? files : [{ path: ideEntryFile, content: code }]); setMfAddToken((value) => value + 1); }}
      entryFile={ideEntryFile}
      stdin={stdin}
      onStdinChange={setStdin}
      firstExampleInput={undefined}
      onUseExampleInput={() => undefined}
      running={Boolean(active) && uiState === "evaluating" && !submitting}
      checking={Boolean(active) && submitting}
      onRun={() => { if (active) void handleRun(); }}
      onCheck={() => { if (active) void handleSubmit(); }}
      onSave={() => { if (active) void handleSaveDraft(); }}
      onReset={() => setCode(active?.starterCode ?? "")}
      readOnly={!active || !canEdit}
      runResult={ideRunResult}
      checkResult={ideCheckResult}
      isWebTask={isWebTask}
      webPreviewFiles={isWebTask ? toWebTaskFiles() : undefined}
    />;
  }

  const hasConsoleOutput = consoleOutput.trim().length > 0;
  const consoleLineCount = useMemo(() => {
    if (!hasConsoleOutput) return 0;
    return consoleOutput.split(/\r?\n/).length;
  }, [consoleOutput, hasConsoleOutput]);

  const consoleClipboardLabel =
    consoleClipboardState === "copied"
      ? tr("Скопійовано", "Copied")
      : consoleClipboardState === "failed"
        ? tr("Помилка", "Failed")
        : tr("Копіювати", "Copy");

  const isMacPlatform = typeof navigator !== "undefined" && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);
  const modKeyLabel = isMacPlatform ? "вЊ" : "Ctrl";
  const saveShortcutLabel = `${modKeyLabel}+S`;
  const runShortcutLabel = `${modKeyLabel}+Enter`;
  const checkShortcutLabel = `${modKeyLabel}+Shift+Enter`;

  const runFromRail = () => {
    if (!editorOpen) {
      setEditorOpen(true);
      return;
    }
    handleRun();
    if (isCompactViewport) {
      focusWorkspaceArea("output");
    }
  };

  const checkFromRail = () => {
    if (!editorOpen) {
      setEditorOpen(true);
      return;
    }
    handleSubmit();
    if (isCompactViewport) {
      focusWorkspaceArea("output");
    }
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

  const clearConsoleFromToolbar = () => {
    setConsoleOutput("");
    if (uiState !== "evaluating") {
      setUIState("idle");
    }
    setConsoleClipboardState("idle");
  };

  const copyConsoleFromToolbar = async () => {
    if (!hasConsoleOutput) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(consoleOutput);
        setConsoleClipboardState("copied");
        return;
      }
      setConsoleClipboardState("failed");
    } catch {
      setConsoleClipboardState("failed");
    }
  };

  useEffect(() => {
    if (consoleClipboardState === "idle") return;
    const timeout = window.setTimeout(() => {
      setConsoleClipboardState("idle");
    }, 1800);
    return () => window.clearTimeout(timeout);
  }, [consoleClipboardState]);

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return node.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();
      const withMod = event.metaKey || event.ctrlKey;
      const editableTarget = isEditableTarget(event.target);

      if (withMod && key === "s") {
        event.preventDefault();
        if (canQuickSave) saveFromRail();
        return;
      }

      if (withMod && key === "enter") {
        event.preventDefault();
        if (event.shiftKey) {
          if (canQuickCheck) checkFromRail();
        } else if (canQuickRun) {
          runFromRail();
        }
        return;
      }

      if (!withMod && event.altKey && !event.shiftKey && !editableTarget) {
        if (key === "1") {
          event.preventDefault();
          focusWorkspaceArea("mission");
        } else if (key === "2") {
          event.preventDefault();
          focusWorkspaceArea("tasks");
        } else if (key === "3") {
          event.preventDefault();
          focusWorkspaceArea("output");
        } else if (key === "4") {
          event.preventDefault();
          focusWorkspaceArea("live");
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [canQuickCheck, canQuickRun, canQuickSave, checkFromRail, focusWorkspaceArea, runFromRail, saveFromRail]);

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
  const consoleStatusCard = (() => {
    if (uiState === "idle" || uiState === "success") return null;

    if (uiState === "evaluating") {
      const waitingTitle = submitting
        ? tr("Перевірка триває", "Check in progress")
        : loading
          ? tr("Генеруємо завдання", "Generating task")
          : quizLoading || quizSubmitting
            ? tr("Опрацьовуємо тест", "Processing quiz")
            : tr("Виконуємо дію", "Working");
      const waitingDetails = submitting
        ? tr("Оновлюємо результат у цій консолі. Зазвичай це займає до 30 секунд.", "Results will appear in this console. This usually takes up to 30 seconds.")
        : tr("Зачекай завершення операції. Статус оновиться автоматично.", "Wait for the operation to finish. Status updates automatically.");
      return (
        <div className="border border-primary/35 bg-bg-code p-2">
          <div className="text-[11px] font-mono text-primary">{waitingTitle}</div>
          <div className="mt-1 text-xs font-mono text-text-secondary">
            {waitingDetails}
          </div>
          <div className="mt-1 text-[10px] font-mono text-text-muted">
            {tr("Якщо очікування затягнулось, збережи чернетку й повтори дію.", "If this takes unusually long, save your draft and retry.")}
          </div>
        </div>
      );
    }

    if (uiState === "error") {
      return (
        <div className="border border-accent-error/40 bg-bg-code p-2">
          <div className="text-[11px] font-mono text-accent-error">{tr("Є помилка, потрібне відновлення", "Error detected, recovery needed")}</div>
          <div className="mt-1 text-xs font-mono text-text-secondary">
            {tr("Прочитай останній рядок у консолі, виправ проблему та повтори «Перевірити».", "Read the latest console line, fix the issue, then run Check again.")}
          </div>
          {canQuickSave && (
            <div className="mt-2">
              <Button variant="ghost" onClick={handleSaveDraft} className="text-xs">
                {tr("Зберегти перед повтором", "Save before retry")}
              </Button>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="border border-accent-logic-warning/40 bg-bg-code p-2">
        <div className="text-[11px] font-mono text-accent-logic-warning">{tr("Потрібна дія перед продовженням", "Action required before continuing")}</div>
        <div className="mt-1 text-xs font-mono text-text-secondary">
          {tr("Це не системна помилка. Виконай підказку в консолі та повтори дію.", "This is not a system failure. Follow the console hint and retry the action.")}
        </div>
      </div>
    );
  })();
  const inlineFailureMessage = (consoleOutput || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) || "";
  const showInlineFailureRecovery = (uiState === "error" || uiState === "logic-warning") && inlineFailureMessage.length > 0;
  const openOutputRecovery = () => {
    setDockCollapsed(false);
    setDockPopOut(false);
    requestAnimationFrame(() => {
      consoleColumnRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  };

  const previewPractice = active ? getPracticeText(active) : "";
  const compactHints = nonContestHints.slice(0, 4);
  const personalTestResults = aiResult?.testResults ?? [];
  const personalTestsPassed = aiResult?.testsPassed ?? personalTestResults.filter((test) => test.passed).length;
  const personalTestsTotal = aiResult?.testsTotal ?? personalTestResults.length;
  const personalTestFailure = personalTestResults.find((test) => !test.passed);
  const personalFirstFailure: FailureRecoveryData | null = aiResult?.learningFeedback?.firstFailure ?? (personalTestFailure ? {
    testId: personalTestFailure.testId,
    inputPreview: personalTestFailure.input,
    expectedPreview: personalTestFailure.expectedOutput,
    actualPreview: personalTestFailure.actualOutput,
    errorKind: personalTestFailure.errorKind,
    verdict: personalTestFailure.verdict
  } : null);
  const hasPersonalFailure = Boolean(aiResult && (
    aiResult.total < 50 ||
    (personalTestsTotal > 0 && personalTestsPassed < personalTestsTotal)
  ));
  const personalAiResult = aiResult;
  const personalRecoveryVerdict = hasPersonalFailure
    ? (String(aiResult?.learningFeedback?.verdict ?? "WA").toUpperCase() === "AC" ? "WA" : aiResult?.learningFeedback?.verdict ?? "WA")
    : "AC";
  const routeTiles = sidebarSections.flatMap((section) =>
    section.items.map((item) => ({
      sectionTitle: section.title,
      blockTitle: section.blockTitle,
      item,
    }))
  );
  const answeredQuizCount = personalQuiz
    ? Object.values(quizAnswers).filter((value) => String(value ?? "").trim().length > 0).length
    : 0;
  const theoryChapters = splitTheoryIntoChapters(getTheoryMarkdown(active), tr("Основна ідея", "Core idea"));
  const visibleTheoryChapter = theoryChapters[Math.min(activeTheoryChapter, theoryChapters.length - 1)] ?? null;

  const selectedRouteIndex = Math.max(0, routeTiles.findIndex(({ item }) => isSidebarItemActive(item)));

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9">
      <TaskGenerationOverlay open={loading} phase={generationPhase} />

      <div className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-[1500px] flex-col overflow-hidden rounded-[28px] border border-[#152219]/10 bg-white shadow-[0_18px_45px_-38px_rgba(18,39,24,.48)] dark:border-white/10 dark:bg-[#121b15]">
        <header className="flex min-h-16 flex-wrap items-center gap-3 border-b border-[#15231a]/10 px-4 py-3 dark:border-white/[.08] sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold text-[#718077] dark:text-[#93a199]">
                <span>{tr("Особиста практика", "Personal practice")}</span>
                <ChevronRight className="size-3" />
                <span className="truncate">{active?.topicTitle ?? tr("Новий маршрут", "New route")}</span>
              </div>
              <h1 className="truncate text-sm font-black tracking-[-.02em] sm:text-base">{active?.title ?? tr("Обери завдання", "Choose a task")}</h1>
            </div>
          </div>

          {isPreviewMode && (
            <span className="rounded-full bg-[#fff2dc] px-3 py-1.5 text-[11px] font-black text-[#a45a00] dark:bg-[#ff8c00]/10 dark:text-[#ffc06e]">
              {tr("Демо-сценарій", "Demo scenario")}
            </span>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleSaveDraft} disabled={!active || !currentCodeText.trim()} className="hidden h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold text-[#56645b] transition hover:bg-[#edf1ec] disabled:opacity-40 dark:text-[#b2bdb5] dark:hover:bg-white/[.06] sm:flex">
              <Save className="size-4" />{tr("Зберегти", "Save")}
            </button>
            <button type="button" onClick={handleRun} disabled={!canQuickRun || isPersonalControlQuizTask} className="flex h-9 items-center gap-2 rounded-xl border border-[#15231a]/12 bg-white px-3 text-xs font-black shadow-sm transition hover:bg-[#f4f7f3] disabled:opacity-40 dark:border-white/10 dark:bg-white/[.05] dark:hover:bg-white/[.08]">
              <Play className="size-4" />{tr("Запустити", "Run")}
            </button>
            <button type="button" onClick={handleSubmit} disabled={!canQuickCheck} className="flex h-9 items-center gap-2 rounded-xl bg-[#00e980] px-4 text-xs font-black text-[#062213] transition hover:bg-[#00ff88] disabled:opacity-40">
              <CheckCircle2 className="size-4" />{submitting ? tr("Перевіряємо", "Checking") : tr("Здати", "Submit")}
            </button>
          </div>
        </header>

        <div className={`grid min-h-0 flex-1 ${theoryPanelOpen && hasTheoryForActive ? "lg:grid-cols-1" : "lg:grid-cols-[270px_minmax(0,1fr)]"}`}>
          {!theoryPanelOpen || !hasTheoryForActive ? <>
          <aside className="border-b border-[#15231a]/10 bg-[#f5f7f3] dark:border-white/[.08] dark:bg-[#0c120e] lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#7a887f] dark:text-[#8e9a92]">{tr("Маршрут", "Route")}</p>
                <p className="mt-1 text-sm font-black">{sidebarStats.completed}/{sidebarStats.total} {tr("завершено", "complete")}</p>
              </div>
              <span className="text-xs font-black text-[#16834d] dark:text-[#6fe5a9]">{sidebarStats.progress}%</span>
            </div>
            <div className="mx-4 h-1 overflow-hidden rounded-full bg-[#dfe5de] dark:bg-white/10"><div className="h-full rounded-full bg-[#00df79]" style={{ width: `${sidebarStats.progress}%` }} /></div>

            <nav className="flex gap-2 overflow-x-auto p-3 lg:block lg:max-h-[calc(100dvh-180px)] lg:space-y-1 lg:overflow-y-auto">
              {routeTiles.map(({ sectionTitle, blockTitle, item }, index) => {
                const selected = isSidebarItemActive(item);
                const done = item.status === "GRADED";
                return (
                  <React.Fragment key={item.id}>
                    {(index === 0 || routeTiles[index - 1].blockTitle !== blockTitle) && (
                      <div className="px-2 pb-1 pt-3 text-[10px] font-black uppercase tracking-[.14em] text-[#16834d] dark:text-[#72edb0]">{blockTitle}</div>
                    )}
                    <button type="button" onClick={() => openSidebarTask(item.openTask)} className={`flex min-w-[230px] items-start gap-3 rounded-[14px] px-3 py-3 text-left transition lg:min-w-0 lg:w-full ${selected ? "bg-white shadow-[0_6px_20px_rgba(26,43,31,.07)] ring-1 ring-[#17251b]/[.06] dark:bg-white/[.07] dark:ring-white/10" : "hover:bg-white/70 dark:hover:bg-white/[.04]"}`}>
                      <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${done ? "bg-[#dff8e9] text-[#147447] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : selected ? "bg-[#17251b] text-white dark:bg-[#00ff88] dark:text-[#062211]" : "border border-[#cbd4cc] text-[#7c8980] dark:border-white/15"}`}>{done ? "✓" : index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-black">{item.renderTitle}</span>
                        <span className="mt-1 block truncate text-[10px] font-semibold text-[#7a887f] dark:text-[#8e9a92]">{sectionTitle}</span>
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
              {!routeTiles.length && <p className="p-4 text-sm text-[#718077]">{tr("Завдань поки немає.", "No tasks yet.")}</p>}
            </nav>

            <div className="hidden border-t border-[#15231a]/10 p-4 dark:border-white/[.08] lg:block">
              <button type="button" onClick={() => void handleGenerate()} disabled={loading || !canGenerateFromSidebar || cooldownSecondsLeft > 0} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#17251b] px-4 py-3 text-xs font-black text-white disabled:opacity-40 dark:bg-white/[.08]">
                <Plus className="size-4" />{generateSidebarLabel}
              </button>
              <button type="button" onClick={() => void handleGenerate({ forceControl: true })} disabled={loading || sidebarStats.completed <= 0 || !canGenerateNew || cooldownSecondsLeft > 0} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#17251b]/10 bg-white px-4 py-3 text-xs font-black text-[#17251b] disabled:opacity-40 dark:border-white/10 dark:bg-white/[.045] dark:text-[#eaf5ee]">
                <NotebookPen className="size-4" />{tr("Самоконтроль", "Self-check")}
              </button>
            </div>
          </aside>
          </> : null}

          <main className={`grid min-h-0 ${theoryPanelOpen && hasTheoryForActive ? "grid-cols-1" : "xl:grid-cols-[minmax(0,1fr)_360px]"}`}>
            <section className="flex min-h-0 min-w-0 flex-col">
              <div className="border-b border-[#15231a]/10 px-5 py-5 dark:border-white/[.08] sm:px-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-3xl">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#72edb0]">
                      <span>{String(selectedRouteIndex + 1).padStart(2, "0")}</span><span>·</span><span>{activeTaskModeLabel}</span><span>·</span><span>{activeTaskStatusMeta?.label}</span>
                    </div>
                    <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-black tracking-[-.045em] sm:text-3xl">{active?.title}</h2>
                    <div className="mt-3 line-clamp-3 text-sm leading-6 text-[#5f6e64] dark:text-[#b3bfb6]">
                      {previewPractice ? <MarkdownView content={segmentedPractice.task || previewPractice} /> : tr("Вибери завдання з маршруту, щоб почати.", "Choose a task from the route to begin.")}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setStatementModalOpen(true)} disabled={!active} className="rounded-xl bg-[#eef2ed] px-3 py-2 text-xs font-black dark:bg-white/[.06]">{tr("Повна умова", "Full brief")}</button>
                    <button type="button" onClick={() => setTheoryPanelOpen((value) => !value)} disabled={!hasTheoryForActive} className={`rounded-xl px-3 py-2 text-xs font-black transition disabled:opacity-40 ${theoryPanelOpen ? "bg-[#17251b] text-white dark:bg-[#e9f2ec] dark:text-[#102016]" : "bg-[#eef2ed] dark:bg-white/[.06]"}`}>{theoryPanelOpen ? tr("До коду", "Back to code") : tr("Пояснення", "Explanation")}</button>
                  </div>
                </div>
              </div>

              {theoryPanelOpen && hasTheoryForActive ? (
                <div className="grid min-h-0 flex-1 overflow-hidden bg-[#f8faf6] dark:bg-[#101612] lg:grid-cols-[210px_minmax(0,1fr)]">
                  <nav className="flex gap-2 overflow-x-auto border-b border-[#152219]/10 p-4 dark:border-white/10 lg:block lg:space-y-1 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-5">
                    <p className="mb-3 hidden text-[10px] font-black uppercase tracking-[.16em] text-[#7a887f] lg:block">{tr("Зміст", "Contents")}</p>
                    {theoryChapters.map((chapter, index) => (
                      <button type="button" key={`${index}-${chapter.title}`} onClick={() => setActiveTheoryChapter(index)} className={`flex min-w-[190px] items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition lg:min-w-0 lg:w-full ${index === activeTheoryChapter ? "bg-white text-[#17251b] shadow-sm dark:bg-white/[.08] dark:text-white" : "text-[#6f7d73] hover:bg-white/60 dark:text-[#98a69c] dark:hover:bg-white/[.04]"}`}>
                        <span className={`grid size-6 shrink-0 place-items-center rounded-lg text-[10px] font-black ${index === activeTheoryChapter ? "bg-[#e3f8eb] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#e9ede8] dark:bg-white/[.06]"}`}>{String(index + 1).padStart(2, "0")}</span>
                        <span className="truncate">{chapter.title}</span>
                      </button>
                    ))}
                  </nav>
                  <div className="min-h-0 overflow-y-auto px-5 py-8 sm:px-10 sm:py-12">
                  <article className="mx-auto max-w-[760px]">
                    <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[.16em] text-[#16834d] dark:text-[#72edb0]">
                      <span className="h-px w-8 bg-current" />
                      {tr(`Частина ${activeTheoryChapter + 1} з ${theoryChapters.length}`, `Part ${activeTheoryChapter + 1} of ${theoryChapters.length}`)}
                    </div>
                    <h3 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.055em] sm:text-5xl">
                      {visibleTheoryChapter?.title}
                    </h3>
                    <p className="mt-5 max-w-2xl text-base leading-7 text-[#68776d] dark:text-[#aebbb1]">
                      {tr("Коротке пояснення підводить до рішення, але залишає реалізацію тобі.", "A short explanation guides you toward the solution while leaving the implementation to you.")}
                    </p>
                    <div className="mt-10 border-l-2 border-[#00d978] pl-5 text-[15px] leading-8 text-[#26342b] dark:text-[#d4dfd7] sm:pl-8">
                      <MarkdownView content={visibleTheoryChapter?.markdown || getTheoryMarkdown(active)} />
                    </div>
                    <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-[#15231a]/10 pt-6 dark:border-white/10">
                      <button type="button" onClick={() => setActiveTheoryChapter((value) => Math.max(0, value - 1))} disabled={activeTheoryChapter === 0} className="inline-flex h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-[#68776d] disabled:opacity-30 dark:text-[#aebbb1]"><ChevronLeft className="size-4" />{tr("Назад", "Previous")}</button>
                      {activeTheoryChapter < theoryChapters.length - 1 ? <button type="button" onClick={() => setActiveTheoryChapter((value) => Math.min(theoryChapters.length - 1, value + 1))} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#17251b] px-5 text-sm font-black text-white dark:bg-[#edf3ef] dark:text-[#0b120e]">{tr("Наступна частина", "Next part")}<ChevronRight className="size-4" /></button> : <button type="button" onClick={() => { setTheoryAcknowledged(true); setTheoryPanelOpen(false); }} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#00e980] px-5 text-sm font-black text-[#062213] transition hover:bg-[#00ff88]">{tr("До практики", "Start practice")}<ChevronRight className="size-4" /></button>}
                    </div>
                  </article>
                  </div>
                </div>
              ) : isPersonalControlQuizTask ? (
                <div ref={quizScrollRef} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
                  <div className="mx-auto max-w-3xl">
                    <h3 className="text-xl font-black">{tr("Теоретичний тест", "Theory quiz")}</h3>
                    <p className="mt-2 text-sm text-[#718077]">{answeredQuizCount}/{personalQuiz?.questions.length ?? 0} {tr("відповідей", "answered")}</p>
                    <div className="mt-6 space-y-4">{personalQuiz?.questions.map((q) => <article key={q.index} className="rounded-2xl border border-[#15231a]/10 p-5 dark:border-white/10"><p className="font-black">{q.index + 1}. {q.question}</p><div className="mt-4 grid gap-2">{Object.entries(q.options).map(([label, value]) => <button type="button" key={label} onClick={() => setQuizAnswers((old) => ({ ...old, [q.index]: label }))} className={`rounded-xl border px-4 py-3 text-left text-sm ${quizAnswers[q.index] === label ? "border-[#00d978] bg-[#e9f9ef] dark:bg-[#00ff88]/10" : "border-[#15231a]/10 dark:border-white/10"}`}><b className="mr-2">{label}</b>{value}</button>)}</div></article>)}</div>
                  </div>
                </div>
              ) : (
                <div className="min-h-[480px] flex-1 bg-[#101612]">
                  {isWebTask ? <div className="grid h-full lg:grid-cols-2"><MultiFileEditor language="html" entryFile="index.html" files={files} onChange={setFiles} readOnly={!canEdit} requestAddToken={mfAddToken} /><WebPreviewPane files={toWebTaskFiles()} title={tr("Превʼю", "Preview")} /></div> : useFiles ? <MultiFileEditor language={user.course} entryFile={entryFile} files={files} onChange={setFiles} readOnly={!canEdit} requestAddToken={mfAddToken} /> : <CodeEditor language={active?.language ?? user.course} value={code} onChange={canEdit ? setCode : undefined} readOnly={!canEdit} />}
                </div>
              )}
            </section>

            {!theoryPanelOpen || !hasTheoryForActive ? <aside className="flex min-h-0 flex-col border-t border-[#15231a]/10 bg-[#f6f8f4] dark:border-white/[.08] dark:bg-[#0c120e] xl:border-l xl:border-t-0">
              <div className="border-b border-[#15231a]/10 p-5 dark:border-white/[.08]">
                <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#7a887f]">{tr("Вхідні дані", "Input")}</p><button type="button" onClick={() => setStdin(firstExampleInput)} className="text-[10px] font-black text-[#16834d] dark:text-[#72edb0]">{tr("Взяти з прикладу", "Use example")}</button></div>
                <textarea value={stdin} onChange={(event) => setStdin(event.target.value)} spellCheck={false} className="mt-3 min-h-24 w-full resize-y rounded-xl border border-[#15231a]/10 bg-white p-3 font-mono text-xs outline-none focus:border-[#00d978] dark:border-white/10 dark:bg-white/[.04]" />
              </div>

              <div className="min-h-[220px] flex-1 p-5">
                <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[.16em] text-[#7a887f]">{tr("Результат", "Result")}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${consoleStateMeta.toneClass}`}>{consoleStateMeta.label}</span></div>
                {aiResult && <div className="mt-4 flex items-end gap-2"><span className="text-5xl font-black tracking-[-.08em] text-[#16834d] dark:text-[#72edb0]">{aiResult.total}</span><span className="pb-2 text-xs font-bold text-[#718077]">/ {isPersonalControlQuizTask ? 100 : 12}</span></div>}
                {aiResult?.aiFeedback && <p className="mt-3 text-sm leading-6 text-[#4f5f55] dark:text-[#b8c4bb]">{aiResult.aiFeedback}</p>}
                <pre className="mt-4 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-[#111713] p-4 font-mono text-xs leading-6 text-[#cfe0d3]">{consoleOutput || tr("Результат запуску з’явиться тут.", "Run output will appear here.")}</pre>
              </div>

              <div className="border-t border-[#15231a]/10 p-5 dark:border-white/[.08]">
                <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#7a887f]">{tr("Мої нотатки", "My notes")}</p>
                <textarea value={personalNotes} onChange={(event) => setPersonalNotes(event.target.value)} placeholder={tr("Ідея, крайовий випадок…", "Idea, edge case…")} className="mt-3 min-h-20 w-full resize-none bg-transparent text-sm leading-6 outline-none placeholder:text-[#9aa59d]" />
              </div>
            </aside> : null}
          </main>
        </div>
      </div>

      {isCompactViewport && active ? (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom)+0.75rem)] z-30 grid grid-cols-4 gap-1.5 rounded-2xl border border-[#132018]/10 bg-white/95 p-1.5 shadow-[0_18px_48px_rgba(18,39,24,.18)] backdrop-blur dark:border-white/10 dark:bg-[#121b15]/95 lg:hidden">
          <button type="button" onClick={() => setStatementModalOpen(true)} className="min-h-11 rounded-xl px-2 text-[11px] font-black text-[#536359] hover:bg-[#eef3ed] dark:text-[#b7c5ba] dark:hover:bg-white/[.06]">
            {tr("Умова", "Brief")}
          </button>
          <button type="button" onClick={() => focusWorkspaceArea("mission")} className="min-h-11 rounded-xl px-2 text-[11px] font-black text-[#536359] hover:bg-[#eef3ed] dark:text-[#b7c5ba] dark:hover:bg-white/[.06]">
            {tr("Код", "Code")}
          </button>
          <button type="button" onClick={runFromRail} disabled={!canQuickRun} className="min-h-11 rounded-xl bg-[#edf5ee] px-2 text-[11px] font-black text-[#17653e] disabled:opacity-40 dark:bg-white/[.07] dark:text-[#72edb0]">
            {tr("Запуск", "Run")}
          </button>
          <button type="button" onClick={checkFromRail} disabled={!canQuickCheck} className="min-h-11 rounded-xl bg-[#00e980] px-2 text-[11px] font-black text-[#062213] disabled:opacity-40">
            {tr("Здати", "Submit")}
          </button>
        </div>
      ) : null}

      <Modal open={statementModalOpen} onClose={() => setStatementModalOpen(false)} title={tr("Умова завдання", "Task brief")} description={active?.title}>
        {fullPracticeText ? <MarkdownView content={fullPracticeText} /> : <p>{tr("Умова недоступна.", "Brief unavailable.")}</p>}
      </Modal>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-[#f5f6f1] text-[#111812] dark:bg-[#080d0a] dark:text-[#eef7f0]">
      <TaskGenerationOverlay open={loading} phase={generationPhase} />

      <div className="mx-auto flex min-h-[100dvh] max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <header className="rounded-[34px] border border-[#132018]/10 bg-white/90 p-4 shadow-[0_20px_70px_rgba(21,35,24,.07)] backdrop-blur dark:border-white/10 dark:bg-[#101612]/92 sm:p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[#101812] px-3 py-1 text-[11px] font-black uppercase tracking-[.18em] text-[#7bf0b4] dark:bg-white/[.08]">
                  {tr("Робочий простір StudyCod", "StudyCod workbench")}
                </span>
                <span className={`rounded-full border px-3 py-1 text-[11px] font-bold ${lessonStatusMeta.pillClass}`}>
                  {lessonStatusMeta.label}
                </span>
                <span className="rounded-full bg-[#edf2ea] px-3 py-1 text-[11px] font-bold text-[#647267] dark:bg-white/[.06] dark:text-[#b9c6bc]">
                  {activeTaskModeLabel}
                </span>
              </div>
              <div className="mt-4 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[.2em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Особисті завдання", "Personal tasks")}</p>
                  <h1 className="mt-1 truncate font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.07em] text-[#101812] dark:text-white sm:text-5xl">
                    {active?.title ?? tr("Почни нову практичну сесію", "Create a clean practice session")}
                  </h1>
                </div>
                <div className="w-full max-w-md">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-[.14em] text-[#6f7e72] dark:text-[#9faca3]">
                    <span>{tr("Прогрес маршруту", "Route progress")}</span>
                    <span>{sidebarStats.progress}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8df] dark:bg-white/10">
                    <div className="h-full rounded-full bg-[#00ff88]" style={{ width: `${sidebarStats.progress}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-bold text-[#6f7e72] dark:text-[#9faca3]">
                    {tr(`${sidebarStats.completed}/${sidebarStats.total || 0} виконано`, `${sidebarStats.completed}/${sidebarStats.total || 0} completed`)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => setStatementModalOpen(true)}
                disabled={!active}
                className="rounded-2xl border border-[#132018]/10 bg-white px-4 py-3 text-sm font-bold text-[#17221a] shadow-[0_8px_20px_rgba(21,35,24,.05)] transition hover:-translate-y-0.5 disabled:opacity-45 dark:border-white/10 dark:bg-white/[.05] dark:text-white"
              >
                {tr("Умова", "Brief")}
              </button>
              <button
                type="button"
                onClick={() => active && hasTheoryForActive && openTheory({
                  title: tr("Теорія", "Theory"),
                  markdown: getTheoryMarkdown(active),
                  acknowledgeLabel: tr("Я прочитав/прочитала теорію", "I have read the theory"),
                  onAcknowledge: () => setTheoryAcknowledged(true)
                })}
                disabled={!active || !hasTheoryForActive}
                className="rounded-2xl border border-[#132018]/10 bg-white px-4 py-3 text-sm font-bold text-[#17221a] shadow-[0_8px_20px_rgba(21,35,24,.05)] transition hover:-translate-y-0.5 disabled:opacity-45 dark:border-white/10 dark:bg-white/[.05] dark:text-white"
              >
                {tr("Теорія", "Theory")}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate()}
                disabled={loading || !canGenerateFromSidebar || cooldownSecondsLeft > 0}
                title={generateSidebarHint}
                className="rounded-2xl bg-[#00ff88] px-5 py-3 text-sm font-black text-[#061d10] shadow-[0_16px_36px_rgba(0,190,102,.18)] transition hover:-translate-y-0.5 disabled:opacity-45"
              >
                {generateSidebarLabel}
              </button>
              <button
                type="button"
                onClick={() => void handleGenerate({ forceControl: true })}
                disabled={loading || sidebarStats.completed <= 0 || !canGenerateNew || cooldownSecondsLeft > 0}
                className="rounded-2xl border border-[#132018]/10 bg-white px-4 py-3 text-sm font-black text-[#17221a] shadow-[0_8px_20px_rgba(21,35,24,.05)] transition hover:-translate-y-0.5 disabled:opacity-45 dark:border-white/10 dark:bg-white/[.05] dark:text-white"
              >
                {tr("Самоконтроль", "Self-check")}
              </button>
            </div>
          </div>
        </header>

        <section className="rounded-[30px] border border-[#132018]/10 bg-white/88 p-3 shadow-[0_16px_50px_rgba(21,35,24,.055)] dark:border-white/10 dark:bg-[#101612]/92">
          {routeTiles.length ? (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {routeTiles.map(({ sectionTitle, item }, index) => {
                const isActive = isSidebarItemActive(item);
                const statusMeta = sidebarStatusMeta(item.status);
                const itemSubtitle = String((item as { subtitle?: string }).subtitle ?? item.openTask?.subtitle ?? sectionTitle);
                return (
                  <button
                    type="button"
                    key={`${sectionTitle}-${item.id}`}
                    onClick={() => openSidebarTask(item.openTask)}
                    className={`group min-w-[250px] rounded-[22px] border px-4 py-3 text-left transition hover:-translate-y-0.5 ${
                      isActive
                        ? "border-[#00ff88]/55 bg-[#ebfbf0] shadow-[0_16px_34px_rgba(0,185,99,.12)] dark:bg-[#00ff88]/10"
                        : "border-[#132018]/10 bg-[#f8faf6] hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-[.16em] text-[#77867a] dark:text-[#9faca3]">
                          {String(index + 1).padStart(2, "0")} · {sectionTitle}
                        </span>
                        <strong className="mt-1 block truncate text-sm font-black tracking-[-.025em] text-[#101812] dark:text-white">
                          {item.renderTitle}
                        </strong>
                        <span className="mt-1 block truncate text-xs font-medium text-[#6a786d] dark:text-[#adbbb1]">
                          {itemSubtitle}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black ${statusMeta.pillClass}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-dashed border-[#132018]/15 px-6 py-7 text-center dark:border-white/10">
              <p className="text-sm font-bold text-[#627066] dark:text-[#adbbb1]">
                {tr("Завдань ще немає. Створи перше завдання зеленою кнопкою вище.", "No generated tasks yet. Start with the green button above.")}
              </p>
            </div>
          )}
        </section>

        <main className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="min-w-0 rounded-[34px] border border-[#132018]/10 bg-white shadow-[0_24px_80px_rgba(21,35,24,.075)] dark:border-white/10 dark:bg-[#101612]">
            {!active ? (
              <div className="grid min-h-[720px] place-items-center px-8 text-center">
                <div className="max-w-md">
                  <div className="mx-auto grid size-16 place-items-center rounded-[24px] bg-[#fff3df] text-[#ff8c00] dark:bg-[#ff8c00]/12">
                    <Sparkles className="size-8" />
                  </div>
                  <h2 className="mt-6 font-[family-name:var(--font-display)] text-3xl font-black tracking-[-.06em]">{tr("Нічого не вибрано", "Nothing selected")}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#647267] dark:text-[#adbbb1]">
                    {tr("Згенеруй завдання або вибери його в маршруті. Редактор, умова, вхідні дані й перевірка зібрані в одному чистому робочому просторі.", "Generate a task or choose one from the route ribbon. The editor, brief, run input and review tools stay in one clean workspace.")}
                  </p>
                </div>
              </div>
            ) : isPersonalControlQuizTask ? (
              <div className="min-h-[720px] space-y-4 p-4 sm:p-5">
                <div className="rounded-[28px] border border-[#132018]/10 bg-[#f8faf6] p-5 dark:border-white/10 dark:bg-white/[.045]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff8c00]">{tr("Контрольна точка", "Control checkpoint")}</p>
                      <h2 className="mt-2 text-2xl font-black tracking-[-.055em]">{tr("Дай відповіді на питання з теорії", "Answer the theory questions")}</h2>
                      <p className="mt-2 text-sm text-[#647267] dark:text-[#adbbb1]">
                        {tr(`${answeredQuizCount}/${personalQuiz?.questions.length ?? 0} відповідей`, `${answeredQuizCount}/${personalQuiz?.questions.length ?? 0} answered`)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canEdit || quizSubmitting || quizLoading || !!quizReview || !theoryAcknowledged || !personalQuiz || answeredQuizCount < (personalQuiz?.questions.length ?? 0)}
                      className="rounded-2xl bg-[#00ff88] px-5 py-3 text-sm font-black text-[#061d10] disabled:opacity-45"
                    >
                      {tr("Надіслати тест", "Submit quiz")}
                    </button>
                  </div>
                </div>

                {quizLoading ? (
                  <div className="rounded-[28px] border border-[#132018]/10 bg-white p-6 text-sm font-bold text-[#647267] dark:border-white/10 dark:bg-white/[.045] dark:text-[#adbbb1]">{tr("Завантаження тесту…", "Loading quiz…")}</div>
                ) : personalQuiz ? (
                  <div className="grid gap-3">
                    {personalQuiz?.questions.map((q) => {
                      const selected = quizAnswers[q.index] ?? "";
                      const review = quizReview?.find((r) => r.index === q.index) ?? null;
                      return (
                        <article key={q.index} id={`quiz-q-${q.index}`} className="min-w-0 overflow-hidden rounded-[28px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                          <h3 className="min-w-0 break-words text-base font-black tracking-[-.02em]">{q.index + 1}. {q.question}</h3>
                          <div className="mt-4 grid min-w-0 gap-2">
                            {Object.entries(q.options || {}).map(([label, text]) => {
                              const isSelected = selected === label;
                              const isCorrect = review ? review.correct === label : false;
                              const isWrongSelected = review ? review.student === label && !review.isCorrect : false;
                              const tone = review
                                ? (isCorrect ? "border-[#00ff88]/65 bg-[#ebfbf0] dark:bg-[#00ff88]/10" : isWrongSelected ? "border-[#ff6b9d]/65 bg-[#fff0f4] dark:bg-[#ff6b9d]/10" : "border-[#132018]/10 bg-[#f8faf6] dark:bg-white/[.045]")
                                : (isSelected ? "border-[#00ff88]/65 bg-[#ebfbf0] dark:bg-[#00ff88]/10" : "border-[#132018]/10 bg-[#f8faf6] hover:bg-white dark:border-white/10 dark:bg-white/[.045]");
                              return (
                                <button
                                  type="button"
                                  key={label}
                                  onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.index]: label }))}
                                  disabled={quizSubmitting || !!quizReview}
                                  className={`min-w-0 whitespace-normal break-words rounded-2xl border px-4 py-3 text-left text-sm leading-6 transition ${tone}`}
                                >
                                  <strong className="mr-2">{label}</strong><span className="break-words">{text}</span>
                                </button>
                              );
                            })}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-[#132018]/10 bg-white p-6 text-sm font-bold text-[#647267] dark:border-white/10 dark:bg-white/[.045] dark:text-[#adbbb1]">{tr("Дані тесту недоступні.", "Quiz data is not available.")}</div>
                )}

                {quizSummary ? (
                  <div className="rounded-[28px] bg-[#ebfbf0] p-5 text-sm font-black text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                    {tr("Підсумкова оцінка", "Final grade")}: {quizSummary?.finalGrade ?? "—"}/{quizSummary?.maxGrade ?? "—"}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid min-h-[760px] gap-0 2xl:grid-cols-[minmax(0,1fr)_390px]">
                <div className="min-w-0 p-3 sm:p-4">
                  <div className="overflow-hidden rounded-[30px] border border-[#0d1510]/10 bg-[#0d1510] shadow-[0_24px_70px_rgba(8,16,11,.18)] dark:border-white/10">
                    <div className="flex flex-col gap-3 border-b border-white/10 bg-[#121b15] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#7bf0b4]">
                          {isWebTask ? tr("Web-полотно", "Web canvas") : tr("Полотно коду", "Code canvas")}
                        </p>
                        <h2 className="mt-1 truncate text-lg font-black tracking-[-.035em] text-white">{active?.title}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canEdit && !isPersonalControlQuizTask ? (
                          <button type="button" onClick={requestCreateFile} className="rounded-xl bg-white/[.08] px-3 py-2 text-xs font-black text-[#d8e7dc] transition hover:bg-white/[.13]">
                            {tr("Новий файл", "New file")}
                          </button>
                        ) : null}
                        <button type="button" onClick={handleSaveDraft} disabled={!active || !currentCodeText.trim() || !theoryAcknowledged} className="rounded-xl bg-white/[.08] px-3 py-2 text-xs font-black text-[#d8e7dc] transition hover:bg-white/[.13] disabled:opacity-40">
                          {tr("Зберегти", "Save")}
                        </button>
                        <button type="button" onClick={handleRun} disabled={!active || !currentCodeText.trim() || !theoryAcknowledged || isPersonalControlQuizTask} className="rounded-xl bg-white px-3 py-2 text-xs font-black text-[#0d1510] transition hover:bg-[#eef7f0] disabled:opacity-40">
                          {tr("Запустити", "Run")}
                        </button>
                        <button type="button" onClick={handleSubmit} disabled={!canEdit || submitting || !theoryAcknowledged || !currentCodeText.trim()} className="rounded-xl bg-[#00ff88] px-4 py-2 text-xs font-black text-[#061d10] transition hover:brightness-105 disabled:opacity-40">
                          {tr("Перевірити", "Check")}
                        </button>
                      </div>
                    </div>

                    <div className="h-[680px] min-h-[680px] bg-[#0d1510]">
                      {isWebTask ? (
                        <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-2">
                          <MultiFileEditor
                            language="html"
                            entryFile="index.html"
                            files={files.length ? files : [{ path: "index.html", content: code }, { path: "styles.css", content: "" }, { path: "script.js", content: "" }]}
                            onChange={(next) => {
                              const normalized = normalizeFiles(next);
                              setUseFiles(true);
                              setFiles(normalized);
                              setCode(normalized.find((file) => file.path === "index.html")?.content ?? "");
                            }}
                            readOnly={!canEdit}
                            requestAddToken={mfAddToken}
                          />
                          <WebPreviewPane files={toWebTaskFiles()} title={tr("Превʼю", "Preview")} />
                        </div>
                      ) : useFiles ? (
                        <MultiFileEditor
                          language={user.course}
                          entryFile={entryFile}
                          files={files.length ? files : [{ path: entryFile, content: code }]}
                          onChange={setFiles}
                          readOnly={!canEdit}
                          requestAddToken={mfAddToken}
                        />
                      ) : (
                        <CodeEditor language={user.course} value={code} onChange={canEdit ? setCode : undefined} readOnly={!canEdit} />
                      )}
                    </div>
                  </div>
                </div>

                <aside className="border-t border-[#132018]/10 bg-[#f8faf6] p-4 dark:border-white/10 dark:bg-white/[.035] 2xl:border-l 2xl:border-t-0">
                  <div className="flex h-full min-h-[680px] flex-col gap-4">
                    <article className="rounded-[26px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs font-black uppercase tracking-[.18em] text-[#16834d] dark:text-[#72edb0]">{tr("Умова", "Brief")}</p>
                        <button type="button" onClick={() => setStatementModalOpen(true)} className="text-xs font-black text-[#16834d] dark:text-[#72edb0]">{tr("Відкрити повністю", "Open full")}</button>
                      </div>
                      <div className="mt-4 max-h-[310px] overflow-y-auto text-sm leading-7 text-[#354239] dark:text-[#d6e3da]">
                        {previewPractice ? <MarkdownView content={previewPractice} /> : <p className="text-[#647267] dark:text-[#adbbb1]">{tr("Умова завдання поки недоступна.", "Task statement is not available yet.")}</p>}
                      </div>
                    </article>

                    <article className="rounded-[26px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                      <label className="text-xs font-black uppercase tracking-[.18em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Вхідні дані", "Input")}</label>
                      <textarea
                        value={stdin}
                        onChange={(event) => setStdin(event.target.value)}
                        className="mt-3 min-h-[105px] w-full resize-y rounded-2xl border border-[#132018]/10 bg-[#f8faf6] px-4 py-3 font-mono text-sm text-[#111812] outline-none transition focus:border-[#00ff88]/70 dark:border-white/10 dark:bg-white/[.05] dark:text-[#eef7f0]"
                        spellCheck={false}
                      />
                    </article>

                    <article className="rounded-[26px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                      <p className="text-xs font-black uppercase tracking-[.18em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Нотатки", "Notes")}</p>
                      <textarea
                        value={personalNotes}
                        onChange={(event) => setPersonalNotes(event.target.value)}
                        className="mt-3 min-h-[125px] w-full resize-y rounded-2xl border border-[#132018]/10 bg-[#f8faf6] px-4 py-3 text-sm leading-6 text-[#111812] outline-none transition focus:border-[#00ff88]/70 dark:border-white/10 dark:bg-white/[.05] dark:text-[#eef7f0]"
                        placeholder={tr("Ідеї, edge cases, наступна спроба…", "Ideas, edge cases, next attempt…")}
                      />
                    </article>
                  </div>
                </aside>
              </div>
            )}
          </section>

          <aside className="grid min-h-[760px] grid-rows-[auto_1fr_auto] overflow-hidden rounded-[34px] border border-[#132018]/10 bg-white shadow-[0_24px_80px_rgba(21,35,24,.075)] dark:border-white/10 dark:bg-[#101612]">
            <div className="border-b border-[#132018]/10 p-5 dark:border-white/10">
              <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff8c00]">{tr("Панель перевірки", "Review board")}</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-.055em]">{consoleStateMeta.label}</h2>
              <p className="mt-2 text-sm leading-6 text-[#647267] dark:text-[#adbbb1]">
                {tr("Тут зібрані результат запуску, підказки й остання перевірка. Редактор лишається чистим, а аналіз — поруч.", "Feedback, run output and hints are grouped here. The editor stays clean, while review remains close at hand.")}
              </p>
              {showInlineFailureRecovery ? (
                <button type="button" onClick={openOutputRecovery} className="mt-4 rounded-2xl bg-[#fff0f4] px-4 py-2 text-sm font-black text-[#b32555] dark:bg-[#ff6b9d]/10 dark:text-[#ff9fbd]">
                  {tr("Показати відновлення", "View recovery")}
                </button>
              ) : null}
            </div>

            <div className="min-h-0 space-y-4 overflow-y-auto bg-[#f8faf6] p-4 dark:bg-white/[.035]">
              {aiResult ? (
                <article className="rounded-[26px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-[#16834d] dark:text-[#72edb0]">{tr("Останній результат", "Latest score")}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-5xl font-black tracking-[-.08em]">{aiResult?.total ?? 0}</span>
                    <span className="pb-2 text-sm font-bold text-[#647267] dark:text-[#adbbb1]">{tr("балів", "points")}</span>
                  </div>
                  {aiResult?.gradingMode === "TESTS" ? (
                    <p className="mt-3 text-sm font-bold text-[#647267] dark:text-[#adbbb1]">
                      {tr("Тести", "Tests")}: {aiResult?.testsPassed ?? 0}/{aiResult?.testsTotal ?? 0}
                    </p>
                  ) : null}
                  {aiResult?.aiFeedback ? (
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#354239] dark:text-[#d6e3da]">{aiResult?.aiFeedback}</p>
                  ) : null}
                </article>
              ) : null}

              {personalAiResult && hasPersonalFailure ? (
                <FailureRecoveryCard
                  verdict={personalRecoveryVerdict}
                  testsPassed={personalTestsPassed}
                  testsTotal={personalTestsTotal}
                  score={personalAiResult!.total}
                  maxScore={100}
                  firstFailure={personalFirstFailure}
                  taskId={active?.id}
                  taskKind="PERSONAL"
                  learningAttemptId={personalAiResult!.learningAttempt?.id ?? null}
                  failureCategory={personalAiResult!.learningAttempt?.failureCategory ?? personalFirstFailure?.errorKind ?? null}
                  highestHintLevelShown={personalAiResult!.learningAttempt?.highestHintLevelShown ?? 0}
                  onTryAgain={() => {
                    setAiResult(null);
                    setRevealedHints(0);
                    setConsoleOutput("");
                    setUIState("idle");
                    setEditorOpen(true);
                  }}
                />
              ) : null}

              {aiResult?.learningAttempt?.solvedAfterFailure && !hasPersonalFailure ? (
                <article className="rounded-[26px] border border-[#00d978]/30 bg-[#ebfbf0] p-5 text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                  <p className="text-xs font-black uppercase tracking-[.18em]">{tr("Навичку закріплено", "Skill reinforced")}</p>
                  <p className="mt-2 text-sm leading-6">{tr("Ти виправив попередню помилку й успішно пройшов перевірку. Це і є прогрес.", "You fixed the previous mistake and passed the check. That is real progress.")}</p>
                </article>
              ) : null}

              <article className="rounded-[26px] border border-[#132018]/10 bg-[#0d1510] p-5 text-[#dce9df] dark:border-white/10">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-[#7bf0b4]">{tr("Вивід", "Output")}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={copyConsoleFromToolbar} disabled={!hasConsoleOutput} className="rounded-xl bg-white/[.08] px-2.5 py-1.5 text-xs font-black text-[#dce9df] disabled:opacity-40">
                      {consoleClipboardLabel}
                    </button>
                    <button type="button" onClick={clearConsoleFromToolbar} disabled={!hasConsoleOutput} className="rounded-xl bg-white/[.08] px-2.5 py-1.5 text-xs font-black text-[#dce9df] disabled:opacity-40">
                      {tr("Очистити", "Clear")}
                    </button>
                  </div>
                </div>
                <pre className="mt-4 max-h-[360px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6">
                  {consoleOutput || tr("Запусти код або надішли перевірку, щоб побачити результат.", "Run code or submit a check to see output here.")}
                </pre>
              </article>

              {compactHints.length ? (
                <article className="rounded-[26px] border border-[#132018]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121914]">
                  <p className="text-xs font-black uppercase tracking-[.18em] text-[#ff8c00]">{tr("Підказки", "Hints")}</p>
                  <div className="mt-4 space-y-2">
                    {compactHints.map((hint, index) => (
                      <p key={`${index}-${hint.slice(0, 18)}`} className="rounded-2xl bg-[#f3f6f0] px-4 py-3 text-sm leading-6 text-[#354239] dark:bg-white/[.05] dark:text-[#d6e3da]">
                        {hint}
                      </p>
                    ))}
                  </div>
                </article>
              ) : null}

              {quizSummary ? (
                <article className="rounded-[26px] border border-[#00ff88]/25 bg-[#ebfbf0] p-5 text-[#16623d] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">
                  <p className="text-xs font-black uppercase tracking-[.18em]">{tr("Підсумок тесту", "Quiz summary")}</p>
                  <p className="mt-2 text-2xl font-black tracking-[-.05em]">{quizSummary?.finalGrade ?? "—"}/{quizSummary?.maxGrade ?? "—"}</p>
                </article>
              ) : null}
            </div>

            <div className="border-t border-[#132018]/10 p-4 dark:border-white/10">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl bg-[#f8faf6] px-3 py-3 dark:bg-white/[.045]">
                  <div className="text-[10px] font-black uppercase tracking-[.14em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Завдання", "Tasks")}</div>
                  <div className="mt-1 text-lg font-black">{sidebarStats.total || 0}</div>
                </div>
                <div className="rounded-2xl bg-[#f8faf6] px-3 py-3 dark:bg-white/[.045]">
                  <div className="text-[10px] font-black uppercase tracking-[.14em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Готово", "Done")}</div>
                  <div className="mt-1 text-lg font-black">{sidebarStats.completed}</div>
                </div>
                <div className="rounded-2xl bg-[#f8faf6] px-3 py-3 dark:bg-white/[.045]">
                  <div className="text-[10px] font-black uppercase tracking-[.14em] text-[#6f7e72] dark:text-[#9faca3]">{tr("Режим", "Mode")}</div>
                  <div className="mt-1 truncate text-lg font-black">{activeTaskModeLabel}</div>
                </div>
              </div>
            </div>
          </aside>
        </main>
      </div>

      <Modal
        open={statementModalOpen}
        onClose={() => setStatementModalOpen(false)}
        title={tr("Повна умова завдання", "Full task statement")}
        description={tr("Повний текст умови для вибраного завдання.", "The complete brief for the selected task.")}
      >
        {fullPracticeText.trim() ? <MarkdownView content={fullPracticeText} /> : <div className="text-sm text-text-secondary">{tr("Умова для цього завдання поки недоступна.", "Statement is not available for this task yet.")}</div>}
      </Modal>

      <Modal open={!!blockState} title={blockState?.mode === "low" ? tr("Тему потрібно пройти повторно", "You need to retry this topic") : tr("Повтори цю тему", "Review this topic")} description={blockState ? tr(`Тема: ${blockState?.topicTitle ?? ""}`, `Topic: ${blockState?.topicTitle ?? ""}`) : undefined} onClose={() => { setBlockState(null); setUIState("idle"); }}>
        {blockState && <div className="mt-2 flex justify-end">
          <Button variant="primary" onClick={async () => {
            const currentBlockState = blockState;
            if (!currentBlockState) return;
            try {
              await resetTopic(currentBlockState.topicId);
              setBlockState(null);
              setUIState("idle");
              await reloadTasks(true);
            } catch (err) {
              console.error(err);
              setUIState("error");
            }
          }}>{tr("Перепройти тему", "Retry topic")}</Button>
        </div>}
      </Modal>

      <Modal open={!!milestone} title={tr("Ти покращився!", "You improved!")} description={milestone?.message} onClose={async () => {
        if (milestone) {
          try {
            const base = import.meta.env.VITE_API_URL || window.location.origin;
            await fetch(`${base}/profile/milestone-shown`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: milestone.id }) });
          } catch {}
        }
        setMilestone(null);
      }}>
        <div className="text-sm text-text-secondary">{tr("Прогрес збережено у профілі.", "Progress was saved to your profile.")}</div>
      </Modal>
    </div>
  );
};
