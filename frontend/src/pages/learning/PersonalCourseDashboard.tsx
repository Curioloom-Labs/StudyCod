import React from "react";
import { ArrowRight, BarChart3, BookOpen, CheckCircle2, Compass, Layers3, Play, Rocket, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePersonalLearning } from "../../components/learning/PersonalLearningProvider";

export const PersonalCourseDashboard: React.FC = () => {
  const { currentCourse, loading } = usePersonalLearning();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const uk = !i18n.language?.startsWith("en");
  if (loading) return <div className="mx-auto max-w-6xl px-4 py-16 text-sm text-[#718078]">{uk ? "Завантажуємо навчальний простір…" : "Loading your learning space…"}</div>;
  if (!currentCourse) return <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-10"><div className="rounded-[28px] border border-[#00c875]/25 bg-[#0d2519] p-8 text-white sm:p-12"><div className="flex size-12 items-center justify-center rounded-2xl bg-[#00d782]/15 text-[#53eea5]"><Compass /></div><p className="mt-6 text-xs font-bold uppercase tracking-[.2em] text-[#53eea5]">{uk ? "Твій навчальний простір" : "Your learning space"}</p><h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">{uk ? "Обери перший курс і почни свій маршрут." : "Choose your first course and start your path."}</h1><p className="mt-4 max-w-xl text-base leading-7 text-[#b7d1c0]">{uk ? "Курс об’єднає теорію, практику та прогрес в одному послідовному потоці." : "A course brings theory, practice, and progress into one continuous flow."}</p><button type="button" onClick={() => navigate("/learning/catalog")} className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#eff7f1] px-5 py-3 font-bold text-[#122219]">{uk ? "Відкрити каталог" : "Browse courses"}<ArrowRight className="size-4" /></button></div></section>;
  const next = currentCourse.nextAction;
  const nextIsPractice = next?.kind === "CODE_TASK";
  const allItems = currentCourse.modules.flatMap((module) => module.items.map((item) => ({ ...item, moduleTitle: module.title })));
  const items = allItems.slice(0, 6);
  const scoredItems = allItems.filter((item) => item.progress.score != null && Number.isFinite(Number(item.progress.score)));
  const averageScore = scoredItems.length
    ? Math.round(scoredItems.reduce((total, item) => total + Number(item.progress.score ?? 0), 0) / scoredItems.length)
    : 0;
  const projectCount = allItems.filter((item) => item.kind === "MANUAL" && Boolean((item.content as { project?: unknown }).project)).length;
  const completedCount = allItems.filter((item) => item.progress.status === "COMPLETED").length;
  const coursePercent = Math.round(currentCourse.enrollment.completionPercent);
  const itemLabel = (item: (typeof items)[number]) => item.kind === "CODE_TASK"
    ? (uk ? "Практика" : "Practice")
    : item.kind === "THEORY"
      ? (uk ? "Теорія" : "Theory")
      : item.kind === "MANUAL"
        ? (uk ? "Мініпроєкт" : "Mini-project")
        : (uk ? "Етап курсу" : "Course step");
  return <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
    <section className="rounded-[28px] border border-[#00c875]/25 bg-[#0d2519] p-7 text-white shadow-[0_24px_70px_-42px_rgba(0,200,117,.7)] sm:p-10">
      <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.2em] text-[#53eea5]"><Sparkles className="size-4" />{uk ? "Поточний курс" : "Current course"}</p><h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{currentCourse.title}</h1><p className="mt-3 max-w-2xl text-base leading-7 text-[#b7d1c0]">{currentCourse.description || (uk ? "Послідовний маршрут із теорії та практики." : "A focused path through theory and practice.")}</p></div><div className="min-w-[220px] rounded-2xl border border-white/10 bg-black/10 p-4"><div className="flex items-center justify-between text-sm font-semibold"><span>{uk ? "Загальний прогрес" : "Overall progress"}</span><span>{Math.round(currentCourse.enrollment.completionPercent)}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00d782]" style={{ width: `${currentCourse.enrollment.completionPercent}%` }} /></div><p className="mt-3 text-xs text-[#9eb9a8]">{currentCourse.modules.length} {uk ? "модулів у маршруті" : "modules in your path"}</p></div></div>
      <div className="mt-9 flex flex-wrap gap-3"><button type="button" onClick={() => next ? navigate(nextIsPractice ? `/learning/course/${currentCourse.id}/practice/${next.itemId}` : `/learning/course/${currentCourse.id}/path`) : navigate(`/learning/course/${currentCourse.id}/path`)} className="inline-flex items-center gap-2 rounded-xl bg-[#eff7f1] px-5 py-3 font-bold text-[#122219]"><Play className="size-4 fill-current" />{next ? (uk ? "Продовжити навчання" : "Continue learning") : (uk ? "Переглянути маршрут" : "View path")}<ArrowRight className="size-4" /></button><button type="button" onClick={() => navigate(`/learning/course/${currentCourse.id}/path`)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold text-[#e1f1e6]">{uk ? "Відкрити маршрут" : "Open path"}</button></div>
    </section>
      <section className="mt-7 grid gap-6 lg:grid-cols-[1.18fr_.82fr]">
        <section className="relative overflow-hidden rounded-[28px] border border-[#173323]/12 bg-[#102218] p-6 text-white sm:p-7">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full border border-[#5ee9a5]/15" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 left-1/3 size-56 rounded-full bg-[#00d782]/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#63e9a7]"><Rocket className="size-4" />{uk ? "Наступна зупинка" : "Next stop"}</p>
                <h2 className="mt-3 max-w-xl text-2xl font-bold tracking-[-.04em] sm:text-3xl">{next?.title || (uk ? "Маршрут завершено" : "Path completed")}</h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#b8cdbd]">{next ? (uk ? "Теорія, практика та оцінка вже зібрані в одному послідовному кроці." : "Theory, practice, and assessment are connected in one sequential step.") : (uk ? "Переглянь результати й обери, що хочеш закріпити далі." : "Review your results and choose what to reinforce next.")}</p>
              </div>
              <span className="hidden size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[.06] text-[#70edaf] sm:grid"><BookOpen className="size-5" /></span>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => next ? navigate(nextIsPractice ? `/learning/course/${currentCourse.id}/practice/${next.itemId}` : `/learning/course/${currentCourse.id}/path`) : navigate(`/learning/course/${currentCourse.id}/path`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e8f7ed] px-4 text-sm font-bold text-[#102218] transition hover:bg-white"><Play className="size-4 fill-current" />{next ? (uk ? "Продовжити" : "Continue") : (uk ? "Відкрити маршрут" : "Open path")}<ArrowRight className="size-4" /></button>
              <button type="button" onClick={() => navigate(`/learning/course/${currentCourse.id}/path`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-semibold text-[#e1f1e6] transition hover:bg-white/[.08]">{uk ? "Увесь маршрут" : "Full path"}</button>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-[#152219]/10 bg-[#f3f7f3] p-6 dark:border-white/[.08] dark:bg-[#101a13] sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.18em] text-[#00a961]"><BarChart3 className="size-4" />{uk ? "Контроль навчання" : "Learning control"}</p><h2 className="mt-3 text-2xl font-bold tracking-[-.04em]">{uk ? "Результат, а не просто галочки" : "Results, not just checkmarks"}</h2></div><span className="grid size-10 place-items-center rounded-2xl bg-[#00d782]/10 text-[#00a961] dark:text-[#70edaf]"><Layers3 className="size-5" /></span></div>
          <p className="mt-3 text-sm leading-6 text-[#65756a] dark:text-[#aab9ae]">{uk ? "Прогрес курсу рахується з оцінок практики та виконаних елементів, а не лише зі статусу готовності." : "Course progress uses practice scores and completed items, not only a ready/not-ready status."}</p>
          <div className="mt-6 grid grid-cols-3 divide-x divide-[#152219]/10 dark:divide-white/10">
            <div className="pr-3"><p className="text-2xl font-bold tracking-[-.06em]">{coursePercent}%</p><p className="mt-1 text-[11px] text-[#718078] dark:text-[#91a096]">{uk ? "курс" : "course"}</p></div>
            <div className="px-3"><p className="text-2xl font-bold tracking-[-.06em]">{averageScore || "—"}</p><p className="mt-1 text-[11px] text-[#718078] dark:text-[#91a096]">{uk ? "середній бал" : "average score"}</p></div>
            <div className="pl-3"><p className="text-2xl font-bold tracking-[-.06em]">{projectCount}</p><p className="mt-1 text-[11px] text-[#718078] dark:text-[#91a096]">{uk ? "мініпроєктів" : "mini-projects"}</p></div>
          </div>
          <button type="button" onClick={() => navigate(`/learning/course/${currentCourse.id}/progress`)} className="mt-6 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[#009f5b] dark:text-[#70edaf]">{uk ? `Відкрити детальну статистику · ${completedCount}/${allItems.length}` : `Open detailed stats · ${completedCount}/${allItems.length}`}<ArrowRight className="size-4" /></button>
        </section>
      </section>

      <section className="mt-7 rounded-[28px] border border-[#152219]/10 bg-white p-6 dark:border-white/[.09] dark:bg-[#111a14] sm:p-7">
        <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#00a961] dark:text-[#70edaf]">{uk ? "Орієнтири маршруту" : "Path markers"}</p><h2 className="mt-2 text-2xl font-bold tracking-[-.04em]">{uk ? "Що буде далі" : "What comes next"}</h2></div><span className="text-xs font-semibold text-[#718078] dark:text-[#91a096]">{items.length} {uk ? "найближчих елементів" : "nearby items"}</span></div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.id} type="button" onClick={() => navigate(`/learning/course/${currentCourse.id}/${item.kind === "CODE_TASK" ? `practice/${item.id}` : "path"}`)} className="group flex min-h-[96px] items-center gap-4 rounded-2xl border border-[#152219]/8 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#00c875]/40 hover:bg-[#f5faf6] dark:border-white/[.08] dark:hover:bg-white/[.03]"><span className={`grid size-10 shrink-0 place-items-center rounded-xl ${item.progress.status === "COMPLETED" ? "bg-[#dff8e8] text-[#00a85f] dark:bg-[#00d782]/10" : "bg-[#eef3ef] text-[#6f7f74] dark:bg-white/[.06]"}`}>{item.progress.status === "COMPLETED" ? <CheckCircle2 className="size-4" /> : item.kind === "MANUAL" ? <Rocket className="size-4" /> : <span className="text-xs font-bold">{item.order}</span>}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-[#75847a]">{itemLabel(item)} · {item.moduleTitle}</span></span><ArrowRight className="size-4 shrink-0 text-[#829087] transition group-hover:translate-x-0.5" /></button>)}</div>
      </section>
  </main>;
};
