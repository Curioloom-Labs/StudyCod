import React from "react";
import { ArrowLeft, CheckCircle2, Circle, ClipboardCheck, Code2, LoaderCircle, Rocket, Save, Send } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { checkCatalogProject, completeCatalogItem, getCatalogProject, getLearningCourse, saveCatalogProject, submitCatalogProject, submitFinalAssessment, type LearningCourse, type LearningCourseItem, type LearningProject } from "../../lib/api/learningCatalog";
import { MarkdownView } from "../../components/MarkdownView";
import { tr } from "../../i18n";

function itemLabel(item: LearningCourseItem): string {
  if (item.kind === "THEORY") return tr("Теорія", "Theory");
  if (item.kind === "CODE_TASK") return tr("Практика", "Practice");
  if (item.kind === "QUIZ") return tr("Перевірка", "Quiz");
  if (item.kind === "MANUAL" && Boolean((item.content as any)?.project)) return tr("Мініпроєкт", "Mini-project");
  return item.kind;
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
      const loadedCourse = await getLearningCourse(Number(courseId));
      setCourse(loadedCourse);
      const projectItems = loadedCourse.modules.flatMap((module) => module.items).filter((item) => item.kind === "MANUAL" && Boolean((item.content as any)?.project));
      const entries = await Promise.all(projectItems.map(async (item) => {
        try { return [item.id, await getCatalogProject(item.id)] as const; } catch { return null; }
      }));
      setProjects(Object.fromEntries(entries.filter((entry): entry is readonly [number, LearningProject] => Boolean(entry))));
      setError(null);
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку завершіть необхідні базові курси.", "Complete the required foundation courses first.")
        : code === "COURSE_NOT_ENROLLED"
          ? tr("Спочатку відкрийте курс у каталозі.", "Open the course from the catalog first.")
          : tr("Не вдалося завантажити курс.", "Could not load the course."));
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  React.useEffect(() => { void load(); }, [load]);

  const completeItem = async (item: LearningCourseItem) => {
    if (item.progress.status === "COMPLETED") return;
    setBusyItem(item.id);
    setMessage(null);
    setError(null);
    try {
      await completeCatalogItem(item.id, item.kind === "CODE_TASK" ? 100 : undefined);
      await load();
      setMessage(item.kind === "THEORY"
        ? tr("Теорію зараховано. Практику відкрито.", "Theory completed. Practice is now unlocked.")
        : tr("Елемент зараховано.", "Item completed."));
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "THEORY_REQUIRED_BEFORE_PRACTICE"
        ? tr("Спочатку прочитайте теорію цієї теми.", "Read this topic's theory before starting practice.")
        : code === "PROJECT_SUBMISSION_REQUIRED"
          ? tr("Мініпроєкт завершується через етапи, код і README у робочій панелі.", "Submit the mini-project through its milestones, code, and README.")
          : tr("Не вдалося зарахувати елемент.", "Could not complete this item."));
    } finally {
      setBusyItem(null);
    }
  };

  const updateProject = (itemId: number, patch: Partial<LearningProject["progress"]>) => {
    setProjects((current) => {
      const project = current[itemId];
      if (!project) return current;
      return { ...current, [itemId]: { ...project, progress: { ...project.progress, ...patch } } };
    });
  };

  const saveProject = async (item: LearningCourseItem, submit: boolean) => {
    const project = projects[item.id];
    if (!project) return;
    setBusyItem(item.id);
    setMessage(null);
    setError(null);
    const input = { milestoneIds: project.progress.milestoneIds, draft: project.progress.draft, readme: project.progress.readme };
    try {
      const response = submit ? await submitCatalogProject(item.id, input) : await saveCatalogProject(item.id, input);
      if (response?.project) setProjects((current) => ({ ...current, [item.id]: response.project }));
      if (submit) await load();
      setMessage(submit
        ? tr("Мініпроєкт подано. Його етапи враховано в прогресі курсу.", "Mini-project submitted. Its milestones now count toward course progress.")
        : tr("Чернетку мініпроєкту збережено.", "Mini-project draft saved."));
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "PROJECT_REQUIREMENTS_INCOMPLETE"
        ? tr("Для подання відмітьте всі етапи та заповніть опис реалізації й README.", "Mark every milestone and fill in implementation notes and README before submitting.")
        : tr("Не вдалося зберегти мініпроєкт.", "Could not save the mini-project."));
    } finally {
      setBusyItem(null);
    }
  };

  const checkProject = async (item: LearningCourseItem) => {
    const raw = projectFiles[item.id] || "";
    let files: Array<{ path: string; content: string }>;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("not-array");
      files = parsed;
    } catch {
      setError(tr("Вставте файли як JSON-масив [{\"path\":\"app/__init__.py\",\"content\":\"...\"}].", "Paste files as a JSON array [{\"path\":\"app/__init__.py\",\"content\":\"...\"}]."));
      return;
    }
    setBusyItem(item.id);
    setMessage(null);
    setError(null);
    try {
      const result = await checkCatalogProject(item.id, files);
      setMessage(result?.passed
        ? tr("Перевірку проєкту пройдено: код імпортується й безпечно виконується в ізольованому тесті.", "Project check passed: the code imports and runs in an isolated test.")
        : tr(`Перевірку не пройдено (${result?.verdict || "помилка"}). Перегляньте код і спробуйте ще раз.`, `Project check failed (${result?.verdict || "error"}). Review the code and try again.`));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PROJECT_CHECK_NOT_CONFIGURED"
        ? tr("Для цього проєкту автоматична перевірка ще не налаштована.", "Automated checking is not configured for this project yet.")
        : tr("Не вдалося запустити ізольовану перевірку.", "Could not start the isolated project check."));
    } finally {
      setBusyItem(null);
    }
  };

  const finishAssessment = async () => {
    if (!course) return;
    const score = Number(assessmentScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      setError(tr("Введіть результат від 0 до 100.", "Enter a score from 0 to 100."));
      return;
    }
    setError(null);
    try {
      await submitFinalAssessment(course.enrollment.id, score);
      await load();
      setMessage(score >= 70
        ? tr("Курс завершено. Наступні курси розблоковано.", "Course completed. The next courses are unlocked.")
        : tr("Результат нижче 70%. Спробуйте фінальну перевірку ще раз.", "The score is below 70%. Try the final assessment again."));
    } catch (caught: any) {
      const code = caught?.response?.data?.message;
      setError(code === "COURSE_ITEMS_INCOMPLETE"
        ? tr("Завершіть усі обов'язкові елементи курсу.", "Complete all required course items first.")
        : tr("Не вдалося зберегти результат.", "Could not save the result."));
    }
  };

  if (loading) return <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо курс…", "Loading course…")}</div>;
  if (error && !course) return <main className="mx-auto max-w-3xl px-6 py-12"><button type="button" onClick={() => navigate("/learning/catalog")} className="mb-8 text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button><div className="rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div></main>;
  if (!course) return null;

  const allItems = course.modules.flatMap((module) => module.items);
  const requiredItems = allItems.filter((item) => item.content.required !== false);
  const completedItems = requiredItems.filter((item) => item.progress.status === "COMPLETED").length;
  const canAssess = requiredItems.length > 0 && completedItems === requiredItems.length;

  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <button type="button" onClick={() => navigate("/learning/catalog")} className="mb-7 text-sm font-bold text-primary"><ArrowLeft className="mr-2 inline size-4" />{tr("До каталогу", "Back to catalog")}</button>
    <header className="mb-8 rounded-[28px] border border-border bg-bg-surface p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{course.runtime} · {course.level}</p><h1 className="mt-3 text-4xl font-bold tracking-tight text-text-primary">{course.title}</h1><p className="mt-3 max-w-3xl leading-7 text-text-secondary">{course.description}</p></div><div className="rounded-2xl bg-primary/10 px-4 py-3 text-center"><div className="text-2xl font-bold text-primary">{Math.round(course.enrollment.completionPercent)}%</div><div className="text-xs text-text-secondary">{tr("прогрес", "progress")}</div></div></div>{message && <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-primary">{message}</div>}{error && <div className="mt-6 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}</header>

    <div className="space-y-5">{course.modules.map((module, moduleIndex) => <section key={module.id} className="overflow-hidden rounded-[26px] border border-border bg-bg-surface shadow-sm"><div className="border-b border-border px-5 py-5 sm:px-7"><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Модуль", "Module")} {moduleIndex + 1}</p><h2 className="mt-1 text-2xl font-bold text-text-primary">{module.title}</h2></div><div className="divide-y divide-border">{module.items.map((item) => {
      const completed = item.progress.status === "COMPLETED";
      const theoryId = Number(item.content.theoryItemId || 0);
      const theoryDone = theoryId > 0 && allItems.some((candidate) => candidate.id === theoryId && candidate.progress.status === "COMPLETED");
      const practiceLocked = item.kind === "CODE_TASK" && theoryId > 0 && !theoryDone;
      const markdown = typeof item.content.markdown === "string" ? item.content.markdown : "";
      const project = item.kind === "MANUAL" && Boolean((item.content as any)?.project) ? projects[item.id] : null;
      const projectSpec = project?.projectSpec;
      return <article key={item.id} className="px-5 py-6 sm:px-7"><div className="flex items-start gap-3"><div className="mt-0.5 text-primary">{completed ? <CheckCircle2 className="size-5" /> : item.kind === "THEORY" ? <Circle className="size-5" /> : item.kind === "MANUAL" && Boolean((item.content as any)?.project) ? <Rocket className="size-5" /> : <Code2 className="size-5" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-text-primary">{item.title}</h3><span className="rounded-full bg-bg-code px-2 py-1 text-[11px] font-bold text-text-secondary">{itemLabel(item)}</span></div>
        {item.kind === "THEORY" && markdown && <div className="mt-4 rounded-2xl bg-bg-code/35 p-4 sm:p-6"><MarkdownView content={markdown} /></div>}
        {item.kind === "MANUAL" && Boolean((item.content as any)?.project) && markdown && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-6"><div className="mb-4 flex items-center gap-2 text-sm font-bold text-primary"><Rocket className="size-4" />{tr("Інтеграційний проєкт курсу", "Course integration project")}</div><MarkdownView content={markdown} /></div>}
        {item.kind === "CODE_TASK" && <div className="mt-4 rounded-2xl border border-secondary/25 bg-secondary/10 p-4 text-sm leading-6 text-text-primary"><Code2 className="mr-2 inline size-4 text-secondary" />{practiceLocked ? tr("Практика відкриється після прочитання теорії цієї теми.", "Practice unlocks after you read this topic's theory.") : tr("Це завдання генерується після теорії та перевіряє щойно вивчену навичку.", "This task is generated after theory and checks the skill you have just learned.")}</div>}
        {item.kind === "CODE_TASK" && !practiceLocked && typeof (item.content as any)?.exercise?.prompt === "string" && <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-bold text-text-primary">{(item.content as any).exercise.prompt}</p>{typeof (item.content as any).exercise.starterCode === "string" && <pre className="mt-4 overflow-x-auto rounded-xl bg-bg-code p-4 text-xs leading-6 text-text-primary"><code>{(item.content as any).exercise.starterCode}</code></pre>}</div>}
        {item.kind === "MANUAL" && Boolean((item.content as any)?.project) && project && projectSpec && <div className="mt-5 rounded-2xl border border-border bg-bg-base p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-text-primary">{tr("Робоча панель проєкту", "Project workspace")}</h4><span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{project.progress.status === "SUBMITTED" ? tr("Подано", "Submitted") : project.progress.milestoneIds.length ? tr("Чернетка", "Draft") : tr("Не почато", "Not started")}</span></div><div className="mt-4 space-y-3">{projectSpec.milestones.map((milestone) => <label key={milestone.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-bg-surface p-3"><input type="checkbox" checked={project.progress.milestoneIds.includes(milestone.id)} onChange={(event) => updateProject(item.id, { milestoneIds: event.target.checked ? [...project.progress.milestoneIds, milestone.id] : project.progress.milestoneIds.filter((id) => id !== milestone.id) })} className="mt-1 size-4 accent-primary" /><span><span className="block text-sm font-bold text-text-primary">{milestone.title}</span><span className="mt-1 block text-xs leading-5 text-text-secondary">{milestone.description}</span></span></label>)}</div><label className="mt-5 block text-sm font-bold text-text-primary">{tr("Що реалізовано", "Implementation notes")}<textarea value={project.progress.draft} onChange={(event) => updateProject(item.id, { draft: event.target.value })} placeholder={tr("Опишіть архітектуру, ключові рішення та перевірки…", "Describe the architecture, key decisions, and checks…")} className="mt-2 min-h-32 w-full rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-sm font-normal text-text-primary outline-none focus:border-primary" /></label><label className="mt-4 block text-sm font-bold text-text-primary">README<textarea value={project.progress.readme} onChange={(event) => updateProject(item.id, { readme: event.target.value })} placeholder={tr("Як запустити проєкт, що він уміє та які є обмеження…", "How to run it, what it does, and its limitations...")} className="mt-2 min-h-28 w-full rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-sm font-normal text-text-primary outline-none focus:border-primary" /></label>{projectSpec.checkSpec && <><label className="mt-4 block text-sm font-bold text-text-primary">{tr("Файли для ізольованої перевірки (JSON)", "Files for isolated check (JSON)")}<textarea value={projectFiles[item.id] || ""} onChange={(event) => setProjectFiles((current) => ({ ...current, [item.id]: event.target.value }))} placeholder={'[{"path":"app/__init__.py","content":"..."}]'} className="mt-2 min-h-40 w-full rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-xs font-normal text-text-primary outline-none focus:border-primary" /></label><button type="button" disabled={busyItem === item.id} onClick={() => void checkProject(item)} className="rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary disabled:cursor-not-allowed disabled:opacity-45">{tr("Запустити безпечну перевірку", "Run safe check")}</button></>}<div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busyItem === item.id || project.progress.status === "SUBMITTED"} onClick={() => void saveProject(item, false)} className="rounded-xl border border-border bg-bg-surface px-4 py-2.5 text-sm font-bold text-text-primary transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-45"><Save className="mr-2 inline size-4" />{tr("Зберегти чернетку", "Save draft")}</button><button type="button" disabled={busyItem === item.id || project.progress.status === "SUBMITTED"} onClick={() => void saveProject(item, true)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">{busyItem === item.id ? <LoaderCircle className="mr-2 inline size-4 animate-spin" /> : <Send className="mr-2 inline size-4" />}{tr("Подати мініпроєкт", "Submit project")}</button></div></div>}
        {!(item.kind === "MANUAL" && Boolean((item.content as any)?.project)) && <div className="mt-5 flex items-center justify-between gap-3"><span className="text-xs text-text-secondary">{completed ? tr("Завершено", "Completed") : tr("Не завершено", "Not completed")}</span><button type="button" disabled={completed || practiceLocked || busyItem === item.id} onClick={() => void completeItem(item)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45">{busyItem === item.id ? <LoaderCircle className="mr-2 inline size-4 animate-spin" /> : null}{completed ? tr("Зараховано", "Completed") : item.kind === "THEORY" ? tr("Прочитав теорію", "I read the theory") : tr("Завершити практику", "Complete practice")}</button></div>}
      </div></div></article>;
    })}</div></section>)}</div>

    <section className="mt-6 rounded-[26px] border border-border bg-bg-surface p-6 shadow-sm sm:p-7"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-5 text-primary" /><div className="flex-1"><h2 className="text-xl font-bold text-text-primary">{tr("Фінальна перевірка", "Final assessment")}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{canAssess ? tr("Після завершення всіх обов'язкових елементів введіть результат фінальної перевірки. 70% або більше завершить курс.", "After all required items are complete, enter the final assessment score. 70% or higher completes the course.") : tr(`Завершено ${completedItems} з ${requiredItems.length} обов'язкових елементів.`, `${completedItems} of ${requiredItems.length} required items completed.`)}</p>{canAssess && <div className="mt-5 flex flex-wrap gap-3"><input type="number" min="0" max="100" value={assessmentScore} onChange={(event) => setAssessmentScore(event.target.value)} className="w-28 rounded-xl border border-border bg-bg-base px-3 py-2.5 text-sm text-text-primary" /><button type="button" onClick={() => void finishAssessment()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{tr("Завершити курс", "Complete course")}</button></div>}</div></div></section>
    {course.enrollment.status === "COMPLETED" && <div className="mt-5 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-4 text-sm font-bold text-primary"><CheckCircle2 className="size-5" />{tr("Курс успішно завершено.", "Course completed successfully.")}</div>}
  </main>;
};

export default LearningCoursePage;
