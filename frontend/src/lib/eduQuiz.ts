export type EduQuizQuestion = {
  id: string;
  type: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "FILL_BLANK" | "MATCHING" | "OPEN_TEXT";
  prompt?: string;
  points?: number;
  options?: string[];
  blanks?: unknown[];
  pairCount?: number;
};
export type EduQuizAnswer = string | number | boolean | Array<string | number | null>;

export function isEduQuizAnswered(q: EduQuizQuestion, answer: EduQuizAnswer | undefined): boolean {
  const index = (v: unknown, count: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < count;
  switch (q.type) {
    case "TRUE_FALSE": return typeof answer === "boolean";
    case "SINGLE_CHOICE": return index(answer, q.options?.length ?? 0);
    case "MULTIPLE_CHOICE": return Array.isArray(answer) && answer.length > 0 && answer.every(v => index(v, q.options?.length ?? 0));
    case "FILL_BLANK": return !!q.blanks?.length && Array.isArray(answer) && q.blanks.every((_, i) => typeof answer[i] === "string" && String(answer[i]).trim().length > 0);
    case "MATCHING": return !!q.pairCount && Array.isArray(answer) && Array.from({ length: q.pairCount }, (_, i) => answer[i]).every(v => index(v, q.pairCount!));
    default: return typeof answer === "string" && answer.trim().length > 0;
  }
}
