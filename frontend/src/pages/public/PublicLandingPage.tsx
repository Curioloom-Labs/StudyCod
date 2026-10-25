import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import "../../i18n";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  CirclePlay,
  Code2,
  FlaskConical,
  GraduationCap,
  Lightbulb,
  Play,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "../../components/Logo";
import { BrandLockup } from "../../components/BrandLockup";
import { PublicProductNav } from "../../components/layout/PublicProductNav";
import { withDevPreview } from "../../lib/devPreview";
import { LEARNING_BOUNDARY_DEMO } from "../../lib/learningDemo";

type Translate = (uk: string, en: string) => string;

const easing = [0.16, 1, 0.3, 1] as const;
const card = "rounded-2xl border border-border/70 bg-bg-surface shadow-[var(--ui-card-shadow)]";
const iconTile = "grid size-11 place-items-center rounded-xl bg-primary/10 text-primary-strong";
const codeColors = {
  keyword: "text-accent-error",
  function: "text-accent-warn",
  method: "text-primary-strong",
  type: "text-accent-warn",
};

const GreenButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", children, ...props }) => (
  <button type="button"
    className={`inline-flex h-[52px] items-center justify-center gap-2.5 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-sm transition-fast hover:-translate-y-0.5 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
    {...props}
  >
    {children}
  </button>
);

/* Legacy landing previews superseded by the current product preview.
const RotatingTypedHeadline: React.FC<{ tr: Translate }> = ({ tr }) => {
  const phrases = React.useMemo(() => [
    tr("Програмування стає зрозумілим, коли практика має систему.", "Programming clicks when practice has a system."),
    tr("Код легше вчити, коли кожна помилка веде до наступного кроку.", "Code is easier to learn when each mistake points to the next step."),
    tr("Теорія працює краще, коли одразу переходить у дію.", "Theory works better when it immediately turns into action."),
    tr("Навчання тримається не на шумі, а на послідовності.", "Learning sticks through sequence, not noise."),
  ], [tr]);
  const [phraseIndex, setPhraseIndex] = React.useState(0);
  const [visibleChars, setVisibleChars] = React.useState(0);
  const reduceMotion = useReducedMotion();
  const currentPhrase = phrases[phraseIndex] ?? phrases[0];

  React.useEffect(() => {
    if (reduceMotion) {
      setVisibleChars(currentPhrase.length);
      return;
    }
    setVisibleChars(0);
    let frame = 0;
    const timer = window.setInterval(() => {
      frame += 1;
      setVisibleChars((previous) => {
        if (previous >= currentPhrase.length) return previous;
        return Math.min(currentPhrase.length, previous + (frame % 3 === 0 ? 2 : 1));
      });
    }, 38);
    return () => window.clearInterval(timer);
  }, [currentPhrase, reduceMotion]);

  React.useEffect(() => {
    if (reduceMotion) return;
    if (visibleChars < currentPhrase.length) return;
    const timer = window.setTimeout(() => {
      setPhraseIndex((previous) => (previous + 1) % phrases.length);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [currentPhrase.length, phrases.length, reduceMotion, visibleChars]);

  return (
    <span>
      {currentPhrase.slice(0, visibleChars)}
      {!reduceMotion ? <span className="ml-1 inline-block w-[0.08em] animate-pulse rounded-full bg-current align-[-0.05em]">&nbsp;</span> : null}
    </span>
  );
};

const LegacyDashboardPreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className="relative overflow-hidden rounded-[26px] border border-border/15 bg-white text-left shadow-[0_48px_110px_rgba(21,40,27,0.15),0_9px_28px_rgba(21,40,27,0.07)]">
    <div className="grid h-[60px] grid-cols-[1fr_1.25fr_1fr] items-center border-b border-border/10 bg-bg-hover px-5 max-md:grid-cols-[1fr_auto]">
      <div className="flex items-center gap-2.5 text-[13px] font-bold tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg brand-logo-surface"><Logo size={18} /></span>
        StudyCod
      </div>
      <div className="flex h-8 items-center justify-between rounded-[10px] border border-border/10 bg-bg-base px-3 text-[10px] text-text-muted max-md:hidden">
        {tr("Пошук у навчанні", "Search your learning")}
        <span className="rounded-md border border-border/10 px-1.5 py-0.5 text-[9px]">⌘ K</span>
      </div>
      <span className="ml-auto grid size-8 place-items-center rounded-full bg-accent-warn text-[10px] font-bold text-accent-warn">MK</span>
    </div>

    <div className="grid min-h-[610px] grid-cols-[174px_1fr] max-md:block max-md:min-h-0">
      <aside className="flex flex-col gap-1.5 border-r border-border/10 bg-bg-base p-3.5 max-md:hidden">
        {[
          [LayoutDashboard, tr("Огляд", "Overview")],
          [BookOpen, tr("Курси", "Courses")],
          [Code2, tr("Практика", "Practice")],
          [BarChart3, tr("Прогрес", "Progress")],
        ].map(([Icon, label], index) => {
          const NavIcon = Icon as typeof LayoutDashboard;
          return <div key={String(label)} className={`flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[11px] font-semibold ${index === 0 ? "bg-primary/10 text-primary-strong" : "text-text-muted"}`}><NavIcon className="size-3.5" />{String(label)}</div>;
        })}
        <div className="mt-auto flex items-center gap-2.5 border-t border-border/10 px-1.5 pt-3">
          <span className="grid size-8 place-items-center rounded-full bg-accent-warn text-[10px] font-bold text-accent-warn">O</span>
          <div className="flex flex-col"><strong className="text-[10px]">Олена</strong><span className="text-[9px] text-text-muted">{tr("Викладач", "Teacher")}</span></div>
        </div>
      </aside>

      <div className="min-w-0 bg-bg-base p-7 max-md:p-4">
        <div className="mb-5 flex items-end justify-between">
          <div><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-text-muted">{tr("Вівторок, 10 липня", "Tuesday, July 10")}</span><div className="mt-1.5 text-xl font-bold tracking-[-0.03em] max-md:text-base">{tr("Продовжуй у своєму темпі", "Keep learning at your pace")}</div></div>
          <span className="flex h-8 items-center gap-1.5 rounded-[10px] border border-accent-warn/20 bg-accent-warn/10 px-3 text-[10px] font-bold text-accent-warn"><Flame className="size-3 fill-current" />12 {tr("днів", "days")}</span>
        </div>

        <div className="grid min-h-[150px] grid-cols-[138px_1fr_auto] items-center gap-5 rounded-[19px] border border-border/10 bg-white p-3.5 shadow-[0_13px_35px_rgba(18,32,23,0.05)] max-md:grid-cols-[92px_1fr] max-md:gap-3">
          <div className="relative grid h-[120px] place-items-center overflow-hidden rounded-[15px] bg-[radial-gradient(circle_at_25%_15%,color-mix(in_srgb,var(--primary)_24%,transparent),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(255,140,0,.18),transparent_40%),linear-gradient(145deg,#082218,#173b2b)] max-md:h-[94px]">
            <i className="absolute h-10 w-[108px] rotate-[28deg] rounded-[50%] border border-primary/30" />
            <i className="absolute h-10 w-[108px] -rotate-[28deg] rounded-[50%] border border-accent-warn/25" />
            <span className="relative z-10 grid size-12 -rotate-6 place-items-center rounded-2xl border border-white/15 bg-white/10 text-primary-soft backdrop-blur"><FileCode2 className="size-6" /></span>
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-primary-strong">Python · {tr("Основи", "Foundations")}</span>
            <div className="mt-2 text-base font-bold max-md:text-[13px]">{tr("Функції та чистий код", "Functions and clean code")}</div>
            <p className="mt-1 text-[10px] text-text-muted">{tr("Урок 8 із 12", "Lesson 8 of 12")} · 24 {tr("хв", "min")}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-bg-hover"><span className="block h-full w-[68%] rounded-full bg-primary" /></div>
          </div>
          <button type="button" className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground max-md:hidden" aria-label={tr("Продовжити урок", "Continue lesson")}><Play className="size-4 fill-current" /></button>
        </div>

        <div className="mt-4 grid grid-cols-[1.45fr_.72fr] gap-4 max-md:grid-cols-1">
          <div className="overflow-hidden rounded-[18px] border border-border/10 bg-white shadow-sm">
            <div className="flex h-12 items-center justify-between border-b border-border/10 px-4 text-[10px] font-bold"><span className="flex items-center gap-2"><Code2 className="size-3.5 text-primary-strong" />{tr("Задача дня", "Daily challenge")}</span><span className="rounded-md bg-accent-warn/20 px-2 py-1 text-[8px] text-accent-warn">{tr("Середня", "Medium")}</span></div>
            <div className="flex h-[158px] bg-bg-code p-4 font-mono text-[9px] leading-[1.8] text-text-primary max-md:h-[140px] max-md:text-[8px]">
              <div className="pr-4 text-right text-text-muted">1<br />2<br />3<br />4<br />5</div>
              <pre className="m-0 whitespace-pre-wrap font-mono"><span className={codeColors.keyword}>def</span> <span className={codeColors.function}>unique_words</span>(text):{"\n"}  words = text.<span className={codeColors.method}>split</span>(){"\n"}  result = <span className={codeColors.type}>set</span>(words){"\n"}  <span className={codeColors.keyword}>return</span> len(result)</pre>
            </div>
            <div className="flex h-12 items-center justify-between px-3.5 text-[9px] text-text-muted"><span className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-primary-strong" />7 / 8 {tr("тестів", "tests")}</span><button type="button" className="flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[8px] font-bold text-primary-foreground">{tr("Запустити", "Run")}<ChevronRight className="size-3" /></button></div>
          </div>

          <div className="rounded-[18px] border border-border/10 bg-white pb-3 shadow-sm max-md:hidden">
            <div className="flex h-12 items-center px-4 text-[10px] font-bold"><Target className="mr-2 size-3.5 text-primary-strong" />{tr("Тижнева ціль", "Weekly goal")}</div>
            <div className="relative mx-auto grid size-[122px] place-items-center">
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90"><circle cx="60" cy="60" r="50" fill="none" stroke="#edf0eb" strokeWidth="8" /><circle cx="60" cy="60" r="50" fill="none" stroke="#00b963" strokeWidth="8" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="82" /></svg>
              <div className="flex flex-col items-center"><strong className="text-xl">74%</strong><span className="text-[8px] text-text-muted">{tr("виконано", "complete")}</span></div>
            </div>
            <div className="mx-4 mt-1 flex h-14 items-end gap-1.5">{[44,68,54,88,72,34,20].map((height, index) => <i key={index} style={{ height: `${height}%` }} className={`min-h-2 flex-1 rounded-t ${index === 3 ? "bg-accent-warn" : "bg-primary/25"}`} />)}</div>
            <div className="mx-4 mt-1 flex justify-between text-[7px] text-text-muted"><span>{tr("Пн", "Mon")}</span><span>{tr("Вт", "Tue")}</span><span>{tr("Ср", "Wed")}</span><span>{tr("Чт", "Thu")}</span><span>{tr("Пт", "Fri")}</span><span>{tr("Сб", "Sat")}</span><span>{tr("Нд", "Sun")}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const LegacyPracticePreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className={`${card} overflow-hidden`}>
    <div className="flex items-center justify-between px-8 pb-5 pt-7 max-md:px-5 max-md:pt-5">
      <div><span className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-primary-strong">{tr("Практика · Python", "Practice · Python")}</span><div className="mt-1.5 text-[21px] font-bold max-md:text-lg">{tr("Знайди найдовше слово", "Find the longest word")}</div></div>
      <span className="flex h-9 items-center gap-2 rounded-[10px] bg-bg-hover px-3 text-[10px] text-text-muted"><Clock3 className="size-3.5" />18:42</span>
    </div>
    <p className="max-w-[760px] px-8 pb-7 text-sm leading-6 text-text-muted max-md:px-5">{tr("Напиши функцію, що повертає найдовше слово у реченні. Якщо таких слів кілька — поверни перше.", "Write a function that returns the longest word in a sentence. If several match, return the first one.")}</p>
    <div className="grid min-h-[430px] grid-cols-[1.5fr_.72fr] border-t border-border/10 max-md:grid-cols-1">
      <div className="flex flex-col bg-bg-code text-text-primary">
        <div className="flex h-12 items-stretch gap-7 border-b border-white/10 px-5 text-[10px] text-text-muted"><span className="flex items-center border-b-2 border-primary text-text-primary">solution.py</span><span className="flex items-center">tests.py</span></div>
        <pre className="m-0 flex-1 p-9 font-mono text-xs leading-8 max-md:p-6 max-md:text-[10px]"><span className={codeColors.keyword}>def</span> <span className={codeColors.function}>longest_word</span>(sentence):{"\n"}    words = sentence.<span className={codeColors.method}>split</span>(){"\n"}    <span className={codeColors.keyword}>return</span> max(words, key=len)</pre>
        <div className="flex justify-end border-t border-white/10 p-4"><button type="button" className="flex h-9 items-center gap-2 rounded-[10px] bg-primary px-3.5 text-[10px] font-bold text-primary-foreground"><Play className="size-3 fill-current" />{tr("Перевірити рішення", "Check solution")}</button></div>
      </div>
      <div className="bg-bg-base p-6">
        <div className="flex justify-between border-b border-border/10 pb-5 text-xs"><span>{tr("Результати", "Results")}</span><strong className="text-primary-strong">4 / 4</strong></div>
        {[tr("Базовий приклад", "Basic example"), tr("Порожні значення", "Empty values"), tr("Кілька однакових", "Multiple matches"), tr("Великий текст", "Large text")].map((label) => <div key={label} className="flex h-[52px] items-center justify-between border-b border-border/10 text-[10px]"><span className="flex items-center gap-2 font-semibold"><Check className="size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground" />{label}</span><small className="text-[9px] text-text-muted">12 ms</small></div>)}
        <div className="mt-5 flex items-center gap-3 rounded-[14px] border border-primary/15 bg-primary/5 p-4"><Sparkles className="size-4 text-primary-strong" /><div className="flex flex-col"><strong className="text-[10px]">{tr("Чудове рішення", "Great solution")}</strong><span className="mt-0.5 text-[9px] text-text-muted">{tr("Часова складність O(n)", "Time complexity O(n)")}</span></div></div>
      </div>
    </div>
  </div>
);

const DashboardPreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-bg-code p-4 text-left text-text-primary shadow-[0_48px_110px_rgba(5,25,13,.28)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-primary/15 text-primary-soft"><Sparkles className="size-5" /></div><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-primary-soft">{tr("Сьогодні", "Today")} · Java</div><div className="mt-1 text-xl font-black tracking-[-.04em]">{tr("Твій наступний крок", "Your next step")}</div></div></div>
      <button type="button" className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-text-primary">{tr("Змінити тему", "Change topic")}</button>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
      <section className="rounded-[26px] border border-white/10 bg-bg-base p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-accent-warn">{tr("Поточний фокус", "Current focus")}</span><span className="rounded-full bg-primary/12 px-3 py-1 text-[10px] font-bold text-primary-soft">{tr("У процесі", "In progress")}</span></div><h4 className="mt-5 max-w-xl text-3xl font-black tracking-[-.065em] sm:text-4xl">{tr("Вступ до Java: типи, які мають сенс", "Java foundations: types that make sense")}</h4><p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary">{tr("Коротка теорія, одна практика і зрозумілий результат. Платформа веде тебе до наступної дії, а не до ще одного меню.", "A short concept, one practice and a clear result. The platform guides your next action instead of adding another menu.")}</p><div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" className="rounded-xl bg-primary px-4 py-3 text-xs font-black text-primary-foreground"><Play className="mr-1.5 inline size-3.5 fill-current" />{tr("Продовжити", "Continue")}</button><span className="text-xs text-text-secondary">{tr("12 хв залишилось", "12 min left")}</span></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-primary" /></div><div className="mt-2 flex justify-between text-[10px] font-bold text-text-secondary"><span>{tr("Прогрес теми", "Topic progress")}</span><span>68%</span></div></section>
      <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><div className="rounded-[26px] border border-white/10 bg-bg-base p-5"><div className="flex items-center justify-between text-xs text-text-secondary"><span>{tr("Результат", "Result")}</span><BarChart3 className="size-4 text-primary-soft" /></div><div className="mt-3 text-4xl font-black tracking-[-.07em]">86<span className="ml-1 text-base text-text-secondary">/100</span></div><div className="mt-3 text-xs text-text-secondary">{tr("+8 за останню практику", "+8 from the last practice")}</div></div><div className="rounded-[26px] border border-accent-warn/25 bg-[var(--surface-warning)] p-5"><div className="flex items-center gap-2 text-xs font-bold text-accent-warn"><Flame className="size-4" />{tr("Ритм навчання", "Learning rhythm")}</div><div className="mt-3 text-2xl font-black">4 {tr("дні", "days")}</div><div className="mt-1 text-xs text-accent-warn">{tr("Ще одна коротка практика сьогодні", "One more short practice today")}</div></div></aside>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-bg-base p-4"><BookOpen className="size-4 text-primary-soft" /><div className="mt-4 text-sm font-black">{tr("Теорія", "Theory")}</div><div className="mt-1 text-xs text-text-secondary">{tr("3 поняття · 8 хв", "3 concepts · 8 min")}</div></div><div className="rounded-2xl border border-white/10 bg-bg-base p-4"><Code2 className="size-4 text-accent-warn" /><div className="mt-4 text-sm font-black">{tr("Практика", "Practice")}</div><div className="mt-1 text-xs text-text-secondary">{tr("1 задача · автоперевірка", "1 task · auto-check")}</div></div><div className="rounded-2xl border border-white/10 bg-bg-base p-4"><Trophy className="size-4 text-accent-warn" /><div className="mt-4 text-sm font-black">{tr("Наступна ціль", "Next milestone")}</div><div className="mt-1 text-xs text-text-secondary">{tr("Закрий тему на 80%", "Reach 80% in this topic")}</div></div></div>
  </div>
); */

const PracticePreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className={`${card} overflow-hidden bg-bg-surface dark:bg-bg-code`}>
    <div className="grid min-h-[500px] grid-cols-[minmax(0,.84fr)_minmax(0,1.2fr)_minmax(0,.86fr)] max-lg:grid-cols-1">
      <aside className="border-r border-border/10 bg-white/86 p-6 dark:border-white/10 dark:bg-white/[.04]">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-primary-strong">
          <FlaskConical className="size-3.5" />
          {tr("Приклад практики", "Practice example")}
        </span>
        <div className="mt-4 text-2xl font-bold tracking-[-.045em]">{tr("Тренувальна студія", "Practice studio")}</div>
        <p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Умова, редактор і результат зібрані в одному робочому полотні.", "Statement, editor and results stay together in one focused workspace.")}</p>
        <div className="mt-6 rounded-2xl border border-border/10 bg-bg-surface p-3 dark:border-white/10 dark:bg-white/[.045]">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-text-muted">stdin</div>
          <div className="mt-2 rounded-xl bg-white p-3 font-mono text-xs dark:bg-bg-code">5</div>
        </div>
        <span aria-hidden="true" className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-primary-foreground dark:bg-primary dark:text-primary-foreground"><Play className="mr-1.5 size-3.5" />{tr("Запуск прикладу", "Example run")}</span>
      </aside>
      <section aria-label={tr("Приклад коду", "Code example")} className="min-w-0 overflow-hidden bg-bg-code">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><span className="size-2.5 rounded-full bg-accent-error" /><span className="size-2.5 rounded-full bg-accent-warn" /><span className="size-2.5 rounded-full bg-primary" /><span className="ml-2 text-[10px] text-text-secondary">main.py</span></div>
        <pre className="m-0 min-h-[470px] max-w-full overflow-x-auto whitespace-pre-wrap break-words p-8 font-mono text-[clamp(11px,1vw,13px)] leading-8 text-text-primary max-md:min-h-[320px] max-md:p-6"><span className={codeColors.keyword}>n</span> = int(input()){"\n"}total = 0{"\n"}<span className={codeColors.keyword}>for</span> i <span className={codeColors.keyword}>in</span> range(1, n + 1):{"\n"}    total += i{"\n"}print(total)</pre>
      </section>
      <aside className="border-l border-border/10 bg-white/86 p-6 dark:border-white/10 dark:bg-white/[.04]">
        <div className="text-[10px] font-bold uppercase tracking-[.14em] text-text-muted">{tr("Приклад результату", "Example output")}</div>
        <div className="mt-3 rounded-2xl bg-bg-code p-4 font-mono text-sm text-text-primary">{LEARNING_BOUNDARY_DEMO.expectedOutput}</div>
        <div className="mt-5 text-[10px] font-bold uppercase tracking-[.14em] text-text-muted">{tr("Візуалізація", "Visualizer")}</div>
        <div className="mt-3 rounded-2xl border border-border/10 bg-bg-surface p-4 dark:border-white/10 dark:bg-white/[.045]">
          <div className="flex justify-between text-xs"><span>{tr("Остання ітерація", "Final iteration")}</span><strong className="text-primary-strong">line 4</strong></div>
          <div className="mt-4 grid gap-2 font-mono text-[11px]">
            <span className="rounded-xl bg-white px-3 py-2 dark:bg-bg-code">i = 5</span>
            <span className="rounded-xl bg-white px-3 py-2 dark:bg-bg-code">total = 15</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
);

const FailureLoopPreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <article id="practice" aria-label={tr("Демонстраційний розбір задачі на суму", "Demo review of a sum task")} className="overflow-hidden rounded-[22px] border border-border/70 bg-bg-surface text-text-primary dark:border-white/10 dark:bg-bg-code">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 dark:border-white/10 sm:px-5">
      <div className="flex items-center gap-2.5"><Code2 className="size-4 text-primary-strong dark:text-primary-soft" aria-hidden="true" /><span className="text-sm font-semibold">{tr("Сума від 1 до n", "Sum from 1 to n")}</span><span className="text-xs text-text-muted dark:text-text-secondary">Python</span></div>
      <span className="inline-flex min-h-7 items-center gap-1.5 border-l-2 border-accent-warn pl-2.5 text-[10px] font-bold tracking-[.08em] text-accent-warn"><span aria-hidden="true">◇</span>{tr("ДЕМО", "DEMO")}</span>
    </header>
    <div className="grid lg:grid-cols-[1.05fr_.95fr]">
      <section aria-label={tr("Код із помилкою", "Code with an error")} className="min-w-0 border-b border-border/70 bg-bg-code px-4 py-4 dark:border-white/10 lg:border-b-0 lg:border-r sm:px-5">
        <div className="mb-3 flex items-center justify-between gap-3 text-[10px] text-text-secondary"><span>{tr("Поточна спроба", "Current attempt")}</span><span className="font-mono">main.py</span></div>
        <pre className="m-0 overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-[1.9] text-text-primary"><code>{LEARNING_BOUNDARY_DEMO.initialCode}</code></pre>
        <div className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-xs"><span className="size-1.5 rounded-full bg-accent-error" aria-hidden="true" /><span>{tr("Перевірка: не пройдено", "Check: failed")}</span></div>
      </section>
      <section aria-label={tr("Результат демонстраційного тесту", "Demo test result")} className="min-w-0 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-[10px] font-bold tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("ДЕМОНСТРАЦІЙНИЙ ТЕСТ", "DEMO TEST")}</h2><span className="font-mono text-[10px] text-text-muted dark:text-text-secondary">n = {LEARNING_BOUNDARY_DEMO.input}</span></div>
        <dl className="mt-3 grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 py-3 dark:divide-white/10 dark:border-white/10">
          <div className="pr-2"><dt className="text-[10px] text-text-muted dark:text-text-secondary">{tr("Ввід", "Input")}</dt><dd className="mt-1 font-mono text-sm">{LEARNING_BOUNDARY_DEMO.input}</dd></div>
          <div className="px-2"><dt className="text-[10px] text-text-muted dark:text-text-secondary">{tr("Очікується", "Expected")}</dt><dd className="mt-1 font-mono text-sm">{LEARNING_BOUNDARY_DEMO.expectedOutput}</dd></div>
          <div className="pl-2"><dt className="text-[10px] text-text-muted dark:text-text-secondary">{tr("Отримано", "Got")}</dt><dd className="mt-1 font-mono text-sm font-semibold text-accent-error">{LEARNING_BOUNDARY_DEMO.failedOutput}</dd></div>
        </dl>
        <div className="mt-3 border-l-2 border-accent-warn pl-3">
          <div className="text-[10px] font-semibold text-accent-warn">{tr("Підказка · напрям перевірки", "Hint · where to look")}</div>
          <p className="mb-0 mt-1 text-xs leading-5 text-text-secondary">{tr(LEARNING_BOUNDARY_DEMO.hint.uk, LEARNING_BOUNDARY_DEMO.hint.en)}</p>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 dark:border-white/10">
          <span className="text-[10px] text-text-muted dark:text-text-secondary">{tr("Після виправлення", "After the fix")}</span>
          <code className="rounded-md bg-bg-hover px-2 py-1 font-mono text-[11px] text-text-primary dark:bg-white/[.07]">{LEARNING_BOUNDARY_DEMO.correctedRange}</code>
        </div>
      </section>
    </div>
  </article>
);
const TeacherRadarPreview: React.FC<{ tr: Translate }> = ({ tr }) => {
  const students = [
    { task: tr("Межі циклу", "Loop boundaries"), status: tr("Потрібна увага", "Needs attention"), tone: "text-accent-error", surface: "bg-bg-hover dark:bg-accent-error/10" },
    { task: tr("Списки", "Lists"), status: tr("У процесі", "In progress"), tone: "text-accent-warn", surface: "bg-bg-hover dark:bg-accent-warn/10" },
    { task: tr("Функції", "Functions"), status: tr("Перевірено", "Reviewed"), tone: "text-primary-strong", surface: "bg-bg-hover dark:bg-primary/10" },
  ];
  return <div className="overflow-hidden rounded-[24px] border border-border/10 bg-bg-surface p-4 shadow-[0_22px_50px_rgba(18,32,23,.08)] dark:border-white/10 dark:bg-bg-code sm:p-5">
    <div className="flex items-center justify-between gap-3 border-b border-border/10 pb-4 dark:border-white/10">
      <div><div className="text-[10px] font-black uppercase tracking-[.16em] text-accent-warn">{tr("Приклад огляду класу", "Class overview example")}</div><div className="mt-1 text-sm font-bold">{tr("Стани робіт за темами", "Work status by topic")}</div></div>
      <span className="rounded-full bg-accent-warn/15 px-2.5 py-1 text-[10px] font-bold text-accent-warn dark:text-accent-warn">{tr("Приклад", "Example")}</span>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      {[tr("Потрібна увага", "Needs attention"), tr("У процесі", "In progress"), tr("Перевірено", "Reviewed")].map((label) => <div key={label} className="rounded-xl bg-bg-hover p-3 text-center text-[10px] font-semibold text-text-secondary dark:bg-white/[.05] dark:text-text-secondary">{label}</div>)}
    </div>
    <div className="mt-4 divide-y divide-border/10 rounded-xl border border-border/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[.035]">
      {students.map((student) => <div key={student.task} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/10 bg-white p-3 dark:border-white/10 dark:bg-white/[.035]">
        <span className="text-xs font-semibold">{student.task}</span>
        <span className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${student.surface} ${student.tone}`}>{student.status}</span>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl border border-accent-warn/25 bg-accent-warn/[.08] p-3"><div className="text-[10px] font-black uppercase tracking-[.14em] text-accent-warn">{tr("Можлива наступна дія", "Possible next action")}</div><p className="mt-1.5 text-xs leading-5 text-accent-warn dark:text-accent-warn">{tr("Поясни граничний випадок або відкрий відповідну спробу учня.", "Explain the boundary case or open the learner attempt.")}</p></div>
  </div>;
};

export const PublicLandingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const navigate = (path: string) => window.location.assign(path);
  const tr: Translate = (uk, en) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const goToAuth = (mode: "login" | "register", audience?: "teacher") => navigate(withDevPreview(`/?auth=${mode}${audience ? `&audience=${audience}` : ""}`));
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 12 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.14 }, transition: { duration: 0.24, ease: easing } };

  return (
    <div id="studycod-landing" className="min-h-[100dvh] overflow-hidden bg-bg-base font-sans text-text-primary selection:bg-primary/20">
      <PublicProductNav active="home" homeMode />

      <main id="main-content" tabIndex={-1} className="scroll-mt-24 outline-none">
        <section className="relative mx-auto grid w-[min(1240px,calc(100%_-_48px))] grid-cols-1 items-center gap-8 pb-12 pt-[112px] lg:grid-cols-[.88fr_1.12fr] lg:gap-12 lg:pb-16 lg:pt-[132px] max-md:w-[calc(100%_-_28px)] max-md:pt-[100px]">
          <div aria-hidden="true" className="pointer-events-none absolute left-0 top-20 h-[420px] w-[720px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--primary)_9%,transparent),transparent_68%)] blur-2xl" />
          <motion.div className="relative z-10 max-w-[600px]" initial={reduceMotion ? undefined : { opacity: 0, y: 16 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: easing }}>
            <div className="mb-5 flex w-fit items-center gap-2.5 rounded-full border border-border/70 bg-bg-surface/85 py-1 pl-1 pr-3.5 text-xs font-semibold text-text-muted shadow-sm"><span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Sparkles className="size-3.5" /></span>{tr("Навчання, яке переходить у навичку", "Learning that becomes a skill")}</div>
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-primary-strong">StudyCod — learn by building</div>
            <h1 className="m-0 max-w-[620px] text-balance text-[clamp(42px,5.2vw,68px)] font-bold leading-[1.02] tracking-[-0.055em] max-md:text-[clamp(40px,12.4vw,54px)]">{tr("Зрозумій, чому код не пройшов тест.", "See why your code failed a test.")}</h1>
            <p className="mt-5 max-w-[540px] text-balance text-base leading-7 text-text-muted sm:text-lg sm:leading-8">{tr("Поруч із кодом — результат доступного тесту й підказка, яка допомагає перевірити наступний крок.", "See an available test result beside your code, with a hint that helps you choose what to check next.")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => goToAuth("register")} className="group inline-flex min-h-12 items-center gap-2.5 rounded-xl bg-primary px-5 font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 motion-safe:active:translate-y-px">
                <GraduationCap className="size-5" aria-hidden="true" />{tr("Почати практику", "Start practicing")}<ArrowRight className="size-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => goToAuth("register", "teacher")} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-border/70 px-4 font-semibold text-text-secondary transition-colors hover:border-primary/40 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <Users className="size-4" aria-hidden="true" />{tr("Для викладача", "For teachers")}
              </button>
            </div>
            <button type="button" onClick={() => scrollTo("loop")} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">{tr("Як працюють результати", "How results work")}<ArrowRight className="size-4" /></button>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">{[tr("Безкоштовний старт", "Free to start"), tr("Автоперевірка", "Auto-checked tasks"), tr("Самостійно й у класі", "Self-study and classroom")].map((item) => <span key={item} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-primary-strong" />{item}</span>)}</div>
          </motion.div>
          <motion.div className="relative z-20 min-w-0" initial={reduceMotion ? undefined : { opacity: 0, y: 16 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: easing }}><FailureLoopPreview tr={tr} /></motion.div>
        </section>

         <section id="loop" className="mx-auto w-[min(1120px,calc(100%_-_48px))] border-y border-border/70 py-6 max-md:w-[calc(100%_-_28px)] dark:border-white/10">
  <div className="grid gap-5 sm:grid-cols-[.7fr_1.3fr] sm:items-start sm:gap-10">
    <div><p className="m-0 text-[10px] font-bold tracking-[.12em] text-text-muted dark:text-text-secondary">{tr("ЩО ПОКАЗУЄ ПЕРЕВІРКА", "WHAT THE CHECK SHOWS")}</p><h2 className="mb-0 mt-2 text-lg font-semibold tracking-[-.03em]">{tr("Тільки доступні дані задачі", "Only the data available for the task")}</h2></div>
    <ul className="m-0 grid gap-3 p-0 text-sm leading-5 text-text-secondary sm:grid-cols-3">
      <li className="border-l-2 border-primary/50 pl-3">{tr("Ввід і вихід відкритого тесту, коли задача дозволяє їх перегляд.", "Input and output from a visible test when the task allows them to be shown.")}</li>
      <li className="border-l-2 border-accent-warn/60 pl-3">{tr("Пояснення причини з’являється лише за наявності діагностики.", "A cause is explained only when diagnostic information is available.")}</li>
      <li className="border-l-2 border-border pl-3 dark:border-white/20">{tr("Після перегляду результату можна повернутися до свого коду.", "After reviewing the result, you can return to your code.")}</li>
    </ul>
  </div>
</section>

<section id="platform" className="mx-auto grid w-[min(1120px,calc(100%_-_48px))] gap-8 py-16 max-md:w-[calc(100%_-_28px)] lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:gap-16">
  <div>
    <p className="m-0 text-[10px] font-bold tracking-[.13em] text-primary-strong">{tr("НАВЧАЛЬНИЙ МАРШРУТ", "LEARNING PATH")}</p>
    <h2 className="mt-3 text-balance text-[clamp(30px,3.6vw,44px)] font-semibold leading-[1.08] tracking-[-.045em]">{tr("Від теми — до самостійної спроби.", "From a concept to an independent attempt.")}</h2>
    <p className="mt-4 max-w-xl text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("У кабінеті курс показує наступне заняття. У бібліотеці можна знайти іншу задачу, а в практиці — перевірити власний код і повернутися до нього після результату.", "Your course points to the next lesson. The library helps you find another task; in practice, you check your own code and return to it after seeing the result.")}</p>
    <button type="button" onClick={() => goToAuth("register")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none">{tr("Почати навчання", "Start learning")}<ArrowRight className="size-4" aria-hidden="true" /></button>
  </div>
  <ol className="m-0 divide-y divide-border/70 border-y border-border/70 p-0 dark:divide-white/10 dark:border-white/10">
    {[
      { n: "01", title: tr("Продовжити курс", "Continue the course"), detail: tr("Відкрий наступний урок або практику.", "Open the next lesson or practice task.") },
      { n: "02", title: tr("Знайти задачу", "Find a task"), detail: tr("Пошукай за назвою, темою чи складністю.", "Search by title, topic, or difficulty.") },
      { n: "03", title: tr("Розібрати результат", "Review the result"), detail: tr("Переглянь доступний тест, підказку та свій код.", "Review an available test, hint, and your code.") },
    ].map((step) => <li key={step.n} className="grid grid-cols-[42px_1fr] gap-3 py-4 first:pt-2 last:pb-2">
      <span className="font-mono text-xs tabular-nums text-text-muted dark:text-text-secondary">{step.n}</span><div><h3 className="m-0 text-sm font-semibold">{step.title}</h3><p className="mb-0 mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{step.detail}</p></div>
    </li>)}
  </ol>
</section>

<section id="roles" className="mx-auto grid w-[min(1120px,calc(100%_-_48px))] gap-8 border-t border-border/70 py-14 max-md:w-[calc(100%_-_28px)] lg:grid-cols-[.8fr_1.2fr] lg:items-center lg:gap-14 dark:border-white/10">
  <div>
    <p className="m-0 text-[10px] font-bold tracking-[.13em] text-accent-warn">{tr("РОБОТА ВИКЛАДАЧА", "TEACHER WORKSPACE")}</p>
    <h2 className="mt-3 text-balance text-[clamp(28px,3.2vw,40px)] font-semibold leading-[1.1] tracking-[-.04em]">{tr("Видно спробу, якій потрібна увага.", "See which attempt needs attention.")}</h2>
    <p className="mt-4 text-sm leading-6 text-text-muted dark:text-text-secondary">{tr("Приклад показує стани навчальних робіт. Це демонстраційні дані; у класі викладач бачить доступні результати учнів і може відкрити відповідну роботу.", "This example shows learning-work states using demo data. In a class, teachers see available learner results and can open the corresponding work.")}</p>
    <button type="button" onClick={() => goToAuth("register", "teacher")} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-border/70 px-4 text-sm font-semibold text-text-primary transition-colors hover:border-primary/50 hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none dark:border-white/15 dark:hover:bg-white/[.04]">{tr("Для викладача", "For teachers")}<ArrowRight className="size-4" aria-hidden="true" /></button>
  </div>
  <TeacherRadarPreview tr={tr} />
</section>
<section className="relative mx-auto mt-28 w-[min(1240px,calc(100%_-_48px))] overflow-hidden rounded-[33px] bg-bg-code px-6 py-28 text-center text-text-primary shadow-[0_40px_95px_rgba(12,25,17,0.18)] max-md:mt-20 max-md:w-[calc(100%_-_28px)] max-md:rounded-[25px] max-md:py-20">
          <div className="absolute -left-48 -top-56 size-[470px] rounded-full bg-primary/10 blur-[90px]" /><div className="absolute -bottom-64 -right-52 size-[470px] rounded-full bg-accent-warn/10 blur-[90px]" />
          <motion.div {...reveal} className="relative z-10 mx-auto max-w-[790px]"><span className="mx-auto mb-7 grid size-16 place-items-center rounded-[20px] brand-logo-surface text-white"><Logo size={38} /></span><h2 className="text-balance text-[clamp(40px,5vw,64px)] font-bold leading-[1.04] tracking-[-0.05em]">{tr("Побудуй навичку, яка залишиться з тобою.", "Build a skill that stays with you.")}</h2><p className="mx-auto mt-6 max-w-[600px] text-base leading-7 text-text-secondary">{tr("Почни з першого уроку сьогодні. StudyCod допоможе тримати темп далі.", "Start with your first lesson today. StudyCod will help you keep the momentum.")}</p><GreenButton onClick={() => goToAuth("register")} className="mx-auto mt-8">{tr("Створити акаунт", "Create an account")}<ArrowRight className="size-4" /></GreenButton><span className="mt-5 flex items-center justify-center gap-2 text-[13px] text-text-secondary"><ShieldCheck className="size-4" />{tr("Без картки · Початок за кілька хвилин", "No card required · Start in minutes")}</span></motion.div>
        </section>
      </main>

      <footer className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-8 pt-24 max-md:w-[calc(100%_-_28px)] max-md:pt-20">
        <div className="grid grid-cols-[1fr_1.4fr] gap-24 pb-16 max-md:grid-cols-1 max-md:gap-12">
          <div><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="bg-transparent text-left"><BrandLockup /><span className="sr-only">StudyCod — learn by building</span></button><p className="mt-5 max-w-[340px] text-sm leading-6 text-text-muted">{tr("Освітня платформа для системного навчання програмуванню.", "An education platform for learning programming with structure.")}</p><a href="https://github.com/Curioloom-Labs" target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#30223b] transition hover:text-accent-error"><span>{tr("Проєкт Curioloom Labs", "A Curioloom Labs project")}</span><ArrowUpRight className="size-3.5" /></a></div>
          <div className="grid grid-cols-3 gap-10 max-md:gap-5">{[
            [tr("Продукт","Product"),[[tr("Платформа","Platform"),()=>scrollTo("platform")],[tr("Практика","Practice"),()=>scrollTo("practice")],[tr("Тарифи","Pricing"),()=>navigate("/pricing")]]],
            [tr("Ресурси","Resources"),[[tr("Документація","Documentation"),()=>navigate("/docs")],[tr("Підтримка","Support"),()=>navigate("/support")],[tr("Блог","Blog"),()=>navigate("/blog")]]],
            [tr("Правове","Legal"),[[tr("Приватність","Privacy"),()=>navigate("/privacy")],[tr("Умови","Terms"),()=>navigate("/terms")],[tr("Повернення","Refunds"),()=>navigate("/refunds")],["Cookies",()=>navigate("/cookies")]]],
          ].map(([heading,links]) => <div key={String(heading)} className="flex flex-col items-start gap-3"><strong className="mb-1 text-sm">{String(heading)}</strong>{(links as Array<[string,()=>void]>).map(([label,action]) => <button type="button" key={label} onClick={action} className="text-left text-[13px] leading-5 text-text-muted transition hover:text-text-primary">{label}</button>)}</div>)}</div>
        </div>
        <div className="flex justify-between gap-4 border-t border-border/10 pt-6 text-xs leading-5 text-text-muted max-md:flex-col"><span>© {new Date().getFullYear()} StudyCod · Curioloom Labs</span><span>{tr("Створено для тих, хто вчиться створювати.", "Made for people learning to build.")}</span></div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
