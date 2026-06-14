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
import { normalizeScaleMode } from "../../utils/gradingScale";
import { computeThematicGrade, resolveThematicFormula, validateThematicFormula } from "../../utils/thematicFormula";
import { recomputeSemesterGrades } from "../../services/edu/semesterGrading";
import { notifyStudentGradeChange } from "../../services/edu/gradeNotificationService";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { isAssignedToStudent } from "../../utils/assignmentVisibility";
import { logger } from "../../utils/logger";
import { buildLiveSnapshot, type LiveAttempt, type LiveStudent } from "../../services/edu/liveMonitor";
import { buildSkillTree, type SkillTopicInput } from "../../services/learning/skillTree";
import { buildProgressReportModel, renderProgressReportHtml } from "../../services/reports/progressReport";
import { renderHtmlToPdf } from "../../services/certificates/CertificateRenderer";

const router = Router();

const studentRepo = () => AppDataSource.getRepository(Student);

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

function semesterLabelForLocale(locale: "uk" | "en", semester: number): string {
  return locale === "en" ? `Semester ${semester}` : `Семестр ${semester}`;
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
      type: "TOPIC" | "CONTROL" | "SUMMARY" | "SEMESTER";
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

    // Append a column per semester that actually has aggregate grades, so the
    // semester columns only appear once the teacher has recomputed them.
    const semesterRows = await summaryGradeRepo()
      .createQueryBuilder("sg")
      .select("DISTINCT sg.semester", "semester")
      .where("sg.class_id = :classId", { classId })
      .andWhere("sg.assessment_type = :type", { type: AssessmentType.SEMESTER })
      .andWhere("sg.semester IS NOT NULL")
      .getRawMany();
    const semesters = semesterRows
      .map(r => Number(r.semester))
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (const semester of semesters) {
      const semesterLabel = semesterLabelForLocale(locale, semester);
      lessons.push({
        id: semester,
        title: semesterLabel,
        type: "SEMESTER",
        tasks: [{
          id: semester,
          title: semesterLabel,
          type: "SEMESTER"
        }]
      });
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
        } else if (lesson.type === "SEMESTER") {
          const semesterGrade = summaryGrades.find((sg: any) => sg.assessmentType === AssessmentType.SEMESTER && Number(sg.semester) === lesson.id);
          flatGrades.push({
            taskId: lesson.id,
            taskTitle: lesson.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonType: "SEMESTER",
            grade: semesterGrade ? clampGradeToInt(semesterGrade.grade) : null,
            createdAt: semesterGrade ? semesterGrade.createdAt.toISOString() : null,
            gradeId: semesterGrade ? semesterGrade.id : null,
            isSemesterGrade: true
          });
        } else {
          for (const task of lesson.tasks) {
            const grades = allGrades.filter(g => g.topicTask && g.topicTask.id === task.id);
            // Use the LATEST attempt to stay consistent with the student-facing
            // views (routes/edu/students.ts) and the authoritative control-work
            // aggregation (services/edu/controlWorkGrading.ts), which all key off
            // the most recent attempt. Previously this showed the BEST attempt's
            // total while reporting the latest attempt's id/date — so a teacher
            // could see a grade a student did not, and vice versa.
            const latestGrade = grades.length > 0 ? [...grades].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] : null;
            flatGrades.push({
              taskId: task.id,
              taskTitle: task.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              lessonType: lesson.type,
              grade: latestGrade ? latestGrade.total : null,
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
      gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
      gradeScaleMode: normalizeScaleMode(cls.gradeScaleMode)
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
      // Effective formula: per-topic override > class default > built-in smart default.
      const thematicFormula = resolveThematicFormula(topic.thematicFormula, cls.thematicFormula);

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

        const practiceGrades = classGrades.filter(g => !(g.topicTask && g.topicTask.type === "CONTROL"));
        const practiceBestGrades: Record<string, number> = {};
        practiceGrades.forEach(g => {
          // Namespaced string keys so task and topicTask ids can never collide
          // (the previous "+1000000" offset breaks once a task id reaches 1e6).
          let taskKey: string | null = null;
          if (g.task) {
            taskKey = `task:${g.task.id}`;
          } else if (g.topicTask) {
            taskKey = `topicTask:${g.topicTask.id}`;
          }
          if (taskKey !== null && (!practiceBestGrades[taskKey] || (g.total || 0) > practiceBestGrades[taskKey])) {
            practiceBestGrades[taskKey] = g.total || 0;
          }
        });
        const practiceScores = Object.values(practiceBestGrades);

        // Control-work grades live in SummaryGrade, independent of practice
        // grades — gather them unconditionally so a topic with only a control
        // work still produces a real thematic grade.
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
        const controlScores = controlSummaryGrades
          .map(sg => Number(sg.grade))
          .filter(v => Number.isFinite(v));

        const hasPractice = practiceScores.length > 0;
        const hasControl = controlScores.length > 0;
        const practiceAvg = hasPractice ? practiceScores.reduce((s, v) => s + v, 0) / practiceScores.length : 0;
        const controlAvg = hasControl ? controlScores.reduce((s, v) => s + v, 0) / controlScores.length : 0;

        const grade = computeThematicGrade(
          { practice: practiceAvg, control: controlAvg, hasPractice, hasControl },
          thematicFormula
        );

        const sg = summaryGradeRepo().create({
          class: cls,
          student,
          name: normalizedName,
          grade,
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
        gradeScaleMode: normalizeScaleMode(cls.gradeScaleMode),
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
      gradeScaleMode: normalizeScaleMode(sg.class?.gradeScaleMode),
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

// Normalize a teacher-entered formula: trim, empty -> null (= use default).
function normalizeFormulaInput(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

// Resolve the class for a thematic-config request, enforcing teacher-of-class
// (or SYSTEM_ADMIN) access. Returns the class or null (response already sent).
async function loadTeacherClassForConfig(req: AuthRequest, res: Response, classId: number): Promise<Class | null> {
  if (req.userType === "STUDENT" || req.studentId) {
    res.status(403).json({ message: "ONLY_TEACHERS_CAN_EDIT_FORMULA" });
    return null;
  }
  const cls = await classRepo().findOne({ where: { id: classId }, relations: ["teacher"] });
  if (!cls) {
    res.status(404).json({ message: "CLASS_NOT_FOUND" });
    return null;
  }
  if (cls.teacher.id !== req.userId) {
    const user = await userRepo().findOne({ where: { id: req.userId } });
    if (!user || user.role !== "SYSTEM_ADMIN") {
      res.status(403).json({ message: "ACCESS_DENIED" });
      return null;
    }
  }
  return cls;
}

// Thematic-grade formula config: the class-level default plus every topic's
// per-topic override. Used by the gradebook settings UI.
router.get("/classes/:classId/thematic-config", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .where("topic.class_id = :classId", { classId })
      .orderBy("topic.order", "ASC")
      .addOrderBy("topic.id", "ASC")
      .getMany();

    return res.json({
      classFormula: cls.thematicFormula ?? null,
      topics: topics.map(t => ({
        topicId: t.id,
        title: t.title,
        thematicFormula: t.thematicFormula ?? null,
        semester: t.semester ?? null
      }))
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error loading thematic config", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Set the class-level default thematic formula. Empty -> built-in default.
router.put("/classes/:classId/thematic-formula", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const formula = normalizeFormulaInput(req.body?.formula);
    if (!validateThematicFormula(formula)) {
      return res.status(400).json({ message: "INVALID_FORMULA" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    cls.thematicFormula = formula;
    await classRepo().save(cls);
    return res.json({ message: "FORMULA_UPDATED", classFormula: cls.thematicFormula ?? null });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating class thematic formula", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Set a per-topic thematic formula override. Empty -> inherit the class formula.
router.put("/classes/:classId/topics/:topicId/thematic-formula", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const formula = normalizeFormulaInput(req.body?.formula);
    if (!validateThematicFormula(formula)) {
      return res.status(400).json({ message: "INVALID_FORMULA" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const topic = await topicRepo().findOne({ where: { id: topicId, class: { id: classId } as any } as any });
    if (!topic) {
      return res.status(404).json({ message: "TOPIC_NOT_FOUND" });
    }

    topic.thematicFormula = formula;
    await topicRepo().save(topic);
    return res.json({ message: "FORMULA_UPDATED", topicId, thematicFormula: topic.thematicFormula ?? null });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating topic thematic formula", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Assign a topic to a semester (1, 2, …). null/empty clears the assignment
// (topic falls back to semester 1 when aggregating).
router.put("/classes/:classId/topics/:topicId/semester", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const topicId = parseInt(req.params.topicId, 10);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const topic = await topicRepo().findOne({ where: { id: topicId, class: { id: classId } as any } as any });
    if (!topic) {
      return res.status(404).json({ message: "TOPIC_NOT_FOUND" });
    }

    const raw = req.body?.semester;
    if (raw === null || raw === undefined || raw === "") {
      topic.semester = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || n > 12) {
        return res.status(400).json({ message: "INVALID_SEMESTER" });
      }
      topic.semester = Math.floor(n);
    }
    await topicRepo().save(topic);
    return res.json({ message: "SEMESTER_UPDATED", topicId, semester: topic.semester ?? null });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating topic semester", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Recompute all semester aggregate grades for a class (avg of thematic grades
// per semester per student).
router.post("/classes/:classId/semester-grades/recompute", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const result = await recomputeSemesterGrades(classId);
    return res.json({ message: "SEMESTER_GRADES_RECOMPUTED", ...result });
  } catch (error) {
    logger.error("[edu/gradebook] Error recomputing semester grades", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// List semester aggregate grades for a class (teacher view).
router.get("/classes/:classId/semester-grades", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const rows = await summaryGradeRepo()
      .createQueryBuilder("sg")
      .leftJoinAndSelect("sg.student", "student")
      .where("sg.class_id = :classId", { classId })
      .andWhere("sg.assessment_type = :type", { type: AssessmentType.SEMESTER })
      .orderBy("sg.semester", "ASC")
      .getMany();

    return res.json({
      semesterGrades: rows.map(sg => ({
        gradeId: sg.id,
        studentId: sg.student?.id ?? null,
        semester: sg.semester ?? null,
        grade: clampGradeToInt(sg.grade)
      }))
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error listing semester grades", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Manually override a single semester aggregate grade.
router.put("/classes/:classId/semester-grades/:gradeId", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    const gradeId = parseInt(req.params.gradeId, 10);
    if (isNaN(classId) || isNaN(gradeId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const row = await summaryGradeRepo()
      .createQueryBuilder("sg")
      .where("sg.id = :gradeId", { gradeId })
      .andWhere("sg.class_id = :classId", { classId })
      .andWhere("sg.assessment_type = :type", { type: AssessmentType.SEMESTER })
      .getOne();
    if (!row) {
      return res.status(404).json({ message: "SEMESTER_GRADE_NOT_FOUND" });
    }

    const grade = clampGradeToInt(req.body?.grade);
    row.grade = grade;
    await summaryGradeRepo().save(row);
    return res.json({ message: "SEMESTER_GRADE_UPDATED", gradeId, grade: clampGradeToInt(row.grade) });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating semester grade", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Live class monitor for a single topic-task: who is stuck / in-progress /
// passed / not-started, refreshed by teacher polling. Teacher-of-class (or
// admin) only. Read-only aggregation over edu_grades.
router.get("/classes/:classId/topic-tasks/:taskId/live", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType === "STUDENT" || req.studentId) {
      return res.status(403).json({ message: "ONLY_TEACHERS_CAN_VIEW_LIVE" });
    }
    if (!req.userId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }

    const classId = parseInt(req.params.classId, 10);
    const taskId = parseInt(req.params.taskId, 10);
    if (isNaN(classId) || isNaN(taskId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }

    const isAdmin = req.userRole === "SYSTEM_ADMIN";
    const cls = await classRepo().findOne({
      where: isAdmin ? { id: classId } : { id: classId, teacher: { id: req.userId } },
      relations: ["students"],
    });
    if (!cls) {
      return res.status(404).json({ message: "CLASS_NOT_FOUND" });
    }

    const roster: LiveStudent[] = (cls.students || []).map((s) => ({
      studentId: s.id,
      name: `${s.lastName ?? ""} ${s.firstName ?? ""}`.trim() || `#${s.id}`,
    }));

    const grades = await gradeRepo().find({
      where: { topicTask: { id: taskId } },
      relations: ["student"],
    });

    const attempts: LiveAttempt[] = grades
      .filter((g) => g.student)
      .map((g) => {
        const tp = Number(g.testsPassed ?? 0);
        const tt = Number(g.testsTotal ?? 0);
        const verdict = tt > 0 && tp >= tt ? "AC" : "WA";
        return {
          studentId: g.student.id,
          verdict,
          testsPassed: tp,
          testsTotal: tt,
          updatedAtMs: g.updatedAt ? new Date(g.updatedAt).getTime() : null,
        };
      });

    disableCache(res);
    return res.json(buildLiveSnapshot(roster, attempts, Date.now()));
  } catch (error: any) {
    logger.error("[edu/gradebook] live monitor failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Per-topic practice mastery (0..100) for a student, derived from actual
// EduGrade rows. `TopicProgress.practiceAverage` is never written anywhere in
// the backend (grades live in `edu_grades`), so reading it always yielded 0% —
// the skill-tree and progress report must compute mastery from grades instead.
//
// Mastery for a topic = average of the latest attempt's grade across the
// student's assigned PRACTICE tasks, with un-attempted tasks counted as 0 so
// the value reflects progress through the topic (not just the best task done).
async function computePracticeMasteryByTopic(
  studentId: number,
  classId: number
): Promise<Map<number, { practiceAverage: number | null; started: boolean }>> {
  const topics = await topicRepo()
    .createQueryBuilder("topic")
    .leftJoinAndSelect("topic.tasks", "task", "task.type = :practiceType", { practiceType: "PRACTICE" })
    .where("topic.class_id = :classId", { classId })
    .getMany();

  // Latest practice grade per topicTask for this student. Ordered newest-first
  // so the first row seen for a task is the latest attempt (mirrors the
  // student-facing views in routes/edu/students.ts).
  const grades = await gradeRepo()
    .createQueryBuilder("grade")
    .leftJoinAndSelect("grade.topicTask", "topicTask")
    .where("grade.student_id = :studentId", { studentId })
    .andWhere("grade.topic_task_id IS NOT NULL")
    .orderBy("grade.created_at", "DESC")
    .getMany();

  const latestByTask = new Map<number, number>();
  for (const g of grades) {
    if (!g.topicTask) continue;
    if (latestByTask.has(g.topicTask.id)) continue;
    latestByTask.set(g.topicTask.id, clampGradeToInt(g.total));
  }

  const result = new Map<number, { practiceAverage: number | null; started: boolean }>();
  for (const topic of topics) {
    const tasks = (topic.tasks || []).filter((t) =>
      isAssignedToStudent(t.isAssigned, (t as any).assignedStudentIds, studentId)
    );
    if (tasks.length === 0) {
      result.set(topic.id, { practiceAverage: null, started: false });
      continue;
    }
    let sum = 0;
    let graded = 0;
    for (const t of tasks) {
      const val = latestByTask.get(t.id);
      if (val != null) {
        sum += val;
        graded += 1;
      }
    }
    result.set(topic.id, { practiceAverage: sum / tasks.length, started: graded > 0 });
  }
  return result;
}

// Personal skill-tree / concept map for the authenticated STUDENT: their class
// topics as nodes with mastery (from graded practice tasks), linear
// prerequisites, and the recommended next node.
router.get("/my/skill-tree", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS" });
    }

    const student = await studentRepo().findOne({ where: { id: req.studentId } as any, relations: ["class"] });
    if (!student?.class) return res.status(404).json({ message: "NO_CLASS" });
    const classId = student.class.id;

    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .where("topic.class_id = :classId", { classId })
      .orderBy("topic.order", "ASC")
      .getMany();

    const masteryByTopic = await computePracticeMasteryByTopic(req.studentId, classId);

    const inputs: SkillTopicInput[] = topics.map((t, i) => {
      const m = masteryByTopic.get(t.id);
      return {
        id: t.id,
        title: t.title,
        order: t.order ?? i,
        prerequisites: i > 0 ? [topics[i - 1].id] : [],
        masteryPct: Math.max(0, Math.min(1, (Number(m?.practiceAverage) || 0) / 100)),
        started: m?.started ?? false,
      };
    });

    disableCache(res);
    return res.json(buildSkillTree(inputs));
  } catch (error: any) {
    logger.error("[edu/gradebook] skill-tree failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Printable progress report (PDF) for the authenticated STUDENT.
router.get("/my/progress-report.pdf", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    if (req.userType !== "STUDENT" || !req.studentId) {
      return res.status(403).json({ message: "ONLY_STUDENTS" });
    }
    const student = await studentRepo().findOne({ where: { id: req.studentId } as any, relations: ["class"] });
    if (!student?.class) return res.status(404).json({ message: "NO_CLASS" });

    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .where("topic.class_id = :classId", { classId: student.class.id })
      .orderBy("topic.order", "ASC")
      .getMany();

    const masteryByTopic = await computePracticeMasteryByTopic(req.studentId, student.class.id);

    const model = buildProgressReportModel({
      studentName: `${student.lastName ?? ""} ${student.firstName ?? ""}`.trim() || `#${student.id}`,
      className: (student.class as any).name ?? null,
      generatedAt: new Date(),
      topics: topics.map((t) => {
        const m = masteryByTopic.get(t.id);
        const practiceAverage = m?.practiceAverage ?? null;
        const masteryPct = practiceAverage != null ? Math.max(0, Math.min(1, practiceAverage / 100)) : 0;
        const status = masteryPct >= 0.8 ? "COMPLETED" : m?.started ? "IN_PROGRESS" : "NOT_STARTED";
        return {
          title: t.title,
          masteryPct,
          status,
          practiceAverage,
          controlGrade: null,
        };
      }),
    });

    const html = renderProgressReportHtml(model);
    try {
      const pdf = await renderHtmlToPdf(html, { landscape: false, format: "A4" });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'inline; filename="progress-report.pdf"');
      return res.send(pdf);
    } catch (renderErr: any) {
      logger.warn("[edu/gradebook] progress-report PDF render unavailable", { requestId: req.requestId, error: renderErr?.message });
      return res.status(503).json({ message: "PDF_RENDER_UNAVAILABLE" });
    }
  } catch (error: any) {
    logger.error("[edu/gradebook] progress-report failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
