import { createHash } from "crypto";
import type { EduGrade } from "../../entities/EduGrade";
import type { SummaryGrade } from "../../entities/SummaryGrade";
import { HttpError } from "../../utils/httpError";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function gradeReviewRevision(grade: EduGrade): string {
  return hash(["grade", grade.id, grade.total, grade.score ?? null, grade.maxScore ?? null,
    grade.feedback ?? null, grade.rubricScores ?? null, grade.groupScores ?? null,
    grade.submittedCode ?? null, grade.testsPassed, grade.testsTotal, grade.theoryGrade == null ? null : Number(grade.theoryGrade),
    grade.type, grade.isManuallyGraded, grade.isCompleted]);
}
export function summaryReviewRevision(grade: SummaryGrade): string {
  return hash(["summary", grade.id, Number(grade.grade), grade.theoryGrade == null ? null : Number(grade.theoryGrade),
    grade.assessmentType, grade.semester, grade.name, grade.formulaSnapshot ?? null,
    grade.calculatedAt?.toISOString() ?? null, grade.quizAnswersJson ?? null, grade.quizResultsJson ?? null,
    grade.manualOverrideGrade ?? null, grade.calculatedGrade ?? null]);
}
export function emptyReviewRevision(kind: "task" | "control", studentId: number, taskId: number): string {
  return hash(["empty", kind, studentId, taskId]);
}
export function requireReviewRevision(expected: unknown, current: string): void {
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected)) throw new HttpError(409, "REVIEW_REVISION_REQUIRED");
  if (expected !== current) throw new HttpError(409, "GRADE_CHANGED");
}
