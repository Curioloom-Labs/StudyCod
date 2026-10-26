import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, CheckCircle2, ChevronRight, Code2, LoaderCircle, LockKeyhole, RefreshCw, Route, Search, Sparkles } from "lucide-react";
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
    return <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12" aria-busy="true">
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

  const activeCourse = courses.find((course) => course.variants.some((variant) => variant.enrollment?.id === learningMe?.currentEnrollmentId)) ?? null;
  const activeVariant = activeCourse?.variants.find((variant) => variant.enrollment?.id === learningMe?.currentEnrollmentId) ?? null;
  const activeVariantId = activeVariant?.id ?? null;
  const publishedVariantCount = courses.reduce((total, course) => total + course.variants.filter((variant) => variant.status === "PUBLISHED").length, 0);
  const filteredCourses = courses.filter((course) => {
    const text = `${course.title} ${course.key ?? ""} ${course.description ?? ""} ${levelLabel(course.level)} ${course.variants.map((variant) => `${variant.title} ${variant.runtimeLabel}`).join(" ")}`.toLocaleLowerCase(locale);
    return (level === "ALL" || course.level === level) && (!query.trim() || text.includes(query.trim().toLocaleLowerCase(locale)));
  });

  return <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-10 lg:pt-7">
    <header className="relative isolate mb-5 overflow-hidden rounded-[28px] border border-white/10 bg-[#17372d] text-[#f3f2e9] shadow-[0_24px_70px_rgba(8,24,17,.16)]">
      <div aria-hidden="true" className="pointer-events-none absolute -right-28 -top-40 size-[420px] rounded-full border border-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute right-10 top-12 size-44 rounded-full border border-[#c4e58a]/20" />
      <div className="relative grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:gap-6 lg:p-6">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-[#c4e58a]"><Sparkles size={14} aria-hidden="true" />{tr("Навчальні маршрути / StudyCod", "Learning routes / StudyCod")}</p>
          <h1 className="mt-4 max-w-4xl text-balance text-[clamp(2.1rem,4.5vw,4rem)] font-black leading-[.98] tracking-[-.065em]">{tr("Обери наступну навичку.", "Choose your next skill.")}</h1>
          <p className="mt-3 max-w-[48rem] text-sm leading-6 text-[#d3ded4] sm:text-base">{tr("Курси з чітким маршрутом, видимими передумовами та збереженим прогресом.", "Structured courses with visible prerequisites and saved progress.")}</p>
          <div className="mt-5 flex flex-wrap gap-x-7 gap-y-2 border-t border-white/15 pt-3">
            <div><strong className="text-2xl font-black tabular-nums">{courses.length}</strong><span className="ml-2 text-xs text-[#d3ded4]">{tr("курсів", "courses")}</span></div>
            <div><strong className="text-2xl font-black tabular-nums">{publishedVariantCount}</strong><span className="ml-2 text-xs text-[#d3ded4]">{tr("мовних маршрутів", "language routes")}</span></div>
            {activeVariant?.enrollment && <div><strong className="text-2xl font-black tabular-nums text-[#c4e58a]">{Math.round(activeVariant.enrollment.completionPercent)}%</strong><span className="ml-2 text-xs text-[#d3ded4]">{tr("твій прогрес", "your progress")}</span></div>}
          </div>
        </div>

        {activeCourse && activeVariant?.enrollment ? <aside className="rounded-[22px] border border-white/15 bg-[#10281f]/75 p-4 backdrop-blur-sm" aria-label={tr("Продовжити активний курс", "Continue your active course")}>
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#c4e58a]">{tr("Продовжити навчання", "Continue learning")} · {Math.round(activeVariant.enrollment.completionPercent)}%</p>
          <h2 className="mt-2 text-lg font-extrabold leading-tight">{activeCourse.title}</h2>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-[#c4e58a]" style={{ width: `${Math.min(100, Math.max(0, activeVariant.enrollment.completionPercent))}%` }} /></div>
          <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${activeCourse.id}/overview`))} className="mt-4 inline-flex min-h-11 w-full items-center justify-between rounded-xl bg-[#c4e58a] px-4 text-sm font-extrabold text-[#17372d] transition hover:bg-[#d4f29e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            {tr("Продовжити маршрут", "Continue the route")}<ArrowRight size={17} aria-hidden="true" />
          </button>
        </aside> : <aside className="flex min-h-40 flex-col justify-between rounded-[22px] border border-white/15 bg-[#10281f]/75 p-5 backdrop-blur-sm">
          <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#c4e58a]">{tr("Почни з основ", "Start with a foundation")}</p>
          <div><p className="text-3xl font-black tracking-tight">{tr("Один крок за раз.", "One step at a time.")}</p><p className="mt-2 max-w-xs text-sm leading-5 text-[#d3ded4]">{tr("Обери курс нижче — передумови й мови видно одразу.", "Choose a course below; prerequisites and languages are visible up front.")}</p></div>
        </aside>}
      </div>
    </header>

    <section aria-label={tr("Пошук курсів", "Course search")} className="mb-4 grid gap-3 rounded-[22px] border border-border bg-bg-surface p-2.5 sm:grid-cols-[minmax(0,1fr)_15rem] sm:p-3">
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-bg-base px-4 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring"><Search className="size-4 shrink-0 text-text-muted" aria-hidden="true" /><span className="sr-only">{tr("Пошук курсів", "Search courses")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("Мова, тема або назва курсу…", "Language, topic, or course name…")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted" /></label>
      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-border bg-bg-base px-4 text-sm text-text-secondary"><span className="shrink-0">{tr("Рівень", "Level")}</span><select value={level} onChange={(event) => setLevel(event.target.value as CatalogCourse["level"] | "ALL")} aria-label={tr("Фільтр за рівнем", "Filter by level")} className="min-w-0 flex-1 bg-transparent font-bold text-text-primary outline-none"><option value="ALL">{tr("Усі курси", "All levels")}</option><option value="FOUNDATION">{tr("База", "Foundation")}</option><option value="SPECIALIZATION">{tr("Спеціалізація", "Specialization")}</option><option value="ADVANCED">{tr("Поглиблений", "Advanced")}</option></select></label>
    </section>

    <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2.5">
      <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-primary-strong dark:text-primary">{tr("Знайди свій наступний крок", "Find your next step")}</p><h2 className="mt-0.5 text-xl font-black tracking-tight text-text-primary">{tr("Усі маршрути", "All learning routes")}</h2></div>
      <p className="text-xs font-semibold tabular-nums text-text-muted" role="status" aria-live="polite">{filteredCourses.length} {tr("курсів", "courses")}</p>
    </div>
    {contentState === "refreshing" ? <div className="mb-6 flex items-center gap-2 text-sm text-text-secondary" role="status" aria-live="polite"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{tr("Оновлюємо каталог…", "Refreshing the catalog…")}</div> : null}
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
    </div> : filteredCourses.length ? <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
      {filteredCourses.map((course) => {
        const hasUnlocked = course.variants.some((variant) => variant.enrollment?.status === "AVAILABLE" || variant.enrollment?.status === "IN_PROGRESS" || variant.enrollment?.status === "COMPLETED");
        const currentVariant = course.variants.find((variant) => variant.id === activeVariantId) ?? null;
        const canPreview = course.status === "PUBLISHED";
        return <article key={course.id} className={`group relative flex min-w-0 flex-col overflow-hidden rounded-[22px] border bg-bg-surface p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(19,35,25,.08)] focus-within:border-primary/55 ${currentVariant ? "border-primary/55 ring-1 ring-primary/15" : "border-border hover:border-primary/35"}`}>
          <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${course.isBase ? "bg-primary" : course.level === "ADVANCED" ? "bg-accent-warn" : "bg-[#3295a5]"}`} />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[.1em] ${course.isBase ? "bg-primary/10 text-primary-strong dark:text-primary" : course.level === "ADVANCED" ? "bg-accent-warn/10 text-accent-warn" : "bg-[#3295a5]/10 text-[#287e8c] dark:text-[#76cad4]"}`}>{levelLabel(course.level)}</span>
            <span className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted">{course.isBase ? <BookOpen size={14} aria-hidden="true" /> : <Route size={14} aria-hidden="true" />}{course.isBase ? tr("Фундамент", "Foundation") : tr("Траєкторія", "Specialization")}</span>
          </div>
          <h3 className="mt-4 text-xl font-black leading-tight tracking-[-.025em] text-text-primary">{course.title}</h3>
          <p className="mt-2 min-h-[3rem] text-sm leading-6 text-text-secondary">{course.description || tr("Послідовна програма з теорією та практикою.", "A structured course with theory and practice.")}</p>

          <div className="mt-4 flex flex-wrap gap-1.5" aria-label={tr("Доступні мови", "Available languages")}>
            {course.variants.filter((variant) => variant.status === "PUBLISHED").map((variant) => <span key={variant.id} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${variant.id === activeVariantId ? "border-primary/35 bg-primary/10 text-primary-strong dark:text-primary" : "border-border bg-bg-base text-text-secondary"}`}><Code2 size={13} aria-hidden="true" />{variant.runtimeLabel}</span>)}
          </div>

          {course.prerequisites.length > 0 && <div className="mt-4 rounded-xl border-l-2 border-accent-warn bg-accent-warn/[.06] px-3 py-2.5 text-xs leading-5 text-text-secondary"><b className="text-text-primary">{tr("Перед стартом", "Before you start")}</b><ul className="mt-1 space-y-0.5">{course.prerequisites.map((item) => <li key={item.courseId} className="flex flex-wrap items-center justify-between gap-x-3"><span>{item.title}</span><span className="font-bold tabular-nums text-accent-warn">{Math.round(item.completionPercent)}% / {Math.round(item.requiredCompletionPercent)}%</span></li>)}</ul></div>}

          <div className="mt-5 space-y-2 border-t border-border pt-4">{course.variants.map((variant) => {
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
            return <button key={variant.id} type="button" disabled={locked || busyVariant === variant.id} onClick={() => void start(course, variant)} aria-label={`${variant.title}: ${actionLabel}`} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${locked ? "cursor-not-allowed border-border bg-bg-base text-text-muted" : currentVariant?.id === variant.id ? "border-primary/35 bg-primary/10 hover:bg-primary/15" : "border-border bg-bg-base hover:border-primary/40 hover:bg-primary/[.04]"}`}>
              {locked ? <LockKeyhole className="size-4 shrink-0 text-text-muted" aria-hidden="true" /> : completed ? <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden="true" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-extrabold text-text-primary">{variant.title}</span>{locked && variant.gate?.prerequisites?.length ? <span className="mt-0.5 block truncate text-[10px] text-text-muted">{tr("Потрібно:", "Requires:")} {variant.gate.prerequisites.map((item) => item.title).join(", ")}</span> : null}</span>
              <span className={`shrink-0 text-right text-[11px] font-bold ${locked ? "text-text-muted" : "text-text-secondary"}`}>{busyVariant === variant.id ? tr("Відкриваємо…", "Opening…") : enrollment && !locked ? `${actionLabel} · ${Math.round(enrollment.completionPercent)}%` : actionLabel}</span>
            </button>;
          })}</div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-4">
            {hasUnlocked ? <span className="text-[11px] font-semibold text-primary">{tr("Твій прогрес збережено", "Your progress is saved")}</span> : <span className="text-[11px] text-text-muted">{tr("Передумови видно до старту", "Prerequisites shown up front")}</span>}
            {canPreview && <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${course.id}/overview`))} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-extrabold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{tr("Програма", "Syllabus")}<ArrowRight size={14} aria-hidden="true" /></button>}
          </div>
        </article>;
      })}
    </div> : <div className="rounded-[22px] border border-dashed border-border bg-bg-surface px-6 py-16 text-center" role="status"><Search className="mx-auto size-7 text-text-muted" aria-hidden="true" /><p className="mt-3 font-semibold text-text-primary">{tr("Курсів за цими умовами не знайдено.", "No courses match these filters.")}</p><p className="mt-1 text-sm text-text-secondary">{tr("Спробуй іншу мову, назву або рівень.", "Try another language, title, or level.")}</p><button type="button" onClick={() => { setQuery(""); setLevel("ALL"); }} className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-bold text-primary-strong transition hover:bg-bg-hover">{tr("Очистити фільтри", "Clear filters")}</button></div>}
  </main>;
};

export default LearningCatalogPage;
