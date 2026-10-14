import { stripQuizForStudent, type Quiz } from "./quizGrader";

/** Preserve both quiz formats while exposing only fields needed to answer. */
export function studentQuizJson(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (Array.isArray(value)) {
      return JSON.stringify(value.map((question: Record<string, unknown>) => ({
        id: question.id,
        q: question.q,
        question: question.question,
        options: question.options,
        points: question.points,
      })));
    }
    if (value && typeof value === "object" && Array.isArray((value as Quiz).questions)) {
      return JSON.stringify(stripQuizForStudent(value as Quiz));
    }
  } catch {
    // Invalid stored JSON must never fall back to an unfiltered payload.
  }
  return null;
}
