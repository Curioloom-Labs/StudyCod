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
  type LibraryRunResult,
  type JudgeLanguage,
  type WebTaskFile,
} from "../../lib/api/library";
import { JUDGE_LANGUAGE_LABELS, JUDGE_ENTRY_FILES, enabledJudgeLanguages, compilersForFamily, defaultCompilerForFamily } from "../../lib/judgeLanguages";

const FRIENDLY_LANG = JUDGE_LANGUAGE_LABELS;

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

  const libraryListPath = useMemo(() => (location.pathname.startsWith("/edu/") ? "/edu/library" : "/library"), [location.pathname]);
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
    if (!hasToken) {
      redirectToLoginWithNext();
      return;
    }
    setRunning(true);
    setRunResult(null);
    setActionRecovery(null);
    try {
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
    if (!hasToken) {
      redirectToLoginWithNext();
      return;
    }
    setChecking(true);
    setCheckResult(null);
    setActionRecovery(null);
    try {
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
    if (!hasToken) {
      redirectToLoginWithNext();
      return;
    }
    try {
      setActionRecovery(null);
      if (isWebTask) {
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

  return (
    <div className="relative min-h-full w-full px-2 sm:px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="min-h-[calc(100%-1.5rem)] rounded-3xl bg-bg-surface border border-border/60 overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.24)] flex">
        <aside className="hidden xl:flex w-[58px] border-r border-border/60 bg-bg-surface/70 flex-col items-center py-3 gap-2">
          <div className="group relative">
            <button
              onClick={goBackToLibrary}
              title={tr("Назад", "Back")}
              aria-label={tr("Назад", "Back")}
              className="w-11 h-11 rounded-xl border border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary transition-fast flex items-center justify-center"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="absolute left-[48px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 transition-fast whitespace-nowrap z-20">
              {tr("Назад", "Back")}
            </div>
          </div>

          {[
            { id: "mission", label: tr("Місія", "Mission"), Icon: LayoutDashboard },
            { id: "task", label: tr("Задача", "Task"), Icon: FolderCode },
            { id: "console", label: tr("Вивід", "Output"), Icon: TerminalSquare }
          ].map((item) => (
            <div key={item.id} className="group relative">
              <button
                onClick={() => scrollToSection(item.id as "mission" | "task" | "console")}
                title={item.label}
                aria-label={item.label}
                className={`w-11 h-11 rounded-xl border transition-fast flex items-center justify-center ${activeRailItem === item.id ? "border-primary/50 bg-primary/10 text-primary" : "border-transparent hover:border-border hover:bg-bg-hover/70 text-text-secondary hover:text-text-primary"}`}
              >
                <item.Icon className="w-4 h-4" />
              </button>
              <div className="absolute left-[48px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-bg-surface px-2 py-1 text-xs text-text-primary opacity-0 pointer-events-none group-hover:opacity-100 transition-fast whitespace-nowrap z-20">
                {item.label}
              </div>
            </div>
          ))}
        </aside>

        <div className="flex-1 min-w-0 min-h-0 overflow-auto p-3 md:p-4">
          <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <Button variant="ghost" onClick={goBackToLibrary}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {tr("Назад", "Back")}
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-mono text-text-primary truncate">
              {tr("Розв'язання: ", "Solve: ")}
              {task?.title || "..."}
            </h1>
            <div className="hidden lg:flex items-center gap-1 text-[10px] text-text-muted font-mono mt-1">
              <span className="px-1.5 py-0.5 border border-border bg-bg-base rounded">{runShortcutLabel}</span>
              <span>{tr("запуск", "run")}</span>
              <span className="px-1.5 py-0.5 border border-border bg-bg-base rounded">{checkShortcutLabel}</span>
              <span>{tr("перевірка", "check")}</span>
              <span className="px-1.5 py-0.5 border border-border bg-bg-base rounded">{saveShortcutLabel}</span>
              <span>{tr("зберегти", "save")}</span>
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={resetToTemplate} disabled={!task || loading} title={tr("Скинути", "Reset")} aria-label={tr("Скинути код до шаблону", "Reset code to template")} className="h-11 w-11 p-0"
              >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              onClick={manualSave}
              disabled={loading}
              aria-label={tr("Зберегти чернетку", "Save draft")}
              className="h-11 w-11 p-0"
              title={
                hasToken
                  ? tr("Зберегти чернетку", "Save draft")
                  : tr("Увійдіть, щоб зберегти чернетку", "Log in to save draft")
              }
              >
              <Save className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <Card className="p-4 space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </Card>
        ) : !task ? (
          <Card className="p-4">
            <div className="text-sm text-text-secondary">{tr("Не вдалося завантажити завдання", "Failed to load task")}</div>
          </Card>
        ) : (
          <>
            <div className="flex flex-col xl:flex-row gap-3 items-start">
            <div className="w-full xl:w-5/12 space-y-3">
              <div ref={statementSectionRef}>
              <Card className="p-4 space-y-3 border border-border/70 bg-bg-surface/80">
                <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-mono text-text-primary">{tr("Умова", "Description")}</div>
                  <Button variant="ghost" size="sm" onClick={() => setStatementModalOpen(true)}>
                    {tr("Повна умова", "Full statement")}
                  </Button>
                </div>
                <MarkdownView content={task.description || ""} />
                </div>
                <div>
                  <div className="text-sm font-mono text-text-primary mb-2">{tr("Теорія", "Theory")}</div>
                  {theory ? <MarkdownView content={theory} /> : <div className="text-sm text-text-secondary">{tr("(немає)", "(none)")}</div>}
                </div>
              </Card>
              </div>

              <Card className="p-4 overflow-auto border border-border/70 bg-bg-surface/80">
                <div className="text-sm font-mono text-text-primary mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> {tr("Підказки", "Hints")}
                </div>
                <div className="space-y-2">
                  {libraryHints.map((h, idx) => (
                    <div key={`${idx}-${h.slice(0, 12)}`} className="rounded-xl border border-border bg-bg-base/80 px-3 py-2 text-xs text-text-primary">
                      <span className="text-primary mr-2">#{idx + 1}</span>{h}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div className="w-full xl:w-7/12 space-y-3">
            <div ref={editorSectionRef}>
            <Card className="p-4 flex flex-col border border-border/70 bg-bg-surface/80">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
                <div className="text-sm font-mono text-text-primary">
                  {tr("Код", "Code")} ({FRIENDLY_LANG[judgeLanguage] || judgeLanguage})
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                  {!isWebTask ? (
                    <select
                      value={judgeLanguage}
                      onChange={(e) => setJudgeLanguage(e.target.value as JudgeLanguage)}
                      className="w-full sm:w-auto px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      title={tr("Мова розв'язку", "Solution language")}
                    >
                      {getAllowedJudgeLanguages(task).map((l) => (
                        <option key={l} value={l}>
                          {FRIENDLY_LANG[l] || l}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  {!isWebTask && compilerOptions.length > 1 ? (
                    <select
                      value={judgeCompiler}
                      onChange={(e) => setJudgeCompiler(e.target.value)}
                      className="w-full sm:w-auto px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      title={tr("Компілятор / версія", "Compiler / version")}
                    >
                      {compilerOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  ) : null}
                <div className={`flex flex-wrap gap-2 ${isCompactViewport ? "w-full" : ""}`}>
                  {!useFiles ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const entryFile = entryFileForJudgeLanguage(judgeLanguage);
                        setUseFiles(true);
                        setFiles([{ path: entryFile, content: code }]);
                      }}
                      disabled={loading}
                      title={tr("Додати файл (multi-file)", "Add file (multi-file)")}
                    >
                      {tr("Додати файл", "Add file")}
                    </Button>
                  ) : null}
                  <Button onClick={doRun} disabled={running || checking} title={runShortcutLabel}>
                    <Play className="w-4 h-4 mr-2" />
                    {running ? tr("Виконання...", "Running...") : tr("Запустити", "Run")} <span className="hidden 2xl:inline text-[10px] text-text-muted ml-2">{runShortcutLabel}</span>
                  </Button>
                  <Button onClick={doCheck} disabled={checking || running} title={checkShortcutLabel}>
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    {checking ? tr("Перевірка...", "Checking...") : tr("Перевірити", "Check")} <span className="hidden 2xl:inline text-[10px] text-text-muted ml-2">{checkShortcutLabel}</span>
                  </Button>
                </div>
                </div>
              </div>

              {actionRecovery ? (
                <div
                  role={actionRecovery.tone === "error" ? "alert" : "status"}
                  aria-live={actionRecovery.tone === "error" ? "assertive" : "polite"}
                  className={`mb-3 p-3 border ${actionRecovery.tone === "error" ? "border-accent-error/50 bg-bg-code" : "border-accent-warning/50 bg-bg-code"}`}
                >
                  <div className={`text-xs font-mono ${actionRecovery.tone === "error" ? "text-accent-error" : "text-accent-warning"}`}>
                    {actionRecovery.tone === "error" ? tr("Проблема біля кнопок запуску", "Problem near run/check controls") : tr("Тимчасова проблема перевірки", "Temporary check issue")}
                  </div>
                  <div className="mt-1 text-xs font-mono text-text-secondary break-words">{actionRecovery.message}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {actionRecovery.retry === "run" ? (
                      <Button variant="secondary" onClick={() => void doRun()} disabled={running || checking} className="text-xs">
                        {tr("Повторити запуск", "Retry run")}
                      </Button>
                    ) : null}
                    {actionRecovery.retry === "check" ? (
                      <Button variant="secondary" onClick={() => void doCheck()} disabled={running || checking} className="text-xs">
                        {tr("Повторити перевірку", "Retry check")}
                      </Button>
                    ) : null}
                    {actionRecovery.retry === "save" ? (
                      <Button variant="secondary" onClick={() => void manualSave()} disabled={loading} className="text-xs">
                        {tr("Повторити збереження", "Retry save")}
                      </Button>
                    ) : null}
                    <Button variant="ghost" onClick={() => scrollToSection("console")} className="text-xs">
                      {tr("Перейти до виводу", "Go to output")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {(runResult || checkResult) ? (
                <div className="mb-3 p-3 border border-border bg-bg-base rounded flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
                  <div className="text-xs font-mono text-text-secondary flex-1">
                    {runResult ? (
                      <span className="inline-flex items-center gap-2 mr-2">
                        <span>{tr("Останній запуск", "Last run")}:</span>
                        {(() => {
                          const c = runStatusChip(runResult.success, tr);
                          return <StatusChip glyph={c.glyph} label={c.label} tone={c.tone} />;
                        })()}
                        <span>exit={runResult.exitCode}</span>
                      </span>
                    ) : (
                      <span>{tr("Запуск ще не виконували", "No run yet")}</span>
                    )}
                    <span className="mx-2">·</span>
                    {checkResult ? (
                      <span className="inline-flex items-center gap-2">
                        <span>{tr("Остання перевірка", "Last check")}:</span>
                        {(() => {
                          const v = verdictChip(checkResult.verdict, tr);
                          return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} />;
                        })()}
                        <span>{checkResult.testsPassed}/{checkResult.testsTotal}</span>
                      </span>
                    ) : (
                      <span>{tr("Перевірку ще не виконували", "No check yet")}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {runResult ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setResultsTab("run");
                          setResultsOpen(true);
                        }}
                      >
                        {tr("Результат запуску", "Run result")}
                      </Button>
                    ) : null}
                    {checkResult ? (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setResultsTab("check");
                          setResultsOpen(true);
                        }}
                      >
                        {tr("Результат перевірки", "Check result")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {(() => {
                if (!hasToken || isWebTask) return null;
                const verdict = checkResult?.verdict ?? null;
                const failed = (checkResult?.publicTestResults ?? [])
                  .filter((r) => !r.passed)
                  .slice(0, 3)
                  .map((r) => ({
                    testId: r.testId,
                    input: r.input ?? "",
                    actual: r.actualOutput ?? "",
                    verdict: r.verdict ?? undefined,
                    stderr: r.error ?? null,
                  }));
                const stderr = (runResult && !runResult.success ? runResult.stderr : "") || checkResult?.compileError || "";
                const hasError =
                  (!!verdict && verdict.toUpperCase() !== "AC") ||
                  failed.length > 0 ||
                  (!!runResult && !runResult.success && !!stderr);
                if (!hasError) return null;
                const lang = String(judgeLanguage).toUpperCase();
                return (
                  <div className="mb-3 flex flex-col gap-2">
                    <ErrorExplainButton
                      language={lang}
                      code={code}
                      verdict={verdict}
                      stderr={stderr}
                      taskTitle={task?.title}
                      taskText={task?.description}
                      failures={failed}
                    />
                    <DebugMentorChat
                      language={lang}
                      code={code}
                      verdict={verdict}
                      stderr={stderr}
                      taskTitle={task?.title}
                      taskText={task?.description}
                      failures={failed}
                    />
                    {lastReplayId ? (
                      <button
                        type="button"
                        className="self-start text-[10px] font-mono px-2 py-1 border border-border rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                        onClick={() => navigate(`/replay/${lastReplayId}`)}
                        title={tr("Переглянути запис свого розв'язання", "Watch your solve replay")}
                      >
                        {tr("⏪ Переглянути запис", "⏪ Watch replay")}
                      </button>
                    ) : null}
                  </div>
                );
              })()}

              {!hasToken ? (
                <div className="text-xs text-text-secondary mb-3">
                  {tr(
                    "Перегляд умови доступний без входу. Для запуску/перевірки та збереження чернетки потрібно увійти.",
                    "You can read the statement without logging in. To run/check and save drafts, please log in."
                  )}
                </div>
              ) : null}

              <div className="mb-3 rounded-xl border border-border/80 bg-bg-base/60 p-3">
                {!isWebTask ? (
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="text-sm font-mono text-text-primary">{tr("Ввід для запуску (stdin)", "Run input (stdin)")}</div>
                    <button
                      type="button"
                      className="text-[10px] font-mono px-2 py-1 border border-border rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!firstExampleInput}
                      onClick={() => {
                        if (!firstExampleInput) {
                          showToast({
                            type: "info",
                            message: tr("У прикладах не знайдено Input для автозаповнення stdin.", "No Input example found for auto-fill stdin."),
                          });
                          return;
                        }
                        setStdin(firstExampleInput);
                      }}
                      title={tr("Перенести перший приклад Input в stdin", "Move first Input example to stdin")}
                    >
                      {tr("Із прикладу", "From example")}
                    </button>
                  </div>
                  <div className="text-xs text-text-secondary mb-2">
                    {tr("Вставте тестові дані сюди і натисніть «Запустити».", "Paste test data here and click Run.")}
                  </div>
                  <textarea
                    value={stdin}
                    onChange={(e) => setStdin(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
                    placeholder={tr("Приклад: 5\n1 2 3 4 5", "Example: 5\n1 2 3 4 5")}
                  />
                </div>
                ) : (
                  <div className="text-xs text-text-secondary">
                    {tr("Для WEB-завдань використовуйте «Перевірити» та живий превʼю-рендер праворуч.", "For WEB tasks use Check and the live preview on the right.")}
                  </div>
                )}
              </div>

              <div className={isWebTask ? "grid grid-cols-1 lg:grid-cols-2 gap-3" : ""}>
                <div className="border border-border overflow-hidden h-[420px] sm:h-[500px] min-h-[360px]">
                  {useFiles ? (
                    <MultiFileEditor
                      language={isWebTask ? "html" : judgeLanguage}
                      entryFile={isWebTask ? "index.html" : entryFileForJudgeLanguage(judgeLanguage)}
                      files={files}
                      onChange={(next) => setFiles(normalizeFiles(next))}
                    />
                  ) : (
                    <CodeEditor language={isWebTask ? "html" : judgeLanguage} value={code} onChange={setCode} />
                  )}
                </div>
                {isWebTask ? (
                  <div className="border border-border overflow-hidden h-[420px] sm:h-[500px] min-h-[360px]">
                    <WebPreviewPane files={toWebPreviewFiles()} title={tr("Превʼю", "Preview")} />
                  </div>
                ) : null}
              </div>
            </Card>
            </div>

            <div ref={outputSectionRef}>
              <Card className="p-4 overflow-auto border border-border/70 bg-bg-surface/80">
                <div className="text-sm font-mono text-text-primary mb-2">{tr("Результат запуску", "Run output")}</div>
                {!runResult ? (
                  <div className="text-sm text-text-secondary">{tr("Поки що немає", "Nothing yet")}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs text-text-secondary flex gap-3">
                      <span>
                        {tr("Код виходу", "Exit")}: {runResult.exitCode}
                      </span>
                      <span>
                        {tr("Успіх", "Success")}: {runResult.success ? tr("так", "yes") : tr("ні", "no")}
                      </span>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-text-primary mb-1">stdout</div>
                      <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[220px]">{runResult.stdout || ""}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                      <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[220px]">{runResult.stderr || ""}</pre>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <Card className="p-4 overflow-auto border border-border/70 bg-bg-surface/80">
              <div className="text-sm font-mono text-text-primary mb-2">{tr("Перевірка (тести)", "Check (tests)")}</div>
              {!checkResult ? (
                <div className="text-sm text-text-secondary">{tr("Натисніть 'Перевірити'", "Click 'Check'")}</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Вердикт", "Verdict")}: 
                      {(() => {
                        const v = verdictChip(checkResult.verdict, tr);
                        return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} className="ml-1" />;
                      })()}
                    </span>
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}
                    </span>
                    <span className="px-2 py-0.5 border border-border">
                      {tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}
                    </span>
                    {checkResult.hidden.total > 0 ? (
                      <span className="px-2 py-0.5 border border-border">
                        {tr("Приховані", "Hidden")}: {checkResult.hidden.passed}/{checkResult.hidden.total}
                      </span>
                    ) : null}
                  </div>

                  {checkResult.compileError ? (
                    <div className="border border-border p-3">
                      <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                        <span className="text-accent-error">{tr("Помилка компіляції", "Compilation error")}</span>
                        {checkResult.compileErrorKind ? <span>kind: {checkResult.compileErrorKind}</span> : null}
                      </div>
                      <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[260px]">{checkResult.compileError}</pre>
                    </div>
                  ) : null}

                  {typeof checkResult.publicTestResultsTotal === "number" ? (
                    <div className="text-xs text-text-secondary">
                      {tr("Публічні тести", "Public tests")}: {checkResult.publicTestResults.length}/
                      {checkResult.publicTestResultsTotal}
                      {checkResult.publicTestResultsTruncated ? (
                        <span className="ml-2 text-accent-warning">
                          {tr("(обрізано для стабільності)", "(truncated for stability)")}
                        </span>
                      ) : null}
                      <div className="mt-1 text-[11px] opacity-80">
                        {tr(
                          "Показано лише статуси тестів (без input/output).",
                          "Only test statuses are shown (no input/output)."
                        )}
                      </div>
                    </div>
                  ) : null}

                  {checkResult.publicTestResultsCompact?.length ? (
                    <div className="border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-xs text-text-secondary">
                          {tr("Статуси всіх публічних тестів (компактно)", "Statuses of all public tests (compact)")}: {checkResult.publicTestResultsCompact.length}
                          {checkResult.publicTestResultsCompactTruncated ? (
                            <span className="ml-2 text-accent-warning">
                              {tr("(обрізано)", "(truncated)")}
                              {typeof checkResult.publicTestResultsCompactLimit === "number" ? (
                                <span className="ml-1">limit={checkResult.publicTestResultsCompactLimit}</span>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                        <Button variant="ghost" onClick={() => setShowCompactStatuses(v => !v)}>
                          {showCompactStatuses ? tr("Сховати", "Hide") : tr("Показати", "Show")}
                        </Button>
                      </div>

                      {showCompactStatuses ? (
                        <div className="mt-2 space-y-2">
                          <label className="flex items-center gap-2 text-xs text-text-secondary select-none">
                            <input
                              type="checkbox"
                              checked={compactFailedOnly}
                              onChange={(e) => setCompactFailedOnly(e.target.checked)}
                            />
                            {tr("Показувати тільки помилки", "Show failed only")}
                          </label>

                          <div className="max-h-[220px] overflow-auto border border-border p-2">
                            <div className="flex flex-wrap gap-1">
                              {(compactFailedOnly
                                ? checkResult.publicTestResultsCompact.filter(t => !t.passed)
                                : checkResult.publicTestResultsCompact
                              ).map((t) => (
                                <span
                                  key={t.testId}
                                  className={
                                    "px-2 py-0.5 border text-[11px] font-mono " +
                                    (t.passed ? "border-accent-success text-accent-success" : "border-accent-error text-accent-error")
                                  }
                                  title={(t.verdict ? `verdict: ${t.verdict}` : "") + (t.errorKind ? ` kind: ${t.errorKind}` : "")}
                                >
                                  #{t.testId}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="text-[11px] text-text-secondary opacity-80">
                            {tr(
                              "Компактний список статусів тестів.",
                              "Compact list of test statuses."
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {checkResult.publicTestResults.length === 0 ? (
                    <div className="text-sm text-text-secondary">{tr("Немає публічних тестів для показу", "No public tests to show")}</div>
                  ) : (
                    <div className="space-y-2">
                      {checkResult.publicTestResults.map((r) => (
                        <div key={r.testId} className="p-3 border border-border">
                          <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                            <span className={r.passed ? "text-accent-success" : "text-accent-error"}>
                              {r.passed ? tr("пройдено", "passed") : tr("не пройдено", "failed")}
                            </span>
                            <span>{tr("тест", "test")}: {r.testId}</span>
                            {r.verdict ? <span>verdict: {r.verdict}</span> : null}
                            {r.errorKind ? <span>kind: {r.errorKind}</span> : null}
                          </div>
                          {r.error ? (
                            <div className="mt-2">
                              <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                              <pre className="text-xs bg-bg-base border border-border p-2 overflow-auto max-h-[160px]">{r.error}</pre>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
            </div>
            </div>

            {resultsOpen ? (
              <Modal
                open={resultsOpen}
                onClose={() => setResultsOpen(false)}
                title={tr("Результати", "Results")}
                description={tr("Результати запуску та перевірки.", "Run and check results.")}
              >
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-border pb-2">
                    <Button
                      variant={resultsTab === "run" ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setResultsTab("run")}
                      disabled={!runResult}
                      title={!runResult ? tr("Спочатку запустіть код", "Run code first") : undefined}
                    >
                      {tr("Запуск", "Run")}
                    </Button>
                    <Button
                      variant={resultsTab === "check" ? "primary" : "ghost"}
                      size="sm"
                      onClick={() => setResultsTab("check")}
                      disabled={!checkResult}
                      title={!checkResult ? tr("Спочатку перевірте код", "Check code first") : undefined}
                    >
                      {tr("Перевірка", "Check")}
                    </Button>
                  </div>

                  {resultsTab === "run" ? (
                    !runResult ? (
                      <div className="text-sm text-text-secondary">{tr("Немає результату запуску", "No run result")}</div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs text-text-secondary flex flex-wrap gap-3">
                          <span>
                            {tr("Код виходу", "Exit")}: {runResult.exitCode}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            {(() => {
                              const c = runStatusChip(runResult.success, tr);
                              return <StatusChip glyph={c.glyph} label={c.label} tone={c.tone} />;
                            })()}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-mono text-text-primary mb-1">stdout</div>
                          <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[320px]">{runResult.stdout || ""}</pre>
                        </div>
                        <div>
                          <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                          <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[320px]">{runResult.stderr || ""}</pre>
                        </div>
                      </div>
                    )
                  ) : null}

                  {resultsTab === "check" ? (
                    !checkResult ? (
                      <div className="text-sm text-text-secondary">{tr("Немає результату перевірки", "No check result")}</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Вердикт", "Verdict")}: 
                            {(() => {
                              const v = verdictChip(checkResult.verdict, tr);
                              return <StatusChip glyph={v.glyph} label={v.label} tone={v.tone} className="ml-1" />;
                            })()}
                          </span>
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Тести", "Tests")}: {checkResult.testsPassed}/{checkResult.testsTotal}
                          </span>
                          <span className="px-2 py-0.5 border border-border">
                            {tr("Бали", "Score")}: {checkResult.score}/{checkResult.maxScore}
                          </span>
                          {checkResult.hidden.total > 0 ? (
                            <span className="px-2 py-0.5 border border-border">
                              {tr("Приховані", "Hidden")}: {checkResult.hidden.passed}/{checkResult.hidden.total}
                            </span>
                          ) : null}
                        </div>

                        {checkResult.compileError ? (
                          <div className="border border-border p-3">
                            <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                              <span className="text-accent-error">{tr("Помилка компіляції", "Compilation error")}</span>
                              {checkResult.compileErrorKind ? <span>kind: {checkResult.compileErrorKind}</span> : null}
                            </div>
                            <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[360px]">{checkResult.compileError}</pre>
                          </div>
                        ) : null}

                        {typeof checkResult.publicTestResultsTotal === "number" ? (
                          <div className="text-xs text-text-secondary">
                            {tr("Публічні тести", "Public tests")}: {checkResult.publicTestResults.length}/
                            {checkResult.publicTestResultsTotal}
                            {checkResult.publicTestResultsTruncated ? (
                              <span className="ml-2 text-accent-warning">
                                {tr("(обрізано для стабільності)", "(truncated for stability)")}
                              </span>
                            ) : null}
                            <div className="mt-1 text-[11px] opacity-80">
                              {tr(
                                "Показано лише статуси тестів (без input/output).",
                                "Only test statuses are shown (no input/output)."
                              )}
                            </div>
                          </div>
                        ) : null}

                        {checkResult.publicTestResultsCompact?.length ? (
                          <div className="border border-border p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-xs text-text-secondary">
                                {tr("Статуси всіх публічних тестів (компактно)", "Statuses of all public tests (compact)")}: {checkResult.publicTestResultsCompact.length}
                                {checkResult.publicTestResultsCompactTruncated ? (
                                  <span className="ml-2 text-accent-warning">
                                    {tr("(обрізано)", "(truncated)")}
                                    {typeof checkResult.publicTestResultsCompactLimit === "number" ? (
                                      <span className="ml-1">limit={checkResult.publicTestResultsCompactLimit}</span>
                                    ) : null}
                                  </span>
                                ) : null}
                              </div>
                              <Button variant="ghost" onClick={() => setShowCompactStatuses((v) => !v)}>
                                {showCompactStatuses ? tr("Сховати", "Hide") : tr("Показати", "Show")}
                              </Button>
                            </div>

                            {showCompactStatuses ? (
                              <div className="mt-2 space-y-2">
                                <label className="flex items-center gap-2 text-xs text-text-secondary select-none">
                                  <input
                                    type="checkbox"
                                    checked={compactFailedOnly}
                                    onChange={(e) => setCompactFailedOnly(e.target.checked)}
                                  />
                                  {tr("Показувати тільки помилки", "Show failed only")}
                                </label>

                                <div className="max-h-[320px] overflow-auto border border-border p-2">
                                  <div className="flex flex-wrap gap-1">
                                    {(compactFailedOnly
                                      ? checkResult.publicTestResultsCompact.filter((t) => !t.passed)
                                      : checkResult.publicTestResultsCompact
                                    ).map((t) => (
                                      <span
                                        key={t.testId}
                                        className={
                                          "px-2 py-0.5 border text-[11px] font-mono " +
                                          (t.passed ? "border-accent-success text-accent-success" : "border-accent-error text-accent-error")
                                        }
                                        title={(t.verdict ? `verdict: ${t.verdict}` : "") + (t.errorKind ? ` kind: ${t.errorKind}` : "")}
                                      >
                                        #{t.testId}
                                      </span>
                                    ))}
                                  </div>
                                </div>

                                <div className="text-[11px] text-text-secondary opacity-80">
                                  {tr(
                                    "Компактний список статусів тестів.",
                                    "Compact list of test statuses."
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {checkResult.publicTestResults.length === 0 ? (
                          <div className="text-sm text-text-secondary">{tr("Немає публічних тестів для показу", "No public tests to show")}</div>
                        ) : (
                          <div className="space-y-2">
                            {checkResult.publicTestResults.map((r) => (
                              <div key={r.testId} className="p-3 border border-border">
                                <div className="text-xs text-text-secondary flex flex-wrap gap-2 mb-2">
                                  <span className={r.passed ? "text-accent-success" : "text-accent-error"}>
                                    {r.passed ? tr("пройдено", "passed") : tr("не пройдено", "failed")}
                                  </span>
                                  <span>{tr("тест", "test")}: {r.testId}</span>
                                  {r.verdict ? <span>verdict: {r.verdict}</span> : null}
                                  {r.errorKind ? <span>kind: {r.errorKind}</span> : null}
                                </div>
                                {r.error ? (
                                  <div className="mt-2">
                                    <div className="text-xs font-mono text-text-primary mb-1">stderr</div>
                                    <pre className="text-xs bg-bg-base border border-border p-3 overflow-auto max-h-[240px]">{r.error}</pre>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  ) : null}

                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <Button variant="ghost" onClick={() => setResultsOpen(false)}>
                      {tr("Закрити", "Close")}
                    </Button>
                  </div>
                </div>
              </Modal>
            ) : null}

            <Modal
              open={statementModalOpen}
              onClose={() => setStatementModalOpen(false)}
              title={tr("Повна умова задачі", "Full task statement")}
              description={tr("Умова та теорія задачі.", "Task statement and theory.")}
            >
              <div className="space-y-5 p-4 sm:p-6">
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-2">{tr("Умова", "Description")}</div>
                  {task?.description?.trim() ? (
                    <div className="prose prose-invert max-w-none text-text-primary">
                      <MarkdownView content={task.description} />
                    </div>
                  ) : (
                    <div className="text-sm text-text-secondary">{tr("Умова відсутня", "Description is empty")}</div>
                  )}
                </div>
                <div>
                  <div className="text-xs font-mono uppercase tracking-wider text-text-secondary mb-2">{tr("Теорія", "Theory")}</div>
                  {theory?.trim() ? (
                    <div className="prose prose-invert max-w-none text-text-primary">
                      <MarkdownView content={theory} />
                    </div>
                  ) : (
                    <div className="text-sm text-text-secondary">{tr("Теорія відсутня", "Theory is empty")}</div>
                  )}
                </div>
              </div>
            </Modal>
          </>
        )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryTaskSolvePage;
