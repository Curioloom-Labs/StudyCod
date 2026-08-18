import React from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Rocket,
  Save,
  Send,
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
import { tr } from "../../i18n";

type RoadmapNode = {
  id: string;
  kind: "TOPIC" | "PROJECT" | "MILESTONE";
  title: string;
  theory?: LearningCourseItem;
  practices: LearningCourseItem[];
  item?: LearningCourseItem;
};

function isProject(item: LearningCourseItem): boolean {
  return item.kind === "MANUAL" && Boolean((item.content as { project?: unknown }).project);
}

function markdownOf(item: LearningCourseItem | undefined): string {
  return typeof item?.content.markdown === "string" ? item.content.markdown : "";
}

export const LearningCoursePage: React.FC = () => {
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
  }, [courseId]);

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
    for (const item of allItems) {
      if (item.kind === "THEORY") {
        nodes.push({ id: `topic-${item.id}`, kind: "TOPIC", title: item.title, theory: item, practices: [] });
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
        nodes.push({ id: `project-${item.id}`, kind: "PROJECT", title: item.title, item, practices: [] });
        continue;
      }
      if (item.content.required !== false) {
        nodes.push({ id: `item-${item.id}`, kind: "MILESTONE", title: item.title, item, practices: [] });
      }
    }
    return nodes;
  }, [allItems]);

  const nodeItems = (node: RoadmapNode): LearningCourseItem[] =>
    node.kind === "TOPIC" && node.theory ? [node.theory, ...node.practices] : node.item ? [node.item] : [];

  const nodeCompleted = (node: RoadmapNode): boolean => {
    const items = nodeItems(node);
    return items.length > 0 && items.every((item) => item.progress.status === "COMPLETED");
  };

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
    if (!previousComplete || nodeCompleted(node)) return;

    if (node.kind === "TOPIC") {
      const nextPractice = node.practices.find((item) => item.progress.status !== "COMPLETED") ?? node.practices[0];
      if (nextPractice && course) {
        navigate(`/learning/course/${course.id}/practice/${nextPractice.id}?generate=1`);
        return;
      }
      setMessage(tr("Для цієї теми ще не підготовлено практику.", "Practice for this topic is not available yet."));
      return;
    }

    if (node.kind === "PROJECT" || node.kind === "MILESTONE") setSelectedNodeId(node.id);
  };

  const selectedNode = roadmapNodes.find((node) => node.id === selectedNodeId) ?? null;
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

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <nav aria-label={tr("Навігація курсу", "Course navigation")} className="mb-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-text-secondary">
      <button type="button" onClick={() => navigate("/learning/catalog")} className="rounded-lg px-2 py-1 transition hover:bg-bg-hover hover:text-text-primary">{tr("Каталог", "Catalog")}</button>
      <span aria-hidden="true">/</span>
      <span className="max-w-[min(70vw,32rem)] truncate text-text-primary">{course.title}</span>
    </nav>
    <button type="button" onClick={() => navigate("/learning/catalog")} className="mb-7 inline-flex items-center text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button>

    <header className="mb-8 rounded-[28px] border border-border bg-bg-surface p-6 shadow-sm sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{course.runtime} · {course.level}</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-text-primary">{course.title}</h1><p className="mt-3 max-w-3xl leading-7 text-text-secondary">{course.description}</p></div>
        <div className="min-w-[220px] rounded-2xl border border-primary/20 bg-primary/[.06] p-4">
          <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-[.12em] text-text-secondary">{tr("Прогрес курсу", "Course progress")}</span><strong className="text-2xl font-bold text-primary">{Math.round(course.enrollment.completionPercent)}%</strong></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-base"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, Math.max(0, course.enrollment.completionPercent))}%` }} /></div>
          <div className="mt-2 flex items-center justify-between gap-3 text-xs text-text-secondary"><span>{completedItems} / {requiredItems.length} {tr("елементів", "items")}</span><span>{course.enrollment.status === "AVAILABLE" ? tr("Не активовано", "Not active") : course.enrollment.status === "COMPLETED" ? tr("Завершено", "Completed") : tr("У процесі", "In progress")}</span></div>
        </div>
      </div>
      {!courseIsActive ? <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/10 p-4"><div><p className="font-bold text-text-primary">{tr("Цей курс ще не активовано", "This course is not active yet")}</p><p className="mt-1 text-sm text-text-secondary">{tr("Активація відкриє теорію, послідовний roadmap і контекстну практику.", "Activation unlocks theory, the ordered roadmap, and course-scoped practice.")}</p></div><button type="button" disabled={activating} onClick={() => void activateCourse()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{activating ? tr("Активуємо…", "Activating…") : tr("Активувати курс", "Activate course")}</button></div> : null}
      {message && <div role="status" aria-live="polite" className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div>}
      {error && <div role="alert" className="mt-6 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}
    </header>

    <section className="mb-6 rounded-[26px] border border-border bg-bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Теми курсу", "Course topics")}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{tr("Обирай тему для уроку та практики", "Choose a topic for its lesson and practice")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Натисни активну тему — відкриється окрема практика, де StudyCod підготує урок із теорією та робочим завданням.", "Choose an active topic to open its separate practice page, where StudyCod prepares the lesson theory and coding task.")}</p></div>
        <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{completedItems}/{requiredItems.length} {tr("елементів", "items")}</span>
      </div>

      <div className="relative mt-8">
        <div aria-hidden="true" className="absolute bottom-6 left-5 top-6 w-1 rounded-full bg-primary/15 lg:bottom-8 lg:left-1/2 lg:top-8 lg:-translate-x-1/2" />
        <div className="relative space-y-5 lg:space-y-7">
          {roadmapNodes.map((node, index) => {
            const items = nodeItems(node);
            const completed = nodeCompleted(node);
            const locked = !courseIsActive || !roadmapNodes.slice(0, index).every(nodeCompleted);
            const doneCount = items.filter((item) => item.progress.status === "COMPLETED").length;
            const started = items.some((item) => item.progress.status === "IN_PROGRESS");
            const touchedCount = items.filter((item) => item.progress.status !== "NOT_STARTED").length;
            const progress = items.length ? Math.round((touchedCount / items.length) * 100) : 0;
            const isSelected = selectedNodeId === node.id;
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
              <div className="z-10 col-start-1 row-start-1 flex size-10 items-center justify-center rounded-full border-4 border-bg-surface bg-bg-base text-primary shadow-sm lg:col-start-2 lg:size-12">
                <Icon className="size-4 lg:size-5" />
              </div>
              <button type="button" disabled={locked || completed} onClick={() => handleNodeClick(node, index)} className={`col-start-2 row-start-1 min-w-0 rounded-[24px] border p-4 text-left transition ${index % 2 === 0 ? "lg:col-start-1" : "lg:col-start-3"} lg:p-5 ${completed ? "border-primary/30 bg-primary/10" : locked ? "cursor-not-allowed border-border bg-bg-base/60 opacity-55" : isSelected ? "border-primary bg-primary/10 shadow-[0_12px_28px_-18px_rgba(0,160,91,.65)]" : "border-border bg-bg-base hover:-translate-y-0.5 hover:border-primary/50"}`}>
                <div className="flex items-start justify-between gap-3"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-text-secondary">{node.kind === "TOPIC" ? `${tr("Тема", "Topic")} ${index + 1}` : node.kind === "PROJECT" ? tr("Мініпроєкт", "Mini-project") : tr("Етап", "Milestone")}</span><span className="text-xs font-bold text-primary">{progress}%</span></div>
                <h3 className="mt-2 line-clamp-2 font-bold text-text-primary">{node.title}</h3>
                <p className="mt-2 text-xs leading-5 text-text-secondary">{status}</p>
                {items.length > 1 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>}
              </button>
            </div>;
          })}
        </div>
      </div>
    </section>

    {selectedNode && selectedNode.kind !== "TOPIC" && <section className="mb-6 rounded-[26px] border border-primary/25 bg-bg-surface p-5 shadow-sm sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{selectedNode.kind === "PROJECT" ? tr("Практичний проєкт", "Practical project") : tr("Етап курсу", "Course milestone")}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{selectedNode.title}</h2></div><button type="button" onClick={() => setSelectedNodeId(null)} className="rounded-xl border border-border p-2 text-text-secondary transition hover:text-text-primary" aria-label={tr("Закрити", "Close")}><X className="size-4" /></button></div>

      {selectedItem && selectedNode.kind === "MILESTONE" && <div className="mt-6">{markdownOf(selectedItem) && <div className="rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdownOf(selectedItem)} /></div>}<div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{selectedItem.progress.status === "COMPLETED" ? tr("Завершено", "Completed") : tr("Цей етап ще потрібно зарахувати.", "This milestone still needs to be completed.")}</span><button type="button" disabled={selectedItem.progress.status === "COMPLETED" || busyItem === selectedItem.id} onClick={() => void completeItem(selectedItem)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{selectedItem.progress.status === "COMPLETED" ? tr("Зараховано", "Completed") : tr("Завершити етап", "Complete milestone")}</button></div></div>}

      {selectedItem && selectedNode.kind === "PROJECT" && <div className="mt-6">{markdownOf(selectedItem) && <div className="rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdownOf(selectedItem)} /></div>}{projectLoadingId === selectedItem.id ? <div role="status" className="mt-5 rounded-2xl border border-border bg-bg-base p-4 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо дані проєкту…", "Loading project details…")}</div> : selectedProject?.projectSpec ? <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 sm:p-6"><div className="space-y-3">{selectedProject.projectSpec.milestones.map((milestone) => <label key={milestone.id} className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface p-3"><input type="checkbox" checked={selectedProject.progress.milestoneIds.includes(milestone.id)} onChange={(event) => updateProject(selectedItem.id, { milestoneIds: event.target.checked ? [...selectedProject.progress.milestoneIds, milestone.id] : selectedProject.progress.milestoneIds.filter((id) => id !== milestone.id) })} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b className="block text-text-primary">{milestone.title}</b><span className="text-text-secondary">{milestone.description}</span></span></label>)}</div><label className="mt-4 block text-sm font-bold text-text-primary">{tr("Нотатки реалізації", "Implementation notes")}<textarea value={selectedProject.progress.draft} onChange={(event) => updateProject(selectedItem.id, { draft: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label><label className="mt-4 block text-sm font-bold text-text-primary">README<textarea value={selectedProject.progress.readme} onChange={(event) => updateProject(selectedItem.id, { readme: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label>{selectedProject.projectSpec.checkSpec && <><label className="mt-4 block text-sm font-bold text-text-primary">Files JSON<textarea value={projectFiles[selectedItem.id] || ""} onChange={(event) => setProjectFiles((current) => ({ ...current, [selectedItem.id]: event.target.value }))} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-xs font-normal text-text-primary" /></label><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void checkProject(selectedItem)} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary disabled:opacity-45">{tr("Запустити перевірку", "Run check")}</button></>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void saveProject(selectedItem, false)} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-text-primary disabled:opacity-45"><Save className="mr-2 inline size-4" />{tr("Зберегти", "Save")}</button><button type="button" disabled={busyItem === selectedItem.id} onClick={() => void saveProject(selectedItem, true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-45"><Send className="mr-2 inline size-4" />{tr("Подати", "Submit")}</button></div></div> : <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 text-sm text-text-secondary">{tr("Дані проєкту ще завантажуються або недоступні.", "Project details are still loading or unavailable.")}</div>}</div>}
    </section>}

    <section className="mt-6 rounded-[26px] border border-border bg-bg-surface p-6 shadow-sm"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-5 text-primary" /><div className="flex-1"><h2 className="text-xl font-bold text-text-primary">{tr("Фінальна робота", "Final work")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{finalWork?.progress.status === "COMPLETED" ? tr("Фінальну роботу подано. Курс завершено.", "The final work was submitted. The course is complete.") : `${learningItemsCompleted} / ${learningItems.length} ${tr("навчальних елементів завершено", "learning items completed")}. ${tr("Заверши маршрут, потім подай фінальну роботу з описом рішення та перевіркою.", "Complete the path, then submit the final work with implementation notes and verification.")}`}</p>{finalWork && finalWork.progress.status !== "COMPLETED" && <button type="button" disabled={!canStartFinalWork} onClick={() => { setSelectedNodeId(`project-${finalWork.id}`); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); }} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-45">{canStartFinalWork ? tr("Відкрити фінальну роботу", "Open final work") : tr("Заверши маршрут спочатку", "Complete the path first")}</button>}</div></div></section>
  </main>;
};

export default LearningCoursePage;
