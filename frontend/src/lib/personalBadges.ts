import type { LucideIcon } from "lucide-react";
import { Brain, CalendarDays, Compass, Layers3, RotateCcw, Target } from "lucide-react";

export type PersonalBadgeMetric =
  | "librarySolved"
  | "bestWeekActiveDays"
  | "solvedAfterFailure"
  | "topicsPracticed"
  | "revisitedSolved"
  | "masteredTopics";

export type PersonalBadgeStats = {
  librarySolved: number;
  bestWeekActiveDays: number;
  solvedAfterFailure: number;
  topicsPracticed: number;
  revisitedSolved: number;
  masteredTopics: number;
  activePracticeDays: number;
  activeDaysThisWeek: number;
  completedWeeklyChallenges: number;
  dailyMissionCompletedToday: boolean;
};

export type PersonalBadgeEmblem = "proof" | "rhythm" | "return" | "explore" | "depth" | "foundation";

export type PersonalBadgeLevel = {
  rank: number;
  nameUk: string;
  nameEn: string;
  threshold: number;
  xpReward: number;
};

export type PersonalBadge = {
  id: string;
  metric: PersonalBadgeMetric;
  emblem: PersonalBadgeEmblem;
  nameUk: string;
  nameEn: string;
  detailUk: string;
  detailEn: string;
  progressLabelUk: string;
  progressLabelEn: string;
  valueUk: string;
  valueEn: string;
  Icon: LucideIcon;
  levels: PersonalBadgeLevel[];
};

export type LearningRank = {
  level: number;
  nameUk: string;
  nameEn: string;
  threshold: number;
};

export const LEARNING_RANKS: LearningRank[] = [
  { level: 1, nameUk: "Початківець", nameEn: "Starter", threshold: 0 },
  { level: 2, nameUk: "Практик", nameEn: "Practitioner", threshold: 100 },
  { level: 3, nameUk: "Дослідник", nameEn: "Explorer", threshold: 250 },
  { level: 4, nameUk: "Стратег", nameEn: "Strategist", threshold: 500 },
  { level: 5, nameUk: "Майстер", nameEn: "Master", threshold: 900 },
  { level: 6, nameUk: "Експерт", nameEn: "Expert", threshold: 1500 },
];

export type PracticeActivitySummary = {
  activePracticeDays: number;
  activeDaysThisWeek: number;
  completedWeeklyChallenges: number;
  dailyMissionCompletedToday: boolean;
};

/** Permanent emblems describe distinct kinds of learning evidence, not a spendable currency. */
export const PERSONAL_BADGES: PersonalBadge[] = [
  {
    id: "first-proof",
    metric: "librarySolved",
    emblem: "proof",
    nameUk: "Перевірене рішення",
    nameEn: "Verified Solution",
    detailUk: "Завершуй задачі з результатом, який підтвердила перевірка.",
    detailEn: "Finish tasks with a result confirmed by the checker.",
    progressLabelUk: "перевірених задач",
    progressLabelEn: "verified tasks",
    valueUk: "Відрізняєш готове рішення від самої спроби.",
    valueEn: "You distinguish a completed solution from an attempt.",
    Icon: Target,
    levels: [
      { rank: 1, nameUk: "Перший крок", nameEn: "First Step", threshold: 1, xpReward: 15 },
      { rank: 2, nameUk: "Практик", nameEn: "Practitioner", threshold: 5, xpReward: 25 },
      { rank: 3, nameUk: "Досвідчений", nameEn: "Experienced", threshold: 15, xpReward: 40 },
      { rank: 4, nameUk: "Майстер", nameEn: "Master", threshold: 40, xpReward: 75 },
    ],
  },
  {
    id: "steady-rhythm",
    metric: "bestWeekActiveDays",
    emblem: "rhythm",
    nameUk: "Сталий ритм",
    nameEn: "Steady Rhythm",
    detailUk: "Повертайся до практики в різні дні.",
    detailEn: "Return to practice on different days.",
    progressLabelUk: "активних днів за 7 днів",
    progressLabelEn: "active days in a 7-day span",
    valueUk: "Розподіляєш навчання в часі й даєш знанням закріпитися.",
    valueEn: "You spread learning over time and give knowledge room to stick.",
    Icon: CalendarDays,
    levels: [
      { rank: 1, nameUk: "Зародження звички", nameEn: "A New Habit", threshold: 2, xpReward: 25 },
      { rank: 2, nameUk: "Регулярність", nameEn: "Regularity", threshold: 3, xpReward: 40 },
      { rank: 3, nameUk: "Опора", nameEn: "A Steady Base", threshold: 5, xpReward: 60 },
      { rank: 4, nameUk: "Власний ритм", nameEn: "Your Rhythm", threshold: 7, xpReward: 90 },
    ],
  },
  {
    id: "comeback",
    metric: "solvedAfterFailure",
    emblem: "return",
    nameUk: "Повернення після помилки",
    nameEn: "Learning from Errors",
    detailUk: "Після невдалої спроби повернись і доведи задачу до рішення.",
    detailEn: "After an unsuccessful attempt, return and solve the task.",
    progressLabelUk: "задач, розв’язаних після помилки",
    progressLabelEn: "tasks solved after an error",
    valueUk: "Помилка стає інформацією для наступного кроку, а не кінцем роботи.",
    valueEn: "An error becomes information for the next step, not the end of the work.",
    Icon: RotateCcw,
    levels: [
      { rank: 1, nameUk: "Повернувся", nameEn: "Returned", threshold: 1, xpReward: 25 },
      { rank: 2, nameUk: "Змінив підхід", nameEn: "Adjusted", threshold: 3, xpReward: 40 },
      { rank: 3, nameUk: "Відновився", nameEn: "Recovered", threshold: 7, xpReward: 60 },
      { rank: 4, nameUk: "Наполегливість", nameEn: "Persistent", threshold: 15, xpReward: 90 },
    ],
  },
  {
    id: "topic-explorer",
    metric: "topicsPracticed",
    emblem: "explore",
    nameUk: "Карта тем",
    nameEn: "Topic Map",
    detailUk: "Пробуй задачі з різних тем і розширюй карту навичок.",
    detailEn: "Practice across different topics and widen your skill map.",
    progressLabelUk: "тем із практикою",
    progressLabelEn: "topics explored",
    valueUk: "Помічаєш зв’язки між темами й не замикаєшся на одному типі задач.",
    valueEn: "You notice connections between topics instead of staying with one problem type.",
    Icon: Compass,
    levels: [
      { rank: 1, nameUk: "Перший маршрут", nameEn: "First Route", threshold: 1, xpReward: 15 },
      { rank: 2, nameUk: "Дослідник", nameEn: "Explorer", threshold: 3, xpReward: 30 },
      { rank: 3, nameUk: "Картограф", nameEn: "Cartographer", threshold: 5, xpReward: 50 },
      { rank: 4, nameUk: "Навігатор", nameEn: "Navigator", threshold: 8, xpReward: 75 },
    ],
  },
  {
    id: "deep-practice",
    metric: "revisitedSolved",
    emblem: "depth",
    nameUk: "Розбір складного",
    nameEn: "Working Through Difficulty",
    detailUk: "Повернись до задачі після двох невдалих спроб і розв’яжи її.",
    detailEn: "Return to a task after two failed attempts and solve it.",
    progressLabelUk: "задач, розв’язаних після 2+ помилок",
    progressLabelEn: "tasks solved after 2+ errors",
    valueUk: "Відстежуєш, що саме не спрацювало, і перевіряєш новий підхід.",
    valueEn: "You identify what failed and test a different approach.",
    Icon: Brain,
    levels: [
      { rank: 1, nameUk: "Не здався", nameEn: "Kept Going", threshold: 1, xpReward: 35 },
      { rank: 2, nameUk: "Розбір", nameEn: "Analysis", threshold: 2, xpReward: 55 },
      { rank: 3, nameUk: "Глибина", nameEn: "Depth", threshold: 5, xpReward: 80 },
      { rank: 4, nameUk: "Осмислена практика", nameEn: "Deliberate Practice", threshold: 10, xpReward: 120 },
    ],
  },
  {
    id: "strong-foundation",
    metric: "masteredTopics",
    emblem: "foundation",
    nameUk: "Опорні теми",
    nameEn: "Strong Topics",
    detailUk: "Розв’яжи щонайменше три різні задачі в кожній темі.",
    detailEn: "Solve at least three different tasks in each topic.",
    progressLabelUk: "тем із 3+ перевіреними рішеннями",
    progressLabelEn: "topics with 3+ verified solutions",
    valueUk: "Показуєш, що можеш застосувати навичку до різних задач у межах теми.",
    valueEn: "You can apply a skill to different problems within a topic.",
    Icon: Layers3,
    levels: [
      { rank: 1, nameUk: "Перша опора", nameEn: "First Anchor", threshold: 1, xpReward: 30 },
      { rank: 2, nameUk: "Впевненість", nameEn: "Confidence", threshold: 3, xpReward: 50 },
      { rank: 3, nameUk: "Системність", nameEn: "Fluency", threshold: 6, xpReward: 80 },
      { rank: 4, nameUk: "Майстерність", nameEn: "Mastery", threshold: 10, xpReward: 120 },
    ],
  },
];

export function getBadgeMetricValue(badge: PersonalBadge, stats: PersonalBadgeStats): number {
  return Math.max(0, Number(stats[badge.metric] ?? 0));
}

export function getBadgeLevel(badge: PersonalBadge, stats: PersonalBadgeStats): PersonalBadgeLevel | null {
  const value = getBadgeMetricValue(badge, stats);
  return badge.levels.reduce<PersonalBadgeLevel | null>((current, level) => (
    value >= level.threshold ? level : current
  ), null);
}

export function getNextBadgeLevel(badge: PersonalBadge, stats: PersonalBadgeStats): PersonalBadgeLevel | null {
  const value = getBadgeMetricValue(badge, stats);
  return badge.levels.find((level) => value < level.threshold) ?? null;
}

export function getBadgeProgressPercent(badge: PersonalBadge, stats: PersonalBadgeStats): number {
  const value = getBadgeMetricValue(badge, stats);
  const next = getNextBadgeLevel(badge, stats);
  if (!next) return 100;
  return Math.max(0, Math.min(100, Math.round((value / next.threshold) * 100)));
}

export function countMasteredTopics(topics: Array<{ practiced: number; solved: number }>): number {
  return topics.filter((topic) => topic.solved >= 3).length;
}

export function isPersonalBadgeUnlocked(badge: PersonalBadge, stats: PersonalBadgeStats): boolean {
  return getBadgeLevel(badge, stats) !== null;
}

export function countUnlockedPersonalBadges(stats: PersonalBadgeStats): number {
  return PERSONAL_BADGES.filter((badge) => isPersonalBadgeUnlocked(badge, stats)).length;
}

export function countUnlockedBadgeLevels(stats: PersonalBadgeStats): number {
  return PERSONAL_BADGES.reduce((total, badge) => {
    const value = getBadgeMetricValue(badge, stats);
    return total + badge.levels.filter((level) => value >= level.threshold).length;
  }, 0);
}

export function countTotalBadgeLevels(): number {
  return PERSONAL_BADGES.reduce((total, badge) => total + badge.levels.length, 0);
}

export function getLearningRank(xp: number): LearningRank {
  const totalXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  return LEARNING_RANKS.reduce((current, rank) => totalXp >= rank.threshold ? rank : current, LEARNING_RANKS[0]);
}

export function getNextLearningRank(xp: number): LearningRank | null {
  const totalXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  return LEARNING_RANKS.find((rank) => totalXp < rank.threshold) ?? null;
}

export function getLearningRankProgressPercent(xp: number): number {
  const totalXp = Math.max(0, Number.isFinite(xp) ? xp : 0);
  const current = getLearningRank(totalXp);
  const next = getNextLearningRank(totalXp);
  if (!next) return 100;
  return Math.max(0, Math.min(100, Math.round(((totalXp - current.threshold) / (next.threshold - current.threshold)) * 100)));
}

/** XP is a permanent summary of verified work; no action can spend or remove it. */
export function getLearningXp(stats: PersonalBadgeStats): number {
  const evidenceXp = Math.max(0, stats.librarySolved) * 8
    + Math.max(0, stats.solvedAfterFailure) * 10
    + Math.max(0, stats.topicsPracticed) * 4
    + Math.max(0, stats.activePracticeDays) * 15
    + Math.max(0, stats.completedWeeklyChallenges) * 60;
  const stageXp = PERSONAL_BADGES.reduce((total, badge) => {
    const value = getBadgeMetricValue(badge, stats);
    return total + badge.levels.reduce((earned, level) => earned + (value >= level.threshold ? level.xpReward : 0), 0);
  }, 0);
  return evidenceXp + stageXp;
}

function toLocalDayOrdinal(value: string | Date): number | null {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

/** Current calendar-week missions plus permanent unique practice-day evidence. Weeks start on Monday. */
export function getPracticeActivitySummary(dates: Iterable<string | Date>, now = new Date()): PracticeActivitySummary {
  const today = toLocalDayOrdinal(now);
  if (today === null) return { activePracticeDays: 0, activeDaysThisWeek: 0, completedWeeklyChallenges: 0, dailyMissionCompletedToday: false };
  const activeDays = new Set(Array.from(dates, toLocalDayOrdinal).filter((day): day is number => day !== null && day <= today));
  const weekday = new Date(today * 86_400_000).getUTCDay();
  const currentWeekStart = today - ((weekday + 6) % 7);
  const activeDaysThisWeek = Array.from(activeDays).filter((day) => day >= currentWeekStart).length;
  const activeDaysByWeek = new Map<number, number>();
  for (const day of activeDays) {
    const dayOfWeek = new Date(day * 86_400_000).getUTCDay();
    const weekStart = day - ((dayOfWeek + 6) % 7);
    activeDaysByWeek.set(weekStart, (activeDaysByWeek.get(weekStart) ?? 0) + 1);
  }

  return {
    activePracticeDays: activeDays.size,
    activeDaysThisWeek,
    completedWeeklyChallenges: Array.from(activeDaysByWeek.values()).filter((count) => count >= 3).length,
    dailyMissionCompletedToday: activeDays.has(today),
  };
}

/** Best number of distinct active calendar days in any rolling 7-day span. */
export function getBestSevenDayActivityDays(dates: Iterable<string | Date>): number {
  const days = Array.from(new Set(Array.from(dates, (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }).filter((day): day is number => day !== null))).sort((a, b) => a - b);

  let best = 0;
  let start = 0;
  for (let end = 0; end < days.length; end += 1) {
    while (days[end] - days[start] > 6 * 24 * 60 * 60 * 1000) start += 1;
    best = Math.max(best, end - start + 1);
  }
  return best;
}
