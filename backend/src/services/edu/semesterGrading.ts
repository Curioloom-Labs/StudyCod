import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { TopicNew } from "../../entities/TopicNew";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType } from "../../types/AssessmentType";
import { logger } from "../../utils/logger";

// Topics without an explicit semester are treated as semester 1, so existing
// classes get a single sensible semester aggregate without any setup.
export const DEFAULT_SEMESTER = 1;

// Canonical name stored on SEMESTER aggregate rows.
const SEMESTER_NAME = "SEMESTER";
// Legacy thematic names that an INTERMEDIATE summary grade may carry.
const THEMATIC_NAMES = ["thematic", "тематична"];

export function normalizeSemester(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_SEMESTER;
  return Math.floor(n);
}

function clampRaw100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

const classRepo = () => AppDataSource.getRepository(Class);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);

export interface SemesterRecomputeResult {
  count: number;
  semesters: number[];
}

/**
 * Recompute semester aggregate grades for a class. For each student and each
 * semester present among the class topics, the semester grade is the average
 * of that student's thematic (INTERMEDIATE) grades for the topics in that
 * semester. Existing SEMESTER rows for the class are replaced.
 *
 * Returns the number of aggregate rows written and the list of semesters found.
 */
export async function recomputeSemesterGrades(classId: number): Promise<SemesterRecomputeResult> {
  const cls = await classRepo().findOne({
    where: { id: classId },
    relations: ["students"]
  });
  if (!cls) {
    return { count: 0, semesters: [] };
  }

  const topics = await topicRepo()
    .createQueryBuilder("topic")
    .where("topic.class_id = :classId", { classId })
    .getMany();

  // topicId -> semester (null coalesced to DEFAULT_SEMESTER)
  const topicSemester = new Map<number, number>();
  for (const t of topics) {
    topicSemester.set(t.id, normalizeSemester(t.semester ?? DEFAULT_SEMESTER));
  }
  const semesters = Array.from(new Set(topicSemester.values())).sort((a, b) => a - b);

  // All thematic grades for the class, with student + topic.
  const thematicGrades = await summaryGradeRepo()
    .createQueryBuilder("sg")
    .leftJoinAndSelect("sg.student", "student")
    .leftJoinAndSelect("sg.topic", "topic")
    .where("sg.class_id = :classId", { classId })
    .andWhere("sg.assessment_type = :type", { type: AssessmentType.INTERMEDIATE })
    .andWhere("sg.control_work_id IS NULL")
    .andWhere("LOWER(TRIM(sg.name)) IN (:...names)", { names: THEMATIC_NAMES })
    .getMany();

  // (studentId -> semester -> grade[])
  const byStudentSemester = new Map<number, Map<number, number[]>>();
  for (const sg of thematicGrades) {
    const studentId = sg.student?.id;
    const topicId = sg.topic?.id;
    if (!studentId || !topicId) continue;
    const semester = topicSemester.get(topicId);
    if (!semester) continue;
    const grade = Number(sg.grade);
    if (!Number.isFinite(grade)) continue;

    let perSem = byStudentSemester.get(studentId);
    if (!perSem) {
      perSem = new Map<number, number[]>();
      byStudentSemester.set(studentId, perSem);
    }
    const arr = perSem.get(semester) ?? [];
    arr.push(grade);
    perSem.set(semester, arr);
  }

  // Replace existing SEMESTER rows for the class, then insert fresh aggregates.
  await summaryGradeRepo()
    .createQueryBuilder()
    .delete()
    .from(SummaryGrade)
    .where("class_id = :classId", { classId })
    .andWhere("assessment_type = :type", { type: AssessmentType.SEMESTER })
    .execute();

  let count = 0;
  for (const student of cls.students) {
    const perSem = byStudentSemester.get(student.id);
    for (const semester of semesters) {
      const grades = perSem?.get(semester) ?? [];
      if (grades.length === 0) continue; // no thematic grades this semester → skip
      const avg = clampRaw100(grades.reduce((s, v) => s + v, 0) / grades.length);
      const row = summaryGradeRepo().create({
        class: cls,
        student,
        topic: null,
        name: SEMESTER_NAME,
        grade: avg,
        semester,
        assessmentType: AssessmentType.SEMESTER,
        controlWork: null
      });
      await summaryGradeRepo().save(row);
      count++;
    }
  }

  logger.info("[semester-grading] Recomputed semester grades", { classId, count, semesters });
  return { count, semesters };
}
