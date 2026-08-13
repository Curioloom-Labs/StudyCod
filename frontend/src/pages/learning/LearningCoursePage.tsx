import React from "react";
import { ArrowLeft, BookOpen, CheckCircle2, ClipboardCheck, Code2, LoaderCircle, LockKeyhole, Play, Rocket, Save, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { checkCatalogProject, completeCatalogItem, getCatalogProject, getLearningCourse, saveCatalogProject, submitCatalogProject, submitFinalAssessment, type LearningCourse, type LearningCourseItem, type LearningProject } from "../../lib/api/learningCatalog";
import { MarkdownView } from "../../components/MarkdownView";
import { tr } from "../../i18n";

type RoadmapNode = { id: string; theory: LearningCourseItem; practices: LearningCourseItem[] };

function isProject(item: LearningCourseItem): boolean {
  return item.kind === "MANUAL" && Boolean((item.content as any)?.project);
}

export const LearningCoursePage: React.FC = () => {
  const navigate = useNavigate();
  const { courseId } = useParams<{ courseId: string }>();
  const [course, setCourse] = React.useState<LearningCourse | null>(null);
  const [projects, setProjects] = React.useState<Record<number, LearningProject>>({});
  const [projectFiles, setProjectFiles] = React.useState<Record<number, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [busyItem, setBusyItem] = React.useState<number | null>(null);
  const [assessmentScore, setAssessmentScore] = React.useState("80");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const loaded = await getLearningCourse(Number(courseId));
      setCourse(loaded);
      const projectItems = loaded.modules.flatMap((module) => module.items).filter(isProject);
      const entries = await Promise.all(projectItems.map(async (item) => {
        try { return [item.id, await getCatalogProject(item.id)] as const; } catch { return null; }
      }));
      setProjects(Object.fromEntries(entries.filter((entry): entry is readonly [number, LearningProject] => Boolean(entry))));
      setError(null);
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку заверши необхідні базові курси.", "Complete the required foundation courses first.")
        : code === "COURSE_NOT_ENROLLED"
          ? tr("Спочатку відкрий курс із каталогу.", "Open the course from the catalog first.")
          : tr("Не вдалося завантажити курс.", "Could not load the course."));
    } finally { setLoading(false); }
  }, [courseId]);

  React.useEffect(() => { void load(); }, [load]);

  const allItems = course?.modules.flatMap((module) => module.items) ?? [];

  const completeItem = async (item: LearningCourseItem) => {
    if (item.progress.status === "COMPLETED") return;
    if (item.kind === "CODE_TASK") {
      const theoryId = Number(item.content.theoryItemId || 0);
      const theoryDone = theoryId <= 0 || allItems.some((candidate) => candidate.id === theoryId && candidate.progress.status === "COMPLETED");
      if (!theoryDone) { setError(tr("Спочатку прочитай і заверши теорію цієї теми.", "Read and complete this topic's theory first.")); return; }
      navigate(`/tasks?courseId=${course?.id ?? ""}&courseItemId=${item.id}&generate=1`);
      return;
    }
    setBusyItem(item.id); setMessage(null); setError(null);
    try {
      await completeCatalogItem(item.id);
      await load();
      setMessage(tr("Елемент курсу зараховано.", "Course item completed."));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "THEORY_REQUIRED_BEFORE_PRACTICE"
        ? tr("Спочатку прочитай теорію цієї теми.", "Read this topic's theory first.")
        : tr("Не вдалося зарахувати елемент.", "Could not complete this item."));
    } finally { setBusyItem(null); }
  };

  const updateProject = (itemId: number, patch: Partial<LearningProject["progress"]>) => {
    setProjects((current) => current[itemId] ? { ...current, [itemId]: { ...current[itemId], progress: { ...current[itemId].progress, ...patch } } } : current);
  };

  const saveProject = async (item: LearningCourseItem, submit: boolean) => {
    const project = projects[item.id];
    if (!project) return;
    setBusyItem(item.id); setError(null); setMessage(null);
    try {
      const input = { milestoneIds: project.progress.milestoneIds, draft: project.progress.draft, readme: project.progress.readme };
      const response = submit ? await submitCatalogProject(item.id, input) : await saveCatalogProject(item.id, input);
      if (response?.project) setProjects((current) => ({ ...current, [item.id]: response.project }));
      if (submit) await load();
      setMessage(submit ? tr("Мініпроєкт подано.", "Mini-project submitted.") : tr("Чернетку збережено.", "Draft saved."));
    } catch (caught: any) { setError(caught?.response?.data?.message === "PROJECT_REQUIREMENTS_INCOMPLETE" ? tr("Заповни всі етапи, опис реалізації та README.", "Complete all milestones, implementation notes, and README.") : tr("Не вдалося зберегти мініпроєкт.", "Could not save the mini-project.")); }
    finally { setBusyItem(null); }
  };

  const checkProject = async (item: LearningCourseItem) => {
    let files: Array<{ path: string; content: string }>;
    try { const parsed = JSON.parse(projectFiles[item.id] || ""); if (!Array.isArray(parsed)) throw new Error(); files = parsed; }
    catch { setError(tr("Встав JSON-масив файлів для перевірки.", "Paste a JSON array of files for the check.")); return; }
    setBusyItem(item.id); setError(null);
    try { const result = await checkCatalogProject(item.id, files); setMessage(result?.passed ? tr("Перевірку проєкту пройдено.", "Project check passed.") : tr("Перевірку не пройдено.", "Project check failed.")); }
    catch { setError(tr("Не вдалося запустити ізольовану перевірку.", "Could not start the isolated project check.")); }
    finally { setBusyItem(null); }
  };

  const finishAssessment = async () => {
    if (!course) return;
    const score = Number(assessmentScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) { setError(tr("Введи результат від 0 до 100.", "Enter a score from 0 to 100.")); return; }
    try { await submitFinalAssessment(course.enrollment.id, score); await load(); setMessage(score >= 70 ? tr("Курс завершено.", "Course completed.") : tr("Потрібно щонайменше 70%.", "You need at least 70%.")); }
    catch (caught: any) { setError(caught?.response?.data?.message === "COURSE_ITEMS_INCOMPLETE" ? tr("Заверши всі обов'язкові елементи курсу.", "Complete all required course items first.") : tr("Не вдалося зберегти результат.", "Could not save the result.")); }
  };

  if (loading) return <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо курс…", "Loading course…")}</div>;
  if (error && !course) return <main className="mx-auto max-w-3xl px-6 py-12"><button type="button" onClick={() => navigate("/learning/catalog")} className="mb-8 text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button><div className="rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div></main>;
  if (!course) return null;

  const requiredItems = allItems.filter((item) => item.content.required !== false);
  const completedItems = requiredItems.filter((item) => item.progress.status === "COMPLETED").length;
  const canAssess = requiredItems.length > 0 && completedItems === requiredItems.length;
  const roadmapNodes: RoadmapNode[] = [];
  for (const item of allItems) {
    if (item.kind === "THEORY") roadmapNodes.push({ id: `theory-${item.id}`, theory: item, practices: [] });
    if (item.kind === "CODE_TASK") {
      const theoryId = Number(item.content.theoryItemId || 0);
      const target = (theoryId > 0 ? roadmapNodes.find((node) => node.theory.id === theoryId) : null) ?? roadmapNodes[roadmapNodes.length - 1];
      if (target) target.practices.push(item); else roadmapNodes.push({ id: `practice-${item.id}`, theory: item, practices: [] });
    }
  }

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <button type="button" onClick={() => navigate("/learning/catalog")} className="mb-7 text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button>
    <header className="mb-8 rounded-[28px] border border-border bg-bg-surface p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{course.runtime} · {course.level}</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-text-primary">{course.title}</h1><p className="mt-3 max-w-3xl leading-7 text-text-secondary">{course.description}</p></div><div className="rounded-2xl bg-primary/10 px-4 py-3 text-center"><div className="text-2xl font-bold text-primary">{Math.round(course.enrollment.completionPercent)}%</div><div className="text-xs text-text-secondary">{tr("прогрес", "progress")}</div></div></div>{message && <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div>}{error && <div className="mt-6 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}</header>

    <section className="mb-6 rounded-[26px] border border-border bg-bg-surface p-5 shadow-sm sm:p-7"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Твій маршрут", "Your path")}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{tr("Рухайся темами послідовно", "Move through topics in order")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Спочатку заверши теорію, потім натисни тему — StudyCod відкриє Практику і сам згенерує завдання саме для цього пункту.", "Complete the theory first, then choose a topic — StudyCod opens Practice and generates a task for this exact roadmap item.")}</p></div><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{completedItems}/{requiredItems.length} {tr("елементів", "items")}</span></div><div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">{roadmapNodes.map((node, index) => { const theoryDone = node.theory.progress.status === "COMPLETED"; const practiceDone = node.practices.length === 0 || node.practices.every((item) => item.progress.status === "COMPLETED"); const completed = theoryDone && practiceDone; const nodePosition = allItems.indexOf(node.theory); const previousComplete = allItems.slice(0, Math.max(0, nodePosition)).filter((item) => item.content.required !== false).every((item) => item.progress.status === "COMPLETED"); const locked = !previousComplete; const nextPractice = node.practices.find((item) => item.progress.status !== "COMPLETED"); const clickable = !locked && theoryDone && Boolean(nextPractice); return <button key={node.id} type="button" disabled={locked || completed} onClick={() => { if (clickable && nextPractice) navigate(`/tasks?courseId=${course.id}&courseItemId=${nextPractice.id}&generate=1`); }} className={`rounded-2xl border p-4 text-left transition ${completed ? "border-primary/30 bg-primary/10" : locked ? "cursor-not-allowed border-border bg-bg-base/60 opacity-60" : clickable ? "border-secondary/35 bg-secondary/10 hover:-translate-y-0.5 hover:border-secondary" : "border-border bg-bg-base hover:border-primary/40"}`}><div className="flex items-start justify-between gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-surface text-primary">{completed ? <CheckCircle2 className="size-5" /> : locked ? <LockKeyhole className="size-4" /> : theoryDone ? <Play className="size-4" /> : <BookOpen className="size-4" />}</span><span className="text-[11px] font-bold uppercase tracking-[.12em] text-text-secondary">{tr("Тема", "Topic")} {index + 1}</span></div><h3 className="mt-4 line-clamp-2 font-bold text-text-primary">{node.theory.title}</h3><p className="mt-2 text-xs leading-5 text-text-secondary">{completed ? tr("Тему завершено", "Topic completed") : locked ? tr("Заверш попередню тему", "Complete the previous topic") : !theoryDone ? tr("Спочатку теорія", "Theory first") : tr("Відкрити Практику · Нове завдання", "Open Practice · New task")}</p>{node.practices.length > 0 && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-surface"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((node.practices.filter((item) => item.progress.status === "COMPLETED").length / node.practices.length) * 100)}%` }} /></div>}</button>; })}</div></section>

    <div className="space-y-5">{course.modules.map((module, moduleIndex) => <section key={module.id} className="overflow-hidden rounded-[26px] border border-border bg-bg-surface shadow-sm"><div className="border-b border-border px-5 py-5 sm:px-7"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Модуль", "Module")} {moduleIndex + 1}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{module.title}</h2></div><div className="divide-y divide-border">{module.items.map((item) => { const completed = item.progress.status === "COMPLETED"; const markdown = typeof item.content.markdown === "string" ? item.content.markdown : ""; const project = isProject(item) ? projects[item.id] : null; const projectSpec = project?.projectSpec; return <article key={item.id} className="px-5 py-6 sm:px-7"><div className="flex items-start gap-3"><div className="mt-0.5 text-primary">{completed ? <CheckCircle2 className="size-5" /> : isProject(item) ? <Rocket className="size-5" /> : item.kind === "THEORY" ? <BookOpen className="size-5" /> : <Code2 className="size-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-text-primary">{item.title}</h3><span className="rounded-full bg-bg-code px-2 py-1 text-[11px] font-bold text-text-secondary">{item.kind}</span></div>{(item.kind === "THEORY" || isProject(item)) && markdown && <div className="mt-4 rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdown} /></div>}{item.kind === "CODE_TASK" && <div className="mt-4 rounded-2xl border border-secondary/25 bg-secondary/10 p-4 text-sm leading-6 text-text-primary"><Code2 className="mr-2 inline size-4 text-secondary" />{tr("Це завдання буде згенеровано в Практиці після завершення теорії.", "This task will be generated in Practice after the theory is completed.")}</div>}{isProject(item) && project && projectSpec && <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 sm:p-6"><div className="space-y-3">{projectSpec.milestones.map((milestone) => <label key={milestone.id} className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface p-3"><input type="checkbox" checked={project.progress.milestoneIds.includes(milestone.id)} onChange={(event) => updateProject(item.id, { milestoneIds: event.target.checked ? [...project.progress.milestoneIds, milestone.id] : project.progress.milestoneIds.filter((id) => id !== milestone.id) })} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b className="block text-text-primary">{milestone.title}</b><span className="text-text-secondary">{milestone.description}</span></span></label>)}</div><label className="mt-4 block text-sm font-bold text-text-primary">Implementation notes<textarea value={project.progress.draft} onChange={(event) => updateProject(item.id, { draft: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label><label className="mt-4 block text-sm font-bold text-text-primary">README<textarea value={project.progress.readme} onChange={(event) => updateProject(item.id, { readme: event.target.value })} className="mt-2 min-h-24 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm font-normal text-text-primary" /></label>{projectSpec.checkSpec && <><label className="mt-4 block text-sm font-bold text-text-primary">Files JSON<textarea value={projectFiles[item.id] || ""} onChange={(event) => setProjectFiles((current) => ({ ...current, [item.id]: event.target.value }))} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 text-xs font-normal text-text-primary" /></label><button type="button" onClick={() => void checkProject(item)} className="rounded-xl border border-primary px-4 py-2 text-sm font-bold text-primary">{tr("Запустити перевірку", "Run check")}</button></>}<div className="mt-4 flex gap-3"><button type="button" disabled={busyItem === item.id} onClick={() => void saveProject(item, false)} className="rounded-xl border border-border px-4 py-2 text-sm font-bold text-text-primary"><Save className="mr-2 inline size-4" />{tr("Зберегти", "Save")}</button><button type="button" disabled={busyItem === item.id} onClick={() => void saveProject(item, true)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"><Send className="mr-2 inline size-4" />{tr("Подати", "Submit")}</button></div></div>}{!isProject(item) && <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{completed ? tr("Завершено", "Completed") : tr("Не завершено", "Not completed")}</span><button type="button" disabled={completed || busyItem === item.id} onClick={() => void completeItem(item)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-45">{completed ? tr("Зараховано", "Completed") : item.kind === "CODE_TASK" ? tr("Відкрити Практику", "Open Practice") : tr("Завершити", "Complete")}</button></div>}</div></div></article>; })}</div></section>)}</div>

    <section className="mt-6 rounded-[26px] border border-border bg-bg-surface p-6 shadow-sm"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-5 text-primary" /><div className="flex-1"><h2 className="text-xl font-bold text-text-primary">{tr("Фінальна перевірка", "Final assessment")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{canAssess ? tr("Усі обов'язкові елементи завершено. Для завершення курсу потрібно щонайменше 70%.", "All required items are complete. You need at least 70% to finish the course.") : `${completedItems} / ${requiredItems.length} ${tr("обов'язкових елементів завершено", "required items completed")}.`}</p>{canAssess && <div className="mt-5 flex gap-3"><input type="number" min="0" max="100" value={assessmentScore} onChange={(event) => setAssessmentScore(event.target.value)} className="w-28 rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary" /><button type="button" onClick={() => void finishAssessment()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{tr("Завершити курс", "Complete course")}</button></div>}</div></div></section>
  </main>;
};

export default LearningCoursePage;
