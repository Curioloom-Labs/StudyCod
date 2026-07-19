import React from "react";
import { motion, useReducedMotion } from "framer-motion";
import "../../i18n";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePlay,
  Clock3,
  Code2,
  FileCode2,
  Flame,
  FlaskConical,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Terminal,
  Users,
} from "lucide-react";
import { Logo } from "../../components/Logo";
import { PublicProductNav } from "../../components/layout/PublicProductNav";

type Translate = (uk: string, en: string) => string;

const easing = [0.16, 1, 0.3, 1] as const;
const card = "rounded-[26px] border border-[#122017]/10 bg-white shadow-[0_22px_65px_rgba(18,32,23,0.06)] dark:border-white/10 dark:bg-[#151c17] dark:shadow-[0_22px_65px_rgba(0,0,0,0.22)]";
const iconTile = "grid size-11 place-items-center rounded-[14px] bg-[#00ff88]/10 text-[#00834a]";
const codeColors = {
  keyword: "text-[#ff6b9d]",
  function: "text-[#ffad4a]",
  method: "text-[#60e5aa]",
  type: "text-[#ffd93d]",
};

const GreenButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ className = "", children, ...props }) => (
  <button
    className={`inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl bg-[#00ff88] px-6 text-sm font-bold text-[#07140d] shadow-[0_14px_32px_rgba(0,185,99,0.19)] transition duration-300 hover:-translate-y-0.5 hover:bg-[#24ff9a] hover:shadow-[0_18px_38px_rgba(0,185,99,0.27)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00b963] focus-visible:ring-offset-2 ${className}`}
    {...props}
  >
    {children}
  </button>
);

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
  <div className="relative overflow-hidden rounded-[26px] border border-[#132319]/15 bg-white text-left shadow-[0_48px_110px_rgba(21,40,27,0.15),0_9px_28px_rgba(21,40,27,0.07)]">
    <div className="grid h-[60px] grid-cols-[1fr_1.25fr_1fr] items-center border-b border-[#122017]/10 bg-[#fcfdfb] px-5 max-md:grid-cols-[1fr_auto]">
      <div className="flex items-center gap-2.5 text-[13px] font-bold tracking-tight">
        <span className="grid size-7 place-items-center rounded-lg bg-[#edf0eb]"><Logo size={18} /></span>
        StudyCod
      </div>
      <div className="flex h-8 items-center justify-between rounded-[10px] border border-[#122017]/10 bg-[#f7f8f5] px-3 text-[10px] text-[#667169] max-md:hidden">
        {tr("Пошук у навчанні", "Search your learning")}
        <span className="rounded-md border border-[#122017]/10 px-1.5 py-0.5 text-[9px]">⌘ K</span>
      </div>
      <span className="ml-auto grid size-8 place-items-center rounded-full bg-[#ffe1b9] text-[10px] font-bold text-[#512d00]">MK</span>
    </div>

    <div className="grid min-h-[610px] grid-cols-[174px_1fr] max-md:block max-md:min-h-0">
      <aside className="flex flex-col gap-1.5 border-r border-[#122017]/10 bg-[#f4f6f2] p-3.5 max-md:hidden">
        {[
          [LayoutDashboard, tr("Огляд", "Overview")],
          [BookOpen, tr("Курси", "Courses")],
          [Code2, tr("Практика", "Practice")],
          [BarChart3, tr("Прогрес", "Progress")],
        ].map(([Icon, label], index) => {
          const NavIcon = Icon as typeof LayoutDashboard;
          return <div key={String(label)} className={`flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[11px] font-semibold ${index === 0 ? "bg-[#00ff88]/10 text-[#007f48]" : "text-[#667169]"}`}><NavIcon className="size-3.5" />{String(label)}</div>;
        })}
        <div className="mt-auto flex items-center gap-2.5 border-t border-[#122017]/10 px-1.5 pt-3">
          <span className="grid size-8 place-items-center rounded-full bg-[#ffe1b9] text-[10px] font-bold text-[#512d00]">O</span>
          <div className="flex flex-col"><strong className="text-[10px]">Олена</strong><span className="text-[9px] text-[#667169]">{tr("Викладач", "Teacher")}</span></div>
        </div>
      </aside>

      <div className="min-w-0 bg-[#f7f8f5] p-7 max-md:p-4">
        <div className="mb-5 flex items-end justify-between">
          <div><span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#667169]">{tr("Вівторок, 10 липня", "Tuesday, July 10")}</span><div className="mt-1.5 text-xl font-bold tracking-[-0.03em] max-md:text-base">{tr("Продовжуй у своєму темпі", "Keep learning at your pace")}</div></div>
          <span className="flex h-8 items-center gap-1.5 rounded-[10px] border border-[#ff8c00]/20 bg-[#ff8c00]/10 px-3 text-[10px] font-bold text-[#a85a00]"><Flame className="size-3 fill-current" />12 {tr("днів", "days")}</span>
        </div>

        <div className="grid min-h-[150px] grid-cols-[138px_1fr_auto] items-center gap-5 rounded-[19px] border border-[#122017]/10 bg-white p-3.5 shadow-[0_13px_35px_rgba(18,32,23,0.05)] max-md:grid-cols-[92px_1fr] max-md:gap-3">
          <div className="relative grid h-[120px] place-items-center overflow-hidden rounded-[15px] bg-[radial-gradient(circle_at_25%_15%,rgba(0,255,136,.24),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(255,140,0,.18),transparent_40%),linear-gradient(145deg,#082218,#173b2b)] max-md:h-[94px]">
            <i className="absolute h-10 w-[108px] rotate-[28deg] rounded-[50%] border border-[#00ff88]/30" />
            <i className="absolute h-10 w-[108px] -rotate-[28deg] rounded-[50%] border border-[#ff8c00]/25" />
            <span className="relative z-10 grid size-12 -rotate-6 place-items-center rounded-2xl border border-white/15 bg-white/10 text-[#b8ffdc] backdrop-blur"><FileCode2 className="size-6" /></span>
          </div>
          <div className="min-w-0">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.1em] text-[#007f48]">Python · {tr("Основи", "Foundations")}</span>
            <div className="mt-2 text-base font-bold max-md:text-[13px]">{tr("Функції та чистий код", "Functions and clean code")}</div>
            <p className="mt-1 text-[10px] text-[#667169]">{tr("Урок 8 із 12", "Lesson 8 of 12")} · 24 {tr("хв", "min")}</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#edf0eb]"><span className="block h-full w-[68%] rounded-full bg-[#00b963]" /></div>
          </div>
          <button className="grid size-10 place-items-center rounded-xl bg-[#00ff88] text-[#06150d] max-md:hidden" aria-label={tr("Продовжити урок", "Continue lesson")}><Play className="size-4 fill-current" /></button>
        </div>

        <div className="mt-4 grid grid-cols-[1.45fr_.72fr] gap-4 max-md:grid-cols-1">
          <div className="overflow-hidden rounded-[18px] border border-[#122017]/10 bg-white shadow-sm">
            <div className="flex h-12 items-center justify-between border-b border-[#122017]/10 px-4 text-[10px] font-bold"><span className="flex items-center gap-2"><Code2 className="size-3.5 text-[#00a85c]" />{tr("Задача дня", "Daily challenge")}</span><span className="rounded-md bg-[#ffd93d]/20 px-2 py-1 text-[8px] text-[#8c6900]">{tr("Середня", "Medium")}</span></div>
            <div className="flex h-[158px] bg-[#101713] p-4 font-mono text-[9px] leading-[1.8] text-[#d9e2dc] max-md:h-[140px] max-md:text-[8px]">
              <div className="pr-4 text-right text-[#59655e]">1<br />2<br />3<br />4<br />5</div>
              <pre className="m-0 whitespace-pre-wrap font-mono"><span className={codeColors.keyword}>def</span> <span className={codeColors.function}>unique_words</span>(text):{"\n"}  words = text.<span className={codeColors.method}>split</span>(){"\n"}  result = <span className={codeColors.type}>set</span>(words){"\n"}  <span className={codeColors.keyword}>return</span> len(result)</pre>
            </div>
            <div className="flex h-12 items-center justify-between px-3.5 text-[9px] text-[#667169]"><span className="flex items-center gap-1.5"><CheckCircle2 className="size-3 text-[#00a85c]" />7 / 8 {tr("тестів", "tests")}</span><button className="flex h-7 items-center gap-1 rounded-lg bg-[#00ff88] px-2.5 text-[8px] font-bold text-[#06150d]">{tr("Запустити", "Run")}<ChevronRight className="size-3" /></button></div>
          </div>

          <div className="rounded-[18px] border border-[#122017]/10 bg-white pb-3 shadow-sm max-md:hidden">
            <div className="flex h-12 items-center px-4 text-[10px] font-bold"><Target className="mr-2 size-3.5 text-[#00a85c]" />{tr("Тижнева ціль", "Weekly goal")}</div>
            <div className="relative mx-auto grid size-[122px] place-items-center">
              <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90"><circle cx="60" cy="60" r="50" fill="none" stroke="#edf0eb" strokeWidth="8" /><circle cx="60" cy="60" r="50" fill="none" stroke="#00b963" strokeWidth="8" strokeLinecap="round" strokeDasharray="314" strokeDashoffset="82" /></svg>
              <div className="flex flex-col items-center"><strong className="text-xl">74%</strong><span className="text-[8px] text-[#667169]">{tr("виконано", "complete")}</span></div>
            </div>
            <div className="mx-4 mt-1 flex h-14 items-end gap-1.5">{[44,68,54,88,72,34,20].map((height, index) => <i key={index} style={{ height: `${height}%` }} className={`min-h-2 flex-1 rounded-t ${index === 3 ? "bg-[#ff8c00]" : "bg-[#00b963]/25"}`} />)}</div>
            <div className="mx-4 mt-1 flex justify-between text-[7px] text-[#667169]"><span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Нд</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const LegacyPracticePreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className={`${card} overflow-hidden`}>
    <div className="flex items-center justify-between px-8 pb-5 pt-7 max-md:px-5 max-md:pt-5">
      <div><span className="text-[10px] font-extrabold uppercase tracking-[0.11em] text-[#007f48]">{tr("Практика · Python", "Practice · Python")}</span><div className="mt-1.5 text-[21px] font-bold max-md:text-lg">{tr("Знайди найдовше слово", "Find the longest word")}</div></div>
      <span className="flex h-9 items-center gap-2 rounded-[10px] bg-[#edf0eb] px-3 text-[10px] text-[#667169]"><Clock3 className="size-3.5" />18:42</span>
    </div>
    <p className="max-w-[760px] px-8 pb-7 text-sm leading-6 text-[#667169] max-md:px-5">{tr("Напиши функцію, що повертає найдовше слово у реченні. Якщо таких слів кілька — поверни перше.", "Write a function that returns the longest word in a sentence. If several match, return the first one.")}</p>
    <div className="grid min-h-[430px] grid-cols-[1.5fr_.72fr] border-t border-[#122017]/10 max-md:grid-cols-1">
      <div className="flex flex-col bg-[#101713] text-[#dbe7df]">
        <div className="flex h-12 items-stretch gap-7 border-b border-white/10 px-5 text-[10px] text-[#6f7d74]"><span className="flex items-center border-b-2 border-[#00ff88] text-[#dbe7df]">solution.py</span><span className="flex items-center">tests.py</span></div>
        <pre className="m-0 flex-1 p-9 font-mono text-xs leading-8 max-md:p-6 max-md:text-[10px]"><span className={codeColors.keyword}>def</span> <span className={codeColors.function}>longest_word</span>(sentence):{"\n"}    words = sentence.<span className={codeColors.method}>split</span>(){"\n"}    <span className={codeColors.keyword}>return</span> max(words, key=len)</pre>
        <div className="flex justify-end border-t border-white/10 p-4"><button className="flex h-9 items-center gap-2 rounded-[10px] bg-[#00ff88] px-3.5 text-[10px] font-bold text-[#06150d]"><Play className="size-3 fill-current" />{tr("Перевірити рішення", "Check solution")}</button></div>
      </div>
      <div className="bg-[#f7f8f5] p-6">
        <div className="flex justify-between border-b border-[#122017]/10 pb-5 text-xs"><span>{tr("Результати", "Results")}</span><strong className="text-[#007f48]">4 / 4</strong></div>
        {[tr("Базовий приклад", "Basic example"), tr("Порожні значення", "Empty values"), tr("Кілька однакових", "Multiple matches"), tr("Великий текст", "Large text")].map((label) => <div key={label} className="flex h-[52px] items-center justify-between border-b border-[#122017]/10 text-[10px]"><span className="flex items-center gap-2 font-semibold"><Check className="size-3.5 rounded-full bg-[#00ff88] p-0.5 text-[#062315]" />{label}</span><small className="text-[9px] text-[#667169]">12 ms</small></div>)}
        <div className="mt-5 flex items-center gap-3 rounded-[14px] border border-[#00b963]/15 bg-[#00ff88]/5 p-4"><Sparkles className="size-4 text-[#007f48]" /><div className="flex flex-col"><strong className="text-[10px]">{tr("Чудове рішення", "Great solution")}</strong><span className="mt-0.5 text-[9px] text-[#667169]">{tr("Часова складність O(n)", "Time complexity O(n)")}</span></div></div>
      </div>
    </div>
  </div>
);

const DashboardPreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[#0e1712] p-4 text-left text-[#edf7ef] shadow-[0_48px_110px_rgba(5,25,13,.28)] sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-2xl bg-[#00ff88]/15 text-[#62ecaa]"><Sparkles className="size-5" /></div><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#62ecaa]">{tr("Сьогодні", "Today")} · Java</div><div className="mt-1 text-xl font-black tracking-[-.04em]">{tr("Твій наступний крок", "Your next step")}</div></div></div>
      <button className="rounded-xl border border-white/15 px-3 py-2 text-xs font-bold text-[#c9d9cd]">{tr("Змінити тему", "Change topic")}</button>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.65fr)]">
      <section className="rounded-[26px] border border-white/10 bg-[#142219] p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-[#ffb454]">{tr("Поточний фокус", "Current focus")}</span><span className="rounded-full bg-[#00ff88]/12 px-3 py-1 text-[10px] font-bold text-[#62ecaa]">{tr("У процесі", "In progress")}</span></div><h4 className="mt-5 max-w-xl text-3xl font-black tracking-[-.065em] sm:text-4xl">{tr("Вступ до Java: типи, які мають сенс", "Java foundations: types that make sense")}</h4><p className="mt-3 max-w-xl text-sm leading-6 text-[#b7c8bb]">{tr("Коротка теорія, одна практика і зрозумілий результат. Платформа веде тебе до наступної дії, а не до ще одного меню.", "A short concept, one practice and a clear result. The platform guides your next action instead of adding another menu.")}</p><div className="mt-6 flex flex-wrap items-center gap-3"><button className="rounded-xl bg-[#00ff88] px-4 py-3 text-xs font-black text-[#062211]"><Play className="mr-1.5 inline size-3.5 fill-current" />{tr("Продовжити", "Continue")}</button><span className="text-xs text-[#9eb2a3]">{tr("12 хв залишилось", "12 min left")}</span></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-[68%] rounded-full bg-[#00ff88]" /></div><div className="mt-2 flex justify-between text-[10px] font-bold text-[#8ea392]"><span>{tr("Прогрес теми", "Topic progress")}</span><span>68%</span></div></section>
      <aside className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><div className="rounded-[26px] border border-white/10 bg-[#17271d] p-5"><div className="flex items-center justify-between text-xs text-[#b7c8bb]"><span>{tr("Результат", "Result")}</span><BarChart3 className="size-4 text-[#62ecaa]" /></div><div className="mt-3 text-4xl font-black tracking-[-.07em]">86<span className="ml-1 text-base text-[#8fa598]">/100</span></div><div className="mt-3 text-xs text-[#9eb2a3]">{tr("+8 за останню практику", "+8 from the last practice")}</div></div><div className="rounded-[26px] border border-[#ff8c00]/25 bg-[#241d11] p-5"><div className="flex items-center gap-2 text-xs font-bold text-[#ffb454]"><Flame className="size-4" />{tr("Ритм навчання", "Learning rhythm")}</div><div className="mt-3 text-2xl font-black">4 {tr("дні", "days")}</div><div className="mt-1 text-xs text-[#c8b38c]">{tr("Ще одна коротка практика сьогодні", "One more short practice today")}</div></div></aside>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-[#121e16] p-4"><BookOpen className="size-4 text-[#62ecaa]" /><div className="mt-4 text-sm font-black">{tr("Теорія", "Theory")}</div><div className="mt-1 text-xs text-[#8fa598]">{tr("3 поняття · 8 хв", "3 concepts · 8 min")}</div></div><div className="rounded-2xl border border-white/10 bg-[#121e16] p-4"><Code2 className="size-4 text-[#ffb454]" /><div className="mt-4 text-sm font-black">{tr("Практика", "Practice")}</div><div className="mt-1 text-xs text-[#8fa598]">{tr("1 задача · автоперевірка", "1 task · auto-check")}</div></div><div className="rounded-2xl border border-white/10 bg-[#121e16] p-4"><Trophy className="size-4 text-[#ffd93d]" /><div className="mt-4 text-sm font-black">{tr("Наступна ціль", "Next milestone")}</div><div className="mt-1 text-xs text-[#8fa598]">{tr("Закрий тему на 80%", "Reach 80% in this topic")}</div></div></div>
  </div>
);

const PracticePreview: React.FC<{ tr: Translate }> = ({ tr }) => (
  <div className={`${card} overflow-hidden bg-[#f8faf7] dark:bg-[#101814]`}>
    <div className="grid min-h-[520px] grid-cols-[320px_minmax(0,1fr)_360px] max-lg:grid-cols-1">
      <aside className="border-r border-[#142017]/10 bg-white/86 p-6 dark:border-white/10 dark:bg-white/[.04]">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#00ff88]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[.14em] text-[#007f48]">
          <FlaskConical className="size-3.5" />
          Personal practice
        </span>
        <div className="mt-4 text-2xl font-bold tracking-[-.045em]">{tr("Тренувальна студія", "Practice studio")}</div>
        <p className="mt-2 text-sm leading-6 text-[#65746a] dark:text-[#aab7ad]">{tr("Умова, редактор і результат зібрані в одному робочому полотні.", "Statement, editor and results stay together in one focused workspace.")}</p>
        <div className="mt-6 rounded-2xl border border-[#142017]/10 bg-[#f1f6f2] p-3 dark:border-white/10 dark:bg-white/[.045]">
          <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7a887e]">stdin</div>
          <div className="mt-2 rounded-xl bg-white p-3 font-mono text-xs dark:bg-[#101713]">5</div>
        </div>
        <button className="mt-4 w-full rounded-2xl bg-[#173321] px-4 py-3 text-xs font-bold text-white dark:bg-[#00d978] dark:text-[#062211]"><Play className="mr-1.5 inline size-3.5" />Run</button>
      </aside>
      <main className="min-w-0 overflow-hidden bg-[#101713]">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3"><span className="size-2.5 rounded-full bg-[#ff6b9d]" /><span className="size-2.5 rounded-full bg-[#ffd93d]" /><span className="size-2.5 rounded-full bg-[#00ff88]" /><span className="ml-2 text-[10px] text-[#aab7ad]">main.py</span></div>
        <pre className="m-0 min-h-[470px] max-w-full overflow-x-auto whitespace-pre-wrap break-words p-8 font-mono text-[clamp(11px,1vw,13px)] leading-8 text-[#dbe7df] max-md:min-h-[320px] max-md:p-6"><span className={codeColors.keyword}>n</span> = int(input()){"\n"}total = 0{"\n"}<span className={codeColors.keyword}>for</span> i <span className={codeColors.keyword}>in</span> range(1, n + 1):{"\n"}    total += i{"\n"}print(total)</pre>
      </main>
      <aside className="border-l border-[#142017]/10 bg-white/86 p-6 dark:border-white/10 dark:bg-white/[.04]">
        <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#7a887e]">Output</div>
        <div className="mt-3 rounded-2xl bg-[#101713] p-4 font-mono text-sm text-[#dbe7df]">15</div>
        <div className="mt-5 text-[10px] font-bold uppercase tracking-[.14em] text-[#7a887e]">{tr("Візуалізація", "Visualizer")}</div>
        <div className="mt-3 rounded-2xl border border-[#142017]/10 bg-[#f1f6f2] p-4 dark:border-white/10 dark:bg-white/[.045]">
          <div className="flex justify-between text-xs"><span>line 4</span><strong className="text-[#007f48]">step 3/5</strong></div>
          <div className="mt-4 grid gap-2 font-mono text-[11px]">
            <span className="rounded-xl bg-white px-3 py-2 dark:bg-[#101713]">i = 5</span>
            <span className="rounded-xl bg-white px-3 py-2 dark:bg-[#101713]">total = 15</span>
          </div>
        </div>
      </aside>
    </div>
  </div>
);

const FailureLoopPreview: React.FC<{ tr: Translate }> = ({ tr }) => {
  const steps = [
    { label: tr("Невдала спроба", "Failed attempt"), tone: "border-[#ff6b9d]/30 bg-[#ff6b9d]/10 text-[#ff9aba]", icon: "!" },
    { label: tr("Знайдена проблема", "Problem found"), tone: "border-[#ffb454]/30 bg-[#ffb454]/10 text-[#ffca78]", icon: "?" },
    { label: tr("Поступова підказка", "Guided hint"), tone: "border-[#60e5aa]/30 bg-[#60e5aa]/10 text-[#72edb0]", icon: "→" },
    { label: tr("Виправлений код", "Fixed code"), tone: "border-[#60e5aa]/30 bg-[#60e5aa]/10 text-[#72edb0]", icon: "✓" },
    { label: tr("Навичку закріплено", "Skill reinforced"), tone: "border-[#ffd93d]/30 bg-[#ffd93d]/10 text-[#ffe47a]", icon: "★" },
  ];
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#101713] p-5 text-left text-[#edf7ef] shadow-[0_48px_110px_rgba(5,25,13,.28)] sm:p-7">
      <div className="absolute -right-24 -top-28 size-72 rounded-full bg-[#00ff88]/10 blur-3xl" />
      <div className="relative flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-5">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-[#62ecaa]">Failure → Skill</div><div className="mt-2 text-2xl font-black tracking-[-.05em] sm:text-3xl">{tr("Кожна спроба веде далі", "Every attempt moves you forward")}</div></div>
        <span className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold text-[#b8cbbb]">Python · loops</span>
      </div>
      <div className="relative mt-6 grid gap-3 sm:grid-cols-5">
        {steps.map((step, index) => <div key={step.label} className="relative">{index < steps.length - 1 ? <span className="absolute left-[calc(50%+22px)] right-[-12px] top-5 hidden h-px bg-white/15 sm:block" /> : null}<div className={`relative z-10 flex min-h-[126px] flex-col justify-between rounded-2xl border p-3 ${step.tone}`}><span className="grid size-8 place-items-center rounded-xl bg-white/10 text-sm font-black">{step.icon}</span><span className="text-xs font-bold leading-5">{step.label}</span></div></div>)}
      </div>
      <div className="relative mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/[.045] p-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#ffb454]">{tr("Поточний крок", "Current step")}</div><div className="mt-2 font-mono text-xs text-[#dce9df]">{tr("Перевір, що відбувається на межі циклу", "Check what happens at the loop boundary")}</div></div><div className="rounded-xl bg-[#00ff88]/10 px-3 py-2 text-center text-xs font-bold text-[#72edb0]">{tr("Підказка 1 з 3", "Hint 1 of 3")}</div></div>
    </div>
  );
};

const TeacherRadarPreview: React.FC<{ tr: Translate }> = ({ tr }) => {
  const students = [
    { initials: "АК", name: tr("Анна К.", "Anna K."), task: tr("Межі циклу", "Loop boundaries"), status: tr("Застрягла", "Stuck"), tone: "text-[#c84268]", bar: "bg-[#ff6b9d]", width: "38%" },
    { initials: "ОМ", name: tr("Олег М.", "Oleh M."), task: tr("Списки", "Lists"), status: tr("Працює", "Working"), tone: "text-[#ad6900]", bar: "bg-[#ffb454]", width: "68%" },
    { initials: "ІС", name: tr("Ірина С.", "Iryna S."), task: tr("Функції", "Functions"), status: tr("Пройшла", "Passed"), tone: "text-[#147b47]", bar: "bg-[#00b963]", width: "100%" },
  ];
  return <div className="overflow-hidden rounded-[24px] border border-[#122017]/10 bg-[#f8faf7] p-4 shadow-[0_22px_50px_rgba(18,32,23,.08)] dark:border-white/10 dark:bg-[#101713] sm:p-5">
    <div className="flex items-center justify-between gap-3 border-b border-[#122017]/10 pb-4 dark:border-white/10">
      <div><div className="text-[10px] font-black uppercase tracking-[.16em] text-[#ad6900]">{tr("Live radar класу", "Live class radar")}</div><div className="mt-1 text-sm font-bold">{tr("Що відбувається прямо зараз", "What is happening right now")}</div></div>
      <span className="flex items-center gap-1.5 rounded-full bg-[#00ff88]/10 px-2.5 py-1 text-[10px] font-bold text-[#147b47]"><span className="size-1.5 rounded-full bg-[#00b963]" />LIVE</span>
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2">
      {[["3", tr("застрягли", "stuck"), "bg-[#fff0f4] text-[#c84268]"], ["11", tr("працюють", "working"), "bg-[#fff7e9] text-[#ad6900]"], ["4", tr("пройшли", "passed"), "bg-[#eaf9ef] text-[#147b47]"]].map(([value, label, tone]) => <div key={label} className={`rounded-xl p-3 ${tone}`}><div className="text-xl font-black">{value}</div><div className="mt-1 text-[10px] font-semibold">{label}</div></div>)}
    </div>
    <div className="mt-4 divide-y divide-[#122017]/10 rounded-xl border border-[#122017]/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/[.035]">
      {students.map((student) => <div key={student.name} className="grid grid-cols-[30px_1fr_auto] items-center gap-2.5 p-3">
        <span className="grid size-7 place-items-center rounded-lg bg-[#ffe7c6] text-[9px] font-bold text-[#6e3e00]">{student.initials}</span>
        <div className="min-w-0"><div className="flex items-center justify-between gap-2 text-[11px] font-semibold"><span>{student.name}</span><span className={student.tone}>{student.status}</span></div><div className="mt-1 text-[10px] text-[#7a887e]">{student.task}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-[#edf0eb] dark:bg-white/10"><span className={`block h-full rounded-full ${student.bar}`} style={{ width: student.width }} /></div></div>
        <span className="text-[10px] font-semibold text-[#7a887e]">{student.width}</span>
      </div>)}
    </div>
    <div className="mt-4 rounded-xl border border-[#ffb454]/25 bg-[#ffb454]/[.08] p-3"><div className="text-[10px] font-black uppercase tracking-[.14em] text-[#ad6900]">{tr("Наступна дія для викладача", "Teacher next action")}</div><p className="mt-1.5 text-xs leading-5 text-[#6f5632] dark:text-[#ddc18f]">{tr("3 учні повторюють помилку на межі циклу. Поясни один edge case всьому класу або відкрий код Анни.", "3 learners repeat a loop-boundary error. Explain one edge case to the class or open Anna’s code.")}</p></div>
  </div>;
};

export const PublicLandingPage: React.FC = () => {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const navigate = (path: string) => window.location.assign(path);
  const tr: Translate = (uk, en) => i18n.language?.toLowerCase().startsWith("en") ? en : uk;
  const goToAuth = (mode: "login" | "register") => navigate(`/?auth=${mode}`);
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  const reveal = reduceMotion ? {} : { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.14 }, transition: { duration: 0.65, ease: easing } };

  return (
    <div id="studycod-landing" className="min-h-[100dvh] overflow-hidden bg-[radial-gradient(circle_at_50%_-10%,rgba(0,255,136,0.08),transparent_30rem)] bg-[#f7f8f5] font-sans text-[#111814] selection:bg-[#00ff88]/40 [&_h1]:font-sans [&_h2]:font-sans [&_h3]:font-sans [&_h4]:font-sans dark:bg-[radial-gradient(circle_at_50%_-10%,rgba(0,255,136,0.055),transparent_32rem)] dark:bg-[#0b100d] dark:text-[#edf3ef]">
      <PublicProductNav active="home" homeMode />

      <main>
        <section className="relative mx-auto w-[min(1240px,calc(100%_-_48px))] pb-20 pt-[158px] text-center max-md:w-[calc(100%_-_28px)] max-md:pb-14 max-md:pt-[116px]">
          <div className="pointer-events-none absolute left-1/2 top-20 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(0,255,136,.1),rgba(255,140,0,.025)_43%,transparent_70%)] blur-2xl" />
          <motion.div className="relative z-10 mx-auto max-w-[900px]" initial={reduceMotion ? undefined : { opacity: 0, y: 24 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.75, ease: easing }}>
            <div className="mx-auto mb-6 flex w-fit items-center gap-2.5 rounded-full border border-[#122017]/10 bg-white/85 py-1 pl-1 pr-3.5 text-xs font-semibold text-[#667169] shadow-sm dark:border-white/10 dark:bg-[#182019]/90 dark:text-[#aab5ad]"><span className="grid size-7 place-items-center rounded-full bg-[#00ff88] text-[#082015]"><Sparkles className="size-3.5" /></span>{tr("Навчання, яке переходить у навичку", "Learning that becomes a skill")}</div>
            <h1 className="m-0 text-balance text-[clamp(46px,6.2vw,82px)] font-bold leading-[0.99] tracking-[-0.055em] max-md:text-[clamp(40px,12.4vw,59px)]">{tr("Перетворюй кожну помилку в коді на навичку.", "Turn every coding mistake into a skill.")}</h1>
            <p className="mx-auto mt-7 max-w-[730px] text-balance text-lg leading-8 text-[#667169] max-md:mt-5 max-md:text-base max-md:leading-7">{tr("Пиши код, зрозумій, чому він не працює, виправ його з підказками та збирай докази власних навичок.", "Write code, understand why it fails, fix it with guided hints, and build evidence of what you can do.")}</p>
             <div className="mt-8 flex justify-center gap-3 max-md:flex-col"><GreenButton onClick={() => goToAuth("register")} className="max-md:w-full">{tr("Спробувати задачу", "Try a coding challenge")}<ArrowRight className="size-4" /></GreenButton><button onClick={() => scrollTo("loop")} className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#122017]/10 bg-white px-6 text-sm font-bold shadow-[0_12px_30px_rgba(18,32,23,0.05)] transition hover:-translate-y-0.5 hover:border-[#00b963]/30 dark:border-white/10 dark:bg-[#182019] dark:shadow-[0_12px_30px_rgba(0,0,0,.18)] max-md:w-full"><CirclePlay className="size-[18px] text-[#00a85c]" />{tr("Як це працює", "How it works")}</button><button onClick={() => scrollTo("proof")} className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#ffb454]/30 bg-[#fff7e9] px-6 text-sm font-bold text-[#7a4d00] shadow-[0_12px_30px_rgba(18,32,23,0.04)] transition hover:-translate-y-0.5 dark:border-[#ffb454]/20 dark:bg-[#ffb454]/[.08] dark:text-[#ffca78] max-md:w-full"><Users className="size-[18px]" />{tr("Для викладача", "For teachers")}</button></div>
            <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2.5 text-[13px] text-[#667169] max-md:text-xs">{[tr("Безкоштовний старт", "Free to start"), tr("Задачі з автоперевіркою", "Auto-checked tasks"), tr("Для класу й самонавчання", "For class and self-study")].map((item) => <span key={item} className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-[#00a85c]" />{item}</span>)}</div>
          </motion.div>
          <motion.div className="relative z-20 mx-auto mt-20 max-w-[1120px] max-md:mt-12" initial={reduceMotion ? undefined : { opacity: 0, y: 36, scale: 0.985 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.85, delay: 0.12, ease: easing }}><FailureLoopPreview tr={tr} /></motion.div>
        </section>

         <section id="loop" className="mx-auto flex w-[min(1120px,calc(100%_-_48px))] items-center justify-center gap-12 border-y border-[#122017]/10 py-9 text-[#667169] max-md:w-[calc(100%_-_28px)] max-md:flex-col max-md:gap-4">
          <p className="m-0 max-w-[420px] text-center text-lg font-bold tracking-[-.02em] text-[#111814] dark:text-[#edf3ef]">{tr("Невдала спроба — це не кінець. Це наступний крок.", "A failed attempt is not the end. It is the next step.")}</p>
          <div className="flex items-center gap-6 text-[12px] font-bold max-md:w-full max-md:justify-between max-md:gap-2">{[tr("Написати код", "Write code"),tr("Зрозуміти збій", "Understand the failure"),tr("Виправити самостійно", "Fix it yourself"),tr("Закріпити навичку", "Reinforce the skill")].map((label, index) => <span key={label} className="flex items-center gap-2 text-[#111814] dark:text-[#edf3ef]"><span className="grid size-6 place-items-center rounded-full bg-[#00ff88]/20 text-[10px] text-[#007f48]">{index + 1}</span>{label}</span>)}</div>
         </section>

         <section id="proof" className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-10 pt-[130px] max-md:w-[calc(100%_-_28px)] max-md:pt-24">
           <motion.div {...reveal} className="mx-auto mb-12 max-w-[820px] text-center"><span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#007f48]">{tr("Два докази. Один процес.", "Two proofs. One learning loop.")}</span><h2 className="mt-4 text-balance text-[clamp(36px,4.5vw,56px)] font-bold leading-[1.06] tracking-[-.045em]">{tr("Учень бачить наступний крок. Викладач бачить реальне розуміння.", "Learners see the next step. Teachers see real understanding.")}</h2><p className="mx-auto mt-5 max-w-[650px] text-base leading-7 text-[#667169]">{tr("StudyCod з’єднує результат кожної спроби з дією для учня та сигналом для викладача.", "StudyCod connects every attempt’s result to a learner action and a teacher signal.")}</p></motion.div>
           <div className="grid gap-[18px] lg:grid-cols-[.86fr_1.14fr]">
             <motion.article {...reveal} className={`${card} p-7 sm:p-8`}><div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#007f48]"><span className={iconTile}><GraduationCap className="size-5" /></span>{tr("Доказ учня", "Learner proof")}</div><h3 className="mt-7 text-[28px] font-bold leading-[1.1] tracking-[-.04em]">{tr("Не просто правильна відповідь — подолана помилка.", "Not just a correct answer — an overcome mistake.")}</h3><p className="mt-4 text-[15px] leading-7 text-[#667169]">{tr("Кожна здача залишає зрозумілий слід: що не пройшло, яка підказка допомогла і що вдалося виправити.", "Every submission leaves a clear trail: what failed, which hint helped, and what was fixed.")}</p><div className="mt-7 space-y-2 rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]">{[tr("4 / 5 тестів пройдено", "4 / 5 tests passed"), tr("Помилка: межа діапазону", "Failure: boundary condition"), tr("Підказка 2 з 3 → повторна спроба", "Hint 2 of 3 → retry"), tr("Навичку закріплено", "Skill reinforced")].map((item, index) => <div key={item} className="flex items-center gap-2 text-xs font-semibold text-[#526157] dark:text-[#c1cdc4]"><span className={`grid size-5 place-items-center rounded-full text-[10px] ${index === 3 ? "bg-[#00d978] text-[#062211]" : "bg-[#dceee1] text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]"}`}>{index === 3 ? "✓" : index + 1}</span>{item}</div>)}</div></motion.article>
             <motion.article {...reveal} className={`${card} bg-[linear-gradient(145deg,#fff,rgba(255,180,84,.08))] p-7 sm:p-8 dark:bg-[linear-gradient(145deg,#151c17,rgba(255,180,84,.08))]`}><div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-[#ad6900]"><span className={`${iconTile} bg-[#ffb454]/10 text-[#ad6900]`}><Users className="size-5" /></span>{tr("Доказ викладача", "Teacher proof")}</div><span className="rounded-full bg-[#00ff88]/10 px-2.5 py-1 text-[10px] font-bold text-[#147b47]">{tr("У реальному часі", "Real time")}</span></div><h3 className="text-[28px] font-bold leading-[1.1] tracking-[-.04em]">{tr("Не лише оцінка — карта того, де класу потрібна допомога.", "Not just a score — a map of where the class needs help.")}</h3><p className="mt-4 text-[15px] leading-7 text-[#667169]">{tr("Поки йде live-урок, викладач бачить статуси, повторювані помилки та наступну дію.", "During a live lesson, teachers see statuses, recurring errors, and the next action.")}</p><div className="mt-7"><TeacherRadarPreview tr={tr} /></div></motion.article>
           </div>
         </section>

        <section id="platform" className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-10 pt-[150px] max-md:w-[calc(100%_-_28px)] max-md:pt-24">
          <motion.div {...reveal} className="mx-auto mb-14 max-w-[740px] text-center max-md:mb-10"><span className="mb-4 inline-block text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#007f48]">{tr("Навчання через спроби", "Learning through attempts")}</span><h2 className="m-0 text-balance text-[clamp(36px,4.5vw,56px)] font-bold leading-[1.06] tracking-[-0.045em]">{tr("Помилка стає зрозумілою, а наступний крок — очевидним.", "The mistake becomes clear. The next step becomes obvious.")}</h2><p className="mx-auto mt-5 max-w-[630px] text-base leading-7 text-[#667169]">{tr("Код, тест і підказка працюють разом, щоб учень сам побачив, що змінилося після виправлення.", "Code, tests, and guided hints work together so learners can see what changed after the fix.")}</p></motion.div>
          <motion.div {...reveal} className="grid grid-cols-2 gap-[18px] max-md:grid-cols-1">
            <article className={`${card} row-span-2 min-h-[742px] bg-[linear-gradient(145deg,rgba(0,255,136,.055),#fff_43%)] p-10 dark:bg-[linear-gradient(145deg,rgba(0,255,136,.08),#151d17_43%)] max-md:row-auto max-md:min-h-0 max-md:p-7`}><span className={iconTile}><BookOpen className="size-5" /></span><h3 className="mt-9 max-w-md text-[28px] font-bold leading-[1.1] tracking-[-0.04em] max-md:text-2xl">{tr("Курси з чітким маршрутом", "Courses with a clear path")}</h3><p className="mt-4 max-w-lg text-[15px] leading-7 text-[#667169]">{tr("Теорія, приклади й практика зібрані в послідовність, яка не перевантажує.", "Theory, examples, and practice form a sequence that never overwhelms.")}</p><div className="mt-16 -rotate-1 rounded-[20px] border border-[#122017]/10 bg-white p-3.5 shadow-[0_24px_48px_rgba(16,34,22,0.09)] dark:border-white/10 dark:bg-[#111913] dark:shadow-[0_24px_48px_rgba(0,0,0,.28)] max-md:mt-10">{[["done",tr("Змінні й типи даних","Variables and data types"),"100%"],["08",tr("Функції та модулі","Functions and modules"),"68%"],["09",tr("Колекції","Collections"),"0%"]].map(([n,label,value], index) => <div key={n} className={`grid h-[70px] grid-cols-[32px_1fr_auto] items-center gap-3 px-4 ${index === 1 ? "rounded-xl bg-[#00ff88]/[0.08]" : index > 0 ? "border-t border-[#122017]/10 dark:border-white/10" : ""}`}><span className={`grid size-7 place-items-center rounded-lg text-[10px] font-bold ${n === "done" ? "bg-[#00ff88] text-[#062315]" : index === 1 ? "bg-[#00ff88]/20 text-[#007f48]" : "bg-[#edf0eb] text-[#667169] dark:bg-white/10"}`}>{n === "done" ? <Check className="size-3.5" /> : n}</span><strong className="text-xs">{label}</strong><small className={`text-[10px] ${index === 1 ? "font-bold text-[#007f48]" : "text-[#667169]"}`}>{value}</small></div>)}</div></article>
            <article className={`${card} min-h-[362px] p-8 max-md:min-h-0 max-md:p-7`}><span className={`${iconTile} bg-[#ff8c00]/10 text-[#ad5d00]`}><Lightbulb className="size-5" /></span><h3 className="mt-8 text-[27px] font-bold leading-[1.1] max-md:text-2xl">{tr("Пояснення у потрібний момент", "Guidance at the right moment")}</h3><p className="mt-4 text-[15px] leading-7 text-[#667169]">{tr("Підказки допомагають рухатися далі, не забираючи відчуття власного рішення.", "Hints keep learners moving without taking away the satisfaction of solving it themselves.")}</p><div className="mt-7 flex items-start gap-3 rounded-2xl border border-[#ff8c00]/15 bg-[#ff8c00]/[0.06] p-4 text-[13px] leading-5 text-[#667169]"><Sparkles className="mt-0.5 size-4 shrink-0 text-[#d47500]" />{tr("Подумай, яку структуру даних зручно перевіряти на унікальність.", "Which data structure makes uniqueness easy to check?")}</div></article>
            <article className={`${card} min-h-[362px] p-8 max-md:min-h-0 max-md:p-7`}><span className={`${iconTile} bg-[#ffd93d]/20 text-[#8f7000]`}><Trophy className="size-5" /></span><h3 className="mt-8 text-[27px] font-bold leading-[1.1] max-md:text-2xl">{tr("Прогрес, який мотивує", "Progress that motivates")}</h3><p className="mt-4 text-[15px] leading-7 text-[#667169]">{tr("Цілі, серії та зрозуміла аналітика показують не просто бали, а реальний рух уперед.", "Goals, streaks, and clear analytics reveal real momentum—not just scores.")}</p><div className="mt-7 grid grid-cols-3 gap-3 border-t border-[#122017]/10 pt-5">{[["24",tr("задачі","tasks")],["8.6",tr("середній бал","avg. score")],["12",tr("днів поспіль","day streak")]].map(([value,label]) => <div key={value} className="flex flex-col"><strong className="text-xl">{value}</strong><span className="mt-1 text-[11px] leading-4 text-[#667169]">{label}</span></div>)}</div></article>
          </motion.div>
        </section>

        <section className="mx-auto mt-28 w-[min(1240px,calc(100%_-_48px))] rounded-[32px] bg-[#101713] px-14 py-24 text-[#f3faf6] shadow-[0_35px_82px_rgba(12,25,17,0.15)] max-md:mt-20 max-md:w-[calc(100%_-_28px)] max-md:rounded-[25px] max-md:px-7 max-md:py-16">
          <motion.div {...reveal} className="text-center"><span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#68efb0]">{tr("Навчальний ритм", "Learning rhythm")}</span><h2 className="mt-4 text-balance text-[clamp(38px,4.5vw,58px)] font-bold leading-[1.05] tracking-[-0.045em]">{tr("Вивчай. Розв’язуй. Розумій.", "Learn. Solve. Understand.")}</h2></motion.div>
          <motion.div {...reveal} className="mt-16 grid grid-cols-3 max-md:mt-10 max-md:grid-cols-1">{[
            ["01",BookOpen,tr("Зрозумій тему","Understand the idea"),tr("Коротка теорія та приклади дають опору перед практикою.","Focused theory and examples build a foundation before practice.")],
            ["02",Code2,tr("Закріпи кодом","Reinforce with code"),tr("Задачі ростуть разом із навичкою — від базових до комплексних.","Tasks grow with the skill—from foundational to complex.")],
            ["03",BarChart3,tr("Побач прогрес","See the progress"),tr("Результати показують сильні теми й те, куди спрямувати увагу.","Results reveal strengths and where to focus next.")],
          ].map(([number,Icon,title,text], index) => { const StepIcon = Icon as typeof BookOpen; return <article key={String(number)} className={`px-10 first:pl-0 last:pr-0 ${index ? "border-l border-white/10" : ""} max-md:border-l-0 max-md:border-t max-md:border-white/10 max-md:px-0 max-md:py-8 max-md:first:border-0 max-md:first:pt-0`}><span className="text-[10px] font-bold tracking-[0.15em] text-[#68736c]">{String(number)}</span><span className="my-7 grid size-12 place-items-center rounded-[15px] border border-white/10 bg-white/[0.055] text-[#62f3af]"><StepIcon className="size-5" /></span><h3 className="text-[22px] font-bold">{String(title)}</h3><p className="mt-3 text-sm leading-6 text-[#a9b5ad]">{String(text)}</p></article>; })}</motion.div>
        </section>

        <section id="practice" className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-10 pt-40 max-md:w-[calc(100%_-_28px)] max-md:pt-24">
          <motion.div {...reveal} className="mb-14 grid grid-cols-[1.15fr_.72fr] items-end gap-20 max-md:mb-10 max-md:grid-cols-1 max-md:gap-5"><div><span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#007f48]">{tr("Практика без зайвого тертя", "Practice without friction")}</span><h2 className="mt-4 text-balance text-[clamp(36px,4.5vw,56px)] font-bold leading-[1.06] tracking-[-0.045em]">{tr("Від умови до працюючого коду — в одному фокусі.", "From prompt to working code—in one focused space.")}</h2></div><p className="mb-1 text-[15px] leading-7 text-[#667169]">{tr("Редактор, тести й зрозумілий результат поруч. Учень думає про алгоритм, а не про налаштування середовища.", "Editor, tests, and clear feedback stay together. Learners think about the algorithm, not environment setup.")}</p></motion.div>
          <motion.div {...reveal}><PracticePreview tr={tr} /></motion.div>
        </section>

        <section id="roles" className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-12 pt-36 max-md:w-[calc(100%_-_28px)] max-md:pt-24">
          <motion.div {...reveal} className="mx-auto mb-14 max-w-[830px] text-center"><span className="text-[11px] font-extrabold uppercase tracking-[0.13em] text-[#007f48]">{tr("Дві перспективи. Один процес.", "Two perspectives. One learning loop.")}</span><h2 className="mt-4 text-balance text-[clamp(36px,4.5vw,56px)] font-bold leading-[1.06] tracking-[-0.045em]">{tr("Учню — ясність. Викладачу — контроль без мікроменеджменту.", "Clarity for students. Control without micromanagement for teachers.")}</h2></motion.div>
          <div className="grid grid-cols-2 gap-[18px] max-md:grid-cols-1">{[
            { teacher:false, Icon:GraduationCap, label:tr("Для учня","For learners"), title:tr("Зрозумій помилку й знай, що робити далі","Understand mistakes and know what to do next"), body:tr("Побач невдалий крок, отримай підказку потрібного рівня та виправ рішення самостійно.","See the failed step, get the right level of guidance, and fix the solution yourself."), bullets:[tr("Поступові підказки без готового коду","Progressive hints without the full code"),tr("Зрозумілий результат кожної спроби","Clear feedback after every attempt"),tr("Докази тем, які вже практикував","Evidence of practiced skills")]},
            { teacher:true, Icon:Users, label:tr("Для викладача","For teachers"), title:tr("Побач, що учні справді розуміють","See what students actually understand"), body:tr("Дивись не лише на фінальний бал, а й на спроби, помилки та теми, де потрібен наступний крок.","See more than final scores: attempts, mistakes, and the topics that need a next step."), bullets:[tr("Розуміння за темами, а не лише оцінка","Understanding by topic, not only a score"),tr("Сигнали, де учень застряг","Signals when a learner is stuck"),tr("Докази прогресу після виправлень","Evidence of progress after fixes")]},
          ].map(({teacher,Icon,label,title,body,bullets}) => <motion.article {...reveal} key={label} className={`${card} min-h-[690px] overflow-hidden bg-[linear-gradient(160deg,#fff,rgba(0,255,136,.04))] p-10 max-md:min-h-0 max-md:p-7 ${teacher ? "bg-[linear-gradient(160deg,#fff,rgba(255,140,0,.045))]" : ""}`}><div className="flex items-center gap-3 text-[11px] font-extrabold uppercase tracking-[0.1em] text-[#667169]"><span className={`${iconTile} ${teacher ? "bg-[#ff8c00]/10 text-[#ad5d00]" : ""}`}><Icon className="size-5" /></span>{label}</div><h3 className="mt-8 text-[32px] font-bold leading-[1.08] max-md:text-[27px]">{title}</h3><p className="mt-4 text-[15px] leading-7 text-[#667169]">{body}</p><ul className="mt-7 space-y-3.5 p-0">{bullets.map((bullet) => <li key={bullet} className="flex items-center gap-2.5 text-[13px] text-[#667169]"><Check className="size-4 rounded-full bg-[#00ff88] p-0.5 text-[#062315]" />{bullet}</li>)}</ul>{teacher ? <div className="mt-10 -rotate-1 rounded-[20px] border border-[#122017]/10 bg-white p-5 shadow-[0_22px_50px_rgba(18,32,23,0.08)]"><div className="flex justify-between border-b border-[#122017]/10 pb-4 text-xs"><span>{tr("Група Python · 10А","Python group · 10A")}</span><small className="text-[11px] text-[#667169]">18 {tr("учнів","students")}</small></div>{[88,72,58].map((value,index) => <div key={value} className="grid h-[58px] grid-cols-[30px_1fr_auto] items-center gap-2.5 border-b border-[#122017]/10 last:border-0"><span className="grid size-7 place-items-center rounded-lg bg-[#ffe7c6] text-[8px] font-bold text-[#6e3e00]">{["АК","ОМ","ІС"][index]}</span><div className="flex flex-col gap-1.5"><strong className="text-[10px]">{[tr("Анна К.","Anna K."),tr("Олег М.","Oleh M."),tr("Ірина С.","Iryna S.")][index]}</strong><i className="h-1 overflow-hidden rounded-full bg-[#edf0eb]"><b style={{width:`${value}%`}} className="block h-full rounded-full bg-[#ff8c00]" /></i></div><small className="text-[9px] text-[#667169]">{value}%</small></div>)}</div> : <div className="mt-12 rotate-1 rounded-[20px] border border-[#122017]/10 bg-white p-5 shadow-[0_22px_50px_rgba(18,32,23,0.08)]"><div className="flex justify-between text-xs"><span>{tr("Мій тиждень","My week")}</span><strong className="text-[#007f48]">4 / 5</strong></div><div className="relative mt-6 flex justify-between before:absolute before:left-[8%] before:right-[8%] before:top-4 before:h-0.5 before:bg-[#edf0eb]">{[1,2,3,4,5].map(n => <i key={n} className={`relative z-10 grid size-8 place-items-center rounded-full border-[3px] border-white text-[9px] not-italic ${n < 5 ? "bg-[#00ff88] text-[#062315]" : "bg-[#edf0eb] text-[#667169]"}`}>{n < 5 ? <Check className="size-3.5" /> : n}</i>)}</div></div>}</motion.article>)}</div>
        </section>

        <section className="relative mx-auto mt-28 w-[min(1240px,calc(100%_-_48px))] overflow-hidden rounded-[33px] bg-[#101713] px-6 py-28 text-center text-[#f5fbf7] shadow-[0_40px_95px_rgba(12,25,17,0.18)] max-md:mt-20 max-md:w-[calc(100%_-_28px)] max-md:rounded-[25px] max-md:py-20">
          <div className="absolute -left-48 -top-56 size-[470px] rounded-full bg-[#00ff88]/10 blur-[90px]" /><div className="absolute -bottom-64 -right-52 size-[470px] rounded-full bg-[#ff8c00]/10 blur-[90px]" />
          <motion.div {...reveal} className="relative z-10 mx-auto max-w-[790px]"><span className="mx-auto mb-7 grid size-16 place-items-center rounded-[20px] border border-white/10 bg-white/[0.07]"><Logo size={38} /></span><h2 className="text-balance text-[clamp(40px,5vw,64px)] font-bold leading-[1.04] tracking-[-0.05em]">{tr("Побудуй навичку, яка залишиться з тобою.", "Build a skill that stays with you.")}</h2><p className="mx-auto mt-6 max-w-[600px] text-base leading-7 text-[#b1bcb5]">{tr("Почни з першого уроку сьогодні. StudyCod допоможе тримати темп далі.", "Start with your first lesson today. StudyCod will help you keep the momentum.")}</p><GreenButton onClick={() => goToAuth("register")} className="mx-auto mt-8">{tr("Створити акаунт", "Create an account")}<ArrowRight className="size-4" /></GreenButton><span className="mt-5 flex items-center justify-center gap-2 text-[13px] text-[#9eaaa2]"><ShieldCheck className="size-4" />{tr("Без картки · Початок за кілька хвилин", "No card required · Start in minutes")}</span></motion.div>
        </section>
      </main>

      <footer className="mx-auto w-[min(1120px,calc(100%_-_48px))] pb-8 pt-24 max-md:w-[calc(100%_-_28px)] max-md:pt-20">
        <div className="grid grid-cols-[1fr_1.4fr] gap-24 pb-16 max-md:grid-cols-1 max-md:gap-12">
          <div><button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 bg-transparent text-xl font-bold tracking-[-0.04em]"><span className="grid size-9 place-items-center rounded-xl border border-[#122017]/10 bg-white shadow-sm"><Logo size={25} /></span>StudyCod</button><p className="mt-5 max-w-[340px] text-sm leading-6 text-[#667169]">{tr("Освітня платформа для системного навчання програмуванню.", "An education platform for learning programming with structure.")}</p></div>
          <div className="grid grid-cols-3 gap-10 max-md:gap-5">{[
            [tr("Продукт","Product"),[[tr("Платформа","Platform"),()=>scrollTo("platform")],[tr("Практика","Practice"),()=>scrollTo("practice")],[tr("Тарифи","Pricing"),()=>navigate("/pricing")]]],
            [tr("Ресурси","Resources"),[[tr("Документація","Documentation"),()=>navigate("/docs")],[tr("Підтримка","Support"),()=>navigate("/support")],[tr("Блог","Blog"),()=>navigate("/blog")]]],
            [tr("Правове","Legal"),[[tr("Приватність","Privacy"),()=>navigate("/privacy")],[tr("Умови","Terms"),()=>navigate("/terms")],[tr("Повернення","Refunds"),()=>navigate("/refunds")],["Cookies",()=>navigate("/cookies")]]],
          ].map(([heading,links]) => <div key={String(heading)} className="flex flex-col items-start gap-3"><strong className="mb-1 text-sm">{String(heading)}</strong>{(links as Array<[string,()=>void]>).map(([label,action]) => <button key={label} onClick={action} className="text-left text-[13px] leading-5 text-[#667169] transition hover:text-[#111814]">{label}</button>)}</div>)}</div>
        </div>
        <div className="flex justify-between gap-4 border-t border-[#122017]/10 pt-6 text-xs leading-5 text-[#667169] max-md:flex-col"><span>© {new Date().getFullYear()} StudyCod</span><span>{tr("Створено для тих, хто вчиться створювати.", "Made for people learning to build.")}</span></div>
      </footer>
    </div>
  );
};

export default PublicLandingPage;
