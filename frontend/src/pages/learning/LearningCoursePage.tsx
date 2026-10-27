import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
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
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  completeCatalogItem,
  enrollInCatalogCourse,
  getLearningCourse,
  type LearningCourse,
  type LearningCourseItem,
} from "../../lib/api/learningCatalog";
import { MarkdownView } from "../../components/MarkdownView";
import { Modal } from "../../components/ui/Modal";
import { tr } from "../../i18n";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { withDevPreview } from "../../lib/devPreview";

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
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyItem, setBusyItem] = React.useState<number | null>(null);
  const [activating, setActivating] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [celebratedNodeId, setCelebratedNodeId] = React.useState<string | null>(null);

  const load = React.useCallback(async (): Promise<LearningCourse | null> => {
    if (!courseId) return null;
    setLoading(true);
    try {
      const loaded = await getLearningCourse(Number(courseId));
      setCourse(loaded);
      setError(null);
      return loaded;
    } catch (caught: unknown) {
      const code = getErrorMessageFromUnknown(caught, "");
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
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "PREREQUISITES_INCOMPLETE"
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

  const roadmapNodeRefs = React.useRef<Record<string, HTMLLIElement | null>>({});

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
  const activeTopicNodeId = roadmapNodes.find((node) => node.kind === "TOPIC" && !nodeCompleted(node))?.id ?? null;
  const lastActiveTopicNodeId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (loading || !course) return;
    const previousActiveTopicNodeId = lastActiveTopicNodeId.current;
    lastActiveTopicNodeId.current = activeTopicNodeId;
    if (!previousActiveTopicNodeId || previousActiveTopicNodeId === activeTopicNodeId || focusPractice || selectedNodeId || !activeTopicNodeId) return;
    const frame = window.requestAnimationFrame(() => {
      roadmapNodeRefs.current[activeTopicNodeId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTopicNodeId, course, focusPractice, loading, selectedNodeId]);

  React.useEffect(() => {
    if (loading || !course || !focusPractice) return;
    if (nextPracticeItem) {
      navigate(withDevPreview(`/learning/course/${course.id}/practice/${nextPracticeItem.id}`), { replace: true });
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
      navigate(withDevPreview(`/learning/course/${course?.id ?? ""}/practice/${item.id}`));
      return;
    }
    if (item.kind === "QUIZ") {
      navigate(withDevPreview(`/learning/course/${course.id}/practice/${item.id}`));
      return;
    }
    setBusyItem(item.id);
    setMessage(null);
    setError(null);
    const completionNodeId = roadmapNodes.find((node) => nodeItems(node).some((nodeItem) => nodeItem.id === item.id))?.id ?? null;
    try {
      await completeCatalogItem(item.id);
      await load();
      setCelebratedNodeId(completionNodeId);
      setMessage(tr("Елемент курсу зараховано.", "Course item completed."));
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "THEORY_REQUIRED_BEFORE_PRACTICE"
        ? tr("Спочатку прочитай теорію цієї теми.", "Read this topic's theory first.")
        : tr("Не вдалося зарахувати елемент.", "Could not complete this item."));
    } finally {
      setBusyItem(null);
    }
  };

  const isNodeUnlocked = (node: RoadmapNode, index: number): boolean => courseIsActive && (node.kind === "PROJECT" && (node.requiredTopicKeys || []).length > 0
      ? (node.requiredTopicKeys || []).every((key) => {
          const prerequisite = roadmapNodes.find((candidate) => candidate.kind === "TOPIC" && candidate.topicKey === key);
          return Boolean(prerequisite && nodeCompleted(prerequisite));
        })
      : roadmapNodes.slice(0, index).every(nodeCompleted));

  const handleNodeClick = (node: RoadmapNode, index: number) => {
    if (!courseIsActive) {
      setMessage(tr("Активуй курс, щоб відкрити перший крок.", "Activate the course to open the first step."));
      return;
    }
    if (!isNodeUnlocked(node, index)) return;

    if (node.kind === "TOPIC") {
      setSelectedNodeId(node.id);
      return;
    }

    if (nodeCompleted(node) && node.item?.kind !== "QUIZ") return;
    if (node.kind === "PROJECT" && node.item) {
      navigate(withDevPreview(`/learning/course/${course.id}/practice/${node.item.id}`));
      return;
    }
    if (node.kind === "MILESTONE") setSelectedNodeId(node.id);
  };

  const recommendedNodeIndex = roadmapNodes.findIndex((node, index) => !nodeCompleted(node) && isNodeUnlocked(node, index));
  const recommendedNode = recommendedNodeIndex >= 0 ? roadmapNodes[recommendedNodeIndex] : null;
  const resumeCourse = () => {
    if (!courseIsActive) { void activateCourse(); return; }
    if (recommendedNode) { handleNodeClick(recommendedNode, recommendedNodeIndex); return; }
    if (finalWork && canStartFinalWork && course) {
      navigate(withDevPreview(`/learning/course/${course.id}/practice/${finalWork.id}`));
      return;
    }
    setMessage(tr("Маршрут завершено. Переглянь свої результати або обери інший курс.", "This route is complete. Review your results or choose another course."));
  };

  const selectedNode = roadmapNodes.find((node) => node.id === selectedNodeId) ?? null;
  const selectedTopic = selectedNode?.kind === "TOPIC" ? selectedNode : null;
  const selectedTopicItems = selectedTopic ? nodeItems(selectedTopic) : [];
  const selectedTopicAverage = selectedTopicItems.length
    ? Math.round(selectedTopicItems.reduce((total, item) => total + itemScore(item), 0) / selectedTopicItems.length)
    : 0;
  const selectedTopicCompleted = selectedTopicItems.filter((item) => item.progress.status === "COMPLETED").length;
  const selectedTopicPractice = selectedTopic?.practices.find((item) => item.progress.status !== "COMPLETED") ?? selectedTopic?.practices[0] ?? null;
  const selectedItem = selectedNode?.kind === "MILESTONE" ? selectedNode.item : undefined;

  if (loading) return <div role="status" aria-live="polite" className="mx-auto w-full min-w-0 max-w-5xl px-6 py-16 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо курс…", "Loading course…")}</div>;
  if (error && !course) return <main className="mx-auto w-full min-w-0 max-w-3xl px-6 py-12"><button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="mb-8 inline-flex items-center text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button><div role="alert" className="rounded-2xl border border-accent-error/30 bg-accent-error/10 p-5 text-sm text-accent-error"><p>{error}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-xl border border-current px-4 py-2 font-bold">{tr("Повторити", "Retry")}</button></div></main>;
  if (!course) return null;

  return <main className="mx-auto w-full min-w-0 max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-8">
    <nav aria-label={tr("Навігація курсу", "Course navigation")} className="mb-5 flex flex-wrap items-center gap-2 text-xs font-bold text-text-secondary">
      <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="inline-flex min-h-9 items-center gap-2 rounded-lg px-2 transition hover:bg-bg-hover hover:text-text-primary"><ArrowLeft size={15} aria-hidden="true" />{tr("Каталог", "Catalog")}</button>
      <span aria-hidden="true" className="text-text-muted">/</span><span className="max-w-[min(70vw,32rem)] truncate text-text-primary">{course.title}</span>
    </nav>

    {message && <div role="status" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-text-primary"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" /><p>{message}</p></div>}
    {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error"><p>{error}</p></div>}

    {!courseIsActive && <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent-warn/30 bg-accent-warn/[.07] p-4 sm:px-5"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-accent-warn" aria-hidden="true" /><div><p className="font-extrabold text-text-primary">{tr("Маршрут ще закритий", "This route is not active yet")}</p><p className="mt-1 text-sm leading-5 text-text-secondary">{tr("Активуй курс, щоб відкрити послідовність уроків і практики.", "Activate the course to open its sequence of lessons and practice.")}</p></div></div><button type="button" disabled={activating} onClick={() => void activateCourse()} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground transition hover:brightness-105 disabled:opacity-50">{activating ? tr("Активуємо…", "Activating…") : tr("Активувати курс", "Activate course")}<ArrowRight size={16} aria-hidden="true" /></button></div>}

    <header className="relative isolate mb-6 overflow-hidden rounded-[28px] border border-white/10 bg-[#17372d] text-[#f3f2e9] shadow-[0_24px_70px_rgba(8,24,17,.16)]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-36 size-[400px] rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute right-12 top-12 size-44 rounded-full border border-[#c4e58a]/20" />
      <div className="relative grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-7 lg:p-8">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[.17em] text-[#c4e58a]"><Route size={14} aria-hidden="true" /><span>{course.runtime}</span><span aria-hidden="true">·</span><span>{course.level === "FOUNDATION" ? tr("Фундамент", "Foundation") : course.level === "SPECIALIZATION" ? tr("Спеціалізація", "Specialization") : tr("Поглиблений рівень", "Advanced")}</span></div>
          <h1 className="mt-4 max-w-3xl break-words text-[clamp(2.5rem,5.2vw,4.5rem)] font-black leading-[.95] tracking-[-.07em]">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#d3ded4] sm:text-base">{course.description || tr("Послідовний маршрут від основ до самостійної практики.", "A structured path from foundations to independent practice.")}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/15 bg-white/[.05] px-3 py-1.5 text-xs font-bold">{course.runtime}</span>
            <span className="rounded-full border border-white/15 bg-white/[.05] px-3 py-1.5 text-xs font-bold">{topicNodes.length} {tr("тем", "topics")}</span>
            <span className="rounded-full border border-white/15 bg-white/[.05] px-3 py-1.5 text-xs font-bold">{practiceCount} {tr("практичних кроків", "practice steps")}</span>
          </div>
        </div>
        <aside className="rounded-[22px] border border-white/15 bg-[#10281f]/80 p-5 backdrop-blur-sm" aria-label={tr("Прогрес курсу", "Course progress")}>
          <div className="flex items-end justify-between gap-3"><span className="text-xs font-bold text-[#d3ded4]">{tr("Прогрес маршруту", "Path progress")}</span><strong className="text-5xl font-black leading-none tracking-[-.07em] text-[#c4e58a]">{Math.round(course.enrollment.completionPercent)}<small className="text-2xl">%</small></strong></div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#c4e58a] transition-[width] duration-300" style={{ width: `${Math.min(100, Math.max(0, course.enrollment.completionPercent))}%` }} /></div>
          <p className="mt-3 text-xs text-[#d3ded4]">{completedItems} / {requiredItems.length} {tr("обов’язкових елементів завершено", "required items completed")}</p>
          <button type="button" disabled={activating} onClick={resumeCourse} className="mt-5 inline-flex min-h-11 w-full items-center justify-between rounded-xl bg-[#c4e58a] px-4 text-sm font-extrabold text-[#17372d] transition hover:bg-[#d4f29e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-70">
            {activating ? tr("Активуємо…", "Activating…") : !courseIsActive ? tr("Відкрити маршрут", "Open this route") : recommendedNode ? tr("Наступний крок", "Next step") : canStartFinalWork ? tr("Фінальна робота", "Final project") : tr("Переглянути курс", "Review course")}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </aside>
      </div>
      <div className="relative grid grid-cols-2 border-t border-white/15 bg-black/[.08] sm:grid-cols-4">
        {[{ value: topicNodes.length, label: tr("тем", "topics") }, { value: practiceCount, label: tr("практичних кроків", "practice steps") }, { value: completedTopics, label: tr("тем завершено", "topics complete") }, { value: miniProjectNodes.length, label: tr("мініпроєктів", "mini-projects") }].map((metric, index) => <div key={metric.label} className={`px-5 py-3 sm:px-7 sm:py-3.5 ${index > 0 ? "border-l border-white/10" : ""} ${index > 1 ? "border-t border-white/10 sm:border-t-0" : ""}`}><p className="text-2xl font-black tabular-nums text-white">{metric.value}</p><p className="mt-1 text-[11px] font-semibold text-[#d3ded4]">{metric.label}</p></div>)}
      </div>
    </header>

    <section className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-7" aria-labelledby="course-route-heading">
      <aside className="rounded-[22px] border border-border bg-bg-surface p-5 lg:sticky lg:top-24">
        <p className="text-[10px] font-black uppercase tracking-[.17em] text-primary-strong dark:text-primary">{tr("Твій прогрес", "Your progress")}</p>
        <div className="mt-3 flex items-baseline gap-2"><strong className="text-4xl font-black tabular-nums tracking-[-.06em] text-text-primary">{completedTopics}</strong><span className="text-sm font-bold text-text-muted">/ {topicNodes.length} {tr("тем", "topics")}</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover"><div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${topicNodes.length ? Math.round(completedTopics / topicNodes.length * 100) : 0}%` }} /></div>
        <p className="mt-3 text-xs leading-5 text-text-secondary">{recommendedNode ? tr("Наступний доступний крок:", "Your next available step:") : tr("Усі кроки маршруту пройдено.", "You have completed every step on this route.")}</p>
        {recommendedNode && <div className="mt-2 rounded-xl bg-bg-base p-3"><p className="text-sm font-extrabold text-text-primary">{recommendedNode.title}</p><p className="mt-1 text-[11px] font-semibold text-primary">{recommendedNode.kind === "TOPIC" ? tr("Тема", "Topic") : recommendedNode.kind === "PROJECT" ? tr("Мініпроєкт", "Mini-project") : tr("Етап", "Milestone")}</p></div>}
        <button type="button" disabled={activating} onClick={resumeCourse} className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-border bg-bg-base px-3.5 text-left text-xs font-extrabold text-text-primary transition hover:border-primary/40 hover:bg-primary/[.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60">{!courseIsActive ? tr("Активувати курс", "Activate course") : recommendedNode ? tr("Перейти до кроку", "Go to this step") : tr("Курс завершено", "Course complete")}<ArrowRight size={15} aria-hidden="true" /></button>
        <div className="mt-5 border-t border-border pt-4 text-[11px] leading-5 text-text-muted">{tr("Порядок поєднує пояснення, практику й проєкти. Наступні кроки відкриваються після попередніх.", "The route combines explanations, practice, and projects. Later steps unlock as you complete earlier ones.")}</div>
      </aside>

      <div className="min-w-0 rounded-[22px] border border-border bg-bg-surface p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
          <div><p className="text-[10px] font-black uppercase tracking-[.17em] text-primary-strong dark:text-primary">{tr("Навчальний маршрут", "Learning route")}</p><h2 id="course-route-heading" className="mt-1 text-2xl font-black tracking-[-.04em] text-text-primary sm:text-3xl">{tr("Крок за кроком", "Step by step")}</h2><p className="mt-1 text-sm leading-5 text-text-secondary">{tr("Теорія відкриває практику. Практика закріплює тему.", "Theory unlocks practice. Practice makes each topic stick.")}</p></div>
          <span className="rounded-full border border-border bg-bg-base px-3 py-1.5 text-[11px] font-extrabold tabular-nums text-text-secondary">{completedItems}/{requiredItems.length} {tr("завершено", "complete")}</span>
        </div>

        <ol className="mt-5 space-y-3">
          {roadmapNodes.map((node, index) => {
            const items = nodeItems(node);
            const completed = nodeCompleted(node);
            const locked = !isNodeUnlocked(node, index);
            const started = items.some((item) => item.progress.status === "IN_PROGRESS");
            const progress = nodeScore(node);
            const isSelected = selectedNodeId === node.id;
            const topicNumber = roadmapNodes.slice(0, index + 1).filter((candidate) => candidate.kind === "TOPIC").length;
            const parts = node.kind === "TOPIC" ? topicParts(node) : [];
            const projectNumber = node.kind === "PROJECT" ? projectNodes.findIndex((candidate) => candidate.id === node.id) + 1 : 0;
            const projectSpec = node.kind === "PROJECT" ? (node.item?.content.projectSpec as { estimatedMinutes?: number; skills?: unknown[] } | undefined) : undefined;
            const projectSkills = Array.isArray(projectSpec?.skills) ? projectSpec.skills.filter((skill): skill is string => typeof skill === "string").slice(0, 4) : [];
            const Icon = completed ? CheckCircle2 : locked ? LockKeyhole : node.kind === "PROJECT" ? Rocket : node.kind === "MILESTONE" ? FileCheck2 : node.theory?.progress.status === "COMPLETED" ? Play : BookOpen;
            const status = completed
              ? tr("Завершено", "Completed")
              : locked
                ? tr("Заверши попередній вузол", "Complete the previous node")
                : node.kind === "TOPIC" && node.theory?.progress.status !== "COMPLETED"
                  ? started ? tr("Продовжити урок", "Continue lesson") : tr("Відкрити урок", "Open lesson")
                  : started
                    ? tr("Продовжити практику", "Continue practice")
                    : node.kind === "PROJECT"
                      ? tr("Відкрити мініпроєкт", "Open mini-project")
                      : node.kind === "MILESTONE" && node.item?.kind === "QUIZ" ? tr("Відкрити квіз", "Open quiz") : tr("Відкрити практику", "Open practice");

            return <li key={node.id} ref={(element) => { roadmapNodeRefs.current[node.id] = element; }} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 sm:gap-4">
              {index < roadmapNodes.length - 1 && <span aria-hidden="true" className="absolute bottom-[-.75rem] left-[19px] top-11 w-px bg-border" />}
              <span className={`relative z-[1] mt-4 flex size-10 items-center justify-center rounded-xl border bg-bg-base shadow-sm sm:size-11 ${completed ? "border-primary/40 text-primary" : locked ? "border-border text-text-muted" : node.kind === "PROJECT" ? "border-accent-warn/40 text-accent-warn" : "border-primary/30 text-primary"}`} aria-hidden="true"><Icon className="size-4 sm:size-[18px]" /></span>
              <button type="button" disabled={locked} onClick={() => handleNodeClick(node, index)} aria-current={isSelected ? "step" : undefined} className={`group min-w-0 rounded-2xl border p-4 text-left transition duration-200 active:translate-y-px sm:p-5 ${completed ? "border-primary/30 bg-primary/[.035]" : locked ? "cursor-not-allowed border-border bg-bg-base/50 opacity-65" : isSelected ? "border-primary/60 bg-primary/[.055] shadow-[0_8px_26px_rgba(31,119,82,.08)]" : "border-border bg-bg-base hover:border-primary/45 hover:bg-bg-surface"}`}>
                {celebratedNodeId === node.id ? <span aria-hidden="true" className="studycod-confetti pointer-events-none absolute inset-x-4 top-0 z-20 h-16" /> : null}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[.14em] text-text-muted">{node.kind === "TOPIC" ? <>{tr("Тема", "Topic")} {String(topicNumber).padStart(2, "0")}</> : node.kind === "PROJECT" ? <>{tr("Мініпроєкт", "Mini-project")} {String(projectNumber).padStart(2, "0")}</> : tr("Підсумок", "Milestone")}</span>
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${completed ? "text-primary" : locked ? "text-text-muted" : node.kind === "PROJECT" ? "text-accent-warn" : "text-primary"}`}><span className={`size-1.5 rounded-full ${completed ? "bg-primary" : locked ? "bg-text-muted" : node.kind === "PROJECT" ? "bg-accent-warn" : "bg-primary"}`} />{completed ? tr("Завершено", "Complete") : locked ? tr("Закрито", "Locked") : tr("Доступно", "Ready")}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 flex-1 text-base font-extrabold leading-6 text-text-primary sm:text-lg">{node.kind === "PROJECT" ? projectTitle(node.title) : node.title}</h3><span className="shrink-0 rounded-lg bg-bg-surface px-2.5 py-1 text-xs font-black tabular-nums text-text-secondary">{progress}%</span></div>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-text-secondary sm:text-sm sm:leading-6">{node.kind === "TOPIC" ? topicDescription(node) : node.kind === "PROJECT" ? projectDescription(node.item) : status}</p>
                {node.kind === "TOPIC" && parts.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{parts.map((part) => <span key={part.label} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary"><span className="text-text-primary">{part.label}</span><span aria-hidden="true" className="text-text-muted">·</span>{part.detail}</span>)}</div>}
                {node.kind === "PROJECT" && (projectSkills.length > 0 || typeof projectSpec?.estimatedMinutes === "number") && <div className="mt-4 flex flex-wrap items-center gap-2">{projectSkills.map((skill) => <span key={skill} className="rounded-lg border border-border bg-bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary">{skill}</span>)}{typeof projectSpec?.estimatedMinutes === "number" && <span className="text-[11px] font-semibold text-text-muted">~{projectSpec.estimatedMinutes} {tr("хв", "min")}</span>}</div>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"><span className={`text-xs font-bold ${node.kind === "PROJECT" && !completed && !locked ? "text-accent-warn" : "text-text-secondary"}`}>{status}</span><span className="inline-flex items-center gap-2 text-xs font-extrabold text-primary transition group-hover:gap-3">{locked ? tr("Виконай попереднє", "Finish previous step") : tr("Відкрити крок", "Open step")}<ArrowLeft className="size-3.5 rotate-180" aria-hidden="true" /></span></div>
                {(items.length > 1 || node.kind === "PROJECT") && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${progress}%` }} /></div>}
              </button>
            </li>;
          })}
        </ol>
      </div>
    </section>

    {selectedNode && selectedNode.kind !== "TOPIC" && <section className="mb-6 mt-6 rounded-2xl border border-primary/25 bg-bg-surface p-5 sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{selectedNode.kind === "PROJECT" ? tr("Практичний проєкт", "Practical project") : tr("Етап курсу", "Course milestone")}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{selectedNode.kind === "PROJECT" ? projectTitle(selectedNode.title) : selectedNode.title}</h2></div><button type="button" onClick={() => setSelectedNodeId(null)} className="rounded-xl border border-border p-2 text-text-secondary transition hover:text-text-primary" aria-label={tr("Закрити", "Close")}><X className="size-4" /></button></div>

      {selectedItem && selectedNode.kind === "MILESTONE" && <div className="mt-6">{markdownOf(selectedItem) && <div className="rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdownOf(selectedItem)} /></div>}<div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{selectedItem.progress.status === "COMPLETED" ? tr("Завершено", "Completed") : tr("Цей етап ще потрібно зарахувати.", "This milestone still needs to be completed.")}</span><button type="button" disabled={(selectedItem.progress.status === "COMPLETED" && selectedItem.kind !== "QUIZ") || busyItem === selectedItem.id} onClick={() => selectedItem.kind === "QUIZ" ? navigate(withDevPreview(`/learning/course/${course.id}/practice/${selectedItem.id}`)) : void completeItem(selectedItem)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-45">{selectedItem.kind === "QUIZ" ? selectedItem.progress.status === "COMPLETED" ? tr("Пройти ще раз", "Retake quiz") : tr("Відкрити квіз", "Open quiz") : selectedItem.progress.status === "COMPLETED" ? tr("Зараховано", "Completed") : tr("Завершити етап", "Complete milestone")}</button></div></div>}

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
          <div className="rounded-2xl border border-border bg-bg-base p-4"><Sparkles className="size-5 text-accent-warn" /><p className="mt-3 text-3xl font-black text-text-primary">{selectedTopic.practices.length}</p><p className="mt-1 text-xs text-text-secondary">{tr("практичних кроків", "practice steps")}</p></div>
        </div>

        <div className="mt-7 flex items-end justify-between gap-3"><div><p className="text-[11px] font-black uppercase tracking-[.16em] text-primary">{tr("Розклад результату", "Result breakdown")}</p><h3 className="mt-2 text-xl font-bold text-text-primary">{tr("Як пройдена тема", "How the topic is going")}</h3></div><span className="text-xs text-text-secondary">{selectedTopicAverage}%</span></div>
        <div className="mt-4 space-y-3">
          {selectedTopicItems.map((item, index) => {
            const score = itemScore(item);
            const isPractice = item.kind === "CODE_TASK";
            return <div key={item.id} className="rounded-2xl border border-border bg-bg-base p-4"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-bg-surface text-xs font-black text-primary">{isPractice ? index : "T"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-text-primary">{item.title}</p><span className={`text-xs font-black ${score >= 60 ? "text-primary" : score > 0 ? "text-accent-warn" : "text-text-muted"}`}>{score > 0 || item.progress.status === "COMPLETED" ? `${score}%` : tr("Ще не оцінено", "Not graded yet")}</span></div><p className="mt-1 text-xs text-text-secondary">{isPractice ? tr("Практичне завдання", "Practice task") : tr("Теоретична база", "Theory foundation")}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out" style={{ width: `${score}%` }} /></div></div></div></div>;
          })}
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="text-xs leading-5 text-text-secondary">{tr("Оцінка теми формується з її елементів. Невдала спроба зменшує результат, але не відкриває наступну тему.", "The topic result is built from its items. A failed attempt lowers the result without unlocking the next topic.")}</p>{selectedTopicPractice && course && <button type="button" onClick={() => { setSelectedNodeId(null); navigate(withDevPreview(`/learning/course/${course.id}/practice/${selectedTopicPractice.id}`)); }} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><Play className="size-4" />{selectedTopicPractice.progress.status === "COMPLETED" ? tr("Переглянути практику", "View practice") : tr("Відкрити практику", "Open practice")}<ArrowLeft className="size-4 rotate-180" /></button>}</div>
      </div>}
    </Modal>

    <section className="mt-6 rounded-2xl border border-border bg-bg-surface p-6"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-5 text-primary" /><div className="flex-1"><h2 className="text-xl font-bold text-text-primary">{tr("Фінальна робота", "Final work")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{finalWork?.progress.status === "COMPLETED" ? tr("Фінальну роботу подано. Курс завершено.", "The final work was submitted. The course is complete.") : `${learningItemsCompleted} / ${learningItems.length} ${tr("навчальних елементів завершено", "learning items completed")}. ${tr("Заверши маршрут, потім відкрий фінальну роботу у вкладці практики.", "Complete the path, then open the final work in the Practice tab.")}`}</p>{finalWork && finalWork.progress.status !== "COMPLETED" && <button type="button" disabled={!canStartFinalWork} onClick={() => navigate(withDevPreview(`/learning/course/${course.id}/practice/${finalWork.id}`))} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45">{canStartFinalWork ? tr("Відкрити фінальну роботу", "Open final work") : tr("Заверши маршрут спочатку", "Complete the path first")}</button>}</div></div></section>
  </main>;
};

export default LearningCoursePage;
