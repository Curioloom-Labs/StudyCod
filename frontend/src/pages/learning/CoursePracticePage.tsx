import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, LoaderCircle, Save, Send, ShieldCheck } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { getMe } from "../../lib/api/profile";
import type { User } from "../../types";
import { TasksPage } from "../core/TasksPage";
import { BrandedPageLoader } from "../../components/ui/BrandedPageLoader";
import {
  checkCatalogProject,
  getCatalogProject,
  getLearningCourse,
  saveCatalogProject,
  submitCatalogProject,
  type LearningCourseItem,
  type LearningProject,
} from "../../lib/api/learningCatalog";
import { MarkdownView } from "../../components/MarkdownView";
import { tr } from "../../i18n";

const kindLabel = (kind: LearningCourseItem["kind"]): string => {
  switch (kind) {
    case "THEORY": return tr("теорією", "theory");
    case "QUIZ": return tr("тестом", "quiz");
    case "WEB_TASK": return tr("вебзавданням", "web task");
    case "MANUAL": return tr("навчальним елементом", "learning item");
    case "PAGE": return tr("сторінкою", "page");
    default: return tr("елементом курсу", "course item");
  }
};

const isProjectItem = (item: LearningCourseItem | null): boolean =>
  item?.kind === "MANUAL" && item.content.project === true;

const projectTitle = (title: string): string =>
  title.replace(/^(Мініпроєкт|Mini-project):\s*/i, "");

const projectMarkdown = (item: LearningCourseItem): string => {
  const markdown = typeof item.content.markdown === "string" ? item.content.markdown : "";
  return markdown
    .split("\n")
    .filter((line) => !/README(?:\.md)?/i.test(line) && !/Спочатку спроєктуйте контракт.*README/i.test(line))
    .join("\n")
    .replace(/^##\s+[^\n]+\n*/i, "")
    .trim();
};

type CourseProjectPracticeProps = {
  courseId: string;
  item: LearningCourseItem;
};

const CourseProjectPractice: React.FC<CourseProjectPracticeProps> = ({ courseId, item }) => {
  const navigate = useNavigate();
  const [project, setProject] = React.useState<LearningProject | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filesJson, setFilesJson] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getCatalogProject(item.id)
      .then((loaded) => {
        if (!cancelled) {
          setProject(loaded);
          setError(null);
        }
      })
      .catch((caught: any) => {
        if (!cancelled) setError(caught?.response?.data?.message === "COURSE_SEQUENCE_LOCKED"
          ? tr("Спочатку заверши попередні теми курсу.", "Complete the previous course topics first.")
          : tr("Не вдалося завантажити мініпроєкт.", "Could not load the mini-project."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [item.id]);

  const updateProgress = (patch: Partial<LearningProject["progress"]>) => {
    setProject((current) => current
      ? { ...current, progress: { ...current.progress, ...patch } }
      : current);
  };

  const saveProject = async (submit: boolean) => {
    if (!project) return;
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const input = {
        milestoneIds: project.progress.milestoneIds,
        draft: project.progress.draft,
      };
      const response = submit
        ? await submitCatalogProject(item.id, input)
        : await saveCatalogProject(item.id, input);
      if (response?.project) setProject(response.project);
      setMessage(submit
        ? tr("Мініпроєкт подано.", "Mini-project submitted.")
        : tr("Чернетку збережено.", "Draft saved."));
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PROJECT_REQUIREMENTS_INCOMPLETE"
        ? tr("Виконай усі етапи та додай нотатки реалізації.", "Complete all milestones and add implementation notes.")
        : tr("Не вдалося зберегти мініпроєкт.", "Could not save the mini-project."));
    } finally {
      setBusy(false);
    }
  };

  const checkProject = async () => {
    let files: Array<{ path: string; content: string }>;
    try {
      const parsed = JSON.parse(filesJson);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      files = parsed;
    } catch {
      setError(tr("Встав JSON-масив файлів для перевірки.", "Paste a JSON array of files for the check."));
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await checkCatalogProject(item.id, files);
      setMessage(result?.passed
        ? tr("Перевірку проєкту пройдено.", "Project check passed.")
        : tr("Перевірку не пройдено.", "Project check failed."));
    } catch {
      setError(tr("Не вдалося запустити ізольовану перевірку.", "Could not start the isolated project check."));
    } finally {
      setBusy(false);
    }
  };

  const spec = project?.projectSpec;
  return <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`)} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-primary transition hover:underline">
      <ArrowLeft className="size-4" />{tr("До тем курсу", "Back to course topics")}
    </button>
    <header className="rounded-[28px] border border-[#bd8837]/30 bg-[#bd8837]/[.06] p-6 sm:p-8">
      <p className="text-[11px] font-black uppercase tracking-[.18em] text-[#bd8837] dark:text-[#ffbf68]">{tr("Практика курсу · мініпроєкт", "Course practice · mini-project")}</p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-.04em] text-text-primary sm:text-5xl">{projectTitle(item.title)}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Застосуй навички з пройдених тем в одній завершеній роботі.", "Combine the skills from the completed topics in one finished piece of work.")}</p>
    </header>

    {message && <div role="status" className="mt-5 rounded-2xl border border-primary/25 bg-primary/[.06] px-4 py-3 text-sm text-primary">{message}</div>}
    {error && <div role="alert" className="mt-5 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error">{error}</div>}
    {loading ? <div role="status" className="mt-6 rounded-2xl border border-border bg-bg-surface p-6 text-sm text-text-secondary"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{tr("Завантажуємо проєкт…", "Loading project…")}</div> : spec ? <>
      {projectMarkdown(item) && <section className="mt-6 rounded-2xl border border-border bg-bg-surface p-5 sm:p-7"><MarkdownView content={projectMarkdown(item)} /></section>}
      <section className="mt-6 rounded-2xl border border-border bg-bg-surface p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black uppercase tracking-[.16em] text-primary">{tr("План виконання", "Execution plan")}</p><h2 className="mt-2 text-2xl font-bold text-text-primary">{tr("Збери проєкт по етапах", "Build the project in stages")}</h2></div><span className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-secondary">{project?.progress.milestoneIds.length ?? 0}/{spec.milestones.length}</span></div>
        <div className="mt-5 space-y-3">{spec.milestones.map((milestone) => <label key={milestone.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-bg-base p-4 transition hover:border-primary/45"><input type="checkbox" checked={project?.progress.milestoneIds.includes(milestone.id) ?? false} onChange={(event) => updateProgress({ milestoneIds: event.target.checked ? [...(project?.progress.milestoneIds ?? []), milestone.id] : (project?.progress.milestoneIds ?? []).filter((id) => id !== milestone.id) })} className="mt-1 size-4 accent-primary" /><span className="text-sm"><b className="block text-text-primary">{milestone.title}</b><span className="mt-1 block leading-6 text-text-secondary">{milestone.description}</span></span></label>)}</div>
        {spec.acceptanceCriteria?.length ? <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[.05] p-4"><p className="text-xs font-black uppercase tracking-[.14em] text-primary">{tr("Критерії готовності", "Definition of done")}</p><ul className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">{spec.acceptanceCriteria.map((criterion) => <li key={criterion} className="flex gap-2"><CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />{criterion}</li>)}</ul></div> : null}
        <label className="mt-6 block text-sm font-bold text-text-primary">{tr("Нотатки реалізації", "Implementation notes")}<textarea value={project?.progress.draft ?? ""} onChange={(event) => updateProgress({ draft: event.target.value })} className="mt-2 min-h-32 w-full rounded-2xl border border-border bg-bg-base px-4 py-3 text-sm font-normal leading-6 text-text-primary outline-none transition focus:border-primary" placeholder={tr("Опиши ключові рішення та перевірки.", "Describe the key decisions and checks.")} /></label>
        {spec.checkSpec && <div className="mt-6 rounded-2xl border border-border bg-bg-base p-4"><p className="flex items-center gap-2 text-sm font-bold text-text-primary"><ShieldCheck className="size-4 text-primary" />{tr("Автоматична перевірка", "Automated check")}</p><p className="mt-1 text-xs leading-5 text-text-secondary">{tr("Передай JSON-масив файлів проєкту для запуску перевірки.", "Pass a JSON array of project files to run the check.")}</p><textarea value={filesJson} onChange={(event) => setFilesJson(event.target.value)} className="mt-3 min-h-28 w-full rounded-xl border border-border bg-bg-surface px-3 py-2 font-mono text-xs text-text-primary outline-none transition focus:border-primary" placeholder='[{"path":"main.py","content":"..."}]' /><button type="button" disabled={busy} onClick={() => void checkProject()} className="mt-3 rounded-xl border border-primary px-4 py-2.5 text-sm font-bold text-primary disabled:opacity-45">{tr("Запустити перевірку", "Run check")}</button></div>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={() => void saveProject(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-bold text-text-primary disabled:opacity-45"><Save className="size-4" />{tr("Зберегти", "Save")}</button><button type="button" disabled={busy} onClick={() => void saveProject(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white disabled:opacity-45"><Send className="size-4" />{tr("Подати проєкт", "Submit project")}</button></div>
      </section>
    </> : null}
  </main>;
};

export const CoursePracticePage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const { courseId, courseItemId } = useParams<{ courseId: string; courseItemId: string }>();
  const [user, setUser] = React.useState<User | null>(null);
  const [courseItem, setCourseItem] = React.useState<LearningCourseItem | null>(null);
  const [courseLookupState, setCourseLookupState] = React.useState<"pending" | "loaded" | "failed">("pending");

  React.useEffect(() => {
    let cancelled = false;
    void getMe({ suppressAuthRedirect: true }).then((nextUser) => {
      if (!cancelled) setUser(nextUser);
    });
    if (!courseId || !courseItemId) {
      setCourseLookupState("failed");
      return () => { cancelled = true; };
    }
    void getLearningCourse(Number(courseId))
      .then((course) => {
        if (cancelled) return;
        const items = course.modules.flatMap((module) => module.items);
        const item = items.find((candidate) => candidate.id === Number(courseItemId));
        setCourseItem(item ?? null);
        setCourseLookupState("loaded");
      })
      .catch(() => {
        if (!cancelled) {
          setCourseItem(null);
          setCourseLookupState("failed");
        }
      });
    return () => { cancelled = true; };
  }, [courseId, courseItemId, locale]);

  if (!user || courseLookupState === "pending") return <BrandedPageLoader />;
  if (courseLookupState !== "loaded" || !courseItem || (courseItem.kind !== "CODE_TASK" && !isProjectItem(courseItem))) {
    const itemKindMessage = courseLookupState === "failed"
      ? tr("Не вдалося перевірити елемент курсу.", "Could not verify this course item.")
      : courseItem
      ? tr(`Відкритий елемент є ${kindLabel(courseItem.kind)}.`, `The opened item is a ${kindLabel(courseItem.kind)}.`)
      : tr("Цей елемент не знайдено в поточному курсі.", "This item was not found in the current course.");
    return <main className="mx-auto flex min-h-[60vh] max-w-2xl items-center px-6 py-12">
      <section role="alert" className="w-full rounded-3xl border border-border bg-bg-surface p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{tr("Курсова практика", "Course practice")}</p>
        <h1 className="mt-3 text-2xl font-bold text-text-primary">{tr("Цей елемент не відкривається у практиці", "This item cannot be opened in Practice")}</h1>
        <p className="mt-3 leading-7 text-text-secondary">{tr(`${itemKindMessage} Відкрий маршрут, щоб продовжити навчання.`, `${itemKindMessage} Open the path to continue learning.`)}</p>
        <button type="button" onClick={() => navigate(`/learning/course/${courseId}/path`, { replace: true })} className="mt-6 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{tr("Відкрити теми", "Open topics")}</button>
      </section>
    </main>;
  }

  if (isProjectItem(courseItem)) return <CourseProjectPractice courseId={courseId!} item={courseItem} />;

  // The practice shell owns the whole sequence. It mounts before theory so
  // catalog generation can create the first task; TasksPage then opens theory
  // inside the native IDE for that generated task.
  return <TasksPage user={user} />;
};
