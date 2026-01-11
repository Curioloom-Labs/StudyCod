import { Router, Response } from "express";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { AppDataSource } from "../data-source";
import { IsNull } from "typeorm";
import { TopicNew } from "../entities/TopicNew";
import { TheoryBlock } from "../entities/TheoryBlock";
import { TopicTask } from "../entities/TopicTask";
import { TaskTheory } from "../entities/TaskTheory";
import { ControlWork } from "../entities/ControlWork";
import { TopicProgress } from "../entities/TopicProgress";
import { Student } from "../entities/Student";
import { Class } from "../entities/Class";
import { User } from "../entities/User";
import { SummaryGrade } from "../entities/SummaryGrade";
import { EduGrade } from "../entities/EduGrade";
import { generateTaskCondition, generateTaskTemplate, generateTheoryWithAI } from "../services/openRouterService";
import { emailService } from "../services/emailService";
import { safeAICall, sendAIError } from "../services/ai/safeAICall";
const topicsRouter = Router();
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const theoryBlockRepo = () => AppDataSource.getRepository(TheoryBlock);
const taskRepo = () => AppDataSource.getRepository(TopicTask);
const theoryRepo = () => AppDataSource.getRepository(TaskTheory);
const controlWorkRepo = () => AppDataSource.getRepository(ControlWork);
const progressRepo = () => AppDataSource.getRepository(TopicProgress);
const studentRepo = () => AppDataSource.getRepository(Student);
const classRepo = () => AppDataSource.getRepository(Class);
const userRepo = () => AppDataSource.getRepository(User);
topicsRouter.get("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL") {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const {
      language,
      classId
    } = req.query;
    if (classId) {
      const cls = await classRepo().findOne({
        where: {
          id: parseInt(classId as string, 10)
        },
        relations: ["teacher"]
      });
      if (!cls) {
        return res.status(404).json({
          message: "CLASS_NOT_FOUND"
        });
      }
      if (cls.teacher.id !== user.id) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
      const topics = await topicRepo().find({
        where: {
          class: {
            id: cls.id
          } as any
        },
        order: {
          order: "ASC"
        },
        relations: ["tasks", "controlWorks"]
      });
      return res.json({
        topics
      });
    }
    if (!language || language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({
        message: "INVALID_LANGUAGE"
      });
    }
    const topics = await topicRepo().find({
      where: {
        language: language as "JAVA" | "PYTHON",
        class: IsNull() as any
      },
      order: {
        order: "ASC"
      },
      relations: ["tasks", "controlWorks"]
    });
    res.json({
      topics
    });
  } catch (error: any) {
    console.error("Error fetching topics:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.get("/:topicId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      },
      relations: ["class", "class.teacher", "tasks", "tasks.theory", "controlWorks"],
      order: {
        tasks: {
          order: "ASC"
        }
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    if (topic.class && topic.class.teacher?.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    let progress = null;
    if (req.studentId) {
      progress = await progressRepo().findOne({
        where: {
          student: {
            id: req.studentId
          } as any,
          topic: {
            id: topicId
          } as any
        }
      });
    }
    res.json({
      topic,
      progress
    });
  } catch (error: any) {
    console.error("Error fetching topic:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_CREATE_TOPICS"
      });
    }
    const {
      title,
      description,
      order,
      language,
      classId
    } = req.body || {};
    if (!title || !language || language !== "JAVA" && language !== "PYTHON") {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }
    if (classId) {
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
      if (cls.language !== language) {
        return res.status(400).json({
          message: "LANGUAGE_MISMATCH"
        });
      }
    }
    let topicOrder = order;
    if (topicOrder === undefined || topicOrder === null) {
      const maxOrderTopic = await topicRepo().findOne({
        where: classId ? {
          class: {
            id: classId
          } as any
        } as any : {
          language: language as "JAVA" | "PYTHON",
          class: IsNull() as any
        } as any,
        order: {
          order: "DESC"
        }
      });
      topicOrder = maxOrderTopic ? maxOrderTopic.order + 1 : 0;
    }
    const topic = topicRepo().create({
      title,
      description: description || null,
      order: topicOrder,
      language: language as "JAVA" | "PYTHON",
      class: classId ? {
        id: classId
      } as any : null
    });
    await topicRepo().save(topic);
    res.json({
      topic
    });
  } catch (error: any) {
    console.error("Error creating topic:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_CREATE_TASKS"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      },
      relations: ["class", "class.teacher"]
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    if (topic.class && topic.class.teacher?.id !== user.id) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const {
      title,
      description,
      template,
      type,
      order,
      maxAttempts,
      deadline,
      controlWorkId
    } = req.body || {};
    if (!title || !description || !template || !type || type !== "PRACTICE" && type !== "CONTROL") {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }
    if (type === "CONTROL" && !controlWorkId) {
      return res.status(400).json({
        message: "CONTROL_WORK_ID_REQUIRED_FOR_CONTROL_TASKS"
      });
    }
    let controlWork = null;
    if (type === "CONTROL" && controlWorkId) {
      controlWork = await controlWorkRepo().findOne({
        where: {
          id: parseInt(controlWorkId, 10),
          topic: {
            id: topicId
          }
        } as any,
        relations: ["topic"]
      });
      if (!controlWork) {
        return res.status(400).json({
          message: "CONTROL_WORK_NOT_FOUND_OR_WRONG_TOPIC"
        });
      }
    }
    const task = taskRepo().create({
      topic: {
        id: topicId
      } as any,
      controlWork: controlWork ? {
        id: controlWork.id
      } as any : null,
      title,
      description,
      template,
      type: type as "PRACTICE" | "CONTROL",
      order: order || 0,
      maxAttempts: maxAttempts || (type === "CONTROL" ? 1 : 3),
      deadline: deadline ? new Date(deadline) : null
    });
    await taskRepo().save(task);
    res.json({
      task
    });
  } catch (error: any) {
    console.error("Error creating task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.put("/:topicId/tasks/:taskId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(topicId) || isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UPDATE_TASKS"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id: taskId,
        topic: {
          id: topicId
        }
      } as any
    });
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const {
      title,
      description,
      template,
      maxAttempts
    } = req.body || {};
    if (!title || !description || !template) {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }
    task.title = title;
    task.description = description;
    task.template = template;
    if (maxAttempts !== undefined) {
      task.maxAttempts = maxAttempts;
    }
    await taskRepo().save(task);
    res.json({
      task
    });
  } catch (error: any) {
    console.error("Error updating task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks/generate-condition", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GENERATE"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    const {
      taskType,
      difficulty,
      language
    } = req.body || {};
    if (!taskType || taskType !== "PRACTICE" && taskType !== "CONTROL") {
      return res.status(400).json({
        message: "INVALID_TASK_TYPE"
      });
    }
    const userLanguage: "uk" | "en" = language === 'en' ? "en" : "uk";
    const result = await safeAICall('generateTaskCondition', {
      topicTitle: topic.title,
      taskType: taskType as "PRACTICE" | "CONTROL",
      difficulty: difficulty || 3,
      language: topic.language,
      userId: user.id,
      topicId: topic.id
    }, {
      language: userLanguage
    });
    if (!result.success) {
      return sendAIError(res, result.error);
    }
    res.json({
      description: result.data.description
    });
  } catch (error: any) {
    console.error("Error generating condition:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        error: error.error
      });
    }
    res.status(500).json({
      message: error.message || "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks/generate-template", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GENERATE"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    const {
      description
    } = req.body || {};
    const userLanguage: "uk" | "en" = req.headers['accept-language']?.includes('en') || req.body?.language === 'en' ? "en" : "uk";
    const result = await safeAICall('generateTaskTemplate', {
      topicTitle: topic.title,
      language: topic.language,
      description,
      userId: user.id,
      topicId: topic.id
    }, {
      language: userLanguage
    });
    if (!result.success) {
      return sendAIError(res, result.error);
    }
    res.json({
      template: result.data.template
    });
  } catch (error: any) {
    console.error("Error generating template:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        error: error.error
      });
    }
    res.status(500).json({
      message: error.message || "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.get("/control-works/:controlWorkId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic"]
    });
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const controlTasks = await taskRepo().find({
      where: {
        controlWork: {
          id: controlWork.id
        } as any,
        type: "CONTROL"
      } as any,
      order: {
        order: "ASC"
      }
    });
    res.json({
      controlWork: {
        ...controlWork,
        tasks: controlTasks
      }
    });
  } catch (error: any) {
    console.error("Error fetching control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.put("/control-works/:controlWorkId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UPDATE_CONTROL_WORKS"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      }
    });
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const {
      title,
      timeLimitMinutes,
      hasTheory,
      hasPractice,
      quizJson
    } = req.body || {};
    if (title !== undefined) controlWork.title = title;
    if (timeLimitMinutes !== undefined) controlWork.timeLimitMinutes = timeLimitMinutes;
    if (hasTheory !== undefined) controlWork.hasTheory = hasTheory;
    if (hasPractice !== undefined) controlWork.hasPractice = hasPractice;
    if (quizJson !== undefined) controlWork.quizJson = quizJson;
    await controlWorkRepo().save(controlWork);
    res.json({
      controlWork
    });
  } catch (error: any) {
    console.error("Error updating control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/control-works/:controlWorkId/generate-quiz", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GENERATE_QUIZ"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic"]
    });
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const {
      topicTitle,
      count
    } = req.body || {};
    const DEFAULT_QUIZ_COUNT = 12;
    const quizCount = count || DEFAULT_QUIZ_COUNT;
    const quizTopicTitle = topicTitle || controlWork.topic.title;
    if (!quizTopicTitle || !quizTopicTitle.trim()) {
      return res.status(400).json({
        message: "TOPIC_TITLE_REQUIRED"
      });
    }
    const language = controlWork.topic.language === "JAVA" || controlWork.topic.language === "PYTHON" ? controlWork.topic.language : "JAVA";
    const userLanguage: "uk" | "en" = req.headers['accept-language']?.includes('en') || req.body?.language === 'en' ? "en" : "uk";
    const result = await safeAICall('generateQuiz', {
      lang: language,
      prevTopics: quizTopicTitle.trim(),
      count: quizCount,
      userId: user.id,
      topicId: controlWork.topic.id
    }, {
      expectedCount: quizCount,
      language: userLanguage
    });
    if (!result.success) {
      return sendAIError(res, result.error);
    }
    const questions = JSON.parse(result.data.quizJson);
    if (!questions || !Array.isArray(questions) || questions.length === 0) {
      console.error("Empty or invalid questions array:", questions);
      throw new Error("EMPTY_QUIZ_GENERATED");
    }
    console.log("Saving quiz with", questions.length, "questions");
    controlWork.quizJson = result.data.quizJson;
    controlWork.hasTheory = true;
    await controlWorkRepo().save(controlWork);
    console.log("Quiz saved successfully, returning questions");
    res.json({
      questions
    });
  } catch (error: any) {
    console.error("Error generating quiz:", error);
    res.status(500).json({
      message: error.message || "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/control-works", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_CREATE_CONTROL_WORKS"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    const {
      title,
      timeLimitMinutes,
      hasTheory,
      hasPractice
    } = req.body || {};
    const controlWork = controlWorkRepo().create({
      topic: {
        id: topicId
      } as any,
      title: title || null,
      timeLimitMinutes: timeLimitMinutes || null,
      hasTheory: hasTheory || false,
      hasPractice: hasPractice !== undefined ? hasPractice : true,
      quizJson: null
    });
    await controlWorkRepo().save(controlWork);
    res.json({
      controlWork
    });
  } catch (error: any) {
    console.error("Error creating control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
function assertTheoryContentIsPure(content: string): void {
  const t = String(content ?? "").trim();
  if (!t) throw new Error("THEORY_EMPTY");
  const forbiddenHeaders = /(###\s*(Практика|Practice)\b)|(###\s*(Завдання|Вправа|Task|Exercise)\b)|(Умова\s+задачі)|(Формат\s+вхідних\s+даних)|(Формат\s+вихідних\s+даних)/i;
  if (forbiddenHeaders.test(t)) {
    throw new Error("THEORY_CONTAINS_PRACTICE");
  }
  const forbiddenImperatives = /\b(виконайте|обчисліть|знайдіть|розв\s*яжіть|напис(ати|іть)\s+програм(у|у)|зчитайте|прочитайте|введіть|input\s*\(|read\s+from\s+stdin)\b/i;
  if (forbiddenImperatives.test(t)) {
    throw new Error("THEORY_CONTAINS_TASK_INSTRUCTIONS");
  }
}
topicsRouter.get("/:topicId/theory-block", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) return res.status(400).json({
      message: "INVALID_TOPIC_ID"
    });
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      },
      relations: ["theoryBlock"]
    });
    if (!topic) return res.status(404).json({
      message: "TOPIC_NOT_FOUND"
    });
    return res.json({
      theoryBlock: topic.theoryBlock || null
    });
  } catch (error: any) {
    console.error("Error getting theory block:", error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/theory-block", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) return res.status(400).json({
      message: "INVALID_TOPIC_ID"
    });
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_EDIT_THEORY"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      },
      relations: ["theoryBlock"]
    });
    if (!topic) return res.status(404).json({
      message: "TOPIC_NOT_FOUND"
    });
    const {
      title,
      content,
      level,
      tags
    } = req.body || {};
    if (!content || !String(content).trim()) {
      return res.status(400).json({
        message: "CONTENT_REQUIRED"
      });
    }
    const normalizedContent = String(content).trim();
    assertTheoryContentIsPure(normalizedContent);
    const existingBlock = topic.theoryBlock;
    if (existingBlock) {
      existingBlock.title = String(title || existingBlock.title || topic.title).trim();
      existingBlock.content = normalizedContent;
      existingBlock.level = level === undefined ? existingBlock.level : level === null ? null : Number(level);
      existingBlock.tags = tags === undefined ? existingBlock.tags : tags === null ? null : JSON.stringify(tags);
      existingBlock.version = Number(existingBlock.version ?? 1) + 1;
      const saved = await theoryBlockRepo().save(existingBlock);
      return res.json({
        theoryBlock: saved
      });
    }
    const created = theoryBlockRepo().create({
      title: String(title || topic.title).trim(),
      content: normalizedContent,
      version: 1,
      level: level === undefined ? null : level === null ? null : Number(level),
      tags: tags === undefined ? null : tags === null ? null : JSON.stringify(tags)
    });
    const saved = await theoryBlockRepo().save(created);
    (topic as any).theoryBlock = {
      id: saved.id
    };
    await topicRepo().save(topic);
    return res.json({
      theoryBlock: saved
    });
  } catch (error: any) {
    const msg = error?.message || "INTERNAL_SERVER_ERROR";
    if (msg === "THEORY_EMPTY") return res.status(400).json({
      message: "THEORY_EMPTY"
    });
    if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({
      message: "THEORY_CONTAINS_PRACTICE"
    });
    if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({
      message: "THEORY_CONTAINS_TASK_INSTRUCTIONS"
    });
    console.error("Error saving theory block:", error);
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks/generate-theory", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_TOPIC_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_GENERATE_THEORY"
      });
    }
    const topic = await topicRepo().findOne({
      where: {
        id: topicId
      }
    });
    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }
    const {
      taskDescription,
      taskType,
      difficulty
    } = req.body || {};
    if (!taskDescription || !taskType) {
      return res.status(400).json({
        message: "TASK_DESCRIPTION_AND_TYPE_REQUIRED"
      });
    }
    const DEFAULT_DIFFICULTY = 3;
    const difficultyNum = difficulty ? parseInt(difficulty, 10) : DEFAULT_DIFFICULTY;
    if (isNaN(difficultyNum) || difficultyNum < 1 || difficultyNum > 5) {
      return res.status(400).json({
        message: "INVALID_DIFFICULTY"
      });
    }
    const userLanguage: "uk" | "en" = req.headers['accept-language']?.includes('en') || req.body?.language === 'en' ? "en" : "uk";
    const theoryResult = await safeAICall('generateTheory', {
      topicTitle: topic.title,
      taskDescription: taskDescription.trim(),
      taskType: taskType as "PRACTICE" | "CONTROL",
      difficulty: difficultyNum,
      lang: topic.language,
      userId: user.id,
      topicId: topic.id
    }, {
      language: userLanguage
    });
    if (!theoryResult.success) {
      return sendAIError(res, theoryResult.error);
    }
    res.json({
      theory: theoryResult.data.theory
    });
  } catch (error: any) {
    console.error("Error generating theory:", error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        message: error.message,
        error: error.error
      });
    }
    res.status(500).json({
      message: error.message || "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks/:taskId/theory", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(topicId) || isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_ADD_THEORY"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id: taskId,
        topic: {
          id: topicId
        }
      } as any,
      relations: ["theory"]
    });
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const {
      content
    } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({
        message: "CONTENT_REQUIRED"
      });
    }
    try {
      assertTheoryContentIsPure(content.trim());
    } catch (e: any) {
      const msg = e?.message;
      if (msg === "THEORY_EMPTY") return res.status(400).json({
        message: "THEORY_EMPTY"
      });
      if (msg === "THEORY_CONTAINS_PRACTICE") return res.status(400).json({
        message: "THEORY_CONTAINS_PRACTICE"
      });
      if (msg === "THEORY_CONTAINS_TASK_INSTRUCTIONS") return res.status(400).json({
        message: "THEORY_CONTAINS_TASK_INSTRUCTIONS"
      });
      return res.status(400).json({
        message: "INVALID_THEORY_CONTENT"
      });
    }
    let theory = task.theory;
    if (theory) {
      theory.content = content.trim();
      await theoryRepo().save(theory);
    } else {
      theory = theoryRepo().create({
        topicTask: {
          id: taskId
        } as any,
        content: content.trim()
      });
      await theoryRepo().save(theory);
    }
    res.json({
      theory
    });
  } catch (error: any) {
    console.error("Error adding theory:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/:topicId/tasks/:taskId/assign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(topicId) || isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_ASSIGN_TASKS"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id: taskId,
        topic: {
          id: topicId
        }
      } as any,
      relations: ["topic", "topic.class"]
    });
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    const {
      deadline
    } = req.body || {};
    if (!deadline) {
      return res.status(400).json({
        message: "DEADLINE_REQUIRED"
      });
    }
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return res.status(400).json({
        message: "INVALID_DEADLINE"
      });
    }
    let classId: number;
    if (task.topic.class) {
      classId = task.topic.class.id;
    } else {
      const cls = await classRepo().findOne({
        where: {
          teacher: {
            id: req.userId
          },
          language: task.topic.language
        },
        order: {
          createdAt: "DESC"
        }
      });
      if (!cls) {
        return res.status(400).json({
          message: "NO_CLASS_FOUND_FOR_TOPIC_LANGUAGE"
        });
      }
      classId = cls.id;
    }
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const students = await studentRepo().find({
      where: {
        class: {
          id: classId
        }
      } as any
    });
    task.isAssigned = true;
    task.deadline = deadlineDate;
    await taskRepo().save(task);
    const emailPromises = students.map(student => emailService.sendTaskAssignmentEmail(student.email, `${student.firstName} ${student.lastName}`, task.title, deadlineDate, task.type === "CONTROL" ? "CONTROL_WORK" : "PRACTICE").catch(err => {
      console.error(`Failed to send email to ${student.email}:`, err);
    }));
    await Promise.allSettled(emailPromises);
    res.json({
      message: "TASK_ASSIGNED_SUCCESSFULLY",
      assignedTo: students.length
    });
  } catch (error: any) {
    console.error("Error assigning task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/tasks/:taskId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_TASK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UNASSIGN"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id: taskId
      },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });
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
    await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const taskRepoManager = manager.getRepository(TopicTask);
      const gradeRepoManager = manager.getRepository(EduGrade);
      const summaryGradeRepoManager = manager.getRepository(SummaryGrade);
      const lockedTask = await manager.createQueryBuilder(TopicTask, "t").setLock("pessimistic_write").where("t.id = :taskId", {
        taskId
      }).getOne();
      if (!lockedTask) {
        throw new Error("TASK_NOT_FOUND");
      }
      lockedTask.isAssigned = false;
      lockedTask.deadline = null;
      await taskRepoManager.save(lockedTask);
      await gradeRepoManager.delete({
        topicTask: {
          id: taskId
        } as any
      });
    });
    res.json({
      message: "TASK_UNASSIGNED"
    });
  } catch (error) {
    console.error("Error unassigning task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/control-works/:controlWorkId/assign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_ASSIGN_TASKS"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic", "topic.class"]
    });
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    const {
      deadline
    } = req.body || {};
    if (!deadline) {
      return res.status(400).json({
        message: "DEADLINE_REQUIRED"
      });
    }
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime())) {
      return res.status(400).json({
        message: "INVALID_DEADLINE"
      });
    }
    let classId: number;
    if (controlWork.topic.class) {
      classId = controlWork.topic.class.id;
    } else {
      const cls = await classRepo().findOne({
        where: {
          teacher: {
            id: req.userId
          },
          language: controlWork.topic.language
        },
        order: {
          createdAt: "DESC"
        }
      });
      if (!cls) {
        return res.status(400).json({
          message: "NO_CLASS_FOUND_FOR_TOPIC_LANGUAGE"
        });
      }
      classId = cls.id;
    }
    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });
    if (!cls) {
      return res.status(403).json({
        message: "ACCESS_DENIED"
      });
    }
    const students = await studentRepo().find({
      where: {
        class: {
          id: classId
        }
      } as any
    });
    controlWork.isAssigned = true;
    controlWork.deadline = deadlineDate;
    await controlWorkRepo().save(controlWork);
    const emailPromises = students.map(student => emailService.sendTaskAssignmentEmail(student.email, `${student.firstName} ${student.lastName}`, controlWork.title || `Контрольна робота #${controlWork.id}`, deadlineDate, "CONTROL_WORK").catch(err => {
      console.error(`Failed to send email to ${student.email}:`, err);
    }));
    await Promise.allSettled(emailPromises);
    res.json({
      message: "CONTROL_WORK_ASSIGNED_SUCCESSFULLY",
      assignedTo: students.length
    });
  } catch (error: any) {
    console.error("Error assigning control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.post("/control-works/:controlWorkId/unassign", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_UNASSIGN"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic", "topic.class", "topic.class.teacher"]
    });
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
    await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const controlWorkRepoManager = manager.getRepository(ControlWork);
      const summaryGradeRepoManager = manager.getRepository(SummaryGrade);
      const gradeRepoManager = manager.getRepository(EduGrade);
      const lockedControlWork = await manager.createQueryBuilder(ControlWork, "cw").setLock("pessimistic_write").where("cw.id = :controlWorkId", {
        controlWorkId
      }).leftJoinAndSelect("cw.topic", "topic").leftJoinAndSelect("topic.tasks", "tasks").getOne();
      if (!lockedControlWork) {
        throw new Error("CONTROL_WORK_NOT_FOUND");
      }
      lockedControlWork.isAssigned = false;
      lockedControlWork.deadline = null;
      await controlWorkRepoManager.save(lockedControlWork);
      await summaryGradeRepoManager.delete({
        controlWork: {
          id: controlWorkId
        } as any
      });
      const controlTasks = (lockedControlWork.topic.tasks || []).filter(t => t.type === "CONTROL");
      const taskIds = controlTasks.map(t => t.id);
      if (taskIds.length > 0) {
        for (const taskId of taskIds) {
          await gradeRepoManager.delete({
            topicTask: {
              id: taskId
            } as any
          });
        }
      }
    });
    res.json({
      message: "CONTROL_WORK_UNASSIGNED"
    });
  } catch (error) {
    console.error("Error unassigning control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.delete("/:topicId/tasks/:taskId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.topicId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(topicId) || isNaN(taskId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_DELETE_TASKS"
      });
    }
    const task = await taskRepo().findOne({
      where: {
        id: taskId,
        topic: {
          id: topicId
        }
      } as any,
      relations: ["topic", "topic.class"]
    });
    if (!task) {
      return res.status(404).json({
        message: "TASK_NOT_FOUND"
      });
    }
    if (task.topic.class) {
      const cls = await classRepo().findOne({
        where: {
          id: task.topic.class.id,
          teacher: {
            id: req.userId
          }
        }
      });
      if (!cls) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    } else {
      const cls = await classRepo().findOne({
        where: {
          teacher: {
            id: req.userId
          },
          language: task.topic.language
        }
      });
      if (!cls) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    const gradeRepo = () => AppDataSource.getRepository(EduGrade);
    await gradeRepo().delete({
      topicTask: {
        id: taskId
      } as any
    });
    if (task.theory) {
      await theoryRepo().remove(task.theory);
    }
    await taskRepo().remove(task);
    res.json({
      message: "TASK_DELETED"
    });
  } catch (error: any) {
    console.error("Error deleting task:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
topicsRouter.delete("/control-works/:controlWorkId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const controlWorkId = parseInt(req.params.controlWorkId, 10);
    if (isNaN(controlWorkId)) {
      return res.status(400).json({
        message: "INVALID_CONTROL_WORK_ID"
      });
    }
    const user = await userRepo().findOne({
      where: {
        id: req.userId
      }
    });
    if (!user || user.userMode !== "EDUCATIONAL" || req.studentId) {
      return res.status(403).json({
        message: "ONLY_TEACHERS_CAN_DELETE_CONTROL_WORKS"
      });
    }
    const controlWork = await controlWorkRepo().findOne({
      where: {
        id: controlWorkId
      },
      relations: ["topic", "topic.class"]
    });
    if (!controlWork) {
      return res.status(404).json({
        message: "CONTROL_WORK_NOT_FOUND"
      });
    }
    if (controlWork.topic.class) {
      const cls = await classRepo().findOne({
        where: {
          id: controlWork.topic.class.id,
          teacher: {
            id: req.userId
          }
        }
      });
      if (!cls) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    } else {
      const cls = await classRepo().findOne({
        where: {
          teacher: {
            id: req.userId
          },
          language: controlWork.topic.language
        }
      });
      if (!cls) {
        return res.status(403).json({
          message: "ACCESS_DENIED"
        });
      }
    }
    const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);
    await summaryGradeRepo().delete({
      controlWork: {
        id: controlWorkId
      } as any
    });
    const controlTasks = (controlWork.topic.tasks || []).filter(t => t.type === "CONTROL");
    const taskIds = controlTasks.map(t => t.id);
    if (taskIds.length > 0) {
      const gradeRepo = () => AppDataSource.getRepository(EduGrade);
      for (const taskId of taskIds) {
        await gradeRepo().delete({
          topicTask: {
            id: taskId
          } as any
        });
      }
    }
    await controlWorkRepo().remove(controlWork);
    res.json({
      message: "CONTROL_WORK_DELETED"
    });
  } catch (error: any) {
    console.error("Error deleting control work:", error);
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
export default topicsRouter;