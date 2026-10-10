import React from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CheckCircle2, ChevronRight, LoaderCircle, LockKeyhole, RefreshCw, Route, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getLearningCatalog, getLearningMe, enrollInCatalogCourse, type CatalogCourse, type CatalogVariant, type LearningMe } from "../../lib/api/learningCatalog";
import { tr } from "../../i18n";
import { getErrorMessageFromUnknown } from "../../lib/safeError";
import { getLearningContentState } from "../../lib/learningContentState";
import { withDevPreview } from "../../lib/devPreview";

function levelLabel(level: CatalogCourse["level"]): string {
  if (level === "FOUNDATION") return tr("База", "Foundation");
  if (level === "SPECIALIZATION") return tr("Спеціалізація", "Specialization");
  return tr("Поглиблений", "Advanced");
}

export const LearningCatalogPage: React.FC = () => {
  const { i18n } = useTranslation();
  const locale = i18n.language.startsWith("en") ? "en" : "uk";
  const navigate = useNavigate();
  const [courses, setCourses] = React.useState<CatalogCourse[]>([]);
  const [learningMe, setLearningMe] = React.useState<LearningMe | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyVariant, setBusyVariant] = React.useState<number | null>(null);
  const [query, setQuery] = React.useState("");
  const [level, setLevel] = React.useState<CatalogCourse["level"] | "ALL">("ALL");
  const [error, setError] = React.useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = React.useState(false);
  const contentState = getLearningContentState({ loading, hasError: Boolean(error), hasData: courses.length > 0 });

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setRefreshFailed(false);
    try {
      const [catalog, me] = await Promise.all([getLearningCatalog(), getLearningMe()]);
      setCourses(catalog);
      setLearningMe(me);
    } catch {
      setError(tr("Не вдалося завантажити каталог навчання.", "Could not load the learning catalog."));
      setRefreshFailed(true);
    } finally {
      setLoading(false);
    }
  }, [locale]);

  React.useEffect(() => { void reload(); }, [reload]);

  const start = async (course: CatalogCourse, variant: CatalogVariant) => {
    if (variant.gate || variant.status !== "PUBLISHED") return;
    setBusyVariant(variant.id);
    setError(null);
    setRefreshFailed(false);
    try {
      await enrollInCatalogCourse(course.id, variant.id);
      await reload();
      navigate(withDevPreview(`/learning/course/${course.id}/overview`));
    } catch (caught: unknown) {
      setError(getErrorMessageFromUnknown(caught, "") === "PREREQUISITES_INCOMPLETE"
        ? tr("Спочатку завершіть обов’язкові базові курси.", "Complete the required foundation courses first.")
        : tr("Не вдалося відкрити курс.", "Could not open the course."));
    } finally {
      setBusyVariant(null);
    }
  };

  if (contentState === "loading") {
    return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12" aria-busy="true">
      <div className="sr-only" role="status" aria-live="polite">
        <LoaderCircle className="mr-2 inline size-4 animate-spin" aria-hidden="true" />
        {tr("Завантажуємо каталог навчання…", "Loading the learning catalog…")}
      </div>
      <header className="mb-8 max-w-3xl" aria-hidden="true">
        <div className="h-3 w-28 animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
        <div className="mt-4 h-10 w-64 max-w-full animate-pulse rounded-xl bg-bg-hover dark:bg-white/[.06]" />
        <div className="mt-4 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
        <div className="mt-2 h-4 w-4/5 max-w-xl animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
      </header>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[1, 2, 3].map((key) => <div key={key} className="min-h-[275px] rounded-[26px] border border-border bg-bg-surface p-6">
          <div className="h-6 w-24 animate-pulse rounded-full bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-7 h-7 w-3/4 animate-pulse rounded-lg bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-8 h-11 w-full animate-pulse rounded-xl bg-bg-hover dark:bg-white/[.06]" />
          <div className="mt-2 h-11 w-full animate-pulse rounded-xl bg-bg-hover dark:bg-white/[.06]" />
        </div>)}
      </div>
    </main>;
  }

  const activeVariantId = courses
    .flatMap((course) => course.variants)
    .find((variant) => variant.enrollment?.id === learningMe?.currentEnrollmentId)?.id ?? null;
  const filteredCourses = courses.filter((course) => {
    const text = `${course.title} ${course.description ?? ""} ${course.variants.map((variant) => variant.title).join(" ")}`.toLocaleLowerCase(locale);
    return (level === "ALL" || course.level === level) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase(locale)));
  });

  return <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
    <header className="mb-5 flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
      <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{tr("Навчання", "Learning")}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-4xl">{tr("Каталог курсів", "Course catalog")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{tr("Знайди курс за темою та рівнем. Необхідні передумови видно до початку.", "Find a course by topic and level. Prerequisites are shown before you start.")}</p></div>
    </header>
    <section aria-label={tr("Пошук курсів", "Course search")} className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 focus-within:ring-2 focus-within:ring-ring"><Search className="size-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="sr-only">{tr("Пошук курсів", "Search courses")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Назва, тема або мова…", "Course, topic, or language…")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" /></label>
      <label className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-bg-surface px-3 text-sm text-text-secondary"><span className="shrink-0">{tr("Рівень", "Level")}</span><select value={level} onChange={(event) => setLevel(event.target.value as CatalogCourse["level"] | "ALL")} aria-label={tr("Фільтр за рівнем", "Filter by level")} className="min-w-0 flex-1 bg-transparent font-semibold text-text-primary outline-none"><option value="ALL">{tr("Усі", "All levels")}</option><option value="FOUNDATION">{tr("База", "Foundation")}</option><option value="SPECIALIZATION">{tr("Спеціалізація", "Specialization")}</option><option value="ADVANCED">{tr("Поглиблений", "Advanced")}</option></select></label>
    </section>
    <p className="mb-3 text-xs font-medium tabular-nums text-text-muted" role="status" aria-live="polite">{filteredCourses.length} {tr("курсів", "courses")}</p>
    {contentState === "refreshing" ? <div className="mb-6 flex items-center gap-2 text-sm text-text-secondary" role="status" aria-live="polite"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{tr("Оновлюємо каталог…", "Refreshing the catalog…")}</div> : null}
    {activeVariantId !== null && <div className="mb-6 rounded-2xl border border-border bg-bg-surface px-4 py-3 text-sm text-text-secondary">{tr("Можна мати кілька розпочатих курсів. Поточний курс визначає головний маршрут і кнопку «Продовжити».", "You can have multiple started courses. The current course owns the main route and Continue action.")}</div>}
    {error && <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-error/30 bg-accent-error/10 px-4 py-3 text-sm text-accent-error" role={refreshFailed ? "alert" : "status"} aria-live={refreshFailed ? "assertive" : "polite"}>
      <div><p>{error}</p>{refreshFailed && courses.length > 0 ? <p className="mt-1 text-xs text-text-secondary">{tr("Показано останній успішно завантажений каталог.", "Showing the last successfully loaded catalog.")}</p> : null}</div>
      <button type="button" onClick={() => void reload()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent-error/30 px-4 py-2 text-xs font-bold hover:bg-accent-error/10">
        <RefreshCw className="size-3.5" aria-hidden="true" />{tr("Повторити", "Retry")}
      </button>
    </div>}
    {contentState === "empty" ? <div className="rounded-xl border border-dashed border-border bg-bg-surface px-6 py-16 text-center" role="status">
      <BookOpen className="mx-auto size-8 text-primary" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold text-text-primary">{tr("Курси поки недоступні", "No courses are available yet")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">{tr("Поверніться трохи пізніше — каталог оновлюється командою StudyCod.", "Please come back later — the StudyCod team is updating the catalog.")}</p>
      <button type="button" onClick={() => void reload()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-bg-base hover:opacity-90">
        <RefreshCw className="size-4" aria-hidden="true" />{tr("Оновити каталог", "Refresh catalog")}
      </button>
    </div> : filteredCourses.length ? <div className="grid gap-x-6 md:grid-cols-2 xl:grid-cols-3">
      {filteredCourses.map((course) => {
        const hasUnlocked = course.variants.some((variant) => variant.enrollment?.status === "AVAILABLE" || variant.enrollment?.status === "IN_PROGRESS" || variant.enrollment?.status === "COMPLETED");
        return <article key={course.id} className="flex flex-col border-b border-border py-5">
          <div className="flex items-center justify-between gap-4"><span className="text-xs font-semibold text-text-muted">{levelLabel(course.level)}</span>{course.isBase ? <BookOpen className="size-4 text-primary" aria-hidden="true" /> : <Route className="size-4 text-text-muted" aria-hidden="true" />}</div>
          <h2 className="mt-3 text-xl font-bold tracking-tight text-text-primary">{course.title}</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-text-secondary">{course.description}</p>
          {course.prerequisites.length > 0 && <div className="mt-3 border-l-2 border-accent-warn px-3 py-1 text-xs text-text-secondary"><b>{tr("Потрібно завершити:", "Requires:")}</b> {course.prerequisites.map((item) => `${item.title} (${Math.round(item.completionPercent)}%)`).join(", ")}</div>}
          <div className="mt-4 space-y-2">{course.variants.map((variant) => {
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
          {hasUnlocked && <p className="mt-2 text-xs text-text-muted">{tr("Продовжуй з останньої теми.", "Continue from your latest topic.")}</p>}
        </article>;
      })}
    </div> : <div className="border-y border-border py-12 text-sm text-text-secondary" role="status"><p className="font-semibold">{tr("Курсів за цими умовами не знайдено.", "No courses match these filters.")}</p><button type="button" onClick={() => { setQuery(""); setLevel("ALL"); }} className="mt-3 min-h-11 text-sm font-semibold text-primary-strong">{tr("Очистити фільтри", "Clear filters")}</button></div>}
  </main>;
};

export default LearningCatalogPage;
