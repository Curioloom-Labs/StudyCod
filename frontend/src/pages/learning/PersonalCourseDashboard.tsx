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
  return <main className="mx-auto w-full max-w-[1320px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
    {contentState === "refreshing" ? <div className="mb-4 text-sm text-text-secondary" role="status" aria-live="polite">{uk ? "Оновлюємо дані…" : "Refreshing your data…"}</div> : null}
    {error ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent-warn/40 bg-surface-warning px-4 py-3 text-sm" role="status">
      <span className="text-text-secondary">{uk ? "Не вдалося оновити дані. Показано останню завантажену версію." : "Could not refresh. Showing the last loaded version."}</span>
      <button type="button" onClick={() => void refresh()} className="min-h-11 rounded-lg px-3 font-semibold text-primary-strong transition-colors duration-150 hover:bg-bg-hover motion-reduce:transition-none">{uk ? "Повторити" : "Retry"}</button>
    </div> : null}

    <header className="flex flex-col justify-between gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-xs font-semibold text-primary-strong"><BookOpen className="size-4" aria-hidden="true" />{uk ? "Мій курс" : "My course"}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-[-.035em] sm:text-[1.75rem]">{currentCourse.title}</h1>
        {currentCourse.description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-text-secondary">{currentCourse.description}</p> : null}
      </div>
      <button type="button" onClick={() => navigate(withDevPreview("/learning/catalog"))} className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start rounded-lg px-2 text-sm font-semibold text-text-secondary transition-colors duration-150 hover:bg-bg-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none sm:self-auto">{uk ? "Інші курси" : "Other courses"}<ArrowRight className="size-4" aria-hidden="true" /></button>
    </header>

    <section className="mt-4" aria-labelledby="next-step-heading">
      <div className="relative overflow-hidden border-b border-border bg-surface-primary py-4 pl-4 sm:py-5 sm:pl-5">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden="true" />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-primary-strong">
          <span>{uk ? "НАСТУПНИЙ КРОК" : "NEXT STEP"}</span>{nextItem ? <><span aria-hidden="true">·</span><span>{itemLabel(nextItem.kind)}</span><span aria-hidden="true">·</span><span className="text-text-secondary">{nextItem.moduleTitle}</span></> : null}
        </div>
        <h2 id="next-step-heading" className="mt-2 max-w-3xl text-xl font-bold leading-tight tracking-[-.03em] text-balance sm:text-2xl">{next?.title || (uk ? "Маршрут завершено" : "Path complete")}</h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-5 text-text-secondary">{next ? (uk ? "Відкрий заняття й продовжуй із цього кроку." : "Open the lesson and continue from this step.") : (uk ? "Переглянь виконані заняття або обери наступний курс." : "Review completed lessons or choose another course.")}</p>
        <button type="button" onClick={() => navigate(withDevPreview(nextUrl))} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none">
          <Play className="size-4 fill-current" aria-hidden="true" />{next ? (uk ? "Продовжити навчання" : "Continue learning") : (uk ? "Переглянути маршрут" : "Review course path")}<ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
    </section>

    <section className="mt-5" aria-labelledby="course-path-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div><p className="text-xs font-semibold text-text-muted">{currentCourse.modules.length} {uk ? "модулів" : "modules"}</p><h2 id="course-path-heading" className="mt-1 text-xl font-bold tracking-[-.025em]">{uk ? "Маршрут курсу" : "Course path"}</h2></div>
        <button type="button" onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/path`))} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-primary-strong transition-colors duration-150 hover:bg-bg-hover motion-reduce:transition-none">{uk ? "Усі теми" : "All topics"}<ArrowRight className="size-4" aria-hidden="true" /></button>
      </div>

      <div className="mt-3 space-y-3">
        {previewModules.map((module) => <section key={module.id} className="overflow-hidden rounded-xl border border-border bg-bg-surface" aria-label={module.title}>
          <div className="flex items-center justify-between gap-3 border-b border-border/80 bg-bg-hover/60 px-4 py-2.5 sm:px-5">
            <h3 className="min-w-0 truncate text-sm font-bold text-text-primary">{module.title}</h3>
            <span className="shrink-0 text-xs font-medium text-text-muted">{module.items.length < module.totalItems ? (uk ? `${module.items.length} із ${module.totalItems} елементів` : `${module.items.length} of ${module.totalItems} items`) : (uk ? `Елементів: ${module.totalItems}` : `${module.totalItems} items`)}</span>
          </div>
          <ol>
            {module.items.map((item) => {
              const isNext = item.id === next?.itemId;
              const done = item.progress.status === "COMPLETED";
              return <li key={item.id} className="border-b border-border/70 last:border-0">
                <button type="button" aria-current={isNext ? "step" : undefined} onClick={() => navigate(withDevPreview(`/learning/course/${currentCourse.id}/${item.kind === "CODE_TASK" ? `practice/${item.id}` : "path"}`))} className={`group grid min-h-14 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-l-[3px] px-4 py-2 text-left transition-colors duration-150 hover:bg-bg-hover/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none sm:px-5 ${isNext ? "border-l-primary bg-primary/10" : "border-l-transparent"}`}>
                  <span className="grid size-8 place-items-center rounded-lg bg-bg-hover text-text-muted group-hover:text-text-primary">{done ? <CheckCircle2 className="size-5 text-primary-strong" aria-hidden="true" /> : isNext ? <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}</span>
                  <span className="min-w-0"><span className={`block truncate text-sm font-semibold ${isNext ? "text-text-primary" : "text-text-secondary"}`}>{item.title}</span><span className="mt-1 block truncate text-xs text-text-muted">{itemLabel(item.kind)}</span></span>
                  <span className={`text-xs font-semibold ${isNext ? "text-primary-strong" : "text-text-muted"}`}>{done ? (uk ? "Виконано" : "Done") : isNext ? (uk ? "Далі" : "Next") : null}</span>
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
