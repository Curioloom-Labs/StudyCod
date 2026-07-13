import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, BookOpen, CheckCircle2, Clock3, GraduationCap, NotebookTabs, Target } from "lucide-react";
import { getStudentGrades, getStudentLessons, type Grade, type Lesson } from "../../lib/api/edu";
import { DEFAULT_GRADING_SYSTEM, formatGradeForSystem, gradingSystemLabel, normalizeGradingSystem, normalizeScaleMode, type ClassGradingSystem, type GradeScaleMode } from "../../lib/gradingSystems";
import type { User } from "../../types";

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

  useEffect(() => {
    let active = true;
    Promise.all([
      getStudentLessons(),
      user.studentId ? getStudentGrades(user.studentId) : Promise.resolve({ grades: [], summaryGrades: [], gradingSystem: DEFAULT_GRADING_SYSTEM, gradeScaleMode: undefined }),
    ]).then(([nextLessons, nextGrades]) => {
      if (!active) return;
      setLessons(nextLessons);
      setGrades(nextGrades.grades || []);
      setSummaryGrades((nextGrades.summaryGrades || []) as typeof summaryGrades);
      setGradingSystem(normalizeGradingSystem(nextGrades.gradingSystem || DEFAULT_GRADING_SYSTEM));
      setScaleMode(normalizeScaleMode(nextGrades.gradeScaleMode));
    }).catch((cause: any) => {
      if (!active) return;
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
        setError(String(cause?.response?.data?.message || cause?.message || "Не вдалося завантажити журнал."));
      }
    }).finally(() => active && setLoading(false));

    return () => { active = false; };
  }, [user.studentId, isPreview]);

  const normalizedSystem = normalizeGradingSystem(gradingSystem);
  const normalizedScale = normalizeScaleMode(scaleMode);
  const average = useMemo(() => grades.length ? grades.reduce((sum, grade) => sum + Number(grade.total || 0), 0) / grades.length : 0, [grades]);
  const next = lessons.find((lesson) => !lesson.reportOnly) || lessons[0];
  const displayAverage = average ? formatGradeForSystem(average, normalizedSystem, normalizedScale) : "—";
  const recentGrades = [...grades].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 8);

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-7 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1480px] space-y-6">
        <section className="overflow-hidden rounded-[30px] bg-[#173024] p-6 text-white shadow-[0_26px_60px_-42px_rgba(0,0,0,.85)] sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#72edb0]"><GraduationCap className="size-4" />Мій журнал</div>
              <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.055em] sm:text-5xl">Оцінки, які видно.</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#bed1c0]">Тут учень бачить свої практичні оцінки, тематичні підсумки й наступний навчальний крок в одній системі оцінювання класу.</p>
            </div>
            <div className="rounded-2xl bg-black/15 p-5">
              <div className="text-sm text-[#b4c8b7]">Система класу</div>
              <div className="mt-1 text-lg font-semibold">{gradingSystemLabel(normalizedSystem, false)}</div>
              <div className="mt-5 text-sm text-[#b4c8b7]">Середній результат</div>
              <div className="mt-1 text-5xl font-semibold tracking-[-.07em] text-[#72edb0]">{displayAverage}</div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00d977]" style={{ width: `${Math.min(100, average)}%` }} /></div>
            </div>
          </div>
        </section>

        {error && <div className="rounded-2xl bg-[#fff0f4] p-4 text-sm text-[#bd3c62] dark:bg-[#ff6b9d]/10 dark:text-[#ffa5bf]">{error}</div>}

        <div className="grid gap-5 xl:grid-cols-[.95fr_1.05fr]">
          <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]">
            <div className="text-xs font-semibold uppercase tracking-[.16em] text-[#147b47] dark:text-[#62ecaa]">Наступний крок</div>
            {loading ? <div className="mt-5 h-44 animate-pulse rounded-2xl bg-[#edf2ee] dark:bg-white/[.045]" /> : next ? (
              <button onClick={() => navigate(`/edu/lessons/${next.id}`)} className="mt-4 block w-full rounded-2xl bg-[#17251c] p-5 text-left text-white transition hover:-translate-y-0.5">
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-[#8eb093]">{next.type === "CONTROL" ? "Контрольна" : next.type === "TOPIC" ? "Тема" : "Урок"}</div>
                    <div className="mt-2 text-xl font-semibold">{next.title}</div>
                    <div className="mt-2 text-sm text-[#b4c7b7]">{next.tasksCount} задач · {next.hasTheory ? "є теорія" : "практичний блок"}</div>
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-[#72edb0]" />
                </div>
                <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#72edb0]"><BookOpen className="h-4 w-4" />Відкрити урок</div>
              </button>
            ) : <div className="mt-5 rounded-2xl bg-[#f5f8f5] p-5 text-sm text-[#718075] dark:bg-white/[.04] dark:text-[#a4b2a7]">Поки що немає доступних уроків.</div>}
          </section>

          <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[.16em] text-[#147b47] dark:text-[#62ecaa]">Оцінки</div>
                <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Останні результати</h2>
              </div>
              <Target className="size-5 text-[#00b963]" />
            </div>
            <div className="mt-5 space-y-2">
              {loading ? <div className="h-40 animate-pulse rounded-2xl bg-[#edf2ee] dark:bg-white/[.045]" /> : recentGrades.length ? recentGrades.map((grade) => {
                const title = grade.topicTask?.title || grade.task?.title || "Оцінка";
                const context = grade.topicTask?.topicTitle || grade.task?.lesson?.title || "Практика";
                return (
                  <div key={grade.id} className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f8f5] px-4 py-3 dark:bg-white/[.04]">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{title}</div>
                      <div className="mt-1 truncate text-xs text-[#79877d] dark:text-[#9dac9f]">{context} · {new Date(grade.createdAt).toLocaleDateString("uk-UA")}</div>
                    </div>
                    <div className="shrink-0 rounded-xl bg-white px-3 py-2 text-lg font-bold text-[#147b47] shadow-sm dark:bg-[#00ff88]/10 dark:text-[#72edb0]">{formatGradeForSystem(grade.total, normalizedSystem, normalizedScale)}</div>
                  </div>
                );
              }) : <div className="rounded-2xl bg-[#f5f8f5] p-5 text-sm text-[#718075] dark:bg-white/[.04] dark:text-[#a4b2a7]">Оцінок ще немає. Вони зʼявляться після виконання практик або перевірки вчителем.</div>}
            </div>
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_.75fr]">
          <section className="rounded-[26px] border border-[#152219]/10 bg-[#fff8ec] p-5 dark:border-[#ff8c00]/20 dark:bg-[#ff8c00]/[.07]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#d97706]"><NotebookTabs className="size-4" />Тематичні</div>
            <div className="mt-5 space-y-2">
              {summaryGrades.length ? summaryGrades.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 dark:bg-white/[.06]">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{item.name}</div>
                    <div className="mt-1 truncate text-sm text-[#776e5d] dark:text-[#c2b08e]">{item.topicTitle || "Тема класу"}</div>
                  </div>
                  <div className="shrink-0 text-xl font-bold text-[#147b47] dark:text-[#72edb0]">{formatGradeForSystem(item.grade, normalizedSystem, normalizedScale)}</div>
                </div>
              )) : <p className="text-sm text-[#776e5d] dark:text-[#c2b08e]">Тематичні оцінки зʼявляться після завершення тем.</p>}
            </div>
          </section>

          <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]">
            <div className="text-xs font-semibold uppercase tracking-[.16em] text-[#147b47] dark:text-[#62ecaa]">Активність</div>
            <div className="mt-5 space-y-3">{lessons.slice(0, 4).map((lesson) => (
              <button key={lesson.id} onClick={() => navigate(`/edu/lessons/${lesson.id}`)} className="flex w-full items-center justify-between rounded-xl bg-[#f5f8f5] p-3 text-left dark:bg-white/[.04]">
                <div>
                  <div className="font-semibold">{lesson.title}</div>
                  <div className="mt-1 text-sm text-[#647369] dark:text-[#a6b4a9]">{lesson.tasksCount} задач</div>
                </div>
                {lesson.reportOnly ? <CheckCircle2 className="h-4 w-4 text-[#147b47]" /> : <Clock3 className="h-4 w-4 text-[#d97706]" />}
              </button>
            ))}</div>
          </section>
        </div>
      </div>
    </div>
  );
};
