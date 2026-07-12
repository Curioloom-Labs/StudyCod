import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Play, RotateCcw, Save, CheckCircle2, LayoutDashboard, FolderCode, TerminalSquare, Sparkles } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";
import { Modal } from "../../components/ui/Modal";
import { StatusChip, type StatusChipTone } from "../../components/ui/StatusChip";
import { CodeEditor } from "../../components/CodeEditor";
import { MultiFileEditor } from "../../components/MultiFileEditor";
import { MarkdownView } from "../../components/MarkdownView";
import { ErrorExplainButton } from "../../components/ErrorExplainButton";
import { DebugMentorChat } from "../../components/DebugMentorChat";
import { useProctoring } from "../../hooks/useProctoring";
import { scoreProctoring, recordConceptReview } from "../../lib/api/tasks";
import { saveSolveReplay, type ReplaySnapshot } from "../../lib/api/learning";
import { WebPreviewPane } from "../../components/WebPreviewPane";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { extractFirstExampleInput, normalizeStdinBeforeRun } from "../../utils/inputTextNormalization";
import { useMediaQuery } from "../../utils/useMediaQuery";
import {
  checkLibraryWebTask,
  checkLibraryTask,
  getLibraryTask,
  getLibraryTaskByKey,
  getLibraryTaskAttempt,
  getLibraryWebTaskTemplate,
  runLibraryTask,
  saveLibraryWebTaskDraft,
  saveLibraryTaskDraft,
  type CodeFile,
  type LibraryCheckResult,
  type LibraryTaskListItem,
  type LibraryRunResult,
  type JudgeLanguage,
  type WebTaskFile,
} from "../../lib/api/library";
import { JUDGE_LANGUAGE_LABELS, JUDGE_ENTRY_FILES, enabledJudgeLanguages, compilersForFamily, defaultCompilerForFamily } from "../../lib/judgeLanguages";

const FRIENDLY_LANG = JUDGE_LANGUAGE_LABELS;

const previewLibraryTask: LibraryTaskListItem = {
  id: 901,
  problemCode: "frequency-map",
  slug: "frequency-map",
  title: "Частоти без зайвих проходів",
  description: "Порахуй, скільки разів кожне слово трапляється у вхідному рядку. Ігноруй регістр та виведи пари `слово: кількість` в алфавітному порядку.",
  template: "from collections import Counter\n\nwords = input().lower().split()\ncounts = Counter(words)\n\nfor word in sorted(counts):\n    print(f\"{word}: {counts[word]}\")\n",
  templatesByLanguage: null,
  lang: "PYTHON",
  difficulty: "MEDIUM",
  tags: ["collections", "strings"],
  section: "Основи Python",
  maxAttempts: 5,
  timeLimitMs: 1000,
  memoryLimitMb: 64,
  outputLimitKb: 64,
  checkerSpec: { type: "whitespace" },
  allowedLanguages: ["python", "java", "cpp"],
  status: "APPROVED",
  rejectionReason: null,
  submittedAt: null,
  publishedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  author: { id: 1, username: "studycod" },
};

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";

// Every task accepts every supported language — no per-task language restriction.
const getAllowedJudgeLanguages = (_task: { allowedLanguages?: JudgeLanguage[] | null }): JudgeLanguage[] => {
  return enabledJudgeLanguages();
};

const getTemplateForLanguage = (
  task: { template: string; templatesByLanguage?: Record<string, string> | null },
  language: JudgeLanguage
) => {
  const by = task.templatesByLanguage || null;
  const t = by && typeof by[language] === "string" ? String(by[language] ?? "") : "";
  return t.trim() ? t : task.template;
};

function entryFileForJudgeLanguage(lang: JudgeLanguage): string {
  return JUDGE_ENTRY_FILES[lang] ?? "Main.java";
}

function normalizeFiles(fs: CodeFile[]): CodeFile[] {
  const m = new Map<string, string>();
  for (const f of fs || []) {
    const p = String(f?.path ?? "").trim();
    if (!p) continue;
    m.set(p, String(f?.content ?? ""));
  }
  return Array.from(m.entries())
    .map(([path, content]) => ({ path, content }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function normalizeWebFiles(fs: WebTaskFile[] | null | undefined): CodeFile[] {
  const byPath = new Map<string, string>();
  for (const f of fs || []) {
    const p = String(f?.path ?? "").trim();
    if (p !== "index.html" && p !== "styles.css" && p !== "script.js") continue;
    byPath.set(p, String(f?.content ?? ""));
  }
  return normalizeFiles([
    { path: "index.html", content: byPath.get("index.html") ?? "" },
    { path: "styles.css", content: byPath.get("styles.css") ?? "" },
    { path: "script.js", content: byPath.get("script.js") ?? "" },
  ]);
}

function filesEqual(a: CodeFile[], b: CodeFile[]): boolean {
  const aa = normalizeFiles(a);
  const bb = normalizeFiles(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) {
    if (aa[i].path !== bb[i].path) return false;
    if (aa[i].content !== bb[i].content) return false;
  }
  return true;
}

function entryContentFromFiles(fs: CodeFile[], entryFile: string): string {
  const hit = (fs || []).find(f => f.path === entryFile);
  return hit?.content ?? "";
}

type TrFn = (uk: string, en: string) => string;

function runStatusChip(success: boolean, tr: TrFn) {
  return success
    ? {
        glyph: "▶",
        label: tr("Успіх", "Success"),
        tone: "success" as StatusChipTone,
      }
    : {
        glyph: "■",
        label: tr("Помилка", "Error"),
        tone: "error" as StatusChipTone,
      };
}

function verdictChip(verdictRaw: string | null | undefined, tr: TrFn) {
  const verdict = String(verdictRaw ?? "").trim().toUpperCase();
  if (!verdict) {
    return {
      glyph: "·",
      label: tr("Н/Д", "N/A"),
      tone: "neutral" as StatusChipTone,
    };
  }

  if (verdict === "AC") {
    return {
      glyph: "✓",
      label: "AC",
      tone: "success" as StatusChipTone,
    };
  }
  if (verdict === "WA") {
    return {
      glyph: "≈",
      label: "WA",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "TLE") {
    return {
      glyph: "⏱",
      label: "TLE",
      tone: "warn" as StatusChipTone,
    };
  }
  if (verdict === "CE") {
    return {
      glyph: "⚙",
      label: "CE",
      tone: "error" as StatusChipTone,
    };
  }
  if (verdict === "RE") {
    return {
      glyph: "💥",
      label: "RE",
      tone: "error" as StatusChipTone,
    };
  }

  return {
    glyph: "•",
    label: verdict,
    tone: "neutral" as StatusChipTone,
  };
}

export const LibraryTaskSolvePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const isCompactViewport = useMediaQuery("(max-width: 1023.98px)");
  const navigate = useNavigate();
  const location = useLocation();
  const hasToken = useMemo(() => {
    if (typeof window === "undefined") return false;
    try {
      return !!localStorage.getItem("token");
    } catch {
      return false;
    }
  }, []);
  // Privacy-respecting proctoring capture for the solve session (aggregate
  // behavioural signals only — see useProctoring).
  const proctoring = useProctoring(hasToken);

  // Solve-replay capture: throttled code snapshots over the session.
  const replaySnapshotsRef = useRef<ReplaySnapshot[]>([]);
  const replayStartRef = useRef<number>(Date.now());
  const lastSnapAtRef = useRef<number>(0);
  const params = useParams<{ taskKey?: string; taskId?: string; id?: string }>();
  const taskKey = useMemo(() => String(params.taskKey ?? params.taskId ?? params.id ?? "").trim(), [params]);
  const taskId = useMemo(() => {
    const v = parseInt(taskKey, 10);
    return taskKey && String(v) === taskKey ? v : null;
  }, [taskKey]);

  const designPreview = import.meta.env.DEV && new URLSearchParams(location.search || "").get("preview") === "true";
  const libraryListPath = useMemo(() => {
    const path = location.pathname.startsWith("/edu/") ? "/edu/library" : "/library";
    return designPreview ? `${path}?preview=true` : path;
  }, [designPreview, location.pathname]);
  const safeBackPath = useMemo(() => {
    const fromRaw = new URLSearchParams(location.search || "").get("from");
    if (!fromRaw) return libraryListPath;
    try {
      // URLSearchParams already decodes query params.
      const candidate = String(fromRaw).trim();
      if (candidate.startsWith("/") && !candidate.startsWith("//")) {
        return candidate;
      }
    } catch {
      // ignore malformed query value
    }
    return libraryListPath;
  }, [location.search, libraryListPath]);

  const goBackToLibrary = () => {
    const isSolvePath = (p: string) => /^\/(?:edu\/)?library\/solve\//.test(String(p || ""));

    const primaryTarget = !isSolvePath(safeBackPath) ? safeBackPath : libraryListPath;
    const target = primaryTarget || libraryListPath;

    if (typeof window !== "undefined") {
      window.location.assign(target);
      return;
    }
    navigate(target, { replace: true });
  };

  const redirectToLoginWithNext = () => {
    const next = encodeURIComponent(`${location.pathname}${location.search || ""}`);
    navigate(`/?auth=login&next=${next}`);
  };

  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<Awaited<ReturnType<typeof getLibraryTask>>["task"] | null>(null);
  const [theory, setTheory] = useState<string | null>(null);

  // Always use a numeric id for run/check/drafts. When the route uses slug/problemCode,
  // taskId will be null, but loaded task will still have an id.
  const effectiveTaskId = task?.id ?? taskId;

  const [judgeLanguage, setJudgeLanguage] = useState<JudgeLanguage>("java");
  const [judgeCompiler, setJudgeCompiler] = useState<string>(defaultCompilerForFamily("java"));
  const compilerOptions = compilersForFamily(judgeLanguage);
  // Reset the compiler to the family default whenever the language changes.
  useEffect(() => { setJudgeCompiler(defaultCompilerForFamily(judgeLanguage)); }, [judgeLanguage]);

  type DraftState = {
    useFiles: boolean;
    code: string;
    files: CodeFile[];
    lastSavedUseFiles: boolean;
    lastSavedCode: string;
    lastSavedFiles: CodeFile[];
  };
  const draftCacheRef = useRef<Partial<Record<JudgeLanguage, DraftState>>>({});

  const [code, setCode] = useState<string>("");
  // Record throttled code snapshots for solve replay.
  useEffect(() => {
    if (!hasToken) return;
    const now = Date.now();
    if (now - lastSnapAtRef.current < 1500) return;
    lastSnapAtRef.current = now;
    const arr = replaySnapshotsRef.current;
    if (arr.length === 0 || arr[arr.length - 1].code !== code) {
      arr.push({ tMs: now - replayStartRef.current, code });
      if (arr.length > 500) arr.shift();
    }
  }, [code, hasToken]);
  const [lastSavedCode, setLastSavedCode] = useState<string>("");
  const [useFiles, setUseFiles] = useState<boolean>(false);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [lastSavedUseFiles, setLastSavedUseFiles] = useState<boolean>(false);
  const [lastSavedFiles, setLastSavedFiles] = useState<CodeFile[]>([]);
  const saveTimer = useRef<number | null>(null);

  const [stdin, setStdin] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<LibraryRunResult | null>(null);

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<LibraryCheckResult | null>(null);
  const [lastReplayId, setLastReplayId] = useState<number | null>(null);
  const [actionRecovery, setActionRecovery] = useState<{
    tone: "error" | "warning";
    message: string;
    retry: "run" | "check" | "save";
  } | null>(null);
  const [showCompactStatuses, setShowCompactStatuses] = useState(false);
  const [compactFailedOnly, setCompactFailedOnly] = useState(true);

  const isWebTask = task?.taskMode === "WEB";
  const toWebPreviewFiles = (): WebTaskFile[] => {
    const source = useFiles
      ? normalizeFiles(files)
      : [{ path: "index.html", content: code } as CodeFile];

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
      { path: "script.js", content: byPath.get("script.js") ?? "" },
    ];
  };

  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsTab, setResultsTab] = useState<"run" | "check">("check");
  const [statementModalOpen, setStatementModalOpen] = useState(false);
  const [activeRailItem, setActiveRailItem] = useState<"mission" | "task" | "console">("mission");
  const statementSectionRef = useRef<HTMLDivElement | null>(null);
  const editorSectionRef = useRef<HTMLDivElement | null>(null);
  const outputSectionRef = useRef<HTMLDivElement | null>(null);

  const libraryHints = useMemo(() => {
    const hints: string[] = [];
    if (checkResult?.compileError) {
      hints.push(tr("Спочатку виправ компіляцію: перевір назви класів/файлів і сигнатуру main.", "Fix compilation first: verify class/file names and main signature."));
    }
    if (checkResult && checkResult.testsTotal > 0 && checkResult.testsPassed < checkResult.testsTotal) {
      hints.push(tr("Пройдися по крайових кейсах: порожній ввід, 0, 1, мін/макс межі.", "Go through edge cases: empty input, 0, 1, min/max bounds."));
      hints.push(tr("Звір формат виводу: зайві пробіли або переноси рядків ламають тести.", "Verify output format: extra spaces/newlines often break tests."));
    }
    hints.push(tr("Запускай локальні малі тести перед Check, щоб швидше знаходити баги.", "Run small local tests before Check to find bugs faster."));
    hints.push(tr("Спочатку зроби коректність, потім оптимізацію.", "Lock correctness first, optimize second."));
    return hints;
  }, [checkResult, tr]);
  const firstExampleInput = useMemo(() => extractFirstExampleInput(String(task?.description ?? "")), [task?.description]);

  const scrollToSection = (id: "mission" | "task" | "console") => {
    setActiveRailItem(id);
    if (id === "mission") {
      statementSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (id === "task") {
      editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    outputSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useEffect(() => {
    if (!taskKey) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      const d = taskId != null ? await getLibraryTask(taskId) : await getLibraryTaskByKey(taskKey);
      let taskData = d.task;

      if (taskData.taskMode === "WEB") {
        let initialFiles = normalizeWebFiles(taskData.webTemplateFiles ?? null);
        try {
          const tpl = await getLibraryWebTaskTemplate(taskData.id);
          if (Array.isArray(tpl.files) && tpl.files.length > 0) {
            initialFiles = normalizeWebFiles(tpl.files);
          }
        } catch {
          // fallback to task payload
        }

        taskData = {
          ...taskData,
          webTemplateFiles: initialFiles as WebTaskFile[],
        };

        setTask(taskData);
        setTheory(d.theory);
        setUseFiles(true);
        setFiles(initialFiles);
        setCode(entryContentFromFiles(initialFiles, "index.html"));
        setLastSavedUseFiles(true);
        setLastSavedFiles(initialFiles);
        setLastSavedCode(entryContentFromFiles(initialFiles, "index.html"));
        return;
      }

      setTask(taskData);
      setTheory(d.theory);

      const allowed = getAllowedJudgeLanguages(d.task);
      const saved = (() => {
        try {
          const v = localStorage.getItem(`library_task_lang_${d.task.id}`);
          return v as JudgeLanguage | null;
        } catch {
          return null;
        }
      })();
      const initialLang = saved && allowed.includes(saved) ? saved : allowed[0];
      setJudgeLanguage(initialLang);

      if (!hasToken) {
        const initial = getTemplateForLanguage(d.task, initialLang);
        draftCacheRef.current[initialLang] = {
          useFiles: false,
          code: initial,
          files: [],
          lastSavedUseFiles: false,
          lastSavedCode: initial,
          lastSavedFiles: [],
        };
        setUseFiles(false);
        setFiles([]);
        setCode(initial);
        setLastSavedUseFiles(false);
        setLastSavedFiles([]);
        setLastSavedCode(initial);
        return;
      }
    };

    load()
      .catch((e) => {
        console.error("Failed to load library task", e);
        if (isPreview()) {
          setTask(previewLibraryTask);
          setTheory(null);
          setJudgeLanguage("python");
          setCode(previewLibraryTask.template);
          setLastSavedCode(previewLibraryTask.template);
          setLastSavedFiles([]);
          setUseFiles(false);
          return;
        }
        setTask(null);
        setTheory(null);
      })
      .finally(() => setLoading(false));
  }, [taskKey, taskId, hasToken]);

  // Load draft for selected language (and keep per-language in-memory cache to avoid losing edits)
  useEffect(() => {
    if (!task) return;
    if (task.taskMode === "WEB") {
      const webFiles = normalizeWebFiles(task.webTemplateFiles ?? null);
      setUseFiles(true);
      setFiles(webFiles);
      setCode(entryContentFromFiles(webFiles, "index.html"));
      setLastSavedUseFiles(true);
      setLastSavedFiles(webFiles);
      setLastSavedCode(entryContentFromFiles(webFiles, "index.html"));
      return;
    }
    const numericId = task.id;
    const lang = judgeLanguage;
    const entryFile = entryFileForJudgeLanguage(lang);

    // Persist language choice per task.
    try {
      localStorage.setItem(`library_task_lang_${numericId}`, lang);
    } catch {
      // ignore
    }

    // If we already have a local draft cached, prefer it.
    const cached = draftCacheRef.current[lang];
    if (cached) {
      setUseFiles(cached.useFiles);
      setFiles(cached.files);
      setCode(cached.code);
      setLastSavedUseFiles(cached.lastSavedUseFiles);
      setLastSavedFiles(cached.lastSavedFiles);
      setLastSavedCode(cached.lastSavedCode);
      return;
    }

    const template = getTemplateForLanguage(task, lang);
    if (!hasToken) {
      draftCacheRef.current[lang] = {
        useFiles: false,
        code: template,
        files: [],
        lastSavedUseFiles: false,
        lastSavedCode: template,
        lastSavedFiles: [],
      };
      setUseFiles(false);
      setFiles([]);
      setCode(template);
      setLastSavedUseFiles(false);
      setLastSavedFiles([]);
      setLastSavedCode(template);
      return;
    }

    getLibraryTaskAttempt(numericId, { language: lang })
      .then((a) => {
        const attempt = a.attempt;
        const serverFiles = Array.isArray(attempt?.draftFiles) ? normalizeFiles(attempt!.draftFiles!) : [];
        const serverUseFiles = serverFiles.length > 0;
        const draftCode = (attempt?.draftCode ?? "").trim() ? String(attempt?.draftCode ?? "") : template;
        const draftFiles = serverUseFiles
          ? (serverFiles.some(f => f.path === entryFile) ? serverFiles : [...serverFiles, { path: entryFile, content: draftCode }])
          : [];
        const resolvedCode = serverUseFiles ? entryContentFromFiles(draftFiles, entryFile) : draftCode;
        draftCacheRef.current[lang] = {
          useFiles: serverUseFiles,
          code: resolvedCode,
          files: draftFiles,
          lastSavedUseFiles: serverUseFiles,
          lastSavedCode: resolvedCode,
          lastSavedFiles: draftFiles,
        };
        setUseFiles(serverUseFiles);
        setFiles(draftFiles);
        setCode(resolvedCode);
        setLastSavedUseFiles(serverUseFiles);
        setLastSavedFiles(draftFiles);
        setLastSavedCode(resolvedCode);
      })
      .catch(() => {
        // fallback to template
        draftCacheRef.current[lang] = {
          useFiles: false,
          code: template,
          files: [],
          lastSavedUseFiles: false,
          lastSavedCode: template,
          lastSavedFiles: [],
        };
        setUseFiles(false);
        setFiles([]);
        setCode(template);
        setLastSavedUseFiles(false);
        setLastSavedFiles([]);
        setLastSavedCode(template);
      });
  }, [task, judgeLanguage, hasToken, taskId]);

  // Autosave draft (debounced)
  useEffect(() => {
    if (!effectiveTaskId) return;
    if (!task) return;
    if (!hasToken) return;

    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }

    // Avoid spamming API on initial set
    const isDirty = useFiles
      ? !(lastSavedUseFiles === true && filesEqual(files, lastSavedFiles))
      : !(lastSavedUseFiles === false && code === lastSavedCode);
    if (!isDirty) return;

    saveTimer.current = window.setTimeout(() => {
      const savePromise = isWebTask
        ? saveLibraryWebTaskDraft(effectiveTaskId, toWebPreviewFiles())
        : saveLibraryTaskDraft(effectiveTaskId, useFiles ? { files } : code, judgeLanguage);

      savePromise
        .then(() => {
          const nextFiles = normalizeFiles(isWebTask ? (toWebPreviewFiles() as unknown as CodeFile[]) : files);
          const nextCode = isWebTask
            ? entryContentFromFiles(nextFiles, "index.html")
            : useFiles
              ? entryContentFromFiles(nextFiles, entryFileForJudgeLanguage(judgeLanguage))
              : code;
          draftCacheRef.current[judgeLanguage] = {
            useFiles: isWebTask ? true : useFiles,
            code: nextCode,
            files: nextFiles,
            lastSavedUseFiles: isWebTask ? true : useFiles,
            lastSavedCode: nextCode,
            lastSavedFiles: nextFiles,
          };
          setLastSavedUseFiles(isWebTask ? true : useFiles);
          setLastSavedFiles(nextFiles);
          setLastSavedCode(nextCode);
        })
        .catch(() => {
          // ignore autosave errors
        });
    }, 900);

    return () => {
      if (saveTimer.current) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [code, files, useFiles, lastSavedCode, lastSavedFiles, lastSavedUseFiles, effectiveTaskId, task, hasToken, judgeLanguage, isWebTask, toWebPreviewFiles]);

  // Keep per-language in-memory draft cache up-to-date.
  useEffect(() => {
    if (!task) return;
    draftCacheRef.current[judgeLanguage] = {
      useFiles,
      code,
      files: normalizeFiles(files),
      lastSavedUseFiles,
      lastSavedCode,
      lastSavedFiles: normalizeFiles(lastSavedFiles),
    };
  }, [code, files, useFiles, judgeLanguage, task, lastSavedCode, lastSavedFiles, lastSavedUseFiles]);

  const doRun = async () => {
    if (!effectiveTaskId || !task) return;
    if (!hasToken && !isPreview()) {
      redirectToLoginWithNext();
      return;
    }
    setRunning(true);
    setRunResult(null);
    setActionRecovery(null);
    try {
      if (isPreview()) {
        setRunResult({ stdout: "code: 2\nstudycod: 1", stderr: "", exitCode: 0, success: true });
        setResultsTab("run");
        setResultsOpen(true);
        return;
      }
      if (isWebTask) {
        setRunResult({ stdout: tr("Оновлено превʼю у сусідній панелі.", "Preview refreshed in the panel."), stderr: "", exitCode: 0, success: true });
        setResultsTab("run");
        setResultsOpen(true);
        return;
      }
      const runInput = normalizeStdinBeforeRun(stdin);
      const payload: Parameters<typeof runLibraryTask>[1] = useFiles
        ? { files, input: runInput, language: judgeLanguage, compiler: judgeCompiler }
        : { code, input: runInput, language: judgeLanguage, compiler: judgeCompiler };
      const r = await runLibraryTask(effectiveTaskId, payload);
      setRunResult(r);
      setResultsTab("run");
      setResultsOpen(true);
    } catch (e: unknown) {
      console.error("Run failed", e);
      const message = getErrorMessageFromUnknown(e, tr("Помилка виконання", "Execution error"));
      setRunResult({
        stdout: "",
        stderr: message,
        exitCode: 1,
        success: false,
      });
      setActionRecovery({
        tone: "error",
        message: tr(`Не вдалося запустити код: ${message}`, `Run failed: ${message}`),
        retry: "run",
      });
      setResultsTab("run");
      setResultsOpen(true);
    } finally {
      setRunning(false);
    }
  };

  const doCheck = async () => {
    if (!effectiveTaskId || !task) return;
    if (!hasToken && !isPreview()) {
      redirectToLoginWithNext();
      return;
    }
    setChecking(true);
    setCheckResult(null);
    setActionRecovery(null);
    try {
      if (isPreview()) {
        setCheckResult({
          verdict: "AC",
          testsPassed: 5,
          testsTotal: 5,
          score: 100,
          maxScore: 100,
          hidden: { passed: 3, total: 3 },
          publicTestResults: [
            { testId: 1, input: "Code code StudyCod", actualOutput: "code: 2\nstudycod: 1", passed: true, verdict: "AC" },
            { testId: 2, input: "one two one", actualOutput: "one: 2\ntwo: 1", passed: true, verdict: "AC" },
          ],
        });
        setShowCompactStatuses(false);
        setCompactFailedOnly(true);
        setResultsTab("check");
        setResultsOpen(true);
        return;
      }
      if (isWebTask) {
        const r = await checkLibraryWebTask(effectiveTaskId, toWebPreviewFiles());
        setCheckResult(r);
        setShowCompactStatuses(false);
        setCompactFailedOnly(true);
        setResultsTab("check");
        setResultsOpen(true);
        return;
      }
      const payload: Parameters<typeof checkLibraryTask>[1] = useFiles
        ? { files, language: judgeLanguage, compiler: judgeCompiler }
        : { code, language: judgeLanguage, compiler: judgeCompiler };
      const r = await checkLibraryTask(effectiveTaskId, payload);
      setCheckResult(r);
      setShowCompactStatuses(false);
      setCompactFailedOnly(true);
      setResultsTab("check");
      setResultsOpen(true);

      // Fire-and-forget: integrity score + spaced-repetition review. Wrapped so
      // it can never affect the check UX.
      try {
        const codeLen = useFiles ? files.reduce((n, f) => n + (f.content?.length ?? 0), 0) : code.length;
        void scoreProctoring({ ...proctoring.getSignals(codeLen), taskKind: "LIBRARY", taskId: effectiveTaskId });
        const tp = Number(r.testsPassed ?? 0);
        const tt = Number(r.testsTotal ?? 0);
        const conceptKey = ((task as any)?.section
          ? `lib-section:${String((task as any).section)}`
          : `lib-task:${task.id}`).slice(0, 191);
        void recordConceptReview({
          conceptKey,
          outcome: {
            solved: String(r.verdict ?? "").toUpperCase() === "AC",
            attempts: 1,
            testsPassedRatio: tt > 0 ? tp / tt : 0,
          },
        });
        if (replaySnapshotsRef.current.length > 1) {
          void saveSolveReplay({
            snapshots: replaySnapshotsRef.current.slice(),
            taskKind: "LIBRARY",
            taskId: effectiveTaskId ?? undefined,
            language: judgeLanguage,
            durationMs: Date.now() - replayStartRef.current,
            finalVerdict: r.verdict ?? undefined,
          }).then((saved) => setLastReplayId(saved.id)).catch(() => { /* best-effort */ });
        }
        proctoring.reset();
      } catch {
        /* best-effort telemetry */
      }
    } catch (e: unknown) {
      console.error("Check failed", e);
      const err = (typeof e === "object" && e !== null ? e : {}) as { response?: { status?: number; data?: unknown } };
      const status = err.response?.status;
      const data = err.response?.data;
      const isHtml = typeof data === "string" && data.trim().toLowerCase().startsWith("<html");
      if (status === 502 || status === 503 || status === 504 || isHtml) {
        const message = tr(
          "Сервер перевірки тимчасово недоступний (помилка шлюзу). Спробуйте ще раз через кілька секунд.",
          "Check service is temporarily unavailable (gateway error). Please try again in a few seconds."
        );
        showToast({
          type: "error",
          message,
        });
        setActionRecovery({
          tone: "warning",
          message,
          retry: "check",
        });
      } else {
        const msg = typeof data === "object" && data !== null && "message" in data ? String((data as { message?: unknown }).message ?? "") : "";
        const message = msg || tr("Не вдалося перевірити", "Failed to check");
        showToast({ type: "error", message });
        setActionRecovery({
          tone: "error",
          message,
          retry: "check",
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const manualSave = async () => {
    if (!effectiveTaskId) return;
    if (!hasToken && !isPreview()) {
      redirectToLoginWithNext();
      return;
    }
    try {
      setActionRecovery(null);
      if (isPreview()) {
        // Preview keeps the draft in local component state only.
      } else if (isWebTask) {
        await saveLibraryWebTaskDraft(effectiveTaskId, toWebPreviewFiles());
      } else {
        const payload = useFiles ? { files } : code;
        await saveLibraryTaskDraft(effectiveTaskId, payload, judgeLanguage);
      }
      const nextFiles = normalizeFiles(isWebTask ? (toWebPreviewFiles() as unknown as CodeFile[]) : files);
      const nextCode = isWebTask
        ? entryContentFromFiles(nextFiles, "index.html")
        : useFiles
          ? entryContentFromFiles(nextFiles, entryFileForJudgeLanguage(judgeLanguage))
          : code;
      setLastSavedUseFiles(isWebTask ? true : useFiles);
      setLastSavedFiles(nextFiles);
      setLastSavedCode(nextCode);
      showToast({ type: "success", message: tr("Збережено", "Saved") });
    } catch (e: unknown) {
      const message = getErrorMessageFromUnknown(e, tr("Не вдалося зберегти", "Failed to save"));
      showToast({ type: "error", message });
      setActionRecovery({
        tone: "error",
        message,
        retry: "save",
      });
    }
  };

  const resetToTemplate = () => {
    if (!task) return;
    if (!confirm(tr("Скинути код до шаблону?", "Reset code to template?"))) return;
    const next = getTemplateForLanguage(task, judgeLanguage);
    if (useFiles) {
      const entryFile = entryFileForJudgeLanguage(judgeLanguage);
      setFiles([{ path: entryFile, content: next }]);
      setCode(next);
    } else {
      setCode(next);
    }
  };
  const isMacPlatform = typeof navigator !== "undefined" && /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform);
  const modKeyLabel = isMacPlatform ? "⌘" : "Ctrl";
  const saveShortcutLabel = `${modKeyLabel}+S`;
  const runShortcutLabel = `${modKeyLabel}+Enter`;
  const checkShortcutLabel = `${modKeyLabel}+Shift+Enter`;

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return node.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!task) return;

      const key = event.key.toLowerCase();
      const withMod = event.metaKey || event.ctrlKey;
      const editableTarget = isEditableTarget(event.target);

      if (withMod && key === "s") {
        event.preventDefault();
        if (!loading) {
          void manualSave();
        }
        return;
      }

      if (withMod && key === "enter") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!checking && !running) {
            void doCheck();
          }
        } else if (!running && !checking) {
          void doRun();
        }
        return;
      }

      if (!withMod && event.altKey && !event.shiftKey && !editableTarget) {
        if (key === "1") {
          event.preventDefault();
          scrollToSection("mission");
        } else if (key === "2") {
          event.preventDefault();
          scrollToSection("task");
        } else if (key === "3") {
          event.preventDefault();
          scrollToSection("console");
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [checking, doCheck, doRun, loading, manualSave, running, scrollToSection, task]);

  if (!taskKey) {
    return (
      <div className="p-3 sm:p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="p-4">
            <div className="text-sm text-text-secondary">{tr("Некоректне посилання", "Invalid link")}</div>
          </Card>
        </div>
      </div>
    );
  }

  if (loading || !task) {
    return <div className="min-h-full bg-[#f7f8f5] p-6 dark:bg-[#0b120e]"><div className="mx-auto h-[720px] max-w-[1500px] animate-pulse rounded-[28px] bg-[#e8ede8] dark:bg-white/[.04]" /></div>;
  }

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={goBackToLibrary} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#617066] transition hover:text-[#147b47] dark:text-[#a7b5aa] dark:hover:text-[#72edb0]"><ArrowLeft className="size-4" />{tr("До бібліотеки", "Back to library")}</button>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#147b47] dark:text-[#72edb0]"><button type="button" onClick={goBackToLibrary} className="rounded-lg bg-[#e8f7ed] px-2.5 py-1 transition hover:bg-[#d8f3e2] dark:bg-[#00ff88]/10 dark:hover:bg-[#00ff88]/15">{tr("Бібліотека", "Library")}</button><span className="text-[#a5afa7]">/</span><span>{task.section || tr("Задача", "Problem")}</span><span className="text-[#a5afa7]">/</span><span>{task.difficulty === "HARD" ? tr("Складна", "Hard") : task.difficulty === "MEDIUM" ? tr("Середня", "Medium") : tr("Легка", "Easy")}</span></div>
            <h1 className="mt-3 max-w-4xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-4xl">{task.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={resetToTemplate} className="h-11 rounded-xl px-4 text-sm font-semibold text-[#617066] transition hover:bg-[#e9efea] dark:text-[#a7b5aa] dark:hover:bg-white/[.06]"><RotateCcw className="mr-2 inline size-4" />{tr("Почати заново", "Reset")}</button>
            <button type="button" onClick={manualSave} className="h-11 rounded-xl border border-[#152219]/10 bg-white px-4 text-sm font-semibold shadow-sm dark:border-white/10 dark:bg-white/[.05]"><Save className="mr-2 inline size-4" />{tr("Зберегти", "Save")}</button>
            <button type="button" onClick={doRun} disabled={running || checking} className="h-11 rounded-xl bg-[#17251c] px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#edf3ef] dark:text-[#0b120e]"><Play className="mr-2 inline size-4" />{running ? tr("Виконуємо…", "Running…") : tr("Запустити", "Run")}</button>
            <button type="button" onClick={doCheck} disabled={checking || running} className="h-11 rounded-xl bg-[#00d978] px-5 text-sm font-bold text-[#062211] disabled:opacity-50"><CheckCircle2 className="mr-2 inline size-4" />{checking ? tr("Перевіряємо…", "Checking…") : tr("Перевірити", "Check")}</button>
          </div>
        </header>

        <div className="overflow-hidden rounded-[28px] border border-[#152219]/10 bg-white shadow-[0_22px_55px_-44px_rgba(17,43,25,.55)] dark:border-white/10 dark:bg-[#121b15]">
          <div className="grid min-h-[720px] xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="border-b border-[#152219]/10 bg-[#fbfcfa] dark:border-white/10 dark:bg-[#101813] xl:border-b-0 xl:border-r">
              <div className="border-b border-[#152219]/10 p-6 dark:border-white/10">
                <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#e87d00]">{tr("Завдання", "Brief")}</p>
                <div className="mt-5 max-h-[360px] overflow-y-auto pr-2 text-sm leading-7 text-[#425148] dark:text-[#c1cdc4]"><MarkdownView content={task.description} /></div>
              </div>
              {theory && <details className="group border-b border-[#152219]/10 p-6 dark:border-white/10"><summary className="flex cursor-pointer list-none items-center justify-between font-semibold"><span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-[#e87d00]" />{tr("Пояснення", "Explanation")}</span><span className="text-xs text-[#718075] group-open:hidden">{tr("Відкрити", "Open")}</span></summary><div className="mt-5 text-sm leading-7 text-[#526157] dark:text-[#b6c2b9]"><MarkdownView content={theory} /></div></details>}
              <div className="p-6">
                <div className="flex items-center justify-between"><label className="text-xs font-semibold uppercase tracking-[.15em] text-[#718075]">stdin</label>{firstExampleInput && <button type="button" onClick={() => setStdin(firstExampleInput)} className="text-xs font-semibold text-[#147b47] dark:text-[#72edb0]">{tr("Взяти з прикладу", "Use example")}</button>}</div>
                <textarea value={stdin} onChange={(event) => setStdin(event.target.value)} disabled={isWebTask} spellCheck={false} placeholder={isWebTask ? tr("Для WEB-задач ввід не потрібен", "WEB tasks do not need stdin") : "5\n1 2 3 4 5"} className="mt-3 min-h-28 w-full resize-y rounded-xl border border-[#152219]/10 bg-[#f5f8f5] p-3 font-mono text-xs outline-none focus:border-[#00c96d] disabled:opacity-55 dark:border-white/10 dark:bg-white/[.04]" />
              </div>
            </aside>

            <main className="flex min-h-0 min-w-0 flex-col bg-[#0f1511]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#151d17] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#dbe6de]"><span className="size-2 rounded-full bg-[#00d978]" />{isWebTask ? tr("WEB-полотно", "WEB canvas") : FRIENDLY_LANG[judgeLanguage] || judgeLanguage}</div>
                <div className="flex flex-wrap items-center gap-2">
                  {!isWebTask && <select value={judgeLanguage} onChange={(event) => setJudgeLanguage(event.target.value as JudgeLanguage)} className="h-9 rounded-lg border border-white/10 bg-white/[.06] px-3 text-xs font-semibold text-white outline-none">{getAllowedJudgeLanguages(task).map((language) => <option key={language} value={language} className="text-black">{FRIENDLY_LANG[language] || language}</option>)}</select>}
                  {!isWebTask && compilerOptions.length > 1 && <select value={judgeCompiler} onChange={(event) => setJudgeCompiler(event.target.value)} className="h-9 max-w-48 rounded-lg border border-white/10 bg-white/[.06] px-3 text-xs text-white outline-none">{compilerOptions.map((compiler) => <option key={compiler.id} value={compiler.id} className="text-black">{compiler.label}</option>)}</select>}
                  {!useFiles && !isWebTask && <button type="button" onClick={() => { const entry = entryFileForJudgeLanguage(judgeLanguage); setUseFiles(true); setFiles([{ path: entry, content: code }]); }} className="h-9 rounded-lg bg-white/[.07] px-3 text-xs font-semibold text-[#dbe6de]">{tr("Додати файл", "Add file")}</button>}
                </div>
              </div>

              <div className={`h-[620px] min-h-[620px] overflow-hidden ${isWebTask ? "grid lg:grid-cols-2" : ""}`}>
                <div className="h-full min-h-0 min-w-0 overflow-hidden">{useFiles ? <MultiFileEditor language={isWebTask ? "html" : judgeLanguage} entryFile={isWebTask ? "index.html" : entryFileForJudgeLanguage(judgeLanguage)} files={files} onChange={(next) => setFiles(normalizeFiles(next))} /> : <CodeEditor height="100%" language={isWebTask ? "html" : judgeLanguage} value={code} onChange={setCode} />}</div>
                {isWebTask && <div className="h-full min-h-0 overflow-hidden border-t border-white/10 lg:border-l lg:border-t-0"><WebPreviewPane files={toWebPreviewFiles()} title={tr("Живий результат", "Live result")} /></div>}
              </div>

              <section className="border-t border-white/10 bg-[#131a15] p-4 text-[#dce7df]">
                <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#83a18d]">{checkResult ? tr("Результат перевірки", "Check result") : tr("Останній запуск", "Latest run")}</p>{checkResult && <span className={`rounded-full px-3 py-1 text-xs font-bold ${String(checkResult.verdict).toUpperCase() === "AC" ? "bg-[#00ff88]/10 text-[#72edb0]" : "bg-[#ff6b9d]/10 text-[#ff9aba]"}`}>{checkResult.verdict} · {checkResult.testsPassed}/{checkResult.testsTotal}</span>}</div>
                {checkResult?.compileError ? <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-[#ff9aba]">{checkResult.compileError}</pre> : <pre className="mt-3 max-h-44 overflow-auto whitespace-pre-wrap font-mono text-xs leading-6 text-[#c8d6cc]">{runResult ? (runResult.stdout || runResult.stderr || tr("Програма завершилася без виводу.", "Program finished without output.")) : tr("Запусти код або перевір рішення — результат з’явиться тут.", "Run or check the solution — results appear here.")}</pre>}
                {checkResult && <div className="mt-3 flex gap-4 text-xs text-[#91a097]"><span>{tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}</span><span>{tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}</span></div>}
              </section>
            </main>
          </div>
        </div>
      </div>
    </div>
  );

};

export default LibraryTaskSolvePage;
