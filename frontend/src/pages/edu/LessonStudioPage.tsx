import React from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
  Navigate,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import { useDialogA11y } from "../../components/ui/useDialogA11y";
import {
  createTask as apiCreateTask,
  generateQuiz,
  getLesson,
  saveQuiz,
  startLessonAttempt,
  finishCourseLesson,
  submitQuizAnswers,
  type Lesson,
  type Task,
} from "../../lib/api/edu";
import { getEduErrorMessage as getErrorMessageFromUnknown } from "../../lib/eduError";
import { tr } from "../../i18n";
import { useTranslation } from "react-i18next";
import { withDevPreview } from "../../lib/devPreview";
import "./eduWorkspace.css";
import { CourseTaskTestFields, emptyCourseTest, validCourseTests } from "./CourseTaskTestFields";
import type { CourseTestInput } from "../../lib/api/edu";
import { Modal } from "../../components/ui/Modal";
import { eduLessonPath } from "../../lib/eduNavigation";

type Quiz = {
  question: string;
  options: Record<string, string>;
  correct: string;
};
type MiniProjectSpec = {
  version: 1;
  kind: "MINI_PROJECT";
  estimatedMinutes: number;
  skills: string[];
  milestones: Array<{ id: string; title: string; description: string; required?: boolean }>;
  extensions?: string[];
};
const parseProjectSpec = (raw: string): MiniProjectSpec | null => {
  if (!raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(tr("JSON мініпроєкту має помилку синтаксису.", "Mini project JSON has a syntax error."));
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(tr("JSON мініпроєкту має бути обʼєктом.", "Mini project JSON must be an object."));
  const value = parsed as Record<string, unknown>;
  const milestones = Array.isArray(value.milestones) ? value.milestones : [];
  const validMilestones = milestones.every((item) => {
    if (!item || typeof item !== "object") return false;
    const milestone = item as Record<string, unknown>;
    return typeof milestone.id === "string" && milestone.id.trim() && typeof milestone.title === "string" && milestone.title.trim() && typeof milestone.description === "string" && milestone.description.trim();
  });
  if (value.version !== 1 || value.kind !== "MINI_PROJECT" || !Number.isFinite(Number(value.estimatedMinutes)) || Number(value.estimatedMinutes) <= 0 || !Array.isArray(value.skills) || value.skills.some((item) => typeof item !== "string" || !item.trim()) || !milestones.length || !validMilestones) {
    throw new Error(tr("Перевірте version, kind, estimatedMinutes, skills і milestones мініпроєкту.", "Check the mini project's version, kind, estimatedMinutes, skills, and milestones."));
  }
  return {
    version: 1,
    kind: "MINI_PROJECT",
    estimatedMinutes: Number(value.estimatedMinutes),
    skills: value.skills.map((item) => String(item).trim()),
    milestones: milestones.map((item) => {
      const milestone = item as Record<string, unknown>;
      return { id: String(milestone.id).trim(), title: String(milestone.title).trim(), description: String(milestone.description).trim(), ...(milestone.required === undefined ? {} : { required: Boolean(milestone.required) }) };
    }),
    ...(Array.isArray(value.extensions) ? { extensions: value.extensions.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) } : {}),
  };
};
const preview = () =>
  import.meta.env.DEV &&
  new URLSearchParams(window.location.search).get("preview") === "true";
const shell = "edu-workspace mx-auto max-w-[1260px] px-4 py-7 sm:px-6 lg:px-10 lg:py-10";
const exampleLesson: Lesson & { tasks: Task[] } = {
  id: 41,
  type: "LESSON",
  title: "Цикли: від ідеї до коду",
  parentTopicTitle: "Python · межа циклу",
  hasTheory: true,
  theory: "# Сума від 1 до n\n\nРозглянемо, як межі циклу змінюють результат. Для n = 5 сума чисел від 1 до 5 включно дорівнює 15.\n\n## Спостереження\n\nУ Python права межа range не входить до послідовності. Перевір результат на публічному тесті, перш ніж змінювати код.",
  tasksCount: 1,
  createdAt: new Date().toISOString(),
  tasks: [
    {
      id: 501,
      title: "Сума від 1 до n",
      description: "Реалізуйте sum_to(n), яка повертає суму чисел від 1 до n включно. Публічний тест: n = 5, очікуване значення — 15.",
      template: "",
      testDataCount: 1,
      createdAt: new Date().toISOString(),
    },
  ],
};
const Overlay: React.FC<{
  title: string;
  sub?: string;
  children: React.ReactNode;
  onClose: () => void;
}> = ({ title, sub, children, onClose }) => {
  const titleId = React.useId();
  const panelRef = useDialogA11y({ open: true, onClose });
  return <div data-dialog-a11y="direct" data-material="lesson-dialog-scrim" className="fixed inset-0 z-[80] overflow-y-auto bg-bg-code/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panelRef as React.RefObject<HTMLElement>} data-dialog-a11y="direct" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-material="lesson-dialog" className="mx-auto mt-8 max-w-xl rounded-[30px] bg-bg-surface p-6 shadow-2xl dark:bg-bg-code sm:p-8">
      <button type="button"
        onClick={onClose}
        aria-label={tr("Закрити вікно", "Close dialog")}
        className="float-right grid h-10 w-10 place-items-center rounded-full bg-bg-hover text-xl dark:bg-white/[.07]"
      >
        ×
      </button>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
        {tr("Урок / редактор", "Lesson / editor")}
      </p>
      <h2 id={titleId} className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">
        {title}
      </h2>
      {sub && (
        <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
          {sub}
        </p>
      )}
      <div className="mt-7 clear-both">{children}</div>
    </section>
  </div>;
};
const markdownBlocks = (source?: string) =>
  (source || "")
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((block, index) =>
      block.startsWith("#") ? (
        <h2
          key={index}
          className="mt-8 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em] first:mt-0"
        >
          {block.replace(/^#+\s*/, "")}
        </h2>
      ) : block.startsWith("-") ? (
        <ul
          key={index}
          className="mt-4 space-y-2 text-base leading-7 text-text-primary dark:text-text-secondary"
        >
          {block.split("\n").map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              {item.replace(/^-\s*/, "")}
            </li>
          ))}
        </ul>
      ) : (
        <p
          key={index}
          className="mt-4 text-base leading-8 text-text-primary dark:text-text-secondary"
        >
          {block}
        </p>
      ),
    );

const LessonTeacherStudio: React.FC = () => {
  useTranslation();
  const { lessonId } = useParams<{ lessonId: string }>();
  const id = Number(lessonId);
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const lessonType = params.get("type") as
    "TOPIC" | "CONTROL" | "LESSON" | null;
  const [lesson, setLesson] = React.useState<
    (Lesson & { tasks: Task[] }) | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [modal, setModal] = React.useState<"task" | "quiz" | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [selectedTask, setSelectedTask] = React.useState<{ id: number; title: string; description?: string; template?: string; taskMode?: string; testDataCount?: number } | null>(null);
  const [task, setTask] = React.useState<{
    title: string;
    description: string;
    template: string;
    projectSpecJson?: string;
  }>({ title: "", description: "", template: "", projectSpecJson: "" });
  const [taskTests, setTaskTests] = React.useState<CourseTestInput[]>([emptyCourseTest()]);
  const [taskMaxAttempts, setTaskMaxAttempts] = React.useState(3);
  const createPending = React.useRef(false);
  const [quiz, setQuiz] = React.useState<Quiz[]>([]);
  const [answers, setAnswers] = React.useState<Record<number, string>>({});
  const [quizState, setQuizState] = React.useState<"idle" | "done">("idle");
  const createTask = async (
    lessonId: number,
    payload: Parameters<typeof apiCreateTask>[1],
  ) => {
    const projectSpec = parseProjectSpec(task.projectSpecJson || "");
    return apiCreateTask(lessonId, {
      ...payload,
      ...(projectSpec ? { projectSpec } : {}),
    });
  };
  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setLesson(await getLesson(id, lessonType || undefined, params.get("source") === "course" ? "course" : undefined));
      setError(null);
    } catch (caught) {
      if (preview()) setLesson(exampleLesson);
      else
        setError(
          getErrorMessageFromUnknown(caught, tr("Не вдалося відкрити урок.", "Could not open the lesson.")),
        );
    } finally {
      setLoading(false);
    }
  }, [id, lessonType, params]);
  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    if (!lesson?.quizJson) return;
    try {
      const parsed = JSON.parse(lesson.quizJson);
      if (Array.isArray(parsed)) setQuiz(parsed);
    } catch {
      /* invalid legacy payload is intentionally ignored */
    }
  }, [lesson?.quizJson]);
  const create = async () => {
    if (createPending.current || !task.title.trim() || !task.description.trim() || lesson?.source === "course" && (!taskTests.length || !validCourseTests(taskTests))) return;
    createPending.current = true;
    setBusy(true); setError(null);
    try {
      await createTask(id, {
        title: task.title.trim(),
        description: task.description.trim(),
        template: task.template,
        ...(lesson?.source === "course" ? { testData: taskTests, maxAttempts: taskMaxAttempts } : {}),
      });
      setTask({ title: "", description: "", template: "" });
      setTaskTests([emptyCourseTest()]); setTaskMaxAttempts(3);
      setModal(null);
      await load();
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, tr("Не вдалося додати практику.", "Could not add the practice task.")),
      );
    } finally {
      createPending.current = false;
      setBusy(false);
    }
  };
  const createQuiz = async () => {
    setBusy(true);
    try {
      const result = await generateQuiz(id, 8, lesson?.title);
      setQuiz(result.quiz);
      await saveQuiz(id, result.quiz);
      setModal(null);
      await load();
    } catch (caught) {
      setError(
        getErrorMessageFromUnknown(caught, tr("Не вдалося згенерувати квіз.", "Could not generate the quiz.")),
      );
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    // Teachers do not create student attempts. Keep this action useful by
    // taking the editor straight to the first practice block.
    document.getElementById("lesson-practice")?.scrollIntoView({ behavior: "auto", block: "start" });
  };
  const submit = async () => {
    if (!quiz.length) return;
    setBusy(true);
    try {
      // Keep the editor's self-check local; student submissions use the
      // dedicated StudentLessonWorkspace flow.
      setQuizState("done");
    } finally {
      setBusy(false);
    }
  };
  if (loading)
    return (
      <div className={shell}>
        <div className="h-12 w-64 animate-pulse rounded-xl bg-bg-hover dark:bg-white/[.06]" />
        <div className="mt-8 h-[650px] animate-pulse rounded-[34px] bg-bg-hover dark:bg-white/[.05]" />
      </div>
    );
  if (!lesson)
    return <div className={shell}>{error || tr("Урок не знайдено.", "Lesson not found.")}</div>;
  if (lesson.source !== "course" && (lesson.type === "TOPIC" || lesson.parentTopicId)) {
    return <Navigate replace to={withDevPreview(`/edu/topics/${lesson.parentTopicId || lesson.id}`)} />;
  }
  const title = lesson.title || tr("Навчальний блок", "Learning module");
  const tasks = lesson.tasks || [];
  const isControl =
    lesson.type === "CONTROL" || Boolean(lesson.timeLimitMinutes);
  return (
    <div className={`${shell} edu-teacher-lesson`}>
      <button type="button"
        onClick={() => {
          const back = (location.state as { from?: string } | null)?.from;
          navigate(back || "/edu/lessons");
        }}
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted transition hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"
      >
        <ArrowLeft className="h-4 w-4" />
        {tr("До навчального плану", "Back to learning plan")}
      </button>
      <header className="edu-teacher-lesson__hero overflow-hidden rounded-[34px] bg-bg-hover p-6 dark:bg-bg-base sm:p-10">
        <div className="edu-teacher-lesson__top flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-accent-warn">
              {lesson.parentTopicTitle || tr("Навчальний модуль", "Learning module")}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.065em] sm:text-6xl">
              {title}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-text-muted dark:text-text-secondary">
              {isControl
                ? tr("Зосереджена перевірка навичок — без зайвих екранів і несподіванок.", "A focused skills check, without extra screens or surprises.")
                : tr("Пройдіть матеріал у власному темпі, закріпіть його практикою та короткою перевіркою.", "Work through the material at your own pace, practice, and finish with a short check.")}
            </p>
          </div>
          <div className="edu-teacher-lesson__actions flex flex-wrap gap-2">
            {lesson.source === "course" && lesson.type === "CONTROL" && <button type="button" onClick={() => navigate(`/edu/lessons/${id}/results`)} className="min-h-11 rounded-xl border border-border px-4 py-3 text-sm font-semibold">{tr("Результати контрольної", "Assessment results")}</button>}
            {lesson.quizJson && <button type="button" onClick={() => navigate(withDevPreview(`/edu/lessons/${id}/quiz/review`))} className="min-h-11 rounded-xl border border-border px-4 py-3 text-sm font-semibold">{tr("Перевірити відповіді учнів", "Review student answers")}</button>}
            <button type="button"
              onClick={() => void begin()}
              className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground"
            >
              <Play className="mr-2 inline h-4 w-4" />
              {tr("Почати", "Start")}
            </button>
            <button type="button"
              onClick={() => setModal("task")}
              className="rounded-xl border border-border/12 px-4 py-3 text-sm font-bold text-text-primary dark:border-white/10 dark:text-white"
            >
              <Plus className="mr-2 inline h-4 w-4" />
              {tr("Практика", "Practice")}
            </button>
          </div>
        </div>
        <aside className="edu-teacher-lesson__stats mt-10" aria-label={tr("Склад уроку", "Lesson setup")}>
          <div className="edu-teacher-lesson__stat rounded-2xl bg-white/85 px-4 py-4 dark:bg-white/[.06]">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">
              {tr("Матеріал", "Material")}
            </p>
            <p className="mt-2 text-lg font-bold">
              {lesson.hasTheory || lesson.theory
                ? tr("Готовий до читання", "Ready to read")
                : tr("Додайте пояснення", "Add an explanation")}
            </p>
          </div>
          <div className="edu-teacher-lesson__stat rounded-2xl bg-white/85 px-4 py-4 dark:bg-white/[.06]">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">
              {tr("Практика", "Practice")}
            </p>
            <p className="mt-2 text-lg font-bold">
              {tasks.length} {tasks.length === 1 ? tr("завдання", "task") : tr("завдань", "tasks")}
            </p>
          </div>
          <div className="edu-teacher-lesson__stat rounded-2xl bg-white/85 px-4 py-4 dark:bg-white/[.06]">
            <p className="text-xs font-bold uppercase tracking-[.12em] text-text-muted dark:text-text-secondary">
              {tr("Режим", "Mode")}
            </p>
            <p className="mt-2 text-lg font-bold">
              {isControl
                ? `${lesson.timeLimitMinutes || "—"} ${tr("хв", "min")}`
                : tr("Вільний темп", "Self-paced")}
            </p>
          </div>
        </aside>
      </header>
      {error && (
        <div className="mt-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">
          {error}
        </div>
      )}
      <main className="edu-teacher-lesson__overview mt-8 grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="edu-teacher-lesson__theory rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.13em] text-primary-strong dark:text-primary-soft">
                {tr("Пояснення", "Explanation")}
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-[-.04em]">
                {tr("Побудуйте розуміння", "Build understanding")}
              </h2>
            </div>
          </div>
          <div className="mt-8 max-w-3xl">
            {lesson.theory ? (
              markdownBlocks(lesson.theory)
            ) : (
              <div className="rounded-2xl bg-bg-hover px-5 py-8 text-center dark:bg-white/[.045]">
                <Sparkles className="mx-auto h-6 w-6 text-accent-warn" />
                <p className="mt-3 text-sm leading-6 text-text-muted dark:text-text-secondary">
                  {tr("Цей блок поки без теорії. Можна почати з практики або додати матеріал у редакторі уроку.", "This lesson has no theory yet. You can start with practice or add material in the lesson editor.")}
                </p>
              </div>
            )}
          </div>
        </article>
        <aside className="edu-teacher-lesson__rail space-y-5">
          <section className="rounded-[30px] bg-bg-surface p-6 text-text-primary shadow-[0_16px_45px_rgba(13,51,27,.16)] dark:bg-bg-surface">
            <p className="text-xs font-bold uppercase tracking-[.14em] text-primary-soft">
              {tr("Наступний крок", "Next step")}
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.04em]">
              {tr("Застосуйте знання", "Apply what you learned")}
            </h2>
            <p className="mt-3 text-sm leading-6 text-text-primary">
              {tr("Практика одразу після пояснення допомагає зрозуміти, де саме потрібна ще одна спроба.", "Practicing right after an explanation helps you see where you need another attempt.")}
            </p>
            <button type="button"
              onClick={() =>
                tasks[0] &&
                (tasks[0].taskMode === "MANUAL" ? navigate(withDevPreview(`/edu/manual-tasks/${tasks[0].id}/submissions`)) : setSelectedTask(tasks[0]))
              }
              disabled={!tasks.length}
              className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              {tr("Відкрити перше завдання", "Open the first task")}{" "}
              <ArrowRight className="ml-1 inline h-4 w-4" />
            </button>
          </section>
          <section className="rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.13em] text-accent-warn">
                  {tr("Самоперевірка", "Self-check")}
                </p>
                <h2 className="mt-1 text-xl font-bold">{tr("Квіз", "Quiz")}</h2>
              </div>
              <ClipboardCheck className="h-5 w-5 text-accent-warn" />
            </div>
            {quiz.length ? (
              <button type="button"
                onClick={() =>
                  document
                    .getElementById("lesson-quiz")
                    ?.scrollIntoView({ behavior: "auto" })
                }
                className="mt-4 text-sm font-bold text-primary-strong dark:text-primary-soft"
              >
                {quiz.length} {tr("запитань", "questions")} →
              </button>
            ) : (
              <button type="button"
                onClick={() => setModal("quiz")}
                className="mt-4 text-sm font-bold text-primary-strong dark:text-primary-soft"
              >
                {tr("Створити квіз", "Create quiz")} →
              </button>
            )}
          </section>
        </aside>
      </main>
      <section id="lesson-practice" className="edu-teacher-lesson__practice mt-8">
        {lesson.source === "course" && tasks.some(entry => entry.taskMode === "CODE" && entry.testDataCount === 0) && <p role="status" className="mb-4 rounded-xl border border-accent-warn/30 bg-accent-warn/10 p-4 text-sm">{tr("Для деяких завдань ще немає тестів. Відкрийте завдання й оберіть «Тести та спроби», щоб налаштувати перевірку. До цього автоматична здача й початок контрольної недоступні.", "Some tasks have no tests yet. Open a task and choose ‘Tests and attempts’ to configure grading. Automatic submission and assessment start remain unavailable until then.")}</p>}
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
              {tr("Практика", "Practice")}
            </p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">
              {tr("Вправи на сьогодні", "Practice for today")}
            </h2>
          </div>
          <button type="button"
            onClick={() => setModal("task")}
            className="text-sm font-bold text-primary-strong dark:text-primary-soft"
          >
            + {tr("Додати", "Add")}
          </button>
        </div>
        <div className="edu-teacher-lesson__task-list mt-5 grid gap-3 md:grid-cols-2">
          {tasks.map((entry, index) => (
            <button type="button"
              key={entry.id}
              onClick={() =>
                (entry.taskMode === "MANUAL" ? navigate(withDevPreview(`/edu/manual-tasks/${entry.id}/submissions`)) : setSelectedTask(entry))
              }
              className="edu-teacher-lesson__task group rounded-[24px] border border-border/10 bg-white p-5 text-left transition hover:shadow-lg dark:border-white/[.09] dark:bg-bg-surface"
            >
              <div className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-bg-hover text-sm font-extrabold text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="font-bold group-hover:text-primary-strong dark:group-hover:text-primary-soft">
                    {entry.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                    {entry.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
          {!tasks.length && (
            <button type="button"
              onClick={() => setModal("task")}
              className="rounded-[24px] border border-dashed border-border/15 px-5 py-12 text-center text-sm font-bold text-text-muted dark:border-white/10 dark:text-text-secondary"
            >
              {tr("Додайте першу практику", "Add your first practice task")}
            </button>
          )}
        </div>
      </section>
      {quiz.length > 0 && (
        <section
          id="lesson-quiz"
          className="mt-8 rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface sm:p-9"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
                {tr("Самоперевірка", "Self-check")}
              </p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">
                {tr("Що вже стало зрозуміло?", "What have you learned so far?")}
              </h2>
            </div>
            {quizState === "done" && (
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-2 text-xs font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
                <CheckCircle2 className="h-4 w-4" />
                {tr("Відповіді надіслано", "Answers submitted")}
              </span>
            )}
          </div>
          <div className="mt-7 space-y-6">
            {quiz.map((question, index) => (
              <fieldset
                key={`${question.question}-${index}`}
                className="rounded-2xl bg-bg-hover p-5 dark:bg-white/[.045]"
              >
                <legend className="text-base font-bold leading-7">
                  {index + 1}. {question.question}
                </legend>
                <div className="mt-4 grid gap-2">
                  {Object.entries(question.options || {}).map(
                    ([key, value]) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${answers[index] === key ? "bg-[var(--surface-primary)] text-text-primary dark:bg-primary/12 dark:text-primary-strong" : "bg-white text-text-primary dark:bg-bg-surface dark:text-text-primary"}`}
                      >
                        <input
                          type="radio"
                          name={`q-${index}`}
                          checked={answers[index] === key}
                          onChange={() =>
                            setAnswers({ ...answers, [index]: key })
                          }
                        />
                        <span className="font-bold">{key}</span>
                        <span>{value}</span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            ))}
          </div>
          <button type="button"
            disabled={busy || quizState === "done"}
            onClick={() => void submit()}
            className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"
          >
            {busy ? tr("Перевіряємо…", "Checking…") : tr("Надіслати відповіді", "Submit answers")}
          </button>
        </section>
      )}
      <Modal open={Boolean(selectedTask)} title={selectedTask?.title || tr("Завдання", "Task")} onClose={() => setSelectedTask(null)} panelClassName="edu-workspace">
        <p className="whitespace-pre-wrap text-sm leading-7">{selectedTask?.description || tr("Опис ще не додано.", "No description has been added yet.")}</p>
        {selectedTask?.template && <pre className="mt-5 overflow-auto rounded-xl bg-bg-code p-4 text-sm text-text-primary"><code>{selectedTask.template}</code></pre>}
        {lesson.source === "course" && selectedTask && selectedTask.taskMode !== "MANUAL" && selectedTask.taskMode !== "WEB" && <Link to={`/edu/course-tasks/${selectedTask.id}/tests`} className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">{tr("Тести та спроби", "Tests and attempts")}</Link>}
      </Modal>
      {modal === "task" && (
        <Overlay
          title={tr("Нова практика", "New practice task")}
          sub={tr("Нехай задача продовжує логіку уроку, а не дублює теорію.", "Let the task extend the lesson instead of repeating its theory.")}
          onClose={() => !busy && setModal(null)}
        >
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-xl bg-accent-error/10 p-3 text-sm text-accent-error">{error}</p>}
            <fieldset disabled={busy} className="min-w-0 space-y-4">
            <label className="block text-sm font-semibold">{tr("Назва завдання", "Task title")}
            <input
              value={task.title}
              onChange={(event) =>
                setTask({ ...task, title: event.target.value })
              }
              placeholder={tr("Назва завдання", "Task title")}
              className="mt-2 w-full rounded-xl border border-border/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code"
            /></label>
            <label className="block text-sm font-semibold">{tr("Умова", "Problem statement")}
            <textarea
              value={task.description}
              onChange={(event) =>
                setTask({ ...task, description: event.target.value })
              }
              placeholder={tr("Умова", "Problem statement")}
              rows={5}
              className="mt-2 w-full resize-none rounded-xl border border-border/10 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-bg-code"
            /></label>
            <label className="block text-sm font-semibold">{tr("Стартовий код (за потреби)", "Starter code (optional)")}
            <textarea
              value={task.template}
              onChange={(event) =>
                setTask({ ...task, template: event.target.value })
              }
              placeholder={tr("Стартовий код (за потреби)", "Starter code (optional)")}
              rows={4}
              className="mt-2 w-full resize-none rounded-xl border border-border/10 bg-white px-4 py-3 font-mono text-sm dark:border-white/10 dark:bg-bg-code"
            /></label>
            <textarea
              value={task.projectSpecJson || ""}
              onChange={(event) =>
                setTask({ ...task, projectSpecJson: event.target.value })
              }
              placeholder={'Mini-project JSON (optional): {"version":1,"kind":"MINI_PROJECT",...}'}
              rows={7}
              spellCheck={false}
              className="w-full resize-none rounded-xl border border-primary-strong/25 bg-bg-hover px-4 py-3 font-mono text-xs dark:border-primary/25 dark:bg-bg-code"
            />
            {lesson.source === "course" && <><CourseTaskTestFields tests={taskTests} onChange={setTaskTests} disabled={busy} /><label className="block max-w-xs text-sm font-semibold">{tr("Спроб на учня", "Attempts per student")}<input type="number" min={1} max={100} step={1} value={taskMaxAttempts} onChange={event => setTaskMaxAttempts(Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-xl border border-border bg-bg-base px-4 py-3" /></label></>}
            <button type="button"
              disabled={busy || !task.title.trim() || !task.description.trim() || lesson.source === "course" && (!taskTests.length || !validCourseTests(taskTests) || !Number.isSafeInteger(taskMaxAttempts) || taskMaxAttempts < 1 || taskMaxAttempts > 100)}
              onClick={() => void create()}
              className="w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"
            >
              {busy ? tr("Створюємо…", "Creating…") : tr("Додати практику", "Add practice")}
            </button>
            </fieldset>
          </div>
        </Overlay>
      )}
      {modal === "quiz" && (
        <Overlay
          title={tr("Створити квіз", "Create a quiz")}
          sub={tr("Квіз генерується на основі теми уроку та одразу зберігається у ньому.", "The quiz is generated from the lesson topic and saved to the lesson.")}
          onClose={() => !busy && setModal(null)}
        >
          <div className="rounded-2xl bg-bg-hover p-5 dark:bg-white/[.045]">
            <LockKeyhole className="h-5 w-5 text-accent-warn" />
            <p className="mt-3 text-sm leading-6 text-text-muted dark:text-text-secondary">
              {tr("Буде створено 8 коротких запитань. Перед публікацією їх можна переглянути у цьому самому уроці.", "Eight short questions will be created. You can review them in this lesson before publishing.")}
            </p>
          </div>
          <button type="button"
            disabled={busy}
            onClick={() => void createQuiz()}
            className="mt-5 w-full rounded-xl bg-primary px-4 py-3 font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground"
          >
            {busy ? tr("Готуємо…", "Preparing…") : tr("Згенерувати квіз", "Generate quiz")}
          </button>
        </Overlay>
      )}
    </div>
  );
};

const StudentLessonWorkspace: React.FC = () => {
  useTranslation();
  const { lessonId } = useParams<{ lessonId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const id = Number(lessonId);
  const requestedType = params.get("type") as Lesson["type"] | null;
  const source = params.get("source") === "course" ? "course" : undefined;
  const isControl = requestedType === "CONTROL" && source !== "course";
  const [lesson, setLesson] = React.useState<
    (Lesson & { tasks: Task[] }) | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [started, setStarted] = React.useState(false);
  const [attemptCompleted, setAttemptCompleted] = React.useState(false);
  const [remainingSeconds, setRemainingSeconds] = React.useState<number | null>(null);
  const [finishOpen, setFinishOpen] = React.useState(false);
  const [finishBusy, setFinishBusy] = React.useState(false);
  const finishPending = React.useRef(false);
  const currentLessonId = React.useRef(id);
  currentLessonId.current = id;
  const [startBusy, setStartBusy] = React.useState(false);
  const [quizAnswers, setQuizAnswers] = React.useState<Record<number, string>>({});
  const [quizSubmitted, setQuizSubmitted] = React.useState(false);
  const [quizBusy, setQuizBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!isControl || !Number.isFinite(id)) return;
    try {
      const saved = localStorage.getItem(`studycod.edu.lesson.${id}.quiz`);
      if (saved) setQuizAnswers(JSON.parse(saved) as Record<number, string>);
    } catch {
      // Ignore an invalid or unavailable local draft.
    }
  }, [id, isControl]);
  React.useEffect(() => {
    let active = true;
    setFinishOpen(false);
    setLesson(null);
    setLoading(true);
    setError(null);
    setStarted(false);
    setAttemptCompleted(false);
    setQuizSubmitted(false);
    setQuizAnswers({});
    getLesson(id, requestedType || undefined, source)
      .then((value) => {
        if (!active) return;
        const next = value as Lesson & { tasks: Task[] };
        setLesson(next);
        setQuizSubmitted(next.quizSubmitted === true);
        setStarted(next.courseAttempt?.status === "IN_PROGRESS");
        setAttemptCompleted(next.courseAttempt?.status === "COMPLETED");
      })
      .catch((caught) => {
        if (!active) return;
        if (preview()) setLesson(exampleLesson);
        else
          setError(
            getErrorMessageFromUnknown(
              caught,
              tr("Не вдалося відкрити призначений урок.", "Could not open the assigned lesson."),
            ),
          );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id, requestedType, source]);
  React.useEffect(() => {
    const attempt = lesson?.courseAttempt;
    const limit = attempt?.timeLimitMinutes ?? lesson?.timeLimitMinutes;
    if (!started || !attempt?.startedAt || !limit) { setRemainingSeconds(null); return; }
    const end = new Date(attempt.startedAt).getTime() + limit * 60_000;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) setAttemptCompleted(true);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [lesson?.courseAttempt?.startedAt, lesson?.courseAttempt?.timeLimitMinutes, lesson?.timeLimitMinutes, started]);
  React.useEffect(() => {
    if (!attemptCompleted || lesson?.source !== "course" || lesson.type !== "CONTROL" || lesson.courseAttempt?.status === "COMPLETED") return;
    let active = true;
    getLesson(id, requestedType || undefined, source).then(next => {
      if (!active) return;
      setLesson(next as Lesson & { tasks: Task[] });
      setStarted(false);
      setRemainingSeconds(null);
    }).catch(caught => { if (active) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося оновити результат.", "Could not refresh the result."))); });
    return () => { active = false; };
  }, [attemptCompleted, id, requestedType, source, lesson?.courseAttempt?.status, lesson?.source, lesson?.type]);
  if (loading)
    return (
      <div className={shell}>
        <div className="h-12 w-64 animate-pulse rounded-xl bg-bg-hover dark:bg-white/[.06]" />
        <div className="mt-8 h-[560px] animate-pulse rounded-[34px] bg-bg-hover dark:bg-white/[.05]" />
      </div>
    );
  if (!lesson)
    return (
      <div className={shell}>
        <p className="rounded-2xl bg-accent-error/10 p-5 text-accent-error">
        {error || tr("Урок не знайдено.", "Lesson not found.")}
        </p>
      </div>
    );
  const courseControl = lesson.source === "course" && lesson.type === "CONTROL";
  const tasks = courseControl && lesson.controlHasPractice === false ? [] : lesson.tasks || [];
  const completedTaskCount = tasks.filter((task) => task.progressCompleted || task.grade?.isCompleted).length;
  let quiz: Quiz[] = [];
  if (isControl && lesson.quizJson) {
    try {
      const parsed = JSON.parse(lesson.quizJson);
      quiz = Array.isArray(parsed) ? parsed : [];
    } catch {
      quiz = [];
    }
  }
  const quizRequired = (isControl || courseControl) && lesson.controlHasTheory === true;
  const courseSetupPending = courseControl && !started && !attemptCompleted && (quizRequired && !lesson.quizJson || lesson.controlHasPractice !== false && (!tasks.length || tasks.some(task => task.taskMode === "CODE" && task.testDataCount === 0)));
  const quizGatePassed = !quizRequired || quizSubmitted;
  const submitStudentQuiz = async () => {
    if (quizBusy || !quiz.length || Object.keys(quizAnswers).length < quiz.length) return;
    setQuizBusy(true);
    setError(null);
    try {
      await submitQuizAnswers(id, quizAnswers, true);
      setQuizSubmitted(true);
      localStorage.removeItem(`studycod.edu.lesson.${id}.quiz`);
      const refreshed = await getLesson(id, "CONTROL");
      setLesson(refreshed as Lesson & { tasks: Task[] });
    } catch (caught) {
      setError(getErrorMessageFromUnknown(caught, tr("Не вдалося надіслати квіз.", "Could not submit the quiz.")));
    } finally {
      setQuizBusy(false);
    }
  };
  const finish = async () => {
    if (finishPending.current || !started || attemptCompleted) return;
    finishPending.current = true; setFinishBusy(true); setError(null);
    try {
      const result = await finishCourseLesson(id);
      if (currentLessonId.current !== id) return;
      setLesson(current => current ? { ...current, courseAttempt: result.attempt, courseReport: result.report, reportOnly: true } : current);
      setAttemptCompleted(true); setStarted(false); setRemainingSeconds(null); setFinishOpen(false);
    } catch (caught) {
      if (currentLessonId.current === id) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося завершити контрольну. Спробуйте ще раз.", "Could not finish the assessment. Please retry.")));
    } finally { finishPending.current = false; setFinishBusy(false); }
  };
  return (
    <div className={`${shell} edu-student-lesson`}>
      <button
        type="button"
        onClick={() =>
          navigate(`/edu/lessons${preview() ? "?preview=true" : ""}`)
        }
        className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-text-muted hover:text-primary-strong dark:text-text-secondary dark:hover:text-primary-soft"
      >
        <ArrowLeft className="size-4" />
        {tr("До моїх уроків", "Back to my lessons")}
      </button>
      <header className="edu-student-lesson__hero overflow-hidden rounded-[34px] bg-bg-surface p-7 text-text-primary sm:p-10">
        <div className="edu-student-lesson__hero-copy max-w-3xl">
          <p className="edu-student-lesson__eyebrow text-xs font-bold uppercase tracking-[.16em] text-primary-strong">
            {courseControl ? tr("Контрольна робота", "Assessment") : tr("Призначений урок", "Assigned lesson")} · {lesson.parentTopicTitle || tr("Навчальний модуль", "Learning module")}
          </p>
          <h1 className="edu-student-lesson__title mt-4 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-6xl">
            {lesson.title}
          </h1>
          <p className="edu-student-lesson__summary mt-5 max-w-2xl text-base leading-7 text-text-secondary">
            {courseControl ? quizRequired ? tr("Почніть контрольну, здайте квіз, а потім виконайте практичні завдання. Коли всі відповіді надіслано, завершіть контрольну.", "Start the assessment, submit the quiz, then complete the practice tasks. Finish the assessment once all your answers have been submitted.") : tr("Почніть контрольну й надішліть відповіді на завдання. Коли все готово, завершіть контрольну.", "Start the assessment and submit your task answers. Finish the assessment when you are ready.") : (lesson.quizJson ? tr("Ознайомтеся з матеріалом, пройдіть квіз і виконайте призначені завдання.", "Review the material, take the quiz, and complete the assigned tasks.") : tr("Ознайомтеся з матеріалом і виконайте призначену практику.", "Review the material and complete the assigned practice."))}
          </p>
          <button
            type="button"
            disabled={startBusy || started || attemptCompleted || courseSetupPending}
            onClick={() => void (async () => {
              setStartBusy(true);
              setError(null);
              try {
                if (!preview() && (isControl || courseControl)) {
                  const attempt = await startLessonAttempt(id, courseControl ? "course" : undefined);
                  if (currentLessonId.current !== id) return;
                  if (courseControl) setLesson(current => current ? { ...current, courseAttempt: { status: "IN_PROGRESS", startedAt: attempt.startedAt, remainingSeconds: attempt.remainingSeconds, timeLimitMinutes: attempt.timeLimitMinutes } } : current);
                }
                if (currentLessonId.current === id) {
                  if (isControl || courseControl) setStarted(true);
                else {
                  setStarted(true);
                  document.getElementById("edu-lesson-content")?.scrollIntoView({
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
                    block: "start",
                  });
                }
                }
              } catch (caught) {
                if (currentLessonId.current === id) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося розпочати урок. Спробуйте ще раз.", "Could not start the lesson. Please try again.")));
              } finally {
                setStartBusy(false);
              }
            })()}
            className="edu-student-lesson__start mt-7 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            {attemptCompleted ? lesson.courseAttempt?.reason === "FINISHED" ? tr("Контрольну здано", "Assessment submitted") : tr("Час контрольної завершено", "Assessment time has ended") : startBusy ? tr("Запускаємо…", "Starting…") : started ? tr("Урок розпочато", "Lesson started") : tr(isControl || courseControl ? "Почати контрольну" : "Перейти до матеріалу", isControl || courseControl ? "Start assessment" : "Read lesson material")}
          </button>
          {courseSetupPending && <div role="status" className="mt-4 max-w-2xl rounded-xl border border-accent-warn/30 bg-accent-warn/10 p-4 text-sm"><p>{tr("Викладач ще готує контрольну. Вашу спробу й таймер не запущено. Оновіть дані після налаштування квізу та перевірки завдань.", "Your teacher is still preparing this assessment. Your attempt and timer have not started. Refresh after the quiz and task grading are configured.")}</p><button type="button" onClick={() => void getLesson(id, requestedType || undefined, source).then(next => { if (currentLessonId.current === id) { setLesson(next as Lesson & { tasks: Task[] }); setError(null); } }).catch(caught => { if (currentLessonId.current === id) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося оновити урок.", "Could not refresh the lesson."))); })} className="mt-3 min-h-11 rounded-xl border border-border px-4 font-semibold">{tr("Оновити готовність", "Refresh readiness")}</button></div>}
          {remainingSeconds !== null && <p className="mt-3 text-sm tabular-nums text-text-secondary">{tr("Залишилось часу", "Time remaining")}: {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</p>}
        </div>
        <aside className="edu-student-lesson__sequence" aria-label={tr("План уроку", "Lesson sequence")}>
          <p>{tr("У цьому уроці", "In this lesson")}</p>
          <ol>
            <li className={started ? "is-done" : "is-current"}><span>01</span><div><strong>{tr("Матеріал", "Material")}</strong><small>{lesson.theory ? started ? tr("Матеріал відкрито", "Material opened") : tr("Пояснення теми", "Lesson explanation") : tr("Матеріалу немає", "No reading material")}</small></div></li>
            {(quizRequired || lesson.quizJson) && <li className={quizSubmitted ? "is-done" : ""}><span>02</span><div><strong>{tr("Квіз", "Quiz")}</strong><small>{quizSubmitted ? tr("Відповіді надіслано", "Answers submitted") : `${quiz.length} ${tr("запитань", "questions")}`}</small></div></li>}
            <li className={tasks.length > 0 && completedTaskCount === tasks.length ? "is-done" : ""}><span>{quizRequired || lesson.quizJson ? "03" : "02"}</span><div><strong>{tr("Практика", "Practice")}</strong><small>{tasks.length ? `${completedTaskCount}/${tasks.length} ${tr("виконано", "completed")}` : tr("Задачі ще не додані", "No tasks added yet")}</small></div></li>
          </ol>
        </aside>
      </header>
      {!isControl && lesson.quizJson && <button type="button" disabled={courseControl && !started && !attemptCompleted} onClick={() => navigate(withDevPreview(`/edu/lessons/${id}/quiz?source=course`))} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary-strong"><ClipboardCheck className="size-4" aria-hidden="true" />{tr("Відкрити квіз уроку", "Open lesson quiz")}</button>}
      {courseControl && started && !attemptCompleted && <section className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-bg-surface p-5"><div><p className="font-semibold">{tr("Завершення контрольної", "Finish assessment")}</p><p className="mt-1 text-sm text-text-secondary">{lesson.courseReport?.submittedTasks ?? 0}/{lesson.courseReport?.totalTasks ?? tasks.length} {tr("практичних робіт надіслано", "practice submissions saved")}</p></div><button type="button" onClick={() => setFinishOpen(true)} className="min-h-11 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">{tr("Завершити контрольну", "Finish assessment")}</button></section>}
      {courseControl && attemptCompleted && <section role="status" className="mt-5 rounded-2xl border border-border bg-bg-surface p-6"><h2 className="text-xl font-bold">{tr("Результат контрольної", "Assessment result")}</h2><p className="mt-4 text-3xl font-bold tabular-nums">{lesson.courseReport?.finalPercent != null ? `${lesson.courseReport.finalPercent}%` : "—"}</p>{Boolean(lesson.courseReport?.pendingReview) ? <p className="mt-3 text-sm text-text-secondary">{tr("Роботи очікують перевірки вчителя. Підсумкова оцінка з’явиться після перевірки.", "Work awaits teacher review. The final grade will appear after review.")}</p> : <p className="mt-3 text-sm text-text-secondary">{tr("Здачу завершено. Відкрийте квіз або завдання нижче, щоб переглянути збережені відповіді.", "Submission is complete. Open the quiz or tasks below to review your saved work.")}</p>}{lesson.courseReport && <div className="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">{lesson.courseReport.quizRequired && <span>{tr("Квіз:", "Quiz:")} {lesson.courseReport.theoryPercent == null ? tr("На перевірці", "Pending review") : `${lesson.courseReport.theoryPercent}%`}</span>}{lesson.courseReport.totalTasks > 0 && <span>{tr("Практика:", "Practice:")} {lesson.courseReport.practicePercent == null ? tr("На перевірці", "Pending review") : `${lesson.courseReport.practicePercent}%`}</span>}</div>}{lesson.courseReport?.quizRequired && lesson.courseReport.totalTasks > 0 && <p className="mt-2 text-xs text-text-muted">{tr("Підсумок — середнє результатів квізу й практики. Практика — середнє всіх завдань.", "The final score averages the quiz and practice scores. Practice averages all tasks.")}</p>}{lesson.courseReport?.tasks.map(task => <div key={task.id} className="mt-3 flex justify-between gap-4 border-t border-border pt-3 text-sm"><span className="min-w-0 break-words">{task.title}{!task.submitted && <span className="mt-1 block text-xs text-text-muted">{tr("Не здано", "Not submitted")}</span>}</span><span className="shrink-0 font-semibold">{task.pendingReview ? tr("На перевірці", "Pending review") : task.percent == null ? "—" : `${task.percent}%`}</span></div>)}<button type="button" onClick={() => void getLesson(id, requestedType || undefined, source).then(next => { if (currentLessonId.current === id) setLesson(next as Lesson & { tasks: Task[] }); }).catch(caught => { if (currentLessonId.current === id) setError(getErrorMessageFromUnknown(caught, tr("Не вдалося оновити результат.", "Could not refresh the result."))); })} className="mt-5 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">{tr("Оновити результат", "Refresh result")}</button></section>}
      {error && (
        <div role="alert" className="mt-5 rounded-2xl border border-accent-error/25 bg-accent-error/[.08] px-4 py-3 text-sm text-accent-error dark:text-accent-error">
          {error}
        </div>
      )}
      {(!courseControl || lesson.theory) && <main id="edu-lesson-content" className="edu-student-lesson__content mt-7 grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="edu-student-lesson__material rounded-[30px] border border-border/10 bg-white p-6 dark:border-white/[.09] dark:bg-bg-surface sm:p-9">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
              <BookOpen className="size-5" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.13em] text-primary-strong dark:text-primary-soft">
                {tr("Матеріал", "Material")}
              </p>
              <h2 className="mt-1 text-2xl font-bold">{tr("Спершу зрозумій ідею", "Understand the idea first")}</h2>
            </div>
          </div>
          <div className="mt-8 max-w-3xl">
            {lesson.theory ? (
              markdownBlocks(lesson.theory)
            ) : (
              <p className="text-base leading-8 text-text-muted dark:text-text-secondary">
                {tr("Викладач додав практику без окремого текстового матеріалу. Почни з першої задачі.", "Your teacher added practice without separate reading material. Start with the first task.")}
              </p>
            )}
          </div>
        </article>
        <aside className="edu-student-lesson__path rounded-[30px] bg-bg-hover p-6 dark:bg-accent-warn/[.08]">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn dark:text-accent-warn">
            {tr("Твій маршрут", "Your path")}
          </p>
          <ol className="mt-5 space-y-4 text-sm leading-6 text-text-muted dark:text-accent-warn">
            <li>
              <b className="mr-2 text-accent-warn dark:text-accent-warn">01</b>
              {tr("Ознайомся з матеріалом.", "Review the material.")}
            </li>
            <li>
              <b className="mr-2 text-accent-warn dark:text-accent-warn">02</b>
              {tr("Виконай", "Complete")} {tasks.length} {tasks.length === 1 ? tr("задачу", "task") : tr("задачі", "tasks")}.
            </li>
            <li>
              <b className="mr-2 text-accent-warn dark:text-accent-warn">03</b>
              {tr("Повернися до журналу за результатом.", "Return to the journal to see your results.")}
            </li>
          </ol>
        </aside>
      </main>}
      {isControl && quizRequired && (
        <section className="edu-student-lesson__quiz mt-8 rounded-[30px] border border-accent-warn/30 bg-white p-6 dark:border-accent-warn/30 dark:bg-bg-surface sm:p-9">
          <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn dark:text-accent-warn">{tr("Теоретична частина", "Theory section")}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">{tr("Пройдіть короткий квіз перед практикою", "Complete a short quiz before practice")}</h2>
          {!quiz.length ? (
            <p className="mt-4 rounded-2xl bg-bg-hover p-4 text-sm text-accent-warn dark:bg-accent-warn/[.08] dark:text-accent-warn">{tr("Квіз ще не налаштовано. Зверніться до викладача.", "The quiz hasn't been set up yet. Contact your teacher.")}</p>
          ) : quizSubmitted ? (
            <p className="mt-4 rounded-2xl bg-primary/10 p-4 text-sm font-bold text-primary-strong dark:bg-primary/10 dark:text-primary-strong">{tr("Квіз завершено. Практичні задачі відкриті.", "Quiz complete. Practice tasks are now available.")}</p>
          ) : (
            <>
              <div className="edu-student-lesson__questions mt-7 space-y-5">
                {quiz.map((question, index) => (
                  <fieldset key={`${question.question}-${index}`} className="rounded-2xl bg-bg-hover p-5 dark:bg-white/[.045]">
                    <legend className="text-base font-bold leading-7">{index + 1}. {question.question}</legend>
                    <div className="mt-4 grid gap-2">
                      {Object.entries(question.options || {}).map(([key, value]) => (
                        <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-sm transition ${quizAnswers[index] === key ? "bg-[var(--surface-primary)] text-text-primary dark:bg-primary/12 dark:text-primary-strong" : "bg-white text-text-primary dark:bg-bg-surface dark:text-text-primary"}`}>
                          <input type="radio" name={`student-quiz-${index}`} checked={quizAnswers[index] === key} onChange={() => setQuizAnswers((current) => { const next = { ...current, [index]: key }; localStorage.setItem(`studycod.edu.lesson.${id}.quiz`, JSON.stringify(next)); return next; })} />
                          <span className="font-bold">{key}</span><span>{value}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <button type="button" disabled={quizBusy || Object.keys(quizAnswers).length < quiz.length} onClick={() => void submitStudentQuiz()} className="mt-6 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40 dark:bg-primary dark:text-primary-foreground">{quizBusy ? tr("Перевіряємо…", "Checking…") : tr("Надіслати квіз", "Submit quiz")}</button>
            </>
          )}
        </section>
      )}
      {(!courseControl || lesson.controlHasPractice !== false) && <section className="edu-student-lesson__tasks mt-8">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-accent-warn">
          {tr("Призначена практика", "Assigned practice")}
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em]">
          {tr("Завдання уроку", "Lesson tasks")}
        </h2>
        <div className="edu-student-lesson__task-grid mt-5 grid gap-3 md:grid-cols-2">
          {tasks.map((task, index) => (
            <button
              type="button"
              key={task.id}
              disabled={courseControl ? !attemptCompleted && (!started || !quizGatePassed || task.taskMode === "CODE" && task.testDataCount === 0) : !quizGatePassed || lesson.source === "course" && task.taskMode === "CODE" && task.testDataCount === 0}
              onClick={() =>
                navigate(
                  withDevPreview(task.taskMode === "MANUAL" && lesson.source === "course" ? `/edu/manual-tasks/${task.id}` : `/edu/tasks/${task.id}?source=${lesson.source || "legacy"}`),
                  { state: { from: withDevPreview(eduLessonPath(lesson)) } },
                )
              }
              className="edu-student-lesson__task group rounded-[24px] border border-border/10 bg-white p-5 text-left transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.09] dark:bg-bg-surface"
            >
              <span className="grid size-10 place-items-center rounded-2xl bg-bg-hover text-sm font-extrabold text-accent-warn dark:bg-accent-warn/12 dark:text-accent-warn">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="edu-student-lesson__task-copy">
                <h3 className="font-bold group-hover:text-primary-strong dark:group-hover:text-primary-soft">
                  {task.title}
                </h3>
                <p className="line-clamp-2 text-sm leading-6 text-text-muted dark:text-text-secondary">
                  {task.description}
                </p>
              </div>
              <span className="edu-student-lesson__task-action inline-flex items-center gap-1 text-sm font-bold text-primary-strong dark:text-primary-soft">
                {attemptCompleted ? tr("Переглянути", "Review") : lesson.source === "course" && task.taskMode === "CODE" && task.testDataCount === 0 ? tr("Викладач налаштовує перевірку", "Teacher is configuring grading") : tr("Відкрити", "Open")} <ArrowRight className="size-4" />
              </span>
            </button>
          ))}
          {!quizGatePassed && <p className="rounded-2xl border border-dashed border-accent-warn/35 bg-bg-hover px-5 py-4 text-sm text-accent-warn dark:border-accent-warn/35 dark:bg-accent-warn/[.08] dark:text-accent-warn">{tr("Спочатку завершіть квіз — після цього відкриється практична частина.", "Complete the quiz first to unlock the practice section.")}</p>}
          {!tasks.length && (
            <div className="rounded-[24px] border border-dashed border-border/15 p-8 text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">
              {tr("Викладач ще не додав задачі до уроку.", "Your teacher hasn't added any tasks to this lesson yet.")}
            </div>
          )}
        </div>
      </section>}
      <Modal open={finishOpen} title={tr("Завершити контрольну?", "Finish the assessment?")} onClose={() => !finishBusy && setFinishOpen(false)} closable={!finishBusy} panelClassName="edu-workspace">
        <p className="text-sm leading-6">{tr("Після завершення змінювати або надсилати відповіді не можна. Збережені роботи залишаться доступними для перегляду.", "After finishing, you cannot change or submit answers. Saved work remains available to review.")}</p>
        {Boolean(lesson.courseReport?.missingTaskIds.length || (quizRequired && !quizSubmitted)) && <p className="mt-4 rounded-xl bg-accent-warn/10 p-4 text-sm">{tr("Є нездані частини. Вони будуть враховані як 0 балів. Роботи, що очікують ручної перевірки, перевірить учитель.", "Some sections have not been submitted and will count as zero. Your teacher will review any pending work.")}</p>}
        <div className="mt-6 flex flex-wrap gap-3"><button type="button" disabled={finishBusy} onClick={() => setFinishOpen(false)} className="min-h-11 rounded-xl border border-border px-4 font-semibold">{tr("Продовжити роботу", "Continue working")}</button><button type="button" disabled={finishBusy} onClick={() => void finish()} className="min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground">{finishBusy ? tr("Завершуємо…", "Finishing…") : tr("Здати контрольну", "Submit assessment")}</button></div>
      </Modal>
    </div>
  );
};

export const LessonStudioPage: React.FC<{ student?: boolean }> = ({
  student = false,
}) => (student ? <StudentLessonWorkspace /> : <LessonTeacherStudio />);
