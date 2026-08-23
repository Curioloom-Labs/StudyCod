import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Modal } from "../../components/ui/Modal";
import { CodeEditor } from "../../components/CodeEditor";
import { MultiFileEditor } from "../../components/MultiFileEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { LessonTheoryView } from "../../components/lesson/LessonTheoryView";
import { WebPreviewPane } from "../../components/WebPreviewPane";
import {
  getTask,
  submitCode,
  runCode,
  submitQuizAnswers,
  completeTask,
  runCodeFiles,
  submitCodeFiles,
  completeTaskFiles,
  getWebTaskTemplate,
  saveWebTaskDraft,
  checkWebTask,
  submitWebTask,
  submitHintFeedback,
  type CodeFile,
  type HintFeedbackReasonCode,
  type LearningFeedback,
  type LearningAttemptSummary,
  type WebTaskFile,
  type SubmissionMeta,
  type TaskWithGrade,
  type TestResult
} from "../../lib/api/edu";
import { recordSuccessfulStudySession } from "../../lib/studySessions";
import { easeOutQuint } from "../../lib/motion";
import { publishLiveCode } from "../../lib/api/liveClassroom";
import { ArrowLeft, Play, Send, Clock, FileText, Loader2, CheckCircle2, XCircle, Upload, MoreHorizontal, Terminal, BookOpen, FilePlus2, ListChecks, Lock } from "lucide-react";
import { PageSkeleton } from "../../components/ui/Skeleton";
import { isDeadlineExpired } from "../../utils/timezone";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { useWorkspaceViewport } from "../../components/interface/WorkspaceViewport";
import { buildResumeState, loadResumeState, saveResumeState } from "../../lib/resumeState";
import { FailureRecoveryCard } from "../../components/FailureRecoveryCard";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { scopedStorageKey } from "../../lib/storageScope";
import { useMediaQuery } from "../../utils/useMediaQuery";
import { StudyCodIDEWorkspace, type StudyCodIdeCheckResult, type StudyCodIdeTrace } from "../../components/ide/StudyCodIDEWorkspace";
import { tracePlayground } from "../../lib/api/playground";
import type { JudgeLanguage } from "../../lib/judgeLanguages";

const textEncoder = new TextEncoder();
type QuizOption = "А" | "Б" | "В" | "Г" | "Д";

type QuizQuestion = {
  question: string;
  options: Record<QuizOption, string>;
  correct: QuizOption;
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  return getErrorMessageFromUnknown(error, fallback);
};

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const status = Reflect.get(response, "status");
  return typeof status === "number" ? status : null;
};

const getResponseMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return null;
  const data = Reflect.get(response, "data");
  if (!data || typeof data !== "object") return null;
  const message = Reflect.get(data, "message");
  return typeof message === "string" ? message : null;
};

const CONTROL_TASK_REDIRECT_MESSAGES = new Set([
  "CONTROL_WORK_COMPLETED",
  "CONTROL_ONLY_CURRENT_TASK_ALLOWED",
  "CONTROL_WORK_DEADLINE_PASSED",
  "CONTROL_WORK_NOT_STARTED",
  "CONTROL_WORK_TIME_EXPIRED"
]);

const shouldRedirectFromControlTaskError = (status: number | null, message: string | null): boolean => {
  if (status !== 403 && status !== 409) return false;
  if (!message) return false;
  return CONTROL_TASK_REDIRECT_MESSAGES.has(message);
};

const parseQuizQuestions = (raw: string): QuizQuestion[] => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const options: QuizOption[] = ["А", "Б", "В", "Г", "Д"];
    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) return [];
      const question = (item as { question?: unknown }).question;
      const correct = (item as { correct?: unknown }).correct;
      const rawOptions = (item as { options?: unknown }).options;
      if (typeof question !== "string") return [];
      if (!options.includes(correct as QuizOption)) return [];
      if (typeof rawOptions !== "object" || rawOptions === null) return [];
      const mapped = Object.fromEntries(options.map((key) => [key, String((rawOptions as Record<string, unknown>)[key] ?? "")])) as Record<QuizOption, string>;
      return [{ question, correct: correct as QuizOption, options: mapped }];
    });
  } catch {
    return [];
  }
};

async function sha256HexBrowser(input: string): Promise<string> {
  try {
    if (typeof globalThis.crypto?.subtle?.digest === "function") {
      const digest = await globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(input));
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
  } catch {
    // ignore and use fallback hash
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

export const StudentTaskPage: React.FC = () => {
  const {
    t,
    i18n
  } = useTranslation();
  const {
    taskId
  } = useParams<{
    taskId: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { element: viewportEl } = useWorkspaceViewport();
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");
  const [task, setTask] = useState<TaskWithGrade | null>(null);
  const [code, setCode] = useState("");
  const [useFiles, setUseFiles] = useState(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState("");
  const [testInput, setTestInput] = useState("");
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [ideTrace, setIdeTrace] = useState<StudyCodIdeTrace | null>(null);
  const [ideTracing, setIdeTracing] = useState(false);
  const [lastScoring, setLastScoring] = useState<null | {
    score: number;
    maxScore: number;
    groupScores?: Array<{
      group: string;
      score: number;
      maxScore: number;
    }> | null;
  }>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [learningFeedback, setLearningFeedback] = useState<LearningFeedback | null>(null);
  const [learningAttempt, setLearningAttempt] = useState<LearningAttemptSummary | null>(null);
  const [learningFeedbackMeta, setLearningFeedbackMeta] = useState<SubmissionMeta | null>(null);
  const [hintFeedbackSignal, setHintFeedbackSignal] = useState<"up" | "down" | null>(null);
  const [hintFeedbackReasonCode, setHintFeedbackReasonCode] = useState<HintFeedbackReasonCode>("NOT_SPECIFIC");
  const [hintFeedbackReasonText, setHintFeedbackReasonText] = useState("");
  const [hintFeedbackSending, setHintFeedbackSending] = useState(false);
  const [hintFeedbackSentKey, setHintFeedbackSentKey] = useState<string | null>(null);
  const [hintFeedbackStored, setHintFeedbackStored] = useState<boolean | null>(null);
  const [revealedHints, setRevealedHints] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [testProgress] = useState<Record<number, 'pending' | 'running' | 'passed' | 'failed'>>({});
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [theoryAcknowledged, setTheoryAcknowledged] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [timeStarted, setTimeStarted] = useState<Date | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, QuizOption>>({});
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizGrade, setQuizGrade] = useState<number | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [deadlineRemaining, setDeadlineRemaining] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importSolutionKey, setImportSolutionKey] = useState(0);
  const [taskPaneEl, setTaskPaneEl] = useState<HTMLDivElement | null>(null);
  const [theoryPaneEl, setTheoryPaneEl] = useState<HTMLDivElement | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const prefersReducedMotion = useReducedMotion();

  const restoredStepRef = useRef(false);
  const restoredViewportScrollRef = useRef(false);
  const restoredTaskPaneScrollRef = useRef(false);
  const restoredTheoryPaneScrollRef = useRef(false);
  const restoredQuizAnchorRef = useRef(false);
  const resumeExtrasRef = useRef<{
    questionIndex?: number;
    anchorId?: string;
    cursor?: {
      field?: string;
      start?: number;
      end?: number;
    };
    scrollContainer?: string;
    scrollTopByContainer?: Record<string, number>;
  }>({});
  const tr = useCallback((uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk, [i18n.language]);
  const formatHintFeedbackReason = useCallback((code: HintFeedbackReasonCode): string => {
    if (code === "NOT_SPECIFIC") return tr("Надто загально", "Too generic");
    if (code === "INCORRECT") return tr("Некоректно / вводить в оману", "Incorrect / misleading");
    if (code === "TOO_HARD") return tr("Надто складно", "Too hard");
    if (code === "TOO_VERBOSE") return tr("Надто багато тексту", "Too verbose");
    if (code === "OTHER") return tr("Інше", "Other");
    return tr("Корисно", "Helpful");
  }, [tr]);
  const lessonBackPath = useMemo(() => {
    const lessonId = task?.lesson?.id;
    if (!lessonId) return "/edu/lessons";
    const typeSuffix = task?.lesson?.type === "CONTROL"
      ? "?type=CONTROL"
      : task?.lesson?.type === "TOPIC"
        ? "?type=TOPIC"
        : "";
    return `/edu/lessons/${lessonId}${typeSuffix}`;
  }, [task?.lesson?.id, task?.lesson?.type]);
  const navigateToLessonPage = useCallback((replace = true) => {
    const fromRaw = (location.state as {
      from?: unknown;
    } | null)?.from;
    const from = typeof fromRaw === "string" ? fromRaw : null;
    if (from && from.startsWith("/edu/lessons")) {
      navigate(from, {
        replace
      });
      return;
    }
    navigate(lessonBackPath, {
      replace
    });
  }, [location.state, navigate, lessonBackPath]);
  const handleBack = useCallback(() => {
    const fromRaw = (location.state as {
      from?: unknown;
    } | null)?.from;
    const from = typeof fromRaw === "string" ? fromRaw : null;
    if (from && from.startsWith("/edu/")) {
      navigate(from);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(lessonBackPath, {
      replace: true
    });
  }, [location.state, navigate, lessonBackPath]);
  const formatScoreGroupLabel = useCallback((rawGroup: string): string => {
    const group = String(rawGroup ?? "").trim();
    if (group === "public") return tr("публічні", "public");
    if (group === "hidden") return tr("приховані", "hidden");
    return `${tr("сабтаск", "subtask")} ${group}`;
  }, [tr]);
  const scoreGroupColorClass = useCallback((rawGroup: string): string => {
    const group = String(rawGroup ?? "").trim();
    if (group === "public") return "bg-primary";
    if (group === "hidden") return "bg-violet-500";
    const palette = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-indigo-500", "bg-fuchsia-500", "bg-teal-500"];
    let hash = 0;
    for (let i = 0; i < group.length; i++) {
      hash = (hash * 31 + group.charCodeAt(i)) >>> 0;
    }
    return palette[hash % palette.length];
  }, []);
  const toastError = useCallback((message: string) => {
    showToast({ type: "error", message });
  }, []);
  const toastSuccess = useCallback((message: string) => {
    showToast({ type: "success", message });
  }, []);
  const toastInfo = useCallback((message: string) => {
    showToast({ type: "info", message });
  }, []);
  const shouldLeaveControlTaskView = useCallback((taskData: TaskWithGrade | null): boolean => {
    if (!taskData || taskData.lesson.type !== "CONTROL") return false;
    if (taskData.grade?.isCompleted === true || taskData.grade?.isManuallyGraded === true) return true;
    if (typeof taskData.maxAttempts === "number" && typeof taskData.attemptsUsed === "number" && taskData.attemptsUsed >= taskData.maxAttempts) {
      return true;
    }
    return false;
  }, []);
  const taskRef = useRef(task);
  const codeRef = useRef(code);
  const filesRef = useRef(files);
  const useFilesRef = useRef(useFiles);
  const handleSubmitRef = useRef<(() => Promise<void>) | null>(null);
  const latestSubmitRequestSeq = useRef(0);
  const latestSubmissionBindingRef = useRef<{
    submissionId?: string;
    codeHash: string;
  } | null>(null);
  useEffect(() => {
    taskRef.current = task;
    filesRef.current = files;
    useFilesRef.current = useFiles;
    const entryFile = task?.language === "JAVA" ? "Main.java" : task?.language === "CPP" ? "main.cpp" : "main.py";
    const entryContent = useFiles ? (files.find(f => f.path === entryFile)?.content ?? "") : code;
    codeRef.current = entryContent;
  }, [task, code, files, useFiles]);

  const entryFile = useMemo(() => (task?.language === "JAVA" ? "Main.java" : task?.language === "CPP" ? "main.cpp" : "main.py"), [task?.language]);
  const isWebTask = task?.taskMode === "WEB";
  const normalizeFiles = useCallback((raw: CodeFile[]): CodeFile[] => {
    const normalizePath = (rawPath: string): string | null => {
      const p = rawPath.trim().replace(/\\/g, "/");
      if (!p || p.length > 180) return null;
      if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
      const parts = p.split("/");
      if (parts.length > 8) return null;
      for (const part of parts) {
        if (!part || part === "." || part === "..") return null;
        if (part.startsWith(".")) return null;
        if (part.length > 80) return null;
        if (!/^[A-Za-z0-9._-]+$/.test(part)) return null;
      }
      return p;
    };
    const m = new Map<string, string>();
    for (const f of raw || []) {
      const path = normalizePath(String(f.path ?? ""));
      if (!path) continue;
      m.set(path, String(f.content ?? ""));
    }
    return Array.from(m.entries())
      .map(([path, content]) => ({ path, content }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, []);

  const ensureEntryFile = useCallback((entry: string, raw: CodeFile[], fallbackContent: string): CodeFile[] => {
    const fs = normalizeFiles(raw);
    if (fs.some(f => f.path === entry)) return fs;
    return [...fs, { path: entry, content: fallbackContent }].sort((a, b) => a.path.localeCompare(b.path));
  }, [normalizeFiles]);

  const currentCodeText = useMemo(() => {
    if (!useFiles) return code;
    return files.find(f => f.path === entryFile)?.content ?? "";
  }, [useFiles, files, entryFile, code]);
  const toWebTaskFiles = useCallback((): WebTaskFile[] => {
    const source = useFiles ? normalizeFiles(files) : [{ path: "index.html", content: code } as CodeFile];
    const byPath = new Map<string, string>();
    for (const f of source) {
      byPath.set(String(f.path ?? "").trim(), String(f.content ?? ""));
    }
    const defaults = Array.isArray(task?.webTemplateFiles) ? task.webTemplateFiles : [];
    for (const d of defaults) {
      const p = String(d.path ?? "").trim();
      if (!byPath.has(p)) byPath.set(p, String(d.content ?? ""));
    }
    return [
      { path: "index.html", content: byPath.get("index.html") ?? "" },
      { path: "styles.css", content: byPath.get("styles.css") ?? "" },
      { path: "script.js", content: byPath.get("script.js") ?? "" }
    ];
  }, [useFiles, files, code, normalizeFiles, task?.webTemplateFiles]);
  useEffect(() => {
    const init = async () => {
      try {
        const u = await getMe();
        setUser(u);
      } catch (error) {
        console.error("Failed to load user:", error);
      }
    };
    init();
  }, []);

  const taskIdNum = useMemo(() => {
    const n = Number(taskId);
    return Number.isFinite(n) ? n : null;
  }, [taskId]);

  const resumeStep = useMemo(() => {
    if (showResults) return "results";
    const hasTheory = Boolean(task?.lesson?.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0);
    if (hasTheory && !theoryAcknowledged) return "theory";
    return "solve";
  }, [showResults, task?.lesson?.hasTheory, task?.lesson?.theory, theoryAcknowledged]);

  const currentDraftKey = useMemo(() => {
    if (!taskIdNum) return undefined;
    return useFiles ? scopedStorageKey("task_draft_files", taskIdNum) : scopedStorageKey("task_draft", taskIdNum);
  }, [taskIdNum, useFiles]);

  const saveResume = useCallback(
    (scrollTop?: number) => {
      if (!user) return;
      if (taskIdNum == null) return;
      const extras = resumeExtrasRef.current || {};
      saveResumeState(
        buildResumeState({
          userId: user.id,
          kind: "edu_task",
          taskId: taskIdNum,
          step: resumeStep,
          scrollTop,
          draftKey: currentDraftKey,
          questionIndex: extras.questionIndex,
          anchorId: extras.anchorId,
          cursor: extras.cursor,
          scrollContainer: extras.scrollContainer,
          scrollTopByContainer: extras.scrollTopByContainer
        })
      );
    },
    [user?.id, taskIdNum, resumeStep, currentDraftKey]
  );

  // Restore step and seed resume extras once when the task loads.
  useEffect(() => {
    if (!user) return;
    if (taskIdNum == null) return;
    if (restoredStepRef.current) return;

    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_task" || state.taskId !== taskIdNum) return;

    restoredStepRef.current = true;
    resumeExtrasRef.current = {
      ...resumeExtrasRef.current,
      questionIndex: state.questionIndex,
      anchorId: state.anchorId,
      cursor: state.cursor,
      scrollContainer: state.scrollContainer,
      scrollTopByContainer: state.scrollTopByContainer
    };
    if (state.step === "results") setShowResults(true);
    if (state.step === "theory") setTheoryAcknowledged(false);
    if (state.step === "solve") setTheoryAcknowledged(true);
  }, [user?.id, taskIdNum]);

  // Restore workspace viewport scroll when available.
  useEffect(() => {
    if (!user) return;
    if (taskIdNum == null) return;
    if (!viewportEl) return;
    if (restoredViewportScrollRef.current) return;

    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_task" || state.taskId !== taskIdNum) return;

    if (typeof state.scrollTop === "number") {
      restoredViewportScrollRef.current = true;
      requestAnimationFrame(() => {
        try {
          viewportEl.scrollTop = state.scrollTop ?? 0;
        } catch {
          // ignore
        }
      });
    }
  }, [user?.id, taskIdNum, viewportEl]);

  // Restore the internal scroll panes (theory/task panel) when they mount.
  useEffect(() => {
    if (!user) return;
    if (taskIdNum == null) return;
    if (!taskPaneEl) return;
    if (restoredTaskPaneScrollRef.current) return;

    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_task" || state.taskId !== taskIdNum) return;

    const y = state.scrollTopByContainer?.taskPane;
    if (typeof y !== "number") return;
    restoredTaskPaneScrollRef.current = true;
    requestAnimationFrame(() => {
      try {
        taskPaneEl.scrollTop = y;
      } catch {
        // ignore
      }
    });
  }, [user?.id, taskIdNum, taskPaneEl]);

  useEffect(() => {
    if (!user) return;
    if (taskIdNum == null) return;
    if (!theoryPaneEl) return;
    if (restoredTheoryPaneScrollRef.current) return;

    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_task" || state.taskId !== taskIdNum) return;

    const y = state.scrollTopByContainer?.theoryPane;
    if (typeof y !== "number") return;
    restoredTheoryPaneScrollRef.current = true;
    requestAnimationFrame(() => {
      try {
        theoryPaneEl.scrollTop = y;
      } catch {
        // ignore
      }
    });
  }, [user?.id, taskIdNum, theoryPaneEl]);

  useEffect(() => {
    if (!viewportEl) return;
    if (!user) return;
    if (taskIdNum == null) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => saveResume(viewportEl.scrollTop));
    };

    viewportEl.addEventListener("scroll", onScroll, { passive: true });
    saveResume(viewportEl.scrollTop);
    return () => {
      viewportEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      saveResume(viewportEl.scrollTop);
    };
  }, [viewportEl, user?.id, taskIdNum, saveResume]);

  useEffect(() => {
    if (!taskPaneEl) return;
    if (!user) return;
    if (taskIdNum == null) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const prev = resumeExtrasRef.current.scrollTopByContainer || {};
        resumeExtrasRef.current.scrollTopByContainer = {
          ...prev,
          taskPane: taskPaneEl.scrollTop
        };
        resumeExtrasRef.current.scrollContainer = "taskPane";
        saveResume(viewportEl?.scrollTop);
      });
    };

    taskPaneEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      taskPaneEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      onScroll();
    };
  }, [taskPaneEl, user?.id, taskIdNum, saveResume, viewportEl]);

  useEffect(() => {
    if (!theoryPaneEl) return;
    if (!user) return;
    if (taskIdNum == null) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const prev = resumeExtrasRef.current.scrollTopByContainer || {};
        resumeExtrasRef.current.scrollTopByContainer = {
          ...prev,
          theoryPane: theoryPaneEl.scrollTop
        };
        resumeExtrasRef.current.scrollContainer = "theoryPane";
        saveResume(viewportEl?.scrollTop);
      });
    };

    theoryPaneEl.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      theoryPaneEl.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      onScroll();
    };
  }, [theoryPaneEl, user?.id, taskIdNum, saveResume, viewportEl]);

  useEffect(() => {
    // When a quiz exists, restore the last interacted question as an anchor.
    if (!user) return;
    if (taskIdNum == null) return;
    if (!taskPaneEl) return;
    if (restoredQuizAnchorRef.current) return;
    if (!task || task.lesson?.type !== "CONTROL") return;
    if (!quizQuestions.length) return;

    const state = loadResumeState(user.id);
    if (!state || state.kind !== "edu_task" || state.taskId !== taskIdNum) return;
    if (typeof state.questionIndex !== "number") return;
    if (state.questionIndex < 0 || state.questionIndex >= quizQuestions.length) return;

    restoredQuizAnchorRef.current = true;
    requestAnimationFrame(() => {
      const el = document.getElementById(`quiz-q-${state.questionIndex}`);
      try {
        el?.scrollIntoView({ block: "center" });
      } catch {
        // ignore
      }
    });
  }, [user?.id, taskIdNum, task, quizQuestions.length, taskPaneEl]);

  useEffect(() => {
    // Save when step/draft changes even if scroll doesn't.
    saveResume(viewportEl?.scrollTop);
  }, [user?.id, taskIdNum, resumeStep, currentDraftKey]);
  useEffect(() => {
    if (taskId) {
      void loadTask();
    }
  }, [taskId]);
  useEffect(() => {
    if (!taskId) return;
    const codeKey = scopedStorageKey("task_draft", taskId);
    const filesKey = scopedStorageKey("task_draft_files", taskId);
    const timeoutId = setTimeout(() => {
      try {
        if (useFiles) {
          localStorage.setItem(filesKey, JSON.stringify(files));
          localStorage.removeItem(codeKey);
        } else {
          localStorage.setItem(codeKey, code);
          localStorage.removeItem(filesKey);
        }
      } catch {}
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [code, files, useFiles, taskId]);
  useEffect(() => {
    return () => {
      if (!taskId) return;
      const codeKey = scopedStorageKey("task_draft", taskId);
      const filesKey = scopedStorageKey("task_draft_files", taskId);
      try {
        if (useFilesRef.current) {
          localStorage.setItem(filesKey, JSON.stringify(filesRef.current));
          localStorage.removeItem(codeKey);
        } else {
          localStorage.setItem(codeKey, codeRef.current);
          localStorage.removeItem(filesKey);
        }
      } catch {}
    };
  }, [taskId]);

  const handleImportSolutionFile = async (file: File | null) => {
    if (!file) return;
    if (!canEdit) {
      toastError(tr("Завдання закрите для редагування", "Task is read-only"));
      return;
    }

    const nameLower = file.name.toLowerCase();
    const expectedExt = task?.language === "JAVA" ? ".java" : task?.language === "CPP" ? ".cpp" : ".py";
    const looksOk = nameLower.endsWith(expectedExt) || nameLower.endsWith(".txt");
    if (!looksOk) {
      const ok = confirm(tr(`Файл має інше розширення. Все одно імпортувати? (${file.name})`, `File extension looks different. Import anyway? (${file.name})`));
      if (!ok) return;
    }

    try {
      const text = (await file.text()).replace(/\r\n/g, "\n");
      const hasExisting = (currentCodeText || "").trim().length > 0;
      const hasNew = text.trim().length > 0;
      if (hasExisting && hasNew && text !== currentCodeText) {
        const ok = confirm(tr("Замінити поточний код на код з файлу?", "Replace current code with file contents?"));
        if (!ok) return;
      }
      if (useFilesRef.current) {
        const next = ensureEntryFile(entryFile, filesRef.current, "").map(f => (f.path === entryFile ? { ...f, content: text } : f));
        setFiles(next);
      } else {
        setCode(text);
      }
    } catch (e: unknown) {
      console.error("Failed to import solution file:", e);
      toastError(tr("Не вдалося прочитати файл", "Failed to read file"));
    } finally {
      setImportSolutionKey(k => k + 1);
    }
  };
  useEffect(() => {
    if (!task?.deadline || task.isClosed) {
      setDeadlineRemaining(null);
      return;
    }
    const updateDeadline = () => {
      const deadlineUTC = new Date(task.deadline!).getTime();
      const nowUTC = new Date().getTime();
      const remaining = Math.max(0, Math.floor((deadlineUTC - nowUTC) / 1000));
      if (remaining > 0) {
        setDeadlineRemaining(remaining);
      } else {
        setDeadlineRemaining(0);
      }
    };
    updateDeadline();
    const interval = setInterval(updateDeadline, 1000);
    return () => clearInterval(interval);
  }, [task?.deadline, task?.isClosed]);
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;
    if (!timeStarted) return;
    if (taskRef.current?.lesson.type !== "CONTROL") return;
    const interval = setInterval(() => {
      const currentTask = taskRef.current;
      const currentCode = codeRef.current;
      if (!currentTask || !timeStarted) {
        clearInterval(interval);
        return;
      }
      const elapsed = Math.floor((Date.now() - timeStarted.getTime()) / 1000 / 60);
      const remaining = (currentTask.lesson.timeLimitMinutes || 0) - elapsed;
      if (remaining > 0) {
        setTimeRemaining(remaining);
      } else {
        setTimeRemaining(0);
        clearInterval(interval);
        toastInfo(t("timeUpAutoSubmit"));
        if (currentTask && currentCode && handleSubmitRef.current) {
          handleSubmitRef.current();
        }
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [timeStarted]);
  useEffect(() => {
    if (task) {
      const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
      setTheoryAcknowledged(!hasTheory);
    } else {
      setTheoryAcknowledged(false);
    }
  }, [task?.id]);
  const loadTask = async (): Promise<TaskWithGrade | null> => {
    if (!taskId) {
      setLoadError(tr("Не знайдено ідентифікатор задачі.", "The task identifier is missing."));
      setLoading(false);
      return null;
    }
    setLoadError(null);
    try {
      const data = await getTask(parseInt(taskId, 10));
      setTask(data);
      setLoadError(null);
      setLearningFeedback(null);
      setLearningAttempt(null);
      setLearningFeedbackMeta(null);
      const serverMeta = data.grade?.submissionMeta;
      latestSubmissionBindingRef.current = serverMeta
        ? {
            submissionId: String(serverMeta.submissionId),
            codeHash: String(serverMeta.codeHash)
          }
        : null;
      {
        const g = data.grade;
        const score = typeof g?.score === "number" ? Number(g.score) : null;
        const maxScore = typeof g?.maxScore === "number" ? Number(g.maxScore) : null;
        const groupScores = Array.isArray(g?.groupScores) ? g.groupScores : null;
        if (score !== null && maxScore !== null && maxScore > 0) {
          setLastScoring({
            score,
            maxScore,
            groupScores
          });
        } else {
          setLastScoring(null);
        }
      }
      const submittedCode = data.grade?.submittedCode;
      const submittedFiles = data.grade?.submittedFiles;
      const draftFilesRaw = (() => {
        try {
          const s = localStorage.getItem(scopedStorageKey("task_draft_files", taskId));
          return s ? (JSON.parse(s) as unknown) : null;
        } catch {
          return null;
        }
      })();
      const draftFiles = Array.isArray(draftFilesRaw) ? (draftFilesRaw as CodeFile[]) : null;
      const draftCode = localStorage.getItem(scopedStorageKey("task_draft", taskId));
      const savedCode = data.savedCode;

      const entryFromData = data.language === "JAVA" ? "Main.java" : data.language === "CPP" ? "main.cpp" : "main.py";

      if (data.taskMode === "WEB") {
        if (draftFiles && draftFiles.length > 0) {
          const effective = ensureEntryFile("index.html", draftFiles, savedCode || data.template);
          setUseFiles(true);
          setFiles(effective);
          setCode(effective.find(f => f.path === "index.html")?.content ?? "");
          return data;
        }
        try {
          const web = await getWebTaskTemplate(parseInt(taskId, 10));
          const webFiles = Array.isArray(web.files) ? web.files : [];
          setUseFiles(true);
          setFiles(webFiles as unknown as CodeFile[]);
          setCode(webFiles.find(f => f.path === "index.html")?.content ?? "");
        } catch {
          const fallback = Array.isArray(data.webTemplateFiles) ? data.webTemplateFiles : [];
          setUseFiles(true);
          setFiles(fallback as unknown as CodeFile[]);
          setCode(fallback.find(f => f.path === "index.html")?.content ?? "");
        }
      } else if (Array.isArray(submittedFiles) && submittedFiles.length > 0) {
        const effective = ensureEntryFile(entryFromData, submittedFiles, submittedCode || savedCode || data.template);
        setUseFiles(true);
        setFiles(effective);
        setCode(effective.find(f => f.path === data.grade?.submittedEntryFile || f.path === entryFromData)?.content ?? (submittedCode || ""));
      } else if (draftFiles && draftFiles.length > 0) {
        const effective = ensureEntryFile(entryFromData, draftFiles, submittedCode || savedCode || data.template);
        setUseFiles(true);
        setFiles(effective);
        setCode(effective.find(f => f.path === entryFromData)?.content ?? "");
      } else {
        setUseFiles(false);
        setFiles([]);
        setCode(submittedCode || draftCode || savedCode || data.template);
      }
      if (data.grade && submittedCode) {
        if (data.lesson.type === "CONTROL") {
          setTestResults([]);
          setConsoleOutput(tr("Рішення збережено. Детальні результати доступні у фінальному огляді контрольної.", "Solution saved. Detailed results are available in the final control-work review."));
        } else if (data.grade.testResults && Array.isArray(data.grade.testResults) && data.grade.testResults.length > 0) {
          const testResults: TestResult[] = data.grade.testResults.map((result) => ({
            testId: typeof result.testId === "number" ? result.testId : undefined,
            stderr: result.stderr ?? result.error ?? undefined,
            passed: result.passed === true,
            verdict: result.verdict ?? null,
            errorKind: result.errorKind ?? result.error_kind ?? null
          }));
          setTestResults(testResults);
          setConsoleOutput(`${t("testResultsHeader", {
            passed: data.grade.testsPassed,
            total: data.grade.testsTotal
          })}\n` + tr("Натисніть «Переглянути результати» для деталей.", "Click “View results” for details."));
        } else {
          setConsoleOutput(t("gradeSummary", {
            passed: data.grade.testsPassed,
            total: data.grade.testsTotal,
            grade: data.grade.total
          }));
        }
      } else {
        setConsoleOutput("");
      }
      if (data.lesson.type === "CONTROL" && data.lesson.quizJson) {
        try {
          setQuizQuestions(parseQuizQuestions(data.lesson.quizJson));
          const serverQuizSubmitted = data.lesson.quizSubmitted === true;
          const serverQuizGrade = data.lesson.quizGrade !== null && data.lesson.quizGrade !== undefined ? Number(data.lesson.quizGrade) : null;
          if (serverQuizSubmitted) {
            setQuizSubmitted(true);
            setQuizGrade(serverQuizGrade);
            localStorage.removeItem(scopedStorageKey("quiz_submitted", taskId));
            localStorage.removeItem(scopedStorageKey("quiz_answers", taskId));
          } else {
            const savedAnswers = localStorage.getItem(scopedStorageKey("quiz_answers", taskId));
            if (savedAnswers) {
              setQuizAnswers(JSON.parse(savedAnswers));
              localStorage.setItem(scopedStorageKey("quiz_answers_timestamp", taskId), Date.now().toString());
            }
            setQuizSubmitted(false);
            setQuizGrade(null);
          }
        } catch (e) {
          if (import.meta.env.DEV) {
            console.error("Failed to parse quiz:", e);
          }
          setQuizQuestions([]);
        }
      } else {
        setQuizQuestions([]);
        setQuizSubmitted(false);
        setQuizGrade(null);
      }
      if (data.lesson.type === "CONTROL" && data.lesson.timeLimitMinutes) {
        const startTime = localStorage.getItem(scopedStorageKey("task_start_time", taskId));
        if (startTime) {
          const elapsed = Math.floor((Date.now() - parseInt(startTime)) / 1000 / 60);
          const remaining = data.lesson.timeLimitMinutes - elapsed;
          if (remaining > 0) {
            setTimeRemaining(remaining);
            setTimeStarted(new Date(parseInt(startTime)));
          } else {
            setTimeRemaining(0);
          }
        } else {
          const now = Date.now();
          localStorage.setItem(scopedStorageKey("task_start_time", taskId), now.toString());
          localStorage.setItem(scopedStorageKey("task_start_time_timestamp", taskId), now.toString());
          setTimeRemaining(data.lesson.timeLimitMinutes);
          setTimeStarted(new Date(now));
        }
      }
      return data;
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error("Failed to load task:", error);
      }
      const status = getErrorStatus(error);
      const message = getResponseMessage(error);
      if (shouldRedirectFromControlTaskError(status, message)) {
        toastInfo(tr("Доступ до цієї задачі контрольної закрито. Повертаємось до контрольної.", "Access to this control-work task is closed. Returning to control work."));
        navigateToLessonPage(true);
      }
      setLoadError(getErrorMessage(error, tr("Не вдалося завантажити задачу.", "Could not load the task.")));
      return null;
    } finally {
      setLoading(false);
    }
  };
  const handleRun = async () => {
    if (!taskId || (!currentCodeText.trim() && !isWebTask)) {
      setConsoleOutput(t("enterCodeToRun"));
      return;
    }
    if (isWebTask) {
      setConsoleOutput(tr("Превʼю оновлено в сусідній панелі.", "Preview refreshed in the adjacent panel."));
      return;
    }
    setRunning(true);
    setConsoleOutput(t("runningCode"));
    try {
      const result = useFiles
        ? await runCodeFiles(parseInt(taskId, 10), files, testInput || undefined)
        : await runCode(parseInt(taskId, 10), code, testInput || undefined);
      let output = "";
      let filteredStderr = result.stderr || "";
      filteredStderr = filteredStderr.split('\n').filter(line => !line.includes('Picked up JAVA_TOOL_OPTIONS')).filter(line => !line.includes('Picked up _JAVA_OPTIONS')).join('\n').trim();
      output += result.output || filteredStderr || t("noOutput");
      if (filteredStderr && result.output) {
        output += `\n\n${t("errors")}:\n${filteredStderr}`;
      }
      setConsoleOutput(output);
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error("Failed to run:", error);
      }
      setConsoleOutput(getErrorMessage(error, t("runError")));
    } finally {
      setRunning(false);
    }
  };

  const handleTrace = async () => {
    if (!taskId || isWebTask || ideTracing || !currentCodeText.trim()) return;
    setIdeTracing(true);
    try {
      const result = await tracePlayground({
        language: String(task?.language ?? "python").toLowerCase() as JudgeLanguage,
        code: currentCodeText,
        stdin: testInput || undefined,
      });
      setIdeTrace(result);
    } catch (error) {
      showToast({ type: "error", message: getErrorMessage(error, tr("Не вдалося запустити trace", "Couldn't start trace")) });
    } finally {
      setIdeTracing(false);
    }
  };
  const handleSubmitQuiz = async () => {
    if (!taskId || !task) return;
    if (submitting) return; // guard against double-submit (e.g. a fast double-click)
    if (Object.keys(quizAnswers).length < quizQuestions.length) {
      toastError(t("pleaseAnswerAllQuestions"));
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitQuizAnswers(parseInt(taskId, 10), quizAnswers);
      setQuizGrade(result.grade.theoryGrade);
      setQuizSubmitted(true);
      const now = Date.now().toString();
      localStorage.setItem(scopedStorageKey("quiz_submitted", taskId), "true");
      localStorage.setItem(scopedStorageKey("quiz_submitted_timestamp", taskId), now);
      localStorage.setItem(scopedStorageKey("quiz_grade", taskId), result.grade.theoryGrade.toString());
      localStorage.setItem(scopedStorageKey("quiz_grade_timestamp", taskId), now);
      toastSuccess(t("quizCompletedWithGrade", {
        grade: result.grade.theoryGrade,
        correct: result.grade.correctAnswers,
        total: result.grade.totalQuestions
      }));
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error("Failed to submit quiz:", error);
      }
      const status = getErrorStatus(error);
      const responseMessage = getResponseMessage(error);
      const message = getErrorMessage(error, t("failedToSubmitTest"));
      if (shouldRedirectFromControlTaskError(status, responseMessage ?? message)) {
        toastInfo(tr("Час контрольної вичерпано або доступ до етапу закрито. Повертаємось до контрольної.", "Control-work time has expired or stage access is closed. Returning to control work."));
        navigateToLessonPage(true);
        return;
      }
      if (status === 409 && message === "QUIZ_ALREADY_SUBMITTED") {
        toastInfo(t("quizAlreadySubmitted"));
        await loadTask();
      } else {
        toastError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };
  const handleSubmit = useCallback(async () => {
    if (!taskId || (!currentCodeText.trim() && !isWebTask)) {
      toastError(t("enterCode"));
      return;
    }
    if (task?.isClosed) {
      toastError(t("taskClosedCannotSubmit"));
      return;
    }
    if (task?.deadline && isDeadlineExpired(task.deadline)) {
      toastError(t("deadlinePassedCannotSubmit"));
      return;
    }
    if (task?.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) {
      toastError(t("attemptsExhaustedCannotSubmit", {
        maxAttempts: task.maxAttempts
      }));
      return;
    }
    const submitSeq = ++latestSubmitRequestSeq.current;
    const hideControlResults = task?.lesson?.type === "CONTROL";
    setSubmitting(true);
    setIsRunningTests(true);
    setTestResults([]);
    setLearningFeedback(null);
    setLearningAttempt(null);
    setLearningFeedbackMeta(null);
    setShowResults(false);
    setConsoleOutput(t("checkingCode"));
    try {
      if (isWebTask) {
        const filesPayload = toWebTaskFiles();
        const check = await checkWebTask(parseInt(taskId, 10), filesPayload);
        const submit = await submitWebTask(parseInt(taskId, 10), filesPayload);
        if (submitSeq !== latestSubmitRequestSeq.current) {
          return;
        }
        setTestResults([]);
        setHints([]);
        setLearningFeedback(null);
        setLearningAttempt(null);
        setLearningFeedbackMeta(null);
        setLastScoring(hideControlResults ? null : submit.scoring ?? {
          score: check.score,
          maxScore: check.maxScore,
          groupScores: null
        });
        setRevealedHints(0);
        setShowResults(!hideControlResults);
        setConsoleOutput(hideControlResults
          ? tr("Рішення збережено. Результати будуть доступні у фінальному огляді контрольної.", "Solution saved. Results will be available in the final control-work review.")
          : tr(`WEB перевірка: ${check.passedRules}/${check.totalRules}. Бал: ${check.score}/${check.maxScore}.`, `WEB check: ${check.passedRules}/${check.totalRules}. Score: ${check.score}/${check.maxScore}.`));
        await saveWebTaskDraft(parseInt(taskId, 10), filesPayload);
        await loadTask();
        return;
      }
      const clientSubmissionId = createClientSubmissionId();
      const codeHash = await sha256HexBrowser(useFiles ? JSON.stringify(files) : String(code ?? ""));
      latestSubmissionBindingRef.current = { codeHash };
      const result = useFiles
        ? await submitCodeFiles(parseInt(taskId, 10), files, { clientSubmissionId, codeHash })
        : await submitCode(parseInt(taskId, 10), code, { clientSubmissionId, codeHash });
      if (submitSeq !== latestSubmitRequestSeq.current) {
        return;
      }
      const submissionMeta = result.submissionMeta;
      if (submissionMeta?.submissionId && submissionMeta?.codeHash) {
        latestSubmissionBindingRef.current = {
          submissionId: String(submissionMeta.submissionId),
          codeHash: String(submissionMeta.codeHash)
        };
      }
      localStorage.removeItem(scopedStorageKey("task_draft", taskId));
      localStorage.removeItem(scopedStorageKey("task_draft_files", taskId));
      const finalTestResults: TestResult[] = Array.isArray(result.testResults) ? result.testResults : [];
      setTestResults(hideControlResults ? [] : finalTestResults);
      setHints(hideControlResults ? [] : Array.isArray(result.hints) ? result.hints : []);
      setLearningFeedback(hideControlResults ? null : result.learningFeedback ?? null);
      setLearningAttempt(hideControlResults ? null : result.learningAttempt ?? null);
      setLearningFeedbackMeta(hideControlResults ? null : submissionMeta ?? null);
      setLastScoring(hideControlResults ? null : result.scoring ?? null);
      setRevealedHints(0);
      setShowResults(!hideControlResults);
      const attemptsAfterSubmit = typeof task?.attemptsUsed === "number" ? task.attemptsUsed + 1 : null;
      const attemptsWillExhaust = typeof attemptsAfterSubmit === "number" && typeof task?.maxAttempts === "number" && attemptsAfterSubmit >= task.maxAttempts;
      if (result.requiresManualReview) {
        setConsoleOutput(t('taskSubmittedForReview'));
        toastInfo(t('taskSubmittedForReview'));
        const refreshedTask = await loadTask();
        if (hideControlResults && (attemptsWillExhaust || shouldLeaveControlTaskView(refreshedTask))) {
          toastInfo(tr("Етап завершено. Повертаємось до контрольної.", "Stage completed. Returning to control work."));
          navigateToLessonPage(true);
          return;
        }
        setSubmitting(false);
        return;
      }
      if (hideControlResults) {
        const hiddenResultsMessage = tr("Рішення збережено. Результати будуть доступні у фінальному огляді контрольної.", "Solution saved. Results will be available in the final control-work review.");
        setConsoleOutput(hiddenResultsMessage);
        toastInfo(hiddenResultsMessage);
      } else if (result.grade.total !== null) {
        const scoring = result.scoring;
        const scoreLine = scoring && typeof scoring.score === "number" && typeof scoring.maxScore === "number" && scoring.maxScore > 0 ? ` ${tr("Бал", "Score")}: ${scoring.score}/${scoring.maxScore}.` : "";
        setConsoleOutput(`${t('reviewCompleted')}: ${result.grade.testsPassed}/${result.grade.testsTotal}.${scoreLine} ${t('gradeOutOf')}: ${result.grade.total}/100`);
      } else {
        setConsoleOutput(t('taskSubmittedForReview'));
      }
      const refreshedTask = await loadTask();
      if (hideControlResults) {
        const shouldExitControlTask = attemptsWillExhaust || result.grade?.isManuallyGraded === true || shouldLeaveControlTaskView(refreshedTask);
        if (shouldExitControlTask) {
          toastInfo(tr("Етап завершено. Повертаємось до контрольної.", "Stage completed. Returning to control work."));
          navigateToLessonPage(true);
          return;
        }
      }
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error("Failed to submit:", error);
      }
      const status = getErrorStatus(error);
      const responseMessage = getResponseMessage(error);
      const errorMessage = getErrorMessage(error, t('failedToSubmit'));
      if (shouldRedirectFromControlTaskError(status, responseMessage ?? errorMessage)) {
        toastInfo(tr("Час контрольної вичерпано або доступ до етапу закрито. Повертаємось до контрольної.", "Control-work time has expired or stage access is closed. Returning to control work."));
        navigateToLessonPage(true);
        return;
      }
      setConsoleOutput(errorMessage);
      toastError(errorMessage);
    } finally {
      if (submitSeq === latestSubmitRequestSeq.current) {
        setSubmitting(false);
        setIsRunningTests(false);
      }
    }
  }, [taskId, code, files, useFiles, currentCodeText, task?.lesson?.type, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, loadTask, shouldLeaveControlTaskView, navigateToLessonPage, t, toastError, toastInfo, isWebTask, toWebTaskFiles, tr]);
  const handleComplete = useCallback(async () => {
    if (isWebTask) {
      toastError(tr("Для WEB-завдань використовуйте кнопку «Відправити».", "For WEB tasks, use the Submit button."));
      return;
    }
    if (!taskId || !currentCodeText.trim()) {
      toastError(t("enterCode"));
      return;
    }
    if (task?.isClosed) {
      toastError(t("taskClosedCannotComplete"));
      return;
    }
    if (task?.deadline && isDeadlineExpired(task.deadline)) {
      toastError(t("deadlinePassedCannotComplete"));
      return;
    }
    if (task?.grade?.isManuallyGraded) {
      toastError(t("taskLockedManualGrade"));
      return;
    }
    if (task?.grade?.isCompleted) {
      toastError(t("taskLockedManualGrade"));
      return;
    }
    if (!confirm(t("confirmCompleteEarly"))) {
      return;
    }
    const submitSeq = ++latestSubmitRequestSeq.current;
    const hideControlResults = task?.lesson?.type === "CONTROL";
    setSubmitting(true);
    setIsRunningTests(true);
    setTestResults([]);
    setLearningFeedback(null);
    setLearningAttempt(null);
    setLearningFeedbackMeta(null);
    setShowResults(false);
    setConsoleOutput(t("completingTaskRunningFinalTest"));
    try {
      const clientSubmissionId = createClientSubmissionId();
      const codeHash = await sha256HexBrowser(useFiles ? JSON.stringify(files) : String(code ?? ""));
      latestSubmissionBindingRef.current = { codeHash };
      const result = useFiles
        ? await completeTaskFiles(parseInt(taskId, 10), files, { clientSubmissionId, codeHash })
        : await completeTask(parseInt(taskId, 10), code, { clientSubmissionId, codeHash });
      if (submitSeq !== latestSubmitRequestSeq.current) {
        return;
      }
      const submissionMeta = result.submissionMeta;
      if (submissionMeta?.submissionId && submissionMeta?.codeHash) {
        latestSubmissionBindingRef.current = {
          submissionId: String(submissionMeta.submissionId),
          codeHash: String(submissionMeta.codeHash)
        };
      }
      localStorage.removeItem(scopedStorageKey("task_draft", taskId));
      localStorage.removeItem(scopedStorageKey("task_draft_files", taskId));
      const finalTestResults: TestResult[] = Array.isArray(result.testResults) ? result.testResults : [];
      setTestResults(hideControlResults ? [] : finalTestResults);
      setHints(hideControlResults ? [] : Array.isArray(result.hints) ? result.hints : []);
      setLearningFeedback(hideControlResults ? null : result.learningFeedback ?? null);
      setLearningAttempt(hideControlResults ? null : result.learningAttempt ?? null);
      setLearningFeedbackMeta(hideControlResults ? null : submissionMeta ?? null);
      setLastScoring(hideControlResults ? null : result.scoring ?? null);
      setRevealedHints(0);
      setShowResults(!hideControlResults);
      if (result.requiresManualReview) {
        setConsoleOutput(t("taskCompletedEarlySent"));
        toastInfo(t("taskCompletedEarlySent"));
      } else if (hideControlResults) {
        const hiddenResultsMessage = tr("Рішення зафіксовано. Фінальний огляд контрольної доступний після завершення всіх етапів.", "Solution recorded. Final control-work review is available after all stages are completed.");
        setConsoleOutput(hiddenResultsMessage);
        toastInfo(hiddenResultsMessage);
      } else if (result.grade.total !== null) {
        const scoring = result.scoring;
        const scoreLine = scoring && typeof scoring.score === "number" && typeof scoring.maxScore === "number" && scoring.maxScore > 0 ? ` ${tr("Бал", "Score")}: ${scoring.score}/${scoring.maxScore}.` : "";
        setConsoleOutput(t("taskCompletedEarlyDetailed", {
          passed: result.grade.testsPassed,
          total: result.grade.testsTotal,
          grade: result.grade.total
        }) + scoreLine);
        toastSuccess(t("taskCompletedEarlyWithGrade", {
          grade: result.grade.total
        }));
      } else {
        setConsoleOutput(t("taskCompletedEarly"));
        toastSuccess(t("taskCompletedEarly"));
      }
      await loadTask();
      if (hideControlResults) {
        toastInfo(tr("Етап завершено. Повертаємось до контрольної.", "Stage completed. Returning to control work."));
        navigateToLessonPage(true);
        return;
      }

      // Count as a successful study session (used for the interface switch suggestion).
      recordSuccessfulStudySession({
        kind: "edu_task_complete",
        taskId: taskId
      });
    } catch (error: unknown) {
      if (import.meta.env.DEV) {
        console.error("Failed to complete task:", error);
      }
      const status = getErrorStatus(error);
      const responseMessage = getResponseMessage(error);
      const errorMessage = getErrorMessage(error, t("failedToCompleteTask"));
      if (shouldRedirectFromControlTaskError(status, responseMessage ?? errorMessage)) {
        toastInfo(tr("Час контрольної вичерпано або доступ до етапу закрито. Повертаємось до контрольної.", "Control-work time has expired or stage access is closed. Returning to control work."));
        navigateToLessonPage(true);
        return;
      }
      setConsoleOutput(errorMessage);
      toastError(errorMessage);
    } finally {
      if (submitSeq === latestSubmitRequestSeq.current) {
        setSubmitting(false);
        setIsRunningTests(false);
      }
    }
  }, [taskId, code, files, useFiles, currentCodeText, task?.lesson?.type, task?.isClosed, task?.deadline, task?.grade?.isManuallyGraded, task?.grade?.isCompleted, loadTask, navigateToLessonPage, t, toastError, toastInfo, toastSuccess, isWebTask, tr]);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);
  const getPracticeText = () => {
    if (!task) return null;
    const content = task.description || "";
    if (content.trim().startsWith("### Практичне завдання")) {
      return content.replace(/^###\s*Практичне завдання\s*/i, "").trim();
    }
    const practiceMatch = content.match(/(?:###\s*)?Практика[\s\S]*$/i);
    if (practiceMatch) {
      return practiceMatch[0].replace(/^###\s*Практика\s*/i, "").trim();
    }
    return content.trim() || null;
  };
  const canEdit = useMemo(() => {
    if (!task) return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    if (task.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, task]);

  // Live editor stream: while the student is actively editing, push a debounced
  // snapshot of their code so the teacher's live lesson panel can watch it. The
  // backend only stores it when a live session is running for the class, so this
  // is a cheap fire-and-forget when no lesson is live.
  useEffect(() => {
    if (!canEdit || !taskId || !code) return;
    const id = parseInt(taskId, 10);
    if (isNaN(id)) return;
    const handle = window.setTimeout(() => {
      void publishLiveCode(id, code, task?.title).catch(() => {});
    }, 4000);
    return () => window.clearTimeout(handle);
  }, [code, canEdit, taskId, task?.title]);

  const canComplete = useMemo(() => {
    if (!task) return false;
    if (task.taskMode === "WEB") return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task]);
  const attemptsRemaining = useMemo(() => {
    if (!task) return null;
    if (task.maxAttempts === undefined || task.attemptsUsed === undefined) return null;
    return Math.max(0, task.maxAttempts - task.attemptsUsed);
  }, [task?.maxAttempts, task?.attemptsUsed, task]);
  const canSubmit = useMemo(() => {
    if (!task) return false;
    if (task.grade?.isCompleted) return false;
    if (task.grade?.isManuallyGraded) return false;
    if (task.isClosed) return false;
    if (task.deadline && isDeadlineExpired(task.deadline)) return false;
    if (task.maxAttempts && task.attemptsUsed !== undefined && task.attemptsUsed >= task.maxAttempts) return false;
    return true;
  }, [task?.grade, task?.isClosed, task?.deadline, task?.maxAttempts, task?.attemptsUsed, task]);

  const hintFeedbackContext = useMemo(() => {
    const latest = latestSubmissionBindingRef.current;
    if (!latest || !learningFeedbackMeta?.codeHash) return null;

    const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
    const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
    if (!sameHash || !sameId) return null;

    const submissionId = learningFeedbackMeta.submissionId
      ? String(learningFeedbackMeta.submissionId)
      : latest.submissionId
        ? String(latest.submissionId)
        : undefined;

    const hintsTotal = hints.length;
    const hintsShown = Math.max(0, Math.min(hintsTotal, revealedHints));

    return {
      key: `${submissionId ?? "none"}:${String(learningFeedbackMeta.codeHash)}`,
      submissionId,
      codeHash: String(learningFeedbackMeta.codeHash),
      verdict: learningFeedback?.verdict ?? null,
      hintsShown,
      hintsTotal,
    };
  }, [learningFeedbackMeta?.submissionId, learningFeedbackMeta?.codeHash, learningFeedback?.verdict, hints.length, revealedHints]);

  const hintFeedbackKey = hintFeedbackContext?.key ?? null;
  const hintFeedbackAlreadySent = hintFeedbackKey !== null && hintFeedbackSentKey === hintFeedbackKey;

  useEffect(() => {
    if (!hintFeedbackKey) return;
    if (hintFeedbackSentKey === hintFeedbackKey) return;

    setHintFeedbackSignal(null);
    setHintFeedbackReasonCode("NOT_SPECIFIC");
    setHintFeedbackReasonText("");
    setHintFeedbackStored(null);
  }, [hintFeedbackKey, hintFeedbackSentKey]);

  const handleSendHintFeedback = useCallback(async (signal: "up" | "down") => {
    if (!taskId || !hintFeedbackContext) return;
    if (hintFeedbackSentKey === hintFeedbackContext.key) return;

    const taskIdNum = Number.parseInt(taskId, 10);
    if (!Number.isFinite(taskIdNum)) return;

    const reasonCode: HintFeedbackReasonCode = signal === "up" ? "HELPFUL" : hintFeedbackReasonCode;
    const reasonText = signal === "down" ? hintFeedbackReasonText.trim() : "";

    setHintFeedbackSending(true);
    try {
      const response = await submitHintFeedback(taskIdNum, {
        submissionId: hintFeedbackContext.submissionId,
        codeHash: hintFeedbackContext.codeHash,
        verdict: hintFeedbackContext.verdict,
        signal,
        reasonCode,
        reasonText: reasonText || undefined,
        hintsShown: hintFeedbackContext.hintsShown,
        hintsTotal: hintFeedbackContext.hintsTotal,
      });

      setHintFeedbackSignal(signal);
      setHintFeedbackStored(response?.stored ?? null);
      setHintFeedbackSentKey(hintFeedbackContext.key);

      if (signal === "up") {
        toastSuccess(tr("Дякуємо! Врахуємо це при генерації наступних підказок.", "Thanks! We'll use this signal to improve future hints."));
      } else {
        toastSuccess(tr("Дякуємо за відгук — покращимо підказки.", "Thanks for the feedback — we'll improve the hints."));
      }
    } catch (error: unknown) {
      toastError(getErrorMessage(error, tr("Не вдалося надіслати фідбек по підказках", "Failed to submit hints feedback")));
    } finally {
      setHintFeedbackSending(false);
    }
  }, [taskId, hintFeedbackContext, hintFeedbackSentKey, hintFeedbackReasonCode, hintFeedbackReasonText, toastError, toastSuccess, tr]);

  useEffect(() => {
    if (!actionsMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setActionsMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActionsMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionsMenuOpen]);

  if (loading) {
    return <PageSkeleton variant="default" />;
  }
  if (!task) {
    return <div className="mx-auto flex min-h-[60vh] max-w-xl items-center justify-center px-4 text-center text-text-primary">
      <div className="w-full rounded-2xl border border-border bg-bg-surface p-6 shadow-sm" role="alert" aria-live="assertive">
        <p className="font-mono text-sm">{loadError ?? t("taskNotFound")}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button variant="primary" onClick={() => void loadTask()}>{tr("Повторити", "Retry")}</Button>
          <Button variant="ghost" onClick={() => handleBack()}>{t("back")}</Button>
        </div>
      </div>
    </div>;
  }
  const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
  const showTheory = !theoryAcknowledged && hasTheory;
  const hideControlResults = task.lesson.type === "CONTROL";
  const scoringPct = lastScoring && lastScoring.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100))) : null;
  const scoringSegments = (() => {
    if (!lastScoring || !(lastScoring.maxScore > 0)) return null;
    const groups = Array.isArray(lastScoring.groupScores) ? lastScoring.groupScores : null;
    if (!groups || groups.length === 0) {
      return [{
        key: "total",
        label: "total",
        pct: typeof scoringPct === "number" ? scoringPct : 0,
        className: "bg-primary",
        title: tr("Бал", "Score") + `: ${lastScoring.score}/${lastScoring.maxScore}`
      }];
    }
    const totalMax = lastScoring.maxScore;
    const normalized = groups.map(g => ({
      group: String(g.group ?? ""),
      score: Number(g.score ?? 0),
      maxScore: Number(g.maxScore ?? 0)
    })).filter(g => Number.isFinite(g.score) && g.score > 0);
    const order = ["public", "hidden"];
    normalized.sort((a, b) => {
      const ia = order.indexOf(a.group);
      const ib = order.indexOf(b.group);
      if (ia === -1 && ib === -1) return a.group.localeCompare(b.group);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
    return normalized.map(g => {
      const raw = totalMax > 0 ? g.score / totalMax * 100 : 0;
      const pct = Math.max(0, Math.min(100, raw));
      const className = scoreGroupColorClass(g.group);
      const label = formatScoreGroupLabel(g.group);
      return {
        key: g.group,
        label,
        pct,
        className,
        title: `${label}: ${g.score}/${g.maxScore}`
      };
    });
  })();
  const showScoringLegend = Array.isArray(scoringSegments) && scoringSegments.some(s => s.key === "public" || s.key === "hidden");
  if (String(task.lesson.type) !== "CONTROL") {
    const ideLanguage = String(task.language).toLowerCase() as JudgeLanguage;
    const ideTestsPassed = testResults.filter((result) => result.passed).length || task.grade?.testsPassed || 0;
    const ideTestsTotal = testResults.length || task.grade?.testsTotal || task.testDataCount || 0;
    const ideCheckResult: StudyCodIdeCheckResult | null = ideTestsTotal > 0 || lastScoring || learningFeedback
      ? {
          verdict: learningFeedback?.verdict ?? (ideTestsTotal > 0 ? (ideTestsPassed >= ideTestsTotal ? "AC" : "WA") : null),
          testsPassed: ideTestsPassed,
          testsTotal: ideTestsTotal,
          score: lastScoring?.score ?? task.grade?.score ?? task.grade?.total,
          maxScore: lastScoring?.maxScore ?? task.grade?.maxScore ?? 100,
          publicTestResults: testResults.map((result, index) => ({
            testId: result.testId ?? index + 1,
            input: result.input,
            expectedOutput: result.expected,
            actualOutput: result.actual,
            stderr: result.stderr,
            passed: result.passed,
            verdict: result.verdict,
            error: result.errorKind,
          })),
        }
      : null;
    const ideRunResult = consoleOutput
      ? { stdout: consoleOutput, stderr: "", exitCode: 0, success: true }
      : null;
    const ideTask = {
      id: task.id,
      title: task.title,
      description: getPracticeText() || task.description,
      section: task.lesson.title,
      taskMode: (task.taskMode === "WEB" ? "WEB" : "CODE") as "CODE" | "WEB",
      projectSpec: task.projectSpec ?? null,
    };
    return <div className="min-h-full bg-[#f7f8f5] px-3 py-4 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-5 lg:px-8">
      <div className="mx-auto max-w-[1800px]">
        <nav aria-label={tr("Навігація задачі", "Task navigation")} className="mb-3 flex min-w-0 items-center gap-2 overflow-hidden text-xs font-semibold text-[#718075] dark:text-[#9eada1]">
          <button type="button" onClick={handleBack} className="max-w-[45%] truncate rounded-lg px-2 py-1 text-left hover:bg-white/60 hover:text-[#147b47] dark:hover:bg-white/[.06] dark:hover:text-[#72edb0]">{task.lesson.title}</button>
          <span aria-hidden="true">/</span>
          <span className="min-w-0 truncate text-[#1b2820] dark:text-[#edf5ef]">{task.title}</span>
        </nav>
        <StudyCodIDEWorkspace
          task={ideTask}
          theory={hasTheory ? task.lesson.theory || null : null}
          language={ideLanguage}
          onLanguageChange={() => undefined}
          disableLanguageChange
          compiler=""
          onCompilerChange={() => undefined}
          code={code}
          onCodeChange={setCode}
          files={files}
          onFilesChange={(next) => setFiles(ensureEntryFile(entryFile, next, currentCodeText))}
          useFiles={useFiles}
          onEnableFiles={() => { setUseFiles(true); setFiles(ensureEntryFile(entryFile, [{ path: entryFile, content: currentCodeText }], currentCodeText)); }}
          entryFile={isWebTask ? "index.html" : entryFile}
          stdin={testInput}
          onStdinChange={setTestInput}
          onUseExampleInput={() => undefined}
          running={running}
          checking={submitting}
          onRun={handleRun}
          onCheck={handleSubmit}
          onSave={() => showToast({ type: "success", message: tr("Автозбереження активне", "Autosave is active") })}
          onReset={() => { setCode(task.template); setFiles(ensureEntryFile(entryFile, [{ path: entryFile, content: task.template }], task.template)); }}
          readOnly={!canEdit}
          onBack={handleBack}
          runResult={ideRunResult}
          checkResult={ideCheckResult}
          trace={ideTrace}
          tracing={ideTracing}
          onTrace={isWebTask ? undefined : handleTrace}
          webPreviewFiles={isWebTask ? toWebTaskFiles() : undefined}
          isWebTask={isWebTask}
        />
      </div>
    </div>;
  }
  return <div className="h-full min-h-0 flex flex-col bg-bg-base">
      {}
      {!showTheory && <div className={`border-b flex-shrink-0 ${task.lesson.type === "CONTROL" ? "border-accent-warn/30 bg-accent-warn/[0.04]" : "border-border bg-bg-surface"}`}>
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5">
            {}
            <button
              type="button"
              onClick={() => {
                const hasTheory = task.lesson.hasTheory && task.lesson.theory && task.lesson.theory.trim().length > 0;
                if (theoryAcknowledged && hasTheory) {
                  setTheoryAcknowledged(false);
                } else {
                  handleBack();
                }
              }}
              className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
              title={t("back")}
              aria-label={t("back")}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {}
            <div className="min-w-0 flex-1 flex flex-col">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm sm:text-base font-semibold tracking-tight text-text-primary truncate">{task.title}</h1>
                <span className={`flex-shrink-0 px-2 py-0.5 rounded-full border font-mono text-[10px] uppercase tracking-[0.04em] ${task.lesson.type === "CONTROL" ? "border-accent-warn/50 text-accent-warn" : "border-border text-text-muted"}`}>
                  {task.lesson.type === "LESSON" ? t("lesson") : task.lesson.type === "TOPIC" ? t("topic") : t("controlWork")}
                </span>
                <span className="hidden sm:inline-flex flex-shrink-0 px-2 py-0.5 rounded-full border border-border text-text-muted font-mono text-[10px]">{task.language}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-text-muted mt-0.5 min-w-0">
                {task.testDataCount !== undefined && <span className="truncate">{t("tests")}: {task.testDataCount}</span>}
                {task.maxAttempts !== undefined && task.attemptsUsed !== undefined && <span className="hidden md:inline truncate">· {t("attempts")}: {task.attemptsUsed}/{task.maxAttempts}{attemptsRemaining !== null ? ` · ${tr("Залишилось", "Remaining")}: ${attemptsRemaining}` : ""}</span>}
                {task.isClosed && <span className="text-accent-error truncate">· {t("taskClosed")}</span>}
                {!hideControlResults && task.grade && <span className={`hidden md:inline truncate font-bold ${task.grade.total >= 85 ? "text-accent-success" : task.grade.total >= 65 ? "text-accent-warn" : task.grade.total >= 40 ? "text-accent-warning" : "text-accent-error"}`}>· {t("grade")}: {task.grade.total}/100</span>}
              </div>
            </div>

            {}
            {(timeRemaining !== null && task.lesson.type === "CONTROL") || (deadlineRemaining !== null && !task.isClosed) ? (
              <div className={`flex-shrink-0 items-center ${timeRemaining !== null && task.lesson.type === "CONTROL" ? "flex" : "hidden sm:flex"}`}>
                {timeRemaining !== null && task.lesson.type === "CONTROL" ? (
                  <span role="status" aria-live="polite" className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-sm font-semibold border ${timeRemaining <= 5 ? "text-accent-error border-accent-error/40 bg-accent-error/10" : timeRemaining <= 10 ? "text-accent-warning border-accent-warning/40 bg-accent-warning/10" : "text-accent-warn border-accent-warn/40 bg-accent-warn/10"}`}>
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                    {Math.floor(timeRemaining)} {tr("хв", "min")}
                  </span>
                ) : deadlineRemaining !== null && !task.isClosed ? (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-sm border ${deadlineRemaining <= 300 ? "text-accent-error border-accent-error/40 bg-accent-error/10" : deadlineRemaining <= 600 ? "text-accent-warning border-accent-warning/40 bg-accent-warning/10" : "text-text-secondary border-border"}`}>
                    <Clock className="w-3.5 h-3.5" />
                    {deadlineRemaining > 3600 ? t("timeHhMm", { h: Math.floor(deadlineRemaining / 3600), m: Math.floor(deadlineRemaining % 3600 / 60) }) : deadlineRemaining > 60 ? t("timeMm", { m: Math.floor(deadlineRemaining / 60) }) : t("timeSs", { s: deadlineRemaining })}
                  </span>
                ) : null}
              </div>
            ) : null}

            {}
            {!hideControlResults && lastScoring && typeof scoringPct === "number" && <div className="flex-shrink-0 hidden lg:flex items-center gap-2" title={`${tr("Бал", "Score")}: ${lastScoring.score}/${lastScoring.maxScore} (${scoringPct}%)`}>
                <div className="w-24 h-1.5 bg-border rounded-full overflow-hidden">
                  {Array.isArray(scoringSegments) && scoringSegments.length > 0 ? <div className="h-1.5 w-full flex">
                      {scoringSegments.map(seg => <div key={seg.key} className={`h-1.5 ${seg.className}`} title={seg.title} style={{ width: `${seg.pct}%` }} />)}
                    </div> : <div className="h-1.5 bg-primary" style={{ width: `${scoringPct}%` }} />}
                </div>
                <span className="text-[11px] font-mono text-text-secondary tabular-nums">{scoringPct}%</span>
              </div>}

            {}
            {theoryAcknowledged && <div className="flex-shrink-0 flex items-center gap-1.5">
                {!hideControlResults && <Button variant="ghost" size="sm" onClick={handleRun} disabled={!canEdit || running} className="px-2.5" title={tr("Запустити", "Run")} aria-label={tr("Запустити", "Run")}>
                    <Play className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">{tr("Запустити", "Run")}</span>
                  </Button>}

                <Button variant="primary" size="sm" onClick={handleSubmit} disabled={submitting || !canSubmit} className="px-3" aria-label={submitting ? tr("Перевірка…", "Checking…") : tr("Відправити рішення", "Submit solution")}>
                  <Send className="w-4 h-4 sm:mr-1.5" />
                  <span className="hidden sm:inline">{submitting ? tr("Перевірка...", "Checking...") : tr("Відправити", "Submit")}</span>
                </Button>

                {}
                <div className="relative" ref={actionsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setActionsMenuOpen(o => !o)}
                    className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-fast ${actionsMenuOpen ? "border-primary text-primary bg-primary/10" : "border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
                    title={tr("Більше дій", "More actions")}
                    aria-label={tr("Більше дій", "More actions")}
                    aria-haspopup="menu"
                    aria-expanded={actionsMenuOpen}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                  <AnimatePresence>
                    {actionsMenuOpen && <motion.div
                      role="menu"
                      initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                      animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.14, ease: easeOutQuint }}
                      className="absolute right-0 top-full mt-2 z-40 w-60 rounded-xl border border-border bg-bg-surface shadow-xl overflow-hidden py-1"
                    >
                      <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setTheoryAcknowledged(false); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast text-left">
                        <BookOpen className="w-4 h-4 flex-shrink-0 text-text-muted" /> {t("theory")}
                      </button>
                      <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); importInputRef.current?.click(); }} disabled={!canEdit} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast text-left disabled:opacity-40 disabled:cursor-not-allowed">
                        <Upload className="w-4 h-4 flex-shrink-0 text-text-muted" /> {tr("Імпорт коду з файлу", "Import code from file")}
                      </button>
                      {!useFiles && canEdit && <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setUseFiles(true); setFiles(ensureEntryFile(entryFile, [{ path: entryFile, content: code }], code)); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast text-left">
                        <FilePlus2 className="w-4 h-4 flex-shrink-0 text-text-muted" /> {tr("Додати файл", "Add file")}
                      </button>}
                      {!hideControlResults && testResults.length > 0 && <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setShowResults(true); }} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast text-left">
                        <ListChecks className="w-4 h-4 flex-shrink-0 text-text-muted" /> {tr("Результати", "Results")}
                      </button>}
                      {canComplete && <>
                        <div className="my-1 border-t border-border" />
                        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); handleComplete(); }} disabled={submitting} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-accent-warn hover:bg-accent-warn/10 transition-fast text-left disabled:opacity-40 disabled:cursor-not-allowed" title={tr("Завершити завдання достроково (закриє можливість редагування)", "Complete the task early (will disable editing)")}>
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {tr("Завершити достроково", "Complete early")}
                        </button>
                      </>}
                    </motion.div>}
                  </AnimatePresence>
                </div>
              </div>}
          </div>

          <input key={importSolutionKey} ref={importInputRef} type="file" accept={task.language === "JAVA" ? ".java,.txt,text/plain" : task.language === "CPP" ? ".cpp,.txt,text/plain" : ".py,.txt,text/plain"} onChange={e => handleImportSolutionFile(e.target.files?.[0] || null)} className="hidden" />
        </div>}

      {}
      {showTheory ? <div className="flex-1 flex flex-col overflow-hidden bg-bg-base">
          {}
          <div className="border-b border-border bg-bg-surface px-3 sm:px-4 py-2.5 flex-shrink-0 flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-fast"
              title={t("back")}
              aria-label={t("back")}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="min-w-0 flex-1 text-sm sm:text-base font-semibold tracking-tight text-text-primary truncate">{task.title}</h1>
            {}
            <div className="flex-shrink-0 flex items-center gap-1 rounded-lg border border-border p-0.5 bg-bg-base">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-[0.04em] bg-primary/12 text-primary">
                <BookOpen className="w-3.5 h-3.5" /> {t("theory")}
              </span>
              <button type="button" onClick={() => setTheoryAcknowledged(true)} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono uppercase tracking-[0.04em] text-text-muted hover:text-text-primary hover:bg-bg-hover transition-fast">
                <FileText className="w-3.5 h-3.5" /> {t("task")}
              </button>
            </div>
          </div>
              <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 sm:pb-24" ref={setTheoryPaneEl}>
                <div className="max-w-3xl mx-auto">
                  <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted mb-4">// {t("theory")}</div>
                  <div className="prose prose-invert max-w-none text-text-secondary font-mono">
                    <LessonTheoryView theory={task.lesson.theory || ""} />
                  </div>
                </div>
              </div>
              <div className="bg-bg-surface/95 backdrop-blur border-t border-border p-3 sm:p-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-shrink-0 fixed bottom-0 left-0 right-0 z-30">
                <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                  <p className="text-xs font-mono text-text-muted flex-1">
                    {tr("Після прочитання теорії ви зможете перейти до практичного завдання", "After reading theory you can proceed to the practice task")}
                  </p>
                  <Button variant="primary" onClick={() => {
            setTheoryAcknowledged(true);
          }} className="whitespace-nowrap w-full sm:w-auto">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> {tr("Я прочитав теорію", "I have read the theory")}
                  </Button>
                </div>
              </div>
            </div> : <Group orientation={isCompactViewport ? "vertical" : "horizontal"} className="flex-1 overflow-hidden">
            {}
            <Panel defaultSize={isCompactViewport ? 34 : 25} minSize={isCompactViewport ? 20 : 15} maxSize={isCompactViewport ? 65 : 60} className={`flex flex-col overflow-hidden bg-bg-base ${isCompactViewport ? "border-b border-border" : "border-r border-border"}`}>
              <div className="px-3 py-2.5 border-b border-border bg-bg-surface flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
                <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-text-secondary flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-text-muted" />
                  {task.lesson.type === "CONTROL" && quizQuestions.length > 0 ? tr("Теоретична частина", "Theory part") : t("task")}
                </div>
                {hasTheory && task.lesson.type !== "CONTROL" && <button type="button" onClick={() => setTheoryAcknowledged(false)} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono uppercase tracking-[0.04em] text-text-muted hover:text-primary hover:bg-bg-hover transition-fast" title={t("theory")}>
                  <BookOpen className="w-3.5 h-3.5" /> {t("theory")}
                </button>}
              </div>
              <div className="flex-1 overflow-y-auto p-4 bg-bg-base" ref={setTaskPaneEl}>
                {task.isClosed && (
                  <div className="mb-4 rounded-[var(--ui-card-radius)] border border-accent-error/40 bg-accent-error/10 p-3" role="alert">
                    <div className="flex items-start gap-2">
                      <Lock className="w-4 h-4 shrink-0 text-accent-error mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-accent-error">{tr("Завдання закрите", "Task is closed")}</div>
                        <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                          {tr(
                            "Тему закрито — самостійно змінити оцінку вже не можна. Якщо вважаєш оцінку несправедливою, подай апеляцію вчителю.",
                            "This topic is closed — you can no longer change the grade yourself. If you think the grade is unfair, submit an appeal to the teacher."
                          )}
                        </p>
                        {task.grade?.id != null && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="mt-2.5"
                            onClick={() => navigate(`/edu/appeals?targetType=EDU_GRADE&targetId=${task.grade?.id}`)}
                          >
                            {tr("Оскаржити оцінку", "Appeal the grade")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {task.lesson.type === "CONTROL" && quizQuestions.length > 0 ? <div className="space-y-4">
                    <div className="mb-4 pb-3 border-b border-border">
                      <h3 className="text-lg font-mono text-text-primary mb-1">{tr("Теоретична частина", "Theory part")}</h3>
                      <p className="text-xs text-text-secondary">
                        {tr("Відповідьте на всі питання. Після відправки змінити відповіді буде неможливо.", "Answer all questions. After submitting, you will not be able to change your answers.")}
                      </p>
                      <div className="mt-2 text-xs text-text-muted">
                        {tr("Progress", "Progress")}: {Object.keys(quizAnswers).length} / {quizQuestions.length}{" "}
                        {tr("питань", "questions")}
                      </div>
                    </div>
                    {quizQuestions.map((q, index: number) => <Card id={`quiz-q-${index}`} key={index} className={`p-4 transition-all ${quizAnswers[index] ? "border-primary/50 bg-bg-code/50" : "border-border"} ${quizSubmitted && quizAnswers[index] === q.correct ? "border-accent-success bg-accent-success/10" : quizSubmitted && quizAnswers[index] && quizAnswers[index] !== q.correct ? "border-accent-error bg-accent-error/10" : ""}`}>
                        <div className="mb-4">
                          <div className="flex items-start gap-2 mb-2">
                            <span className="text-xs font-mono text-text-secondary bg-bg-surface px-2 py-1 rounded">
                              {index + 1} / {quizQuestions.length}
                            </span>
                            {quizAnswers[index] && !quizSubmitted && <span className="text-xs text-primary">{tr("✓ Відповідь вибрано", "✓ Answer selected")}</span>}
                          </div>
                          <div className="text-sm font-mono text-text-primary">
                            <MarkdownView content={q.question} />
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(["А", "Б", "В", "Г", "Д"] as const).map(option => {
                  const isSelected = quizAnswers[index] === option;
                  const isCorrect = q.correct === option;
                  const isWrong = isSelected && !isCorrect && quizSubmitted;
                  return <label key={option} className={`flex items-start p-3 border-2 rounded-lg cursor-pointer transition-all ${isSelected && !quizSubmitted ? "border-primary bg-primary/10 shadow-md" : quizSubmitted && isCorrect ? "border-accent-success bg-accent-success/20" : quizSubmitted && isWrong ? "border-accent-error bg-accent-error/20" : "border-border hover:border-primary/50 hover:bg-bg-hover"} ${quizSubmitted ? "cursor-default" : ""}`}>
                                <input type="radio" name={`question-${index}`} value={option} checked={isSelected} onChange={() => {
                      if (!quizSubmitted) {
                        const newAnswers = {
                          ...quizAnswers,
                          [index]: option
                        };
                        setQuizAnswers(newAnswers);
                        localStorage.setItem(scopedStorageKey("quiz_answers", taskId || "unknown"), JSON.stringify(newAnswers));

                        // Persist last interacted quiz question for resume.
                        resumeExtrasRef.current.questionIndex = index;
                        resumeExtrasRef.current.anchorId = `quiz-q-${index}`;
                        saveResume(viewportEl?.scrollTop);
                      }
                    }} disabled={quizSubmitted} className="mt-1 mr-3 flex-shrink-0" />
                                <div className="flex-1">
                                  <span className="font-semibold text-text-primary mr-2">{option})</span>
                                  <span className="text-sm font-mono text-text-primary">
                                    <MarkdownView content={q.options[option]} />
                                  </span>
                                </div>
                                {quizSubmitted && isCorrect && <span className="ml-2 text-accent-success flex-shrink-0">✓</span>}
                                {quizSubmitted && isWrong && <span className="ml-2 text-accent-error flex-shrink-0">✗</span>}
                              </label>;
                })}
                        </div>
                      </Card>)}
                    {!quizSubmitted && <div className="sticky bottom-0 bg-bg-surface border-t border-border p-4 -mx-4 -mb-4 mt-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="text-sm text-text-secondary">
                            {Object.keys(quizAnswers).length < quizQuestions.length ? <span className="text-accent-warn">
                                {tr("Залишилось відповісти на", "Remaining")}{" "}
                                {quizQuestions.length - Object.keys(quizAnswers).length}{" "}
                                {tr("питань", "questions")}
                              </span> : <span className="text-accent-success">{tr("Всі питання відповідені", "All questions answered")}</span>}
                          </div>
                          <Button variant="primary" onClick={handleSubmitQuiz} disabled={submitting || Object.keys(quizAnswers).length < quizQuestions.length} className="text-sm px-6 py-2 font-semibold">
                            <Send className="w-4 h-4 mr-2" />
                            {tr("Відправити тест", "Submit quiz")}
                          </Button>
                        </div>
                      </div>}
                    {quizSubmitted && quizGrade !== null && <Card className="p-4 sm:p-6 bg-gradient-to-br from-primary/20 to-secondary/20 border-primary">
                        <div className="text-center">
                          <div className={`text-3xl font-mono mb-2 font-bold ${quizGrade >= 85 ? "text-accent-success" : quizGrade >= 65 ? "text-accent-warn" : quizGrade >= 40 ? "text-accent-warning" : "text-accent-error"}`}>
                            {quizGrade}/100
                          </div>
                          <div className="text-sm text-text-secondary mb-4">
                            {tr("Оцінка за теоретичну частину", "Theory part grade")}
                          </div>
                          <div className="text-xs text-text-muted">
                            {tr("Correct answers", "Correct answers")}:{" "}
                            {Object.keys(quizAnswers).filter(i => quizQuestions[parseInt(i)]?.correct === quizAnswers[parseInt(i)]).length}{" "}
                            {tr("з", "of")} {quizQuestions.length}
                          </div>
                        </div>
                      </Card>}
                  </div> : <div className="prose prose-invert max-w-none text-text-secondary font-mono text-sm">
                    <MarkdownView content={getPracticeText() || task.description || ""} />
                  </div>}
              </div>
            </Panel>

            <Separator className={`bg-border hover:bg-primary transition-colors flex-shrink-0 relative group ${isCompactViewport ? "h-2 w-full cursor-row-resize" : "w-2 cursor-col-resize"}`}>
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <div className={isCompactViewport ? "h-0.5 w-10 bg-primary rounded-full" : "w-0.5 h-8 bg-primary rounded-full"} />
              </div>
            </Separator>

            {}
            <Panel defaultSize={hideControlResults ? isCompactViewport ? 66 : 75 : isCompactViewport ? 40 : 50} minSize={isCompactViewport ? 25 : 20} maxSize={hideControlResults ? 85 : 70} className="flex flex-col overflow-hidden bg-bg-code">
              {isWebTask ? (
                <div className="h-full min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-0">
                  <div className="border-r border-border min-h-0">
                    <MultiFileEditor
                      language="html"
                      entryFile="index.html"
                      files={useFiles ? files : [{ path: "index.html", content: code }]}
                      onChange={(next) => {
                        const normalized = normalizeFiles(next);
                        setUseFiles(true);
                        setFiles(normalized);
                        setCode(normalized.find(f => f.path === "index.html")?.content ?? "");
                      }}
                      readOnly={!canEdit}
                    />
                  </div>
                  <div className="min-h-0">
                    <WebPreviewPane files={toWebTaskFiles()} title={tr("Превʼю", "Preview")} />
                  </div>
                </div>
              ) : useFiles ? (
                <MultiFileEditor
                  language={task.language}
                  entryFile={entryFile}
                  files={files}
                  onChange={(next) => setFiles(ensureEntryFile(entryFile, next, currentCodeText))}
                  readOnly={!canEdit}
                />
              ) : (
                <CodeEditor value={code} onChange={canEdit ? setCode : undefined} language={task.language} readOnly={!canEdit} />
              )}
            </Panel>

            {!hideControlResults && <>
                <Separator className={`bg-border hover:bg-primary transition-colors flex-shrink-0 relative group ${isCompactViewport ? "h-2 w-full cursor-row-resize" : "w-2 cursor-col-resize"}`}>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className={isCompactViewport ? "h-0.5 w-10 bg-primary rounded-full" : "w-0.5 h-8 bg-primary rounded-full"} />
                  </div>
                </Separator>

                {}
                <Panel defaultSize={isCompactViewport ? 26 : 25} minSize={isCompactViewport ? 16 : 10} maxSize={isCompactViewport ? 60 : 50} className={`flex flex-col overflow-hidden bg-bg-code ${isCompactViewport ? "border-t border-border" : "border-l border-border"}`}>
                  <div className="px-3 py-2.5 border-b border-border bg-bg-surface flex items-center gap-3 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-border" />
                      <span className="w-2.5 h-2.5 rounded-full bg-border" />
                      <span className="w-2.5 h-2.5 rounded-full bg-border" />
                    </div>
                    <div className="text-[11px] font-mono uppercase tracking-[0.06em] text-text-secondary flex items-center gap-1.5">
                      <Terminal className="w-3.5 h-3.5 text-text-muted" /> {tr("Консоль", "Console")}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {}
                    <div className="border-b border-border p-3 flex-shrink-0">
                      <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-2">{tr("Вхідні дані", "Input")}</div>
                      <textarea value={testInput} onChange={e => setTestInput(e.target.value)} placeholder={tr("Введіть тестові дані...", "Enter test input...")} className="w-full h-24 bg-bg-base border border-border rounded-lg p-2 font-mono text-xs text-text-primary resize-none focus:outline-none focus:border-primary" spellCheck={false} />
                    </div>
                    {}
                    <div className="flex-1 overflow-y-auto p-4">
                      {}
                      {isRunningTests && Object.keys(testProgress).length > 0 ? <div className="space-y-2" role="status" aria-live="polite">
                          <div className="flex items-center gap-2 text-xs font-mono text-text-primary mb-3">
                            <Loader2 className="w-3 h-3 animate-spin text-primary" />
                            <span>{tr("Перевіряємо код...", "Checking code...")}</span>
                          </div>
                          {Object.entries(testProgress).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([testId, status], index) => <div key={testId} className="flex items-center gap-2 text-xs font-mono">
                                {status === 'pending' && <span className="text-text-muted">• {tr("Тест", "Test")} {index + 1}</span>}
                                {status === 'running' && <>
                                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                                    <span className="text-text-primary">{tr("Тест", "Test")} {index + 1}</span>
                                  </>}
                                {status === 'passed' && <>
                                    <CheckCircle2 className="w-3 h-3 text-accent-success" />
                                    <span className="text-accent-success">{tr("Тест", "Test")} {index + 1}</span>
                                  </>}
                                {status === 'failed' && <>
                                    <XCircle className="w-3 h-3 text-accent-error" />
                                    <span className="text-accent-error">{tr("Тест", "Test")} {index + 1}</span>
                                  </>}
                              </div>)}
                        </div> : consoleOutput ? <pre role="status" aria-live="polite" className="text-xs text-text-secondary whitespace-pre-wrap m-0" style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Code", "Fira Code", Consolas, "Courier New", monospace'
                }}>
                          {consoleOutput}
                        </pre> : <span className="text-text-muted italic">
                          {tr("// Результат виконання з'явиться тут...", "// Program output will appear here...")}
                        </span>}
                    </div>
                  </div>
                </Panel>
              </>}
          </Group>}

      {}
      {showResults && !hideControlResults && <Modal open={showResults} onClose={() => setShowResults(false)} title={tr("Результати тестування", "Test results")} showCloseButton={false}>
          <div className="p-4 sm:p-6 max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-4">
              <ListChecks className="w-4 h-4 text-text-muted" />
              <h2 className="text-sm font-mono uppercase tracking-[0.06em] text-text-secondary">{tr("Результати тестування", "Test results")}</h2>
            </div>

            {lastScoring && lastScoring.maxScore > 0 && <div className="mb-4 p-3 rounded-lg border border-border bg-bg-code">
                <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-2">{tr("Прогрес", "Progress")}</div>
                <div className="h-2 w-full bg-border rounded overflow-hidden">
                  {Array.isArray(scoringSegments) && scoringSegments.length > 0 ? <div className="h-2 w-full flex">
                      {scoringSegments.map(seg => <div key={seg.key} className={`h-2 ${seg.className}`} title={seg.title} style={{
                      width: `${seg.pct}%`
                    }} />)}
                    </div> : <div className="h-2 bg-primary" style={{
                      width: `${Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100)))}%`
                    }} />}
                </div>
                <div className="mt-1 text-[10px] font-mono text-text-muted flex flex-wrap items-center justify-between gap-2">
                  <span>{tr("Бал", "Score")}: <span className="text-text-secondary">{lastScoring.score}/{lastScoring.maxScore}</span></span>
                  <span>{Math.max(0, Math.min(100, Math.round(lastScoring.score / lastScoring.maxScore * 100)))}%</span>
                </div>
                {showScoringLegend && <div className="mt-1 text-[10px] font-mono text-text-muted flex items-center gap-3">
                    <span className="inline-flex items-center gap-1" title={tr("Публічні тести", "Public tests")}>
                      <span className="inline-block w-2 h-2 rounded-sm bg-primary" />
                      <span>{tr("публічні", "public")}</span>
                    </span>
                    <span className="inline-flex items-center gap-1" title={tr("Приховані тести", "Hidden tests")}>
                      <span className="inline-block w-2 h-2 rounded-sm bg-violet-500" />
                      <span>{tr("приховані", "hidden")}</span>
                    </span>
                  </div>}
                {Array.isArray(lastScoring.groupScores) && lastScoring.groupScores.length > 0 && <div className="mt-2 space-y-1">
                    {lastScoring.groupScores.map((g, idx) => {
                  const gpct = g.maxScore > 0 ? Math.round(g.score / g.maxScore * 100) : 0;
                  const label = formatScoreGroupLabel(g.group);
                  return <div key={`${g.group}-${idx}`} className="text-[10px] font-mono text-text-muted flex flex-wrap items-center justify-between gap-2">
                          <span>{label}</span>
                          <span className="text-text-secondary">{g.score}/{g.maxScore} ({gpct}%)</span>
                        </div>;
                })}
                  </div>}
              </div>}

            {hints.length > 0 && <div className="mb-4 p-3 rounded-lg border border-border bg-bg-surface">
                <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-2">{tr("Підказки (крок за кроком)", "Hints (step-by-step)")}</div>
                <div className="space-y-2">
                  {hints.slice(0, revealedHints).map((h, i) => <div key={i} className="text-xs font-mono text-text-primary whitespace-pre-wrap">
                        {i + 1}. {h}
                      </div>)}
                  <div className="flex flex-wrap gap-2">
                    {revealedHints < hints.length && <Button variant="ghost" onClick={() => setRevealedHints(v => Math.min(hints.length, v + 1))} className="text-xs">
                        {tr("Показати підказку", "Show hint")}
                      </Button>}
                    {revealedHints < hints.length && hints.length > 1 && <Button variant="ghost" onClick={() => setRevealedHints(hints.length)} className="text-xs">
                        {tr("Показати всі", "Show all")}
                      </Button>}
                    {revealedHints > 0 && <Button variant="ghost" onClick={() => setRevealedHints(0)} className="text-xs">
                        {tr("Сховати", "Hide")}
                      </Button>}
                  </div>

                  {hintFeedbackContext && <div className="mt-3 border-t border-border/60 pt-3">
                      <div className="text-[11px] font-mono text-text-secondary mb-2">
                        {tr("Ці підказки були корисними?", "Were these hints useful?")}
                      </div>

                      {!hintFeedbackAlreadySent ? <>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="ghost"
                              className="text-xs"
                              disabled={hintFeedbackSending}
                              onClick={() => {
                                setHintFeedbackSignal("up");
                                void handleSendHintFeedback("up");
                              }}
                            >
                              {tr("Так, корисно", "Yes, helpful")}
                            </Button>
                            <Button
                              variant="ghost"
                              className="text-xs"
                              disabled={hintFeedbackSending}
                              onClick={() => setHintFeedbackSignal("down")}
                            >
                              {tr("Не дуже", "Not really")}
                            </Button>
                          </div>

                          {hintFeedbackSignal === "down" && <div className="mt-2 space-y-2">
                              <select
                                value={hintFeedbackReasonCode}
                                onChange={e => setHintFeedbackReasonCode(e.target.value as HintFeedbackReasonCode)}
                                className="w-full px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs focus:outline-none focus:border-primary"
                              >
                                {(["NOT_SPECIFIC", "INCORRECT", "TOO_HARD", "TOO_VERBOSE", "OTHER"] as HintFeedbackReasonCode[]).map(reason => <option key={reason} value={reason}>
                                    {formatHintFeedbackReason(reason)}
                                  </option>)}
                              </select>

                              <textarea
                                value={hintFeedbackReasonText}
                                onChange={e => setHintFeedbackReasonText(e.target.value)}
                                rows={2}
                                className="w-full px-2 py-1 bg-bg-surface border border-border text-text-primary font-mono text-xs focus:outline-none focus:border-primary"
                                placeholder={tr("Коротко: що саме не спрацювало?", "Briefly: what did not work?")}
                              />

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="ghost"
                                  className="text-xs"
                                  disabled={hintFeedbackSending}
                                  onClick={() => void handleSendHintFeedback("down")}
                                >
                                  {hintFeedbackSending ? tr("Надсилання...", "Sending...") : tr("Надіслати відгук", "Send feedback")}
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="text-xs"
                                  disabled={hintFeedbackSending}
                                  onClick={() => {
                                    setHintFeedbackSignal(null);
                                    setHintFeedbackReasonText("");
                                  }}
                                >
                                  {tr("Скасувати", "Cancel")}
                                </Button>
                              </div>
                            </div>}
                        </> : <div className="text-[11px] font-mono text-accent-success">
                          {hintFeedbackStored === false
                            ? tr("Дякуємо! Відгук збережено в телеметрії.", "Thanks! Feedback captured in telemetry.")
                            : tr("Дякуємо! Відгук збережено.", "Thanks! Feedback saved.")}
                        </div>}
                    </div>}
                </div>
              </div>}

            {(() => {
              const latest = latestSubmissionBindingRef.current;
              if (!latest || !learningFeedbackMeta?.codeHash) return null;
              const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
              const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
              if (!sameHash || !sameId) return null;
              const analysis = learningFeedback?.analysis ?? null;
              if (!analysis) return null;

              return <div className="mb-4 p-3 rounded-lg border border-border bg-bg-surface">
                  <div className="text-[10px] font-mono uppercase tracking-[0.06em] text-text-muted mb-2">{tr("AI-розбір провалу", "AI failure analysis")}</div>
                  <div className="text-xs font-mono text-text-secondary mb-2">
                    <span className="text-text-primary">{tr("Зведення", "Summary")}:</span> {analysis.summary}
                  </div>
                  <div className="text-xs font-mono text-text-secondary mb-2">
                    <span className="text-text-primary">{tr("Ймовірна причина", "Likely root cause")}:</span> {analysis.likelyRootCause}
                  </div>
                  {Array.isArray(analysis.nextSteps) && analysis.nextSteps.length > 0 && <div className="text-xs font-mono text-text-secondary">
                      <div className="text-text-primary mb-1">{tr("Що зробити далі", "What to do next")}:</div>
                      <ol className="list-decimal pl-4 space-y-1">
                        {analysis.nextSteps.map((step, idx) => <li key={`${idx}-${step.slice(0, 24)}`}>{step}</li>)}
                      </ol>
                    </div>}
                  <div className="mt-2 text-[10px] font-mono text-text-muted">
                    {tr("Впевненість моделі", "Model confidence")}: {analysis.confidence}
                  </div>
                </div>;
            })()}

            <FailureRecoveryCard
              verdict={(() => {
                const latest = latestSubmissionBindingRef.current;
                if (!latest || !learningFeedbackMeta?.codeHash) return null;
                const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
                const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
                return sameHash && sameId ? (learningFeedback?.verdict ?? null) : null;
              })()}
              firstFailure={(() => {
                const latest = latestSubmissionBindingRef.current;
                if (!latest || !learningFeedbackMeta?.codeHash) return null;
                const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
                const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
                return sameHash && sameId ? (learningFeedback?.firstFailure ?? null) : null;
              })()}
              taskId={Number(taskId)}
              taskKind="EDU"
              learningAttemptId={learningAttempt?.id}
              failureCategory={learningAttempt?.failureCategory ?? learningFeedback?.firstFailure?.errorKind ?? null}
              highestHintLevelShown={learningAttempt?.highestHintLevelShown ?? 0}
              onTryAgain={() => setShowResults(false)}
            />

            {(() => {
              const latest = latestSubmissionBindingRef.current;
              if (!latest || !learningFeedbackMeta?.codeHash) return null;
              const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
              const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
              if (!sameHash || !sameId || String(learningFeedback?.verdict ?? "").toUpperCase() !== "AC") return null;
              const reinforced = Boolean(learningAttempt?.solvedAfterFailure);
              return <div className="mt-3 rounded-xl border border-accent-success/30 bg-accent-success/10 p-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-success" />
                  <div>
                    <div className="text-xs font-semibold text-accent-success">{tr(reinforced ? "Навичку закріплено" : "Рішення перевірено", reinforced ? "Skill reinforced" : "Solution verified")}</div>
                    <p className="mt-1 text-xs leading-5 text-text-secondary">{tr(reinforced ? "Ти виправив рішення після невдалої спроби й пройшов перевірку. Це доказ прогресу в поточній темі." : "Рішення пройшло перевірку. Продовжуй практикувати тему, щоб перетворити результат на стійку навичку.", reinforced ? "You fixed the solution after a failed attempt. This is evidence of progress in the current topic." : "The solution passed the check. Keep practicing the topic to turn this result into a durable skill.")}</p>
                  </div>
                </div>
              </div>;
            })()}

            {(() => {
              const latest = latestSubmissionBindingRef.current;
              if (!latest || !learningFeedbackMeta?.codeHash) return null;
              const sameHash = String(latest.codeHash) === String(learningFeedbackMeta.codeHash);
              const sameId = !latest.submissionId || String(latest.submissionId) === String(learningFeedbackMeta.submissionId);
              const isLatest = sameHash && sameId;
              const verdict = learningFeedback?.verdict ?? null;
              const firstFailure = learningFeedback?.firstFailure ?? null;
              const showFallback = isLatest && (verdict === "WA" || verdict === "PRESENTATION_ERROR" || verdict === "PARTIAL") && !firstFailure;
              if (!showFallback) return null;
              return <div className="mb-3 p-2 border border-border bg-bg-code text-xs font-mono text-text-secondary">
                  {tr("Перший збій стався на прихованому тесті — показ прев’ю недоступний. Перевірте крайові випадки та формат виводу.", "The first failure occurred on a hidden test, so preview is unavailable. Re-check edge cases and output formatting.")}
                </div>;
            })()}

            {testResults.length > 0 && <div className="rounded-lg border border-border bg-bg-code overflow-hidden divide-y divide-border">
              {testResults.map((result, index) => <div key={index} className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${result.passed ? "bg-accent-success" : "bg-accent-error"}`} />
                    <span className="text-xs font-mono text-text-primary flex-1">
                      {tr("Тест", "Test")} {index + 1}
                      {typeof result.testId === "number" ? <span className="text-text-muted"> (#{result.testId})</span> : null}
                    </span>
                    <span className={`text-[11px] font-mono uppercase tracking-[0.04em] ${result.passed ? "text-accent-success" : "text-accent-error"}`}>
                      {result.passed ? tr("Пройдено", "Passed") : tr("Не пройдено", "Failed")}
                    </span>
                  </div>
                  {(!result.passed && (result.verdict || result.errorKind || result.stderr)) && <div className="mt-1.5 ml-4.5 pl-0 text-[11px] font-mono space-y-1">
                    {(result.verdict || result.errorKind) && <div className="text-text-muted">
                        {[result.verdict, result.errorKind].filter(Boolean).join(" · ")}
                      </div>}
                    {result.stderr && <div className="text-accent-error whitespace-pre-wrap">{result.stderr}</div>}
                  </div>}
                </div>)}
            </div>}
            <div className="flex justify-end mt-4">
              <Button onClick={() => setShowResults(false)}>{tr("Закрити", "Close")}</Button>
            </div>
          </div>
        </Modal>}
    </div>;
};
