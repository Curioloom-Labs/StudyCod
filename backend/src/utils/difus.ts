import type { User } from "../entities/User";

export type IadLang = "JAVA" | "PYTHON" | "CPP";
export type DifusLang = IadLang;

export const IAD_MIN = 0;
export const IAD_MAX = 1;
export const DIFUS_MIN = IAD_MIN;
export const DIFUS_MAX = IAD_MAX;

/**
 * IAD model v2: a high score is evidence only when it is earned on a
 * sufficiently advanced part of the route. The topic ceiling prevents a few
 * introductory exercises from producing an advanced-looking profile.
 */
export const IAD_MODEL_VERSION = 2;

export type IadEvidence = {
  topicIndex?: number | null;
  taskType?: string | null;
  numInTopic?: number | null;
  isMiniProject?: boolean;
};

export function clampIad(value: number): number {
  if (!Number.isFinite(value)) return IAD_MIN;
  const clamped = Math.max(IAD_MIN, Math.min(IAD_MAX, value));
  return Math.round(clamped * 1000) / 1000;
}

export const clampDifus = clampIad;

export function getIadTopicWeight(topicIndexRaw: number | null | undefined): number {
  const topicIndex = Number(topicIndexRaw);
  if (!Number.isFinite(topicIndex)) return 0.35;
  if (topicIndex <= 0) return 0.18;
  if (topicIndex <= 2) return 0.28;
  if (topicIndex <= 5) return 0.45;
  if (topicIndex <= 8) return 0.65;
  if (topicIndex <= 12) return 0.82;
  return 1;
}

/** Highest credible IAD for the most advanced topic reached so far. */
export function getIadCeilingForTopic(topicIndexRaw: number | null | undefined): number {
  const topicIndex = Number(topicIndexRaw);
  if (!Number.isFinite(topicIndex)) return 0.15;
  const ceilings = [0.025, 0.04, 0.06, 0.085, 0.115, 0.15, 0.19, 0.24, 0.3, 0.38, 0.48, 0.58, 0.68, 0.76, 0.83, 0.89, 0.94, 1];
  const index = Math.max(0, Math.floor(topicIndex));
  if (index < ceilings.length) return ceilings[index];
  return Math.min(1, ceilings[ceilings.length - 1] + (index - ceilings.length + 1) * 0.012);
}

export function getIadDeltaByGrade(gradeRaw: number, evidence: IadEvidence = {}): number {
  const grade = Number.isFinite(Number(gradeRaw)) ? Math.floor(Number(gradeRaw)) : 0;
  if (grade <= 30) return -0.035;
  if (grade <= 55) return -0.018;

  // 56..79 is a useful learning signal, but not proof of mastery. Strong
  // growth starts at 80 and becomes meaningful only on later topics.
  const quality = grade <= 79 ? 0.35 : grade <= 89 ? 0.7 : grade <= 94 ? 0.9 : 1;
  const taskWeight = evidence.isMiniProject
    ? 1.3
    : String(evidence.taskType ?? "").toUpperCase() === "CONTROL"
      ? 1.15
      : 1;
  return 0.01 * quality * getIadTopicWeight(evidence.topicIndex) * taskWeight;
}

export const getDifusDeltaByGrade = getIadDeltaByGrade;

export function getIadReasonKeyByGrade(gradeRaw: number):
  | "very_low_score"
  | "low_score"
  | "good_score"
  | "excellent_score" {
  const grade = Number.isFinite(Number(gradeRaw)) ? Math.floor(Number(gradeRaw)) : 0;
  if (grade <= 30) return "very_low_score";
  if (grade <= 55) return "low_score";
  if (grade <= 79) return "good_score";
  return "excellent_score";
}

export const getDifusReasonKeyByGrade = getIadReasonKeyByGrade;

export function getUserIadForLang(user: User, lang: IadLang): number {
  if (lang === "PYTHON") return clampIad(Number((user as any).iadPython ?? (user as any).difusPython ?? 0));
  if (lang === "CPP") return clampIad(Number((user as any).iadCpp ?? (user as any).difusCpp ?? 0));
  return clampIad(Number((user as any).iadJava ?? (user as any).difusJava ?? 0));
}

export const getUserDifusForLang = getUserIadForLang;

export function setUserIadForLang(user: User, lang: IadLang, value: number): void {
  const next = clampIad(value);
  if (lang === "PYTHON") {
    (user as any).iadPython = next;
    (user as any).difusPython = next;
    return;
  }
  if (lang === "CPP") {
    (user as any).iadCpp = next;
    (user as any).difusCpp = next;
    return;
  }
  (user as any).iadJava = next;
  (user as any).difusJava = next;
}

export const setUserDifusForLang = setUserIadForLang;

export function getLastProcessedGradeIdForLang(user: User, lang: IadLang): number | null {
  const raw = lang === "PYTHON"
    ? ((user as any).lastIadGradeIdPython ?? (user as any).lastDifusGradeIdPython)
    : lang === "CPP"
      ? ((user as any).lastIadGradeIdCpp ?? (user as any).lastDifusGradeIdCpp)
      : ((user as any).lastIadGradeIdJava ?? (user as any).lastDifusGradeIdJava);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

export function setLastProcessedGradeIdForLang(user: User, lang: IadLang, gradeId: number | null): void {
  const normalized = Number.isFinite(Number(gradeId)) && Number(gradeId) > 0
    ? Math.floor(Number(gradeId))
    : null;

  if (lang === "PYTHON") {
    (user as any).lastIadGradeIdPython = normalized;
    (user as any).lastDifusGradeIdPython = normalized;
    return;
  }
  if (lang === "CPP") {
    (user as any).lastIadGradeIdCpp = normalized;
    (user as any).lastDifusGradeIdCpp = normalized;
    return;
  }
  (user as any).lastIadGradeIdJava = normalized;
  (user as any).lastDifusGradeIdJava = normalized;
}

export function getUserActiveIad(user: User): number {
  return getUserIadForLang(user, (user.lang as IadLang) || "JAVA");
}

export const getUserActiveDifus = getUserActiveIad;
