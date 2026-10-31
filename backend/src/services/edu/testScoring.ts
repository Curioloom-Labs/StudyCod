import type { TestData } from "../../entities/TestData";

export type EduGroupScore = { group: string; score: number; maxScore: number };
const PERCENT_SCORE_UNITS = 100;

/** Calculate EDU scores from per-test Judge results so subtasks can mix scoring modes. */
export function calculateEduTestScores(
  tests: Array<Pick<TestData, "id" | "points" | "isHidden" | "subtask" | "subtaskScoringMode" | "subtaskWeightPercent">>,
  passedTestIds: ReadonlySet<string>
): { score: number; maxScore: number; groupScores: EduGroupScore[] } {
  const hasSubtasks = tests.some(test => String(test.subtask ?? "").trim().length > 0);
  const groups = new Map<string, typeof tests>();

  for (const test of tests) {
    const subtask = String(test.subtask ?? "").trim();
    const group = hasSubtasks ? (subtask || `unassigned_${test.id}`) : test.isHidden ? "hidden" : "public";
    groups.set(group, [...(groups.get(group) ?? []), test]);
  }

  const groupScores = [...groups].map(([group, items]) => {
    const rawMaxScore = items.reduce((sum, test) => sum + (test.points || 1), 0);
    const passed = items.filter(test => passedTestIds.has(String(test.id)));
    const isNamedSubtask = items.some(test => String(test.subtask ?? "").trim().length > 0);
    const isPartial = items.some(test => test.subtaskScoringMode === "PARTIAL");
    const weightPercent = isNamedSubtask ? items.find(test => Number.isInteger(test.subtaskWeightPercent)
      && Number(test.subtaskWeightPercent) >= 1 && Number(test.subtaskWeightPercent) <= 100)?.subtaskWeightPercent : undefined;
    if (weightPercent !== undefined && weightPercent !== null) {
      const maxScore = weightPercent * PERCENT_SCORE_UNITS;
      const score = isNamedSubtask && !isPartial
        ? (passed.length === items.length ? maxScore : 0)
        : Math.round(maxScore * passed.reduce((sum, test) => sum + (test.points || 1), 0) / rawMaxScore);
      return { group, score, maxScore };
    }
    const maxScore = rawMaxScore;
    const score = isNamedSubtask && !isPartial
      ? (passed.length === items.length ? maxScore : 0)
      : passed.reduce((sum, test) => sum + (test.points || 1), 0);
    return { group, score, maxScore };
  });

  return {
    score: groupScores.reduce((sum, group) => sum + group.score, 0),
    maxScore: groupScores.reduce((sum, group) => sum + group.maxScore, 0),
    groupScores,
  };
}
