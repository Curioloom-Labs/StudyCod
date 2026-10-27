import { eduLessonPath, eduLessonKey } from "../../lib/eduNavigation";
import React from "react";
import { useReducedMotion } from "framer-motion";
import "./eduWorkspace.css";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Plus,
  Radio,
  UsersRound,
  Search,
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
import { ClassWorkspaceNavigation, ClassWorkspaceFrame } from "./ClassWorkspaceNavigation";
import "./classVisualQuality.css";

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "edu-workspace edu-class-hub min-h-[100dvh] bg-bg-base px-4 py-5 text-text-primary sm:px-6 lg:px-10 lg:py-7";
const languageName = (language?: string) => language || "—";

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
  const [searchParams] = useSearchParams();
  const [topicQuery, setTopicQuery] = React.useState("");
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

  const isLearning = searchParams.get("view") === "learning";
  const visibleTopics = topics.filter(topic => topic.title.toLocaleLowerCase().includes(topicQuery.toLocaleLowerCase()));
  return <div className={root}>
    <ClassWorkspaceFrame classId={id} className={className} active={isLearning ? "learning" : "overview"}>
      <div className="classroom-overview">
        <header className="classroom-heading">
          <div><p>{tr("Клас", "Class")} / {className}</p><h1>{isLearning ? tr("Теми та завдання", "Topics and tasks") : tr("Огляд класу", "Class overview")}</h1><span>{isLearning ? tr("Програма навчання, практика й контрольні роботи.", "The learning programme, practice, and assessments.") : tr("Навчальна програма та робота з учнями.", "Your teaching programme and class activity.")}</span></div>
          <div className="classroom-actions"><button type="button" className="classroom-button" disabled={!liveEnabled} onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}><Radio className="size-4" aria-hidden="true" />{liveSession ? tr("Повернутися до заняття", "Rejoin lesson") : tr("Онлайн-урок", "Live lesson")}</button><button type="button" className="classroom-button classroom-button--primary" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Нова тема", "New topic")}</button></div>
        </header>
        <div className="classroom-facts"><span><UsersRound className="size-4" aria-hidden="true" />{tr("Учні", "Students")}: {unavailable.students ? "—" : students.length}</span><span><BookOpen className="size-4" aria-hidden="true" />{tr("Теми", "Topics")}: {unavailable.topics ? "—" : topics.length}</span><span><CalendarDays className="size-4" aria-hidden="true" />{tr("Заняття", "Lessons")}: {unavailable.lessons ? "—" : lessons.length}</span></div>
        {error && <div role="alert" className="classroom-notice">{error}<button type="button" onClick={() => void load()}>{tr("Повторити", "Retry")}</button></div>}
        {!liveEnabled && <p className="classroom-caption">{tr("Онлайн-уроки вимкнені для цього сервера.", "Live lessons are disabled on this server.")}</p>}
        {liveSession && <div className="classroom-notice"><Radio className="size-4" aria-hidden="true" /><strong>{liveSession.title || tr("Урок триває", "Lesson in progress")}</strong><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}>{tr("Приєднатися", "Join")}</button></div>}
        <div className={`classroom-overview__layout ${isLearning ? "is-learning" : ""}`}>
          <section id="class-topics" className="classroom-programme" aria-labelledby="class-topics-title">
            <div className="classroom-section-title"><h2 id="class-topics-title">{tr("Навчальна програма", "Teaching programme")}<span>{topics.length}</span></h2>{!isLearning && <button type="button" className="classroom-text-button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}?view=learning`)}>{tr("Усі теми", "All topics")}<ArrowRight className="size-3.5" aria-hidden="true" /></button>}</div>
            <div className="classroom-toolbar"><label className="classroom-search"><Search className="size-4" aria-hidden="true" /><input type="search" value={topicQuery} onChange={event => setTopicQuery(event.target.value)} aria-label={tr("Знайти тему", "Search topics")} placeholder={tr("Знайти тему…", "Search topics…")} /></label></div>
            <div className="classroom-topic-columns" aria-hidden="true"><span>{tr("Тема", "Topic")}</span><span>{tr("Мова", "Language")}</span><span>{tr("Практики", "Practice")}</span><span>{tr("Контрольні", "Tests")}</span><span /></div>
            {unavailable.topics ? <div className="classroom-empty">{tr("Не вдалося завантажити теми.", "Could not load topics.")}</div> : <div className="classroom-topic-list">{visibleTopics.map((topic, index) => <button type="button" key={topic.id} className="classroom-topic" onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)}><span className="classroom-topic__name"><span className="classroom-topic__index">{String(index + 1).padStart(2, "0")}</span><span><strong>{topic.title}</strong><small>{topic.description || tr("Теорія та практичні завдання", "Theory and practice tasks")}</small></span></span><span className="classroom-language">{languageName(topic.language)}</span><span className="classroom-topic__count">{topic.tasks?.length || 0}<small>{tr("практик", "practice")}</small></span><span className="classroom-topic__count">{topic.controlWorks?.length || 0}<small>{tr("контрольних", "tests")}</small></span><ArrowRight className="size-4" aria-hidden="true" /></button>)}</div>}
            {!unavailable.topics && !visibleTopics.length && <div className="classroom-empty"><BookOpen className="size-6" aria-hidden="true" /><strong>{topicQuery ? tr("Тем не знайдено", "No matching topics") : tr("Додайте першу тему", "Add your first topic")}</strong><p>{topicQuery ? tr("Спробуйте іншу назву.", "Try another name.") : tr("Зберіть матеріали й завдання для класу.", "Bring together materials and tasks for your class.")}</p>{!topicQuery && <button type="button" className="classroom-button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Нова тема", "New topic")}</button>}</div>}
            <button type="button" className="classroom-add-row" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}><Plus className="size-4" aria-hidden="true" />{tr("Додати тему до програми", "Add a topic to the programme")}</button>
          </section>
          {!isLearning && <aside className="classroom-overview__aside">
            <section><div className="classroom-section-title"><h2>{tr("Останні заняття", "Recent lessons")}</h2></div>{unavailable.lessons ? <p className="classroom-caption">{tr("Заняття тимчасово недоступні.", "Lessons are temporarily unavailable.")}</p> : lessons.slice(0, 4).map(lesson => <button type="button" key={eduLessonKey(lesson)} className="classroom-lesson-link" onClick={() => navigateWithPreview(navigate, lesson.source === "course" || lesson.type === "LESSON" ? eduLessonPath(lesson) : `/edu/topics/${lesson.id}`)}><BookOpenCheck className="size-4" aria-hidden="true" /><span><strong>{lesson.title}</strong><small>{lesson.tasksCount || 0} {tr("задач", "tasks")}</small></span><ArrowRight className="size-3.5" aria-hidden="true" /></button>)}{!unavailable.lessons && !lessons.length && <p className="classroom-caption">{tr("Занять ще немає.", "No lessons yet.")}</p>}<button type="button" className="classroom-text-button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)}><Plus className="size-3.5" aria-hidden="true" />{tr("Додати заняття", "Add lesson")}</button></section>
            <section><div className="classroom-section-title"><h2>{tr("Учні класу", "Class students")}<span>{unavailable.students ? "—" : students.length}</span></h2></div>{students.slice(0, 4).map(student => <div className="classroom-person" key={student.id}><span aria-hidden="true">{initials(student)}</span><strong>{student.lastName} {student.firstName}</strong></div>)}{unavailable.students && <p className="classroom-caption">{tr("Не вдалося завантажити список.", "Could not load the roster.")}</p>}<button type="button" className="classroom-text-button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)}>{tr("Відкрити список учнів", "Open student roster")}<ArrowRight className="size-3.5" aria-hidden="true" /></button></section>
          </aside>}
        </div>
      </div>
    </ClassWorkspaceFrame>
  </div>;

};

export default ClassHubPage;
