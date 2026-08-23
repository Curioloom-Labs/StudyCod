import type { LucideIcon } from "lucide-react";
import { Compass, Crown, Flame, ShieldCheck, Sparkles, Star } from "lucide-react";

export type PersonalBadgeMetric =
  | "librarySolved"
  | "weeklyActiveDays"
  | "solvedAfterFailure"
  | "topicsPracticed"
  | "revisitedSolved";

export type PersonalBadgeStats = {
  librarySolved: number;
  weeklyActiveDays: number;
  solvedAfterFailure: number;
  topicsPracticed: number;
  revisitedSolved: number;
};

export type PersonalBadgeLevel = {
  rank: number;
  nameUk: string;
  nameEn: string;
  threshold: number;
  points: number;
  rewardUk: string;
  rewardEn: string;
};

export type PersonalBadge = {
  id: string;
  metric: PersonalBadgeMetric;
  threshold: number;
  nameUk: string;
  nameEn: string;
  detailUk: string;
  detailEn: string;
  valueUk: string;
  valueEn: string;
  rarityUk: string;
  rarityEn: string;
  Icon: LucideIcon;
  levels: PersonalBadgeLevel[];
};

/** Badges reward learning behaviours, not just grinding a larger number. */
export const PERSONAL_BADGES: PersonalBadge[] = [
  {
    id: "first-proof",
    metric: "librarySolved",
    threshold: 5,
    nameUk: "Перший доказ",
    nameEn: "First Proof",
    detailUk: "Закрий 5 задач із перевіреним результатом",
    detailEn: "Complete 5 tasks with verified results",
    valueUk: "Починаєш будувати реальне портфоліо практики",
    valueEn: "You are building a real practice portfolio",
    rarityUk: "Стартовий",
    rarityEn: "Starter",
    Icon: Star,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 5, points: 20, rewardUk: "Емблема першого доказу", rewardEn: "First proof emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 15, points: 50, rewardUk: "Срібна емблема в профілі", rewardEn: "Silver profile emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 30, points: 100, rewardUk: "Золота емблема та титул Практик", rewardEn: "Gold emblem and Practitioner title" },
      { rank: 4, nameUk: "Діамант", nameEn: "Diamond", threshold: 60, points: 200, rewardUk: "Діамантова емблема та титул Ветеран", rewardEn: "Diamond emblem and Veteran title" },
    ],
  },
  {
    id: "steady-rhythm",
    metric: "weeklyActiveDays",
    threshold: 3,
    nameUk: "Стабільний ритм",
    nameEn: "Steady Rhythm",
    detailUk: "Практикуйся у 3 різні дні протягом тижня",
    detailEn: "Practice on 3 different days this week",
    valueUk: "Показуєш сталість, а не випадковий ривок",
    valueEn: "You are building consistency, not a lucky sprint",
    rarityUk: "Рідкісний",
    rarityEn: "Rare",
    Icon: Flame,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 3, points: 30, rewardUk: "Емблема стабільності", rewardEn: "Consistency emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 5, points: 70, rewardUk: "Срібна емблема ритму", rewardEn: "Silver rhythm emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 7, points: 150, rewardUk: "Золота емблема тижневого ритму", rewardEn: "Gold weekly rhythm emblem" },
    ],
  },
  {
    id: "comeback",
    metric: "solvedAfterFailure",
    threshold: 1,
    nameUk: "Повернення сильнішим",
    nameEn: "Stronger Comeback",
    detailUk: "Виправ 1 задачу після невдалої спроби",
    detailEn: "Fix 1 task after an unsuccessful attempt",
    valueUk: "Доводиш, що вмієш перетворювати помилки на навички",
    valueEn: "You use mistakes to improve",
    rarityUk: "Цінний",
    rarityEn: "Valuable",
    Icon: ShieldCheck,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 1, points: 40, rewardUk: "Емблема відновлення", rewardEn: "Recovery emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 3, points: 90, rewardUk: "Срібна емблема наполегливості", rewardEn: "Silver persistence emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 7, points: 180, rewardUk: "Золота емблема Подолав помилку", rewardEn: "Gold Mistake Conqueror emblem" },
    ],
  },
  {
    id: "topic-explorer",
    metric: "topicsPracticed",
    threshold: 3,
    nameUk: "Дослідник тем",
    nameEn: "Topic Explorer",
    detailUk: "Практикуй 3 різні теми",
    detailEn: "Practice 3 different topics",
    valueUk: "Розширюєш карту навичок, а не лише список розв’язаного",
    valueEn: "You are widening your skill map, not just your solved count",
    rarityUk: "Рідкісний",
    rarityEn: "Rare",
    Icon: Compass,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 3, points: 30, rewardUk: "Емблема дослідника", rewardEn: "Explorer emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 5, points: 75, rewardUk: "Срібна емблема широкої практики", rewardEn: "Silver breadth emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 8, points: 160, rewardUk: "Золота емблема Картограф тем", rewardEn: "Gold Topic Cartographer emblem" },
    ],
  },
  {
    id: "deep-practice",
    metric: "revisitedSolved",
    threshold: 3,
    nameUk: "Глибока практика",
    nameEn: "Deep Practice",
    detailUk: "Подолай 3 задачі після повторної спроби",
    detailEn: "Solve 3 tasks after revisiting them",
    valueUk: "Підтверджуєш стійке розуміння, а не випадкову правильну відповідь",
    valueEn: "You show durable understanding, not a lucky answer",
    rarityUk: "Епічний",
    rarityEn: "Epic",
    Icon: Sparkles,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 3, points: 50, rewardUk: "Емблема глибокої практики", rewardEn: "Deep practice emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 6, points: 110, rewardUk: "Срібна емблема стійкого розуміння", rewardEn: "Silver durable understanding emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 12, points: 220, rewardUk: "Золота емблема Майстер повторення", rewardEn: "Gold Repetition Master emblem" },
    ],
  },
  {
    id: "systems-thinker",
    metric: "librarySolved",
    threshold: 30,
    nameUk: "Системне мислення",
    nameEn: "Systems Thinker",
    detailUk: "Закрий 30 задач",
    detailEn: "Complete 30 tasks",
    valueUk: "Маєш серйозну базу, на яку можна спиратися далі",
    valueEn: "You have a serious base to build on",
    rarityUk: "Майстерський",
    rarityEn: "Mastery",
    Icon: Crown,
    levels: [
      { rank: 1, nameUk: "Бронза", nameEn: "Bronze", threshold: 30, points: 100, rewardUk: "Емблема системного мислення", rewardEn: "Systems thinking emblem" },
      { rank: 2, nameUk: "Срібло", nameEn: "Silver", threshold: 60, points: 220, rewardUk: "Срібна емблема сильної бази", rewardEn: "Silver strong foundation emblem" },
      { rank: 3, nameUk: "Золото", nameEn: "Gold", threshold: 120, points: 450, rewardUk: "Золота емблема Архітектор", rewardEn: "Gold Architect emblem" },
      { rank: 4, nameUk: "Діамант", nameEn: "Diamond", threshold: 250, points: 900, rewardUk: "Діамантова емблема Системний мислитель", rewardEn: "Diamond Systems Thinker emblem" },
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
  const previous = badge.levels[badge.levels.indexOf(next) - 1]?.threshold ?? 0;
  return Math.max(0, Math.min(100, Math.round(((value - previous) / (next.threshold - previous)) * 100)));
}

export function isPersonalBadgeUnlocked(badge: PersonalBadge, stats: PersonalBadgeStats): boolean {
  return getBadgeLevel(badge, stats) !== null;
}

export function countUnlockedPersonalBadges(stats: PersonalBadgeStats): number {
  return PERSONAL_BADGES.filter((badge) => isPersonalBadgeUnlocked(badge, stats)).length;
}

export function getTotalBadgePoints(stats: PersonalBadgeStats): number {
  return PERSONAL_BADGES.reduce((total, badge) => total + (getBadgeLevel(badge, stats)?.points ?? 0), 0);
}
