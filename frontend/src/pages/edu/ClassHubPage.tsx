import React from "react";
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

const isPreview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "min-h-[100dvh] bg-[#f4f7f3] px-4 py-6 text-[#142017] dark:bg-[#08100b] dark:text-[#edf5ef] sm:px-6 lg:px-10 lg:py-10";

const sampleLessons: Lesson[] = [
  { id: 101, title: "Lists and iteration", type: "LESSON", tasksCount: 4, createdAt: new Date().toISOString() },
  { id: 102, title: "Checkpoint: loops", type: "CONTROL", tasksCount: 3, createdAt: new Date().toISOString() },
];

const languageName = (language?: string) => {
  if (language === "CPP") return "C++";
  if (language === "JAVA") return "Java";
  return "Python";
};

const initials = (student: Student) => `${student.firstName?.[0] || ""}${student.lastName?.[0] || ""}`.toUpperCase() || "У";

const navigateWithPreview = (navigate: ReturnType<typeof useNavigate>, path: string) => {
  navigate(`${path}${isPreview() ? (path.includes("?") ? "&" : "?") + "preview=true" : ""}`);
};

export const ClassHubPage: React.FC = () => {
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
      const [group, people, topicList, lessonList] = await Promise.all([
        getClass(id),
        getStudents(id),
        getTopics(id),
        getLessons(id),
      ]);
      setClassInfo(group);
      setStudents(people);
      setTopics(topicList);
      setLessons(lessonList);
      setError(null);
    } catch (caught) {
      if (isPreview()) {
        setClassInfo({ id: -31, name: "10-Б · Python", language: "PYTHON", gradingSystem: "POINTS_12", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        setStudents(Array.from({ length: 24 }, (_, index) => ({ id: index + 1, firstName: index % 2 ? "Марко" : "Софія", lastName: index % 2 ? "Литвин" : "Мельник", email: "", generatedUsername: `student_${index + 1}`, createdAt: new Date().toISOString() })));
        setTopics([
          { id: 1, title: "Основи Python", description: "Синтаксис, змінні, введення та виведення", order: 1, language: "PYTHON", tasks: [{}, {}] },
          { id: 2, title: "Колекції", description: "Списки, словники та проходи по даних", order: 2, language: "PYTHON", tasks: [{}], controlWorks: [{}] },
        ]);
        setLessons(sampleLessons);
        setError(null);
      } else {
        setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити клас."));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { void load(); }, [load]);

  if (!Number.isFinite(id) || id <= 0) {
    return <div className={root}><div className="mx-auto max-w-7xl rounded-3xl border border-red-200 bg-white p-8 text-red-700 dark:border-red-500/30 dark:bg-[#111a14] dark:text-red-200">Некоректний ідентифікатор класу.</div></div>;
  }

  const className = classInfo?.name || "Клас";
  const language = languageName(classInfo?.language);
  const topicUnits = topics.reduce((total, topic) => total + (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0), 0);
  const activeTopics = topics.filter(topic => (topic.tasks?.length || 0) + (topic.controlWorks?.length || 0) > 0).length;

  if (loading) {
    return (
      <div className={root}>
        <div className="mx-auto max-w-7xl space-y-6 animate-pulse">
          <div className="h-5 w-32 rounded-full bg-[#dfe8e0] dark:bg-white/[.08]" />
          <div className="h-72 rounded-[34px] bg-[#dfe8e0] dark:bg-white/[.08]" />
          <div className="grid gap-4 md:grid-cols-4"><div className="h-28 rounded-3xl bg-[#dfe8e0] dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-[#dfe8e0] dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-[#dfe8e0] dark:bg-white/[.08]" /><div className="h-28 rounded-3xl bg-[#dfe8e0] dark:bg-white/[.08]" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1480px] space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => navigateWithPreview(navigate, "/edu")} className="inline-flex items-center gap-2 rounded-full border border-[#142018]/10 bg-white/80 px-4 py-2 text-sm font-bold text-[#536259] shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[.06] dark:text-[#dce8df]"><ArrowLeft className="size-4" /> EDU простір</button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[#718077] dark:text-[#91a197]"><span>Викладач</span><span className="text-[#00b963]">/</span><span>{className}</span></div>
        </div>

        <section className="overflow-hidden rounded-[36px] border border-[#132117]/10 bg-[#13241a] text-white shadow-[0_30px_90px_rgba(7,24,13,.18)] dark:border-white/10">
          <div className="grid lg:grid-cols-[1.25fr_.75fr]">
            <div className="relative overflow-hidden p-6 sm:p-9 lg:p-12"><div className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full bg-[#00d978]/10 blur-3xl" /><div className="relative"><div className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-[#7bedb4]"><span>Класний центр</span><span className="rounded-full border border-[#7bedb4]/30 px-2 py-1">{language}</span></div><h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black tracking-[-.07em] sm:text-6xl">{className}</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[#c6d4c9]">Плануйте заняття, відкривайте навчальний маршрут і тримайте прогрес класу в одному зрозумілому просторі.</p><div className="mt-8 flex flex-wrap gap-3"><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)} className="inline-flex items-center gap-2 rounded-2xl bg-[#00d978] px-5 py-3 text-sm font-black text-[#061e10] shadow-[0_16px_40px_rgba(0,217,120,.22)]"><Radio className="size-4" />Почати заняття</button><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-white/95"><Plus className="size-4" />Нова тема</button><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-5 py-3 text-sm font-bold text-white/95"><Settings className="size-4" />Налаштувати клас</button></div></div></div>
            <div className="border-t border-white/10 bg-white/[.045] p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#7bedb4]">Стан класу</p><p className="mt-2 text-sm text-[#b9cdbd]">Навчальний маршрут готовий до роботи</p></div><span className="grid size-12 place-items-center rounded-2xl bg-[#00d978]/15 text-[#7bedb4]"><Sparkles className="size-5" /></span></div><div className="mt-7 grid grid-cols-2 gap-3">{[{ value: students.length, label: "учнів" }, { value: topics.length, label: "тем" }, { value: lessons.length, label: "занять" }, { value: topicUnits, label: "навчальних блоків" }].map(item => <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[.055] p-4"><strong className="block text-3xl font-black tracking-[-.06em]">{item.value}</strong><span className="mt-2 block text-xs font-bold text-[#b9cdbd]">{item.label}</span></div>)}</div></div>
          </div>
        </section>

        {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#ff6b9d]/25 bg-[#fff0f4] px-4 py-3 text-sm text-[#bd3c62] dark:bg-[#ff6b9d]/10 dark:text-[#ffa5bf]"><span>{error}</span><button type="button" onClick={() => void load()} className="rounded-xl border border-current px-3 py-2 text-xs font-bold">Повторити</button></div>}

        <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-[#142018]/10 bg-white/80 p-2 shadow-sm dark:border-white/10 dark:bg-white/[.04]" aria-label="Навігація класу">{[{ label: "Огляд", active: true, onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }) }, { label: "Учні", onClick: () => navigateWithPreview(navigate, `/edu/classes/${id}/manage`) }, { label: "Навчання", onClick: () => document.getElementById("class-topics")?.scrollIntoView({ behavior: "smooth" }) }, { label: "Журнал", onClick: () => navigateWithPreview(navigate, `/edu/classes/${id}/gradebook`) }, { label: "Календар", onClick: () => navigateWithPreview(navigate, "/edu/calendar") }].map(item => <button type="button" key={item.label} onClick={item.onClick} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-bold transition ${item.active ? "bg-[#13241a] text-white shadow-sm dark:bg-[#00d978] dark:text-[#062112]" : "text-[#65746a] hover:bg-[#edf5ee] hover:text-[#142017] dark:text-[#aab9ae] dark:hover:bg-white/[.07] dark:hover:text-white"}`}>{item.label}</button>)}</nav>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[{ label: "Live клас", text: "Провести заняття наживо", icon: Radio, path: `/edu/classes/${id}/live`, tone: "green" }, { label: "Журнал", text: "Оцінки, присутність і прогрес учнів", icon: GraduationCap, path: `/edu/classes/${id}/gradebook`, tone: "neutral" }, { label: "Нове заняття", text: "Додати матеріал до маршруту", icon: FilePlus2, path: `/edu/classes/${id}/lessons/new`, tone: "orange" }].map(item => { const Icon = item.icon; return <button type="button" key={item.label} onClick={() => navigateWithPreview(navigate, item.path)} className={`group rounded-[26px] border p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(18,32,23,.10)] ${item.tone === "green" ? "border-[#00d978]/25 bg-[#e8f8ee] dark:bg-[#10271a]" : item.tone === "orange" ? "border-[#ffb454]/25 bg-[#fff8ec] dark:bg-[#2a2011]" : "border-[#142018]/10 bg-white dark:border-white/10 dark:bg-[#111a14]"}`}><span className="grid size-11 place-items-center rounded-2xl bg-[#13241a] text-[#7bedb4] dark:bg-white/[.08]"><Icon className="size-5" /></span><h2 className="mt-5 text-xl font-black tracking-[-.04em]">{item.label}</h2><p className="mt-2 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">{item.text}</p><span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#16834d] opacity-0 transition group-hover:opacity-100 dark:text-[#7bedb4]">Відкрити <ArrowRight className="size-4" /></span></button>; })}</section>

        <main className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section id="class-topics" className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">Навчальний маршрут</p><h2 className="mt-2 text-3xl font-black tracking-[-.055em]">Теми класу</h2><p className="mt-2 text-sm text-[#718075] dark:text-[#aab9ae]">{activeTopics} активних тем із матеріалами</p></div><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="inline-flex items-center gap-2 rounded-xl bg-[#13241a] px-4 py-2.5 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#062112]"><Plus className="size-4" />Додати тему</button></div><div className="mt-6 grid gap-3 md:grid-cols-2">{topics.map((topic, index) => { const practiceCount = topic.tasks?.length || 0; const controlCount = topic.controlWorks?.length || 0; return <button type="button" key={topic.id} onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)} className="group rounded-[24px] border border-[#142018]/10 bg-[#f7faf6] p-5 text-left transition hover:-translate-y-0.5 hover:border-[#00d978]/40 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07]"><div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-white text-sm font-black text-[#16834d] shadow-sm dark:bg-[#0b130e] dark:text-[#7bedb4]">{String(index + 1).padStart(2, "0")}</span><span className="rounded-full border border-[#142018]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-[#718077] dark:border-white/10 dark:text-[#aab9ae]">{languageName(topic.language)}</span></div><strong className="mt-5 block text-lg font-black tracking-[-.035em]">{topic.title}</strong><span className="mt-2 block min-h-12 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">{topic.description || "Практика, теорія та контрольні для цієї теми."}</span><span className="mt-4 flex items-center justify-between gap-2 border-t border-[#142018]/8 pt-3 text-xs font-bold text-[#718077] dark:border-white/10 dark:text-[#aab9ae]"><span>{practiceCount} практик · {controlCount} контрольних</span><ArrowRight className="size-4 text-[#16834d] transition group-hover:translate-x-1 dark:text-[#7bedb4]" /></span></button>; })}{!topics.length && <div className="col-span-full rounded-[24px] border border-dashed border-[#142018]/15 p-12 text-center dark:border-white/10"><BookOpen className="mx-auto size-9 text-[#16834d] dark:text-[#7bedb4]" /><h3 className="mt-4 text-xl font-black">Створіть першу тему</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">Побудуйте маршрут класу з теорії, практики та контрольних.</p><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="mt-5 rounded-xl bg-[#00c96e] px-4 py-2.5 text-sm font-bold text-[#062112]">Створити тему</button></div>}</div></section>

          <aside className="space-y-6"><section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#e17800]">Поточний потік</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Останні заняття</h2></div><ClipboardList className="size-5 text-[#e17800]" /></div><div className="mt-5 space-y-3">{lessons.slice(0, 5).map(lesson => <button type="button" key={lesson.id} onClick={() => navigateWithPreview(navigate, `/edu/lessons/${lesson.id}?type=${encodeURIComponent(lesson.type || "LESSON")}`)} className="group flex w-full items-center gap-3 rounded-2xl bg-[#f7faf6] p-4 text-left transition hover:bg-[#eef6f0] dark:bg-white/[.045] dark:hover:bg-white/[.07]"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-black shadow-sm ${lesson.type === "CONTROL" ? "bg-[#fff1dc] text-[#a55e00]" : "bg-white text-[#16834d] dark:bg-[#0b130e] dark:text-[#7bedb4]"}`}>{lesson.type === "CONTROL" ? "К" : "У"}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-black">{lesson.title}</strong><span className="mt-1 block text-xs text-[#6b7a70] dark:text-[#aebbb2]">{lesson.type === "CONTROL" ? "Контрольна" : "Заняття"} · {lesson.tasksCount || 0} задач</span></span><ArrowRight className="size-4 text-[#91a095] transition group-hover:translate-x-1" /></button>)}{!lessons.length && <div className="rounded-2xl border border-dashed border-[#142018]/15 px-4 py-10 text-center text-sm text-[#6b7a70] dark:border-white/10 dark:text-[#aebbb2]">Додайте перше заняття, щоб клас отримав маршрут.</div>}</div><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)} className="mt-5 inline-flex items-center gap-2 text-sm font-black text-[#16834d] dark:text-[#7bedb4]"><Plus className="size-4" />Додати заняття</button></section>

            <section className="rounded-[32px] bg-[#fff8ec] p-5 shadow-[0_18px_60px_rgba(18,32,23,.05)] dark:bg-[#2a2011] sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#d97706]">Люди класу</p><h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Учні</h2></div><UsersRound className="size-5 text-[#d97706]" /></div><div className="mt-5 flex items-center justify-between gap-3"><div className="flex -space-x-2">{students.slice(0, 6).map(student => <span key={student.id} title={`${student.firstName} ${student.lastName}`} className="grid size-10 place-items-center rounded-full border-2 border-[#fff8ec] bg-[#183023] text-xs font-black text-[#aef0c9] dark:border-[#2a2011]">{initials(student)}</span>)}{students.length > 6 && <span className="grid size-10 place-items-center rounded-full border-2 border-[#fff8ec] bg-[#f5d9a8] text-xs font-black text-[#7a4d00] dark:border-[#2a2011]">+{students.length - 6}</span>}</div><strong className="text-3xl font-black tracking-[-.06em] text-[#7a4d00]">{students.length}</strong></div><p className="mt-5 text-sm leading-6 text-[#776e5d] dark:text-[#d1bd99]">Керуйте списком учнів, доступами та батьківськими запрошеннями.</p><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/manage`)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#183023] px-4 py-3 text-sm font-bold text-white dark:bg-[#f5d9a8] dark:text-[#30200d]"><UsersRound className="size-4" />Відкрити список учнів</button>{!students.length && <div className="mt-3 flex items-center gap-2 text-xs font-bold text-[#a55e00]"><Mail className="size-4" />Запросіть першого учня в керуванні класом.</div>}</section>

            <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-7"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl bg-[#e7f6ec] text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#7bedb4]"><CheckCircle2 className="size-5" /></span><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#16834d] dark:text-[#7bedb4]">Наступний крок</p><h2 className="mt-1 text-xl font-black">Підготуйте заняття</h2></div></div><p className="mt-4 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">Додайте теорію та практику, а потім відкрийте журнал, щоб побачити результат класу.</p><div className="mt-5 grid grid-cols-2 gap-2"><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="rounded-xl bg-[#edf6ee] px-3 py-3 text-xs font-bold text-[#16834d] dark:bg-[#00ff88]/10 dark:text-[#7bedb4]"><BookOpen className="mx-auto mb-1 size-4" />Тема</button><button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/gradebook`)} className="rounded-xl bg-[#f3f5f3] px-3 py-3 text-xs font-bold text-[#536259] dark:bg-white/[.06] dark:text-[#c2d0c5]"><GraduationCap className="mx-auto mb-1 size-4" />Журнал</button></div></section>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default ClassHubPage;
