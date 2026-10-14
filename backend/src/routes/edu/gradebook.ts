import { gradeReviewRevision, summaryReviewRevision, emptyReviewRevision, requireReviewRevision } from "../../services/edu/reviewRevision";
import { Router, Response } from "express";
import { AppDataSource } from "../../data-source";
import { authRequired, AuthRequest } from "../../middleware/authMiddleware";
import { Class } from "../../entities/Class";
import { Student } from "../../entities/Student";
import { TopicNew } from "../../entities/TopicNew";
import { EduGrade } from "../../entities/EduGrade";
import { SummaryGrade } from "../../entities/SummaryGrade";
import { AssessmentType, validateAssessmentType } from "../../types/AssessmentType";
import { DEFAULT_GRADING_SYSTEM } from "../../types/GradingSystem";
import { normalizeScaleMode } from "../../utils/gradingScale";
import { computeThematicGrade, resolveThematicFormula, validateThematicFormula } from "../../utils/thematicFormula";
import { recomputeSemesterGrades } from "../../services/edu/semesterGrading";
import { notifyStudentGradeChange } from "../../services/edu/gradeNotificationService";
import { authorizeClassAction } from "../../services/edu/classAccess";
import type { Capability } from "../../services/edu/rbac";
import { resolveUiLocaleFromHeaders } from "../../utils/uiLocale";
import { isAssignedToStudent } from "../../utils/assignmentVisibility";
import { logger } from "../../utils/logger";
import { updateClassConfiguration } from "../../services/edu/classStaff";
import { withGradebookWrite, requireRawGrade, requireGradebookId } from "../../services/edu/gradebookWrites";
import { HttpError } from "../../utils/httpError";
import { buildLiveSnapshot, type LiveAttempt, type LiveStudent } from "../../services/edu/liveMonitor";
import { buildSkillTree, type SkillTopicInput } from "../../services/learning/skillTree";
import { buildProgressReportModel, renderProgressReportHtml } from "../../services/reports/progressReport";
import { renderHtmlToPdf } from "../../services/certificates/CertificateRenderer";
import { writeSensitiveStudentRead } from "../../services/audit/auditLog";

const router = Router();

const studentRepo = () => AppDataSource.getRepository(Student);

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const classId = parseInt(req.params.classId, 10);
    const locale = resolveRequestLocale(req);
    const thematicLabel = thematicLabelForLocale(locale);

    const authorized = await loadTeacherClassForConfig(req, res, classId, "CLASS_VIEW");
    if (!authorized) return;
    const cls = await classRepo().findOne({
      where: { id: classId },
      relations: ["students"]
    });
    if (!cls) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

    const students = cls.students || [];
    await writeSensitiveStudentRead({
      actorType: req.userType === "STUDENT" ? "STUDENT" : "USER",
      actorId: req.principalId ?? req.userId ?? req.studentId ?? null,
      action: "student-data.read.gradebook",
      classId: cls.id,
      orgId: cls.organizationId ?? null,
      requestId: req.requestId,
      ip: req.ip,
      metadata: { studentCount: students.length }
    });
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

    // A thematic column is a real gradebook artifact, not an implicit column
    // for every topic. It exists only after the teacher creates at least one
    // thematic summary row for that topic.
    const thematicTopicRows = await summaryGradeRepo()
      .createQueryBuilder("sg")
      .select("DISTINCT sg.topic_id", "topicId")
      .where("sg.class_id = :classId", { classId })
      .andWhere("sg.assessment_type = :type", { type: AssessmentType.INTERMEDIATE })
      .andWhere("sg.control_work_id IS NULL")
      .andWhere("sg.topic_id IS NOT NULL")
      .andWhere("LOWER(TRIM(sg.name)) IN (:...names)", { names: ["thematic", "тематична"] })
      .getRawMany();
    const thematicTopicIds = new Set(
      thematicTopicRows
        .map(row => Number(row.topicId))
        .filter(topicId => Number.isFinite(topicId))
    );

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

      if (thematicTopicIds.has(topic.id)) {
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
      }

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

    // Batch-load all grades for the whole class in two queries instead of two
    // per student (was O(2N) sequential round-trips — N+1). The per-student
    // inner logic below is unchanged; it just reads from the grouped maps.
    const studentIds = students.map(s => s.id);
    const gradesByStudent = new Map<number, EduGrade[]>();
    const summaryByStudent = new Map<number, SummaryGrade[]>();

    if (studentIds.length > 0) {
      const allGradesForClass = await gradeRepo()
        .createQueryBuilder("grade")
        .leftJoin("grade.student", "gradeStudent")
        .addSelect("gradeStudent.id")
        .leftJoinAndSelect("grade.topicTask", "topicTask")
        .leftJoinAndSelect("topicTask.topic", "topic")
        .leftJoinAndSelect("topicTask.controlWork", "controlWork")
        .where("grade.student_id IN (:...studentIds)", { studentIds })
        .getMany();
      for (const g of allGradesForClass) {
        const sid = g.student?.id;
        if (sid == null) continue;
        const bucket = gradesByStudent.get(sid);
        if (bucket) bucket.push(g);
        else gradesByStudent.set(sid, [g]);
      }

      const allSummaryForClass = await summaryGradeRepo()
        .createQueryBuilder("summaryGrade")
        .leftJoin("summaryGrade.student", "summaryStudent")
        .addSelect("summaryStudent.id")
        .leftJoinAndSelect("summaryGrade.controlWork", "controlWork")
        .leftJoinAndSelect("summaryGrade.topic", "topic")
        .where("summaryGrade.student_id IN (:...studentIds)", { studentIds })
        .orderBy("summaryGrade.createdAt", "DESC")
        .addOrderBy("summaryGrade.id", "DESC")
        .getMany();
      for (const sg of allSummaryForClass) {
        const sid = sg.student?.id;
        if (sid == null) continue;
        const bucket = summaryByStudent.get(sid);
        if (bucket) bucket.push(sg);
        else summaryByStudent.set(sid, [sg]);
      }
    }

    for (const student of students) {
      const allGrades = gradesByStudent.get(student.id) ?? [];
      const summaryGrades = summaryByStudent.get(student.id) ?? [];

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
            manualOverrideGrade: summaryGrade?.manualOverrideGrade ?? null,
            calculatedGrade: summaryGrade?.calculatedGrade ?? null,
            revision: summaryGrade ? summaryReviewRevision(summaryGrade) : emptyReviewRevision("control", student.id, lesson.id),
            gradeId: summaryGrade ? summaryGrade.id : null
          });
        } else if (lesson.type === "SUMMARY") {
          const topicId = lesson.parentId || lesson.id;
          const thematic = summaryGrades.find((sg) => sg.topic && sg.topic.id === topicId && sg.assessmentType === AssessmentType.INTERMEDIATE && isThematicSummaryName(sg.name));
          flatGrades.push({
            taskId: topicId,
            taskTitle: thematicLabel,
            lessonId: lesson.id,
            lessonTitle: lesson.parentTitle || (locale === "en" ? "Topic" : "Тема"),
            lessonType: "SUMMARY",
            grade: thematic ? clampGradeToInt(thematic.grade) : null,
            createdAt: thematic ? thematic.createdAt.toISOString() : null,
            revision: thematic ? summaryReviewRevision(thematic) : undefined,
            gradeId: thematic ? thematic.id : null,
            isSummaryGrade: true
          });
        } else if (lesson.type === "SEMESTER") {
          const semesterGrade = summaryGrades.find((sg) => sg.assessmentType === AssessmentType.SEMESTER && Number(sg.semester) === lesson.id);
          flatGrades.push({
            taskId: lesson.id,
            taskTitle: lesson.title,
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            lessonType: "SEMESTER",
            grade: semesterGrade ? clampGradeToInt(semesterGrade.grade) : null,
            createdAt: semesterGrade ? semesterGrade.createdAt.toISOString() : null,
            revision: semesterGrade ? summaryReviewRevision(semesterGrade) : undefined,
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
            const latestGrade = grades.length > 0 ? [...grades].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0] : null;
            flatGrades.push({
              taskId: task.id,
              taskTitle: task.title,
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              lessonType: lesson.type,
              grade: latestGrade ? latestGrade.total : null,
              createdAt: latestGrade ? latestGrade.createdAt.toISOString() : null,
              revision: latestGrade ? gradeReviewRevision(latestGrade) : emptyReviewRevision("task", student.id, task.id),
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

    const cls = await loadTeacherClassForConfig(req, res, classId, "CLASS_VIEW");
    if (!cls) return;

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

    const groups: Record<string, Array<{
      id: number;
      studentId: number;
      studentName: string;
      grade: number;
      createdAt: string;
      revision: string;
    }>> = {};
    allSummaryGrades.filter(sg => Boolean(sg.student)).forEach(sg => {
      const canonicalName = canonicalizeSummaryGradeName(sg.name);
      const displayName = canonicalName === THEMATIC_CANONICAL_NAME ? thematicLabel : String(sg.name || "").trim();
      if (!groups[displayName]) groups[displayName] = [];
      groups[displayName].push({
        id: sg.id,
        studentId: sg.student.id,
        studentName: `${sg.student.lastName} ${sg.student.firstName} ${sg.student.middleName || ""}`.trim(),
        grade: sg.grade,
        createdAt: sg.createdAt.toISOString(),
        revision: summaryReviewRevision(sg)
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
    const classId = requireGradebookId(req.params.classId);
    const authorized = await loadTeacherClassForConfig(req, res, classId, "GRADE_EDIT");
    if (!authorized) return;
    const { cls, results, pendingNotifications, normalizedName } = await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async (manager, cls) => {
      const topicRepo = () => manager.getRepository(TopicNew);
      const summaryGradeRepo = () => manager.getRepository(SummaryGrade);
      const gradeRepo = () => manager.getRepository(EduGrade);
      cls.students = await manager.getRepository(Student).findBy({ class: { id: classId } });
      const { name, topicId, studentGrades } = req.body ?? {};
      if (typeof name !== "string" || name.trim().length > 255) throw new HttpError(400, "INVALID_SUMMARY_NAME");
      const normalizedName = canonicalizeSummaryGradeName(name);

      if (!normalizedName) {
        throw new HttpError(400, "NAME_REQUIRED");
      }

      if (!topicId) {
        throw new HttpError(400, "TOPIC_ID_REQUIRED");
      }

      const topicIdNumber = requireGradebookId(topicId, "INVALID_TOPIC_ID");
      if (!Number.isFinite(topicIdNumber)) {
        throw new HttpError(400, "INVALID_TOPIC_ID");
      }

      if (studentGrades !== undefined && !Array.isArray(studentGrades)) throw new HttpError(400, "INVALID_STUDENT_GRADES");
      const manualGrades: Array<{ studentId: number; grade: number }> = (studentGrades ?? []).map((item: unknown) => {
        if (!item || typeof item !== "object") throw new HttpError(400, "INVALID_STUDENT_GRADES");
        const value = item as { studentId?: unknown; grade?: unknown };
        return { studentId: requireGradebookId(value.studentId, "INVALID_STUDENT_ID"), grade: requireRawGrade(value.grade) };
      });
      const touchedStudentIds = new Set(manualGrades.length ? manualGrades.map(item => item.studentId) : cls.students.map(student => student.id));
      if (touchedStudentIds.size !== (manualGrades.length || cls.students.length)) throw new HttpError(400, "DUPLICATE_STUDENT_GRADE");
      const activeStudentIds = new Set(cls.students.map(student => student.id));
      if ([...touchedStudentIds].some(id => !activeStudentIds.has(id))) throw new HttpError(400, "STUDENT_NOT_IN_CLASS");

      const topic = await topicRepo().findOne({
        where: {
          id: topicIdNumber,
          class: {
            id: classId
          }
        }
      });

      if (!topic) {
        throw new HttpError(404, "TOPIC_NOT_FOUND");
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

      const existingBefore = await existingBeforeBuilder
        .orderBy("sg.createdAt", "ASC")
        .addOrderBy("sg.id", "ASC")
        .getMany();
      const existingByStudentId = new Map<number, SummaryGrade>();
      for (const row of existingBefore) {
        if (row.student?.id != null) existingByStudentId.set(row.student.id, row);
      }

      const results: SummaryGrade[] = [];
      const pendingNotifications: Array<{ student: Student; grade: number; event: "created" | "updated" }> = [];
      const saveGradeForStudent = async (student: Student, grade: number) => {
        let sg = existingByStudentId.get(student.id);
        const event = sg ? "updated" : "created";
        if (!sg) {
          sg = summaryGradeRepo().create({
            class: cls,
            student,
            name: normalizedName,
            grade,
            topic,
            assessmentType: AssessmentType.INTERMEDIATE,
            controlWork: null
          });
        } else {
          sg.class = cls;
          sg.student = student;
          sg.name = normalizedName;
          sg.grade = grade;
          sg.topic = topic;
          sg.assessmentType = AssessmentType.INTERMEDIATE;
          sg.controlWork = null;
        }

        validateAssessmentType(AssessmentType.INTERMEDIATE, null, "grade");
        if (event === "created") await summaryGradeRepo().save(sg);
        else await summaryGradeRepo().update(sg.id, { name: normalizedName, grade });
        results.push(sg);
        pendingNotifications.push({ student, grade: sg.grade, event });
      };

      if (manualGrades.length > 0) {
        for (const item of manualGrades) {
          const student = cls.students.find(s => s.id === item.studentId)!;
          await saveGradeForStudent(student, item.grade);
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

          // Use the latest attempt per practice task, exactly like the visible
          // gradebook and student views. A newer unfinished attempt must not
          // resurrect an older score, so only its latest row can contribute.
          const latestPracticeGrades = new Map<string, EduGrade>();
          for (const gradeRow of [...classGrades].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
            if (!gradeRow.topicTask || gradeRow.topicTask.type !== "PRACTICE") continue;
            const taskKey = `topicTask:${gradeRow.topicTask.id}`;
            if (!latestPracticeGrades.has(taskKey)) latestPracticeGrades.set(taskKey, gradeRow);
          }
          const practiceScores = Array.from(latestPracticeGrades.values())
            .map(gradeRow => gradeRow.total === null ? null : Number(gradeRow.total))
            .filter((value): value is number => value !== null && Number.isFinite(value));

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
          // There should be one control summary per student/work. Deduplicate
          // defensively so legacy duplicate rows cannot distort the average.
          const latestControlGrades = new Map<number, SummaryGrade>();
          for (const summaryGrade of [...controlSummaryGrades].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
            const controlWorkId = summaryGrade.controlWork?.id;
            if (controlWorkId == null || latestControlGrades.has(controlWorkId)) continue;
            latestControlGrades.set(controlWorkId, summaryGrade);
          }
          const controlScores = Array.from(latestControlGrades.values())
            .map(summaryGrade => Number(summaryGrade.grade))
            .filter(value => Number.isFinite(value));

          const hasPractice = practiceScores.length > 0;
          const hasControl = controlScores.length > 0;
          const practiceAvg = hasPractice ? practiceScores.reduce((s, v) => s + v, 0) / practiceScores.length : 0;
          const controlAvg = hasControl ? controlScores.reduce((s, v) => s + v, 0) / controlScores.length : 0;

          const grade = computeThematicGrade(
            { practice: practiceAvg, control: controlAvg, hasPractice, hasControl },
            thematicFormula
          );

          await saveGradeForStudent(student, grade);
        }
      }

      const retainedIds = new Set(results.map(row => row.id));
      const obsoleteRows = existingBefore.filter(row => row.student && touchedStudentIds.has(row.student.id) && !retainedIds.has(row.id));
      if (obsoleteRows.length > 0) await summaryGradeRepo().delete(obsoleteRows.map(row => row.id));
      return { cls, results, pendingNotifications, normalizedName };
    });

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
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.put("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    const summaryGradeId = requireGradebookId(req.params.id);

    const authorized = await loadTeacherClassForConfig(req, res, classId, "GRADE_EDIT");
    if (!authorized) return;

    const grade = requireRawGrade(req.body?.grade);
    const sg = await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const repo = manager.getRepository(SummaryGrade);
      const sg = await repo.findOne({ where: { id: summaryGradeId, class: { id: classId } }, relations: ["class", "student", "topic", "controlWork"] });
      if (!sg) throw new HttpError(404, "SUMMARY_GRADE_NOT_FOUND");
      if (!sg.student) throw new HttpError(409, "STUDENT_ARCHIVED");
      requireReviewRevision(req.body?.expectedRevision, summaryReviewRevision(sg));
      await repo.update(sg.id, { grade, ...(sg.controlWork ? { manualOverrideGrade: grade } : {}) });
      sg.grade = grade;
      return sg;
    });

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
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.delete("/classes/:classId/summary-grades/:id", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    const summaryGradeId = requireGradebookId(req.params.id);

    const authorized = await loadTeacherClassForConfig(req, res, classId, "GRADE_EDIT");
    if (!authorized) return;

    await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const repo = manager.getRepository(SummaryGrade);
      const sg = await repo.findOne({ where: { id: summaryGradeId, class: { id: classId } }, relations: ["student"] });
      if (!sg) throw new HttpError(404, "SUMMARY_GRADE_NOT_FOUND");
      if (!sg.student) throw new HttpError(409, "STUDENT_ARCHIVED");
      await repo.delete(sg.id);
    });
    return res.json({
      message: "SUMMARY_GRADE_DELETED"
    });
  } catch (error) {
    logger.error("[edu/gradebook] Error deleting summary grade", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.delete("/classes/:classId/topics/:topicId/thematic", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    const topicId = requireGradebookId(req.params.topicId);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({
        message: "INVALID_ID"
      });
    }

    const cls = await loadTeacherClassForConfig(req, res, classId, "GRADE_EDIT");
    if (!cls) return;

    const result = await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const topic = await manager.getRepository(TopicNew).findOneBy({ id: topicId, class: { id: classId } });
      if (!topic) throw new HttpError(404, "TOPIC_NOT_FOUND");
      const activeStudents = await manager.getRepository(Student).findBy({ class: { id: classId } });
      if (!activeStudents.length) return { affected: 0 };
      return manager.getRepository(SummaryGrade).createQueryBuilder().delete().from(SummaryGrade)
        .where("class_id = :classId", { classId }).andWhere("topic_id = :topicId", { topicId })
        .andWhere("student_id IN (:...studentIds)", { studentIds: activeStudents.map(student => student.id) })
        .andWhere("assessment_type = :type", { type: AssessmentType.INTERMEDIATE })
        .andWhere("control_work_id IS NULL")
        .andWhere("LOWER(TRIM(name)) IN (:...names)", { names: ["thematic", "тематична"] }).execute();
    });

    return res.json({
      message: "THEMATIC_DELETED",
      deleted: result.affected || 0
    });
  } catch (error: unknown) {
    logger.error("[edu/gradebook] Error deleting thematic", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});

// Normalize a teacher-entered formula: trim, empty -> null (= use default).
function normalizeFormulaInput(raw: unknown): string | null {
  if (raw === null) return null;
  if (typeof raw !== "string" || raw.length > 255) throw new HttpError(400, "INVALID_FORMULA");
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

// Resolve + authorize the class for a gradebook-config request via the central
// authorizer (org role + owner grandfather + SYSTEM_ADMIN). Returns the class or
// null (response already sent). Default capability is GRADE_EDIT; read routes
// pass CLASS_VIEW.
async function loadTeacherClassForConfig(
  req: AuthRequest,
  res: Response,
  classId: number,
  capability: Capability = "GRADE_EDIT"
): Promise<Class | null> {
  if (req.userType === "STUDENT" || req.studentId || !req.userId) {
    res.status(403).json({ message: "ONLY_TEACHERS_CAN_EDIT_FORMULA" });
    return null;
  }
  const access = await authorizeClassAction(req.userId, classId, capability, {
    isSystemAdmin: req.userRole === "SYSTEM_ADMIN"
  });
  if (!access) {
    res.status(404).json({ message: "CLASS_NOT_FOUND" });
    return null;
  }
  if (!access.allowed) {
    res.status(403).json({ message: "ACCESS_DENIED" });
    return null;
  }
  return access.cls;
}

// Thematic-grade formula config: the class-level default plus every topic's
// per-topic override. Used by the gradebook settings UI.
router.get("/classes/:classId/thematic-config", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = parseInt(req.params.classId, 10);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId, "CLASS_VIEW");
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

    await updateClassConfiguration(cls.id, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, "GRADE_EDIT", { thematicFormula: formula });
    return res.json({ message: "FORMULA_UPDATED", classFormula: formula ?? null });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating class thematic formula", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Set a per-topic thematic formula override. Empty -> inherit the class formula.
router.put("/classes/:classId/topics/:topicId/thematic-formula", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    const topicId = requireGradebookId(req.params.topicId);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const formula = normalizeFormulaInput(req.body?.formula);
    if (!validateThematicFormula(formula)) {
      return res.status(400).json({ message: "INVALID_FORMULA" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const repo = manager.getRepository(TopicNew);
      const topic = await repo.findOneBy({ id: topicId, class: { id: classId } });
      if (!topic) throw new HttpError(404, "TOPIC_NOT_FOUND");
      await repo.update(topicId, { thematicFormula: formula });
    });
    return res.json({ message: "FORMULA_UPDATED", topicId, thematicFormula: formula });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating topic thematic formula", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Assign a topic to a semester (1, 2, …). Explicit null clears the assignment
// (topic falls back to semester 1 when aggregating).
router.put("/classes/:classId/topics/:topicId/semester", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    const topicId = requireGradebookId(req.params.topicId);
    if (isNaN(classId) || isNaN(topicId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const semester = req.body?.semester;
    if (semester !== null && (typeof semester !== "number" || !Number.isInteger(semester) || semester < 1 || semester > 12)) throw new HttpError(400, "INVALID_SEMESTER");
    await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const repo = manager.getRepository(TopicNew);
      const topic = await repo.findOneBy({ id: topicId, class: { id: classId } });
      if (!topic) throw new HttpError(404, "TOPIC_NOT_FOUND");
      await repo.update(topicId, { semester });
    });
    return res.json({ message: "SEMESTER_UPDATED", topicId, semester: semester });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating topic semester", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

// Recompute all semester aggregate grades for a class (avg of thematic grades
// per semester per student).
router.post("/classes/:classId/semester-grades/recompute", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const classId = requireGradebookId(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const result = await recomputeSemesterGrades(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion });
    return res.json({ message: "SEMESTER_GRADES_RECOMPUTED", ...result });
  } catch (error) {
    logger.error("[edu/gradebook] Error recomputing semester grades", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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
    const cls = await loadTeacherClassForConfig(req, res, classId, "CLASS_VIEW");
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
        grade: clampGradeToInt(sg.grade),
        revision: summaryReviewRevision(sg)
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
    const classId = requireGradebookId(req.params.classId);
    const gradeId = requireGradebookId(req.params.gradeId);
    if (isNaN(classId) || isNaN(gradeId)) {
      return res.status(400).json({ message: "INVALID_ID" });
    }
    const cls = await loadTeacherClassForConfig(req, res, classId);
    if (!cls) return;

    const grade = requireRawGrade(req.body?.grade);
    await withGradebookWrite(classId, { userId: req.userId!, sessionVersion: req.eduSessionVersion }, async manager => {
      const repo = manager.getRepository(SummaryGrade);
      const row = await repo.findOne({ where: { id: gradeId, class: { id: classId }, assessmentType: AssessmentType.SEMESTER }, relations: ["student"] });
      if (!row) throw new HttpError(404, "SEMESTER_GRADE_NOT_FOUND");
      if (!row.student) throw new HttpError(409, "STUDENT_ARCHIVED");
      requireReviewRevision(req.body?.expectedRevision, summaryReviewRevision(row));
      await repo.update(gradeId, { grade });
    });
    return res.json({ message: "SEMESTER_GRADE_UPDATED", gradeId, grade: grade });
  } catch (error) {
    logger.error("[edu/gradebook] Error updating semester grade", { requestId: req.requestId, err: error });
    if (error instanceof HttpError) return res.status(error.statusCode).json({ message: error.message });
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

    const authorized = await loadTeacherClassForConfig(req, res, classId, "CLASS_VIEW");
    if (!authorized) return;
    const cls = await classRepo().findOne({
      where: { id: classId },
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
  } catch (error: unknown) {
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
): Promise<Map<number, { practiceAverage: number | null; started: boolean; closed: boolean }>> {
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

  const result = new Map<number, { practiceAverage: number | null; started: boolean; closed: boolean }>();
  for (const topic of topics) {
    const tasks = (topic.tasks || []).filter((t) =>
      isAssignedToStudent(t.isAssigned, t.assignedStudentIds, studentId)
    );
    if (tasks.length === 0) {
      result.set(topic.id, { practiceAverage: null, started: false, closed: false });
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
    // A topic is "closed" for the student once every assigned practice task is
    // closed — they can no longer submit/improve (only appeals remain).
    const closed = tasks.every((t) => t.isClosed);
    result.set(topic.id, { practiceAverage: sum / tasks.length, started: graded > 0, closed });
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

    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
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
        closed: m?.closed ?? false,
      };
    });

    disableCache(res);
    return res.json(buildSkillTree(inputs));
  } catch (error: unknown) {
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
    const student = await studentRepo().findOne({ where: { id: req.studentId }, relations: ["class"] });
    if (!student?.class) return res.status(404).json({ message: "NO_CLASS" });

    const topics = await topicRepo()
      .createQueryBuilder("topic")
      .where("topic.class_id = :classId", { classId: student.class.id })
      .orderBy("topic.order", "ASC")
      .getMany();

    const masteryByTopic = await computePracticeMasteryByTopic(req.studentId, student.class.id);

    const model = buildProgressReportModel({
      studentName: `${student.lastName ?? ""} ${student.firstName ?? ""}`.trim() || `#${student.id}`,
      className: student.class.name ?? null,
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
    } catch (renderErr: unknown) {
      logger.warn("[edu/gradebook] progress-report PDF render unavailable", { requestId: req.requestId, error: errorMessage(renderErr) });
      return res.status(503).json({ message: "PDF_RENDER_UNAVAILABLE" });
    }
  } catch (error: unknown) {
    logger.error("[edu/gradebook] progress-report failed", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

export default router;
