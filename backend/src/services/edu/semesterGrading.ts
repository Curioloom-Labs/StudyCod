import { Student } from "../../entities/Student";
import { TopicNew } from "../../entities/TopicNew";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType } from "../../types/AssessmentType";
import { logger } from "../../utils/logger";
import { withGradebookWrite } from "./gradebookWrites";
import type { EduLifecycleActor } from "./lifecycleAccess";

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

export interface SemesterRecomputeResult {
  count: number;
  semesters: number[];
}

/**
 * Recompute semester aggregate grades for a class. For each student and each
 * semester present among the class topics, the semester grade is the average
 * of that student's thematic (INTERMEDIATE) grades for the topics in that
 * semester. Active learners' rows are updated atomically, retaining IDs. Archived
 * learners' history is untouched. Recompute intentionally resets manual overrides.
 *
 * Returns the number of aggregate rows written and the list of semesters found.
 */
export async function recomputeSemesterGrades(classId: number, actor: EduLifecycleActor): Promise<SemesterRecomputeResult> {
  const result = await withGradebookWrite(classId, actor, async (manager, cls) => {
    const topicRepo = () => manager.getRepository(TopicNew);
    const summaryGradeRepo = () => manager.getRepository(SummaryGrade);
    const students = await manager.getRepository(Student).findBy({ class: { id: cls.id } });
    const activeStudentIds = new Set(students.map(student => student.id));

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
      .orderBy("sg.createdAt", "DESC")
      .addOrderBy("sg.id", "DESC")
      .getMany();

    // (studentId -> semester -> grade[])
    const byStudentSemester = new Map<number, Map<number, number[]>>();
    const seenStudentTopics = new Set<string>();
    for (const sg of thematicGrades) {
      const studentId = sg.student?.id;
      const topicId = sg.topic?.id;
      if (!studentId || !topicId || !activeStudentIds.has(studentId)) continue;
      const key = `${studentId}:${topicId}`;
      if (seenStudentTopics.has(key)) continue;
      seenStudentTopics.add(key);
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

    const existing = await summaryGradeRepo().createQueryBuilder("sg")
      .leftJoinAndSelect("sg.student", "student")
      .where("sg.class_id = :classId", { classId })
      .andWhere("sg.assessment_type = :type", { type: AssessmentType.SEMESTER })
      .orderBy("sg.createdAt", "DESC").addOrderBy("sg.id", "DESC").getMany();
    const byStudentSemesterKey = new Map<string, SummaryGrade>();
    for (const row of existing) {
      if (!row.student || !activeStudentIds.has(row.student.id)) continue;
      const key = `${row.student.id}:${row.semester}`;
      if (!byStudentSemesterKey.has(key)) byStudentSemesterKey.set(key, row);
    }
    const retainedIds = new Set<number>();

    let count = 0;
    for (const student of students) {
      const perSem = byStudentSemester.get(student.id);
      for (const semester of semesters) {
        const grades = perSem?.get(semester) ?? [];
        if (grades.length === 0) continue; // no thematic grades this semester → skip
        const avg = clampRaw100(grades.reduce((s, v) => s + v, 0) / grades.length);
        let row = byStudentSemesterKey.get(`${student.id}:${semester}`);
        if (row) {
          await summaryGradeRepo().update(row.id, { grade: avg });
        } else {
          row = summaryGradeRepo().create({
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
        }
        retainedIds.add(row.id);
        count++;
      }
    }

    const obsolete = existing.filter(row => row.student && activeStudentIds.has(row.student.id) && !retainedIds.has(row.id));
    if (obsolete.length) await summaryGradeRepo().delete(obsolete.map(row => row.id));
    return { count, semesters };
  });
  logger.info("[semester-grading] Recomputed semester grades", { classId, ...result });
  return result;
}
