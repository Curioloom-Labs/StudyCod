import { AppDataSource } from "../../data-source";
import { Student } from "../../entities/Student";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";

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

/** Right-to-erasure: removes the student (FK cascade drops grades/links). */
export async function eraseStudentData(studentId: number): Promise<boolean> {
  const student = await studentRepo().findOne({ where: { id: studentId } });
  if (!student) return false;
  await studentRepo().remove(student);
  return true;
}

export async function setStudentConsent(
  studentId: number,
  opts: { birthDate?: string | null; consentGiven?: boolean }
): Promise<Student | null> {
  const student = await studentRepo().findOne({ where: { id: studentId } });
  if (!student) return null;
  if (opts.birthDate !== undefined) student.birthDate = opts.birthDate;
  if (opts.consentGiven !== undefined) {
    student.parentalConsentAt = opts.consentGiven ? new Date() : null;
  }
  await studentRepo().save(student);
  return student;
}
