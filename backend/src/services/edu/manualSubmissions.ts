import crypto from "crypto";
import type { EntityManager } from "typeorm";
import { EduGrade } from "../../entities/EduGrade";
import { assertCoursePracticeActive } from "./courseLessonAttempt";
import { AppDataSource } from "../../data-source";
import { ManualSubmission } from "../../entities/ManualSubmission";
import { EduTask } from "../../entities/EduTask";
import { Student } from "../../entities/Student";
import { withStudentGradeWrite } from "./gradebookWrites";
import type { EduLifecycleActor } from "./lifecycleAccess";
import { HttpError } from "../../utils/httpError";

/**
 * Student submissions for MANUAL (hand-graded) tasks. Grading itself reuses the
 * existing manual-grade endpoint (writes EduGrade); this only holds the artifact
 * the teacher reads.
 */
const subRepo = () => AppDataSource.getRepository(ManualSubmission);

export interface SubmissionInput {
  text?: string | null;
  fileStorageKey?: string | null;
  fileName?: string | null;
}

export interface SubmissionValidation {
  ok: boolean;
  error?: string;
}

const MAX_TEXT = 50_000;

/** Pure: a submission must carry a non-empty text answer or a file (and text within bounds). */
export function validateManualSubmission(input: SubmissionInput): SubmissionValidation {
  const text = (input.text ?? "").trim();
  const hasFile = Boolean(input.fileStorageKey);
  if (!text && !hasFile) return { ok: false, error: "EMPTY_SUBMISSION" };
  if (text.length > MAX_TEXT) return { ok: false, error: "TEXT_TOO_LONG" };
  return { ok: true };
}

/** Include the journal decision: a GRADED artifact may not change when regraded. */
export function manualSubmissionRevision(submission: ManualSubmission, grade?: EduGrade | null): string {
  return crypto.createHash("sha256").update(JSON.stringify([
    submission.id, submission.text ?? null, submission.fileStorageKey ?? null,
    submission.fileName ?? null, submission.status, submission.updatedAt,
    grade ? [grade.id, grade.total, grade.score ?? null, grade.maxScore ?? null,
      grade.feedback ?? null, grade.rubricScores ?? null, grade.groupScores ?? null,
      grade.submittedCode ?? null, grade.testsPassed, grade.testsTotal,
      grade.theoryGrade ?? null, grade.type, grade.isManuallyGraded, grade.isCompleted] : null,
  ])).digest("hex");
}

async function withStudentLock<T>(studentId: number, work: (manager: EntityManager) => Promise<T>): Promise<T> {
  return AppDataSource.transaction("SERIALIZABLE", async manager => {
    await manager.createQueryBuilder(Student, "student").setLock("pessimistic_write")
      .where("student.id = :studentId", { studentId }).getOne();
    return work(manager);
  });
}

/** Preserve the existing attachment unless a replacement is explicitly supplied. */
export async function upsertSubmission(taskId: number, studentId: number, input: SubmissionInput) {
  return withStudentLock(studentId, async manager => {
    const task = await manager.getRepository(EduTask).findOne({ where: { id: taskId }, relations: ["lesson"] });
    if (!task || task.taskMode !== "MANUAL") throw new Error("MANUAL_TASK_NOT_FOUND");
    await assertCoursePracticeActive(task.lesson, studentId, manager);
    if (task.isClosed) throw new Error("TASK_IS_CLOSED");
    if (task.deadline && Date.now() > new Date(task.deadline).getTime()) throw new Error("DEADLINE_PASSED");
    const repo = manager.getRepository(ManualSubmission);
    const existing = await repo.findOne({ where: { task: { id: taskId }, student: { id: studentId } } });
    if (existing?.status === "GRADED") throw new Error("SUBMISSION_ALREADY_GRADED");
    const replacedFileStorageKey = input.fileStorageKey !== undefined && existing?.fileStorageKey !== input.fileStorageKey
      ? existing?.fileStorageKey ?? null : null;
    const submission = existing ?? repo.create({ task, student: { id: studentId } as Student });
    submission.text = input.text ?? null;
    if (input.fileStorageKey !== undefined) submission.fileStorageKey = input.fileStorageKey;
    if (input.fileName !== undefined) submission.fileName = input.fileName;
    submission.status = "SUBMITTED";
    const validation = validateManualSubmission(submission);
    if (!validation.ok) throw new Error(validation.error);
    return { submission: await repo.save(submission), replacedFileStorageKey };
  });
}

/** The journal grade and the submission status commit together. */
export async function gradeManualSubmission(task: EduTask, student: Student, input: {
  total: number; maxScore: number; feedback: string | null; expectedRevision?: string;
}, actor: EduLifecycleActor) {
  return withStudentGradeWrite(student.id, student.class.id, actor, async (manager, currentStudent) => {
    const repo = manager.getRepository(ManualSubmission);
    const submission = await repo.findOne({ where: { task: { id: task.id }, student: { id: student.id } } });
    if (!submission) throw new Error("SUBMISSION_NOT_FOUND");
    if (typeof input.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(input.expectedRevision)) throw new HttpError(409, "REVIEW_REVISION_REQUIRED");
    const grades = manager.getRepository(EduGrade);
    const existingGrade = await grades.findOne({ where: { task: { id: task.id }, student: { id: student.id } }, order: { createdAt: "DESC", id: "DESC" } });
    if (input.expectedRevision !== manualSubmissionRevision(submission, existingGrade)) {
      throw new Error("SUBMISSION_CHANGED");
    }
    const currentTask = await manager.getRepository(EduTask).findOne({ where: { id: task.id, lesson: { class: { id: currentStudent.class.id } } }, relations: ["lesson"] });
    if (!currentTask || currentTask.taskMode !== "MANUAL") throw new Error("MANUAL_TASK_NOT_FOUND");
    if (!Number.isSafeInteger(input.maxScore) || input.maxScore <= 0 || input.maxScore > 100_000 || !Number.isSafeInteger(input.total) || input.total < 0 || input.total > input.maxScore) throw new HttpError(400, "INVALID_GRADE_VALUE");
    const rubricMax = (currentTask.rubric ?? []).reduce((sum, item) => sum + Number(item.maxPoints), 0);
    if (rubricMax > 0 && input.maxScore !== rubricMax) throw new Error("RUBRIC_CHANGED");
    const grade = existingGrade
      ?? grades.create({ task: currentTask, student: currentStudent, testsPassed: 0, testsTotal: 0 });
    grade.total = Math.round(input.total / input.maxScore * 100);
    grade.score = input.total;
    grade.maxScore = input.maxScore;
    grade.feedback = input.feedback;
    grade.isManuallyGraded = true;
    grade.isCompleted = true;
    grade.rubricScores = null;
    const saved = await grades.save(grade);
    submission.status = "GRADED";
    await repo.save(submission);
    const savedSubmission = await repo.findOne({ where: { id: submission.id } });
    const savedGrade = await grades.findOne({ where: { id: saved.id } });
    if (!savedSubmission || !savedGrade) throw new Error("SUBMISSION_NOT_FOUND");
    return { grade: savedGrade, revision: manualSubmissionRevision(savedSubmission, savedGrade) };
  });
}

export async function getSubmission(taskId: number, studentId: number): Promise<ManualSubmission | null> {
  return await subRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } } });
}

export async function listSubmissionsForTask(taskId: number): Promise<ManualSubmission[]> {
  return await subRepo().find({
    where: { task: { id: taskId } },
    relations: ["student"],
    order: { updatedAt: "DESC" }
  });
}
