import { eduLessonPath, eduLessonKey } from "../../lib/eduNavigation";
import React from "react";
import { useReducedMotion } from "framer-motion";
import "./eduWorkspace.css";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  Layers3,
  Plus,
  Radio,
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
import { getActiveLiveSession, type LiveSession } from "../../lib/api/liveClassroom";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { tr } from "../../i18n";
import { withDevPreview } from "../../lib/devPreview";
import { ClassWorkspaceNavigation } from "./ClassWorkspaceNavigation";

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-class-hub min-h-[100dvh] bg-bg-base px-4 py-6 text-text-primary sm:px-6 lg:px-10 lg:py-10";
const languageName = (language?: string) => language || "—";

const countForm = (count: number, forms: [string, string, string]) => {
  const lastTwo = count % 100;
  const last = count % 10;
  return last === 1 && lastTwo !== 11 ? forms[0] : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? forms[1] : forms[2];
};

const countText = (count: number, forms: [string, string, string], englishSingular: string, englishPlural: string) => {
  const form = countForm(count, forms);
  return tr(`${count} ${form}`, `${count} ${count === 1 ? englishSingular : englishPlural}`);
};

const sampleLessons: Lesson[] = [
  { id: 101, title: "Повторення за 10 клас", type: "LESSON", tasksCount: 2, createdAt: new Date().toISOString() },
];


const initials = (student: Student) => `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() || tr("У", "S");

const navigateWithPreview = (navigate: ReturnType<typeof useNavigate>, path: string) => {
  navigate(withDevPreview(path));
};

export const ClassHubPage: React.FC = () => {
  useTranslation();
  const reduceMotion = useReducedMotion();
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const id = Number(classId);
  const [classInfo, setClassInfo] = React.useState<ClassDetails | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [liveSession, setLiveSession] = React.useState<LiveSession | null>(null);
  const [liveEnabled, setLiveEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!Number.isFinite(id) || id <= 0) return;
    setLoading(true);
    try {
      if (isPreview()) {
        setClassInfo({ id, name: "11-А", gradingSystem: "POINTS_12", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        setStudents(Array.from({ length: 16 }, (_, index) => ({ id: index + 1, firstName: index % 2 ? "Марко" : "Софія", lastName: index % 2 ? "Литвин" : "Мельник", email: "", generatedUsername: `student_${index + 1}`, createdAt: new Date().toISOString() })));
        setTopics([
          { id: 1, title: "Повторення за 10 клас", description: "Практика, теорія та контрольні для цієї теми.", order: 1, language: "PYTHON", tasks: [{}, {}], controlWorks: [{}, {}] },
        ]);
        setLessons(sampleLessons);
        setLiveSession(null);
        setLiveEnabled(true);
        setError(null);
        return;
      }
      const [groupResult, peopleResult, topicsResult, lessonsResult, liveResult] = await Promise.allSettled([
        getClass(id),
        getStudents(id),
        getTopics(id),
        getLessons(id),
        getActiveLiveSession(id),
      ]);
      if (groupResult.status !== "fulfilled") throw groupResult.reason;
      setClassInfo(groupResult.value);
      setStudents(peopleResult.status === "fulfilled" ? peopleResult.value : []);
      setTopics(topicsResult.status === "fulfilled" ? topicsResult.value : []);
      setLessons(lessonsResult.status === "fulfilled" ? lessonsResult.value : []);
      if (liveResult.status === "fulfilled") {
        setLiveSession(liveResult.value.session);
        setLiveEnabled(liveResult.value.enabled);
      } else {
        setLiveSession(null);
        // Let the live-room lobby report/retry a transient status failure.
        setLiveEnabled(true);
      }
      const failedPanels = [peopleResult, topicsResult, lessonsResult, liveResult].filter((result) => result.status === "rejected").length;
      setError(failedPanels ? tr("Частину даних класу тимчасово не вдалося завантажити. Натисніть «Повторити».", "Some class data could not be loaded. Select “Retry” to try again.") : null);
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завантажити клас.", "Could not load the class.")));
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);
  React.useEffect(() => {
    if (loading || window.location.hash !== "#class-topics") return;
    const frame = window.requestAnimationFrame(() => document.getElementById("class-topics")?.scrollIntoView({ behavior: "instant", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [id, loading, topics.length]);

  if (!Number.isFinite(id) || id <= 0) {
    return <div className={root}><div className="mx-auto max-w-7xl rounded-3xl border border-accent-error/25 bg-bg-surface p-8 text-accent-error">{tr("Некоректний ідентифікатор класу.", "Invalid class ID.")}</div></div>;
  }

  const className = classInfo?.name || tr("Клас", "Class");
  const topicUnits = topics.reduce((total, topic) => total + (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0), 0);
  const activeTopics = topics.filter(topic => (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0) > 0).length;

  if (loading) {
    return (
      <div className={root}>
        <div className="mx-auto max-w-[90rem] animate-pulse space-y-5" role="status" aria-label={tr("Завантажуємо клас", "Loading class")}>
          <div className="h-11 w-full rounded-2xl bg-bg-hover" />
          <div className="h-64 rounded-[24px] bg-bg-hover" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-20 rounded-2xl bg-bg-hover" />)}</div>
          <div className="grid gap-4 xl:grid-cols-[1.5fr_.75fr]"><div className="h-80 rounded-2xl bg-bg-hover" /><div className="h-80 rounded-2xl bg-bg-hover" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={root}>
      <div className="mx-auto max-w-[90rem] space-y-5">
        <ClassWorkspaceNavigation classId={id} className={className} active="overview" backHref="/edu" backLabel={tr("EDU простір", "EDU workspace")} reduceMotion={reduceMotion} />

        <header className="edu-class-hub__hero">
          <div className="edu-class-hub__hero-main">
            <p className="edu-class-hub__eyebrow"><span><GraduationCap className="size-4" aria-hidden="true" /></span>{tr("Класний простір", "Class workspace")}</p>
            <h1>{className}</h1>
            <p>{tr("Плануй заняття, переглядай навчальний маршрут і підтримуй зв’язок з учнями в одному просторі.", "Plan lessons, follow the learning path, and stay connected with your learners in one place.")}</p>
            <div className="edu-class-hub__hero-actions">
              <button type="button" disabled={!liveEnabled} onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}><Radio className="size-4" aria-hidden="true" />{liveSession ? tr("Повернутися до уроку", "Return to live lesson") : tr("Почати заняття", "Start a live class")}</button>
              <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Нова тема", "New topic")}</button>
            </div>
          </div>
          <aside className="edu-class-hub__hero-aside" aria-label={tr("Спільнота класу", "Class community")}>
            <div className="edu-class-hub__hero-aside-head"><span>{tr("Спільнота класу", "Class community")}</span><span><i aria-hidden="true" />{tr("Навчальний простір", "Learning space")}</span></div>
            <div className="edu-class-hub__hero-aside-count"><strong>{students.length}</strong><span>{tr(`${countForm(students.length, ["учень", "учні", "учнів"])} навчаються разом`, "learners learning together")}</span></div>
            <div className="edu-class-hub__hero-avatars" aria-hidden="true">{students.slice(0, 5).map((student) => <span key={student.id}>{initials(student)}</span>)}{students.length > 5 && <span>+{students.length - 5}</span>}</div>
            <div className="edu-class-hub__hero-aside-foot"><span>{countText(topics.length, ["тема", "теми", "тем"], "topic", "topics")}</span><span>{countText(lessons.length, ["заняття", "заняття", "занять"], "lesson", "lessons")}</span></div>
          </aside>
        </header>

        {!liveEnabled && <p className="-mt-2 text-xs text-text-secondary">{tr("Онлайн-уроки вимкнені для цього сервера.", "Live lessons are disabled on this server.")}</p>}

        <dl className="edu-class-hub__metrics" aria-label={tr("Показники класу", "Class metrics")}>
          {[
            { value: students.length, label: tr("учнів", "students"), icon: UsersRound },
            { value: topics.length, label: tr("тем у маршруті", "topics in path"), icon: BookOpen },
            { value: lessons.length, label: tr("занять", "lessons"), icon: CalendarDays },
            { value: topicUnits, label: tr("навчальних блоків", "learning items"), icon: Layers3 },
          ].map(({ value, label, icon: Icon }) => <div className="edu-class-hub__metric" key={label}>
            <span className="edu-class-hub__metric-mark"><Icon className="size-4" aria-hidden="true" /></span>
            <div className="edu-class-hub__metric-copy"><dd>{value}</dd><dt>{label}</dt></div>
          </div>)}
        </dl>

        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-error/25 bg-bg-surface px-4 py-3 text-sm text-accent-error"><span>{error}</span><button type="button" onClick={() => void load()} className="min-h-10 rounded-lg border border-current px-3 py-2 text-xs font-bold">{tr("Повторити", "Retry")}</button></div>}

        {liveSession && <section className="edu-class-live-banner" aria-label={tr("Онлайн-урок триває", "Live lesson in progress")}>
          <span className="edu-class-live-banner__mark"><span aria-hidden="true" />{tr("Зараз наживо", "Live now")}</span>
          <div className="min-w-0"><strong>{liveSession.title || tr("Зустріч із класом", "Classroom session")}</strong><p>{tr("Заняття вже відкрите — приєднуйся, щоб продовжити разом із класом.", "The lesson is open. Rejoin to continue with your class.")}</p></div>
          <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)} className="class-workspace-nav__back"><span>{tr("Повернутися", "Rejoin")}</span><ArrowRight className="size-4" aria-hidden="true" /></button>
        </section>}

        <main className="edu-class-hub__content-grid grid items-start">
          <section id="class-topics" className="edu-class-hub__panel edu-class-hub__learning" aria-labelledby="class-topics-title">
            <div className="edu-class-hub__panel-head">
              <div className="edu-class-hub__panel-intro"><p className="edu-class-hub__panel-kicker">{tr("Навчальний маршрут", "Learning path")}</p><h2 id="class-topics-title">{tr("Теми класу", "Class topics")}</h2><p>{countText(activeTopics, ["активна тема з матеріалами", "активні теми з матеріалами", "активних тем з матеріалами"], "active topic with materials", "active topics with materials")}</p></div>
              <button type="button" className="edu-class-hub__panel-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати тему", "Add a topic")}</button>
            </div>
            {topics.length ? <div className="edu-class-topic-list">{topics.map((topic, index) => {
              const practiceCount = topic.tasks?.length || 0;
              const controlCount = topic.controlWorks?.length || 0;
              return <button type="button" key={topic.id} className="edu-class-topic" onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)}>
                <span className="edu-class-topic__index">{String(index + 1).padStart(2, "0")}</span>
                <span className="edu-class-topic__body">
                  <span className="edu-class-topic__topline"><strong className="edu-class-topic__title">{topic.title}</strong><span className="edu-class-topic__language">{languageName(topic.language)}</span></span>
                  <span className="edu-class-topic__description">{topic.description || tr("Практика, теорія та контрольні для цієї теми.", "Practice, theory, and assessments for this topic.")}</span>
                  <span className="edu-class-topic__footer"><span><BookOpenCheck className="size-3.5" aria-hidden="true" />{countText(practiceCount, ["практика", "практики", "практик"], "practice task", "practice tasks")}</span><span><CheckCircle2 className="size-3.5" aria-hidden="true" />{countText(controlCount, ["контрольна", "контрольні", "контрольних"], "assessment", "assessments")}</span></span>
                </span>
                <ArrowRight className="edu-class-topic__arrow size-4" aria-hidden="true" />
              </button>;
            })}</div> : <div className="edu-class-hub__empty"><span className="edu-class-hub__empty-mark"><BookOpen className="size-5" aria-hidden="true" /></span><strong>{tr("Почни маршрут класу з першої теми", "Start the class pathway with a first topic")}</strong><p>{tr("Об’єднай теорію, практику й контрольні в послідовний навчальний план.", "Bring theory, practice, and assessments together in a clear learning path.")}</p><button type="button" className="edu-class-hub__panel-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Створити тему", "Create topic")}</button></div>}
          </section>

          <aside className="edu-class-hub__panel edu-class-hub__lessons" aria-labelledby="class-lessons-title">
            <div className="edu-class-hub__panel-head"><div className="edu-class-hub__panel-intro"><p className="edu-class-hub__panel-kicker">{tr("Заняття та матеріали", "Lessons and materials")}</p><h2 id="class-lessons-title">{tr("Поточний маршрут", "Current pathway")}</h2><p>{tr("Останні заняття для класу", "Recent lessons for this class")}</p></div><span className="edu-class-hub__panel-count">{lessons.length}</span></div>
            {lessons.length ? <div className="edu-class-lesson-list">{lessons.slice(0, 5).map((lesson) => <button type="button" key={eduLessonKey(lesson)} className="edu-class-lesson" data-control={lesson.type === "CONTROL" || undefined} onClick={() => navigateWithPreview(navigate, lesson.source === "course" || lesson.type === "LESSON" ? eduLessonPath(lesson) : `/edu/topics/${lesson.id}`)}>
              <span className="edu-class-lesson__mark">{lesson.type === "CONTROL" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <BookOpenCheck className="size-4" aria-hidden="true" />}</span>
              <span className="edu-class-lesson__copy"><strong>{lesson.title}</strong><small>{lesson.type === "CONTROL" ? tr("Контрольна", "Assessment") : tr("Заняття", "Lesson")} · {countText(lesson.tasksCount || 0, ["задача", "задачі", "задач"], "task", "tasks")}</small></span>
              <ArrowRight className="edu-class-lesson__arrow size-4" aria-hidden="true" />
            </button>)}</div> : <div className="edu-class-hub__empty"><span className="edu-class-hub__empty-mark"><CalendarDays className="size-5" aria-hidden="true" /></span><strong>{tr("Тут з’явиться план занять", "Your lesson plan will appear here")}</strong><p>{tr("Створи перше заняття й додай до нього матеріали для класу.", "Create a lesson and add the materials your class needs.")}</p></div>}
            <button type="button" className="edu-class-hub__add-lesson" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати заняття", "Add a lesson")}</button>
          </aside>

          <section className="edu-class-hub__panel edu-class-hub__students" aria-labelledby="class-students-title">
            <div className="edu-class-hub__panel-head"><div className="edu-class-hub__panel-intro"><p className="edu-class-hub__panel-kicker">{tr("Люди класу", "Class community")}</p><h2 id="class-students-title">{tr("Учні", "Students")}</h2><p>{tr("Список, доступи й запрошення батьків — у керуванні класом.", "Roster, access, and parent invitations live in class management.")}</p></div><button type="button" className="edu-class-hub__panel-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}><UsersRound className="size-4" aria-hidden="true" />{tr("Керувати класом", "Manage class")}<ArrowRight className="size-4" aria-hidden="true" /></button></div>
            {students.length ? <div className="edu-class-roster"><div className="edu-class-roster__list">{students.slice(0, 6).map((student) => <span className="edu-class-roster__student" key={student.id}><span>{initials(student)}</span>{student.firstName} {student.lastName}</span>)}{students.length > 6 && <span className="edu-class-roster__more">+{students.length - 6}</span>}</div><div className="edu-class-roster__actions"><span className="edu-class-roster__count"><strong>{students.length}</strong>{tr(countForm(students.length, ["учень", "учні", "учнів"]), students.length === 1 ? "learner" : "learners")}</span><button type="button" className="edu-class-hub__panel-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}><UsersRound className="size-4" aria-hidden="true" />{tr("Відкрити список", "Open roster")}</button></div></div> : <div className="edu-class-hub__empty"><span className="edu-class-hub__empty-mark"><UsersRound className="size-5" aria-hidden="true" /></span><strong>{tr("Запроси перших учнів", "Invite the first learners")}</strong><p>{tr("Додай учнів у керуванні класом, щоб почати спільне навчання.", "Add learners in class management to start learning together.")}</p><button type="button" className="edu-class-hub__panel-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати учнів", "Add learners")}</button></div>}
          </section>
        </main>
      </div>
    </div>
  );
};

export default ClassHubPage;
