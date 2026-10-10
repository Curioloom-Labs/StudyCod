import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, NotebookTabs, RefreshCw, Target } from "lucide-react";
import { getStudentGrades, getStudentLessons, type Grade, type Lesson } from "../../lib/api/edu";
import { DEFAULT_GRADING_SYSTEM, formatGradeForSystem, gradingSystemLabel, normalizeGradingSystem, normalizeScaleMode, type ClassGradingSystem, type GradeScaleMode } from "../../lib/gradingSystems";
import type { User } from "../../types";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { withDevPreview } from "../../lib/devPreview";

export const StudentJournalPage: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const isPreview = import.meta.env.DEV && new URLSearchParams(window.location.search).get("preview") === "true";
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [summaryGrades, setSummaryGrades] = useState<Array<{ id: number; name: string; grade: number; topicTitle?: string | null }>>([]);
  const [gradingSystem, setGradingSystem] = useState<ClassGradingSystem>(DEFAULT_GRADING_SYSTEM);
  const [scaleMode, setScaleMode] = useState<GradeScaleMode | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isPreview) {
        setLessons([
          { id: 51, type: "LESSON", title: "Алгоритми: два вказівники", tasksCount: 3, hasTheory: true, createdAt: "2026-07-10" },
          { id: 52, type: "TOPIC", title: "Колекції та словники", tasksCount: 4, hasTheory: true, createdAt: "2026-07-08" },
          { id: 53, type: "LESSON", title: "Практика: маленький сервіс", tasksCount: 2, hasTheory: false, createdAt: "2026-07-05", reportOnly: true },
        ] as Lesson[]);
        setGrades([
          { id: 71, total: 88, testsPassed: 8, testsTotal: 10, createdAt: "2026-07-12", isManuallyGraded: false, task: { id: 1, title: "Робота з циклами", lesson: { id: 51, title: "Алгоритми", type: "LESSON" } } } as Grade,
          { id: 72, total: 75, testsPassed: 6, testsTotal: 8, createdAt: "2026-07-11", isManuallyGraded: true, task: null, topicTask: { id: 2, title: "Словники: частоти", topicTitle: "Колекції" } } as Grade,
          { id: 73, total: 92, testsPassed: 10, testsTotal: 10, createdAt: "2026-07-09", isManuallyGraded: false, task: { id: 3, title: "Масиви", lesson: { id: 52, title: "Колекції", type: "LESSON" } } } as Grade,
        ]);
        setSummaryGrades([{ id: 1, name: "Тематична · Колекції", grade: 83, topicTitle: "Колекції та словники" }]);
        setGradingSystem("POINTS_12");
        setScaleMode(undefined);
        return;
      }
      const [lessonsResult, gradesResult] = await Promise.allSettled([
        getStudentLessons(),
        user.studentId ? getStudentGrades(user.studentId) : Promise.resolve({ grades: [], summaryGrades: [], gradingSystem: DEFAULT_GRADING_SYSTEM, gradeScaleMode: undefined }),
      ]);
      if (lessonsResult.status === "rejected" && gradesResult.status === "rejected") throw lessonsResult.reason;
      if (lessonsResult.status === "fulfilled") setLessons(lessonsResult.value);
      if (gradesResult.status === "fulfilled") {
        const nextGrades = gradesResult.value;
        setGrades(nextGrades.grades || []);
        setSummaryGrades((nextGrades.summaryGrades || []) as typeof summaryGrades);
        setGradingSystem(normalizeGradingSystem(nextGrades.gradingSystem || DEFAULT_GRADING_SYSTEM));
        setScaleMode(normalizeScaleMode(nextGrades.gradeScaleMode));
      }
      if (lessonsResult.status === "rejected" || gradesResult.status === "rejected") {
        setError("Частину журналу тимчасово не вдалося завантажити. Натисніть «Повторити»." );
      }
    } catch (cause: unknown) {
      if (isPreview) {
        setLessons([
          { id: -51, type: "LESSON", title: "Алгоритми: два вказівники", tasksCount: 3, hasTheory: true, createdAt: "2026-07-10" },
          { id: -52, type: "TOPIC", title: "Колекції та словники", tasksCount: 4, hasTheory: true, createdAt: "2026-07-08" },
          { id: -53, type: "LESSON", title: "Практика: маленький сервіс", tasksCount: 2, hasTheory: false, createdAt: "2026-07-05", reportOnly: true },
        ] as Lesson[]);
        setGrades([
          { id: -71, total: 88, testsPassed: 8, testsTotal: 10, createdAt: "2026-07-12", isManuallyGraded: false, task: { id: -1, title: "Робота з циклами", lesson: { id: -51, title: "Алгоритми", type: "LESSON" } } } as Grade,
          { id: -72, total: 75, testsPassed: 6, testsTotal: 8, createdAt: "2026-07-11", isManuallyGraded: true, task: null, topicTask: { id: -2, title: "Словники: частоти", topicTitle: "Колекції" } } as Grade,
          { id: -73, total: 92, testsPassed: 10, testsTotal: 10, createdAt: "2026-07-09", isManuallyGraded: false, task: { id: -3, title: "Масиви", lesson: { id: -52, title: "Колекції", type: "LESSON" } } } as Grade,
        ]);
        setSummaryGrades([{ id: -1, name: "Тематична · Колекції", grade: 83, topicTitle: "Колекції та словники" }]);
      } else {
        setError(getErrorMessageFromUnknown(cause, "Не вдалося завантажити журнал."));
      }
    } finally {
      setLoading(false);
    }
  }, [user.studentId, isPreview]);

  useEffect(() => { void load(); }, [load]);

  const normalizedSystem = normalizeGradingSystem(gradingSystem);
  const normalizedScale = normalizeScaleMode(scaleMode);
  const graded = useMemo(() => grades.filter((grade) => grade.total != null && Number.isFinite(Number(grade.total))), [grades]);
  const average = useMemo(() => graded.length ? graded.reduce((sum, grade) => sum + Number(grade.total), 0) / graded.length : 0, [graded]);
  const next = lessons.find((lesson) => {
    if (lesson.reportOnly) return false;
    const tasks = lesson.tasks || [];
    if (tasks.length) return tasks.some((task) => !task.progressCompleted && !task.hasGrade && !task.grade?.isCompleted);
    return lesson.controlWorks?.some((work) => work.studentStatus !== "COMPLETED") ?? true;
  }) || lessons.find((lesson) => !lesson.reportOnly) || lessons[0];
  const displayAverage = average ? formatGradeForSystem(average, normalizedSystem, normalizedScale) : "—";
  const recentGrades = [...grades].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8);

  return (
    <div className="min-h-full bg-bg-base px-4 py-7 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-5 dark:border-white/10">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary"><GraduationCap className="size-4 text-primary-strong dark:text-primary-soft" />Мій журнал</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">Оцінки та прогрес</h1>
            <p className="mt-1 text-sm text-text-secondary">Результати практики й тематичні підсумки класу.</p>
          </div>
          <div className="flex items-center gap-5 rounded-xl border border-border/70 bg-bg-surface px-4 py-3 dark:border-white/10">
            <div><div className="text-xs text-text-secondary">Система класу</div><div className="mt-1 text-sm font-semibold">{gradingSystemLabel(normalizedSystem, false)}</div></div>
            <div className="h-8 w-px bg-border dark:bg-white/10" />
            <div><div className="text-xs text-text-secondary">Середній результат</div><div className="mt-0.5 text-2xl font-semibold tracking-tight text-primary-strong dark:text-primary-soft">{displayAverage}</div></div>
          </div>
        </header>

        {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#fff0f4] p-4 text-sm text-[#bd3c62] dark:bg-[#ff6b9d]/10 dark:text-[#ffa5bf]"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex items-center gap-1 rounded-xl border border-current px-3 py-2 text-xs font-bold"><RefreshCw className="size-3" />Повторити</button></div>}

        <div className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
          <section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface">
            <div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">Наступний крок</div>
            {loading ? <div className="mt-5 h-44 animate-pulse rounded-2xl bg-bg-hover dark:bg-white/[.045]" /> : next ? (
              <button type="button" onClick={() => navigate(withDevPreview(`/edu/lessons/${next.id}`))} className="mt-4 block w-full rounded-xl border border-border bg-bg-subtle p-5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 dark:border-white/10 dark:bg-white/[.035]">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-primary-strong dark:text-primary-soft">{next.type === "CONTROL" ? "Контрольна" : next.type === "TOPIC" ? "Тема" : "Урок"}</div>
                    <div className="mt-2 text-xl font-semibold">{next.title}</div>
                    <div className="mt-2 text-sm text-[#b4c7b7]">{next.tasksCount} задач · {next.hasTheory ? "є теорія" : "практичний блок"}</div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-primary-strong dark:text-primary-soft" />
                </div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><BookOpen className="h-4 w-4" />Відкрити урок</div>
              </button>
            ) : <div className="mt-5 rounded-2xl bg-[#f5f8f5] p-5 text-sm text-[#718075] dark:bg-white/[.04] dark:text-text-secondary">Поки що немає доступних уроків.</div>}
          </section>

          <section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">Оцінки</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Останні результати</h2>
              </div>
              <Target className="size-5 text-primary-strong" />
            </div>
            <div className="mt-5 space-y-2">
              {loading ? <div className="h-40 animate-pulse rounded-2xl bg-bg-hover dark:bg-white/[.045]" /> : recentGrades.length ? recentGrades.map((grade) => {
                const title = grade.topicTask?.title || grade.task?.title || "Оцінка";
                const context = grade.topicTask?.topicTitle || grade.task?.lesson?.title || "Практика";
                return (
                  <div key={grade.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f8f5] px-4 py-3 dark:bg-white/[.04]">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{title}</div>
                      <div className="mt-1 truncate text-xs text-[#79877d] dark:text-[#9dac9f]">{context} · {new Date(grade.createdAt).toLocaleDateString("uk-UA")}</div>
                    </div>
                    <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-lg font-bold text-primary-strong shadow-sm dark:bg-primary/10 dark:text-primary-soft">{grade.total != null && Number.isFinite(Number(grade.total)) ? formatGradeForSystem(Number(grade.total), normalizedSystem, normalizedScale) : "На перевірці"}</div>
                  </div>
                );
              }) : <div className="rounded-2xl bg-[#f5f8f5] p-5 text-sm text-[#718075] dark:bg-white/[.04] dark:text-text-secondary">Оцінок ще немає. Вони зʼявляться після виконання практик або перевірки вчителем.</div>}
            </div>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
          <section className="rounded-[26px] border border-border/10 bg-[#fff8ec] p-5 dark:border-[#ff8c00]/20 dark:bg-[#ff8c00]/[.07]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#d97706]"><NotebookTabs className="size-4" />Тематичні</div>
            <div className="mt-5 space-y-2">
              {summaryGrades.length ? summaryGrades.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 dark:bg-white/[.06]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{item.name}</div>
                    <div className="mt-1 truncate text-sm text-[#776e5d] dark:text-[#c2b08e]">{item.topicTitle || "Тема класу"}</div>
                  </div>
                  <div className="shrink-0 text-xl font-bold text-primary-strong dark:text-primary-soft">{formatGradeForSystem(item.grade, normalizedSystem, normalizedScale)}</div>
                </div>
              )) : <p className="text-sm text-[#776e5d] dark:text-[#c2b08e]">Тематичні оцінки зʼявляться після завершення тем.</p>}
            </div>
          </section>

          <section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface">
            <div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">Активність</div>
            <div className="mt-5 space-y-3">{lessons.slice(0, 4).map((lesson) => (
              <button type="button" key={lesson.id} onClick={() => navigate(withDevPreview(`/edu/lessons/${lesson.id}`))} className="flex w-full items-center justify-between rounded-xl bg-bg-subtle p-3 text-left dark:bg-white/[.04]">
                <div>
                  <div className="font-semibold">{lesson.title}</div>
                  <div className="mt-1 text-sm text-[#647369] dark:text-[#a6b4a9]">{lesson.tasksCount} задач</div>
                </div>
                {lesson.reportOnly ? <CheckCircle2 className="h-4 w-4 text-primary-strong" /> : <Clock3 className="h-4 w-4 text-[#d97706]" />}
              </button>
            ))}</div>
          </section>
        </div>
      </div>
    </div>
  );
};
