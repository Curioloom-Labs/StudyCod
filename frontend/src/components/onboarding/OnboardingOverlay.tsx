import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Compass,
  ExternalLink,
  GraduationCap,
  LifeBuoy,
  Sparkles,
  X,
} from "lucide-react";

type StepId = "orientation" | "learn" | "practice" | "progress" | "help";
type TourIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
type Step = {
  id: StepId;
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
  href: string;
  hrefLabel: string;
  icon: TourIcon;
  color: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  mode?: "auto" | "sticky";
  persist?: boolean;
}

const STORAGE_KEY = "studycod_onboarding_done";

const TourPreview: React.FC<{ step: Step; isEn: boolean }> = ({ step, isEn }) => {
  const tr = (uk: string, en: string) => isEn ? en : uk;

  if (step.id === "orientation") {
    const items: Array<[TourIcon, string, string]> = [
      [BookOpen, tr("Навчання", "Learn"), "#00ff88"],
      [Code2, tr("Практика", "Practice"), "#ff8c00"],
      [BarChart3, tr("Прогрес", "Progress"), "#ffd93d"],
      [LifeBuoy, tr("Допомога", "Help"), "#ff6b9d"],
    ];
    return <div className="w-full max-w-[420px] rounded-[24px] border border-white/10 bg-[#0c120e] p-5 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-white/10 pb-4"><span className="size-2.5 rounded-full bg-[#00ff88]" /><strong className="text-[14px] text-white">StudyCod</strong><span className="ml-auto rounded-full bg-white/[.06] px-2.5 py-1 text-[9px] text-[#91a097]">{tr("Ваш простір", "Your space")}</span></div>
      <div className="mt-5 grid grid-cols-2 gap-3">{items.map(([Icon, label, color]) => <div key={label} className="rounded-[17px] border border-white/10 bg-white/[.035] p-4"><Icon className="size-5" style={{ color }} /><span className="mt-6 block text-[12px] font-semibold text-[#dce4df]">{label}</span></div>)}</div>
    </div>;
  }

  if (step.id === "learn") {
    const lessons = [
      [tr("Змінні та типи", "Variables and types"), "100%", true],
      [tr("Умови й цикли", "Conditions and loops"), "68%", false],
      [tr("Функції", "Functions"), "0%", false],
    ];
    return <div className="w-full max-w-[430px] rounded-[24px] bg-[#f3f6f2] p-5 text-[#111814] shadow-2xl">
      <span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#00884a]">EDU · {tr("Поточний курс", "Current course")}</span>
      <h4 className="mt-2 text-[20px] font-bold">{tr("Основи Python", "Python Foundations")}</h4>
      <div className="mt-5 space-y-2">{lessons.map(([label, value, done], lessonIndex) => <div key={String(label)} className={"flex items-center gap-3 rounded-[15px] border p-3.5 " + (lessonIndex === 1 ? "border-[#00b963]/20 bg-[#e7fff3]" : "border-[#142018]/10 bg-white")}><span className={"grid size-8 place-items-center rounded-[10px] text-[10px] font-bold " + (done ? "bg-[#00ff88] text-[#062315]" : "bg-[#e9ede9] text-[#68746c]")}>{done ? <Check className="size-4" /> : "0" + (lessonIndex + 1)}</span><span className="min-w-0 flex-1 text-[11px] font-semibold">{String(label)}</span><span className="text-[10px] text-[#667169]">{String(value)}</span></div>)}</div>
    </div>;
  }

  if (step.id === "practice") {
    return <div className="w-full max-w-[450px] overflow-hidden rounded-[24px] border border-white/10 bg-[#090e0b] shadow-2xl">
      <div className="flex items-center border-b border-white/10 px-4 py-3"><span className="text-[11px] font-semibold text-[#dfe7e1]">solution.py</span><span className="ml-auto rounded-lg bg-[#00ff88]/10 px-2 py-1 text-[9px] text-[#65ecad]">Python</span></div>
      <div className="grid grid-cols-[42px_1fr] py-5 text-[11px] leading-7"><div className="pr-3 text-right text-[#435047]">1<br />2<br />3<br />4<br />5</div><div className="font-mono text-[#c7d1ca]"><div><span className="text-[#ff8c00]">def</span> <span className="text-[#00ff88]">solve</span>(values):</div><div className="pl-5 text-[#9eaaa2]">result = max(values)</div><div className="pl-5"><span className="text-[#ff8c00]">return</span> result</div><div className="text-[#9eaaa2]">values = list(map(int, input().split()))</div><div><span className="text-[#ffd93d]">print</span>(solve(values))</div></div></div>
      <div className="m-4 mt-0 flex items-center gap-3 rounded-[14px] bg-[#151d18] p-3"><span className="size-2.5 rounded-full bg-[#00ff88]" /><span className="text-[10px] font-semibold text-[#dfe7e1]">{tr("Усі тести пройдено", "All tests passed")}</span><span className="ml-auto text-[9px] text-[#7f8d84]">32 ms</span></div>
    </div>;
  }

  if (step.id === "progress") {
    const stats = [
      ["48", tr("задач", "tasks"), "#00ff88"],
      ["12", tr("днів серії", "day streak"), "#ffd93d"],
      ["10.4", tr("середній бал", "average"), "#ff8c00"],
    ];
    return <div className="w-full max-w-[430px] rounded-[24px] bg-white p-5 text-[#111814] shadow-2xl">
      <div className="flex items-start justify-between"><div><span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#748078]">{tr("Цей місяць", "This month")}</span><h4 className="mt-1 text-[19px] font-bold">{tr("Ваш прогрес", "Your progress")}</h4></div><div className="grid size-12 place-items-center rounded-full bg-[#e4fff1] text-[12px] font-bold text-[#00884a]">78%</div></div>
      <div className="mt-6 grid grid-cols-3 gap-2">{stats.map(([value, label, color]) => <div key={label} className="rounded-[15px] bg-[#f3f6f2] p-3"><strong className="text-[20px]">{value}</strong><span className="mt-1 block text-[8px] leading-3 text-[#748078]">{label}</span><span className="mt-4 block h-1 rounded-full" style={{ backgroundColor: color }} /></div>)}</div>
      <div className="mt-5 h-24 rounded-[16px] bg-[#f3f6f2] p-3"><svg viewBox="0 0 360 70" className="h-full w-full"><path d="M4 61C44 52 65 60 98 43C133 26 157 48 195 31C231 14 258 35 292 18C316 6 338 12 356 4" fill="none" stroke="#00b963" strokeWidth="4" strokeLinecap="round" /></svg></div>
    </div>;
  }

  const helpItems: Array<[TourIcon, string, string]> = [
    [BookOpen, tr("Документація", "Documentation"), tr("Сценарії та пояснення", "Workflows and explanations")],
    [LifeBuoy, tr("Підтримка", "Support"), tr("Технічні й облікові питання", "Technical and account issues")],
    [GraduationCap, tr("Апеляції", "Appeals"), tr("Питання щодо оцінки", "Questions about a grade")],
  ];
  return <div className="w-full max-w-[430px] rounded-[24px] border border-white/10 bg-[#0c120e] p-5 shadow-2xl">
    <span className="text-[9px] font-bold uppercase tracking-[.12em] text-[#ff9e2d]">{tr("Центр допомоги", "Help center")}</span><h4 className="mt-2 text-[20px] font-bold text-white">{tr("Відповідь без зайвих кроків", "An answer without extra steps")}</h4>
    <div className="mt-5 space-y-3">{helpItems.map(([Icon, title, text]) => <div key={title} className="flex items-center gap-3 rounded-[15px] border border-white/10 bg-white/[.035] p-3.5"><span className="grid size-9 place-items-center rounded-[11px] bg-white/[.06]"><Icon className="size-4 text-[#63ecab]" /></span><span><strong className="block text-[11px] text-[#e6ede8]">{title}</strong><small className="mt-0.5 block text-[9px] text-[#7f8d84]">{text}</small></span><ArrowRight className="ml-auto size-4 text-[#59665e]" /></div>)}</div>
  </div>;
};

export const OnboardingOverlay: React.FC<Props> = ({ open, onClose, persist = true }) => {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const isEn = i18n.language?.toLowerCase().startsWith("en");
  const tr = (uk: string, en: string) => isEn ? en : uk;
  const [index, setIndex] = useState(0);

  const steps = useMemo<Step[]>(() => [
    { id: "orientation", eyebrow: tr("01 · Орієнтація", "01 · Orientation"), title: tr("Один простір, чотири зрозумілі зони", "One workspace, four clear areas"), body: tr("Навігація StudyCod будується навколо дії: навчатися, практикуватися, бачити результат або отримати допомогу.", "StudyCod navigation follows the action: learn, practice, review results, or get help."), points: [tr("Активна зона завжди виділена", "The current area is always selected"), tr("Меню адаптується до вашої ролі", "The menu adapts to your role"), tr("На мобільному зберігається та сама логіка", "Mobile keeps the same structure")], href: "/docs/navigation", hrefLabel: tr("Гайд із навігації", "Navigation guide"), icon: Compass, color: "#00ff88" },
    { id: "learn", eyebrow: tr("02 · Навчання", "02 · Learn"), title: tr("Курс показує шлях, урок — наступну дію", "A course shows the path; a lesson shows the next action"), body: tr("В EDU учень бачить призначені матеріали, а викладач керує класом, темами, строками й доступом.", "In EDU, students see assigned materials while teachers manage classes, topics, dates, and access."), points: [tr("Теми мають видимий порядок", "Topics have a visible order"), tr("Дедлайни й статуси читаються окремо", "Dates and states are shown separately"), tr("Викладач контролює призначення", "Teachers control assignment")], href: "/docs/edu-student", hrefLabel: tr("Як працює EDU", "How EDU works"), icon: BookOpen, color: "#00ff88" },
    { id: "practice", eyebrow: tr("03 · Практика", "03 · Practice"), title: tr("Від умови до результату — в одному workspace", "From statement to result in one workspace"), body: tr("Бібліотека допомагає знайти задачу, редактор зберігає чернетку, а окремий блок результату пояснює перевірку.", "The library finds the right task, the editor keeps your draft, and the result panel explains the check."), points: [tr("Запуск не дорівнює фінальній здачі", "Run is different from final submission"), tr("Помилка має конкретний тип", "Every failure has a specific type"), tr("Прогрес зберігається в акаунті", "Progress is saved to your account")], href: "/docs/personal-tasks", hrefLabel: tr("Гайд із практики", "Practice guide"), icon: Code2, color: "#ff8c00" },
    { id: "progress", eyebrow: tr("04 · Результати", "04 · Results"), title: tr("Прогрес, оцінки та сертифікати не змішуються", "Progress, grades, and certificates stay distinct"), body: tr("Practice-метрики показують регулярність і виконані задачі. EDU-оцінки відображають навчальні рішення в класі.", "Practice metrics show consistency and completed tasks. EDU grades represent classroom learning decisions."), points: [tr("Фільтри змінюють лише видимий зріз", "Filters change only the visible slice"), tr("Автотест не завжди є фінальною оцінкою", "An automated check is not always the final grade"), tr("Сертифікат має окремий ідентифікатор", "Certificates have a separate identifier")], href: "/docs/profile-progress-model", hrefLabel: tr("Як читати прогрес", "How to read progress"), icon: BarChart3, color: "#ffd93d" },
    { id: "help", eyebrow: tr("05 · Допомога", "05 · Help"), title: tr("Правильний канал прискорює відповідь", "The right channel gets a faster answer"), body: tr("Handbook пояснює сценарії, підтримка вирішує технічні й облікові проблеми, а апеляція стосується конкретної оцінки.", "The handbook explains workflows, Support handles technical and account issues, and Appeals cover a specific grade."), points: [tr("Одна проблема — одне звернення", "One issue per request"), tr("Додавайте очікуваний і фактичний результат", "Include expected and actual results"), tr("Не надсилайте паролі й секрети", "Never send passwords or secrets")], href: "/support", hrefLabel: tr("Відкрити підтримку", "Open Support"), icon: LifeBuoy, color: "#ff6b9d" },
  ], [isEn]);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") setIndex(value => Math.min(value + 1, steps.length - 1));
      if (event.key === "ArrowLeft") setIndex(value => Math.max(value - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, steps.length]);

  const current = steps[index];
  const CurrentIcon = current.icon;
  const isLast = index === steps.length - 1;
  const done = () => {
    if (persist) localStorage.setItem(STORAGE_KEY, "1");
    onClose();
  };

  return <AnimatePresence>
    {open && <motion.div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#050806]/80 p-3 backdrop-blur-xl sm:p-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={tr("Тур інтерфейсом StudyCod", "StudyCod interface tour")}>
      <motion.div initial={reduceMotion ? undefined : { opacity: 0, y: 20, scale: .985 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }} exit={reduceMotion ? undefined : { opacity: 0, y: 12, scale: .99 }} transition={{ duration: .28, ease: [0.16, 1, 0.3, 1] }} className="relative grid min-h-[min(720px,calc(100dvh_-_32px))] w-full max-w-[1160px] overflow-hidden rounded-[30px] border border-white/10 bg-[#0d130f] shadow-[0_44px_140px_rgba(0,0,0,.55)] lg:grid-cols-[260px_1fr]">
        <button type="button" onClick={done} className="absolute right-4 top-4 z-20 grid size-11 place-items-center rounded-[14px] border border-white/10 bg-[#151c17]/90 text-[#95a299] transition hover:bg-white/10 hover:text-white lg:right-5 lg:top-5" aria-label={tr("Закрити тур", "Close tour")}><X className="size-4" /></button>

        <aside className="border-b border-white/10 bg-[#090e0b] p-5 lg:border-b-0 lg:border-r lg:p-6">
          <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-[12px] bg-[#00ff88] text-[#062315]"><Sparkles className="size-4" /></span><div><strong className="block text-[13px] text-white">StudyCod</strong><span className="text-[9px] uppercase tracking-[.12em] text-[#66746b]">Product tour</span></div></div>
          <div className="mt-6 flex gap-1.5 lg:mt-10 lg:block lg:space-y-1.5">{steps.map((step, stepIndex) => {
            const StepIcon = step.icon;
            const active = stepIndex === index;
            const passed = stepIndex < index;
            return <button type="button" key={step.id} onClick={() => setIndex(stepIndex)} className={"group flex min-w-0 flex-1 items-center gap-3 rounded-[14px] p-2.5 text-left transition lg:w-full lg:flex-none " + (active ? "bg-white/[.07]" : "hover:bg-white/[.035]")}><span className={"grid size-8 shrink-0 place-items-center rounded-[10px] " + (active ? "bg-white/[.08]" : "bg-white/[.035]")}>{passed ? <Check className="size-4 text-[#00ff88]" /> : <StepIcon className="size-4" style={{ color: active ? step.color : "#647168" }} />}</span><span className="hidden min-w-0 lg:block"><strong className={"block truncate text-[11px] " + (active ? "text-white" : "text-[#78867d]")}>{step.eyebrow.replace(/^\d+ · /, "")}</strong><small className="mt-0.5 block text-[8px] text-[#4f5b53]">{String(stepIndex + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</small></span></button>;
          })}</div>
          <p className="mt-8 hidden text-[10px] leading-5 text-[#526057] lg:block">{tr("Користуйтеся стрілками клавіатури для переходу між кроками.", "Use keyboard arrows to move between steps.")}</p>
        </aside>

        <section className="grid min-h-0 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.9fr)]">
          <div className="flex min-h-[540px] flex-col px-[clamp(24px,5vw,64px)] py-[clamp(44px,7vw,76px)]">
            <motion.div key={current.id} initial={reduceMotion ? undefined : { opacity: 0, y: 12 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} transition={{ duration: .24 }}>
              <span className="text-[10px] font-bold uppercase tracking-[.15em]" style={{ color: current.color }}>{current.eyebrow}</span>
              <span className="mt-7 grid size-12 place-items-center rounded-[15px] bg-white/[.06]"><CurrentIcon className="size-5" style={{ color: current.color }} /></span>
              <h2 className="mt-6 max-w-[560px] text-balance text-[clamp(30px,4vw,48px)] font-extrabold leading-[1.04] tracking-[-.05em] text-white">{current.title}</h2>
              <p className="mt-5 max-w-[560px] text-[15px] leading-7 text-[#97a49b]">{current.body}</p>
              <div className="mt-7 space-y-3">{current.points.map(point => <div key={point} className="flex items-start gap-3 text-[12px] leading-5 text-[#c1cbc4]"><span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[#00ff88]/10"><Check className="size-3 text-[#63ecab]" /></span>{point}</div>)}</div>
              <a href={current.href} onClick={done} className="mt-7 inline-flex items-center gap-2 text-[11px] font-bold text-[#9eaaa2] transition hover:text-white">{current.hrefLabel}<ExternalLink className="size-3.5" /></a>
            </motion.div>

            <div className="mt-auto flex items-center justify-between gap-4 pt-10">
              <button type="button" onClick={() => index === 0 ? done() : setIndex(value => value - 1)} className="inline-flex h-12 items-center gap-2 rounded-[14px] border border-white/10 px-4 text-[11px] font-bold text-[#8f9c93] transition hover:bg-white/[.05] hover:text-white">{index === 0 ? tr("Пропустити", "Skip") : <><ArrowLeft className="size-4" />{tr("Назад", "Back")}</>}</button>
              <div className="flex items-center gap-4"><span className="hidden text-[10px] tabular-nums text-[#556159] sm:block">{String(index + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span><button type="button" onClick={() => isLast ? done() : setIndex(value => value + 1)} className="inline-flex h-12 items-center gap-2 rounded-[14px] bg-[#00ff88] px-5 text-[11px] font-bold text-[#062315] transition hover:-translate-y-0.5 hover:bg-[#2bff9b]">{isLast ? tr("Завершити", "Finish") : tr("Далі", "Next")}<ArrowRight className="size-4" /></button></div>
            </div>
          </div>

          <div className="relative hidden overflow-hidden border-l border-white/10 bg-[#111713] lg:grid lg:place-items-center">
            <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 50% 35%, " + current.color + "18, transparent 46%)" }} />
            <motion.div key={current.id + "-visual"} initial={reduceMotion ? undefined : { opacity: 0, scale: .98, x: 12 }} animate={reduceMotion ? undefined : { opacity: 1, scale: 1, x: 0 }} className="relative grid h-full w-full place-items-center p-6"><TourPreview step={current} isEn={Boolean(isEn)} /></motion.div>
          </div>
        </section>
      </motion.div>
    </motion.div>}
  </AnimatePresence>;
};

export function shouldShowOnboarding(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "1";
}
