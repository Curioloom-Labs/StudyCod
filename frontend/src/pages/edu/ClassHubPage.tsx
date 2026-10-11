import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  Mail,
  Plus,
  Radio,
  Settings,
  Sparkles,
  UsersRound,
} from "lucide-react";
import {
  getClass,
  getLessons,
  getStudents,
  getTopics,
  type ClassDetails,
  type Lesson,
  type Student,
  type Topic,
} from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { tr } from "../../i18n";
import { withDevPreview } from "../../lib/devPreview";

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "min-h-[100dvh] bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-10 lg:py-10";
const languageName = (language?: string) => language || "—";

const sampleLessons: Lesson[] = [
  { id: 101, title: "Lists and iteration", type: "LESSON", tasksCount: 4, createdAt: new Date().toISOString() },
  { id: 102, title: "Checkpoint: loops", type: "CONTROL", tasksCount: 3, createdAt: new Date().toISOString() },
];


const initials = (student: Student) => `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() || tr("У", "S");

const navigateWithPreview = (navigate: ReturnType<typeof useNavigate>, path: string) => {
  navigate(withDevPreview(path));
};

export const ClassHubPage: React.FC = () => {
  useTranslation();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const id = Number(classId);
  const [classInfo, setClassInfo] = React.useState<ClassDetails | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    setLoading(true);
    try {
      if (isPreview()) {
        setClassInfo({ id, name: "10-Б · StudyCod", gradingSystem: "POINTS_12", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        setStudents(Array.from({ length: 24 }, (_, index) => ({ id: index + 1, firstName: index % 2 ? "Марко" : "Софія", lastName: index % 2 ? "Литвин" : "Мельник", email: "", generatedUsername: `student_${index + 1}`, createdAt: new Date().toISOString() })));
        setTopics([
          { id: 1, title: "Основи Python", description: "Синтаксис, змінні, введення та виведення", order: 1, language: "PYTHON", tasks: [{}, {}] },
          { id: 2, title: "Колекції", description: "Списки, словники та проходи по даних", order: 2, language: "PYTHON", tasks: [{}], controlWorks: [{}] },
        ]);
        setLessons(sampleLessons);
        setError(null);
        return;
      }
      const [groupResult, peopleResult, topicsResult, lessonsResult] = await Promise.allSettled([
        getClass(id),
        getStudents(id),
        getTopics(id),
        getLessons(id),
      ]);
      if (groupResult.status !== "fulfilled") throw groupResult.reason;
      setClassInfo(groupResult.value);
      setStudents(peopleResult.status === "fulfilled" ? peopleResult.value : []);
      setTopics(topicsResult.status === "fulfilled" ? topicsResult.value : []);
      setLessons(lessonsResult.status === "fulfilled" ? lessonsResult.value : []);
      const failedPanels = [peopleResult, topicsResult, lessonsResult].filter((result) => result.status === "rejected").length;
      setError(failedPanels ? tr("Частину даних класу тимчасово не вдалося завантажити. Натисніть «Повторити».", "Some class data could not be loaded. Select “Retry” to try again.") : null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити клас.", "Could not load the class.")));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  if (!Number.isFinite(id) || id <= 0) {
    return <div className={root}><div className="mx-auto max-w-7xl rounded-3xl border border-red-200 bg-white p-8 text-red-700 dark:border-red-500/30 dark:bg-bg-code dark:text-red-200">{tr("Некоректний ідентифікатор класу.", "Invalid class ID.")}</div></div>;
  }

  const className = classInfo?.name || tr("Клас", "Class");
  const topicUnits = topics.reduce((total, topic) => total + (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0), 0);
  const activeTopics = topics.filter(topic => (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0) > 0).length;

  if (loading) {
    return (
      <div className={root}>
        <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
          <div className="h-5 w-32 rounded-full bg-bg-hover dark:bg-white/[.08]" />
          <div className="h-72 rounded-[34px] bg-bg-hover dark:bg-white/[.08]" />
          <div className="grid gap-4 md:grid-cols-4"><div className="h-28 rounded-3xl bg-bg-hover dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-bg-hover dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-bg-hover dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-bg-hover dark:bg-white/[.08]" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1480px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigateWithPreview(navigate, "/edu")} className="inline-flex items-center gap-2 rounded-full border border-border/10 bg-white/80 px-4 py-2 text-sm font-bold text-text-muted shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[.06] dark:text-text-primary"><ArrowLeft className="size-4" /> {tr("EDU простір", "EDU workspace")}</button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-text-muted dark:text-text-secondary"><span>{tr("Викладач", "Teacher")}</span><span className="text-primary-strong">/</span><span>{className}</span></div>
        </div>

        <section className="border-b border-border pb-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Класний простір", "Class workspace")}</p><h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-4xl">{className}</h1><p className="mt-2 max-w-2xl text-sm text-text-secondary">{tr("Плануй заняття, переглядай навчальний маршрут і переходь до робіт учнів.", "Plan lessons, follow the learning path, and review student work.")}</p></div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Radio className="size-4" />{tr("Почати заняття", "Start live class")}</button>
              <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold hover:bg-bg-hover"><Plus className="size-4" />{tr("Нова тема", "New topic")}</button>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 divide-x divide-border border-t border-border pt-4 sm:grid-cols-4">
            {[{ value: students.length, label: tr("учнів", "students") }, { value: topics.length, label: tr("тем", "topics") }, { value: lessons.length, label: tr("занять", "lessons") }, { value: topicUnits, label: tr("навчальних блоків", "learning items") }].map((item) => <div key={item.label} className="px-3 first:pl-0 sm:px-5"><dd className="text-2xl font-bold tabular-nums">{item.value}</dd><dt className="mt-1 text-xs text-text-muted">{item.label}</dt></div>)}
          </dl>
        </section>

        {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-error/25 bg-bg-hover px-4 py-3 text-sm text-accent-error dark:bg-accent-error/10 dark:text-accent-error"><span>{error}</span><button type="button" onClick={() => void load()} className="rounded-xl border border-current px-3 py-2 text-xs font-bold">{tr("Повторити", "Retry")}</button></div>}

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-border/10 bg-white/80 p-2 shadow-sm dark:border-white/10 dark:bg-white/[.04]" aria-label={tr("Навігація класу", "Class navigation")}>{[{ label: tr("Огляд", "Overview"), active: true, onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) }, { label: tr("Учні", "Students"), onClick: () => navigateWithPreview(navigate, `/edu/classes/${id}/manage`) }, { label: tr("Навчання", "Learning"), onClick: () => document.getElementById("class-topics")?.scrollIntoView({ behavior: "smooth" }) }, { label: tr("Журнал", "Gradebook"), onClick: () => navigateWithPreview(navigate, `/edu/classes/${id}/gradebook`) }, { label: tr("Календар", "Calendar"), onClick: () => navigateWithPreview(navigate, "/edu/calendar") }].map(item => <button type="button" key={item.label} onClick={item.onClick} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${item.active ? "bg-bg-base text-text-primary shadow-sm dark:bg-primary dark:text-primary-foreground" : "text-text-muted hover:bg-bg-hover hover:text-text-primary dark:text-text-secondary dark:hover:bg-white/[.07] dark:hover:text-white"}`}>{item.label}</button>)}</nav>


        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section id="class-topics" className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{tr("Навчальний маршрут", "Learning path")}</p><h2 className="mt-2 text-3xl font-black tracking-[-.055em]">{tr("Теми класу", "Class topics")}</h2><p className="mt-2 text-sm text-text-muted dark:text-text-secondary">{tr(`${activeTopics} активних тем із матеріалами`, `${activeTopics} active topics with materials`)}</p></div><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="inline-flex items-center gap-2 rounded-xl bg-bg-base px-4 py-2.5 text-sm font-bold text-text-primary dark:bg-primary dark:text-primary-foreground"><Plus className="size-4" />{tr("Додати тему", "Add topic")}</button></div><div className="mt-6 grid gap-3 md:grid-cols-2">{topics.map((topic, index) => { const practiceCount = topic.tasks?.length || 0; const controlCount = topic.controlWorks?.length || 0; return <button type="button" key={topic.id} onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)} className="group rounded-[24px] border border-border/10 bg-bg-hover p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07]"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white text-sm font-black text-primary-strong shadow-sm dark:bg-bg-code dark:text-primary-soft">{String(index + 1).padStart(2, "0")}</span><span className="rounded-full border border-border/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-text-muted dark:border-white/10 dark:text-text-secondary">{languageName(topic.language)}</span></div><strong className="mt-5 block text-lg font-black tracking-[-.035em]">{topic.title}</strong><span className="mt-2 block min-h-12 text-sm leading-6 text-text-muted dark:text-text-secondary">{topic.description || tr("Практика, теорія та контрольні для цієї теми.", "Practice, theory, and assessments for this topic.")}</span><span className="mt-4 flex items-center justify-between gap-2 border-t border-border/8 pt-3 text-xs font-bold text-text-muted dark:border-white/10 dark:text-text-secondary"><span>{tr(`${practiceCount} практик · ${controlCount} контрольних`, `${practiceCount} practice tasks · ${controlCount} assessments`)}</span><ArrowRight className="size-4 text-primary-strong transition group-hover:translate-x-1 dark:text-primary-soft" /></span></button>; })}{!topics.length && <div className="col-span-full rounded-[24px] border border-dashed border-border/15 p-12 text-center dark:border-white/10"><BookOpen className="mx-auto size-9 text-primary-strong dark:text-primary-soft" /><h3 className="mt-4 text-xl font-black">{tr("Створіть першу тему", "Create your first topic")}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Побудуйте маршрут класу з теорії, практики та контрольних.", "Build a class path with theory, practice, and assessments.")}</p><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{tr("Створити тему", "Create topic")}</button></div>}</div></section>

          <aside className="space-y-6"><section className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-accent-warn">{tr("Поточний потік", "Current activity")}</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">{tr("Останні заняття", "Recent lessons")}</h2></div><ClipboardList className="size-5 text-accent-warn" /></div><div className="mt-5 space-y-3">{lessons.slice(0, 5).map(lesson => <button type="button" key={lesson.id} onClick={() => navigateWithPreview(navigate, `/edu/lessons/${lesson.id}?type=${encodeURIComponent(lesson.type || "LESSON")}`)} className="group flex w-full items-center gap-3 rounded-2xl bg-bg-hover p-4 text-left transition hover:bg-bg-hover dark:bg-white/[.045] dark:hover:bg-white/[.07]"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-black shadow-sm ${lesson.type === "CONTROL" ? "bg-bg-hover text-accent-warn" : "bg-white text-primary-strong dark:bg-bg-code dark:text-primary-soft"}`}>{lesson.type === "CONTROL" ? tr("К", "A") : tr("У", "L")}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-black">{lesson.title}</strong><span className="mt-1 block text-xs text-text-muted dark:text-text-secondary">{lesson.type === "CONTROL" ? tr("Контрольна", "Assessment") : tr("Заняття", "Lesson")} · {lesson.tasksCount || 0} {tr("задач", "tasks")}</span></span><ArrowRight className="size-4 text-text-secondary transition group-hover:translate-x-1" /></button>)}{!lessons.length && <div className="rounded-2xl border border-dashed border-border/15 px-4 py-10 text-center text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{tr("Додайте перше заняття, щоб клас отримав маршрут.", "Add the first lesson to give the class a learning path.")}</div>}</div><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-primary-strong dark:text-primary-soft"><Plus className="size-4" />{tr("Додати заняття", "Add lesson")}</button></section>

            <section className="rounded-[32px] bg-bg-hover p-5 shadow-[0_18px_60px_rgba(18,32,23,.05)] dark:bg-[var(--surface-warning)] sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-accent-warn">{tr("Люди класу", "Class community")}</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">{tr("Учні", "Students")}</h2></div><UsersRound className="size-5 text-accent-warn" /></div><div className="mt-5 flex items-center justify-between gap-3"><div className="flex -space-x-2">{students.slice(0, 6).map(student => <span key={student.id} title={`${student.firstName} ${student.lastName}`} className="grid size-10 place-items-center rounded-full border-2 border-border bg-bg-surface text-xs font-black text-primary-strong dark:border-accent-warn">{initials(student)}</span>)}{students.length > 6 && <span className="grid size-10 place-items-center rounded-full border-2 border-border bg-accent-warn text-xs font-black text-accent-warn dark:border-accent-warn">+{students.length - 6}</span>}</div><strong className="text-3xl font-black tracking-[-.06em] text-accent-warn">{students.length}</strong></div><p className="mt-5 text-sm leading-6 text-accent-warn dark:text-accent-warn">{tr("Керуйте списком учнів, доступами та батьківськими запрошеннями.", "Manage students, access, and parent invitations.")}</p><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-bg-surface px-4 py-3 text-sm font-bold text-text-primary dark:bg-accent-warn dark:text-accent-warn"><UsersRound className="size-4" />{tr("Відкрити список учнів", "Open student list")}</button>{!students.length && <div className="mt-3 flex items-center gap-2 text-xs font-bold text-accent-warn"><Mail className="size-4" />{tr("Запросіть першого учня в керуванні класом.", "Invite the first student from class management.")}</div>}</section>

            <section className="rounded-[32px] border border-border/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-bg-code sm:p-7"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><CheckCircle2 className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-[.14em] text-primary-strong dark:text-primary-soft">{tr("Наступний крок", "Next step")}</p><h2 className="mt-1 text-xl font-black">{tr("Підготуйте заняття", "Prepare a lesson")}</h2></div></div><p className="mt-4 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Додайте теорію та практику, а потім відкрийте журнал, щоб побачити результат класу.", "Add theory and practice, then open the gradebook to review class results.")}</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="rounded-xl bg-bg-hover px-3 py-3 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><BookOpen className="mx-auto mb-1 size-4" />{tr("Тема", "Topic")}</button><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/gradebook`)} className="rounded-xl bg-bg-hover px-3 py-3 text-xs font-bold text-text-muted dark:bg-white/[.06] dark:text-text-secondary"><GraduationCap className="mx-auto mb-1 size-4" />{tr("Журнал", "Gradebook")}</button></div></section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ClassHubPage;
