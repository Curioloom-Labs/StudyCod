import { Router, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { TopicNew } from "../../entities/TopicNew";
import { ControlWork } from "../../entities/ControlWork";
import { TopicTask } from "../../entities/TopicTask";
import { LessonAttempt } from "../../entities/LessonAttempt";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType, validateAssessmentType } from "../../types/AssessmentType";
import { saveControlSummaryGradeForNewSystemWithManager } from "../../services/edu/controlWorkGrading";
import { logger } from "../../utils/logger";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const lessonAttemptRepo = () => AppDataSource.getRepository(LessonAttempt);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const lessonIdParamSchema = z.coerce.number().int().positive();

const quizSubmitBodySchema = z.object({
  answers: z.union([
    z.array(z.any()).max(250),
    z.record(z.string(), z.any()).refine(v => Object.keys(v).length <= 500)
  ])
});

router.get("/lessons/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    logger.debug("[GET /edu/lessons/:id] Looking for lesson", { requestId: req.requestId, principalId: req.principalId, id, type: (req.query as any)?.type });

    const requestedTypeRaw = Array.isArray((req.query as any)?.type)
      ? String((req.query as any).type[0] || "")
      : String((req.query as any)?.type || "");
    const requestedType = requestedTypeRaw.toUpperCase().trim();

    let classIdScope: number | null = null;
    let isSystemAdmin = false;

    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: { id: req.studentId },
        relations: ["class"]
      });

      if (!student || !student.class) {
        return res.status(404).json({
          message: "STUDENT_NOT_IN_CLASS"
        });
      }

      classIdScope = student.class.id;
    } else if (req.userId) {
      const user = await userRepo().findOne({
        where: { id: req.userId }
      });

      if (!user) return res.status(404).json({
        message: "USER_NOT_FOUND"
      });

      isSystemAdmin = user.role === "SYSTEM_ADMIN";
    }

    let controlWorkQb = controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("controlWork.id = :id", { id });

    if (classIdScope) {
      controlWorkQb = controlWorkQb.andWhere("class.id = :classIdScope", {
        classIdScope
      });
    } else if (req.userId && !isSystemAdmin) {
      controlWorkQb = controlWorkQb.andWhere("teacher.id = :teacherId", {
        teacherId: req.userId
      });
    }

    const controlWork = requestedType === "TOPIC" ? null : await controlWorkQb.getOne();

    if (controlWork) {
      logger.debug("[GET /edu/lessons/:id] Found control work", {
        requestId: req.requestId,
        principalId: req.principalId,
        controlWorkId: controlWork.id,
        title: controlWork.title || `Контрольна робота #${controlWork.id}`,
      });

      if (req.studentId) {
        const student = await studentRepo().findOne({
          where: { id: req.studentId },
          relations: ["class"]
        });

        if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      } else if (req.userId) {
        const user = await userRepo().findOne({
          where: { id: req.userId }
        });

        if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
          return res.status(403).json({
            message: "ONLY_TEACHERS_CAN_VIEW_LESSONS"
          });
        }

        if (controlWork.topic.class && controlWork.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      }

      let controlTasks = await topicTaskRepo()
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.controlWork", "controlWork")
        .where("task.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
        .andWhere("task.type = :controlType", { controlType: "CONTROL" })
        .orderBy("task.order", "ASC")
        .getMany();

      logger.debug("[GET /edu/lessons/:id] Control work tasks fetched", { requestId: req.requestId, controlWorkId: controlWork.id, count: controlTasks.length });
      controlTasks = controlTasks.filter(t => t.type === "CONTROL");

      logger.debug("[GET /edu/lessons/:id] Final control tasks", {
        requestId: req.requestId,
        controlWorkId: controlWork.id,
        tasks: controlTasks.map(t => ({
          id: t.id,
          title: t.title,
          type: t.type,
          controlWorkId: t.controlWork?.id,
        })),
      });

      if (controlTasks.length === 0) {
        const allTopicTasks = await topicTaskRepo()
          .createQueryBuilder("task")
          .leftJoinAndSelect("task.controlWork", "controlWork")
          .where("task.topic_id = :topicId", { topicId: controlWork.topic.id })
          .getMany();

        logger.warn("[GET /edu/lessons/:id] No control tasks found for control work", {
          requestId: req.requestId,
          controlWorkId: controlWork.id,
          topicId: controlWork.topic.id,
          tasks: allTopicTasks.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type,
            controlWorkId: t.controlWork?.id,
          })),
        });
      }

      let quizSubmitted: boolean | undefined = undefined;
      let quizGrade: number | null | undefined = undefined;
      let quizReview: any | null | undefined = undefined;
      let studentControlProgress:
        | {
            totalTasks: number;
            completedTasks: number;
            currentTaskOrder: number | null;
            unlockedTaskIds: number[];
            reviewAvailable: boolean;
          }
        | undefined = undefined;

      const latestGradeByTaskId = new Map<number, EduGrade>();

      if (req.studentId) {
        const sg = await summaryGradeRepo()
          .createQueryBuilder("sg")
          .where("sg.student_id = :studentId", { studentId: req.studentId })
          .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
          .getOne();

        if (sg) {
          quizSubmitted = !!(sg.quizAnswersJson || sg.theoryGrade !== null);
          quizGrade = sg.theoryGrade === null ? null : clampGradeToInt(sg.theoryGrade);
          if (sg.quizResultsJson) {
            try {
              quizReview = JSON.parse(sg.quizResultsJson);
            } catch (e) {
              quizReview = null;
            }
          }
        } else {
          quizSubmitted = false;
          quizGrade = null;
          quizReview = null;
        }

        const controlTaskIds = controlTasks.map(t => t.id);
        if (controlTaskIds.length > 0) {
          const allGrades = await gradeRepo()
            .createQueryBuilder("g")
            .leftJoinAndSelect("g.topicTask", "topicTask")
            .where("g.student_id = :studentId", { studentId: req.studentId })
            .andWhere("g.topic_task_id IN (:...taskIds)", { taskIds: controlTaskIds })
            .orderBy("g.created_at", "DESC")
            .getMany();

          for (const g of allGrades) {
            const tid = (g as any).topicTask?.id;
            if (!tid || latestGradeByTaskId.has(tid)) continue;
            latestGradeByTaskId.set(tid, g);
          }
        }

        const hasTheoryGate = !!controlWork.hasTheory;
        const theoryGatePassed = !hasTheoryGate || quizSubmitted === true;
        const completedTasks = controlTasks.filter(t => {
          const g = latestGradeByTaskId.get(t.id);
          return !!g && g.total !== null && Number.isFinite(Number(g.total));
        }).length;

        let currentTaskOrder: number | null = null;
        const unlockedTaskIds: number[] = [];

        if (theoryGatePassed) {
          const firstIncompleteIndex = controlTasks.findIndex(t => {
            const g = latestGradeByTaskId.get(t.id);
            return !(g && g.total !== null && Number.isFinite(Number(g.total)));
          });

          if (firstIncompleteIndex === -1) {
            for (const t of controlTasks) unlockedTaskIds.push(t.id);
          } else {
            unlockedTaskIds.push(controlTasks[firstIncompleteIndex].id);
            currentTaskOrder = firstIncompleteIndex + 1;
          }
        }

        studentControlProgress = {
          totalTasks: controlTasks.length,
          completedTasks,
          currentTaskOrder,
          unlockedTaskIds,
          reviewAvailable: theoryGatePassed && completedTasks === controlTasks.length
        };
      }

      const lessonResponse = {
        lesson: {
          id: controlWork.id,
          title: controlWork.title || `Контрольна робота #${controlWork.id}`,
          description: controlWork.topic.description || null,
          order: controlWork.topic.order,
          language: controlWork.topic.language,
          type: "CONTROL",
          hasTheory: controlWork.hasTheory || false,
          controlHasTheory: controlWork.hasTheory || false,
          controlHasPractice: controlWork.hasPractice !== false,
          hasPractice: controlWork.hasPractice !== false,
          timeLimitMinutes: controlWork.timeLimitMinutes || null,
          deadline: controlWork.deadline ? controlWork.deadline.toISOString() : null,
          quizJson: controlWork.quizJson || null,
          quizSubmitted,
          quizGrade,
          quizReview,
          studentControlProgress,
          tasks: controlTasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            template: task.template,
            maxAttempts: task.maxAttempts,
            deadline: task.deadline ? task.deadline.toISOString() : null,
            isClosed: task.isClosed,
            isAssigned: task.isAssigned || false,
            type: task.type,
            order: task.order,
            hasGrade: (() => {
              if (!req.studentId) return false;
              const g = latestGradeByTaskId.get(task.id);
              return !!g && g.total !== null && Number.isFinite(Number(g.total));
            })(),
            grade: (() => {
              if (!req.studentId) return undefined;
              const g = latestGradeByTaskId.get(task.id);
              if (!g || g.total === null || !Number.isFinite(Number(g.total))) return undefined;
              return {
                id: g.id,
                total: clampGradeToInt(Number(g.total)),
                testsPassed: Number(g.testsPassed || 0),
                testsTotal: Number(g.testsTotal || 0),
                isCompleted: g.isCompleted === true
              };
            })()
          })),
          tasksCount: controlTasks.length,
          createdAt: controlWork.createdAt.toISOString()
        }
      };

      logger.debug("[GET /edu/lessons/:id] Returning control work", {
        requestId: req.requestId,
        controlWorkId: controlWork.id,
        tasksCount: controlTasks.length,
        tasks: lessonResponse.lesson.tasks.map(t => ({ id: t.id, title: t.title, type: t.type })),
      });

      return res.json(lessonResponse);
    }

    let topicQb = topicRepo()
      .createQueryBuilder("topic")
      .leftJoinAndSelect("topic.tasks", "task")
      .leftJoinAndSelect("topic.class", "class")
      .leftJoinAndSelect("class.teacher", "teacher")
      .where("topic.id = :id", { id });

    if (classIdScope) {
      topicQb = topicQb.andWhere("class.id = :classIdScope", { classIdScope });
    } else if (req.userId && !isSystemAdmin) {
      topicQb = topicQb.andWhere("teacher.id = :teacherId", { teacherId: req.userId });
    }

    const topic = requestedType === "CONTROL" ? null : await topicQb.getOne();

    if (topic) {
      logger.debug("[GET /edu/lessons/:id] Found topic", { requestId: req.requestId, principalId: req.principalId, topicId: topic.id, title: topic.title });

      if (req.studentId) {
        const student = await studentRepo().findOne({
          where: { id: req.studentId },
          relations: ["class"]
        });

        if (!student || !student.class || student.class.id !== topic.class?.id) {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      } else if (req.userId) {
        const user = await userRepo().findOne({
          where: { id: req.userId }
        });

        if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
          return res.status(403).json({
            message: "ONLY_TEACHERS_CAN_VIEW_LESSONS"
          });
        }

        if (topic.class && topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      }

      const practiceTasks = (topic.tasks || []).filter(t => t.type === "PRACTICE" && t.isAssigned);

      const topicControlWorks = await controlWorkRepo()
        .createQueryBuilder("cw")
        .leftJoinAndSelect("cw.topic", "topic")
        .where("topic.id = :topicId", { topicId: topic.id })
        .andWhere("cw.is_assigned = :isAssigned", { isAssigned: true })
        .orderBy("cw.created_at", "ASC")
        .getMany();

      const controlWorks = await Promise.all(topicControlWorks.map(async cw => {
        const controlTasksCount = await topicTaskRepo().count({
          where: {
            controlWork: { id: cw.id } as any,
            type: "CONTROL" as any
          } as any
        });

        let studentGrade: number | null = null;
        let studentStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED";

        if (req.studentId) {
          const sg = await summaryGradeRepo()
            .createQueryBuilder("sg")
            .where("sg.student_id = :studentId", { studentId: req.studentId })
            .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId: cw.id })
            .andWhere("sg.assessment_type = :type", { type: AssessmentType.CONTROL })
            .getOne();

          if (sg) {
            studentGrade = clampGradeToInt(sg.grade);
          }

          const attempt = await lessonAttemptRepo()
            .createQueryBuilder("attempt")
            .where("attempt.control_work_id = :controlWorkId", { controlWorkId: cw.id })
            .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
            .orderBy("attempt.started_at", "DESC")
            .getOne();

          if (attempt) {
            studentStatus = attempt.status;
          }
        }

        return {
          id: cw.id,
          title: cw.title || `Контрольна робота #${cw.id}`,
          timeLimitMinutes: cw.timeLimitMinutes || null,
          deadline: cw.deadline ? cw.deadline.toISOString() : null,
          tasksCount: controlTasksCount,
          hasTheory: cw.hasTheory || false,
          hasPractice: cw.hasPractice !== false,
          quizJson: cw.quizJson || null,
          studentGrade,
          studentStatus
        };
      }));

      return res.json({
        lesson: {
          id: topic.id,
          title: topic.title,
          description: topic.description || null,
          order: topic.order,
          language: topic.language,
          type: "TOPIC",
          controlWorks,
          tasks: practiceTasks.map(task => ({
            id: task.id,
            title: task.title,
            description: task.description,
            template: task.template,
            maxAttempts: task.maxAttempts,
            deadline: task.deadline ? task.deadline.toISOString() : null,
            isClosed: task.isClosed,
            isAssigned: task.isAssigned || false,
            type: task.type,
            order: task.order
          })),
          tasksCount: practiceTasks.length,
          createdAt: topic.createdAt.toISOString()
        }
      });
    }

    if (requestedType === "CONTROL") {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (requestedType === "TOPIC") {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }

    return res.status(404).json({
      message: "LESSON_NOT_FOUND"
    });
  } catch (error: any) {
    logger.error("[edu/lessons] Error getting lesson", { requestId: req.requestId, principalId: req.principalId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/lessons/:id/control-work-status", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_VIEW_STATUS"
      });
    }

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("controlWork.id = :id", { id })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class"]
    });

    if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }

    const attempt = await lessonAttemptRepo()
      .createQueryBuilder("attempt")
      .where("attempt.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
      .orderBy("attempt.started_at", "DESC")
      .getOne();

    if (!attempt) {
      return res.json({
        status: "NOT_STARTED",
        timeLimitMinutes: controlWork.timeLimitMinutes || null
      });
    }

    const hasTheoryPart = !!controlWork.hasTheory;
    const hasPracticePart = controlWork.hasPractice !== false;

    let testCompleted = true;
    let hasTheoryEvidence = false;

    if (hasTheoryPart) {
      const sg = await summaryGradeRepo()
        .createQueryBuilder("sg")
        .where("sg.student_id = :studentId", { studentId: req.studentId })
        .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
        .andWhere("sg.theory_grade IS NOT NULL")
        .getOne();

      testCompleted = !!sg;
      hasTheoryEvidence = !!sg;
    }

    let practiceCompleted = true;
    let hasPracticeEvidence = false;

    if (hasPracticePart) {
      const controlTasks = await topicTaskRepo()
        .createQueryBuilder("task")
        .where("task.topic_id = :topicId", { topicId: controlWork.topic.id })
        .andWhere("task.type = :controlType", { controlType: "CONTROL" })
        .andWhere("task.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
        .getMany();

      for (const task of controlTasks) {
        const grade = await gradeRepo()
          .createQueryBuilder("grade")
          .where("grade.student_id = :studentId", { studentId: req.studentId })
          .andWhere("grade.topic_task_id = :taskId", { taskId: task.id })
          .andWhere("grade.total IS NOT NULL")
          .getOne();

        if (grade) {
          hasPracticeEvidence = true;
        } else {
          practiceCompleted = false;
        }
      }
    }

    const fullyCompleted = testCompleted && practiceCompleted;
    const hasAnyEvidence = hasTheoryEvidence || hasPracticeEvidence;

    let actualStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = attempt.status;

    if (attempt.status === "COMPLETED" && !fullyCompleted && !hasAnyEvidence) {
      await lessonAttemptRepo().remove(attempt);
      return res.json({
        status: "NOT_STARTED",
        timeLimitMinutes: controlWork.timeLimitMinutes || null
      });
    }

    if (attempt.status === "IN_PROGRESS" && fullyCompleted) {
      actualStatus = "COMPLETED";
      attempt.status = "COMPLETED";
      attempt.finishedAt = new Date();
      await lessonAttemptRepo().save(attempt);
    }

    return res.json({
      status: actualStatus,
      startedAt: attempt.startedAt.toISOString(),
      timeLimitMinutes: attempt.timeLimitMinutes,
      finishedAt: attempt.finishedAt ? attempt.finishedAt.toISOString() : null
    });
  } catch (error: any) {
    logger.error("[edu/lessons] Error getting control work status", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/lessons/:id/attempt-status", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_VIEW_STATUS"
      });
    }

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("controlWork.id = :id", { id })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }

    if (!controlWork.topic) {
      return res.status(404).json({
        message: "CONTROL_WORK_TOPIC_NOT_FOUND"
      });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class"]
    });

    if (!student || !student.class || !controlWork.topic.class || student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }

    const attempt = await lessonAttemptRepo()
      .createQueryBuilder("attempt")
      .where("attempt.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
      .andWhere("attempt.status = :status", { status: "IN_PROGRESS" })
      .orderBy("attempt.started_at", "DESC")
      .getOne();

    if (!attempt) {
      return res.json({
        hasActiveAttempt: false,
        remainingSeconds: 0,
        timeLimitMinutes: controlWork.timeLimitMinutes || null,
        status: "NOT_STARTED"
      });
    }

    const elapsedSeconds = Math.floor((new Date().getTime() - attempt.startedAt.getTime()) / 1000);
    const totalSeconds = attempt.timeLimitMinutes * 60;
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

    return res.json({
      hasActiveAttempt: attempt.status === "IN_PROGRESS" && remainingSeconds > 0,
      remainingSeconds: remainingSeconds,
      startedAt: attempt.startedAt.toISOString(),
      timeLimitMinutes: attempt.timeLimitMinutes,
      status: attempt.status,
      finishedAt: attempt.finishedAt ? attempt.finishedAt.toISOString() : null
    });
  } catch (error: any) {
    logger.error("[edu/lessons] Error getting attempt status", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/lessons/:id/start-attempt", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const idParsed = lessonIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    const id = idParsed.data;

    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_START_ATTEMPT"
      });
    }

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("controlWork.id = :id", { id })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class"]
    });

    if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }

    const existingAttempt = await lessonAttemptRepo()
      .createQueryBuilder("attempt")
      .where("attempt.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
      .andWhere("attempt.status = :status", { status: "IN_PROGRESS" })
      .getOne();

    if (existingAttempt) {
      const elapsedSeconds = Math.floor((new Date().getTime() - existingAttempt.startedAt.getTime()) / 1000);
      const totalSeconds = existingAttempt.timeLimitMinutes * 60;
      const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);

      return res.json({
        attemptId: existingAttempt.id,
        startedAt: existingAttempt.startedAt.toISOString(),
        timeLimitMinutes: existingAttempt.timeLimitMinutes,
        remainingSeconds: remainingSeconds
      });
    }

    const completedAttempt = await lessonAttemptRepo()
      .createQueryBuilder("attempt")
      .where("attempt.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
      .andWhere("attempt.status = :status", { status: "COMPLETED" })
      .getOne();

    if (completedAttempt) {
      return res.status(409).json({
        message: "CONTROL_WORK_COMPLETED"
      });
    }

    if (!controlWork.timeLimitMinutes) {
      return res.status(400).json({
        message: "CONTROL_WORK_HAS_NO_TIME_LIMIT"
      });
    }

    const attempt = lessonAttemptRepo().create({
      controlWork: controlWork,
      student: student,
      startedAt: new Date(),
      timeLimitMinutes: controlWork.timeLimitMinutes,
      status: "IN_PROGRESS"
    });

    await lessonAttemptRepo().save(attempt);

    return res.json({
      attemptId: attempt.id,
      startedAt: attempt.startedAt.toISOString(),
      timeLimitMinutes: attempt.timeLimitMinutes,
      remainingSeconds: attempt.timeLimitMinutes * 60
    });
  } catch (error: any) {
    logger.error("[edu/lessons] Error starting attempt", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/lessons/:id/submit-quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const idParsed = lessonIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    const id = idParsed.data;

    const bodyParsed = quizSubmitBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      return res.status(400).json({
        message: "ANSWERS_REQUIRED"
      });
    }

    const { answers } = bodyParsed.data;
    const answerAt = (idx: number): any => {
      if (Array.isArray(answers)) return answers[idx];
      return (answers as Record<string, any>)[String(idx)];
    };

    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_SUBMIT_QUIZ"
      });
    }

    const controlWork = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .leftJoinAndSelect("topic.class", "class")
      .where("controlWork.id = :id", { id })
      .getOne();

    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }

    if (!controlWork.quizJson) {
      return res.status(400).json({
        message: "CONTROL_WORK_HAS_NO_QUIZ"
      });
    }

    const student = await studentRepo().findOne({
      where: { id: req.studentId },
      relations: ["class"]
    });

    if (!student || !student.class || !controlWork.topic.class || student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }

    const existingSummaryGrade = await summaryGradeRepo()
      .createQueryBuilder("sg")
      .where("sg.student_id = :studentId", { studentId: req.studentId })
      .andWhere("sg.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .getOne();

    if (existingSummaryGrade && (Boolean(existingSummaryGrade.quizAnswersJson) || existingSummaryGrade.theoryGrade !== null)) {
      return res.status(409).json({
        message: "QUIZ_ALREADY_SUBMITTED"
      });
    }

    let quiz: any[];
    try {
      quiz = JSON.parse(controlWork.quizJson);
    } catch (e) {
      return res.status(400).json({
        message: "INVALID_QUIZ_FORMAT"
      });
    }

    if (!Array.isArray(quiz) || quiz.length === 0) {
      return res.status(400).json({
        message: "INVALID_QUIZ_FORMAT"
      });
    }

    let correctAnswers = 0;
    const totalQuestions = quiz.length;
    const reviewQuestions: any[] = [];

    for (let i = 0; i < quiz.length; i++) {
      const question = quiz[i];
      const studentAnswer = answerAt(i);
      const correctAnswer = question.correct;

      let normalizedCorrect: string;
      if (typeof correctAnswer === "number") {
        normalizedCorrect = ["А", "Б", "В", "Г", "Д"][correctAnswer] || "А";
      } else {
        normalizedCorrect = String(correctAnswer).toUpperCase();
      }

      const normalizedStudent = String(studentAnswer || "").toUpperCase().trim();
      const isCorrect = normalizedStudent === normalizedCorrect;

      if (isCorrect) {
        correctAnswers++;
      }

      const rawOptions = Array.isArray(question.options) ? {
        А: question.options[0] || "",
        Б: question.options[1] || "",
        В: question.options[2] || "",
        Г: question.options[3] || "",
        Д: question.options[4] || ""
      } : question.options || {
        А: "",
        Б: "",
        В: "",
        Г: "",
        Д: ""
      };

      reviewQuestions.push({
        index: i,
        question: question.question || question.q || "",
        options: rawOptions,
        correct: normalizedCorrect,
        student: normalizedStudent || null,
        isCorrect
      });
    }

    const theoryGrade = Math.round(correctAnswers / totalQuestions * 100);

    let summaryGrade = existingSummaryGrade || null;
    if (!summaryGrade) {
      const finalGrade = theoryGrade;

      summaryGrade = summaryGradeRepo().create({
        student: student,
        class: student.class,
        controlWork: controlWork,
        topic: controlWork.topic,
        name: controlWork.title || `Контрольна робота #${controlWork.id}`,
        assessmentType: AssessmentType.CONTROL,
        theoryGrade: theoryGrade === null ? null : clampGradeToInt(theoryGrade),
        grade: clampGradeToInt(finalGrade),
        formulaSnapshot: controlWork.formula || null,
        calculatedAt: new Date()
      });

      validateAssessmentType(AssessmentType.CONTROL, controlWork.id, "grade");
    } else {
      summaryGrade.theoryGrade = theoryGrade === null ? null : clampGradeToInt(theoryGrade);
      summaryGrade.grade = clampGradeToInt(theoryGrade);
      summaryGrade.formulaSnapshot = controlWork.formula || null;
      summaryGrade.calculatedAt = new Date();
    }

    try {
      summaryGrade.quizAnswersJson = JSON.stringify(answers);
      summaryGrade.quizResultsJson = JSON.stringify({
        version: 1,
        correctAnswers,
        totalQuestions,
        questions: reviewQuestions
      });
    } catch (e) {
      logger.warn("[edu/lessons] Failed to persist quiz review JSON", { requestId: req.requestId, studentId: req.studentId, controlWorkId: controlWork.id, err: e });
    }

    await summaryGradeRepo().save(summaryGrade);

    try {
      await AppDataSource.transaction("SERIALIZABLE", async manager => {
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWork.id, req.studentId!, clampGradeToInt(theoryGrade));
      });
    } catch (e) {
      logger.error("[edu/lessons] Failed to recalculate control work summary grade after quiz submit", { requestId: req.requestId, studentId: req.studentId, controlWorkId: controlWork.id, err: e });
    }

    let isFullyCompleted = true;

    if (controlWork.hasPractice) {
      const controlTasks = await topicTaskRepo()
        .createQueryBuilder("task")
        .where("task.topic_id = :topicId", { topicId: controlWork.topic.id })
        .andWhere("task.type = :controlType", { controlType: "CONTROL" })
        .andWhere("task.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
        .getMany();

      for (const task of controlTasks) {
        const grade = await gradeRepo()
          .createQueryBuilder("grade")
          .where("grade.student_id = :studentId", { studentId: req.studentId })
          .andWhere("grade.topic_task_id = :taskId", { taskId: task.id })
          .andWhere("grade.total IS NOT NULL")
          .getOne();

        if (!grade) {
          isFullyCompleted = false;
          break;
        }
      }
    }

    const attempt = await lessonAttemptRepo()
      .createQueryBuilder("attempt")
      .where("attempt.control_work_id = :controlWorkId", { controlWorkId: controlWork.id })
      .andWhere("attempt.student_id = :studentId", { studentId: req.studentId })
      .andWhere("attempt.status = :status", { status: "IN_PROGRESS" })
      .orderBy("attempt.started_at", "DESC")
      .getOne();

    if (attempt && isFullyCompleted) {
      attempt.status = "COMPLETED";
      attempt.finishedAt = new Date();
      await lessonAttemptRepo().save(attempt);
    }

    return res.json({
      message: "Quiz submitted successfully",
      grade: {
        id: summaryGrade.id,
        theoryGrade: theoryGrade,
        correctAnswers: correctAnswers,
        totalQuestions: totalQuestions
      },
      review: {
        version: 1,
        correctAnswers,
        totalQuestions,
        questions: reviewQuestions
      }
    });
  } catch (error: any) {
    logger.error("[edu/lessons] Error submitting quiz", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
