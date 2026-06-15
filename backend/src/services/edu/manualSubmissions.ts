import { AppDataSource } from "../../data-source";
import { ManualSubmission } from "../../entities/ManualSubmission";
import { EduTask } from "../../entities/EduTask";
import { Student } from "../../entities/Student";

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

/** Create or overwrite the student's submission for a task (resubmit until graded). */
export async function upsertSubmission(taskId: number, studentId: number, input: SubmissionInput): Promise<ManualSubmission> {
  const existing = await subRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } } });
  if (existing) {
    existing.text = input.text ?? null;
    if (input.fileStorageKey !== undefined) existing.fileStorageKey = input.fileStorageKey;
    if (input.fileName !== undefined) existing.fileName = input.fileName;
    existing.status = "SUBMITTED";
    return await subRepo().save(existing);
  }
  const created = subRepo().create({
    task: { id: taskId } as EduTask,
    student: { id: studentId } as Student,
    text: input.text ?? null,
    fileStorageKey: input.fileStorageKey ?? null,
    fileName: input.fileName ?? null,
    status: "SUBMITTED"
  });
  return await subRepo().save(created);
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

export async function markGraded(taskId: number, studentId: number): Promise<void> {
  const existing = await subRepo().findOne({ where: { task: { id: taskId }, student: { id: studentId } } });
  if (existing) {
    existing.status = "GRADED";
    await subRepo().save(existing);
  }
}
