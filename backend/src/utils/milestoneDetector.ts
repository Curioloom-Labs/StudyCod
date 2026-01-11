export interface Milestone {
  type: "streak_9" | "improvement";
  message: string;
  previousAverage?: number;
  currentAverage?: number;
}
export function checkMilestone(lastNGrades: number[]): Milestone | null {
  if (lastNGrades.length < 3) {
    return null;
  }
  const last3Grades = lastNGrades.slice(0, 3);
  const last5Grades = lastNGrades.slice(0, 5);
  if (last3Grades.length === 3 && last3Grades.every(g => g >= 9)) {
    return {
      type: "streak_9",
      message: "Ти вирішив 3 завдання підряд з оцінкою 9+"
    };
  }
  if (last5Grades.length === 5) {
    const first3Avg = average(last5Grades.slice(0, 3));
    const last3Avg = average(last5Grades.slice(2, 5));
    if (last3Avg - first3Avg >= 2) {
      return {
        type: "improvement",
        message: `Середня оцінка: ${first3Avg.toFixed(1)} → ${last3Avg.toFixed(1)} (+${(last3Avg - first3Avg).toFixed(1)} бали)`,
        previousAverage: first3Avg,
        currentAverage: last3Avg
      };
    }
  }
  return null;
}
function average(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}