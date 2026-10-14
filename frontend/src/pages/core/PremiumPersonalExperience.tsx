import React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarDays,
  Camera,
  Check,
  Clock3,
  Code2,
  Compass,
  Flame,
  ExternalLink,
  Gauge,
  GraduationCap,
  Layers3,
  Play,
  Rocket,
  Sparkles,
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
    empty: "Почни з першої задачі, і тут з’явиться маршрут.",
    queue: "Черга практики",
    allTasks: "Усі задачі",
    progress: "Твій прогрес",
    completed: "завершено",
    streak: "ритм навчання",
    score: "рівень впевненості",
    smartPath: "План навчання",
    pathCopy: "Курс, практика й повторення зібрані в одному плані.",
    explore: "Дослідити",
    journal: "Прогрес",
    progressTitle: "Прогрес навчання",
    progressCopy: "Переглянь, що вже засвоєно, а що варто повторити.",
    average: "Середній результат",
    attempts: "спроб",
    passed: "закрито",
    momentum: "динаміка",
    topics: "Карта тем",
    recent: "Остання активність",
    noData: "Дані з’являться після першої перевіреної роботи.",
    projectsKicker: "Завершені проєкти",
    projectsTitle: "Галерея проєктів",
    projectsCopy: "Тут зберігаються завершені мініпроєкти. Відкрий їх, щоб переглянути рішення.",
    projectsEmpty: "Перший завершений мініпроєкт з’явиться тут після успішної перевірки.",
    projectSkills: "Навички",
    openProject: "Відкрити проєкт",
    improve: "Повернутися до теми",
    strong: "Сильна тема",
    focus: "Точка росту",
    profile: "Профіль",
    account: "Навчальний профіль",
    accountCopy: "Налаштуй профіль і переглядай результати в ньому.",
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
    empty: "Start with your first task, and your path will appear here.",
    queue: "Practice queue",
    allTasks: "All tasks",
    progress: "Your progress",
    completed: "completed",
    streak: "learning rhythm",
    score: "confidence level",
    smartPath: "Learning plan",
    pathCopy: "Coursework, practice, and revision are collected in one plan.",
    explore: "Explore",
    journal: "Progress",
    progressTitle: "Learning progress",
    progressCopy: "Review what you have learned and what needs more practice.",
    average: "Average result",
    attempts: "attempts",
    passed: "completed",
    momentum: "momentum",
    topics: "Topic map",
    recent: "Recent activity",
    noData: "Data will appear after your first reviewed task.",
    projectsKicker: "Completed projects",
    projectsTitle: "Project gallery",
    projectsCopy: "Your completed mini-projects stay here. Open one to review the solution.",
    projectsEmpty: "Your first completed mini-project will appear here after a successful check.",
    projectSkills: "Skills",
    openProject: "Open project",
    improve: "Practice this topic",
    strong: "Strong topic",
    focus: "Growth point",
    profile: "Profile",
    account: "Learning profile",
    accountCopy: "Set up your profile and review your results there.",
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
  const actionableTasks = React.useMemo(() => {
    const statusRank: Record<Task["status"], number> = {
      OPEN: 0,
      SUBMITTED: 1,
      GRADED: 2,
    };
    return [...tasks].sort((a, b) => {
      const rankDelta = statusRank[a.status] - statusRank[b.status];
      if (rankDelta !== 0) return rankDelta;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tasks]);
  const active = actionableTasks.find((task) => task.status === "OPEN")
    ?? actionableTasks.find((task) => task.status === "SUBMITTED")
    ?? actionableTasks[0];
  const completion = tasks.length ? Math.round((complete / tasks.length) * 100) : 0;
  const completedProjects = React.useMemo(() => tasks
    .filter((task) => task.status === "GRADED" && String(task.subtitle ?? "").startsWith("MPJ:"))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [tasks]);
  const shortQueue = actionableTasks.filter((task) => task.id !== active?.id).slice(0, 3);
  const activeIsWaiting = active?.status === "SUBMITTED";
  const dashboardLead = tasks.length
    ? complete > 0
      ? en
        ? `You have ${complete} completed task${complete === 1 ? "" : "s"}. Open the next practice when you're ready.`
        : `У тебе вже ${complete} завершено. Наступна практика готова, коли захочеш продовжити.`
      : en
        ? "Your first practice is ready. Start with a short task, and the next one will be based on the result."
        : "Перша практика готова. Почни з короткої задачі, а наступну система підбере за результатом."
    : c.empty;

  return (
    <div className="min-h-full bg-bg-base px-4 py-6 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
        <section className="relative overflow-hidden rounded-[28px] border border-border/10 bg-bg-surface px-6 py-7 dark:border-white/10 dark:bg-bg-surface sm:px-8 sm:py-9">
          <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute right-[18%] top-0 h-full w-px bg-bg-base/8 dark:bg-white/8" />
          <div className="relative grid gap-7 lg:grid-cols-[1fr_320px] lg:items-end">
            <div>
              <div className="mb-5 flex items-center gap-3 text-sm font-medium text-text-muted dark:text-text-secondary">
                <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/12 text-primary-strong dark:text-primary-soft"><Sparkles className="h-4 w-4" /></span>
                {c.space}
              </div>
              <h1 className="max-w-2xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.045em] sm:text-4xl lg:text-5xl">
                {c.welcome}, {user.firstName || user.username}.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary sm:text-lg">
                {dashboardLead}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => active && !activeIsWaiting ? onOpenTask(active) : onNavigate(activeIsWaiting ? "grades" : "tasks")} className="inline-flex items-center gap-2 rounded-xl bg-bg-base px-5 py-3 text-sm font-semibold text-text-primary shadow-[0_12px_28px_-14px_rgba(0,0,0,.55)] transition hover:-translate-y-0.5 hover:bg-bg-surface dark:bg-bg-hover dark:text-text-primary">
                  <Play className="h-4 w-4 fill-current" /> {activeIsWaiting ? (en ? "View review" : "Переглянути перевірку") : c.continue}
                </button>
                <button type="button" onClick={() => window.location.assign(import.meta.env.DEV ? "/library?preview=true" : "/library")} className="inline-flex items-center gap-2 rounded-xl border border-border/12 bg-white/70 px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-text-primary dark:hover:bg-white/10">
                  <BookOpen className="h-4 w-4" /> {c.browse}
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/80 bg-white/70 p-5 shadow-[0_18px_50px_-34px_rgba(17,44,28,.65)] backdrop-blur dark:border-white/10 dark:bg-bg-code/80">
              <div className="flex items-center justify-between text-sm text-text-muted dark:text-text-secondary"><span>{c.progress}</span><span className="font-semibold text-text-primary dark:text-white">{completion}%</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} /></div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div><div className="text-2xl font-semibold tracking-tight">{complete}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{c.completed}</div></div>
                <div><div className="text-2xl font-semibold tracking-tight">{tasks.length}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{c.attempts}</div></div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,.7fr)]">
          <section className="rounded-[26px] border border-border/10 bg-white p-5 shadow-[0_18px_45px_-40px_rgba(18,39,24,.48)] dark:border-white/10 dark:bg-bg-surface sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{c.today}</div><h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{c.next}</h2></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-hover text-accent-warn dark:bg-accent-warn/12"><Code2 className="h-5 w-5" /></span></div>
            {loading ? <div className="h-40 animate-pulse rounded-2xl bg-bg-hover dark:bg-white/5" role="status" aria-label={en ? "Loading next task" : "Завантаження наступної задачі"} /> : active ? <button type="button" onClick={() => activeIsWaiting ? onNavigate("grades") : onOpenTask(active)} className="group w-full rounded-2xl bg-bg-base p-5 text-left text-text-primary transition hover:-translate-y-0.5 hover:shadow-xl dark:bg-bg-base sm:p-6"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-medium text-text-secondary">{active.topicTitle || "Practice"}</div><div className="mt-2 text-lg font-semibold sm:text-xl">{active.title}</div><p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary">{activeIsWaiting ? (en ? "Your solution is waiting for review." : "Твоє рішення очікує перевірки.") : (active.subtitle || "Open the task, write a solution, and check it.")}</p></div><ArrowUpRight className="h-5 w-5 shrink-0 text-primary-soft transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" /></div><div className="mt-6 flex items-center gap-2 text-sm font-semibold text-primary-soft"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10"><Play className="h-3.5 w-3.5 fill-current" /></span>{activeIsWaiting ? (en ? "View review" : "Переглянути перевірку") : c.continue}</div></button> : <div className="rounded-2xl border border-dashed border-border/15 p-7 text-center text-sm leading-6 text-text-muted dark:border-white/10 dark:text-text-secondary">{c.empty}</div>}
          </section>

          <section className="rounded-[26px] border border-border/10 bg-bg-surface p-5 dark:border-white/10 dark:bg-bg-code sm:p-6" aria-labelledby="personal-path-title">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-accent-warn">{c.smartPath}</div><h2 id="personal-path-title" className="mt-2 text-xl font-semibold tracking-tight">{c.progress}</h2></div><Gauge className="h-5 w-5 text-accent-warn" /></div>
            <p className="mt-4 text-sm leading-6 text-text-muted dark:text-text-secondary">{c.pathCopy}</p>
            <button type="button" onClick={() => onNavigate("grades")} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-strong transition hover:text-primary-strong dark:text-primary-soft">{c.explore}<ArrowRight className="h-4 w-4" /></button>
            <div className="mt-7 flex items-end gap-1.5" aria-hidden="true">{[36, 54, 42, 74, 58, 83, 71].map((height, index) => <div key={index} className={`flex-1 rounded-t-md ${index === 5 ? "bg-primary" : "bg-bg-hover dark:bg-white/10"}`} style={{ height }} />)}</div>
          </section>
        </div>

        <section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface sm:p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold tracking-tight">{c.queue}</h2><button type="button" onClick={() => onNavigate("tasks")} className="text-sm font-semibold text-primary-strong dark:text-primary-soft">{c.allTasks}</button></div>
          <div className="grid gap-3 md:grid-cols-3">{shortQueue.length ? shortQueue.map((task, index) => <button type="button" key={task.id} onClick={() => onOpenTask(task)} className="group rounded-2xl border border-border/10 bg-bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.025] dark:hover:bg-white/[.06]"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-text-muted dark:text-text-secondary">0{index + 1}</span>{task.status === "GRADED" ? <Check className="h-4 w-4 text-primary-strong" /> : <Clock3 className="h-4 w-4 text-accent-warn" />}</div><div className="mt-5 font-semibold text-text-primary dark:text-text-primary">{task.title}</div><div className="mt-2 text-sm text-text-muted dark:text-text-secondary">{task.status === "GRADED" ? c.completed : task.topicTitle || "Practice"}</div></button>) : <div className="col-span-full rounded-2xl bg-bg-base px-5 py-7 text-sm text-text-muted dark:bg-white/[.035] dark:text-text-secondary">{c.empty}</div>}</div>
        </section>

        <section className="overflow-hidden rounded-[26px] border border-border/10 bg-bg-base p-5 text-text-primary shadow-[0_22px_55px_-38px_rgba(5,25,12,.9)] dark:border-white/10 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-primary-soft"><Trophy className="h-4 w-4" />{c.projectsKicker}</div>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{c.projectsTitle}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{c.projectsCopy}</p>
            </div>
            <div className="flex h-12 min-w-12 items-center justify-center rounded-2xl bg-primary/12 px-4 text-xl font-semibold text-primary-soft">{completedProjects.length}</div>
          </div>
          {completedProjects.length ? <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{completedProjects.map((project, index) => <button key={project.id} type="button" onClick={() => onOpenTask(project)} className="group rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left transition hover:-translate-y-0.5 hover:border-primary-soft/45 hover:bg-white/[.09]"><div className="flex items-start justify-between gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-sm font-semibold text-primary-soft">{index + 1}</span><Check className="h-4 w-4 text-primary-soft" /></div><div className="mt-5 font-semibold text-text-primary">{project.title}</div><div className="mt-2 text-xs text-text-secondary">{project.language === "PYTHON" ? "Python" : project.language === "CPP" ? "C++" : "Java"} · {c.completed}</div><div className="mt-4 flex flex-wrap gap-1.5">{(project.projectSpec?.skills ?? []).slice(0, 3).map((skill) => <span key={skill} className="rounded-full bg-white/[.08] px-2 py-1 text-[11px] text-text-primary">{skill}</span>)}</div><div className="mt-4 text-xs font-semibold text-primary-soft transition group-hover:text-white">{c.openProject} <ArrowRight className="ml-1 inline h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></div></button>)}</div> : <div className="mt-6 rounded-2xl border border-dashed border-white/15 px-5 py-8 text-center text-sm leading-6 text-text-secondary">{c.projectsEmpty}</div>}
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
    { label: c.attempts, value: stats.count, Icon: Layers3, color: "var(--primary-strong)" },
    { label: c.average, value: stats.avg.toFixed(1), Icon: Target, color: "var(--primary-strong)" },
    { label: c.passed, value: stats.passed, Icon: Check, color: "var(--accent-warn)" },
    { label: c.score, value: stats.excellent, Icon: Flame, color: "var(--accent-error)" },
  ];
  return <div className="min-h-full bg-bg-base px-4 py-6 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
    <section className="grid gap-6 rounded-[28px] border border-border/10 bg-bg-hover p-6 dark:border-white/10 dark:bg-bg-surface lg:grid-cols-[1.2fr_.8fr] lg:p-8">
      <div><div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><Compass className="h-4 w-4" />{c.journal}</div><h1 className="mt-5 max-w-xl font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{c.progressTitle}</h1><p className="mt-4 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{c.progressCopy}</p></div>
      <div className="rounded-2xl bg-bg-base p-5 text-text-primary shadow-[0_20px_48px_-30px_rgba(0,0,0,.65)]"><div className="flex items-start justify-between"><div><div className="text-sm text-text-secondary">{c.average}</div><div className={`mt-2 text-5xl font-semibold tracking-[-.06em] ${stats.avg >= 75 ? "text-primary-soft" : "text-accent-warn"}`}>{stats.avg.toFixed(1)}</div></div><div className="rounded-xl bg-white/10 p-2.5"><Target className="h-5 w-5 text-primary-soft" /></div></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, stats.avg))}%` }} /></div><div className="mt-3 flex items-center gap-2 text-sm text-text-secondary">{trendUp ? <TrendingUp className="h-4 w-4 text-primary-soft" /> : <TrendingDown className="h-4 w-4 text-accent-error" />}<span>{trendUp ? "+" : ""}{stats.trend.toFixed(1)} {c.momentum}</span></div></div>
    </section>
    <div className="grid auto-rows-fr gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ label, value, Icon, color }) => <div key={label} className="flex h-full min-h-[126px] flex-col justify-between rounded-2xl border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface"><div className="flex items-center justify-between text-sm text-text-muted dark:text-text-secondary"><span>{label}</span><Icon className="h-4 w-4" style={{ color }} /></div><div className="mt-4 text-3xl font-semibold tracking-[-.045em]">{value}</div></div>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]"><section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface sm:p-6"><div className="mb-5 flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{c.topics}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.progress}</h2></div></div>{topics.length ? <div className="space-y-3">{topics.slice(0, 6).map((topic) => { const needsFocus = topic.average < 65; return <div key={topic.key} className="rounded-2xl border border-border/8 bg-bg-surface p-4 dark:border-white/8 dark:bg-white/[.025]"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-semibold">{topic.topicTitle}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{topic.attempts} {c.attempts} · {needsFocus ? c.focus : c.strong}</div></div><div className="flex items-center gap-3"><div className={`text-xl font-semibold ${topic.average >= 75 ? "text-primary-strong dark:text-primary-soft" : topic.average >= 50 ? "text-accent-warn" : "text-accent-error"}`}>{topic.average.toFixed(0)}</div>{needsFocus && <button type="button" onClick={() => onRetry(topic.topicId)} className="rounded-lg bg-bg-hover px-3 py-2 text-xs font-semibold text-primary-strong transition hover:bg-[var(--surface-primary)] dark:bg-primary/10 dark:text-primary-soft">{c.improve}</button>}</div></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, topic.average)}%` }} /></div></div>; })}</div> : <Empty c={c} />}</section>
      <section className="rounded-[26px] border border-border/10 bg-bg-surface p-5 dark:border-white/10 dark:bg-bg-code sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-accent-warn">{c.recent}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.journal}</h2>{recent.length ? <div className="mt-5 space-y-3">{recent.slice(0, 5).map((grade, index) => <div key={`${grade.id}-${index}`} className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-semibold text-primary-strong shadow-sm dark:bg-white/8 dark:text-primary-soft"><Code2 className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{grade.task?.title || "Practice task"}</div><div className="mt-0.5 text-xs text-text-muted dark:text-text-secondary">{new Date(grade.createdAt).toLocaleDateString()}</div></div><div className={`font-semibold ${Number(grade.total) >= 75 ? "text-primary-strong dark:text-primary-soft" : "text-accent-warn"}`}>{Number(grade.total)}</div></div>)}</div> : <div className="mt-5"><Empty c={c} /></div>}</section></div>
  </div></div>;
};

const Empty: React.FC<{ c: typeof text.uk }> = ({ c }) => <div className="rounded-2xl border border-dashed border-border/15 p-7 text-center text-sm leading-6 text-text-muted dark:border-white/10 dark:text-text-secondary">{c.noData}</div>;

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
  return <div className="min-h-full bg-bg-base px-4 py-6 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-6xl space-y-6 lg:space-y-8">
    <section className="relative overflow-hidden rounded-[28px] border border-border/10 bg-bg-hover p-6 dark:border-white/10 dark:bg-bg-surface sm:p-8"><div className="absolute -right-16 -top-20 h-60 w-60 rounded-full bg-accent-warn/10 blur-3xl" /><div className="relative flex flex-col gap-6 sm:flex-row sm:items-center"><div className="relative shrink-0"><div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] bg-bg-base text-3xl font-semibold text-primary-soft shadow-xl">{avatarUrl ? <img className="h-full w-full object-cover" src={avatarUrl} alt="" width={96} height={96} loading="lazy" /> : initials(user.username)}</div><label className="absolute -bottom-2 -right-2 cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-semibold text-text-primary shadow-lg transition hover:-translate-y-0.5 dark:bg-bg-hover"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} />{c.avatar}</label></div><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><GraduationCap className="h-4 w-4" />{c.account}</div><h1 className="mt-3 truncate font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.045em] sm:text-4xl">{user.firstName || user.username}</h1><p className="mt-3 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{c.accountCopy}</p></div></div></section>
    <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]"><section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-primary-strong dark:text-primary-soft">{c.achievements}</div><div className="mt-5 grid grid-cols-2 gap-3"><Stat value={stats.librarySolved} label={c.solved} /><Stat value={stats.totalGrades} label={c.grades} /><Stat value={stats.avgGrade?.toFixed(1) ?? "—"} label={c.average} /><Stat value={currentIad} label={c.level} /></div><div className="mt-5 rounded-2xl bg-bg-hover p-4 text-sm leading-6 text-text-muted dark:bg-white/[.04] dark:text-text-secondary"><span className="font-semibold text-text-primary dark:text-text-primary">{stats.badgesUnlocked}</span> badges unlocked · {stats.excellent} excellent results</div></section>
      <section className="rounded-[26px] border border-border/10 bg-bg-surface p-5 dark:border-white/10 dark:bg-bg-code sm:p-6"><div className="text-xs font-semibold uppercase tracking-[.16em] text-accent-warn">{c.learningProfile}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{c.language}</h2><p className="mt-2 max-w-md text-sm leading-6 text-text-muted dark:text-text-secondary">{c.settingsHint}</p><div className="mt-5 grid grid-cols-3 gap-2">{(["JAVA", "PYTHON", "CPP"] as const).map((item) => <button key={item} type="button" onClick={() => onCourse(item)} className={`rounded-xl px-3 py-3 text-sm font-semibold transition ${course === item ? "bg-bg-base text-text-primary shadow-lg dark:bg-bg-hover dark:text-text-primary" : "border border-border/10 bg-white text-text-muted hover:border-primary/45 dark:border-white/10 dark:bg-white/[.025] dark:text-text-secondary"}`}>{item === "PYTHON" ? "Python" : item === "CPP" ? "C++" : "Java"}</button>)}</div><div className="mt-6 flex flex-wrap items-center gap-3"><button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[0_14px_24px_-16px_rgba(0,191,103,.8)] transition hover:-translate-y-0.5 hover:bg-primary disabled:opacity-60">{saving ? c.saving : c.save}</button>{message && <span className="text-sm text-primary-strong dark:text-primary-soft">{message}</span>}</div></section></div>
  </div></div>;
};

const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => <div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold tracking-[-.045em]">{value}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label}</div></div>;

export const SkillEvidenceDetails: React.FC<{ evidence: SkillEvidence; label: (uk: string, en: string) => string }> = ({ evidence, label }) => {
  if (!evidence.overcomeCategories?.length && !evidence.recentSkills?.length) return null;
  return <section className="mt-4 rounded-[22px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface">
    {evidence.overcomeCategories?.length ? <div><div className="text-xs font-semibold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{label("Подолані категорії помилок", "Overcome categories")}</div><div className="mt-3 flex flex-wrap gap-2">{evidence.overcomeCategories.map((item) => <span key={item.name} className="rounded-full bg-bg-hover px-3 py-1.5 text-xs font-semibold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{item.name} · {item.tasks}</span>)}</div></div> : null}
    {evidence.recentSkills?.length ? <div className={evidence.overcomeCategories?.length ? "mt-5" : ""}><div className="text-xs font-semibold uppercase tracking-[.15em] text-text-secondary">{label("Останні закріплені навички", "Recent evidence")}</div><div className="mt-3 space-y-2">{evidence.recentSkills.map((item) => <div key={`${item.taskId}-${item.createdAt}`} className="flex items-center justify-between gap-3 rounded-xl bg-bg-hover px-3 py-2 text-xs dark:bg-white/[.04]"><span>{item.topic || item.category || label("практика", "practice")}</span><span className="font-semibold text-primary-strong dark:text-primary-soft">{item.outcome}</span></div>)}</div></div> : null}
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
  onSave: () => void;
  isEducational?: boolean;
  className?: string | null;
  canEditProfile?: boolean;
}> = ({ user, avatarUrl, course, stats, currentIad, weeklyActiveDays, skillEvidence, saving, message, onAvatar, onSave, isEducational = false, className, canEditProfile = true }) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const label = (ukText: string, enText: string) => uk ? ukText : enText;
  const courseName = course === "PYTHON" ? "Python" : course === "CPP" ? "C++" : "Java";
  const scopeLabel = isEducational ? label("EDU акаунт", "EDU account") : label("Особистий акаунт", "Personal account");
  const profileTitle = isEducational ? label("Профіль у класі", "Class profile") : label("Твій профіль", "Your profile");
  const profileCopy = isEducational
    ? label("Твій навчальний контекст, прогрес і налаштування зібрані в одному спокійному просторі.", "Your class context, progress, and settings live together in one calm space.")
    : label("Тут зберігається твій навчальний контекст — без зайвого шуму.", "Your learning context lives here, without unnecessary noise.");
  const roleLabel = user.studentId ? label("Учень", "Student") : label("Викладач", "Teacher");
  const contextLabel = isEducational ? className || roleLabel : courseName;
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
  return <div className="min-h-full bg-bg-base px-4 py-8 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-12"><div className="mx-auto max-w-6xl">
    <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border/10 pb-7 dark:border-white/10 sm:flex-row sm:items-end"><div><div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><ShieldCheck className="h-4 w-4" />{scopeLabel}</div><h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{profileTitle}</h1><p className="mt-3 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{profileCopy}</p></div><div className="flex flex-wrap gap-2">{!isEducational && <><button type="button" onClick={() => window.location.assign("/iad")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 bg-white px-4 py-3 text-sm font-semibold text-text-secondary transition hover:-translate-y-0.5 hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.05] dark:text-text-primary dark:hover:bg-white/[.08]"><Gauge className="h-4 w-4" />IAD</button><button type="button" onClick={() => window.location.assign("/profile/certificates")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 bg-white px-4 py-3 text-sm font-semibold text-text-secondary transition hover:-translate-y-0.5 hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.05] dark:text-text-primary dark:hover:bg-white/[.08]"><Award className="h-4 w-4" />{label("Сертифікати", "Certificates")}</button></>}{canEditProfile && <button type="button" onClick={onSave} disabled={saving} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--ui-card-shadow)] transition hover:-translate-y-0.5 hover:bg-primary disabled:opacity-60">{saving ? label("Зберігаємо…", "Saving…") : label("Зберегти зміни", "Save changes")}</button>}</div></div>
    <div className="grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
      <aside className="overflow-hidden rounded-[26px] bg-bg-base p-6 text-text-primary shadow-[0_24px_55px_-35px_rgba(4,21,10,.85)] sm:p-7"><div className="flex items-start justify-between"><div className="relative"><div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-bg-hover text-3xl font-bold text-primary-strong">{avatarUrl ? <img src={avatarUrl} alt="" width={80} height={80} loading="lazy" className="h-full w-full object-cover" /> : initials(user.username)}</div>{canEditProfile && <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} /><Camera className="h-4 w-4" /></label>}</div><div className="rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-text-secondary">ID {user.id > 0 ? user.id : "preview"}</div></div><h2 className="mt-7 text-2xl font-semibold tracking-[-.04em]">{user.firstName || user.username}</h2><p className="mt-1 text-sm text-text-secondary">{isEducational ? [roleLabel, className].filter(Boolean).join(" · ") : `${courseName} · ${label("особистий маршрут", "personal path")}`}</p><div className="mt-7 border-t border-white/10 pt-6"><div className="flex items-end justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.14em] text-text-secondary">{isEducational ? label("Навчальний контекст", "Learning context") : label("Поточний рівень", "Current level")}</div><div className="mt-2 text-3xl font-semibold tracking-[-.06em] text-primary-soft">{isEducational ? (className || roleLabel) : currentIad}</div></div><div className="rounded-xl bg-primary/12 p-2.5 text-primary-soft">{isEducational ? <GraduationCap className="h-5 w-5" /> : <Gauge className="h-5 w-5" />}</div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: isEducational ? "100%" : `${Math.min(100, currentIad)}%` }} /></div></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{stats.librarySolved}</div><div className="mt-1 text-xs leading-5 text-text-secondary">{label("задач розв’язано", "problems solved")}</div></div><div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{stats.avgGrade?.toFixed(0) ?? "—"}</div><div className="mt-1 text-xs leading-5 text-text-secondary">{label("середній результат", "average result")}</div></div></div></aside>
      <div className="space-y-6"><section className="rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><TrendingUp className="h-4 w-4" />{label("Поточний прогрес", "Current progress")}</div><h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">{label("Твоя динаміка", "Your momentum")}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-text-muted dark:text-text-secondary">{label("Короткий підсумок практики, щоб бачити свій темп без зайвих налаштувань.", "A compact practice summary to help you see your pace without extra settings.")}</p></div><TrendingUp className="h-5 w-5 text-primary-strong dark:text-primary-soft" /></div><div className="mt-6 grid grid-cols-3 gap-2"><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold tracking-[-.04em]">{stats.totalGrades}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("перевірок", "checks")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold tracking-[-.04em]">{stats.avgGrade?.toFixed(0) ?? "—"}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("середній результат", "average result")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold tracking-[-.04em]">{weeklyActiveDays}/7</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("активних днів", "active days")}</div></div></div><div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-bg-hover px-4 py-3 dark:bg-primary/[.07]"><span className="text-sm font-semibold text-primary-strong dark:text-primary-soft">{label("Поточний фокус", "Current focus")}</span><span className="rounded-lg bg-white/70 px-2.5 py-1 text-xs font-bold text-text-secondary dark:bg-white/[.08] dark:text-text-primary">{contextLabel}</span></div>{message && <p className="mt-4 text-sm font-medium text-primary-strong dark:text-primary-soft">{message}</p>}</section>
        <section className="grid gap-4 sm:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-[26px] border border-border/10 bg-bg-surface p-6 dark:border-white/10 dark:bg-bg-code">
            <div className="flex items-center justify-between"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{label("Регулярність", "Consistency")}</div><h2 className="mt-2 text-xl font-semibold tracking-tight">{label("Практика цього тижня", "Practice this week")}</h2></div><Target className="h-5 w-5 text-primary-strong dark:text-primary-soft" /></div>
            <div className="mt-5 flex items-end justify-between gap-4"><div><span className="text-4xl font-semibold tracking-[-.06em]">{weeklyActiveDays}</span><span className="ml-1 text-sm text-text-muted dark:text-text-secondary">/ 7 {label("днів", "days")}</span></div><span className="rounded-lg bg-bg-hover px-2.5 py-1 text-xs font-semibold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{label("цього тижня", "this week")}</span></div>
            <div className="mt-5 grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }, (_, index) => <span key={index} className={`h-2 rounded-full ${index < weeklyActiveDays ? "bg-primary" : "bg-bg-hover dark:bg-white/10"}`} />)}</div>
            <p className="mt-4 text-sm leading-6 text-text-muted dark:text-text-secondary">{label("Це кількість днів за останні 7, коли ти здав або перевірив хоча б одну роботу.", "This is how many days in the last 7 you submitted or checked at least one task.")}</p>
          </div>
          <button type="button" onClick={() => setBadgesOpen(true)} className="group rounded-[26px] border border-accent-warn/25 bg-bg-hover p-6 text-left transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-27px_rgba(204,115,0,.46)] dark:bg-accent-warn/[.07]">
            <div className="flex items-center justify-between"><div className="text-xs font-semibold uppercase tracking-[.15em] text-accent-warn">{label("Досягнення", "Achievements")}</div><Trophy className="h-5 w-5 text-accent-warn transition-transform group-hover:scale-110" /></div><div className="mt-3 flex items-end gap-3"><div className="text-4xl font-semibold tracking-[-.06em] text-text-primary dark:text-text-primary">{unlockedBadges}</div><div className="pb-1 text-xs font-bold uppercase tracking-[.12em] text-accent-warn dark:text-accent-warn">{label("бейджів", "badges")}</div></div><div className="mt-3 flex items-center justify-between rounded-xl bg-bg-hover px-3 py-2 text-xs font-semibold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn"><span>{label("Очки доказів", "Proof points")}</span><span>{badgePoints}</span></div><p className="mt-3 text-sm leading-6 text-accent-warn dark:text-accent-warn">{label("Це прогрес за якість навчання, а не просто за кількість кліків.", "This progress rewards learning quality, not just clicks.")}</p><span className="mt-5 inline-flex text-sm font-semibold text-accent-warn dark:text-accent-warn">{label("Переглянути емблеми", "View emblems")} <ArrowRight className="ml-1 h-4 w-4" /></span>
          </button>
        </section>
        {skillEvidence ? <section className="mt-6 rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">skill evidence</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Що ти вже вмієш", "What you can do")}</h2><p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{label("Це докази практики з твоїх реальних спроб і розв’язаних задач.", "Evidence from your real attempts and solved tasks.")}</p></div><Sparkles className="h-5 w-5 text-accent-warn" /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.topics.length}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{label("тем практикував", "topics practiced")}</div></div><div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.solvedTasks}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{label("задач вирішено", "tasks solved")}</div></div><div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{skillEvidence.revisitedSolved}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{label("задач подолано після повторної спроби", "tasks solved after revisiting")}</div></div></div>{skillEvidence.topics.length ? <div className="mt-6 space-y-4">{skillEvidence.topics.map((topic) => { const progress = topic.practiced ? Math.round((topic.solved / topic.practiced) * 100) : 0; return <div key={topic.name}><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{topic.name}</span><span className="text-xs text-text-muted dark:text-text-secondary">{topic.solved}/{topic.practiced}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} /></div></div>; })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border/15 p-4 text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{label("Перші теми з’являться після перевірки задачі.", "Your first topics will appear after you check a task.")}</div>}</section> : null}
      </div>
    </div>
    {badgesOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-bg-code/55 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" aria-label={label("Колекція емблем", "Emblem collection")}><div className="max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-border/10 bg-bg-surface p-5 shadow-2xl dark:border-white/10 dark:bg-bg-surface sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-sm font-semibold text-accent-warn">{label("Досягнення", "Achievements")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Твоя колекція емблем", "Your emblem collection")}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted dark:text-text-secondary">{label("Кожен бейдж має власні рівні. Нагорода з’являється тоді, коли ти доводиш навичку практикою.", "Every badge has its own levels. A reward appears when you prove the skill through practice.")}</p></div><div className="flex items-center gap-2"><div className="rounded-xl bg-bg-hover px-3 py-2 text-xs font-bold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn">{badgePoints} {label("очків", "points")}</div><button type="button" onClick={() => setBadgesOpen(false)} className="rounded-xl bg-bg-hover px-3 py-2 text-sm font-semibold text-text-secondary hover:bg-bg-hover dark:bg-white/[.08] dark:text-text-secondary">{label("Закрити", "Close")}</button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{PERSONAL_BADGES.map((badge) => { const value = getBadgeMetricValue(badge, badgeStats); const currentLevel = getBadgeLevel(badge, badgeStats); const nextLevel = getNextBadgeLevel(badge, badgeStats); const progress = getBadgeProgressPercent(badge, badgeStats); const unlocked = isPersonalBadgeUnlocked(badge, badgeStats); const displayLevel = currentLevel ?? badge.levels[0]; const Icon = badge.Icon; const emblemTone = displayLevel.rank >= 4 ? "bg-gradient-to-br from-[#b9a7ff] to-[#6d5bd0] text-white ring-[#a995ff]/60" : displayLevel.rank === 3 ? "bg-gradient-to-br from-[#ffe18a] to-[#e5a51c] text-[#5b3b00] ring-[#ffd76a]/70" : displayLevel.rank === 2 ? "bg-gradient-to-br from-[#e8eef3] to-[#9ba9b8] text-[#26313b] ring-border/70" : "bg-gradient-to-br from-[#e3a36a] to-[#9b5522] text-[#351b0a] ring-[#e5a36a]/60"; return <div key={badge.id} className={`rounded-2xl border p-4 transition ${unlocked ? "border-primary/35 bg-bg-hover dark:bg-primary/[.07]" : "border-border/10 bg-white/55 dark:border-white/10 dark:bg-white/[.025]"}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-sm ring-2 ${emblemTone}`}><Icon className="h-5 w-5" /><span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-border bg-bg-base text-[9px] font-bold text-text-primary dark:border-border">{displayLevel.rank}</span></span><div><div className="font-semibold">{label(badge.nameUk, badge.nameEn)}</div><div className="mt-0.5 text-xs font-bold text-primary-strong dark:text-primary-soft">{unlocked ? label(`Рівень ${displayLevel.rank} · ${displayLevel.nameUk}`, `Level ${displayLevel.rank} · ${displayLevel.nameEn}`) : label("Ще не відкрито", "Not unlocked yet")}</div></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${unlocked ? "bg-primary/15 text-primary-strong dark:text-primary-soft" : "bg-black/[.05] text-text-muted dark:bg-white/[.06]"}`}>{unlocked ? `+${displayLevel.points} ${label("очків", "pts")}` : label("У процесі", "In progress")}</span></div><p className="mt-4 text-xs font-semibold text-text-secondary dark:text-text-primary">{label(badge.detailUk, badge.detailEn)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className={`h-full rounded-full ${unlocked ? "bg-primary" : "bg-bg-surface"}`} style={{ width: `${progress}%` }} /></div><div className="mt-2 flex items-center justify-between text-[11px] text-text-muted dark:text-text-secondary"><span>{value}/{nextLevel?.threshold ?? displayLevel.threshold}</span><span>{nextLevel ? label(`до ${nextLevel.nameUk}`, `to ${nextLevel.nameEn}`) : label("максимальний рівень", "max level")}</span></div><div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs leading-5 text-text-muted dark:bg-white/[.05] dark:text-text-secondary"><span className="font-semibold text-primary-strong dark:text-primary-soft">{label("Нагорода: ", "Reward: ")}</span>{label((currentLevel ?? badge.levels[0]).rewardUk, (currentLevel ?? badge.levels[0]).rewardEn)}</div><div className="mt-2 text-[11px] text-text-muted dark:text-text-secondary"><span className="font-semibold">{label("Що це доводить: ", "What it proves: ")}</span>{label(badge.valueUk, badge.valueEn)}</div></div>; })}</div></div></div>}
  </div></div>;
};

export type EduProfileClassSummary = {
  id: number;
  name: string;
  studentsCount: number;
};

export type EduProfileReviewSummary = {
  gradeId: number;
  classId?: number | null;
  className?: string | null;
  studentName: string;
  taskTitle: string;
};

export const EduProfileV2: React.FC<{
  user: User;
  avatarUrl: string;
  className?: string | null;
  organizationName?: string | null;
  classes: EduProfileClassSummary[];
  pendingReviews: EduProfileReviewSummary[];
  skillEvidence?: SkillEvidence;
  canEditProfile: boolean;
  saving: boolean;
  message: string | null;
  email?: string | null;
  emailPrefEnabled: boolean;
  emailPrefLoading: boolean;
  googleLinked: boolean;
  linkingGoogle: boolean;
  onAvatar: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onNavigate: (path: string) => void;
  onToggleEmail: () => void;
  onLinkGoogle: () => void;
}> = ({
  user,
  avatarUrl,
  className,
  organizationName,
  classes,
  pendingReviews,
  skillEvidence,
  canEditProfile,
  saving,
  message,
  email,
  emailPrefEnabled,
  emailPrefLoading,
  googleLinked,
  linkingGoogle,
  onAvatar,
  onSave,
  onNavigate,
  onToggleEmail,
  onLinkGoogle,
}) => {
  const { i18n } = useTranslation();
  const uk = !i18n.language?.toLowerCase().startsWith("en");
  const label = (ukText: string, enText: string) => uk ? ukText : enText;
  const isStudent = Boolean(user.studentId);
  const isClassSession = user.accountSettingsScope === "CLASS";
  const isOrgAdmin = user.eduContexts?.organizations?.some(org => org.role === "ORG_ADMIN");
  const roleLabel = isStudent ? label("Учень", "Student") : isOrgAdmin ? label("Адміністратор", "Administrator") : label("Викладач", "Teacher");
  const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
  const totalStudents = classes.reduce((sum, item) => sum + Math.max(0, item.studentsCount || 0), 0);
  const practicedTopics = skillEvidence?.topics.length ?? 0;
  const solvedTasks = skillEvidence?.solvedTasks ?? 0;
  const revisitedSolved = skillEvidence?.revisitedSolved ?? 0;
  const placeLabel = isStudent
    ? className || label("Клас не призначено", "No class assigned")
    : organizationName || label("Заклад не вказано", "No institution listed");

  return (
    <div className="min-h-full bg-bg-base px-4 py-8 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 border-b border-border/10 pb-7 dark:border-white/10 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><GraduationCap className="h-4 w-4" />{label("EDU акаунт", "EDU account")}</div>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-.055em] sm:text-5xl">{label("Профіль EDU", "EDU profile")}</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-text-muted dark:text-text-secondary">{isStudent ? label("Твій клас, навчальний прогрес і корисні переходи — в одному місці.", "Your class, learning progress, and useful shortcuts in one place.") : label("Класи, перевірки та робочі переходи — в одному місці.", "Classes, reviews, and daily work shortcuts in one place.")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onNavigate(isStudent ? "/edu/lessons" : "/edu")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 bg-white px-4 py-3 text-sm font-semibold text-text-secondary transition hover:-translate-y-0.5 hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.05] dark:text-text-primary dark:hover:bg-white/[.08]"><BookOpen className="h-4 w-4" />{isStudent ? label("Мої уроки", "My lessons") : label("Мої класи", "My classes")}</button>
            <button type="button" onClick={() => onNavigate(isStudent ? "/edu/journal" : "/edu/calendar")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border/10 bg-white px-4 py-3 text-sm font-semibold text-text-secondary transition hover:-translate-y-0.5 hover:bg-bg-hover dark:border-white/10 dark:bg-white/[.05] dark:text-text-primary dark:hover:bg-white/[.08]"><CalendarDays className="h-4 w-4" />{isStudent ? label("Мій журнал", "My journal") : label("Календар", "Calendar")}</button>
            {canEditProfile && <button type="button" onClick={onSave} disabled={saving} className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-[var(--ui-card-shadow)] transition hover:-translate-y-0.5 hover:bg-primary disabled:opacity-60">{saving ? label("Зберігаємо…", "Saving…") : label("Зберегти зміни", "Save changes")}</button>}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[.82fr_1.18fr]">
          <aside className="overflow-hidden rounded-[26px] bg-bg-base p-6 text-text-primary shadow-[0_24px_55px_-35px_rgba(4,21,10,.85)] sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-bg-hover text-3xl font-bold text-primary-strong">{avatarUrl ? <img src={avatarUrl} alt="" width={80} height={80} loading="lazy" className="h-full w-full object-cover" /> : initials(user.username)}</div>
                {canEditProfile && <label className="absolute -bottom-2 -right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg"><input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={onAvatar} /><Camera className="h-4 w-4" /></label>}
              </div>
              <div className="rounded-xl bg-white/8 px-3 py-2 text-xs font-semibold text-text-secondary">ID {user.id > 0 ? user.id : "preview"}</div>
            </div>
            <h2 className="mt-7 text-2xl font-semibold tracking-[-.04em]">{displayName}</h2>
            <p className="mt-1 text-sm text-text-secondary">{roleLabel} · {placeLabel}</p>
            <div className="mt-7 border-t border-white/10 pt-6">
              <div className="text-xs font-semibold uppercase tracking-[.14em] text-text-secondary">{isStudent ? label("Мій клас", "My class") : label("Мій заклад", "My institution")}</div>
              <div className="mt-2 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/12 text-primary-soft"><GraduationCap className="h-5 w-5" /></div><div className="min-w-0 text-xl font-semibold tracking-[-.04em]">{placeLabel}</div></div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full rounded-full bg-primary" /></div>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{isStudent ? practicedTopics : classes.length}</div><div className="mt-1 text-xs leading-5 text-text-secondary">{isStudent ? label("тем практикую", "topics practiced") : label("активних класів", "active classes")}</div></div>
              <div className="rounded-2xl bg-white/[.07] p-4"><div className="text-2xl font-semibold">{isStudent ? solvedTasks : totalStudents}</div><div className="mt-1 text-xs leading-5 text-text-secondary">{isStudent ? label("задач вирішено", "tasks solved") : label("учнів у класах", "students in classes")}</div></div>
            </div>
          </aside>

          <div className="space-y-6">
            <section className="rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7">
              <div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-semibold text-primary-strong dark:text-primary-soft"><Layers3 className="h-4 w-4" />{label("Робочий контекст", "Working context")}</div><h2 className="mt-3 text-2xl font-semibold tracking-[-.04em]">{isStudent ? label("Мій навчальний ритм", "My learning rhythm") : label("Мій EDU-простір", "My EDU workspace")}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-text-muted dark:text-text-secondary">{isStudent ? label("Тут видно головні результати навчання, без зайвих Personal-показників.", "The key learning signals, without unrelated Personal metrics.") : label("Основні показники викладача та швидкий доступ до щоденної роботи.", "The main teacher signals and shortcuts for daily work.")}</p></div><ShieldCheck className="h-5 w-5 text-primary-strong dark:text-primary-soft" /></div>
              {isStudent ? <div className="mt-6 grid grid-cols-3 gap-2"><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{practicedTopics}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("тем практиковано", "topics practiced")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{solvedTasks}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("задач вирішено", "tasks solved")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{revisitedSolved}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("повторних перемог", "revisited wins")}</div></div></div> : <div className="mt-6 grid grid-cols-3 gap-2"><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{classes.length}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("класи", "classes")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{totalStudents}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("учнів", "students")}</div></div><div className="rounded-xl bg-bg-hover px-3 py-4 dark:bg-white/[.04]"><div className="text-2xl font-semibold">{pendingReviews.length}</div><div className="mt-1 text-xs leading-5 text-text-muted dark:text-text-secondary">{label("на перевірку", "to review")}</div></div></div>}
              {message && <p className="mt-4 text-sm font-medium text-primary-strong dark:text-primary-soft">{message}</p>}
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
              {(isStudent ? [{ title: label("Уроки", "Lessons"), text: label("Відкрити поточні матеріали", "Open current materials"), path: "/edu/lessons", Icon: BookOpen }, { title: label("Журнал", "Journal"), text: label("Переглянути оцінки", "View grades"), path: "/edu/journal", Icon: GraduationCap }, { title: label("AI-тьютор", "AI tutor"), text: label("Поставити запитання", "Ask a question"), path: "/edu/tutor", Icon: Sparkles }] : [{ title: label("Класи", "Classes"), text: label("Відкрити робочий простір", "Open workspace"), path: "/edu", Icon: GraduationCap }, { title: label("Календар", "Calendar"), text: label("Побачити дедлайни", "See deadlines"), path: "/edu/calendar", Icon: CalendarDays }, { title: label("Бібліотека", "Library"), text: label("Знайти матеріали", "Find materials"), path: "/edu/library", Icon: BookOpen }]).map(({ title, text, path, Icon }) => <button type="button" key={path} onClick={() => onNavigate(path)} className="group rounded-2xl border border-border/10 bg-bg-surface p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40 dark:border-white/10 dark:bg-bg-code"><span className="grid h-10 w-10 place-items-center rounded-xl bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft"><Icon className="h-5 w-5" /></span><h3 className="mt-4 text-lg font-semibold tracking-[-.03em]">{title}</h3><p className="mt-1 text-sm leading-6 text-text-muted dark:text-text-secondary">{text}</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary-strong dark:text-primary-soft">{label("Відкрити", "Open")} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" /></span></button>)}
            </section>
          </div>
        </div>

        {isStudent ? <section className="mt-6 rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7"><div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{label("Прогрес за темами", "Topic progress")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Що вже опрацьовано", "What you have covered")}</h2></div><TrendingUp className="h-5 w-5 text-primary-strong dark:text-primary-soft" /></div>{skillEvidence?.topics.length ? <div className="mt-6 grid gap-3 md:grid-cols-2">{skillEvidence.topics.slice(0, 8).map((topic) => { const progress = topic.practiced ? Math.round((topic.solved / topic.practiced) * 100) : 0; return <div key={topic.name} className="rounded-2xl border border-border/8 bg-bg-surface p-4 dark:border-white/8 dark:bg-white/[.025]"><div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{topic.name}</span><span className="text-xs text-text-muted dark:text-text-secondary">{topic.solved}/{topic.practiced}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress)}%` }} /></div></div>; })}</div> : <div className="mt-5 rounded-2xl border border-dashed border-border/15 p-5 text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{label("Прогрес зʼявиться після перших перевірених робіт.", "Progress will appear after your first checked submissions.")}</div>}</section> : <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-primary-strong dark:text-primary-soft">{label("Мої класи", "My classes")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{label("Навчальні потоки", "Teaching groups")}</h2></div><GraduationCap className="h-5 w-5 text-primary-strong dark:text-primary-soft" /></div><div className="mt-5 space-y-3">{classes.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => onNavigate(`/edu/classes/${item.id}`)} className="group flex w-full items-center justify-between gap-3 rounded-2xl bg-bg-surface p-4 text-left transition hover:bg-bg-hover dark:bg-white/[.035] dark:hover:bg-white/[.07]"><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="mt-1 block text-xs text-text-muted dark:text-text-secondary">{item.studentsCount} {label("учнів", "students")}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-text-secondary transition group-hover:translate-x-1" /></button>)}{classes.length === 0 && <div className="rounded-2xl border border-dashed border-border/15 p-5 text-sm text-text-muted dark:border-white/10 dark:text-text-secondary">{label("Класів ще немає. Створіть перший клас, щоб почати роботу.", "No classes yet. Create your first class to get started.")}</div>}</div></section><section className="rounded-[26px] border border-accent-warn/25 bg-bg-hover p-6 dark:border-accent-warn/20 dark:bg-accent-warn/[.07] sm:p-7"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-accent-warn">{label("Черга фідбеку", "Feedback queue")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{pendingReviews.length ? label("Роботи чекають", "Submissions waiting") : label("Черга порожня", "Queue is empty")}</h2></div><Clock3 className="h-5 w-5 text-accent-warn" /></div><div className="mt-5 space-y-3">{pendingReviews.slice(0, 5).map((review) => <button type="button" key={review.gradeId} disabled={!review.classId} onClick={() => review.classId && onNavigate(`/edu/classes/${review.classId}/gradebook?review=${review.gradeId}`)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/70 p-3 text-left transition enabled:hover:bg-white disabled:cursor-default disabled:opacity-70 dark:bg-white/[.06]"><span className="min-w-0"><strong className="block truncate text-sm">{review.taskTitle}</strong><span className="mt-1 block truncate text-xs text-accent-warn dark:text-accent-warn">{review.studentName}{review.className ? ` · ${review.className}` : ""}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-accent-warn" /></button>)}{pendingReviews.length === 0 && <p className="rounded-xl bg-white/70 p-4 text-sm leading-6 text-accent-warn dark:bg-white/[.06] dark:text-accent-warn">{label("Усі роботи переглянуті. Можна готувати наступне заняття.", "Everything is reviewed. You can prepare the next lesson.")}</p>}</div></section></div>}

        <section className="mt-6 rounded-[26px] border border-border/10 bg-white p-6 dark:border-white/10 dark:bg-bg-surface sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-semibold uppercase tracking-[.15em] text-accent-warn">{label("Акаунт", "Account")}</div><h2 className="mt-2 text-2xl font-semibold tracking-[-.04em]">{isClassSession ? label("Налаштування класу", "Class settings") : label("Налаштування акаунта", "Account settings")}</h2><p className="mt-2 text-sm leading-6 text-text-muted dark:text-text-secondary">{isClassSession ? label("Учнівський вхід керує цим класом. Для параметрів особистого акаунта використайте звичайний вхід.", "Class sign-in manages this class. Use your account sign-in for personal account settings.") : label("Пошта, сповіщення та Google для твого акаунта.", "Email, notifications, and Google for your account.")}</p></div><ShieldCheck className="h-5 w-5 text-accent-warn" /></div>
          <div className="mt-6 grid gap-3 lg:grid-cols-2"><div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="text-sm font-semibold">{isClassSession ? label("Листи класу", "Class emails") : label("Листи акаунта", "Account emails")}</div><div className="mt-1 truncate text-xs text-text-muted dark:text-text-secondary">{email || label("Email не вказано", "Email is not available")}</div></div>{email && <button type="button" onClick={onToggleEmail} disabled={emailPrefLoading} aria-pressed={emailPrefEnabled} aria-label={isClassSession ? label("Змінити налаштування листів класу", "Toggle class emails") : label("Змінити налаштування листів акаунта", "Toggle account emails")} className={`min-h-[44px] min-w-[44px] rounded-xl px-3 py-2 text-xs font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${emailPrefEnabled ? "bg-bg-hover text-primary-strong dark:bg-primary/10 dark:text-primary-soft" : "bg-bg-hover text-text-muted dark:bg-white/[.08] dark:text-text-secondary"}`}>{emailPrefLoading ? label("Оновлюємо…", "Updating…") : emailPrefEnabled ? label("Увімкнено", "On") : label("Вимкнено", "Off")}</button>}</div></div><div className="rounded-2xl bg-bg-hover p-4 dark:bg-white/[.04]"><div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{isClassSession ? label("Вхід у клас", "Class sign-in") : "Google"}</div><div className="mt-1 text-xs text-text-muted dark:text-text-secondary">{isClassSession ? label("Google підключається у звичайному вході в акаунт.", "Manage Google linking through your account sign-in.") : googleLinked ? label("Акаунт підʼєднано", "Account connected") : label("Можна підʼєднати для швидкого входу", "Connect for faster sign in")}</div></div>{isClassSession ? <span className="shrink-0 text-xs text-text-muted dark:text-text-secondary">{label("Учнівський вхід", "Class session")}</span> : googleLinked ? <span className="rounded-xl bg-bg-hover px-3 py-2 text-xs font-semibold text-primary-strong dark:bg-primary/10 dark:text-primary-soft">{label("Підʼєднано", "Connected")}</span> : <button type="button" onClick={onLinkGoogle} disabled={linkingGoogle} className="rounded-xl bg-bg-base px-3 py-2 text-xs font-semibold text-text-primary transition hover:bg-bg-surface disabled:opacity-50 dark:bg-bg-hover dark:text-text-primary">{linkingGoogle ? label("Підключення…", "Connecting…") : label("Підʼєднати", "Connect")}</button>}</div></div></div>
        </section>
      </div>
    </div>
  );
};

export const PremiumLibrary: React.FC<{
  tasks: LibraryTaskListItem[];
  total: number | null;
  solved: number;
  loading: boolean;
  query: string;
  onQuery: (value: string) => void;
  onOpen: (task: LibraryTaskListItem) => void;
  getTaskHref?: (task: LibraryTaskListItem) => string;
}> = ({ tasks, total, solved, loading, query, onQuery, onOpen, getTaskHref }) => {
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
  const tone = (value: LibraryTaskListItem["difficulty"]) => value === "HARD" ? "bg-bg-hover text-accent-error dark:bg-accent-error/10 dark:text-accent-error" : value === "MEDIUM" ? "bg-bg-hover text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn" : "bg-primary/10 text-primary-strong dark:bg-primary/10 dark:text-primary-soft";
  const filteredTasks = tasks.filter((task) =>
    (difficultyFilter === "ALL" || task.difficulty === difficultyFilter) &&
    (modeFilter === "ALL" || (task.taskMode || "CODE") === modeFilter)
  );
  const clearSearch = () => {
    onQuery("");
    setDifficultyFilter("ALL");
    setModeFilter("ALL");
  };
  return <div className="min-h-full bg-bg-base px-4 py-6 text-text-primary dark:bg-bg-base dark:text-text-primary sm:px-6 lg:px-10 lg:py-9"><div className="mx-auto max-w-7xl space-y-6 lg:space-y-8">
    <section className="relative overflow-hidden rounded-[28px] border border-border/10 bg-bg-hover p-6 dark:border-white/10 dark:bg-bg-surface sm:p-8"><div className="absolute -right-16 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_center,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_62%)]" /><div className="relative max-w-3xl"><div className="text-sm font-semibold text-primary-strong dark:text-primary-soft">{copy.eyebrow}</div><h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-.05em] sm:text-4xl lg:text-5xl">{copy.title}</h1><p className="mt-4 max-w-2xl text-base leading-7 text-text-muted dark:text-text-secondary sm:text-lg">{copy.subtitle}</p><div className="mt-7 flex flex-wrap gap-7"><div><div className="text-3xl font-semibold tracking-[-.05em]">{total ?? tasks.length}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{copy.available}</div></div><div><div className="text-3xl font-semibold tracking-[-.05em] text-primary-strong dark:text-primary-soft">{solved}</div><div className="mt-1 text-sm text-text-muted dark:text-text-secondary">{copy.solved}</div></div></div></div></section>
    <section className="rounded-[26px] border border-border/10 bg-white p-5 dark:border-white/10 dark:bg-bg-surface sm:p-6"><div className="relative"><svg className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input autoComplete="off" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={copy.search} className="h-14 w-full rounded-2xl border border-border/10 bg-bg-surface pl-12 pr-24 text-base font-medium outline-none transition placeholder:font-normal placeholder:text-text-secondary focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-white/10 dark:bg-white/[.035]" />{query && <button type="button" onClick={() => onQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-bg-hover dark:text-text-secondary dark:hover:bg-white/[.06]">{en ? "Clear" : "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u0438"}</button>}</div><p className="mt-2 text-xs text-text-muted dark:text-text-secondary">{en ? "Search titles, descriptions, topics and tags." : "\u041f\u043e\u0448\u0443\u043a \u043f\u0440\u0430\u0446\u044e\u0454 \u0437\u0430 \u043d\u0430\u0437\u0432\u0430\u043c\u0438, \u043e\u043f\u0438\u0441\u0430\u043c\u0438, \u0442\u0435\u043c\u0430\u043c\u0438 \u0439 \u0442\u0435\u0433\u0430\u043c\u0438."}</p><div className="mt-5 flex flex-col gap-4 border-t border-border/8 pt-5 dark:border-white/[.08] lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold text-text-muted">{en ? "Level" : "\u0420\u0456\u0432\u0435\u043d\u044c"}</span>{([['ALL', en ? 'All' : '\u0423\u0441\u0456'], ['EASY', copy.easy], ['MEDIUM', copy.medium], ['HARD', copy.hard]] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setDifficultyFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${difficultyFilter === value ? "bg-bg-base text-text-primary dark:bg-bg-hover dark:text-text-primary" : "bg-bg-hover text-text-muted dark:bg-white/[.05] dark:text-text-secondary"}`}>{label}</button>)}<span className="mx-1 hidden h-5 w-px bg-bg-hover dark:bg-white/10 sm:block" />{([['ALL', en ? 'Any format' : '\u0423\u0441\u0456 \u0444\u043e\u0440\u043c\u0430\u0442\u0438'], ['CODE', copy.code], ['WEB', copy.web]] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setModeFilter(value)} className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${modeFilter === value ? "bg-bg-hover text-primary-strong ring-1 ring-primary/25 dark:bg-primary/10 dark:text-primary-soft" : "text-text-muted dark:text-text-secondary"}`}>{label}</button>)}</div><div className="flex items-center gap-3 text-sm text-text-muted dark:text-text-secondary"><b className="text-text-primary dark:text-white">{filteredTasks.length}</b> {en ? "results" : "\u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442\u0456\u0432"}{(query || difficultyFilter !== "ALL" || modeFilter !== "ALL") && <button type="button" onClick={clearSearch} className="text-xs font-semibold text-primary-strong dark:text-primary-soft">{en ? "Reset" : "\u0421\u043a\u0438\u043d\u0443\u0442\u0438"}</button>}</div></div></section>
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label={en ? "Loading task library" : "Завантаження бібліотеки задач"}>{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-64 animate-pulse rounded-[24px] bg-bg-hover dark:bg-white/[.045]" />)}</div> : filteredTasks.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredTasks.map((task) => <article key={task.id} className="group flex min-h-[250px] flex-col rounded-[24px] border border-border/10 bg-white p-5 shadow-[0_16px_38px_-34px_rgba(17,43,25,.45)] transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_45px_-30px_rgba(17,58,31,.42)] dark:border-white/10 dark:bg-bg-surface dark:hover:bg-bg-base"><div className="flex items-start justify-between gap-3"><div className="flex flex-wrap gap-2"><span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tone(task.difficulty)}`}>{difficulty(task.difficulty)}</span>{task.projectSpec ? <span className="inline-flex items-center gap-1 rounded-lg bg-bg-hover px-2.5 py-1 text-xs font-semibold text-accent-warn dark:bg-accent-warn/10 dark:text-accent-warn"><Rocket className="h-3 w-3" aria-hidden="true" />{copy.project}</span> : null}</div><span className="text-xs font-medium text-text-muted dark:text-text-secondary">{task.taskMode === "WEB" ? copy.web : copy.code}</span></div><h2 className="mt-5 text-lg font-semibold tracking-tight">{task.title}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-text-muted dark:text-text-secondary">{task.description || task.section || "Practice the concept in your own solution."}</p>{task.attempt?.lastCheckedAt ? <p className="mt-2 text-[11px] font-medium text-primary-strong dark:text-primary-soft">{en ? "Checked" : "Перевірено"}: {new Intl.DateTimeFormat(i18n.language || "uk", { dateStyle: "short", timeStyle: "short" }).format(new Date(task.attempt.lastCheckedAt))}</p> : null}<div className="mt-auto flex items-center justify-between gap-3 pt-5"><div className="flex flex-wrap gap-1.5">{(task.tags || []).slice(0, 2).map((tag) => <span key={tag} className="rounded-md bg-bg-hover px-2 py-1 text-[11px] font-medium text-text-muted dark:bg-white/[.06] dark:text-text-secondary">{tag}</span>)}</div><div className="flex items-center gap-2">{getTaskHref ? <a href={getTaskHref(task)} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-text-muted transition hover:bg-bg-hover hover:text-primary-strong dark:hover:bg-white/[.06] dark:hover:text-primary-soft" aria-label={en ? "Open task in a new tab" : "Відкрити задачу в новій вкладці"} title={en ? "Open in a new tab" : "Відкрити в новій вкладці"}><ExternalLink className="h-4 w-4" /></a> : null}<button type="button" onClick={() => onOpen(task)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition group-hover:text-primary-strong dark:text-primary-soft">{copy.open}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></div></div></article>)}</div> : <div className="rounded-[26px] border border-dashed border-border/15 bg-white px-5 py-16 text-center text-sm text-text-muted dark:border-white/10 dark:bg-bg-surface dark:text-text-secondary" role="status"><p>{copy.empty}</p>{(query || difficultyFilter !== "ALL" || modeFilter !== "ALL") && <button type="button" onClick={clearSearch} className="mt-4 rounded-xl bg-bg-base px-4 py-2.5 text-xs font-bold text-text-primary dark:bg-primary dark:text-primary-foreground">{en ? "Reset filters" : "Скинути фільтри"}</button>}</div>}
  </div></div>;
};
