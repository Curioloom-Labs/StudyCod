import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { TopicNew } from "../../entities/TopicNew";
import { User } from "../../entities/User";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType, validateAssessmentType } from "../../types/AssessmentType";
import { DEFAULT_GRADING_SYSTEM } from "../../types/GradingSystem";
import { notifyStudentGradeChange } from "../../services/edu/gradeNotificationService";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { logger } from "../../utils/logger";

const router = Router();

const userRepo = () => AppDataSource.getRepository(User);
const classRepo = () => AppDataSource.getRepository(Class);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const gradeRepo = () => AppDataSource.getRepository(EduGrade);
const summaryGradeRepo = () => AppDataSource.getRepository(SummaryGrade);

function resolveRequestLocale(req: AuthRequest): "uk" | "en" {
  return resolveUiLocaleFromHeaders(req.headers, "uk");
}

function disableCache(res: Response) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

function clampGradeToInt(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const THEMATIC_CANONICAL_NAME = "THEMATIC";

function isThematicSummaryName(raw: unknown): boolean {
  const normalized = String(raw ?? "").trim().toLowerCase();
  return normalized === "тематична" || normalized === "thematic";
}

function canonicalizeSummaryGradeName(raw: unknown): string {
  const normalized = String(raw ?? "").trim();
  if (!normalized) return "";
  return isThematicSummaryName(normalized) ? THEMATIC_CANONICAL_NAME : normalized;
}

function thematicLabelForLocale(locale: "uk" | "en"): string {
  return locale === "en" ? "Thematic" : "Тематична";
}

router.get("/classes/:classId/gradebook", authRequired, async (req: AuthRequest, res: Response) => {
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
    const locale = resolveRequestLocale(req);
    const thematicLabel = thematicLabelForLocale(locale);

    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      },
      relations: ["students"]
    });

    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

    const students = cls.students || [];
    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .leftJoinAndSelect("topic.tasks", "task")
      .leftJoinAndSelect("topic.controlWorks", "controlWork")
      .where("topic.class_id = :classId", {
        classId
      })
      .orderBy("topic.order", "ASC")
      .addOrderBy("task.order", "ASC")
      .getMany();

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
        title: thematicLabel,
        type: "SUMMARY",
        parentId: topic.id,
        parentTitle: topic.title,
        tasks: [{
          id: topic.id,
          title: thematicLabel,
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
      const allGrades = await gradeRepo()
        .createQueryBuilder("grade")
        .leftJoinAndSelect("grade.topicTask", "topicTask")
        .leftJoinAndSelect("topicTask.topic", "topic")
        .leftJoinAndSelect("topicTask.controlWork", "controlWork")
        .where("grade.student_id = :studentId", {
          studentId: student.id
        })
        .getMany();

      const summaryGrades = await summaryGradeRepo()
        .createQueryBuilder("summaryGrade")
        .leftJoinAndSelect("summaryGrade.controlWork", "controlWork")
        .leftJoinAndSelect("summaryGrade.topic", "topic")
        .where("summaryGrade.student_id = :studentId", {
          studentId: student.id
        })
        .getMany();

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
          const thematic = summaryGrades.find((sg: any) => sg.topic && sg.topic.id === topicId && sg.assessmentType === AssessmentType.INTERMEDIATE && isThematicSummaryName(sg.name));
          flatGrades.push({
            taskId: topicId,
            taskTitle: thematicLabel,
            lessonId: lesson.id,
            lessonTitle: lesson.parentTitle || (locale === "en" ? "Topic" : "Тема"),
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
    return res.json({
      students: gradebookStudents,
      lessons,
      gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error fetching gradebook", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/classes/:classId/summary-grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const locale = resolveRequestLocale(req);
    const thematicLabel = thematicLabelForLocale(locale);

    const cls = await classRepo().findOne({
      where: {
        id: classId,
        teacher: {
          id: req.userId
        }
      }
    });

    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

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
      const canonicalName = canonicalizeSummaryGradeName(sg.name);
      const displayName = canonicalName === THEMATIC_CANONICAL_NAME ? thematicLabel : String(sg.name || "").trim();
      if (!groups[displayName]) groups[displayName] = [];
      groups[displayName].push({
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
    return res.json({
      summaryGrades
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error listing summary grades", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/classes/:classId/summary-grades", authRequired, async (req: AuthRequest, res: Response) => {
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

    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

    const { name, topicId, studentGrades } = req.body;
    const normalizedName = canonicalizeSummaryGradeName(name);

    if (!normalizedName) {
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

    const deleteExistingBuilder = summaryGradeRepo()
      .createQueryBuilder()
      .delete()
      .from(SummaryGrade)
      .where("class_id = :classId", {
        classId
      })
      .andWhere("topic_id = :topicId", {
        topicId: topic.id
      })
      .andWhere("assessment_type = :assessmentType", {
        assessmentType: AssessmentType.INTERMEDIATE
      })
      .andWhere("control_work_id IS NULL");

    if (normalizedName === THEMATIC_CANONICAL_NAME) {
      deleteExistingBuilder.andWhere("LOWER(TRIM(name)) IN (:...legacyNames)", {
        legacyNames: ["thematic", "тематична"]
      });
    } else {
      deleteExistingBuilder.andWhere("name = :name", {
        name: normalizedName
      });
    }

    const existingBeforeBuilder = summaryGradeRepo()
      .createQueryBuilder("sg")
      .leftJoinAndSelect("sg.student", "student")
      .where("sg.class_id = :classId", { classId })
      .andWhere("sg.topic_id = :topicId", { topicId: topic.id })
      .andWhere("sg.assessment_type = :assessmentType", { assessmentType: AssessmentType.INTERMEDIATE })
      .andWhere("sg.control_work_id IS NULL");

    if (normalizedName === THEMATIC_CANONICAL_NAME) {
      existingBeforeBuilder.andWhere("LOWER(TRIM(sg.name)) IN (:...legacyNames)", {
        legacyNames: ["thematic", "тематична"]
      });
    } else {
      existingBeforeBuilder.andWhere("sg.name = :name", { name: normalizedName });
    }

    const existingBefore = await existingBeforeBuilder.getMany();
    const hadGradesByStudentId = new Set<number>(
      existingBefore
        .map(row => row.student?.id)
        .filter((id): id is number => Number.isFinite(Number(id)))
    );

    await deleteExistingBuilder.execute();

    const results = [];
    const pendingNotifications: Array<{ student: Student; grade: number; event: "created" | "updated" }> = [];

    if (studentGrades && Array.isArray(studentGrades) && studentGrades.length > 0) {
      for (const item of studentGrades) {
        const student = cls.students.find(s => s.id === item.studentId);
        if (!student) continue;

        const sg = summaryGradeRepo().create({
          class: cls,
          student,
          name: normalizedName,
          grade: clampGradeToInt(item.grade),
          topic,
          assessmentType: AssessmentType.INTERMEDIATE,
          controlWork: null
        });

        validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
        await summaryGradeRepo().save(sg);
        results.push(sg);
        pendingNotifications.push({
          student,
          grade: sg.grade,
          event: hadGradesByStudentId.has(student.id) ? "updated" : "created"
        });
      }
    } else {
      for (const student of cls.students) {
        const classGrades = await gradeRepo()
          .createQueryBuilder("grade")
          .leftJoinAndSelect("grade.topicTask", "topicTask")
          .leftJoinAndSelect("topicTask.topic", "topic")
          .where("grade.student_id = :studentId", {
            studentId: student.id
          })
          .andWhere("topic.id = :topicId", {
            topicId: topic.id
          })
          .getMany();

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
          const controlSummaryGrades = await summaryGradeRepo()
            .createQueryBuilder("sg")
            .leftJoinAndSelect("sg.controlWork", "cw")
            .where("sg.student_id = :studentId", {
              studentId: student.id
            })
            .andWhere("sg.assessment_type = :type", {
              type: AssessmentType.CONTROL
            })
            .andWhere("sg.topic_id = :topicId", {
              topicId: topic.id
            })
            .getMany();

          const controlScores = controlSummaryGrades.map(sg => Number(sg.grade) || 0).filter(v => Number.isFinite(v));
          const allScores = [...practiceScores, ...controlScores];

          if (allScores.length === 0) {
            const sg = summaryGradeRepo().create({
              class: cls,
              student,
              name: normalizedName,
              grade: 0,
              topic,
              assessmentType: AssessmentType.INTERMEDIATE,
              controlWork: null
            });
            validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
            await summaryGradeRepo().save(sg);
            results.push(sg);
            pendingNotifications.push({
              student,
              grade: sg.grade,
              event: hadGradesByStudentId.has(student.id) ? "updated" : "created"
            });
            continue;
          }

          const avg = allScores.length > 0 ? clampGradeToInt(allScores.reduce((s, val) => s + val, 0) / allScores.length) : 0;
          const sg = summaryGradeRepo().create({
            class: cls,
            student,
            name: normalizedName,
            grade: avg,
            topic,
            assessmentType: AssessmentType.INTERMEDIATE,
            controlWork: null
          });

          validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
          await summaryGradeRepo().save(sg);
          results.push(sg);
          pendingNotifications.push({
            student,
            grade: sg.grade,
            event: hadGradesByStudentId.has(student.id) ? "updated" : "created"
          });
        } else {
          const sg = summaryGradeRepo().create({
            class: cls,
            student,
            name: normalizedName,
            grade: 0,
            topic,
            assessmentType: AssessmentType.INTERMEDIATE,
            controlWork: null
          });

          validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
          await summaryGradeRepo().save(sg);
          results.push(sg);
          pendingNotifications.push({
            student,
            grade: sg.grade,
            event: hadGradesByStudentId.has(student.id) ? "updated" : "created"
          });
        }
      }
    }

    res.status(201).json({
      count: results.length,
      name: normalizedName
    });

    const fallbackLocale = resolveRequestLocale(req);
    for (const item of pendingNotifications) {
      void notifyStudentGradeChange({
        student: {
          id: item.student.id,
          email: item.student.email,
          firstName: item.student.firstName,
          lastName: item.student.lastName,
          middleName: item.student.middleName,
          uiLanguage: item.student.uiLanguage
        },
        kind: "summary",
        event: item.event,
        itemTitle: normalizedName,
        grade: item.grade,
        className: cls.name,
        gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
        fallbackLocale,
        requestId: req.requestId
      });
    }
  } catch (error) {
    logger.error("[edu/gradebook] Error creating summary grades", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.put("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
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
      relations: ["class", "class.teacher", "student", "topic", "controlWork"]
    });

    if (!sg || sg.class.teacher.id !== req.userId) {
      return res.status(404).json({
        message: "SUMMARY_GRADE_NOT_FOUND"
      });
    }

    const { grade } = req.body;
    if (grade === undefined) {
      return res.status(400).json({
        message: "GRADE_REQUIRED"
      });
    }

    sg.grade = clampGradeToInt(grade);
    await summaryGradeRepo().save(sg);

    res.json({
      summaryGrade: sg
    });

    void notifyStudentGradeChange({
      student: {
        id: sg.student.id,
        email: sg.student.email,
        firstName: sg.student.firstName,
        lastName: sg.student.lastName,
        middleName: sg.student.middleName,
        uiLanguage: sg.student.uiLanguage
      },
      kind: sg.controlWork ? "control" : "summary",
      event: "updated",
      itemTitle: sg.name || sg.controlWork?.title || sg.topic?.title || `Summary #${sg.id}`,
      grade: sg.grade,
      className: sg.class?.name ?? null,
      gradingSystem: sg.class?.gradingSystem || DEFAULT_GRADING_SYSTEM,
      fallbackLocale: resolveRequestLocale(req),
      requestId: req.requestId
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating summary grade", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.delete("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
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
    return res.json({
      message: "SUMMARY_GRADE_DELETED"
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error deleting summary grade", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.delete("/classes/:classId/topics/:topicId/thematic", authRequired, async (req: AuthRequest, res: Response) => {
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

    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

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

    if (!topic) {
      return res.status(404).json({
        message: "TOPIC_NOT_FOUND"
      });
    }

    const result = await summaryGradeRepo()
      .createQueryBuilder()
      .delete()
      .from(SummaryGrade)
      .where("class_id = :classId", {
        classId
      })
      .andWhere("topic_id = :topicId", {
        topicId
      })
      .andWhere("assessment_type = :type", {
        type: AssessmentType.INTERMEDIATE
      })
      .andWhere("control_work_id IS NULL")
      .andWhere("LOWER(TRIM(name)) IN (:...legacyNames)", {
        legacyNames: ["thematic", "тематична"]
      })
      .execute();

    return res.json({
      message: "THEMATIC_DELETED",
      deleted: result.affected || 0
    });
  } catch (error: any) {
    logger.error("[edu/gradebook] Error deleting thematic", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
