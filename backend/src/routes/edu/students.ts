import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { User } from "../../entities/User";
import { Student } from "../../entities/Student";
import { TopicNew } from "../../entities/TopicNew";
import { ControlWork } from "../../entities/ControlWork";
import { TopicTask } from "../../entities/TopicTask";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { logger } from "../../utils/logger";
import { isAssignedToStudent } from "../../utils/assignmentVisibility";
import { extractTimezoneFromProfileMeta } from "../../utils/profileTimezone";
import { DEFAULT_GRADING_SYSTEM } from "../../types/GradingSystem";
import { normalizeScaleMode } from "../../utils/gradingScale";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const studentRepo = () => AppDataSource.getRepository(Student);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);

const THEMATIC_CANONICAL_NAME = "THEMATIC";
const CONTROL_TASK_MAX_ATTEMPTS = 3;

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function resolveRequestLocale(req: AuthRequest): "uk" | "en" {
  const explicit = String((req.headers["x-ui-language"] ?? req.headers["x-lang"] ?? "")).toLowerCase().trim();
  if (explicit.startsWith("en")) return "en";
  if (explicit.startsWith("uk")) return "uk";
  const accept = String(req.headers["accept-language"] ?? "").toLowerCase();
  return accept.includes("en") ? "en" : "uk";
}

function isThematicSummaryName(raw: unknown): boolean {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "тематична" || normalized === "thematic";
}

function localizeSummaryName(raw: unknown, locale: "uk" | "en"): string {
  if (isThematicSummaryName(raw) || String(raw ?? "").trim().toUpperCase() === THEMATIC_CANONICAL_NAME) {
    return locale === "en" ? "Thematic" : "Тематична";
  }
  if (String(raw ?? "").trim().toUpperCase() === "SEMESTER") {
    return locale === "en" ? "Semester" : "Семестрова";
  }
  return String(raw ?? "").trim();
}

function resolveTaskMaxAttempts(task: Pick<TopicTask, "type" | "maxAttempts">): number {
  if (task.type === "CONTROL") {
    return CONTROL_TASK_MAX_ATTEMPTS;
  }

  const parsed = Number(task.maxAttempts);
  if (!Number.isFinite(parsed)) {
    return 3;
  }

  return Math.max(1, Math.floor(parsed));
}

router.get("/students/me", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_ACCESS"
      });
    }

    const student = await studentRepo().findOne({
      where: {
        id: req.studentId
      },
      relations: ["class", "class.teacher"]
    });

    if (!student) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }

    res.json({
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        email: student.email,
        class: {
          id: student.class.id,
          name: student.class.name,
          language: student.class.language,
          gradingSystem: student.class.gradingSystem || DEFAULT_GRADING_SYSTEM
        }
      }
    });
  } catch (error: any) {
    logger.error("[edu/students] Error fetching student info", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/students/me/lessons", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    logger.debug("[GET /edu/students/me/lessons] Request received", {
      requestId: req.requestId,
      studentId: req.studentId,
      userId: req.userId,
      userType: req.userType
    });

    if (!req.studentId) {
      logger.debug("[GET /edu/students/me/lessons] No studentId, returning 403", { requestId: req.requestId });
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_ACCESS"
      });
    }

    const student = await studentRepo().findOne({
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });

    if (!student) {
      logger.debug("[GET /edu/students/me/lessons] Student not found", { requestId: req.requestId, studentId: req.studentId });
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }

    if (!student.class) {
      logger.debug("[GET /edu/students/me/lessons] Student has no class", { requestId: req.requestId, studentId: req.studentId });
      return res.status(404).json({
        message: "STUDENT_NOT_IN_CLASS"
      });
    }

    const classDeadlineTimezone = extractTimezoneFromProfileMeta(student.class.teacher?.timezone ?? null);

    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .leftJoinAndSelect("topic.tasks", "task", "task.type = :practiceType AND task.is_assigned = :assigned", {
        practiceType: "PRACTICE",
        assigned: true
      })
      .where("topic.class_id = :classId", {
        classId: student.class.id
      })
      .orderBy("topic.order", "ASC")
      .addOrderBy("topic.created_at", "ASC")
      .getMany();

    const controlWorks = await controlWorkRepo()
      .createQueryBuilder("controlWork")
      .leftJoinAndSelect("controlWork.topic", "topic")
      .where("topic.class_id = :classId", {
        classId: student.class.id
      })
      .andWhere("controlWork.is_assigned = :isAssigned", {
        isAssigned: true
      })
      .orderBy("controlWork.created_at", "ASC")
      .getMany();

    const visibleControlWorks = controlWorks.filter(controlWork =>
      isAssignedToStudent(controlWork.isAssigned, (controlWork as any).assignedStudentIds, req.studentId!)
    );

    for (const controlWork of visibleControlWorks) {
      let controlTasks = await topicTaskRepo()
        .createQueryBuilder("task")
        .leftJoinAndSelect("task.controlWork", "controlWork")
        .where("task.control_work_id = :controlWorkId", {
          controlWorkId: controlWork.id
        })
        .andWhere("task.type = :controlType", {
          controlType: "CONTROL"
        })
        .orderBy("task.order", "ASC")
        .getMany();

      logger.debug("[GET /edu/students/me/lessons] Control work tasks", {
        requestId: req.requestId,
        studentId: req.studentId,
        controlWorkId: controlWork.id,
        controlTasksCount: controlTasks.length,
      });
      controlTasks = controlTasks.filter(t => {
        if (t.type !== "CONTROL") return false;
        if (t.isAssigned) {
          return isAssignedToStudent(t.isAssigned, (t as any).assignedStudentIds, req.studentId!);
        }
        return isAssignedToStudent(true, (controlWork as any).assignedStudentIds, req.studentId!);
      });
      controlWork.topic.tasks = controlTasks;
    }

    logger.debug("[GET /edu/students/me/lessons] Lessons fetched", {
      requestId: req.requestId,
      studentId: req.studentId,
      classId: student.class.id,
      topicsCount: topics.length,
      controlWorksCount: visibleControlWorks.length,
    });

    const topicsWithGrades = await Promise.all(topics.map(async topic => {
      const tasks = (topic.tasks || []).filter(t =>
        t.type === "PRACTICE" && isAssignedToStudent(t.isAssigned, (t as any).assignedStudentIds, req.studentId!)
      );

      const tasksWithGrades = await Promise.all(tasks.map(async task => {
        const grades = await gradeRepo()
          .createQueryBuilder("grade")
          .leftJoinAndSelect("grade.topicTask", "topicTask")
          .where("grade.student_id = :studentId", {
            studentId: req.studentId
          })
          .andWhere("grade.topic_task_id = :taskId", {
            taskId: task.id
          })
          .orderBy("grade.created_at", "DESC")
          .getMany();

        const latestGrade = grades.length > 0 ? grades[0] : null;
        let parsedTestResults = null;

        if (latestGrade?.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            logger.warn("[edu/students] Failed to parse testResults JSON", {
              requestId: req.requestId,
              studentId: req.studentId,
              gradeId: latestGrade.id,
              err: e,
            });
            parsedTestResults = null;
          }
        }

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          template: task.template,
          maxAttempts: resolveTaskMaxAttempts(task),
          deadline: task.deadline,
          deadlineTimezone: classDeadlineTimezone,
          isClosed: task.isClosed,
          isAssigned: task.isAssigned || false,
          type: task.type,
          order: task.order,
          grade: latestGrade ? {
            id: latestGrade.id,
            total: latestGrade.total,
            testsPassed: latestGrade.testsPassed,
            testsTotal: latestGrade.testsTotal,
            isCompleted: latestGrade.isCompleted === true,
            submittedCode: latestGrade.submittedCode,
            testResults: parsedTestResults
          } : null
        };
      }));

      return {
        id: topic.id,
        title: topic.title,
        description: topic.description || null,
        order: topic.order,
        language: topic.language,
        type: "TOPIC",
        deadlineTimezone: classDeadlineTimezone,
        tasks: tasksWithGrades,
        tasksCount: tasksWithGrades.length,
        createdAt: topic.createdAt.toISOString()
      };
    }));

    const controlWorksWithGrades = await Promise.all(visibleControlWorks.map(async controlWork => {
      const topic = controlWork.topic;
      const tasks = topic.tasks || [];

      const tasksWithGrades = await Promise.all(tasks.map(async task => {
        const grades = await gradeRepo()
          .createQueryBuilder("grade")
          .leftJoinAndSelect("grade.topicTask", "topicTask")
          .where("grade.student_id = :studentId", {
            studentId: req.studentId
          })
          .andWhere("grade.topic_task_id = :taskId", {
            taskId: task.id
          })
          .orderBy("grade.created_at", "DESC")
          .getMany();

        const latestGrade = grades.length > 0 ? grades[0] : null;
        let parsedTestResults = null;

        if (latestGrade?.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            logger.warn("[edu/students] Failed to parse testResults JSON", {
              requestId: req.requestId,
              studentId: req.studentId,
              gradeId: latestGrade.id,
              err: e,
            });
            parsedTestResults = null;
          }
        }

        return {
          id: task.id,
          title: task.title,
          description: task.description,
          template: task.template,
          maxAttempts: resolveTaskMaxAttempts(task),
          deadline: task.deadline || controlWork.deadline,
          deadlineTimezone: classDeadlineTimezone,
          isClosed: task.isClosed,
          isAssigned: task.isAssigned || false,
          type: task.type,
          order: task.order,
          grade: latestGrade ? {
            id: latestGrade.id,
            total: latestGrade.total,
            testsPassed: latestGrade.testsPassed,
            testsTotal: latestGrade.testsTotal,
            isCompleted: latestGrade.isCompleted === true,
            submittedCode: latestGrade.submittedCode,
            testResults: parsedTestResults
          } : null
        };
      }));

      return {
        id: controlWork.id,
        title: controlWork.title || `Контрольна робота #${controlWork.id}`,
        description: topic.description || null,
        order: topic.order,
        language: topic.language,
        type: "CONTROL",
        parentTopicId: topic.id,
        parentTopicTitle: topic.title,
        hasTheory: controlWork.hasTheory || false,
        hasPractice: controlWork.hasPractice !== false,
        timeLimitMinutes: controlWork.timeLimitMinutes || null,
        deadline: controlWork.deadline,
        deadlineTimezone: classDeadlineTimezone,
        quizJson: controlWork.quizJson || null,
        tasks: tasksWithGrades,
        tasksCount: tasksWithGrades.length,
        createdAt: controlWork.createdAt.toISOString()
      };
    }));

    const allLessons = [...topicsWithGrades, ...controlWorksWithGrades].sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    res.json({
      lessons: allLessons
    });
  } catch (error: any) {
    logger.error("[edu/students] Error fetching student lessons", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/students/:studentId/grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const locale = resolveRequestLocale(req);

    if (isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_STUDENT_ID"
      });
    }

    if (req.studentId && req.studentId !== studentId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }

    const targetStudent = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class", "class.teacher"]
    });

    if (!targetStudent) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }

    if (!req.studentId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });

      if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
        return res.status(403).json({
          message: "ONLY_TEACHERS_CAN_VIEW_OTHER_STUDENTS"
        });
      }

      if (!targetStudent.class || !targetStudent.class.teacher || targetStudent.class.teacher.id !== user.id) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }

    const allGrades = await gradeRepo()
      .createQueryBuilder("grade")
      .leftJoinAndSelect("grade.task", "task")
      .leftJoinAndSelect("grade.topicTask", "topicTask")
      .leftJoinAndSelect("topicTask.topic", "topic")
      .leftJoinAndSelect("topicTask.controlWork", "topicTaskControlWork")
      .leftJoinAndSelect("task.lesson", "lesson")
      .where("grade.student_id = :studentId", {
        studentId
      })
      .orderBy("grade.created_at", "DESC")
      .getMany();

    logger.debug("[GET /edu/students/:studentId/grades] grades fetched", { requestId: req.requestId, studentId, gradesCount: allGrades.length });

    const gradesByTask = new Map<number, any>();
    const gradesByTopicTask = new Map<number, any>();

    for (const grade of allGrades) {
      if (grade.task) {
        const taskId = grade.task.id;
        if (!gradesByTask.has(taskId)) {
          gradesByTask.set(taskId, grade);
        }
      } else if (grade.topicTask) {
        const topicTaskId = grade.topicTask.id;
        if (!gradesByTopicTask.has(topicTaskId)) {
          gradesByTopicTask.set(topicTaskId, grade);
        }
      }
    }

    const grades = Array.from(gradesByTask.values())
      .concat(Array.from(gradesByTopicTask.values()))
      .map(grade => {
        let parsedTestResults = null;
        if (grade.testResults) {
          try {
            parsedTestResults = JSON.parse(grade.testResults);
          } catch (e) {
            logger.warn("[edu/students] Failed to parse testResults JSON", { requestId: req.requestId, studentId, gradeId: grade.id, err: e });
            parsedTestResults = null;
          }
        }

        return {
          id: grade.id,
          total: grade.total,
          testsPassed: grade.testsPassed,
          testsTotal: grade.testsTotal,
          feedback: grade.feedback,
          isManuallyGraded: grade.isManuallyGraded,
          submittedCode: grade.submittedCode,
          testResults: parsedTestResults,
          createdAt: grade.createdAt,
          task: grade.task ? {
            id: grade.task.id,
            title: grade.task.title,
            lesson: grade.task.lesson ? {
              id: grade.task.lesson.id,
              title: grade.task.lesson.title,
              type: grade.task.lesson.type,
              theory: grade.task.lesson.theory || null
            } : null
          } : null,
          topicTask: grade.topicTask ? {
            id: grade.topicTask.id,
            title: grade.topicTask.title,
            topicId: grade.topicTask.topic?.id,
            topicTitle: grade.topicTask.topic?.title,
            controlWorkId: grade.topicTask.controlWork?.id ?? null,
            controlWorkTitle: grade.topicTask.controlWork?.title ?? null
          } : null
        };
      });

    const summaryGrades = await summaryGradeRepo().find({
      where: {
        student: {
          id: studentId
        } as any
      },
      relations: ["controlWork", "class", "topic"],
      order: {
        createdAt: "DESC"
      }
    });

    res.json({
      grades,
      gradingSystem: targetStudent.class?.gradingSystem || DEFAULT_GRADING_SYSTEM,
      gradeScaleMode: normalizeScaleMode(targetStudent.class?.gradeScaleMode),
      summaryGrades: summaryGrades.map(sg => ({
        id: sg.id,
        name: localizeSummaryName(sg.name, locale),
        grade: clampGradeToInt(sg.grade),
        assessmentType: sg.assessmentType,
        theoryGrade: sg.theoryGrade === null ? null : clampGradeToInt(sg.theoryGrade),
        controlWorkId: sg.controlWork?.id,
        controlWorkTitle: sg.controlWork?.title,
        topicId: sg.topic?.id ?? null,
        topicTitle: sg.topic?.title ?? null,
        semester: sg.semester ?? null,
        formulaSnapshot: sg.formulaSnapshot,
        calculatedAt: sg.calculatedAt,
        createdAt: sg.createdAt
      }))
    });
  } catch (error: any) {
    logger.error("[edu/students] Error fetching student grades", { requestId: req.requestId, studentId: req.studentId, error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
