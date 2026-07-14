import React from "react";
import { ArrowRight, BookOpen, Check, Clock3, Compass, Play, Sparkles, Target } from "lucide-react";
import { getDailyChallenge, getMySkillTree, type DailyChallenge, type SkillNode, type SkillTree } from "../../lib/api/learning";

type PlanItem = Pick<SkillNode, "id" | "title" | "order" | "status" | "masteryPct" | "isNext">;

const statusText = (item: PlanItem) => {
  if (item.status === "mastered") return "Завершено";
  if (item.isNext) return "Наступний крок";
  if (item.status === "locked") return "Відкриється після попередніх тем";
  return `${item.masteryPct}% освоєно`;
};

export const LearningPlanPage: React.FC = () => {
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
    <div className="min-h-full bg-[#f5f7f4] px-4 py-7 text-[#17231b] dark:bg-[#09100c] dark:text-[#edf4ef] sm:px-6 lg:px-10 lg:py-10">
      <main className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] border border-[#152219]/10 bg-[#17311f] p-7 text-white shadow-[0_28px_62px_-42px_rgba(0,0,0,.9)] dark:border-white/10 sm:p-9">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-[#00ff88]/12 blur-3xl" />
          <div className="absolute -bottom-24 left-1/4 size-72 rounded-full bg-[#ff8c00]/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#83efb6]">
                <Compass className="size-4" />
                Навчальний план
              </span>
              <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.06em] sm:text-6xl">
                Маршрут без туману.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[#c1d0c4] sm:text-lg">
                Тут видно, що вже закрито, що варто повторити й який крок відкривати далі. Без “порожнього плану” і загадкових системних статусів.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => window.location.assign("/?app=tasks")} className="inline-flex items-center gap-2 rounded-2xl bg-[#00e47b] px-5 py-3 text-sm font-semibold text-[#07150d] transition hover:-translate-y-0.5 hover:bg-[#25ff97]">
                  <Play className="size-4 fill-current" />
                  Відкрити практику
                </button>
                <button type="button" onClick={() => window.location.assign("/library")} className="inline-flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[.07] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[.12]">
                  <BookOpen className="size-4" />
                  Знайти задачу
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/[.08] p-5 backdrop-blur">
              <div className="flex items-center justify-between text-sm text-[#c4d2c7]">
                <span>Прогрес маршруту</span>
                <strong className="text-white">{items.length ? `${completed}/${items.length}` : "—"}</strong>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#00e47b] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <div className="mt-5 flex gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#00ff88]/12 text-[#83efb6]">
                  <Sparkles className="size-5" />
                </span>
                <div>
                  <strong>{current?.title ?? "Почни з першої практики"}</strong>
                  <p className="mt-1 text-sm leading-5 text-[#c1d0c4]">
                    {current ? statusText(current) : "Після першої перевіреної роботи тут зʼявиться персональний маршрут."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <div className="h-96 animate-pulse rounded-[28px] bg-[#e6ece7] dark:bg-white/[.045]" />
            <div className="h-64 animate-pulse rounded-[28px] bg-[#e6ece7] dark:bg-white/[.045]" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
            <section className="rounded-[28px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15] sm:p-6">
              <div className="text-xs font-semibold uppercase tracking-[.16em] text-[#147b47] dark:text-[#71edaf]">Послідовність</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">Твій маршрут</h2>
              <div className="mt-5 space-y-3">
                {items.length ? (
                  items.map((item) => (
                    <article key={item.id} className={`flex gap-4 rounded-3xl border p-4 transition ${item.status === "mastered" ? "border-[#00c96d]/20 bg-[#eff9f1] dark:bg-[#00ff88]/[.06]" : item.isNext ? "border-[#00c96d]/35 bg-[#f9fcf9] dark:border-[#00ff88]/25 dark:bg-white/[.035]" : "border-[#152219]/8 bg-[#f5f8f5] dark:border-white/[.08] dark:bg-white/[.04]"}`}>
                      <span className={`grid size-10 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${item.status === "mastered" ? "bg-[#00c96d] text-[#062112]" : "bg-[#e2f5e8] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]"}`}>
                        {item.status === "mastered" ? <Check className="size-4" /> : String(item.order).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold">{item.title}</h3>
                          {item.isNext ? <span className="rounded-full bg-[#00c96d] px-2.5 py-1 text-[11px] font-semibold text-[#062112]">далі</span> : null}
                        </div>
                        <p className="mt-1 text-sm text-[#718075] dark:text-[#a2b1a6]">{statusText(item)}</p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-[24px] border border-dashed border-[#152219]/15 bg-[#f8faf7] p-8 text-center dark:border-white/10 dark:bg-white/[.03]">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#e8f7ed] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#71edaf]">
                      <Compass className="size-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold">Маршрут ще не зібраний</h3>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718075] dark:text-[#a2b1a6]">
                      Система побудує його після перших перевірених робіт. А поки можеш стартувати з практики або бібліотеки.
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <section className="rounded-[28px] border border-[#ff8c00]/20 bg-[#fff7e9] p-6 dark:bg-[#ff8c00]/[.07]">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#c56b00] dark:text-[#ffb65c]">
                  <Clock3 className="size-4" />
                  На сьогодні
                </span>
                <h2 className="mt-4 text-2xl font-semibold tracking-[-.04em]">
                  {challenge?.available && challenge.task ? challenge.task.title : "Коротка практика для старту"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#7a6d54] dark:text-[#c7b58f]">
                  {challenge?.available ? "Невелике завдання, щоб підтримати темп без перевантаження." : "Якщо денний виклик ще не готовий, відкрий практику — маршрут оновиться після результату."}
                </p>
                <button type="button" onClick={() => window.location.assign("/?app=tasks")} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#b66200] dark:text-[#ffb65c]">
                  Перейти до практики <ArrowRight className="size-4" />
                </button>
              </section>

              <section className="rounded-[28px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15]">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#147b47] dark:text-[#71edaf]">
                  <Target className="size-4" />
                  Темп
                </span>
                <div className="mt-4 text-4xl font-semibold tracking-[-.06em]">{progress}%</div>
                <p className="mt-1 text-sm text-[#718075] dark:text-[#a2b1a6]">закрито в поточному маршруті</p>
              </section>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
};
