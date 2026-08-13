import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, Download, Edit2, GripVertical, Library, Play, Plus, Rocket, Search, Send, Star, Trash2, Upload, X } from "lucide-react";
import { staggerContainer, fadeUpItem } from "../../lib/motion";
import { Button } from "../../components/ui/Button";
import { Modal } from "../../components/ui/Modal";
import { MarkdownView } from "../../components/MarkdownView";
import { MarkdownImageInsertButton } from "../../components/MarkdownImageInsertButton";
import { Badge } from "../../components/ui/Badge";
import { Skeleton } from "../../components/ui/Skeleton";
import { showToast } from "../../lib/toast";
import { scopedStorageKey } from "../../lib/storageScope";
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
  type LibraryTaskProjectSpec,
  type WebTaskFile,
  type WebTaskProfileId,
  type WebTaskRule,
  type LibraryTaskStatus,
} from "../../lib/api/library";
import { JUDGE_LANGUAGE_LABELS, enabledJudgeLanguages } from "../../lib/judgeLanguages";
import { PremiumLibrary } from "../core/PremiumPersonalExperience";

type TaskDetails = {
  task: LibraryTaskListItem;
  theory: string | null;
  tests: Array<{ id: number; input: string; expectedOutput: string; isHidden: boolean; points: number; subtask?: number | string | null }>;
};

type EditorState = {
  id: number | null;
  taskMode: "CODE" | "WEB";
  projectSpecJson: string;
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

const PREVIEW_LIBRARY_TASKS = [
  { id: -201, title: "Витрати за категоріями", description: "Побудуй невеликий звіт на основі списку транзакцій і зроби код читабельним.", lang: "PYTHON", difficulty: "EASY", tags: ["collections", "loops"], taskMode: "CODE", status: "APPROVED", maxAttempts: 0 },
  { id: -202, title: "Найдовша серія", description: "Знайди найдовшу послідовність значень та поясни складність свого рішення.", lang: "PYTHON", difficulty: "MEDIUM", tags: ["arrays", "algorithm"], taskMode: "CODE", status: "APPROVED", maxAttempts: 0 },
  { id: -203, title: "Картка події", description: "Зверстай адаптивну картку з чіткою ієрархією, станами та мікровзаємодіями.", lang: "PYTHON", difficulty: "EASY", tags: ["html", "css"], taskMode: "WEB", status: "APPROVED", maxAttempts: 0 },
  { id: -204, title: "Валідатор розкладу", description: "Перевір конфлікти в розкладі, використовуючи чисту структуру даних.", lang: "PYTHON", difficulty: "HARD", tags: ["logic", "practice"], taskMode: "CODE", status: "APPROVED", maxAttempts: 0 },
] as LibraryTaskListItem[];

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

function safeParseTestsJson(text: string): Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number; subtask?: number }> {
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
      subtask?: unknown;
    };
    const parsedSubtask = Number(item.subtask);
    return {
      input: String(item.input ?? ""),
      expectedOutput: String(item.expectedOutput ?? ""),
      isHidden: item.isHidden ? true : false,
      points: item.points != null ? Number(item.points) : undefined,
      subtask: Number.isInteger(parsedSubtask) && parsedSubtask >= 1 ? parsedSubtask : undefined,
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
  const navigate = useNavigate();
  const location = useLocation();
  const isDesignPreview = import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true";

  const solvePathPrefix = location.pathname.startsWith("/edu/") ? "/edu/library/solve" : "/library/solve";

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

  const [, setFiltersOpen] = useState(false);

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
      const raw = localStorage.getItem(scopedStorageKey("library:favorites", "all"));
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
      localStorage.setItem(scopedStorageKey("library:favorites", "all"), JSON.stringify(Array.from(next)));
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
      projectSpecJson: "",
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
    if (isDesignPreview) sp.set("preview", "true");
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
      if (isDesignPreview) {
        setTasks(PREVIEW_LIBRARY_TASKS);
        setTotal(PREVIEW_LIBRARY_TASKS.length);
        return;
      }
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
    } catch (caught) {
      setTasks([]);
      setTotal(0);
      showToast({ type: "error", message: getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити бібліотеку.", "Failed to load the library.")) });
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
        projectSpecJson: d.task.projectSpec ? JSON.stringify(d.task.projectSpec, null, 2) : "",
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
                subtask: t.subtask ?? undefined,
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

    let tests: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number; subtask?: number }> | undefined = undefined;
    try {
      const parsed = safeParseTestsJson(editor.testsJson);
      if (parsed.length > 0) tests = parsed;
    } catch (e: unknown) {
      showToast({ type: "error", message: tr("Некоректний JSON тестів", "Invalid tests JSON") + ": " + getErrorMessage(e, "Unknown error") });
      return;
    }

    let webValidationRules: WebTaskRule[] | undefined = undefined;
    let webValidationProfile: WebTaskProfileId | undefined = undefined;
    let projectSpec: LibraryTaskProjectSpec | null | undefined = undefined;
    if (editor.projectSpecJson.trim()) {
      try {
        const parsed = JSON.parse(editor.projectSpecJson) as LibraryTaskProjectSpec;
        if (parsed?.kind !== "MINI_PROJECT" || parsed?.version !== 1) {
          throw new Error("projectSpec must have version 1 and kind MINI_PROJECT");
        }
        projectSpec = parsed;
      } catch (e: unknown) {
        showToast({ type: "error", message: tr("Некоректний JSON мініпроєкту", "Invalid mini-project JSON") + ": " + getErrorMessage(e, "Unknown error") });
        return;
      }
    } else if (editor.id != null) {
      projectSpec = null;
    }
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
        .concat(projectSpec?.skills ?? [])
        .filter((tag, index, all) => all.indexOf(tag) === index)
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
      if (nMem !== undefined && (!Number.isFinite(nMem) || nMem < 32 || nMem > 1024)) {
        showToast({ type: "error", message: tr("Пам'ять має бути в діапазоні 32..1024 MB", "Memory must be in range 32..1024 MB") });
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
          projectSpec,
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
          projectSpec: projectSpec ?? null,
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
  const learnerTasks = visibleTasks.length
    ? visibleTasks
    : isDesignPreview
      ? PREVIEW_LIBRARY_TASKS.filter((task) => {
        const needle = qDraft.trim().toLowerCase();
        return !needle || `${task.title} ${task.description} ${(task.tags || []).join(" ")}`.toLowerCase().includes(needle);
      })
      : [];

  // Learners see a new discovery-first library. Authoring/moderation remains on
  // the specialised workspace below, where its dense controls are necessary.
  if (!canManage && view === "approved") {
    return <PremiumLibrary
      tasks={learnerTasks}
      total={total ?? (isDesignPreview ? PREVIEW_LIBRARY_TASKS.length : null)}
      solved={solvedCount}
      loading={loading}
      query={qDraft}
      onQuery={setQDraft}
      onOpen={(task) => navigate({
        pathname: buildSolvePath(task),
        search: import.meta.env.DEV && new URLSearchParams(location.search).get("preview") === "true" ? "?preview=true" : "",
      })}
    />;
  }

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#152018] dark:bg-[#0b120e] dark:text-[#eef4ef] sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.section
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="overflow-hidden rounded-[32px] border border-[#142018]/10 bg-white shadow-[0_24px_70px_-48px_rgba(18,42,26,.55)] dark:border-white/10 dark:bg-[#121b15]"
        >
          <div className="relative p-5 sm:p-7 lg:p-8">
            <div className="pointer-events-none absolute right-0 top-0 h-full w-2/3 bg-[radial-gradient(circle_at_top_right,rgba(0,255,136,.14),transparent_58%)]" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <motion.div variants={fadeUpItem} className="max-w-3xl">
                <button
                  type="button"
                  onClick={leaveLibrary}
                  className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#142018]/10 bg-[#f4f7f3] px-4 py-2 text-sm font-semibold text-[#526258] transition hover:bg-[#e9efe9] dark:border-white/10 dark:bg-white/[.04] dark:text-[#b4c0b8] dark:hover:bg-white/[.08]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {tr("Назад", "Back")}
                </button>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#eaf5ee] px-3 py-1 text-sm font-semibold text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#73efb0]">
                  <Library className="h-4 w-4" />
                  {tr("Бібліотека StudyCod", "StudyCod library")}
                </div>
                <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-[-0.05em] text-[#121b15] dark:text-white sm:text-4xl lg:text-5xl">
                  {view === "mine"
                    ? tr("Керуйте задачами без старого робочого хаосу.", "Manage tasks without the old workspace clutter.")
                    : tr("Обирайте задачу за навичкою, рівнем і контекстом.", "Pick a task by skill, level, and context.")}
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-[#637267] dark:text-[#a8b5aa]">
                  {view === "mine"
                    ? tr(
                      "Тут зібрані чернетки, задачі на модерації та опубліковані матеріали. Пошук, масові дії й preview лишаються під рукою.",
                      "Drafts, moderation submissions, and published materials live here. Search, bulk actions, and preview stay close."
                    )
                    : tr(
                      "Швидкий каталог практики з живими фільтрами, прогресом і preview перед переходом у розв’язання.",
                      "A fast practice catalog with live filters, progress, and preview before opening the solver."
                    )}
                </p>
              </motion.div>

              <motion.div variants={fadeUpItem} className="grid min-w-[280px] grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                {[
                  [tr("Показано", "Shown"), visibleTasks.length, "text-[#121b15] dark:text-white"],
                  [tr("Виконано", "Solved"), solvedCount, "text-[#00a75a] dark:text-[#72edb0]"],
                  [tr("Обрані", "Favorites"), favoritesCount, "text-[#d97706] dark:text-[#ffb85e]"],
                  [tr("Всього", "Total"), typeof total === "number" && view === "approved" ? total : tasks.length, "text-[#121b15] dark:text-white"],
                ].map(([label, value, tone]) => (
                  <div key={String(label)} className="rounded-2xl border border-[#142018]/10 bg-[#f6f8f5]/85 p-4 dark:border-white/10 dark:bg-white/[.04]">
                    <div className="text-xs font-semibold text-[#748177] dark:text-[#9fac9f]">{label}</div>
                    <div className={`mt-2 text-3xl font-semibold tracking-[-0.05em] ${tone}`}>
                      <CountUp value={Number(value)} />
                    </div>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </motion.section>

        <section className="rounded-[28px] border border-[#142018]/10 bg-white p-4 shadow-[0_18px_55px_-45px_rgba(18,42,26,.55)] dark:border-white/10 dark:bg-[#121b15] sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex w-fit rounded-2xl bg-[#edf2ed] p-1 dark:bg-white/[.05]">
              <button
                type="button"
                onClick={() => setView("approved")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${view === "approved" ? "bg-white text-[#142018] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#69776d] hover:text-[#142018] dark:text-[#a7b4a9] dark:hover:text-white"}`}
              >
                {tr("Каталог", "Catalog")}
              </button>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setView("mine")}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${view === "mine" ? "bg-white text-[#142018] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#69776d] hover:text-[#142018] dark:text-[#a7b4a9] dark:hover:text-white"}`}
                >
                  {tr("Мої задачі", "My tasks")}
                </button>
              ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center xl:max-w-4xl">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#7b897e]" />
                <input
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-[#142018]/10 bg-[#f7f9f6] pl-12 pr-12 text-sm font-medium text-[#152018] outline-none transition placeholder:font-normal placeholder:text-[#98a39b] focus:border-[#00c96d] focus:ring-4 focus:ring-[#00ff88]/10 dark:border-white/10 dark:bg-white/[.035] dark:text-white"
                  placeholder={tr("Пошук за назвою, тегом, кодом або темою", "Search by title, tag, code, or topic")}
                />
                {qDraft.trim() ? (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[#7b897e] transition hover:bg-[#e7eee7] hover:text-[#142018] dark:hover:bg-white/[.08] dark:hover:text-white"
                    onClick={() => setQDraft("")}
                    aria-label={tr("Очистити пошук", "Clear search")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <select
                value={sort}
                onChange={(e) => {
                  const parsed = parseSort(e.target.value);
                  if (parsed) setSort(parsed);
                }}
                className="h-12 rounded-2xl border border-[#142018]/10 bg-[#f7f9f6] px-4 text-sm font-semibold text-[#26352b] outline-none dark:border-white/10 dark:bg-white/[.035] dark:text-white"
              >
                <option value="UPDATED_DESC">{tr("Спочатку нові", "Newest first")}</option>
                <option value="TITLE_ASC">{tr("Назва A–Z", "Title A–Z")}</option>
                <option value="DIFFICULTY_ASC">{tr("Рівень: від легких", "Level: easiest first")}</option>
              </select>

              {view === "approved" ? (
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
                  className="h-12 rounded-2xl border border-[#142018]/10 bg-[#f7f9f6] px-4 text-sm font-semibold text-[#26352b] outline-none dark:border-white/10 dark:bg-white/[.035] dark:text-white"
                >
                  <option value="ALL">{tr("Усі мови", "All languages")}</option>
                  {ALL_JUDGE_LANGS.map((l) => (
                    <option key={l} value={l}>{FRIENDLY_JUDGE_LANG[l]}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={mineStatus}
                  onChange={(e) => {
                    const parsed = parseMineStatus(e.target.value);
                    if (parsed) setMineStatus(parsed);
                  }}
                  className="h-12 rounded-2xl border border-[#142018]/10 bg-[#f7f9f6] px-4 text-sm font-semibold text-[#26352b] outline-none dark:border-white/10 dark:bg-white/[.035] dark:text-white"
                >
                  <option value="ALL">{tr("Усі статуси", "All statuses")}</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 border-t border-[#142018]/8 pt-4 dark:border-white/[.08] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setOnlySolved((value) => !value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${onlySolved ? "bg-[#e8f8ed] text-[#147b47] ring-1 ring-[#00c96d]/25 dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "bg-[#f3f6f3] text-[#637267] dark:bg-white/[.045] dark:text-[#a8b5aa]"}`}
              >
                {tr("Лише виконані", "Solved only")}
              </button>
              <button
                type="button"
                onClick={() => setOnlyFavorites((value) => !value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${onlyFavorites ? "bg-[#fff4df] text-[#b96300] ring-1 ring-[#ff8c00]/20 dark:bg-[#ff8c00]/10 dark:text-[#ffbf72]" : "bg-[#f3f6f3] text-[#637267] dark:bg-white/[.045] dark:text-[#a8b5aa]"}`}
              >
                {tr("Обрані", "Favorites")}
              </button>
              <button
                type="button"
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
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[#637267] transition hover:bg-[#f0f4ef] hover:text-[#142018] dark:text-[#a8b5aa] dark:hover:bg-white/[.06] dark:hover:text-white"
              >
                <RotateCcwIcon />
                {tr("Скинути", "Reset")}
              </button>
            </div>

            {view === "mine" && canManage ? (
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
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {tr("Імпорт", "Import")}
                </Button>
                {importReport && importReport.failedCount > 0 ? (
                  <Button variant="ghost" size="sm" onClick={() => setShowImportReport(true)}>
                    {tr("Звіт імпорту", "Import report")}
                  </Button>
                ) : null}
                <Button size="sm" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {tr("Створити", "Create")}
                </Button>
              </div>
            ) : null}
          </div>

          {view === "mine" && canManage ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#f6f8f5] p-3 text-sm text-[#637267] dark:bg-white/[.035] dark:text-[#a8b5aa]">
              <label className="inline-flex items-center gap-2 font-semibold">
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
                  `Чернетки: ${selectedVisibleDraftCount}/${visibleDraftTasks.length}`,
                  `Drafts: ${selectedVisibleDraftCount}/${visibleDraftTasks.length}`
                )}
              </label>
              <Button variant="ghost" size="sm" disabled={bulkActionPending || selectedDraftIds.size === 0} onClick={handleBulkSubmitDrafts}>
                <Send className="mr-2 h-4 w-4" />
                {tr("Відправити вибрані", "Submit selected")}
              </Button>
              <Button variant="ghost" size="sm" disabled={bulkActionPending || selectedDraftIds.size === 0} onClick={handleBulkDeleteDrafts}>
                <Trash2 className="mr-2 h-4 w-4" />
                {tr("Видалити вибрані", "Delete selected")}
              </Button>
            </div>
          ) : null}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section ref={listSectionRef} className="lg:col-span-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#142018] dark:text-white">
                  {view === "mine" ? tr("Мої задачі", "My tasks") : tr("Каталог задач", "Task catalog")}
                </h2>
                <p className="mt-1 text-sm text-[#6a786d] dark:text-[#9fac9f]">
                  {tr("Натисніть на картку, щоб відкрити preview праворуч.", "Select a card to open preview on the right.")}
                </p>
              </div>

              {view === "approved" && typeof total === "number" ? (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    {tr("Назад", "Prev")}
                  </Button>
                  <div className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-[#637267] ring-1 ring-[#142018]/10 dark:bg-white/[.05] dark:text-[#a8b5aa] dark:ring-white/10">
                    {page} / {totalPages}
                  </div>
                  <Button variant="ghost" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((p) => clamp(p + 1, 1, totalPages))}>
                    {tr("Далі", "Next")}
                  </Button>
                </div>
              ) : null}
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-[220px] rounded-[26px]" />
                ))}
              </div>
            ) : visibleTasks.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[#142018]/15 bg-white px-5 py-16 text-center dark:border-white/10 dark:bg-[#121b15]">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8f8ed] dark:bg-[#00ff88]/10">
                  <Search className="h-6 w-6 text-[#147b47] dark:text-[#72edb0]" />
                </div>
                <div className="text-base font-semibold text-[#142018] dark:text-white">{tr("Нічого не знайдено", "No results")}</div>
                <div className="mt-2 text-sm text-[#6a786d] dark:text-[#9fac9f]">
                  {tr("Змініть пошук, фільтри або відкрийте інший розділ.", "Adjust search, filters, or open another section.")}
                </div>
              </div>
            ) : (
              <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-4 md:grid-cols-2">
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
                    <motion.article
                      key={task.id}
                      variants={fadeUpItem}
                      role="button"
                      tabIndex={0}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(task.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(task.id);
                        }
                      }}
                      className={`group flex min-h-[230px] flex-col rounded-[28px] border bg-white p-5 text-left shadow-[0_20px_55px_-44px_rgba(18,42,26,.55)] transition focus:outline-none focus-visible:ring-4 focus-visible:ring-[#00ff88]/15 dark:bg-[#121b15] ${isSelected ? "border-[#00c96d]/55 ring-4 ring-[#00ff88]/10 dark:border-[#00ff88]/35" : "border-[#142018]/10 hover:-translate-y-1 hover:border-[#00c96d]/30 dark:border-white/10 dark:hover:border-[#00ff88]/25"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
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
                            {diffMeta ? <Badge color={diffMeta.color}>{tr(diffMeta.uk, diffMeta.en)}</Badge> : null}
                            {task.projectSpec ? <Badge color="info"><Rocket className="mr-1 inline h-3 w-3" />{tr("Мініпроєкт", "Mini-project")}</Badge> : null}
                            {task.attempt?.solved ? <Badge color="success">{tr("Виконано", "Solved")}</Badge> : null}
                            {view === "mine" && canManage ? (
                              <Badge color={task.status === "APPROVED" ? "success" : task.status === "REJECTED" ? "error" : task.status === "PENDING" ? "warn" : "info"}>
                                {statusLabel(task.status)}
                              </Badge>
                            ) : null}
                          </div>
                          <h3 className="mt-4 line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-[#142018] dark:text-white">
                            {task.title}
                          </h3>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(task.id);
                            }}
                            className="rounded-xl p-2 text-[#7c8a80] transition hover:bg-[#f1f5f1] hover:text-[#d97706] dark:hover:bg-white/[.07]"
                            aria-pressed={isFav}
                            aria-label={isFav ? tr("Прибрати з обраного", "Remove from favorites") : tr("Додати в обране", "Add to favorites")}
                          >
                            <Star className={`h-4 w-4 ${isFav ? "text-[#d97706]" : ""}`} fill={isFav ? "currentColor" : "none"} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(task.id);
                            }}
                            className="rounded-xl p-2 text-[#7c8a80] transition hover:bg-[#f1f5f1] hover:text-[#142018] dark:hover:bg-white/[.07] dark:hover:text-white"
                            aria-label={tr("Експортувати архів", "Export archive")}
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#748177] dark:text-[#9fac9f]">
                        {(task.problemCode || task.slug) ? <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">{task.problemCode || task.slug}</span> : null}
                        {task.section ? <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">{task.section}</span> : null}
                        <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">{formatShortDate(task.updatedAt, i18n.language || "uk")}</span>
                        {task.projectSpec ? <span className="rounded-full bg-[#fff4df] px-2.5 py-1 text-[#a65600] dark:bg-[#ffb454]/10 dark:text-[#ffca7e]">{task.projectSpec.estimatedMinutes} {tr("хв проєкту", "min project")}</span> : null}
                      </div>

                      {Array.isArray(task.tags) && task.tags.length ? (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {task.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-lg bg-[#eef3ee] px-2 py-1 text-xs font-medium text-[#637267] dark:bg-white/[.055] dark:text-[#a8b5aa]">
                              {tag}
                            </span>
                          ))}
                          {task.tags.length > 4 ? <span className="rounded-lg bg-[#eef3ee] px-2 py-1 text-xs font-medium text-[#637267] dark:bg-white/[.055] dark:text-[#a8b5aa]">+{task.tags.length - 4}</span> : null}
                        </div>
                      ) : null}

                      <div className="mt-auto pt-5">
                        {progress != null ? (
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold text-[#748177] dark:text-[#9fac9f]">
                              <span>{tr("Прогрес тестів", "Test progress")}</span>
                              <span>{testsPassed}/{testsTotal}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7eee7] dark:bg-white/[.07]">
                              <div className="h-full rounded-full bg-[#00c96d]" style={{ width: `${Math.round(progress * 100)}%` }} />
                            </div>
                          </div>
                        ) : task.attempt?.submissionsCount ? (
                          <div className="text-sm font-semibold text-[#748177] dark:text-[#9fac9f]">
                            {tr("Спроб", "Submissions")}: {task.attempt.submissionsCount}
                          </div>
                        ) : null}

                        {view === "mine" ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {(task.status === "DRAFT" || task.status === "REJECTED") && canManage ? (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openEdit(task.id); }}>
                                <Edit2 className="mr-2 h-3 w-3" />
                                {tr("Редагувати", "Edit")}
                              </Button>
                            ) : null}
                            {(task.status === "DRAFT" || task.status === "REJECTED") && canManage ? (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleSubmit(task.id); }}>
                                <Send className="mr-2 h-3 w-3" />
                                {tr("На модерацію", "Submit")}
                              </Button>
                            ) : null}
                            {task.status === "DRAFT" && canManage ? (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDeleteDraft(task.id); }}>
                                <Trash2 className="mr-2 h-3 w-3" />
                                {tr("Видалити", "Delete")}
                              </Button>
                            ) : null}
                            {task.status === "APPROVED" ? (
                              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); navigate(buildSolvePath(task)); }}>
                                <Play className="mr-2 h-3 w-3" />
                                {tr("Відкрити", "Open")}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </motion.article>
                  );
                })}
              </motion.div>
            )}
          </section>

          <aside ref={previewSectionRef} className="lg:col-span-4">
            <div className="sticky top-6 rounded-[28px] border border-[#142018]/10 bg-white p-5 shadow-[0_22px_60px_-45px_rgba(18,42,26,.55)] dark:border-white/10 dark:bg-[#121b15]">
              {!selectedId ? (
                <div className="rounded-[24px] bg-[#f6f8f5] px-5 py-12 text-center dark:bg-white/[.035]">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f8ed] dark:bg-[#00ff88]/10">
                    <Play className="h-6 w-6 text-[#147b47] dark:text-[#72edb0]" />
                  </div>
                  <div className="text-base font-semibold text-[#142018] dark:text-white">{tr("Оберіть задачу", "Pick a task")}</div>
                  <div className="mt-2 text-sm leading-6 text-[#6a786d] dark:text-[#9fac9f]">
                    {tr("Тут з’явиться умова, теорія, тести й швидкий перехід до розв’язання.", "Statement, theory, tests, and a quick solve action will appear here.")}
                  </div>
                </div>
              ) : loadingDetails ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 rounded-2xl" />
                  <Skeleton className="h-4 rounded-2xl" />
                  <Skeleton className="h-4 rounded-2xl" />
                  <Skeleton className="h-[220px] rounded-3xl" />
                </div>
              ) : !details ? (
                <div className="rounded-2xl bg-[#f6f8f5] p-5 text-sm text-[#6a786d] dark:bg-white/[.035] dark:text-[#9fac9f]">
                  {tr("Не вдалося завантажити preview.", "Failed to load preview.")}
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {details.task.difficulty ? (
                        <Badge color={FRIENDLY_DIFFICULTY[details.task.difficulty].color}>
                          {tr(FRIENDLY_DIFFICULTY[details.task.difficulty].uk, FRIENDLY_DIFFICULTY[details.task.difficulty].en)}
                        </Badge>
                      ) : null}
                      {view === "mine" && canManage ? (
                        <Badge color={details.task.status === "APPROVED" ? "success" : details.task.status === "REJECTED" ? "error" : details.task.status === "PENDING" ? "warn" : "info"}>
                          {statusLabel(details.task.status)}
                        </Badge>
                      ) : null}
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#142018] dark:text-white">
                      {details.task.title}
                    </h2>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#748177] dark:text-[#9fac9f]">
                      {(details.task.problemCode || details.task.slug) ? <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">{details.task.problemCode || details.task.slug}</span> : null}
                      <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">
                        {tr("Мови", "Languages")}: {getAllowedJudgeLanguages(details.task).map((l) => FRIENDLY_JUDGE_LANG[l]).join(", ")}
                      </span>
                      <span className="rounded-full bg-[#f2f5f2] px-2.5 py-1 dark:bg-white/[.055]">
                        {tr("Спроб", "Attempts")}: {details.task.maxAttempts}
                      </span>
                    </div>
                    {view === "mine" && canManage && details.task.status === "REJECTED" && details.task.rejectionReason ? (
                      <div className="mt-3 rounded-2xl bg-[#fff4df] p-3 text-sm font-medium text-[#a65600] dark:bg-[#ff8c00]/10 dark:text-[#ffbf72]">
                        {tr("Причина:", "Reason:")} {details.task.rejectionReason}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {details.task.status === "APPROVED" ? (
                      <Button variant="primary" size="sm" onClick={() => navigate(buildSolvePath(details.task))}>
                        <Play className="mr-2 h-4 w-4" />
                        {tr("Розв’язати", "Solve")}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => handleDownload(details.task.id)}>
                      <Download className="mr-2 h-4 w-4" />
                      {tr("Архів", "Archive")}
                    </Button>
                  </div>

                  <div className="flex rounded-2xl bg-[#f2f5f2] p-1 dark:bg-white/[.045]">
                    {[
                      ["description", tr("Умова", "Statement")],
                      ["theory", tr("Теорія", "Theory")],
                      ["tests", `${tr("Тести", "Tests")} (${details.tests.length})`],
                    ].map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setDetailsTab(tab as typeof detailsTab)}
                        className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${detailsTab === tab ? "bg-white text-[#142018] shadow-sm dark:bg-[#edf3ef] dark:text-[#0b120e]" : "text-[#6a786d] hover:text-[#142018] dark:text-[#a8b5aa] dark:hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-[520px] overflow-auto pr-1">
                    {detailsTab === "description" ? <MarkdownView content={details.task.description || ""} /> : null}
                    {detailsTab === "theory" ? (
                      details.theory ? <MarkdownView content={details.theory} /> : <div className="rounded-2xl bg-[#f6f8f5] p-4 text-sm text-[#6a786d] dark:bg-white/[.035] dark:text-[#9fac9f]">{tr("Теорію для цієї задачі не додано.", "No theory has been added for this task.")}</div>
                    ) : null}
                    {detailsTab === "tests" ? (
                      details.tests.length === 0 ? (
                        <div className="rounded-2xl bg-[#f6f8f5] p-4 text-sm text-[#6a786d] dark:bg-white/[.035] dark:text-[#9fac9f]">{tr("Тести не додано.", "No tests added.")}</div>
                      ) : (
                        <div className="space-y-3">
                          {details.tests.slice(0, 12).map((test) => {
                            const hiddenForCatalog = test.isHidden && view === "approved";
                            return (
                              <div key={test.id} className="rounded-2xl border border-[#142018]/10 bg-[#f8faf7] p-3 dark:border-white/10 dark:bg-white/[.035]">
                                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#748177] dark:text-[#9fac9f]">
                                  {test.isHidden ? <Badge color="warn">{tr("прихований", "hidden")}</Badge> : <Badge color="info">{tr("публічний", "public")}</Badge>}
                                  <span>{tr("бали", "points")}: {test.points}</span>
                                </div>
                                <div className="grid gap-2">
                                  <div>
                                    <div className="mb-1 text-xs font-semibold text-[#4f5f54] dark:text-[#c1cbc4]">{tr("Ввід", "Input")}</div>
                                    <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-[#26352b] ring-1 ring-[#142018]/10 dark:bg-[#0b120e] dark:text-[#dce7df] dark:ring-white/10">
                                      {hiddenForCatalog ? tr("(приховано)", "(hidden)") : test.input || ""}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-xs font-semibold text-[#4f5f54] dark:text-[#c1cbc4]">{tr("Очікувано", "Expected")}</div>
                                    <pre className="overflow-auto rounded-xl bg-white p-3 text-xs text-[#26352b] ring-1 ring-[#142018]/10 dark:bg-[#0b120e] dark:text-[#dce7df] dark:ring-white/10">
                                      {hiddenForCatalog ? tr("(приховано)", "(hidden)") : test.expectedOutput || ""}
                                    </pre>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {details.tests.length > 12 ? (
                            <div className="text-sm text-[#6a786d] dark:text-[#9fac9f]">
                              {tr("Показано перші 12 тестів.", "Showing the first 12 tests.")}
                            </div>
                          ) : null}
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </aside>
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

            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-3">
              <label className="block text-sm font-mono text-text-secondary mb-2">
                {tr("Мініпроєкт (projectSpec JSON, опційно)", "Mini-project (projectSpec JSON, optional)")}
              </label>
              <textarea
                value={editor.projectSpecJson}
                onChange={(e) => setEditor((s) => ({ ...s, projectSpecJson: e.target.value }))}
                className="w-full min-h-[180px] px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-xs leading-5 focus:outline-none"
                placeholder={`{
  "version": 1,
  "kind": "MINI_PROJECT",
  "estimatedMinutes": 30,
  "skills": ["conditions", "functions"],
  "milestones": [{ "id": "core", "title": "Основна логіка", "description": "Реалізуй базовий сценарій." }],
  "extensions": ["Додай обробку помилок"]
}`}
              />
              <p className="mt-2 text-xs text-text-secondary">
                {tr("Проєкт використовує той самий judge, підказки та skill-evidence, що й звичайна задача.", "The project uses the same judge, hints, and skill evidence as a regular task.")}
              </p>
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
                  min={32}
                  max={1024}
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
