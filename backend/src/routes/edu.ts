import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { Class } from "../entities/Class";
import { Student } from "../entities/Student";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { generateUsername, generatePassword, hashPassword } from "../services/studentCredentialsService";
import { emailService } from "../services/emailService";
import { EduLesson, LessonType } from "../entities/EduLesson";
import { EduTask } from "../entities/EduTask";
import { TestData } from "../entities/TestData";
import { EduGrade } from "../entities/EduGrade";
import { SummaryGrade } from "../entities/SummaryGrade";
import { ControlWork } from "../entities/ControlWork";
import { TopicNew } from "../entities/TopicNew";
import { TopicTask } from "../entities/TopicTask";
import { LessonAttempt } from "../entities/LessonAttempt";
import { TaskTheory } from "../entities/TaskTheory";
import { ClassAnnouncement } from "../entities/ClassAnnouncement";
import { EntityManager } from "typeorm";
import { executeCodeWithInput, compareOutput, filterStderr } from "../services/codeExecutionService";
import { generateTestDataWithAI } from "../services/generateTestDataService";
import { safeAICall } from "../services/ai/safeAICall";
import { generateAlgorithmicHints } from "../services/ai/failureHints";
import { judgeWithSemaphore } from "../services/judgeWorker";
import type { CheckerSpec, JudgeRequest as WorkerJudgeRequest, JudgeResponse as WorkerJudgeResponse } from "../services/judgeWorker/types";
import { JudgeBusyError } from "../services/judgeWorker/Semaphore";
import { JWT_SECRET } from "../config";
import { evaluateFormula, FormulaVariables, validateFormula } from "../utils/safeFormulaEvaluator";
import { AssessmentType, validateAssessmentType } from "../types/AssessmentType";
const eduRouter = Router();
function chooseDefaultCheckerFromExpectedOutputs(outputs: string[]): CheckerSpec {
  const hasFloatLike = outputs.some(s => {
    const v = String(s ?? "");
    return /(^|\s)[-+]?(?:\d*\.\d+|\d+\.\d*)(?:[eE][-+]?\d+)?(\s|$)/.test(v) || /(^|\s)[-+]?\d+(?:[eE][-+]?\d+)(\s|$)/.test(v);
  });
  return hasFloatLike ? {
    type: "float",
    epsilon: 1e-6
  } : {
    type: "whitespace"
  };
}
const userRepo = () => AppDataSource.getRepository(User);
const classRepo = () => AppDataSource.getRepository(Class);
const studentRepo = () => AppDataSource.getRepository(Student);
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const taskRepo = () => AppDataSource.getRepository(EduTask);
const testDataRepo = () => AppDataSource.getRepository(TestData);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
const lessonAttemptRepo = () => AppDataSource.getRepository(LessonAttempt);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const topicTaskRepo = () => AppDataSource.getRepository(TopicTask);
const taskTheoryRepo = () => AppDataSource.getRepository(TaskTheory);
const announcementRepo = () => AppDataSource.getRepository(ClassAnnouncement);
function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(12, Math.round(n)));
}
function normalizeLang(input?: string | null): UserLang {
  const raw = (input || "").toUpperCase().trim();
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}
function disableCache(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}
const registerTeacherSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  language: z.string().optional()
});
eduRouter.post("/register-teacher", async (req: Request, res: Response) => {
  try {
    const validated = registerTeacherSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.errors
      });
    }
    const {
      username,
      email,
      password,
      language
    } = validated.data;
    const existingUser = await userRepo().findOne({
      where: [{
        username
      }, {
        email
      }]
    });
    if (existingUser) {
      return res.status(400).json({
        message: existingUser.username === username ? "USERNAME_ALREADY_EXISTS" : "EMAIL_ALREADY_EXISTS"
      });
    }
    const hash = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const user = userRepo().create({
      username,
      email,
      password: hash,
      lang: normalizeLang(language),
      userMode: "EDUCATIONAL",
      emailVerified: false,
      emailVerificationToken: verificationToken
    });
    await userRepo().save(user);
    emailService.sendVerificationEmail(email, verificationToken, username).catch(err => {
      console.error("[Email Error]:", err);
    });
    res.status(201).json({
      requiresEmailVerification: true
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_CREATE_CLASSES"
      });
    }
    const schema = z.object({
      name: z.string().min(1).max(100),
      language: z.string().optional()
    });
    const validated = schema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const {
      name,
      language
    } = validated.data;
    const cls = classRepo().create({
      teacher: user,
      name,
      language: normalizeLang(language || user.lang)
    });
    await classRepo().save(cls);
    res.status(201).json({
      class: cls
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_CLASSES"
      });
    }
    const classes = await classRepo().find({
      where: {
        teacher: {
          id: user.id
        }
      },
      relations: ["students"],
      order: {
        createdAt: "DESC"
      }
    });
    res.json({
      classes: classes.map(c => ({
        id: c.id,
        name: c.name,
        language: c.language,
        studentsCount: c.students?.length || 0,
        createdAt: c.createdAt
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/students/me", authRequired, async (req: AuthRequest, res: Response) => {
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
      relations: ["class"]
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
          language: student.class.language
        }
      }
    });
  } catch (error: any) {
    console.error("Error fetching student info:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/students/me/lessons", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    console.log("[GET /edu/students/me/lessons] Request received", {
      studentId: req.studentId,
      userId: req.userId,
      userType: req.userType
    });
    if (!req.studentId) {
      console.log("[GET /edu/students/me/lessons] No studentId, returning 403");
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
      console.log(`[GET /edu/students/me/lessons] Student ${req.studentId} not found`);
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (!student.class) {
      console.log(`[GET /edu/students/me/lessons] Student ${req.studentId} has no class`);
      return res.status(404).json({
        message: "STUDENT_NOT_IN_CLASS"
      });
    }
    const topics = await topicRepo().createQueryBuilder("topic").leftJoinAndSelect("topic.tasks", "task", "task.type = :practiceType AND task.is_assigned = :assigned", {
      practiceType: "PRACTICE",
      assigned: true
    }).where("topic.class_id = :classId", {
      classId: student.class.id
    }).orderBy("topic.order", "ASC").addOrderBy("topic.created_at", "ASC").getMany();
    const controlWorks = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").where("topic.class_id = :classId", {
      classId: student.class.id
    }).andWhere("controlWork.is_assigned = :isAssigned", {
      isAssigned: true
    }).orderBy("controlWork.created_at", "ASC").getMany();
    for (const controlWork of controlWorks) {
      let controlTasks = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.controlWork", "controlWork").where("task.control_work_id = :controlWorkId", {
        controlWorkId: controlWork.id
      }).andWhere("task.type = :controlType", {
        controlType: "CONTROL"
      }).orderBy("task.order", "ASC").getMany();
      console.log(`[GET /edu/students/me/lessons] Control work ${controlWork.id} found ${controlTasks.length} control tasks`);
      controlTasks = controlTasks.filter(t => t.type === "CONTROL");
      controlWork.topic.tasks = controlTasks;
    }
    console.log(`[GET /edu/students/me/lessons] Found ${topics.length} topics and ${controlWorks.length} control works for student ${req.studentId} in class ${student.class.id}`);
    const topicsWithGrades = await Promise.all(topics.map(async topic => {
      const tasks = (topic.tasks || []).filter(t => t.type === "PRACTICE");
      const tasksWithGrades = await Promise.all(tasks.map(async task => {
        const grades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.topicTask", "topicTask").where("grade.student_id = :studentId", {
          studentId: req.studentId
        }).andWhere("grade.topic_task_id = :taskId", {
          taskId: task.id
        }).orderBy("grade.created_at", "DESC").getMany();
        const latestGrade = grades.length > 0 ? grades[0] : null;
        let parsedTestResults = null;
        if (latestGrade?.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            console.error("Failed to parse testResults JSON:", e);
            parsedTestResults = null;
          }
        }
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          template: task.template,
          maxAttempts: task.maxAttempts,
          deadline: task.deadline,
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
        tasks: tasksWithGrades,
        tasksCount: tasksWithGrades.length,
        createdAt: topic.createdAt.toISOString()
      };
    }));
    const controlWorksWithGrades = await Promise.all(controlWorks.map(async controlWork => {
      const topic = controlWork.topic;
      const tasks = topic.tasks || [];
      const tasksWithGrades = await Promise.all(tasks.map(async task => {
        const grades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.topicTask", "topicTask").where("grade.student_id = :studentId", {
          studentId: req.studentId
        }).andWhere("grade.topic_task_id = :taskId", {
          taskId: task.id
        }).orderBy("grade.created_at", "DESC").getMany();
        const latestGrade = grades.length > 0 ? grades[0] : null;
        let parsedTestResults = null;
        if (latestGrade?.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            console.error("Failed to parse testResults JSON:", e);
            parsedTestResults = null;
          }
        }
        return {
          id: task.id,
          title: task.title,
          description: task.description,
          template: task.template,
          maxAttempts: task.maxAttempts,
          deadline: task.deadline || controlWork.deadline,
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
    console.error("Error fetching student lessons:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/students/:studentId/grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
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
      const student = await studentRepo().findOne({
        where: {
          id: studentId
        },
        relations: ["class", "class.teacher"]
      });
      if (!student || student.class.teacher.id !== user.id) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    const allGrades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.task", "task").leftJoinAndSelect("grade.topicTask", "topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topicTask.controlWork", "topicTaskControlWork").leftJoinAndSelect("task.lesson", "lesson").where("grade.student_id = :studentId", {
      studentId
    }).orderBy("grade.created_at", "DESC").getMany();
    console.log(`[GET /edu/students/${studentId}/grades] Found ${allGrades.length} grades`);
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
    const grades = Array.from(gradesByTask.values()).concat(Array.from(gradesByTopicTask.values())).map(grade => {
      let parsedTestResults = null;
      if (grade.testResults) {
        try {
          parsedTestResults = JSON.parse(grade.testResults);
        } catch (e) {
          console.error("Failed to parse testResults JSON:", e);
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
      summaryGrades: summaryGrades.map(sg => ({
        id: sg.id,
        name: sg.name,
        grade: clampGradeToInt(sg.grade),
        assessmentType: sg.assessmentType,
        theoryGrade: sg.theoryGrade === null ? null : clampGradeToInt(sg.theoryGrade),
        controlWorkId: sg.controlWork?.id,
        controlWorkTitle: sg.controlWork?.title,
        topicId: sg.topic?.id ?? null,
        topicTitle: sg.topic?.title ?? null,
        formulaSnapshot: sg.formulaSnapshot,
        calculatedAt: sg.calculatedAt,
        createdAt: sg.createdAt
      }))
    });
  } catch (error: any) {
    console.error("Error fetching student grades:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
const studentLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});
eduRouter.post("/student-login", async (req: Request, res: Response) => {
  try {
    const validated = studentLoginSchema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const {
      username,
      password
    } = validated.data;
    const student = await studentRepo().findOne({
      where: {
        generatedUsername: username
      },
      relations: ["class"]
    });
    if (!student || !(await bcrypt.compare(password, student.generatedPassword))) {
      return res.status(401).json({
        message: "INVALID_CREDENTIALS"
      });
    }
    const token = jwt.sign({
      studentId: student.id,
      type: "STUDENT",
      classId: student.class.id
    }, JWT_SECRET, {
      expiresIn: "30d"
    });
    res.json({
      token,
      student: {
        id: student.id,
        username: student.generatedUsername,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName,
        email: student.email,
        classId: student.class.id,
        className: student.class.name,
        language: student.class.language
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/students", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const students = await studentRepo().find({
      where: {
        class: {
          id: classId
        }
      },
      order: {
        lastName: "ASC",
        firstName: "ASC"
      }
    });
    res.json({
      students
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
const announcementCreateSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  content: z.string().min(1),
  pinned: z.boolean().optional()
});
const announcementUpdateSchema = z.object({
  title: z.string().max(255).optional().nullable(),
  content: z.string().min(1).optional(),
  pinned: z.boolean().optional()
});
eduRouter.get("/classes/:classId/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({
      message: "INVALID_CLASS_ID"
    });
    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
        relations: ["class"]
      });
      if (!student || !student.class || student.class.id !== classId) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    } else {
      const cls = await classRepo().findOne({
        where: {
          id: classId
        },
        relations: ["teacher"]
      });
      if (!cls) return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
      if (cls.teacher.id !== req.userId) {
        const user = await userRepo().findOne({
          where: {
            id: req.userId
          }
        });
        if (!user || user.role !== "SYSTEM_ADMIN") {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      }
    }
    const items = await announcementRepo().find({
      where: {
        class: {
          id: classId
        } as any
      },
      relations: ["author"],
      order: {
        pinned: "DESC",
        createdAt: "DESC"
      }
    });
    res.json({
      announcements: items.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        author: {
          id: a.author.id,
          name: `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim() || a.author.username
        }
      }))
    });
  } catch (error) {
    console.error("Error listing announcements:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/students/me/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.studentId) return res.status(403).json({
      message: "ONLY_STUDENTS_CAN_ACCESS"
    });
    const student = await studentRepo().findOne({
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class) return res.status(404).json({
      message: "STUDENT_NOT_FOUND"
    });
    const items = await announcementRepo().find({
      where: {
        class: {
          id: student.class.id
        } as any
      },
      relations: ["author"],
      order: {
        pinned: "DESC",
        createdAt: "DESC"
      },
      take: 50
    });
    res.json({
      class: {
        id: student.class.id,
        name: student.class.name
      },
      announcements: items.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned,
        createdAt: a.createdAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        author: {
          id: a.author.id,
          name: `${a.author.firstName || ""} ${a.author.lastName || ""}`.trim() || a.author.username
        }
      }))
    });
  } catch (error) {
    console.error("Error listing student announcements:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/announcements", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_CREATE_ANNOUNCEMENTS"
      });
    }
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) return res.status(400).json({
      message: "INVALID_CLASS_ID"
    });
    const parsed = announcementCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const cls = await classRepo().findOne({
      where: {
        id: classId
      },
      relations: ["teacher"]
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    if (cls.teacher.id !== req.userId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });
      if (!user || user.role !== "SYSTEM_ADMIN") return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const author = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!author) return res.status(404).json({
      message: "USER_NOT_FOUND"
    });
    const ann = announcementRepo().create({
      class: cls,
      author,
      title: parsed.data.title ?? null,
      content: parsed.data.content,
      pinned: parsed.data.pinned ?? false
    });
    await announcementRepo().save(ann);
    res.status(201).json({
      message: "ANNOUNCEMENT_CREATED",
      id: ann.id
    });
    try {
      const students = await studentRepo().find({
        where: {
          class: {
            id: classId
          } as any
        },
        relations: ["class"]
      });
      const preview = (parsed.data.content || "").slice(0, 240);
      await Promise.allSettled(students.filter(s => !!s.email).map(s => emailService.sendAnnouncementEmail(s.email!, `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.generatedUsername, cls.name, parsed.data.title ?? null, preview)));
    } catch (err) {
      console.error("Failed to send announcement emails:", err);
    }
  } catch (error) {
    console.error("Error creating announcement:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.put("/classes/:classId/announcements/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UPDATE_ANNOUNCEMENTS"
      });
    }
    const classId = parseInt(req.params.classId, 10);
    const id = parseInt(req.params.id, 10);
    if (isNaN(classId) || isNaN(id)) return res.status(400).json({
      message: "INVALID_ID"
    });
    const parsed = announcementUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const ann = await announcementRepo().findOne({
      where: {
        id,
        class: {
          id: classId
        } as any
      },
      relations: ["class", "class.teacher"]
    });
    if (!ann) return res.status(404).json({
      message: "ANNOUNCEMENT_NOT_FOUND"
    });
    if (ann.class.teacher.id !== req.userId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });
      if (!user || user.role !== "SYSTEM_ADMIN") return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if ("title" in parsed.data) ann.title = parsed.data.title ?? null;
    if (parsed.data.content !== undefined) ann.content = parsed.data.content;
    if (parsed.data.pinned !== undefined) ann.pinned = parsed.data.pinned;
    await announcementRepo().save(ann);
    res.json({
      message: "ANNOUNCEMENT_UPDATED"
    });
  } catch (error) {
    console.error("Error updating announcement:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.delete("/classes/:classId/announcements/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.studentId || req.userType === "STUDENT") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_DELETE_ANNOUNCEMENTS"
      });
    }
    const classId = parseInt(req.params.classId, 10);
    const id = parseInt(req.params.id, 10);
    if (isNaN(classId) || isNaN(id)) return res.status(400).json({
      message: "INVALID_ID"
    });
    const ann = await announcementRepo().findOne({
      where: {
        id,
        class: {
          id: classId
        } as any
      },
      relations: ["class", "class.teacher"]
    });
    if (!ann) return res.status(404).json({
      message: "ANNOUNCEMENT_NOT_FOUND"
    });
    if (ann.class.teacher.id !== req.userId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });
      if (!user || user.role !== "SYSTEM_ADMIN") return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    await announcementRepo().remove(ann);
    res.json({
      message: "ANNOUNCEMENT_DELETED"
    });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/students", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const schema = z.object({
      students: z.array(z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        middleName: z.string().optional(),
        email: z.string().email()
      }))
    });
    const validated = schema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const results = [];
    const credentials = [];
    for (const s of validated.data.students) {
      const plainPassword = generatePassword();
      const hashedPassword = await hashPassword(plainPassword);
      const username = generateUsername(s.firstName, s.lastName, s.middleName);
      const student = studentRepo().create({
        firstName: s.firstName,
        lastName: s.lastName,
        middleName: s.middleName,
        email: s.email,
        class: cls,
        generatedUsername: username,
        generatedPassword: hashedPassword
      });
      await studentRepo().save(student);
      results.push(student);
      credentials.push({
        id: student.id,
        firstName: s.firstName,
        lastName: s.lastName,
        middleName: s.middleName || "",
        email: s.email,
        username,
        password: plainPassword
      });
    }
    res.status(201).json({
      count: results.length,
      credentials
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/students/export", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const students = await studentRepo().find({
      where: {
        class: {
          id: classId
        }
      },
      order: {
        lastName: "ASC",
        firstName: "ASC"
      }
    });
    const withPasswordsRaw = Array.isArray((req.query as any)?.withPasswords) ? String((req.query as any).withPasswords[0] || "") : String((req.query as any)?.withPasswords || "");
    const withPasswords = ["1", "true", "yes"].includes(withPasswordsRaw.toLowerCase().trim());
    const csvEscape = (value: unknown) => {
      const s = String(value ?? "");
      return `"${s.replace(/"/g, '""')}"`;
    };
    let csv = `Ім'я,Прізвище,По-батькові,Email,Username,Password\n`;
    if (withPasswords) {
      for (const s of students) {
        const plainPassword = generatePassword();
        s.generatedPassword = await hashPassword(plainPassword);
        await studentRepo().save(s);
        csv += [csvEscape(s.firstName), csvEscape(s.lastName), csvEscape(s.middleName || ""), csvEscape(s.email), csvEscape(s.generatedUsername), csvEscape(plainPassword)].join(",") + "\n";
      }
    } else {
      for (const s of students) {
        csv += [csvEscape(s.firstName), csvEscape(s.lastName), csvEscape(s.middleName || ""), csvEscape(s.email), csvEscape(s.generatedUsername), csvEscape("")].join(",") + "\n";
      }
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=students_class_${classId}.csv`);
    res.send("\uFEFF" + csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/students/import", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const {
      csvData
    } = req.body;
    if (!csvData) return res.status(400).json({
      message: "CSV_DATA_REQUIRED"
    });
    const lines = csvData.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l.length > 0);
    const credentials = [];
    const parseCsvLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === "," && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result.map(v => v.replace(/^\uFEFF/, "").trim());
    };
    const normalizeHeaderKey = (raw: string) => raw.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "").replace(/["']/g, "").replace(/-/g, "");
    const headerCells = parseCsvLine(lines[0]);
    const headerKeys = headerCells.map(normalizeHeaderKey);
    const hasHeader = headerKeys.some(k => k.includes("email") || k.includes("e-mail")) || headerKeys.some(k => k.includes("прізвище") || k.includes("призвище")) || headerKeys.some(k => k.includes("імя") || k.includes("імя") || k.includes("имя")) || headerKeys.some(k => k.includes("firstname") || k.includes("lastname"));
    const colIndex = (variants: string[]) => {
      for (let i = 0; i < headerKeys.length; i++) {
        if (variants.includes(headerKeys[i])) return i;
      }
      return -1;
    };
    const firstNameIdx = colIndex(["імя", "имя", "firstname", "first", "first_name", "firstname"]);
    const lastNameIdx = colIndex(["прізвище", "призвище", "lastname", "last", "last_name", "lastname"]);
    const middleNameIdx = colIndex(["побатькові", "по-батькові", "middlename", "middle", "middle_name", "middlename"]);
    const emailIdx = colIndex(["email", "e-mail"]);
    const usernameIdx = colIndex(["username", "login", "логін", "логин"]);
    const passwordIdx = colIndex(["password", "пароль"]);
    const startIndex = hasHeader ? 1 : 0;
    const ensureUniqueUsername = async (desired: string) => {
      let candidate = desired;
      if (!candidate.trim()) {
        candidate = desired;
      }
      for (let attempt = 0; attempt < 10; attempt++) {
        const exists = await studentRepo().count({
          where: {
            generatedUsername: candidate
          } as any
        });
        if (!exists) return candidate;
        const suffix = crypto.randomBytes(2).toString("hex");
        candidate = `${candidate}_${suffix}`;
      }
      return `${candidate}_${crypto.randomBytes(2).toString("hex")}`;
    };
    for (let i = startIndex; i < lines.length; i++) {
      const parts = parseCsvLine(lines[i]);
      if (parts.length < 3) continue;
      let firstName = "";
      let lastName = "";
      let middleName = "";
      let email = "";
      let username = "";
      let password = "";
      if (hasHeader) {
        firstName = firstNameIdx >= 0 ? parts[firstNameIdx] || "" : "";
        lastName = lastNameIdx >= 0 ? parts[lastNameIdx] || "" : "";
        middleName = middleNameIdx >= 0 ? parts[middleNameIdx] || "" : "";
        email = emailIdx >= 0 ? parts[emailIdx] || "" : "";
        username = usernameIdx >= 0 ? parts[usernameIdx] || "" : "";
        password = passwordIdx >= 0 ? parts[passwordIdx] || "" : "";
      } else {
        firstName = parts[0] || "";
        lastName = parts[1] || "";
        if (parts.length === 3) {
          email = parts[2] || "";
        } else {
          middleName = parts[2] || "";
          email = parts[3] || "";
          username = parts[4] || "";
          password = parts[5] || "";
        }
      }
      if (!email) {
        const emailCandidate = parts.find(p => p.includes("@"));
        if (emailCandidate) email = emailCandidate;
      }
      if (!firstName || !lastName || !email) continue;
      const plainPassword = password?.trim() ? password.trim() : generatePassword();
      const hashedPassword = await hashPassword(plainPassword);
      const generatedBase = generateUsername(firstName, lastName, middleName);
      const finalUsername = await ensureUniqueUsername(username?.trim() ? username.trim() : generatedBase);
      const student = studentRepo().create({
        firstName,
        lastName,
        middleName,
        email,
        class: cls,
        generatedUsername: finalUsername,
        generatedPassword: hashedPassword
      });
      await studentRepo().save(student);
      credentials.push({
        id: student.id,
        firstName,
        lastName,
        middleName: middleName || "",
        email,
        username: finalUsername,
        password: plainPassword
      });
    }
    res.status(201).json({
      count: credentials.length,
      credentials
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/students/:studentId/regenerate-password", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = parseInt(req.params.studentId, 10);
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class", "class.teacher"]
    });
    if (!student || student.class.teacher.id !== req.userId) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    const plainPassword = generatePassword();
    student.generatedPassword = await hashPassword(plainPassword);
    await studentRepo().save(student);
    res.json({
      username: student.generatedUsername,
      password: plainPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/lessons/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    console.log(`[GET /edu/lessons/:id] Looking for lesson with id=${id}`);
    const requestedTypeRaw = Array.isArray((req.query as any)?.type) ? String((req.query as any).type[0] || "") : String((req.query as any)?.type || "");
    const requestedType = requestedTypeRaw.toUpperCase().trim();
    let classIdScope: number | null = null;
    let isSystemAdmin = false;
    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
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
        where: {
          id: req.userId
        }
      });
      if (!user) return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
      isSystemAdmin = user.role === "SYSTEM_ADMIN";
    }
    let controlWorkQb = controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("controlWork.id = :id", {
      id
    });
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
      console.log(`[GET /edu/lessons/:id] Found control work ${controlWork.id} (${controlWork.title || `Контрольна робота #${controlWork.id}`})`);
      if (req.studentId) {
        const student = await studentRepo().findOne({
          where: {
            id: req.studentId
          },
          relations: ["class"]
        });
        if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      } else if (req.userId) {
        const user = await userRepo().findOne({
          where: {
            id: req.userId
          }
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
      let controlTasks = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.controlWork", "controlWork").where("task.control_work_id = :controlWorkId", {
        controlWorkId: controlWork.id
      }).andWhere("task.type = :controlType", {
        controlType: "CONTROL"
      }).orderBy("task.order", "ASC").getMany();
      console.log(`[GET /edu/lessons/:id] Control work ${controlWork.id} found ${controlTasks.length} control tasks`);
      controlTasks = controlTasks.filter(t => t.type === "CONTROL");
      console.log(`[GET /edu/lessons/:id] Final control tasks for CW ${controlWork.id}:`, controlTasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        controlWorkId: t.controlWork?.id
      })));
      if (controlTasks.length === 0) {
        const allTopicTasks = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.controlWork", "controlWork").where("task.topic_id = :topicId", {
          topicId: controlWork.topic.id
        }).getMany();
        console.log(`[GET /edu/lessons/:id] WARNING: No control tasks found! All tasks in topic ${controlWork.topic.id}:`, allTopicTasks.map(t => ({
          id: t.id,
          title: t.title,
          type: t.type,
          controlWorkId: t.controlWork?.id
        })));
      }
      let quizSubmitted: boolean | undefined = undefined;
      let quizGrade: number | null | undefined = undefined;
      let quizReview: any | null | undefined = undefined;
      if (req.studentId) {
        const sg = await summaryGradeRepo().createQueryBuilder("sg").where("sg.student_id = :studentId", {
          studentId: req.studentId
        }).andWhere("sg.control_work_id = :controlWorkId", {
          controlWorkId: controlWork.id
        }).getOne();
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
            order: task.order
          })),
          tasksCount: controlTasks.length,
          createdAt: controlWork.createdAt.toISOString()
        }
      };
      console.log(`[GET /edu/lessons/:id] Returning control work ${controlWork.id} with ${controlTasks.length} tasks:`, lessonResponse.lesson.tasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type
      })));
      return res.json(lessonResponse);
    }
    let topicQb = topicRepo().createQueryBuilder("topic").leftJoinAndSelect("topic.tasks", "task").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topic.id = :id", {
      id
    });
    if (classIdScope) {
      topicQb = topicQb.andWhere("class.id = :classIdScope", {
        classIdScope
      });
    } else if (req.userId && !isSystemAdmin) {
      topicQb = topicQb.andWhere("teacher.id = :teacherId", {
        teacherId: req.userId
      });
    }
    const topic = requestedType === "CONTROL" ? null : await topicQb.getOne();
    if (topic) {
      console.log(`[GET /edu/lessons/:id] Found topic ${topic.id} (${topic.title})`);
      if (req.studentId) {
        const student = await studentRepo().findOne({
          where: {
            id: req.studentId
          },
          relations: ["class"]
        });
        if (!student || !student.class || student.class.id !== topic.class?.id) {
          return res.status(403).json({
            message: "ACCESS_DENIED"
          });
        }
      } else if (req.userId) {
        const user = await userRepo().findOne({
          where: {
            id: req.userId
          }
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
      const topicControlWorks = await controlWorkRepo().createQueryBuilder("cw").leftJoinAndSelect("cw.topic", "topic").where("topic.id = :topicId", {
        topicId: topic.id
      }).andWhere("cw.is_assigned = :isAssigned", {
        isAssigned: true
      }).orderBy("cw.created_at", "ASC").getMany();
      const controlWorks = await Promise.all(topicControlWorks.map(async cw => {
        const controlTasksCount = await topicTaskRepo().count({
          where: {
            controlWork: {
              id: cw.id
            } as any,
            type: "CONTROL" as any
          } as any
        });
        let studentGrade: number | null = null;
        let studentStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" = "NOT_STARTED";
        if (req.studentId) {
          const sg = await summaryGradeRepo().createQueryBuilder("sg").where("sg.student_id = :studentId", {
            studentId: req.studentId
          }).andWhere("sg.control_work_id = :controlWorkId", {
            controlWorkId: cw.id
          }).andWhere("sg.assessment_type = :type", {
            type: AssessmentType.CONTROL
          }).getOne();
          if (sg) {
            studentGrade = clampGradeToInt(sg.grade);
          }
          const attempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
            controlWorkId: cw.id
          }).andWhere("attempt.student_id = :studentId", {
            studentId: req.studentId
          }).orderBy("attempt.started_at", "DESC").getOne();
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
    console.error("Error getting lesson:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/lessons/:id/control-work-status", authRequired, async (req: AuthRequest, res: Response) => {
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
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").where("controlWork.id = :id", {
      id
    }).getOne();
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const attempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).andWhere("attempt.student_id = :studentId", {
      studentId: req.studentId
    }).orderBy("attempt.started_at", "DESC").getOne();
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
      const sg = await summaryGradeRepo().createQueryBuilder("sg").where("sg.student_id = :studentId", {
        studentId: req.studentId
      }).andWhere("sg.control_work_id = :controlWorkId", {
        controlWorkId: controlWork.id
      }).andWhere("sg.theory_grade IS NOT NULL").getOne();
      testCompleted = !!sg;
      hasTheoryEvidence = !!sg;
    }
    let practiceCompleted = true;
    let hasPracticeEvidence = false;
    if (hasPracticePart) {
      const controlTasks = await topicTaskRepo().createQueryBuilder("task").where("task.topic_id = :topicId", {
        topicId: controlWork.topic.id
      }).andWhere("task.type = :controlType", {
        controlType: "CONTROL"
      }).andWhere("task.control_work_id = :controlWorkId", {
        controlWorkId: controlWork.id
      }).getMany();
      for (const task of controlTasks) {
        const grade = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
          studentId: req.studentId
        }).andWhere("grade.topic_task_id = :taskId", {
          taskId: task.id
        }).andWhere("grade.total IS NOT NULL").getOne();
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
    console.error("Error getting control work status:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/lessons/:id/attempt-status", authRequired, async (req: AuthRequest, res: Response) => {
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
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").where("controlWork.id = :id", {
      id
    }).getOne();
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
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || !controlWork.topic.class || student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const attempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).andWhere("attempt.student_id = :studentId", {
      studentId: req.studentId
    }).andWhere("attempt.status = :status", {
      status: "IN_PROGRESS"
    }).orderBy("attempt.started_at", "DESC").getOne();
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
    console.error("Error getting attempt status:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/lessons/:id/start-attempt", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_START_ATTEMPT"
      });
    }
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").where("controlWork.id = :id", {
      id
    }).getOne();
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || student.class.id !== controlWork.topic.class?.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const existingAttempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).andWhere("attempt.student_id = :studentId", {
      studentId: req.studentId
    }).andWhere("attempt.status = :status", {
      status: "IN_PROGRESS"
    }).getOne();
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
    const completedAttempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).andWhere("attempt.student_id = :studentId", {
      studentId: req.studentId
    }).andWhere("attempt.status = :status", {
      status: "COMPLETED"
    }).getOne();
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
    console.error("Error starting attempt:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/lessons/:id/submit-quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const {
      answers
    } = req.body;
    if (!answers || typeof answers !== "object") {
      return res.status(400).json({
        message: "ANSWERS_REQUIRED"
      });
    }
    if (!req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_SUBMIT_QUIZ"
      });
    }
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").where("controlWork.id = :id", {
      id
    }).getOne();
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
      where: {
        id: req.studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || !controlWork.topic.class || student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const existingSummaryGrade = await summaryGradeRepo().createQueryBuilder("sg").where("sg.student_id = :studentId", {
      studentId: req.studentId
    }).andWhere("sg.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).getOne();
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
      const studentAnswer = answers[i] || answers[String(i)];
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
    const theoryGrade = Math.round(correctAnswers / totalQuestions * 12);
    let summaryGrade = existingSummaryGrade || null;
    if (!summaryGrade) {
      let finalGrade = theoryGrade;
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
      validateAssessmentType(AssessmentType.CONTROL, controlWork.id, 'grade');
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
      console.error("Failed to persist quiz review JSON:", e);
    }
    await summaryGradeRepo().save(summaryGrade);
    try {
      await AppDataSource.transaction("SERIALIZABLE", async manager => {
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWork.id, req.studentId!, clampGradeToInt(theoryGrade));
      });
    } catch (e) {
      console.error("Failed to recalculate control work summary grade after quiz submit:", e);
    }
    let isFullyCompleted = true;
    if (controlWork.hasPractice) {
      const controlTasks = await topicTaskRepo().createQueryBuilder("task").where("task.topic_id = :topicId", {
        topicId: controlWork.topic.id
      }).andWhere("task.type = :controlType", {
        controlType: "CONTROL"
      }).andWhere("task.control_work_id = :controlWorkId", {
        controlWorkId: controlWork.id
      }).getMany();
      for (const task of controlTasks) {
        const grade = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
          studentId: req.studentId
        }).andWhere("grade.topic_task_id = :taskId", {
          taskId: task.id
        }).andWhere("grade.total IS NOT NULL").getOne();
        if (!grade) {
          isFullyCompleted = false;
          break;
        }
      }
    }
    const attempt = await lessonAttemptRepo().createQueryBuilder("attempt").where("attempt.control_work_id = :controlWorkId", {
      controlWorkId: controlWork.id
    }).andWhere("attempt.student_id = :studentId", {
      studentId: req.studentId
    }).andWhere("attempt.status = :status", {
      status: "IN_PROGRESS"
    }).orderBy("attempt.started_at", "DESC").getOne();
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
    console.error("Error submitting quiz:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/lessons", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({
        message: "INVALID_CLASS_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_LESSONS"
      });
    }
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: user.id
        }
      }
    });
    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }
    const topics = await topicRepo().createQueryBuilder("topic").leftJoinAndSelect("topic.tasks", "task").where("topic.class_id = :classId", {
      classId
    }).orderBy("topic.order", "ASC").addOrderBy("topic.created_at", "ASC").getMany();
    res.json({
      lessons: topics.map(topic => ({
        id: topic.id,
        title: topic.title,
        description: topic.description || null,
        order: topic.order,
        language: topic.language,
        tasksCount: topic.tasks?.length || 0,
        createdAt: topic.createdAt.toISOString(),
        tasks: (topic.tasks || []).map(task => ({
          id: task.id,
          title: task.title,
          description: task.description || null,
          template: task.template || null,
          deadline: task.deadline ? task.deadline.toISOString() : null,
          maxAttempts: task.maxAttempts || null,
          isClosed: task.isClosed || false,
          isAssigned: task.isAssigned || false,
          type: task.type,
          order: task.order
        }))
      }))
    });
  } catch (error) {
    console.error("Error getting lessons:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/lessons", authRequired, async (req: AuthRequest, res: Response) => {
  const user = await userRepo().findOne({
    where: {
      id: req.userId
    }
  });
  if (!user || user.userMode !== "EDUCATIONAL") {
    return res.status(403).json({
      message: "ONLY_TEACHERS_CAN_CREATE_LESSONS"
    });
  }
  const {
    type,
    title
  } = req.body || {};
  if (!type || !title) {
    return res.status(400).json({
      message: "TYPE_AND_TITLE_REQUIRED"
    });
  }
  const cls = await classRepo().findOne({
    where: {
      id: Number(req.params.classId),
      teacher: {
        id: user.id
      }
    }
  });
  if (!cls) return res.status(404).json({
    message: "CLASS_NOT_FOUND"
  });
  const lesson = lessonRepo().create({
    class: cls,
    type,
    title
  });
  await lessonRepo().save(lesson);
  res.status(201).json({
    lesson
  });
});
eduRouter.post("/lessons/:lessonId/tasks", authRequired, async (req: AuthRequest, res: Response) => {
  const user = await userRepo().findOne({
    where: {
      id: req.userId
    }
  });
  if (!user || user.userMode !== "EDUCATIONAL") {
    return res.status(403).json({
      message: "ONLY_TEACHERS_CAN_CREATE_TASKS"
    });
  }
  const lesson = await lessonRepo().findOne({
    where: {
      id: Number(req.params.lessonId)
    },
    relations: ["class", "class.teacher"]
  });
  if (!lesson || lesson.class.teacher.id !== user.id) {
    return res.status(404).json({
      message: "LESSON_NOT_FOUND"
    });
  }
  const {
    title,
    description,
    template
  } = req.body || {};
  if (!title || !description || !template) {
    return res.status(400).json({
      message: "TITLE_DESCRIPTION_AND_TEMPLATE_REQUIRED"
    });
  }
  const task = taskRepo().create({
    lesson,
    title,
    description,
    template,
    maxAttempts: 1,
    isClosed: false
  });
  await taskRepo().save(task);
  res.status(201).json({
    task
  });
});
eduRouter.get("/tasks/:taskId(\\d+)", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topicTask.controlWork", "controlWork").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
        relations: ["class"]
      });
      if (!student || !student.class || student.class.id !== topicTask.topic.class?.id) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    } else if (req.userId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });
      if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
        return res.status(403).json({
          message: "ONLY_TEACHERS_CAN_VIEW_TASKS"
        });
      }
      if (topicTask.topic.class && topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    let grade = null;
    if (req.studentId) {
      const grades = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
        studentId: req.studentId
      }).andWhere("grade.topic_task_id = :taskId", {
        taskId
      }).orderBy("grade.created_at", "DESC").getMany();
      if (grades.length > 0) {
        const latestGrade = grades[0];
        let parsedTestResults = null;
        if (latestGrade.testResults) {
          try {
            parsedTestResults = JSON.parse(latestGrade.testResults);
          } catch (e) {
            console.error("Failed to parse testResults JSON:", e);
          }
        }
        grade = {
          id: latestGrade.id,
          total: latestGrade.total,
          testsPassed: latestGrade.testsPassed,
          testsTotal: latestGrade.testsTotal,
          isManuallyGraded: latestGrade.isManuallyGraded === true,
          isCompleted: latestGrade.isCompleted === true,
          submittedCode: latestGrade.submittedCode,
          testResults: parsedTestResults
        };
      }
    }
    const testDataCount = await testDataRepo().count({
      where: {
        topicTask: {
          id: taskId
        }
      }
    });
    let lessonType: "TOPIC" | "CONTROL" = "TOPIC";
    let lessonId = topicTask.topic.id;
    let lessonTitle = topicTask.topic.title;
    let hasTheory = false;
    let theory: string | null = null;
    let timeLimitMinutes: number | null = null;
    if (topicTask.type === "CONTROL" && topicTask.controlWork) {
      const controlWork = topicTask.controlWork;
      lessonType = "CONTROL";
      lessonId = controlWork.id;
      lessonTitle = controlWork.title || `Контрольна робота #${controlWork.id}`;
      hasTheory = controlWork.hasTheory || false;
      timeLimitMinutes = controlWork.timeLimitMinutes || null;
    }
    const taskTheory = await taskTheoryRepo().createQueryBuilder("theory").where("theory.topic_task_id = :taskId", {
      taskId
    }).getOne();
    if (taskTheory) {
      hasTheory = true;
      theory = taskTheory.content;
    }
    res.json({
      task: {
        id: topicTask.id,
        title: topicTask.title,
        description: topicTask.description,
        template: topicTask.template,
        maxAttempts: topicTask.maxAttempts,
        deadline: topicTask.deadline ? topicTask.deadline.toISOString() : null,
        isClosed: topicTask.isClosed,
        isAssigned: topicTask.isAssigned || false,
        type: topicTask.type,
        order: topicTask.order,
        testDataCount,
        grade,
        language: topicTask.topic.class?.language || "JAVA",
        lesson: {
          id: lessonId,
          title: lessonTitle,
          type: lessonType,
          hasTheory,
          theory: theory || undefined,
          timeLimitMinutes: timeLimitMinutes || undefined
        }
      }
    });
  } catch (error: any) {
    console.error("Error getting task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/run", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_ACCESS"
      });
    }
    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({
      message: "INVALID_TASK_ID"
    });
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const {
      code,
      input
    } = req.body || {};
    if (!code) return res.status(400).json({
      message: "CODE_REQUIRED"
    });
    if (code.length > 50000) return res.status(400).json({
      message: "CODE_TOO_LARGE"
    });
    if (typeof input === "string" && input.length > 64 * 1024) {
      return res.status(400).json({
        message: "INPUT_TOO_LARGE"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const result = await executeCodeWithInput(code, topicTask.topic.class.language, input || "", 5000);
    res.json({
      output: result.stdout,
      stderr: result.stderr,
      success: result.success
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/submit", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_ACCESS"
      });
    }
    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({
      message: "INVALID_TASK_ID"
    });
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("topicTask.controlWork", "controlWork").leftJoinAndSelect("topicTask.testData", "testData").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if (topicTask.isClosed) return res.status(403).json({
      message: "TASK_IS_CLOSED"
    });
    if (topicTask.deadline && new Date() > new Date(topicTask.deadline)) {
      return res.status(403).json({
        message: "DEADLINE_PASSED"
      });
    }
    const latestExisting = await gradeRepo().createQueryBuilder("grade").where("grade.topic_task_id = :taskId", {
      taskId
    }).andWhere("grade.student_id = :studentId", {
      studentId
    }).orderBy("grade.created_at", "DESC").getOne();
    if (latestExisting && latestExisting.isManuallyGraded) {
      return res.status(409).json({
        message: "TASK_MANUALLY_GRADED_LOCKED"
      });
    }
    if (latestExisting && latestExisting.isCompleted) {
      return res.status(409).json({
        message: "TASK_ALREADY_COMPLETED"
      });
    }
    const existingGradesCount = await gradeRepo().createQueryBuilder("grade").where("grade.topic_task_id = :taskId", {
      taskId
    }).andWhere("grade.student_id = :studentId", {
      studentId
    }).getCount();
    if (existingGradesCount >= topicTask.maxAttempts) {
      return res.status(403).json({
        message: "MAX_ATTEMPTS_REACHED"
      });
    }
    const {
      code
    } = req.body || {};
    if (!code) return res.status(400).json({
      message: "CODE_REQUIRED"
    });
    if (code.length > 50000) return res.status(400).json({
      message: "CODE_TOO_LARGE"
    });
    const tests = [...(topicTask.testData || [])].sort((a, b) => a.id - b.id);
    if (tests.length === 0) {
      return res.status(400).json({
        message: "NO_TESTS_DEFINED_FOR_THIS_TASK"
      });
    }
    let passed = 0;
    const testResults: Array<{
      testId: number;
      input: string;
      actual: string;
      stderr?: string | null;
      passed: boolean;
      verdict?: string | null;
    }> = [];
    const judgeLang = topicTask.topic.class.language === "JAVA" ? "java" : topicTask.topic.class.language === "PYTHON" ? "python" : "cpp";
    const defaultLimitsByLang = {
      java: {
        time_limit_ms: 1200,
        memory_limit_mb: 256,
        output_limit_kb: 64
      },
      python: {
        time_limit_ms: 900,
        memory_limit_mb: 128,
        output_limit_kb: 64
      },
      cpp: {
        time_limit_ms: 800,
        memory_limit_mb: 256,
        output_limit_kb: 64
      }
    } as const;
    const workerReq: WorkerJudgeRequest = {
      submission_id: `edu_${studentId}_${taskId}_${Date.now()}`,
      language: judgeLang,
      source: code,
      tests: tests.map(t => ({
        id: t.id,
        input: t.input || "",
        output: t.expectedOutput || "",
        hidden: t.isHidden === true
      })),
      limits: defaultLimitsByLang[judgeLang],
      checker: chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || "")),
      debug: false,
      run_all: true
    };
    let workerRes: WorkerJudgeResponse | null = null;
    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e) {
      if (e instanceof JudgeBusyError) {
        return res.status(429).json({
          message: "JUDGE_BUSY"
        });
      }
      const allowFallback = process.env.NODE_ENV !== "production" || process.env.JUDGE_ALLOW_FALLBACK === "1" || process.env.JUDGE_ALLOW_FALLBACK === "true";
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[judge] worker failed (edu submit). allowFallback=${allowFallback} submission=${workerReq.submission_id} error=${errMsg}`, e);
      if (!allowFallback) {
        return res.status(503).json({
          message: "JUDGE_UNAVAILABLE"
        });
      }
      for (const t of tests) {
        const r = await executeCodeWithInput(code, topicTask.topic.class.language, t.input, 10000);
        const isPassed = compareOutput(r.stdout, t.expectedOutput);
        if (isPassed) passed++;
        testResults.push({
          testId: t.id,
          input: t.input,
          actual: r.stdout,
          stderr: filterStderr(r.stderr),
          passed: isPassed,
          verdict: null
        });
      }
    }
    if (workerRes) {
      if (workerRes.verdict === "CE" && workerRes.compile) {
        const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        for (const t of tests) {
          if (t.isHidden) continue;
          testResults.push({
            testId: t.id,
            input: t.input || "",
            actual: "",
            stderr: compileErr || "Compilation error",
            passed: false,
            verdict: "CE"
          });
        }
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const isPassed = r?.verdict === "AC";
          if (isPassed) passed++;
          if (t.isHidden) continue;
          testResults.push({
            testId: t.id,
            input: t.input || "",
            actual: r?.actual ?? "",
            stderr: r?.stderr ?? null,
            passed: isPassed,
            verdict: r?.verdict ?? null
          });
        }
      }
    }
    let feedback: string | null = null;
    if (passed < tests.length) {
      try {
        const expectedById = new Map<number, string>();
        for (const t of tests) expectedById.set(t.id, (t.expectedOutput || "").toString());
        const failuresForHints = testResults.filter(r => !r.passed).slice(0, 3).map(r => ({
          testId: r.testId,
          input: r.input || "",
          expected: expectedById.get(r.testId) ?? "",
          actual: r.actual || "",
          verdict: r.verdict ?? undefined,
          stderr: r.stderr ?? null
        }));
        const langForHints = topicTask.topic.class.language === "JAVA" ? "JAVA" : "PYTHON";
        const hints = await generateAlgorithmicHints({
          taskTitle: topicTask.title,
          taskText: topicTask.description,
          language: langForHints,
          code,
          failures: failuresForHints
        });
        if (hints.length) {
          feedback = hints.map(h => `- ${h}`).join("\n");
        }
      } catch {}
    }
    const score = Math.round(passed / tests.length * 12);
    const totalGrade = Math.max(0, Math.min(12, score));
    const grade = gradeRepo().create({
      student: {
        id: studentId
      } as any,
      topicTask,
      total: totalGrade,
      testsPassed: passed,
      testsTotal: tests.length,
      submittedCode: code,
      isManuallyGraded: false,
      feedback,
      testResults: JSON.stringify(testResults)
    });
    await gradeRepo().save(grade);
    if (topicTask.controlWork && topicTask.controlWork.id) {
      try {
        await AppDataSource.transaction("SERIALIZABLE", async manager => {
          await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork!.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork!.id, studentId);
        });
      } catch (e) {
        console.error("Failed to recalculate/complete control work after task submit:", e);
      }
    }
    res.json({
      grade,
      testResults
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/complete", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({
        message: "ONLY_STUDENTS_CAN_ACCESS"
      });
    }
    const studentId = req.studentId;
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) return res.status(400).json({
      message: "INVALID_TASK_ID"
    });
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("topicTask.controlWork", "controlWork").leftJoinAndSelect("topicTask.testData", "testData").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask || !topicTask.topic || !topicTask.topic.class) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if (topicTask.isClosed) return res.status(403).json({
      message: "TASK_IS_CLOSED"
    });
    if (topicTask.deadline && new Date() > new Date(topicTask.deadline)) {
      return res.status(403).json({
        message: "DEADLINE_PASSED"
      });
    }
    const latestExisting = await gradeRepo().createQueryBuilder("grade").where("grade.topic_task_id = :taskId", {
      taskId
    }).andWhere("grade.student_id = :studentId", {
      studentId
    }).orderBy("grade.created_at", "DESC").getOne();
    if (latestExisting && latestExisting.isManuallyGraded) {
      return res.status(409).json({
        message: "TASK_MANUALLY_GRADED_LOCKED"
      });
    }
    if (latestExisting && latestExisting.isCompleted) {
      return res.status(409).json({
        message: "TASK_ALREADY_COMPLETED"
      });
    }
    const existingGradesCount = await gradeRepo().createQueryBuilder("grade").where("grade.topic_task_id = :taskId", {
      taskId
    }).andWhere("grade.student_id = :studentId", {
      studentId
    }).getCount();
    if (existingGradesCount >= topicTask.maxAttempts) {
      return res.status(403).json({
        message: "MAX_ATTEMPTS_REACHED"
      });
    }
    const {
      code
    } = req.body || {};
    if (!code) return res.status(400).json({
      message: "CODE_REQUIRED"
    });
    if (code.length > 50000) return res.status(400).json({
      message: "CODE_TOO_LARGE"
    });
    const tests = [...(topicTask.testData || [])].sort((a, b) => a.id - b.id);
    if (tests.length === 0) {
      return res.status(400).json({
        message: "NO_TESTS_DEFINED_FOR_THIS_TASK"
      });
    }
    let passed = 0;
    const testResults: Array<{
      testId: number;
      input: string;
      actual: string;
      stderr?: string | null;
      passed: boolean;
      verdict?: string | null;
    }> = [];
    const judgeLang = topicTask.topic.class.language === "JAVA" ? "java" : topicTask.topic.class.language === "PYTHON" ? "python" : "cpp";
    const defaultLimitsByLang = {
      java: {
        time_limit_ms: 1200,
        memory_limit_mb: 256,
        output_limit_kb: 64
      },
      python: {
        time_limit_ms: 900,
        memory_limit_mb: 128,
        output_limit_kb: 64
      },
      cpp: {
        time_limit_ms: 800,
        memory_limit_mb: 256,
        output_limit_kb: 64
      }
    } as const;
    const workerReq: WorkerJudgeRequest = {
      submission_id: `edu_complete_${studentId}_${taskId}_${Date.now()}`,
      language: judgeLang,
      source: code,
      tests: tests.map(t => ({
        id: t.id,
        input: t.input || "",
        output: t.expectedOutput || "",
        hidden: t.isHidden === true
      })),
      limits: defaultLimitsByLang[judgeLang],
      checker: chooseDefaultCheckerFromExpectedOutputs(tests.map(t => t.expectedOutput || "")),
      debug: false,
      run_all: true
    };
    let workerRes: WorkerJudgeResponse | null = null;
    try {
      workerRes = await judgeWithSemaphore(workerReq);
    } catch (e) {
      if (e instanceof JudgeBusyError) {
        return res.status(429).json({
          message: "JUDGE_BUSY"
        });
      }
      const allowFallback = process.env.NODE_ENV !== "production" || process.env.JUDGE_ALLOW_FALLBACK === "1" || process.env.JUDGE_ALLOW_FALLBACK === "true";
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error(`[judge] worker failed (edu complete). allowFallback=${allowFallback} submission=${workerReq.submission_id} error=${errMsg}`, e);
      if (!allowFallback) {
        return res.status(503).json({
          message: "JUDGE_UNAVAILABLE"
        });
      }
      for (const t of tests) {
        const r = await executeCodeWithInput(code, topicTask.topic.class.language, t.input, 10000);
        const isPassed = compareOutput(r.stdout, t.expectedOutput);
        if (isPassed) passed++;
        testResults.push({
          testId: t.id,
          input: t.input || "",
          actual: r.stdout,
          stderr: filterStderr(r.stderr),
          passed: isPassed,
          verdict: null
        });
      }
    }
    if (workerRes) {
      if (workerRes.verdict === "CE" && workerRes.compile) {
        const compileErr = [workerRes.compile.stderr, workerRes.compile.stdout].filter(Boolean).join("\n").trim();
        for (const t of tests) {
          if (t.isHidden) continue;
          testResults.push({
            testId: t.id,
            input: t.input || "",
            actual: "",
            stderr: compileErr || "Compilation error",
            passed: false,
            verdict: "CE"
          });
        }
      } else {
        const byId = new Map<string, (typeof workerRes.tests)[number]>();
        for (const r of workerRes.tests) byId.set(String(r.test_id), r);
        for (const t of tests) {
          const r = byId.get(String(t.id));
          const isPassed = r?.verdict === "AC";
          if (isPassed) passed++;
          if (t.isHidden) continue;
          testResults.push({
            testId: t.id,
            input: t.input || "",
            actual: r?.actual ?? "",
            stderr: r?.stderr ?? null,
            passed: isPassed,
            verdict: r?.verdict ?? null
          });
        }
      }
    }
    let feedback: string | null = null;
    if (passed < tests.length) {
      try {
        const expectedById = new Map<number, string>();
        for (const t of tests) expectedById.set(t.id, (t.expectedOutput || "").toString());
        const failuresForHints = testResults.filter(r => !r.passed).slice(0, 3).map(r => ({
          testId: r.testId,
          input: r.input || "",
          expected: expectedById.get(r.testId) ?? "",
          actual: r.actual || "",
          verdict: r.verdict ?? undefined,
          stderr: r.stderr ?? null
        }));
        const langForHints = topicTask.topic.class.language === "JAVA" ? "JAVA" : "PYTHON";
        const hints = await generateAlgorithmicHints({
          taskTitle: topicTask.title,
          taskText: topicTask.description,
          language: langForHints,
          code,
          failures: failuresForHints
        });
        if (hints.length) {
          feedback = hints.map(h => `- ${h}`).join("\n");
        }
      } catch {}
    }
    const score = Math.round(passed / tests.length * 12);
    const totalGrade = Math.max(0, Math.min(12, score));
    const grade = gradeRepo().create({
      student: {
        id: studentId
      } as any,
      topicTask,
      total: totalGrade,
      testsPassed: passed,
      testsTotal: tests.length,
      submittedCode: code,
      isManuallyGraded: false,
      isCompleted: true,
      feedback,
      testResults: JSON.stringify(testResults)
    });
    const saved = await gradeRepo().save(grade);
    if (topicTask.controlWork && topicTask.controlWork.id) {
      try {
        await AppDataSource.transaction("SERIALIZABLE", async manager => {
          await saveControlSummaryGradeForNewSystemWithManager(manager, topicTask.controlWork!.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, topicTask.controlWork!.id, studentId);
        });
      } catch (e) {
        console.error("Failed to recalculate control work grade after task completion:", e);
      }
    }
    return res.json({
      requiresManualReview: false,
      grade: {
        id: saved.id,
        total: saved.total,
        testsPassed: saved.testsPassed,
        testsTotal: saved.testsTotal,
        isManuallyGraded: saved.isManuallyGraded,
        isCompleted: true
      },
      testResults
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    console.log("[POST /tasks/:taskId/grades/:studentId] Request received", {
      taskId: req.params.taskId,
      studentId: req.params.studentId,
      userId: req.userId,
      userType: req.userType
    });
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GRADE"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const {
      total,
      feedback
    } = req.body;
    if (total === undefined || total === null) {
      return res.status(400).json({
        message: "GRADE_REQUIRED"
      });
    }
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0 || total > 12) {
      return res.status(400).json({
        message: "INVALID_GRADE_RANGE"
      });
    }
    const normalizedTotal = clampGradeToInt(total);
    const task = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").leftJoinAndSelect("task.controlWork", "controlWork").where("task.id = :taskId", {
      taskId
    }).getOne();
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (!task.topic.class || task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (!task.topic.class || student.class.id !== task.topic.class.id) {
      return res.status(403).json({
        message: "STUDENT_NOT_IN_CLASS"
      });
    }
    let grade = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
      studentId
    }).andWhere("grade.topic_task_id = :taskId", {
      taskId
    }).orderBy("grade.created_at", "DESC").getOne();
    if (grade) {
      grade.total = normalizedTotal;
      grade.feedback = feedback || null;
      grade.isManuallyGraded = true;
      grade.isCompleted = true;
      await gradeRepo().save(grade);
    } else {
      grade = gradeRepo().create({
        student: student,
        topicTask: task,
        total: normalizedTotal,
        feedback: feedback || null,
        isManuallyGraded: true,
        isCompleted: true,
        testsPassed: 0,
        testsTotal: 0
      });
      await gradeRepo().save(grade);
    }
    res.json({
      message: "GRADE_SAVED",
      grade: {
        id: grade.id,
        total: grade.total,
        feedback: grade.feedback,
        isManuallyGraded: grade.isManuallyGraded
      }
    });
    if (task.controlWork && task.controlWork.id) {
      try {
        await AppDataSource.transaction("SERIALIZABLE", async manager => {
          await saveControlSummaryGradeForNewSystemWithManager(manager, task.controlWork!.id, studentId, null);
          await markControlWorkAttemptCompletedIfReadyWithManager(manager, task.controlWork!.id, studentId);
        });
      } catch (e) {
        console.error("Failed to recalculate control work grade after manual grading:", e);
      }
    }
  } catch (error: any) {
    console.error("[POST /tasks/:taskId/grades/:studentId] Error:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error.message
    });
  }
});
eduRouter.delete("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GRADE"
      });
    }
    if (!req.userId) return res.status(401).json({
      message: "UNAUTHORIZED"
    });
    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const task = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("task.id = :taskId", {
      taskId
    }).getOne();
    if (!task) return res.status(404).json({
      message: "TASK_NOT_FOUND"
    });
    if (!task.topic.class || task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const existing = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
      studentId
    }).andWhere("grade.topic_task_id = :taskId", {
      taskId
    }).getMany();
    if (existing.length === 0) {
      return res.json({
        message: "NO_GRADES_TO_DELETE",
        deleted: 0
      });
    }
    await gradeRepo().remove(existing);
    return res.json({
      message: "GRADE_DELETED",
      deleted: existing.length
    });
  } catch (error: any) {
    console.error("Error deleting task grades:", error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error.message
    });
  }
});
eduRouter.get("/tasks/pending-review", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    console.log("[GET /tasks/pending-review] Request received", {
      userId: req.userId,
      userType: req.userType,
      studentId: req.studentId
    });
    if (req.userType === "STUDENT" || req.studentId) {
      console.log("[GET /tasks/pending-review] Access denied: student trying to access");
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_PENDING_REVIEWS"
      });
    }
    if (!req.userId) {
      console.log("[GET /tasks/pending-review] No userId");
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user) {
      console.log("[GET /tasks/pending-review] User not found:", req.userId);
      return res.status(404).json({
        message: "USER_NOT_FOUND"
      });
    }
    if (user.userMode !== "EDUCATIONAL") {
      console.log("[GET /tasks/pending-review] User is not in EDUCATIONAL mode:", user.userMode);
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_PENDING_REVIEWS"
      });
    }
    const classes = await classRepo().find({
      where: {
        teacher: {
          id: user.id
        }
      },
      relations: ["students"]
    });
    console.log("[GET /tasks/pending-review] Found classes:", classes.length);
    if (classes.length === 0) {
      return res.json({
        pendingReviews: []
      });
    }
    const classIds = classes.map(c => c.id);
    const studentIds = classes.flatMap(c => c.students.map(s => s.id));
    console.log("[GET /tasks/pending-review] Found students:", studentIds.length);
    if (studentIds.length === 0) {
      return res.json({
        pendingReviews: []
      });
    }
    const pendingGrades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.task", "task").leftJoinAndSelect("grade.topicTask", "topicTask").leftJoinAndSelect("task.lesson", "lesson").leftJoinAndSelect("lesson.class", "lessonClass").leftJoinAndSelect("grade.student", "student").where("grade.student_id IN (:...studentIds)", {
      studentIds
    }).andWhere("grade.is_manually_graded = :isManuallyGraded", {
      isManuallyGraded: false
    }).andWhere("(grade.total IS NULL OR grade.total = 0)").orderBy("grade.created_at", "DESC").getMany();
    console.log("[GET /tasks/pending-review] Found pending grades:", pendingGrades.length);
    const pendingReviews = pendingGrades.map(grade => ({
      gradeId: grade.id,
      student: {
        id: grade.student.id,
        firstName: grade.student.firstName,
        lastName: grade.student.lastName,
        middleName: grade.student.middleName || undefined,
        email: grade.student.email
      },
      task: grade.task ? {
        id: grade.task.id,
        title: grade.task.title,
        lesson: grade.task.lesson ? {
          id: grade.task.lesson.id,
          title: grade.task.lesson.title,
          type: grade.task.lesson.type
        } : undefined
      } : grade.topicTask ? {
        id: grade.topicTask.id,
        title: grade.topicTask.title,
        lesson: undefined
      } : null,
      submittedCode: grade.submittedCode,
      submittedAt: grade.createdAt.toISOString(),
      system: grade.task ? "old" : "new" as "old" | "new"
    }));
    res.json({
      pendingReviews
    });
  } catch (error: any) {
    console.error("[GET /tasks/pending-review] Error fetching pending reviews:", error);
    console.error("[GET /tasks/pending-review] Error stack:", error.stack);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error.message
    });
  }
});
eduRouter.get("/tasks/:taskId/test-data", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    console.log(`[GET /tasks/:taskId/test-data] Request for taskId=${taskId}, userId=${req.userId}`);
    if (isNaN(taskId)) {
      console.log(`[GET /tasks/:taskId/test-data] Invalid taskId: ${req.params.taskId}`);
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask) {
      console.log(`[GET /tasks/:taskId/test-data] TopicTask not found: taskId=${taskId}`);
      return res.status(404).json({
        message: "TASK_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic) {
      console.log(`[GET /tasks/:taskId/test-data] TopicTask has no topic: taskId=${taskId}`);
      return res.status(404).json({
        message: "TASK_TOPIC_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic.class) {
      console.log(`[GET /tasks/:taskId/test-data] Topic has no class: taskId=${taskId}, topicId=${topicTask.topic.id}`);
      return res.status(404).json({
        message: "TASK_CLASS_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic.class.teacher) {
      console.log(`[GET /tasks/:taskId/test-data] Class has no teacher: taskId=${taskId}, classId=${topicTask.topic.class.id}`);
      return res.status(404).json({
        message: "TASK_TEACHER_NOT_FOUND",
        taskId
      });
    }
    console.log(`[GET /tasks/:taskId/test-data] TopicTask loaded: id=${topicTask.id}, topicId=${topicTask.topic.id}, classId=${topicTask.topic.class.id}, teacherId=${topicTask.topic.class.teacher.id}`);
    if (req.studentId) {
      const student = await studentRepo().findOne({
        where: {
          id: req.studentId
        },
        relations: ["class"]
      });
      if (!student || !student.class || student.class.id !== topicTask.topic.class.id) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    } else {
      if (!req.userId) {
        return res.status(401).json({
          message: "UNAUTHORIZED"
        });
      }
      if (topicTask.topic.class.teacher.id !== req.userId && !isSystemAdmin) {
        console.log(`[GET /tasks/:taskId/test-data] Access denied: teacherId=${topicTask.topic.class.teacher.id}, userId=${req.userId}`);
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    const testData = await testDataRepo().find({
      where: {
        topicTask: {
          id: taskId
        }
      },
      order: {
        createdAt: "ASC"
      }
    });
    console.log(`[GET /tasks/:taskId/test-data] Found ${testData.length} test data items for taskId=${taskId}`);
    const includeExpectedOutput = !(req.userType === "STUDENT" || req.studentId);
    res.json({
      testData: testData.filter(td => td.isHidden !== true).map(td => ({
        id: td.id,
        input: td.input,
        ...(includeExpectedOutput ? {
          expectedOutput: td.expectedOutput
        } : {}),
        points: td.points
      }))
    });
  } catch (error: any) {
    console.error("[GET /tasks/:taskId/test-data] Error:", error);
    console.error("[GET /tasks/:taskId/test-data] Stack:", error.stack);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error?.message,
      name: error?.name,
      code: error?.code
    });
  }
});
eduRouter.post("/tasks/:taskId/test-data", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_ADD_TEST_DATA"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (!topicTask.topic || !topicTask.topic.class || !topicTask.topic.class.teacher) {
      return res.status(404).json({
        message: "TASK_RELATIONS_NOT_FOUND"
      });
    }
    if (topicTask.topic.class.teacher.id !== req.userId && !isSystemAdmin) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const {
      testData
    } = req.body as {
      testData: Array<{
        input: string;
        expectedOutput: string;
        points?: number;
        isHidden?: boolean;
      }>;
    };
    if (!testData || !Array.isArray(testData)) {
      return res.status(400).json({
        message: "INVALID_TEST_DATA"
      });
    }
    const createdTests = testData.map(td => testDataRepo().create({
      topicTask: {
        id: taskId
      } as any,
      input: td.input,
      expectedOutput: td.expectedOutput,
      points: td.points || 1,
      isHidden: td.isHidden === true
    }));
    await testDataRepo().save(createdTests);
    res.status(201).json({
      message: "TEST_DATA_ADDED",
      testData: createdTests.filter(td => td.isHidden !== true).map(td => ({
        id: td.id,
        input: td.input,
        expectedOutput: td.expectedOutput,
        points: td.points
      }))
    });
  } catch (error: any) {
    console.error("Error adding test data:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/test-data/generate", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    console.log(`[POST /tasks/:taskId/test-data/generate] Request for taskId=${taskId}, userId=${req.userId}`);
    if (isNaN(taskId)) {
      console.log(`[POST /tasks/:taskId/test-data/generate] Invalid taskId: ${req.params.taskId}`);
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GENERATE_TEST_DATA"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const isSystemAdmin = req.userRole === "SYSTEM_ADMIN";
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask) {
      console.log(`[POST /tasks/:taskId/test-data/generate] TopicTask not found: taskId=${taskId}`);
      return res.status(404).json({
        message: "TASK_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic) {
      console.log(`[POST /tasks/:taskId/test-data/generate] TopicTask has no topic: taskId=${taskId}`);
      return res.status(404).json({
        message: "TASK_TOPIC_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic.class) {
      console.log(`[POST /tasks/:taskId/test-data/generate] Topic has no class: taskId=${taskId}, topicId=${topicTask.topic.id}`);
      return res.status(404).json({
        message: "TASK_CLASS_NOT_FOUND",
        taskId
      });
    }
    if (!topicTask.topic.class.teacher) {
      console.log(`[POST /tasks/:taskId/test-data/generate] Class has no teacher: taskId=${taskId}, classId=${topicTask.topic.class.id}`);
      return res.status(404).json({
        message: "TASK_TEACHER_NOT_FOUND",
        taskId
      });
    }
    console.log(`[POST /tasks/:taskId/test-data/generate] TopicTask loaded: id=${topicTask.id}, topicId=${topicTask.topic.id}, classId=${topicTask.topic.class.id}, teacherId=${topicTask.topic.class.teacher.id}`);
    if (topicTask.topic.class.teacher.id !== req.userId && !isSystemAdmin) {
      console.log(`[POST /tasks/:taskId/test-data/generate] Access denied: teacherId=${topicTask.topic.class.teacher.id}, userId=${req.userId}`);
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const {
      count
    } = req.body as {
      count?: number;
    };
    const testCount = count || 5;
    const safeTaskDescription = String(topicTask.description || "").trim() || String(topicTask.template || "").trim() || `Завдання: ${topicTask.title}`;
    try {
      const testDataResult = await safeAICall('generateTestData', {
        taskDescription: safeTaskDescription,
        taskTitle: topicTask.title,
        lang: topicTask.topic.class.language,
        count: testCount,
        userId: req.userId
      }, {
        expectedCount: testCount
      });
      if (!testDataResult.success) {
        return res.status(testDataResult.error?.statusCode || 500).json({
          message: testDataResult.error?.message || "TEST_DATA_GENERATION_FAILED",
          error: testDataResult.error?.error,
          details: testDataResult.error?.details
        });
      }
      const testData = testDataResult.data;
      const createdTests = testData.map((td: {
        input: string;
        output: string;
      }) => testDataRepo().create({
        topicTask: {
          id: taskId
        } as any,
        input: td.input || "",
        expectedOutput: td.output || "",
        points: 1,
        isHidden: false
      }));
      await testDataRepo().save(createdTests);
      res.json({
        count: createdTests.length,
        testData: createdTests.filter((td: TestData) => td.isHidden !== true).map((td: TestData) => ({
          id: td.id,
          input: td.input,
          expectedOutput: td.expectedOutput,
          points: td.points
        }))
      });
    } catch (error: any) {
      console.error("Error generating test data:", error);
      res.status(500).json({
        message: "TEST_DATA_GENERATION_FAILED",
        error: error?.message,
        name: error?.name,
        code: error?.code
      });
    }
  } catch (error: any) {
    console.error("Error generating test data:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error?.message,
      name: error?.name,
      code: error?.code
    });
  }
});
eduRouter.put("/tasks/:taskId/test-data/:testDataId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const testDataId = parseInt(req.params.testDataId, 10);
    if (isNaN(taskId) || isNaN(testDataId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask || !topicTask.topic || !topicTask.topic.class || !topicTask.topic.class.teacher) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UPDATE_TEST_DATA"
      });
    }
    if (topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const testData = await testDataRepo().findOne({
      where: {
        id: testDataId,
        topicTask: {
          id: taskId
        }
      }
    });
    if (!testData) {
      return res.status(404).json({
        message: "TEST_DATA_NOT_FOUND"
      });
    }
    const {
      input,
      expectedOutput,
      points,
      isHidden
    } = req.body as {
      input?: string;
      expectedOutput?: string;
      points?: number;
      isHidden?: boolean;
    };
    if (input !== undefined) testData.input = input;
    if (expectedOutput !== undefined) testData.expectedOutput = expectedOutput;
    if (points !== undefined) testData.points = points;
    if (isHidden !== undefined) testData.isHidden = isHidden === true;
    await testDataRepo().save(testData);
    res.json({
      message: "TEST_DATA_UPDATED",
      testData: testData.isHidden ? null : {
        id: testData.id,
        input: testData.input,
        expectedOutput: testData.expectedOutput,
        points: testData.points
      }
    });
  } catch (error: any) {
    console.error("Error updating test data:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.delete("/tasks/:taskId/test-data/:testDataId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    const testDataId = parseInt(req.params.testDataId, 10);
    if (isNaN(taskId) || isNaN(testDataId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const topicTask = await topicTaskRepo().createQueryBuilder("topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("topicTask.id = :taskId", {
      taskId
    }).getOne();
    if (!topicTask || !topicTask.topic || !topicTask.topic.class || !topicTask.topic.class.teacher) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_DELETE_TEST_DATA"
      });
    }
    if (topicTask.topic.class.teacher.id !== user.id && user.role !== "SYSTEM_ADMIN") {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const testData = await testDataRepo().findOne({
      where: {
        id: testDataId,
        topicTask: {
          id: taskId
        }
      }
    });
    if (!testData) {
      return res.status(404).json({
        message: "TEST_DATA_NOT_FOUND"
      });
    }
    await testDataRepo().remove(testData);
    res.json({
      message: "TEST_DATA_DELETED"
    });
  } catch (error: any) {
    console.error("Error deleting test data:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/topics/tasks/:taskId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UNASSIGN_TASKS"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    const task = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("task.id = :taskId", {
      taskId
    }).getOne();
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (task.topic.class && task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    await AppDataSource.transaction(async manager => {
      const taskRepoM = manager.getRepository(TopicTask);
      const gradeRepoM = manager.getRepository(EduGrade);
      task.isAssigned = false;
      task.deadline = null;
      await taskRepoM.save(task);
      await gradeRepoM.createQueryBuilder().delete().from(EduGrade).where("topic_task_id = :taskId", {
        taskId: task.id
      }).execute();
    });
    res.json({
      message: "TASK_UNASSIGNED_AND_CLEARED"
    });
  } catch (error: any) {
    console.error("Error unassigning task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/topics/control-works/:controlWorkId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UNASSIGN_CONTROL_WORKS"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("controlWork.id = :controlWorkId", {
      controlWorkId
    }).getOne();
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (controlWork.topic.class && controlWork.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    await AppDataSource.transaction(async manager => {
      const cwRepoM = manager.getRepository(ControlWork);
      const taskRepoM = manager.getRepository(TopicTask);
      const gradeRepoM = manager.getRepository(EduGrade);
      const summaryRepoM = manager.getRepository(SummaryGrade);
      const attemptRepoM = manager.getRepository(LessonAttempt);
      controlWork.isAssigned = false;
      controlWork.deadline = null;
      await cwRepoM.save(controlWork);
      const controlTasks = await taskRepoM.createQueryBuilder("task").where("task.control_work_id = :controlWorkId", {
        controlWorkId
      }).andWhere("task.type = :controlType", {
        controlType: "CONTROL"
      }).getMany();
      for (const t of controlTasks) {
        t.isAssigned = false;
        t.deadline = null;
        await taskRepoM.save(t);
      }
      const controlTaskIds = controlTasks.map(t => t.id);
      if (controlTaskIds.length > 0) {
        await gradeRepoM.createQueryBuilder().delete().from(EduGrade).where("topic_task_id IN (:...ids)", {
          ids: controlTaskIds
        }).execute();
      }
      await summaryRepoM.createQueryBuilder().delete().from(SummaryGrade).where("control_work_id = :controlWorkId", {
        controlWorkId
      }).andWhere("assessment_type = :type", {
        type: AssessmentType.CONTROL
      }).execute();
      await attemptRepoM.createQueryBuilder().delete().from(LessonAttempt).where("control_work_id = :controlWorkId", {
        controlWorkId
      }).execute();
    });
    res.json({
      message: "CONTROL_WORK_UNASSIGNED_AND_CLEARED"
    });
  } catch (error: any) {
    console.error("Error unassigning control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/tasks/:taskId/grades/:studentId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GRADE"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const {
      total,
      feedback
    } = req.body;
    if (total === undefined || total === null) {
      return res.status(400).json({
        message: "GRADE_REQUIRED"
      });
    }
    if (typeof total !== "number" || !Number.isFinite(total) || total < 0 || total > 12) {
      return res.status(400).json({
        message: "INVALID_GRADE_RANGE"
      });
    }
    const normalizedTotal = clampGradeToInt(total);
    const task = await topicTaskRepo().createQueryBuilder("task").leftJoinAndSelect("task.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("task.id = :taskId", {
      taskId
    }).getOne();
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (task.topic.class && task.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (!task.topic.class || student.class.id !== task.topic.class.id) {
      return res.status(403).json({
        message: "STUDENT_NOT_IN_CLASS"
      });
    }
    let grade = await gradeRepo().createQueryBuilder("grade").where("grade.student_id = :studentId", {
      studentId
    }).andWhere("grade.topic_task_id = :taskId", {
      taskId
    }).orderBy("grade.created_at", "DESC").getOne();
    if (grade) {
      grade.total = normalizedTotal;
      grade.feedback = feedback || null;
      grade.isManuallyGraded = true;
      grade.isCompleted = true;
      await gradeRepo().save(grade);
    } else {
      grade = gradeRepo().create({
        student: student,
        topicTask: task,
        total: normalizedTotal,
        feedback: feedback || null,
        isManuallyGraded: true,
        isCompleted: true,
        testsPassed: 0,
        testsTotal: 0
      });
      await gradeRepo().save(grade);
    }
    res.json({
      message: "GRADE_SAVED",
      grade: {
        id: grade.id,
        total: grade.total,
        feedback: grade.feedback,
        isManuallyGraded: grade.isManuallyGraded
      }
    });
  } catch (error: any) {
    console.error("Error creating/updating grade:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/gradebook", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_GRADEBOOK"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      },
      relations: ["students"]
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const students = cls.students || [];
    const topics = await topicRepo().createQueryBuilder("topic").leftJoinAndSelect("topic.tasks", "task").leftJoinAndSelect("topic.controlWorks", "controlWork").where("topic.class_id = :classId", {
      classId
    }).orderBy("topic.order", "ASC").addOrderBy("task.order", "ASC").getMany();
    const lessons: Array<{
      id: number;
      title: string;
      type: "TOPIC" | "CONTROL" | "SUMMARY";
      parentId?: number;
      parentTitle?: string;
      tasks: Array<{
        id: number;
        title: string;
        type: string;
      }>;
    }> = [];
    for (const topic of topics) {
      const practiceTasks = (topic.tasks || []).filter(t => t.type === "PRACTICE" && t.isAssigned);
      if (practiceTasks.length > 0) {
        lessons.push({
          id: topic.id,
          title: topic.title,
          type: "TOPIC",
          tasks: practiceTasks.map(t => ({
            id: t.id,
            title: t.title,
            type: t.type
          }))
        });
      }
      lessons.push({
        id: topic.id,
        title: "Тематична",
        type: "SUMMARY",
        parentId: topic.id,
        parentTitle: topic.title,
        tasks: [{
          id: topic.id,
          title: "Тематична",
          type: "SUMMARY"
        }]
      });
      for (const controlWork of topic.controlWorks || []) {
        if (controlWork.isAssigned) {
          lessons.push({
            id: controlWork.id,
            title: controlWork.title || `Контрольна робота #${controlWork.id}`,
            type: "CONTROL",
            parentId: topic.id,
            parentTitle: topic.title,
            tasks: [{
              id: controlWork.id,
              title: controlWork.title || `Контрольна робота #${controlWork.id}`,
              type: "CONTROL"
            }]
          });
        }
      }
    }
    const gradebookStudents = [];
    for (const student of students) {
      const allGrades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.topicTask", "topicTask").leftJoinAndSelect("topicTask.topic", "topic").leftJoinAndSelect("topicTask.controlWork", "controlWork").where("grade.student_id = :studentId", {
        studentId: student.id
      }).getMany();
      const summaryGrades = await summaryGradeRepo().createQueryBuilder("summaryGrade").leftJoinAndSelect("summaryGrade.controlWork", "controlWork").leftJoinAndSelect("summaryGrade.topic", "topic").where("summaryGrade.student_id = :studentId", {
        studentId: student.id
      }).getMany();
      const flatGrades = [];
      for (const lesson of lessons) {
        if (lesson.type === "CONTROL") {
          const summaryGrade = summaryGrades.find(sg => sg.controlWork && sg.controlWork.id === lesson.id);
          flatGrades.push({
            taskId: lesson.id,
            taskTitle: lesson.title,
            lessonId: lesson.id,
            lessonTitle: lesson.parentTitle || lesson.title,
            lessonType: lesson.type,
            grade: summaryGrade ? clampGradeToInt(summaryGrade.grade) : null,
            createdAt: summaryGrade ? summaryGrade.createdAt.toISOString() : null,
            isControlWork: true,
            gradeId: summaryGrade ? summaryGrade.id : null
          });
        } else if (lesson.type === "SUMMARY") {
          const topicId = lesson.parentId || lesson.id;
          const thematic = summaryGrades.find((sg: any) => sg.topic && sg.topic.id === topicId && sg.assessmentType === AssessmentType.INTERMEDIATE && sg.name === "Тематична");
          flatGrades.push({
            taskId: topicId,
            taskTitle: "Тематична",
            lessonId: lesson.id,
            lessonTitle: lesson.parentTitle || "Тема",
            lessonType: "SUMMARY",
            grade: thematic ? clampGradeToInt(thematic.grade) : null,
            createdAt: thematic ? thematic.createdAt.toISOString() : null,
            gradeId: thematic ? thematic.id : null,
            isSummaryGrade: true
          });
        } else {
          for (const task of lesson.tasks) {
            const grades = allGrades.filter(g => g.topicTask && g.topicTask.id === task.id);
            const bestGrade = grades.length > 0 ? Math.max(...grades.map(g => g.total || 0)) : null;
            const latestGrade = grades.length > 0 ? [...grades].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] : null;
            flatGrades.push({
              taskId: task.id,
              taskTitle: task.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              lessonType: lesson.type,
              grade: bestGrade,
              createdAt: latestGrade ? latestGrade.createdAt.toISOString() : null,
              gradeId: latestGrade ? latestGrade.id : null
            });
          }
        }
      }
      gradebookStudents.push({
        studentId: student.id,
        studentName: `${student.lastName} ${student.firstName} ${student.middleName || ""}`.trim(),
        grades: flatGrades
      });
    }
    disableCache(res);
    res.json({
      students: gradebookStudents,
      lessons: lessons
    });
  } catch (error) {
    console.error("Error fetching gradebook:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/summary-grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const allSummaryGrades = await summaryGradeRepo().find({
      where: {
        class: {
          id: classId
        }
      },
      relations: ["student"],
      order: {
        createdAt: "ASC"
      }
    });
    const groups: Record<string, any[]> = {};
    allSummaryGrades.forEach(sg => {
      if (!groups[sg.name]) groups[sg.name] = [];
      groups[sg.name].push({
        id: sg.id,
        studentId: sg.student.id,
        studentName: `${sg.student.lastName} ${sg.student.firstName} ${sg.student.middleName || ""}`.trim(),
        grade: sg.grade,
        createdAt: sg.createdAt.toISOString()
      });
    });
    const summaryGrades = Object.keys(groups).map(name => ({
      name,
      grades: groups[name]
    }));
    disableCache(res);
    res.json({
      summaryGrades
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/summary-grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      },
      relations: ["students"]
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    const {
      name,
      topicId,
      studentGrades
    } = req.body;
    if (!name) {
      return res.status(400).json({
        message: "NAME_REQUIRED"
      });
    }
    if (!topicId) {
      return res.status(400).json({
        message: "TOPIC_ID_REQUIRED"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: parseInt(topicId, 10),
        class: {
          id: classId
        }
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    await summaryGradeRepo().delete({
      class: {
        id: classId
      } as any,
      topic: {
        id: topic.id
      } as any,
      name,
      assessmentType: AssessmentType.INTERMEDIATE as any
    });
    const results = [];
    if (studentGrades && Array.isArray(studentGrades) && studentGrades.length > 0) {
      for (const item of studentGrades) {
        const student = cls.students.find(s => s.id === item.studentId);
        if (!student) continue;
        const sg = summaryGradeRepo().create({
          class: cls,
          student,
          name,
          grade: clampGradeToInt(item.grade),
          topic,
          assessmentType: AssessmentType.INTERMEDIATE,
          controlWork: null
        });
        validateAssessmentType(AssessmentType.INTERMEDIATE, null, 'grade');
        await summaryGradeRepo().save(sg);
        results.push(sg);
      }
    } else {
      for (const student of cls.students) {
        const classGrades = await gradeRepo().createQueryBuilder("grade").leftJoinAndSelect("grade.topicTask", "topicTask").leftJoinAndSelect("topicTask.topic", "topic").where("grade.student_id = :studentId", {
          studentId: student.id
        }).andWhere("topic.id = :topicId", {
          topicId: topic.id
        }).getMany();
        if (classGrades.length > 0) {
          const practiceGrades = classGrades.filter(g => {
            if (g.topicTask && g.topicTask.type === "CONTROL") {
              return false;
            }
            return true;
          });
          const practiceBestGrades: Record<number, number> = {};
          practiceGrades.forEach(g => {
            let taskId: number | null = null;
            if (g.task) {
              taskId = g.task.id;
            } else if (g.topicTask) {
              taskId = g.topicTask.id + 1000000;
            }
            if (taskId !== null && (!practiceBestGrades[taskId] || (g.total || 0) > practiceBestGrades[taskId])) {
              practiceBestGrades[taskId] = g.total || 0;
            }
          });
          const practiceScores = Object.values(practiceBestGrades);
          const controlSummaryGrades = await summaryGradeRepo().createQueryBuilder("sg").leftJoinAndSelect("sg.controlWork", "cw").where("sg.student_id = :studentId", {
            studentId: student.id
          }).andWhere("sg.assessment_type = :type", {
            type: AssessmentType.CONTROL
          }).andWhere("sg.topic_id = :topicId", {
            topicId: topic.id
          }).getMany();
          const controlScores = controlSummaryGrades.map(sg => Number(sg.grade) || 0).filter(v => Number.isFinite(v));
          const allScores = [...practiceScores, ...controlScores];
          if (allScores.length === 0) {
            const sg = summaryGradeRepo().create({
              class: cls,
              student,
              name,
              grade: 0,
              topic,
              assessmentType: AssessmentType.INTERMEDIATE,
              controlWork: null
            });
            validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
            await summaryGradeRepo().save(sg);
            results.push(sg);
            continue;
          }
          const avg = allScores.length > 0 ? clampGradeToInt(allScores.reduce((s, val) => s + val, 0) / allScores.length) : 0;
          const sg = summaryGradeRepo().create({
            class: cls,
            student,
            name,
            grade: avg,
            topic,
            assessmentType: AssessmentType.INTERMEDIATE,
            controlWork: null
          });
          validateAssessmentType(AssessmentType.INTERMEDIATE, null, 'grade');
          await summaryGradeRepo().save(sg);
          results.push(sg);
        } else {
          const sg = summaryGradeRepo().create({
            class: cls,
            student,
            name,
            grade: 0,
            topic,
            assessmentType: AssessmentType.INTERMEDIATE,
            controlWork: null
          });
          validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
          await summaryGradeRepo().save(sg);
          results.push(sg);
        }
      }
    }
    res.status(201).json({
      count: results.length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.put("/control-works/:controlWorkId/students/:studentId/grade", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GRADE"
      });
    }
    if (!req.userId) {
      return res.status(401).json({
        message: "UNAUTHORIZED"
      });
    }
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(controlWorkId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const {
      grade
    } = req.body;
    if (grade === undefined || grade === null) {
      return res.status(400).json({
        message: "GRADE_REQUIRED"
      });
    }
    if (typeof grade !== "number" || !Number.isFinite(grade) || grade < 0 || grade > 12) {
      return res.status(400).json({
        message: "INVALID_GRADE_RANGE"
      });
    }
    const normalizedGrade = clampGradeToInt(grade);
    const controlWork = await controlWorkRepo().createQueryBuilder("controlWork").leftJoinAndSelect("controlWork.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").where("controlWork.id = :controlWorkId", {
      controlWorkId
    }).getOne();
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (!controlWork.topic.class || controlWork.topic.class.teacher.id !== req.userId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class"]
    });
    if (!student) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "STUDENT_NOT_IN_CLASS"
      });
    }
    let summaryGrade = await summaryGradeRepo().createQueryBuilder("summaryGrade").leftJoinAndSelect("summaryGrade.controlWork", "cw").where("summaryGrade.student_id = :studentId", {
      studentId
    }).andWhere("summaryGrade.control_work_id = :controlWorkId", {
      controlWorkId
    }).getOne();
    if (summaryGrade) {
      summaryGrade.grade = normalizedGrade;
      summaryGrade.controlWork = controlWork;
      summaryGrade.topic = controlWork.topic;
      summaryGrade.class = controlWork.topic.class;
      summaryGrade.assessmentType = AssessmentType.CONTROL;
      if (!summaryGrade.name) {
        summaryGrade.name = controlWork.title || `Контрольна робота #${controlWork.id}`;
      }
      validateAssessmentType(AssessmentType.CONTROL, controlWork.id, "grade");
      await summaryGradeRepo().save(summaryGrade);
    } else {
      summaryGrade = summaryGradeRepo().create({
        student: student,
        class: controlWork.topic.class,
        controlWork: controlWork,
        topic: controlWork.topic,
        grade: normalizedGrade,
        assessmentType: AssessmentType.CONTROL,
        name: controlWork.title || `Контрольна робота #${controlWork.id}`
      });
      validateAssessmentType(AssessmentType.CONTROL, controlWork.id, "grade");
      await summaryGradeRepo().save(summaryGrade);
    }
    res.json({
      message: "GRADE_SAVED",
      summaryGrade: {
        id: summaryGrade.id,
        grade: summaryGrade.grade
      }
    });
  } catch (error: any) {
    console.error("Error updating control work grade:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR",
      error: error.message
    });
  }
});
eduRouter.get("/topic-tasks/:taskId/students/:studentId/work", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_WORK"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_WORK"
      });
    }
    const taskId = parseInt(req.params.taskId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(taskId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_PARAMS"
      });
    }
    const topicTask = await topicTaskRepo().findOne({
      where: {
        id: taskId
      },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });
    if (!topicTask || !topicTask.topic?.class) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (!topicTask.topic.class.teacher || topicTask.topic.class.teacher.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class", "class.teacher"]
    });
    if (!student || !student.class) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (!student.class.teacher || student.class.teacher.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if (student.class.id !== topicTask.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const submissions = await gradeRepo().find({
      where: {
        student: {
          id: studentId
        } as any,
        topicTask: {
          id: taskId
        } as any
      } as any,
      order: {
        createdAt: "DESC" as any
      }
    });
    return res.json({
      task: {
        id: topicTask.id,
        title: topicTask.title,
        type: topicTask.type,
        topicId: topicTask.topic.id,
        topicTitle: topicTask.topic.title
      },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName || null
      },
      submissions: submissions.map(g => ({
        id: g.id,
        total: g.total,
        testsPassed: g.testsPassed,
        testsTotal: g.testsTotal,
        feedback: g.feedback,
        isManuallyGraded: g.isManuallyGraded,
        isCompleted: g.isCompleted,
        submittedCode: g.submittedCode,
        testResults: g.testResults,
        createdAt: g.createdAt ? g.createdAt.toISOString() : null,
        updatedAt: g.updatedAt ? g.updatedAt.toISOString() : null
      }))
    });
  } catch (error: any) {
    console.error("Error getting topic task student work:", error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/control-works/:controlWorkId/students/:studentId/work", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_WORK"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_VIEW_WORK"
      });
    }
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    const studentId = parseInt(req.params.studentId, 10);
    if (isNaN(controlWorkId) || isNaN(studentId)) {
      return res.status(400).json({
        message: "INVALID_PARAMS"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });
    if (!controlWork || !controlWork.topic?.class) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (!controlWork.topic.class.teacher || controlWork.topic.class.teacher.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const student = await studentRepo().findOne({
      where: {
        id: studentId
      },
      relations: ["class", "class.teacher"]
    });
    if (!student || !student.class) {
      return res.status(404).json({
        message: "STUDENT_NOT_FOUND"
      });
    }
    if (!student.class.teacher || student.class.teacher.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if (student.class.id !== controlWork.topic.class.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const summaryGrade = await summaryGradeRepo().findOne({
      where: {
        student: {
          id: studentId
        } as any,
        controlWork: {
          id: controlWorkId
        } as any
      } as any
    });
    let quizReview: any | null = null;
    if (summaryGrade?.quizResultsJson) {
      try {
        quizReview = JSON.parse(summaryGrade.quizResultsJson);
      } catch (e) {
        quizReview = null;
      }
    }
    const practiceTasks = await topicTaskRepo().find({
      where: {
        topic: {
          id: controlWork.topic.id
        } as any,
        type: "CONTROL" as any,
        controlWork: {
          id: controlWorkId
        } as any
      } as any,
      order: {
        order: "ASC" as any,
        id: "ASC" as any
      }
    });
    const taskIds = practiceTasks.map(t => t.id);
    const allGrades = taskIds.length ? await gradeRepo().createQueryBuilder("g").leftJoinAndSelect("g.topicTask", "topicTask").where("g.student_id = :studentId", {
      studentId
    }).andWhere("g.topic_task_id IN (:...taskIds)", {
      taskIds
    }).orderBy("g.created_at", "DESC").getMany() : [];
    const latestByTask = new Map<number, EduGrade>();
    for (const g of allGrades) {
      const tid = g.topicTask?.id || null;
      if (!tid) continue;
      if (!latestByTask.has(tid)) latestByTask.set(tid, g);
    }
    return res.json({
      controlWork: {
        id: controlWork.id,
        title: controlWork.title,
        hasTheory: controlWork.hasTheory,
        hasPractice: controlWork.hasPractice
      },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        middleName: student.middleName || null
      },
      summaryGrade: summaryGrade ? {
        id: summaryGrade.id,
        grade: summaryGrade.grade,
        theoryGrade: summaryGrade.theoryGrade,
        createdAt: summaryGrade.createdAt ? summaryGrade.createdAt.toISOString() : null
      } : null,
      quizReview,
      practiceTasks: practiceTasks.map(t => {
        const g = latestByTask.get(t.id) || null;
        return {
          taskId: t.id,
          taskTitle: t.title,
          grade: g ? g.total : null,
          gradeId: g ? g.id : null,
          testsPassed: g ? g.testsPassed : 0,
          testsTotal: g ? g.testsTotal : 0,
          feedback: g ? g.feedback : null,
          isManuallyGraded: g ? g.isManuallyGraded : false,
          submittedCode: g ? g.submittedCode : null,
          testResults: g ? g.testResults : null,
          createdAt: g && g.createdAt ? g.createdAt.toISOString() : null
        };
      })
    });
  } catch (error: any) {
    console.error("Error getting control work student work:", error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.put("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const summaryGradeId = parseInt(req.params.id, 10);
    const sg = await summaryGradeRepo().findOne({
      where: {
        id: summaryGradeId,
        class: {
          id: classId
        }
      },
      relations: ["class", "class.teacher"]
    });
    if (!sg || sg.class.teacher.id !== req.userId) {
      return res.status(404).json({
        message: "SUMMARY_GRADE_NOT_FOUND"
      });
    }
    const {
      grade
    } = req.body;
    if (grade === undefined) return res.status(400).json({
      message: "GRADE_REQUIRED"
    });
    sg.grade = clampGradeToInt(grade);
    await summaryGradeRepo().save(sg);
    res.json({
      summaryGrade: sg
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.delete("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const summaryGradeId = parseInt(req.params.id, 10);
    const sg = await summaryGradeRepo().findOne({
      where: {
        id: summaryGradeId,
        class: {
          id: classId
        }
      },
      relations: ["class", "class.teacher"]
    });
    if (!sg || sg.class.teacher.id !== req.userId) {
      return res.status(404).json({
        message: "SUMMARY_GRADE_NOT_FOUND"
      });
    }
    await summaryGradeRepo().remove(sg);
    res.json({
      message: "SUMMARY_GRADE_DELETED"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.delete("/classes/:classId/topics/:topicId/thematic", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_DELETE_THEMATIC"
      });
    }
    const classId = parseInt(req.params.classId, 10);
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const cls = await classRepo().findOne({
      where: {
        id: classId
      },
      relations: ["teacher"]
    });
    if (!cls) return res.status(404).json({
      message: "CLASS_NOT_FOUND"
    });
    if (cls.teacher.id !== req.userId) {
      const user = await userRepo().findOne({
        where: {
          id: req.userId
        }
      });
      if (!user || user.role !== "SYSTEM_ADMIN") {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId,
        class: {
          id: classId
        } as any
      } as any
    });
    if (!topic) return res.status(404).json({
      message: "TOPIC_NOT_FOUND"
    });
    const result = await summaryGradeRepo().createQueryBuilder().delete().from(SummaryGrade).where("class_id = :classId", {
      classId
    }).andWhere("topic_id = :topicId", {
      topicId
    }).andWhere("assessment_type = :type", {
      type: AssessmentType.INTERMEDIATE
    }).andWhere("control_work_id IS NULL").andWhere("name = :name", {
      name: "Тематична"
    }).execute();
    res.json({
      message: "THEMATIC_DELETED",
      deleted: result.affected || 0
    });
  } catch (error: any) {
    console.error("Error deleting thematic:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
async function calculateControlGradeForNewSystemWithManager(manager: EntityManager, controlWorkId: number, studentId: number): Promise<{
  finalGrade: number;
  theoryGrade: number | null;
  averageTaskGrade: number;
} | null> {
  const controlWork = await manager.createQueryBuilder(ControlWork, "cw").setLock("pessimistic_read").where("cw.id = :controlWorkId", {
    controlWorkId
  }).leftJoinAndSelect("cw.topic", "topic").leftJoinAndSelect("topic.tasks", "tasks").leftJoinAndSelect("tasks.controlWork", "taskControlWork").getOne();
  if (!controlWork) {
    return null;
  }
  const controlTasks = (controlWork.topic.tasks || []).filter((t: TopicTask) => t.type === "CONTROL" && t.controlWork && t.controlWork.id === controlWork.id);
  const taskIds = controlTasks.map((t: TopicTask) => t.id);
  let hasAnyPracticeGrade = false;
  let averageTaskGrade = 0;
  if (taskIds.length > 0) {
    const allTaskGrades = await manager.createQueryBuilder(EduGrade, "g").setLock("pessimistic_read").leftJoin("g.student", "student").leftJoin("g.topicTask", "topicTask").where("student.id = :studentId", {
      studentId
    }).andWhere("topicTask.id IN (:...taskIds)", {
      taskIds
    }).andWhere("(g.type IS NULL OR g.type = 'PRACTICE')").orderBy("g.created_at", "DESC").getMany();
    hasAnyPracticeGrade = allTaskGrades.length > 0;
    const latestByTaskId = new Map<number, EduGrade>();
    for (const g of allTaskGrades) {
      const tid = (g as any).topicTask?.id;
      if (!tid) continue;
      if (!latestByTaskId.has(tid)) {
        latestByTaskId.set(tid, g);
      }
    }
    const sum = taskIds.reduce((acc, tid) => {
      const g = latestByTaskId.get(tid);
      const v = g && g.total !== null && Number.isFinite(Number(g.total)) ? Number(g.total) : 0;
      return acc + v;
    }, 0);
    averageTaskGrade = sum / taskIds.length;
  }
  const summaryGradeRepoManager = manager.getRepository(SummaryGrade);
  const summaryGrade = await manager.createQueryBuilder(SummaryGrade, "sg").setLock("pessimistic_read").where("sg.student.id = :studentId", {
    studentId
  }).andWhere("sg.controlWork.id = :controlWorkId", {
    controlWorkId
  }).getOne();
  let theoryGrade: number | null = null;
  if (summaryGrade && summaryGrade.theoryGrade !== null) {
    theoryGrade = clampGradeToInt(Number(summaryGrade.theoryGrade));
  }
  if (controlWork.hasTheory && theoryGrade === null) {
    return null;
  }
  const hasAnyGrades = hasAnyPracticeGrade || theoryGrade !== null;
  if (!hasAnyGrades) {
    return null;
  }
  const formulaVariables: FormulaVariables = {
    test: theoryGrade,
    avgPractice: averageTaskGrade
  };
  const formulaResult = evaluateFormula(controlWork.formula, formulaVariables);
  const finalGrade = clampGradeToInt(formulaResult !== null ? formulaResult : theoryGrade !== null ? theoryGrade : averageTaskGrade);
  return {
    finalGrade,
    theoryGrade,
    averageTaskGrade: clampGradeToInt(averageTaskGrade)
  };
}
async function saveControlSummaryGradeForNewSystemWithManager(manager: EntityManager, controlWorkId: number, studentId: number, theoryGrade: number | null): Promise<void> {
  const controlWork = await manager.createQueryBuilder(ControlWork, "cw").setLock("pessimistic_read").where("cw.id = :controlWorkId", {
    controlWorkId
  }).leftJoinAndSelect("cw.topic", "topic").leftJoinAndSelect("topic.class", "class").getOne();
  if (!controlWork) {
    return;
  }
  const gradeData = await calculateControlGradeForNewSystemWithManager(manager, controlWorkId, studentId);
  if (!gradeData) {
    const existingSummaryGrade = await manager.createQueryBuilder(SummaryGrade, "sg").setLock("pessimistic_write").where("sg.student.id = :studentId", {
      studentId
    }).andWhere("sg.controlWork.id = :controlWorkId", {
      controlWorkId
    }).getOne();
    if (existingSummaryGrade) {
      await manager.remove(SummaryGrade, existingSummaryGrade);
    }
    return;
  }
  const formulaSnapshot = controlWork.formula || null;
  const calculatedAt = new Date();
  const summaryGradeRepoManager = manager.getRepository(SummaryGrade);
  let summaryGrade = await manager.createQueryBuilder(SummaryGrade, "sg").setLock("pessimistic_write").where("sg.student.id = :studentId", {
    studentId
  }).andWhere("sg.controlWork.id = :controlWorkId", {
    controlWorkId
  }).getOne();
  if (summaryGrade) {
    summaryGrade.grade = gradeData.finalGrade;
    if (theoryGrade !== null) {
      summaryGrade.theoryGrade = theoryGrade;
    }
    summaryGrade.formulaSnapshot = formulaSnapshot;
    summaryGrade.calculatedAt = calculatedAt;
    await summaryGradeRepoManager.save(summaryGrade);
  } else {
    if (!controlWork.topic.class || !controlWork.topic.class.id) {
      console.error("Missing class information for control work:", controlWorkId);
      return;
    }
    summaryGrade = summaryGradeRepoManager.create({
      student: {
        id: studentId
      } as any,
      class: {
        id: controlWork.topic.class.id
      } as any,
      controlWork: {
        id: controlWorkId
      } as any,
      topic: {
        id: controlWork.topic.id
      } as any,
      name: controlWork.title || `Контрольна робота #${controlWorkId}`,
      assessmentType: AssessmentType.CONTROL,
      grade: gradeData.finalGrade,
      theoryGrade: theoryGrade,
      formulaSnapshot: formulaSnapshot,
      calculatedAt: calculatedAt
    });
    validateAssessmentType(AssessmentType.CONTROL, controlWorkId, 'grade');
    await summaryGradeRepoManager.save(summaryGrade);
  }
}
async function markControlWorkAttemptCompletedIfReadyWithManager(manager: EntityManager, controlWorkId: number, studentId: number): Promise<void> {
  const controlWork = await manager.createQueryBuilder(ControlWork, "cw").setLock("pessimistic_read").where("cw.id = :controlWorkId", {
    controlWorkId
  }).getOne();
  if (!controlWork) return;
  const hasTheoryPart = !!controlWork.hasTheory;
  const hasPracticePart = controlWork.hasPractice !== false;
  let theoryCompleted = true;
  if (hasTheoryPart) {
    const sg = await manager.createQueryBuilder(SummaryGrade, "sg").setLock("pessimistic_read").where("sg.student_id = :studentId", {
      studentId
    }).andWhere("sg.control_work_id = :controlWorkId", {
      controlWorkId
    }).andWhere("sg.theory_grade IS NOT NULL").getOne();
    theoryCompleted = !!sg;
  }
  let practiceCompleted = true;
  if (hasPracticePart) {
    const controlTasks = await manager.createQueryBuilder(TopicTask, "task").setLock("pessimistic_read").where("task.control_work_id = :controlWorkId", {
      controlWorkId
    }).andWhere("task.type = :controlType", {
      controlType: "CONTROL"
    }).getMany();
    const taskIds = controlTasks.map(t => t.id);
    if (taskIds.length > 0) {
      const graded = await manager.createQueryBuilder(EduGrade, "g").setLock("pessimistic_read").select("DISTINCT g.topic_task_id", "topic_task_id").where("g.student_id = :studentId", {
        studentId
      }).andWhere("g.topic_task_id IN (:...taskIds)", {
        taskIds
      }).andWhere("g.total IS NOT NULL").getRawMany();
      practiceCompleted = graded.length === taskIds.length;
    }
  }
  if (!theoryCompleted || !practiceCompleted) return;
  const attempt = await manager.createQueryBuilder(LessonAttempt, "attempt").setLock("pessimistic_write").where("attempt.control_work_id = :controlWorkId", {
    controlWorkId
  }).andWhere("attempt.student_id = :studentId", {
    studentId
  }).andWhere("attempt.status = :status", {
    status: "IN_PROGRESS"
  }).orderBy("attempt.started_at", "DESC").getOne();
  if (attempt) {
    attempt.status = "COMPLETED";
    attempt.finishedAt = new Date();
    await manager.save(LessonAttempt, attempt);
  }
}
eduRouter.put("/control-works/:controlWorkId/formula", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_MODIFY"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_MODIFY"
      });
    }
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const {
      formula
    } = req.body as {
      formula?: string | null;
    };
    if (formula !== null && formula !== undefined && formula.trim() !== "") {
      if (!validateFormula(formula)) {
        return res.status(400).json({
          message: "INVALID_FORMULA"
        });
      }
    }
    await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const controlWork = await manager.createQueryBuilder(ControlWork, "cw").setLock("pessimistic_write").where("cw.id = :controlWorkId", {
        controlWorkId
      }).leftJoinAndSelect("cw.topic", "topic").leftJoinAndSelect("topic.class", "class").leftJoinAndSelect("class.teacher", "teacher").getOne();
      if (!controlWork) {
        throw new Error("CONTROL_WORK_NOT_FOUND");
      }
      if (!controlWork.topic?.class) {
        throw new Error("TOPIC_NOT_ASSIGNED_TO_CLASS");
      }
      if (!controlWork.topic.class.teacher) {
        throw new Error("CLASS_TEACHER_NOT_FOUND");
      }
      if (controlWork.topic.class.teacher.id !== user.id) {
        throw new Error("ACCESS_DENIED");
      }
      controlWork.formula = formula || null;
      await manager.save(ControlWork, controlWork);
      if (!controlWork.topic.class || !controlWork.topic.class.id) {
        throw new Error("MISSING_CLASS_INFO");
      }
      const students = await manager.createQueryBuilder(Student, "s").setLock("pessimistic_read").where("s.class.id = :classId", {
        classId: controlWork.topic.class.id
      }).getMany();
      for (const student of students) {
        await saveControlSummaryGradeForNewSystemWithManager(manager, controlWorkId, student.id, null);
      }
    });
    res.json({
      message: "FORMULA_UPDATED_AND_GRADES_RECALCULATED",
      controlWorkId
    });
  } catch (error: any) {
    console.error("Error updating control work formula:", error);
    if (error.message === "CONTROL_WORK_NOT_FOUND") {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (error.message === "ACCESS_DENIED") {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.put("/grades/:gradeId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UPDATE_GRADES"
      });
    }
    const gradeId = parseInt(req.params.gradeId, 10);
    if (isNaN(gradeId)) {
      return res.status(400).json({
        message: "INVALID_GRADE_ID"
      });
    }
    const {
      total,
      feedback
    } = req.body as {
      total?: number;
      feedback?: string;
    };
    const grade = await gradeRepo().findOne({
      where: {
        id: gradeId
      },
      relations: ["student", "student.class", "student.class.teacher", "task", "topicTask"]
    });
    if (!grade) {
      return res.status(404).json({
        message: "GRADE_NOT_FOUND"
      });
    }
    if (!grade.student.class || grade.student.class.teacher.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    if (total !== undefined) {
      if (total < 0 || total > 12) {
        return res.status(400).json({
          message: "INVALID_GRADE_VALUE"
        });
      }
      grade.total = total;
    }
    if (feedback !== undefined) {
      grade.feedback = feedback || null;
    }
    grade.isManuallyGraded = true;
    await gradeRepo().save(grade);
    res.json({
      message: "GRADE_UPDATED",
      grade: {
        id: grade.id,
        total: grade.total!,
        feedback: grade.feedback || undefined,
        isManuallyGraded: grade.isManuallyGraded
      }
    });
  } catch (error: any) {
    console.error("Error updating grade:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
export default eduRouter;