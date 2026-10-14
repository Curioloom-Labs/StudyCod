/** Do not put a journal percentage into a field that expects rubric points. */
export function manualGradeInput(grade: { total: number | null; score?: number | null; maxScore?: number | null } | null | undefined, maximum: number): string {
  if (!grade || !Number.isSafeInteger(maximum) || maximum <= 0) return "";
  if (grade.maxScore === maximum && typeof grade.score === "number" && Number.isSafeInteger(grade.score) && grade.score >= 0 && grade.score <= maximum) return String(grade.score);
  if (grade.total === null || !Number.isFinite(grade.total) || grade.total < 0 || grade.total > 100) return "";
  const points = Math.round(grade.total * maximum / 100);
  // Only prefill when saving these points preserves the existing percentage.
  return Math.round(points / maximum * 100) === grade.total ? String(points) : "";
}
