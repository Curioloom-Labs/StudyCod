import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { useProctoring } from "../../hooks/useProctoring";
import { scoreProctoring, recordConceptReview } from "../../lib/api/tasks";
import { saveSolveReplay, type ReplaySnapshot } from "../../lib/api/learning";
import { FailureRecoveryCard } from "../../components/FailureRecoveryCard";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { extractFirstExampleInput, normalizeStdinBeforeRun } from "../../utils/inputTextNormalization";
import {
  checkLibraryWebTask,
  checkLibraryTask,
  listApprovedLibraryTasks,
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
import { JUDGE_ENTRY_FILES, enabledJudgeLanguages, defaultCompilerForFamily } from "../../lib/judgeLanguages";
import { StudyCodIDEWorkspace } from "../../components/ide/StudyCodIDEWorkspace";
import { tracePlayground, type TraceResult } from "../../lib/api/playground";

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

const LearningSuccessCard: React.FC<{
  topic: string;
  testsPassed: number;
  testsTotal: number;
  nextTask?: LibraryTaskListItem | null;
  onNextTask: () => void;
}> = ({ topic, testsPassed, testsTotal, nextTask, onNextTask }) => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  return <div className="mt-4 rounded-2xl border border-[#00d978]/25 bg-[#00d978]/[.07] p-4 text-[#e7f7eb]">
    <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#72edb0]" /><div><div className="text-sm font-bold text-[#72edb0]">{tr("Рішення перевірено", "Solution verified")}</div><p className="mt-1 text-xs leading-5 text-[#b9cfbe]">{tr("Рішення пройшло всі доступні перевірки. Це результат цієї задачі, а не навчальна навичка.", "The solution passed all available checks. This is a result for this task, not a learning skill.")} {testsPassed}/{testsTotal}</p></div></div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl bg-white/[.05] p-3"><span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{tr("Задача", "Task")}</span><strong className="mt-1 block text-sm">{topic}</strong></div><div className="rounded-xl bg-white/[.05] p-3"><span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{tr("Статус", "Status")}</span><strong className="mt-1 block text-sm">{tr("Завершено", "Completed")}</strong></div></div>
    {nextTask ? <button type="button" onClick={onNextTask} className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[.05] p-3 text-left transition hover:bg-white/[.09]"><span><span className="block text-[10px] uppercase tracking-[.12em] text-[#83988a]">{tr("Наступна рекомендована задача", "Next recommended task")}</span><strong className="mt-1 block text-sm">{nextTask.title}</strong></span><ArrowLeft className="size-4 rotate-180 text-[#72edb0]" /></button> : <p className="mt-4 text-xs text-[#9fb5a5]">{tr("Відкрий бібліотеку, щоб обрати наступну задачу з цієї теми.", "Open the library to choose the next task from this topic.")}</p>}
  </div>;
};

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

const MULTI_FILE_TEMPLATE_PREFIX = "__STUDYCOD_MULTI_FILE_V1__\n";

type CodeTemplateState = {
  code: string;
  files: CodeFile[];
  useFiles: boolean;
};

/** Decode the same starter format that the backend judge accepts for submissions. */
function decodeCodeTemplate(rawTemplate: string, entryFile: string): CodeTemplateState {
  const fallback = { code: rawTemplate, files: [], useFiles: false } satisfies CodeTemplateState;
  if (!rawTemplate.startsWith(MULTI_FILE_TEMPLATE_PREFIX)) return fallback;

  try {
    const parsed = JSON.parse(rawTemplate.slice(MULTI_FILE_TEMPLATE_PREFIX.length)) as {
      version?: unknown;
      entry?: unknown;
      files?: unknown;
    };
    if (parsed?.version !== 1 || String(parsed.entry ?? "").trim() !== entryFile || !Array.isArray(parsed.files)) {
      return fallback;
    }

    const files = normalizeFiles(
      parsed.files.flatMap((file) => {
        if (!file || typeof file !== "object") return [];
        const path = String((file as { path?: unknown }).path ?? "").trim();
        if (!path) return [];
        return [{ path, content: String((file as { content?: unknown }).content ?? "") }];
      }),
    );
    if (!files.length || !files.some(file => file.path === entryFile)) return fallback;

    return {
      code: entryContentFromFiles(files, entryFile),
      files,
      useFiles: true,
    };
  } catch {
    return fallback;
  }
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
  return (fs || []).find(file => file.path === entryFile)?.content ?? "";
}

export const LibraryTaskSolvePage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const navigate = useNavigate();
  const location = useLocation();
  // The route is protected by the cookie-backed RequireToken guard.
  const hasToken = true;
  // Privacy-respecting proctoring capture for the solve session (aggregate
  // behavioural signals only — see useProctoring).
  const proctoring = useProctoring(hasToken);

  // Solve-replay capture: throttled code snapshots over the session.
  const replaySnapshotsRef = useRef<ReplaySnapshot[]>([]);
  const replayStartRef = useRef<number>(Date.now());
  const lastSnapAtRef = useRef<number>(0);
  const params = useParams<{ taskKey?: string; taskId?: string; id?: string }>();
  const queryTaskKey = useMemo(() => new URLSearchParams(location.search || "").get("task") ?? "", [location.search]);
  const taskKey = useMemo(() => String(params.taskKey ?? params.taskId ?? params.id ?? queryTaskKey).trim(), [params, queryTaskKey]);
  const taskId = useMemo(() => {
    const v = parseInt(taskKey, 10);
    return taskKey && String(v) === taskKey ? v : null;
  }, [taskKey]);

  const designPreview = import.meta.env.DEV && new URLSearchParams(location.search || "").get("preview") === "true";
  const libraryListPath = useMemo(() => {
    const path = location.pathname.startsWith("/edu/") ? "/edu/library" : "/lab/library";
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
    const isSolvePath = (p: string) => /^\/(?:edu\/)?(?:lab\/)?library\/solve\//.test(String(p || ""));

    const primaryTarget = !isSolvePath(safeBackPath) ? safeBackPath : libraryListPath;
    const target = primaryTarget || libraryListPath;

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
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [tracing, setTracing] = useState(false);
  const [nextTask, setNextTask] = useState<LibraryTaskListItem | null>(null);
  const [, setLastReplayId] = useState<number | null>(null);
  const [, setActionRecovery] = useState<{
    tone: "error" | "warning";
    message: string;
    retry: "run" | "check" | "save";
  } | null>(null);
  const [, setShowCompactStatuses] = useState(false);
  const [, setCompactFailedOnly] = useState(true);

  const firstFailedTest = useMemo(() => {
    if (!checkResult) return null;
    const stored = checkResult.learningFeedback?.firstFailure;
    if (stored) return { testId: stored.testId, errorKind: stored.errorKind, verdict: stored.verdict };
    const detailed = (checkResult.publicTestResults || []).find((item) => !item.passed);
    if (detailed) return { testId: detailed.testId, errorKind: detailed.errorKind, verdict: detailed.verdict };
    const compact = (checkResult.publicTestResultsCompact || []).find((item) => !item.passed);
    if (compact) return { testId: compact.testId, errorKind: compact.errorKind, verdict: compact.verdict };
    if (checkResult.compileError || checkResult.verdict === "CE") return { errorKind: checkResult.compileErrorKind || "compile", verdict: "CE" };
    return null;
  }, [checkResult]);

  const loadNextRecommendedTask = async () => {
    if (!task) return;
    try {
      const result = await listApprovedLibraryTasks({ judgeLanguage, page: 1, pageSize: 50 });
      const currentTags = new Set([String(task.section ?? "").toLowerCase(), ...(task.tags ?? []).map((tag) => String(tag).toLowerCase())].filter(Boolean));
      const candidates = (result.tasks || []).filter((candidate) => candidate.id !== task.id && !candidate.attempt?.solved);
      const match = candidates.find((candidate) => {
        const candidateTags = [String(candidate.section ?? "").toLowerCase(), ...(candidate.tags ?? []).map((tag) => String(tag).toLowerCase())];
        return candidateTags.some((tag) => currentTags.has(tag));
      });
      setNextTask(match ?? candidates[0] ?? null);
    } catch {
      setNextTask(null);
    }
  };

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

  const [, setResultsOpen] = useState(false);
  const [, setResultsTab] = useState<"run" | "check">("check");
  const [, setActiveRailItem] = useState<"mission" | "task" | "console">("mission");
  const statementSectionRef = useRef<HTMLDivElement | null>(null);
  const editorSectionRef = useRef<HTMLDivElement | null>(null);
  const outputSectionRef = useRef<HTMLDivElement | null>(null);

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
        const entryFile = entryFileForJudgeLanguage(initialLang);
        const initialTemplate = decodeCodeTemplate(getTemplateForLanguage(d.task, initialLang), entryFile);
        draftCacheRef.current[initialLang] = {
          useFiles: initialTemplate.useFiles,
          code: initialTemplate.code,
          files: initialTemplate.files,
          lastSavedUseFiles: initialTemplate.useFiles,
          lastSavedCode: initialTemplate.code,
          lastSavedFiles: initialTemplate.files,
        };
        setUseFiles(initialTemplate.useFiles);
        setFiles(initialTemplate.files);
        setCode(initialTemplate.code);
        setLastSavedUseFiles(initialTemplate.useFiles);
        setLastSavedFiles(initialTemplate.files);
        setLastSavedCode(initialTemplate.code);
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

    const templateState = decodeCodeTemplate(getTemplateForLanguage(task, lang), entryFile);
    if (!hasToken) {
      draftCacheRef.current[lang] = {
        useFiles: templateState.useFiles,
        code: templateState.code,
        files: templateState.files,
        lastSavedUseFiles: templateState.useFiles,
        lastSavedCode: templateState.code,
        lastSavedFiles: templateState.files,
      };
      setUseFiles(templateState.useFiles);
      setFiles(templateState.files);
      setCode(templateState.code);
      setLastSavedUseFiles(templateState.useFiles);
      setLastSavedFiles(templateState.files);
      setLastSavedCode(templateState.code);
      return;
    }

    getLibraryTaskAttempt(numericId, { language: lang })
      .then((a) => {
        const attempt = a.attempt;
        const serverFiles = Array.isArray(attempt?.draftFiles) ? normalizeFiles(attempt!.draftFiles!) : [];
        const serverUseFiles = serverFiles.length > 0;
        const savedDraftCode = (attempt?.draftCode ?? "").trim() ? String(attempt?.draftCode ?? "") : "";
        const templateFiles = templateState.files;
        const draftFiles = serverUseFiles
          ? (serverFiles.some(f => f.path === entryFile) ? serverFiles : [...serverFiles, { path: entryFile, content: savedDraftCode || templateState.code }])
          : templateFiles.length > 0
            ? templateFiles.map(file => file.path === entryFile && savedDraftCode ? { ...file, content: savedDraftCode } : file)
            : [];
        const useTemplateFiles = draftFiles.length > 0;
        const resolvedCode = useTemplateFiles
          ? entryContentFromFiles(draftFiles, entryFile)
          : savedDraftCode || templateState.code;
        draftCacheRef.current[lang] = {
          useFiles: useTemplateFiles,
          code: resolvedCode,
          files: draftFiles,
          lastSavedUseFiles: useTemplateFiles,
          lastSavedCode: resolvedCode,
          lastSavedFiles: draftFiles,
        };
        setUseFiles(useTemplateFiles);
        setFiles(draftFiles);
        setCode(resolvedCode);
        setLastSavedUseFiles(useTemplateFiles);
        setLastSavedFiles(draftFiles);
        setLastSavedCode(resolvedCode);
      })
      .catch(() => {
        // fallback to template
        draftCacheRef.current[lang] = {
          useFiles: templateState.useFiles,
          code: templateState.code,
          files: templateState.files,
          lastSavedUseFiles: templateState.useFiles,
          lastSavedCode: templateState.code,
          lastSavedFiles: templateState.files,
        };
        setUseFiles(templateState.useFiles);
        setFiles(templateState.files);
        setCode(templateState.code);
        setLastSavedUseFiles(templateState.useFiles);
        setLastSavedFiles(templateState.files);
        setLastSavedCode(templateState.code);
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
          showToast({ type: "error", message: tr("Чернетку не вдалося зберегти.", "Draft could not be saved.") });
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
    setNextTask(null);
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
      if (String(r.verdict ?? "").toUpperCase() === "AC") void loadNextRecommendedTask();
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
    const entryFile = entryFileForJudgeLanguage(judgeLanguage);
    const templateState = decodeCodeTemplate(getTemplateForLanguage(task, judgeLanguage), entryFile);
    if (templateState.useFiles) {
      setUseFiles(true);
      setFiles(templateState.files);
      setCode(templateState.code);
    } else if (useFiles) {
      setFiles([{ path: entryFile, content: templateState.code }]);
      setCode(templateState.code);
    } else {
      setCode(templateState.code);
    }
  };

  const runTrace = async () => {
    if (isWebTask || tracing || !code.trim()) return;
    setTracing(true);
    try {
      const result = await tracePlayground({ language: judgeLanguage, code, stdin });
      setTrace(result);
    } catch (error) {
      const message = getErrorMessageFromUnknown(error, tr("Не вдалося запустити debug trace", "Couldn't start debug trace"));
      showToast({ type: "error", message });
    } finally {
      setTracing(false);
    }
  };

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

  const ideResultCards = checkResult && String(checkResult.verdict ?? "").toUpperCase() === "AC" ? (
    <LearningSuccessCard
      topic={task.section || task.tags?.[0] || tr("практична тема", "the practice topic")}
      testsPassed={checkResult.testsPassed}
      testsTotal={checkResult.testsTotal}
      nextTask={nextTask}
      onNextTask={() => {
        if (!nextTask) return;
        const prefix = location.pathname.startsWith("/edu/") ? "/edu/library/solve/" : "/library/solve/";
        navigate(`${prefix}${nextTask.id}`);
      }}
    />
  ) : checkResult ? (
    <FailureRecoveryCard
      verdict={checkResult.verdict}
      testsPassed={checkResult.testsPassed}
      testsTotal={checkResult.testsTotal}
      firstFailure={firstFailedTest}
      compileError={checkResult.compileError}
      compileErrorKind={checkResult.compileErrorKind}
      taskId={task.id}
      taskKind="LIBRARY"
      learningAttemptId={checkResult.learningAttempt?.id ?? null}
      failureCategory={checkResult.learningAttempt?.failureCategory ?? firstFailedTest?.errorKind ?? null}
      highestHintLevelShown={checkResult.learningAttempt?.highestHintLevelShown ?? 0}
      trackLearning={false}
      onTryAgain={() => {
        setCheckResult(null);
        scrollToSection("task");
      }}
    />
  ) : null;

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1680px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={goBackToLibrary} className="inline-flex items-center gap-2 text-sm font-semibold text-[#617066] transition hover:text-[#147b47] dark:text-[#a7b5aa] dark:hover:text-[#72edb0]"><ArrowLeft className="size-4" />{tr("До бібліотеки", "Back to library")}</button>
          <div className="hidden items-center gap-2 text-xs text-[#718075] sm:flex"><span>{task.difficulty === "HARD" ? tr("Складна", "Hard") : task.difficulty === "MEDIUM" ? tr("Середня", "Medium") : tr("Легка", "Easy")}</span><span>·</span><span>{task.tags?.slice(0, 3).join(" · ")}</span></div>
        </div>
        <StudyCodIDEWorkspace
          task={task}
          theory={theory}
          language={judgeLanguage}
          onLanguageChange={setJudgeLanguage}
          compiler={judgeCompiler}
          onCompilerChange={setJudgeCompiler}
          code={code}
          onCodeChange={setCode}
          files={files}
          onFilesChange={(next) => setFiles(normalizeFiles(next))}
          useFiles={useFiles}
          onEnableFiles={() => {
            const entry = entryFileForJudgeLanguage(judgeLanguage);
            setUseFiles(true);
            setFiles([{ path: entry, content: code }]);
          }}
          entryFile={isWebTask ? "index.html" : entryFileForJudgeLanguage(judgeLanguage)}
          stdin={stdin}
          onStdinChange={setStdin}
          firstExampleInput={firstExampleInput}
          onUseExampleInput={() => setStdin(firstExampleInput)}
          running={running}
          checking={checking}
          onRun={doRun}
          onCheck={doCheck}
          onSave={manualSave}
          onReset={resetToTemplate}
          runResult={runResult}
          checkResult={checkResult}
          resultCards={ideResultCards}
          trace={trace}
          tracing={tracing}
          onTrace={isWebTask ? undefined : runTrace}
          webPreviewFiles={isWebTask ? toWebPreviewFiles() : undefined}
          isWebTask={isWebTask}
        />
      </div>
    </div>
  );


};

export default LibraryTaskSolvePage;
