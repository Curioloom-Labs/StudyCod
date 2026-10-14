import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { lockStudentActor, type EduLifecycleActor } from "./lifecycleAccess";
import { HttpError } from "../../utils/httpError";

/**
 * Data-subject hooks for COPPA/FERPA/GDPR-K (design-for-later, p.10). The
 * interfaces exist now so the schema never needs a backfill; full consent flows
 * arrive in Phase 3. Export reads are themselves auditable data-access events.
 */
const studentRepo = () => AppDataSource.getRepository(Student);
const eduGradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);

export interface StudentExport {
  exportedAt: string;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    middleName: string | null;
    email: string;
    birthDate: string | null;
    parentalConsentAt: string | null;
    classId: number | null;
  };
  grades: Array<{ id: number; total: number | null; type: string | null; isCompleted: boolean; createdAt: string }>;
  summaryGrades: Array<{ id: number; name: string; assessmentType: string; grade: number; semester: number | null }>;
}

/** Pure shaper — turns already-fetched rows into the portable export object. */
export function buildStudentExport(
  student: Student,
  eduGrades: EduGrade[],
  summaryGrades: SummaryGrade[],
  now: Date = new Date()
): StudentExport {
  return {
    exportedAt: now.toISOString(),
    student: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      middleName: student.middleName ?? null,
      email: student.email,
      birthDate: student.birthDate ?? null,
      parentalConsentAt: student.parentalConsentAt ? new Date(student.parentalConsentAt).toISOString() : null,
      classId: student.class?.id ?? null
    },
    grades: eduGrades.map((g) => ({
      id: g.id,
      total: g.total ?? null,
      type: g.type ?? null,
      isCompleted: Boolean(g.isCompleted),
      createdAt: g.createdAt ? new Date(g.createdAt).toISOString() : ""
    })),
    summaryGrades: summaryGrades.map((s) => ({
      id: s.id,
      name: s.name,
      assessmentType: String(s.assessmentType),
      grade: Number(s.grade),
      semester: s.semester ?? null
    }))
  };
}

export async function exportStudentData(studentId: number): Promise<StudentExport | null> {
  const student = await studentRepo().findOne({ where: { id: studentId }, relations: ["class"] });
  if (!student) return null;
  const eduGrades = await eduGradeRepo().find({ where: { student: { id: studentId } } });
  const summaryGrades = await summaryGradeRepo().find({ where: { student: { id: studentId } } });
  return buildStudentExport(student, eduGrades, summaryGrades);
}

/** Right-to-erasure: hides the student while retaining recoverable academic records. */
export async function eraseStudentData(studentId: number, actor: EduLifecycleActor): Promise<boolean> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const student = await lockStudentActor(manager, studentId, actor, "STUDENT_MANAGE");
    if (student.deletedAt) return false;
    await manager.getRepository(Student).update(student.id, { deletedAt: new Date(), credentialVersion: () => "credential_version + 1" });
    return true;
  });
}

/** Restore a previously erased student; used only by an explicitly authorized admin flow. */
export async function restoreStudentData(studentId: number, actor: EduLifecycleActor): Promise<boolean> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const student = await lockStudentActor(manager, studentId, actor, "STUDENT_MANAGE");
    if (!student.deletedAt) return false;
    await manager.getRepository(Student).update(student.id, { deletedAt: null });
    return true;
  });
}

export async function setStudentConsent(
  studentId: number,
  opts: { birthDate?: string | null; consentGiven?: boolean },
  actor: EduLifecycleActor
): Promise<Student | null> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const student = await lockStudentActor(manager, studentId, actor, "STUDENT_MANAGE");
    if (student.deletedAt) throw new HttpError(409, "STUDENT_ARCHIVED");
    if (opts.birthDate !== undefined) student.birthDate = opts.birthDate;
    if (opts.consentGiven !== undefined) {
      student.parentalConsentAt = opts.consentGiven ? new Date() : null;
    }
    if (opts.birthDate !== undefined || opts.consentGiven !== undefined) await manager.getRepository(Student).update(student.id, {
      ...(opts.birthDate !== undefined ? { birthDate: student.birthDate } : {}),
      ...(opts.consentGiven !== undefined ? { parentalConsentAt: student.parentalConsentAt } : {})
    });
    return student;
  });
}
