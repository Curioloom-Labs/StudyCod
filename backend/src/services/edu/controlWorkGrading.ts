import { EntityManager } from "typeorm";
import { ControlWork } from "../../entities/ControlWork";
import { EduGrade } from "../../entities/EduGrade";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { TopicTask } from "../../entities/TopicTask";
import { AssessmentType, validateAssessmentType } from "../../types/AssessmentType";
import { evaluateFormula, FormulaVariables } from "../../utils/safeFormulaEvaluator";
import { logger } from "../../utils/logger";

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(12, Math.round(n)));
}

async function calculateControlGradeForNewSystemWithManager(
  manager: EntityManager,
  controlWorkId: number,
  studentId: number
): Promise<{
  finalGrade: number;
  theoryGrade: number | null;
  averageTaskGrade: number;
  formulaSnapshot: string | null;
} | null> {
  const controlWork = await manager
    .createQueryBuilder(ControlWork, "cw")
    .setLock("pessimistic_read")
    .where("cw.id = :controlWorkId", { controlWorkId })
    .leftJoinAndSelect("cw.topic", "topic")
    .leftJoinAndSelect("topic.tasks", "tasks")
    .leftJoinAndSelect("tasks.controlWork", "taskControlWork")
    .getOne();

  if (!controlWork) {
    return null;
  }

  const controlTasks = (controlWork.topic.tasks || []).filter(
    (t: TopicTask) => t.type === "CONTROL" && t.controlWork && t.controlWork.id === controlWork.id
  );

  const taskIds = controlTasks.map((t: TopicTask) => t.id);
  const hasPracticePart = controlWork.hasPractice !== false && taskIds.length > 0;

  let practiceGradedCount = 0;
  let averageTaskGrade = 0;

  if (hasPracticePart) {
    const allTaskGrades = await manager
      .createQueryBuilder(EduGrade, "g")
      .setLock("pessimistic_read")
      .leftJoin("g.student", "student")
      .leftJoin("g.topicTask", "topicTask")
      .where("student.id = :studentId", { studentId })
      .andWhere("topicTask.id IN (:...taskIds)", { taskIds })
      .andWhere("(g.type IS NULL OR g.type = 'PRACTICE')")
      .andWhere("g.total IS NOT NULL")
      .orderBy("g.created_at", "DESC")
      .getMany();

    const latestByTaskId = new Map<number, EduGrade>();
    for (const g of allTaskGrades) {
      const tid = (g as any).topicTask?.id;
      if (!tid) continue;
      if (!latestByTaskId.has(tid)) {
        latestByTaskId.set(tid, g);
      }
    }

    let sum = 0;
    for (const tid of taskIds) {
      const g = latestByTaskId.get(tid);
      const v = g && g.total !== null && Number.isFinite(Number(g.total)) ? Number(g.total) : null;
      if (v === null) continue;
      practiceGradedCount++;
      sum += v;
    }

    averageTaskGrade = practiceGradedCount > 0 ? sum / practiceGradedCount : 0;
  }

  const summaryGrade = await manager
    .createQueryBuilder(SummaryGrade, "sg")
    .setLock("pessimistic_read")
    .where("sg.student.id = :studentId", { studentId })
    .andWhere("sg.controlWork.id = :controlWorkId", { controlWorkId })
    .getOne();

  let theoryGrade: number | null = null;
  if (summaryGrade && summaryGrade.theoryGrade !== null) {
    theoryGrade = clampGradeToInt(Number(summaryGrade.theoryGrade));
  }

  const hasTheoryPart = !!controlWork.hasTheory;
  const hasTestGrade = hasTheoryPart && theoryGrade !== null;
  const hasPracticeGrade = hasPracticePart && practiceGradedCount > 0;

  if (!hasTestGrade && !hasPracticeGrade) {
    return null;
  }

  const formulaVariables: FormulaVariables = {
    test: theoryGrade,
    avgPractice: averageTaskGrade
  };

  // Dynamic grading:
  // - if only test exists -> use test
  // - if only practice exists -> use avg(practice)
  // - if both exist -> use configured formula, otherwise default
  const hasCustomFormula = typeof controlWork.formula === "string" && controlWork.formula.trim() !== "";
  const customFormula = hasCustomFormula ? controlWork.formula!.trim() : null;

  let finalGrade: number;
  let formulaSnapshot: string | null;

  if (hasTestGrade && hasPracticeGrade) {
    const formulaToEvaluate = customFormula;
    finalGrade = clampGradeToInt(evaluateFormula(formulaToEvaluate, formulaVariables));
    formulaSnapshot = customFormula ?? "(test + 1.3 * avg(practice)) / 2";
  } else if (hasTestGrade) {
    finalGrade = clampGradeToInt(theoryGrade);
    formulaSnapshot = "test";
  } else {
    finalGrade = clampGradeToInt(averageTaskGrade);
    formulaSnapshot = "avg(practice)";
  }

  return {
    finalGrade,
    theoryGrade,
    averageTaskGrade: clampGradeToInt(averageTaskGrade),
    formulaSnapshot
  };
}

export async function saveControlSummaryGradeForNewSystemWithManager(
  manager: EntityManager,
  controlWorkId: number,
  studentId: number,
  theoryGrade: number | null
): Promise<void> {
  const controlWork = await manager
    .createQueryBuilder(ControlWork, "cw")
    .setLock("pessimistic_read")
    .where("cw.id = :controlWorkId", { controlWorkId })
    .leftJoinAndSelect("cw.topic", "topic")
    .leftJoinAndSelect("topic.class", "class")
    .getOne();

  if (!controlWork) {
    return;
  }

  const gradeData = await calculateControlGradeForNewSystemWithManager(manager, controlWorkId, studentId);

  if (!gradeData) {
    const existingSummaryGrade = await manager
      .createQueryBuilder(SummaryGrade, "sg")
      .setLock("pessimistic_write")
      .where("sg.student.id = :studentId", { studentId })
      .andWhere("sg.controlWork.id = :controlWorkId", { controlWorkId })
      .getOne();

    if (existingSummaryGrade) {
      await manager.remove(SummaryGrade, existingSummaryGrade);
    }

    return;
  }

  const calculatedAt = new Date();
  const summaryGradeRepoManager = manager.getRepository(SummaryGrade);

  let summaryGrade = await manager
    .createQueryBuilder(SummaryGrade, "sg")
    .setLock("pessimistic_write")
    .where("sg.student.id = :studentId", { studentId })
    .andWhere("sg.controlWork.id = :controlWorkId", { controlWorkId })
    .getOne();

  if (summaryGrade) {
    summaryGrade.grade = gradeData.finalGrade;
    if (theoryGrade !== null) {
      summaryGrade.theoryGrade = theoryGrade;
    }
    summaryGrade.formulaSnapshot = gradeData.formulaSnapshot;
    summaryGrade.calculatedAt = calculatedAt;
    await summaryGradeRepoManager.save(summaryGrade);
  } else {
    if (!controlWork.topic.class || !controlWork.topic.class.id) {
      logger.error('[control-work] missing class info', { controlWorkId });
      return;
    }

    summaryGrade = summaryGradeRepoManager.create({
      student: { id: studentId } as any,
      class: { id: controlWork.topic.class.id } as any,
      controlWork: { id: controlWorkId } as any,
      topic: { id: controlWork.topic.id } as any,
      name: controlWork.title || `Контрольна робота #${controlWorkId}`,
      assessmentType: AssessmentType.CONTROL,
      grade: gradeData.finalGrade,
      theoryGrade: theoryGrade,
      formulaSnapshot: gradeData.formulaSnapshot,
      calculatedAt: calculatedAt
    });

    validateAssessmentType(AssessmentType.CONTROL, controlWorkId, "grade");
    await summaryGradeRepoManager.save(summaryGrade);
  }
}

export async function markControlWorkAttemptCompletedIfReadyWithManager(
  manager: EntityManager,
  controlWorkId: number,
  studentId: number
): Promise<void> {
  const controlWork = await manager
    .createQueryBuilder(ControlWork, "cw")
    .setLock("pessimistic_read")
    .where("cw.id = :controlWorkId", { controlWorkId })
    .getOne();

  if (!controlWork) return;

  const hasTheoryPart = !!controlWork.hasTheory;
  const hasPracticePart = controlWork.hasPractice !== false;

  let theoryCompleted = true;
  if (hasTheoryPart) {
    const sg = await manager
      .createQueryBuilder(SummaryGrade, "sg")
      .setLock("pessimistic_read")
      .where("sg.student_id = :studentId", { studentId })
      .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId })
      .andWhere("sg.theory_grade IS NOT NULL")
      .getOne();

    theoryCompleted = !!sg;
  }

  let practiceCompleted = true;
  if (hasPracticePart) {
    const controlTasks = await manager
      .createQueryBuilder(TopicTask, "task")
      .setLock("pessimistic_read")
      .where("task.control_work_id = :controlWorkId", { controlWorkId })
      .andWhere("task.type = :controlType", { controlType: "CONTROL" })
      .getMany();

    const taskIds = controlTasks.map(t => t.id);

    if (taskIds.length > 0) {
      const graded = await manager
        .createQueryBuilder(EduGrade, "g")
        .setLock("pessimistic_read")
        .select("DISTINCT g.topic_task_id", "topic_task_id")
        .where("g.student_id = :studentId", { studentId })
        .andWhere("g.topic_task_id IN (:...taskIds)", { taskIds })
        .andWhere("g.total IS NOT NULL")
        .getRawMany();

      practiceCompleted = graded.length === taskIds.length;
    }
  }

  if (!theoryCompleted || !practiceCompleted) return;

  const attempt = await manager
    .createQueryBuilder(LessonAttempt, "attempt")
    .setLock("pessimistic_write")
    .where("attempt.control_work_id = :controlWorkId", { controlWorkId })
    .andWhere("attempt.student_id = :studentId", { studentId })
    .andWhere("attempt.status = :status", { status: "IN_PROGRESS" })
    .orderBy("attempt.started_at", "DESC")
    .getOne();

  if (attempt) {
    attempt.status = "COMPLETED";
    attempt.finishedAt = new Date();
    await manager.save(LessonAttempt, attempt);
  }
}
