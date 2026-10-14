import { In, type EntityManager } from "typeorm";
import { EduTask } from "../../entities/EduTask";
import { EduGrade } from "../../entities/EduGrade";
import { ManualSubmission } from "../../entities/ManualSubmission";
import { AppDataSource } from "../../data-source";
import { EduLesson } from "../../entities/EduLesson";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { Student } from "../../entities/Student";
import { QuizAttempt } from "../../entities/QuizAttempt";
import { TestData } from "../../entities/TestData";

export async function assertCourseAssessmentReady(lesson: EduLesson, manager: EntityManager) {
  const unavailable = () => { throw Object.assign(new Error("ASSESSMENT_NOT_READY"), { statusCode: 409 }); };
  if (lesson.controlHasTheory) {
    try {
      const quiz = JSON.parse(lesson.quizJson || "null");
      const questions = Array.isArray(quiz) ? quiz.filter(item => item && String(item.q ?? item.question ?? "").trim() && item.options && Object.keys(item.options).length) : quiz?.questions;
      if (!Array.isArray(questions) || !questions.length) unavailable();
    } catch { unavailable(); }
  }
  if (lesson.controlHasPractice === false) return;
  const tasks = await manager.getRepository(EduTask).find({ where: { lesson: { id: lesson.id } } });
  if (!tasks.length || tasks.some(task => task.isClosed || task.deadline && new Date() > task.deadline)) unavailable();
  const codeIds = tasks.filter(task => task.taskMode === "CODE").map(task => task.id);
  if (!codeIds.length) return;
  const rows = await manager.getRepository(TestData).createQueryBuilder("test").select("test.task_id", "taskId")
    .addSelect("COUNT(*)", "count").where("test.task_id IN (:...ids)", { ids: codeIds }).groupBy("test.task_id").getRawMany();
  const configured = new Set(rows.filter(row => Number(row.count) > 0).map(row => Number(row.taskId)));
  if (codeIds.some(id => !configured.has(id))) unavailable();
}

export function courseAttemptState(attempt: LessonAttempt | null, now = Date.now()) {
  if (!attempt) return { status: "NOT_STARTED" as const, remainingSeconds: null, startedAt: null };
  const limit = Number(attempt.timeLimitMinutes);
  const remainingSeconds = limit > 0 ? Math.max(0, Math.ceil((attempt.startedAt.getTime() + limit * 60_000 - now) / 1000)) : null;
  const completed = attempt.status === "COMPLETED" || attempt.isFinished || remainingSeconds === 0;
  const end = limit > 0 ? attempt.startedAt.getTime() + limit * 60000 : null;
  const finishedAt = attempt.finishedAt?.getTime() ?? (remainingSeconds === 0 ? end : null);
  return {
    status: completed ? "COMPLETED" as const : "IN_PROGRESS" as const,
    remainingSeconds,
    startedAt: attempt.startedAt.toISOString(),
    attemptId: attempt.id,
    timeLimitMinutes: limit,
    finishedAt: finishedAt != null ? new Date(finishedAt).toISOString() : null,
    reason: completed ? (end != null && finishedAt != null && finishedAt >= end ? "TIME_EXPIRED" as const : "FINISHED" as const) : null,
  };
}

export async function getCourseLessonAttempt(lessonId: number, studentId: number, manager?: EntityManager) {
  const repo = manager ? manager.getRepository(LessonAttempt) : AppDataSource.getRepository(LessonAttempt);
  return repo.findOne({ where: { lesson: { id: lessonId }, student: { id: studentId } }, order: { startedAt: "DESC" } });
}

export async function startCourseLessonAttempt(lesson: EduLesson, studentId: number) {
  return AppDataSource.transaction("SERIALIZABLE", async manager => {
    // Serialize starts and submissions for this student; reloading cannot reset the clock.
    await manager.createQueryBuilder(Student, "student").setLock("pessimistic_write")
      .where("student.id = :studentId", { studentId }).getOne();
    const current = await manager.getRepository(EduLesson).findOne({ where: { id: lesson.id }, lock: { mode: "pessimistic_write" } });
    if (!current) throw Object.assign(new Error("LESSON_NOT_FOUND"), { statusCode: 404 });
    const existing = await getCourseLessonAttempt(lesson.id, studentId, manager);
    if (existing) {
      const state = courseAttemptState(existing);
      if (state.status === "COMPLETED") throw Object.assign(new Error("CONTROL_WORK_COMPLETED"), { statusCode: 409 });
      return state;
    }
    await assertCourseAssessmentReady(current, manager);
    const repo = manager.getRepository(LessonAttempt);
    const attempt = repo.create({ lesson, student: { id: studentId }, startedAt: new Date(),
      timeLimitMinutes: Math.max(0, current.timeLimitMinutes || 0), status: "IN_PROGRESS", isFinished: false });
    const saved = await repo.save(attempt);
    // MySQL datetime columns store seconds; return the persisted clock on the first start too.
    return courseAttemptState(await getCourseLessonAttempt(lesson.id, studentId, manager) ?? saved);
  });
}

export async function assertCourseLessonActive(lesson: EduLesson, studentId: number, manager?: EntityManager) {
  if (lesson.type !== "CONTROL") return;
  const state = courseAttemptState(await getCourseLessonAttempt(lesson.id, studentId, manager));
  if (state.status !== "IN_PROGRESS") throw Object.assign(new Error(state.status === "NOT_STARTED" ? "ATTEMPT_NOT_STARTED" : "CONTROL_WORK_COMPLETED"), { statusCode: 403 });
}

export async function assertCoursePracticeActive(lesson: EduLesson, studentId: number, manager?: EntityManager) {
  await assertCourseLessonActive(lesson, studentId, manager);
  if (lesson.type !== "CONTROL" || !lesson.controlHasTheory) return;
  const repo = manager ? manager.getRepository(QuizAttempt) : AppDataSource.getRepository(QuizAttempt);
  if (!await repo.findOne({ where: { lesson: { id: lesson.id }, student: { id: studentId } } })) {
    throw Object.assign(new Error("QUIZ_REQUIRED"), { statusCode: 403 });
  }
}


export function buildCourseControlReport(lesson: Pick<EduLesson, "controlHasTheory" | "controlHasPractice">,
  tasks: EduTask[], grades: EduGrade[], submissions: ManualSubmission[], quiz: QuizAttempt | null, completed: boolean) {
  const latest = new Map<number, EduGrade>();
  for (const grade of grades) if (grade.task?.id && !latest.has(grade.task.id)) latest.set(grade.task.id, grade);
  const submittedIds = new Set(submissions.map(item => item.taskId ?? item.task?.id));
  const practiceTasks = lesson.controlHasPractice === false ? [] : tasks;
  const items = practiceTasks.map(task => {
    const grade = latest.get(task.id);
    const submitted = Boolean(grade || submittedIds.has(task.id));
    const pending = submitted && task.taskMode === "MANUAL" && !grade?.isManuallyGraded;
    const value = grade?.isManuallyGraded && grade.score != null && Number(grade.maxScore) > 0
      ? Math.round(Number(grade.score) / Number(grade.maxScore) * 100) : grade?.total == null ? null : Number(grade.total);
    return { id: task.id, title: task.title, submitted, pendingReview: pending,
      percent: pending ? null : Number.isFinite(value) ? value : completed ? 0 : null };
  });
  const theoryRequired = lesson.controlHasTheory === true;
  const pendingReview = items.filter(item => item.pendingReview).length + (theoryRequired && quiz?.status === "NEEDS_MANUAL" ? 1 : 0);
  const theoryPercent = theoryRequired ? (quiz?.status === "NEEDS_MANUAL" ? null : quiz?.finalPercent ?? quiz?.autoPercent ?? (completed ? 0 : null)) : null;
  const practicePercent = items.length && !items.some(item => item.percent == null)
    ? Math.round(items.reduce((sum, item) => sum + (item.percent ?? 0), 0) / items.length) : null;
  const values = [...(theoryRequired ? [theoryPercent] : []), ...(items.length ? [practicePercent] : [])];
  return { tasks: items, totalTasks: items.length, submittedTasks: items.filter(item => item.submitted).length,
    missingTaskIds: items.filter(item => !item.submitted).map(item => item.id), quizRequired: theoryRequired,
    quizSubmitted: Boolean(quiz), pendingReview, theoryPercent, practicePercent,
    finalPercent: completed && !pendingReview && values.every(value => value != null)
      ? values.length ? Math.round(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length) : 0 : null };
}

export async function getCourseControlSnapshot(lesson: EduLesson, studentId: number, manager?: EntityManager) {
  const repo = <T extends import("typeorm").ObjectLiteral>(entity: import("typeorm").EntityTarget<T>) =>
    manager ? manager.getRepository(entity) : AppDataSource.getRepository(entity);
  const tasks = lesson.tasks ?? await repo(EduTask).find({ where: { lesson: { id: lesson.id } }, order: { id: "ASC" } });
  const taskIds = tasks.map(task => task.id);
  const [attempt, quiz, grades, submissions] = await Promise.all([
    getCourseLessonAttempt(lesson.id, studentId, manager),
    repo(QuizAttempt).findOne({ where: { lesson: { id: lesson.id }, student: { id: studentId } } }),
    taskIds.length ? repo(EduGrade).find({ where: { task: { id: In(taskIds) }, student: { id: studentId } }, relations: ["task"], order: { createdAt: "DESC", id: "DESC" } }) : Promise.resolve([]),
    taskIds.length ? repo(ManualSubmission).find({ where: { task: { id: In(taskIds) }, student: { id: studentId } } }) : Promise.resolve([]),
  ]);
  const state = courseAttemptState(attempt);
  return { attempt: state, report: buildCourseControlReport(lesson, tasks, grades, submissions, quiz, state.status === "COMPLETED") };
}

export async function finishCourseLessonAttempt(lessonId: number, studentId: number) {
  return AppDataSource.transaction("SERIALIZABLE", async manager => {
    const student = await manager.createQueryBuilder(Student, "student").leftJoinAndSelect("student.class", "class")
      .setLock("pessimistic_write").where("student.id = :studentId", { studentId }).getOne();
    const lesson = await manager.getRepository(EduLesson).findOne({ where: { id: lessonId }, relations: ["class", "tasks"] });
    if (!lesson || lesson.type !== "CONTROL") throw Object.assign(new Error("CONTROL_WORK_NOT_FOUND"), { statusCode: 404 });
    if (!student?.class || student.class.id !== lesson.class?.id) throw Object.assign(new Error("ACCESS_DENIED"), { statusCode: 403 });
    const attempt = await getCourseLessonAttempt(lessonId, studentId, manager);
    if (!attempt) throw Object.assign(new Error("ATTEMPT_NOT_STARTED"), { statusCode: 409 });
    if (attempt.status !== "COMPLETED" || !attempt.isFinished) {
      const state = courseAttemptState(attempt);
      attempt.status = "COMPLETED";
      attempt.isFinished = true;
      attempt.finishedAt = state.status === "COMPLETED" && state.finishedAt ? new Date(state.finishedAt) : new Date();
      await manager.getRepository(LessonAttempt).save(attempt);
    }
    return getCourseControlSnapshot(lesson, studentId, manager);
  });
}


/** Load a bounded roster page in four queries rather than one snapshot per student. */
export async function getCourseControlSnapshots(lesson: EduLesson, studentIds: number[]) {
  if (!studentIds.length) return new Map<number, Awaited<ReturnType<typeof getCourseControlSnapshot>>>();
  const tasks = lesson.tasks ?? await AppDataSource.getRepository(EduTask).find({ where: { lesson: { id: lesson.id } }, order: { id: "ASC" } });
  const ids = In(studentIds);
  const taskIds = tasks.map(task => task.id);
  const [attempts, quizzes, grades, submissions] = await Promise.all([
    AppDataSource.getRepository(LessonAttempt).find({ where: { lesson: { id: lesson.id }, student: { id: ids } }, relations: ["student"], order: { startedAt: "DESC", id: "DESC" } }),
    AppDataSource.getRepository(QuizAttempt).find({ where: { lesson: { id: lesson.id }, student: { id: ids } } }),
    taskIds.length ? AppDataSource.getRepository(EduGrade).find({ where: { task: { id: In(taskIds) }, student: { id: ids } }, relations: ["task", "student"], order: { createdAt: "DESC", id: "DESC" } }) : Promise.resolve([]),
    taskIds.length ? AppDataSource.getRepository(ManualSubmission).find({ where: { task: { id: In(taskIds) }, student: { id: ids } } }) : Promise.resolve([]),
  ]);
  return new Map(studentIds.map(studentId => {
    const state = courseAttemptState(attempts.find(attempt => attempt.student?.id === studentId) ?? null);
    return [studentId, { attempt: state, report: buildCourseControlReport(lesson, tasks,
      grades.filter(grade => grade.student?.id === studentId), submissions.filter(submission => submission.studentId === studentId),
      quizzes.find(quiz => quiz.studentId === studentId) ?? null, state.status === "COMPLETED") }];
  }));
}
