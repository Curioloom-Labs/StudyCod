import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LockKeyhole, Sparkles, Trophy, X } from "lucide-react";
import {
  countUnlockedPersonalBadges,
  getBadgeLevel,
  getBadgeMetricValue,
  getBadgeProgressPercent,
  getNextBadgeLevel,
  getTotalBadgePoints,
  PERSONAL_BADGES,
  type PersonalBadge,
  type PersonalBadgeStats,
} from "../../lib/personalBadges";

type BadgeFilter = "all" | "earned" | "in-progress";

type PersonalAchievementsDialogProps = {
  open: boolean;
  badgeStats: PersonalBadgeStats;
  onClose: () => void;
  onStartPractice: () => void;
  isEnglish: boolean;
};

function copy(isEnglish: boolean, uk: string, en: string): string {
  return isEnglish ? en : uk;
}

function badgeFilterMatches(badge: PersonalBadge, stats: PersonalBadgeStats, filter: BadgeFilter): boolean {
  const earned = getBadgeLevel(badge, stats) !== null;
  if (filter === "earned") return earned;
  if (filter === "in-progress") return getNextBadgeLevel(badge, stats) !== null;
  return true;
}

export const PersonalAchievementsDialog: React.FC<PersonalAchievementsDialogProps> = ({
  open,
  badgeStats,
  onClose,
  onStartPractice,
  isEnglish,
}) => {
  const [filter, setFilter] = useState<BadgeFilter>("all");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  const earnedBadges = countUnlockedPersonalBadges(badgeStats);
  const points = getTotalBadgePoints(badgeStats);
  const inProgressCount = PERSONAL_BADGES.filter((badge) => getNextBadgeLevel(badge, badgeStats) !== null).length;
  const nextGoal = PERSONAL_BADGES
    .map((badge, index) => ({ badge, index, nextLevel: getNextBadgeLevel(badge, badgeStats), progress: getBadgeProgressPercent(badge, badgeStats) }))
    .filter((item) => item.nextLevel)
    .sort((a, b) => b.progress - a.progress || a.index - b.index)[0];
  const visibleBadges = PERSONAL_BADGES.filter((badge) => badgeFilterMatches(badge, badgeStats, filter));

  const handleStartPractice = () => {
    onClose();
    onStartPractice();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-bg-code/60 p-2 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-achievements-title"
        aria-describedby="personal-achievements-description"
        className="flex max-h-[min(900px,calc(100dvh-1rem))] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-border/15 bg-bg-base text-text-primary shadow-[0_28px_90px_-36px_rgba(0,0,0,.72)] dark:border-white/10 dark:bg-bg-surface sm:rounded-[30px]"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-border/10 bg-[#21352c] px-5 pb-5 pt-5 text-[#f1f2e9] dark:border-white/10 sm:px-8 sm:pb-6 sm:pt-7">
          <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full border border-[#c6d8aa]/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-2 -top-20 h-52 w-52 rounded-full border border-[#d2bd87]/20" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[.1em] text-[#d5c391]">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {copy(isEnglish, "ПРАКТИКА · ПІДТВЕРДЖЕНІ НАВИЧКИ", "PRACTICE · VERIFIED SKILLS")}
              </div>
              <h2 id="personal-achievements-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl">
                {copy(isEnglish, "Знання, підтверджені діями", "Knowledge, proven through practice")}
              </h2>
              <p id="personal-achievements-description" className="mt-2 max-w-2xl text-sm leading-6 text-[#d1d9cf]">
                {copy(isEnglish, "Кожна емблема підсумовує конкретну звичку навчання: розв’язання, сталість, роботу над помилками або впевненість у темах.", "Each emblem reflects a real learning habit: solving tasks, consistency, learning from errors, or confidence across topics.")}
              </p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label={copy(isEnglish, "Закрити колекцію", "Close collection")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[.07] text-white/80 transition hover:bg-white/[.14] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d9c794] active:scale-[.97]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="relative mt-5 grid gap-2 sm:grid-cols-[.72fr_.72fr_1.56fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[.055] px-4 py-3">
              <div className="font-mono text-2xl font-bold tabular-nums">{earnedBadges}<span className="ml-1 text-base font-medium text-white/50">/ {PERSONAL_BADGES.length}</span></div>
              <div className="mt-1 text-xs text-white/65">{copy(isEnglish, "емблем відкрито", "emblems earned")}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.055] px-4 py-3">
              <div className="font-mono text-2xl font-bold tabular-nums text-[#e4cd8d]">{points}</div>
              <div className="mt-1 text-xs text-white/65">{copy(isEnglish, "очок доказів", "proof points")}</div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#d4c18e]/25 bg-[#d4c18e]/[.09] px-4 py-3">
              {nextGoal ? <>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-[.12em] text-[#e1cf9d]">{copy(isEnglish, "НАЙБЛИЖЧИЙ КРОК", "NEXT MILESTONE")}</div>
                  <div className="mt-1 truncate text-sm font-semibold">{copy(isEnglish, nextGoal.badge.nameUk, nextGoal.badge.nameEn)} <span className="font-normal text-white/65">· {copy(isEnglish, `рівень ${nextGoal.nextLevel!.rank}`, `level ${nextGoal.nextLevel!.rank}`)}</span></div>
                  <div className="mt-1 truncate text-xs text-white/65">{copy(isEnglish, nextGoal.badge.detailUk, nextGoal.badge.detailEn)}</div>
                </div>
                <button type="button" onClick={handleStartPractice} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#d9c794] px-3 text-xs font-bold text-[#26372f] transition hover:bg-[#e5d7ac] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[.98]">
                  {copy(isEnglish, "До практики", "Practice")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </> : <div className="flex items-center gap-3 text-sm font-semibold text-[#e4d6ad]"><Sparkles className="h-5 w-5" aria-hidden="true" />{copy(isEnglish, "Усі рівні відкрито — сильний результат.", "Every level is unlocked. A strong body of work.")}</div>}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-8 sm:pt-5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy(isEnglish, "Фільтр емблем", "Filter emblems")}>
              {([
                ["all", copy(isEnglish, "Усі", "All"), PERSONAL_BADGES.length],
                ["earned", copy(isEnglish, "Відкриті", "Earned"), earnedBadges],
                ["in-progress", copy(isEnglish, "Наступні рівні", "Next levels"), inProgressCount],
              ] as const).map(([value, title, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === value ? "bg-[#21352c] text-white dark:bg-primary dark:text-primary-foreground" : "bg-bg-hover text-text-secondary hover:bg-bg-hover/80 dark:bg-white/[.05] dark:text-text-secondary dark:hover:bg-white/[.09]"}`}
                >
                  {title}<span className={filter === value ? "text-white/65" : "text-text-muted"}>{count}</span>
                </button>
              ))}
            </div>
            <div className="hidden text-xs text-text-muted dark:text-text-secondary sm:block">
              {copy(isEnglish, "Бали додаються за кожен відкритий рівень", "Points are earned for each unlocked level")}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-8 sm:pb-5">
            {visibleBadges.length ? <div className="grid gap-3 md:grid-cols-2">
              {visibleBadges.map((badge) => {
                const value = getBadgeMetricValue(badge, badgeStats);
                const currentLevel = getBadgeLevel(badge, badgeStats);
                const nextLevel = getNextBadgeLevel(badge, badgeStats);
                const progress = getBadgeProgressPercent(badge, badgeStats);
                const targetLevel = nextLevel ?? badge.levels[badge.levels.length - 1];
                const Icon = badge.Icon;
                const emblemTone = currentLevel?.rank === 4
                  ? "from-[#b9a7ff] to-[#6d5bd0] text-white ring-[#a995ff]/50"
                  : currentLevel?.rank === 3
                    ? "from-[#ffe18a] to-[#e5a51c] text-[#5b3b00] ring-[#ffd76a]/50"
                    : currentLevel?.rank === 2
                      ? "from-[#e8eef3] to-[#9ba9b8] text-[#26313b] ring-slate-300/70"
                      : currentLevel
                        ? "from-[#e3a36a] to-[#9b5522] text-[#351b0a] ring-[#e5a36a]/50"
                        : "from-[#e8e1d1] to-[#9c927d] text-[#4a4439] ring-[#c5b99e]/45 grayscale-[.25]";

                return (
                  <article key={badge.id} className={`rounded-[20px] border p-4 transition-colors ${currentLevel ? "border-primary/25 bg-white dark:bg-white/[.035]" : "border-border/10 bg-bg-surface/70 dark:border-white/[.08] dark:bg-white/[.018]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-sm ring-2 ${emblemTone}`}>
                          <Icon className="h-5 w-5" aria-hidden="true" />
                          {currentLevel ? <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-bg-base bg-bg-base text-[9px] font-bold text-text-primary dark:border-bg-surface dark:bg-bg-surface">{currentLevel.rank}</span> : <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full border-2 border-bg-base bg-bg-base text-text-muted dark:border-bg-surface dark:bg-bg-surface"><LockKeyhole className="h-2.5 w-2.5" aria-hidden="true" /></span>}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold tracking-[-.02em]">{copy(isEnglish, badge.nameUk, badge.nameEn)}</h3>
                          <div className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${currentLevel ? "text-primary-strong dark:text-primary-soft" : "text-text-muted dark:text-text-secondary"}`}>
                            {currentLevel ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />{copy(isEnglish, `Рівень ${currentLevel.rank} · ${currentLevel.nameUk}`, `Level ${currentLevel.rank} · ${currentLevel.nameEn}`)}</> : copy(isEnglish, "Ще не відкрито", "Not unlocked yet")}
                          </div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold tabular-nums ${currentLevel ? "bg-[#d5c391]/20 text-[#715b28] dark:bg-[#d5c391]/10 dark:text-[#d9c794]" : "bg-bg-hover text-text-muted dark:bg-white/[.05] dark:text-text-secondary"}`}>
                        {currentLevel ? `+${currentLevel.points}` : `+${targetLevel.points}`} {copy(isEnglish, "очок", "pts")}
                      </span>
                    </div>

                    <p className="mt-4 min-h-[2.5rem] text-xs font-medium leading-5 text-text-secondary dark:text-text-primary">{copy(isEnglish, badge.detailUk, badge.detailEn)}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-muted dark:text-text-secondary">
                      <span className="font-semibold tabular-nums">{Math.min(value, targetLevel.threshold)} / {targetLevel.threshold}</span>
                      <span className="truncate">{nextLevel ? copy(isEnglish, `до ${nextLevel.nameUk}`, `to ${nextLevel.nameEn}`) : copy(isEnglish, "максимальний рівень", "max level")}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/[.08]" role="progressbar" aria-label={copy(isEnglish, `Прогрес: ${badge.nameUk}`, `Progress: ${badge.nameEn}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                      <div className={`h-full rounded-full transition-[width] duration-500 ${currentLevel ? "bg-primary" : "bg-[#b5ad9b] dark:bg-white/25"}`} style={{ width: `${progress}%` }} />
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-bg-hover/80 px-3 py-2.5 dark:bg-white/[.045]">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b08b45]" aria-hidden="true" />
                      <p className="text-[11px] leading-[1.55] text-text-muted dark:text-text-secondary">
                        <span className="font-semibold text-text-primary dark:text-text-primary">{copy(isEnglish, "Навіщо це: ", "Why it matters: ")}</span>{copy(isEnglish, badge.valueUk, badge.valueEn)}
                      </p>
                    </div>
                    <p className="mt-2 text-[10px] leading-4 text-text-muted dark:text-text-secondary">
                      <span className="font-semibold">{currentLevel ? copy(isEnglish, "Відкрито: ", "Earned: ") : copy(isEnglish, "Наступна відзнака: ", "Next emblem: ")}</span>{copy(isEnglish, (currentLevel ?? targetLevel).rewardUk, (currentLevel ?? targetLevel).rewardEn)}
                    </p>
                  </article>
                );
              })}
            </div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/15 px-6 text-center dark:border-white/10">
              <div><Trophy className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{copy(isEnglish, filter === "earned" ? "Перші емблеми ще попереду" : "Усі доступні рівні відкрито", filter === "earned" ? "Your first emblems are still ahead" : "Every available level is unlocked")}</p><p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{copy(isEnglish, filter === "earned" ? "Почни з будь-якої практичної задачі — результат з’явиться тут." : "You have completed every milestone in this collection.", filter === "earned" ? "Start with any practice task. Your evidence will show up here." : "You have completed every milestone in this collection.")}</p></div>
            </div>}
          </div>

          <footer className="shrink-0 border-t border-border/10 px-5 py-3 text-[11px] leading-5 text-text-muted dark:border-white/10 dark:text-text-secondary sm:px-8">
            {copy(isEnglish, "Очки — підсумок нагород за всі відкриті рівні. Сталий ритм рахується за найкращий відрізок у 7 днів, тож здобута емблема залишається з тобою.", "Points add up the rewards for every unlocked level. Steady rhythm uses your best 7-day span, so earned emblems remain yours.")}
          </footer>
        </div>
      </div>
    </div>
  );
};
