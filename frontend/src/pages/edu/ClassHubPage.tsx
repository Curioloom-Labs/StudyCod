import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FilePlus2,
  GraduationCap,
  Plus,
  Radio,
  Settings,
  UsersRound,
} from "lucide-react";
import { getClass, getLessons, getStudents, getTopics, type Lesson, type Student, type Topic } from "../../lib/api/edu";
import { getErrorMessageFromUnknown } from "../../lib/safeError";

const preview = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
const root = "min-h-[100dvh] bg-[#f3f5f0] px-4 py-6 text-[#101812] dark:bg-[#08100b] dark:text-[#ecf5ee] sm:px-6 lg:px-10 lg:py-10";

const sampleLessons = [
  { id: 101, title: "Lists and iteration", type: "LESSON", tasksCount: 4 },
  { id: 102, title: "Checkpoint: loops", type: "CONTROL", tasksCount: 3 },
] as Lesson[];

const navigateWithPreview = (navigate: ReturnType<typeof useNavigate>, path: string) => {
  navigate(`${path}${preview() ? "?preview=true" : ""}`);
};

export const ClassHubPage: React.FC = () => {
  const { classId } = useParams<{ classId: string }>();
  const navigate = useNavigate();
  const id = Number(classId);
  const [data, setData] = React.useState<{ name: string; language: string } | null>(null);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [topics, setTopics] = React.useState<Topic[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [group, people, topicList, lessonList] = await Promise.all([
          getClass(id),
          getStudents(id),
          getTopics(id),
          getLessons(id),
        ]);
        if (!active) return;
        setData(group);
        setStudents(people);
        setTopics(topicList);
        setLessons(lessonList);
        setError(null);
      } catch (caught) {
        if (!active) return;
        if (preview()) {
          setData({ name: "9-Б · Python", language: "Python" });
          setStudents(Array.from({ length: 24 }) as Student[]);
          setTopics([
            { id: 1, title: "Основи Python", description: "Синтаксис, змінні, введення/виведення", order: 1, language: "PYTHON" },
            { id: 2, title: "Колекції", description: "Списки, словники, проходи по даних", order: 2, language: "PYTHON" },
          ] as Topic[]);
          setLessons(sampleLessons);
        } else {
          setError(getErrorMessageFromUnknown(caught, "Не вдалося завантажити клас."));
        }
      }
    })();
    return () => { active = false; };
  }, [id]);

  const stats = [
    { label: "учні", value: students.length, icon: UsersRound },
    { label: "теми", value: topics.length, icon: BookOpen },
    { label: "заняття", value: lessons.length, icon: ClipboardList },
  ];

  const actions = [
    { label: "Live клас", text: "Відкрити кімнату уроку", icon: Radio, path: `/edu/classes/${id}/live`, primary: true },
    { label: "Журнал", text: "Оцінки, тематичні, семестр", icon: GraduationCap, path: `/edu/classes/${id}/gradebook` },
    { label: "Відвідування", text: "Присутність та список учнів", icon: CalendarDays, path: `/edu/classes/${id}/attendance` },
    { label: "Підсумки", text: "Архів тематичних", icon: Settings, path: `/edu/classes/${id}/summary-grades` },
  ];

  return (
    <div className={root}>
      <div className="mx-auto max-w-[1460px] space-y-6">
        <button
          type="button"
          onClick={() => navigateWithPreview(navigate, "/edu")}
          className="inline-flex items-center gap-2 rounded-full border border-[#142018]/10 bg-white/80 px-4 py-2 text-sm font-bold text-[#334139] shadow-sm transition hover:-translate-y-0.5 dark:border-white/10 dark:bg-white/[.06] dark:text-[#dce8df]"
        >
          <ArrowLeft className="size-4" />
          EDU простір
        </button>

        <section className="overflow-hidden rounded-[36px] border border-[#122017]/10 bg-[#111a14] text-white shadow-[0_28px_90px_rgba(7,24,13,.20)] dark:border-white/10">
          <div className="grid gap-0 lg:grid-cols-[1.25fr_.75fr]">
            <div className="p-6 sm:p-9 lg:p-11">
              <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#7bedb4]">Класний центр</p>
              <h1 className="mt-5 max-w-4xl font-[family-name:var(--font-display)] text-4xl font-black tracking-[-.07em] sm:text-6xl">
                {data?.name || "Клас"}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#c6d4c9]">
                Операційний екран вчителя: почати урок, перейти в журнал, керувати темами та швидко бачити, що вже відкрито учням.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/live`)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#00d978] px-5 py-3 text-sm font-black text-[#061e10] shadow-[0_16px_40px_rgba(0,217,120,.22)]"
                >
                  <Radio className="size-4" />
                  Почати заняття
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/14 px-5 py-3 text-sm font-bold text-white/95"
                >
                  <Plus className="size-4" />
                  Нова тема
                </button>
                <button
                  type="button"
                  onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/lessons/new`)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/14 px-5 py-3 text-sm font-bold text-white/95"
                >
                  <FilePlus2 className="size-4" />
                  Новий урок
                </button>
              </div>
            </div>
            <div className="border-t border-white/10 bg-white/[.045] p-6 sm:p-9 lg:border-l lg:border-t-0 lg:p-10">
              <div className="grid gap-3">
                {stats.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="rounded-[24px] border border-white/10 bg-white/[.055] p-5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="grid size-11 place-items-center rounded-2xl bg-[#00d978]/15 text-[#7bedb4]">
                          <Icon className="size-5" />
                        </span>
                        <strong className="text-4xl font-black tracking-[-.07em]">{item.value}</strong>
                      </div>
                      <p className="mt-4 text-sm font-bold text-[#c6d4c9]">{item.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl border border-[#ff6b9d]/25 bg-[#ff6b9d]/10 px-4 py-3 text-sm font-medium text-[#c4436b]">{error}</div>}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button
                type="button"
                key={item.label}
                onClick={() => navigateWithPreview(navigate, item.path)}
                className={`rounded-[28px] border p-5 text-left transition hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(18,32,23,.10)] ${
                  item.primary
                    ? "border-[#00d978]/25 bg-[#e8f8ee] dark:bg-[#10271a]"
                    : "border-[#142018]/10 bg-white dark:border-white/10 dark:bg-[#111a14]"
                }`}
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-[#111a14] text-[#7bedb4] dark:bg-white/[.08]">
                  <Icon className="size-5" />
                </span>
                <h2 className="mt-5 text-xl font-black tracking-[-.04em]">{item.label}</h2>
                <p className="mt-2 text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">{item.text}</p>
              </button>
            );
          })}
        </section>

        <main className="grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[#16834d] dark:text-[#7bedb4]">Навчальна карта</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Теми класу</h2>
              </div>
              <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/topics/new`)} className="rounded-xl bg-[#111a14] px-4 py-2.5 text-sm font-bold text-white dark:bg-[#00d978] dark:text-[#061e10]">
                Додати
              </button>
            </div>
            <div className="mt-5 grid gap-3">
              {topics.map((topic, index) => (
                <button
                  type="button"
                  key={topic.id}
                  onClick={() => navigateWithPreview(navigate, `/edu/topics/${topic.id}`)}
                  className="group grid gap-4 rounded-[24px] border border-[#142018]/10 bg-[#f7faf6] p-4 text-left transition hover:border-[#00d978]/40 hover:bg-white dark:border-white/10 dark:bg-white/[.045] dark:hover:bg-white/[.07] sm:grid-cols-[54px_1fr_auto]"
                >
                  <span className="grid size-12 place-items-center rounded-2xl bg-white text-sm font-black text-[#16834d] shadow-sm dark:bg-[#0b130e] dark:text-[#7bedb4]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong className="block text-lg font-black tracking-[-.035em]">{topic.title}</strong>
                    <span className="mt-1 block text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">{topic.description || "Практика, теорія та контрольні для цієї теми."}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 self-center text-sm font-bold text-[#16834d] opacity-0 transition group-hover:opacity-100 dark:text-[#7bedb4]">
                    Відкрити <ArrowRight className="size-4" />
                  </span>
                </button>
              ))}
              {!topics.length && (
                <div className="rounded-[24px] border border-dashed border-[#142018]/15 p-10 text-center dark:border-white/10">
                  <BookOpen className="mx-auto size-8 text-[#16834d] dark:text-[#7bedb4]" />
                  <h3 className="mt-4 text-xl font-black">Створіть першу тему</h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#6b7a70] dark:text-[#aebbb2]">
                    Теми тепер є головною одиницею: після теми журнал автоматично готує тематичну колонку.
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[32px] border border-[#142018]/10 bg-white p-5 shadow-[0_18px_60px_rgba(18,32,23,.06)] dark:border-white/10 dark:bg-[#111a14] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[.15em] text-[#e17800]">Поточний потік</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-.05em]">Останні заняття</h2>
              </div>
              <button type="button" onClick={() => navigateWithPreview(navigate, `/edu/classes/${id}/gradebook`)} className="text-sm font-black text-[#16834d] dark:text-[#7bedb4]">
                Журнал →
              </button>
            </div>
            <div className="mt-5 space-y-3">
              {lessons.slice(0, 7).map((lesson) => (
                <button
                  type="button"
                  key={lesson.id}
                  onClick={() => navigateWithPreview(navigate, `/edu/lessons/${lesson.id}`)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[#f7faf6] p-4 text-left transition hover:bg-[#eef6f0] dark:bg-white/[.045] dark:hover:bg-white/[.07]"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-white text-xs font-black text-[#e17800] shadow-sm dark:bg-[#0b130e]">
                    {lesson.type === "CONTROL" ? "К" : "У"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm font-black">{lesson.title}</strong>
                    <span className="mt-1 block text-xs text-[#6b7a70] dark:text-[#aebbb2]">{lesson.tasksCount ?? 0} задач</span>
                  </span>
                  <ArrowRight className="size-4 text-[#91a095]" />
                </button>
              ))}
              {!lessons.length && (
                <p className="rounded-2xl border border-dashed border-[#142018]/15 px-4 py-10 text-center text-sm text-[#6b7a70] dark:border-white/10 dark:text-[#aebbb2]">
                  Створіть урок або тему, щоб клас отримав навчальний маршрут.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default ClassHubPage;
