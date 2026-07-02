import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Edit2, GripVertical, Library, Play, Plus, Search, Send, Star, Trash2, Upload, X } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { useUIMode } from "../../components/interface/UIModeProvider";
import { showToast } from "../../lib/toast";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { getMe } from "../../lib/api/profile";
import {
  createLibraryTask,
  deleteLibraryTask,
  downloadLibraryTaskArchive,
  getLibraryTask,
  importLibraryTaskArchives,
  listApprovedLibraryTasks,
  listMyLibraryTasks,
  submitLibraryTask,
  updateLibraryTask,
  getDifficultySuggestion,
  type JudgeLanguage,
  type LibraryCheckerSpec,
  type LibraryTaskDifficulty,
  type LibraryTaskListItem,
  type WebTaskFile,
  type WebTaskProfileId,
  type WebTaskRule,
  type LibraryTaskStatus,
} from "../../lib/api/library";
import { JUDGE_LANGUAGE_LABELS, enabledJudgeLanguages } from "../../lib/judgeLanguages";

type TaskDetails = {
  task: LibraryTaskListItem;
  theory: string | null;
  tests: Array<{ id: number; input: string; expectedOutput: string; isHidden: boolean; points: number }>;
};

type EditorState = {
  id: number | null;
  taskMode: "CODE" | "WEB";
  problemCode: string;
  slug: string;
  title: string;
  difficulty: LibraryTaskDifficulty | "";
  tagsCsv: string;
  section: string;
  description: string;
  template: string;
  templatesByLanguage: Partial<Record<JudgeLanguage, string>>;
  templateLang: JudgeLanguage;
  allowedLanguages: JudgeLanguage[];
  timeLimitMs: number | "";
  memoryLimitMb: number | "";
  outputLimitKb: number | "";
  checkerType: "" | "exact" | "whitespace" | "float";
  checkerEpsilon: number | "";
  maxAttempts: number;
  theory: string;
  testsJson: string;
  webIndexHtml: string;
  webStylesCss: string;
  webScriptJs: string;
  webValidationProfileId: WebTaskProfileId;
  webRulesJson: string;
};

type WebRuleDraft = {
  type: WebTaskRule["type"];
  selector: string;
  attribute: string;
  value: string;
  valuePattern: string;
  property: string;
  text: string;
  pattern: string;
  flags: string;
  message: string;
  points: number | "";
};

type ImportReportState = {
  importedCount: number;
  failedCount: number;
  entries: Array<{ code: string; line: string }>;
  status: "partial" | "failed";
};

const ALL_JUDGE_LANGS: JudgeLanguage[] = enabledJudgeLanguages();
const FRIENDLY_JUDGE_LANG = JUDGE_LANGUAGE_LABELS;

const FRIENDLY_DIFFICULTY: Record<LibraryTaskDifficulty, { uk: string; en: string; color: "success" | "warn" | "error" | "info" }> = {
  EASY: { uk: "Легка", en: "Easy", color: "success" },
  MEDIUM: { uk: "Середня", en: "Medium", color: "warn" },
  HARD: { uk: "Складна", en: "Hard", color: "error" },
};

const WEB_PROFILE_OPTIONS: Array<{ id: WebTaskProfileId; label: string; hint: string }> = [
  { id: "FREE_WEB", label: "FREE_WEB", hint: "HTML + CSS + JS" },
  { id: "HTML_ONLY", label: "HTML_ONLY", hint: "Only HTML structure" },
  { id: "HTML_CSS_NO_JS", label: "HTML_CSS_NO_JS", hint: "HTML + CSS, no JS" },
  { id: "HTML_JS_NO_CSS", label: "HTML_JS_NO_CSS", hint: "HTML + JS, no CSS" },
  { id: "JS_ONLY_DOM", label: "JS_ONLY_DOM", hint: "Only JS editing (HTML/CSS locked)" },
  { id: "CSS_ONLY", label: "CSS_ONLY", hint: "Only CSS editing (HTML/JS locked)" },
  { id: "HTML_AND_INLINE_ONLY", label: "HTML_AND_INLINE_ONLY", hint: "Only HTML + inline style/script" },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatShortDate(iso: string | null | undefined, locale: string) {
  const raw = String(iso ?? "").trim();
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

const getAllowedJudgeLanguages = (task: { allowedLanguages?: JudgeLanguage[] | null }): JudgeLanguage[] => {
  const allowed = (task.allowedLanguages || []).filter(Boolean);
  if (allowed.length) return Array.from(new Set(allowed));
  return ALL_JUDGE_LANGS;
};

const isJudgeLanguage = (value: string): value is JudgeLanguage =>
  (ALL_JUDGE_LANGS as readonly string[]).includes(value);

const parseJudgeLanguage = (value: string): JudgeLanguage | null => (isJudgeLanguage(value) ? value : null);

const parseMineStatus = (value: string): LibraryTaskStatus | "ALL" | null => {
  if (value === "ALL" || value === "DRAFT" || value === "PENDING" || value === "APPROVED" || value === "REJECTED") {
    return value;
  }
  return null;
};

const parseSort = (value: string): "UPDATED_DESC" | "TITLE_ASC" | "DIFFICULTY_ASC" | null => {
  if (value === "UPDATED_DESC" || value === "TITLE_ASC" || value === "DIFFICULTY_ASC") {
    return value;
  }
  return null;
};

const parseDifficulty = (value: string): LibraryTaskDifficulty | "" | null => {
  if (value === "" || value === "EASY" || value === "MEDIUM" || value === "HARD") return value;
  return null;
};

const parseCheckerType = (value: string): EditorState["checkerType"] | null => {
  if (value === "" || value === "exact" || value === "whitespace" || value === "float") return value;
  return null;
};

function safeParseTestsJson(text: string): Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Tests JSON must be an array");
  return parsed.map((t: unknown) => {
    const item = (typeof t === "object" && t !== null ? t : {}) as {
      input?: unknown;
      expectedOutput?: unknown;
      isHidden?: unknown;
      points?: unknown;
    };
    return {
      input: String(item.input ?? ""),
      expectedOutput: String(item.expectedOutput ?? ""),
      isHidden: item.isHidden ? true : false,
      points: item.points != null ? Number(item.points) : undefined,
    };
  });
}

function extractWebFileContent(files: WebTaskFile[] | null | undefined, path: WebTaskFile["path"]): string {
  const list = Array.isArray(files) ? files : [];
  const hit = list.find((f) => f.path === path);
  return String(hit?.content ?? "");
}

function safeParseWebRulesJson(text: string): WebTaskRule[] {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("WEB rules JSON must be an array");
  return parsed.map((r: unknown) => {
    const item = (typeof r === "object" && r !== null ? r : {}) as Record<string, unknown>;
    return {
      id: typeof item.id === "string" ? item.id : undefined,
      type: String(item.type ?? "required_selector") as WebTaskRule["type"],
      message: typeof item.message === "string" ? item.message : undefined,
      points: item.points == null ? undefined : Number(item.points),
      selector: typeof item.selector === "string" ? item.selector : undefined,
      attribute: typeof item.attribute === "string" ? item.attribute : undefined,
      value: typeof item.value === "string" ? item.value : undefined,
      valuePattern: typeof item.valuePattern === "string" ? item.valuePattern : undefined,
      property: typeof item.property === "string" ? item.property : undefined,
      text: typeof item.text === "string" ? item.text : undefined,
      pattern: typeof item.pattern === "string" ? item.pattern : undefined,
      flags: typeof item.flags === "string" ? item.flags : undefined,
    };
  });
}

function webRuleTargetText(rule: WebTaskRule): string {
  if (rule.type === "required_selector" || rule.type === "forbidden_selector") return String(rule.selector ?? "");
  if (rule.type === "required_attribute" || rule.type === "forbidden_attribute") {
    const attr = String(rule.attribute ?? "");
    const selector = String(rule.selector ?? "");
    const value = String(rule.value ?? "");
    return [selector, attr, value ? `=${value}` : ""].filter(Boolean).join(" ");
  }
  if (rule.type === "required_style" || rule.type === "forbidden_style") {
    const selector = String(rule.selector ?? "");
    const prop = String(rule.property ?? "");
    const value = String(rule.value ?? "");
    return [selector, `${prop}${value ? `:${value}` : ""}`].filter(Boolean).join(" ");
  }
  if (rule.type === "required_text" || rule.type === "forbidden_text") return String(rule.text ?? "");
  return String(rule.pattern ?? "");
}

const getErrorMessage = (error: unknown, fallback: string): string => getErrorMessageFromUnknown(error, fallback);

const defaultWebRuleDraft = (): WebRuleDraft => ({
  type: "required_selector",
  selector: "",
  attribute: "",
  value: "",
  valuePattern: "",
  property: "",
  text: "",
  pattern: "",
  flags: "",
  message: "",
  points: 1,
});

const getApiMessageAndIssues = (error: unknown): { message: string | null; issues: unknown[] } => {
  if (!error || typeof error !== "object") return { message: null, issues: [] };
  const response = Reflect.get(error, "response");
  if (!response || typeof response !== "object") return { message: null, issues: [] };
  const data = Reflect.get(response, "data");
  if (!data || typeof data !== "object") return { message: null, issues: [] };
  const messageRaw = Reflect.get(data, "message");
  const issuesRaw = Reflect.get(data, "errors");
  return {
    message: typeof messageRaw === "string" ? messageRaw : null,
    issues: Array.isArray(issuesRaw) ? issuesRaw : [],
  };
};

const formatIssue = (it: unknown): string => {
  const pathRaw = it && typeof it === "object" ? Reflect.get(it, "path") : undefined;
  const messageRaw = it && typeof it === "object" ? Reflect.get(it, "message") : undefined;
  const path = Array.isArray(pathRaw) ? pathRaw.join(".") : "";
  const p = path ? `${path}: ` : "";
  return p + String(messageRaw ?? "Invalid input");
};

const CountUp: React.FC<{ value: number; decimals?: number; className?: string }> = ({ value, decimals = 0, className }) => {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce) {
      node.textContent = value.toFixed(decimals);
      return;
    }
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [value, decimals, reduce]);
  return <span ref={ref} className={className}>{value.toFixed(decimals)}</span>;
};

export const TaskLibraryPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const isAurora = useUIMode().mode === "aurora";
  const navigate = useNavigate();
  const location = useLocation();

  const solvePathPrefix = location.pathname.startsWith("/edu/") ? "/edu/library/solve" : "/library/solve";
  const libraryBasePath = location.pathname.startsWith("/edu/") ? "/edu/library" : "/library";

  const safeExitPath = useMemo(() => {
    const fallback = location.pathname.startsWith("/edu/") ? "/edu" : "/";
    const isSolvePath = (p: string) => /^\/(?:edu\/)?library\/solve\//.test(String(p || ""));
    const isLibraryPath = (p: string) => /^\/(?:edu\/)?library(?:\/|\?|$)/.test(String(p || ""));

    let fromRaw = new URLSearchParams(location.search || "").get("from");
    for (let i = 0; i < 6; i++) {
      const candidate = String(fromRaw ?? "").trim();
      if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
      if (isSolvePath(candidate)) return fallback;

      if (!isLibraryPath(candidate)) return candidate;

      try {
        const url = new URL(candidate, "http://local");
        const nested = url.searchParams.get("from");
        if (!nested) return fallback;
        fromRaw = nested;
      } catch {
        return fallback;
      }
    }

    return fallback;
  }, [location.pathname, location.search]);

  const leaveLibrary = () => {
    if (typeof window !== "undefined") {
      window.location.assign(safeExitPath);
      return;
    }
    navigate(safeExitPath, { replace: true });
  };

  const [canManage, setCanManage] = useState(false);

  const [view, setView] = useState<"approved" | "mine">("approved");
  const [judgeLang, setJudgeLang] = useState<JudgeLanguage | "ALL">("ALL");
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");

  const [mineStatus, setMineStatus] = useState<LibraryTaskStatus | "ALL">("ALL");
  const [onlySolved, setOnlySolved] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [sort, setSort] = useState<"UPDATED_DESC" | "TITLE_ASC" | "DIFFICULTY_ASC">("UPDATED_DESC");

  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<LibraryTaskListItem[]>([]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<TaskDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"description" | "theory" | "tests">("description");

  const [filtersOpen, setFiltersOpen] = useState(false);

  const hydratedFromUrlRef = useRef(false);
  const listSectionRef = useRef<HTMLDivElement | null>(null);
  const previewSectionRef = useRef<HTMLDivElement | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const autoEditHandledRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [importKey, setImportKey] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<ImportReportState | null>(null);
  const [showImportReport, setShowImportReport] = useState(false);
  const [importReportFilter, setImportReportFilter] = useState<string>("ALL");
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<number>>(() => new Set<number>());
  const [bulkActionPending, setBulkActionPending] = useState(false);

  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set<number>());

  useEffect(() => {
    try {
      const raw = localStorage.getItem("library:favorites");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const next = new Set<number>();
      for (const x of parsed) {
        const n = Number(x);
        if (Number.isFinite(n)) next.add(n);
      }
      setFavoriteIds(next);
    } catch {
      // ignore
    }
  }, []);

  const persistFavorites = (next: Set<number>) => {
    setFavoriteIds(next);
    try {
      localStorage.setItem("library:favorites", JSON.stringify(Array.from(next)));
    } catch {
      // ignore
    }
  };

  const toggleFavorite = (taskId: number) => {
    const next = new Set<number>(favoriteIds);
    if (next.has(taskId)) next.delete(taskId);
    else next.add(taskId);
    persistFavorites(next);
  };

  const emptyEditor: EditorState = useMemo(
    () => ({
      id: null,
      taskMode: "CODE",
      problemCode: "",
      slug: "",
      title: "",
      difficulty: "",
      tagsCsv: "",
      section: "",
      description: "",
      template: "",
      templatesByLanguage: {},
      templateLang: "java",
      allowedLanguages: ALL_JUDGE_LANGS,
      timeLimitMs: "",
      memoryLimitMb: "",
      outputLimitKb: "",
      checkerType: "",
      checkerEpsilon: "",
      maxAttempts: 3,
      theory: "",
      testsJson: "",
      webIndexHtml: "<main>\n  <h1>Hello, StudyCod!</h1>\n</main>\n",
      webStylesCss: "body {\n  font-family: system-ui, sans-serif;\n}\n",
      webScriptJs: "// your javascript here\n",
      webValidationProfileId: "FREE_WEB",
      webRulesJson: "",
    }),
    []
  );

  const [editor, setEditor] = useState<EditorState>(emptyEditor);
  const [diffSuggestion, setDiffSuggestion] = useState<{ recommended: string; confidence: number; rationale: string } | null>(null);
  const [webRuleDraft, setWebRuleDraft] = useState<WebRuleDraft>(defaultWebRuleDraft);
  const [draggedWebRuleIndex, setDraggedWebRuleIndex] = useState<number | null>(null);
  const [webRuleDropTargetIndex, setWebRuleDropTargetIndex] = useState<number | null>(null);
  const editorDescriptionRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // This page is read-only for student tokens.
    // For regular authenticated users we enable "Mine"/create/import/edit/submit.
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setCanManage(false);
      return;
    }
    getMe()
      .then((u) => {
        setCanManage(!u.studentId);
      })
      .catch(() => {
        setCanManage(false);
      });
  }, []);

  useEffect(() => {
    // Hydrate initial state from URL query once (supports refresh/share/back).
    if (hydratedFromUrlRef.current) return;

    const sp = new URLSearchParams(location.search || "");
    const parseBool = (v: string | null) => {
      const s = String(v ?? "").trim().toLowerCase();
      return s === "1" || s === "true" || s === "yes" || s === "on";
    };

    const v = sp.get("view");
    if (v === "approved") setView("approved");
    if (v === "mine" && canManage) setView("mine");

    const lang = (sp.get("lang") || "").trim().toLowerCase();
    if (lang) {
      const parsedLang = parseJudgeLanguage(lang);
      if (parsedLang) {
        setJudgeLang(parsedLang);
      }
    }

    const qParam = sp.get("q");
    if (typeof qParam === "string" && qParam.trim()) {
      setQDraft(qParam);
      setQ(qParam);
    }

    const pRaw = sp.get("page");
    if (pRaw) {
      const p = Number(pRaw);
      if (Number.isFinite(p) && p > 0) setPage(Math.floor(p));
    }

    const sortParam = (sp.get("sort") || "").trim();
    if (sortParam === "UPDATED_DESC" || sortParam === "TITLE_ASC" || sortParam === "DIFFICULTY_ASC") {
      setSort(sortParam);
    }

    if (parseBool(sp.get("solved"))) setOnlySolved(true);
    if (parseBool(sp.get("fav"))) setOnlyFavorites(true);

    const selRaw = sp.get("sel");
    if (selRaw) {
      const n = Number(selRaw);
      if (Number.isFinite(n) && n > 0) setSelectedId(Math.floor(n));
    }

    // On small screens, keep filters collapsed by default if URL didn't request anything special.
    if (location.search && location.search.length > 1) setFiltersOpen(true);

    hydratedFromUrlRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage]);

  useEffect(() => {
    // Sync state to URL (persistence/shareability). Keep it lightweight & stable.
    if (!hydratedFromUrlRef.current) return;

    const sp = new URLSearchParams();
    if (view !== "approved") sp.set("view", view);

    if (view === "approved" && judgeLang !== "ALL") sp.set("lang", judgeLang);

    const qTrim = q.trim();
    if (qTrim) sp.set("q", qTrim);
    if (view === "approved" && page > 1) sp.set("page", String(page));
    if (sort !== "UPDATED_DESC") sp.set("sort", sort);
    if (onlySolved) sp.set("solved", "1");
    if (onlyFavorites) sp.set("fav", "1");
    if (selectedId) sp.set("sel", String(selectedId));

    const next = sp.toString();
    const cur = (location.search || "").replace(/^\?/, "");
    if (next !== cur) {
      navigate({ pathname: location.pathname, search: next ? `?${next}` : "" }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, judgeLang, q, page, sort, onlySolved, onlyFavorites, selectedId, location.pathname]);

  useEffect(() => {
    if (!canManage && view === "mine") {
      setView("approved");
    }
  }, [canManage, view]);

  useEffect(() => {
    const h = window.setTimeout(() => setQ(qDraft), 300);
    return () => window.clearTimeout(h);
  }, [qDraft]);

  const reload = async () => {
    setLoading(true);
    try {
      if (view === "mine" && canManage) {
        const res = await listMyLibraryTasks();
        setTasks(res.tasks);
        setTotal(null);
      } else {
        const res = await listApprovedLibraryTasks({
          judgeLanguage: judgeLang === "ALL" ? undefined : judgeLang,
          q: q.trim() || undefined,
          page,
          pageSize,
        });
        setTasks(res.tasks);
        setTotal(typeof res.total === "number" ? res.total : null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, canManage]);

  useEffect(() => {
    if (view === "approved") reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, page, judgeLang]);

  useEffect(() => {
    // Reset paging when filters change.
    if (view === "approved") setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, view, judgeLang]);

  useEffect(() => {
    if (!selectedId) {
      setDetails(null);
      return;
    }
    setLoadingDetails(true);
    getLibraryTask(selectedId)
      .then((d) => setDetails(d))
      .catch((e) => {
        console.error("Failed to load library task", e);
        setDetails(null);
      })
      .finally(() => setLoadingDetails(false));
  }, [selectedId]);

  useEffect(() => {
    if (autoEditHandledRef.current) return;
    if (!canManage) return;
    if (!selectedId) return;

    const sp = new URLSearchParams(location.search || "");
    const editRaw = String(sp.get("edit") ?? "").trim().toLowerCase();
    const shouldAutoEdit = editRaw === "1" || editRaw === "true" || editRaw === "yes" || editRaw === "on";
    if (!shouldAutoEdit) return;

    autoEditHandledRef.current = true;
    void openEdit(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, selectedId, location.search]);

  useEffect(() => {
    // Keep preview consistent when switching between list items / views.
    setDetailsTab("description");
  }, [selectedId, view]);

  useEffect(() => {
    if (view !== "mine" || !canManage) {
      setSelectedDraftIds((prev) => (prev.size ? new Set<number>() : prev));
      return;
    }

    const draftIds = new Set<number>(
      tasks
        .filter((task) => task.status === "DRAFT")
        .map((task) => task.id)
    );

    setSelectedDraftIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<number>();
      for (const id of prev) {
        if (draftIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [tasks, view, canManage]);

  const statusLabel = (st: LibraryTaskStatus) => {
    switch (st) {
      case "DRAFT":
        return tr("Чернетка", "Draft");
      case "PENDING":
        return tr("На модерації", "Pending");
      case "APPROVED":
        return tr("Схвалено", "Approved");
      case "REJECTED":
        return tr("Відхилено", "Rejected");
      default:
        return st;
    }
  };

  const handleDownload = async (taskId: number) => {
    try {
      const { blob, filename } = await downloadLibraryTaskArchive(taskId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      console.error("Failed to download archive", e);
      showToast({ type: "error", message: getErrorMessage(e, tr("Не вдалося завантажити архів", "Failed to download archive")) });
    }
  };

  const openCreate = () => {
    if (!canManage) return;
    setEditor(emptyEditor);
    setWebRuleDraft(defaultWebRuleDraft());
    setShowEditor(true);
  };

  const openEdit = async (taskId: number) => {
    if (!canManage) return;
    try {
      const d = await getLibraryTask(taskId);

      const checker: LibraryCheckerSpec | null = d.task.checkerSpec ?? null;
      const checkerType: EditorState["checkerType"] = checker?.type ?? "";
      const checkerEpsilon: EditorState["checkerEpsilon"] = checkerType === "float" && checker
        ? Number((checker as { epsilon?: unknown }).epsilon ?? 1e-6)
        : "";

      const difficulty = parseDifficulty(String(d.task.difficulty ?? "")) ?? "";
      const allowedLanguages = getAllowedJudgeLanguages(d.task);
      const firstTemplateLang = allowedLanguages[0] ?? "java";
      const templatesByLanguage =
        d.task.templatesByLanguage && typeof d.task.templatesByLanguage === "object"
          ? Object.fromEntries(
              Object.entries(d.task.templatesByLanguage).filter(
                ([key, value]) => isJudgeLanguage(key) && typeof value === "string"
              )
            ) as Partial<Record<JudgeLanguage, string>>
          : {};

      setEditor({
        id: d.task.id,
        taskMode: d.task.taskMode === "WEB" ? "WEB" : "CODE",
        problemCode: String(d.task.problemCode ?? ""),
        slug: String(d.task.slug ?? ""),
        title: d.task.title,
        difficulty,
        tagsCsv: Array.isArray(d.task.tags) ? d.task.tags.join(", ") : "",
        section: String(d.task.section ?? ""),
        description: d.task.description,
        template: d.task.template,
        templatesByLanguage,
        templateLang: firstTemplateLang,
        allowedLanguages,
        timeLimitMs: typeof d.task.timeLimitMs === "number" ? d.task.timeLimitMs : "",
        memoryLimitMb: typeof d.task.memoryLimitMb === "number" ? d.task.memoryLimitMb : "",
        outputLimitKb: typeof d.task.outputLimitKb === "number" ? d.task.outputLimitKb : "",
        checkerType,
        checkerEpsilon,
        maxAttempts: d.task.maxAttempts,
        theory: d.theory || "",
        testsJson: d.tests.length
          ? JSON.stringify(
              d.tests.map((t) => ({
                input: t.input,
                expectedOutput: t.expectedOutput,
                isHidden: t.isHidden,
                points: t.points,
              })),
              null,
              2
            )
          : "",
        webIndexHtml: extractWebFileContent(d.task.webTemplateFiles ?? null, "index.html") || "<main>\n  <h1>Hello, StudyCod!</h1>\n</main>\n",
        webStylesCss: extractWebFileContent(d.task.webTemplateFiles ?? null, "styles.css") || "body {\n  font-family: system-ui, sans-serif;\n}\n",
        webScriptJs: extractWebFileContent(d.task.webTemplateFiles ?? null, "script.js") || "// your javascript here\n",
        webValidationProfileId: (d.task.webValidationProfile?.id as WebTaskProfileId | undefined) ?? "FREE_WEB",
        webRulesJson: Array.isArray(d.task.webValidationRules) && d.task.webValidationRules.length
          ? JSON.stringify(d.task.webValidationRules, null, 2)
          : "",
      });
      setWebRuleDraft(defaultWebRuleDraft());
      setShowEditor(true);
    } catch (e: unknown) {
      console.error("Failed to open edit", e);
      showToast({ type: "error", message: tr("Не вдалося відкрити завдання", "Failed to open task") });
    }
  };

  const saveEditor = async () => {
    if (!canManage) return;
    if (!editor.title.trim() || !editor.description.trim()) {
      showToast({ type: "error", message: tr("Заповніть назву та опис", "Fill title and description") });
      return;
    }

    let tests: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> | undefined = undefined;
    try {
      const parsed = safeParseTestsJson(editor.testsJson);
      if (parsed.length > 0) tests = parsed;
    } catch (e: unknown) {
      showToast({ type: "error", message: tr("Некоректний JSON тестів", "Invalid tests JSON") + ": " + getErrorMessage(e, "Unknown error") });
      return;
    }

    let webValidationRules: WebTaskRule[] | undefined = undefined;
    let webValidationProfile: WebTaskProfileId | undefined = undefined;
    if (editor.taskMode === "WEB") {
      try {
        const parsed = safeParseWebRulesJson(editor.webRulesJson);
        if (parsed.length > 0) webValidationRules = parsed;
      } catch (e: unknown) {
        showToast({ type: "error", message: tr("Некоректний JSON WEB-правил", "Invalid WEB rules JSON") + ": " + getErrorMessage(e, "Unknown error") });
        return;
      }
      webValidationProfile = editor.webValidationProfileId;
    }

    setSaving(true);
    try {
      const tags = editor.tagsCsv
        .split(",")
        .map((x: string) => x.trim())
        .filter(Boolean)
        .slice(0, 20);

      const allowedLanguages: JudgeLanguage[] = Array.isArray(editor.allowedLanguages) && editor.allowedLanguages.length
        ? editor.allowedLanguages
        : ALL_JUDGE_LANGS;

      const templatesByLanguage: Record<string, string> = {};
      for (const l of allowedLanguages) {
        const raw = editor.templatesByLanguage?.[l];
        const v = typeof raw === "string" ? raw : "";
        templatesByLanguage[l] = (v.trim() ? v : editor.template).toString();
      }
      const missing = allowedLanguages.filter(l => !String(templatesByLanguage[l] ?? "").trim());
      if (missing.length > 0) {
        showToast({
          type: "error",
          message: tr(
            `Заповніть шаблон для мов: ${missing.join(", ")}`,
            `Fill templates for languages: ${missing.join(", ")}`
          ),
        });
        return;
      }

      const webTemplateFiles = editor.taskMode === "WEB"
        ? [
            { path: "index.html", content: String(editor.webIndexHtml ?? "") },
            { path: "styles.css", content: String(editor.webStylesCss ?? "") },
            { path: "script.js", content: String(editor.webScriptJs ?? "") },
          ] as WebTaskFile[]
        : undefined;

      // Keep a non-empty base template for legacy UI/exports.
      const baseTemplate = editor.taskMode === "WEB"
        ? String(editor.webIndexHtml ?? "") || "<main></main>"
        : String(templatesByLanguage[allowedLanguages[0]] ?? editor.template ?? "");

      const checkerSpec: LibraryCheckerSpec | undefined = (() => {
        if (!editor.checkerType) return undefined;
        if (editor.checkerType === "float") {
          const eps = Number(editor.checkerEpsilon);
          return { type: "float", epsilon: Number.isFinite(eps) && eps > 0 ? eps : 1e-6 };
        }
        return { type: editor.checkerType } as LibraryCheckerSpec;
      })();

      const limits = {
        timeLimitMs: editor.timeLimitMs === "" ? undefined : Number(editor.timeLimitMs),
        memoryLimitMb: editor.memoryLimitMb === "" ? undefined : Number(editor.memoryLimitMb),
        outputLimitKb: editor.outputLimitKb === "" ? undefined : Number(editor.outputLimitKb),
      };

      // Frontend guardrails: backend validates these strictly.
      const nTime = limits.timeLimitMs;
      if (nTime !== undefined && (!Number.isFinite(nTime) || nTime < 100 || nTime > 60000)) {
        showToast({ type: "error", message: tr("Ліміт часу має бути в діапазоні 100..60000 ms", "Time limit must be in range 100..60000 ms") });
        return;
      }
      const nMem = limits.memoryLimitMb;
      if (nMem !== undefined && (!Number.isFinite(nMem) || nMem < 16 || nMem > 2048)) {
        showToast({ type: "error", message: tr("Пам'ять має бути в діапазоні 16..2048 MB", "Memory must be in range 16..2048 MB") });
        return;
      }
      const nOut = limits.outputLimitKb;
      if (nOut !== undefined && (!Number.isFinite(nOut) || nOut < 4 || nOut > 1024)) {
        showToast({ type: "error", message: tr("Вивід має бути в діапазоні 4..1024 KB", "Output must be in range 4..1024 KB") });
        return;
      }

      if (editor.id == null) {
        await createLibraryTask({
          taskMode: editor.taskMode,
          title: editor.title,
          problemCode: editor.problemCode.trim() || undefined,
          slug: editor.slug.trim() || undefined,
          difficulty: editor.difficulty ? editor.difficulty : undefined,
          tags: tags.length ? tags : undefined,
          section: editor.section.trim() || undefined,
          description: editor.description,
          template: baseTemplate,
          webTemplateFiles,
          webValidationRules,
          webValidationProfile,
          templatesByLanguage,
          allowedLanguages,
          ...limits,
          checkerSpec,
          maxAttempts: editor.maxAttempts,
          theory: editor.theory,
          tests,
        });
      } else {
        await updateLibraryTask(editor.id, {
          taskMode: editor.taskMode,
          title: editor.title,
          problemCode: editor.problemCode.trim() || undefined,
          slug: editor.slug.trim() || undefined,
          difficulty: editor.difficulty ? editor.difficulty : null,
          tags: tags.length ? tags : null,
          section: editor.section.trim() || null,
          description: editor.description,
          template: baseTemplate,
          webTemplateFiles,
          webValidationRules,
          webValidationProfile: webValidationProfile ?? null,
          templatesByLanguage,
          allowedLanguages,
          timeLimitMs: editor.timeLimitMs === "" ? null : Number(editor.timeLimitMs),
          memoryLimitMb: editor.memoryLimitMb === "" ? null : Number(editor.memoryLimitMb),
          outputLimitKb: editor.outputLimitKb === "" ? null : Number(editor.outputLimitKb),
          checkerSpec: checkerSpec ?? null,
          maxAttempts: editor.maxAttempts,
          theory: editor.theory,
          tests,
        });
      }
      setShowEditor(false);
      await reload();
    } catch (e: unknown) {
      console.error("Failed to save library task", e);
      const { message, issues } = getApiMessageAndIssues(e);
      if (message === "INVALID_INPUT" && issues.length > 0) {
        const lines = issues
          .map(formatIssue)
          .slice(0, 20);
        showToast({ type: "error", message: tr("Помилка валідації:\n", "Validation error:\n") + lines.join("\n"), durationMs: 7000 });
      } else {
        showToast({ type: "error", message: message ?? tr("Не вдалося зберегти", "Failed to save") });
      }
    } finally {
      setSaving(false);
    }
  };

  const appendWebRuleFromDraft = () => {
    if (editor.taskMode !== "WEB") return;

    const nextRule: WebTaskRule = {
      type: webRuleDraft.type,
      message: webRuleDraft.message.trim() || undefined,
      points: webRuleDraft.points === "" ? undefined : Number(webRuleDraft.points),
    };

    if (webRuleDraft.type === "required_selector" || webRuleDraft.type === "forbidden_selector") {
      const selector = webRuleDraft.selector.trim();
      if (!selector) {
        showToast({ type: "error", message: tr("Заповни selector для цього правила", "Fill selector for this rule") });
        return;
      }
      nextRule.selector = selector;
    }

    if (webRuleDraft.type === "required_text" || webRuleDraft.type === "forbidden_text") {
      const text = webRuleDraft.text.trim();
      if (!text) {
        showToast({ type: "error", message: tr("Заповни text для цього правила", "Fill text for this rule") });
        return;
      }
      nextRule.text = text;
    }

    if (webRuleDraft.type === "required_script_pattern" || webRuleDraft.type === "forbidden_script_pattern") {
      const pattern = webRuleDraft.pattern.trim();
      if (!pattern) {
        showToast({ type: "error", message: tr("Заповни pattern для цього правила", "Fill pattern for this rule") });
        return;
      }
      nextRule.pattern = pattern;
      nextRule.flags = webRuleDraft.flags.trim() || undefined;
    }

    if (webRuleDraft.type === "required_attribute" || webRuleDraft.type === "forbidden_attribute") {
      const selector = webRuleDraft.selector.trim();
      const attribute = webRuleDraft.attribute.trim();
      if (!selector || !attribute) {
        showToast({ type: "error", message: tr("Заповни selector і attribute", "Fill selector and attribute") });
        return;
      }
      nextRule.selector = selector;
      nextRule.attribute = attribute;
      nextRule.value = webRuleDraft.value.trim() || undefined;
      nextRule.valuePattern = webRuleDraft.valuePattern.trim() || undefined;
    }

    if (webRuleDraft.type === "required_style" || webRuleDraft.type === "forbidden_style") {
      const selector = webRuleDraft.selector.trim();
      const property = webRuleDraft.property.trim();
      if (!selector || !property) {
        showToast({ type: "error", message: tr("Заповни selector і property", "Fill selector and property") });
        return;
      }
      nextRule.selector = selector;
      nextRule.property = property;
      nextRule.value = webRuleDraft.value.trim() || undefined;
      nextRule.valuePattern = webRuleDraft.valuePattern.trim() || undefined;
    }

    const points = nextRule.points;
    if (points !== undefined && (!Number.isFinite(points) || points < 0)) {
      showToast({ type: "error", message: tr("points має бути числом ≥ 0", "points must be a number ≥ 0") });
      return;
    }

    try {
      const current = safeParseWebRulesJson(editor.webRulesJson);
      const merged = [...current, nextRule];
      setEditor((s) => ({ ...s, webRulesJson: JSON.stringify(merged, null, 2) }));
      setWebRuleDraft((prev) => ({ ...defaultWebRuleDraft(), type: prev.type }));
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: tr("Спочатку виправ JSON правил", "Fix rules JSON first") + ": " + getErrorMessage(e, "Unknown error"),
      });
    }
  };

  const formatWebRulesJson = () => {
    try {
      const current = safeParseWebRulesJson(editor.webRulesJson);
      setEditor((s) => ({ ...s, webRulesJson: JSON.stringify(current, null, 2) }));
      showToast({ type: "success", message: tr("JSON правил відформатовано", "Rules JSON formatted") });
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: tr("Некоректний JSON WEB-правил", "Invalid WEB rules JSON") + ": " + getErrorMessage(e, "Unknown error"),
      });
    }
  };

  const deleteWebRuleAtIndex = (index: number) => {
    try {
      const current = safeParseWebRulesJson(editor.webRulesJson);
      if (index < 0 || index >= current.length) return;
      const next = current.filter((_, i) => i !== index);
      setEditor((s) => ({ ...s, webRulesJson: JSON.stringify(next, null, 2) }));
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: tr("Некоректний JSON WEB-правил", "Invalid WEB rules JSON") + ": " + getErrorMessage(e, "Unknown error"),
      });
    }
  };

  const moveWebRule = (fromIndex: number, direction: -1 | 1) => {
    try {
      const current = safeParseWebRulesJson(editor.webRulesJson);
      if (fromIndex < 0 || fromIndex >= current.length) return;
      const toIndex = fromIndex + direction;
      if (toIndex < 0 || toIndex >= current.length) return;

      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      setEditor((s) => ({ ...s, webRulesJson: JSON.stringify(next, null, 2) }));
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: tr("Некоректний JSON WEB-правил", "Invalid WEB rules JSON") + ": " + getErrorMessage(e, "Unknown error"),
      });
    }
  };

  const reorderWebRule = (fromIndex: number, toIndex: number) => {
    try {
      const current = safeParseWebRulesJson(editor.webRulesJson);
      if (fromIndex < 0 || fromIndex >= current.length) return;
      if (toIndex < 0 || toIndex >= current.length) return;
      if (fromIndex === toIndex) return;

      const next = [...current];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      setEditor((s) => ({ ...s, webRulesJson: JSON.stringify(next, null, 2) }));
    } catch (e: unknown) {
      showToast({
        type: "error",
        message: tr("Некоректний JSON WEB-правил", "Invalid WEB rules JSON") + ": " + getErrorMessage(e, "Unknown error"),
      });
    } finally {
      setDraggedWebRuleIndex(null);
      setWebRuleDropTargetIndex(null);
    }
  };

  const loadWebRuleToDraft = (rule: WebTaskRule) => {
    setWebRuleDraft({
      type: rule.type,
      selector: String(rule.selector ?? ""),
      attribute: String(rule.attribute ?? ""),
      value: String(rule.value ?? ""),
      valuePattern: String(rule.valuePattern ?? ""),
      property: String(rule.property ?? ""),
      text: String(rule.text ?? ""),
      pattern: String(rule.pattern ?? ""),
      flags: String(rule.flags ?? ""),
      message: String(rule.message ?? ""),
      points: typeof rule.points === "number" ? rule.points : "",
    });
  };

  const handleSubmit = async (taskId: number) => {
    if (!canManage) return;
    if (!confirm(tr("Відправити на модерацію?", "Submit for moderation?"))) return;
    try {
      await submitLibraryTask(taskId);
      await reload();
      if (selectedId === taskId) {
        const d = await getLibraryTask(taskId);
        setDetails(d);
      }
    } catch (e: unknown) {
      console.error("Failed to submit", e);
      showToast({ type: "error", message: getErrorMessage(e, tr("Не вдалося відправити", "Failed to submit")) });
    }
  };

  const handleDeleteDraft = async (taskId: number) => {
    if (!canManage) return;
    if (!confirm(tr("Видалити чернетку без можливості відновлення?", "Delete this draft permanently?"))) return;
    try {
      await deleteLibraryTask(taskId);
      if (selectedId === taskId) {
        setSelectedId(null);
        setDetails(null);
      }
      await reload();
    } catch (e: unknown) {
      console.error("Failed to delete library task", e);
      showToast({ type: "error", message: getErrorMessage(e, tr("Не вдалося видалити", "Failed to delete")) });
    }
  };

  const toggleDraftSelection = (taskId: number, checked: boolean) => {
    setSelectedDraftIds((prev) => {
      const next = new Set<number>(prev);
      if (checked) next.add(taskId);
      else next.delete(taskId);
      return next;
    });
  };

  const handleBulkSubmitDrafts = async () => {
    if (!canManage || bulkActionPending) return;
    const ids = Array.from(selectedDraftIds);
    if (!ids.length) return;
    if (!confirm(tr(`Відправити ${ids.length} чернеток на модерацію?`, `Submit ${ids.length} drafts for moderation?`))) return;

    setBulkActionPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => submitLibraryTask(id)));
      const successCount = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const failedCount = failed.length;

      if (successCount > 0) {
        await reload();
        showToast({
          type: "success",
          message: tr(
            `Відправлено на модерацію: ${successCount}`,
            `Submitted for moderation: ${successCount}`
          ),
        });
      }

      if (failedCount > 0) {
        const firstError = getErrorMessage(failed[0].reason, tr("Невідома помилка", "Unknown error"));
        showToast({
          type: "error",
          message: tr(
            `Не вдалося відправити: ${failedCount}. ${firstError}`,
            `Failed to submit: ${failedCount}. ${firstError}`
          ),
          durationMs: 7000,
        });
      }
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleBulkDeleteDrafts = async () => {
    if (!canManage || bulkActionPending) return;
    const ids = Array.from(selectedDraftIds);
    if (!ids.length) return;
    if (!confirm(tr(`Видалити ${ids.length} чернеток без можливості відновлення?`, `Delete ${ids.length} drafts permanently?`))) return;

    setBulkActionPending(true);
    try {
      const results = await Promise.allSettled(ids.map((id) => deleteLibraryTask(id)));
      const successIds = results.flatMap((r, idx) => (r.status === "fulfilled" ? [ids[idx]] : []));
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      const successCount = successIds.length;
      const failedCount = failed.length;

      if (successCount > 0) {
        if (selectedId != null && successIds.includes(selectedId)) {
          setSelectedId(null);
          setDetails(null);
        }
        await reload();
        showToast({
          type: "success",
          message: tr(`Видалено чернеток: ${successCount}`, `Deleted drafts: ${successCount}`),
        });
      }

      if (failedCount > 0) {
        const firstError = getErrorMessage(failed[0].reason, tr("Невідома помилка", "Unknown error"));
        showToast({
          type: "error",
          message: tr(
            `Не вдалося видалити: ${failedCount}. ${firstError}`,
            `Failed to delete: ${failedCount}. ${firstError}`
          ),
          durationMs: 7000,
        });
      }
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleImportArchive = async (files: File[]) => {
    if (!canManage) return;
    const list = (files || []).filter(Boolean);
    if (!list.length) return;
    if (importing) return;
    setImporting(true);

    const formatImportFailureEntry = (f: unknown): { code: string; line: string } => {
      const sourceRaw = f && typeof f === "object" ? Reflect.get(f, "source") : undefined;
      const messageRaw = f && typeof f === "object" ? Reflect.get(f, "message") : undefined;
      const errorsRaw = f && typeof f === "object" ? Reflect.get(f, "errors") : undefined;

      const source = String(sourceRaw ?? tr("(невідоме джерело)", "(unknown source)"));
      const code = String(messageRaw ?? "IMPORT_FAILED");
      const errors = Array.isArray(errorsRaw) ? errorsRaw : [];

      if ((code === "INVALID_TASK_JSON" || code === "INVALID_INPUT") && errors.length > 0) {
        const first = formatIssue(errors[0]);
        return { code, line: `${source} — ${code}: ${first}` };
      }
      if (code === "PROBLEM_CODE_TAKEN") {
        return { code, line: `${source} — ${code}: ${tr("вже існує problemCode", "problemCode already exists")}` };
      }
      if (code === "LANGUAGE_DISABLED") {
        return { code, line: `${source} — ${code}: ${tr("містить вимкнені мови", "contains disabled languages")}` };
      }
      return { code, line: `${source} — ${code}` };
    };

    try {
      const result = await importLibraryTaskArchives(list);
      // Refresh list immediately (view might already be "mine", so relying on useEffect isn't enough).
      const res = await listMyLibraryTasks();
      setTasks(res.tasks);
      setView("mine");
      setSelectedId(null);

      const importedCount = Number(result?.importedCount ?? (Array.isArray(result?.tasks) ? result.tasks.length : (result?.task ? 1 : 0)));
      const failedCount = Number(result?.failedCount ?? (Array.isArray(result?.failures) ? result.failures.length : 0));
      if (failedCount > 0) {
        const allEntries = (Array.isArray(result?.failures) ? result.failures : [])
          .map(formatImportFailureEntry);
        const lines = allEntries.map((x) => x.line).slice(0, 12);

        setImportReport({
          importedCount,
          failedCount,
          entries: allEntries,
          status: "partial",
        });
        setImportReportFilter("ALL");

        showToast({
          type: "info",
          message: tr(
            `Імпортовано: ${importedCount}, з помилками: ${failedCount}`,
            `Imported: ${importedCount}, failed: ${failedCount}`
          ),
          durationMs: 6000,
        });

        if (lines.length > 0) {
          showToast({
            type: "error",
            message:
              tr("Деталі помилок імпорту:\n", "Import failure details:\n") +
              lines.join("\n") +
              (failedCount > lines.length ? `\n... (+${failedCount - lines.length})` : ""),
            durationMs: 10000,
          });
        }
      } else {
        setImportReport(null);
        setShowImportReport(false);
        setImportReportFilter("ALL");
        showToast({
          type: "success",
          message: importedCount > 1
            ? tr(`Імпортовано задач: ${importedCount}`, `Imported tasks: ${importedCount}`)
            : tr("Задачу імпортовано", "Task imported"),
        });
      }
    } catch (e: unknown) {
      console.error("Failed to import archive", e);

      const response = e && typeof e === "object" ? Reflect.get(e, "response") : undefined;
      const status = response && typeof response === "object" ? Number(Reflect.get(response, "status") ?? 0) : 0;
      const data = response && typeof response === "object" ? Reflect.get(response, "data") : undefined;
      const failuresRaw = data && typeof data === "object" ? Reflect.get(data, "failures") : undefined;
      const failures = Array.isArray(failuresRaw) ? failuresRaw : [];

      if (status === 413) {
        const maxFileSizeMbRaw = data && typeof data === "object" ? Reflect.get(data, "maxFileSizeMb") : undefined;
        const maxFileSizeMb = Number(maxFileSizeMbRaw);
        showToast({
          type: "error",
          message: Number.isFinite(maxFileSizeMb) && maxFileSizeMb > 0
            ? tr(
                `Архів завеликий. Максимальний розмір файлу: ${maxFileSizeMb} MB.`,
                `Archive is too large. Maximum file size: ${maxFileSizeMb} MB.`
              )
            : tr(
                "Архів завеликий для імпорту. Зменш розмір архіву або розбий на декілька файлів.",
                "Archive is too large to import. Reduce size or split into multiple files."
              ),
          durationMs: 9000,
        });
        return;
      }

      if (failures.length > 0) {
        const allEntries = failures.map(formatImportFailureEntry);
        const lines = allEntries.map((x) => x.line).slice(0, 20);

        setImportReport({
          importedCount: 0,
          failedCount: failures.length,
          entries: allEntries,
          status: "failed",
        });
        setImportReportFilter("ALL");
        setShowImportReport(true);

        showToast({
          type: "error",
          message:
            tr("Імпорт не виконано. Деталі:\n", "Import failed. Details:\n") +
            lines.join("\n") +
            (failures.length > lines.length ? `\n... (+${failures.length - lines.length})` : ""),
          durationMs: 12000,
        });
        return;
      }

      const { message, issues } = getApiMessageAndIssues(e);
      if ((message === "INVALID_TASK_JSON" || message === "INVALID_INPUT") && issues.length > 0) {
        const lines = issues
          .map(formatIssue)
          .slice(0, 30);
        showToast({ type: "error", message: tr("Помилка імпорту:\n", "Import error:\n") + lines.join("\n"), durationMs: 7000 });
      } else {
        showToast({ type: "error", message: message ?? tr("Не вдалося імпортувати", "Failed to import") });
      }
    } finally {
      setImporting(false);
      setImportKey((k: number) => k + 1);
    }
  };

  const getStableSolveKey = (task: LibraryTaskListItem) => {
    const key = (task.problemCode || task.slug || "").trim();
    return key || String(task.id);
  };

  const buildSolvePath = (task: LibraryTaskListItem) => {
    const from = `${location.pathname}${location.search || ""}`;
    return `${solvePathPrefix}/${getStableSolveKey(task)}?from=${encodeURIComponent(from)}`;
  };

  const visibleTasks = useMemo(() => {
    let list: LibraryTaskListItem[] = tasks.slice();

    const qLocal = String(qDraft ?? "").trim().toLowerCase();
    if (view === "mine" && qLocal) {
      list = list.filter((x: LibraryTaskListItem) => {
        const title = String(x.title ?? "").toLowerCase();
        const desc = String(x.description ?? "").toLowerCase();
        const code = String(x.problemCode ?? "").toLowerCase();
        const slug = String(x.slug ?? "").toLowerCase();
        const section = String(x.section ?? "").toLowerCase();
        const tags = Array.isArray(x.tags) ? x.tags.join(" ").toLowerCase() : "";
        return title.includes(qLocal) || desc.includes(qLocal) || code.includes(qLocal) || slug.includes(qLocal) || section.includes(qLocal) || tags.includes(qLocal);
      });
    }

    if (view === "mine" && mineStatus !== "ALL") {
      list = list.filter((x: LibraryTaskListItem) => x.status === mineStatus);
    }

    if (onlySolved) {
      list = list.filter((x: LibraryTaskListItem) => !!x.attempt?.solved);
    }

    if (onlyFavorites) {
      list = list.filter((x: LibraryTaskListItem) => favoriteIds.has(x.id));
    }

    // Sorting is client-side and applies to the currently loaded set (and current page for approved).
    if (sort === "TITLE_ASC") {
      list.sort((a: LibraryTaskListItem, b: LibraryTaskListItem) => String(a.title ?? "").localeCompare(String(b.title ?? "")));
    } else if (sort === "DIFFICULTY_ASC") {
      const rank = (d?: LibraryTaskDifficulty | null) => (d === "EASY" ? 1 : d === "MEDIUM" ? 2 : d === "HARD" ? 3 : 99);
      list.sort((a: LibraryTaskListItem, b: LibraryTaskListItem) => {
        const ra = rank(a.difficulty ?? null);
        const rb = rank(b.difficulty ?? null);
        if (ra !== rb) return ra - rb;
        return String(a.title ?? "").localeCompare(String(b.title ?? ""));
      });
    } else {
      list.sort((a: LibraryTaskListItem, b: LibraryTaskListItem) => {
        const da = new Date(a.updatedAt).getTime();
        const db = new Date(b.updatedAt).getTime();
        return (Number.isFinite(db) ? db : 0) - (Number.isFinite(da) ? da : 0);
      });
    }

    return list;
  }, [tasks, view, qDraft, mineStatus, onlySolved, onlyFavorites, favoriteIds, sort]);

  const solvedCount = useMemo(() => visibleTasks.filter((x: LibraryTaskListItem) => !!x.attempt?.solved).length, [visibleTasks]);
  const favoritesCount = useMemo(() => visibleTasks.filter((x: LibraryTaskListItem) => favoriteIds.has(x.id)).length, [visibleTasks, favoriteIds]);
  const totalPages = useMemo(() => {
    if (typeof total !== "number") return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const importReportCodes = useMemo(() => {
    if (!importReport) return [] as string[];
    const uniq = new Set<string>();
    for (const entry of importReport.entries) {
      const code = String(entry.code || "").trim();
      if (code) uniq.add(code);
    }
    return Array.from(uniq).sort((a, b) => a.localeCompare(b));
  }, [importReport]);

  const filteredImportReportEntries = useMemo(() => {
    if (!importReport) return [] as Array<{ code: string; line: string }>;
    if (importReportFilter === "ALL") return importReport.entries;
    return importReport.entries.filter((entry) => entry.code === importReportFilter);
  }, [importReport, importReportFilter]);

  const visibleDraftTasks = useMemo(
    () => (view === "mine" ? visibleTasks.filter((task) => task.status === "DRAFT") : []),
    [view, visibleTasks]
  );

  const selectedVisibleDraftCount = useMemo(
    () => visibleDraftTasks.filter((task) => selectedDraftIds.has(task.id)).length,
    [visibleDraftTasks, selectedDraftIds]
  );

  const allVisibleDraftsSelected = visibleDraftTasks.length > 0 && selectedVisibleDraftCount === visibleDraftTasks.length;

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <motion.div variants={staggerContainer} initial="initial" animate="animate">
          <motion.div variants={fadeUpItem}>
            <Button variant="ghost" onClick={leaveLibrary} className="-ml-2 mb-3">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
          </motion.div>

          <motion.div variants={fadeUpItem} className="flex items-center gap-2 font-mono text-xs text-primary/70">
            <Library className="w-3.5 h-3.5" />
            <span>// library</span>
          </motion.div>
          <motion.h1 variants={fadeUpItem} className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight text-text-primary">
            {tr("Бібліотека завдань", "Task library")}
          </motion.h1>
          <motion.p variants={fadeUpItem} className="mt-1.5 text-sm text-text-secondary max-w-2xl">
            {tr(
              "Каталог завдань (із модерацією) + ваші чернетки та відправлені на перевірку.",
              "Task catalog (moderated) + your drafts and submissions."
            )}
          </motion.p>

          <motion.div variants={fadeUpItem} className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Показано", "Shown")}</div>
              <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={visibleTasks.length} /></div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Виконано", "Solved")}</div>
              <div className={`mt-1 text-3xl font-mono font-semibold ${solvedCount ? "text-accent-success" : "text-text-primary"}`}><CountUp value={solvedCount} /></div>
            </div>
            <div>
              <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Обрані", "Favorites")}</div>
              <div className={`mt-1 text-3xl font-mono font-semibold ${favoritesCount ? "text-accent-warn" : "text-text-primary"}`}><CountUp value={favoritesCount} /></div>
            </div>
            {typeof total === "number" && view === "approved" ? (
              <div>
                <div className="text-[11px] font-mono uppercase tracking-[0.08em] text-text-muted">{tr("Всього", "Total")}</div>
                <div className="mt-1 text-3xl font-mono font-semibold text-text-primary"><CountUp value={total} /></div>
              </div>
            ) : null}
          </motion.div>

          <motion.div variants={fadeUpItem} className="mt-5 inline-flex items-center gap-1 rounded-xl border border-border bg-bg-surface p-1">
            <button
              type="button"
              onClick={() => setView("approved")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-fast ${view === "approved" ? "bg-primary/15 text-primary" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
            >
              {tr("Каталог", "Catalog")}
            </button>
            {canManage ? (
              <button
                type="button"
                onClick={() => setView("mine")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono transition-fast ${view === "mine" ? "bg-primary/15 text-primary" : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"}`}
              >
                {tr("Мої", "Mine")}
              </button>
            ) : null}
          </motion.div>
        </motion.div>

        <div className="h-px bg-gradient-to-r from-primary/40 via-border to-transparent" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Filters */}
          <div className="lg:col-span-3 lg:sticky lg:top-4 lg:self-start rounded-xl border border-border bg-bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted flex items-center gap-2 leading-none">
                {tr("Фільтри", "Filters")}
                <button
                  type="button"
                  className="md:hidden inline-flex items-center gap-1 text-xs font-mono text-text-secondary hover:text-text-primary"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                >
                  {filtersOpen ? (
                    <>
                      {tr("згорнути", "collapse")} <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      {tr("показати", "show")} <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOnlySolved(false);
                  setOnlyFavorites(false);
                  setMineStatus("ALL");
                  setSort("UPDATED_DESC");
                  setJudgeLang("ALL");
                  setQDraft("");
                  setQ("");
                  if (view === "approved") setPage(1);
                }}
                title={tr("Скинути", "Reset")}
              >
                <RotateCcwIcon />
              </Button>
            </div>

            <div className={(filtersOpen ? "block" : "hidden") + " md:block space-y-3"}>
              <div>
                <div className="text-xs font-mono text-text-secondary mb-2">{tr("Пошук", "Search")}</div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                  <input
                    value={qDraft}
                    onChange={(e) => setQDraft(e.target.value)}
                    className="w-full pl-10 pr-10 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder={tr("Назва, код, теги...", "Title, code, tags...")}
                  />
                  {qDraft.trim() ? (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-text-primary"
                      onClick={() => setQDraft("")}
                      aria-label={tr("Очистити пошук", "Clear search")}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
                {view === "approved" ? (
                  <div className="mt-2 text-[11px] text-text-secondary opacity-80">
                    {tr("Пошук у каталозі виконується із затримкою ~300мс.", "Catalog search is debounced (~300ms).")}
                  </div>
                ) : null}
              </div>

              {view === "approved" ? (
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-2">{tr("Мова розв'язку", "Solution language")}</div>
                  <select
                    value={judgeLang}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === "ALL") {
                        setJudgeLang("ALL");
                        return;
                      }
                      const parsed = parseJudgeLanguage(next);
                      if (parsed) setJudgeLang(parsed);
                    }}
                    className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                  >
                    <option value="ALL">{tr("Усі мови", "All languages")}</option>
                    {ALL_JUDGE_LANGS.map((l) => (
                      <option key={l} value={l}>
                        {FRIENDLY_JUDGE_LANG[l]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {view === "mine" ? (
                <div>
                  <div className="text-xs font-mono text-text-secondary mb-2">{tr("Статус", "Status")}</div>
                  <select
                    value={mineStatus}
                    onChange={(e) => {
                      const parsed = parseMineStatus(e.target.value);
                      if (parsed) setMineStatus(parsed);
                    }}
                    className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                  >
                    <option value="ALL">{tr("Усі", "All")}</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                  </select>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs font-mono text-text-secondary select-none">
                  <input type="checkbox" checked={onlySolved} onChange={(e) => setOnlySolved(e.target.checked)} />
                  {tr("Лише виконані", "Solved only")}
                </label>
                <label className="flex items-center gap-2 text-xs font-mono text-text-secondary select-none">
                  <input type="checkbox" checked={onlyFavorites} onChange={(e) => setOnlyFavorites(e.target.checked)} />
                  {tr("Лише обрані", "Favorites only")}
                </label>
              </div>

              <div>
                <div className="text-xs font-mono text-text-secondary mb-2">{tr("Сортування", "Sort")}</div>
                <select
                  value={sort}
                  onChange={(e) => {
                    const parsed = parseSort(e.target.value);
                    if (parsed) setSort(parsed);
                  }}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                >
                  <option value="UPDATED_DESC">{tr("Оновлено (спочатку нові)", "Updated (newest first)")}</option>
                  <option value="TITLE_ASC">{tr("Назва (A→Z)", "Title (A→Z)")}</option>
                  <option value="DIFFICULTY_ASC">{tr("Складність (легка→складна)", "Difficulty (easy→hard)")}</option>
                </select>
                {view === "approved" ? (
                  <div className="mt-2 text-[11px] text-text-secondary opacity-80">
                    {tr("Сортування застосовується до поточної сторінки.", "Sorting applies to the current page.")}
                  </div>
                ) : null}
              </div>

              {view === "mine" && canManage ? (
                <div className="pt-2 border-t border-border">
                  <div className="text-xs font-mono text-text-secondary mb-2">{tr("Дії", "Actions")}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      key={importKey}
                      id="library-import"
                      type="file"
                      accept=".zip"
                      multiple
                      className="hidden"
                      onChange={(e) => handleImportArchive(Array.from(e.target.files || []))}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (document.getElementById("library-import") as HTMLInputElement | null)?.click()}
                      disabled={importing}
                      title={tr("Імпортувати архів(и) (.zip)", "Import archive(s) (.zip)")}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {tr("Імпорт", "Import")}
                    </Button>
                    {importReport && importReport.failedCount > 0 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowImportReport(true)}
                        title={tr("Показати останній звіт імпорту", "Show latest import report")}
                      >
                        {tr("Звіт імпорту", "Import report")}
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={openCreate} title={tr("Нове завдання", "New task")} aria-label={tr("Створити нове завдання", "Create new task")}>
                      <Plus className="w-4 h-4 mr-2" />
                      {tr("Створити", "Create")}
                    </Button>

                    <div className="w-full h-px bg-border my-1" />

                    <label className="flex items-center gap-2 text-xs font-mono text-text-secondary select-none">
                      <input
                        type="checkbox"
                        checked={allVisibleDraftsSelected}
                        disabled={bulkActionPending || visibleDraftTasks.length === 0}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setSelectedDraftIds((prev) => {
                            const next = new Set<number>(prev);
                            for (const task of visibleDraftTasks) {
                              if (checked) next.add(task.id);
                              else next.delete(task.id);
                            }
                            return next;
                          });
                        }}
                      />
                      {tr(
                        `Чернетки на сторінці: ${selectedVisibleDraftCount}/${visibleDraftTasks.length}`,
                        `Drafts on page: ${selectedVisibleDraftCount}/${visibleDraftTasks.length}`
                      )}
                    </label>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulkActionPending || selectedDraftIds.size === 0}
                      onClick={handleBulkSubmitDrafts}
                      aria-label={tr("Відправити вибрані чернетки на модерацію", "Submit selected drafts for moderation")}
                      title={tr("Відправити вибрані чернетки на модерацію", "Submit selected drafts for moderation")}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      {tr("Вибрані → модерація", "Selected → moderation")}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={bulkActionPending || selectedDraftIds.size === 0}
                      onClick={handleBulkDeleteDrafts}
                      aria-label={tr("Видалити вибрані чернетки", "Delete selected drafts")}
                      title={tr("Видалити вибрані чернетки", "Delete selected drafts")}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {tr("Видалити вибрані", "Delete selected")}
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="pt-2 border-t border-border">
                <div className="text-xs font-mono text-text-secondary mb-2">{tr("Швидкий перехід", "Quick navigation")}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => listSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    title={tr("До списку задач", "Jump to task list")}
                  >
                    {tr("Список", "List")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => previewSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    title={tr("До перегляду задачі", "Jump to task preview")}
                  >
                    {tr("Перегляд", "Preview")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOnlySolved(false);
                      setOnlyFavorites(true);
                      if (view === "approved") setPage(1);
                    }}
                    title={tr("Показати лише обрані", "Show favorites only")}
                  >
                    {tr("Обрані", "Favorites")}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          <div ref={listSectionRef} className="lg:col-span-5">
          <div className="rounded-xl border border-border bg-bg-surface p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm font-mono uppercase tracking-[0.08em] text-text-muted">
                {view === "mine" ? tr("Мої завдання", "My tasks") : tr("Каталог", "Catalog")}
              </div>

              {view === "approved" && typeof total === "number" ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {tr("Назад", "Prev")}
                  </Button>
                  <div className="text-xs font-mono text-text-secondary">
                    {page} / {totalPages}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}
                  >
                    {tr("Далі", "Next")}
                  </Button>
                </div>
              ) : null}
            </div>

            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-[78px] rounded-lg" />
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-base px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div className="text-sm font-medium text-text-primary">{tr("Нічого не знайдено", "No results")}</div>
                <div className="text-xs text-text-secondary mt-1">
                  {tr("Спробуй змінити фільтри або пошук.", "Try adjusting filters or search.")}
                </div>
              </div>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
                className={isAurora ? "rounded-[var(--aurora-radius)] border border-border bg-bg-surface/40 overflow-hidden divide-y divide-border" : "space-y-2"}
              >
                {visibleTasks.map((task) => {
                  const isSelected = selectedId === task.id;
                  const isFav = favoriteIds.has(task.id);
                  const diff = (task.difficulty ?? null) as LibraryTaskDifficulty | null;
                  const diffMeta = diff ? FRIENDLY_DIFFICULTY[diff] : null;

                  const testsPassed = task.attempt?.lastTestsPassed;
                  const testsTotal = task.attempt?.lastTestsTotal;
                  const progress = typeof testsPassed === "number" && typeof testsTotal === "number" && testsTotal > 0
                    ? clamp(testsPassed / testsTotal, 0, 1)
                    : null;

                  return (
                    <motion.div
                      key={task.id}
                      variants={fadeUpItem}
                      role="button"
                      tabIndex={0}
                      aria-current={isSelected ? "true" : undefined}
                      className={
                        isAurora
                          ? ("w-full text-left p-4 transition-fast focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 " +
                              (isSelected ? "bg-primary/8" : "hover:bg-bg-hover") +
                              (task.attempt?.solved ? " shadow-[inset_3px_0_0_0_var(--accent-success)]" : isSelected ? " shadow-[inset_3px_0_0_0_var(--primary)]" : ""))
                          : ("w-full text-left p-3 rounded-xl border transition-fast focus:outline-none focus:ring-1 focus:ring-primary hover:-translate-y-0.5 hover:shadow-[0_12px_32px_-16px_rgba(0,0,0,0.5)] " +
                              (isSelected
                                ? "border-primary bg-primary/5"
                                : task.attempt?.solved
                                  ? "border-accent-success/40 bg-bg-base hover:border-accent-success/60"
                                  : "border-border bg-bg-base hover:border-primary/40"))
                      }
                      onClick={() => setSelectedId(task.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(task.id);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                {view === "mine" && canManage && task.status === "DRAFT" ? (
                                  <input
                                    type="checkbox"
                                    checked={selectedDraftIds.has(task.id)}
                                    disabled={bulkActionPending}
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => toggleDraftSelection(task.id, e.target.checked)}
                                    aria-label={tr("Вибрати чернетку", "Select draft")}
                                  />
                                ) : null}
                                <div className="text-sm font-mono text-text-primary truncate">{task.title}</div>
                                {task.attempt?.solved ? <Badge color="success">{tr("OK", "OK")}</Badge> : null}
                                {view === "mine" && canManage ? (
                                  <Badge
                                    color={task.status === "APPROVED" ? "success" : task.status === "REJECTED" ? "error" : task.status === "PENDING" ? "warn" : "info"}
                                  >
                                    {statusLabel(task.status)}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-secondary">
                                <span className="font-mono opacity-90">#{task.id}</span>
                                {(task.problemCode || task.slug) ? (
                                  <span className="px-2 py-0.5 border border-border rounded">
                                    {task.problemCode || task.slug}
                                  </span>
                                ) : null}
                                {diffMeta ? (
                                  <Badge color={diffMeta.color}>{tr(diffMeta.uk, diffMeta.en)}</Badge>
                                ) : null}
                                {task.section ? (
                                  <span className="px-2 py-0.5 border border-border rounded" title={tr("Розділ", "Section")}>
                                    {task.section}
                                  </span>
                                ) : null}
                                <span className="opacity-80">{tr("Оновлено", "Updated")}: {formatShortDate(task.updatedAt, i18n.language || "uk")}</span>
                                {task.quality ? (
                                  <span
                                    className="px-2 py-0.5 border border-border rounded"
                                    title={tr("Якість за історією розв'язань у бібліотеці", "Quality from historical solves in the library")}
                                  >
                                    {tr("Якість", "Quality")}: {task.quality.score}
                                  </span>
                                ) : null}
                              </div>

                              {Array.isArray(task.tags) && task.tags.length ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {task.tags.slice(0, 4).map((tag) => (
                                    <span key={tag} className="text-[10px] px-2 py-0.5 rounded border border-border text-text-secondary">
                                      #{tag}
                                    </span>
                                  ))}
                                  {task.tags.length > 4 ? (
                                    <span className="text-[10px] px-2 py-0.5 rounded border border-border text-text-secondary">+{task.tags.length - 4}</span>
                                  ) : null}
                                </div>
                              ) : null}

                              {view === "mine" && canManage && task.status === "REJECTED" && task.rejectionReason ? (
                                <div className="mt-2 text-xs text-accent-warning">
                                  {tr("Причина:", "Reason:")} {task.rejectionReason}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(task.id);
                              }}
                              title={isFav ? tr("Прибрати з обраного", "Remove from favorites") : tr("Додати в обране", "Add to favorites")}
                              aria-pressed={isFav}
                              aria-label={isFav ? tr("Прибрати з обраного", "Remove from favorites") : tr("Додати в обране", "Add to favorites")}
                            >
                              <Star className={"w-4 h-4 " + (isFav ? "text-accent-warn" : "text-text-secondary")} fill={isFav ? "currentColor" : "none"} />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(task.id);
                              }}
                              title={tr("Експортувати архів", "Export archive")}
                              aria-label={tr("Експортувати архів", "Export archive")}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>

                          {progress != null ? (
                            <div className="w-[120px]">
                              <div className="h-1.5 w-full bg-bg-base border border-border rounded overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
                              </div>
                              <div className="mt-1 text-[10px] font-mono text-text-secondary text-right">
                                {testsPassed}/{testsTotal}
                              </div>
                            </div>
                          ) : task.attempt?.submissionsCount ? (
                            <div className="text-[10px] font-mono text-text-secondary">
                              {tr("Спроб", "Submissions")}: {task.attempt.submissionsCount}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {view === "mine" ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(task.status === "DRAFT" || task.status === "REJECTED") && canManage ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit(task.id);
                              }}
                            >
                              <Edit2 className="w-3 h-3 mr-2" />
                              {tr("Редагувати", "Edit")}
                            </Button>
                          ) : null}
                          {(task.status === "DRAFT" || task.status === "REJECTED") && canManage ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSubmit(task.id);
                              }}
                            >
                              <Send className="w-3 h-3 mr-2" />
                              {tr("На модерацію", "Submit")}
                            </Button>
                          ) : null}
                          {task.status === "DRAFT" && canManage ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDraft(task.id);
                              }}
                              title={tr("Видалити чернетку", "Delete draft")}
                            >
                              <Trash2 className="w-3 h-3 mr-2" />
                              {tr("Видалити", "Delete")}
                            </Button>
                          ) : null}
                          {task.status === "APPROVED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(buildSolvePath(task));
                              }}
                            >
                              <Play className="w-3 h-3 mr-2" />
                              {tr("Відкрити", "Open")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
          </div>

          {/* Preview */}
          <div ref={previewSectionRef} className="lg:col-span-4">
          <div className="rounded-xl border border-border bg-bg-surface p-4 lg:sticky lg:top-4 lg:self-start">
            {!selectedId ? (
              <div className="rounded-xl border border-dashed border-border bg-bg-base px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <Play className="w-5 h-5 text-primary" />
                </div>
                <div className="text-sm font-medium text-text-primary">{tr("Вибери задачу", "Pick a task")}</div>
                <div className="text-xs text-text-secondary mt-1">
                  {tr("Праворуч з'явиться швидкий перегляд умови, теорії та тестів.", "You’ll get a quick preview of statement, theory and tests.")}
                </div>
              </div>
            ) : loadingDetails ? (
              <div className="space-y-2">
                <Skeleton className="h-7 rounded" />
                <Skeleton className="h-4 rounded" />
                <Skeleton className="h-4 rounded" />
                <Skeleton className="h-[180px] rounded" />
              </div>
            ) : !details ? (
              <div className="text-text-secondary text-sm">{tr("Не вдалося завантажити", "Failed to load")}</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-mono text-text-primary truncate">{details.task.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                      <span className="font-mono">#{details.task.id}</span>
                      {(details.task.problemCode || details.task.slug) ? (
                        <span className="px-2 py-0.5 border border-border rounded">
                          {details.task.problemCode || details.task.slug}
                        </span>
                      ) : null}
                      {details.task.difficulty ? (
                        <Badge color={FRIENDLY_DIFFICULTY[details.task.difficulty].color}>
                          {tr(FRIENDLY_DIFFICULTY[details.task.difficulty].uk, FRIENDLY_DIFFICULTY[details.task.difficulty].en)}
                        </Badge>
                      ) : null}
                      {view === "mine" && canManage ? (
                        <Badge
                          color={details.task.status === "APPROVED" ? "success" : details.task.status === "REJECTED" ? "error" : details.task.status === "PENDING" ? "warn" : "info"}
                        >
                          {statusLabel(details.task.status)}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-2 text-[11px] text-text-secondary">
                      {tr("Мови:", "Languages:")} {getAllowedJudgeLanguages(details.task).map((l) => FRIENDLY_JUDGE_LANG[l]).join(", ")}
                      <span className="mx-2">·</span>
                      {tr("Спроб:", "Attempts:")} {details.task.maxAttempts}
                      {details.task.quality ? (
                        <>
                          <span className="mx-2">·</span>
                          {tr("Якість:", "Quality:")} {details.task.quality.score}
                        </>
                      ) : null}
                    </div>
                    {view === "mine" && canManage && details.task.status === "REJECTED" && details.task.rejectionReason ? (
                      <div className="mt-2 text-sm text-accent-warning">
                        {tr("Причина:", "Reason:")} {details.task.rejectionReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {details.task.status === "APPROVED" ? (
                      <Button variant="primary" size="sm" onClick={() => navigate(buildSolvePath(details.task))}>
                        <Play className="w-4 h-4 mr-2" />
                        {tr("Розв'язати", "Solve")}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(details.task.id)}>
                      <Download className="w-4 h-4 mr-2" />
                      {tr("Архів", "Archive")}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <Button
                    variant={detailsTab === "description" ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setDetailsTab("description")}
                  >
                    {tr("Умова", "Statement")}
                  </Button>
                  <Button
                    variant={detailsTab === "theory" ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setDetailsTab("theory")}
                  >
                    {tr("Теорія", "Theory")}
                  </Button>
                  <Button
                    variant={detailsTab === "tests" ? "primary" : "ghost"}
                    size="sm"
                    onClick={() => setDetailsTab("tests")}
                  >
                    {tr("Тести", "Tests")} ({details.tests.length})
                  </Button>
                </div>

                {detailsTab === "description" ? (
                  <div>
                    <MarkdownView content={details.task.description || ""} />
                  </div>
                ) : null}

                {detailsTab === "theory" ? (
                  <div>
                    {details.theory ? (
                      <MarkdownView content={details.theory} />
                    ) : (
                      <div className="text-sm text-text-secondary">{tr("(немає)", "(none)")}</div>
                    )}
                  </div>
                ) : null}

                {detailsTab === "tests" ? (
                  <div>
                    {details.tests.length === 0 ? (
                      <div className="text-sm text-text-secondary">{tr("(немає)", "(none)")}</div>
                    ) : (
                      <div className="space-y-2">
                        {details.tests.slice(0, 12).map((test) => {
                          const hiddenForCatalog = test.isHidden && view === "approved";
                          return (
                            <div key={test.id} className="p-3 border border-border rounded-lg bg-bg-base">
                              <div className="text-xs text-text-secondary flex gap-2 mb-2">
                                {test.isHidden ? <Badge color="warn">{tr("прихований", "hidden")}</Badge> : <Badge color="info">{tr("публічний", "public")}</Badge>}
                                <span>{tr("бали", "points")}: {test.points}</span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                  <div className="text-xs font-mono text-text-primary mb-1">{tr("Ввід", "Input")}</div>
                                  <pre className="text-xs bg-bg-surface border border-border p-2 rounded overflow-auto">
                                    {hiddenForCatalog ? tr("(приховано)", "(hidden)") : test.input || ""}
                                  </pre>
                                </div>
                                <div>
                                  <div className="text-xs font-mono text-text-primary mb-1">{tr("Очікувано", "Expected")}</div>
                                  <pre className="text-xs bg-bg-surface border border-border p-2 rounded overflow-auto">
                                    {hiddenForCatalog ? tr("(приховано)", "(hidden)") : test.expectedOutput || ""}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        {details.tests.length > 12 ? (
                          <div className="text-xs text-text-secondary opacity-80">
                            {tr("Показано перші 12 тестів", "Showing first 12 tests")}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      {showEditor ? (
        <Modal
          open={showEditor}
          onClose={() => {
            if (!saving) setShowEditor(false);
          }}
          title={editor.id == null ? tr("Нове завдання", "New task") : tr("Редагування", "Edit")}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Код задачі (problemCode)", "Problem code (problemCode)")}</label>
                <input
                  value={editor.problemCode}
                  onChange={(e) => setEditor((s) => ({ ...s, problemCode: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="LIB123"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Slug", "Slug")}</label>
                <input
                  value={editor.slug}
                  onChange={(e) => setEditor((s) => ({ ...s, slug: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="two-sum"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Назва", "Title")} *</label>
                <input
                  value={editor.title}
                  onChange={(e) => setEditor((s) => ({ ...s, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Режим задачі", "Task mode")}</label>
                <select
                  value={editor.taskMode}
                  onChange={(e) => {
                    const mode = e.target.value === "WEB" ? "WEB" : "CODE";
                    setEditor((s) => ({ ...s, taskMode: mode }));
                  }}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                >
                  <option value="CODE">CODE</option>
                  <option value="WEB">WEB</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Складність", "Difficulty")}</label>
                <select
                  value={editor.difficulty}
                  onChange={(e) => {
                    const parsed = parseDifficulty(e.target.value);
                    if (parsed !== null) {
                      setEditor((s) => ({ ...s, difficulty: parsed }));
                    }
                  }}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                >
                  <option value="">{tr("(не задано)", "(not set)")}</option>
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
                {editor.id && Number(editor.id) > 0 ? (
                  <button
                    type="button"
                    className="mt-2 text-[10px] font-mono px-2 py-1 border border-border rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover"
                    title={tr("Порекомендувати складність зі статистики розв'язань", "Recommend difficulty from solve statistics")}
                    onClick={async () => {
                      try {
                        const s = await getDifficultySuggestion(Number(editor.id));
                        setDiffSuggestion({ recommended: s.recommended, confidence: s.confidence, rationale: s.rationale });
                        setEditor((st) => ({ ...st, difficulty: s.recommended }));
                      } catch {
                        /* ignore — suggestion is best-effort */
                      }
                    }}
                  >
                    {tr("💡 Підказати з даних", "💡 Suggest from data")}
                  </button>
                ) : null}
                {diffSuggestion ? (
                  <div className="mt-1 text-[10px] font-mono text-text-secondary">
                    {tr("Рекомендовано", "Recommended")}: <span className="text-primary">{diffSuggestion.recommended}</span> · {tr("впевненість", "confidence")} {(diffSuggestion.confidence * 100).toFixed(0)}%
                  </div>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Розділ", "Section")}</label>
                <input
                  value={editor.section}
                  onChange={(e) => setEditor((s) => ({ ...s, section: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder={tr("наприклад: Вступ", "e.g. Intro")}
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Теги (через кому)", "Tags (comma-separated)")}</label>
                <input
                  value={editor.tagsCsv}
                  onChange={(e) => setEditor((s) => ({ ...s, tagsCsv: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="math, strings"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Дозволені мови (allowedLanguages)", "Allowed languages (allowedLanguages)")}
              </label>
              <div className="flex items-center gap-2 mb-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => setEditor((s) => ({ ...s, allowedLanguages: ALL_JUDGE_LANGS }))}
                >
                  {tr("Вибрати всі", "Select all")}
                </Button>
              </div>
              <div className="flex flex-wrap gap-3">
                {ALL_JUDGE_LANGS.map((l) => {
                  const checked = editor.allowedLanguages.includes(l);
                  return (
                    <label key={l} className="flex items-center gap-2 text-sm font-mono text-text-secondary select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setEditor((s) => {
                            const cur = new Set(s.allowedLanguages);
                            if (on) cur.add(l);
                            else cur.delete(l);
                            const next = Array.from(cur) as JudgeLanguage[];
                            return { ...s, allowedLanguages: next.length ? next : s.allowedLanguages };
                          });
                        }}
                      />
                      {l}
                    </label>
                  );
                })}
              </div>
              <div className="text-xs text-text-secondary mt-2 opacity-80">
                {tr(
                  "Якщо поле не задане (старі задачі) — дозволені всі мови. Тут можна обмежити список при потребі.",
                  "If not set (older tasks), all languages are allowed. You can restrict the list here if needed."
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Ліміт часу (ms)", "Time limit (ms)")}</label>
                <input
                  type="number"
                  min={100}
                  max={60000}
                  value={editor.timeLimitMs}
                  onChange={(e) => setEditor((s) => ({ ...s, timeLimitMs: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="1200"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Пам'ять (MB)", "Memory (MB)")}</label>
                <input
                  type="number"
                  min={16}
                  max={2048}
                  value={editor.memoryLimitMb}
                  onChange={(e) => setEditor((s) => ({ ...s, memoryLimitMb: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="256"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Вивід (KB)", "Output (KB)")}</label>
                <input
                  type="number"
                  min={4}
                  max={1024}
                  value={editor.outputLimitKb}
                  onChange={(e) => setEditor((s) => ({ ...s, outputLimitKb: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  placeholder="64"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Чекер", "Checker")}</label>
                <select
                  value={editor.checkerType}
                  onChange={(e) => {
                    const parsed = parseCheckerType(e.target.value);
                    if (parsed !== null) {
                      setEditor((s) => ({ ...s, checkerType: parsed }));
                    }
                  }}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                >
                  <option value="">{tr("(авто)", "(auto)")}</option>
                  <option value="whitespace">whitespace</option>
                  <option value="exact">exact</option>
                  <option value="float">float</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">epsilon (float)</label>
                <input
                  type="number"
                  step="0.000001"
                  min={0}
                  value={editor.checkerEpsilon}
                  onChange={(e) => setEditor((s) => ({ ...s, checkerEpsilon: e.target.value === "" ? "" : Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                  disabled={editor.checkerType !== "float"}
                  placeholder="0.000001"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Спроби", "Max attempts")}</label>
              <input
                type="number"
                min={1}
                max={100}
                value={editor.maxAttempts}
                onChange={(e) => setEditor((s) => ({ ...s, maxAttempts: Math.max(1, Math.floor(Number(e.target.value) || 1)) }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Умова", "Description")} *
                <MarkdownImageInsertButton
                  value={editor.description}
                  onChange={value => setEditor((s) => ({ ...s, description: value }))}
                  textareaRef={editorDescriptionRef}
                  className="ml-2 text-xs"
                />
              </label>
              <textarea
                ref={editorDescriptionRef}
                value={editor.description}
                onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
              />
            </div>

            {editor.taskMode === "CODE" ? (
            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Шаблон коду", "Code template")} *</label>
              <div className="flex items-center gap-2 mb-2">
                <select
                  value={editor.templateLang}
                  onChange={(e) => {
                    const parsed = parseJudgeLanguage(e.target.value);
                    if (!parsed) return;
                    const nextLang = parsed;
                    setEditor((s) => {
                      const cur = s.templatesByLanguage?.[nextLang];
                      const next = typeof cur === "string" && cur.trim() ? cur : (s.template || "");
                      return {
                        ...s,
                        templateLang: nextLang,
                        templatesByLanguage: { ...(s.templatesByLanguage || {}), [nextLang]: next },
                      };
                    });
                  }}
                  className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                  title={tr("Мова шаблону", "Template language")}
                >
                  {(Array.isArray(editor.allowedLanguages) && editor.allowedLanguages.length ? editor.allowedLanguages : ALL_JUDGE_LANGS).map((l) => (
                    <option key={l} value={l}>
                      {FRIENDLY_JUDGE_LANG[l] || l}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const allowed = (Array.isArray(editor.allowedLanguages) && editor.allowedLanguages.length ? editor.allowedLanguages : ALL_JUDGE_LANGS) as JudgeLanguage[];
                    const cur = String(editor.templatesByLanguage?.[editor.templateLang] ?? editor.template ?? "");
                    setEditor((s) => {
                      const next: Partial<Record<JudgeLanguage, string>> = { ...(s.templatesByLanguage || {}) };
                      for (const l of allowed) next[l] = cur;
                      return { ...s, templatesByLanguage: next, template: cur };
                    });
                  }}
                  title={tr("Скопіювати поточний шаблон на всі мови", "Copy current template to all languages")}
                >
                  {tr("На всі", "To all")}
                </Button>
              </div>
              <textarea
                value={String(editor.templatesByLanguage?.[editor.templateLang] ?? editor.template ?? "")}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditor((s) => ({
                    ...s,
                    template: v,
                    templatesByLanguage: { ...(s.templatesByLanguage || {}), [s.templateLang]: v },
                  }));
                }}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[140px]"
              />
            </div>
            ) : (
            <>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">index.html *</label>
                <textarea
                  value={editor.webIndexHtml}
                  onChange={(e) => setEditor((s) => ({ ...s, webIndexHtml: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[140px]"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">styles.css</label>
                <textarea
                  value={editor.webStylesCss}
                  onChange={(e) => setEditor((s) => ({ ...s, webStylesCss: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">script.js</label>
                <textarea
                  value={editor.webScriptJs}
                  onChange={(e) => setEditor((s) => ({ ...s, webScriptJs: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
                />
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("Профіль WEB-обмежень", "WEB constraint profile")}
                </label>
                <select
                  value={editor.webValidationProfileId}
                  onChange={(e) => setEditor((s) => ({ ...s, webValidationProfileId: e.target.value as WebTaskProfileId }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                >
                  {WEB_PROFILE_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.hint}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">
                  {tr("WEB правила JSON (опційно)", "WEB rules JSON (optional)")}
                </label>
                <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <select
                    value={webRuleDraft.type}
                    onChange={(e) => setWebRuleDraft((s) => ({ ...s, type: e.target.value as WebRuleDraft["type"] }))}
                    className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                  >
                    <option value="required_selector">required_selector</option>
                    <option value="forbidden_selector">forbidden_selector</option>
                    <option value="required_text">required_text</option>
                    <option value="forbidden_text">forbidden_text</option>
                    <option value="required_script_pattern">required_script_pattern</option>
                    <option value="forbidden_script_pattern">forbidden_script_pattern</option>
                    <option value="required_attribute">required_attribute</option>
                    <option value="forbidden_attribute">forbidden_attribute</option>
                    <option value="required_style">required_style</option>
                    <option value="forbidden_style">forbidden_style</option>
                  </select>
                  <input
                    value={webRuleDraft.message}
                    onChange={(e) => setWebRuleDraft((s) => ({ ...s, message: e.target.value }))}
                    className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                    placeholder={tr("Повідомлення (опційно)", "Message (optional)")}
                  />
                </div>

                {(webRuleDraft.type === "required_selector" || webRuleDraft.type === "forbidden_selector") ? (
                  <input
                    value={webRuleDraft.selector}
                    onChange={(e) => setWebRuleDraft((s) => ({ ...s, selector: e.target.value }))}
                    className="w-full mb-2 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                    placeholder={tr("selector, наприклад: h1 або .card", "selector, e.g.: h1 or .card")}
                  />
                ) : null}

                {(webRuleDraft.type === "required_text" || webRuleDraft.type === "forbidden_text") ? (
                  <input
                    value={webRuleDraft.text}
                    onChange={(e) => setWebRuleDraft((s) => ({ ...s, text: e.target.value }))}
                    className="w-full mb-2 px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                    placeholder={tr("text, який треба знайти/заборонити", "text to require/forbid")}
                  />
                ) : null}

                {(webRuleDraft.type === "required_script_pattern" || webRuleDraft.type === "forbidden_script_pattern") ? (
                  <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={webRuleDraft.pattern}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, pattern: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("regex pattern", "regex pattern")}
                    />
                    <input
                      value={webRuleDraft.flags}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, flags: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("flags, напр. i", "flags, e.g. i")}
                    />
                  </div>
                ) : null}

                {(webRuleDraft.type === "required_attribute" || webRuleDraft.type === "forbidden_attribute") ? (
                  <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={webRuleDraft.selector}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, selector: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("selector, напр. a.link", "selector, e.g. a.link")}
                    />
                    <input
                      value={webRuleDraft.attribute}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, attribute: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("attribute, напр. href", "attribute, e.g. href")}
                    />
                    <input
                      value={webRuleDraft.value}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, value: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("value (опційно)", "value (optional)")}
                    />
                    <input
                      value={webRuleDraft.valuePattern}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, valuePattern: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("regex valuePattern (опційно)", "regex valuePattern (optional)")}
                    />
                  </div>
                ) : null}

                {(webRuleDraft.type === "required_style" || webRuleDraft.type === "forbidden_style") ? (
                  <div className="mb-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      value={webRuleDraft.selector}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, selector: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("selector, напр. .card", "selector, e.g. .card")}
                    />
                    <input
                      value={webRuleDraft.property}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, property: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("CSS property, напр. color", "CSS property, e.g. color")}
                    />
                    <input
                      value={webRuleDraft.value}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, value: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("value (опційно)", "value (optional)")}
                    />
                    <input
                      value={webRuleDraft.valuePattern}
                      onChange={(e) => setWebRuleDraft((s) => ({ ...s, valuePattern: e.target.value }))}
                      className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                      placeholder={tr("regex valuePattern (опційно)", "regex valuePattern (optional)")}
                    />
                  </div>
                ) : null}

                <div className="mb-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={webRuleDraft.points}
                    onChange={(e) => setWebRuleDraft((s) => ({ ...s, points: e.target.value === "" ? "" : Number(e.target.value) }))}
                    className="px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                    placeholder="points"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={appendWebRuleFromDraft}>
                    <Plus className="w-4 h-4 mr-2" />
                    {tr("Додати правило", "Add rule")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={formatWebRulesJson}>
                    {tr("Форматувати JSON", "Format JSON")}
                  </Button>
                </div>

                <div className="mb-2 rounded-lg border border-border bg-bg-surface/60 p-2">
                  <div className="text-[11px] font-mono text-text-secondary mb-2">{tr("Список правил", "Rules list")}</div>
                  {(() => {
                    try {
                      const rules = safeParseWebRulesJson(editor.webRulesJson);
                      if (!rules.length) {
                        return <div className="text-xs text-text-secondary opacity-80">{tr("Поки немає правил", "No rules yet")}</div>;
                      }
                      return <div className="space-y-1.5 max-h-[180px] overflow-auto pr-1">
                        {rules.map((r, idx) => (
                          <div
                            key={`${r.type}-${idx}`}
                            onDragOver={(e) => {
                              e.preventDefault();
                              if (webRuleDropTargetIndex !== idx) setWebRuleDropTargetIndex(idx);
                              e.dataTransfer.dropEffect = "move";
                            }}
                            onDrop={(e) => {
                              e.preventDefault();
                              const fromRaw = Number(e.dataTransfer.getData("text/plain"));
                              const from = draggedWebRuleIndex ?? (Number.isInteger(fromRaw) ? fromRaw : null);
                              if (from == null) {
                                setDraggedWebRuleIndex(null);
                                setWebRuleDropTargetIndex(null);
                                return;
                              }
                              reorderWebRule(from, idx);
                            }}
                            className={`relative rounded-md border bg-bg-base px-2 py-1.5 ${webRuleDropTargetIndex === idx ? "border-primary/70" : "border-border"}`}
                          >
                            {draggedWebRuleIndex != null && webRuleDropTargetIndex === idx && draggedWebRuleIndex !== idx ? (
                              <div
                                className="absolute left-1.5 right-1.5 top-0 h-0.5 -translate-y-1/2 rounded bg-primary"
                                aria-hidden="true"
                              />
                            ) : null}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex items-start gap-2">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(e) => {
                                    setDraggedWebRuleIndex(idx);
                                    setWebRuleDropTargetIndex(idx);
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("text/plain", String(idx));
                                  }}
                                  onDragEnd={() => {
                                    setDraggedWebRuleIndex(null);
                                    setWebRuleDropTargetIndex(null);
                                  }}
                                  className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary hover:text-text-primary cursor-grab active:cursor-grabbing"
                                  title={tr("Перетягни для зміни порядку", "Drag to reorder")}
                                  aria-label={tr("Перетягни правило", "Drag rule")}
                                >
                                  <GripVertical className="h-4 w-4" />
                                </button>
                                <div className="min-w-0 text-xs font-mono text-text-primary">
                                  <span className="text-primary">#{idx + 1}</span>{" "}
                                  <span className="opacity-90">{r.type}</span>
                                  {r.points != null ? <span className="ml-2 text-text-secondary">[{tr("бали", "pts")}: {r.points}]</span> : null}
                                  <div className="mt-0.5 text-text-secondary break-words">
                                    {webRuleTargetText(r) || tr("(ціль не задана)", "(target is empty)")}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveWebRule(idx, -1)}
                                  disabled={idx === 0}
                                  title={tr("Перемістити вгору", "Move up")}
                                >
                                  ↑
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => moveWebRule(idx, 1)}
                                  disabled={idx === rules.length - 1}
                                  title={tr("Перемістити вниз", "Move down")}
                                >
                                  ↓
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => loadWebRuleToDraft(r)}
                                  title={tr("Підставити в форму", "Load into form")}
                                >
                                  {tr("Ред.", "Edit")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteWebRuleAtIndex(idx)}
                                  title={tr("Видалити правило", "Delete rule")}
                                >
                                  {tr("Del", "Del")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>;
                    } catch {
                      return <div className="text-xs text-accent-error">{tr("JSON містить помилку синтаксису", "JSON has a syntax error")}</div>;
                    }
                  })()}
                </div>

                <textarea
                  value={editor.webRulesJson}
                  onChange={(e) => setEditor((s) => ({ ...s, webRulesJson: e.target.value }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[140px]"
                  placeholder={tr(
                    "Приклад: [{\"type\":\"required_selector\",\"selector\":\"h1\",\"message\":\"Потрібен h1\",\"points\":1}]",
                    "Example: [{\"type\":\"required_selector\",\"selector\":\"h1\",\"message\":\"h1 is required\",\"points\":1}]"
                  )}
                />
                <div className="mt-2 text-xs text-text-secondary opacity-80">
                  {(() => {
                    try {
                      const count = safeParseWebRulesJson(editor.webRulesJson).length;
                      return tr(`Правил: ${count}`, `Rules: ${count}`);
                    } catch {
                      return tr("JSON містить помилку синтаксису", "JSON has a syntax error");
                    }
                  })()}
                </div>
              </div>
            </>
            )}

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Теорія (опційно)", "Theory (optional)")}</label>
              <textarea
                value={editor.theory}
                onChange={(e) => setEditor((s) => ({ ...s, theory: e.target.value }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Тести JSON (опційно)", "Tests JSON (optional)")}
              </label>
              <textarea
                value={editor.testsJson}
                onChange={(e) => setEditor((s) => ({ ...s, testsJson: e.target.value }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[160px]"
                placeholder={tr(
                  "Приклад: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"points\":1}]",
                  "Example: [{\"input\":\"1 2\",\"expectedOutput\":\"3\",\"points\":1}]"
                )}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setShowEditor(false)} disabled={saving}>
                {tr("Скасувати", "Cancel")}
              </Button>
              <Button onClick={saveEditor} disabled={saving}>
                {saving ? tr("Збереження...", "Saving...") : tr("Зберегти", "Save")}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {showImportReport && importReport ? (
        <Modal
          open={showImportReport}
          onClose={() => setShowImportReport(false)}
          title={tr("Звіт імпорту", "Import report")}
        >
          <div className="space-y-4">
            <div className="text-sm text-text-secondary">
              {importReport.status === "partial"
                ? tr(
                    `Імпортовано: ${importReport.importedCount}. Помилок: ${importReport.failedCount}.`,
                    `Imported: ${importReport.importedCount}. Failed: ${importReport.failedCount}.`
                  )
                : tr(
                    `Імпорт не виконано. Помилок: ${importReport.failedCount}.`,
                    `Import failed. Failed items: ${importReport.failedCount}.`
                  )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-end">
              <div>
                <label className="block text-xs font-mono text-text-secondary mb-1">{tr("Фільтр коду", "Code filter")}</label>
                <select
                  value={importReportFilter}
                  onChange={(e) => setImportReportFilter(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                >
                  <option value="ALL">{tr("Усі", "All")}</option>
                  {importReportCodes.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </div>
              <div className="text-xs text-text-secondary md:text-right">
                {tr("Показано", "Shown")}: {filteredImportReportEntries.length} / {importReport.entries.length}
              </div>
            </div>

            <div className="max-h-[45vh] overflow-auto rounded border border-border bg-bg-base p-3">
              {filteredImportReportEntries.length > 0 ? (
                <pre className="text-xs whitespace-pre-wrap break-words text-text-primary font-mono">
                  {filteredImportReportEntries.map((entry) => entry.line).join("\n")}
                </pre>
              ) : (
                <div className="text-sm text-text-secondary">{tr("Деталі відсутні", "No details")}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    const text = filteredImportReportEntries.map((entry) => entry.line).join("\n");
                    await navigator.clipboard.writeText(text);
                    showToast({ type: "success", message: tr("Звіт скопійовано", "Report copied") });
                  } catch {
                    showToast({ type: "error", message: tr("Не вдалося скопіювати звіт", "Failed to copy report") });
                  }
                }}
              >
                {tr("Копіювати", "Copy")}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  try {
                    const content = filteredImportReportEntries.map((entry) => entry.line).join("\n");
                    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `library-import-report-${Date.now()}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch {
                    showToast({ type: "error", message: tr("Не вдалося завантажити звіт", "Failed to download report") });
                  }
                }}
              >
                {tr("Завантажити .txt", "Download .txt")}
              </Button>
              <Button onClick={() => setShowImportReport(false)}>{tr("Закрити", "Close")}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
};

const RotateCcwIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-4 h-4">
    <path
      d="M21 12a9 9 0 1 1-3-6.7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M21 3v6h-6"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default TaskLibraryPage;
