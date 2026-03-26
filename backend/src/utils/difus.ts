import type { User } from "../entities/User";

export type IadLang = "JAVA" | "PYTHON" | "CPP";
export type DifusLang = IadLang;

export const IAD_MIN = 0;
export const IAD_MAX = 1;
export const DIFUS_MIN = IAD_MIN;
export const DIFUS_MAX = IAD_MAX;

export function clampIad(value: number): number {
  if (!Number.isFinite(value)) return IAD_MIN;
  const clamped = Math.max(IAD_MIN, Math.min(IAD_MAX, value));
  return Math.round(clamped * 1000) / 1000;
}

export const clampDifus = clampIad;

export function getIadDeltaByGrade(gradeRaw: number): number {
  const grade = Number.isFinite(Number(gradeRaw)) ? Math.floor(Number(gradeRaw)) : 0;
  if (grade <= 30) return -0.045;
  if (grade <= 55) return -0.02;
  if (grade <= 79) return 0.012;
  return 0.028;
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
