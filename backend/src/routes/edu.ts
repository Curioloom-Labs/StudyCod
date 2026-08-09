import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import multer from "multer";
import { z } from "zod";
import { AppDataSource } from "../data-source";
import { User, UserLang } from "../entities/User";
import { Class } from "../entities/Class";
import { Student } from "../entities/Student";
import { authRequired, AuthRequest } from "../middleware/authMiddleware";
import { requireClassCapability, type ClassAccessRequest } from "../middleware/orgContext";
import { emailService } from "../services/emailService";
import { EduLesson, LessonType } from "../entities/EduLesson";
import { EduTask } from "../entities/EduTask";
import { EduGrade } from "../entities/EduGrade";
import { SummaryGrade } from "../entities/SummaryGrade";
import { ControlWork } from "../entities/ControlWork";
import { TopicNew } from "../entities/TopicNew";
import { validateFormula } from "../utils/safeFormulaEvaluator";
import { DEFAULT_GRADING_SYSTEM, GRADING_SYSTEMS, GradingSystem } from "../types/GradingSystem";
import { saveControlSummaryGradeForNewSystemWithManager } from "../services/edu/controlWorkGrading";
import { logger } from "../utils/logger";
import { generateInteractiveLessonWithAI } from "../services/openRouterService";
import { normalizeWebTaskInput } from "../utils/normalizeWebTaskInput";
import { resolveUiLocaleFromHeaders } from "../utils/uiLocale";
import { convertGradeToRaw100, shouldConvertLegacyGrades, normalizeScaleMode, GRADE_SCALE_MODES, DEFAULT_GRADE_SCALE_MODE } from "../utils/gradingScale";
import studentAuthRouter from "./edu/studentAuth";
import announcementsRouter from "./edu/announcements";
import classStudentsRouter from "./edu/classStudents";
import studentsRouter from "./edu/students";
import lessonsRouter from "./edu/lessons";
import tasksRouter from "./edu/tasks";
import courseTasksRouter from "./edu/courseTasks";
import testDataRouter from "./edu/testData";
import gradingRouter from "./edu/grading";
import appealsRouter from "./edu/appeals";
import insightsRouter from "./edu/insights";
import gradebookRouter from "./edu/gradebook";
import liveClassroomRouter from "./edu/liveClassroom";
import orgsRouter from "./edu/orgs";
import coursesRouter from "./edu/courses";
import manualTasksRouter from "./edu/manualTasks";
import lessonQuizRouter from "./edu/lessonQuiz";
import gradebookConfigRouter from "./edu/gradebookConfig";
import enrollmentRouter from "./edu/enrollment";
import agendaRouter from "./edu/agenda";
import attendanceRouter from "./edu/attendance";
import similarityRouter from "./edu/similarity";
import tutorRouter from "./edu/tutor";
const eduRouter = Router();
const userRepo = () => AppDataSource.getRepository(User);
const classRepo = () => AppDataSource.getRepository(Class);
const lessonRepo = () => AppDataSource.getRepository(EduLesson);
const taskRepo = () => AppDataSource.getRepository(EduTask);
const topicRepo = () => AppDataSource.getRepository(TopicNew);
const UPLOADS_ROOT = process.env.UPLOADS_DIR ? String(process.env.UPLOADS_DIR) : path.resolve(process.cwd(), "uploads");
const STATEMENT_IMAGES_DIR = path.join(UPLOADS_ROOT, "statement-images");
const ALLOWED_STATEMENT_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/avif"]);
const statementImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_STATEMENT_IMAGE_MIMES.has(String(file.mimetype || "").toLowerCase())) {
      return cb(new Error("UNSUPPORTED_IMAGE_TYPE"));
    }
    cb(null, true);
  }
});

function resolveRequestLocale(req: Request): "uk" | "en" {
  return resolveUiLocaleFromHeaders(req.headers, "uk");
}

function ensureDir(p: string) {
  fs.mkdirSync(p, {
    recursive: true
  });
}

function safeExtFromUpload(file: Express.Multer.File): string {
  const fromName = path.extname(String(file.originalname || "")).toLowerCase();
  const allowed = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
  if (allowed.has(fromName)) return fromName;
  const byMime: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif"
  };
  return byMime[String(file.mimetype || "").toLowerCase()] || ".png";
}

function mimeByExt(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".avif") return "image/avif";
  return "application/octet-stream";
}
function normalizeLang(input?: string | null): UserLang {
  const raw = (input || "").toUpperCase().replace(/\s+/g, "").trim();
  if (raw === "CPP" || raw === "C++" || raw.startsWith("C++")) return "CPP";
  if (raw.startsWith("PY")) return "PYTHON";
  return "JAVA";
}
// Split-out auth endpoints.
eduRouter.use(studentAuthRouter);
eduRouter.use(announcementsRouter);
eduRouter.use(classStudentsRouter);
eduRouter.use(studentsRouter);
eduRouter.use(lessonsRouter);
// gradingRouter owns the literal GET /tasks/pending-review; it must mount before
// tasksRouter's GET /tasks/:taskId, otherwise "pending-review" is parsed as a
// task id and the request 400s. Their :taskId sub-routes have disjoint suffixes,
// so this reorder introduces no new shadowing.
eduRouter.use(gradingRouter);
eduRouter.use(courseTasksRouter);
eduRouter.use(tasksRouter);
eduRouter.use(testDataRouter);
eduRouter.use(appealsRouter);
eduRouter.use(insightsRouter);
eduRouter.use(gradebookRouter);
eduRouter.use(liveClassroomRouter);
eduRouter.use(orgsRouter);
eduRouter.use(coursesRouter);
eduRouter.use(manualTasksRouter);
eduRouter.use(lessonQuizRouter);
eduRouter.use(gradebookConfigRouter);
eduRouter.use(enrollmentRouter);
eduRouter.use(agendaRouter);
eduRouter.use(attendanceRouter);
eduRouter.use(similarityRouter);
eduRouter.use(tutorRouter);

// Generate an interactive lesson (typed-block JSON for the LessonBlocks editor/reader).
eduRouter.post("/generate-interactive-lesson", authRequired, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = z.object({
      topicTitle: z.string().min(1).max(300),
      language: z.enum(["JAVA", "PYTHON", "CPP"])
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "INVALID_INPUT" });
    const result = await generateInteractiveLessonWithAI({
      topicTitle: parsed.data.topicTitle.trim(),
      lang: parsed.data.language,
      userId: req.userId
    });
    return res.json(result);
  } catch (error: any) {
    logger.error("[edu] generate-interactive-lesson failed", { requestId: req.requestId, err: error });
    return res.status(502).json({ message: error?.message || "AI_GENERATION_FAILED" });
  }
});

const registerTeacherSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6),
  language: z.string().optional()
});
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

const createLessonBodySchema = z.object({
  type: z.string().transform(v => v.trim().toUpperCase()).refine(v => v === "LESSON" || v === "CONTROL"),
  title: z.string().min(1).max(255)
});

const createLessonTaskBodySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1).max(50_000),
  template: z.string().max(200_000).optional(),
  taskMode: z.enum(["CODE", "WEB"]).optional(),
  webTemplateFiles: z.array(z.object({
    path: z.enum(["index.html", "styles.css", "script.js"]),
    content: z.string().max(200_000)
  })).max(3).optional(),
  webValidationRules: z.array(z.object({
    id: z.string().optional(),
    type: z.enum(["required_selector", "forbidden_selector", "required_text", "forbidden_text", "required_script_pattern", "forbidden_script_pattern", "required_attribute", "forbidden_attribute", "required_style", "forbidden_style"]),
    message: z.string().max(1000).optional(),
    points: z.number().int().min(0).max(1000).optional(),
    selector: z.string().max(500).optional(),
    attribute: z.string().max(200).optional(),
    value: z.string().max(1000).optional(),
    valuePattern: z.string().max(2000).optional(),
    property: z.string().max(200).optional(),
    text: z.string().max(2000).optional(),
    pattern: z.string().max(2000).optional(),
    flags: z.string().max(10).optional()
  })).max(200).optional(),
  webValidationProfile: z.object({
    id: z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"]).optional(),
    allowHtml: z.boolean().optional(),
    allowCss: z.boolean().optional(),
    allowJs: z.boolean().optional(),
    allowInlineStyle: z.boolean().optional(),
    allowInlineScript: z.boolean().optional(),
    allowExternalResources: z.boolean().optional(),
    lockHtml: z.boolean().optional(),
    lockCss: z.boolean().optional(),
    lockJs: z.boolean().optional()
  }).or(z.enum(["FREE_WEB", "HTML_ONLY", "HTML_CSS_NO_JS", "HTML_JS_NO_CSS", "JS_ONLY_DOM", "CSS_ONLY", "HTML_AND_INLINE_ONLY"])).optional()
});

eduRouter.post("/statement-images", authRequired, (req: AuthRequest, res: Response, next) => {
  statementImageUpload.single("image")(req as any, res as any, (err: any) => {
    if (err) {
      const msg = String(err?.message || "UPLOAD_ERROR");
      if (msg === "UNSUPPORTED_IMAGE_TYPE") {
        return res.status(400).json({ message: "UNSUPPORTED_IMAGE_TYPE" });
      }
      if (String(err?.code || "") === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ message: "IMAGE_TOO_LARGE" });
      }
      return res.status(400).json({ message: "INVALID_UPLOAD" });
    }
    return next();
  });
}, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId && !req.studentId) {
      return res.status(401).json({ message: "UNAUTHORIZED" });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file || !file.buffer || !file.size) {
      return res.status(400).json({ message: "IMAGE_REQUIRED" });
    }

    ensureDir(STATEMENT_IMAGES_DIR);
    const ext = safeExtFromUpload(file);
    const token = crypto.randomBytes(12).toString("hex");
    const storedName = `${Date.now()}_${token}${ext}`;
    const abs = path.join(STATEMENT_IMAGES_DIR, storedName);
    fs.writeFileSync(abs, file.buffer);

    const altBase = path.basename(String(file.originalname || "image"), path.extname(String(file.originalname || ""))).trim() || "image";
    const alt = altBase.replace(/[\[\]\(\)]/g, "").slice(0, 80) || "image";
    const url = `/api/edu/statement-images/${encodeURIComponent(storedName)}`;

    return res.status(201).json({
      url,
      markdown: `![${alt}](${url})`
    });
  } catch (error: any) {
    logger.error("[edu] failed to upload statement image", { requestId: req.requestId, err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

eduRouter.get("/statement-images/:fileName", async (req: Request, res: Response) => {
  try {
    const fileName = String(req.params.fileName || "").trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(fileName)) {
      return res.status(400).json({ message: "INVALID_FILE_NAME" });
    }
    const abs = path.join(STATEMENT_IMAGES_DIR, fileName);
    if (!abs.startsWith(STATEMENT_IMAGES_DIR)) {
      return res.status(400).json({ message: "INVALID_FILE_NAME" });
    }
    if (!fs.existsSync(abs)) {
      return res.status(404).json({ message: "FILE_NOT_FOUND" });
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Type", mimeByExt(fileName));
    return res.sendFile(abs);
  } catch (error: any) {
    logger.error("[edu] failed to serve statement image", { err: error });
    return res.status(500).json({ message: "INTERNAL_SERVER_ERROR" });
  }
});

eduRouter.post("/register-teacher", async (req: Request, res: Response) => {
  try {
    const validated = registerTeacherSchema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({
        message: "INVALID_INPUT",
        errors: validated.error.issues
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
    const verificationExpires = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
    const user = userRepo().create({
      username,
      email,
      password: hash,
      lang: normalizeLang(language),
      userMode: "EDUCATIONAL",
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires
    });
    await userRepo().save(user);
    const locale = resolveRequestLocale(req);
    emailService.sendVerificationEmail(email, verificationToken, username, locale).catch(err => {
      logger.error("[edu] verification email failed", { requestId: (req as any)?.requestId, err });
    });
    res.status(201).json({
      requiresEmailVerification: true
    });
  } catch (error) {
    logger.error("[edu] Error registering user", { requestId: (req as any)?.requestId, err: error });
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
      language: z.string().optional(),
      gradingSystem: z.enum(GRADING_SYSTEMS).optional(),
      gradeScaleMode: z.enum(GRADE_SCALE_MODES).optional()
    });
    const validated = schema.safeParse(req.body);
    if (!validated.success) return res.status(400).json({
      message: "INVALID_INPUT"
    });
    const {
      name,
      language,
      gradingSystem,
      gradeScaleMode
    } = validated.data;
    const cls = classRepo().create({
      teacher: user,
      name,
      language: normalizeLang(language || user.lang),
      gradingSystem: gradingSystem || DEFAULT_GRADING_SYSTEM,
      gradeScaleMode: gradeScaleMode || DEFAULT_GRADE_SCALE_MODE
    });
    await classRepo().save(cls);
    res.status(201).json({
      class: cls
    });
  } catch (error) {
    logger.error("[edu] Error creating class", { requestId: req.requestId, err: error });
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
    // Count students via a grouped COUNT (loadRelationCountAndMap) instead of
    // loading every student row across every class just to read `.length`.
    const classes = await classRepo()
      .createQueryBuilder("class")
      .loadRelationCountAndMap("class.studentsCount", "class.students")
      .where("class.teacher_id = :teacherId", { teacherId: user.id })
      .orderBy("class.created_at", "DESC")
      .getMany();
    res.json({
      classes: classes.map(c => ({
        id: c.id,
        name: c.name,
        language: c.language,
        gradingSystem: c.gradingSystem || DEFAULT_GRADING_SYSTEM,
        gradeScaleMode: normalizeScaleMode(c.gradeScaleMode),
        studentsCount: (c as unknown as { studentsCount?: number }).studentsCount ?? 0,
        createdAt: c.createdAt
      }))
    });
  } catch (error) {
    logger.error("[edu] Error listing classes", { requestId: req.requestId, err: error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId", authRequired, requireClassCapability("CLASS_VIEW"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const cls = req.classAccess!.cls;

    return res.json({
      class: {
        id: cls.id,
        name: cls.name,
        language: cls.language,
        organizationId: cls.organizationId ?? null,
        gradingSystem: cls.gradingSystem || DEFAULT_GRADING_SYSTEM,
        gradeScaleMode: normalizeScaleMode(cls.gradeScaleMode),
        createdAt: cls.createdAt,
        updatedAt: cls.updatedAt
      }
    });
  } catch (error) {
    logger.error("[edu] Error getting class", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.put("/classes/:classId/grading-system", authRequired, requireClassCapability("CLASS_EDIT"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const classId = req.classAccess!.cls.id;

    const parsedBody = z.object({
      gradingSystem: z.enum(GRADING_SYSTEMS),
      gradeScaleMode: z.enum(GRADE_SCALE_MODES).optional()
    }).safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        message: "INVALID_INPUT"
      });
    }

    const cls = req.classAccess!.cls;

    const requestedGradingSystem = parsedBody.data.gradingSystem as GradingSystem;
    const previousGradingSystem = (cls.gradingSystem || DEFAULT_GRADING_SYSTEM) as GradingSystem;

    let convertedLegacyGrades = false;
    let convertedFieldsCount = 0;

    await AppDataSource.transaction("SERIALIZABLE", async manager => {
      const lockedClass = await manager
        .createQueryBuilder(Class, "class")
        .setLock("pessimistic_write")
        .leftJoinAndSelect("class.teacher", "teacher")
        .where("class.id = :classId", { classId })
        .getOne();

      // Authorization already enforced by requireClassCapability; the lock just
      // guards the read-modify-write of grades against concurrent conversions.
      if (!lockedClass) {
        throw new Error("CLASS_NOT_FOUND");
      }

      const fromSystem = (lockedClass.gradingSystem || DEFAULT_GRADING_SYSTEM) as GradingSystem;
      const fromScaleMode = normalizeScaleMode(lockedClass.gradeScaleMode);

      if (fromSystem !== requestedGradingSystem) {
        const eduGrades = await manager
          .createQueryBuilder(EduGrade, "grade")
          .leftJoinAndSelect("grade.student", "student")
          .where("student.class_id = :classId", { classId })
          .andWhere("grade.total IS NOT NULL")
          .getMany();

        const summaryGrades = await manager
          .createQueryBuilder(SummaryGrade, "summary")
          .where("summary.class_id = :classId", { classId })
          .getMany();

        const sampleValues: number[] = [];
        for (const grade of eduGrades) {
          if (grade.total !== null && Number.isFinite(Number(grade.total))) {
            sampleValues.push(Number(grade.total));
          }
        }
        for (const summary of summaryGrades) {
          if (Number.isFinite(Number(summary.grade))) {
            sampleValues.push(Number(summary.grade));
          }
          if (summary.theoryGrade !== null && Number.isFinite(Number(summary.theoryGrade))) {
            sampleValues.push(Number(summary.theoryGrade));
          }
        }

        if (shouldConvertLegacyGrades(sampleValues, fromSystem)) {
          convertedLegacyGrades = true;

          for (const grade of eduGrades) {
            if (grade.total === null || !Number.isFinite(Number(grade.total))) continue;
            const next = convertGradeToRaw100(Number(grade.total), fromSystem, fromScaleMode);
            if (next !== Number(grade.total)) {
              grade.total = next;
              convertedFieldsCount += 1;
            }
          }

          for (const summary of summaryGrades) {
            if (Number.isFinite(Number(summary.grade))) {
              const nextGrade = convertGradeToRaw100(Number(summary.grade), fromSystem, fromScaleMode);
              if (nextGrade !== Number(summary.grade)) {
                summary.grade = nextGrade;
                convertedFieldsCount += 1;
              }
            }

            if (summary.theoryGrade !== null && Number.isFinite(Number(summary.theoryGrade))) {
              const nextTheoryGrade = convertGradeToRaw100(Number(summary.theoryGrade), fromSystem, fromScaleMode);
              if (nextTheoryGrade !== Number(summary.theoryGrade)) {
                summary.theoryGrade = nextTheoryGrade;
                convertedFieldsCount += 1;
              }
            }
          }

          if (eduGrades.length > 0) {
            await manager.save(EduGrade, eduGrades);
          }
          if (summaryGrades.length > 0) {
            await manager.save(SummaryGrade, summaryGrades);
          }
        }
      }

      lockedClass.gradingSystem = requestedGradingSystem;
      if (parsedBody.data.gradeScaleMode) {
        lockedClass.gradeScaleMode = parsedBody.data.gradeScaleMode;
      }
      await manager.save(Class, lockedClass);
    });

    const updatedClass = await classRepo().findOne({
      where: {
        id: classId
      }
    });

    if (!updatedClass) {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }

    return res.json({
      class: {
        id: updatedClass.id,
        name: updatedClass.name,
        language: updatedClass.language,
        gradingSystem: updatedClass.gradingSystem,
        gradeScaleMode: normalizeScaleMode(updatedClass.gradeScaleMode),
        createdAt: updatedClass.createdAt,
        updatedAt: updatedClass.updatedAt
      },
      conversion: {
        from: previousGradingSystem,
        to: requestedGradingSystem,
        legacyConverted: convertedLegacyGrades,
        convertedFields: convertedFieldsCount
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "CLASS_NOT_FOUND") {
      return res.status(404).json({
        message: "CLASS_NOT_FOUND"
      });
    }
    logger.error("[edu] Error updating class grading system", { requestId: req.requestId, err: error });
    return res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.get("/classes/:classId/lessons", authRequired, requireClassCapability("CLASS_VIEW"), async (req: ClassAccessRequest, res: Response) => {
  try {
    const classId = req.classAccess!.cls.id;
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
          taskMode: (task as any).taskMode ?? "CODE",
          webTemplateFiles: (task as any).webTemplateFiles ?? null,
          webValidationRules: (task as any).webValidationRules ?? null,
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
    logger.error("[edu] Error getting lessons", { requestId: req.requestId, err: error });
    res.status(500).json({
      message: "INTERNAL_SERVER_ERROR"
    });
  }
});
eduRouter.post("/classes/:classId/lessons", authRequired, requireClassCapability("CONTENT_AUTHOR"), async (req: ClassAccessRequest, res: Response) => {
  const parsedBody = createLessonBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      message: "TYPE_AND_TITLE_REQUIRED"
    });
  }

  const type = parsedBody.data.type as LessonType;
  const title = parsedBody.data.title;
  const cls = req.classAccess!.cls;
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
  const parsedBody = createLessonTaskBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({
      message: "TITLE_DESCRIPTION_AND_TEMPLATE_REQUIRED"
    });
  }

  const { title, description } = parsedBody.data;
  const normalizedTaskInput = normalizeWebTaskInput(parsedBody.data);
  if (normalizedTaskInput.taskMode === "CODE" && !normalizedTaskInput.template.trim()) {
    return res.status(400).json({
      message: "TITLE_DESCRIPTION_AND_TEMPLATE_REQUIRED"
    });
  }
  const task = taskRepo().create({
    lesson,
    title,
    description,
    template: normalizedTaskInput.template,
    taskMode: normalizedTaskInput.taskMode as any,
    webTemplateFiles: normalizedTaskInput.webTemplateFiles,
    webValidationRules: normalizedTaskInput.webValidationRules,
    webValidationProfile: normalizedTaskInput.webValidationProfile,
    maxAttempts: 1,
    isClosed: false
  });
  await taskRepo().save(task);
  res.status(201).json({
    task
  });
});

// Task execution/submission endpoints are split into ./edu/tasks.ts

// Manual grading endpoints are split into ./edu/grading.ts

// Grading review endpoints are split into ./edu/grading.ts

// Test-data endpoints are split into ./edu/testData.ts

// Unassign endpoints are split into ./edu/tasks.ts

// Manual grading endpoints are split into ./edu/grading.ts
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
    logger.error("[edu] Error updating control work formula", { requestId: req.requestId, err: error });
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

// Grade update endpoints are split into ./edu/grading.ts
export default eduRouter;
