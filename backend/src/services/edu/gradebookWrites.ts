import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../data-source";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { EduGrade } from "../../entities/EduGrade";
import { EduTask } from "../../entities/EduTask";
import { TopicTask } from "../../entities/TopicTask";
import { HttpError } from "../../utils/httpError";
import { lockClassActor, lockStudentActor, type EduLifecycleActor } from "./lifecycleAccess";

/** Serialize gradebook mutations with class access changes and archive/restore. */
export function withGradebookWrite<T>(classId: number, actor: EduLifecycleActor, write: (manager: EntityManager, cls: Class) => Promise<T>): Promise<T> {
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const cls = await lockClassActor(manager, classId, actor, "GRADE_EDIT");
    return write(manager, cls);
  });
}

/** Teacher grading and learner resubmission share the learner lock. */
export async function withStudentGradeWrite<T>(studentId: number, classId: number, actor: EduLifecycleActor, write: (manager: EntityManager, student: Student) => Promise<T>): Promise<T> {
  const snapshot = await AppDataSource.getRepository(Student).findOne({ where: { id: studentId, class: { id: classId } }, withDeleted: true });
  if (!snapshot) throw new HttpError(403, "STUDENT_NOT_IN_CLASS");
  return AppDataSource.transaction("READ COMMITTED", async manager => {
    const locked = await lockStudentActor(manager, studentId, actor, "GRADE_EDIT");
    if (locked.deletedAt) throw new HttpError(409, "STUDENT_ARCHIVED");
    const student = await manager.getRepository(Student).findOne({ where: { id: studentId, class: { id: classId } }, relations: ["class"] });
    if (!student) throw new HttpError(409, "SUBMISSION_CHANGED");
    return write(manager, student);
  });
}

export async function withGradeWrite<T>(gradeId: number, actor: EduLifecycleActor, write: (manager: EntityManager, grade: EduGrade) => Promise<T>): Promise<T> {
  const snapshot = await AppDataSource.getRepository(EduGrade).findOne({ where: { id: gradeId }, withDeleted: true, relations: ["student", "student.class"] });
  if (!snapshot?.student?.class) throw new HttpError(404, "GRADE_NOT_FOUND");
  return withStudentGradeWrite(snapshot.student.id, snapshot.student.class.id, actor, async manager => {
    const repo = manager.getRepository(EduGrade);
    if (!await repo.findOne({ where: { id: gradeId }, lock: { mode: "pessimistic_write" } })) throw new HttpError(404, "GRADE_NOT_FOUND");
    const grade = await repo.findOne({ where: { id: gradeId }, relations: ["student", "student.class", "task", "task.lesson", "topicTask", "topicTask.controlWork"] });
    if (!grade?.student || grade.student.id !== snapshot.student.id || grade.student.class.id !== snapshot.student.class.id) throw new HttpError(409, "SUBMISSION_CHANGED");
    if (grade.task && !await manager.getRepository(EduTask).findOneBy({ id: grade.task.id, lesson: { class: { id: grade.student.class.id } } })) throw new HttpError(409, "GRADE_CONTEXT_CHANGED");
    if (grade.topicTask && !await manager.getRepository(TopicTask).findOneBy({ id: grade.topicTask.id, topic: { class: { id: grade.student.class.id } } })) throw new HttpError(409, "GRADE_CONTEXT_CHANGED");
    return write(manager, grade);
  });
}

/** The API accepts raw 0–100 numbers; display normalization must never repair a write. */
export function requireRawGrade(value: unknown): number {
  if (value === undefined) throw new HttpError(400, "GRADE_REQUIRED");
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) throw new HttpError(400, "INVALID_GRADE");
  return Math.round(value);
}

export function requireGradebookId(value: unknown, message = "INVALID_ID"): number {
  if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !/^[1-9]\d*$/.test(value))) throw new HttpError(400, message);
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, message);
  return id;
}
