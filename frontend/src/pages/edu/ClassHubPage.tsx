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
import "./classVisualQuality.css";

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-class-hub min-h-[100dvh] bg-bg-base px-4 py-5 text-text-primary sm:px-6 lg:px-10 lg:py-7";
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

type UnavailablePanels = { students: boolean; topics: boolean; lessons: boolean };

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
  const [unavailable, setUnavailable] = React.useState<UnavailablePanels>({ students: false, topics: false, lessons: false });
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
        setStudents([
          { id: 1, firstName: "Марія", lastName: "Коваль", email: "m.koval@example.edu", generatedUsername: "m.koval", createdAt: new Date().toISOString() },
          { id: 2, firstName: "Андрій", lastName: "Левченко", email: "a.levchenko@example.edu", generatedUsername: "a.levchenko", createdAt: new Date().toISOString() },
          { id: 3, firstName: "Софія", lastName: "Данилюк", email: "s.danyliuk@example.edu", generatedUsername: "s.danyliuk", createdAt: new Date().toISOString() },
          { id: 4, firstName: "Максим", lastName: "Бондар", email: "m.bondar@example.edu", generatedUsername: "m.bondar", createdAt: new Date().toISOString() },
          { id: 5, firstName: "Олена", lastName: "Шевчук", email: "o.shevchuk@example.edu", generatedUsername: "o.shevchuk", createdAt: new Date().toISOString() },
          { id: 6, firstName: "Данило", lastName: "Мельник", email: "d.melnyk@example.edu", generatedUsername: "d.melnyk", createdAt: new Date().toISOString() },
          ...Array.from({ length: 10 }, (_, index) => ({ id: index + 7, firstName: `Учень ${index + 7}`, lastName: "11-А", email: "", generatedUsername: `student_${index + 7}`, createdAt: new Date().toISOString() })),
        ]);
        setTopics([
          { id: 1, title: "Повторення за 10 клас", description: "Практика, теорія та контрольні для цієї теми.", order: 1, language: "PYTHON", tasks: [{}, {}], controlWorks: [{}, {}] },
          { id: 2, title: "Алгоритми та структури даних", description: "Розбираємо складність алгоритмів і базові структури даних.", order: 2, language: "PYTHON", tasks: [{}, {}, {}], controlWorks: [] },
        ]);
        setLessons(sampleLessons);
        setUnavailable({ students: false, topics: false, lessons: false });
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
      setUnavailable({
        students: peopleResult.status === "rejected",
        topics: topicsResult.status === "rejected",
        lessons: lessonsResult.status === "rejected",
      });
      if (liveResult.status === "fulfilled") {
        setLiveSession(liveResult.value.session);
        setLiveEnabled(liveResult.value.enabled);
      } else {
        setLiveSession(null);
        setLiveEnabled(true);
      }
      const failedPanels = [peopleResult, topicsResult, lessonsResult].filter((result) => result.status === "rejected").length;
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
    return <div className={root}><div className="class-overview__message class-overview__message--error" role="alert">{tr("Некоректний ідентифікатор класу.", "Invalid class ID.")}</div></div>;
  }

  const className = classInfo?.name || tr("Клас", "Class");
  const isClassLoaded = classInfo?.id === id;

  if (loading) {
    return (
      <div className={root}>
        <div className="class-overview" role="status" aria-label={tr("Завантажуємо клас", "Loading class")}>
          <div className="class-overview__skeleton class-overview__skeleton--nav" />
          <div className="class-overview__skeleton class-overview__skeleton--heading" />
          <div className="class-overview__skeleton class-overview__skeleton--content" />
        </div>
      </div>
    );
  }

  if (!isClassLoaded) {
    return (
      <div className={root}>
        <div className="class-overview">
          <ClassWorkspaceNavigation classId={id} className={className} active="overview" backHref="/edu" backLabel={tr("EDU простір", "EDU workspace")} reduceMotion={reduceMotion} />
          <section className="class-overview__load-error" role="alert">
            <div><strong>{tr("Не вдалося відкрити клас", "Could not open this class")}</strong><p>{error || tr("Перевір з’єднання та повтори спробу.", "Check your connection and try again.")}</p></div>
            <button type="button" onClick={() => void load()}>{tr("Спробувати ще раз", "Try again")}</button>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={root}>
      <div className="class-overview">
        <ClassWorkspaceNavigation classId={id} className={className} active="overview" backHref="/edu" backLabel={tr("EDU простір", "EDU workspace")} reduceMotion={reduceMotion} />

        <header className="class-overview__header">
          <div className="class-overview__title-block">
            <p>{tr("Класний простір", "Class workspace")}</p>
            <h1>{className}</h1>
            <span>{tr("Навчання, матеріали й заняття класу в одному місці.", "Class learning, materials, and lessons in one place.")}</span>
          </div>
          <div className="class-overview__actions">
            <button type="button" className="class-overview__primary" disabled={!liveEnabled} onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}>
              <Radio className="size-4" aria-hidden="true" />{liveSession ? tr("Повернутися до заняття", "Return to lesson") : tr("Почати заняття", "Start a lesson")}
            </button>
            <button type="button" className="class-overview__secondary" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}>
              <Plus className="size-4" aria-hidden="true" />{tr("Нова тема", "New topic")}
            </button>
          </div>
        </header>

        {!liveEnabled && <p className="class-overview__notice">{tr("Онлайн-уроки вимкнені для цього сервера.", "Live lessons are disabled on this server.")}</p>}
        {error && <div role="alert" className="class-overview__load-error class-overview__load-error--compact"><span>{error}</span><button type="button" onClick={() => void load()}>{tr("Повторити", "Retry")}</button></div>}

        {liveSession && <section className="class-overview__live" aria-label={tr("Онлайн-урок триває", "Live lesson in progress")}>
          <span><i aria-hidden="true" />{tr("ЗАРАЗ НАЖИВО", "LIVE NOW")}</span>
          <strong>{liveSession.title || tr("Зустріч із класом", "Classroom session")}</strong>
          <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}>{tr("Повернутися", "Rejoin")}<ArrowRight className="size-4" aria-hidden="true" /></button>
        </section>}

        <main className="class-overview__main">
          <section id="class-topics" className="class-overview__learning" aria-labelledby="class-topics-title">
            <div className="class-overview__section-heading">
              <div><p>{tr("НАВЧАЛЬНИЙ МАРШРУТ", "LEARNING PATH")}</p><h2 id="class-topics-title">{tr("Теми класу", "Class topics")}</h2></div>
              <button type="button" className="class-overview__text-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати тему", "Add topic")}</button>
            </div>
            {unavailable.topics ? <div className="class-overview__empty"><BookOpen className="size-5" aria-hidden="true" /><p>{tr("Теми тимчасово недоступні.", "Topics are temporarily unavailable.")}</p></div> : topics.length ? (
              <div className="class-overview__topic-list">{topics.map((topic, index) => {
                const practiceCount = topic.tasks?.length || 0;
                const controlCount = topic.controlWorks?.length || 0;
                return <button type="button" key={topic.id} className="class-overview__topic" onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)}>
                  <span className="class-overview__topic-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="class-overview__topic-copy"><strong>{topic.title}</strong><span className="class-overview__topic-description">{topic.description || tr("Практика, теорія та контрольні для цієї теми.", "Practice, theory, and assessments for this topic.")}</span><span className="class-overview__topic-meta"><span>{languageName(topic.language)}</span><span><BookOpenCheck className="size-3.5" aria-hidden="true" />{countText(practiceCount, ["практика", "практики", "практик"], "practice task", "practice tasks")}</span><span><CheckCircle2 className="size-3.5" aria-hidden="true" />{countText(controlCount, ["контрольна", "контрольні", "контрольних"], "assessment", "assessments")}</span></span></span>
                  <ArrowRight className="class-overview__topic-arrow size-4" aria-hidden="true" />
                </button>;
              })}</div>
            ) : <div className="class-overview__empty"><BookOpen className="size-5" aria-hidden="true" /><div><strong>{tr("Почни з першої теми", "Start with a first topic")}</strong><p>{tr("Збери в одному маршруті теорію, практику й контрольні.", "Bring theory, practice, and assessments together in one pathway.")}</p></div><button type="button" className="class-overview__text-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}>{tr("Створити тему", "Create topic")}<ArrowRight className="size-4" aria-hidden="true" /></button></div>}
          </section>

          <aside className="class-overview__lessons" aria-labelledby="class-lessons-title">
            <div className="class-overview__section-heading"><div><p>{tr("ПЛАН КЛАСУ", "CLASS PLAN")}</p><h2 id="class-lessons-title">{tr("Останні заняття", "Recent lessons")}</h2></div><CalendarDays className="class-overview__heading-icon size-5" aria-hidden="true" /></div>
            {unavailable.lessons ? <div className="class-overview__empty"><p>{tr("Заняття тимчасово недоступні.", "Lessons are temporarily unavailable.")}</p></div> : lessons.length ? <div className="class-overview__lesson-list">{lessons.slice(0, 5).map((lesson) => <button type="button" key={eduLessonKey(lesson)} className="class-overview__lesson" onClick={() => navigateWithPreview(navigate, lesson.source === "course" || lesson.type === "LESSON" ? eduLessonPath(lesson) : `/edu/topics/${lesson.id}`)}>
              <span className="class-overview__lesson-mark">{lesson.type === "CONTROL" ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <BookOpenCheck className="size-4" aria-hidden="true" />}</span><span><strong>{lesson.title}</strong><small>{lesson.type === "CONTROL" ? tr("Контрольна", "Assessment") : tr("Заняття", "Lesson")} · {countText(lesson.tasksCount || 0, ["задача", "задачі", "задач"], "task", "tasks")}</small></span><ArrowRight className="class-overview__lesson-arrow size-4" aria-hidden="true" />
            </button>)}</div> : <div className="class-overview__empty"><CalendarDays className="size-5" aria-hidden="true" /><div><strong>{tr("Занять поки немає", "No lessons yet")}</strong><p>{tr("Створи заняття, щоб запланувати наступний крок класу.", "Create a lesson to plan the class’s next step.")}</p></div></div>}
            <button type="button" className="class-overview__text-action class-overview__add-lesson" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати заняття", "Add lesson")}</button>
          </aside>
        </main>

        <section className="class-overview__students" aria-labelledby="class-students-title">
          <div className="class-overview__students-copy"><p>{tr("СКЛАД КЛАСУ", "CLASS ROSTER")}</p><h2 id="class-students-title">{tr("Учні", "Students")}{!unavailable.students && <span>{students.length}</span>}</h2></div>
          {unavailable.students ? <div className="class-overview__students-empty">{tr("Список учнів тимчасово недоступний.", "The student list is temporarily unavailable.")}</div> : students.length ? <div className="class-overview__roster">
            <div className="class-overview__roster-preview">{students.slice(0, 6).map((student) => <span className="class-overview__roster-student" key={student.id}><i>{initials(student)}</i><span>{student.firstName} {student.lastName}</span></span>)}{students.length > 6 && <span className="class-overview__roster-more">+{students.length - 6}</span>}</div>
            <button type="button" className="class-overview__secondary" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}><UsersRound className="size-4" aria-hidden="true" />{tr("Відкрити список", "Open roster")}<ArrowRight className="size-4" aria-hidden="true" /></button>
          </div> : <div className="class-overview__roster-empty"><span>{tr("Учнів ще не додано.", "No students have been added yet.")}</span><button type="button" className="class-overview__text-action" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}>{tr("Додати учнів", "Add students")}<ArrowRight className="size-4" aria-hidden="true" /></button></div>}
        </section>
      </div>
    </div>
  );
};

export default ClassHubPage;
