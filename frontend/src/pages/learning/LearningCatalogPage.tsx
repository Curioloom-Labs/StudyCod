import React from "react";
import { BookOpen, CheckCircle2, ChevronRight, LoaderCircle, LockKeyhole, RefreshCw, Route } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getLearningCatalog, getLearningMe, enrollInCatalogCourse, type CatalogCourse, type CatalogVariant, type LearningMe } from "../../lib/api/learningCatalog";
import { tr } from "../../i18n";

function levelLabel(level: CatalogCourse["level"]): string {
  if (level === "FOUNDATION") return tr("База", "Foundation");
  if (level === "SPECIALIZATION") return tr("Спеціалізація", "Specialization");
  return tr("Поглиблений", "Advanced");
}

export const LearningCatalogPage: React.FC = () => {
  const navigate = useNavigate();
  const [courses, setCourses] = React.useState<CatalogCourse[]>([]);
  const [learningMe, setLearningMe] = React.useState<LearningMe | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyVariant, setBusyVariant] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalog, me] = await Promise.all([getLearningCatalog(), getLearningMe()]);
      setCourses(catalog);
      setLearningMe(me);
    } catch {
      setError(tr("Не вдалося завантажити каталог навчання.", "Could not load the learning catalog."));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void reload(); }, [reload]);

  const start = async (course: CatalogCourse, variant: CatalogVariant) => {
    if (variant.gate || variant.status !== "PUBLISHED") return;
    setBusyVariant(variant.id);
    setError(null);
    try {
      await enrollInCatalogCourse(course.id, variant.id);
      await reload();
      navigate(`/learning/course/${course.id}`);
    } catch (caught: any) {
      setError(caught?.response?.data?.message === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку завершіть обов’язкові базові курси.", "Complete the required foundation courses first.")
        : tr("Не вдалося відкрити курс.", "Could not open the course."));
    } finally {
      setBusyVariant(null);
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-6xl px-6 py-16 text-sm text-text-secondary" role="status" aria-live="polite">
      <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
      {tr("Завантажуємо каталог…", "Loading catalog…")}
    </div>;
  }

  const activeVariantId = courses
    .flatMap((course) => course.variants)
    .find((variant) => variant.enrollment?.id === learningMe?.currentEnrollmentId)?.id ?? null;

  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <header className="mb-8 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">Study paths</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{tr("Каталог навчання", "Learning catalog")}</h1>
      <p className="mt-4 text-base leading-7 text-text-secondary">{tr("Один акаунт — багато послідовних навчальних шляхів. Поглиблені курси відкриваються лише після завершення необхідної бази.", "One account, many structured learning paths. Advanced courses unlock only after their prerequisites are complete.")}</p>
    </header>
    {activeVariantId !== null && <div className="mb-6 rounded-2xl border border-border bg-bg-surface px-4 py-3 text-sm text-text-secondary">{tr("Можна мати кілька розпочатих курсів. Поточний курс визначає головний маршрут і кнопку «Продовжити».", "You can have multiple started courses. The current course owns the main route and Continue action.")}</div>}
    {error && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error" role="alert" aria-live="assertive">
      <span>{error}</span>
      <button type="button" onClick={() => void reload()} className="inline-flex items-center gap-2 rounded-xl border border-accent-error/30 px-3 py-2 text-xs font-bold hover:bg-accent-error/10">
        <RefreshCw className="size-3.5" aria-hidden="true" />{tr("Повторити", "Retry")}
      </button>
    </div>}
    {!courses.length ? <div className="rounded-[26px] border border-dashed border-border bg-bg-surface px-6 py-16 text-center" role="status">
      <BookOpen className="mx-auto size-8 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold text-text-primary">{tr("Курси поки недоступні", "No courses are available yet")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{tr("Поверніться трохи пізніше — каталог оновлюється командою StudyCod.", "Please come back later — the StudyCod team is updating the catalog.")}</p>
      <button type="button" onClick={() => void reload()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-bg-base hover:opacity-90">
        <RefreshCw className="size-4" aria-hidden="true" />{tr("Оновити каталог", "Refresh catalog")}
      </button>
    </div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {courses.map((course) => {
        const hasUnlocked = course.variants.some((variant) => variant.enrollment?.status === "AVAILABLE" || variant.enrollment?.status === "IN_PROGRESS" || variant.enrollment?.status === "COMPLETED");
        return <article key={course.id} className="flex min-h-[275px] flex-col rounded-[26px] border border-border bg-bg-surface p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4"><span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">{levelLabel(course.level)}</span>{course.isBase ? <BookOpen className="size-5 text-primary" aria-hidden="true" /> : <Route className="size-5 text-text-muted" aria-hidden="true" />}</div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-text-primary">{course.title}</h2>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-text-secondary">{course.description}</p>
          {course.prerequisites.length > 0 && <div className="mt-4 rounded-xl bg-bg-code/50 px-3 py-2 text-xs text-text-secondary"><b>{tr("Потрібно завершити:", "Requires:")}</b> {course.prerequisites.map((item) => `${item.title} (${Math.round(item.completionPercent)}%)`).join(", ")}</div>}
          <div className="mt-auto space-y-2 pt-6">{course.variants.map((variant) => {
            const enrollment = variant.enrollment;
            const locked = Boolean(variant.gate) || variant.status !== "PUBLISHED";
            const completed = enrollment?.status === "COMPLETED";
            const switching = activeVariantId !== null && activeVariantId !== variant.id && !completed && !locked;
            const actionLabel = locked
              ? tr("Закрито", "Locked")
              : completed
                ? tr("Переглянути курс", "View course")
                : enrollment?.status === "IN_PROGRESS"
                  ? tr("Продовжити", "Continue")
                  : switching
                    ? tr("Перемкнутися", "Switch")
                    : tr("Активувати курс", "Activate course");
            return <button key={variant.id} type="button" disabled={locked || busyVariant === variant.id} onClick={() => void start(course, variant)} aria-label={`${variant.title}: ${actionLabel}`} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${locked ? "cursor-not-allowed border-border bg-bg-code/30 opacity-70" : "border-primary/25 bg-primary/5 hover:bg-primary/10"}`}>
              {locked ? <LockKeyhole className="size-4 text-text-muted" aria-hidden="true" /> : completed ? <CheckCircle2 className="size-4 text-primary" aria-hidden="true" /> : <ChevronRight className="size-4 text-primary" aria-hidden="true" />}
              <span className="flex-1 text-sm font-bold text-text-primary">{variant.title}</span>
              <span className="text-xs font-semibold text-text-secondary">{enrollment && !locked ? `${actionLabel} · ${Math.round(enrollment.completionPercent)}%` : actionLabel}</span>
            </button>;
          })}</div>
          {hasUnlocked && <p className="mt-3 text-xs text-primary">{tr("Продовжуйте з останньої завершеної теми.", "Continue from your latest completed topic.")}</p>}
        </article>;
      })}
    </div>}
  </main>;
};

export default LearningCatalogPage;
