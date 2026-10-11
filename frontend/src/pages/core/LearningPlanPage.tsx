import React from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, BookOpen, Check, Clock3, Compass, Play, Sparkles, Target } from "lucide-react";
import { getDailyChallenge, getMySkillTree, type DailyChallenge, type SkillNode, type SkillTree } from "../../lib/api/learning";

type PlanItem = Pick<SkillNode, "id" | "title" | "order" | "status" | "masteryPct" | "isNext">;

const statusText = (item: PlanItem, en: boolean) => {
  if (item.status === "mastered") return en ? "Completed" : "Завершено";
  if (item.isNext) return en ? "Next step" : "Наступний крок";
  if (item.status === "locked") return en ? "Unlocks after previous topics" : "Відкриється після попередніх тем";
  return en ? `${item.masteryPct}% mastered` : `${item.masteryPct}% освоєно`;
};

export const LearningPlanPage: React.FC = () => {
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en") ?? false;
  const [tree, setTree] = React.useState<SkillTree | null>(null);
  const [challenge, setChallenge] = React.useState<DailyChallenge | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let active = true;
    void Promise.allSettled([getMySkillTree(), getDailyChallenge()]).then(([treeResult, challengeResult]) => {
      if (!active) return;
      if (treeResult.status === "fulfilled") setTree(treeResult.value);
      if (challengeResult.status === "fulfilled") setChallenge(challengeResult.value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const items: PlanItem[] = React.useMemo(() => (tree?.nodes ?? []).slice().sort((a, b) => a.order - b.order).slice(0, 8), [tree]);
  const completed = items.filter((item) => item.status === "mastered").length;
  const current = items.find((item) => item.isNext || item.status === "in_progress") ?? items.find((item) => item.status !== "mastered") ?? null;
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="min-h-full bg-bg-base px-4 py-7 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-10">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-border/10 bg-bg-surface p-7 text-text-primary shadow-[0_28px_62px_-42px_rgba(0,0,0,.9)] dark:border-white/10 sm:p-9">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 size-72 rounded-full bg-accent-warn/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong">
                <Compass className="size-4" />
                {en ? "Learning plan" : "Навчальний план"}
              </span>
              <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-6xl">
                {en ? "A clear path forward." : "Маршрут без туману."}
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-text-secondary sm:text-lg">
                {en
                  ? "See what you have completed, what to review, and which step to take next. No empty plans or mysterious system statuses."
                  : "Тут видно, що вже закрито, що варто повторити й який крок відкривати далі. Без “порожнього плану” і загадкових системних статусів."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => window.location.assign("/?app=tasks")} className="inline-flex items-center gap-2 rounded-2xl bg-[var(--surface-primary)] px-5 py-3 text-sm font-semibold text-text-primary transition hover:-translate-y-0.5 hover:bg-[var(--surface-primary)]">
                  <Play className="size-4 fill-current" />
                  {en ? "Open practice" : "Відкрити практику"}
                </button>
                <button type="button" onClick={() => window.location.assign("/library")} className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[.07] px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-white/[.12]">
                  <BookOpen className="size-4" />
                  {en ? "Find a task" : "Знайти задачу"}
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/[.08] p-5 backdrop-blur">
              <div className="flex items-center justify-between text-sm text-text-primary">
                <span>{en ? "Path progress" : "Прогрес маршруту"}</span>
                <strong className="text-text-primary">{items.length ? `${completed}/${items.length}` : "—"}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[var(--surface-primary)] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-5 flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/12 text-primary-strong">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <strong>{current?.title ?? (en ? "Start with your first practice task" : "Почни з першої практики")}</strong>
                  <p className="mt-1 text-sm leading-5 text-text-secondary">
                    {current ? statusText(current, en) : en ? "Your personal path will appear here after your first reviewed task." : "Після першої перевіреної роботи тут зʼявиться персональний маршрут."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <div className="h-96 animate-pulse rounded-[28px] bg-bg-hover dark:bg-white/[.045]" />
            <div className="h-64 animate-pulse rounded-[28px] bg-bg-hover dark:bg-white/[.045]" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <section className="rounded-[28px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{en ? "Sequence" : "Послідовність"}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{en ? "Your path" : "Твій маршрут"}</h2>
              <div className="mt-5 space-y-3">
                {items.length ? (
                  items.map((item) => (
                    <article key={item.id} className={`flex gap-4 rounded-3xl border p-4 transition ${item.status === "mastered" ? "border-primary/20 bg-bg-hover dark:bg-primary/[.06]" : item.isNext ? "border-primary/35 bg-bg-hover dark:border-primary/25 dark:bg-white/[.035]" : "border-border/8 bg-bg-hover dark:border-white/[.08] dark:bg-white/[.04]"}`}>
                      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${item.status === "mastered" ? "bg-primary text-primary-foreground" : "bg-[var(--surface-primary)] text-primary-strong dark:bg-primary/10 dark:text-primary-soft"}`}>
                        {item.status === "mastered" ? <Check className="size-4" /> : String(item.order).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold">{item.title}</h3>
                          {item.isNext ? <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground">{en ? "NEXT" : "далі"}</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-text-muted dark:text-text-secondary">{statusText(item, en)}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-border/15 bg-bg-surface p-8 text-center dark:border-white/10 dark:bg-white/[.03]">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft">
                      <Compass className="size-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold">{en ? "Your path is not ready yet" : "Маршрут ще не зібраний"}</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-muted dark:text-text-secondary">
                      {en ? "Your path will take shape after your first reviewed tasks. For now, start with practice or browse the library." : "Система побудує його після перших перевірених робіт. А поки можеш стартувати з практики або бібліотеки."}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-[28px] border border-accent-warn/20 bg-bg-hover p-6 dark:bg-accent-warn/[.07]">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-accent-warn dark:text-accent-warn">
                  <Clock3 className="size-4" />
                  {en ? "For today" : "На сьогодні"}
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-.04em]">
                  {challenge?.available && challenge.task ? challenge.task.title : en ? "A quick practice task to get started" : "Коротка практика для старту"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-accent-warn dark:text-accent-warn">
                  {challenge?.available
                    ? en ? "A short task to keep up your pace without overloading your day." : "Невелике завдання, щоб підтримати темп без перевантаження."
                    : en ? "If today's challenge is not ready yet, open practice. Your path will update when you get a result." : "Якщо денний виклик ще не готовий, відкрий практику — маршрут оновиться після результату."}
                </p>
                <button type="button" onClick={() => window.location.assign("/?app=tasks")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-warn dark:text-accent-warn">
                  {en ? "Go to practice" : "Перейти до практики"} <ArrowRight className="size-4" />
                </button>
              </section>

              <section className="rounded-[28px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft">
                  <Target className="size-4" />
                  {en ? "Pace" : "Темп"}
                </span>
                <div className="mt-4 text-4xl font-semibold tracking-[-.06em]">{progress}%</div>
                <p className="mt-1 text-sm text-text-muted dark:text-text-secondary">{en ? "completed on your current path" : "закрито в поточному маршруті"}</p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};
