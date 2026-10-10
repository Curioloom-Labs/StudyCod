import React from "react";
import { ArrowRight, BookOpen, CheckCircle2, Circle, Play, RefreshCw } from "lucide-react";
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

  if (contentState === "loading") return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-text-muted sm:px-6 lg:px-8" role="status" aria-live="polite">{uk ? "Завантажуємо навчальний простір…" : "Loading your learning space…"}</div>;
  if (contentState === "error") return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8" aria-labelledby="learning-load-error">
    <section className="rounded-xl border border-accent-error/35 bg-accent-error/5 p-5 sm:p-7" role="alert">
      <h1 id="learning-load-error" className="text-xl font-bold">{uk ? "Не вдалося завантажити навчальний простір" : "We couldn’t load your learning space"}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">{uk ? "Перевір з’єднання й спробуй ще раз. Дані не змінено." : "Check your connection and try again. Your data has not changed."}</p>
      <button type="button" onClick={() => void refresh()} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <RefreshCw className="size-4" aria-hidden="true" />{uk ? "Завантажити знову" : "Load again"}
      </button>
    </section>
  </main>;
  if (contentState === "empty") return <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
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
  const completed = allItems.filter((item) => item.progress.status === "COMPLETED").length;
  const scored = allItems.filter((item) => item.progress.score != null && Number.isFinite(Number(item.progress.score)));
  const averageScore = scored.length ? Math.round(scored.reduce((sum, item) => sum + Number(item.progress.score ?? 0), 0) / scored.length) : null;
  const nextUrl = next
    ? nextIsPractice ? `/learning/course/${currentCourse.id}/practice/${next.itemId}` : `/learning/course/${currentCourse.id}/path`
    : `/learning/course/${currentCourse.id}/path`;
  const itemLabel = (kind: string) => kind === "CODE_TASK" ? (uk ? "Практика" : "Practice") : kind === "THEORY" ? (uk ? "Теорія" : "Theory") : kind === "MANUAL" ? (uk ? "Проєкт" : "Project") : (uk ? "Заняття" : "Lesson");

  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
    {contentState === "refreshing" ? <div className="mb-4 text-sm text-text-secondary" role="status" aria-live="polite">{uk ? "Оновлюємо дані…" : "Refreshing your data…"}</div> : null}
    {error ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-warn/35 bg-accent-warn/5 px-4 py-3 text-sm" role="status">
      <span className="text-text-secondary">{uk ? "Не вдалося оновити дані. Показано останню завантажену версію." : "Could not refresh. Showing the last loaded version."}</span>
      <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg px-3 font-semibold text-primary-strong hover:bg-bg-hover">{uk ? "Повторити" : "Retry"}</button>
    </div> : null}

    <header className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{uk ? "Мій курс" : "My course"}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] sm:text-[2rem]">{currentCourse.title}</h1>
        {currentCourse.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{currentCourse.description}</p> : null}
      </div>
      <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="min-h-11 shrink-0 rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary transition hover:bg-bg-hover hover:text-text-primary">{uk ? "Знайти інший курс" : "Browse other courses"}</button>
    </header>

    <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,.75fr)]" aria-labelledby="next-step-heading">
      <div className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-text-muted"><span>{uk ? "НАСТУПНИЙ КРОК" : "NEXT STEP"}</span>{nextItem ? <><span aria-hidden="true">·</span><span>{itemLabel(nextItem.kind)}</span><span aria-hidden="true">·</span><span>{nextItem.moduleTitle}</span></> : null}</div>
        <h2 id="next-step-heading" className="mt-3 text-2xl font-bold tracking-[-.035em]">{next?.title || (uk ? "Маршрут завершено" : "Path complete")}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">{next ? (uk ? "Продовжуй із цього заняття. Після запуску або відповіді результат з’явиться тут." : "Continue with this lesson. Your result will appear here after you run or submit your work.") : (uk ? "Переглянь виконані заняття або обери наступний курс." : "Review your completed lessons or choose another course.")}</p>
        <button type="button" onClick={() => navigate(withDevPreview(nextUrl))} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition hover:bg-primary-hover">
          <Play className="size-4 fill-current" aria-hidden="true" />{next ? (uk ? "Продовжити" : "Continue") : (uk ? "Переглянути маршрут" : "Review course path")}<ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
      <section className="rounded-xl border border-border bg-bg-surface p-5 sm:p-6" aria-labelledby="course-progress-heading">
        <div className="flex items-baseline justify-between gap-3"><h2 id="course-progress-heading" className="font-semibold">{uk ? "Прогрес курсу" : "Course progress"}</h2><span className="text-lg font-bold tabular-nums">{Math.round(currentCourse.enrollment.completionPercent)}%</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover" role="progressbar" aria-label={uk ? "Загальний прогрес курсу" : "Course completion"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(currentCourse.enrollment.completionPercent)}><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, currentCourse.enrollment.completionPercent))}%` }} /></div>
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm">
          <div><dt className="text-text-muted">{uk ? "Виконано" : "Completed"}</dt><dd className="mt-1 font-semibold tabular-nums">{completed} / {allItems.length}</dd></div>
          <div><dt className="text-text-muted">{uk ? "Середній бал" : "Average score"}</dt><dd className="mt-1 font-semibold tabular-nums">{averageScore == null ? "—" : averageScore}</dd></div>
        </dl>
      </section>
    </section>

    <section className="mt-8" aria-labelledby="course-path-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div><p className="text-xs font-semibold uppercase tracking-[.12em] text-text-muted">{currentCourse.modules.length} {uk ? "модулів" : "modules"}</p><h2 id="course-path-heading" className="mt-1 text-xl font-bold">{uk ? "Маршрут курсу" : "Course path"}</h2></div>
        <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/path`))} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary-strong hover:bg-bg-hover dark:text-primary-soft">{uk ? "Усі теми" : "All topics"}<ArrowRight className="size-4" /></button>
      </div>
      <ol className="divide-y divide-border">
        {allItems.slice(0, 8).map((item, index) => {
          const isNext = item.id === next?.itemId;
          const done = item.progress.status === "COMPLETED";
          return <li key={item.id}>
            <button type="button" aria-current={isNext ? "step" : undefined} onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/${item.kind === "CODE_TASK" ? `practice/${item.id}` : "path"}`))} className="grid min-h-[68px] w-full grid-cols-[28px_1fr_auto] items-center gap-3 py-3 text-left hover:bg-bg-hover/60">
              <span className="grid size-7 place-items-center text-text-muted">{done ? <CheckCircle2 className="size-5 text-primary-strong" /> : isNext ? <span className="size-2.5 rounded-full bg-primary" /> : <Circle className="size-4" />}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-text-muted">{item.moduleTitle} · {itemLabel(item.kind)}</span></span>
              <span className="text-xs font-medium text-text-muted">{done ? (uk ? "Виконано" : "Done") : isNext ? (uk ? "Далі" : "Next") : `${index + 1}`}</span>
            </button>
          </li>;
        })}
      </ol>
    </section>
  </main>;
};
