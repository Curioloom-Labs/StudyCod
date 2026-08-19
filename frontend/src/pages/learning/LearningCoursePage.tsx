import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Rocket,
  Route,
  Save,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  checkCatalogProject,
  completeCatalogItem,
  enrollInCatalogCourse,
  getCatalogProject,
  getLearningCourse,
  saveCatalogProject,
  submitCatalogProject,
  type LearningCourse,
  type LearningCourseItem,
  type LearningProject,
} from "../../lib/api/learningCatalog";
import { MarkdownView } from "../../components/MarkdownView";
import { Modal } from "../../components/ui/Modal";
import { tr } from "../../i18n";

type RoadmapNode = {
  id: string;
  kind: "TOPIC" | "PROJECT" | "MILESTONE";
  title: string;
  theory?: LearningCourseItem;
  practices: LearningCourseItem[];
  item?: LearningCourseItem;
  topicKey?: string;
  requiredTopicKeys?: string[];
};

type TopicPart = {
  label: string;
  detail: string;
};

function isProject(item: LearningCourseItem): boolean {
  return item.kind === "MANUAL" && Boolean((item.content as { project?: unknown }).project);
}

function topicKeyOf(item: LearningCourseItem): string | undefined {
  const sourceKey = typeof item.content.sourceKey === "string" ? item.content.sourceKey : "";
  const match = /^([a-z0-9-]+)\.([a-z0-9-]+)\.(?:theory|practice(?:-\d+)?)$/i.exec(sourceKey);
  return match?.[2];
}

function requiredTopicKeysOf(item: LearningCourseItem): string[] {
  const projectSpec = item.content.projectSpec as { requiredTopicKeys?: unknown } | undefined;
  return Array.isArray(projectSpec?.requiredTopicKeys)
    ? projectSpec.requiredTopicKeys.filter((key): key is string => typeof key === "string" && key.trim().length > 0)
    : [];
}

function markdownOf(item: LearningCourseItem | undefined): string {
  return typeof item?.content.markdown === "string" ? item.content.markdown : "";
}

function firstText(content: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = content[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function topicDescription(node: RoadmapNode): string {
  const content = node.theory?.content ?? {};
  const directDescription = firstText(content, ["description", "summary", "goal", "objective", "overview", "outcome"]);
  if (directDescription) return directDescription.replace(/\s+/g, " ").slice(0, 180);

  const markdown = markdownOf(node.theory)
    .split(/\n+/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/[*_`>]/g, "").trim())
    .find((line) => line.length > 30);
  if (markdown) return markdown.replace(/\s+/g, " ").slice(0, 180);

  return tr(
    `Розберемо «${node.title}»: коротка теорія, приклади та практичне завдання для закріплення.`,
    `Explore “${node.title}” through concise theory, examples, and a practical task.`,
  );
}

function projectDescription(item: LearningCourseItem | undefined): string {
  const content = item?.content ?? {};
  const directDescription = firstText(content, ["description", "summary", "goal", "objective", "overview", "outcome"]);
  if (directDescription) return directDescription.replace(/\s+/g, " ").slice(0, 180);
  const markdown = markdownOf(item)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("#"))
    .map((line) => line.replace(/[*_`>]/g, "").trim())
    .find((line) => line.length > 30 && !line.startsWith("Орієнтовний час") && !line.startsWith("Навички") && !line.startsWith("Estimated time") && !line.startsWith("Skills"));
  return markdown
    ? markdown.replace(/\s+/g, " ").slice(0, 180)
    : tr("Збери в одному проєкті навички з пройдених тем.", "Bring the skills from the completed topics together in one project.");
}

function projectTitle(title: string): string {
  return title.replace(/^(Мініпроєкт|Mini-project):\s*/i, "");
}

function topicParts(node: RoadmapNode): TopicPart[] {
  const parts: TopicPart[] = [];
  if (node.practices.length) {
    parts.push({
      label: tr("Практика", "Practice"),
      detail: `${node.practices.length} ${node.practices.length === 1 ? tr("завдання", "task") : tr("завдань", "tasks")}`,
    });
  }

  const estimatedMinutes = ["estimatedMinutes", "durationMinutes", "timeMinutes"]
    .map((key) => node.theory?.content[key])
    .find((value): value is number => typeof value === "number" && value > 0);
  if (estimatedMinutes) parts.push({ label: tr("Час", "Time"), detail: `~${Math.round(estimatedMinutes)} ${tr("хв", "min")}` });

  return parts;
}

function itemScore(item: LearningCourseItem): number {
  const score = Number(item.progress.score);
  if (item.progress.score != null && Number.isFinite(score)) return Math.max(0, Math.min(100, Math.round(score)));
  return item.progress.status === "COMPLETED" ? 100 : 0;
}

function nodeScore(node: RoadmapNode): number {
  const items = node.kind === "TOPIC" && node.theory ? [node.theory, ...node.practices] : node.item ? [node.item] : [];
  return items.length ? Math.round(items.reduce((total, item) => total + itemScore(item), 0) / items.length) : 0;
}

export const LearningCoursePage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams] = useSearchParams();
  const [course, setCourse] = React.useState<LearningCourse | null>(null);
  const [projects, setProjects] = React.useState<Record<number, LearningProject>>({});
  const [projectFiles, setProjectFiles] = React.useState<Record<number, string>>({});
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [projectLoadingId, setProjectLoadingId] = React.useState<number | null>(null);
  const [busyItem, setBusyItem] = React.useState<number | null>(null);
  const [activating, setActivating] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<LearningCourse | null> => {
    if (!courseId) return null;
    setLoading(true);
    try {
      const loaded = await getLearningCourse(Number(courseId));
      setCourse(loaded);
      setProjects({});
      setError(null);
      return loaded;
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку заверши необхідні базові курси.", "Complete the required foundation courses first.")
        : code === "COURSE_NOT_ENROLLED"
          ? tr("Спочатку відкрий курс із каталогу.", "Open the course from the catalog first.")
          : tr("Не вдалося завантажити курс.", "Could not load the course."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [courseId, locale]);

  React.useEffect(() => { void load(); }, [load]);

  const allItems = course?.modules.flatMap((module) => module.items) ?? [];
  const nextPracticeItem = allItems.find((item) => item.kind === "CODE_TASK" && item.progress.status !== "COMPLETED") ?? null;
  const focusPractice = searchParams.get("focus") === "practice";
  const requiredItems = allItems.filter((item) => item.content.required !== false);
  const completedItems = requiredItems.filter((item) => item.progress.status === "COMPLETED").length;
  const finalWork = requiredItems.find((item) => item.content.finalAssessment === true) ?? null;
  const learningItems = finalWork ? requiredItems.filter((item) => item.id !== finalWork.id) : requiredItems;
  const learningItemsCompleted = learningItems.filter((item) => item.progress.status === "COMPLETED").length;
  const canStartFinalWork = Boolean(finalWork && learningItems.length > 0 && learningItemsCompleted === learningItems.length && finalWork.progress.status !== "COMPLETED");
  const courseIsActive = course?.enrollment.status === "IN_PROGRESS" || course?.enrollment.status === "COMPLETED";

  const activateCourse = async () => {
    if (!course || activating || courseIsActive) return;
    setActivating(true);
    setError(null);
    setMessage(null);
    try {
      await enrollInCatalogCourse(course.id, course.enrollment.variantId);
      const refreshed = await load();
      if (!refreshed || (refreshed.enrollment.status !== "IN_PROGRESS" && refreshed.enrollment.status !== "COMPLETED")) {
        throw new Error("COURSE_ACTIVATION_NOT_CONFIRMED");
      }
      setMessage(tr("Курс активовано. Тепер можна рухатися roadmap і генерувати практику.", "Course activated. You can now follow the roadmap and generate practice."));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку завершiть необхідні базові курси.", "Complete the required foundation courses first.")
        : tr("Не вдалося активувати курс.", "Could not activate the course."));
    } finally {
      setActivating(false);
    }
  };

  const roadmapNodes = React.useMemo<RoadmapNode[]>(() => {
    const nodes: RoadmapNode[] = [];
    const projectItems: LearningCourseItem[] = [];
    for (const item of allItems) {
      if (item.kind === "THEORY") {
        nodes.push({ id: `topic-${item.id}`, kind: "TOPIC", title: item.title, theory: item, practices: [], topicKey: topicKeyOf(item) });
        continue;
      }
      if (item.kind === "CODE_TASK") {
        const theoryId = Number(item.content.theoryItemId || 0);
        const target = theoryId > 0
          ? nodes.find((node) => node.kind === "TOPIC" && node.theory?.id === theoryId)
          : nodes[nodes.length - 1];
        if (target) target.practices.push(item);
        else nodes.push({ id: `task-${item.id}`, kind: "MILESTONE", title: item.title, item, practices: [] });
        continue;
      }
      if (isProject(item)) {
        if (item.content.finalAssessment !== true) projectItems.push(item);
        continue;
      }
      if (item.content.required !== false) {
        nodes.push({ id: `item-${item.id}`, kind: "MILESTONE", title: item.title, item, practices: [] });
      }
    }
    const projectsAtPosition = new Map<number, RoadmapNode[]>();
    for (const item of projectItems) {
      const requiredKeys = requiredTopicKeysOf(item);
      const requiredIndexes = requiredKeys
        .map((key) => nodes.findIndex((node) => node.kind === "TOPIC" && node.topicKey === key))
        .filter((index) => index >= 0);
      const position = requiredIndexes.length ? Math.max(...requiredIndexes) + 1 : nodes.length;
      const projectNode: RoadmapNode = {
        id: `project-${item.id}`,
        kind: "PROJECT",
        title: item.title,
        item,
        practices: [],
        requiredTopicKeys: requiredKeys,
      };
      projectsAtPosition.set(position, [...(projectsAtPosition.get(position) ?? []), projectNode]);
    }
    const ordered: RoadmapNode[] = [];
    for (let position = 0; position <= nodes.length; position += 1) {
      ordered.push(...(projectsAtPosition.get(position) ?? []));
      if (position < nodes.length) ordered.push(nodes[position]);
    }
    return ordered;
  }, [allItems]);

  const nodeItems = (node: RoadmapNode): LearningCourseItem[] =>
    node.kind === "TOPIC" && node.theory ? [node.theory, ...node.practices] : node.item ? [node.item] : [];

  const nodeCompleted = (node: RoadmapNode): boolean => {
    const items = nodeItems(node);
    return items.length > 0 && items.every((item) => item.progress.status === "COMPLETED");
  };

  const topicNodes = roadmapNodes.filter((node) => node.kind === "TOPIC");
  const practiceCount = topicNodes.reduce((total, node) => total + node.practices.length, 0);
  const completedTopics = topicNodes.filter(nodeCompleted).length;
  const projectNodes = roadmapNodes.filter((node) => node.kind === "PROJECT");
  const miniProjectNodes = projectNodes.filter((node) => node.item?.content.finalAssessment !== true);

  React.useEffect(() => {
    if (loading || !course || !focusPractice) return;
    if (nextPracticeItem) {
      navigate(`/learning/course/${course.id}/practice/${nextPracticeItem.id}`, { replace: true });
    } else {
      setMessage(tr("Усі практичні завдання курсу вже завершені.", "All course practice tasks are already completed."));
    }
  }, [course, focusPractice, loading, navigate, nextPracticeItem]);

  const completeItem = async (item: LearningCourseItem) => {
    if (!courseIsActive) {
      setError(tr("Спочатку активуйте курс.", "Activate the course first."));
      return;
    }
    if (item.progress.status === "COMPLETED") return;
    if (item.kind === "CODE_TASK") {
      const theoryId = Number(item.content.theoryItemId || 0);
      const theoryDone = theoryId <= 0 || allItems.some((candidate) => candidate.id === theoryId && candidate.progress.status === "COMPLETED");
      if (!theoryDone) {
        setError(tr("Спочатку прочитай і заверши теорію цієї теми.", "Read and complete this topic's theory first."));
        return;
      }
      navigate(`/learning/course/${course?.id ?? ""}/practice/${item.id}`);
      return;
    }
    setBusyItem(item.id);
    setMessage(null);
    setError(null);
    try {
      await completeCatalogItem(item.id);
      await load();
      setMessage(tr("Елемент курсу зараховано.", "Course item completed."));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "THEORY_REQUIRED_BEFORE_PRACTICE"
        ? tr("Спочатку прочитай теорію цієї теми.", "Read this topic's theory first.")
        : tr("Не вдалося зарахувати елемент.", "Could not complete this item."));
    } finally {
      setBusyItem(null);
    }
  };

  const updateProject = (itemId: number, patch: Partial<LearningProject["progress"]>) => {
    setProjects((current) => current[itemId]
      ? { ...current, [itemId]: { ...current[itemId], progress: { ...current[itemId].progress, ...patch } } }
      : current);
  };

  const saveProject = async (item: LearningCourseItem, submit: boolean) => {
    const project = projects[item.id];
    if (!project) return;
    setBusyItem(item.id);
    setError(null);
    setMessage(null);
    try {
      const input = { milestoneIds: project.progress.milestoneIds, draft: project.progress.draft, readme: project.progress.readme };
      const response = submit ? await submitCatalogProject(item.id, input) : await saveCatalogProject(item.id, input);
      if (response?.project) setProjects((current) => ({ ...current, [item.id]: response.project }));
      if (submit) await load();
      setMessage(submit
        ? tr("Мініпроєкт подано.", "Mini-project submitted.")
        : tr("Чернетку збережено.", "Draft saved."));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PROJECT_REQUIREMENTS_INCOMPLETE"
        ? tr("Заповни всі етапи, опис реалізації та README.", "Complete all milestones, implementation notes, and README.")
        : tr("Не вдалося зберегти мініпроєкт.", "Could not save the mini-project."));
    } finally {
      setBusyItem(null);
    }
  };

  const checkProject = async (item: LearningCourseItem) => {
    let files: Array<{ path: string; content: string }>;
    try {
      const parsed = JSON.parse(projectFiles[item.id] || "");
      if (!Array.isArray(parsed)) throw new Error("not an array");
      files = parsed;
    } catch {
      setError(tr("Встав JSON-масив файлів для перевірки.", "Paste a JSON array of files for the check."));
      return;
    }
    setBusyItem(item.id);
    setError(null);
    try {
      const result = await checkCatalogProject(item.id, files);
      setMessage(result?.passed
        ? tr("Перевірку проєкту пройдено.", "Project check passed.")
        : tr("Перевірку не пройдено.", "Project check failed."));
    } catch {
      setError(tr("Не вдалося запустити ізольовану перевірку.", "Could not start the isolated project check."));
    } finally {
      setBusyItem(null);
    }
  };

  const handleNodeClick = (node: RoadmapNode, index: number) => {
    if (!courseIsActive) {
      setMessage(tr("Активуйте курс, щоб відкрити перший вузол.", "Activate the course to open the first node."));
      return;
    }
    const previousComplete = roadmapNodes.slice(0, index).every(nodeCompleted);
    if (!previousComplete) return;

    if (node.kind === "TOPIC") {
      setSelectedNodeId(node.id);
      return;
    }

    if (nodeCompleted(node)) return;
    if (node.kind === "PROJECT" || node.kind === "MILESTONE") setSelectedNodeId(node.id);
  };

  const finalProjectNode = finalWork ? {
    id: `project-${finalWork.id}`,
    kind: "PROJECT" as const,
    title: finalWork.title,
    item: finalWork,
    practices: [],
  } : null;
  const selectedNode = [...roadmapNodes, ...(finalProjectNode ? [finalProjectNode] : [])].find((node) => node.id === selectedNodeId) ?? null;
  const selectedTopic = selectedNode?.kind === "TOPIC" ? selectedNode : null;
  const selectedTopicItems = selectedTopic ? nodeItems(selectedTopic) : [];
  const selectedTopicAverage = selectedTopicItems.length
    ? Math.round(selectedTopicItems.reduce((total, item) => total + itemScore(item), 0) / selectedTopicItems.length)
    : 0;
  const selectedTopicCompleted = selectedTopicItems.filter((item) => item.progress.status === "COMPLETED").length;
  const selectedTopicPractice = selectedTopic?.practices.find((item) => item.progress.status !== "COMPLETED") ?? selectedTopic?.practices[0] ?? null;
  const selectedItem = selectedNode?.kind !== "TOPIC" ? selectedNode?.item : undefined;
  const selectedProject = selectedNode?.kind === "PROJECT" && selectedNode.item ? projects[selectedNode.item.id] : undefined;

  React.useEffect(() => {
    const projectId = selectedNode?.kind === "PROJECT" ? selectedNode.item?.id : undefined;
    if (!projectId || projects[projectId]) return;
    let cancelled = false;
    setProjectLoadingId(projectId);
    void getCatalogProject(projectId)
      .then((project) => {
        if (!cancelled) setProjects((current) => ({ ...current, [projectId]: project }));
      })
      .catch(() => {
        if (!cancelled) setError(tr("Не вдалося завантажити дані мініпроєкту.", "Could not load the mini-project details."));
      })
      .finally(() => {
        if (!cancelled) setProjectLoadingId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projects, selectedNode?.kind, selectedNode?.item?.id]);

  if (loading) return <div role="status" aria-live="polite" className="mx-auto max-w-5xl px-6 py-16 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо курс…", "Loading course…")}</div>;
  if (error && !course) return <main className="mx-auto max-w-3xl px-6 py-12"><button type="button" onClick={() => navigate("/learning/catalog")} className="mb-8 inline-flex items-center text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button><div role="alert" className="rounded-2xl border border-accent-error/30 bg-accent-error/10 p-5 text-sm text-accent-error"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-xl border border-current px-4 py-2 font-bold">{tr("Повторити", "Retry")}</button></div></main>;
  if (!course) return null;

  const roadmapWavePath = "M50 0 C28 16 28 34 50 50 C72 66 72 84 50 100";
  const renderRoadmapWave = (ratio: number, className: string) => <svg aria-hidden="true" className={`pointer-events-none ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
    <path d={roadmapWavePath} className="fill-none stroke-primary/30" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    {ratio > 0 && <path d={roadmapWavePath} className="fill-none stroke-primary" strokeWidth="7" strokeLinecap="round" pathLength={1} strokeDasharray={ratio >= 1 ? undefined : `${ratio} ${1 - ratio}`} vectorEffect="non-scaling-stroke" />}
  </svg>;

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <nav aria-label={tr("Навігація курсу", "Course navigation")} className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
      <button type="button" onClick={() => navigate("/learning/catalog")} className="rounded-lg px-2 py-1 transition hover:bg-bg-hover hover:text-text-primary">{tr("Каталог", "Catalog")}</button>
      <span aria-hidden="true">/</span>
      <span className="max-w-[min(70vw,32rem)] truncate text-text-primary">{course.title}</span>
    </nav>
    <button type="button" onClick={() => navigate("/learning/catalog")} className="mb-7 inline-flex items-center text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button>

    {!courseIsActive ? <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/[.05] p-4"><div><p className="font-bold text-text-primary">{tr("Цей курс ще не активовано", "This course is not active yet")}</p><p className="mt-1 text-sm text-text-secondary">{tr("Активація відкриє теорію, послідовний roadmap і контекстну практику.", "Activation unlocks theory, the ordered roadmap, and course-scoped practice.")}</p></div><button type="button" disabled={activating} onClick={() => void activateCourse()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{activating ? tr("Активуємо…", "Activating…") : tr("Активувати курс", "Activate course")}</button></div> : null}
    {message && <div role="status" aria-live="polite" className="mb-6 rounded-2xl border border-primary/25 bg-primary/[.05] px-4 py-3 text-sm text-primary">{message}</div>}
    {error && <div role="alert" className="mb-6 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}

    <section className="mb-6 overflow-hidden rounded-[30px] border border-[#102619]/10 bg-[#f7f8f5] dark:border-white/10 dark:bg-[#0e1510]">
      <header className="relative overflow-hidden bg-[#102619] px-5 py-7 text-white sm:px-8 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 size-[360px] rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-2 -top-10 size-[220px] rounded-full border border-[#69e9a8]/15" />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5"><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#70edaf]"><Route className="size-4" />{course.title} · {course.runtime}</p><span className="rounded-md border border-white/15 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#b8d8c3]">{course.level}</span></div>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_270px] lg:items-end">
            <div><h1 className="max-w-3xl text-[clamp(38px,5.5vw,68px)] font-bold leading-[.96] tracking-[-.065em]">{tr("Твій шлях до впевненого коду.", "Your path to confident code.")}</h1><p className="mt-5 max-w-2xl text-sm leading-6 text-[#b7d1c0] sm:text-base">{tr("Від першого поняття до задач, які ти вже можеш розв’язувати самостійно. Рухайся послідовно — кожна тема додає новий інструмент.", "From your first concept to problems you can solve independently. Move sequentially — every topic adds a new tool.")}</p></div>
            <div className="border-t border-white/15 pt-4 lg:border-l lg:border-t-0 lg:pl-6"><div className="flex items-end justify-between gap-3"><span className="text-xs font-semibold text-[#b7d1c0]">{tr("Прогрес маршруту", "Path progress")}</span><strong className="text-4xl font-bold tracking-[-.06em] text-[#70edaf]">{Math.round(course.enrollment.completionPercent)}%</strong></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#70edaf] transition-all" style={{ width: `${Math.min(100, Math.max(0, course.enrollment.completionPercent))}%` }} /></div><p className="mt-3 text-xs text-[#8fb29d]">{completedItems} / {requiredItems.length} {tr("елементів завершено", "items completed")}</p></div>
          </div>
          <div className="mt-10 grid grid-cols-2 border-t border-white/10 pt-5 sm:grid-cols-4"><div><p className="text-2xl font-bold tracking-[-.05em] text-white">{topicNodes.length}</p><p className="mt-1 text-[11px] text-[#8fb29d]">{tr("тем у маршруті", "topics in path")}</p></div><div className="border-l border-white/10 pl-4 sm:pl-6"><p className="text-2xl font-bold tracking-[-.05em] text-white">{practiceCount}</p><p className="mt-1 text-[11px] text-[#8fb29d]">{tr("практичних кроків", "practice steps")}</p></div><div className="border-l border-white/10 pl-4 sm:pl-6"><p className="text-2xl font-bold tracking-[-.05em] text-[#70edaf]">{completedTopics}</p><p className="mt-1 text-[11px] text-[#8fb29d]">{tr("тем завершено", "topics completed")}</p></div><div className="mt-4 border-l border-white/10 pl-4 sm:mt-0 sm:pl-6"><p className="text-2xl font-bold tracking-[-.05em] text-[#ffbf68]">{miniProjectNodes.length}</p><p className="mt-1 text-[11px] text-[#8fb29d]">{tr("мініпроєктів", "mini-projects")}</p></div></div>
        </div>
      </header>

      <div className="px-5 py-7 sm:px-8 sm:py-9">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#102619]/10 pb-5 dark:border-white/10"><div><p className="text-[11px] font-bold uppercase tracking-[.16em] text-[#147b47] dark:text-[#70edaf]">{tr("Маршрут курсу", "Course roadmap")}</p><h3 className="mt-2 text-2xl font-bold tracking-[-.04em] text-[#17231b] dark:text-[#edf4ef] sm:text-3xl">{tr("Теми, що складаються в навичку", "Topics that become a skill")}</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-[#65746a] dark:text-[#a5b4a9]">{tr("Кожен вузол поєднує пояснення, практику та наступний зрозумілий крок.", "Every node combines explanation, practice, and a clear next step.")}</p></div><span className="rounded-md border border-[#102619]/12 px-3 py-1.5 text-[11px] font-bold text-[#65746a] dark:border-white/10 dark:text-[#a5b4a9]">{completedTopics} / {topicNodes.length} {tr("готово", "complete")}</span></div>

      <div className="relative mt-8">
        <div className="relative space-y-5 lg:space-y-7">
          {roadmapNodes.map((node, index) => {
            const items = nodeItems(node);
            const completed = nodeCompleted(node);
            const locked = !courseIsActive || !roadmapNodes.slice(0, index).every(nodeCompleted);
            const started = items.some((item) => item.progress.status === "IN_PROGRESS");
            const progress = nodeScore(node);
            const previousNode = index > 0 ? roadmapNodes[index - 1] : null;
            const previousItems = previousNode ? nodeItems(previousNode) : [];
            const previousProgress = previousNode
              ? previousItems.length
                ? Math.round(previousItems.reduce((total, item) => total + itemScore(item), 0) / previousItems.length)
                : nodeCompleted(previousNode) ? 100 : 0
              : 0;
            const incomingThickRatio = Math.min(1, previousProgress / 100);
            const outgoingThickRatio = Math.min(1, progress / 100);
            const isSelected = selectedNodeId === node.id;
            const topicNumber = roadmapNodes.slice(0, index + 1).filter((candidate) => candidate.kind === "TOPIC").length;
            const parts = node.kind === "TOPIC" ? topicParts(node) : [];
            const projectNumber = node.kind === "PROJECT" ? projectNodes.findIndex((candidate) => candidate.id === node.id) + 1 : 0;
            const projectSpec = node.kind === "PROJECT" ? (node.item?.content.projectSpec as { estimatedMinutes?: number; skills?: unknown[] } | undefined) : undefined;
            const projectSkills = Array.isArray(projectSpec?.skills) ? projectSpec.skills.filter((skill): skill is string => typeof skill === "string").slice(0, 4) : [];
            const topicAccent = node.kind === "TOPIC" ? ["border-l-[#20a86b]", "border-l-[#3195a5]", "border-l-[#bd8837]"][Math.max(0, (topicNumber - 1) % 3)] : "";
            const Icon = completed ? CheckCircle2 : locked ? LockKeyhole : node.kind === "PROJECT" ? Rocket : node.kind === "MILESTONE" ? FileCheck2 : node.theory?.progress.status === "COMPLETED" ? Play : BookOpen;
            const status = completed
              ? tr("Завершено", "Completed")
              : locked
                ? tr("Заверши попередній вузол", "Complete the previous node")
              : node.kind === "TOPIC" && node.theory?.progress.status !== "COMPLETED"
                ? started
                  ? tr("Продовжити урок", "Continue lesson")
                  : tr("Відкрити урок", "Open lesson")
                : started
                  ? tr("Продовжити практику", "Continue practice")
                  : node.kind === "PROJECT"
                    ? tr("Відкрити мініпроєкт", "Open mini-project")
                    : tr("Відкрити практику", "Open practice");

            return <div key={node.id} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3 lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)] lg:gap-0">
              {index > 0 && renderRoadmapWave(incomingThickRatio, "absolute left-5 top-0 z-[1] block h-1/2 w-16 -translate-x-1/2 lg:left-1/2 lg:w-24")}
              {index < roadmapNodes.length - 1 && renderRoadmapWave(outgoingThickRatio, "absolute left-5 top-1/2 z-[1] block h-[calc(50%+1.25rem)] w-16 -translate-x-1/2 lg:left-1/2 lg:h-[calc(50%+1.75rem)] lg:w-24")}
              <div className="z-10 col-start-1 row-start-1 flex size-10 items-center justify-center rounded-full border-4 border-bg-surface bg-bg-base text-primary lg:col-start-2 lg:size-12">
                <Icon className="size-4 lg:size-5" />
              </div>
               <button type="button" disabled={locked} onClick={() => handleNodeClick(node, index)} className={`group relative col-start-2 row-start-1 min-w-0 overflow-hidden rounded-2xl border p-4 text-left transition-colors duration-200 ${index % 2 === 0 ? "lg:col-start-1" : "lg:col-start-3"} lg:p-5 ${node.kind === "TOPIC" ? `bg-bg-base ${topicAccent} border-l-4` : node.kind === "PROJECT" ? "border-l-4 border-l-[#bd8837] bg-[#bd8837]/[.04]" : "bg-bg-base"} ${completed ? "border-primary/35 bg-primary/[.04]" : locked ? "cursor-not-allowed border-border bg-bg-base/60 opacity-55" : isSelected ? "border-primary bg-primary/[.05]" : "border-border hover:border-primary/50 hover:bg-bg-surface"}`}>
                {node.kind === "TOPIC" && <div className="mb-3 flex items-center justify-between"><span className="flex size-8 items-center justify-center rounded-lg border border-border bg-bg-surface text-xs font-black text-primary">{String(topicNumber).padStart(2, "0")}</span><span className="rounded-md border border-border bg-bg-surface px-2.5 py-1 text-[11px] font-bold text-primary">{completed ? tr("Готово", "Done") : locked ? tr("Попереду", "Ahead") : tr("У фокусі", "In focus")}</span></div>}
                {node.kind === "PROJECT" && <div className="mb-3 flex items-center justify-between"><span className="flex size-8 items-center justify-center rounded-lg border border-[#bd8837]/35 bg-[#bd8837]/10 text-xs font-black text-[#bd8837] dark:text-[#ffbf68]">{String(projectNumber).padStart(2, "0")}</span><span className="rounded-md border border-[#bd8837]/30 bg-[#bd8837]/10 px-2.5 py-1 text-[11px] font-bold text-[#bd8837] dark:text-[#ffbf68]">{completed ? tr("Готово", "Done") : locked ? tr("Після тем", "After topics") : tr("Проєкт", "Project")}</span></div>}
                  <div className="flex items-start justify-between gap-3"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-text-secondary">{node.kind === "TOPIC" ? tr("Навчальний фокус", "Learning focus") : node.kind === "PROJECT" ? tr("Мініпроєкт", "Mini-project") : tr("Етап", "Milestone")}</span><span className="text-xs font-bold text-primary">{progress}%</span></div>
                 <h3 className="mt-2 line-clamp-2 font-bold text-text-primary">{node.kind === "PROJECT" ? projectTitle(node.title) : node.title}</h3>
                 {node.kind === "TOPIC" ? <>
                   <p className="mt-2 line-clamp-3 text-xs leading-5 text-text-secondary">{topicDescription(node)}</p>
                    {parts.length > 0 && <div className="mt-4 flex flex-wrap gap-2">
                      {parts.map((part) => <span key={part.label} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary"><span className="text-text-primary">{part.label}</span><span className="text-text-muted">·</span>{part.detail}</span>)}
                    </div>}
                   <p className="mt-3 text-xs font-semibold text-primary">{status}</p>
                  </> : <>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-text-secondary">{node.kind === "PROJECT" ? projectDescription(node.item) : status}</p>
                    {node.kind === "PROJECT" && <>{projectSkills.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{projectSkills.map((skill) => <span key={skill} className="rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary">{skill}</span>)}</div>}{typeof projectSpec?.estimatedMinutes === "number" && <p className="mt-3 text-[11px] font-semibold text-text-muted">~{projectSpec.estimatedMinutes} {tr("хв на проєкт", "min project estimate")}</p>}</>}
                    {node.kind === "PROJECT" && <p className="mt-3 text-xs font-semibold text-[#bd8837] dark:text-[#ffbf68]">{status}</p>}
                  </>}
                  {(items.length > 1 || node.kind === "PROJECT") && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
              </button>
            </div>;
          })}
        </div>
       </div>
       </div>
     </section>

    {selectedNode && selectedNode.kind !== "TOPIC" && <section className="mb-6 mt-6 rounded-2xl border border-primary/25 bg-bg-surface p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{selectedNode.kind === "PROJECT" ? tr("Практичний проєкт", "Practical project") : tr("Етап курсу", "Course milestone")}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{selectedNode.kind === "PROJECT" ? projectTitle(selectedNode.title) : selectedNode.title}</h2></div><button type="button" onClick={() => setSelectedNodeId(null)} className="rounded-xl border border-border p-2 text-text-secondary transition hover:text-text-primary" aria-label={tr("Закрити", "Close")}><X className="size-4" /></button></div>

      {selectedItem && selectedNode.kind === "MILESTONE" && <div className="mt-6">{markdownOf(selectedItem) && <div className="rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdownOf(selectedItem)} /></div>}<div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{selectedItem.progress.status === "COMPLETED" ? tr("Завершено", "Completed") : tr("Цей етап ще потрібно зарахувати.", "This milestone still needs to be completed.")}</span><button type="button" disabled={selectedItem.progress.status === "COMPLETED" || busyItem === selectedItem.id} onClick={() => void completeItem(selectedItem)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{selectedItem.progress.status === "COMPLETED" ? tr("Зараховано", "Completed") : tr("Завершити етап", "Complete milestone")}</button></div></div>}

      {selectedItem && selectedNode.kind === "PROJECT" && <div className="mt-6">{markdownOf(selectedItem) && <div className="rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdownOf(selectedItem)} /></div>}{projectLoadingId === selectedItem.id ? <div role="status" className="mt-5 rounded-2xl border border-border bg-bg-base p-4 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо дані проєкту…", "Loading project details…")}</div> : selectedProject?.projectSpec ? <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 sm:p-6"><div className="space-y-3">{selectedProject.projectSpec.milestones.map((milestone) => <label key={milestone.id} className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface p-3"><input type="checkbox" checked={selectedProject.progress.milestoneIds.includes(milestone.id)} onChange={(event) => updateProject(selectedItem.id, { milestoneIds: event.target.checked ? [...selectedProject.progress.milestoneIds, milestone.id] : selectedProject.progress.milestoneIds.filter((id) => id !== milestone.id) })} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b className="block text-text-primary">{milestone.title}</b><span className="text-text-secondary">{milestone.description}</span></span></label>)}</div><label className="mt-4 block text-sm font-bold text-text-primary">{tr("Нотатки реалізації", "Implementation notes")}<textarea value={selectedProject.progress.draft} onChange={(event) => updateProject(selectedItem.id, { draft: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label><label className="mt-4 block text-sm font-bold text-text-primary">README<textarea value={selectedProject.progress.readme} onChange={(event) => updateProject(selectedItem.id, { readme: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label>{selectedProject.projectSpec.checkSpec && <><label className="mt-4 block text-sm font-bold text-text-primary">Files JSON<textarea value={projectFiles[selectedItem.id] || ""} onChange={(event) => setProjectFiles((current) => ({ ...current, [selectedItem.id]: event.target.value }))} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-xs font-normal text-text-primary" /></label><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void checkProject(selectedItem)} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-45">{tr("Запустити перевірку", "Run check")}</button></>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void saveProject(selectedItem, false)} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-text-primary disabled:opacity-45"><Save className="mr-2 inline size-4" />{tr("Зберегти", "Save")}</button><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void saveProject(selectedItem, true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-45"><Send className="mr-2 inline size-4" />{tr("Подати", "Submit")}</button></div></div> : <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 text-sm text-text-secondary">{tr("Дані проєкту ще завантажуються або недоступні.", "Project details are still loading or unavailable.")}</div>}</div>}
    </section>}

    <Modal
      open={Boolean(selectedTopic)}
      onClose={() => setSelectedNodeId(null)}
      title={selectedTopic?.title ?? ""}
      description={selectedTopic ? topicDescription(selectedTopic) : undefined}
      panelClassName="!max-w-[720px]"
      bodyClassName="!p-0"
    >
      {selectedTopic && <div className="p-5 sm:p-7">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/[.06] p-4"><BarChart3 className="size-5 text-primary" /><p className="mt-3 text-3xl font-black text-text-primary">{selectedTopicAverage}%</p><p className="mt-1 text-xs text-text-secondary">{tr("результат теми", "topic result")}</p></div>
          <div className="rounded-2xl border border-border bg-bg-base p-4"><CheckCircle2 className="size-5 text-primary" /><p className="mt-3 text-3xl font-black text-text-primary">{selectedTopicCompleted}/{selectedTopicItems.length}</p><p className="mt-1 text-xs text-text-secondary">{tr("елементів завершено", "items completed")}</p></div>
          <div className="rounded-2xl border border-border bg-bg-base p-4"><Sparkles className="size-5 text-[#bd8837]" /><p className="mt-3 text-3xl font-black text-text-primary">{selectedTopic.practices.length}</p><p className="mt-1 text-xs text-text-secondary">{tr("практичних кроків", "practice steps")}</p></div>
        </div>

        <div className="mt-7 flex items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.16em] text-primary">{tr("Розклад результату", "Result breakdown")}</p><h3 className="mt-2 text-xl font-bold text-text-primary">{tr("Як пройдена тема", "How the topic is going")}</h3></div><span className="text-xs text-text-secondary">{selectedTopicAverage}%</span></div>
        <div className="mt-4 space-y-3">
          {selectedTopicItems.map((item, index) => {
            const score = itemScore(item);
            const isPractice = item.kind === "CODE_TASK";
            return <div key={item.id} className="rounded-2xl border border-border bg-bg-base p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-bg-surface text-xs font-black text-primary">{isPractice ? index : "T"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-text-primary">{item.title}</p><span className={`text-xs font-black ${score >= 60 ? "text-primary" : score > 0 ? "text-[#bd8837]" : "text-text-muted"}`}>{score > 0 || item.progress.status === "COMPLETED" ? `${score}%` : tr("Ще не оцінено", "Not graded yet")}</span></div><p className="mt-1 text-xs text-text-secondary">{isPractice ? tr("Практичне завдання", "Practice task") : tr("Теоретична база", "Theory foundation")}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${score}%` }} /></div></div></div></div>;
          })}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="text-xs leading-5 text-text-secondary">{tr("Оцінка теми формується з її елементів. Невдала спроба зменшує результат, але не відкриває наступну тему.", "The topic result is built from its items. A failed attempt lowers the result without unlocking the next topic.")}</p>{selectedTopicPractice && course && <button type="button" onClick={() => { const generate = selectedTopicPractice.progress.status !== "COMPLETED" ? "?generate=1" : ""; setSelectedNodeId(null); navigate(`/learning/course/${course.id}/practice/${selectedTopicPractice.id}${generate}`); }} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white"><Play className="size-4" />{selectedTopicPractice.progress.status === "COMPLETED" ? tr("Переглянути практику", "View practice") : tr("Продовжити тему", "Continue topic")}<ArrowLeft className="size-4 rotate-180" /></button>}</div>
      </div>}
    </Modal>

    <section className="mt-6 rounded-2xl border border-border bg-bg-surface p-6"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-5 text-primary" /><div className="flex-1"><h2 className="text-xl font-bold text-text-primary">{tr("Фінальна робота", "Final work")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{finalWork?.progress.status === "COMPLETED" ? tr("Фінальну роботу подано. Курс завершено.", "The final work was submitted. The course is complete.") : `${learningItemsCompleted} / ${learningItems.length} ${tr("навчальних елементів завершено", "learning items completed")}. ${tr("Заверши маршрут, потім подай фінальну роботу з описом рішення та перевіркою.", "Complete the path, then submit the final work with implementation notes and verification.")}`}</p>{finalWork && finalWork.progress.status !== "COMPLETED" && <button type="button" disabled={!canStartFinalWork} onClick={() => { setSelectedNodeId(`project-${finalWork.id}`); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{canStartFinalWork ? tr("Відкрити фінальну роботу", "Open final work") : tr("Заверши маршрут спочатку", "Complete the path first")}</button>}</div></div></section>
  </main>;
};

export default LearningCoursePage;
