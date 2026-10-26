import React from "react";
import { ArrowRight, BookOpen, CheckCircle2, Play, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePersonalLearning } from "../../components/learning/PersonalLearningProvider";
import { getLearningContentState } from "../../lib/learningContentState";
import { withDevPreview } from "../../lib/devPreview";

export const PersonalCourseDashboard: React.FC = () => {
  const { currentCourse, loading, error, refresh } = usePersonalLearning();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const contentState = getLearningContentState({ loading, hasError: Boolean(error), hasData: Boolean(currentCourse) });

  if (contentState === "loading") return <div className="mx-auto max-w-[1320px] px-4 py-16 text-sm text-text-muted sm:px-6 lg:px-8" role="status" aria-live="polite">{uk ? "Завантажуємо навчальний простір…" : "Loading your learning space…"}</div>;
  if (contentState === "error") return <main className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="learning-load-error">
    <section className="rounded-2xl border border-accent-error/45 bg-accent-error/8 p-5 sm:p-7" role="alert">
      <h1 id="learning-load-error" className="text-xl font-bold">{uk ? "Не вдалося завантажити навчальний простір" : "We couldn’t load your learning space"}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">{uk ? "Перевір з’єднання й спробуй ще раз. Дані не змінено." : "Check your connection and try again. Your data has not changed."}</p>
      <button type="button" onClick={() => void refresh()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <RefreshCw className="size-4" aria-hidden="true" />{uk ? "Завантажити знову" : "Load again"}
      </button>
    </section>
  </main>;
  if (contentState === "empty") return <main className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8">
    <section className="border-b border-border pb-6">
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{uk ? "Навчання" : "Learning"}</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">{uk ? "Обери перший курс" : "Choose your first course"}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{uk ? "Почни з маршруту, де теорія, практика й результати зібрані разом." : "Start with a path that brings lessons, practice, and results together."}</p>
      <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground">{uk ? "Переглянути каталог" : "Browse courses"}<ArrowRight className="size-4" /></button>
    </section>
  </main>;
  if (!currentCourse) return null;

  const allItems = currentCourse.modules.flatMap((module) => module.items.map((item) => ({ ...item, moduleTitle: module.title })));
  const next = currentCourse.nextAction;
  const nextItem = allItems.find((item) => item.id === next?.itemId);
  const nextIsPractice = next?.kind === "CODE_TASK";
  const nextUrl = next
    ? nextIsPractice ? `/learning/course/${currentCourse.id}/practice/${next.itemId}` : `/learning/course/${currentCourse.id}/path`
    : `/learning/course/${currentCourse.id}/path`;
  const itemLabel = (kind: string) => kind === "CODE_TASK" ? (uk ? "Практика" : "Practice") : kind === "THEORY" ? (uk ? "Теорія" : "Theory") : kind === "MANUAL" ? (uk ? "Проєкт" : "Project") : (uk ? "Заняття" : "Lesson");

  let itemsLeft = 8;
  const previewModules = currentCourse.modules.map((module) => {
    const items = module.items.slice(0, itemsLeft);
    itemsLeft -= items.length;
    return { ...module, items, totalItems: module.items.length };
  }).filter((module) => module.items.length > 0);
  const shownItems = Math.min(8, allItems.length);
  const completedItems = allItems.filter((item) => item.progress.status === "COMPLETED").length;
  const progressPercent = Math.max(0, Math.min(100, Number(currentCourse.enrollment.completionPercent) || 0));
  return <main className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-10 lg:py-7">
    {contentState === "refreshing" ? <div className="mb-4 text-sm text-text-secondary" role="status" aria-live="polite">{uk ? "Оновлюємо дані…" : "Refreshing your data…"}</div> : null}
    {error ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-warn/40 bg-surface-warning px-4 py-3 text-sm" role="status">
      <span className="text-text-secondary">{uk ? "Не вдалося оновити дані. Показано останню завантажену версію." : "Could not refresh. Showing the last loaded version."}</span>
      <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg px-3 font-semibold text-primary-strong transition-colors duration-150 hover:bg-bg-hover motion-reduce:transition-none">{uk ? "Повторити" : "Retry"}</button>
    </div> : null}

    <header className="mb-5 flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end lg:mb-6 lg:pb-6">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-primary-strong"><BookOpen className="size-4" aria-hidden="true" />{uk ? "Маршрут навчання / курс" : "Learning route / course"}</p>
        <h1 className="mt-2 max-w-[22ch] font-[family-name:var(--font-display)] text-3xl font-bold leading-[1.02] tracking-[-.055em] text-balance sm:text-4xl lg:text-[3.25rem]">{currentCourse.title}</h1>
        {currentCourse.description ? <p className="mt-2 max-w-[62ch] text-sm leading-6 text-text-secondary sm:text-base">{currentCourse.description}</p> : null}
      </div>
      <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:self-auto">{uk ? "Інші курси" : "Other courses"}<ArrowRight className="size-4" aria-hidden="true" /></button>
    </header>

    <section className="grid overflow-hidden rounded-[26px] bg-[#19382d] text-[#f3f2e9] shadow-[0_20px_55px_rgba(20,45,32,.14)] lg:grid-cols-[minmax(0,1.45fr)_minmax(275px,.55fr)]" aria-labelledby="next-step-heading">
      <div className="relative flex min-h-[250px] flex-col items-start justify-between overflow-hidden p-5 sm:p-7 lg:min-h-[286px] lg:p-9">
        <div className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full border border-white/[.08]" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-3 -top-7 size-48 rounded-full border border-[#cce890]/20" aria-hidden="true" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-bold uppercase tracking-[.15em] text-[#cce890]">
            <span>{uk ? "Наступна спроба" : "Up next"}</span>{nextItem ? <><span className="text-white/40" aria-hidden="true">/</span><span>{itemLabel(nextItem.kind)}</span><span className="text-white/40" aria-hidden="true">/</span><span className="text-white/65">{nextItem.moduleTitle}</span></> : null}
          </div>
          <h2 id="next-step-heading" className="mt-4 max-w-[18ch] font-[family-name:var(--font-display)] text-3xl font-bold leading-[1.02] tracking-[-.05em] text-balance sm:text-4xl">{next?.title || (uk ? "Маршрут завершено" : "Path complete")}</h2>
          <p className="mt-3 max-w-[54ch] text-sm leading-6 text-white/70">{next ? (uk ? "Повернись до задачі й продовжуй з того місця, де зупинився." : "Return to the task and pick up where you left off.") : (uk ? "Переглянь виконані заняття або обери наступний курс." : "Review completed lessons or choose another course.")}</p>
        </div>
        <button type="button" onClick={() => navigate(withDevPreview(nextUrl))} className="relative z-10 mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#cce890] px-5 font-bold text-[#19382d] transition hover:-translate-y-0.5 hover:bg-[#daf2a5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#19382d] motion-reduce:transform-none motion-reduce:transition-none">
          <Play className="size-4 fill-current" aria-hidden="true" />{next ? (uk ? "Продовжити навчання" : "Continue learning") : (uk ? "Переглянути маршрут" : "Review course path")}<ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>

      <aside className="relative flex flex-col justify-between border-t border-white/10 bg-[#e3e8db] p-5 text-[#1c2e23] sm:p-7 lg:border-l lg:border-t-0 lg:p-8" aria-label={uk ? "Прогрес курсу" : "Course progress"}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[.15em] text-[#56715d]">{uk ? "Прогрес маршруту" : "Route progress"}</p>
          <span className="font-mono text-xs font-bold tabular-nums">{String(currentCourse.modules.length).padStart(2, "0")} {uk ? "розділи" : "units"}</span>
        </div>
        <div className="mt-7 sm:mt-8">
          <div className="flex items-end gap-2">
            <span className="font-[family-name:var(--font-display)] text-6xl font-bold leading-none tracking-[-.07em] tabular-nums sm:text-7xl">{progressPercent}<span className="ml-1 text-3xl text-[#56715d]">%</span></span>
            <span className="mb-1.5 font-mono text-[11px] uppercase tracking-[.12em] text-[#56715d]">{uk ? "завершено" : "complete"}</span>
          </div>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#c7d2c1]" role="progressbar" aria-label={uk ? "Завершення курсу" : "Course completion"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
            <div className="h-full rounded-full bg-[#345b42] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${progressPercent}%` }} />
          </div>
          <p className="mt-3 font-mono text-xs tabular-nums text-[#56715d]">{completedItems} / {allItems.length} {uk ? "занять пройдено" : "steps completed"}</p>
        </div>
        <div className="mt-7 flex items-center gap-1.5" aria-hidden="true">
          {allItems.slice(0, 12).map((item, index) => <span key={item.id} className={`h-1.5 flex-1 rounded-full ${item.progress.status === "COMPLETED" ? "bg-[#345b42]" : item.id === next?.itemId ? "bg-[#8ba361]" : "bg-[#c7d2c1]"}`} style={{ transitionDelay: `${index * 30}ms` }} />)}
        </div>
      </aside>
    </section>

    <section className="mt-8 lg:mt-10" aria-labelledby="course-path-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-primary-strong">{uk ? "Карта курсу" : "Course map"} <span className="ml-2 text-text-muted">/ {String(currentCourse.modules.length).padStart(2, "0")}</span></p>
          <h2 id="course-path-heading" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-.045em] sm:text-3xl">{uk ? "Далі — крок за кроком" : "One step at a time"}</h2>
        </div>
        <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/path`))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none">{uk ? "Повна програма" : "Full course"}<ArrowRight className="size-4" aria-hidden="true" /></button>
      </div>

      <div className="grid gap-x-8 gap-y-5 lg:grid-cols-[.9fr_1.1fr]">
        {previewModules.map((module, moduleIndex) => <section key={module.id} className={`relative min-w-0 border-t-2 pt-4 ${moduleIndex === 0 ? "border-[#345b42]" : "border-border"}`} aria-label={module.title}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="font-mono text-3xl font-bold leading-none tracking-[-.07em] text-primary-strong/70 tabular-nums">{String(moduleIndex + 1).padStart(2, "0")}</span>
              <div className="min-w-0"><h3 className="text-lg font-bold leading-tight tracking-[-.03em] text-text-primary">{module.title}</h3><p className="mt-1 font-mono text-[11px] uppercase tracking-[.1em] text-text-muted">{module.items.length < module.totalItems ? (uk ? `${module.items.length} з ${module.totalItems} занять` : `${module.items.length} of ${module.totalItems} steps`) : (uk ? `${module.totalItems} занять` : `${module.totalItems} steps`)}</p></div>
            </div>
            <span className="mt-1 shrink-0 text-xs font-semibold text-text-muted">{module.items.filter((item) => item.progress.status === "COMPLETED").length}/{module.totalItems}</span>
          </div>
          <ol className="relative mt-4 ml-1 border-l border-border pl-5">
            {module.items.map((item) => {
              const isNext = item.id === next?.itemId;
              const done = item.progress.status === "COMPLETED";
              return <li key={item.id} className="border-b border-border/70 last:border-0">
                <button type="button" aria-current={isNext ? "step" : undefined} onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/${item.kind === "CODE_TASK" ? `practice/${item.id}` : "path"}`))} className={`group relative grid min-h-[62px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none ${isNext ? "text-text-primary" : "text-text-secondary hover:text-text-primary"}`}>
                  <span className={`absolute -left-[27px] top-1/2 grid size-3 -translate-y-1/2 place-items-center rounded-full ring-4 ring-bg-base ${done ? "bg-[#345b42]" : isNext ? "bg-[#cce890]" : "bg-border"}`} aria-hidden="true">{done ? <CheckCircle2 className="size-3.5 text-[#345b42]" /> : null}</span>
                  <span className="min-w-0"><span className={`block truncate text-sm font-semibold ${isNext ? "text-text-primary" : "text-text-secondary group-hover:text-text-primary"}`}>{item.title}</span><span className="mt-1 block truncate font-mono text-[10px] uppercase tracking-[.09em] text-text-muted">{itemLabel(item.kind)}</span></span>
                  <span className={`font-mono text-[10px] font-bold uppercase tracking-[.1em] ${done ? "text-primary-strong" : isNext ? "text-primary-strong" : "text-text-muted"}`}>{done ? (uk ? "Готово" : "Done") : isNext ? (uk ? "Наступне →" : "Next →") : String(module.items.indexOf(item) + 1).padStart(2, "0")}</span>
                </button>
              </li>;
            })}
          </ol>
        </section>)}
      </div>
      {allItems.length > shownItems ? <p className="mt-3 text-sm text-text-muted">{uk ? `Показано ${shownItems} із ${allItems.length} занять` : `Showing ${shownItems} of ${allItems.length} course items`}</p> : null}
    </section>
  </main>;
};
