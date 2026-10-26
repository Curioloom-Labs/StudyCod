import React, { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, LockKeyhole, Sparkles, Trophy, X } from "lucide-react";
import {
  countTotalBadgeLevels,
  countUnlockedBadgeLevels,
  countUnlockedPersonalBadges,
  getBadgeLevel,
  getBadgeMetricValue,
  getBadgeProgressPercent,
  getNextBadgeLevel,
  PERSONAL_BADGES,
  type PersonalBadge,
  type PersonalBadgeStats,
} from "../../lib/personalBadges";
import "./PersonalAchievements.css";

type BadgeFilter = "all" | "earned" | "next";

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
  if (filter === "earned") return getBadgeLevel(badge, stats) !== null;
  if (filter === "next") return getNextBadgeLevel(badge, stats) !== null;
  return true;
}

function levelLabel(isEnglish: boolean, rank: number, total: number): string {
  return isEnglish ? `Stage ${rank} of ${total}` : `Етап ${rank} з ${total}`;
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
  const earnedStages = countUnlockedBadgeLevels(badgeStats);
  const totalStages = countTotalBadgeLevels();
  const nextCount = PERSONAL_BADGES.filter((badge) => getNextBadgeLevel(badge, badgeStats) !== null).length;
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-bg-code/65 p-2 backdrop-blur-sm sm:items-center sm:p-5"
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
        <header className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[#20352c] px-5 pb-5 pt-5 text-[#f1f2e9] sm:px-8 sm:pb-6 sm:pt-7">
          <div className="pointer-events-none absolute -right-16 -top-28 h-72 w-72 rounded-full border border-[#c6d8aa]/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -right-2 -top-20 h-52 w-52 rounded-full border border-[#d2bd87]/20" aria-hidden="true" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs font-semibold tracking-[.12em] text-[#d5c391]">
                <Trophy className="h-4 w-4" aria-hidden="true" />
                {copy(isEnglish, "ШЛЯХ ПРАКТИКИ", "THE PRACTICE PATH")}
              </div>
              <h2 id="personal-achievements-title" className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-[-.045em] sm:text-3xl">
                {copy(isEnglish, "Емблеми твого поступу", "Emblems of your progress")}
              </h2>
              <p id="personal-achievements-description" className="mt-2 max-w-2xl text-sm leading-6 text-[#d1d9cf]">
                {copy(isEnglish, "Кожна емблема фіксує окремий доказ навчання: завершені задачі, сталість, роботу над помилками або впевненість у темах.", "Each emblem records a distinct kind of learning evidence: completed tasks, consistency, learning from errors, or confidence across topics.")}
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
              <div className="mt-1 text-xs text-white/65">{copy(isEnglish, "напрямів із першим етапом", "paths started")}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[.055] px-4 py-3">
              <div className="font-mono text-2xl font-bold tabular-nums text-[#e4cd8d]">{earnedStages}<span className="ml-1 text-base font-medium text-white/50">/ {totalStages}</span></div>
              <div className="mt-1 text-xs text-white/65">{copy(isEnglish, "етапів підтверджено", "stages confirmed")}</div>
            </div>
            <div className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-[#d4c18e]/25 bg-[#d4c18e]/[.09] px-4 py-3">
              {nextGoal ? <>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold tracking-[.12em] text-[#e1cf9d]">{copy(isEnglish, "НАСТУПНИЙ ЕТАП", "NEXT MILESTONE")}</div>
                  <div className="mt-1 truncate text-sm font-semibold">{copy(isEnglish, nextGoal.badge.nameUk, nextGoal.badge.nameEn)} <span className="font-normal text-white/65">· {copy(isEnglish, nextGoal.nextLevel!.nameUk, nextGoal.nextLevel!.nameEn)}</span></div>
                  <div className="mt-1 truncate text-xs text-white/65">{getBadgeMetricValue(nextGoal.badge, badgeStats)} / {nextGoal.nextLevel!.threshold} {copy(isEnglish, nextGoal.badge.progressLabelUk, nextGoal.badge.progressLabelEn)}</div>
                </div>
                <button type="button" onClick={handleStartPractice} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl bg-[#d9c794] px-3 text-xs font-bold text-[#26372f] transition hover:bg-[#e5d7ac] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[.98]">
                  {copy(isEnglish, "До практики", "Practice")}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </> : <div className="flex items-center gap-3 text-sm font-semibold text-[#e4d6ad]"><Sparkles className="h-5 w-5" aria-hidden="true" />{copy(isEnglish, "Усі етапи цього шляху пройдено.", "Every stage in this path is complete.")}</div>}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-8 sm:pt-5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={copy(isEnglish, "Фільтр емблем", "Filter emblems")}>
              {([
                ["all", copy(isEnglish, "Усі напрямки", "All paths"), PERSONAL_BADGES.length],
                ["earned", copy(isEnglish, "Розпочаті", "Started"), earnedBadges],
                ["next", copy(isEnglish, "Є наступний етап", "Next stage available"), nextCount],
              ] as const).map(([value, title, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${filter === value ? "bg-[#20352c] text-white dark:bg-primary dark:text-primary-foreground" : "bg-bg-hover text-text-secondary hover:bg-bg-hover/80 dark:bg-white/[.05] dark:text-text-secondary dark:hover:bg-white/[.09]"}`}
                >
                  {title}<span className={filter === value ? "text-white/65" : "text-text-muted"}>{count}</span>
                </button>
              ))}
            </div>
            <div className="hidden text-xs text-text-muted dark:text-text-secondary sm:block">
              {copy(isEnglish, "Етап відкривається лише після підтвердженої дії", "A stage opens only after verified activity")}
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
                const shownValue = Math.min(value, targetLevel.threshold);
                const Icon = badge.Icon;

                return (
                  <article key={badge.id} className={`achievement-card rounded-[20px] border p-4 transition-colors ${currentLevel ? "is-started border-primary/25 bg-white dark:bg-white/[.035]" : "border-border/10 bg-bg-surface/70 dark:border-white/[.08] dark:bg-white/[.018]"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`achievement-emblem achievement-emblem--${badge.emblem} ${currentLevel ? "is-earned" : "is-locked"}`} data-emblem={badge.emblem} aria-hidden="true">
                          <Icon className="achievement-emblem__icon h-5 w-5" />
                          <span className="achievement-emblem__rank">{currentLevel ? currentLevel.rank : <LockKeyhole className="h-2.5 w-2.5" />}</span>
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold tracking-[-.02em]">{copy(isEnglish, badge.nameUk, badge.nameEn)}</h3>
                          <div className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${currentLevel ? "text-primary-strong dark:text-primary-soft" : "text-text-muted dark:text-text-secondary"}`}>
                            {currentLevel ? <><Check className="h-3.5 w-3.5" aria-hidden="true" />{levelLabel(isEnglish, currentLevel.rank, badge.levels.length)} · {copy(isEnglish, currentLevel.nameUk, currentLevel.nameEn)}</> : copy(isEnglish, "Ще не розпочато", "Not started")}
                          </div>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold tracking-[.04em] ${currentLevel ? "bg-primary/10 text-primary-strong dark:text-primary-soft" : "bg-bg-hover text-text-muted dark:bg-white/[.05] dark:text-text-secondary"}`}>
                        {currentLevel ? copy(isEnglish, "ЕТАП ПІДТВЕРДЖЕНО", "STAGE CONFIRMED") : copy(isEnglish, "НАСТУПНА ЦІЛЬ", "NEXT GOAL")}
                      </span>
                    </div>

                    <p className="mt-4 min-h-[2.5rem] text-xs font-medium leading-5 text-text-secondary dark:text-text-primary">{copy(isEnglish, badge.detailUk, badge.detailEn)}</p>
                    <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-text-muted dark:text-text-secondary">
                      <span className="font-semibold tabular-nums">{shownValue} / {targetLevel.threshold} <span className="font-normal">{copy(isEnglish, badge.progressLabelUk, badge.progressLabelEn)}</span></span>
                      <span className="truncate">{nextLevel ? copy(isEnglish, `Далі: ${nextLevel.nameUk}`, `Next: ${nextLevel.nameEn}`) : copy(isEnglish, "Усі етапи пройдено", "All stages complete")}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bg-hover dark:bg-white/[.08]" role="progressbar" aria-label={copy(isEnglish, `Поступ: ${badge.nameUk}`, `Progress: ${badge.nameEn}`)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                      <div className={`h-full rounded-full transition-[width] duration-500 ${currentLevel ? "bg-primary" : "bg-[#9eaa9e] dark:bg-white/25"}`} style={{ width: `${progress}%` }} />
                    </div>

                    <div className="mt-3 flex items-start gap-2 rounded-xl bg-bg-hover/80 px-3 py-2.5 dark:bg-white/[.045]">
                      <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#b08b45]" aria-hidden="true" />
                      <p className="text-[11px] leading-[1.55] text-text-muted dark:text-text-secondary">
                        <span className="font-semibold text-text-primary dark:text-text-primary">{copy(isEnglish, "Що це показує: ", "What it shows: ")}</span>{copy(isEnglish, badge.valueUk, badge.valueEn)}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div> : <div className="grid min-h-52 place-items-center rounded-2xl border border-dashed border-border/15 px-6 text-center dark:border-white/10">
              <div><Trophy className="mx-auto h-7 w-7 text-text-muted" aria-hidden="true" /><p className="mt-3 text-sm font-semibold">{copy(isEnglish, filter === "earned" ? "Перший етап ще попереду" : "Тут поки немає наступних етапів", filter === "earned" ? "Your first stage is still ahead" : "There are no next stages here")}</p><p className="mt-1 text-xs text-text-muted dark:text-text-secondary">{copy(isEnglish, filter === "earned" ? "Спробуй задачу з бібліотеки — перший доказ з’явиться після перевірки." : "You have completed every stage in this collection.", filter === "earned" ? "Try a task from the library. Your first proof appears after a successful check." : "You have completed every stage in this collection.")}</p></div>
            </div>}
          </div>

          <footer className="shrink-0 border-t border-border/10 px-5 py-3 text-[11px] leading-5 text-text-muted dark:border-white/10 dark:text-text-secondary sm:px-8">
            {copy(isEnglish, "Постійні емблеми відображають найкращий підтверджений результат. Тижневий виклик окремо показує останні 7 днів і не стирає здобуті етапи.", "Permanent emblems reflect your best verified evidence. The weekly challenge tracks the last 7 days separately and never removes earned stages.")}
          </footer>
        </div>
      </div>
    </div>
  );
};
