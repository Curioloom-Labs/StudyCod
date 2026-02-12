import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Download, Edit2, Play, Plus, Search, Send, Star, Upload, X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { MarkdownView } from "../components/MarkdownView";
import { Badge } from "../components/ui/Badge";
import { Skeleton } from "../components/ui/Skeleton";
import { getMe } from "../lib/api/profile";
import {
  createLibraryTask,
  downloadLibraryTaskArchive,
  getLibraryTask,
  importLibraryTaskArchive,
  listApprovedLibraryTasks,
  listMyLibraryTasks,
  submitLibraryTask,
  updateLibraryTask,
  type JudgeLanguage,
  type LibraryCheckerSpec,
  type LibraryTaskDifficulty,
  type LibraryTaskListItem,
  type LibraryTaskStatus,
} from "../lib/api/library";

type TaskDetails = {
  task: LibraryTaskListItem;
  theory: string | null;
  tests: Array<{ id: number; input: string; expectedOutput: string; isHidden: boolean; points: number }>;
};

type EditorState = {
  id: number | null;
  problemCode: string;
  slug: string;
  title: string;
  difficulty: LibraryTaskDifficulty | "";
  tagsCsv: string;
  section: string;
  description: string;
  template: string;
  allowedLanguages: JudgeLanguage[];
  timeLimitMs: number | "";
  memoryLimitMb: number | "";
  outputLimitKb: number | "";
  checkerType: "" | "exact" | "whitespace" | "float";
  checkerEpsilon: number | "";
  maxAttempts: number;
  theory: string;
  testsJson: string;
};

const BASE_JUDGE_LANGS: JudgeLanguage[] = ["java", "python", "cpp", "c", "csharp", "kotlin"];
const DISABLED_JUDGE_LANGS = (() => {
  const raw = String(import.meta.env.VITE_JUDGE_DISABLED_LANGUAGES ?? "").trim();
  if (!raw) return new Set<JudgeLanguage>();
  const parts = raw
    .split(/[,\s]+/g)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const disabled = new Set<JudgeLanguage>();
  for (const p of parts) {
    if ((BASE_JUDGE_LANGS as readonly string[]).includes(p)) disabled.add(p as JudgeLanguage);
  }
  return disabled;
})();

const ALL_JUDGE_LANGS: JudgeLanguage[] = (() => {
  const filtered = BASE_JUDGE_LANGS.filter(l => !DISABLED_JUDGE_LANGS.has(l));
  return filtered.length ? filtered : BASE_JUDGE_LANGS;
})();

const FRIENDLY_JUDGE_LANG: Record<JudgeLanguage, string> = {
  java: "Java",
  python: "Python",
  cpp: "C++",
  c: "C",
  csharp: "C#",
  kotlin: "Kotlin",
};

const FRIENDLY_DIFFICULTY: Record<LibraryTaskDifficulty, { uk: string; en: string; color: "success" | "warn" | "error" | "info" }> = {
  EASY: { uk: "Легка", en: "Easy", color: "success" },
  MEDIUM: { uk: "Середня", en: "Medium", color: "warn" },
  HARD: { uk: "Складна", en: "Hard", color: "error" },
};

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

function safeParseTestsJson(text: string): Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> {
  const raw = String(text ?? "").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Tests JSON must be an array");
  return parsed.map((t: any) => ({
    input: String(t?.input ?? ""),
    expectedOutput: String(t?.expectedOutput ?? ""),
    isHidden: t?.isHidden ? true : false,
    points: t?.points != null ? Number(t.points) : undefined,
  }));
}

export const TaskLibraryPage: React.FC = () => {
  const { i18n } = useTranslation();
  const tr = (uk: string, en: string) => (i18n.language?.toLowerCase().startsWith("en") ? en : uk);
  const navigate = useNavigate();
  const location = useLocation();

  const solvePathPrefix = location.pathname.startsWith("/edu/") ? "/edu/library/solve" : "/library/solve";

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

  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importKey, setImportKey] = useState(0);
  const [importing, setImporting] = useState(false);

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
      problemCode: "",
      slug: "",
      title: "",
      difficulty: "",
      tagsCsv: "",
      section: "",
      description: "",
      template: "",
      allowedLanguages: ALL_JUDGE_LANGS,
      timeLimitMs: "",
      memoryLimitMb: "",
      outputLimitKb: "",
      checkerType: "",
      checkerEpsilon: "",
      maxAttempts: 3,
      theory: "",
      testsJson: "",
    }),
    []
  );

  const [editor, setEditor] = useState<EditorState>(emptyEditor);

  useEffect(() => {
    // In PERSONAL mode (and for EDU students), this page is read-only.
    // We only enable "Mine"/create/import/edit/submit for EDU teachers/admins.
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setCanManage(false);
      return;
    }
    getMe()
      .then((u) => {
        const allowed = u.userMode === "EDUCATIONAL" && !u.studentId && (u.role === "TEACHER" || u.role === "SYSTEM_ADMIN");
        setCanManage(!!allowed);
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
    if (lang && (ALL_JUDGE_LANGS as readonly string[]).includes(lang)) {
      setJudgeLang(lang as JudgeLanguage);
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
    // Keep preview consistent when switching between list items / views.
    setDetailsTab("description");
  }, [selectedId, view]);

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
    } catch (e: any) {
      console.error("Failed to download archive", e);
      alert(e?.response?.data?.message || tr("Не вдалося завантажити архів", "Failed to download archive"));
    }
  };

  const openCreate = () => {
    if (!canManage) return;
    setEditor(emptyEditor);
    setShowEditor(true);
  };

  const openEdit = async (taskId: number) => {
    if (!canManage) return;
    try {
      const d = await getLibraryTask(taskId);

      const checker = (d.task.checkerSpec ?? null) as LibraryCheckerSpec | null;
      const checkerType: EditorState["checkerType"] = checker?.type ?? "";
      const checkerEpsilon: EditorState["checkerEpsilon"] = checkerType === "float" ? (checker as any)?.epsilon ?? 1e-6 : "";

      setEditor({
        id: d.task.id,
        problemCode: String(d.task.problemCode ?? ""),
        slug: String(d.task.slug ?? ""),
        title: d.task.title,
        difficulty: (d.task.difficulty ?? "") as any,
        tagsCsv: Array.isArray(d.task.tags) ? d.task.tags.join(", ") : "",
        section: String(d.task.section ?? ""),
        description: d.task.description,
        template: d.task.template,
        allowedLanguages: (Array.isArray(d.task.allowedLanguages) && d.task.allowedLanguages.length ? d.task.allowedLanguages : ALL_JUDGE_LANGS) as JudgeLanguage[],
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
      });
      setShowEditor(true);
    } catch (e) {
      console.error("Failed to open edit", e);
      alert(tr("Не вдалося відкрити завдання", "Failed to open task"));
    }
  };

  const saveEditor = async () => {
    if (!canManage) return;
    if (!editor.title.trim() || !editor.description.trim() || !editor.template.trim()) {
      alert(tr("Заповніть назву, опис і шаблон", "Fill title, description and template"));
      return;
    }

    let tests: Array<{ input: string; expectedOutput: string; isHidden?: boolean; points?: number }> | undefined = undefined;
    try {
      const parsed = safeParseTestsJson(editor.testsJson);
      if (parsed.length > 0) tests = parsed;
    } catch (e: any) {
      alert(tr("Некоректний JSON тестів", "Invalid tests JSON") + ": " + String(e?.message || e));
      return;
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

      const checkerSpec: LibraryCheckerSpec | undefined = (() => {
        if (!editor.checkerType) return undefined;
        if (editor.checkerType === "float") {
          const eps = Number(editor.checkerEpsilon);
          return { type: "float", epsilon: Number.isFinite(eps) && eps > 0 ? eps : 1e-6 };
        }
        return { type: editor.checkerType } as any;
      })();

      const limits = {
        timeLimitMs: editor.timeLimitMs === "" ? undefined : Number(editor.timeLimitMs),
        memoryLimitMb: editor.memoryLimitMb === "" ? undefined : Number(editor.memoryLimitMb),
        outputLimitKb: editor.outputLimitKb === "" ? undefined : Number(editor.outputLimitKb),
      };

      if (editor.id == null) {
        await createLibraryTask({
          title: editor.title,
          problemCode: editor.problemCode.trim() || undefined,
          slug: editor.slug.trim() || undefined,
          difficulty: editor.difficulty ? (editor.difficulty as any) : undefined,
          tags: tags.length ? tags : undefined,
          section: editor.section.trim() || undefined,
          description: editor.description,
          template: editor.template,
          allowedLanguages,
          ...limits,
          checkerSpec,
          maxAttempts: editor.maxAttempts,
          theory: editor.theory,
          tests,
        });
      } else {
        await updateLibraryTask(editor.id, {
          title: editor.title,
          problemCode: editor.problemCode.trim() || undefined,
          slug: editor.slug.trim() || undefined,
          difficulty: editor.difficulty ? (editor.difficulty as any) : null,
          tags: tags.length ? tags : null,
          section: editor.section.trim() || null,
          description: editor.description,
          template: editor.template,
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
    } catch (e: any) {
      console.error("Failed to save library task", e);
      alert(e?.response?.data?.message || tr("Не вдалося зберегти", "Failed to save"));
    } finally {
      setSaving(false);
    }
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
    } catch (e: any) {
      console.error("Failed to submit", e);
      alert(e?.response?.data?.message || tr("Не вдалося відправити", "Failed to submit"));
    }
  };

  const handleImportArchive = async (file: File | null) => {
    if (!canManage) return;
    if (!file) return;
    if (importing) return;
    setImporting(true);
    try {
      await importLibraryTaskArchive(file);
      // Refresh list immediately (view might already be "mine", so relying on useEffect isn't enough).
      const res = await listMyLibraryTasks();
      setTasks(res.tasks);
      setView("mine");
      setSelectedId(null);
    } catch (e: any) {
      console.error("Failed to import archive", e);
      alert(e?.response?.data?.message || tr("Не вдалося імпортувати", "Failed to import"));
    } finally {
      setImporting(false);
      setImportKey((k: number) => k + 1);
    }
  };

  const getStableSolveKey = (task: LibraryTaskListItem) => {
    const key = (task.problemCode || task.slug || "").trim();
    return key || String(task.id);
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

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {tr("Назад", "Back")}
            </Button>
          </div>

          <div className="flex-1">
            <h1 className="text-2xl font-mono text-text-primary">{tr("Бібліотека завдань", "Task library")}</h1>
            <p className="text-text-secondary text-sm mt-1">
              {tr(
                "Каталог завдань (із модерацією) + ваші чернетки та відправлені на перевірку.",
                "Task catalog (moderated) + your drafts and submissions."
              )}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button variant={view === "approved" ? "primary" : "ghost"} onClick={() => setView("approved")}>
                {tr("Каталог", "Catalog")}
              </Button>
              {canManage ? (
                <Button variant={view === "mine" ? "primary" : "ghost"} onClick={() => setView("mine")}>
                  {tr("Мої", "Mine")}
                </Button>
              ) : null}

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Badge color="info">
                  {tr("Показано", "Shown")}: {visibleTasks.length}
                </Badge>
                <Badge color={solvedCount ? "success" : "info"}>
                  {tr("Виконано", "Solved")}: {solvedCount}
                </Badge>
                <Badge color={favoritesCount ? "warn" : "info"}>
                  {tr("Обрані", "Favorites")}: {favoritesCount}
                </Badge>
                {typeof total === "number" && view === "approved" ? (
                  <Badge color="info">
                    {tr("Всього", "Total")}: {total}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Filters */}
          <Card className="p-4 lg:col-span-3 lg:sticky lg:top-4 lg:self-start">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm font-mono text-text-primary flex items-center gap-2">
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
                    onChange={(e) => setJudgeLang(e.target.value as any)}
                    className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono text-sm focus:outline-none"
                  >
                    <option value="ALL">{tr("Будь-яка мова", "Any language")}</option>
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
                    onChange={(e) => setMineStatus(e.target.value as any)}
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
                  onChange={(e) => setSort(e.target.value as any)}
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
                      className="hidden"
                      onChange={(e) => handleImportArchive(e.target.files?.[0] || null)}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (document.getElementById("library-import") as HTMLInputElement | null)?.click()}
                      disabled={importing}
                      title={tr("Імпортувати архів (.zip)", "Import archive (.zip)")}
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {tr("Імпорт", "Import")}
                    </Button>
                    <Button size="sm" onClick={openCreate} title={tr("Нове завдання", "New task")}>
                      <Plus className="w-4 h-4 mr-2" />
                      {tr("Створити", "Create")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>

          {/* List */}
          <Card className="p-4 lg:col-span-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm font-mono text-text-primary">
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
              <div className="p-4 border border-border rounded-lg bg-bg-base">
                <div className="text-sm font-mono text-text-primary">{tr("Нічого не знайдено", "No results")}</div>
                <div className="text-sm text-text-secondary mt-1">
                  {tr("Спробуй змінити фільтри або пошук.", "Try adjusting filters or search.")}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
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
                    <div
                      key={task.id}
                      role="button"
                      tabIndex={0}
                      aria-current={isSelected ? "true" : undefined}
                      className={
                        "w-full text-left p-3 rounded-lg border transition-fast focus:outline-none focus:ring-1 focus:ring-primary " +
                        (isSelected ? "border-primary bg-bg-hover" : "border-border hover:bg-bg-hover")
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
                                    {(task.problemCode || task.slug) as any}
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
                          {task.status === "APPROVED" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`${solvePathPrefix}/${getStableSolveKey(task)}`);
                              }}
                            >
                              <Play className="w-3 h-3 mr-2" />
                              {tr("Відкрити", "Open")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Preview */}
          <Card className="p-4 lg:col-span-4">
            {!selectedId ? (
              <div className="p-4 border border-border rounded-lg bg-bg-base">
                <div className="text-sm font-mono text-text-primary">{tr("Вибери задачу", "Pick a task")}</div>
                <div className="text-sm text-text-secondary mt-1">
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
                          {(details.task.problemCode || details.task.slug) as any}
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
                      {tr("Мови:", "Languages:")} {getAllowedJudgeLanguages(details.task as any).map((l) => FRIENDLY_JUDGE_LANG[l]).join(", ")}
                      <span className="mx-2">·</span>
                      {tr("Спроб:", "Attempts:")} {details.task.maxAttempts}
                    </div>
                    {view === "mine" && canManage && details.task.status === "REJECTED" && details.task.rejectionReason ? (
                      <div className="mt-2 text-sm text-accent-warning">
                        {tr("Причина:", "Reason:")} {details.task.rejectionReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {details.task.status === "APPROVED" ? (
                      <Button variant="ghost" size="sm" onClick={() => navigate(`${solvePathPrefix}/${getStableSolveKey(details.task)}`)}>
                        <Play className="w-4 h-4 mr-2" />
                        {tr("Розв'язати", "Solve")}
                      </Button>
                    ) : null}
                    <Button size="sm" onClick={() => handleDownload(details.task.id)}>
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
          </Card>
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
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Складність", "Difficulty")}</label>
                <select
                  value={editor.difficulty}
                  onChange={(e) => setEditor((s) => ({ ...s, difficulty: e.target.value as any }))}
                  className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none"
                >
                  <option value="">{tr("(не задано)", "(not set)")}</option>
                  <option value="EASY">EASY</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HARD">HARD</option>
                </select>
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
                  onChange={(e) => setEditor((s) => ({ ...s, checkerType: e.target.value as any }))}
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
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Умова", "Description")} *</label>
              <textarea
                value={editor.description}
                onChange={(e) => setEditor((s) => ({ ...s, description: e.target.value }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[120px]"
              />
            </div>

            <div>
              <label className="block text-sm font-mono text-text-secondary mb-2">{tr("Шаблон коду", "Code template")} *</label>
              <textarea
                value={editor.template}
                onChange={(e) => setEditor((s) => ({ ...s, template: e.target.value }))}
                className="w-full px-3 py-2 bg-bg-base border border-border text-text-primary font-mono focus:outline-none min-h-[140px]"
              />
            </div>

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
