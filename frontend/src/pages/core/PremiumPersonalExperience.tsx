import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  Camera,
  Check,
  Clock3,
  Code2,
  Compass,
  Flame,
  Gauge,
  GraduationCap,
  Layers3,
  Play,
  Rocket,
  Sparkles,
  Settings2,
  ShieldCheck,
  Target,
  Trophy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CourseLanguage, Grade, Task, User } from "../../types";
import type { LibraryTaskListItem } from "../../lib/api/library";
import {
  countUnlockedPersonalBadges,
  getBadgeLevel,
  getBadgeMetricValue,
  getBadgeProgressPercent,
  getNextBadgeLevel,
  getTotalBadgePoints,
  isPersonalBadgeUnlocked,
  PERSONAL_BADGES,
  type PersonalBadgeStats,
} from "../../lib/personalBadges";

type PageTarget = "home" | "tasks" | "grades" | "profile" | "teacher" | "student" | "admin";

export type SkillEvidence = {
  practicedTasks: number;
  solvedTasks: number;
  solvedAfterFailure?: number;
  revisitedSolved: number;
  topics: Array<{ name: string; practiced: number; solved: number }>;
  overcomeCategories?: Array<{ name: string; tasks: number }>;
  recentSkills?: Array<{ taskId: number; topic: string | null; category: string | null; outcome: "Evidence collected"; createdAt: string }>;
};

const text = {
  uk: {
    welcome: "Добрий день",
    space: "Твій простір навчання",
    continue: "Продовжити практику",
    browse: "Відкрити бібліотеку",
    today: "На сьогодні",
    next: "Наступна задача",
    ready: "Готово до наступного кроку",
    empty: "Почни з першої задачі — маршрут з’явиться тут.",
    queue: "Черга практики",
    allTasks: "Усі задачі",
    progress: "Твій темп",
    completed: "завершено",
    streak: "ритм навчання",
    score: "рівень впевненості",
    smartPath: "Розумний маршрут",
    pathCopy: "Курс, практика й повторення зібрані в одному спокійному потоці.",
    explore: "Дослідити",
    journal: "Прогрес",
    progressTitle: "Не просто оцінки. Твоя траєкторія.",
    progressCopy: "Подивись, що вже закріпилося, а де варто зробити ще одну коротку практику.",
    average: "Середній результат",
    attempts: "спроб",
    passed: "закрито",
    momentum: "динаміка",
    topics: "Карта тем",
    recent: "Остання активність",
    noData: "Дані з’являться після першої перевіреної роботи.",
    projectsKicker: "Колекція перемог",
    projectsTitle: "Галерея проєктів",
    projectsCopy: "Тут зберігаються всі мініпроєкти, які ти вже завершив. Повертайся до них, щоб побачити свій шлях і надихнутися наступним кроком.",
    projectsEmpty: "Перший завершений мініпроєкт з’явиться тут після успішної перевірки.",
    projectSkills: "Навички",
    openProject: "Відкрити проєкт",
    improve: "Повернутися до теми",
    strong: "Сильна тема",
    focus: "Точка росту",
    profile: "Профіль",
    account: "Особистий простір",
    accountCopy: "Налаштуй свій навчальний профіль і тримай результати в одному місці.",
    learningProfile: "Профіль навчання",
    language: "Основна мова",
    achievements: "Твої результати",
    solved: "розв’язаних у бібліотеці",
    grades: "оцінених робіт",
    save: "Зберегти зміни",
    saving: "Зберігаємо…",
    avatar: "Оновити фото",
    level: "Поточний рівень",
    settingsHint: "Зміна мови впливає на персональний навчальний маршрут.",
  },
  en: {
    welcome: "Good day",
    space: "Your learning space",
    continue: "Continue practice",
    browse: "Open library",
    today: "For today",
    next: "Next task",
    ready: "Ready for your next step",
    empty: "Start with your first task — your path will appear here.",
    queue: "Practice queue",
    allTasks: "All tasks",
    progress: "Your rhythm",
    completed: "completed",
    streak: "learning rhythm",
    score: "confidence level",
    smartPath: "A clear path",
    pathCopy: "Coursework, practice and revision live in one calm flow.",
    explore: "Explore",
    journal: "Progress",
    progressTitle: "Not just grades. Your trajectory.",
    progressCopy: "See what is sticking and where one more short practice will help.",
    average: "Average result",
    attempts: "attempts",
    passed: "completed",
    momentum: "momentum",
    topics: "Topic map",
    recent: "Recent activity",
    noData: "Data will appear after your first reviewed task.",
    projectsKicker: "Collection of wins",
    projectsTitle: "Project gallery",
    projectsCopy: "Every mini-project you complete stays here. Come back to see your path and find momentum for the next step.",
    projectsEmpty: "Your first completed mini-project will appear here after a successful check.",
    projectSkills: "Skills",
    openProject: "Open project",
    improve: "Practice this topic",
    strong: "Strong topic",
    focus: "Growth point",
    profile: "Profile",
    account: "Personal space",
    accountCopy: "Set up your learning profile and keep your results in one place.",
    learningProfile: "Learning profile",
    language: "Primary language",
    achievements: "Your results",
    solved: "solved in library",
    grades: "reviewed works",
    save: "Save changes",
    saving: "Saving…",
    avatar: "Update photo",
    level: "Current level",
    settingsHint: "Changing language affects your personal learning path.",
  },
};

const useCopy = () => {
  const { i18n } = useTranslation();
  return i18n.language?.toLowerCase().startsWith("en") ? text.en : text.uk;
};

const initials = (name: string) => name.slice(0, 1).toUpperCase();

export const PremiumDashboard: React.FC<{
  user: User;
  tasks: Task[];
  loading: boolean;
  onNavigate: (page: PageTarget) => void;
  onOpenTask: (task: Task) => void;
}> = ({ user, tasks, loading, onNavigate, onOpenTask }) => {
  const c = useCopy();
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en");
  const complete = tasks.filter((task) => task.status === "GRADED").length;
  const active = tasks.find((task) => task.status !== "GRADED") ?? tasks[0];
  const completion = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  const completedProjects = React.useMemo(() => tasks
    .filter((task) => task.status === "GRADED" && String(task.subtitle ?? "").startsWith("MPJ:"))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [tasks]);
  const shortQueue = tasks.filter((task) => task.id !== active?.id).slice(0, 3);
  const dashboardLead = tasks.length
    ? complete > 0
      ? en
        ? `You have ${complete} completed task${complete === 1 ? "" : "s"}. Open the next practice when you're ready.`
        : `У тебе вже ${complete} завершено. Наступна практика готова, коли захочеш продовжити.`
      : en
        ? "Your first practice is ready. Start with a small step and the route will adapt."
        : "Перша практика готова. Почни з короткого кроку — маршрут підлаштується під результат."
    : c.empty;

  return (
    <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        <section className="relative overflow-hidden rounded-[28px] border border-[#152219]/10 bg-[#e9f2ea] px-6 py-7 dark:border-white/10 dark:bg-[#131d16] sm:px-8 sm:py-9">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#00ff88]/12 blur-3xl" />
          <div className="absolute right-[18%] top-0 h-full w-px bg-[#152219]/8 dark:bg-white/8" />
          <div className="relative grid gap-7 lg:grid-cols-[1fr_320px] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3 text-sm font-medium text-[#50705c] dark:text-[#a7b8ab]">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#00b967]/12 text-[#008d4d] dark:text-[#62ecaa]"><Sparkles className="h-4 w-4" /></span>
                {c.space}
              </div>
              <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                {c.welcome}, {user.firstName || user.username}.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#5d6d62] dark:text-[#aab7ad] sm:text-lg">
                {dashboardLead}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={() => active ? onOpenTask(active) : onNavigate("tasks")} className="inline-flex items-center gap-2 rounded-xl bg-[#142017] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-14px_rgba(0,0,0,.55)] transition hover:-translate-y-0.5 hover:bg-[#223129] dark:bg-[#edf3ef] dark:text-[#0b120e]">
                  <Play className="h-4 w-4 fill-current" /> {c.continue}
                </button>
                <button onClick={() => window.location.assign(import.meta.env.DEV ? "/library?preview=true" : "/library")} className="inline-flex items-center gap-2 rounded-xl border border-[#152219]/12 bg-white/70 px-5 py-3 text-sm font-semibold text-[#25342b] transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-[#e8f0ea] dark:hover:bg-white/10">
                  <BookOpen className="h-4 w-4" /> {c.browse}
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-[0_18px_50px_-34px_rgba(17,44,28,.65)] backdrop-blur dark:border-white/10 dark:bg-[#0e1711]/80">
              <div className="flex items-center justify-between text-sm text-[#617066] dark:text-[#9eafa3]"><span>{c.progress}</span><span className="font-semibold text-[#162119] dark:text-white">{completion}%</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dce5dd] dark:bg-white/10"><div className="h-full rounded-full bg-[#00c96d]" style={{ width: `${completion}%` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div><div className="text-2xl font-semibold tracking-tight">{complete}</div><div className="mt-1 text-xs text-[#68776d] dark:text-[#9dada1]">{c.completed}</div></div>
                <div><div className="text-2xl font-semibold tracking-tight">{tasks.length}</div><div className="mt-1 text-xs text-[#68776d] dark:text-[#9dada1]">{c.attempts}</div></div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.7fr)]">
          <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 shadow-[0_18px_45px_-40px_rgba(18,39,24,.48)] dark:border-white/10 dark:bg-[#121b15] sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#00a75a] dark:text-[#62ecaa]">{c.today}</div><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{c.next}</h2></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff2dd] text-[#e87d00] dark:bg-[#ff8c00]/12"><Code2 className="h-5 w-5" /></span></div>
            {loading ? <div className="h-40 animate-pulse rounded-2xl bg-[#f0f3ef] dark:bg-white/5" /> : active ? <button type="button" onClick={() => onOpenTask(active)} className="group w-full rounded-2xl bg-[#18251c] p-5 text-left text-white transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-[#1a2820] sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-medium text-[#8ba493]">{active.topicTitle || "Practice"}</div><div className="mt-2 text-lg font-semibold sm:text-xl">{active.title}</div><p className="mt-2 max-w-xl text-sm leading-6 text-[#b5c4b8]">{active.subtitle || "Open the task, write your solution and get a clear result without losing your flow."}</p></div><ArrowUpRight className="h-5 w-5 shrink-0 text-[#72edb0] transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" /></div><div className="mt-6 flex items-center gap-2 text-sm font-semibold text-[#72edb0]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10"><Play className="h-3.5 w-3.5 fill-current" /></span>{c.continue}</div></button> : <div className="rounded-2xl border border-dashed border-[#152219]/15 p-7 text-center text-sm leading-6 text-[#68776d] dark:border-white/10 dark:text-[#9dada1]">{c.empty}</div>}
          </section>

          <section className="rounded-[26px] border border-[#152219]/10 bg-[#fbfcfa] p-5 dark:border-white/10 dark:bg-[#101813] sm:p-6">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#e87d00]">{c.smartPath}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.progress}</h2></div><Gauge className="h-5 w-5 text-[#e87d00]" /></div>
            <p className="mt-4 text-sm leading-6 text-[#617066] dark:text-[#a2b0a5]">{c.pathCopy}</p>
            <button onClick={() => onNavigate("grades")} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#147b47] transition hover:text-[#00a65a] dark:text-[#62ecaa]">{c.explore}<ArrowRight className="h-4 w-4" /></button>
            <div className="mt-7 flex items-end gap-1.5" aria-hidden="true">{[36, 54, 42, 74, 58, 83, 71].map((height, index) => <div key={index} className={`flex-1 rounded-t-md ${index === 5 ? "bg-[#00c96d]" : "bg-[#dce6de] dark:bg-white/10"}`} style={{ height }} />)}</div>
          </section>
        </div>

        <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15] sm:p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold tracking-tight">{c.queue}</h2><button onClick={() => onNavigate("tasks")} className="text-sm font-semibold text-[#147b47] dark:text-[#62ecaa]">{c.allTasks}</button></div>
          <div className="grid gap-3 md:grid-cols-3">{shortQueue.length ? shortQueue.map((task, index) => <button type="button" key={task.id} onClick={() => onOpenTask(task)} className="group rounded-2xl border border-[#152219]/10 bg-[#fafcf9] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#00c96d]/40 hover:bg-[#f3fbf5] dark:border-white/10 dark:bg-white/[.025] dark:hover:bg-white/[.06]"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#768379] dark:text-[#93a399]">0{index + 1}</span>{task.status === "GRADED" ? <Check className="h-4 w-4 text-[#00a75a]" /> : <Clock3 className="h-4 w-4 text-[#e87d00]" />}</div><div className="mt-5 font-semibold text-[#1b2820] dark:text-[#eef5ef]">{task.title}</div><div className="mt-2 text-sm text-[#708075] dark:text-[#9faea3]">{task.status === "GRADED" ? c.completed : task.topicTitle || "Practice"}</div></button>) : <div className="col-span-full rounded-2xl bg-[#f5f7f4] px-5 py-7 text-sm text-[#718075] dark:bg-white/[.035] dark:text-[#9dac9f]">{c.empty}</div>}</div>
        </section>

        <section className="overflow-hidden rounded-[26px] border border-[#152219]/10 bg-[#17251c] p-5 text-white shadow-[0_22px_55px_-38px_rgba(5,25,12,.9)] dark:border-white/10 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#72edb0]"><Trophy className="h-4 w-4" />{c.projectsKicker}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{c.projectsTitle}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#b7c9ba]">{c.projectsCopy}</p>
            </div>
            <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-[#00d978]/12 px-4 text-xl font-semibold text-[#72edb0]">{completedProjects.length}</div>
          </div>
          {completedProjects.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{completedProjects.map((project, index) => <button key={project.id} type="button" onClick={() => onOpenTask(project)} className="group rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:-translate-y-0.5 hover:border-[#72edb0]/45 hover:bg-white/[.09]"><div className="flex items-start justify-between gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#00d978]/12 text-sm font-semibold text-[#72edb0]">{index + 1}</span><Check className="h-4 w-4 text-[#72edb0]" /></div><div className="mt-5 font-semibold text-[#f0f7f1]">{project.title}</div><div className="mt-2 text-xs text-[#a8bbaa]">{project.language === "PYTHON" ? "Python" : project.language === "CPP" ? "C++" : "Java"} · {c.completed}</div><div className="mt-4 flex flex-wrap gap-1.5">{(project.projectSpec?.skills ?? []).slice(0, 3).map((skill) => <span key={skill} className="rounded-full bg-white/[.08] px-2 py-1 text-[11px] text-[#c5d6c8]">{skill}</span>)}</div><div className="mt-4 text-xs font-semibold text-[#72edb0] transition group-hover:text-white">{c.openProject} <ArrowRight className="ml-1 inline h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></div></button>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-sm leading-6 text-[#a8bbaa]">{c.projectsEmpty}</div>}
        </section>
      </div>
    </div>
  );
};

type Topic = { key: string; topicId: number | null; topicTitle: string; average: number; attempts: number; trend: number };

export const PremiumProgress: React.FC<{
  stats: { count: number; avg: number; passed: number; excellent: number; trend: number };
  topics: Topic[];
  recent: Grade[];
  onRetry: (topicId: number | null) => void;
}> = ({ stats, topics, recent, onRetry }) => {
  const c = useCopy();
  const trendUp = stats.trend >= 0;
  const metricCards: Array<{ label: string; value: React.ReactNode; Icon: LucideIcon; color: string }> = [
    { label: c.attempts, value: stats.count, Icon: Layers3, color: "#147b47" },
    { label: c.average, value: stats.avg.toFixed(1), Icon: Target, color: "#00a75a" },
    { label: c.passed, value: stats.passed, Icon: Check, color: "#e87d00" },
    { label: c.score, value: stats.excellent, Icon: Flame, color: "#e95b80" },
  ];
  return <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
    <section className="grid gap-6 rounded-[28px] border border-[#152219]/10 bg-[#eaf2eb] p-6 dark:border-white/10 dark:bg-[#131d16] lg:grid-cols-[1.2fr_.8fr] lg:p-8">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-[#147b47] dark:text-[#62ecaa]"><Compass className="h-4 w-4" />{c.journal}</div><h1 className="mt-5 max-w-xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{c.progressTitle}</h1><p className="mt-4 max-w-xl text-base leading-7 text-[#607065] dark:text-[#a8b6ab]">{c.progressCopy}</p></div>
      <div className="rounded-2xl bg-[#17251c] p-5 text-white shadow-[0_20px_48px_-30px_rgba(0,0,0,.65)]"><div className="flex items-start justify-between"><div><div className="text-sm text-[#a8bdad]">{c.average}</div><div className={`mt-2 text-5xl font-semibold tracking-[-.06em] ${stats.avg >= 75 ? "text-[#6ef1af]" : "text-[#ffd93d]"}`}>{stats.avg.toFixed(1)}</div></div><div className="rounded-xl bg-white/10 p-2.5"><Target className="h-5 w-5 text-[#6ef1af]" /></div></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00d977]" style={{ width: `${Math.max(0, Math.min(100, stats.avg))}%` }} /></div><div className="mt-3 flex items-center gap-2 text-sm text-[#abc0b0]">{trendUp ? <TrendingUp className="h-4 w-4 text-[#6ef1af]" /> : <TrendingDown className="h-4 w-4 text-[#ff6b9d]" />}<span>{trendUp ? "+" : ""}{stats.trend.toFixed(1)} {c.momentum}</span></div></div>
    </section>
    <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, Icon, color }) => <div key={label} className="flex h-full min-h-[126px] flex-col justify-between rounded-2xl border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]"><div className="flex items-center justify-between text-sm text-[#6c7a70] dark:text-[#9cab9f]"><span>{label}</span><Icon className="h-4 w-4" style={{ color }} /></div><div className="mt-4 text-3xl font-semibold tracking-[-.045em]">{value}</div></div>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15] sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#00a75a] dark:text-[#62ecaa]">{c.topics}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.progress}</h2></div></div>{topics.length ? <div className="space-y-3">{topics.slice(0, 6).map((topic) => { const needsFocus = topic.average < 65; return <div key={topic.key} className="rounded-2xl border border-[#152219]/8 bg-[#fafcf9] p-4 dark:border-white/8 dark:bg-white/[.025]"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{topic.topicTitle}</div><div className="mt-1 text-sm text-[#718075] dark:text-[#9caea0]">{topic.attempts} {c.attempts} · {needsFocus ? c.focus : c.strong}</div></div><div className="flex items-center gap-3"><div className={`text-xl font-semibold ${topic.average >= 75 ? "text-[#00a75a] dark:text-[#62ecaa]" : topic.average >= 50 ? "text-[#d78000]" : "text-[#e95b80]"}`}>{topic.average.toFixed(0)}</div>{needsFocus && <button onClick={() => onRetry(topic.topicId)} className="rounded-lg bg-[#e9f7ee] px-3 py-2 text-xs font-semibold text-[#147b47] transition hover:bg-[#d9f5e3] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]">{c.improve}</button>}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e6ece7] dark:bg-white/10"><div className="h-full rounded-full bg-[#00c96d]" style={{ width: `${Math.max(4, topic.average)}%` }} /></div></div>; })}</div> : <Empty c={c} />}</section>
      <section className="rounded-[26px] border border-[#152219]/10 bg-[#fbfcfa] p-5 dark:border-white/10 dark:bg-[#101813] sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#e87d00]">{c.recent}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.journal}</h2>{recent.length ? <div className="mt-5 space-y-3">{recent.slice(0, 5).map((grade, index) => <div key={`${grade.id}-${index}`} className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-semibold text-[#147b47] shadow-sm dark:bg-white/8 dark:text-[#62ecaa]"><Code2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{grade.task?.title || "Practice task"}</div><div className="mt-0.5 text-xs text-[#77857b] dark:text-[#99aa9e]">{new Date(grade.createdAt).toLocaleDateString()}</div></div><div className={`font-semibold ${Number(grade.total) >= 75 ? "text-[#00a75a] dark:text-[#62ecaa]" : "text-[#d78000]"}`}>{Number(grade.total)}</div></div>)}</div> : <div className="mt-5"><Empty c={c} /></div>}</section></div>
  </div></div>;
};

const Empty: React.FC<{ c: typeof text.uk }> = ({ c }) => <div className="rounded-2xl border border-dashed border-[#152219]/15 p-7 text-center text-sm leading-6 text-[#718075] dark:border-white/10 dark:text-[#9caea0]">{c.noData}</div>;

export const PremiumProfile: React.FC<{
  user: User;
  avatarUrl: string;
  course: CourseLanguage;
  stats: { librarySolved: number; badgesUnlocked: number; totalGrades: number; avgGrade: number | null; excellent: number };
  currentIad: number;
  weeklyActiveDays: number;
  saving: boolean;
  message: string | null;
  onAvatar: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCourse: (course: CourseLanguage) => void;
  onSave: () => void;
}> = ({ user, avatarUrl, course, stats, currentIad, saving, message, onAvatar, onCourse, onSave }) => {
  const c = useCopy();
  return <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
    <section className="relative overflow-hidden rounded-[28px] border border-[#152219]/10 bg-[#eaf2eb] p-6 dark:border-white/10 dark:bg-[#131d16] sm:p-8"><div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-[#ff8c00]/10 blur-3xl" /><div className="relative flex flex-col gap-6 sm:flex-row sm:items-center"><div className="relative shrink-0"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] bg-[#17251c] text-3xl font-semibold text-[#6ef1af] shadow-xl">{avatarUrl ? <img className="h-full w-full object-cover" src={avatarUrl} alt="" /> : initials(user.username)}</div><label className="absolute -bottom-2 -right-2 cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#1e2e24] shadow-lg transition hover:-translate-y-0.5 dark:bg-[#edf3ef]"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} />{c.avatar}</label></div><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-[#147b47] dark:text-[#62ecaa]"><GraduationCap className="h-4 w-4" />{c.account}</div><h1 className="mt-3 truncate font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{user.firstName || user.username}</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#607065] dark:text-[#a8b6ab]">{c.accountCopy}</p></div></div></section>
    <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15] sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#00a75a] dark:text-[#62ecaa]">{c.achievements}</div><div className="mt-5 grid grid-cols-2 gap-3"><Stat value={stats.librarySolved} label={c.solved} /><Stat value={stats.totalGrades} label={c.grades} /><Stat value={stats.avgGrade?.toFixed(1) ?? "—"} label={c.average} /><Stat value={currentIad} label={c.level} /></div><div className="mt-5 rounded-2xl bg-[#f5f8f5] p-4 text-sm leading-6 text-[#65746a] dark:bg-white/[.04] dark:text-[#a6b5aa]"><span className="font-semibold text-[#1c2b21] dark:text-[#eaf2eb]">{stats.badgesUnlocked}</span> badges unlocked · {stats.excellent} excellent results</div></section>
      <section className="rounded-[26px] border border-[#152219]/10 bg-[#fbfcfa] p-5 dark:border-white/10 dark:bg-[#101813] sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-[#e87d00]">{c.learningProfile}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.language}</h2><p className="mt-2 max-w-md text-sm leading-6 text-[#68776d] dark:text-[#a1b0a5]">{c.settingsHint}</p><div className="mt-5 grid grid-cols-3 gap-2">{(["JAVA", "PYTHON", "CPP"] as const).map((item) => <button key={item} type="button" onClick={() => onCourse(item)} className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${course === item ? "bg-[#17251c] text-white shadow-lg dark:bg-[#edf3ef] dark:text-[#0b120e]" : "border border-[#152219]/10 bg-white text-[#637268] hover:border-[#00c96d]/45 dark:border-white/10 dark:bg-white/[.025] dark:text-[#aab8ad]"}`}>{item === "PYTHON" ? "Python" : item === "CPP" ? "C++" : "Java"}</button>)}</div><div className="mt-6 flex flex-wrap items-center gap-3"><button onClick={onSave} disabled={saving} className="rounded-xl bg-[#00bf67] px-5 py-3 text-sm font-semibold text-[#062112] shadow-[0_14px_24px_-16px_rgba(0,191,103,.8)] transition hover:-translate-y-0.5 hover:bg-[#00d977] disabled:opacity-60">{saving ? c.saving : c.save}</button>{message && <span className="text-sm text-[#147b47] dark:text-[#62ecaa]">{message}</span>}</div></section></div>
  </div></div>;
};

const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => <div className="rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold tracking-[-.045em]">{value}</div><div className="mt-1 text-xs leading-5 text-[#718075] dark:text-[#9eada1]">{label}</div></div>;

export const SkillEvidenceDetails: React.FC<{ evidence: SkillEvidence; label: (uk: string, en: string) => string }> = ({ evidence, label }) => {
  if (!evidence.overcomeCategories?.length && !evidence.recentSkills?.length) return null;
  return <section className="mt-4 rounded-[22px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15]">
    {evidence.overcomeCategories?.length ? <div><div className="text-xs font-semibold uppercase tracking-[.15em] text-[#147b47] dark:text-[#62ecaa]">{label("Подолані категорії помилок", "Overcome categories")}</div><div className="mt-3 flex flex-wrap gap-2">{evidence.overcomeCategories.map((item) => <span key={item.name} className="rounded-full bg-[#eaf9ef] px-3 py-1.5 text-xs font-semibold text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#72edb0]">{item.name} · {item.tasks}</span>)}</div></div> : null}
    {evidence.recentSkills?.length ? <div className={evidence.overcomeCategories?.length ? "mt-5" : ""}><div className="text-xs font-semibold uppercase tracking-[.15em] text-[#9eada1]">{label("Останні закріплені навички", "Recent evidence")}</div><div className="mt-3 space-y-2">{evidence.recentSkills.map((item) => <div key={`${item.taskId}-${item.createdAt}`} className="flex items-center justify-between gap-3 rounded-xl bg-[#f5f8f5] px-3 py-2 text-xs dark:bg-white/[.04]"><span>{item.topic || item.category || label("практика", "practice")}</span><span className="font-semibold text-[#147b47] dark:text-[#72edb0]">{item.outcome}</span></div>)}</div></div> : null}
  </section>;
};

export const PremiumProfileV2: React.FC<{
  user: User;
  avatarUrl: string;
  course: CourseLanguage;
  stats: { librarySolved: number; badgesUnlocked: number; totalGrades: number; avgGrade: number | null; excellent: number };
  currentIad: number;
  weeklyActiveDays: number;
  skillEvidence?: SkillEvidence;
  saving: boolean;
  message: string | null;
  onAvatar: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCourse: (course: CourseLanguage) => void;
  onSave: () => void;
}> = ({ user, avatarUrl, course, stats, currentIad, weeklyActiveDays, skillEvidence, saving, message, onAvatar, onCourse, onSave }) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const label = (ukText: string, enText: string) => uk ? ukText : enText;
  const courseName = course === "PYTHON" ? "Python" : course === "CPP" ? "C++" : "Java";
  const [badgesOpen, setBadgesOpen] = React.useState(false);
  const badgeStats: PersonalBadgeStats = {
    librarySolved: stats.librarySolved,
    weeklyActiveDays,
    solvedAfterFailure: skillEvidence?.solvedAfterFailure ?? 0,
    topicsPracticed: skillEvidence?.topics.length ?? 0,
    revisitedSolved: skillEvidence?.revisitedSolved ?? 0,
  };
  const unlockedBadges = countUnlockedPersonalBadges(badgeStats);
  const badgePoints = getTotalBadgePoints(badgeStats);
  return <div className="min-h-full bg-[#f7f8f5] px-4 py-8 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-12"><div className="mx-auto max-w-6xl">
    <div className="mb-8 flex flex-col justify-between gap-4 border-b border-[#152219]/10 pb-7 dark:border-white/10 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#147b47] dark:text-[#62ecaa]"><ShieldCheck className="h-4 w-4" />{label("Особистий акаунт", "Personal account")}</div><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{label("Твій профіль", "Your profile")}</h1><p className="mt-3 max-w-xl text-base leading-7 text-[#65746a] dark:text-[#a4b3a8]">{label("Тут зберігається твій навчальний контекст — без зайвого шуму.", "Your learning context lives here, without unnecessary noise.")}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.location.assign("/iad")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#152219]/10 bg-white px-4 py-3 text-sm font-semibold text-[#314139] transition hover:-translate-y-0.5 hover:bg-[#eef4ef] dark:border-white/10 dark:bg-white/[.05] dark:text-[#dce7df] dark:hover:bg-white/[.08]"><Gauge className="h-4 w-4" />IAD</button><button type="button" onClick={() => window.location.assign("/profile/certificates")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#152219]/10 bg-white px-4 py-3 text-sm font-semibold text-[#314139] transition hover:-translate-y-0.5 hover:bg-[#eef4ef] dark:border-white/10 dark:bg-white/[.05] dark:text-[#dce7df] dark:hover:bg-white/[.08]"><Award className="h-4 w-4" />{label("Сертифікати", "Certificates")}</button><button onClick={onSave} disabled={saving} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[#00c96d] px-5 py-3 text-sm font-semibold text-[#062112] shadow-[0_16px_28px_-17px_rgba(0,201,109,.78)] transition hover:-translate-y-0.5 hover:bg-[#00dc79] disabled:opacity-60">{saving ? label("Зберігаємо…", "Saving…") : label("Зберегти зміни", "Save changes")}</button></div></div>
    <div className="grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
      <aside className="overflow-hidden rounded-[26px] bg-[#17251c] p-6 text-white shadow-[0_24px_55px_-35px_rgba(4,21,10,.85)] sm:p-7"><div className="flex items-start justify-between"><div className="relative"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#eff5f0] text-3xl font-bold text-[#147b47]">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(user.username)}</div><label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-[#00d977] text-[#062112] shadow-lg"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} /><Camera className="h-4 w-4" /></label></div><div className="rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-[#b7c9ba]">ID {user.id > 0 ? user.id : "preview"}</div></div><h2 className="mt-7 text-2xl font-semibold tracking-[-.04em]">{user.firstName || user.username}</h2><p className="mt-1 text-sm text-[#a9bdaa]">{courseName} · {label("особистий маршрут", "personal path")}</p><div className="mt-7 border-t border-white/10 pt-6"><div className="flex items-end justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.14em] text-[#8ea992]">{label("Поточний рівень", "Current level")}</div><div className="mt-2 text-4xl font-semibold tracking-[-.06em] text-[#73ecae]">{currentIad}</div></div><div className="rounded-xl bg-[#00ff88]/12 p-2.5 text-[#73ecae]"><Gauge className="h-5 w-5" /></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#00d977]" style={{ width: `${Math.min(100, currentIad)}%` }} /></div></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{stats.librarySolved}</div><div className="mt-1 text-xs leading-5 text-[#a9bdaa]">{label("задач розв’язано", "problems solved")}</div></div><div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{stats.avgGrade?.toFixed(0) ?? "—"}</div><div className="mt-1 text-xs leading-5 text-[#a9bdaa]">{label("середній результат", "average result")}</div></div></div></aside>
      <div className="space-y-6"><section className="rounded-[26px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15] sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-[#e87d00]"><Settings2 className="h-4 w-4" />{label("Налаштування навчання", "Learning setup")}</div><h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">{label("Основна мова", "Primary language")}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-[#6c7a70] dark:text-[#a4b2a7]">{label("Обери мову, у якій хочеш будувати наступний етап свого маршруту.", "Choose the language for the next stage of your learning path.")}</p></div><Code2 className="h-5 w-5 text-[#e87d00]" /></div><div className="mt-6 grid grid-cols-3 gap-2">{(["JAVA", "PYTHON", "CPP"] as const).map((item) => <button key={item} type="button" onClick={() => onCourse(item)} className={`rounded-xl border px-3 py-4 text-sm font-semibold transition ${course === item ? "border-[#00c96d] bg-[#e7f8ed] text-[#08783f] shadow-[0_10px_20px_-18px_rgba(0,165,90,.55)] dark:border-[#00ff88]/55 dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "border-[#152219]/10 bg-[#fafcf9] text-[#6b796f] hover:border-[#00c96d]/40 dark:border-white/10 dark:bg-white/[.025] dark:text-[#a9b8ad]"}`}>{item === "PYTHON" ? "Python" : item === "CPP" ? "C++" : "Java"}</button>)}</div>{message && <p className="mt-4 text-sm font-medium text-[#147b47] dark:text-[#62ecaa]">{message}</p>}</section>
        <section className="grid gap-4 sm:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-[26px] border border-[#152219]/10 bg-[#fbfcfa] p-6 dark:border-white/10 dark:bg-[#101813]">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-[#147b47] dark:text-[#62ecaa]">{label("Регулярність", "Consistency")}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{label("Практика цього тижня", "Practice this week")}</h2></div><Target className="h-5 w-5 text-[#147b47] dark:text-[#62ecaa]" /></div>
            <div className="mt-5 flex items-end justify-between gap-4"><div><span className="text-4xl font-semibold tracking-[-.06em]">{weeklyActiveDays}</span><span className="ml-1 text-sm text-[#718075] dark:text-[#a4b2a7]">/ 7 {label("днів", "days")}</span></div><span className="rounded-lg bg-[#e6f8ec] px-2.5 py-1 text-xs font-semibold text-[#147b47] dark:bg-[#00ff88]/10 dark:text-[#62ecaa]">{label("цього тижня", "this week")}</span></div>
            <div className="mt-5 grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < weeklyActiveDays ? "bg-[#00c96d]" : "bg-[#e2e9e3] dark:bg-white/10"}`} />)}</div>
            <p className="mt-4 text-sm leading-6 text-[#6b7a70] dark:text-[#a4b2a7]">{label("Це кількість днів за останні 7, коли ти здав або перевірив хоча б одну роботу.", "This is how many days in the last 7 you submitted or checked at least one task.")}</p>
          </div>
          <button type="button" onClick={() => setBadgesOpen(true)} className="group rounded-[26px] border border-[#ff8c00]/25 bg-[#fff7e9] p-6 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-27px_rgba(204,115,0,.46)] dark:bg-[#ff8c00]/[.07]">
            <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-[.15em] text-[#d97706]">{label("Досягнення", "Achievements")}</div><Trophy className="h-5 w-5 text-[#d97706] transition-transform group-hover:scale-110" /></div><div className="mt-3 flex items-end gap-3"><div className="text-4xl font-semibold tracking-[-.06em] text-[#17251c] dark:text-[#f1f7f2]">{unlockedBadges}</div><div className="pb-1 text-xs font-bold uppercase tracking-[.12em] text-[#b96600] dark:text-[#ffb85e]">{label("бейджів", "badges")}</div></div><div className="mt-3 flex items-center justify-between rounded-xl bg-[#fff0d5] px-3 py-2 text-xs font-semibold text-[#8a5a14] dark:bg-[#ff8c00]/10 dark:text-[#ffc46e]"><span>{label("Очки доказів", "Proof points")}</span><span>{badgePoints}</span></div><p className="mt-3 text-sm leading-6 text-[#796b52] dark:text-[#c0af90]">{label("Це прогрес за якість навчання, а не просто за кількість кліків.", "This progress rewards learning quality, not just clicks.")}</p><span className="mt-5 inline-flex text-sm font-semibold text-[#b96600] dark:text-[#ffb85e]">{label("Переглянути емблеми", "View emblems")} <ArrowRight className="ml-1 h-4 w-4" /></span>
          </button>
        </section>
        {skillEvidence ? <section className="mt-6 rounded-[26px] border border-[#152219]/10 bg-white p-6 dark:border-white/10 dark:bg-[#121b15] sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-[#147b47] dark:text-[#62ecaa]">skill evidence</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Що ти вже вмієш", "What you can do")}</h2><p className="mt-2 text-sm leading-6 text-[#68776d] dark:text-[#a4b2a7]">{label("Це докази практики з твоїх реальних спроб і розв’язаних задач.", "Evidence from your real attempts and solved tasks.")}</p></div><Sparkles className="h-5 w-5 text-[#e87d00]" /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.topics.length}</div><div className="mt-1 text-xs text-[#718075] dark:text-[#9eada1]">{label("тем практикував", "topics practiced")}</div></div><div className="rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.solvedTasks}</div><div className="mt-1 text-xs text-[#718075] dark:text-[#9eada1]">{label("задач вирішено", "tasks solved")}</div></div><div className="rounded-2xl bg-[#f5f8f5] p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.revisitedSolved}</div><div className="mt-1 text-xs text-[#718075] dark:text-[#9eada1]">{label("задач подолано після повторної спроби", "tasks solved after revisiting")}</div></div></div>{skillEvidence.topics.length ? <div className="mt-6 space-y-4">{skillEvidence.topics.map((topic) => { const progress = topic.practiced ? Math.round((topic.solved / topic.practiced) * 100) : 0; return <div key={topic.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{topic.name}</span><span className="text-xs text-[#718075] dark:text-[#9eada1]">{topic.solved}/{topic.practiced}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e3ebe4] dark:bg-white/10"><div className="h-full rounded-full bg-[#00c96d]" style={{ width: `${Math.min(100, progress)}%` }} /></div></div>; })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#152219]/15 p-4 text-sm text-[#718075] dark:border-white/10 dark:text-[#9eada1]">{label("Перші теми з’являться після перевірки задачі.", "Your first topics will appear after you check a task.")}</div>}</section> : null}
      </div>
    </div>
    {badgesOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[#081009]/55 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={label("Колекція емблем", "Emblem collection")}><div className="max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-[#152219]/10 bg-[#f8faf7] p-5 shadow-2xl dark:border-white/10 dark:bg-[#121b15] sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-[#d97706]">{label("Досягнення", "Achievements")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Твоя колекція емблем", "Your emblem collection")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7a70] dark:text-[#a4b2a7]">{label("Кожен бейдж має власні рівні. Нагорода з’являється тоді, коли ти доводиш навичку практикою.", "Every badge has its own levels. A reward appears when you prove the skill through practice.")}</p></div><div className="flex items-center gap-2"><div className="rounded-xl bg-[#fff0d5] px-3 py-2 text-xs font-bold text-[#8a5a14] dark:bg-[#ff8c00]/10 dark:text-[#ffc46e]">{badgePoints} {label("очків", "points")}</div><button type="button" onClick={() => setBadgesOpen(false)} className="rounded-xl bg-[#edf1ed] px-3 py-2 text-sm font-semibold text-[#526157] hover:bg-[#e1e8e2] dark:bg-white/[.08] dark:text-[#c0cdc2]">{label("Закрити", "Close")}</button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{PERSONAL_BADGES.map((badge) => { const value = getBadgeMetricValue(badge, badgeStats); const currentLevel = getBadgeLevel(badge, badgeStats); const nextLevel = getNextBadgeLevel(badge, badgeStats); const progress = getBadgeProgressPercent(badge, badgeStats); const unlocked = isPersonalBadgeUnlocked(badge, badgeStats); const displayLevel = currentLevel ?? badge.levels[0]; const Icon = badge.Icon; const emblemTone = displayLevel.rank >= 4 ? "bg-gradient-to-br from-[#b9a7ff] to-[#6d5bd0] text-white ring-[#a995ff]/60" : displayLevel.rank === 3 ? "bg-gradient-to-br from-[#ffe18a] to-[#e5a51c] text-[#5b3b00] ring-[#ffd76a]/70" : displayLevel.rank === 2 ? "bg-gradient-to-br from-[#e8eef3] to-[#9ba9b8] text-[#26313b] ring-[#d5e1eb]/70" : "bg-gradient-to-br from-[#e3a36a] to-[#9b5522] text-[#351b0a] ring-[#e5a36a]/60"; return <div key={badge.id} className={`rounded-2xl border p-4 transition ${unlocked ? "border-[#00c96d]/35 bg-[#eaf9ef] dark:bg-[#00ff88]/[.07]" : "border-[#152219]/10 bg-white/55 dark:border-white/10 dark:bg-white/[.025]"}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-2 ${emblemTone}`}><Icon className="h-5 w-5" /><span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-[#f8faf7] bg-[#17251c] text-[9px] font-bold text-white dark:border-[#121b15]">{displayLevel.rank}</span></span><div><div className="font-semibold">{label(badge.nameUk, badge.nameEn)}</div><div className="mt-0.5 text-xs font-bold text-[#147b47] dark:text-[#72edb0]">{unlocked ? label(`Рівень ${displayLevel.rank} · ${displayLevel.nameUk}`, `Level ${displayLevel.rank} · ${displayLevel.nameEn}`) : label("Ще не відкрито", "Not unlocked yet")}</div></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${unlocked ? "bg-[#00c96d]/15 text-[#147b47] dark:text-[#72edb0]" : "bg-black/[.05] text-[#8a988d] dark:bg-white/[.06]"}`}>{unlocked ? `+${displayLevel.points} ${label("очків", "pts")}` : label("У процесі", "In progress")}</span></div><p className="mt-4 text-xs font-semibold text-[#526157] dark:text-[#c7d5ca]">{label(badge.detailUk, badge.detailEn)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dfe9e1] dark:bg-white/10"><div className={`h-full rounded-full ${unlocked ? "bg-[#00c96d]" : "bg-[#9caea0]"}`} style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-[11px] text-[#718075] dark:text-[#9eada1]"><span>{value}/{nextLevel?.threshold ?? displayLevel.threshold}</span><span>{nextLevel ? label(`до ${nextLevel.nameUk}`, `to ${nextLevel.nameEn}`) : label("максимальний рівень", "max level")}</span></div><div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-[#68776d] dark:bg-white/[.05] dark:text-[#b5c5b8]"><span className="font-semibold text-[#147b47] dark:text-[#72edb0]">{label("Нагорода: ", "Reward: ")}</span>{label((currentLevel ?? badge.levels[0]).rewardUk, (currentLevel ?? badge.levels[0]).rewardEn)}</div><div className="mt-2 text-[11px] text-[#718075] dark:text-[#9eada1]"><span className="font-semibold">{label("Що це доводить: ", "What it proves: ")}</span>{label(badge.valueUk, badge.valueEn)}</div></div>; })}</div></div></div>}
  </div></div>;
};

export const PremiumLibrary: React.FC<{
  tasks: LibraryTaskListItem[];
  total: number | null;
  solved: number;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onOpen: (task: LibraryTaskListItem) => void;
}> = ({ tasks, total, solved, loading, query, onQuery, onOpen }) => {
  const { i18n } = useTranslation();
  const en = i18n.language?.toLowerCase().startsWith("en");
  const [difficultyFilter, setDifficultyFilter] = React.useState<"ALL" | "EASY" | "MEDIUM" | "HARD">("ALL");
  const [modeFilter, setModeFilter] = React.useState<"ALL" | "CODE" | "WEB">("ALL");
  const copy = en ? {
    eyebrow: "Task library", title: "Find the right challenge for today.", subtitle: "Search by skill, narrow the level, and move straight into the library task.", search: "Try arrays, loops, or a task title", available: "available problems", solved: "solved", open: "Open problem", all: "All", empty: "Nothing matches these filters yet.", easy: "Easy", medium: "Medium", hard: "Hard", code: "Code", web: "Web", project: "Mini-project",
  } : {
    eyebrow: "\u0411\u0456\u0431\u043b\u0456\u043e\u0442\u0435\u043a\u0430 \u0437\u0430\u0432\u0434\u0430\u043d\u044c", title: "\u0417\u043d\u0430\u0439\u0434\u0438 \u0437\u0430\u0434\u0430\u0447\u0443 \u043f\u0456\u0434 \u0441\u044c\u043e\u0433\u043e\u0434\u043d\u0456\u0448\u043d\u044e \u0446\u0456\u043b\u044c.", subtitle: "\u0428\u0443\u043a\u0430\u0439 \u0437\u0430 \u043d\u0430\u0432\u0438\u0447\u043a\u043e\u044e, \u0437\u0432\u0443\u0436\u0443\u0439 \u0440\u0456\u0432\u0435\u043d\u044c \u0456 \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u044c \u043e\u0434\u0440\u0430\u0437\u0443 \u0434\u043e \u0437\u0430\u0434\u0430\u0447\u0456 \u0437 \u0431\u0456\u0431\u043b\u0456\u043e\u0442\u0435\u043a\u0438.", search: "\u041d\u0430\u043f\u0440\u0438\u043a\u043b\u0430\u0434: \u043c\u0430\u0441\u0438\u0432\u0438, \u0446\u0438\u043a\u043b\u0438 \u0430\u0431\u043e \u043d\u0430\u0437\u0432\u0430 \u0437\u0430\u0434\u0430\u0447\u0456", available: "\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0445 \u0437\u0430\u0434\u0430\u0447", solved: "\u0440\u043e\u0437\u0432\u2019\u044f\u0437\u0430\u043d\u043e", open: "\u0412\u0456\u0434\u043a\u0440\u0438\u0442\u0438 \u0437\u0430\u0434\u0430\u0447\u0443", all: "\u0423\u0441\u0456", empty: "\u0417\u0430 \u0446\u0438\u043c\u0438 \u0444\u0456\u043b\u044c\u0442\u0440\u0430\u043c\u0438 \u043d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u0437\u043d\u0430\u0439\u0434\u0435\u043d\u043e.", easy: "\u041b\u0435\u0433\u043a\u0430", medium: "\u0421\u0435\u0440\u0435\u0434\u043d\u044f", hard: "\u0421\u043a\u043b\u0430\u0434\u043d\u0430", code: "\u041a\u043e\u0434", web: "\u0412\u0435\u0431", project: "\u041c\u0456\u043d\u0456\u043f\u0440\u043e\u0454\u043a\u0442",
  };
  const difficulty = (value: LibraryTaskListItem["difficulty"]) => value === "HARD" ? copy.hard : value === "MEDIUM" ? copy.medium : copy.easy;
  const tone = (value: LibraryTaskListItem["difficulty"]) => value === "HARD" ? "bg-[#fff0f4] text-[#dc5478] dark:bg-[#ff6b9d]/10 dark:text-[#ff94b7]" : value === "MEDIUM" ? "bg-[#fff4df] text-[#d97706] dark:bg-[#ff8c00]/10 dark:text-[#ffb85e]" : "bg-[#e9f8ee] text-[#14804a] dark:bg-[#00ff88]/10 dark:text-[#72edb0]";
  const filteredTasks = tasks.filter((task) =>
    (difficultyFilter === "ALL" || task.difficulty === difficultyFilter) &&
    (modeFilter === "ALL" || (task.taskMode || "CODE") === modeFilter)
  );
  const clearSearch = () => {
    onQuery("");
    setDifficultyFilter("ALL");
    setModeFilter("ALL");
  };
  return <div className="min-h-full bg-[#f7f8f5] px-4 py-6 text-[#142017] dark:bg-[#0b120e] dark:text-[#edf3ef] sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
    <section className="relative overflow-hidden rounded-[28px] border border-[#152219]/10 bg-[#eaf2eb] p-6 dark:border-white/10 dark:bg-[#131d16] sm:p-8"><div className="absolute -right-16 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_center,rgba(0,255,136,.14),transparent_62%)]" /><div className="relative max-w-3xl"><div className="text-sm font-semibold text-[#147b47] dark:text-[#62ecaa]">{copy.eyebrow}</div><h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em] sm:text-4xl lg:text-5xl">{copy.title}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-[#607065] dark:text-[#a8b6ab] sm:text-lg">{copy.subtitle}</p><div className="mt-7 flex flex-wrap gap-7"><div><div className="text-3xl font-semibold tracking-[-.05em]">{total ?? tasks.length}</div><div className="mt-1 text-sm text-[#6b7a70] dark:text-[#9ead9f]">{copy.available}</div></div><div><div className="text-3xl font-semibold tracking-[-.05em] text-[#00a75a] dark:text-[#62ecaa]">{solved}</div><div className="mt-1 text-sm text-[#6b7a70] dark:text-[#9ead9f]">{copy.solved}</div></div></div></div></section>
    <section className="rounded-[26px] border border-[#152219]/10 bg-white p-5 dark:border-white/10 dark:bg-[#121b15] sm:p-6"><div className="relative"><svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#6f8074]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input autoComplete="off" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={copy.search} className="h-14 w-full rounded-2xl border border-[#152219]/10 bg-[#f8faf7] pl-12 pr-24 text-base font-medium outline-none transition placeholder:font-normal placeholder:text-[#929f96] focus:border-[#00c96d] focus:ring-4 focus:ring-[#00ff88]/10 dark:border-white/10 dark:bg-white/[.035]" />{query && <button type="button" onClick={() => onQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-semibold text-[#617066] hover:bg-[#e9efea] dark:text-[#a8b6ab] dark:hover:bg-white/[.06]">{en ? "Clear" : "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438"}</button>}</div><p className="mt-2 text-xs text-[#78867c] dark:text-[#93a197]">{en ? "Search titles, descriptions, topics and tags." : "\u041f\u043e\u0448\u0443\u043a \u043f\u0440\u0430\u0446\u044e\u0454 \u0437\u0430 \u043d\u0430\u0437\u0432\u0430\u043c\u0438, \u043e\u043f\u0438\u0441\u0430\u043c\u0438, \u0442\u0435\u043c\u0430\u043c\u0438 \u0439 \u0442\u0435\u0433\u0430\u043c\u0438."}</p><div className="mt-5 flex flex-col gap-4 border-t border-[#152219]/8 pt-5 dark:border-white/[.08] lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold text-[#718075]">{en ? "Level" : "\u0420\u0456\u0432\u0435\u043d\u044c"}</span>{([['ALL', en ? 'All' : '\u0423\u0441\u0456'], ['EASY', copy.easy], ['MEDIUM', copy.medium], ['HARD', copy.hard]] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setDifficultyFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${difficultyFilter === value ? "bg-[#17251c] text-white dark:bg-[#edf3ef] dark:text-[#0b120e]" : "bg-[#f0f4ef] text-[#5f6f64] dark:bg-white/[.05] dark:text-[#a8b6ab]"}`}>{label}</button>)}<span className="mx-1 hidden h-5 w-px bg-[#dfe5df] dark:bg-white/10 sm:block" />{([['ALL', en ? 'Any format' : '\u0423\u0441\u0456 \u0444\u043e\u0440\u043c\u0430\u0442\u0438'], ['CODE', copy.code], ['WEB', copy.web]] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setModeFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${modeFilter === value ? "bg-[#e8f8ed] text-[#147b47] ring-1 ring-[#00c96d]/25 dark:bg-[#00ff88]/10 dark:text-[#72edb0]" : "text-[#65746a] dark:text-[#a8b6ab]"}`}>{label}</button>)}</div><div className="flex items-center gap-3 text-sm text-[#718075] dark:text-[#9dac9f]"><b className="text-[#1c2b21] dark:text-white">{filteredTasks.length}</b> {en ? "results" : "\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0456\u0432"}{(query || difficultyFilter !== "ALL" || modeFilter !== "ALL") && <button type="button" onClick={clearSearch} className="text-xs font-semibold text-[#147b47] dark:text-[#72edb0]">{en ? "Reset" : "\u0421\u043a\u0438\u043d\u0443\u0442\u0438"}</button>}</div></div></section>
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-[24px] bg-[#e9eeea] dark:bg-white/[.045]" />)}</div> : filteredTasks.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredTasks.map((task) => <article key={task.id} className="group flex min-h-[250px] flex-col rounded-[24px] border border-[#152219]/10 bg-white p-5 shadow-[0_16px_38px_-34px_rgba(17,43,25,.45)] transition hover:-translate-y-1 hover:border-[#00c96d]/40 hover:shadow-[0_20px_45px_-30px_rgba(17,58,31,.42)] dark:border-white/10 dark:bg-[#121b15] dark:hover:bg-[#152019]"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tone(task.difficulty)}`}>{difficulty(task.difficulty)}</span>{task.projectSpec ? <span className="inline-flex items-center gap-1 rounded-lg bg-[#fff4df] px-2.5 py-1 text-xs font-semibold text-[#a65600] dark:bg-[#ffb454]/10 dark:text-[#ffca7e]"><Rocket className="h-3 w-3" />{copy.project}</span> : null}</div><span className="text-xs font-medium text-[#809084] dark:text-[#96a69b]">{task.taskMode === "WEB" ? copy.web : copy.code}</span></div><h2 className="mt-5 text-lg font-semibold tracking-tight">{task.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-[#6b7b70] dark:text-[#a0aea3]">{task.description || task.section || "Practice the concept in your own solution."}</p><div className="mt-auto flex items-center justify-between gap-3 pt-5"><div className="flex flex-wrap gap-1.5">{(task.tags || []).slice(0, 2).map((tag) => <span key={tag} className="rounded-md bg-[#f3f6f3] px-2 py-1 text-[11px] font-medium text-[#607064] dark:bg-white/[.06] dark:text-[#a4b2a8]">{tag}</span>)}</div><button onClick={() => onOpen(task)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#147b47] transition group-hover:text-[#00a75a] dark:text-[#62ecaa]">{copy.open}<ArrowRight className="h-4 w-4" /></button></div></article>)}</div> : <div className="rounded-[26px] border border-dashed border-[#152219]/15 bg-white px-5 py-16 text-center text-sm text-[#718075] dark:border-white/10 dark:bg-[#121b15] dark:text-[#9caea0]">{copy.empty}</div>}
  </div></div>;
};

